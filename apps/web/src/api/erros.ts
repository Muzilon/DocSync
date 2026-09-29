/** Erro devolvido pela API (ou falha de rede), com o código do contrato e mensagem em pt-BR. */
export type CodigoErro =
  | 'nao_autenticado'
  | 'sessao_expirada'
  | 'inativo'
  | 'sem_permissao'
  | 'email_existente'
  | 'dados_invalidos'
  | 'ultimo_administrador'
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
  sem_conexao: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  desconhecido: 'Ocorreu um erro inesperado. Tente novamente.',
};

export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: CodigoErro;
  readonly campos: Record<string, string>;

  constructor(status: number, codigo: CodigoErro, campos: Record<string, string> = {}) {
    super(MENSAGENS[codigo]);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : MENSAGENS.desconhecido;
}

export function codigoConhecido(valor: unknown): CodigoErro {
  return typeof valor === 'string' && valor in MENSAGENS ? (valor as CodigoErro) : 'desconhecido';
}
