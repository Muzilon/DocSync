/**
 * Linha do tempo do documento (fatia F4): descrição de cada evento do histórico.
 *
 * Fonte: contrato docs/contratos/f4-detalhes-historico.md (seção 3). A tela não
 * conhece o significado de `tipoAcao` nem de `detalhes[].campo`: chama só
 * `descreverEvento`. F5 (STATUS, CANCELAMENTO), F6 (EDICAO) e F7 (ANEXO) gravam no
 * formato combinado aqui e aparecem certos sem mexer na tela.
 */

import {
  FASE_DO_STATUS,
  diaEmSaoPaulo,
  ehDataSoDia,
  lerReprogramacao,
  type EventoHistorico,
  type StatusDocumento,
  type TipoAcaoHistorico,
} from './documentos.ts';
import { formatarDataCurta } from './painel.ts';

/** Rótulo de exibição de cada tipo de evento (valor gravado separado do rótulo). */
export const ROTULO_TIPO_ACAO: Record<TipoAcaoHistorico, string> = {
  CRIACAO: 'Cadastro',
  STATUS: 'Mudança de status',
  EDICAO: 'Edição de dados',
  ANEXO: 'Arquivos',
  CANCELAMENTO: 'Cancelamento',
  REPROGRAMACAO: 'Reprogramação de prazo',
};

/** Rótulo pt-BR dos campos que podem aparecer em `detalhes[].campo` (os mesmos nomes de `Documento`). */
export const ROTULO_CAMPO_HISTORICO: Record<string, string> = {
  titulo: 'Título',
  codigo: 'Código',
  tipoDocumento: 'Tipo de documento',
  revisao: 'Revisão',
  remetente: 'Remetente',
  area: 'Área',
  disciplina: 'Disciplina',
  observacao: 'Observação',
  dataRecebimento: 'Data de recebimento',
  dataRevisao: 'Prazo',
  status: 'Status',
  arquivo: 'Arquivo',
};

export interface DiferencaExibida {
  campo: string;
  rotulo: string;
  antes: string;
  depois: string;
}

export interface DescricaoEvento {
  /** = ROTULO_TIPO_ACAO[tipoAcao]. */
  titulo: string;
  /** Uma linha: "Documento cadastrado", "De X para Y", "Prazo de 10/10/2026 para 20/10/2026", "2 arquivos anexados"... */
  resumo: string;
  /** Status depois do evento (badge). */
  status: StatusDocumento;
  /** Só quando houve mudança (statusAnterior != null e != status). */
  statusAnterior: StatusDocumento | null;
  /** detalhes[] com rótulo e valores já formatados ('—' para null; datas em dd/mm/aaaa). */
  diferencas: DiferencaExibida[];
  /** observacao aparada, ou null. Em REPROGRAMACAO é a justificativa. */
  observacao: string | null;
  /** Rótulo do campo `observacao` na tela: 'Justificativa' em REPROGRAMACAO, 'Motivo' em CANCELAMENTO, 'Observação' nos demais. */
  rotuloObservacao: string;
  destino: string | null;
  responsavel: string | null;
  /** Há algo a expandir (diferencas, observacao, destino ou responsavel). */
  temDetalhes: boolean;
}

const VAZIO = '—';

/** Rótulo do campo `observacao` por tipo de evento (os demais usam 'Observação'). */
const ROTULO_OBSERVACAO: Partial<Record<TipoAcaoHistorico, string>> = {
  REPROGRAMACAO: 'Justificativa',
  CANCELAMENTO: 'Motivo',
};

/** Valor de `detalhes[]` formatado: null → '—'; campo `data*` com 'AAAA-MM-DD' → dd/mm/aaaa; o resto como texto. */
export function formatarValorHistorico(campo: string, valor: string | null): string {
  if (valor === null) return VAZIO;
  if (campo.startsWith('data') && ehDataSoDia(valor)) return formatarDataCurta(valor);
  return valor;
}

/** Rótulo do campo; campo desconhecido usa o próprio nome (nunca quebra a tela). */
export function rotuloCampoHistorico(campo: string): string {
  return Object.hasOwn(ROTULO_CAMPO_HISTORICO, campo) ? ROTULO_CAMPO_HISTORICO[campo]! : campo;
}

