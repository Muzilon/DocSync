import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, CLIENT, EMAIL_ADMIN_INICIAL, TENANT, criarEntraFalso, type EntraFalso } from './apoio-testes.ts';
import { criarApp } from './app.ts';
import { ArmazenamentoLocal } from './armazenamento/arquivos.ts';
import { abrirBanco, type Banco } from './banco/conexao.ts';

/**
 * Regressão do relato "erro inesperado ao registrar documento": cadastro de ponta a ponta
 * com o armazenamento LOCAL em disco (os demais testes usam memória), banco PGlite em pasta
 * e HTTP de verdade (FormData do Node, como o navegador), com arquivo JPG de nome com espaço.
 */
let entra: EntraFalso;
let banco: Banco;
let pasta: string;
let app: ReturnType<typeof criarApp>;
let base: string;
let cabecalho: { authorization: string };

beforeEach(async () => {
  entra = await criarEntraFalso();
  pasta = await mkdtemp(join(tmpdir(), 'docsync-arq-'));
  banco = await abrirBanco(join(pasta, 'banco'));
  app = criarApp({
    banco,
    armazenamento: new ArmazenamentoLocal(join(pasta, 'arquivos')),
    chaves: entra.chaves,
    autenticacao: {
      tenantId: TENANT,
      clientId: CLIENT,
      administradoresIniciais: [EMAIL_ADMIN_INICIAL],
      areaAdministradorInicial: 'Qualidade',
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  cabecalho = { authorization: `Bearer ${await entra.token(ADMIN)}` };
  await fetch(`${base}/eu`, { headers: cabecalho }); // bootstrap do Administrador
});

afterEach(async () => {
  await app.close();
  await banco.close();
  await rm(pasta, { recursive: true, force: true });
});

describe('POST /documentos com armazenamento local em disco', () => {
  it('grava JPG de 14 KB com espaço no nome, sem anexos, e o arquivo baixa idêntico', async () => {
    const areas = (await (await fetch(`${base}/areas`, { headers: cabecalho })).json()) as { id: string; nome: string }[];
    const tipos = (await (await fetch(`${base}/tipos-documento`, { headers: cabecalho })).json()) as { id: string }[];
    const id = `DOC-${randomUUID()}`;
    const conteudo = Buffer.alloc(14 * 1024, 7);
    const formulario = new FormData();
    formulario.append(
      'dados',
      JSON.stringify({
        id,
        codigo: null,
        titulo: 'Oração',
        tipoDocumentoId: tipos[0]!.id,
        revisao: 0,
        remetente: 'Remetente Fictício',
        areaId: areas.find((a) => a.nome === 'Qualidade')!.id,
        disciplina: null,
        observacao: null,
      }),
    );
    formulario.append('arquivoPrincipal', new File([conteudo], 'pomba orando.jpg', { type: 'image/jpeg' }), 'pomba orando.jpg');

    const resposta = await fetch(`${base}/documentos`, { method: 'POST', headers: cabecalho, body: formulario });
    expect(resposta.status).toBe(201);
    expect(await readdir(join(pasta, 'arquivos', id))).toEqual(['pomba orando.jpg']);
    expect(await readFile(join(pasta, 'arquivos', id, 'pomba orando.jpg'))).toEqual(conteudo);
  });
});
