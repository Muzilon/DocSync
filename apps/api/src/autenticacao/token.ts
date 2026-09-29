import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { ConfiguracaoAutenticacao } from '../config.ts';

/** Fonte das chaves públicas do Entra. Injetável: nos testes é um JWKS local. */
export type ProvedorChaves = JWTVerifyGetKey;

/** Escopo que a interface pede ao Entra (decisão 0008). */
export const ESCOPO_ESPERADO = 'acesso_usuario';

export function provedorChavesEntra(tenantId: string): ProvedorChaves {
  return createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`),
  );
}

/** Identidade comprovada extraída de um token válido. */
export interface Identidade {
  /** ID do objeto no Entra (claim oid): vínculo definitivo. */
  oid: string;
  /** E-mail em minúsculas, ou null se o token não trouxer nenhum. */
  email: string | null;
  nome: string | null;
}

export class TokenInvalido extends Error {}

/**
 * Converte o UPN de convidado (`fulano_gmail.com#EXT#@locatario.onmicrosoft.com`)
 * no e-mail original (`fulano@gmail.com`). Outros valores voltam como estão.
 */
export function emailDeUpn(upn: string): string {
  const marca = upn.toUpperCase().indexOf('#EXT#');
  if (marca < 0) return upn;
  const local = upn.slice(0, marca);
  const ultimo = local.lastIndexOf('_');
  return ultimo < 0 ? local : `${local.slice(0, ultimo)}@${local.slice(ultimo + 1)}`;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

/**
 * E-mail da pessoa, nas claims em ordem: email, preferred_username, upn e
 * unique_name (tokens v1). Contas convidadas: trata #EXT# e o prefixo `live.com#`.
 */
export function emailDoToken(claims: JWTPayload): string | null {
  for (const nome of ['email', 'preferred_username', 'upn', 'unique_name']) {
    const valor = texto(claims[nome]);
    if (!valor) continue;
    const semPrefixo = valor.replace(/^live\.com#/i, '');
    const email = emailDeUpn(semPrefixo).toLowerCase();
    if (email.includes('@')) return email;
  }
  return null;
}

/**
 * Valida assinatura, emissor (locatário), audiência, validade e escopo.
 * Aceita audiência `api://{clientId}` ou `{clientId}` e emissor v2 do locatário
 * (também o v1, `sts.windows.net`, caso o manifesto do app emita tokens v1).
 */
export async function validarToken(
  token: string,
  config: Pick<ConfiguracaoAutenticacao, 'tenantId' | 'clientId'>,
  chaves: ProvedorChaves,
): Promise<Identidade> {
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, chaves, {
      issuer: [
        `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        `https://sts.windows.net/${config.tenantId}/`,
      ],
      audience: [`api://${config.clientId}`, config.clientId],
      algorithms: ['RS256'],
      clockTolerance: 30,
      requiredClaims: ['exp', 'oid'],
    }));
  } catch (erro) {
    if (erro instanceof errors.JOSEError) throw new TokenInvalido(erro.code);
    throw erro;
  }
  if (claims.tid !== undefined && claims.tid !== config.tenantId) throw new TokenInvalido('locatario');
  const escopos = (texto(claims.scp) ?? '').split(' ');
  if (!escopos.includes(ESCOPO_ESPERADO)) throw new TokenInvalido('escopo');
  const oid = texto(claims.oid);
  if (!oid) throw new TokenInvalido('oid');
  return { oid, email: emailDoToken(claims), nome: texto(claims.name) };
}
