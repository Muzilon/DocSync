/**
 * Dia de referência do servidor (contrato F3, seção 2.1).
 *
 * O fuso é constante (America/Sao_Paulo): não é segredo nem configuração. É a
 * única fonte de "hoje" da API: cadastro (data de recebimento e prazo), validação
 * da reprogramação e `RespostaPainel.hoje`.
 */

export const FUSO_HORARIO = 'America/Sao_Paulo';

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_HORARIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia de hoje em 'AAAA-MM-DD' no fuso de São Paulo. `agora` é injetável para testes. */
export function hojeNoFuso(agora: Date = new Date()): string {
  // en-CA formata como 'AAAA-MM-DD'; as partes garantem o resultado mesmo se o formato mudar.
  const partes = formatador.formatToParts(agora);
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}
