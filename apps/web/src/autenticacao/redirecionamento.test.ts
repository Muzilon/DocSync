import { describe, expect, it } from 'vitest';
import { destinoSeguro, urlDeLogin } from './redirecionamento.ts';

describe('destinoSeguro', () => {
  it.each(['/', '/pessoas', '/pessoas?busca=ana', '/documentos/DOC-1#historico'])('aceita rota interna %s', (rota) => {
    expect(destinoSeguro(rota)).toBe(rota);
  });

  it.each([
    ['protocolo relativo', '//site-externo.com'],
    ['URL absoluta', 'https://site-externo.com/pessoas'],
    ['javascript:', 'javascript:alert(1)'],
    ['barra invertida', '/\\site-externo.com'],
    ['caractere de controle', '/\t/site-externo.com'],
    ['sem barra inicial', 'pessoas'],
    ['vazio', ''],
    ['a própria tela de login', '/login?destino=/pessoas'],
  ])('recusa %s', (_caso, valor) => {
    expect(destinoSeguro(valor)).toBe('/');
  });

  it('recusa valores que não são texto', () => {
    expect(destinoSeguro(null)).toBe('/');
    expect(destinoSeguro(undefined)).toBe('/');
    expect(destinoSeguro(42)).toBe('/');
  });
});

describe('urlDeLogin', () => {
  it('guarda o destino validado e o aviso', () => {
    expect(urlDeLogin('/pessoas', 'sessao_expirada')).toBe('/login?destino=%2Fpessoas&aviso=sessao_expirada');
  });

  it('descarta destino externo', () => {
    expect(urlDeLogin('//site-externo.com')).toBe('/login');
  });
});
