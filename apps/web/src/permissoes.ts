import { pode, type Pessoa, type StatusDocumento } from '@docsync/compartilhado';

/**
 * Pode abrir a tela Novo documento? O Solicitante só cadastra na própria área, então a pergunta
 * leva a área da pessoa como contexto (packages/compartilhado, `pode`). A API decide de verdade (R2).
 */
export function podeCadastrarDocumento(eu: Pessoa): boolean {
  return pode(eu, 'cadastrarDocumento', eu.areaId ? { areaId: eu.areaId } : {});
}

/**
 * Mostra o botão Reprogramar no cartão? Pergunta a `pode` com a área do documento e esconde
 * em Aprovado e Cancelado (não há prazo a reprogramar; contrato F3, seção 5). A API decide de verdade.
 */
export function podeReprogramar(eu: Pessoa, cartao: { areaId: string; status: StatusDocumento }): boolean {
  if (cartao.status === 'Aprovado' || cartao.status === 'Cancelado') return false;
  return pode(eu, 'reprogramarPrazo', { areaId: cartao.areaId });
}

/**
 * Mostra o botão Baixar nos detalhes (contrato F4, 4.5)? Pergunta a `pode` com a área do
 * documento. A API decide de verdade.
 */
export function podeBaixarArquivo(eu: Pessoa, documento: { areaId: string }): boolean {
  return pode(eu, 'baixarArquivo', { areaId: documento.areaId });
}
