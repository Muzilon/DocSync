import { describe, expect, it } from 'vitest';
import {
  FASES,
  FASE_DO_STATUS,
  LIMITES_ARQUIVO,
  ROTULO_FASE,
  STATUS_DOCUMENTO,
  STATUS_INICIAL,
  extensaoArquivo,
  novoIdDocumento,
  sanitizarNomePasta,
  validarArquivo,
  validarConjuntoArquivos,
} from './documentos.ts';

const MB = 1024 * 1024;

describe('status e fases', () => {
  it('tem os 11 status com o texto exato do documento 02', () => {
    expect(STATUS_DOCUMENTO).toHaveLength(11);
    expect(new Set(STATUS_DOCUMENTO).size).toBe(11);
  });

  it('FASE_DO_STATUS cobre os 11 status, cada um com uma fase válida', () => {
    expect(Object.keys(FASE_DO_STATUS).sort()).toEqual([...STATUS_DOCUMENTO].sort());
    for (const status of STATUS_DOCUMENTO) expect(FASES).toContain(FASE_DO_STATUS[status]);
  });

  it('agrupa conforme o documento 02, seção 3.1', () => {
    expect(FASE_DO_STATUS['Em Revisão']).toBe('revisao');
    expect(FASE_DO_STATUS['Em revisão do solicitante']).toBe('devolvido');
    expect(FASE_DO_STATUS['Para aprovação da área solicitante']).toBe('aprovacao');
    expect(FASE_DO_STATUS.Cancelado).toBe('cancelado');
  });

  it('toda fase tem rótulo e o status inicial é Recebido (P-03)', () => {
    for (const fase of FASES) expect(ROTULO_FASE[fase]).toBeTruthy();
    expect(ROTULO_FASE.devolvido).toBe('Devolvido à Área');
    expect(STATUS_INICIAL).toBe('Recebido');
  });
});

describe('sanitizarNomePasta (documento 03, seção 7)', () => {
  it.each([
    ['Manual de Procedimentos', 'Manual de Procedimentos'],
    ['Procedimento: Compras & Contratos', 'Procedimento- Compras - Contratos'],
    ['IT 05/2026 - Solda', 'IT 05-2026 - Solda'],
  ])('%s → %s', (titulo, pasta) => {
    expect(sanitizarNomePasta(titulo)).toBe(pasta);
  });

  it('troca todos os caracteres inválidos e reduz espaços', () => {
    expect(sanitizarNomePasta('a~b"c#d%e&f*g:h<i>j?k/l\\m{n|o}p')).toBe('a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p');
    expect(sanitizarNomePasta('  muitos    espaços\taqui  ')).toBe('muitos espaços aqui');
  });

  it('limita a 100 caracteres', () => {
    expect(sanitizarNomePasta('x'.repeat(250))).toHaveLength(100);
  });
});

describe('validarArquivo e validarConjuntoArquivos (P-09)', () => {
  it('aceita as extensões permitidas, sem diferenciar maiúsculas', () => {
    for (const ext of LIMITES_ARQUIVO.extensoes) expect(validarArquivo(`arquivo.${ext.toUpperCase()}`, 1000)).toBeNull();
  });

  it('recusa extensão fora da lista, sem extensão e arquivo vazio', () => {
    expect(validarArquivo('programa.exe', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('pacote.zip', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('semextensao', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('.pdf', 1000)).toMatch(/Formato não permitido/);
    expect(validarArquivo('vazio.pdf', 0)).toBe('O arquivo está vazio.');
  });

  it('recusa arquivo acima de 20 MB', () => {
    expect(validarArquivo('grande.pdf', 20 * MB)).toBeNull();
    expect(validarArquivo('grande.pdf', 20 * MB + 1)).toMatch(/20 MB/);
  });

  it('limita a 20 anexos e 100 MB no total', () => {
    expect(validarConjuntoArquivos(20, 100 * MB)).toBeNull();
    expect(validarConjuntoArquivos(21, 1)).toMatch(/20 anexos/);
    expect(validarConjuntoArquivos(0, 100 * MB + 1)).toMatch(/100 MB/);
  });

  it('extensaoArquivo ignora o caminho', () => {
    expect(extensaoArquivo('C:\\pasta.x\\nome.Docx')).toBe('docx');
    expect(extensaoArquivo('a/b.c/nome')).toBe('');
  });
});

describe('novoIdDocumento', () => {
  it('gera DOC-uuid', () => {
    expect(novoIdDocumento()).toMatch(/^DOC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
