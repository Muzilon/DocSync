/**
 * Metas de tempo do fluxo (decisão 0012, item 5; contrato F5, seção 5.2): 14 dias
 * corridos da data de recebimento até o início da revisão pela Qualidade e 40 dias
 * até a conclusão (Aprovado). Puro: "hoje" é sempre injetado (vem do servidor).
 *
 * O prazo de 30 dias (reprogramável, decisão 0011) e a meta de 40 (fixa) são
 * medidas diferentes e ficam lado a lado na tela.
 */

import { diferencaEmDias } from './documentos.ts';
import type { CartaoPainel } from './painel.ts';

export const META_DIAS_INICIO_REVISAO = 14;
export const META_DIAS_CONCLUSAO = 40;

export type EstadoMeta = 'cumprida' | 'estourada' | 'no_prazo' | 'nao_se_aplica';

export interface SituacaoMeta {
  estado: EstadoMeta;
  /** Dias corridos usados: até o marco (cumprida/estourada) ou até hoje (no_prazo/estourada sem marco). */
  dias: number | null;
  limite: number;
  /** Texto pronto: "Iniciada em 9 dias (meta: 14)", "Ainda não iniciada: 16 dias (meta: 14)", "Não se aplica". */
  texto: string;
  /** Cor nunca sozinha: o texto já diz o estado. */
  tom: 'sucesso' | 'erro' | 'neutro';
}

export interface Metas {
  inicioRevisao: SituacaoMeta;
  conclusao: SituacaoMeta;
}

const NAO_SE_APLICA = (limite: number): SituacaoMeta => ({
  estado: 'nao_se_aplica',
  dias: null,
  limite,
  texto: 'Não se aplica',
  tom: 'neutro',
});

function dias(quantidade: number): string {
  return `${quantidade} ${quantidade === 1 ? 'dia' : 'dias'}`;
}

function tomDe(estado: EstadoMeta): SituacaoMeta['tom'] {
  if (estado === 'cumprida') return 'sucesso';
  if (estado === 'estourada') return 'erro';
  return 'neutro';
}

/** Meta com marco atingido: cumprida se dentro do limite, senão estourada. */
function comMarco(diasAteMarco: number, limite: number, verbo: string): SituacaoMeta {
  const estado: EstadoMeta = diasAteMarco <= limite ? 'cumprida' : 'estourada';
  return { estado, dias: diasAteMarco, limite, texto: `${verbo} em ${dias(diasAteMarco)} (meta: ${limite})`, tom: tomDe(estado) };
}

/** Meta ainda sem marco: no prazo enquanto hoje está dentro do limite, senão estourada. */
function semMarco(diasAteHoje: number, limite: number, prefixo: string): SituacaoMeta {
  const estado: EstadoMeta = diasAteHoje <= limite ? 'no_prazo' : 'estourada';
  return { estado, dias: diasAteHoje, limite, texto: `${prefixo}: ${dias(diasAteHoje)} (meta: ${limite})`, tom: tomDe(estado) };
}

/**
 * Avalia as duas metas, contadas da `dataRecebimento` em dias corridos.
 * - Início da revisão: com `dataInicioRevisao`, dias até ela (≤ 14 cumprida); sem,
 *   dias até hoje (≤ 14 no prazo); Aprovado que nunca entrou em revisão (importado) → não se aplica.
 * - Conclusão: com `dataAprovacao`, dias até ela (≤ 40 cumprida); sem, dias até hoje (≤ 40 no prazo).
 * - Cancelado → não se aplica nas duas.
 */
export function avaliarMetas(
  doc: Pick<CartaoPainel, 'status' | 'dataRecebimento' | 'dataInicioRevisao' | 'dataAprovacao'>,
  hoje: string,
): Metas {
  if (doc.status === 'Cancelado') {
    return { inicioRevisao: NAO_SE_APLICA(META_DIAS_INICIO_REVISAO), conclusao: NAO_SE_APLICA(META_DIAS_CONCLUSAO) };
  }

  let inicioRevisao: SituacaoMeta;
  if (doc.dataInicioRevisao !== null) {
    inicioRevisao = comMarco(diferencaEmDias(doc.dataRecebimento, doc.dataInicioRevisao), META_DIAS_INICIO_REVISAO, 'Iniciada');
  } else if (doc.status === 'Aprovado') {
    inicioRevisao = NAO_SE_APLICA(META_DIAS_INICIO_REVISAO);
  } else {
    inicioRevisao = semMarco(diferencaEmDias(doc.dataRecebimento, hoje), META_DIAS_INICIO_REVISAO, 'Ainda não iniciada');
  }

  const conclusao =
    doc.dataAprovacao !== null
      ? comMarco(diferencaEmDias(doc.dataRecebimento, doc.dataAprovacao), META_DIAS_CONCLUSAO, 'Concluída')
      : semMarco(diferencaEmDias(doc.dataRecebimento, hoje), META_DIAS_CONCLUSAO, 'Em andamento');

  return { inicioRevisao, conclusao };
}

/** A conclusão cumpriu a meta de 40 dias? (usado pelo KPI "Aprovados no mês".) */
export function concluidoNaMeta(doc: Pick<CartaoPainel, 'dataRecebimento' | 'dataAprovacao'>): boolean {
  return doc.dataAprovacao !== null && diferencaEmDias(doc.dataRecebimento, doc.dataAprovacao) <= META_DIAS_CONCLUSAO;
}
