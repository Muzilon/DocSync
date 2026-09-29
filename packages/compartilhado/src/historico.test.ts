import { describe, expect, it } from 'vitest';
import type { EventoHistorico } from './documentos.ts';
import {
  ROTULO_CAMPO_HISTORICO,
  ROTULO_TIPO_ACAO,
  contarDevolucoes,
  descreverEvento,
  formatarValorHistorico,
} from './historico.ts';

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
    autorId: 'USR-1',
    autorNome: 'Pessoa Fictícia',
    detalhes: [],
    observacao: null,
    ...extra,
  };
}

describe('descreverEvento — um caso por tipo (contrato F4, 3.3)', () => {
  it('CRIACAO com prazo e observação', () => {
    const d = descreverEvento(
      evento({
        tipoAcao: 'CRIACAO',
        detalhes: [{ campo: 'dataRevisao', antes: null, depois: '2026-10-29' }],
        observacao: '  Cadastro inicial  ',
      }),
    );
    expect(d.titulo).toBe('Cadastro');
    expect(d.resumo).toBe('Documento cadastrado');
    expect(d.status).toBe('Recebido');
    expect(d.statusAnterior).toBeNull();
    expect(d.diferencas).toEqual([{ campo: 'dataRevisao', rotulo: 'Prazo', antes: '—', depois: '29/10/2026' }]);
    expect(d.observacao).toBe('Cadastro inicial');
    expect(d.rotuloObservacao).toBe('Observação');
    expect(d.temDetalhes).toBe(true);
  });

  it('REPROGRAMACAO: resumo com os dois prazos e justificativa em observacao', () => {
    const d = descreverEvento(
      evento({
        tipoAcao: 'REPROGRAMACAO',
        detalhes: [{ campo: 'dataRevisao', antes: '2026-10-10', depois: '2026-10-20' }],
        observacao: 'Aguardando retorno do fornecedor.',
      }),
    );
    expect(d.titulo).toBe('Reprogramação de prazo');
    expect(d.resumo).toBe('Prazo de 10/10/2026 para 20/10/2026');
    expect(d.diferencas[0]).toMatchObject({ rotulo: 'Prazo', antes: '10/10/2026', depois: '20/10/2026' });
    expect(d.observacao).toBe('Aguardando retorno do fornecedor.');
    expect(d.rotuloObservacao).toBe('Justificativa');
    expect(d.temDetalhes).toBe(true);
  });

  it('STATUS com destino e responsável', () => {
    const d = descreverEvento(
      evento({
        tipoAcao: 'STATUS',
        status: 'Em revisão da qualidade',
        statusAnterior: 'Recebido',
        destino: 'Qualidade',
        responsavel: 'Revisor Fictício',
      }),
    );
    expect(d.titulo).toBe('Mudança de status');
    expect(d.resumo).toBe('De Recebido para Em revisão da qualidade');
    expect(d.statusAnterior).toBe('Recebido');
    expect(d.destino).toBe('Qualidade');
    expect(d.responsavel).toBe('Revisor Fictício');
    expect(d.temDetalhes).toBe(true);
  });

  it('STATUS sem observação, destino nem responsável → temDetalhes falso', () => {
    const d = descreverEvento(evento({ tipoAcao: 'STATUS', status: 'Aprovado', statusAnterior: 'Para aprovação qualidade' }));
    expect(d.temDetalhes).toBe(false);
    expect(d.diferencas).toEqual([]);
  });

  it('STATUS sem status anterior (ou igual) não inventa "De X para Y"', () => {
    expect(descreverEvento(evento({ tipoAcao: 'STATUS', status: 'Recebido' })).resumo).toBe('Status: Recebido');
    const igual = descreverEvento(evento({ tipoAcao: 'STATUS', status: 'Recebido', statusAnterior: 'Recebido' }));
    expect(igual.statusAnterior).toBeNull();
  });

  it('CANCELAMENTO: resumo com o status anterior (decisão 0004)', () => {
    const d = descreverEvento(
      evento({ tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior: 'Em revisão junto à área' }),
    );
    expect(d.titulo).toBe('Cancelamento');
    expect(d.resumo).toBe('Cancelado (estava em Em revisão junto à área)');
    expect(d.statusAnterior).toBe('Em revisão junto à área');
  });

  it('EDICAO com 3 campos, incluindo data e null', () => {
    const d = descreverEvento(
      evento({
        tipoAcao: 'EDICAO',
        detalhes: [
          { campo: 'titulo', antes: 'Antigo', depois: 'Novo' },
          { campo: 'dataRecebimento', antes: '2026-09-01', depois: '2026-09-02' },
          { campo: 'disciplina', antes: null, depois: 'Civil' },
        ],
      }),
    );
    expect(d.titulo).toBe('Edição de dados');
    expect(d.resumo).toBe('3 campos alterados');
    expect(d.diferencas).toEqual([
      { campo: 'titulo', rotulo: 'Título', antes: 'Antigo', depois: 'Novo' },
      { campo: 'dataRecebimento', rotulo: 'Data de recebimento', antes: '01/09/2026', depois: '02/09/2026' },
      { campo: 'disciplina', rotulo: 'Disciplina', antes: '—', depois: 'Civil' },
    ]);
    expect(descreverEvento(evento({ tipoAcao: 'EDICAO', detalhes: [{ campo: 'titulo', antes: 'a', depois: 'b' }] })).resumo).toBe(
      '1 campo alterado',
    );
  });

  it('ANEXO com 2 arquivos', () => {
    const d = descreverEvento(
      evento({
        tipoAcao: 'ANEXO',
        detalhes: [
          { campo: 'arquivo', antes: null, depois: 'planilha.xlsx' },
          { campo: 'arquivo', antes: null, depois: 'foto.jpg' },
        ],
      }),
    );
    expect(d.titulo).toBe('Arquivos');
    expect(d.resumo).toBe('2 arquivos anexados');
    expect(d.diferencas.map((x) => x.depois)).toEqual(['planilha.xlsx', 'foto.jpg']);
    expect(d.diferencas[0]!.rotulo).toBe('Arquivo');
  });

  it('campo desconhecido usa o próprio nome como rótulo e não quebra', () => {
    const d = descreverEvento(
      evento({ tipoAcao: 'EDICAO', detalhes: [{ campo: 'campoNovo', antes: null, depois: 'x' }] }),
    );
    expect(d.diferencas[0]).toEqual({ campo: 'campoNovo', rotulo: 'campoNovo', antes: '—', depois: 'x' });
  });

  it('valor de campo data que não é só-dia sai como texto', () => {
    expect(formatarValorHistorico('dataRevisao', 'indefinido')).toBe('indefinido');
    expect(formatarValorHistorico('titulo', '2026-01-01')).toBe('2026-01-01');
  });

  it('todo tipo de evento e todo campo de Documento usados no histórico têm rótulo', () => {
    for (const tipo of ['CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO', 'REPROGRAMACAO'] as const) {
      expect(ROTULO_TIPO_ACAO[tipo]).toBeTruthy();
    }
    expect(ROTULO_CAMPO_HISTORICO.dataRevisao).toBe('Prazo');
  });
});

