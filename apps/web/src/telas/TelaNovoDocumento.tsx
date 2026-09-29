import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FilePlus2, RotateCw, Send, X } from 'lucide-react';
import {
  LIMITES_ARQUIVO,
  STATUS_INICIAL,
  novoIdDocumento,
  ordenarAlfabetico,
  pode,
  validarArquivo,
  validarConjuntoArquivos,
  type Area,
  type Documento,
  type NovoDocumento,
  type Pessoa,
  type TipoDocumento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { formatarData } from '../formatacao.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { useSessao } from '../autenticacao/Sessao.tsx';
import { BadgeStatus } from '../componentes/BadgeStatus.tsx';
import { Botao } from '../componentes/Botao.tsx';
import { CampoAreaTexto, CampoSelecao, CampoTexto } from '../componentes/Campo.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Carregando, ErroCarregamento } from '../componentes/Estados.tsx';
import { useToast } from '../componentes/Toast.tsx';
import { ArquivoEscolhido, EtiquetasAnexos, ZonaArquivo } from '../componentes/ZonaArquivo.tsx';
import pagina from './Pagina.module.css';
import estilos from './TelaNovoDocumento.module.css';

// ---------------------------------------------------------------------------
// Campos, textos e validação (documento 03, seção 6; P-02)
// ---------------------------------------------------------------------------

type CampoTextoForm =
  | 'titulo'
  | 'codigo'
  | 'tipoDocumentoId'
  | 'remetente'
  | 'revisao'
  | 'areaId'
  | 'disciplina'
  | 'observacao';
type CampoForm = CampoTextoForm | 'arquivoPrincipal' | 'anexos';
export type ErrosDocumento = { [C in CampoForm]?: string | undefined };
export type DadosForm = Record<CampoTextoForm, string>;

const ORDEM_CAMPOS: CampoForm[] = [
  'titulo',
  'codigo',
  'tipoDocumentoId',
  'remetente',
  'areaId',
  'disciplina',
  'revisao',
  'observacao',
  'arquivoPrincipal',
  'anexos',
];

export const ID_CAMPO: Record<CampoForm, string> = {
  titulo: 'doc-titulo',
  codigo: 'doc-codigo',
  tipoDocumentoId: 'doc-tipo',
  remetente: 'doc-remetente',
  revisao: 'doc-revisao',
  areaId: 'doc-area',
  disciplina: 'doc-disciplina',
  observacao: 'doc-observacao',
  arquivoPrincipal: 'doc-arquivo-principal',
  anexos: 'doc-anexos',
};

const NOME_CAMPO: Record<CampoForm, string> = {
  titulo: 'Título do documento',
  codigo: 'Código do documento',
  tipoDocumentoId: 'Tipo de documento',
  remetente: 'Remetente / solicitante',
  revisao: 'N° de revisão',
  areaId: 'Área',
  disciplina: 'Disciplina',
  observacao: 'Observações',
  arquivoPrincipal: 'Arquivo do documento principal',
  anexos: 'Documentos complementares',
};

const MENSAGEM_CODIGO_EXISTENTE = 'Já existe um documento com este código nesta revisão.';
const MENSAGEM_UM_ARQUIVO = 'Solte apenas um arquivo. Os demais vão em "Documentos complementares".';
const FORMATOS = LIMITES_ARQUIVO.extensoes.map((e) => e.toUpperCase()).join(', ');
const ACEITAR = LIMITES_ARQUIVO.extensoes.map((e) => `.${e}`).join(',');

export function dadosIniciais(eu: Pessoa): DadosForm {
  return {
    titulo: '',
    codigo: '',
    tipoDocumentoId: '',
    remetente: eu.nome,
    // P-05: o padrão é 0 e nada o sobrescreve depois que a pessoa digita.
    revisao: '0',
    areaId: eu.areaId ?? '',
    disciplina: '',
    observacao: '',
  };
}

export function validarDocumento(dados: DadosForm, principal: File | null, anexos: File[]): ErrosDocumento {
  const erros: ErrosDocumento = {};
  if (!dados.titulo.trim()) erros.titulo = 'Informe o título do documento.';
  if (!dados.tipoDocumentoId) erros.tipoDocumentoId = 'Selecione o tipo de documento.';
  if (!dados.remetente.trim()) erros.remetente = 'Informe o remetente ou solicitante.';
  if (!/^\d+$/.test(dados.revisao.trim())) erros.revisao = 'Informe um número inteiro igual ou maior que 0.';
  if (!dados.areaId) erros.areaId = 'Selecione a área.';
  if (!principal) erros.arquivoPrincipal = 'Selecione o arquivo do documento principal.';
  else {
    const problema = validarArquivo(principal.name, principal.size);
    if (problema) erros.arquivoPrincipal = problema;
  }
  const anexoInvalido = anexos.map((a) => validarArquivo(a.name, a.size)).find((m) => m !== null);
  const total = (principal?.size ?? 0) + anexos.reduce((soma, a) => soma + a.size, 0);
  const problemaConjunto = anexoInvalido ?? validarConjuntoArquivos(anexos.length, total);
  if (problemaConjunto) erros.anexos = problemaConjunto;
  return erros;
}

function paraEnvio(id: string, dados: DadosForm): NovoDocumento {
  const opcional = (texto: string) => (texto.trim() === '' ? null : texto.trim());
  return {
    id,
    codigo: opcional(dados.codigo),
    titulo: dados.titulo.trim(),
    tipoDocumentoId: dados.tipoDocumentoId,
    revisao: Number.parseInt(dados.revisao.trim(), 10),
    // Decisões 0011 e 0012: data de recebimento e prazo são gravados pelo servidor (esquema fechado).
    remetente: dados.remetente.trim(),
    areaId: dados.areaId,
    disciplina: opcional(dados.disciplina),
    observacao: opcional(dados.observacao),
  };
}

export { formatarData };

function focarCampo(campo: CampoForm) {
  const elemento = document.getElementById(ID_CAMPO[campo]);
  if (!elemento) return;
  elemento.focus();
  elemento.scrollIntoView?.({ block: 'center' });
}

function menosMovimento(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

/** Tela "Novo documento" (F2): cadastro com arquivos e lista de registrados recentemente. */
export function TelaNovoDocumento() {
  const api = useApi();
  const { eu } = useSessao();
  const [tipos, setTipos] = useState<TipoDocumento[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [recentes, setRecentes] = useState<Documento[] | null>(null);
  const [erroRecentes, setErroRecentes] = useState<string | null>(null);
  const [tentativaRecentes, setTentativaRecentes] = useState(0);
  const [destacado, setDestacado] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setErroCarga(null);
    setTipos(null);
    Promise.all([api.tiposDocumento(), api.areas()])
      .then(([listaTipos, listaAreas]) => {
        if (!ativo) return;
        setTipos(listaTipos);
        setAreas(listaAreas);
      })
      .catch((erro: unknown) => {
        if (ativo) setErroCarga(mensagemDeErro(erro));
      });
    return () => {
      ativo = false;
    };
  }, [api, tentativa]);

  useEffect(() => {
    let ativo = true;
    setErroRecentes(null);
    setRecentes(null);
    api
      .documentosRecentes()
      .then((lista) => {
        if (ativo) setRecentes(lista);
      })
      .catch((erro: unknown) => {
        if (ativo) setErroRecentes(mensagemDeErro(erro));
      });
    return () => {
      ativo = false;
    };
  }, [api, tentativaRecentes]);

  // Destaque temporário do item mostrado por "Ver na lista".
  useEffect(() => {
    if (!destacado) return;
    const temporizador = window.setTimeout(() => setDestacado(null), 4000);
    return () => window.clearTimeout(temporizador);
  }, [destacado]);

  const aoRegistrar = useCallback((documento: Documento) => {
    setRecentes((lista) => [documento, ...(lista ?? []).filter((d) => d.id !== documento.id)].slice(0, 10));
  }, []);

  const verNaLista = useCallback((id: string) => {
    setDestacado(id);
    requestAnimationFrame(() => {
      const linha = document.getElementById(`recente-${id}`);
      if (!linha) return;
      linha.scrollIntoView?.({ behavior: menosMovimento() ? 'auto' : 'smooth', block: 'center' });
      linha.focus({ preventScroll: true });
    });
  }, []);

  const tiposAtivos = useMemo(() => (tipos ?? []).filter((t) => t.ativo), [tipos]);
  // Áreas em ordem alfabética pt-BR (decisão 0006), só as que a pessoa pode usar no cadastro.
  const areasPermitidas = useMemo(
    () =>
      ordenarAlfabetico(
        areas.filter((a) => a.ativa && pode(eu, 'cadastrarDocumento', { areaId: a.id })),
        (a) => a.nome,
      ),
    [areas, eu],
  );
  const areaTravada = areas.some((a) => a.ativa && !pode(eu, 'cadastrarDocumento', { areaId: a.id }));

  return (
    <>
      <header className={pagina.cabecalho}>
        <div className={pagina.cabecalhoTexto}>
          <h1 className={pagina.titulo}>Novo documento</h1>
          <p className={pagina.subtitulo}>Registre um documento recebido para iniciar a tramitação.</p>
        </div>
      </header>

      <div className={estilos.coluna}>
        {erroCarga ? (
          <ErroCarregamento mensagem={erroCarga} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
        ) : tipos === null ? (
          <Carregando texto="Carregando formulário…" />
        ) : (
          <FormularioDocumento
            eu={eu}
            tipos={tiposAtivos}
            areas={areasPermitidas}
            areaTravada={areaTravada}
            aoRegistrar={aoRegistrar}
            aoVerNaLista={verNaLista}
          />
        )}

        <section className={estilos.recentes} aria-labelledby="titulo-recentes">
          <h2 id="titulo-recentes" className={pagina.tituloCartao}>
            Documentos registrados recentemente
          </h2>
          {/* Focável para rolar a tabela pelo teclado quando ela passa da largura (tablet). */}
          <div className={estilos.cartaoTabela} tabIndex={0} role="group" aria-labelledby="titulo-recentes">
            {erroRecentes ? (
              <ErroCarregamento mensagem={erroRecentes} aoTentarNovamente={() => setTentativaRecentes((n) => n + 1)} />
            ) : recentes === null ? (
              <Carregando texto="Carregando documentos recentes…" />
            ) : recentes.length === 0 ? (
              <p className={estilos.vazio}>Nenhum documento registrado ainda.</p>
            ) : (
              <table className={estilos.tabela}>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Rev.</th>
                    <th scope="col">Título</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Área</th>
                    <th scope="col">Status</th>
                    <th scope="col">Recebido em</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((d) => (
                    <tr
                      key={d.id}
                      id={`recente-${d.id}`}
                      tabIndex={-1}
                      className={destacado === d.id ? estilos.destacado : undefined}
                    >
                      <td className={estilos.codigo}>{d.codigo ?? <span className={estilos.semCodigo}>S/ código</span>}</td>
                      <td>{d.revisao}</td>
                      <td className={estilos.tituloDoc}>{d.titulo}</td>
                      <td>{d.tipoDocumento}</td>
                      <td>{d.area}</td>
                      <td>
                        <BadgeStatus status={d.status} />
                      </td>
                      <td>{formatarData(d.dataRecebimento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

interface PropsFormulario {
  eu: Pessoa;
  tipos: TipoDocumento[];
  areas: Area[];
  areaTravada: boolean;
  aoRegistrar: (documento: Documento) => void;
  aoVerNaLista: (id: string) => void;
}

function FormularioDocumento({ eu, tipos, areas, areaTravada, aoRegistrar, aoVerNaLista }: PropsFormulario) {
  const api = useApi();
  const toast = useToast();
  const inicial = useMemo(() => dadosIniciais(eu), [eu]);

  // ID gerado ao abrir o formulário e REUTILIZADO em "Tentar novamente" (reenvio idempotente, R5).
  // Só é renovado depois de um sucesso ou de "Limpar formulário".
  const idDocumento = useRef<string>(novoIdDocumento());
  const [dados, setDados] = useState<DadosForm>(inicial);
  const [principal, setPrincipal] = useState<File | null>(null);
  const [anexos, setAnexos] = useState<File[]>([]);
  const [erros, setErros] = useState<ErrosDocumento>({});
  /** Erros devolvidos pela API; somem quando a pessoa altera o campo. */
  const [errosServidor, setErrosServidor] = useState<ErrosDocumento>({});
  /** Avisos da escolha de arquivo (formato, tamanho, mais de um arquivo solto). */
  const [avisosArquivo, setAvisosArquivo] = useState<ErrosDocumento>({});
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  /** ID do documento que já estava gravado quando o reenvio deu 409 id_existente. */
  const [avisoJaRegistrado, setAvisoJaRegistrado] = useState<string | null>(null);
  const resumo = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const enviandoAgora = useRef(false);

  const sujo =
    principal !== null || anexos.length > 0 || (Object.keys(inicial) as CampoTextoForm[]).some((c) => dados[c] !== inicial[c]);

  function revalidar(novosDados: DadosForm, novoPrincipal: File | null, novosAnexos: File[]) {
    // Depois da primeira tentativa, a validação acompanha a digitação.
    if (tentouEnviar) setErros(validarDocumento(novosDados, novoPrincipal, novosAnexos));
  }

  function limparDoServidor(campo: CampoForm) {
    setErrosServidor((atuais) => {
      if (!atuais[campo]) return atuais;
      const copia = { ...atuais };
      delete copia[campo];
      return copia;
    });
  }

  function alterar(campo: CampoTextoForm, valor: string) {
    const novos = { ...dados, [campo]: valor };
    setDados(novos);
    limparDoServidor(campo);
    revalidar(novos, principal, anexos);
  }

  function receberPrincipal(arquivos: File[]) {
    limparDoServidor('arquivoPrincipal');
    if (arquivos.length > 1) {
      setAvisosArquivo((a) => ({ ...a, arquivoPrincipal: MENSAGEM_UM_ARQUIVO }));
      return;
    }
    const arquivo = arquivos[0];
    if (!arquivo) return;
    const problema = validarArquivo(arquivo.name, arquivo.size);
    if (problema) {
      setAvisosArquivo((a) => ({ ...a, arquivoPrincipal: `${arquivo.name}: ${problema}` }));
      return;
    }
    setAvisosArquivo((a) => ({ ...a, arquivoPrincipal: undefined }));
    setPrincipal(arquivo);
    revalidar(dados, arquivo, anexos);
  }

  function removerPrincipal() {
    setPrincipal(null);
    revalidar(dados, null, anexos);
    requestAnimationFrame(() => document.getElementById(ID_CAMPO.arquivoPrincipal)?.focus());
  }

  function receberAnexos(arquivos: File[]) {
    limparDoServidor('anexos');
    const aceitos: File[] = [];
    const recusados: string[] = [];
    for (const arquivo of arquivos) {
      const problema = validarArquivo(arquivo.name, arquivo.size);
      if (problema) recusados.push(`${arquivo.name}: ${problema}`);
      else aceitos.push(arquivo);
    }
    // Seleções sucessivas se somam (documento 03, seção 7), respeitando quantidade e total.
    const novos = [...anexos, ...aceitos];
    const total = (principal?.size ?? 0) + novos.reduce((s, a) => s + a.size, 0);
    const problemaConjunto = validarConjuntoArquivos(novos.length, total);
    if (problemaConjunto) {
      setAvisosArquivo((a) => ({ ...a, anexos: `${problemaConjunto} Nenhum arquivo desta seleção foi adicionado.` }));
      return;
    }
    setAnexos(novos);
    setAvisosArquivo((a) => ({ ...a, anexos: recusados.length > 0 ? recusados.join(' ') : undefined }));
    revalidar(dados, principal, novos);
  }

  function removerAnexo(indice: number) {
    const novos = anexos.filter((_, i) => i !== indice);
    setAnexos(novos);
    revalidar(dados, principal, novos);
    requestAnimationFrame(() => document.getElementById(ID_CAMPO.anexos)?.focus());
  }

  /** Volta ao estado inicial completo (P-04): arquivos zerados, remetente e área repreenchidos, ID novo. */
  function limpar() {
    idDocumento.current = novoIdDocumento();
    setDados(dadosIniciais(eu));
    setPrincipal(null);
    setAnexos([]);
    setErros({});
    setErrosServidor({});
    setAvisosArquivo({});
    setTentouEnviar(false);
    setErroEnvio(null);
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviandoAgora.current) return; // sem duplo envio
    setTentouEnviar(true);
    setErroEnvio(null);
    setAvisoJaRegistrado(null);
    setErrosServidor({});
    const encontrados = validarDocumento(dados, principal, anexos);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0 || !principal) {
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    enviandoAgora.current = true;
    setEnviando(true);
    try {
      const documento = await api.criarDocumento(paraEnvio(idDocumento.current, dados), principal, anexos);
      aoRegistrar(documento);
      // Só depois da confirmação da gravação: limpa, repreenche e gera o ID do próximo cadastro.
      limpar();
      // O prazo vem da resposta (calculado no servidor, decisão 0011); a tela nunca o calcula.
      const prazo = documento.dataRevisao ? ` Prazo: ${formatarData(documento.dataRevisao)}.` : '';
      toast(`Documento registrado.${prazo}`, { rotulo: 'Ver na lista', aoAcionar: () => aoVerNaLista(documento.id) });
    } catch (erro) {
      await tratarErro(erro);
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  async function tratarErro(erro: unknown) {
    if (erro instanceof ErroApi && erro.codigo === 'codigo_revisao_existente') {
      setErrosServidor({ codigo: MENSAGEM_CODIGO_EXISTENTE });
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    if (erro instanceof ErroApi && erro.codigo === 'dados_invalidos') {
      const doServidor: ErrosDocumento = {};
      for (const campo of ORDEM_CAMPOS) {
        const mensagem = erro.campos[campo];
        if (mensagem) doServidor[campo] = mensagem;
      }
      if (Object.keys(doServidor).length > 0) {
        setErrosServidor(doServidor);
        requestAnimationFrame(() => resumo.current?.focus());
        return;
      }
    }
    if (erro instanceof ErroApi && erro.codigo === 'id_existente') {
      // R5: o 1º envio pode ter sido gravado com a resposta perdida e o reenvio (editado) mudou o conteúdo.
      // Nunca renovar o ID às cegas: primeiro ver se o documento com este ID é da própria pessoa.
      const idAtual = idDocumento.current;
      const existente = await api.documento(idAtual).then((d) => d.documento).catch(() => null);
      if (existente && existente.criadoPor === eu.id) {
        aoRegistrar(existente);
        limpar();
        setAvisoJaRegistrado(existente.id);
        aoVerNaLista(existente.id);
        return;
      }
      // Colisão real com registro de outra pessoa (ou inexistente): só então um ID novo.
      idDocumento.current = novoIdDocumento();
      setErroEnvio('O identificador deste registro coincidiu com outro. Um novo identificador foi gerado: clique em Tentar novamente.');
      requestAnimationFrame(() => banner.current?.focus());
      return;
    }
    setErroEnvio(mensagemDeErro(erro));
    requestAnimationFrame(() => banner.current?.focus());
  }

  const exibidos: ErrosDocumento = {};
  for (const campo of ORDEM_CAMPOS) {
    const mensagem = erros[campo] ?? errosServidor[campo] ?? avisosArquivo[campo];
    if (mensagem) exibidos[campo] = mensagem;
  }
  const listaErros = ORDEM_CAMPOS.filter((c) => (erros[c] ?? errosServidor[c]) !== undefined);
  const nomeArea = areas.find((a) => a.id === dados.areaId)?.nome ?? eu.area ?? '';

  return (
    <section className={`${pagina.cartao} ${estilos.cartaoFormulario}`} aria-labelledby="titulo-formulario">
      <div className={estilos.topoFormulario}>
        <h2 id="titulo-formulario" className={estilos.tituloFormulario}>
          <FilePlus2 size={18} aria-hidden="true" />
          Registro de documento
        </h2>
        <Botao
          compacto
          onClick={() => (sujo ? setConfirmarLimpar(true) : limpar())}
          disabled={enviando}
          icone={<X size={16} aria-hidden="true" />}
        >
          Limpar formulário
        </Botao>
      </div>

      <form className={estilos.formulario} noValidate onSubmit={enviar} aria-describedby="doc-obrigatorios">
        {listaErros.length > 0 && (
          <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
            <p>
              {listaErros.length === 1
                ? 'Corrija 1 campo antes de registrar:'
                : `Corrija ${listaErros.length} campos antes de registrar:`}
            </p>
            <ul>
              {listaErros.map((c) => (
                <li key={c}>
                  <a
                    href={`#${ID_CAMPO[c]}`}
                    onClick={(e) => {
                      e.preventDefault();
                      focarCampo(c);
                    }}
                  >
                    {NOME_CAMPO[c]}: {erros[c] ?? errosServidor[c]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <CampoTexto
          id={ID_CAMPO.titulo}
          rotulo="Título do documento"
          obrigatorio
          larguraTotal
          autoComplete="off"
          value={dados.titulo}
          erro={exibidos.titulo}
          onChange={(e) => alterar('titulo', e.target.value)}
        />
        <CampoTexto
          id={ID_CAMPO.codigo}
          rotulo="Código do documento"
          autoComplete="off"
          dica="Ex.: MR-IND-0001-CTO-001. Deixe vazio se ainda não houver."
          value={dados.codigo}
          erro={exibidos.codigo}
          onChange={(e) => alterar('codigo', e.target.value)}
        />
        <CampoSelecao
          id={ID_CAMPO.tipoDocumentoId}
          rotulo="Tipo de documento"
          obrigatorio
          value={dados.tipoDocumentoId}
          erro={exibidos.tipoDocumentoId}
          onChange={(e) => alterar('tipoDocumentoId', e.target.value)}
        >
          <option value="">Selecione o tipo…</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </CampoSelecao>
        <CampoTexto
          id={ID_CAMPO.remetente}
          rotulo="Remetente / solicitante"
          obrigatorio
          autoComplete="off"
          value={dados.remetente}
          erro={exibidos.remetente}
          onChange={(e) => alterar('remetente', e.target.value)}
        />
        {areaTravada ? (
            <CampoTexto
              id={ID_CAMPO.areaId}
              rotulo="Área"
              obrigatorio
              readOnly
              value={nomeArea}
              dica="Você registra documentos só na sua área."
              erro={exibidos.areaId}
            />
        ) : (
          <CampoSelecao
            id={ID_CAMPO.areaId}
            rotulo="Área"
            obrigatorio
            value={dados.areaId}
            erro={exibidos.areaId}
            onChange={(e) => alterar('areaId', e.target.value)}
          >
            <option value="">Selecione a área…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </CampoSelecao>
        )}
        <CampoTexto
          id={ID_CAMPO.disciplina}
          rotulo="Disciplina"
          autoComplete="off"
          dica="Ex.: Corporativo, Mecânica."
          value={dados.disciplina}
          erro={exibidos.disciplina}
          onChange={(e) => alterar('disciplina', e.target.value)}
        />
        <CampoTexto
          id={ID_CAMPO.revisao}
          rotulo="N° de revisão"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          dica="Documento novo começa na revisão 0."
          value={dados.revisao}
          erro={exibidos.revisao}
          onChange={(e) => alterar('revisao', e.target.value)}
        />

        {/* P-03: o status inicial é fixo e não editável. */}
        <div className={estilos.statusFixo}>
          <span className={estilos.rotuloFixo} id="doc-status-rotulo">
            Status da tramitação
          </span>
          <p>
            <BadgeStatus status={STATUS_INICIAL} />
          </p>
          <p className={estilos.dicaFixa}>
            Todo documento novo começa como Recebido. A data de recebimento (hoje) e o prazo são gravados automaticamente.
          </p>
        </div>

        <CampoAreaTexto
          id={ID_CAMPO.observacao}
          rotulo="Observações"
          dica="Também vira o texto do primeiro evento do histórico."
          value={dados.observacao}
          erro={exibidos.observacao}
          onChange={(e) => alterar('observacao', e.target.value)}
        />

        <ZonaArquivo
          id={ID_CAMPO.arquivoPrincipal}
          rotulo="Arquivo do documento principal"
          obrigatorio
          textoArraste="Arraste o arquivo aqui ou"
          textoBotao="Procurar arquivo"
          dica={`Um único arquivo. Formatos: ${FORMATOS}. Até ${LIMITES_ARQUIVO.tamanhoMaximoMB} MB.`}
          aceitar={ACEITAR}
          estado={principal ? `Arquivo selecionado: ${principal.name}.` : 'Nenhum arquivo selecionado.'}
          erro={exibidos.arquivoPrincipal}
          aoReceber={receberPrincipal}
          preenchido={
            principal ? (
              <ArquivoEscolhido idInput={ID_CAMPO.arquivoPrincipal} arquivo={principal} aoRemover={removerPrincipal} />
            ) : undefined
          }
        />

        <ZonaArquivo
          id={ID_CAMPO.anexos}
          rotulo="Documentos complementares (anexos)"
          multiplo
          textoArraste="Arraste os anexos aqui ou"
          textoBotao="Adicionar anexos"
          dica={`Opcional. Até ${LIMITES_ARQUIVO.maxAnexos} anexos, ${LIMITES_ARQUIVO.tamanhoMaximoMB} MB cada e ${LIMITES_ARQUIVO.totalMaximoMB} MB no total.`}
          aceitar={ACEITAR}
          estado={anexos.length === 1 ? '1 anexo adicionado.' : `${anexos.length} anexos adicionados.`}
          erro={exibidos.anexos}
          aoReceber={receberAnexos}
          depois={<EtiquetasAnexos arquivos={anexos} aoRemover={removerAnexo} />}
        />

        <div className={estilos.rodape}>
          <p id="doc-obrigatorios" className={estilos.infoRodape}>
            Campos com <span aria-hidden="true">*</span>
            <span className="visualmente-oculto">asterisco</span> são obrigatórios.
          </p>
          {avisoJaRegistrado && (
            <div className={estilos.bannerInfo} role="status">
              <p>
                Este documento já tinha sido registrado. As alterações feitas depois do primeiro envio não foram gravadas.
              </p>
              <Botao compacto onClick={() => aoVerNaLista(avisoJaRegistrado)}>
                Ver na lista
              </Botao>
            </div>
          )}
          {erroEnvio && (
            <div ref={banner} className={estilos.bannerErro} role="alert" tabIndex={-1}>
              <div>
                <p className={estilos.bannerTitulo}>Não foi possível registrar o documento</p>
                <p>{erroEnvio} Seus dados e arquivos foram mantidos.</p>
              </div>
              <Botao onClick={() => void enviar()} disabled={enviando} icone={<RotateCw size={16} aria-hidden="true" />}>
                Tentar novamente
              </Botao>
            </div>
          )}
          <Botao
            type="submit"
            variante="primario"
            className={estilos.botaoEnviar}
            carregando={enviando}
            icone={<Send size={16} aria-hidden="true" />}
          >
            {enviando ? 'Registrando…' : 'Registrar documento'}
          </Botao>
        </div>
      </form>

      <Dialogo
        aberto={confirmarLimpar}
        titulo="Limpar o formulário?"
        aoFechar={() => setConfirmarLimpar(false)}
        acoes={
          <>
            <Botao onClick={() => setConfirmarLimpar(false)}>Cancelar</Botao>
            <Botao
              variante="perigo"
              onClick={() => {
                setConfirmarLimpar(false);
                limpar();
              }}
            >
              Limpar formulário
            </Botao>
          </>
        }
      >
        <p>Os campos preenchidos, o arquivo principal e os anexos serão descartados. Remetente e área voltam aos seus dados.</p>
      </Dialogo>
    </section>
  );
}
