import { randomUUID } from 'node:crypto';
import {
  ordenarAlfabetico,
  type Documento,
  type EventoHistorico,
  type NovoDocumento,
  type StatusDocumento,
  type TipoAcaoHistorico,
  type TipoDocumento,
} from '@docsync/compartilhado';
import type { PapelArquivo } from '../armazenamento/arquivos.ts';
import type { Executor } from './conexao.ts';

// --- Tipos de documento ---------------------------------------------------------

export async function listarTiposAtivos(db: Executor): Promise<TipoDocumento[]> {
  const { rows } = await db.query<TipoDocumento>('SELECT id, nome, ativo FROM tipos_documento WHERE ativo');
  return ordenarAlfabetico(rows, (t) => t.nome);
}

export async function buscarTipoAtivo(db: Executor, id: string): Promise<TipoDocumento | null> {
  const { rows } = await db.query<TipoDocumento>(
    'SELECT id, nome, ativo FROM tipos_documento WHERE id = $1 AND ativo',
    [id],
  );
  return rows[0] ?? null;
}

// --- Documentos -------------------------------------------------------------------

interface LinhaDocumento {
  id: string;
  codigo: string | null;
  titulo: string;
  status: StatusDocumento;
  tipo_documento_id: string;
  tipo_documento: string;
  revisao: number;
  data_recebimento: string;
  data_revisao: string | null;
  remetente: string;
  area_id: string;
  area: string;
  disciplina: string | null;
  observacao: string | null;
  nome_pasta: string;
  nome_arquivo_principal: string;
  qtd_anexos: number;
  id_documento_origem: string | null;
  versao: number;
  criado_por: string;
  criado_em: Date | string;
  data_modificacao: Date | string;
}

/** Datas só-dia saem como texto 'AAAA-MM-DD' (sem fuso); data/hora em ISO UTC. */
const SELECT_DOCUMENTO = `
  SELECT d.id, d.codigo, d.titulo, d.status, d.tipo_documento_id, t.nome AS tipo_documento,
         d.revisao, to_char(d.data_recebimento, 'YYYY-MM-DD') AS data_recebimento,
         to_char(d.data_revisao, 'YYYY-MM-DD') AS data_revisao, d.remetente, d.area_id,
         a.nome AS area, d.disciplina, d.observacao, d.nome_pasta, d.nome_arquivo_principal,
         d.qtd_anexos, d.id_documento_origem, d.versao, d.criado_por, d.criado_em, d.data_modificacao
  FROM documentos d
  JOIN tipos_documento t ON t.id = d.tipo_documento_id
  JOIN areas a ON a.id = d.area_id`;

const iso = (valor: Date | string) => new Date(valor).toISOString();

function paraDocumento(l: LinhaDocumento): Documento {
  return {
    id: l.id,
    codigo: l.codigo,
    titulo: l.titulo,
    status: l.status,
    tipoDocumentoId: l.tipo_documento_id,
    tipoDocumento: l.tipo_documento,
    revisao: l.revisao,
    dataRecebimento: l.data_recebimento,
    dataRevisao: l.data_revisao,
    remetente: l.remetente,
    areaId: l.area_id,
    area: l.area,
    disciplina: l.disciplina,
    observacao: l.observacao,
    nomePasta: l.nome_pasta,
    nomeArquivoPrincipal: l.nome_arquivo_principal,
    qtdAnexos: l.qtd_anexos,
    idDocumentoOrigem: l.id_documento_origem,
    versao: l.versao,
    criadoPor: l.criado_por,
    criadoEm: iso(l.criado_em),
    dataModificacao: iso(l.data_modificacao),
  };
}

export async function buscarDocumento(db: Executor, id: string): Promise<Documento | null> {
  const { rows } = await db.query<LinhaDocumento>(`${SELECT_DOCUMENTO} WHERE d.id = $1`, [id]);
  return rows[0] ? paraDocumento(rows[0]) : null;
}

/** Autor e resumo do pedido de cadastro, para decidir a idempotência. */
export async function buscarOrigemCadastro(
  db: Executor,
  id: string,
): Promise<{ criadoPor: string; hashCadastro: string } | null> {
  const { rows } = await db.query<{ criado_por: string; hash_cadastro: string }>(
    'SELECT criado_por, hash_cadastro FROM documentos WHERE id = $1',
    [id],
  );
  return rows[0] ? { criadoPor: rows[0].criado_por, hashCadastro: rows[0].hash_cadastro } : null;
}

/** Existe outro documento com o mesmo código e revisão (sem diferenciar maiúsculas)? */
export async function existeCodigoRevisao(db: Executor, codigo: string, revisao: number): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM documentos WHERE lower(codigo) = lower($1) AND revisao = $2',
    [codigo, revisao],
  );
  return rows.length > 0;
}

/**
 * Documentos mais recentes (por data de cadastro).
 * @param areaId null = todas as áreas; senão, só os da área.
 */
export async function listarRecentes(db: Executor, areaId: string | null, limite: number): Promise<Documento[]> {
  const { rows } = await db.query<LinhaDocumento>(
    `${SELECT_DOCUMENTO}
     WHERE ($1::text IS NULL OR d.area_id = $1)
     ORDER BY d.criado_em DESC, d.id
     LIMIT $2`,
    [areaId, limite],
  );
  return rows.map(paraDocumento);
}

