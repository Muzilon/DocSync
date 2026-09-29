/**
 * Documentos em tramitação, eventos de histórico e listas de domínio (fatia F2).
 *
 * Fonte: documento 02 (seções 1, 2 e 3), documento 03 (seções 6 e 7) e decisão 0004.
 * Tudo aqui é puro (sem navegador nem servidor): a API e a interface usam as mesmas
 * listas e regras.
 */

// ---------------------------------------------------------------------------
// Fases (colunas do quadro) e status
// ---------------------------------------------------------------------------

export const FASES = ['recebido', 'revisao', 'devolvido', 'aprovacao', 'aprovado', 'cancelado'] as const;
export type Fase = (typeof FASES)[number];

/** Rótulo de exibição de cada fase (valor gravado separado do rótulo). */
export const ROTULO_FASE: Record<Fase, string> = {
  recebido: 'Recebido',
  revisao: 'Em Revisão',
  devolvido: 'Devolvido à Área',
  aprovacao: 'Em Aprovação',
  aprovado: 'Aprovado',
  cancelado: 'Cancelado',
};

/**
 * Os 11 status com o texto exato do documento 02, seção 3.1.
 * 'Em Revisão' (genérico) existe só para dados migrados: não é oferecido em ações novas.
 */
export const STATUS_DOCUMENTO = [
  'Recebido',
  'Em revisão da qualidade',
  'Em revisão junto à área',
  'Em Revisão',
  'Devolvido para área para revisão',
  'Devolvido para correção',
  'Em revisão do solicitante',
  'Para aprovação da área solicitante',
  'Para aprovação qualidade',
  'Aprovado',
  'Cancelado',
] as const;
export type StatusDocumento = (typeof STATUS_DOCUMENTO)[number];

/** Fase de cada status, gravada explicitamente (nunca deduzida do texto). */
export const FASE_DO_STATUS: Record<StatusDocumento, Fase> = {
  Recebido: 'recebido',
  'Em revisão da qualidade': 'revisao',
  'Em revisão junto à área': 'revisao',
  'Em Revisão': 'revisao',
  'Devolvido para área para revisão': 'devolvido',
  'Devolvido para correção': 'devolvido',
  'Em revisão do solicitante': 'devolvido',
  'Para aprovação da área solicitante': 'aprovacao',
  'Para aprovação qualidade': 'aprovacao',
  Aprovado: 'aprovado',
  Cancelado: 'cancelado',
};

/** Status de todo cadastro novo (P-03): nunca escolhido pelo usuário. */
export const STATUS_INICIAL: StatusDocumento = 'Recebido';

