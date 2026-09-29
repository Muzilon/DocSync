import { describe, expect, it } from 'vitest';
import { cabecalhosDownload } from './download.ts';

describe('cabecalhosDownload (contrato F4, 4.3; decisão 0014)', () => {
  it('nome com acento: filename ASCII com _ e filename* em UTF-8 percent-encoded', () => {
    const c = cabecalhosDownload('Relatório de Inspeção.pdf', 'Relatório de Inspeção.pdf', 10);
    expect(c['Content-Disposition']).toBe(
      `attachment; filename="Relat_rio de Inspe__o.pdf"; filename*=UTF-8''Relat%C3%B3rio%20de%20Inspe%C3%A7%C3%A3o.pdf`,
    );
    expect(c['Content-Type']).toBe('application/pdf');
    expect(c['Content-Length']).toBe('10');
  });

  it('nome no formato da decisão 0014 (com = e _) passa inteiro nos dois parâmetros', () => {
    const nome = 'PR-QUA-0010-Procedimento de auditoria interna_1=3.pdf';
    const c = cabecalhosDownload(nome, 'x.pdf', 1);
    expect(c['Content-Disposition']).toBe(
      `attachment; filename="${nome}"; filename*=UTF-8''PR-QUA-0010-Procedimento%20de%20auditoria%20interna_1%3D3.pdf`,
    );
  });

  it('aspas e barra invertida nunca entram no filename ASCII (quebrariam o cabeçalho)', () => {
    const c = cabecalhosDownload('a"b\\c.pdf', 'a.pdf', 1);
    expect(c['Content-Disposition']).toContain('filename="abc.pdf"');
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

  it('attachment sempre, nosniff, no-store e CSP sandbox', () => {
    const c = cabecalhosDownload('a.pdf', 'a.pdf', 5);
    expect(c['Content-Disposition'].startsWith('attachment;')).toBe(true);
    expect(c['X-Content-Type-Options']).toBe('nosniff');
    expect(c['Cache-Control']).toBe('private, no-store');
    expect(c['Content-Security-Policy']).toBe("default-src 'none'; sandbox");
  });

  it('nome com caracteres especiais do RFC 5987 é codificado', () => {
    const c = cabecalhosDownload("a'b(c)*d.pdf", 'a.pdf', 1);
    expect(c['Content-Disposition']).toContain(`filename*=UTF-8''a%27b%28c%29%2Ad.pdf`);
  });
});
