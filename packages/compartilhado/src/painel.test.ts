import { describe, expect, it } from 'vitest';
import type { StatusDocumento } from './documentos.ts';
import { FASE_DO_STATUS } from './documentos.ts';
import {
  DIAS_JANELA_VENCENDO,
  calcularKpis,
  etiquetaPrazo,
  filtrarCartoes,
  formatarDataCurta,
  normalizarBusca,
  type CartaoPainel,
} from './painel.ts';

const HOJE = '2026-09-29';

let sequencia = 0;
function cartao(extra: Partial<CartaoPainel> = {}): CartaoPainel {
  const status: StatusDocumento = extra.status ?? 'Recebido';
  sequencia++;
  return {
    id: `DOC-${sequencia}`,
    codigo: null,
    titulo: `Documento ${sequencia}`,
    revisao: 0,
    status,
    fase: FASE_DO_STATUS[status],
    tipoDocumento: 'PR - Procedimento',
    areaId: 'AREA-qualidade',
    area: 'Qualidade',
    remetente: 'Remetente Fictício',
    dataRecebimento: HOJE,
    dataRevisao: '2026-10-29',
    reprogramado: false,
    qtdReprogramacoes: 0,
    qtdDevolucoes: 0,
    dataAprovacao: null,
    versao: 1,
    criadoEm: '2026-09-29T12:00:00.000Z',
    dataModificacao: '2026-09-29T12:00:00.000Z',
    ...extra,
  };
}

describe('calcularKpis (P-12, P-13)', () => {
  it('janela de 5 dias: hoje e hoje+5 vencendo; hoje+6 fora; ontem atrasado', () => {
    expect(DIAS_JANELA_VENCENDO).toBe(5);
    const cartoes = [
      cartao({ dataRevisao: '2026-09-29' }), // hoje
      cartao({ dataRevisao: '2026-10-04' }), // hoje + 5
      cartao({ dataRevisao: '2026-10-05' }), // hoje + 6
      cartao({ dataRevisao: '2026-09-28' }), // ontem
    ];
    expect(calcularKpis(cartoes, HOJE)).toEqual({ emTramitacao: 4, vencendo: 2, atrasados: 1 });
  });

  it('cancelado nunca conta; aprovado não conta em nada', () => {
    const cartoes = [
      cartao({ status: 'Cancelado', dataRevisao: '2026-09-01' }),
      cartao({ status: 'Aprovado', dataRevisao: '2026-09-01' }),
      cartao({ status: 'Aprovado', dataRevisao: HOJE }),
      cartao({ status: 'Em revisão da qualidade', dataRevisao: '2026-09-01' }),
    ];
    expect(calcularKpis(cartoes, HOJE)).toEqual({ emTramitacao: 1, vencendo: 0, atrasados: 1 });
  });

  it('sem prazo conta só em emTramitacao', () => {
    expect(calcularKpis([cartao({ dataRevisao: null })], HOJE)).toEqual({ emTramitacao: 1, vencendo: 0, atrasados: 0 });
  });

  it('lista vazia → zeros', () => {
    expect(calcularKpis([], HOJE)).toEqual({ emTramitacao: 0, vencendo: 0, atrasados: 0 });
  });
});

