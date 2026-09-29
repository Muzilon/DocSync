import { describe, expect, it } from 'vitest';
import {
  FASE_DO_STATUS,
  STATUS_DOCUMENTO,
  type EventoHistorico,
  type Fase,
  type StatusDocumento,
} from './documentos.ts';
import { TRANSICOES_SOLICITANTE, type Perfil, type Pessoa } from './pessoas.ts';
import {
  DESTINOS_POR_FASE,
  acaoPrincipal,
  acoesDeStatus,
  destinosPermitidos,
  ehResponsavelSugerido,
  exigeResponsavel,
  normalizarObservacao,
  podeSerCancelado,
  rotuloTransicao,
  statusDeReativacao,
  sugerirResponsaveis,
  transicaoPermitida,
  ultimoCancelamento,
  validarMotivoCancelamento,
  validarObservacao,
  type PessoaResumo,
} from './transicoes.ts';

function pessoa(perfil: Perfil | null, extra: Partial<Pessoa> = {}): Pessoa {
  return {
    id: 'USR-eu',
    nome: 'Pessoa Fictícia',
    email: 'pessoa@exemplo.test',
    perfil,
    area: 'Engenharia',
    areaId: 'AREA-eng',
    status: 'Ativo',
    ...extra,
  };
}

let sequencia = 0;
function evento(extra: Partial<EventoHistorico> = {}): EventoHistorico {
  sequencia++;
  return {
    id: `HIST-${sequencia}`,
    idDocumento: 'DOC-1',
    codigo: null,
    tipoAcao: 'STATUS',
    status: 'Recebido',
    statusAnterior: null,
    dataHora: '2026-09-29T12:00:00.000Z',
    destino: null,
    responsavel: null,
    responsavelId: null,
    autorId: 'USR-1',
    autorNome: 'Pessoa Fictícia',
    detalhes: [],
    observacao: null,
    ...extra,
  };
}

const cancelamento = (statusAnterior: StatusDocumento | null) =>
  evento({ tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior });

// ---------------------------------------------------------------------------

