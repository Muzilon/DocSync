import {
  acoesDeStatus,
  pode,
  podeEditarAgora,
  podeReprogramarAgora,
  podeSerCancelado,
  type AcaoStatus,
  type Documento,
  type Pessoa,
  type StatusDocumento,
} from '@docsync/compartilhado';

/**
 * Pode abrir a tela Novo documento? O Solicitante só cadastra na própria área, então a pergunta
 * leva a área da pessoa como contexto (packages/compartilhado, `pode`). A API decide de verdade (R2).
 */
export function podeCadastrarDocumento(eu: Pessoa): boolean {
  return pode(eu, 'cadastrarDocumento', eu.areaId ? { areaId: eu.areaId } : {});
}

/**
 * Mostra o botão Reprogramar nos detalhes? Perfil (`pode` com a área do documento) E prazo já
 * vencido (decisão 0015, item 5: `podeReprogramarAgora`, a mesma regra do 409 da API). Aprovado e
 * Cancelado nunca. `hoje` é o dia do servidor. A API decide de verdade.
 */
export function podeReprogramar(
  eu: Pessoa,
  documento: { areaId: string; status: StatusDocumento; dataRevisao: string | null },
  hoje: string,
): boolean {
  return podeReprogramarAgora(documento, hoje) && pode(eu, 'reprogramarPrazo', { areaId: documento.areaId });
}

/**
 * Mostra o botão Baixar nos detalhes (contrato F4, 4.5)? Pergunta a `pode` com a área do
 * documento. A API decide de verdade.
 */
export function podeBaixarArquivo(eu: Pessoa, documento: { areaId: string }): boolean {
  return pode(eu, 'baixarArquivo', { areaId: documento.areaId });
}

/**
 * Ações de status que ESTA pessoa pode aplicar agora (contrato F5, 2.6): máquina ∩ perfil, pela
 * mesma `acoesDeStatus` que a API confere. Vazio para Aprovado, Cancelado, Leitor e Solicitante
 * de outra área.
 */
export function acoesDeStatusPara(eu: Pessoa, documento: Pick<Documento, 'status' | 'areaId'>): AcaoStatus[] {
  return acoesDeStatus(eu, documento);
}

/** Mostra "Cancelar" nos detalhes? Perfil (Administrador/Qualidade) e status que aceita cancelamento. */
export function podeCancelar(eu: Pessoa, documento: Pick<Documento, 'status' | 'areaId'>): boolean {
  return podeSerCancelado(documento.status) && pode(eu, 'cancelarDocumento', { areaId: documento.areaId });
}

/** Mostra "Reativar"? Só em Cancelado e só para quem pode reativar (Administrador/Qualidade). */
export function podeReativar(eu: Pessoa, documento: Pick<Documento, 'status' | 'areaId'>): boolean {
  return documento.status === 'Cancelado' && pode(eu, 'reativarDocumento', { areaId: documento.areaId });
}

/**
 * Mostra "Editar dados" nos detalhes (contrato F6, 5.1)? Documento em tramitação
 * (`podeEditarAgora`: nem Aprovado nem Cancelado) E `pode(eu, 'editarDados', { areaId, status })`
 * (Solicitante só em devolvido da sua área; Leitor nunca). A API decide de verdade.
 */
export function podeEditar(eu: Pessoa, documento: Pick<Documento, 'status' | 'areaId'>): boolean {
  return podeEditarAgora(documento) && pode(eu, 'editarDados', { areaId: documento.areaId, status: documento.status });
}
