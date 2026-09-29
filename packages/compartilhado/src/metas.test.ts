import { describe, expect, it } from 'vitest';
import type { StatusDocumento } from './documentos.ts';
import { META_DIAS_CONCLUSAO, META_DIAS_INICIO_REVISAO, avaliarMetas, concluidoNaMeta } from './metas.ts';

const HOJE = '2026-09-29';

function doc(extra: { status?: StatusDocumento; dataRecebimento?: string; dataInicioRevisao?: string | null; dataAprovacao?: string | null } = {}) {
  return {
    status: extra.status ?? 'Em revisão da qualidade',
    dataRecebimento: extra.dataRecebimento ?? '2026-09-01',
    dataInicioRevisao: extra.dataInicioRevisao ?? null,
    dataAprovacao: extra.dataAprovacao ?? null,
  };
}

describe('avaliarMetas (decisão 0012; contrato F5, 5.2)', () => {
  it('limites: 14 e 40 dias corridos', () => {
    expect(META_DIAS_INICIO_REVISAO).toBe(14);
    expect(META_DIAS_CONCLUSAO).toBe(40);
  });

  it('início da revisão cumprida no limite (14 dias) e estourada em 15', () => {
    const noLimite = avaliarMetas(doc({ dataInicioRevisao: '2026-09-15' }), HOJE).inicioRevisao;
    expect(noLimite).toEqual({ estado: 'cumprida', dias: 14, limite: 14, texto: 'Iniciada em 14 dias (meta: 14)', tom: 'sucesso' });
    const estourada = avaliarMetas(doc({ dataInicioRevisao: '2026-09-16' }), HOJE).inicioRevisao;
    expect(estourada).toEqual({ estado: 'estourada', dias: 15, limite: 14, texto: 'Iniciada em 15 dias (meta: 14)', tom: 'erro' });
  });

  it('conclusão cumprida no limite (40 dias) e estourada em 41', () => {
    const noLimite = avaliarMetas(doc({ status: 'Aprovado', dataInicioRevisao: '2026-09-02', dataAprovacao: '2026-10-11' }), HOJE).conclusao;
    expect(noLimite).toEqual({ estado: 'cumprida', dias: 40, limite: 40, texto: 'Concluída em 40 dias (meta: 40)', tom: 'sucesso' });
    const estourada = avaliarMetas(doc({ status: 'Aprovado', dataInicioRevisao: '2026-09-02', dataAprovacao: '2026-10-12' }), HOJE).conclusao;
    expect(estourada).toEqual({ estado: 'estourada', dias: 41, limite: 40, texto: 'Concluída em 41 dias (meta: 40)', tom: 'erro' });
  });

  it('sem marco: no prazo enquanto hoje está dentro do limite', () => {
    const m = avaliarMetas(doc({ status: 'Recebido', dataRecebimento: '2026-09-20' }), HOJE);
    expect(m.inicioRevisao).toEqual({ estado: 'no_prazo', dias: 9, limite: 14, texto: 'Ainda não iniciada: 9 dias (meta: 14)', tom: 'neutro' });
    expect(m.conclusao).toEqual({ estado: 'no_prazo', dias: 9, limite: 40, texto: 'Em andamento: 9 dias (meta: 40)', tom: 'neutro' });
  });

  it('sem marco: estourada quando hoje passou do limite (16 dias; 41 dias)', () => {
    const inicio = avaliarMetas(doc({ status: 'Recebido', dataRecebimento: '2026-09-13' }), HOJE).inicioRevisao;
    expect(inicio).toEqual({ estado: 'estourada', dias: 16, limite: 14, texto: 'Ainda não iniciada: 16 dias (meta: 14)', tom: 'erro' });
    const conclusao = avaliarMetas(doc({ dataRecebimento: '2026-08-19', dataInicioRevisao: '2026-08-20' }), HOJE).conclusao;
    expect(conclusao).toEqual({ estado: 'estourada', dias: 41, limite: 40, texto: 'Em andamento: 41 dias (meta: 40)', tom: 'erro' });
  });

  it('Cancelado → não se aplica nas duas', () => {
    const m = avaliarMetas(doc({ status: 'Cancelado', dataInicioRevisao: '2026-09-02', dataAprovacao: '2026-09-10' }), HOJE);
    expect(m.inicioRevisao).toEqual({ estado: 'nao_se_aplica', dias: null, limite: 14, texto: 'Não se aplica', tom: 'neutro' });
    expect(m.conclusao).toEqual({ estado: 'nao_se_aplica', dias: null, limite: 40, texto: 'Não se aplica', tom: 'neutro' });
  });

  it('Aprovado sem nunca ter entrado em revisão (importado): início não se aplica; conclusão avaliada', () => {
    const m = avaliarMetas(doc({ status: 'Aprovado', dataAprovacao: '2026-09-20' }), HOJE);
    expect(m.inicioRevisao.estado).toBe('nao_se_aplica');
    expect(m.conclusao).toMatchObject({ estado: 'cumprida', dias: 19 });
  });

  it('singular: "1 dia"', () => {
    expect(avaliarMetas(doc({ dataRecebimento: '2026-09-01', dataInicioRevisao: '2026-09-02' }), HOJE).inicioRevisao.texto).toBe(
      'Iniciada em 1 dia (meta: 14)',
    );
  });

  it('concluidoNaMeta: 40 dentro, 41 fora, sem aprovação falso', () => {
    expect(concluidoNaMeta({ dataRecebimento: '2026-09-01', dataAprovacao: '2026-10-11' })).toBe(true);
    expect(concluidoNaMeta({ dataRecebimento: '2026-09-01', dataAprovacao: '2026-10-12' })).toBe(false);
    expect(concluidoNaMeta({ dataRecebimento: '2026-09-01', dataAprovacao: null })).toBe(false);
  });
});
