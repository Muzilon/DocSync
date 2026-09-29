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
