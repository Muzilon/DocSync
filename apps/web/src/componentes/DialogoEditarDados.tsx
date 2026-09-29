import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { RotateCw, Save } from 'lucide-react';
import {
  CAMPOS_EDITAVEIS,
  diferencasDocumento,
  ordenarAlfabetico,
  pode,
  podeEditarAgora,
  rotuloCampoHistorico,
  validarDadosDocumento,
  type Area,
  type CampoEditavel,
  type DadosDocumento,
  type DetalheEdicao,
  type Documento,
  type EdicaoDocumento,
  type Pessoa,
  type ResultadoEdicao,
  type TipoDocumento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import {
  MENSAGEM_CODIGO_EXISTENTE,
  NOME_CAMPO_DOCUMENTO,
  ORDEM_CAMPOS_DOCUMENTO,
  type DadosFormDocumento,
} from '../camposDocumento.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { Botao } from './Botao.tsx';
import { CampoAreaTexto, CampoSelecao, CampoTexto } from './Campo.tsx';
import { Dialogo } from './Dialogo.tsx';
import { DialogoConfirmar } from './DialogoConfirmar.tsx';
import { Carregando, ErroCarregamento } from './Estados.tsx';
import estilos from './DialogoEditarDados.module.css';

/** IDs dos campos (contrato F6, 5.2: prefixo `edicao-`), usados pelos links do resumo de erros. */
export const ID_CAMPO_EDICAO: Record<CampoEditavel, string> = {
  titulo: 'edicao-titulo',
  codigo: 'edicao-codigo',
  tipoDocumentoId: 'edicao-tipo',
  remetente: 'edicao-remetente',
  revisao: 'edicao-revisao',
  areaId: 'edicao-area',
  disciplina: 'edicao-disciplina',
  observacao: 'edicao-observacao',
};
const ID_FORMULARIO = 'edicao-formulario';
export const MENSAGEM_SEM_ALTERACAO = 'Nenhum campo foi alterado.';

/** Campo de `detalhes[]` do evento EDICAO → campo do formulário. */
const CAMPO_DO_DETALHE: Record<DetalheEdicao['campo'], CampoEditavel> = {
  titulo: 'titulo',
  codigo: 'codigo',
  tipoDocumento: 'tipoDocumentoId',
  revisao: 'revisao',
  remetente: 'remetente',
  area: 'areaId',
  disciplina: 'disciplina',
  observacao: 'observacao',
};

type Erros = Partial<Record<CampoEditavel, string>>;

/** Os 8 campos cadastrais do documento como estão (a mesma forma que a edição envia). */
export function dadosDoDocumento(documento: Documento): DadosDocumento {
  const dados = {} as Record<CampoEditavel, unknown>;
  for (const campo of CAMPOS_EDITAVEIS) dados[campo] = documento[campo];
  return dados as DadosDocumento;
}

/** Documento → valores do formulário (texto; nulo vira vazio). */
export function formularioDe(documento: Documento): DadosFormDocumento {
  const texto = (valor: string | number | null) => (valor === null ? '' : String(valor));
  const form = {} as DadosFormDocumento;
  for (const campo of CAMPOS_EDITAVEIS) form[campo] = texto(documento[campo]);
  return form;
}

/** "Título: “A” → “B”" (nulo como "—"), para o aviso de conflito. */
export function textoDiferenca(d: DetalheEdicao): string {
  const valor = (v: string | null) => (v === null || v === '' ? '—' : `“${v}”`);
  return `${rotuloCampoHistorico(d.campo)}: ${valor(d.antes)} → ${valor(d.depois)}`;
}

/** Por que o documento deixou de aceitar edição (conflito que o levou a Aprovado, Cancelado ou fora de devolvido). */
function motivoSemEdicao(documento: Documento): string {
  if (documento.status === 'Aprovado') return 'Documento aprovado é final. Para corrigir, cadastre uma revisão.';
  if (documento.status === 'Cancelado') return 'Documento cancelado: reative antes de editar.';
  return 'Você só pode editar documentos devolvidos à sua área.';
}

type Listas = { tipos: TipoDocumento[]; areas: Area[] };

interface Conflito {
  /** O que a outra pessoa mudou (base antiga → documento atual). */
  diferencas: DetalheEdicao[];
  /** Documento atual ainda aceita edição por esta pessoa? Senão, Salvar some e o aviso diz o porquê. */
  editavel: boolean;
  motivo: string;
}

interface Props {
  documento: Documento;
  eu: Pessoa;
  aberto: boolean;
  aoFechar: () => void;
  /** 201 (ou 200). `rotulos` = campos alterados, para o aviso "Dados atualizados: …"; vazio = nada mudou. */
  aoSalvar: (resultado: ResultadoEdicao, rotulos: string[]) => void;
  /** 409 conflito_versao: documento atual vindo do erro (o modal e o cartão se atualizam). */
  aoConflito: (documento: Documento) => void;
}

/**
 * "Editar dados" (contrato F6, 5.2–5.5): o mesmo formulário do cadastro, sem arquivos, validado
 * pela MESMA `validarDadosDocumento` da API (P-14). Status, responsável, datas e arquivos não
 * aparecem. Envia o corpo completo com a versão vista; 409 conflito_versao mantém o digitado e
 * mostra o que a outra pessoa mudou; nunca sobrescreve em silêncio (decisão 0002).
 */
export function DialogoEditarDados({ documento, eu, aberto, aoFechar, aoSalvar, aoConflito }: Props) {
  const api = useApi();
  const [listas, setListas] = useState<Listas | null>(null);
  const [erroListas, setErroListas] = useState<string | null>(null);
  const [tentativaListas, setTentativaListas] = useState(0);

  /** Documento de referência: o carregado ao abrir, trocado pelo atual num 409. */
  const [base, setBase] = useState<Documento>(documento);
  const [dados, setDados] = useState<DadosFormDocumento>(() => formularioDe(documento));
  const [erros, setErros] = useState<Erros>({});
  const [errosServidor, setErrosServidor] = useState<Erros>({});
  const [tentou, setTentou] = useState(false);
  const [semAlteracao, setSemAlteracao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [semConexao, setSemConexao] = useState(false);
  const [conflito, setConflito] = useState<Conflito | null>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const enviandoAgora = useRef(false);
  /** Último corpo enviado: "Tentar novamente" reenvia exatamente o mesmo (idempotente). */
  const ultimoCorpo = useRef<EdicaoDocumento | null>(null);
  const resumo = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  /**
   * Pedido de foco no resumo de erros ou no aviso: atendido DEPOIS do commit (efeito), para o
   * elemento já existir mesmo com a máquina lenta. `n` muda a cada pedido.
   */
  const [pedidoFoco, setPedidoFoco] = useState<{ alvo: 'resumo' | 'aviso'; n: number } | null>(null);
  const focar = (alvo: 'resumo' | 'aviso') => setPedidoFoco((atual) => ({ alvo, n: (atual?.n ?? 0) + 1 }));
  useEffect(() => {
    if (!pedidoFoco) return;
    (pedidoFoco.alvo === 'resumo' ? resumo : aviso).current?.focus();
  }, [pedidoFoco]);

  useEffect(() => {
    let ativo = true;
    setErroListas(null);
    setListas(null);
    Promise.all([api.tiposDocumento(), api.areas()])
      .then(([tipos, areas]) => {
        if (ativo) setListas({ tipos, areas });
      })
      .catch((erro: unknown) => {
        if (ativo) setErroListas(mensagemDeErro(erro));
      });
    return () => {
      ativo = false;
    };
  }, [api, tentativaListas]);

  // Foco inicial no Título (contrato F6, 5.2) assim que o formulário existe.
  const formularioPronto = aberto && listas !== null;
  useEffect(() => {
    if (!formularioPronto) return;
    const quadro = requestAnimationFrame(() => document.getElementById(ID_CAMPO_EDICAO.titulo)?.focus());
    return () => cancelAnimationFrame(quadro);
  }, [formularioPronto]);

  /** Tipos: os ativos mais o atual, se ele estiver inativo ("(inativo)"): o valor nunca some. */
  const opcoesTipo = useMemo(() => {
    if (!listas) return [];
    const opcoes = listas.tipos.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome, rotulo: t.nome }));
    if (!opcoes.some((t) => t.id === base.tipoDocumentoId)) {
      opcoes.push({ id: base.tipoDocumentoId, nome: base.tipoDocumento, rotulo: `${base.tipoDocumento} (inativo)` });
    }
    return opcoes;
  }, [listas, base.tipoDocumentoId, base.tipoDocumento]);

  /**
   * Áreas: ativas em ordem pt-BR (decisão 0006) onde a pessoa pode editar, mais a atual se inativa.
   * Quem não pode mudar de área (Solicitante) vê o campo travado, como no cadastro.
   */
  const { opcoesArea, areaTravada } = useMemo(() => {
    if (!listas) return { opcoesArea: [], areaTravada: false };
    const ativas = listas.areas.filter((a) => a.ativa);
    const permitidas = ordenarAlfabetico(
      ativas.filter((a) => pode(eu, 'editarDados', { areaId: a.id, status: base.status })),
      (a) => a.nome,
    ).map((a) => ({ id: a.id, nome: a.nome, rotulo: a.nome }));
    if (!permitidas.some((a) => a.id === base.areaId)) {
      permitidas.push({ id: base.areaId, nome: base.area, rotulo: `${base.area} (inativa)` });
    }
    const travada = ativas.some((a) => !pode(eu, 'editarDados', { areaId: a.id, status: base.status }));
    return { opcoesArea: permitidas, areaTravada: travada };
  }, [listas, eu, base.areaId, base.area, base.status]);

  const referencia = useMemo(() => formularioDe(base), [base]);
  const podeSalvar = conflito === null || conflito.editavel;
  const sujo = CAMPOS_EDITAVEIS.some((c) => dados[c] !== referencia[c]);

  /** Dica "Valor atual no servidor: X" nos campos que a outra pessoa alterou (409). */
  const valorNoServidor = useMemo(() => {
    const mapa: Erros = {};
    for (const d of conflito?.diferencas ?? []) {
      mapa[CAMPO_DO_DETALHE[d.campo]] = `Valor atual no servidor: ${d.depois === null || d.depois === '' ? '—' : d.depois}.`;
    }
    return mapa;
  }, [conflito]);

  function nomes(valores: DadosDocumento) {
    return {
      tipoDocumento: opcoesTipo.find((t) => t.id === valores.tipoDocumentoId)?.nome ?? base.tipoDocumento,
      area: opcoesArea.find((a) => a.id === valores.areaId)?.nome ?? base.area,
    };
  }

  function alterar(campo: CampoEditavel, valor: string) {
    const novos = { ...dados, [campo]: valor };
    setDados(novos);
    setSemAlteracao(false);
    setErrosServidor((atuais) => {
      if (!atuais[campo]) return atuais;
      const copia = { ...atuais };
      delete copia[campo];
      return copia;
    });
    // Depois da primeira tentativa, a validação acompanha a digitação.
    if (tentou) setErros(validarDadosDocumento(novos).erros);
  }

  function tentarFechar() {
    if (enviandoAgora.current) return;
    if (sujo) setConfirmarDescarte(true);
    else aoFechar();
  }

  function salvar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviandoAgora.current || !podeSalvar) return;
    setTentou(true);
    setErroGeral(null);
    setSemConexao(false);
    setErrosServidor({});
    const validacao = validarDadosDocumento(dados);
    setErros(validacao.erros);
    if (!validacao.dados) {
      setSemAlteracao(false);
      focar('resumo');
      return;
    }
    // Edição vazia não vai ao servidor (contrato F6, 5.2).
    if (diferencasDocumento(base, validacao.dados, nomes(validacao.dados)).length === 0) {
      setSemAlteracao(true);
      focar('resumo');
      return;
    }
    setSemAlteracao(false);
    const corpo: EdicaoDocumento = { ...validacao.dados, versao: base.versao };
    ultimoCorpo.current = corpo;
    void enviar(corpo);
  }

  async function enviar(corpo: EdicaoDocumento) {
    if (enviandoAgora.current) return;
    enviandoAgora.current = true;
    setEnviando(true);
    setErroGeral(null);
    setSemConexao(false);
    setConflito(null);
    try {
      const resultado = await api.editarDados(base.id, corpo);
      const rotulos = (resultado.evento?.detalhes ?? []).map((d) => rotuloCampoHistorico(d.campo));
      aoSalvar(resultado, rotulos);
    } catch (erro) {
      tratarErro(erro);
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  function tratarErro(erro: unknown) {
    if (erro instanceof ErroApi && erro.codigo === 'conflito_versao' && erro.documento) {
      const atual = erro.documento;
      const diferencas = diferencasDocumento(base, dadosDoDocumento(atual), { tipoDocumento: atual.tipoDocumento, area: atual.area });
      // O que a pessoa digitou fica; campos que ela NÃO tocou passam ao valor atual (nada volta atrás em silêncio).
      const novoForm = formularioDe(atual);
      setDados((meus) => {
        const mesclado = { ...meus };
        for (const c of CAMPOS_EDITAVEIS) if (meus[c] === referencia[c]) mesclado[c] = novoForm[c];
        return mesclado;
      });
      const editavel = podeEditarAgora(atual) && pode(eu, 'editarDados', { areaId: atual.areaId, status: atual.status });
      setBase(atual);
      setConflito({ diferencas, editavel, motivo: editavel ? '' : motivoSemEdicao(atual) });
      aoConflito(atual);
      focar('aviso');
      return;
    }
    if (erro instanceof ErroApi && erro.codigo === 'codigo_revisao_existente') {
      setErrosServidor({ codigo: MENSAGEM_CODIGO_EXISTENTE });
      focar('resumo');
      return;
    }
    if (erro instanceof ErroApi && erro.codigo === 'dados_invalidos') {
      const doServidor: Erros = {};
      for (const campo of CAMPOS_EDITAVEIS) {
        const mensagem = erro.campos[campo];
        if (mensagem) doServidor[campo] = mensagem;
      }
      if (Object.keys(doServidor).length > 0) {
        setErrosServidor(doServidor);
        focar('resumo');
        return;
      }
    }
    if (erro instanceof ErroApi && erro.codigo === 'sem_conexao') setSemConexao(true);
    setErroGeral(mensagemDeErro(erro));
    focar('aviso');
  }

  const exibidos: Erros = {};
  for (const c of CAMPOS_EDITAVEIS) {
    const mensagem = erros[c] ?? errosServidor[c];
    if (mensagem) exibidos[c] = mensagem;
  }
  const listaErros = ORDEM_CAMPOS_DOCUMENTO.filter((c) => exibidos[c] !== undefined);

  const dica = (campo: CampoEditavel, normal?: string) =>
    [valorNoServidor[campo], normal].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <Dialogo
        aberto={aberto}
        tamanho="larga"
        titulo="Editar dados"
        botaoFechar="Fechar edição"
        cabecalho={
          <div className={estilos.apoio}>
            <p className={estilos.linha}>
              <span className={base.codigo ? estilos.codigo : estilos.semCodigo}>{base.codigo ?? 'S/ código'}</span>
              <span className={estilos.revisao}>Rev. {base.revisao}</span>
              <BadgeStatus status={base.status} />
            </p>
            <p className={estilos.nota}>Status, responsável, data de recebimento, prazo e arquivos não se alteram aqui.</p>
          </div>
        }
        aoFechar={tentarFechar}
        acoes={
          <div className={estilos.acoes}>
            {listas !== null && podeSalvar && (
              <Botao
                type="submit"
                form={ID_FORMULARIO}
                variante="primario"
                carregando={enviando}
                icone={<Save size={16} aria-hidden="true" />}
              >
                {enviando ? 'Salvando…' : 'Salvar alterações'}
              </Botao>
            )}
            <Botao onClick={tentarFechar} disabled={enviando}>
              Voltar
            </Botao>
          </div>
        }
      >
        {erroListas ? (
          <ErroCarregamento mensagem={erroListas} aoTentarNovamente={() => setTentativaListas((n) => n + 1)} />
        ) : listas === null ? (
          <Carregando texto="Carregando formulário…" />
        ) : (
          <form id={ID_FORMULARIO} className={estilos.formulario} noValidate onSubmit={salvar} aria-describedby="edicao-obrigatorios">
            {conflito && (
              <div ref={aviso} className={estilos.aviso} role="alert" tabIndex={-1}>
                <p className={estilos.avisoTitulo}>Alguém alterou este documento enquanto você editava.</p>
                {conflito.diferencas.length > 0 ? (
                  <ul>
                    {conflito.diferencas.map((d) => (
                      <li key={d.campo}>{textoDiferenca(d)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Os dados cadastrais não mudaram; o documento teve outra atualização.</p>
                )}
                <p>
                  {conflito.editavel
                    ? 'Suas alterações foram mantidas. Confira e clique em Salvar alterações de novo, ou volte.'
                    : conflito.motivo}
                </p>
              </div>
            )}
            {erroGeral && !conflito && (
              <div ref={aviso} className={estilos.erro} role="alert" tabIndex={-1}>
                <div>
                  <p className={estilos.avisoTitulo}>Não foi possível salvar as alterações</p>
                  <p>
                    {erroGeral}
                    {semConexao && ' O que você digitou foi mantido.'}
                  </p>
                </div>
                {semConexao && ultimoCorpo.current && (
                  <Botao
                    compacto
                    disabled={enviando}
                    icone={<RotateCw size={16} aria-hidden="true" />}
                    onClick={() => ultimoCorpo.current && void enviar(ultimoCorpo.current)}
                  >
                    Tentar novamente
                  </Botao>
                )}
              </div>
            )}
            {listaErros.length > 0 && (
              <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
                <p>
                  {listaErros.length === 1
                    ? 'Corrija 1 campo antes de salvar:'
                    : `Corrija ${listaErros.length} campos antes de salvar:`}
                </p>
                <ul>
                  {listaErros.map((c) => (
                    <li key={c}>
                      <a
                        href={`#${ID_CAMPO_EDICAO[c]}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(ID_CAMPO_EDICAO[c])?.focus();
                        }}
                      >
                        {NOME_CAMPO_DOCUMENTO[c]}: {exibidos[c]}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {listaErros.length === 0 && semAlteracao && (
              // Informativo, não erro: nada foi recusado, só não há o que salvar.
              <div ref={resumo} className={estilos.informativo} role="status" tabIndex={-1}>
                <p>{MENSAGEM_SEM_ALTERACAO}</p>
              </div>
            )}

            <CampoTexto
              id={ID_CAMPO_EDICAO.titulo}
              rotulo={NOME_CAMPO_DOCUMENTO.titulo}
              obrigatorio
              larguraTotal
              autoComplete="off"
              value={dados.titulo}
              dica={dica('titulo')}
              erro={exibidos.titulo}
              onChange={(e) => alterar('titulo', e.target.value)}
            />
            <CampoTexto
              id={ID_CAMPO_EDICAO.codigo}
              rotulo={NOME_CAMPO_DOCUMENTO.codigo}
              autoComplete="off"
              value={dados.codigo}
              dica={dica('codigo', 'Deixe vazio se ainda não houver.')}
              erro={exibidos.codigo}
              onChange={(e) => alterar('codigo', e.target.value)}
            />
            <CampoSelecao
              id={ID_CAMPO_EDICAO.tipoDocumentoId}
              rotulo={NOME_CAMPO_DOCUMENTO.tipoDocumentoId}
              obrigatorio
              value={dados.tipoDocumentoId}
              dica={dica('tipoDocumentoId')}
              erro={exibidos.tipoDocumentoId}
              onChange={(e) => alterar('tipoDocumentoId', e.target.value)}
            >
              <option value="">Selecione o tipo…</option>
              {opcoesTipo.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </CampoSelecao>
            <CampoTexto
              id={ID_CAMPO_EDICAO.remetente}
              rotulo={NOME_CAMPO_DOCUMENTO.remetente}
              obrigatorio
              autoComplete="off"
              value={dados.remetente}
              dica={dica('remetente')}
              erro={exibidos.remetente}
              onChange={(e) => alterar('remetente', e.target.value)}
            />
            {areaTravada ? (
              <CampoTexto
                id={ID_CAMPO_EDICAO.areaId}
                rotulo={NOME_CAMPO_DOCUMENTO.areaId}
                obrigatorio
                readOnly
                value={base.area}
                dica={dica('areaId', 'Você edita documentos só na sua área.')}
                erro={exibidos.areaId}
              />
            ) : (
              <CampoSelecao
                id={ID_CAMPO_EDICAO.areaId}
                rotulo={NOME_CAMPO_DOCUMENTO.areaId}
                obrigatorio
                value={dados.areaId}
                dica={dica('areaId')}
                erro={exibidos.areaId}
                onChange={(e) => alterar('areaId', e.target.value)}
              >
                <option value="">Selecione a área…</option>
                {opcoesArea.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.rotulo}
                  </option>
                ))}
              </CampoSelecao>
            )}
            <CampoTexto
              id={ID_CAMPO_EDICAO.disciplina}
              rotulo={NOME_CAMPO_DOCUMENTO.disciplina}
              autoComplete="off"
              value={dados.disciplina}
              dica={dica('disciplina')}
              erro={exibidos.disciplina}
              onChange={(e) => alterar('disciplina', e.target.value)}
            />
            <CampoTexto
              id={ID_CAMPO_EDICAO.revisao}
              rotulo={NOME_CAMPO_DOCUMENTO.revisao}
              obrigatorio
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={dados.revisao}
              dica={dica('revisao', 'Corrige o número deste documento; não cria uma revisão nova.')}
              erro={exibidos.revisao}
              onChange={(e) => alterar('revisao', e.target.value)}
            />
            <CampoAreaTexto
              id={ID_CAMPO_EDICAO.observacao}
              rotulo={NOME_CAMPO_DOCUMENTO.observacao}
              value={dados.observacao}
              dica={dica('observacao')}
              erro={exibidos.observacao}
              onChange={(e) => alterar('observacao', e.target.value)}
            />
            <p id="edicao-obrigatorios" className={estilos.obrigatorios}>
              Campos com <span aria-hidden="true">*</span>
              <span className="visualmente-oculto">asterisco</span> são obrigatórios.
            </p>
          </form>
        )}
      </Dialogo>

      <DialogoConfirmar
        aberto={confirmarDescarte}
        titulo="Descartar alterações?"
        rotuloConfirmar="Descartar"
        rotuloEnviando="Descartando…"
        rotuloVoltar="Continuar editando"
        variante="perigo"
        aoFechar={() => setConfirmarDescarte(false)}
        aoConfirmar={async () => {
          // Fecha a confirmação primeiro (o foco volta para dentro da edição) e só depois a edição,
          // para o foco terminar no botão "Editar dados" (o navegador restaura o foco a cada close()).
          setConfirmarDescarte(false);
          requestAnimationFrame(() => aoFechar());
        }}
      >
        <p>O que você alterou neste formulário não será gravado.</p>
      </DialogoConfirmar>
    </>
  );
}
