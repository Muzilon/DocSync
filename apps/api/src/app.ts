import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Banco } from './banco/conexao.ts';
import { enviarErro, registrarAutenticacao } from './autenticacao/plugin.ts';
import { provedorChavesEntra, type ProvedorChaves } from './autenticacao/token.ts';
import type { ConfiguracaoAutenticacao } from './config.ts';
import { registrarRotasPessoas } from './rotas/pessoas.ts';

export interface OpcoesApp {
  banco: Banco;
  autenticacao: ConfiguracaoAutenticacao;
  /** Chaves do Entra. Padrão: JWKS remoto do locatário. Nos testes, um JWKS local. */
  chaves?: ProvedorChaves;
  logger?: FastifyServerOptions['logger'];
}

/**
 * Monta a API sem abrir porta, para ser usada pelo servidor e pelos testes.
 * Sem prefixo de rota (a interface chama /api/..., e o proxy do Vite remove o /api).
 * Sem CORS: o navegador só fala com a API pelo proxy, na mesma origem.
 */
export function criarApp(opcoes: OpcoesApp): FastifyInstance {
  const app = Fastify({ logger: opcoes.logger ?? false });
  const chaves = opcoes.chaves ?? provedorChavesEntra(opcoes.autenticacao.tenantId);

  app.setErrorHandler((erro: { statusCode?: number }, requisicao, resposta) => {
    if (erro.statusCode !== undefined && erro.statusCode >= 400 && erro.statusCode < 500) {
      // Ex.: JSON malformado ou tipo de conteúdo não aceito.
      return enviarErro(resposta, erro.statusCode, { codigo: 'dados_invalidos', mensagem: 'Requisição inválida.' });
    }
    requisicao.log.error(erro);
    return enviarErro(resposta, 500, { codigo: 'erro_interno' });
  });

  // Verificação de funcionamento. Pública; não expõe versão, ambiente nem configuração.
  app.get('/saude', async () => ({ status: 'ok' }));

  // Tudo o que está neste escopo exige token válido do Entra.
  app.register(async (escopo) => {
    registrarAutenticacao(escopo, { banco: opcoes.banco, config: opcoes.autenticacao, chaves });
    registrarRotasPessoas(escopo, opcoes.banco);
  });

  return app;
}
