import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Archive, FilePlus2, FilterX } from 'lucide-react';
import {
  FASES,
  FASE_DO_STATUS,
  ROTULO_FASE,
  calcularKpis,
  filtrarCartoes,
  ordenarAlfabetico,
  type Area,
  type CartaoPainel,
  type Documento,
  type Fase,
  type RespostaPainel,
} from '@docsync/compartilhado';
import { useApi } from '../api/cliente.ts';
import { mensagemDeErro } from '../api/erros.ts';
import { useSessao } from '../autenticacao/Sessao.tsx';
import { Botao } from '../componentes/Botao.tsx';
import { CampoSelecao, CampoTexto } from '../componentes/Campo.tsx';
import { CartaoDocumento } from '../componentes/CartaoDocumento.tsx';
import { ColunaKanban } from '../componentes/ColunaKanban.tsx';
import { DialogoReprogramar } from '../componentes/DialogoReprogramar.tsx';
import { ErroCarregamento } from '../componentes/Estados.tsx';
import { JanelaCancelados } from '../componentes/JanelaCancelados.tsx';
import { useToast } from '../componentes/Toast.tsx';
import { formatarData, plural } from '../formatacao.ts';
import { podeCadastrarDocumento, podeReprogramar } from '../permissoes.ts';
import estiloBotao from '../componentes/Botao.module.css';
import pagina from './Pagina.module.css';
import estilos from './TelaPainel.module.css';

/** Colunas do quadro, na ordem das fases. Cancelados nunca aparecem no quadro (janela própria). */
export const FASES_DO_QUADRO: Fase[] = FASES.filter((f) => f !== 'cancelado');

/** Espera antes de pedir ao servidor a contagem de cancelados com a busca e a área novas. */
const ESPERA_CONTAGEM_MS = 400;

/**
 * Cartão atualizado com o documento devolvido pela API (reprogramação ou 409 com o estado atual),
 * sem recarregar o painel. Contagens vindas de eventos (devoluções, aprovação) ficam como estavam.
 */
export function mesclarDocumento(cartao: CartaoPainel, documento: Documento): CartaoPainel {
  return {
    ...cartao,
    codigo: documento.codigo,
    titulo: documento.titulo,
    revisao: documento.revisao,
    status: documento.status,
    fase: FASE_DO_STATUS[documento.status],
    tipoDocumento: documento.tipoDocumento,
    areaId: documento.areaId,
    area: documento.area,
    remetente: documento.remetente,
    dataRecebimento: documento.dataRecebimento,
    dataRevisao: documento.dataRevisao,
    reprogramado: documento.reprogramado,
    qtdReprogramacoes: documento.qtdReprogramacoes,
    versao: documento.versao,
    dataModificacao: documento.dataModificacao,
  };
}

/** Comparação por unidade de código (como o `ORDER BY d.id` do servidor, sem colação local). */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Mesma ordem do `GET /painel` (contrato F3, seção 4): prazo crescente com nulos no fim,
 * depois `criadoEm` crescente, depois `id`. Usada depois de reprogramar, sem recarregar (B6).
 */
export function ordenarCartoesPainel(cartoes: readonly CartaoPainel[]): CartaoPainel[] {
  return [...cartoes].sort((a, b) => {
    if (a.dataRevisao !== b.dataRevisao) {
      if (a.dataRevisao === null) return 1;
      if (b.dataRevisao === null) return -1;
      return compararTexto(a.dataRevisao, b.dataRevisao);
    }
    const criado = Date.parse(a.criadoEm) - Date.parse(b.criadoEm);
    if (criado !== 0 && !Number.isNaN(criado)) return criado;
    return compararTexto(a.id, b.id);
  });
}

