/**
 * Único ponto de contato com o pdfjs-dist (decisão 0013). Carregado sob demanda (import dinâmico)
 * pelo visualizador, para não pesar no carregamento das demais telas.
 * O worker é servido pelo próprio DocSync (asset do Vite), nunca por CDN.
 */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import urlWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = urlWorker;

export type { PDFDocumentProxy, PDFPageProxy };

/** Abre o PDF (já com a marca d'água aplicada pelo servidor) a partir dos bytes recebidos. */
export function abrirPdf(dados: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({
    data: new Uint8Array(dados),
    // Nada de formulários XFA nem scripts: o visualizador só mostra as páginas.
    enableXfa: false,
    stopAtErrors: false,
  }).promise;
}

/** Texto da página, para o leitor de tela (o canvas não tem texto acessível). */
export async function textoDaPagina(pagina: PDFPageProxy): Promise<string> {
  const conteudo = await pagina.getTextContent();
  return conteudo.items
    .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
