/**
 * Pessoas, perfis e a função única de permissão (decisão 0007).
 *
 * O Entra ID só prova a identidade; perfil e área ficam no banco do DocSync.
 * A mesma função `pode` é usada pela API (que decide) e pela interface
 * (que apenas esconde o que a pessoa não pode fazer).
 */

import type { Documento } from './documentos.ts';

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
 * Ações verificadas pela função de permissão (documento 02, seção 7.3).
 * A lista cresce a cada fatia (mudar status, exportar etc.), sempre com teste
 * na tabela de permissões.
 */
export type Acao = 'gerenciarPessoas' | 'verDocumentos' | 'cadastrarDocumento' | 'reprogramarPrazo' | 'baixarArquivo';

/**
 * Contexto do registro sobre o qual a ação é feita. Hoje só a área do documento:
 * o Solicitante só atua sobre documentos da sua área.
 */
export interface ContextoPermissao {
  areaId?: string;
}

/**
 * Como cada perfil é tratado em cada ação.
 * - 'daSuaArea': sem contexto → sim; com contexto → só se a área for a da pessoa.
 * - 'somenteComSuaArea': exige contexto com a área da pessoa (sem contexto → não).
 */
type Regra = 'sim' | 'nao' | 'daSuaArea' | 'somenteComSuaArea';

const PERMISSOES: Record<Acao, Record<Perfil, Regra>> = {
  gerenciarPessoas: { Administrador: 'sim', Qualidade: 'nao', Solicitante: 'nao', Leitor: 'nao' },
  verDocumentos: { Administrador: 'sim', Qualidade: 'sim', Solicitante: 'daSuaArea', Leitor: 'sim' },
  cadastrarDocumento: { Administrador: 'sim', Qualidade: 'sim', Solicitante: 'somenteComSuaArea', Leitor: 'nao' },
  // Decisão 0011: reprogramam Qualidade e Administrador. O contexto de área é aceito
  // (regra uniforme), mas hoje não altera o resultado.
  reprogramarPrazo: { Administrador: 'sim', Qualidade: 'sim', Solicitante: 'nao', Leitor: 'nao' },
  // Decisão 0014 (item 2): Administrador e Qualidade baixam qualquer arquivo; o
  // Solicitante só de documentos da sua área; o Leitor vê os detalhes, mas não baixa.
  baixarArquivo: { Administrador: 'sim', Qualidade: 'sim', Solicitante: 'daSuaArea', Leitor: 'nao' },
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
 *
 * `contexto.areaId` é a área do documento em questão. Regras do Solicitante:
 * - `verDocumentos`: sem contexto, sim (vê a lista, que a API filtra pela área);
 *   com contexto, só documentos da sua área;
 * - `cadastrarDocumento`: só com contexto igual à sua área. Para mostrar o
 *   botão "Novo", a interface pergunta `pode(eu, 'cadastrarDocumento', { areaId: eu.areaId })`.
 */
export function pode(pessoa: Pessoa | null, acao: Acao, contexto?: ContextoPermissao): boolean {
  if (!acessoLiberado(pessoa)) return false;
  const areaDoContexto = contexto?.areaId;
  const ehDaSuaArea = areaDoContexto !== undefined && pessoa.areaId !== null && areaDoContexto === pessoa.areaId;
  switch (PERMISSOES[acao][pessoa.perfil]) {
    case 'sim':
      return true;
    case 'nao':
      return false;
    case 'daSuaArea':
      return areaDoContexto === undefined || ehDaSuaArea;
    case 'somenteComSuaArea':
      return ehDaSuaArea;
  }
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
  /** POST /documentos: já existe documento com o mesmo código e revisão (decisão 0004). */
  | 'codigo_revisao_existente'
  /** POST /documentos: o ID já foi usado por outro autor ou com outros dados. */
  | 'id_existente'
  /** 409: a versão enviada está desatualizada; o corpo traz `documento` com o estado atual. */
  | 'conflito_versao'
  /** 409: o estado do documento não aceita a ação (ex.: reprogramar prazo de Aprovado/Cancelado). */
  | 'acao_nao_permitida'
  /** 404: o registro do arquivo existe, mas o conteúdo não está no armazenamento. */
  | 'arquivo_indisponivel'
  | 'erro_interno';

export interface ErroApi {
  codigo: CodigoErroApi;
  mensagem?: string;
  /** Em 'dados_invalidos': mensagem pt-BR por campo. */
  campos?: Record<string, string>;
  /** Em 'conflito_versao': o documento como está no servidor. */
  documento?: Documento;
}
