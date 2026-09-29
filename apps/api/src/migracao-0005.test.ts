/**
 * Migração 0005 aplicada sobre uma base já na 0004 com documentos e eventos (contrato F5, seção 7).
 * Nada de internet; banco PGlite em memória.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, type Banco } from './banco/conexao.ts';

let banco: Banco;
afterEach(async () => {
  await banco.close();
});

describe('migração 0005 — responsável pela etapa', () => {
  it('aplica sobre a 0004: colunas novas nulas, referência a usuarios, índice criado, histórico continua imutável', async () => {
    banco = await PGlite.create();
    expect(await aplicarMigracoes(banco, '0004')).toHaveLength(4);
    await banco.query("INSERT INTO usuarios (id, nome, email) VALUES ('USR-teste', 'Teste', 'teste@exemplo.test')");
    await banco.query(
      `INSERT INTO documentos (id, titulo, status, tipo_documento_id, data_recebimento, remetente, area_id,
         nome_pasta, nome_arquivo_principal, criado_por, hash_cadastro)
       SELECT 'DOC-antigo', 'Doc', 'Recebido', (SELECT id FROM tipos_documento LIMIT 1), '2026-09-01', 'Alguém',
              (SELECT id FROM areas LIMIT 1), 'Doc', 'doc.pdf', 'USR-teste', 'hash'`,
    );
    await banco.query(
      `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, autor_id, autor_nome, responsavel)
       VALUES ('HIST-antigo', 'DOC-antigo', 'CRIACAO', 'Recebido', 'USR-teste', 'Teste', 'Nome livre antigo')`,
    );

    expect(await aplicarMigracoes(banco, '0005')).toEqual(['0005_responsavel.sql']);

    // Linhas existentes: NULL nas colunas novas; o nome antigo do evento fica como estava.
    const doc = await banco.query<{ responsavel_id: string | null }>('SELECT responsavel_id FROM documentos');
    expect(doc.rows).toEqual([{ responsavel_id: null }]);
    const evento = await banco.query<{ responsavel_id: string | null; responsavel: string }>(
      'SELECT responsavel_id, responsavel FROM eventos_historico',
    );
    expect(evento.rows).toEqual([{ responsavel_id: null, responsavel: 'Nome livre antigo' }]);

    // Referência a usuarios: ID inexistente é recusado nas duas tabelas.
    await expect(banco.query("UPDATE documentos SET responsavel_id = 'USR-ninguem'")).rejects.toThrow();
    await banco.query("UPDATE documentos SET responsavel_id = 'USR-teste'");
    await expect(
      banco.query(
        `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, autor_id, autor_nome, responsavel_id)
         VALUES ('HIST-2', 'DOC-antigo', 'STATUS', 'Em revisão da qualidade', 'USR-teste', 'Teste', 'USR-ninguem')`,
      ),
    ).rejects.toThrow();
    await banco.query(
      `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, status_anterior, autor_id, autor_nome, responsavel, responsavel_id)
       VALUES ('HIST-2', 'DOC-antigo', 'STATUS', 'Em revisão da qualidade', 'Recebido', 'USR-teste', 'Teste', 'Teste', 'USR-teste')`,
    );

    // Imutabilidade preservada depois do ADD COLUMN.
    await expect(banco.query("UPDATE eventos_historico SET responsavel_id = NULL WHERE id = 'HIST-2'")).rejects.toThrow(/imutável/);
    await expect(banco.query("DELETE FROM eventos_historico WHERE id = 'HIST-2'")).rejects.toThrow(/imutável/);
    await expect(banco.query('TRUNCATE eventos_historico')).rejects.toThrow(/imutável/);

    // Índice das subconsultas do painel.
    const indice = await banco.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'eventos_historico' AND indexname = 'eventos_historico_documento_tipo_status'",
    );
    expect(indice.rows).toHaveLength(1);

    // Reaplicar não faz nada.
    expect(await aplicarMigracoes(banco, '0005')).toEqual([]);
  });
});
