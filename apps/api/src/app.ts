import Fastify, { type FastifyInstance } from 'fastify';

/** Monta a API sem abrir porta, para ser usada pelo servidor e pelos testes. */
export function criarApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Verificação de funcionamento. Não expõe versão, ambiente nem configuração.
  app.get('/saude', async () => ({ status: 'ok' }));

  return app;
}