export function ehStatusDocumento(valor: unknown): valor is StatusDocumento {
  return typeof valor === 'string' && (STATUS_DOCUMENTO as readonly string[]).includes(valor);
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/** Tipo de documento: lista única (P-10), mantida no banco. */
export interface TipoDocumento {
  id: string;
  nome: string;
  ativo: boolean;
}

/**
 * Documento em tramitação. Datas só-dia em 'AAAA-MM-DD'; data/hora em ISO 8601 UTC.
 * `id` ('DOC-uuid') é a identidade; código e título não são.
 */
export interface Documento {
  id: string;
  codigo: string | null;
  titulo: string;
  status: StatusDocumento;
  tipoDocumentoId: string;
  /** Nome do tipo (para exibir). */
  tipoDocumento: string;
  revisao: number;
  dataRecebimento: string;
  /** Prazo da tramitação. */
  dataRevisao: string | null;
  remetente: string;
  areaId: string;
  /** Nome da área (para exibir). */
  area: string;
  disciplina: string | null;
  observacao: string | null;
  /** Título sanitizado, só para exibição. A pasta real é nomeada pelo ID (P-07). */
  nomePasta: string;
  nomeArquivoPrincipal: string;
  qtdAnexos: number;
  /** Documento revisado por este (decisão 0004); null em documento novo. */
  idDocumentoOrigem: string | null;
  /** Número de versão para concorrência otimista (decisão 0002). Começa em 1. */
  versao: number;
  /** ID (`USR-uuid`) de quem cadastrou, vindo do token. */
  criadoPor: string;
  criadoEm: string;
  dataModificacao: string;
}

export type TipoAcaoHistorico = 'CRIACAO' | 'STATUS' | 'EDICAO' | 'ANEXO' | 'CANCELAMENTO';

/** Evento imutável da trilha de auditoria da tramitação. */
export interface EventoHistorico {
  id: string;
  idDocumento: string;
  /** Código do documento no momento do evento (só informativo). */
  codigo: string | null;
  tipoAcao: TipoAcaoHistorico;
  /** Status depois do evento. */
  status: StatusDocumento;
  statusAnterior: StatusDocumento | null;
  dataHora: string;
  destino: string | null;
  responsavel: string | null;
  /** Sempre da identidade autenticada, nunca do corpo da requisição. */
  autorId: string;
  /** Nome do autor no momento do evento. */
  autorNome: string;
  detalhes: { campo: string; antes: string | null; depois: string | null }[];
  observacao: string | null;
}

/** Resposta de GET /documentos/:id. Eventos em ordem de gravação. */
export interface DetalheDocumento {
  documento: Documento;
  eventos: EventoHistorico[];
}

/**
 * Parte 'dados' de POST /documentos (multipart). Esquema fechado: campo
 * desconhecido é recusado, inclusive `status` (P-03: sempre 'Recebido').
 * O `id` 'DOC-uuid' é gerado pelo cliente (crypto.randomUUID) para permitir
 * reenvio idempotente.
 */
export interface NovoDocumento {
  id: string;
  codigo: string | null;
  titulo: string;
  tipoDocumentoId: string;
  revisao: number;
  dataRecebimento: string;
  dataRevisao: string | null;
  remetente: string;
  areaId: string;
  disciplina: string | null;
  observacao: string | null;
}

/** Gera um ID de documento novo ('DOC-' + UUID). Funciona no navegador e no Node. */
export function novoIdDocumento(): string {
  // Web Crypto existe no navegador e no Node 24; o pacote não depende dos tipos de nenhum dos dois.
  const cripto = (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto;
  return `DOC-${cripto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Arquivos (P-09)
// ---------------------------------------------------------------------------

export const LIMITES_ARQUIVO = {
  extensoes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'],
  tamanhoMaximoMB: 20,
  totalMaximoMB: 100,
  maxAnexos: 20,
} as const;

const MB = 1024 * 1024;

/** Extensão em minúsculas, sem o ponto ('' se não houver). */
export function extensaoArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? '';
  const ponto = base.lastIndexOf('.');
  return ponto > 0 ? base.slice(ponto + 1).toLowerCase() : '';
}

/**
 * Valida um arquivo (principal ou anexo) antes do envio e no servidor.
 * @returns mensagem pt-BR do problema, ou null se o arquivo é aceito.
 */
export function validarArquivo(nome: string, tamanhoBytes: number): string | null {
  const extensao = extensaoArquivo(nome);
  if (!(LIMITES_ARQUIVO.extensoes as readonly string[]).includes(extensao)) {
    return 'Formato não permitido. Use PDF, Word (DOC, DOCX), Excel (XLS, XLSX) ou imagem (PNG, JPG, JPEG).';
  }
  if (tamanhoBytes <= 0) return 'O arquivo está vazio.';
  if (tamanhoBytes > LIMITES_ARQUIVO.tamanhoMaximoMB * MB) {
    return `O arquivo passa do limite de ${LIMITES_ARQUIVO.tamanhoMaximoMB} MB.`;
  }
  return null;
}

/**
 * Valida o conjunto do envio: quantidade de anexos e soma dos tamanhos
 * (principal + anexos). @returns mensagem pt-BR ou null.
 */
export function validarConjuntoArquivos(qtdAnexos: number, totalBytes: number): string | null {
  if (qtdAnexos > LIMITES_ARQUIVO.maxAnexos) {
    return `Envie no máximo ${LIMITES_ARQUIVO.maxAnexos} anexos.`;
  }
  if (totalBytes > LIMITES_ARQUIVO.totalMaximoMB * MB) {
    return `O total dos arquivos passa do limite de ${LIMITES_ARQUIVO.totalMaximoMB} MB.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Nome da pasta (documento 03, seção 7) — só exibição
// ---------------------------------------------------------------------------

/** Caracteres inválidos em nomes do SharePoint/Windows, trocados por hífen. */
const CARACTERES_INVALIDOS = /[~"#%&*:<>?/\\{|}]/g;
const CONTROLE = /[\u0000-\u001f\u007f]/g;
const TAMANHO_MAXIMO_PASTA = 100;

/**
 * Nome de pasta derivado do título (documento 03, seção 7): troca
 * `~ " # % & * : < > ? / \ { | }` por hífen, reduz espaços repetidos,
 * apara as pontas e limita a 100 caracteres.
 * Só para exibição: a pasta real é nomeada pelo ID do documento (P-07).
 */
export function sanitizarNomePasta(titulo: string): string {
  const limpo = titulo
    .replace(CONTROLE, ' ')
    .replace(CARACTERES_INVALIDOS, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const cortado = limpo.slice(0, TAMANHO_MAXIMO_PASTA).trim();
  return cortado === '' ? 'Documento' : cortado;
}
