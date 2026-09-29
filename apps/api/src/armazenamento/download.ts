/**
 * Cabeçalhos da entrega de arquivos (contrato F4, seção 4.3; decisão 0013).
 *
 * O tipo de conteúdo sai só da extensão do nome armazenado (tabela fechada do
 * compartilhado), nunca do `tipo_mime` declarado por quem enviou. O nome do download
 * é o nome original sanitizado pela mesma função do cadastro; arquivos que não recebem
 * marca d'água ganham o prefixo `COPIA-NAO-CONTROLADA_`.
 */
import { tipoMimePorExtensao } from '@docsync/compartilhado';
import { sanitizarNomeArquivo } from './arquivos.ts';

export type Disposicao = 'attachment' | 'inline';

export interface OpcoesCabecalhos {
  /** `attachment` (download) por padrão; `inline` só para o fetch do visualizador. */
  disposicao?: Disposicao;
  /** Prefixo do nome de download (ex.: `COPIA-NAO-CONTROLADA_`). Sanitizado junto com o nome. */
  prefixo?: string;
}

export interface CabecalhosDownload extends Record<string, string> {
  'Content-Type': string;
  'Content-Disposition': string;
  'Content-Length': string;
  'X-Content-Type-Options': 'nosniff';
  'Cache-Control': 'private, no-store';
  'Content-Security-Policy': string;
}

/** Só ASCII imprimível; sem aspas nem barra invertida (que quebrariam o parâmetro). */
function nomeAscii(nome: string): string {
  const semProibidos = nome.replace(/["\\]/g, '');
  // eslint-disable-next-line no-control-regex
  return semProibidos.replace(/[^\x20-\x7e]/g, '_');
}

/** RFC 5987/8187: UTF-8 com percent-encoding de tudo que não é attr-char. */
function nomeRfc5987(nome: string): string {
  return encodeURIComponent(nome).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Nome que a pessoa vai ver no download: original sanitizado, com prefixo opcional. */
export function nomeDeDownload(nomeOriginal: string, prefixo = ''): string {
  return sanitizarNomeArquivo(`${prefixo}${nomeOriginal}`);
}

/**
 * Cabeçalhos da resposta de GET /documentos/:id/arquivos/:arquivoId (e da visualização).
 * @param nomeOriginal nome como veio de quem enviou (vai sanitizado no Content-Disposition).
 * @param nomeArmazenado caminho relativo gravado pelo servidor (decide o Content-Type).
 * @param tamanho bytes do conteúdo entregue (já com marca d'água, se houver).
 */
export function cabecalhosDownload(
  nomeOriginal: string,
  nomeArmazenado: string,
  tamanho: number,
  opcoes: OpcoesCabecalhos = {},
): CabecalhosDownload {
  const nome = nomeDeDownload(nomeOriginal, opcoes.prefixo);
  const disposicao: Disposicao = opcoes.disposicao ?? 'attachment';
  return {
    'Content-Type': tipoMimePorExtensao(nomeArmazenado),
    'Content-Disposition': `${disposicao}; filename="${nomeAscii(nome)}"; filename*=UTF-8''${nomeRfc5987(nome)}`,
    'Content-Length': String(tamanho),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
}
