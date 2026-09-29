import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import {
  LIMITES_OBSERVACAO,
  acoesDeStatus,
  ehResponsavelSugerido,
  exigeResponsavel,
  sugerirResponsaveis,
  validarObservacao,
  type Documento,
  type Pessoa,
  type PessoaResumo,
  type ResultadoTransicao,
  type StatusDocumento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { Botao } from './Botao.tsx';
import { CampoAreaTexto, CampoSelecao } from './Campo.tsx';
import { Dialogo } from './Dialogo.tsx';
import estilos from './DialogoStatus.module.css';

type CampoEtapa = 'para' | 'responsavelId' | 'observacao';
type Erros = Partial<Record<CampoEtapa, string>>;

const ORDEM: CampoEtapa[] = ['para', 'responsavelId', 'observacao'];
export const ID_CAMPO_ETAPA: Record<CampoEtapa, string> = {
  para: 'etapa-destino',
  responsavelId: 'etapa-responsavel',
  observacao: 'etapa-observacao',
};
const NOME: Record<CampoEtapa, string> = { para: 'Etapa', responsavelId: 'Responsável', observacao: 'Observação' };
const ID_FORMULARIO = 'etapa-formulario';

type EstadoPessoas =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; pessoas: PessoaResumo[] };

/** Texto da opção de etapa: o rótulo da ação e, quando ele não diz, o nome do status entre parênteses. */
export function textoOpcaoEtapa(rotulo: string, para: StatusDocumento): string {
  return rotulo.includes(para) ? rotulo : `${rotulo} (${para})`;
}

/**
 * Separa as pessoas em "Sugeridos" e "Outras pessoas" (contrato F5, 2.4): a ordem é a de
 * `sugerirResponsaveis` (sugeridas primeiro, `eu` à frente) e o critério é `ehResponsavelSugerido`.
 */
export function agruparResponsaveis(
  para: StatusDocumento,
  documento: Pick<Documento, 'areaId'>,
  pessoas: readonly PessoaResumo[],
  eu: Pick<Pessoa, 'id'>,
): { sugeridos: PessoaResumo[]; outros: PessoaResumo[] } {
  const ordenadas = sugerirResponsaveis(para, documento, pessoas, eu);
  return {
    sugeridos: ordenadas.filter((p) => ehResponsavelSugerido(para, documento, p)),
    outros: ordenadas.filter((p) => !ehResponsavelSugerido(para, documento, p)),
  };
}

interface Props {
  documento: Pick<Documento, 'id' | 'titulo' | 'codigo' | 'revisao' | 'status' | 'areaId' | 'versao'>;
  eu: Pessoa;
  aberto: boolean;
  /** Etapa pré-selecionada (botão de ação rápida do rodapé); vazio = a pessoa escolhe. */
  paraInicial?: StatusDocumento | null;
  aoFechar: () => void;
  /** 201 (ou 200 de reenvio idêntico): documento e evento STATUS devolvidos pela API. */
  aoRegistrar: (resultado: ResultadoTransicao) => void;
  /** 409 conflito_versao: documento atual vindo do erro (o modal e o cartão se atualizam). */
  aoConflito: (documento: Documento) => void;
}

/**
 * Diálogo "Atualizar etapa" (contrato F5, 6.3), empilhável sobre os detalhes. Etapa (opções de
 * `acoesDeStatus`, a mesma regra da API), Responsável (só quando `exigeResponsavel`; lista de
 * GET /responsaveis com as sugeridas primeiro) e Observação opcional. Validação por script, resumo
 * de erros focável e erros inline. Envia { para, responsavelId, observacao, versao }.
 * 409 conflito_versao: mostra o status atual, refaz as opções e mantém o diálogo aberto.
 */