describe('contarDevolucoes — mesma regra do SQL de listarCartoes', () => {
  const status = (s: EventoHistorico['status'], anterior: EventoHistorico['statusAnterior']) =>
    evento({ tipoAcao: 'STATUS', status: s, statusAnterior: anterior });

  it('nenhuma devolução', () => {
    expect(contarDevolucoes([evento({ tipoAcao: 'CRIACAO' }), status('Em revisão da qualidade', 'Recebido')])).toBe(0);
  });

  it('devolvido → revisão → devolvido conta 2', () => {
    expect(
      contarDevolucoes([
        status('Devolvido para correção', 'Em revisão da qualidade'),
        status('Em revisão da qualidade', 'Devolvido para correção'),
        status('Devolvido para área para revisão', 'Em revisão da qualidade'),
      ]),
    ).toBe(2);
  });

  it('devolvido → devolvido (status da mesma fase) conta 1', () => {
    expect(
      contarDevolucoes([
        status('Devolvido para correção', 'Recebido'),
        status('Em revisão do solicitante', 'Devolvido para correção'),
      ]),
    ).toBe(1);
  });

  it('CANCELAMENTO vindo de devolvido não conta; devolução sem status anterior conta', () => {
    expect(
      contarDevolucoes([
        status('Devolvido para correção', 'Recebido'),
        evento({ tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior: 'Devolvido para correção' }),
      ]),
    ).toBe(1);
    expect(contarDevolucoes([status('Devolvido para correção', null)])).toBe(1);
    // EDICAO com status devolvido não é entrada na fase.
    expect(contarDevolucoes([evento({ tipoAcao: 'EDICAO', status: 'Devolvido para correção', statusAnterior: 'Recebido' })])).toBe(0);
  });
});
