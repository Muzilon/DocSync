import { criarApp } from './app.ts';

const porta = Number(process.env.API_PORTA ?? 3001);
const app = criarApp();

try {
  await app.listen({ port: porta, host: '127.0.0.1' });
  console.log(`API do DocSync em http://127.0.0.1:${porta}`);
} catch (erro) {
  console.error(erro);
  process.exit(1);
}
