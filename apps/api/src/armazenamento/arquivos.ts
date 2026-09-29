/**
 * Armazenamento dos arquivos dos documentos (decisão 0003).
 *
 * As rotas só conhecem a interface `ArmazenamentoArquivos`. Hoje há a implementação
 * local (pasta fora do Git) e a em memória (testes); quando o SharePoint for liberado,
 * entra uma implementação nova sem mexer nas rotas nem nas telas.
 *
 * Organização (P-07): uma pasta por documento, nomeada pelo ID (nunca pelo título);
 * arquivo principal na raiz dela e anexos em `Anexos/`.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rmdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

export type PapelArquivo = 'principal' | 'anexo';

/** Arquivo pronto para gravar, com o caminho relativo já decidido por `planejarArquivos`. */
export interface ArquivoParaSalvar {
  papel: PapelArquivo;
  nomeOriginal: string;
  /** Caminho relativo à pasta do documento (ex.: 'Anexos/planilha.xlsx'). */
  nomeArmazenado: string;
  tipoMime: string;
  conteudo: Buffer;
}

export interface ArmazenamentoArquivos {
  /**
   * Grava todos os arquivos do documento, ou nenhum: se um falhar, apaga os que já
   * gravou nesta chamada e lança o erro.
   */
  salvar(idDocumento: string, arquivos: readonly ArquivoParaSalvar[]): Promise<void>;
  /** Apaga arquivos gravados por `salvar` (usado para desfazer). Ausentes são ignorados. */
  remover(idDocumento: string, nomesArmazenados: readonly string[]): Promise<void>;
  /** Lê um arquivo; null se não existir. */
  ler(idDocumento: string, nomeArmazenado: string): Promise<Buffer | null>;
}

/** Falha do armazenamento (disco, permissão, rede do SharePoint etc.). */
export class ErroArmazenamento extends Error {
  constructor(mensagem: string, options?: { cause?: unknown }) {
    super(mensagem, options);
    this.name = 'ErroArmazenamento';
  }
}

export const PASTA_ANEXOS = 'Anexos';

// ---------------------------------------------------------------------------
// Nomes seguros
// ---------------------------------------------------------------------------

