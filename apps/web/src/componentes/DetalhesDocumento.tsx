import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Ban, CalendarPlus, Pencil, RotateCcw } from 'lucide-react';
import {
  avaliarMetas,
  contarDevolucoes,
  dataAprovacao,
  dataInicioRevisao,
  etiquetaPrazo,
  statusDeReativacao,
  type DetalheDocumento,
  type Documento,
  type EstadoMeta,
  type ResultadoTransicao,
  type SituacaoMeta,
  type StatusDocumento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { useSessao } from '../autenticacao/Sessao.tsx';
import { formatarData, formatarDataHora, plural } from '../formatacao.ts';
import { acoesDeStatusPara, podeBaixarArquivo, podeCancelar, podeEditar, podeReativar, podeReprogramar } from '../permissoes.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { Botao } from './Botao.tsx';
import { Dialogo } from './Dialogo.tsx';
import { DialogoAtualizarEtapa } from './DialogoAtualizarEtapa.tsx';
import { DialogoCancelar } from './DialogoCancelar.tsx';
import { DialogoConfirmar } from './DialogoConfirmar.tsx';
import { DialogoEditarDados } from './DialogoEditarDados.tsx';
import { DialogoReprogramar } from './DialogoReprogramar.tsx';
import { ErroCarregamento } from './Estados.tsx';
import { EtiquetaPrazo, EtiquetaReprogramado } from './EtiquetaPrazo.tsx';
import { LinhaDoTempo } from './LinhaDoTempo.tsx';
import { ListaArquivos } from './ListaArquivos.tsx';
import estilos from './DetalhesDocumento.module.css';

/** ID de documento aceito na URL (`?documento=`): o resto nem chega à API (vira "não encontrado"). */
export function ehIdDocumento(valor: string | null): valor is string {
  return valor !== null && /^DOC-[A-Za-z0-9-]{1,64}$/.test(valor);
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string; semRepeticao: boolean }
  | { tipo: 'pronto'; detalhe: DetalheDocumento };

/** Texto do estado da meta (a cor nunca vai sozinha). */
const ROTULO_ESTADO_META: Record<EstadoMeta, string> = {
  cumprida: 'Cumprida',
  estourada: 'Estourada',
  no_prazo: 'No prazo',
  nao_se_aplica: 'Não se aplica',
};

/** Diálogo empilhado sobre os detalhes (um por vez); `chave` muda a cada abertura para começar limpo. */
type Empilhado =
  | { tipo: 'reprogramar'; chave: number; aberto: boolean }
  | { tipo: 'etapa'; chave: number; aberto: boolean }
  | { tipo: 'cancelar'; chave: number; aberto: boolean }
  | { tipo: 'editar'; chave: number; aberto: boolean }
  | { tipo: 'reativar'; chave: number; aberto: boolean; volta: StatusDocumento };

interface Props {
  /** Documento aberto; null = fechado. */
  documentoId: string | null;
  aoFechar: () => void;
  /** Documento mudou aqui dentro (reprogramação ou 409 com o estado atual): o Painel atualiza o cartão. */
  aoAtualizarDocumento?: (documento: Documento) => void;
  /** Etapa registrada (transição): o Painel move o cartão de coluna. */
  aoMudarStatus?: (resultado: ResultadoTransicao) => void;
  /** Documento cancelado: o Painel fecha os detalhes, tira o cartão do quadro e oferece "Desfazer". */
  aoCancelar?: (resultado: ResultadoTransicao) => void;
  /** Documento reativado: o Painel devolve o cartão ao quadro. */
  aoReativar?: (resultado: ResultadoTransicao) => void;
}

/**
 * Modal de detalhes do documento (contrato F4, 5.2; contrato F5, 6.2): Dados, Metas do ciclo,
 * Arquivos (Baixar) e Linha do tempo única. Faz o próprio GET /documentos/:id, então abre também
 * cancelados e documentos escondidos pela busca. É o ÚNICO lugar das ações (decisão 0015). Rodapé
 * enxuto (atualização de 2026-09-29): "Atualizar etapa…" (todas as etapas), "Cancelar documento"
 * ou "Reativar" e "Reprogramar"; sem "Fechar" (o ✕ fecha). "Editar" fica no título da seção Dados.
 * Cada botão só aparece quando a regra permite (a API decide de verdade); sem nenhum, sem rodapé.
 */
export function DetalhesDocumento({ documentoId, aoFechar, aoAtualizarDocumento, aoMudarStatus, aoCancelar, aoReativar }: Props) {
  const api = useApi();
  const { eu } = useSessao();
  const aberto = documentoId !== null;
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [empilhado, setEmpilhado] = useState<Empilhado | null>(null);
  const chave = useRef(0);
  const idDados = useId();
  const idMetas = useId();
  const idArquivos = useId();
  const idLinha = useId();

  // Mudança só de `recarga` = atualização silenciosa (depois de reprogramar): mantém o conteúdo na tela.
  const [recarga, setRecarga] = useState(0);
  const ultimaRecarga = useRef(0);

  useEffect(() => {
    if (documentoId === null) {
      setEstado({ tipo: 'carregando' });
      setErroArquivo(null);
      setAviso('');
      setEmpilhado(null);
      return;
    }
    let ativo = true;
    const silenciosa = recarga !== ultimaRecarga.current;
    ultimaRecarga.current = recarga;
    if (!silenciosa) setEstado({ tipo: 'carregando' });
    if (!ehIdDocumento(documentoId)) {
      setEstado({ tipo: 'erro', mensagem: mensagemDeErro(new ErroApi(404, 'nao_encontrado')), semRepeticao: true });
      return;
    }
    api
      .documento(documentoId)
      .then((detalhe) => {
        if (ativo) setEstado({ tipo: 'pronto', detalhe });
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        const definitivo = erro instanceof ErroApi && (erro.codigo === 'nao_encontrado' || erro.codigo === 'sem_permissao');
        setEstado({ tipo: 'erro', mensagem: mensagemDeErro(erro), semRepeticao: definitivo });
      });
    return () => {
      ativo = false;
    };
  }, [api, documentoId, tentativa, recarga]);

  // Depois de uma ação, o botão que abriu o diálogo pode sumir (ex.: Reprogramar com o prazo novo,
  // "Atualizar etapa…" depois de aprovar, "Reativar" depois de reativar). Foco perdido volta ao ✕,
  // o primeiro controle do modal.
  useEffect(() => {
    if (estado.tipo !== 'pronto') return;
    const quadro = requestAnimationFrame(() => {
      const ativo = document.activeElement;
      if (ativo && ativo !== document.body && ativo.isConnected) return;
      const abertos = Array.from(document.querySelectorAll<HTMLButtonElement>('dialog[open] button[aria-label="Fechar detalhes"]'));
      abertos[abertos.length - 1]?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  }, [estado]);

  const detalhe = estado.tipo === 'pronto' ? estado.detalhe : null;
  const documento = detalhe?.documento ?? null;
  const mostraReprogramar = detalhe !== null && podeReprogramar(eu, detalhe.documento, detalhe.hoje);
  const acoes = documento ? acoesDeStatusPara(eu, documento) : [];
  const mostraCancelar = documento !== null && podeCancelar(eu, documento);
  const mostraReativar = documento !== null && podeReativar(eu, documento);
  const mostraEditar = documento !== null && podeEditar(eu, documento);

  function atualizado(novo: Documento) {
    aoAtualizarDocumento?.(novo);
    setRecarga((n) => n + 1);
  }

  function abrir(novo: Empilhado['tipo'], extra: { volta?: StatusDocumento } = {}) {
    chave.current += 1;
    setAviso('');
    const base = { chave: chave.current, aberto: true };
    if (novo === 'reativar') setEmpilhado({ ...base, tipo: 'reativar', volta: extra.volta ?? 'Recebido' });
    else setEmpilhado({ ...base, tipo: novo });
  }

  function fecharEmpilhado() {
    setEmpilhado((atual) => (atual ? { ...atual, aberto: false } : atual));
  }

  function etapaRegistrada(resultado: ResultadoTransicao) {
    fecharEmpilhado();
    setAviso(`Etapa registrada: ${resultado.documento.status}.`);
    aoAtualizarDocumento?.(resultado.documento);
    aoMudarStatus?.(resultado);
    setRecarga((n) => n + 1);
  }

  /** 409 conflito_versao nas confirmações: atualiza tudo e diz em que status o documento está agora. */
  function textoDoErro(erro: unknown): string {
    if (erro instanceof ErroApi && erro.codigo === 'conflito_versao' && erro.documento) {
      atualizado(erro.documento);
      return `Alguém alterou este documento: agora está em ${erro.documento.status}. Volte e confira antes de repetir.`;
    }
    return mensagemDeErro(erro);
  }

  const temAcoes = acoes.length > 0 || mostraCancelar || mostraReativar || mostraReprogramar;

  let titulo = 'Detalhes do documento';
  if (documento) titulo = documento.titulo;
  else if (estado.tipo === 'erro' && estado.semRepeticao) titulo = 'Documento não encontrado';

  return (
    <>
      <Dialogo
        aberto={aberto}
        tamanho="detalhes"
        titulo={titulo}
        botaoFechar="Fechar detalhes"
        cabecalho={detalhe ? <Cabecalho detalhe={detalhe} /> : null}
        classeConteudo={detalhe ? estilos.conteudo : undefined}
        aoFechar={aoFechar}
        acoes={
          temAcoes ? (
            <div className={estilos.rodape}>
              {acoes.length > 0 && (
                <Botao icone={<ArrowRightLeft size={16} aria-hidden="true" />} onClick={() => abrir('etapa')}>
                  Atualizar etapa…
                </Botao>
              )}
              {mostraCancelar && (
                <Botao variante="perigo" icone={<Ban size={16} aria-hidden="true" />} onClick={() => abrir('cancelar')}>
                  Cancelar documento
                </Botao>
              )}
              {mostraReativar && detalhe && (
                <Botao
                  variante="primario"
                  icone={<RotateCcw size={16} aria-hidden="true" />}
                  onClick={() => abrir('reativar', { volta: statusDeReativacao(detalhe.eventos) })}
                >
                  Reativar
                </Botao>
              )}
              {mostraReprogramar && (
                <Botao icone={<CalendarPlus size={16} aria-hidden="true" />} onClick={() => abrir('reprogramar')}>
                  Reprogramar
                </Botao>
              )}
            </div>
          ) : null
        }
      >
        {estado.tipo === 'carregando' ? (
          <Esqueleto />
        ) : estado.tipo === 'erro' ? (
          estado.semRepeticao ? (
            <div className={estilos.naoEncontrado} role="alert">
              <p>{estado.mensagem}</p>
            </div>
          ) : (
            <ErroCarregamento mensagem={estado.mensagem} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
          )
        ) : (
          <div className={estilos.colunas}>
            <div className={estilos.esquerda}>
              <section className={estilos.secao} aria-labelledby={idDados}>
                <div className={estilos.linhaTituloSecao}>
                  <h3 id={idDados} className={estilos.tituloSecao}>
                    Dados
                  </h3>
                  {mostraEditar && (
                    <button type="button" className={estilos.botaoEditar} aria-label="Editar dados" onClick={() => abrir('editar')}>
                      <Pencil size={14} aria-hidden="true" />
                      Editar
                    </button>
                  )}
                </div>
                <Dados documento={estado.detalhe.documento} />
              </section>
              <section className={estilos.secao} aria-labelledby={idMetas}>
                <h3 id={idMetas} className={estilos.tituloSecao}>
                  Metas do ciclo
                </h3>
                <MetasDoCiclo detalhe={estado.detalhe} />
              </section>
              <section className={estilos.secao} aria-labelledby={idArquivos}>
                <h3 id={idArquivos} className={estilos.tituloSecao}>
                  Arquivos
                </h3>
                {erroArquivo && (
                  <p className={estilos.erroArquivo} role="alert">
                    {erroArquivo}
                  </p>
                )}
                <ListaArquivos
                  documentoId={estado.detalhe.documento.id}
                  arquivos={estado.detalhe.arquivos}
                  podeBaixar={podeBaixarArquivo(eu, estado.detalhe.documento)}
                  aoBaixar={() => setErroArquivo(null)}
                  aoErro={setErroArquivo}
                />
              </section>
            </div>
            <section className={`${estilos.secao} ${estilos.direita}`} aria-labelledby={idLinha}>
              <h3 id={idLinha} className={estilos.tituloSecao}>
                Linha do tempo
              </h3>
              <LinhaDoTempo eventos={estado.detalhe.eventos} />
            </section>
          </div>
        )}
        {/* Avisos de dentro do modal: o toast da página fica atrás do fundo inerte. */}
        <p className="visualmente-oculto" role="status" aria-live="polite">
          {aviso}
        </p>
      </Dialogo>


      {empilhado?.tipo === 'reprogramar' && detalhe && (
        <DialogoReprogramar
          key={empilhado.chave}
          cartao={detalhe.documento}
          aberto={empilhado.aberto}
          hoje={detalhe.hoje}
          aoFechar={fecharEmpilhado}
          aoReprogramar={(novo) => {
            fecharEmpilhado();
            setAviso(`Prazo reprogramado para ${formatarData(novo.dataRevisao)}.`);
            atualizado(novo);
          }}
          aoConflito={atualizado}
        />
      )}

      {empilhado?.tipo === 'etapa' && detalhe && (
        <DialogoAtualizarEtapa
          key={empilhado.chave}
          documento={detalhe.documento}
          eu={eu}
          aberto={empilhado.aberto}
          aoFechar={fecharEmpilhado}
          aoRegistrar={etapaRegistrada}
          aoConflito={atualizado}
        />
      )}

      {empilhado?.tipo === 'editar' && detalhe && (
        <DialogoEditarDados
          key={empilhado.chave}
          documento={detalhe.documento}
          eu={eu}
          aberto={empilhado.aberto}
          aoFechar={fecharEmpilhado}
          aoConflito={atualizado}
          aoSalvar={(resultado, rotulos) => {
            fecharEmpilhado();
            // Contrato F6, 5.3: aviso dentro do modal; o Painel troca o cartão; a linha do tempo ganha o EDICAO.
            setAviso(rotulos.length > 0 ? `Dados atualizados: ${rotulos.join(', ')}.` : 'Nenhuma alteração para salvar.');
            atualizado(resultado.documento);
          }}
        />
      )}

      {empilhado?.tipo === 'cancelar' && detalhe && (
        <DialogoCancelar
          key={empilhado.chave}
          documento={detalhe.documento}
          aberto={empilhado.aberto}
          aoFechar={fecharEmpilhado}
          aoConflito={atualizado}
          aoCancelar={(resultado) => {
            fecharEmpilhado();
            aoAtualizarDocumento?.(resultado.documento);
            // O Painel fecha os detalhes (o documento sai do quadro) e mostra o toast com "Desfazer".
            if (aoCancelar) aoCancelar(resultado);
            else {
              setAviso('Documento cancelado.');
              setRecarga((n) => n + 1);
            }
          }}
        />
      )}

      {empilhado?.tipo === 'reativar' && detalhe && (
        <DialogoConfirmar
          key={empilhado.chave}
          aberto={empilhado.aberto}
          titulo="Reativar documento"
          rotuloConfirmar="Reativar"
          rotuloEnviando="Reativando…"
          icone={<RotateCcw size={16} aria-hidden="true" />}
          aoFechar={fecharEmpilhado}
          textoDoErro={textoDoErro}
          aoConfirmar={async () => {
            const { documento: atual } = detalhe;
            // Mesma rota do "Desfazer" do toast (P-17): um só caminho, um só resultado.
            const resultado = await api.reativarDocumento(atual.id, { observacao: null, versao: atual.versao });
            fecharEmpilhado();
            setAviso(`Documento reativado: ${resultado.documento.status}.`);
            aoAtualizarDocumento?.(resultado.documento);
            aoReativar?.(resultado);
            setRecarga((n) => n + 1);
          }}
        >
          <p>
            Reativar <strong>{detalhe.documento.titulo}</strong>?
          </p>
          <p>
            Ele volta para <strong>{empilhado.volta}</strong>.
          </p>
        </DialogoConfirmar>
      )}
    </>
  );
}

/** Linha abaixo do título: código, revisão, status, etiquetas de prazo e devoluções, e o ID (suporte). */
function Cabecalho({ detalhe }: { detalhe: DetalheDocumento }) {
  const { documento, eventos, hoje } = detalhe;
  const etiqueta = etiquetaPrazo(documento, hoje);
  const devolucoes = contarDevolucoes(eventos);
  return (
    <div className={estilos.cabecalho}>
      <div className={estilos.linhaCabecalho}>
        <span className={documento.codigo ? estilos.codigo : estilos.semCodigo}>{documento.codigo ?? 'S/ código'}</span>
        <span className={estilos.revisao}>Rev. {documento.revisao}</span>
        <BadgeStatus status={documento.status} />
        {etiqueta && <EtiquetaPrazo etiqueta={etiqueta} />}
        {documento.reprogramado && <EtiquetaReprogramado vezes={documento.qtdReprogramacoes} />}
        {devolucoes > 0 && (
          <span className={estilos.devolucoes}>Devolvido {plural(devolucoes, 'vez', 'vezes')}</span>
        )}
      </div>
      <p className={estilos.id}>
        <span className="visualmente-oculto">Identificador: </span>
        {documento.id}
      </p>
    </div>
  );
}

function Par({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? `${estilos.par} ${estilos.largo}` : estilos.par}>
      <dt className={estilos.rotulo}>{rotulo}</dt>
      <dd className={estilos.valor}>{children}</dd>
    </div>
  );
}

/** Bloco Dados (contrato F4, 2.3). Nulo vira "—"; nada editável; texto sempre como texto. */
function Dados({ documento }: { documento: Documento }) {
  return (
    <dl className={estilos.dados}>
      <Par rotulo="Título do documento" largo>
        {documento.titulo}
      </Par>
      <Par rotulo="Tipo de documento">{documento.tipoDocumento}</Par>
      <Par rotulo="Área / Setor">{documento.area}</Par>
      <Par rotulo="Disciplina">{documento.disciplina ?? '—'}</Par>
      <Par rotulo="Remetente / Solicitante">{documento.remetente}</Par>
      <Par rotulo="Data de recebimento">{formatarData(documento.dataRecebimento)}</Par>
      <Par rotulo="Prazo (data de revisão)">{formatarData(documento.dataRevisao)}</Par>
      <Par rotulo="Responsável atual">{documento.responsavel?.trim() || '—'}</Par>
      <Par rotulo="Cadastrado em">{formatarDataHora(documento.criadoEm)}</Par>
      <Par rotulo="Última modificação">{formatarDataHora(documento.dataModificacao)}</Par>
      {/* "Revisa o documento" (idDocumentoOrigem) fica escondido até a F8 (revisões), por pedido do Eric
          (contrato F4, 11.2): não renderiza nem com valor. */}
      <Par rotulo="Observações complementares" largo>
        <span className={estilos.textoLivre}>{documento.observacao?.trim() || '—'}</span>
      </Par>
    </dl>
  );
}

/**
 * Metas do ciclo (decisão 0012; contrato F5, 5.4 e 6.6): início da revisão (14 dias) e conclusão
 * (40 dias), contadas do recebimento. Datas dos marcos saem dos eventos pelas mesmas funções puras
 * da API; o texto vem pronto de `avaliarMetas`. Estado escrito por extenso: a cor nunca vai sozinha.
 */
function MetasDoCiclo({ detalhe }: { detalhe: DetalheDocumento }) {
  const { documento, eventos, hoje } = detalhe;
  const metas = avaliarMetas(
    { ...documento, dataInicioRevisao: dataInicioRevisao(eventos), dataAprovacao: dataAprovacao(eventos) },
    hoje,
  );
  return (
    <dl className={estilos.metas}>
      <LinhaMeta rotulo="Início da revisão" meta={metas.inicioRevisao} />
      <LinhaMeta rotulo="Conclusão" meta={metas.conclusao} />
    </dl>
  );
}

function LinhaMeta({ rotulo, meta }: { rotulo: string; meta: SituacaoMeta }) {
  return (
    <div className={estilos.meta}>
      <dt className={estilos.rotulo}>
        {rotulo}
        {meta.estado === 'nao_se_aplica' && <span className={estilos.limiteMeta}> (meta: {plural(meta.limite, 'dia', 'dias')})</span>}
      </dt>
      <dd className={estilos.valorMeta} data-tom={meta.tom}>
        <span className={`${estilos.estadoMeta} ${estilos[meta.tom] ?? ''}`}>{ROTULO_ESTADO_META[meta.estado]}</span>
        {meta.estado !== 'nao_se_aplica' && <span>{meta.texto}</span>}
      </dd>
    </div>
  );
}

/** Carregando: esqueleto das três seções, sem número nem data falsa. */
function Esqueleto() {
  return (
    <div className={estilos.colunas} aria-busy="true">
      <p className="visualmente-oculto" role="status">
        Carregando detalhes…
      </p>
      <div className={estilos.esquerda} aria-hidden="true">
        <div className={estilos.secao}>
          <span className={estilos.tituloSecao}>Dados</span>
          <span className={estilos.blocoEsqueleto} />
        </div>
        <div className={estilos.secao}>
          <span className={estilos.tituloSecao}>Arquivos</span>
          <span className={`${estilos.blocoEsqueleto} ${estilos.baixo}`} />
        </div>
      </div>
      <div className={`${estilos.secao} ${estilos.direita}`} aria-hidden="true">
        <span className={estilos.tituloSecao}>Linha do tempo</span>
        <span className={estilos.blocoEsqueleto} />
      </div>
    </div>
  );
}
