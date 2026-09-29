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
