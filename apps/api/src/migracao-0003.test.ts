/**
 * Migração 0003 aplicada sobre uma base já na 0002 com documentos (contrato F3, 2.3).
 * Nada de internet; banco PGlite em memória.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, type Banco } from './banco/conexao.ts';

let banco: Banco;
afterEach(async () => {
  await banco.close();
});

async function inserirDocumento(id: string, criadoEm: string, dataRevisao: string | null) {
  await banco.query(
    `INSERT INTO documentos (id, titulo, status, tipo_documento_id, data_recebimento, data_revisao, remetente, area_id,
       nome_pasta, nome_arquivo_principal, criado_por, hash_cadastro, criado_em)
     SELECT $1, 'Doc', 'Recebido', (SELECT id FROM tipos_documento LIMIT 1), '2026-09-01', $3, 'Alguém',
            (SELECT id FROM areas LIMIT 1), 'Doc', 'doc.pdf', 'USR-teste', 'hash-' || $1, $2::timestamptz`,
    [id, criadoEm, dataRevisao],
  );
}

describe('migração 0003 — prazo e reprogramação', () => {
  it('aplica sobre a 0002: preenche só quem não tinha prazo (criado_em + 30 no fuso de São Paulo)', async () => {
    banco = await PGlite.create();
    expect(await aplicarMigracoes(banco, '0002')).toEqual(['0001_pessoas_e_areas.sql', '0002_documentos.sql']);
    await banco.query("INSERT INTO usuarios (id, nome, email) VALUES ('USR-teste', 'Teste', 'teste@exemplo.test')");

    // 02:30 UTC de 30/09 ainda é 29/09 em São Paulo → prazo 29/10.
    await inserirDocumento('DOC-sem-prazo', '2026-09-30T02:30:00Z', null);
    // Importado com prazo próprio (F12): não muda.
    await inserirDocumento('DOC-com-prazo', '2026-09-30T02:30:00Z', '2027-03-01');
    // Virada de ano.
    await inserirDocumento('DOC-fim-de-ano', '2026-12-15T15:00:00Z', null);

    expect(await aplicarMigracoes(banco)).toEqual(['0003_prazo_e_reprogramacao.sql']);

    const { rows } = await banco.query<{ id: string; prazo: string | null; reprogramado: boolean; qtd: number }>(
      `SELECT id, to_char(data_revisao, 'YYYY-MM-DD') AS prazo, reprogramado, qtd_reprogramacoes AS qtd
       FROM documentos ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: 'DOC-com-prazo', prazo: '2027-03-01', reprogramado: false, qtd: 0 },
      { id: 'DOC-fim-de-ano', prazo: '2027-01-14', reprogramado: false, qtd: 0 },
      { id: 'DOC-sem-prazo', prazo: '2026-10-29', reprogramado: false, qtd: 0 },
    ]);

    // Tabela auxiliar lista só os alterados (plano de volta exato).
    const auxiliar = await banco.query<{ id_documento: string }>('SELECT id_documento FROM migracao_0003_prazos ORDER BY 1');
    expect(auxiliar.rows.map((l) => l.id_documento)).toEqual(['DOC-fim-de-ano', 'DOC-sem-prazo']);

    // Novo tipo de evento aceito; tipo inventado continua recusado.
    await banco.query(
      `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, autor_id, autor_nome)
       VALUES ('HIST-1', 'DOC-sem-prazo', 'REPROGRAMACAO', 'Recebido', 'USR-teste', 'Teste')`,
    );
    await expect(
      banco.query(
        `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, autor_id, autor_nome)
         VALUES ('HIST-2', 'DOC-sem-prazo', 'INVENTADO', 'Recebido', 'USR-teste', 'Teste')`,
      ),
    ).rejects.toThrow();

    // Reaplicar não faz nada.
    expect(await aplicarMigracoes(banco)).toEqual([]);
  });
});
