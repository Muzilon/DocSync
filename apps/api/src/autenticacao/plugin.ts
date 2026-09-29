import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pode, type Acao, type ErroApi } from '@docsync/compartilhado';
import type { Banco } from '../banco/conexao.ts';
import type { Usuario } from '../banco/pessoas.ts';
import type { ConfiguracaoAutenticacao } from '../config.ts';
import { identificarPessoa } from './identificacao.ts';
import { TokenInvalido, validarToken, type ProvedorChaves } from './token.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Pessoa autenticada, lida do banco nesta requisição. Definida só nas rotas protegidas. */
    usuario: Usuario;
  }
}

export function enviarErro(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

export interface OpcoesAutenticacao {
  banco: Banco;
  config: ConfiguracaoAutenticacao;
  chaves: ProvedorChaves;
}

/**
 * Hook das rotas protegidas: valida o token Bearer do Entra, localiza a pessoa
 * no banco (perfil atual a cada requisição) e barra pessoa inativa.
 * A identidade vem só do token; nada do corpo é usado para isso.
 */
export function registrarAutenticacao(escopo: FastifyInstance, opcoes: OpcoesAutenticacao) {
  escopo.decorateRequest('usuario', null as unknown as Usuario);

  escopo.addHook('onRequest', async (requisicao, resposta) => {
    const cabecalho = requisicao.headers.authorization ?? '';
    const [tipo, token] = cabecalho.split(' ');
    if (tipo?.toLowerCase() !== 'bearer' || !token) {
      resposta.header('WWW-Authenticate', 'Bearer');
      return enviarErro(resposta, 401, { codigo: 'nao_autenticado' });
    }

    let identidade;
    try {
      identidade = await validarToken(token, opcoes.config, opcoes.chaves);
    } catch (erro) {
      if (!(erro instanceof TokenInvalido)) throw erro;
      // Registra só o motivo (código do jose), nunca o token.
      requisicao.log.info({ motivo: erro.message }, 'token recusado');
      resposta.header('WWW-Authenticate', 'Bearer error="invalid_token"');
      return enviarErro(resposta, 401, { codigo: 'nao_autenticado' });
    }

    const resultado = await identificarPessoa(
      opcoes.banco,
      identidade,
      opcoes.config.administradoresIniciais,
      opcoes.config.areaAdministradorInicial,
    );
    if (resultado.tipo === 'ok' && resultado.aviso) requisicao.log.warn(resultado.aviso);
    if (resultado.tipo === 'sem_email') {
      return enviarErro(resposta, 401, {
        codigo: 'nao_autenticado',
        mensagem: 'A conta Microsoft não informou um e-mail. Peça ajuda ao administrador do DocSync.',
      });
    }
    if (resultado.tipo === 'conflito') {
      return enviarErro(resposta, 409, {
        codigo: 'conflito_identidade',
        mensagem: 'Este e-mail já está vinculado a outra conta Microsoft. Peça ajuda ao administrador do DocSync.',
      });
    }
    if (resultado.usuario.status === 'Inativo') {
      return enviarErro(resposta, 403, { codigo: 'inativo' });
    }
    requisicao.usuario = resultado.usuario;
  });
}

/** preHandler que exige uma ação da função única de permissão. */
export function exigir(acao: Acao) {
  return async (requisicao: FastifyRequest, resposta: FastifyReply) => {
    if (!pode(requisicao.usuario, acao)) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
  };
}
