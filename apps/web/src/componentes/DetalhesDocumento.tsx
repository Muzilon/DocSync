import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CalendarPlus } from 'lucide-react';
import {
  contarDevolucoes,
  etiquetaPrazo,
  type DetalheDocumento,
  type Documento,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { useSessao } from '../autenticacao/Sessao.tsx';
import { formatarData, formatarDataHora, plural } from '../formatacao.ts';
import { podeBaixarArquivo, podeReprogramar } from '../permissoes.ts';
import { BadgeStatus } from './BadgeStatus.tsx';
import { Botao } from './Botao.tsx';
import { Dialogo } from './Dialogo.tsx';
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

interface Props {
  /** Documento aberto; null = fechado. */
  documentoId: string | null;
  aoFechar: () => void;
  /** Documento mudou aqui dentro (reprogramação ou 409 com o estado atual): o Painel atualiza o cartão. */
  aoAtualizarDocumento?: (documento: Documento) => void;
}

/**
 * Modal de detalhes do documento (contrato F4, 5.2; respostas do Eric na seção 9): Dados, Arquivos
 * (Baixar) e Linha do tempo única. Faz o próprio GET /documentos/:id, então
 * abre também cancelados e documentos escondidos pela busca. Única ação além de Fechar e dos
 * arquivos: Reprogramar (mesma regra do cartão). Nada editável aqui (F5/F6).
 */
export function DetalhesDocumento({ documentoId, aoFechar, aoAtualizarDocumento }: Props) {
  const api = useApi();
  const { eu } = useSessao();
  const aberto = documentoId !== null;
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [reprogramacao, setReprogramacao] = useState<{ chave: number; aberto: boolean } | null>(null);
  const chave = useRef(0);
  const idDados = useId();
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
      setReprogramacao(null);
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

  const detalhe = estado.tipo === 'pronto' ? estado.detalhe : null;
  const documento = detalhe?.documento ?? null;
  const mostraReprogramar = documento !== null && podeReprogramar(eu, documento);

  function atualizado(novo: Documento) {
    aoAtualizarDocumento?.(novo);
    setRecarga((n) => n + 1);
  }

  function abrirReprogramacao() {
    chave.current += 1;
    setAviso('');
    setReprogramacao({ chave: chave.current, aberto: true });
  }

  function fecharReprogramacao() {
    setReprogramacao((atual) => (atual ? { ...atual, aberto: false } : atual));
  }

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
          <>
            {mostraReprogramar && (
              <Botao icone={<CalendarPlus size={16} aria-hidden="true" />} onClick={abrirReprogramacao}>
                Reprogramar
              </Botao>
            )}
            <Botao onClick={aoFechar}>Fechar</Botao>
          </>
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
                <h3 id={idDados} className={estilos.tituloSecao}>
                  Dados
                </h3>
                <Dados documento={estado.detalhe.documento} />
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


      {reprogramacao && detalhe && (
        <DialogoReprogramar
          key={reprogramacao.chave}
          cartao={detalhe.documento}
          aberto={reprogramacao.aberto}
          hoje={detalhe.hoje}
          aoFechar={fecharReprogramacao}
          aoReprogramar={(novo) => {
            fecharReprogramacao();
            setAviso(`Prazo reprogramado para ${formatarData(novo.dataRevisao)}.`);
            atualizado(novo);
          }}
          aoConflito={atualizado}
        />
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
      <Par rotulo="Cadastrado em">{formatarDataHora(documento.criadoEm)}</Par>
      <Par rotulo="Última modificação">{formatarDataHora(documento.dataModificacao)}</Par>
      {documento.idDocumentoOrigem && (
        <Par rotulo="Revisão de" largo>
          Revisa o documento {documento.idDocumentoOrigem}
        </Par>
      )}
      <Par rotulo="Observações complementares" largo>
        <span className={estilos.textoLivre}>{documento.observacao?.trim() || '—'}</span>
      </Par>
    </dl>
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
