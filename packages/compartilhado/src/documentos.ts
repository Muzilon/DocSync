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
  /** Prazo da tramitação: cadastro + 30 dias (decisão 0011), reprogramável. */
  dataRevisao: string | null;
  /** Prazo já reprogramado ao menos uma vez (etiqueta "Reprogramado", decisão 0011). */
  reprogramado: boolean;
  qtdReprogramacoes: number;
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

/** 'REPROGRAMACAO' = mudança do prazo com justificativa (decisão 0011, F3). */
export type TipoAcaoHistorico = 'CRIACAO' | 'STATUS' | 'EDICAO' | 'ANEXO' | 'CANCELAMENTO' | 'REPROGRAMACAO';

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
 * desconhecido é recusado, inclusive `status` (P-03: sempre 'Recebido'),
 * `dataRecebimento` (decisão 0012) e `dataRevisao` (decisão 0011): as duas datas
 * são gravadas pelo servidor (dia do cadastro no fuso de São Paulo e esse dia + 30).
 * O `id` 'DOC-uuid' é gerado pelo cliente (crypto.randomUUID) para permitir
 * reenvio idempotente.
 */
export interface NovoDocumento {
  id: string;
  codigo: string | null;
  titulo: string;
  tipoDocumentoId: string;
  revisao: number;
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
// Datas só-dia, prazo automático (decisão 0011) e reprogramação (decisão 0012)
// ---------------------------------------------------------------------------

const DATA_SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data 'AAAA-MM-DD' que existe no calendário (recusa '2026-02-30'). */
export function ehDataSoDia(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = DATA_SO_DIA.exec(valor);
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return ano >= 1900 && data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** Prazo padrão de tramitação: dias corridos a partir do dia do cadastro (decisão 0011). */
export const DIAS_PRAZO_PADRAO = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function paraUtc(data: string): number {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number];
  return Date.UTC(ano, mes - 1, dia);
}

/** Soma dias corridos a uma data só-dia 'AAAA-MM-DD' (sem fuso; aritmética em UTC). */
export function somarDias(data: string, dias: number): string {
  return new Date(paraUtc(data) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Diferença `fim - inicio` em dias corridos entre duas datas só-dia. */
export function diferencaEmDias(inicio: string, fim: string): number {
  return Math.round((paraUtc(fim) - paraUtc(inicio)) / MS_POR_DIA);
}

/** Prazo automático de um cadastro feito no dia `dataCadastro` ('AAAA-MM-DD'). */
export function calcularPrazoAutomatico(dataCadastro: string): string {
  return somarDias(dataCadastro, DIAS_PRAZO_PADRAO);
}

/** Corpo de POST /documentos/:id/reprogramacoes. Campo desconhecido é rejeitado. */
export interface NovaReprogramacao {
  /** 'AAAA-MM-DD'. */
  novoPrazo: string;
  justificativa: string;
  /** Versão do documento que a pessoa está vendo (concorrência otimista, decisão 0002). */
  versao: number;
}

export const LIMITES_JUSTIFICATIVA = { minimo: 10, maximo: 500 } as const;

/** Resposta 200/201 da reprogramação. */
export interface ResultadoReprogramacao {
  documento: Documento;
  evento: EventoHistorico;
}

/**
 * Justificativa da reprogramação: obrigatória; depois de `trim`, entre 10 e 500
 * caracteres. @returns mensagem pt-BR ou null se aceita.
 */
export function validarJustificativa(texto: unknown): string | null {
  if (typeof texto !== 'string' || texto.trim() === '') return 'Informe a justificativa da reprogramação.';
  const tamanho = texto.trim().length;
  if (tamanho < LIMITES_JUSTIFICATIVA.minimo) {
    return `A justificativa precisa ter ao menos ${LIMITES_JUSTIFICATIVA.minimo} caracteres.`;
  }
  if (tamanho > LIMITES_JUSTIFICATIVA.maximo) {
    return `A justificativa pode ter até ${LIMITES_JUSTIFICATIVA.maximo} caracteres.`;
  }
  return null;
}

/**
 * Novo prazo da reprogramação (decisão 0012: só adia): data só-dia válida,
 * posterior ao prazo atual (se houver) e não anterior a hoje.
 * @returns mensagem pt-BR ou null se aceito.
 */
export function validarNovoPrazo(novoPrazo: unknown, prazoAtual: string | null, hoje: string): string | null {
  if (novoPrazo === undefined || novoPrazo === null || novoPrazo === '') return 'Informe o novo prazo.';
  if (!ehDataSoDia(novoPrazo)) return 'Novo prazo inválido.';
  if (novoPrazo < hoje) return 'O novo prazo não pode ser anterior a hoje.';
  if (prazoAtual !== null && novoPrazo <= prazoAtual) {
    return 'O novo prazo precisa ser posterior ao prazo atual (a reprogramação só adia).';
  }
  return null;
}

/** Lê prazo anterior, prazo novo e justificativa de um evento REPROGRAMACAO; null para outros tipos. */
export function lerReprogramacao(
  evento: EventoHistorico,
): { prazoAnterior: string | null; prazoNovo: string; justificativa: string } | null {
  if (evento.tipoAcao !== 'REPROGRAMACAO') return null;
  const detalhe = evento.detalhes.find((d) => d.campo === 'dataRevisao');
  if (!detalhe || detalhe.depois === null) return null;
  return { prazoAnterior: detalhe.antes, prazoNovo: detalhe.depois, justificativa: evento.observacao ?? '' };
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
