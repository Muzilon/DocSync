/**
 * Dia de referência do servidor (contrato F3, seção 2.1).
 *
 * O fuso é constante (America/Sao_Paulo): não é segredo nem configuração. É a
 * única fonte de "hoje" da API: cadastro (data de recebimento e prazo), validação
 * da reprogramação, `RespostaPainel.hoje` e `DetalheDocumento.hoje`. A conversão
 * é a mesma `diaEmSaoPaulo` do pacote compartilhado (F5), para o SQL do painel, a
 * API e a interface concordarem sobre "que dia foi".
 */

import { FUSO_SAO_PAULO, diaEmSaoPaulo } from '@docsync/compartilhado';

export const FUSO_HORARIO = FUSO_SAO_PAULO;

/** Dia de hoje em 'AAAA-MM-DD' no fuso de São Paulo. `agora` é injetável para testes. */
export function hojeNoFuso(agora: Date = new Date()): string {
  return diaEmSaoPaulo(agora);
}