export function DialogoAtualizarEtapa({ documento, eu, aberto, paraInicial, aoFechar, aoRegistrar, aoConflito }: Props) {
  const api = useApi();
  const [base, setBase] = useState(() => ({ status: documento.status, versao: documento.versao }));
  const acoes = useMemo(() => acoesDeStatus(eu, { status: base.status, areaId: documento.areaId }), [eu, base.status, documento.areaId]);
  const [para, setPara] = useState<StatusDocumento | ''>(() =>
    paraInicial && acoes.some((a) => a.para === paraInicial) ? paraInicial : '',
  );
  const [responsavelId, setResponsavelId] = useState('');
  const [escolheuResponsavel, setEscolheuResponsavel] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [erros, setErros] = useState<Erros>({});
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [conflito, setConflito] = useState(false);
  const [pessoas, setPessoas] = useState<EstadoPessoas>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const enviandoAgora = useRef(false);
  const resumo = useRef<HTMLDivElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  // Lista pequena: carrega uma vez ao abrir (e de novo em "Tentar de novo").
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setPessoas({ tipo: 'carregando' });
    api
      .responsaveis()
      .then((lista) => {
        if (ativo) setPessoas({ tipo: 'pronto', pessoas: lista });
      })
      .catch((e: unknown) => {
        if (ativo) setPessoas({ tipo: 'erro', mensagem: mensagemDeErro(e) });
      });
    return () => {
      ativo = false;
    };
  }, [api, aberto, tentativa]);

  const precisaResponsavel = para !== '' && exigeResponsavel(para);
  const grupos = useMemo(
    () =>
      pessoas.tipo === 'pronto' && para !== '' && precisaResponsavel
        ? agruparResponsaveis(para, documento, pessoas.pessoas, eu)
        : null,
    [pessoas, para, precisaResponsavel, documento, eu],
  );

  // Pré-seleciona a primeira pessoa sugerida enquanto a pessoa não escolheu outra (nunca envia sem ela ver).
  useEffect(() => {
    if (escolheuResponsavel) return;
    const primeira = grupos?.sugeridos[0] ?? null;
    setResponsavelId(primeira?.id ?? '');
  }, [grupos, escolheuResponsavel]);

  function validar(valores: { para: StatusDocumento | ''; responsavelId: string; observacao: string }): Erros {
    const encontrados: Erros = {};
    if (valores.para === '') encontrados.para = 'Escolha a etapa.';
    else if (exigeResponsavel(valores.para) && valores.responsavelId === '') {
      encontrados.responsavelId = 'Informe o responsável por esta etapa.';
    }
    const problema = validarObservacao(valores.observacao);
    if (problema) encontrados.observacao = problema;
    return encontrados;
  }

  function revalidar(mudanca: Partial<{ para: StatusDocumento | ''; responsavelId: string; observacao: string }>) {
    if (tentou) setErros(validar({ para, responsavelId, observacao, ...mudanca }));
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviandoAgora.current) return;
    setTentou(true);
    setErroGeral(null);
    const encontrados = validar({ para, responsavelId, observacao });
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0 || para === '') {
      requestAnimationFrame(() => resumo.current?.focus());
      return;
    }
    enviandoAgora.current = true;
    setEnviando(true);
    try {
      const texto = observacao.trim();
      const resultado = await api.mudarStatus(documento.id, {
        para,
        responsavelId: exigeResponsavel(para) ? responsavelId : null,
        observacao: texto === '' ? null : texto,
        versao: base.versao,
      });
      aoRegistrar(resultado);
    } catch (e) {
      tratarErro(e);
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  function tratarErro(erro: unknown) {
    if (erro instanceof ErroApi && erro.codigo === 'conflito_versao' && erro.documento) {
      const atual = erro.documento;
      setBase({ status: atual.status, versao: atual.versao });
      setConflito(true);
      aoConflito(atual);
      // As opções mudam com o status novo: a etapa escolhida pode não valer mais.
      const aindaVale = acoesDeStatus(eu, { status: atual.status, areaId: documento.areaId }).some((a) => a.para === para);
      if (!aindaVale) setPara('');
      requestAnimationFrame(() => aviso.current?.focus());
      return;
    }
    if (erro instanceof ErroApi && erro.codigo === 'dados_invalidos') {
      const doServidor: Erros = {};
      for (const campo of ORDEM) if (erro.campos[campo]) doServidor[campo] = erro.campos[campo];
      if (Object.keys(doServidor).length > 0) {
        setErros(doServidor);
        requestAnimationFrame(() => resumo.current?.focus());
        return;
      }
    }
    setErroGeral(mensagemDeErro(erro));
    requestAnimationFrame(() => aviso.current?.focus());
  }

  const listaErros = ORDEM.filter((c) => erros[c]);
  const tamanho = observacao.trim().length;

  return (
    <Dialogo
      aberto={aberto}
      titulo="Atualizar etapa"
      aoFechar={() => {
        if (!enviandoAgora.current) aoFechar();
      }}
      acoes={
        <>
          <Botao onClick={aoFechar} disabled={enviando}>
            Voltar
          </Botao>
          <Botao
            type="submit"
            form={ID_FORMULARIO}
            variante="primario"
            carregando={enviando}
            icone={<ArrowRightLeft size={16} aria-hidden="true" />}
          >
            {enviando ? 'Registrando…' : 'Registrar etapa'}
          </Botao>
        </>
      }
    >
      <form id={ID_FORMULARIO} className={estilos.formulario} noValidate onSubmit={enviar}>
        <div className={estilos.documento}>
          <p className={estilos.tituloDocumento}>{documento.titulo}</p>
          <p className={estilos.apoio}>
            De: <BadgeStatus status={base.status} />
          </p>
        </div>

        {conflito && (
          <div ref={aviso} className={estilos.aviso} role="alert" tabIndex={-1}>
            <p className={estilos.avisoTitulo}>Alguém alterou este documento: agora está em {base.status}.</p>
            <p>{acoes.length > 0 ? 'Confira a etapa e registre de novo.' : 'Não há etapa que você possa registrar agora.'}</p>
          </div>
        )}
        {erroGeral && (
          <div ref={conflito ? undefined : aviso} className={estilos.erro} role="alert" tabIndex={-1}>
            <p className={estilos.avisoTitulo}>Não foi possível registrar a etapa</p>
            <p>{erroGeral}</p>
          </div>
        )}

        {listaErros.length > 0 && (
          <div ref={resumo} className={estilos.resumoErros} role="alert" tabIndex={-1}>
            <p>{listaErros.length === 1 ? 'Corrija 1 campo:' : `Corrija ${listaErros.length} campos:`}</p>
            <ul>
              {listaErros.map((c) => (
                <li key={c}>
                  <a
                    href={`#${ID_CAMPO_ETAPA[c]}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(ID_CAMPO_ETAPA[c])?.focus();
                    }}
                  >
                    {NOME[c]}: {erros[c]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <CampoSelecao
          id={ID_CAMPO_ETAPA.para}
          rotulo="Etapa"
          obrigatorio
          value={para}
          erro={erros.para}
          onChange={(e) => {
            const valor = e.target.value as StatusDocumento | '';
            setPara(valor);
            revalidar({ para: valor });
          }}
        >
          <option value="">Escolha a etapa</option>
          {acoes.map((a) => (
            <option key={a.para} value={a.para}>
              {textoOpcaoEtapa(a.rotulo, a.para)}
            </option>
          ))}
        </CampoSelecao>

        {precisaResponsavel &&
          (pessoas.tipo === 'pronto' && grupos ? (
            <CampoSelecao
              id={ID_CAMPO_ETAPA.responsavelId}
              rotulo="Responsável"
              obrigatorio
              dica="Quem fica com o documento nesta etapa."
              value={responsavelId}
              erro={erros.responsavelId}
              onChange={(e) => {
                setResponsavelId(e.target.value);
                setEscolheuResponsavel(true);
                revalidar({ responsavelId: e.target.value });
              }}
            >
              <option value="">Escolha a pessoa</option>
              {grupos.sugeridos.length > 0 && grupos.outros.length > 0 ? (
                <>
                  <optgroup label="Sugeridos">
                    {grupos.sugeridos.map((p) => (
                      <OpcaoPessoa key={p.id} pessoa={p} />
                    ))}
                  </optgroup>
                  <optgroup label="Outras pessoas">
                    {grupos.outros.map((p) => (
                      <OpcaoPessoa key={p.id} pessoa={p} />
                    ))}
                  </optgroup>
                </>
              ) : (
                [...grupos.sugeridos, ...grupos.outros].map((p) => <OpcaoPessoa key={p.id} pessoa={p} />)
              )}
            </CampoSelecao>
          ) : pessoas.tipo === 'erro' ? (
            <div className={`${estilos.estadoCampo} ${estilos.comErro}`} role="alert">
              <span>Não foi possível carregar os responsáveis. {pessoas.mensagem}</span>
              <Botao compacto onClick={() => setTentativa((n) => n + 1)}>
                Tentar de novo
              </Botao>
            </div>
          ) : (
            <p className={estilos.estadoCampo} role="status">
              Carregando responsáveis…
            </p>
          ))}

        <CampoAreaTexto
          id={ID_CAMPO_ETAPA.observacao}
          rotulo="Observação"
          dica={`Opcional. ${tamanho}/${LIMITES_OBSERVACAO.maximo}`}
          value={observacao}
          erro={erros.observacao}
          onChange={(e) => {
            setObservacao(e.target.value);
            revalidar({ observacao: e.target.value });
          }}
        />
      </form>
    </Dialogo>
  );
}

/** Nome e, para ajudar a escolher, a área (ou o perfil, quando não há área). Sem e-mail (LGPD). */
function OpcaoPessoa({ pessoa }: { pessoa: PessoaResumo }) {
  const apoio = pessoa.area ?? pessoa.perfil;
  return <option value={pessoa.id}>{`${pessoa.nome} (${apoio})`}</option>;
}
