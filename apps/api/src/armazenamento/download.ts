/**
 * Cabeçalhos da entrega de arquivos (contrato F4, seção 4.3 e 10; decisão 0014).
 *
 * O tipo de conteúdo sai só da extensão do nome armazenado (tabela fechada do
 * compartilhado), nunca do `tipo_mime` declarado por quem enviou. O nome do download
 * é decidido pela rota (principal: `nomeDownloadPrincipal`; anexo: nome original
 * sanitizado) e chega aqui pronto; este módulo só o codifica para o cabeçalho.
 */
import { tipoMimePorExtensao } from '@docsync/compartilhado';

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

/**
 * Cabeçalhos da resposta de GET /documentos/:id/arquivos/:arquivoId (sempre `attachment`).
 * @param nome nome final do download (vai em `filename` ASCII e `filename*` UTF-8).
 * @param nomeArmazenado caminho relativo gravado pelo servidor (decide o Content-Type).
 * @param tamanho bytes do conteúdo entregue.
 */
export function cabecalhosDownload(nome: string, nomeArmazenado: string, tamanho: number): CabecalhosDownload {
  return {
    'Content-Type': tipoMimePorExtensao(nomeArmazenado),
    'Content-Disposition': `attachment; filename="${nomeAscii(nome)}"; filename*=UTF-8''${nomeRfc5987(nome)}`,
    'Content-Length': String(tamanho),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  };
}