/** Setas ↑ ↓ entre cartões da coluna e ← → entre colunas (desejável; Tab sozinho alcança tudo). */
function navegarPorSetas(evento: KeyboardEvent<HTMLElement>) {
  if (evento.target !== evento.currentTarget) return; // teclas vindas do botão Reprogramar
  const atual = evento.currentTarget;
  const coluna = atual.closest('[data-fase]');
  const quadro = coluna?.parentElement;
  if (!coluna || !quadro) return;
  const cartoesDe = (c: Element) => Array.from(c.querySelectorAll<HTMLElement>('[data-cartao-id]'));
  let destino: HTMLElement | undefined;
  if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
    const lista = cartoesDe(coluna);
    const i = lista.indexOf(atual);
    destino = lista[evento.key === 'ArrowDown' ? i + 1 : i - 1];
  } else if (evento.key === 'ArrowRight' || evento.key === 'ArrowLeft') {
    const colunas = Array.from(quadro.querySelectorAll(':scope > [data-fase]'));
    const passo = evento.key === 'ArrowRight' ? 1 : -1;
    for (let i = colunas.indexOf(coluna) + passo; i >= 0 && i < colunas.length && !destino; i += passo) {
      destino = cartoesDe(colunas[i]!)[0];
    }
  }
  if (destino) {
    evento.preventDefault();
    destino.focus();
    destino.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}

interface EstadoReprogramacao {
  cartao: CartaoPainel;
  /** Muda a cada abertura, para o diálogo começar limpo. */
  chave: number;
  aberto: boolean;
}

