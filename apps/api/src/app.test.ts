import { describe, expect, it } from 'vitest';
import { criarApp } from './app.ts';

describe('API', () => {
  it('responde à verificação de funcionamento', async () => {
    const app = criarApp();
    const resposta = await app.inject({ method: 'GET', url: '/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });

  it('responde 404 para rota inexistente', async () => {
    const app = criarApp();
    const resposta = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(resposta.statusCode).toBe(404);
  });
});
