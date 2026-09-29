/**
 * Pessoas, perfis e a função única de permissão (decisão 0007).
 *
 * O Entra ID só prova a identidade; perfil e área ficam no banco do DocSync.
 * A mesma função `pode` é usada pela API (que decide) e pela interface
 * (que apenas esconde o que a pessoa não pode fazer).
 */

export const PERFIS = ['Administrador', 'Qualidade', 'Solicitante', 'Leitor'] as const;
export type Perfil = (typeof PERFIS)[number];

export type StatusPessoa = 'Ativo' | 'Inativo';

/** Perfil ou área `null` = acesso ainda não liberado pelo Administrador. */
export interface Pessoa {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil | null;
  /** Nome da área (para exibir). */
  area: string | null;
  /** ID estável da área (`AREA-uuid`), usado para enviar alterações. */
  areaId: string | null;
  status: StatusPessoa;
}

export interface Area {
  id: string;
  nome: string;
  ativa: boolean;
}

/**
 * Ações verificadas pela função de permissão.
 * Na F1 só existem as necessárias para login e pessoas; a lista cresce a cada
 * fatia (cadastrar documento, mudar status, exportar etc., documento 02, seção 7.3),
 * sempre com teste na tabela de permissões.
 */
export type Acao = 'gerenciarPessoas' | 'verDocumentos';

const PERMISSOES: Record<Acao, readonly Perfil[]> = {
  gerenciarPessoas: ['Administrador'],
  verDocumentos: ['Administrador', 'Qualidade', 'Solicitante', 'Leitor'],
};

export function ehPerfil(valor: unknown): valor is Perfil {
  return typeof valor === 'string' && (PERFIS as readonly string[]).includes(valor);
}

/**
 * Acesso liberado = pessoa ativa, com perfil e com área. Exceção: o Administrador
 * dispensa área (o primeiro Administrador nasce do bootstrap, antes de ter área).
 * Sem acesso liberado a interface mostra "Acesso ainda não liberado".
 */
export function acessoLiberado(pessoa: Pessoa | null): pessoa is Pessoa & { perfil: Perfil } {
  if (pessoa === null || pessoa.status !== 'Ativo' || pessoa.perfil === null) return false;
  return pessoa.perfil === 'Administrador' || pessoa.area !== null;
}

/**
 * Função única de permissão. Pessoa ausente, inativa ou sem acesso liberado
 * (sem perfil, ou sem área quando não é Administrador) não pode nada.
 */
export function pode(pessoa: Pessoa | null, acao: Acao): boolean {
  if (!acessoLiberado(pessoa)) return false;
  return PERMISSOES[acao].includes(pessoa.perfil);
}

// ---------------------------------------------------------------------------
// Contrato das rotas de pessoas (F1). A API não tem prefixo; a interface chama
// com /api, que o proxy do Vite remove.
// ---------------------------------------------------------------------------

/** Corpo de POST /pessoas (pré-cadastro). Campo desconhecido é rejeitado. */
export interface NovaPessoa {
  email: string;
  nome: string;
  perfil?: Perfil | null;
  areaId?: string | null;
}

/** Corpo de PATCH /pessoas/:id. Ao menos um campo; campo desconhecido é rejeitado. */
export interface AlteracaoPessoa {
  perfil?: Perfil | null;
  areaId?: string | null;
  status?: StatusPessoa;
}

/** Item de GET /pessoas/:id/auditoria. Registro imutável. */
export interface RegistroAuditoriaPessoa {
  id: string;
  idUsuario: string;
  /** ID do usuário autor, ou 'sistema' (bootstrap e vínculo no primeiro login). */
  autorId: string;
  autorNome: string;
  /** ISO 8601. */
  dataHora: string;
  campo: string;
  antes: string | null;
  depois: string | null;
}

export type CodigoErroApi =
  | 'nao_autenticado'
  | 'inativo'
  | 'sem_permissao'
  | 'dados_invalidos'
  | 'email_existente'
  | 'ultimo_administrador'
  | 'nao_encontrado'
  | 'conflito_identidade'
  | 'erro_interno';

export interface ErroApi {
  codigo: CodigoErroApi;
  mensagem?: string;
  /** Em 'dados_invalidos': mensagem pt-BR por campo. */
  campos?: Record<string, string>;
}
