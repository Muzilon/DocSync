/**
 * Marca d'água "CÓPIA NÃO CONTROLADA" (decisão 0013). PDFs criados aqui mesmo com
 * pdf-lib; nada de arquivo de fixture nem de internet.
 */
import { TEXTO_MARCA_DAGUA } from '@docsync/compartilhado';
import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ErroMarcaDagua, aplicarMarcaDagua } from './marca-dagua.ts';

/** PDF simples com as páginas dadas (largura x altura). */
export async function pdfDeTeste(paginas: [number, number][] = [[595, 842]]): Promise<Buffer> {
  const documento = await PDFDocument.create();
  const fonte = await documento.embedFont(StandardFonts.Helvetica);
  paginas.forEach((tamanho, i) => {
    const pagina = documento.addPage(tamanho);
    pagina.drawText(`Pagina ${i + 1}`, { x: 40, y: tamanho[1] - 60, size: 14, font: fonte });
  });
  return Buffer.from(await documento.save());
}

/** Texto dos fluxos de conteúdo de uma página (descomprimidos). */
async function conteudoDaPagina(pdf: PDFDocument, indice: number): Promise<string> {
  const pagina = pdf.getPage(indice);
  const contents = pagina.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let texto = '';
  for (const ref of refs) {
    const fluxo = pdf.context.lookup(ref);
    if (fluxo instanceof PDFRawStream) texto += Buffer.from(decodePDFRawStream(fluxo).decode()).toString('latin1');
  }
  return texto;
}

/** Hex WinAnsi do texto da marca, como o pdf-lib grava no fluxo (`<...> Tj`). */
const HEX_MARCA = Buffer.from(TEXTO_MARCA_DAGUA, 'latin1').toString('hex');

describe('aplicarMarcaDagua', () => {
  it('a fonte padrão (WinAnsi) codifica Ó e Ã sem lançar', async () => {
    const documento = await PDFDocument.create();
    const fonte = await documento.embedFont(StandardFonts.HelveticaBold);
    expect(fonte.encodeText(TEXTO_MARCA_DAGUA).toString().toLowerCase()).toBe(`<${HEX_MARCA}>`);
  });

  it('escreve o texto em todas as páginas (retrato, paisagem e pequena), com opacidade e rotação', async () => {
    const original = await pdfDeTeste([
      [595, 842],
      [842, 595],
      [200, 300],
    ]);
    const saida = await aplicarMarcaDagua(original);
    const lido = await PDFDocument.load(saida);
    expect(lido.getPageCount()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const conteudo = await conteudoDaPagina(lido, i);
      expect(conteudo.toLowerCase()).toContain(`<${HEX_MARCA}>`);
      // O conteúdo original da página continua lá.
      expect(conteudo.toLowerCase()).toContain(`<${Buffer.from(`Pagina ${i + 1}`, 'latin1').toString('hex')}>`);
      // Estado gráfico com transparência e matriz de rotação (Tm com senos/cossenos).
      expect(conteudo).toMatch(/\/GS-\S+ gs/);
      expect(conteudo).toMatch(/BT[\s\S]*Tm[\s\S]*Tj[\s\S]*ET/);
    }
    // Opacidade 0,4 no ExtGState de cada página.
    for (const pagina of lido.getPages()) {
      const extGState = pagina.node.Resources()?.lookup(pagina.node.Resources()!.keys().find((k) => k.decodeText() === 'ExtGState')!);
      expect(String(extGState)).toContain('/ca 0.4');
    }
  });

  it('não altera os bytes do original e devolve um buffer novo', async () => {
    const original = await pdfDeTeste();
    const copia = Buffer.from(original);
    const saida = await aplicarMarcaDagua(original);
    expect(original.equals(copia)).toBe(true);
    expect(saida).not.toBe(original);
    expect(saida.equals(original)).toBe(false);
  });

  it('PDF com /Encrypt no trailer → ErroMarcaDagua (nunca entrega sem marca)', async () => {
    const documento = await PDFDocument.create();
    documento.addPage();
    documento.context.trailerInfo.Encrypt = documento.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -1 });
    const cifrado = await documento.save({ useObjectStreams: false });
    await expect(aplicarMarcaDagua(cifrado)).rejects.toBeInstanceOf(ErroMarcaDagua);
  });

  it('PDF corrompido ou lixo → ErroMarcaDagua', async () => {
    await expect(aplicarMarcaDagua(Buffer.from('%PDF-1.4 conteúdo fictício'))).rejects.toBeInstanceOf(ErroMarcaDagua);
    await expect(aplicarMarcaDagua(Buffer.from('nada de pdf'))).rejects.toBeInstanceOf(ErroMarcaDagua);
    await expect(aplicarMarcaDagua(Buffer.alloc(0))).rejects.toBeInstanceOf(ErroMarcaDagua);
  });
});