export interface DadosInsercaoDocumento extends NovoDocumento {
  status: StatusDocumento;
  nomePasta: string;
  nomeArquivoPrincipal: string;
  qtdAnexos: number;
  criadoPor: string;
  hashCadastro: string;
}

/** Insere um documento novo. Inserir é exclusividade do cadastro (documento 02, seção 4.4). */
export async function inserirDocumento(db: Executor, d: DadosInsercaoDocumento): Promise<void> {
  await db.query(
    `INSERT INTO documentos (
       id, codigo, titulo, status, tipo_documento_id, revisao, data_recebimento, data_revisao,
       remetente, area_id, disciplina, observacao, nome_pasta, nome_arquivo_principal, qtd_anexos,
       criado_por, hash_cadastro)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      d.id,
      d.codigo,
      d.titulo,
      d.status,
      d.tipoDocumentoId,
      d.revisao,
      d.dataRecebimento,
      d.dataRevisao,
      d.remetente,
      d.areaId,
      d.disciplina,
      d.observacao,
      d.nomePasta,
      d.nomeArquivoPrincipal,
      d.qtdAnexos,
      d.criadoPor,
      d.hashCadastro,
    ],
  );
}

// --- Arquivos -----------------------------------------------------------------------

export interface RegistroArquivo {
  papel: PapelArquivo;
  nomeOriginal: string;
  nomeArmazenado: string;
  tamanho: number;
  tipoMime: string;
}

export async function inserirArquivos(db: Executor, idDocumento: string, arquivos: readonly RegistroArquivo[]) {
  for (const a of arquivos) {
    await db.query(
      `INSERT INTO arquivos_documento (id, id_documento, papel, nome_original, nome_armazenado, tamanho, tipo_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`ARQ-${randomUUID()}`, idDocumento, a.papel, a.nomeOriginal, a.nomeArmazenado, a.tamanho, a.tipoMime],
    );
  }
}

export async function listarArquivos(db: Executor, idDocumento: string): Promise<RegistroArquivo[]> {
  const { rows } = await db.query<{
    papel: PapelArquivo;
    nome_original: string;
    nome_armazenado: string;
    tamanho: number;
    tipo_mime: string;
  }>(
    `SELECT papel, nome_original, nome_armazenado, tamanho::integer AS tamanho, tipo_mime
     FROM arquivos_documento WHERE id_documento = $1
     ORDER BY papel DESC, nome_armazenado`,
    [idDocumento],
  );
  return rows.map((l) => ({
    papel: l.papel,
    nomeOriginal: l.nome_original,
    nomeArmazenado: l.nome_armazenado,
    tamanho: l.tamanho,
    tipoMime: l.tipo_mime,
  }));
}

// --- Eventos de histórico (imutáveis: só INSERT) --------------------------------------

export interface NovoEvento {
  idDocumento: string;
  codigo: string | null;
  tipoAcao: TipoAcaoHistorico;
  status: StatusDocumento;
  statusAnterior: StatusDocumento | null;
  destino: string | null;
  responsavel: string | null;
  autorId: string;
  autorNome: string;
  detalhes: EventoHistorico['detalhes'];
  observacao: string | null;
}

export async function registrarEvento(db: Executor, e: NovoEvento): Promise<string> {
  const id = `HIST-${randomUUID()}`;
  await db.query(
    `INSERT INTO eventos_historico (
       id, id_documento, codigo, tipo_acao, status, status_anterior, destino, responsavel,
       autor_id, autor_nome, detalhes, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
    [
      id,
      e.idDocumento,
      e.codigo,
      e.tipoAcao,
      e.status,
      e.statusAnterior,
      e.destino,
      e.responsavel,
      e.autorId,
      e.autorNome,
      JSON.stringify(e.detalhes),
      e.observacao,
    ],
  );
  return id;
}

export async function listarEventos(db: Executor, idDocumento: string): Promise<EventoHistorico[]> {
  const { rows } = await db.query<{
    id: string;
    id_documento: string;
    codigo: string | null;
    tipo_acao: TipoAcaoHistorico;
    status: StatusDocumento;
    status_anterior: StatusDocumento | null;
    data_hora: Date | string;
    destino: string | null;
    responsavel: string | null;
    autor_id: string;
    autor_nome: string;
    detalhes: EventoHistorico['detalhes'] | string;
    observacao: string | null;
  }>(
    `SELECT id, id_documento, codigo, tipo_acao, status, status_anterior, data_hora, destino,
            responsavel, autor_id, autor_nome, detalhes, observacao
     FROM eventos_historico WHERE id_documento = $1 ORDER BY ordem`,
    [idDocumento],
  );
  return rows.map((l) => ({
    id: l.id,
    idDocumento: l.id_documento,
    codigo: l.codigo,
    tipoAcao: l.tipo_acao,
    status: l.status,
    statusAnterior: l.status_anterior,
    dataHora: iso(l.data_hora),
    destino: l.destino,
    responsavel: l.responsavel,
    autorId: l.autor_id,
    autorNome: l.autor_nome,
    detalhes: typeof l.detalhes === 'string' ? JSON.parse(l.detalhes) : l.detalhes,
    observacao: l.observacao,
  }));
}
