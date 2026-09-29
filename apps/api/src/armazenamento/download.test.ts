import { PREFIXO_COPIA_NAO_CONTROLADA } from '@docsync/compartilhado';
import { describe, expect, it } from 'vitest';
import { cabecalhosDownload, nomeDeDownload } from './download.ts';

describe('cabecalhosDownload (contrato F4, 4.3)', () => {
  it('nome com acento: filename ASCII com _ e filename* em UTF-8 percent-encoded', () => {
    const c = cabecalhosDownload('Relatório de Inspeção.pdf', 'Relatório de Inspeção.pdf', 10);
    expect(c['Content-Disposition']).toBe(
      `attachment; filename="Relat_rio de Inspe__o.pdf"; filename*=UTF-8''Relat%C3%B3rio%20de%20Inspe%C3%A7%C3%A3o.pdf`,
    );
    expect(c['Content-Type']).toBe('application/pdf');
    expect(c['Content-Length']).toBe('10');
  });

  it('aspas viram hífen (sanitização) e barras contam como pasta; nome reservado ganha _', () => {
    const c = cabecalhosDownload('a"b.pdf', 'a-b.pdf', 1);
    expect(c['Content-Disposition']).toBe(`attachment; filename="a-b.pdf"; filename*=UTF-8''a-b.pdf`);
    // Barra e barra invertida: só o nome final entra (nunca um caminho).
    expect(cabecalhosDownload('pasta\\sub/nome.pdf', 'nome.pdf', 1)['Content-Disposition']).toContain('filename="nome.pdf"');
    expect(nomeDeDownload('con.pdf')).toBe('_con.pdf');
    expect(cabecalhosDownload('con.pdf', 'con.pdf', 1)['Content-Disposition']).toContain('filename="_con.pdf"');
  });

  it('tipo pela extensão do nome armazenado (maiúsculas aceitas); sem extensão → octet-stream', () => {
    expect(cabecalhosDownload('x', 'documento.PDF', 1)['Content-Type']).toBe('application/pdf');
    expect(cabecalhosDownload('x', 'Anexos/planilha.xlsx', 1)['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(cabecalhosDownload('x', 'sem-extensao', 1)['Content-Type']).toBe('application/octet-stream');
    // tipo_mime declarado por quem enviou não existe aqui: 'pagina.html' não vira text/html.
    expect(cabecalhosDownload('pagina.html', 'pagina.html', 1)['Content-Type']).toBe('application/octet-stream');
  });

  it('attachment por padrão, nosniff, no-store e CSP sandbox sempre', () => {
    const c = cabecalhosDownload('a.pdf', 'a.pdf', 5);
    expect(c['Content-Disposition'].startsWith('attachment;')).toBe(true);
    expect(c['X-Content-Type-Options']).toBe('nosniff');
    expect(c['Cache-Control']).toBe('private, no-store');
    expect(c['Content-Security-Policy']).toBe("default-src 'none'; sandbox");
  });

  it('inline só quando pedido (visualizador), com os mesmos cabeçalhos de segurança', () => {
    const c = cabecalhosDownload('a.pdf', 'a.pdf', 5, { disposicao: 'inline' });
    expect(c['Content-Disposition'].startsWith('inline;')).toBe(true);
    expect(c['Cache-Control']).toBe('private, no-store');
  });

  it('prefixo COPIA-NAO-CONTROLADA_ entra no nome e passa pela sanitização', () => {
    const c = cabecalhosDownload('planilha.xlsx', 'Anexos/planilha.xlsx', 5, { prefixo: PREFIXO_COPIA_NAO_CONTROLADA });
    expect(c['Content-Disposition']).toContain('filename="COPIA-NAO-CONTROLADA_planilha.xlsx"');
    expect(c['Content-Disposition']).toContain(`filename*=UTF-8''COPIA-NAO-CONTROLADA_planilha.xlsx`);
  });

  it('nome com caracteres especiais do RFC 5987 é codificado', () => {
    // `*` é caractere inválido de nome (vira hífen); aspas simples e parênteses são codificados.
    const c = cabecalhosDownload("a'b(c)*d.pdf", 'a.pdf', 1);
    expect(c['Content-Disposition']).toContain(`filename*=UTF-8''a%27b%28c%29-d.pdf`);
  });
});
