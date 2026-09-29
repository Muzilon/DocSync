import { describe, expect, it } from 'vitest';
import { STATUS_DOCUMENTO, type Documento } from './documentos.ts';
import {
  CAMPOS_EDITAVEIS,
  LIMITES_TEXTO_DOCUMENTO,
  REVISAO_MAXIMA,
  diferencasDocumento,
  podeEditarAgora,
  validarDadosDocumento,
  type DadosDocumento,
} from './edicao.ts';

const VALIDOS = {
  titulo: 'Procedimento de Compras',
  codigo: 'PR-001',
  tipoDocumentoId: 'TIPO-1',
  revisao: 0,
  remetente: 'Remetente Fictício',
  areaId: 'AREA-1',
  disciplina: 'Civil',
  observacao: 'Observação',
};

describe('validarDadosDocumento (contrato F6, 2.2)', () => {
  it('dados válidos → dados normalizados e sem erros', () => {
    expect(validarDadosDocumento(VALIDOS)).toEqual({ erros: {}, dados: VALIDOS });
  });

  it('obrigatórios vazios, ausentes ou só espaços → mensagens do cadastro', () => {
    for (const valor of [undefined, null, '', '   ']) {
      const { erros, dados } = validarDadosDocumento({
        ...VALIDOS,
        titulo: valor,
        remetente: valor,
        tipoDocumentoId: valor,
        areaId: valor,
        revisao: valor,
      });
      expect(dados).toBeNull();
      expect(erros).toEqual({
        titulo: 'Informe o título do documento.',
        remetente: 'Informe o remetente ou solicitante.',
        tipoDocumentoId: 'Selecione o tipo de documento.',
        areaId: 'Selecione a área.',
        revisao: 'O número de revisão deve ser um inteiro de 0 a 999.',
      });
    }
  });

  it('limites de texto: no limite aceita, +1 recusa', () => {
    const rotulo = { titulo: 'O título', codigo: 'O código', remetente: 'O remetente', disciplina: 'A disciplina', observacao: 'A observação' };
    for (const [campo, limite] of Object.entries(LIMITES_TEXTO_DOCUMENTO) as [keyof typeof rotulo, number][]) {
      expect(validarDadosDocumento({ ...VALIDOS, [campo]: 'a'.repeat(limite) }).erros[campo], campo).toBeUndefined();
      expect(validarDadosDocumento({ ...VALIDOS, [campo]: 'a'.repeat(limite + 1) }).erros[campo]).toBe(
        `${rotulo[campo]} pode ter até ${limite} caracteres.`,
      );
    }
  });

  it('revisão como número e como texto', () => {
    const revisao = (valor: unknown) => validarDadosDocumento({ ...VALIDOS, revisao: valor });
    expect(revisao('0').dados?.revisao).toBe(0);
    expect(revisao(' 12 ').dados?.revisao).toBe(12);
    expect(revisao(REVISAO_MAXIMA).dados?.revisao).toBe(999);
    for (const invalida of ['-1', '1.5', 'abc', 1000, -1, 1.5, '1000', true, {}]) {
      expect(revisao(invalida).erros.revisao, String(invalida)).toBe('O número de revisão deve ser um inteiro de 0 a 999.');
    }
  });

  it('apara e converte opcionais vazios em null', () => {
    const { dados } = validarDadosDocumento({
      ...VALIDOS,
      titulo: '  Título  ',
      codigo: '   ',
      remetente: ' Ana ',
      disciplina: '',
      observacao: null,
    });
    expect(dados).toEqual({ ...VALIDOS, titulo: 'Título', codigo: null, remetente: 'Ana', disciplina: null, observacao: null });
    expect(validarDadosDocumento({ ...VALIDOS, codigo: undefined, disciplina: undefined, observacao: undefined }).dados).toMatchObject({
      codigo: null,
      disciplina: null,
      observacao: null,
    });
  });

  it('tipo não texto → "inválido"', () => {
    const { erros } = validarDadosDocumento({ ...VALIDOS, titulo: 5, codigo: 1, disciplina: [], observacao: {}, tipoDocumentoId: 3, areaId: false });
    expect(erros).toEqual({
      titulo: 'O título inválido.',
      codigo: 'O código inválido.',
      disciplina: 'A disciplina inválido.',
      observacao: 'A observação inválido.',
      tipoDocumentoId: 'Selecione o tipo de documento.',
      areaId: 'Selecione a área.',
    });
  });
});

const ATUAL: Pick<Documento, (typeof CAMPOS_EDITAVEIS)[number] | 'tipoDocumento' | 'area'> = {
  ...VALIDOS,
  tipoDocumento: 'Procedimento',
  area: 'Qualidade',
};
const NOMES = { tipoDocumento: 'Procedimento', area: 'Qualidade' };

describe('diferencasDocumento (contrato F6, 2.3)', () => {
  it('nada mudou → []', () => {
    expect(diferencasDocumento(ATUAL, VALIDOS, NOMES)).toEqual([]);
  });

  it('um campo', () => {
    expect(diferencasDocumento(ATUAL, { ...VALIDOS, titulo: 'Novo' }, NOMES)).toEqual([
      { campo: 'titulo', antes: 'Procedimento de Compras', depois: 'Novo' },
    ]);
  });

  it('os oito, na ordem de CAMPOS_EDITAVEIS; tipo e área pelo nome, revisão como texto, null ↔ texto', () => {
    const novo: DadosDocumento = {
      titulo: 'T2',
      codigo: null,
      tipoDocumentoId: 'TIPO-2',
      revisao: 3,
      remetente: 'R2',
      areaId: 'AREA-2',
      disciplina: null,
      observacao: null,
    };
    const lista = diferencasDocumento(ATUAL, novo, { tipoDocumento: 'Instrução', area: 'Engenharia' });
    expect(lista).toEqual([
      { campo: 'titulo', antes: 'Procedimento de Compras', depois: 'T2' },
      { campo: 'codigo', antes: 'PR-001', depois: null },
      { campo: 'tipoDocumento', antes: 'Procedimento', depois: 'Instrução' },
      { campo: 'revisao', antes: '0', depois: '3' },
      { campo: 'remetente', antes: 'Remetente Fictício', depois: 'R2' },
      { campo: 'area', antes: 'Qualidade', depois: 'Engenharia' },
      { campo: 'disciplina', antes: 'Civil', depois: null },
      { campo: 'observacao', antes: 'Observação', depois: null },
    ]);
    expect(JSON.stringify(lista)).not.toMatch(/TIPO-|AREA-/);
    expect(diferencasDocumento({ ...ATUAL, disciplina: null }, VALIDOS, NOMES)).toEqual([
      { campo: 'disciplina', antes: null, depois: 'Civil' },
    ]);
  });

  it('código só com caixa diferente conta como mudança', () => {
    expect(diferencasDocumento(ATUAL, { ...VALIDOS, codigo: 'pr-001' }, NOMES)).toEqual([
      { campo: 'codigo', antes: 'PR-001', depois: 'pr-001' },
    ]);
  });
});

describe('podeEditarAgora (contrato F6, 3.2)', () => {
  it('os 11 status: só Aprovado e Cancelado → falso', () => {
    for (const status of STATUS_DOCUMENTO) {
      expect(podeEditarAgora({ status }), status).toBe(status !== 'Aprovado' && status !== 'Cancelado');
    }
  });
});
