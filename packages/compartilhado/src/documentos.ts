/**
 * Documentos em tramitação, eventos de histórico e listas de domínio (fatia F2).
 *
 * Fonte: documento 02 (seções 1, 2 e 3), documento 03 (seções 6 e 7) e decisão 0004.
 * Tudo aqui é puro (sem navegador nem servidor): a API e a interface usam as mesmas
 * listas e regras.
 */

import type { DadosDocumento } from './edicao.ts';

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
  /**
   * Responsável atual pela etapa (F5, contrato 2.4): pessoa cadastrada (`USR-uuid`).
   * null em Recebido (ninguém ainda), Aprovado (fluxo concluído) e importados.
   */
  responsavelId: string | null;
  /** Nome ATUAL do responsável (por JOIN); o nome no momento de cada etapa fica no evento. */
  responsavel: string | null;
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
  /** Nome do responsável pela etapa no momento do evento (F5); null quando não há. */
  responsavel: string | null;
  /** ID (`USR-uuid`) do responsável pela etapa (F5, migração 0005); null quando não há. */
  responsavelId: string | null;
  /** Sempre da identidade autenticada, nunca do corpo da requisição. */
  autorId: string;
  /** Nome do autor no momento do evento. */
  autorNome: string;
  detalhes: { campo: string; antes: string | null; depois: string | null }[];
  observacao: string | null;
}

/** Arquivo do documento (metadados; o conteúdo vem por GET /documentos/:id/arquivos/:arquivoId). */
export interface ArquivoDocumento {
  /** 'ARQ-uuid', gerado no cadastro e nunca reaproveitado. É a única forma de pedir o download. */
  id: string;
  papel: 'principal' | 'anexo';
  /** Nome como veio de quem enviou (só exibição; o nome do download é sanitizado pelo servidor). */
  nomeOriginal: string;
  /** Bytes. */
  tamanho: number;
  /** ISO 8601 UTC. */
  criadoEm: string;
}

/** Resposta de GET /documentos/:id (contrato F4, 2.1). */
export interface DetalheDocumento {
  documento: Documento;
  /** Principal primeiro, depois anexos em ordem alfabética pt-BR do nome. */
  arquivos: ArquivoDocumento[];
  /** Todos os eventos, em ordem de gravação (mais antigo primeiro). A tela inverte. */
  eventos: EventoHistorico[];
  /** Dia de referência do servidor ('AAAA-MM-DD', fuso de São Paulo), para a etiqueta de prazo do modal. */
  hoje: string;
}

/**
 * Parte 'dados' de POST /documentos (multipart). Esquema fechado: campo
 * desconhecido é recusado, inclusive `status` (P-03: sempre 'Recebido'),
 * `dataRecebimento` (decisão 0012) e `dataRevisao` (decisão 0011): as duas datas
 * são gravadas pelo servidor (dia do cadastro no fuso de São Paulo e esse dia + 30).
 * O `id` 'DOC-uuid' é gerado pelo cliente (crypto.randomUUID) para permitir
 * reenvio idempotente.
 */
