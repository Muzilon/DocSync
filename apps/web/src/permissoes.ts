import { pode, type Pessoa } from '@docsync/compartilhado';

/**
 * Pode abrir a tela Novo documento? O Solicitante só cadastra na própria área, então a pergunta
 * leva a área da pessoa como contexto (packages/compartilhado, `pode`). A API decide de verdade (R2).
 */
export function podeCadastrarDocumento(eu: Pessoa): boolean {
  return pode(eu, 'cadastrarDocumento', eu.areaId ? { areaId: eu.areaId } : {});
}
