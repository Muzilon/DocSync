import type { CampoEditavel } from '@docsync/compartilhado';

/**
 * Rótulos e ordem de tela dos campos cadastrais do documento (contrato F6, 5.5): os mesmos na tela
 * Novo documento e no diálogo Editar dados. As regras dos campos NÃO moram aqui: vêm de
 * `validarDadosDocumento` (packages/compartilhado), a mesma função da API.
 */
export const NOME_CAMPO_DOCUMENTO: Record<CampoEditavel, string> = {
  titulo: 'Título do documento',
  codigo: 'Código do documento',
  tipoDocumentoId: 'Tipo de documento',
  remetente: 'Remetente / solicitante',
  revisao: 'N° de revisão',
  areaId: 'Área',
  disciplina: 'Disciplina',
  observacao: 'Observações',
};

/** Ordem dos campos no formulário (e no resumo de erros), igual nas duas telas. */
export const ORDEM_CAMPOS_DOCUMENTO: readonly CampoEditavel[] = [
  'titulo',
  'codigo',
  'tipoDocumentoId',
  'remetente',
  'areaId',
  'disciplina',
  'revisao',
  'observacao',
];

/** Valores do formulário: sempre texto (o `<input>` devolve texto; a validação normaliza). */
export type DadosFormDocumento = Record<CampoEditavel, string>;

/** Mensagem do 409 codigo_revisao_existente, inline em Código (cadastro e edição). */
export const MENSAGEM_CODIGO_EXISTENTE = 'Já existe um documento com este código nesta revisão.';
