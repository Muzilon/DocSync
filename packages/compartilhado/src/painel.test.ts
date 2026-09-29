import { describe, expect, it } from 'vitest';
import type { StatusDocumento } from './documentos.ts';
import { FASE_DO_STATUS } from './documentos.ts';
import {
  DIAS_JANELA_VENCENDO,
  calcularKpis,
  etiquetaPrazo,
  filtrarCartoes,
  formatarDataCurta,
  iniciais,
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
    dataInicioRevisao: null,
    responsavelId: null,
    responsavel: null,
    statusAntesDoCancelamento: null,
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
    expect(calcularKpis(cartoes, HOJE)).toEqual({ emTramitacao: 4, vencendo: 2, atrasados: 1, aprovadosNoMes: 0, aprovadosNoMesNaMeta: 0 });
  });

  it('cancelado nunca conta; aprovado não conta em tramitação (sem dataAprovacao, não conta no mês)', () => {
    const cartoes = [
      cartao({ status: 'Cancelado', dataRevisao: '2026-09-01' }),
      cartao({ status: 'Aprovado', dataRevisao: '2026-09-01' }),
      cartao({ status: 'Aprovado', dataRevisao: HOJE }),
      cartao({ status: 'Em revisão da qualidade', dataRevisao: '2026-09-01' }),
    ];
    expect(calcularKpis(cartoes, HOJE)).toEqual({ emTramitacao: 1, vencendo: 0, atrasados: 1, aprovadosNoMes: 0, aprovadosNoMesNaMeta: 0 });
  });

  it('sem prazo conta só em emTramitacao', () => {
    expect(calcularKpis([cartao({ dataRevisao: null })], HOJE)).toEqual({ emTramitacao: 1, vencendo: 0, atrasados: 0, aprovadosNoMes: 0, aprovadosNoMesNaMeta: 0 });
  });

  it('lista vazia → zeros', () => {
    expect(calcularKpis([], HOJE)).toEqual({ emTramitacao: 0, vencendo: 0, atrasados: 0, aprovadosNoMes: 0, aprovadosNoMesNaMeta: 0 });
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

describe('calcularKpis — aprovadosNoMes e aprovadosNoMesNaMeta (P-12, decisão 0012, F5)', () => {
  const aprovado = (dataRecebimento: string, dataAprovacao: string | null, extra: Partial<CartaoPainel> = {}) =>
    cartao({ status: 'Aprovado', dataRecebimento, dataAprovacao, ...extra });

  it('conta só o mês e o ano de hoje: 31/08 fora, 01/09 dentro, 30/09 dentro, setembro de outro ano fora', () => {
    const cartoes = [
      aprovado('2026-08-01', '2026-08-31'),
      aprovado('2026-08-01', '2026-09-01'),
      aprovado('2026-09-01', '2026-09-30'),
      aprovado('2025-08-01', '2025-09-15'),
      aprovado('2026-08-01', null), // importado sem evento de aprovação
    ];
    expect(calcularKpis(cartoes, HOJE)).toMatchObject({ aprovadosNoMes: 2, aprovadosNoMesNaMeta: 2, emTramitacao: 0 });
  });

  it('na meta: recebido → aprovado em até 40 dias corridos (40 dentro, 41 fora)', () => {
    const cartoes = [
      aprovado('2026-08-20', '2026-09-29'), // 40 dias
      aprovado('2026-08-19', '2026-09-29'), // 41 dias
      aprovado('2026-09-29', '2026-09-29'), // 0 dias
    ];
    expect(calcularKpis(cartoes, HOJE)).toMatchObject({ aprovadosNoMes: 3, aprovadosNoMesNaMeta: 2 });
  });

  it('cancelado nunca conta, mesmo com dataAprovacao (dado importado estranho); em tramitação com dataAprovacao também não', () => {
    const cartoes = [
      cartao({ status: 'Cancelado', dataRecebimento: '2026-09-01', dataAprovacao: '2026-09-10' }),
      cartao({ status: 'Em revisão da qualidade', dataRecebimento: '2026-09-01', dataAprovacao: '2026-09-10' }),
    ];
    expect(calcularKpis(cartoes, HOJE)).toMatchObject({ aprovadosNoMes: 0, aprovadosNoMesNaMeta: 0, emTramitacao: 1 });
  });
});

describe('filtrarCartoes — responsável (F5, contrato seção 4)', () => {
  it('busca também no nome do responsável, sem acento; cartão sem responsável não quebra', () => {
    const cartoes = [
      cartao({ titulo: 'Um', responsavel: 'José Antônio' }),
      cartao({ titulo: 'Dois', responsavel: null }),
      cartao({ titulo: 'Três', responsavel: 'Maria' }),
    ];
    expect(filtrarCartoes(cartoes, { busca: 'jose antonio' }).map((c) => c.titulo)).toEqual(['Um']);
    expect(filtrarCartoes(cartoes, { busca: 'maria' }).map((c) => c.titulo)).toEqual(['Três']);
    expect(filtrarCartoes(cartoes, { busca: 'ninguém' })).toEqual([]);
  });
});

describe('iniciais (decisão 0015: círculo do responsável no cartão)', () => {
  it('primeira letra do primeiro e do último nome, em maiúsculas', () => {
    expect(iniciais('Maria da Silva')).toBe('MS');
    expect(iniciais('ana')).toBe('A');
    expect(iniciais('  josé   antônio  ')).toBe('JA');
    expect(iniciais('')).toBe('');
    expect(iniciais('Élcio Ávila')).toBe('ÉÁ');
  });
});
