/**
 * Apoio aos testes: um "Entra" falso com JWKS local (nada de internet nos testes)
 * e a API montada sobre um banco PGlite em memória. Só dados fictícios.
 */
import { randomUUID } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import type { FastifyInstance, FastifyServerOptions, LightMyRequestResponse } from 'fastify';
import { criarApp } from './app.ts';
import { ArmazenamentoEmMemoria } from './armazenamento/arquivos.ts';
import { abrirBanco, type Banco } from './banco/conexao.ts';
import type { ProvedorChaves } from './autenticacao/token.ts';

export const TENANT = '11111111-1111-1111-1111-111111111111';
export const CLIENT = '22222222-2222-2222-2222-222222222222';
export const EMAIL_ADMIN_INICIAL = 'admin.inicial@exemplo.test';

type ChavePrivada = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export interface EntraFalso {
  chaves: ProvedorChaves;
  /** Assina um token com a chave publicada no JWKS local. */
  token(claims?: JWTPayload, opcoes?: { chave?: ChavePrivada; kid?: string; expiraEm?: string | number }): Promise<string>;
  /** Chave que NÃO está no JWKS (para simular assinatura inválida). */
  chaveEstranha: ChavePrivada;
}

export async function criarEntraFalso(): Promise<EntraFalso> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const estranha = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'chave-teste', alg: 'RS256', use: 'sig' };
  return {
    chaves: createLocalJWKSet({ keys: [jwk] }),
    chaveEstranha: estranha.privateKey,
    async token(claims = {}, opcoes = {}) {
      return new SignJWT({
        iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
        aud: `api://${CLIENT}`,
        tid: TENANT,
        scp: 'acesso_usuario',
        oid: randomUUID(),
        name: 'Pessoa Fictícia',
        preferred_username: `pessoa.${randomUUID().slice(0, 8)}@exemplo.test`,
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid: opcoes.kid ?? 'chave-teste' })
        .setIssuedAt()
        .setExpirationTime(opcoes.expiraEm ?? '1h')
        .sign(opcoes.chave ?? privateKey);
    },
  };
}

export interface Ambiente {
  app: FastifyInstance;
  banco: Banco;
  entra: EntraFalso;
  /** Arquivos gravados pela API (em memória). */
  armazenamento: ArmazenamentoEmMemoria;
  /** Faz uma requisição com um token para a identidade dada. */
  chamar(
    identidade: JWTPayload,
    metodo: 'GET' | 'HEAD' | 'POST' | 'PATCH',
    url: string,
    corpo?: unknown,
  ): Promise<LightMyRequestResponse>;
  /** Envia um formulário multipart/form-data com um token para a identidade dada. */
  enviarFormulario(identidade: JWTPayload, url: string, partes: ParteFormulario[]): Promise<LightMyRequestResponse>;
  fechar(): Promise<void>;
}

/** Banco-modelo já migrado; cada teste recebe uma cópia (clone é bem mais rápido que criar). */
let modelo: Promise<Banco> | undefined;

export async function criarAmbiente(
  entra: EntraFalso,
  opcoes: { areaAdministradorInicial?: string | null; logger?: FastifyServerOptions['logger'] } = {},
): Promise<Ambiente> {
  modelo ??= abrirBanco('memoria');
  const banco = await (await modelo).clone();
  const armazenamento = new ArmazenamentoEmMemoria();
  const app = criarApp({
    banco,
    armazenamento,
    chaves: entra.chaves,
    ...(opcoes.logger === undefined ? {} : { logger: opcoes.logger }),
    autenticacao: {
      tenantId: TENANT,
      clientId: CLIENT,
      administradoresIniciais: [EMAIL_ADMIN_INICIAL],
      areaAdministradorInicial: opcoes.areaAdministradorInicial === undefined ? 'Qualidade' : opcoes.areaAdministradorInicial,
    },
  });
  return {
    app,
    banco,
    entra,
    armazenamento,
    async chamar(identidade, metodo, url, corpo) {
      const token = await entra.token(identidade);
      return app.inject({
        method: metodo,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(corpo === undefined ? {} : { payload: corpo as object }),
      });
    },
    async enviarFormulario(identidade, url, partes) {
      const token = await entra.token(identidade);
      const { corpo, tipo } = montarFormulario(partes);
      return app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}`, 'content-type': tipo },
        payload: corpo,
      });
    },
    async fechar() {
      await app.close();
      await banco.close();
    },
  };
}

/** Identidades fictícias estáveis (oid fixo = mesma conta do Entra). */
export const ADMIN = { oid: 'oid-admin', preferred_username: EMAIL_ADMIN_INICIAL, name: 'Admin Fictício' };
export function pessoaFicticia(apelido: string): JWTPayload {
  return { oid: `oid-${apelido}`, preferred_username: `${apelido}@exemplo.test`, name: `Pessoa ${apelido}` };
}

// --- Formulário multipart (montado à mão; nada de dependência extra) ----------------

export type ParteFormulario =
  | { campo: string; valor: string; tipo?: string }
  | { campo: string; arquivo: string; conteudo: Buffer | string; tipo?: string };

export function montarFormulario(partes: readonly ParteFormulario[]): { corpo: Buffer; tipo: string } {
  const fronteira = `----docsync-teste-${randomUUID()}`;
  const pedacos: Buffer[] = [];
  for (const parte of partes) {
    let cabecalho = `--${fronteira}\r\nContent-Disposition: form-data; name="${parte.campo}"`;
    let conteudo: Buffer;
    if ('arquivo' in parte) {
      cabecalho += `; filename="${parte.arquivo}"\r\nContent-Type: ${parte.tipo ?? 'application/octet-stream'}`;
      conteudo = Buffer.isBuffer(parte.conteudo) ? parte.conteudo : Buffer.from(parte.conteudo);
    } else {
      if (parte.tipo) cabecalho += `\r\nContent-Type: ${parte.tipo}`;
      conteudo = Buffer.from(parte.valor);
    }
    pedacos.push(Buffer.from(`${cabecalho}\r\n\r\n`), conteudo, Buffer.from('\r\n'));
  }
  pedacos.push(Buffer.from(`--${fronteira}--\r\n`));
  return { corpo: Buffer.concat(pedacos), tipo: `multipart/form-data; boundary=${fronteira}` };
}

