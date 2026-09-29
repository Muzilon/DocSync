import { beforeAll, describe, expect, it } from 'vitest';
import { CLIENT, TENANT, criarEntraFalso, type EntraFalso } from '../apoio-testes.ts';
import { TokenInvalido, emailDeUpn, emailDoToken, validarToken } from './token.ts';

const config = { tenantId: TENANT, clientId: CLIENT };
let entra: EntraFalso;

beforeAll(async () => {
  entra = await criarEntraFalso();
});

describe('validarToken', () => {
  it('aceita token v2 do locatário com audiência api://{clientId}', async () => {
    const token = await entra.token({ oid: 'oid-1', preferred_username: 'Fulano@Exemplo.test' });
    await expect(validarToken(token, config, entra.chaves)).resolves.toEqual({
      oid: 'oid-1',
      email: 'fulano@exemplo.test',
      nome: 'Pessoa Fictícia',
    });
  });

  it('aceita audiência igual ao clientId', async () => {
    const token = await entra.token({ aud: CLIENT });
    await expect(validarToken(token, config, entra.chaves)).resolves.toBeTruthy();
  });

  it('aceita emissor v1 (sts.windows.net) do mesmo locatário', async () => {
    const token = await entra.token({ iss: `https://sts.windows.net/${TENANT}/` });
    await expect(validarToken(token, config, entra.chaves)).resolves.toBeTruthy();
  });

  const recusas: [string, () => Promise<string>][] = [
    ['assinatura de chave fora do JWKS', () => entra.token({}, { chave: entra.chaveEstranha })],
    ['audiência de outro aplicativo', () => entra.token({ aud: 'api://outro-app' })],
    ['emissor de outro locatário', () => entra.token({ iss: 'https://login.microsoftonline.com/outro/v2.0' })],
    ['tid de outro locatário', () => entra.token({ tid: 'outro' })],
    ['token vencido', () => entra.token({}, { expiraEm: Math.floor(Date.now() / 1000) - 3600 })],
    ['sem o escopo acesso_usuario', () => entra.token({ scp: 'User.Read' })],
    ['sem oid', () => entra.token({ oid: undefined })],
  ];
  for (const [caso, gerar] of recusas) {
    it(`recusa ${caso}`, async () => {
      await expect(validarToken(await gerar(), config, entra.chaves)).rejects.toBeInstanceOf(TokenInvalido);
    });
  }

  it('recusa texto que não é JWT', async () => {
    await expect(validarToken('nao-e-um-token', config, entra.chaves)).rejects.toBeInstanceOf(TokenInvalido);
  });
});

describe('e-mail a partir das claims', () => {
  it('usa email antes de preferred_username e upn', () => {
    expect(
      emailDoToken({ email: 'A@exemplo.test', preferred_username: 'b@exemplo.test', upn: 'c@exemplo.test' }),
    ).toBe('a@exemplo.test');
    expect(emailDoToken({ preferred_username: 'B@exemplo.test', upn: 'c@exemplo.test' })).toBe('b@exemplo.test');
  });

  it('converte o upn de convidado (#EXT#) no e-mail original', () => {
    expect(emailDeUpn('fulano_gmail.com#EXT#@locatario.onmicrosoft.com')).toBe('fulano@gmail.com');
    expect(emailDeUpn('nome_com_sublinhado_exemplo.test#EXT#@x.onmicrosoft.com')).toBe(
      'nome_com_sublinhado@exemplo.test',
    );
    expect(emailDoToken({ upn: 'Fulano_Gmail.com#EXT#@locatario.onmicrosoft.com' })).toBe('fulano@gmail.com');
  });

  it('remove o prefixo live.com# (tokens v1 de conta pessoal)', () => {
    expect(emailDoToken({ unique_name: 'live.com#fulano@exemplo.test' })).toBe('fulano@exemplo.test');
  });

  it('devolve null sem nenhum e-mail', () => {
    expect(emailDoToken({ name: 'Sem e-mail' })).toBeNull();
    expect(emailDoToken({ preferred_username: 'sem-arroba' })).toBeNull();
  });
});