const ID_DOCUMENTO_SEGURO = /^DOC-[A-Za-z0-9-]{1,100}$/;
const CARACTERES_INVALIDOS = /[~"#%&*:<>?/\\{|}]/g;
const CONTROLE = /[\u0000-\u001f\u007f]/g;
const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const TAMANHO_MAXIMO_NOME = 120;

/**
 * Nome de arquivo seguro para qualquer sistema de arquivos (e para o SharePoint):
 * só o nome final (sem pastas), sem caracteres inválidos nem de controle, sem pontos
 * ou espaços nas pontas, sem nomes reservados do Windows, até 120 caracteres
 * preservando a extensão. Nunca devolve '', '.' ou '..'.
 */
export function sanitizarNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? '';
  let limpo = base
    .replace(CONTROLE, '')
    .replace(CARACTERES_INVALIDOS, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const ponto = limpo.lastIndexOf('.');
  let radical = ponto > 0 ? limpo.slice(0, ponto) : limpo;
  const extensao = ponto > 0 ? limpo.slice(ponto + 1).toLowerCase() : '';
  radical = radical.replace(/[\s.]+$/g, '');
  if (radical === '') radical = 'arquivo';
  if (RESERVADOS_WINDOWS.test(radical)) radical = `_${radical}`;
  const espaco = TAMANHO_MAXIMO_NOME - (extensao ? extensao.length + 1 : 0);
  radical = radical.slice(0, Math.max(espaco, 1)).replace(/[\s.]+$/g, '') || 'arquivo';
  limpo = extensao ? `${radical}.${extensao}` : radical;
  return limpo;
}

/**
 * Decide o caminho de cada arquivo dentro da pasta do documento: principal na raiz,
 * anexos em `Anexos/`. Nomes repetidos (sem diferenciar maiúsculas, como no Windows
 * e no SharePoint) recebem sufixo " (2)", " (3)"...
 */
export function planejarArquivos<T extends { papel: PapelArquivo; nomeOriginal: string }>(
  arquivos: readonly T[],
): (T & { nomeArmazenado: string })[] {
  const usados = new Set<string>();
  return arquivos.map((arquivo) => {
    const nome = sanitizarNomeArquivo(arquivo.nomeOriginal);
    const prefixo = arquivo.papel === 'anexo' ? `${PASTA_ANEXOS}/` : '';
    const ponto = nome.lastIndexOf('.');
    const radical = ponto > 0 ? nome.slice(0, ponto) : nome;
    const extensao = ponto > 0 ? nome.slice(ponto) : '';
    let candidato = `${prefixo}${nome}`;
    for (let n = 2; usados.has(candidato.toLowerCase()); n++) {
      candidato = `${prefixo}${radical} (${n})${extensao}`;
    }
    usados.add(candidato.toLowerCase());
    return { ...arquivo, nomeArmazenado: candidato };
  });
}

/** Confere que o caminho relativo é um dos formatos gerados por `planejarArquivos`. */
function caminhoRelativoSeguro(nomeArmazenado: string): boolean {
  const partes = nomeArmazenado.split('/');
  const nome = partes.at(-1) ?? '';
  const pastaOk = partes.length === 1 || (partes.length === 2 && partes[0] === PASTA_ANEXOS);
  return pastaOk && nome !== '' && sanitizarNomeArquivo(nome) === nome;
}

function exigirIdSeguro(idDocumento: string) {
  if (!ID_DOCUMENTO_SEGURO.test(idDocumento)) {
    throw new ErroArmazenamento('Identificador de documento inválido para o armazenamento.');
  }
}

// ---------------------------------------------------------------------------
// Implementação local (pasta no disco)
// ---------------------------------------------------------------------------

/**
 * Grava em `<raiz>/<id do documento>/...`. Cada arquivo é escrito primeiro num
 * temporário ao lado e depois renomeado, para nunca deixar arquivo pela metade.
 */
export class ArmazenamentoLocal implements ArmazenamentoArquivos {
  readonly raiz: string;

  constructor(raiz: string) {
    if (!isAbsolute(raiz)) throw new Error('A pasta de armazenamento precisa ser um caminho absoluto.');
    this.raiz = resolve(raiz);
  }

  private caminho(idDocumento: string, nomeArmazenado: string): string {
    exigirIdSeguro(idDocumento);
    if (!caminhoRelativoSeguro(nomeArmazenado)) {
      throw new ErroArmazenamento('Nome de arquivo inválido para o armazenamento.');
    }
    const pasta = resolve(this.raiz, idDocumento);
    const destino = resolve(pasta, ...nomeArmazenado.split('/'));
    // Defesa extra contra path traversal: o destino tem de ficar dentro da pasta do documento.
    if (!destino.startsWith(pasta + sep)) throw new ErroArmazenamento('Caminho de arquivo fora da pasta do documento.');
    return destino;
  }

  async salvar(idDocumento: string, arquivos: readonly ArquivoParaSalvar[]): Promise<void> {
    const gravados: string[] = [];
    try {
      for (const arquivo of arquivos) {
        const destino = this.caminho(idDocumento, arquivo.nomeArmazenado);
        await mkdir(dirname(destino), { recursive: true });
        const temporario = `${destino}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporario, arquivo.conteudo, { flag: 'wx' });
          await rename(temporario, destino);
        } catch (erro) {
          await unlink(temporario).catch(() => {});
          throw erro;
        }
        gravados.push(arquivo.nomeArmazenado);
      }
    } catch (erro) {
      await this.remover(idDocumento, gravados).catch(() => {});
      if (erro instanceof ErroArmazenamento) throw erro;
      throw new ErroArmazenamento('Não foi possível gravar os arquivos do documento.', { cause: erro });
    }
  }

  async remover(idDocumento: string, nomesArmazenados: readonly string[]): Promise<void> {
    for (const nome of nomesArmazenados) {
      await unlink(this.caminho(idDocumento, nome)).catch((erro: NodeJS.ErrnoException) => {
        if (erro.code !== 'ENOENT') throw erro;
      });
    }
    // Remove as pastas só se tiverem ficado vazias (rmdir falha se houver algo dentro).
    const pasta = resolve(this.raiz, idDocumento);
    await rmdir(resolve(pasta, PASTA_ANEXOS)).catch(() => {});
    await rmdir(pasta).catch(() => {});
  }

  async ler(idDocumento: string, nomeArmazenado: string): Promise<Buffer | null> {
    try {
      return await readFile(this.caminho(idDocumento, nomeArmazenado));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw erro;
    }
  }
}

// ---------------------------------------------------------------------------
// Implementação em memória (testes)
// ---------------------------------------------------------------------------

export class ArmazenamentoEmMemoria implements ArmazenamentoArquivos {
  readonly arquivos = new Map<string, Buffer>();
  /** Nos testes: faz `salvar` falhar depois de gravar este número de arquivos. */
  falharAposGravar: number | null = null;

  private chave(idDocumento: string, nomeArmazenado: string) {
    exigirIdSeguro(idDocumento);
    if (!caminhoRelativoSeguro(nomeArmazenado)) throw new ErroArmazenamento('Nome de arquivo inválido para o armazenamento.');
    return `${idDocumento}/${nomeArmazenado}`;
  }

  async salvar(idDocumento: string, arquivos: readonly ArquivoParaSalvar[]): Promise<void> {
    const gravados: string[] = [];
    try {
      for (const arquivo of arquivos) {
        if (this.falharAposGravar !== null && gravados.length >= this.falharAposGravar) {
          throw new ErroArmazenamento('Falha simulada do armazenamento.');
        }
        this.arquivos.set(this.chave(idDocumento, arquivo.nomeArmazenado), Buffer.from(arquivo.conteudo));
        gravados.push(arquivo.nomeArmazenado);
      }
    } catch (erro) {
      await this.remover(idDocumento, gravados);
      throw erro;
    }
  }

  async remover(idDocumento: string, nomesArmazenados: readonly string[]): Promise<void> {
    for (const nome of nomesArmazenados) this.arquivos.delete(this.chave(idDocumento, nome));
  }

  async ler(idDocumento: string, nomeArmazenado: string): Promise<Buffer | null> {
    return this.arquivos.get(this.chave(idDocumento, nomeArmazenado)) ?? null;
  }

  /** Nos testes: caminhos gravados de um documento. */
  listar(idDocumento: string): string[] {
    const prefixo = `${idDocumento}/`;
    return [...this.arquivos.keys()].filter((k) => k.startsWith(prefixo)).map((k) => k.slice(prefixo.length)).sort();
  }
}
