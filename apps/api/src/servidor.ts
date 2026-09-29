import { criarApp } from './app.ts';
import { ArmazenamentoLocal } from './armazenamento/arquivos.ts';
import { abrirBanco } from './banco/conexao.ts';
import { lerConfiguracao } from './config.ts';

const config = lerConfiguracao();
const banco = await abrirBanco(config.bancoPasta);
const app = criarApp({
  banco,
  armazenamento: new ArmazenamentoLocal(config.armazenamentoPasta),
  autenticacao: config.autenticacao,
  // Logs sem token: o cabeçalho Authorization é sempre ocultado.
  logger: { level: 'info', redact: ['req.headers.authorization'] },
});

async function encerrar() {
  await app.close();
  await banco.close();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

try {
  await app.listen({ port: config.porta, host: '127.0.0.1' });
} catch (erro) {
  app.log.error(erro);
  await banco.close();
  process.exit(1);
}