/** Tela Painel (F3): KPIs, filtros e quadro Kanban de 5 fases, com reprogramação de prazo. */
export function TelaPainel() {
  const api = useApi();
  const { eu } = useSessao();
  const toast = useToast();

  const [dados, setDados] = useState<RespostaPainel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);

  const [busca, setBusca] = useState('');
  const [areaId, setAreaId] = useState('');
  /** Contagem do botão Cancelados com a busca e a área em vigor; null = indisponível. */
  const [qtdCancelados, setQtdCancelados] = useState<number | null>(null);
  const [cancelados, setCancelados] = useState(false);
  const [reprogramacao, setReprogramacao] = useState<EstadoReprogramacao | null>(null);
  const chaveReprogramacao = useRef(0);

  useEffect(() => {
    let ativo = true;
    setErro(null);
    setDados(null);
    api
      .painel()
      .then((resposta) => {
        if (!ativo) return;
        setDados(resposta);
        setQtdCancelados(resposta.qtdCancelados);
      })
      .catch((e: unknown) => {
        if (ativo) setErro(mensagemDeErro(e));
      });
    return () => {
      ativo = false;
    };
  }, [api, tentativa]);

  // Filtro de área: todas as áreas ativas, em ordem alfabética pt-BR (decisão 0006; contrato, resposta 5).
  useEffect(() => {
    let ativo = true;
    api
      .areas()
      .then((lista) => {
        if (ativo) setAreas(ordenarAlfabetico(lista.filter((a) => a.ativa), (a) => a.nome));
      })
      .catch(() => {
        // Sem a lista, o filtro fica só com "Todas as áreas"; o quadro continua funcionando.
        if (ativo) setAreas([]);
      });
    return () => {
      ativo = false;
    };
  }, [api]);

  const filtro = useMemo(() => ({ busca, areaId: areaId || null }), [busca, areaId]);
  const filtrando = busca.trim() !== '' || areaId !== '';

  // "Cancelados (N)" respeita busca e área: a contagem vem do servidor (os cancelados não são carregados no quadro).
  useEffect(() => {
    if (!dados) return;
    if (!filtrando) {
      setQtdCancelados(dados.qtdCancelados);
      return;
    }
    let ativo = true;
    const temporizador = window.setTimeout(() => {
      api
        .painel({ busca, areaId: areaId || null })
        .then((resposta) => {
          if (ativo) setQtdCancelados(resposta.qtdCancelados);
        })
        .catch(() => {
          if (ativo) setQtdCancelados(null);
        });
    }, ESPERA_CONTAGEM_MS);
    return () => {
      ativo = false;
      window.clearTimeout(temporizador);
    };
  }, [api, dados, busca, areaId, filtrando]);

  const ativos = useMemo(() => (dados ? dados.cartoes.filter((c) => c.fase !== 'cancelado') : []), [dados]);
  const visiveis = useMemo(() => filtrarCartoes(ativos, filtro), [ativos, filtro]);
  const kpis = useMemo(() => (dados ? calcularKpis(visiveis, dados.hoje) : null), [dados, visiveis]);
  const porFase = useMemo(() => {
    const mapa = new Map<Fase, CartaoPainel[]>(FASES_DO_QUADRO.map((f) => [f, []]));
    // A ordem do servidor (prazo, cadastro, id) é mantida dentro de cada coluna.
    for (const c of visiveis) mapa.get(c.fase)?.push(c);
    return mapa;
  }, [visiveis]);

  const substituirCartao = useCallback((documento: Documento) => {
    setDados((atual) =>
      atual
        ? {
            ...atual,
            cartoes: ordenarCartoesPainel(
              atual.cartoes.map((c) => (c.id === documento.id ? mesclarDocumento(c, documento) : c)),
            ),
          }
        : atual,
    );
  }, []);

  function abrirReprogramacao(cartao: CartaoPainel) {
    chaveReprogramacao.current += 1;
    setReprogramacao({ cartao, chave: chaveReprogramacao.current, aberto: true });
  }

  function fecharReprogramacao() {
    setReprogramacao((atual) => (atual ? { ...atual, aberto: false } : atual));
  }

  function limparFiltros() {
    setBusca('');
    setAreaId('');
  }

  const podeCadastrar = podeCadastrarDocumento(eu);

  return (
    <>
      <header className={pagina.cabecalho}>
        <div className={pagina.cabecalhoTexto}>
          <h1 className={pagina.titulo}>Painel</h1>
          <p className={pagina.subtitulo}>Acompanhe a tramitação dos documentos por fase.</p>
        </div>
        {podeCadastrar && (
          <Link to="/documentos/novo" className={`${estiloBotao.botao} ${estiloBotao.primario}`}>
            <FilePlus2 size={16} aria-hidden="true" />
            Novo documento
          </Link>
        )}
      </header>

      <section className={estilos.kpis} aria-label="Indicadores">
        <Kpi rotulo="Em tramitação" apoio="Documentos não concluídos" valor={kpis?.emTramitacao} />
        <Kpi rotulo="Vencendo em até 5 dias" apoio="Prazo entre hoje e daqui a 5 dias" valor={kpis?.vencendo} tom="alerta" />
        <Kpi rotulo="Atrasados" apoio="Passaram do prazo" valor={kpis?.atrasados} tom="erro" />
      </section>

      <div className={estilos.filtros} role="search" aria-label="Filtrar documentos">
        <div className={estilos.busca}>
          <CampoTexto
            id="painel-busca"
            type="search"
            rotulo="Buscar por título, código ou remetente"
            autoComplete="off"
            maxLength={200}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {/* Provisório: o Solicitante só vê a própria área, então não há o que escolher (até existir
            um painel próprio para quem só acompanha). Demais perfis escolhem entre as áreas ativas. */}
        {eu.perfil === 'Solicitante' ? (
          <p className={estilos.areaFixa}>
            <span className={estilos.areaFixaRotulo}>Área:</span> {eu.area ?? '—'}
          </p>
        ) : (
          <div className={estilos.area}>
            <CampoSelecao id="painel-area" rotulo="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Todas as áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </CampoSelecao>
          </div>
        )}
        <Botao
          className={estilos.botaoCancelados}
          icone={<Archive size={16} aria-hidden="true" />}
          onClick={() => setCancelados(true)}
          disabled={dados === null}
        >
          {qtdCancelados === null ? 'Cancelados' : `Cancelados (${qtdCancelados})`}
        </Botao>
        <p className={estilos.encontrados} aria-live="polite">
          {dados ? `${plural(visiveis.length, 'documento encontrado', 'documentos encontrados')}` : ''}
        </p>
      </div>

      {erro ? (
        <ErroCarregamento mensagem={erro} aoTentarNovamente={() => setTentativa((n) => n + 1)} />
      ) : dados === null ? (
        <EsqueletoQuadro />
      ) : ativos.length === 0 ? (
        <div className={estilos.vazio}>
          {/* Com cancelados (acessíveis pelo botão Cancelados), a base não está vazia (B5). */}
          <p className={estilos.vazioTitulo}>
            {dados.qtdCancelados > 0 ? 'Nenhum documento em tramitação' : 'Nenhum documento cadastrado ainda'}
          </p>
          {podeCadastrar && (
            <Link to="/documentos/novo" className={`${estiloBotao.botao} ${estiloBotao.primario}`}>
              <FilePlus2 size={16} aria-hidden="true" />
              Novo documento
            </Link>
          )}
        </div>
      ) : visiveis.length === 0 ? (
        <div className={estilos.vazio}>
          <p className={estilos.vazioTitulo}>Nenhum documento corresponde à busca</p>
          <Botao onClick={limparFiltros} icone={<FilterX size={16} aria-hidden="true" />}>
            Limpar filtros
          </Botao>
        </div>
      ) : (
        <section className={estilos.quadro} aria-label="Quadro de tramitação">
          {FASES_DO_QUADRO.map((fase) => {
            const lista = porFase.get(fase) ?? [];
            return (
              <ColunaKanban key={fase} fase={fase} quantidade={lista.length}>
                {lista.map((c) => (
                  <CartaoDocumento
                    key={c.id}
                    cartao={c}
                    hoje={dados.hoje}
                    podeReprogramar={podeReprogramar(eu, c)}
                    aoReprogramar={abrirReprogramacao}
                    aoTeclaNavegacao={navegarPorSetas}
                  />
                ))}
              </ColunaKanban>
            );
          })}
        </section>
      )}

      <JanelaCancelados
        aberto={cancelados}
        filtro={filtro}
        quantidadeInicial={qtdCancelados}
        aoFechar={() => setCancelados(false)}
      />

      {reprogramacao && dados && (
        <DialogoReprogramar
          key={reprogramacao.chave}
          cartao={reprogramacao.cartao}
          aberto={reprogramacao.aberto}
          hoje={dados.hoje}
          aoFechar={fecharReprogramacao}
          aoReprogramar={(documento) => {
            substituirCartao(documento);
            fecharReprogramacao();
            toast(`Prazo reprogramado para ${formatarData(documento.dataRevisao)}`);
          }}
          aoConflito={(documento) => substituirCartao(documento)}
        />
      )}
    </>
  );
}

