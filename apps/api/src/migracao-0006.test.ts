/**
 * Migração 0006: banco "antigo" (0002 aplicada sem hash_cadastro, como no banco local do Eric)
 * é levado até o estado atual e volta a cadastrar documentos. Nada de internet; PGlite em memória.
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN, CLIENT, EMAIL_ADMIN_INICIAL, TENANT, criarEntraFalso, montarFormulario } from './apoio-testes.ts';
import { criarApp } from './app.ts';
import { ArmazenamentoEmMemoria } from './armazenamento/arquivos.ts';
import { aplicarMigracoes, type Banco } from './banco/conexao.ts';

let banco: Banco;
afterEach(async () => {
  await banco.close();
});

/** Reproduz o estado antigo: 0001 normal e 0002 sem a coluna hash_cadastro, registrada como aplicada. */
async function criarBancoAntigo(): Promise<Banco> {
  const b = await PGlite.create();
  await aplicarMigracoes(b, '0001');
  const original = await readFile(new URL('../migracoes/0002_documentos.sql', import.meta.url), 'utf8');
  const antigo = original.replace(/^\s*hash_cadastro\s+text NOT NULL,\r?\n/m, '');
  expect(antigo).not.toBe(original);
  await b.transaction(async (tx) => {
    await tx.exec(antigo);
    await tx.query("INSERT INTO migracoes (versao, arquivo) VALUES ('0002', '0002_documentos.sql')");
  });
  return b;
}

describe('migração 0006 — hash_cadastro', () => {
  it('banco antigo sem a coluna: migra até o atual, preenche legados e cadastra documento pela API', async () => {
    banco = await criarBancoAntigo();
    await banco.query("INSERT INTO usuarios (id, nome, email) VALUES ('USR-teste', 'Teste', 'teste@exemplo.test')");
    await banco.query(
      `INSERT INTO documentos (id, titulo, status, tipo_documento_id, data_recebimento, remetente, area_id,
         nome_pasta, nome_arquivo_principal, criado_por)
       SELECT 'DOC-legado', 'Doc', 'Recebido', (SELECT id FROM tipos_documento LIMIT 1), '2026-09-01', 'Alguém',
              (SELECT id FROM areas LIMIT 1), 'Doc', 'doc.pdf', 'USR-teste'`,
    );

    const novas = await aplicarMigracoes(banco);
    expect(novas).toContain('0006_hash_cadastro_reparo.sql');

    const l = await banco.query<{ hash_cadastro: string }>("SELECT hash_cadastro FROM documentos WHERE id = 'DOC-legado'");
    expect(l.rows).toEqual([{ hash_cadastro: 'legado:DOC-legado' }]);
    const col = await banco.query<{ is_nullable: string }>(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'documentos' AND column_name = 'hash_cadastro'",
    );
    expect(col.rows).toEqual([{ is_nullable: 'NO' }]);

    // Cadastro de ponta a ponta (o caminho que dava 42703), e reenvio idêntico continua idempotente.
    const entra = await criarEntraFalso();
    const app = criarApp({
      banco,
      armazenamento: new ArmazenamentoEmMemoria(),
      chaves: entra.chaves,
      autenticacao: {
        tenantId: TENANT,
        clientId: CLIENT,
        administradoresIniciais: [EMAIL_ADMIN_INICIAL],
        areaAdministradorInicial: 'Qualidade',
      },
    });
    const auth = { authorization: `Bearer ${await entra.token(ADMIN)}` };
    await app.inject({ method: 'GET', url: '/eu', headers: auth });
    const areas = (await app.inject({ method: 'GET', url: '/areas', headers: auth })).json() as { id: string; nome: string }[];
    const tipos = (await app.inject({ method: 'GET', url: '/tipos-documento', headers: auth })).json() as { id: string }[];
    const dados = JSON.stringify({
      id: `DOC-${randomUUID()}`,
      codigo: null,
      titulo: 'Novo',
      tipoDocumentoId: tipos[0]!.id,
      revisao: 0,
      remetente: 'Fulano',
      areaId: areas.find((a) => a.nome === 'Qualidade')!.id,
      disciplina: null,
      observacao: null,
    });
    const enviar = () => {
      const { corpo, tipo } = montarFormulario([
        { campo: 'dados', valor: dados, tipo: 'application/json' },
        { campo: 'arquivoPrincipal', arquivo: 'novo.pdf', conteudo: '%PDF-1.4 teste', tipo: 'application/pdf' },
      ]);
      return app.inject({ method: 'POST', url: '/documentos', headers: { ...auth, 'content-type': tipo }, payload: corpo });
    };
    expect((await enviar()).statusCode).toBe(201);
    expect((await enviar()).statusCode).toBe(200);
    await app.close();
  });

  it('em banco criado do zero não muda nada (idempotente)', async () => {
    banco = await PGlite.create();
    await aplicarMigracoes(banco, '0005');
    expect(await aplicarMigracoes(banco)).toEqual(['0006_hash_cadastro_reparo.sql']);
    await banco.exec(await readFile(new URL('../migracoes/0006_hash_cadastro_reparo.sql', import.meta.url), 'utf8'));
  });
});