describe('destinosPermitidos / transicaoPermitida — matriz 11×11 (contrato F5, 2.2)', () => {
  /** A tabela da seção 2.2, transcrita à mão (linhas = origem). */
  const TABELA: Record<StatusDocumento, readonly StatusDocumento[]> = {
    Recebido: ['Em revisão da qualidade', 'Em revisão junto à área', 'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante'],
    'Em revisão da qualidade': ['Em revisão junto à área', 'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Para aprovação qualidade', 'Aprovado'],
    'Em revisão junto à área': ['Em revisão da qualidade', 'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Para aprovação qualidade', 'Aprovado'],
    'Em Revisão': ['Em revisão da qualidade', 'Em revisão junto à área', 'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Para aprovação qualidade', 'Aprovado'],
    'Devolvido para área para revisão': ['Em revisão da qualidade', 'Em revisão junto à área', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Para aprovação qualidade'],
    'Devolvido para correção': ['Em revisão da qualidade', 'Em revisão junto à área', 'Devolvido para área para revisão', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Para aprovação qualidade'],
    'Em revisão do solicitante': ['Em revisão da qualidade', 'Em revisão junto à área', 'Devolvido para área para revisão', 'Devolvido para correção', 'Para aprovação da área solicitante', 'Para aprovação qualidade'],
    'Para aprovação da área solicitante': ['Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação qualidade', 'Aprovado'],
    'Para aprovação qualidade': ['Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante', 'Para aprovação da área solicitante', 'Aprovado'],
    Aprovado: [],
    Cancelado: [],
  };

  for (const de of STATUS_DOCUMENTO) {
    it(`de "${de}": ${TABELA[de].length} destinos, iguais aos da tabela`, () => {
      expect(destinosPermitidos(de)).toEqual(TABELA[de]);
      for (const para of STATUS_DOCUMENTO) {
        expect(transicaoPermitida(de, para)).toBe(TABELA[de].includes(para));
      }
    });
  }

  it('a matriz gerada de DESTINOS_POR_FASE bate com a tabela (121 pares)', () => {
    for (const de of STATUS_DOCUMENTO) {
      for (const para of STATUS_DOCUMENTO) {
        const esperado =
          para !== de &&
          para !== 'Em Revisão' &&
          para !== 'Cancelado' &&
          DESTINOS_POR_FASE[FASE_DO_STATUS[de]].includes(FASE_DO_STATUS[para]);
        expect(transicaoPermitida(de, para)).toBe(esperado);
      }
    }
  });

  it("'Em Revisão' (migrado) e 'Cancelado' nunca são destino; mesmo status nunca", () => {
    for (const de of STATUS_DOCUMENTO) {
      expect(transicaoPermitida(de, 'Em Revisão')).toBe(false);
      expect(transicaoPermitida(de, 'Cancelado')).toBe(false);
      expect(transicaoPermitida(de, de)).toBe(false);
    }
  });

  it('Aprovado e Cancelado sem destinos; "Em Revisão" como origem = fase revisao', () => {
    expect(destinosPermitidos('Aprovado')).toEqual([]);
    expect(destinosPermitidos('Cancelado')).toEqual([]);
    expect(DESTINOS_POR_FASE.aprovado).toEqual([]);
    expect(DESTINOS_POR_FASE.cancelado).toEqual([]);
    const semElaMesma = destinosPermitidos('Em revisão da qualidade').filter((s) => s !== 'Em revisão junto à área');
    expect(destinosPermitidos('Em Revisão')).toEqual(['Em revisão da qualidade', 'Em revisão junto à área', ...semElaMesma]);
  });

  it('atalhos do documento 03 mantidos pelo Eric (resposta 1): Recebido → Devolvido, Devolvido → Em Aprovação, Em Revisão → Aprovado', () => {
    expect(transicaoPermitida('Recebido', 'Devolvido para correção')).toBe(true);
    expect(transicaoPermitida('Devolvido para correção', 'Para aprovação qualidade')).toBe(true);
    expect(transicaoPermitida('Em revisão da qualidade', 'Aprovado')).toBe(true);
    // Mas Recebido não pula para aprovação nem para Aprovado.
    expect(transicaoPermitida('Recebido', 'Para aprovação qualidade')).toBe(false);
    expect(transicaoPermitida('Recebido', 'Aprovado')).toBe(false);
  });

  it('podeSerCancelado: tudo menos Aprovado e Cancelado', () => {
    for (const s of STATUS_DOCUMENTO) expect(podeSerCancelado(s)).toBe(s !== 'Aprovado' && s !== 'Cancelado');
  });

  it('todo par de TRANSICOES_SOLICITANTE é aceito pela máquina', () => {
    for (const [de, para] of TRANSICOES_SOLICITANTE) expect(transicaoPermitida(de, para)).toBe(true);
  });
});

describe('exigeResponsavel (contrato 2.4, resposta 2 do Eric)', () => {
  it('fases revisao, devolvido e aprovacao exigem; Recebido, Aprovado e Cancelado não', () => {
    const exigem: Fase[] = ['revisao', 'devolvido', 'aprovacao'];
    for (const s of STATUS_DOCUMENTO) expect(exigeResponsavel(s)).toBe(exigem.includes(FASE_DO_STATUS[s]));
    expect(exigeResponsavel('Aprovado')).toBe(false);
  });
});

describe('acoesDeStatus (contrato 2.6)', () => {
  const docEng = { status: 'Recebido' as StatusDocumento, areaId: 'AREA-eng' };

  it('Qualidade em Recebido: 5 ações na ordem da máquina, principal "Iniciar revisão"', () => {
    const acoes = acoesDeStatus(pessoa('Qualidade', { areaId: 'AREA-qua', area: 'Qualidade' }), docEng);
    expect(acoes.map((a) => a.para)).toEqual(destinosPermitidos('Recebido'));
    expect(acoes).toHaveLength(5);
    expect(acoes.filter((a) => a.principal)).toEqual([
      { para: 'Em revisão da qualidade', rotulo: 'Iniciar revisão', principal: true, exigeResponsavel: true, exigeConfirmacao: false },
    ]);
    expect(acoes.map((a) => a.rotulo)).toEqual([
      'Iniciar revisão',
      'Revisar junto à área',
      'Devolver à área',
      'Devolver para correção',
      'Enviar ao solicitante',
    ]);
    expect(acoes.every((a) => a.exigeResponsavel)).toBe(true);
    expect(acoes.some((a) => a.exigeConfirmacao)).toBe(false);
  });

  it('Solicitante da área em Devolvido: só "Reenviar à Qualidade", principal; em "Para aprovação da área": "Aprovar pela área"', () => {
    const sol = pessoa('Solicitante');
    const devolvido = acoesDeStatus(sol, { status: 'Devolvido para correção', areaId: 'AREA-eng' });
    expect(devolvido).toEqual([
      { para: 'Em revisão da qualidade', rotulo: 'Reenviar à Qualidade', principal: true, exigeResponsavel: true, exigeConfirmacao: false },
    ]);
    const aprovacaoArea = acoesDeStatus(sol, { status: 'Para aprovação da área solicitante', areaId: 'AREA-eng' });
    expect(aprovacaoArea).toEqual([
      { para: 'Para aprovação qualidade', rotulo: 'Aprovar pela área', principal: true, exigeResponsavel: true, exigeConfirmacao: false },
    ]);
  });

  it('Solicitante em Recebido, em "Para aprovação qualidade" e de outra área: vazio', () => {
    expect(acoesDeStatus(pessoa('Solicitante'), docEng)).toEqual([]);
    expect(acoesDeStatus(pessoa('Solicitante'), { status: 'Para aprovação qualidade', areaId: 'AREA-eng' })).toEqual([]);
    expect(acoesDeStatus(pessoa('Solicitante'), { status: 'Devolvido para correção', areaId: 'AREA-outra' })).toEqual([]);
  });

  it('Leitor, ninguém, sem perfil e inativo: vazio', () => {
    expect(acoesDeStatus(pessoa('Leitor'), docEng)).toEqual([]);
    expect(acoesDeStatus(null, docEng)).toEqual([]);
    expect(acoesDeStatus(pessoa(null), docEng)).toEqual([]);
    expect(acoesDeStatus(pessoa('Administrador', { status: 'Inativo' }), docEng)).toEqual([]);
  });

  it('Aprovado e Cancelado: vazio para todos', () => {
    for (const perfil of ['Administrador', 'Qualidade', 'Solicitante'] as const) {
      expect(acoesDeStatus(pessoa(perfil), { status: 'Aprovado', areaId: 'AREA-eng' })).toEqual([]);
      expect(acoesDeStatus(pessoa(perfil), { status: 'Cancelado', areaId: 'AREA-eng' })).toEqual([]);
    }
  });

  it('exigeConfirmacao só em Aprovado; exigeResponsavel segue o destino', () => {
    const admin = pessoa('Administrador');
    for (const de of STATUS_DOCUMENTO) {
      for (const acao of acoesDeStatus(admin, { status: de, areaId: 'AREA-x' })) {
        expect(acao.exigeConfirmacao).toBe(acao.para === 'Aprovado');
        expect(acao.exigeResponsavel).toBe(exigeResponsavel(acao.para));
      }
    }
    const aprovar = acoesDeStatus(admin, { status: 'Para aprovação qualidade', areaId: 'AREA-x' }).find((a) => a.para === 'Aprovado');
    expect(aprovar).toEqual({ para: 'Aprovado', rotulo: 'Aprovar', principal: true, exigeResponsavel: false, exigeConfirmacao: true });
  });

  it('ação principal por origem; no máximo uma principal por lista', () => {
    expect(acaoPrincipal('Recebido')).toBe('Em revisão da qualidade');
    expect(acaoPrincipal('Em revisão junto à área')).toBe('Para aprovação da área solicitante');
    expect(acaoPrincipal('Em Revisão')).toBe('Para aprovação da área solicitante');
    expect(acaoPrincipal('Em revisão do solicitante')).toBe('Em revisão da qualidade');
    expect(acaoPrincipal('Para aprovação da área solicitante')).toBe('Para aprovação qualidade');
    expect(acaoPrincipal('Para aprovação qualidade')).toBe('Aprovado');
    expect(acaoPrincipal('Aprovado')).toBeNull();
    expect(acaoPrincipal('Cancelado')).toBeNull();
    for (const de of STATUS_DOCUMENTO) {
      expect(acoesDeStatus(pessoa('Qualidade'), { status: de, areaId: 'AREA-x' }).filter((a) => a.principal).length).toBeLessThanOrEqual(1);
    }
  });

  it('rotuloTransicao: chave por fase de origem vence a genérica; sem chave, "Mover para <status>"', () => {
    expect(rotuloTransicao('Devolvido para correção', 'Em revisão da qualidade', 'Qualidade')).toBe('Retomar revisão');
    expect(rotuloTransicao('Em revisão junto à área', 'Em revisão da qualidade', 'Qualidade')).toBe('Mover para Em revisão da qualidade');
    expect(rotuloTransicao('Em revisão da qualidade', 'Aprovado', 'Administrador')).toBe('Aprovar');
    expect(rotuloTransicao('Para aprovação da área solicitante', 'Para aprovação qualidade', 'Solicitante')).toBe('Aprovar pela área');
  });
});

describe('sugerirResponsaveis (contrato 2.4)', () => {
  const pessoas: PessoaResumo[] = [
    { id: 'USR-zeca', nome: 'Zeca Engenharia', perfil: 'Solicitante', areaId: 'AREA-eng', area: 'Engenharia' },
    { id: 'USR-ana', nome: 'Ana Engenharia', perfil: 'Solicitante', areaId: 'AREA-eng', area: 'Engenharia' },
    { id: 'USR-bia', nome: 'Bia Qualidade', perfil: 'Qualidade', areaId: 'AREA-qua', area: 'Qualidade' },
    { id: 'USR-adm', nome: 'Ádmin Sem Área', perfil: 'Administrador', areaId: null, area: null },
    { id: 'USR-car', nome: 'Carla Custos', perfil: 'Solicitante', areaId: 'AREA-cus', area: 'Custos' },
  ];
  const doc = { areaId: 'AREA-eng' };

  it('destino devolvido ou "Para aprovação da área": pessoas da área do documento primeiro, em ordem pt-BR', () => {
    const nomes = sugerirResponsaveis('Devolvido para correção', doc, pessoas, { id: 'USR-ninguem' }).map((p) => p.id);
    expect(nomes).toEqual(['USR-ana', 'USR-zeca', 'USR-adm', 'USR-bia', 'USR-car']);
    expect(sugerirResponsaveis('Para aprovação da área solicitante', doc, pessoas, { id: 'USR-x' })[0]!.id).toBe('USR-ana');
  });

  it('destino revisao ou "Para aprovação qualidade": Qualidade e Administrador primeiro', () => {
    const ids = sugerirResponsaveis('Em revisão da qualidade', doc, pessoas, { id: 'USR-x' }).map((p) => p.id);
    expect(ids).toEqual(['USR-adm', 'USR-bia', 'USR-ana', 'USR-car', 'USR-zeca']);
    expect(sugerirResponsaveis('Para aprovação qualidade', doc, pessoas, { id: 'USR-x' }).slice(0, 2).map((p) => p.id)).toEqual(['USR-adm', 'USR-bia']);
  });

  it('eu em primeiro quando sugerido; se não sou sugerido, fico no meu grupo', () => {
    expect(sugerirResponsaveis('Devolvido para correção', doc, pessoas, { id: 'USR-zeca' }).map((p) => p.id)).toEqual([
      'USR-zeca',
      'USR-ana',
      'USR-adm',
      'USR-bia',
      'USR-car',
    ]);
    expect(sugerirResponsaveis('Devolvido para correção', doc, pessoas, { id: 'USR-bia' })[0]!.id).toBe('USR-ana');
  });

  it('Aprovado não sugere ninguém (não há responsável): só a ordem alfabética', () => {
    expect(sugerirResponsaveis('Aprovado', doc, pessoas, { id: 'USR-zeca' }).map((p) => p.nome)).toEqual([
      'Ádmin Sem Área',
      'Ana Engenharia',
      'Bia Qualidade',
      'Carla Custos',
      'Zeca Engenharia',
    ]);
    expect(pessoas.some((p) => ehResponsavelSugerido('Aprovado', doc, p))).toBe(false);
  });

  it('não altera a lista recebida', () => {
    const copia = [...pessoas];
    sugerirResponsaveis('Em revisão da qualidade', doc, pessoas, { id: 'USR-bia' });
    expect(pessoas).toEqual(copia);
  });
});

describe('statusDeReativacao (decisão 0004)', () => {
  it('statusAnterior do último CANCELAMENTO', () => {
    expect(statusDeReativacao([evento({ tipoAcao: 'CRIACAO' }), cancelamento('Em revisão junto à área')])).toBe('Em revisão junto à área');
  });

  it('dois cancelamentos: o último vale (mesmo depois de reativação e novas etapas)', () => {
    const eventos = [
      evento({ tipoAcao: 'CRIACAO' }),
      cancelamento('Recebido'),
      evento({ status: 'Recebido', statusAnterior: 'Cancelado' }),
      evento({ status: 'Em revisão da qualidade', statusAnterior: 'Recebido' }),
      cancelamento('Em revisão da qualidade'),
    ];
    expect(statusDeReativacao(eventos)).toBe('Em revisão da qualidade');
    expect(ultimoCancelamento(eventos)).toBe(eventos[4]);
  });

  it("'Em Revisão' migrado é restaurado tal como estava", () => {
    expect(statusDeReativacao([cancelamento('Em Revisão')])).toBe('Em Revisão');
  });

  it("sem evento, sem statusAnterior ou com anterior inválido → 'Recebido'", () => {
    expect(statusDeReativacao([])).toBe('Recebido');
    expect(statusDeReativacao([evento({ tipoAcao: 'CRIACAO' })])).toBe('Recebido');
    expect(statusDeReativacao([cancelamento(null)])).toBe('Recebido');
    expect(statusDeReativacao([cancelamento('Cancelado')])).toBe('Recebido');
    expect(ultimoCancelamento([])).toBeNull();
  });
});

describe('validarMotivoCancelamento e validarObservacao (contrato 3.1)', () => {
  it('motivo: obrigatório, 10 a 500 caracteres depois de trim (mesmos limites da justificativa)', () => {
    expect(validarMotivoCancelamento(undefined)).toBe('Informe o motivo do cancelamento.');
    expect(validarMotivoCancelamento('   ')).toBe('Informe o motivo do cancelamento.');
    expect(validarMotivoCancelamento(12)).toBe('Informe o motivo do cancelamento.');
    expect(validarMotivoCancelamento('123456789')).toMatch(/ao menos 10 caracteres/);
    expect(validarMotivoCancelamento(' 1234567890 ')).toBeNull();
    expect(validarMotivoCancelamento('x'.repeat(500))).toBeNull();
    expect(validarMotivoCancelamento('x'.repeat(501))).toMatch(/até 500 caracteres/);
  });

  it('observação: opcional (ausente, null, vazia), até 500 depois de trim; não texto é inválido', () => {
    expect(validarObservacao(undefined)).toBeNull();
    expect(validarObservacao(null)).toBeNull();
    expect(validarObservacao('')).toBeNull();
    expect(validarObservacao('  ' + 'x'.repeat(500) + '  ')).toBeNull();
    expect(validarObservacao('x'.repeat(501))).toMatch(/até 500 caracteres/);
    expect(validarObservacao(5)).toBe('Observação inválida.');
    expect(validarObservacao({})).toBe('Observação inválida.');
  });

  it('normalizarObservacao: apara; vazia e não texto → null', () => {
    expect(normalizarObservacao('  ok  ')).toBe('ok');
    expect(normalizarObservacao('   ')).toBeNull();
    expect(normalizarObservacao(null)).toBeNull();
    expect(normalizarObservacao(undefined)).toBeNull();
  });
});