function Kpi({ rotulo, apoio, valor, tom }: { rotulo: string; apoio: string; valor: number | undefined; tom?: 'alerta' | 'erro' }) {
  return (
    <div className={`${estilos.kpi} ${tom ? estilos[tom] : ''}`}>
      <p className={estilos.kpiRotulo}>{rotulo}</p>
      {/* Enquanto carrega mostra "—", nunca um 0 falso. */}
      <p className={estilos.kpiValor}>
        {valor === undefined ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="visualmente-oculto">carregando</span>
          </>
        ) : (
          valor
        )}
      </p>
      <p className={estilos.kpiApoio}>{apoio}</p>
    </div>
  );
}

function EsqueletoQuadro() {
  return (
    <section className={estilos.quadro} aria-label="Quadro de tramitação" aria-busy="true">
      <p className="visualmente-oculto" role="status">
        Carregando o painel…
      </p>
      {FASES_DO_QUADRO.map((fase) => (
        <div key={fase} className={estilos.colunaEsqueleto} aria-hidden="true">
          <span className={estilos.rotuloEsqueleto}>{ROTULO_FASE[fase]}</span>
          <span className={estilos.cartaoEsqueleto} />
          <span className={estilos.cartaoEsqueleto} />
        </div>
      ))}
    </section>
  );
}