function plural(quantidade: number, singular: string, pluralTexto: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

function resumoDe(evento: EventoHistorico): string {
  switch (evento.tipoAcao) {
    case 'CRIACAO':
      return 'Documento cadastrado';
    case 'REPROGRAMACAO': {
      const prazo = lerReprogramacao(evento);
      if (!prazo) return 'Prazo reprogramado';
      const anterior = prazo.prazoAnterior === null ? VAZIO : formatarDataCurta(prazo.prazoAnterior);
      return `Prazo de ${anterior} para ${formatarDataCurta(prazo.prazoNovo)}`;
    }
    case 'STATUS':
      return evento.statusAnterior === null || evento.statusAnterior === evento.status
        ? `Status: ${evento.status}`
        : `De ${evento.statusAnterior} para ${evento.status}`;
    case 'CANCELAMENTO':
      return evento.statusAnterior === null ? 'Cancelado' : `Cancelado (estava em ${evento.statusAnterior})`;
    case 'EDICAO':
      return plural(evento.detalhes.length, 'campo alterado', 'campos alterados');
    case 'ANEXO':
      return plural(evento.detalhes.length, 'arquivo anexado', 'arquivos anexados');
  }
}

/** Descrição pronta para a linha do tempo (contrato F4, 3.3). Puro; nunca lança. */
export function descreverEvento(evento: EventoHistorico): DescricaoEvento {
  const observacao = evento.observacao?.trim() || null;
  const destino = evento.destino?.trim() || null;
  const responsavel = evento.responsavel?.trim() || null;
  const diferencas: DiferencaExibida[] = (evento.detalhes ?? []).map((d) => ({
    campo: d.campo,
    rotulo: rotuloCampoHistorico(d.campo),
    antes: formatarValorHistorico(d.campo, d.antes),
    depois: formatarValorHistorico(d.campo, d.depois),
  }));
  const statusAnterior =
    evento.statusAnterior !== null && evento.statusAnterior !== evento.status ? evento.statusAnterior : null;
  return {
    titulo: ROTULO_TIPO_ACAO[evento.tipoAcao] ?? evento.tipoAcao,
    resumo: resumoDe(evento),
    status: evento.status,
    statusAnterior,
    diferencas,
    observacao,
    rotuloObservacao: ROTULO_OBSERVACAO[evento.tipoAcao] ?? 'Observação',
    destino,
    responsavel,
    temDetalhes: diferencas.length > 0 || observacao !== null || destino !== null || responsavel !== null,
  };
}

/**
 * Quantas vezes o documento entrou na fase 'devolvido' (mesma regra do SQL de
 * `listarCartoes`): eventos STATUS ou CANCELAMENTO cujo status está na fase
 * 'devolvido' e cujo status anterior não estava (ou é nulo).
 */
export function contarDevolucoes(eventos: readonly EventoHistorico[]): number {
  let total = 0;
  for (const e of eventos) {
    if (e.tipoAcao !== 'STATUS' && e.tipoAcao !== 'CANCELAMENTO') continue;
    if (FASE_DO_STATUS[e.status] !== 'devolvido') continue;
    if (e.statusAnterior !== null && FASE_DO_STATUS[e.statusAnterior] === 'devolvido') continue;
    total++;
  }
  return total;
}

/**
 * Dia (São Paulo) do PRIMEIRO evento STATUS cujo status está na fase 'revisao'
 * (mesma regra do SQL de `listarCartoes`: `min(data_hora)`); null se nunca entrou.
 * Base da meta de 14 dias (decisão 0012). `eventos` em ordem de gravação.
 */
export function dataInicioRevisao(eventos: readonly EventoHistorico[]): string | null {
  const primeiro = eventos.find((e) => e.tipoAcao === 'STATUS' && FASE_DO_STATUS[e.status] === 'revisao');
  return primeiro ? diaEmSaoPaulo(primeiro.dataHora) : null;
}

/**
 * Dia (São Paulo) do ÚLTIMO evento STATUS com status 'Aprovado' (mesma regra do SQL:
 * `max(data_hora)`); null se nunca aprovado. Documento reativado e aprovado de novo
 * conta pela última aprovação.
 */
export function dataAprovacao(eventos: readonly EventoHistorico[]): string | null {
  let ultimo: EventoHistorico | undefined;
  for (const e of eventos) {
    if (e.tipoAcao === 'STATUS' && e.status === 'Aprovado') ultimo = e;
  }
  return ultimo ? diaEmSaoPaulo(ultimo.dataHora) : null;
}
