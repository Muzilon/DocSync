/**
 * Painel Kanban (fatia F3): cartão de leitura, KPIs, filtro/busca e etiquetas de prazo.
 *
 * Fonte: contrato docs/contratos/f3-painel-kanban.md (seção 4), documento 03
 * (seção 9, P-12 e P-13) e decisões 0011 e 0012. Tudo puro: a API aplica o mesmo
 * `filtrarCartoes` que a interface, e "hoje" é sempre injetado (vem do servidor).
 */

import { diferencaEmDias, type Fase, type StatusDocumento } from './documentos.ts';

// ---------------------------------------------------------------------------
// Contrato de GET /painel
// ---------------------------------------------------------------------------

/** Cartão do quadro: só campos de exibição (LGPD: sem observação, sem arquivos, sem `criadoPor`). */
export interface CartaoPainel {
  id: string;
  codigo: string | null;
  titulo: string;
  revisao: number;
  status: StatusDocumento;
  /** = FASE_DO_STATUS[status], já resolvida pelo servidor. */
  fase: Fase;
  tipoDocumento: string;
  areaId: string;
  area: string;
  remetente: string;
  dataRecebimento: string;
  dataRevisao: string | null;
  reprogramado: boolean;
  qtdReprogramacoes: number;
  /** Quantas vezes o documento entrou na fase 'devolvido' (calculado dos eventos, nunca de contador editável). */
  qtdDevolucoes: number;
  /** Dia ('AAAA-MM-DD') do evento mais recente com status 'Aprovado'; null se nunca aprovado. Base do KPI "Aprovados no mês" (P-12, F5). */
  dataAprovacao: string | null;
  versao: number;
  criadoEm: string;
  dataModificacao: string;
}

export interface RespostaPainel {
  cartoes: CartaoPainel[];
  /** Quantos documentos cancelados a pessoa poderia ver (botão "Cancelados (N)"), já com busca e área aplicadas. */
  qtdCancelados: number;
  /** Dia de referência do servidor ('AAAA-MM-DD', fuso de São Paulo), para KPIs e etiquetas usarem a mesma data. */
  hoje: string;
}

// ---------------------------------------------------------------------------
// KPIs (P-12, P-13)
// ---------------------------------------------------------------------------

export const DIAS_JANELA_VENCENDO = 5;

export interface Kpis {
  /** Não cancelados e não aprovados (P-13: rótulo "Em tramitação"). */
  emTramitacao: number;
  /** Em tramitação com prazo entre hoje e hoje + 5 dias, inclusive (P-13: rótulo "Vencendo em até 5 dias"). */
  vencendo: number;
  /** Em tramitação com prazo anterior a hoje. */
  atrasados: number;
}

function emTramitacao(cartao: Pick<CartaoPainel, 'status'>): boolean {
  return cartao.status !== 'Cancelado' && cartao.status !== 'Aprovado';
}

/**
 * KPIs sobre os cartões já filtrados por busca e área (documento 03, 9.1).
 * Cancelados nunca contam; sem prazo conta só em `emTramitacao`.
 * "Aprovados no mês" (P-12) fica para a F5 (decisão 0012).
 */
export function calcularKpis(cartoes: readonly CartaoPainel[], hoje: string): Kpis {
  const kpis: Kpis = { emTramitacao: 0, vencendo: 0, atrasados: 0 };
  for (const cartao of cartoes) {
    if (!emTramitacao(cartao)) continue;
    kpis.emTramitacao++;
    if (cartao.dataRevisao === null) continue;
    const dias = diferencaEmDias(hoje, cartao.dataRevisao);
    if (dias < 0) kpis.atrasados++;
    else if (dias <= DIAS_JANELA_VENCENDO) kpis.vencendo++;
  }
  return kpis;
}

// ---------------------------------------------------------------------------
// Filtro e busca
// ---------------------------------------------------------------------------

export interface FiltroPainel {
  busca?: string;
  areaId?: string | null;
}

/** Sem acento e sem diferenciar maiúsculas (pt-BR), para comparar os dois lados igual. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/** Busca sem acento e sem diferenciar maiúsculas em título, código e remetente; área por ID. */
export function filtrarCartoes(cartoes: readonly CartaoPainel[], filtro: FiltroPainel): CartaoPainel[] {
  const termo = normalizarBusca(filtro.busca ?? '');
  const areaId = filtro.areaId ?? null;
  return cartoes.filter((c) => {
    if (areaId !== null && c.areaId !== areaId) return false;
    if (termo === '') return true;
    return [c.titulo, c.codigo ?? '', c.remetente].some((campo) => normalizarBusca(campo).includes(termo));
  });
}

// ---------------------------------------------------------------------------
// Etiqueta de prazo (documento 03, 9.5)
// ---------------------------------------------------------------------------

export type TomPrazo = 'verde' | 'ambar' | 'vermelho';

export interface EtiquetaPrazo {
  tom: TomPrazo;
  texto: string;
  /** prazo - hoje, em dias corridos (negativo = atrasado). */
  diasRestantes: number;
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. */
export function formatarDataCurta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Etiqueta de prazo do cartão. null quando não há prazo ou o documento está
 * Aprovado ou Cancelado. A cor nunca vai sozinha: o texto já diz o estado.
 */
export function etiquetaPrazo(cartao: Pick<CartaoPainel, 'dataRevisao' | 'status'>, hoje: string): EtiquetaPrazo | null {
  if (cartao.dataRevisao === null || !emTramitacao(cartao)) return null;
  const dias = diferencaEmDias(hoje, cartao.dataRevisao);
  if (dias > DIAS_JANELA_VENCENDO) {
    return { tom: 'verde', texto: `Prazo: ${formatarDataCurta(cartao.dataRevisao)}`, diasRestantes: dias };
  }
  if (dias >= 0) {
    const texto = dias === 0 ? 'Vence hoje' : dias === 1 ? 'Vence em 1 dia' : `Vence em ${dias} dias`;
    return { tom: 'ambar', texto, diasRestantes: dias };
  }
  const atraso = -dias;
  return { tom: 'vermelho', texto: atraso === 1 ? 'Atrasado há 1 dia' : `Atrasado há ${atraso} dias`, diasRestantes: dias };
}