describe('etiquetaPrazo (documento 03, 9.5)', () => {
  it('null sem prazo, Aprovado e Cancelado', () => {
    expect(etiquetaPrazo({ dataRevisao: null, status: 'Recebido' }, HOJE)).toBeNull();
    expect(etiquetaPrazo({ dataRevisao: '2026-09-01', status: 'Aprovado' }, HOJE)).toBeNull();
    expect(etiquetaPrazo({ dataRevisao: '2026-09-01', status: 'Cancelado' }, HOJE)).toBeNull();
  });

  it('dias = 6 verde com a data; dias = 5 âmbar', () => {
    expect(etiquetaPrazo({ dataRevisao: '2026-10-05', status: 'Recebido' }, HOJE)).toEqual({
      tom: 'verde',
      texto: 'Prazo: 05/10/2026',
      diasRestantes: 6,
    });
    expect(etiquetaPrazo({ dataRevisao: '2026-10-04', status: 'Recebido' }, HOJE)).toEqual({
      tom: 'ambar',
      texto: 'Vence em 5 dias',
      diasRestantes: 5,
    });
  });

  it('textos singular e plural', () => {
    const etiqueta = (dataRevisao: string) => etiquetaPrazo({ dataRevisao, status: 'Em Revisão' }, HOJE);
    expect(etiqueta('2026-09-29')).toMatchObject({ tom: 'ambar', texto: 'Vence hoje', diasRestantes: 0 });
    expect(etiqueta('2026-09-30')).toMatchObject({ tom: 'ambar', texto: 'Vence em 1 dia' });
    expect(etiqueta('2026-10-01')).toMatchObject({ tom: 'ambar', texto: 'Vence em 2 dias' });
    expect(etiqueta('2026-09-28')).toEqual({ tom: 'vermelho', texto: 'Atrasado há 1 dia', diasRestantes: -1 });
    expect(etiqueta('2026-09-19')).toEqual({ tom: 'vermelho', texto: 'Atrasado há 10 dias', diasRestantes: -10 });
  });

  it('formatarDataCurta → dd/mm/aaaa', () => {
    expect(formatarDataCurta('2026-01-05')).toBe('05/01/2026');
  });
});

describe('filtrarCartoes', () => {
  const cartoes = [
    cartao({ titulo: 'Instrução de Solda', codigo: 'IT-001', remetente: 'João Câmara', areaId: 'AREA-eng' }),
    cartao({ titulo: 'Procedimento de Compras', codigo: null, remetente: 'Maria', areaId: 'AREA-custos' }),
    cartao({ titulo: 'Relatório Ambiental', codigo: 'RL-ÁGUA-7', remetente: 'Núcleo SGI', areaId: 'AREA-eng' }),
  ];

  it('busca vazia ou só espaços não filtra', () => {
    expect(filtrarCartoes(cartoes, {})).toHaveLength(3);
    expect(filtrarCartoes(cartoes, { busca: '   ' })).toHaveLength(3);
    expect(filtrarCartoes(cartoes, { busca: '', areaId: null })).toHaveLength(3);
  });

  it('busca sem acento e sem diferenciar maiúsculas em título, código e remetente', () => {
    expect(filtrarCartoes(cartoes, { busca: 'INSTRUCAO' }).map((c) => c.titulo)).toEqual(['Instrução de Solda']);
    expect(filtrarCartoes(cartoes, { busca: 'rl-agua' }).map((c) => c.titulo)).toEqual(['Relatório Ambiental']);
    expect(filtrarCartoes(cartoes, { busca: 'camara' }).map((c) => c.titulo)).toEqual(['Instrução de Solda']);
    expect(filtrarCartoes(cartoes, { busca: 'Nucleo sgi' })).toHaveLength(1);
    expect(filtrarCartoes(cartoes, { busca: 'inexistente' })).toHaveLength(0);
  });

  it('cartão sem código não quebra a busca', () => {
    expect(filtrarCartoes(cartoes, { busca: 'compras' }).map((c) => c.remetente)).toEqual(['Maria']);
  });

  it('área por ID, combinada com a busca', () => {
    expect(filtrarCartoes(cartoes, { areaId: 'AREA-eng' })).toHaveLength(2);
    expect(filtrarCartoes(cartoes, { areaId: 'AREA-eng', busca: 'relatorio' })).toHaveLength(1);
    expect(filtrarCartoes(cartoes, { areaId: 'AREA-outra' })).toHaveLength(0);
  });

  it('normalizarBusca tira acentos e maiúsculas', () => {
    expect(normalizarBusca('  Ação Ç É  ')).toBe('acao c e');
  });
});
