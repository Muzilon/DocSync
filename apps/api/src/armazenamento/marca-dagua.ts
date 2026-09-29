/**
 * Marca d'água "CÓPIA NÃO CONTROLADA" (decisão 0013, item 2).
 *
 * Aplicada no servidor, na hora da entrega (download e visualização), em cada página
 * do PDF, em diagonal, com opacidade 0,4. O original no armazenamento nunca é tocado:
 * esta função recebe bytes e devolve bytes novos. PDF que não aceita a marca (senha,
 * corrompido, sem páginas) lança `ErroMarcaDagua`; a rota responde 409
 * `arquivo_indisponivel` e nunca entrega sem marca.
 */
import { TEXTO_MARCA_DAGUA } from '@docsync/compartilhado';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

export class ErroMarcaDagua extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = 'ErroMarcaDagua';
  }
}

export const OPACIDADE_MARCA = 0.4;
/** Fração da diagonal da página ocupada pelo texto. */
const FRACAO_DIAGONAL = 0.7;
/** Altura aproximada das maiúsculas da Helvetica, em fração do tamanho da fonte. */
const ALTURA_MAIUSCULAS = 0.72;
const CINZA = rgb(0.45, 0.45, 0.45);

/**
 * Devolve um PDF novo com a marca em todas as páginas. Nunca altera `original`.
 * @throws ErroMarcaDagua se o PDF estiver cifrado, corrompido ou sem páginas.
 */
export async function aplicarMarcaDagua(original: Uint8Array): Promise<Buffer> {
  let documento: PDFDocument;
  try {
    documento = await PDFDocument.load(original, { ignoreEncryption: false, updateMetadata: false });
  } catch (erro) {
    throw new ErroMarcaDagua('O PDF não pôde ser lido para receber a marca d’água.', { cause: erro });
  }
  if (documento.isEncrypted) throw new ErroMarcaDagua('O PDF está protegido por senha e não recebe a marca d’água.');

  let paginas;
  try {
    // Um PDF truncado pode "carregar" e falhar só aqui (árvore de páginas ausente).
    paginas = documento.getPages();
  } catch (erro) {
    throw new ErroMarcaDagua('O PDF está danificado e não recebe a marca d’água.', { cause: erro });
  }
  if (paginas.length === 0) throw new ErroMarcaDagua('O PDF não tem páginas.');

  try {
    // Helvetica-Bold (fonte padrão, WinAnsi) cobre Ó e Ã sem embutir fonte externa.
    const fonte = await documento.embedFont(StandardFonts.HelveticaBold);
    for (const pagina of paginas) {
      const { width: largura, height: altura } = pagina.getSize();
      const diagonal = Math.hypot(largura, altura);
      const larguraUnitaria = fonte.widthOfTextAtSize(TEXTO_MARCA_DAGUA, 1);
      const tamanho = (diagonal * FRACAO_DIAGONAL) / larguraUnitaria;
      const larguraTexto = larguraUnitaria * tamanho;
      const alturaTexto = tamanho * ALTURA_MAIUSCULAS;
      const anguloRad = Math.atan2(altura, largura);
      const cos = Math.cos(anguloRad);
      const sen = Math.sin(anguloRad);
      // Centraliza o retângulo do texto (girado) no centro da página.
      const x = largura / 2 - (larguraTexto / 2) * cos + (alturaTexto / 2) * sen;
      const y = altura / 2 - (larguraTexto / 2) * sen - (alturaTexto / 2) * cos;
      pagina.drawText(TEXTO_MARCA_DAGUA, {
        x,
        y,
        size: tamanho,
        font: fonte,
        color: CINZA,
        opacity: OPACIDADE_MARCA,
        rotate: degrees((anguloRad * 180) / Math.PI),
      });
    }
    return Buffer.from(await documento.save({ useObjectStreams: false }));
  } catch (erro) {
    throw new ErroMarcaDagua('Não foi possível aplicar a marca d’água ao PDF.', { cause: erro });
  }
}