export interface NovoDocumento extends DadosDocumento {
  id: string;
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

/** Fuso de referência de todas as datas só-dia do DocSync (decisão 0012). */
export const FUSO_SAO_PAULO = 'America/Sao_Paulo';

const formatadorDiaSaoPaulo = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_SAO_PAULO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Dia ('AAAA-MM-DD') no fuso de São Paulo de um instante (ISO 8601 UTC ou `Date`).
 * A mesma conversão do SQL `AT TIME ZONE 'America/Sao_Paulo'` do painel: um evento
 * às 02:00 UTC de 10/10 é 09/10 em São Paulo.
 */
export function diaEmSaoPaulo(instante: string | Date): string {
  // en-CA formata como 'AAAA-MM-DD'; as partes garantem o resultado mesmo se o formato mudar.
  const partes = formatadorDiaSaoPaulo.formatToParts(typeof instante === 'string' ? new Date(instante) : instante);
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}

/** Documento ainda em tramitação (nem Aprovado nem Cancelado): o único que tem prazo a acompanhar. */
export function emTramitacao(documento: Pick<Documento, 'status'>): boolean {
  return documento.status !== 'Cancelado' && documento.status !== 'Aprovado';
}

/**
 * Reprogramar só com prazo vencido (decisão 0015, item 5): documento em tramitação
 * cujo prazo é anterior a hoje ("vence hoje" ainda não venceu). Documento em
 * tramitação SEM prazo (importado) pode receber um: não há prazo a esperar vencer.
 * A mesma regra decide o botão na interface e o 409 `acao_nao_permitida` na API.
 */
export function podeReprogramarAgora(documento: Pick<Documento, 'status' | 'dataRevisao'>, hoje: string): boolean {
  if (!emTramitacao(documento)) return false;
  return documento.dataRevisao === null || documento.dataRevisao < hoje;
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
 * Tipo de conteúdo do download, decidido só pela extensão do nome armazenado
 * (contrato F4, 4.3). Tabela fechada: toda extensão de `LIMITES_ARQUIVO.extensoes`
 * tem tipo; fora dela, `application/octet-stream`. O `tipo_mime` declarado por quem
 * enviou nunca é usado.
 */
export const TIPO_MIME_POR_EXTENSAO: Record<(typeof LIMITES_ARQUIVO.extensoes)[number], string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export const TIPO_MIME_GENERICO = 'application/octet-stream';

/** Tipo de conteúdo pela extensão do nome (maiúsculas aceitas); genérico se fora da tabela. */
export function tipoMimePorExtensao(nome: string): string {
  const extensao = extensaoArquivo(nome);
  return Object.hasOwn(TIPO_MIME_POR_EXTENSAO, extensao)
    ? TIPO_MIME_POR_EXTENSAO[extensao as keyof typeof TIPO_MIME_POR_EXTENSAO]
    : TIPO_MIME_GENERICO;
}

/** O arquivo é um PDF (pela extensão). Sem uso especial na tramitação desde a decisão 0014. */
export function ehPdf(nome: string): boolean {
  return extensaoArquivo(nome) === 'pdf';
}

// ---------------------------------------------------------------------------
// Nome do arquivo principal baixado (decisão 0014, item 4)
// ---------------------------------------------------------------------------

/** Caracteres que o Windows não aceita em nome de arquivo, mais os de controle. */
const PROIBIDOS_WINDOWS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** Código usado quando o documento ainda não tem código (decisão 0014, item 4). */
export const CODIGO_AUSENTE_DOWNLOAD = 'SEM-CODIGO';

/** Versão de todo arquivo até a F7 (versionamento com justificativa). */
export const VERSAO_ARQUIVO_INICIAL = 1;

/** Limite prático do nome baixado (sistemas de arquivos aceitam 255; folga para a pasta). */
export const TAMANHO_MAXIMO_NOME_DOWNLOAD = 200;

function semProibidosWindows(texto: string): string {
  return texto.replace(PROIBIDOS_WINDOWS, '-').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
}

/**
 * Nome do arquivo PRINCIPAL baixado: `[código]-[título]_[revisão]=[versão].[ext]`, ex.:
 * `PR-QUA-0010-Procedimento de auditoria interna_1=3.pdf`. Sem código, `SEM-CODIGO-...`.
 * O título entra inteiro, só sem os caracteres que o Windows não aceita (`\ / : * ? " < > |`
 * e de controle) e sem ponto ou espaço nas pontas. A extensão vem do nome do arquivo
 * (minúscula); sem extensão, sem ponto. Nome maior que 200 caracteres é cortado no
 * título, preservando o sufixo de revisão/versão e a extensão. Anexos NÃO passam por
 * aqui: baixam com o nome original.
 */
export function nomeDownloadPrincipal(
  documento: Pick<Documento, 'codigo' | 'titulo' | 'revisao'>,
  nomeArquivo: string,
  versao: number = VERSAO_ARQUIVO_INICIAL,
): string {
  const codigo = semProibidosWindows(documento.codigo ?? '') || CODIGO_AUSENTE_DOWNLOAD;
  const titulo = semProibidosWindows(documento.titulo) || 'Documento';
  const extensao = extensaoArquivo(nomeArquivo);
  const sufixo = `_${documento.revisao}=${versao}${extensao ? `.${extensao}` : ''}`;
  const prefixo = `${codigo}-`;
  // Limite contado em code points; o corte cai só em fronteira de caractere visível
  // (grafema): emoji, bandeira ou acento decomposto nunca é partido ao meio.
  const espaco = TAMANHO_MAXIMO_NOME_DOWNLOAD - contarCodePoints(prefixo) - contarCodePoints(sufixo);
  const tituloCabe = cortarEmGrafemas(titulo, Math.max(espaco, 1)).replace(/[\s.]+$/g, '') || 'Documento';
  const nome = `${prefixo}${tituloCabe}${sufixo}`;
  // Garantia final: código longo demais não pode estourar o limite mesmo com o título mínimo.
  return contarCodePoints(nome) > TAMANHO_MAXIMO_NOME_DOWNLOAD ? cortarEmGrafemas(nome, TAMANHO_MAXIMO_NOME_DOWNLOAD) : nome;
}

function contarCodePoints(texto: string): number {
  return Array.from(texto).length;
}

const segmentadorGrafemas = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });

/**
 * Corta o texto para caber em `maximo` code points, só em fronteira de grafema.
 * Um grafema que não cabe inteiro fica de fora (nunca sai meio caractere).
 */
function cortarEmGrafemas(texto: string, maximo: number): string {
  if (contarCodePoints(texto) <= maximo) return texto;
  let usado = 0;
  let saida = '';
  for (const { segment } of segmentadorGrafemas.segment(texto)) {
    const tamanho = contarCodePoints(segment);
    if (usado + tamanho > maximo) break;
    saida += segment;
    usado += tamanho;
  }
  return saida;
}

const UNIDADES_TAMANHO = ['B', 'KB', 'MB', 'GB'] as const;
const formatadorTamanho = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Tamanho legível em pt-BR, base 1024: '0 B', '999 B', '1 KB', '1,5 MB', '20 MB'. */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let valor = bytes;
  let indice = 0;
  while (valor >= 1024 && indice < UNIDADES_TAMANHO.length - 1) {
    valor /= 1024;
    indice++;
  }
  return `${formatadorTamanho.format(valor)} ${UNIDADES_TAMANHO[indice]}`;
}

// ---------------------------------------------------------------------------
// Registro de acesso a arquivos (decisão 0013): fora da linha do tempo, imutável
// ---------------------------------------------------------------------------

export type TipoAcessoArquivo = 'VISUALIZACAO' | 'DOWNLOAD';

/** Registro imutável de quem acessou um arquivo ('ACS-uuid'). Sem tela nesta fatia. */
export interface RegistroAcessoArquivo {
  id: string;
  idDocumento: string;
  idArquivo: string;
  tipo: TipoAcessoArquivo;
  /** Sempre da identidade autenticada. */
  autorId: string;
  autorNome: string;
  /** ISO 8601 UTC. */
  dataHora: string;
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
