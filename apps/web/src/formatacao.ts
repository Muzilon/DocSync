/** 'AAAA-MM-DD' (ou ISO) → 'DD/MM/AAAA', sem passar por fuso horário. Nulo vira '—'. */
export function formatarData(data: string | null): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

/** "1 documento", "2 documentos" (singular só para 1). */
export function plural(quantidade: number, singular: string, pluralTexto: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

const FORMATO_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Data e hora de um instante ISO (UTC) no fuso de São Paulo: '29/09/2026, 09:15' (contrato F4, 5.2).
 * Valor inválido ou nulo vira '—' (nunca "Invalid Date" na tela).
 */
export function formatarDataHora(instante: string | null): string {
  if (!instante) return '—';
  const data = new Date(instante);
  return Number.isNaN(data.getTime()) ? '—' : FORMATO_DATA_HORA.format(data);
}

/** 'AAAA-MM-DD' → 'DD/MM' (data curta do cartão, decisão 0015). Nulo vira '—'. */
export function formatarDiaMes(data: string | null): string {
  if (!data) return '—';
  const [, mes, dia] = data.slice(0, 10).split('-');
  return mes && dia ? `${dia}/${mes}` : data;
}

const MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 'AAAA-MM-DD' → 'setembro de 2026' (subtítulo do KPI "Aprovados no mês"). Sem fuso: a data já é o dia. */
export function formatarMesAno(data: string): string {
  const [ano, mes] = data.slice(0, 10).split('-').map(Number);
  if (!ano || !mes) return data;
  return MES_ANO.format(new Date(Date.UTC(ano, mes - 1, 15)));
}

