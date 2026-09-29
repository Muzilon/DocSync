import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArmazenamentoLocal, ErroArmazenamento, planejarArquivos, sanitizarNomeArquivo } from './arquivos.ts';

const ID = 'DOC-00000000-0000-4000-8000-000000000001';

describe('sanitizarNomeArquivo', () => {
  it.each([
    ['relatório final.PDF', 'relatório final.pdf'],
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['C:\\Windows\\system32\\x.docx', 'x.docx'],
    ['a:b*c?.xlsx', 'a-b-c-.xlsx'],
    ['CON.pdf', '_CON.pdf'],
    ['..pdf', 'pdf'],
    ['   .pdf', 'pdf'],
    ['nome\u0000oculto.png', 'nomeoculto.png'],
  ])('%s → %s', (entrada, saida) => {
    expect(sanitizarNomeArquivo(entrada)).toBe(saida);
  });

  it('limita o tamanho preservando a extensão e é estável', () => {
    const nome = sanitizarNomeArquivo(`${'x'.repeat(300)}.docx`);
    expect(nome).toHaveLength(120);
    expect(nome.endsWith('.docx')).toBe(true);
    expect(sanitizarNomeArquivo(nome)).toBe(nome);
  });
});

describe('planejarArquivos', () => {
  it('principal na raiz, anexos em Anexos/, repetidos com sufixo (sem diferenciar maiúsculas)', () => {
    const planejados = planejarArquivos([
      { papel: 'principal', nomeOriginal: 'doc.pdf' },
      { papel: 'anexo', nomeOriginal: 'doc.pdf' },
      { papel: 'anexo', nomeOriginal: 'DOC.pdf' },
    ] as const);
    expect(planejados.map((p) => p.nomeArmazenado)).toEqual(['doc.pdf', 'Anexos/doc.pdf', 'Anexos/DOC (2).pdf']);
  });
});

describe('ArmazenamentoLocal', () => {
  let raiz: string;
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'docsync-armazenamento-'));
  });
  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  const arquivo = (nomeArmazenado: string, conteudo = 'x') => ({
    papel: 'principal' as const,
    nomeOriginal: nomeArmazenado,
    nomeArmazenado,
    tipoMime: 'application/pdf',
    conteudo: Buffer.from(conteudo),
  });

  it('grava na pasta do ID, sem sobrar temporários, e lê de volta', async () => {
    const armazenamento = new ArmazenamentoLocal(raiz);
    await armazenamento.salvar(ID, [arquivo('principal.pdf', 'p'), arquivo('Anexos/a.pdf', 'a')]);
    expect((await armazenamento.ler(ID, 'principal.pdf'))!.toString()).toBe('p');
    expect((await armazenamento.ler(ID, 'Anexos/a.pdf'))!.toString()).toBe('a');
    expect((await readdir(join(raiz, ID))).sort()).toEqual(['Anexos', 'principal.pdf']);
    expect(await armazenamento.ler(ID, 'nao-existe.pdf')).toBeNull();
  });

  it('recusa path traversal no ID e no nome, sem gravar nada', async () => {
    const armazenamento = new ArmazenamentoLocal(raiz);
    await expect(armazenamento.salvar('DOC-../../fora', [arquivo('a.pdf')])).rejects.toBeInstanceOf(ErroArmazenamento);
    await expect(armazenamento.salvar(ID, [arquivo('ok.pdf'), arquivo('../fora.pdf')])).rejects.toBeInstanceOf(
      ErroArmazenamento,
    );
    await expect(armazenamento.salvar(ID, [arquivo('Outra/a.pdf')])).rejects.toBeInstanceOf(ErroArmazenamento);
    // O 'ok.pdf' gravado antes da falha foi apagado, e a pasta vazia também.
    expect(await readdir(raiz)).toEqual([]);
  });

  it('remover apaga os arquivos e as pastas vazias', async () => {
    const armazenamento = new ArmazenamentoLocal(raiz);
    await armazenamento.salvar(ID, [arquivo('p.pdf'), arquivo('Anexos/a.pdf')]);
    await armazenamento.remover(ID, ['p.pdf', 'Anexos/a.pdf', 'Anexos/ausente.pdf']);
    expect(await readdir(raiz)).toEqual([]);
  });
});
