import { mkdir, readdir, readFile } from 'node:fs/promises';
import { PGlite, type PGliteInterface, type Transaction } from '@electric-sql/pglite';

/** Conexão com o banco (PGlite local, decisão 0003). */
export type Banco = PGliteInterface;
/** Qualquer coisa que execute SQL: o banco ou uma transação aberta. */
export type Executor = PGliteInterface | Transaction;

/** Pasta das migrações: apps/api/migracoes (mesma profundidade a partir de src/ e dist/). */
const PASTA_MIGRACOES = new URL('../../migracoes/', import.meta.url);
const NOME_MIGRACAO = /^(\d{4})_[a-z0-9_]+\.sql$/;

/**
 * Abre o banco e aplica as migrações pendentes.
 * @param pasta caminho absoluto da pasta de dados, ou 'memoria' (testes).
 */
export async function abrirBanco(pasta: string | 'memoria'): Promise<Banco> {
  let banco: PGlite;
  if (pasta === 'memoria') {
    banco = await PGlite.create();
  } else {
    await mkdir(pasta, { recursive: true });
    banco = await PGlite.create(pasta);
  }
  await aplicarMigracoes(banco);
  return banco;
}

/**
 * Aplica, em ordem, cada arquivo `NNNN_nome.sql` de apps/api/migracoes ainda não
 * registrado na tabela `migracoes`. Cada migração roda numa transação própria.
 * Migração aplicada nunca é editada: mudança nova = arquivo novo.
 */
export async function aplicarMigracoes(banco: Banco): Promise<string[]> {
  await banco.exec(`
    CREATE TABLE IF NOT EXISTS migracoes (
      versao      text PRIMARY KEY,
      arquivo     text NOT NULL,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  const aplicadas = new Set(
    (await banco.query<{ versao: string }>('SELECT versao FROM migracoes')).rows.map((l) => l.versao),
  );
  const arquivos = (await readdir(PASTA_MIGRACOES)).filter((a) => NOME_MIGRACAO.test(a)).sort();
  const novas: string[] = [];
  for (const arquivo of arquivos) {
    const versao = NOME_MIGRACAO.exec(arquivo)![1]!;
    if (aplicadas.has(versao)) continue;
    const sql = await readFile(new URL(arquivo, PASTA_MIGRACOES), 'utf8');
    await banco.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO migracoes (versao, arquivo) VALUES ($1, $2)', [versao, arquivo]);
    });
    novas.push(arquivo);
  }
  return novas;
}
