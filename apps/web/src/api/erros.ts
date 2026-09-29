import type { Documento } from '@docsync/compartilhado';

/** Erro devolvido pela API (ou falha de rede), com o código do contrato e mensagem em pt-BR. */
export type CodigoErro =
  | 'nao_autenticado'
  | 'sessao_expirada'
  | 'inativo'
  | 'sem_permissao'
  | 'email_existente'
  | 'dados_invalidos'
  | 'ultimo_administrador'
  | 'codigo_revisao_existente'
  | 'id_existente'
  | 'nao_encontrado'
  | 'conflito_versao'
  | 'acao_nao_permitida'
  | 'arquivo_indisponivel'
  | 'sem_conexao'
  | 'desconhecido';

const MENSAGENS: Record<CodigoErro, string> = {
  nao_autenticado: 'Sua sessão expirou. Entre novamente.',
  sessao_expirada: 'Sua sessão expirou. Entre novamente.',
  inativo: 'Seu acesso ao DocSync está inativo. Fale com o administrador do DocSync.',
  sem_permissao: 'Você não tem permissão para esta ação.',
  email_existente: 'Já existe uma pessoa cadastrada com este e-mail.',
  dados_invalidos: 'Revise os campos destacados.',
  ultimo_administrador: 'Não é possível remover o último administrador ativo.',
  codigo_revisao_existente: 'Já existe um documento com este código nesta revisão.',
  id_existente: 'Este registro colidiu com outro já gravado. Tente novamente.',
  nao_encontrado: 'Documento não encontrado. Ele pode ter sido removido ou você não tem acesso a ele.',
  conflito_versao: 'Alguém alterou este documento enquanto você o via. Confira o prazo atual e tente de novo.',
  acao_nao_permitida: 'Este documento não aceita esta ação no status atual.',
  arquivo_indisponivel: 'Este arquivo não está disponível no momento. Avise o administrador do DocSync.',
  sem_conexao: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  desconhecido: 'Ocorreu um erro inesperado. Tente novamente.',
};

export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: CodigoErro;
  readonly campos: Record<string, string>;
  /** Em 409 `conflito_versao`: o estado atual do documento, devolvido pela API. */
  readonly documento: Documento | null;

  /**
   * `mensagem` do servidor (pt-BR) só substitui a padrão em `acao_nao_permitida` e `sem_permissao`
   * (contrato F5, 3.7: "Documento aprovado é final.", "Seu perfil não pode aplicar esta etapa.").
   */
  constructor(
    status: number,
    codigo: CodigoErro,
    campos: Record<string, string> = {},
    documento: Documento | null = null,
    mensagemServidor: string | null = null,
  ) {
    const doServidor = mensagemServidor?.trim() ?? '';
    const usaServidor = doServidor !== '' && (codigo === 'acao_nao_permitida' || codigo === 'sem_permissao');
    super(usaServidor ? doServidor : MENSAGENS[codigo]);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
    this.documento = documento;
  }
}

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : MENSAGENS.desconhecido;
}

export function codigoConhecido(valor: unknown): CodigoErro {
  return typeof valor === 'string' && valor in MENSAGENS ? (valor as CodigoErro) : 'desconhecido';
}
