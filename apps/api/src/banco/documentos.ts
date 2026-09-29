import { randomUUID } from 'node:crypto';
import {
  FASE_DO_STATUS,
  STATUS_DOCUMENTO,
  ordenarAlfabetico,
  type CartaoPainel,
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
  reprogramado: boolean;
  qtd_reprogramacoes: number;
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
         to_char(d.data_revisao, 'YYYY-MM-DD') AS data_revisao, d.reprogramado, d.qtd_reprogramacoes,
         d.remetente, d.area_id,
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
    reprogramado: l.reprogramado,
    qtdReprogramacoes: l.qtd_reprogramacoes,
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

/**
 * Lê o documento bloqueando a linha até o fim da transação (`FOR UPDATE`), para a
 * decisão de concorrência/idempotência ser feita sobre o estado atual. Em PGlite
 * (uma conexão) o bloqueio é inócuo; vale para o PostgreSQL real. Chame dentro de
 * uma transação.
 */
export async function buscarDocumentoParaAtualizar(tx: Executor, id: string): Promise<Documento | null> {
  await tx.query('SELECT 1 FROM documentos WHERE id = $1 FOR UPDATE', [id]);
  return buscarDocumento(tx, id);
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
  /** Dia do cadastro no fuso de São Paulo (decisão 0012). */
  dataRecebimento: string;
  /** Prazo automático: `dataRecebimento` + 30 dias (decisão 0011). */
  dataRevisao: string;
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

/**
 * Reprogramação do prazo (decisão 0011): grava o novo prazo, marca como
 * reprogramado, incrementa a contagem e a versão. Só atualiza se a versão for a
 * esperada (concorrência otimista); devolve o documento atualizado ou null se a
 * versão já mudou.
 */
export async function aplicarReprogramacao(
  tx: Executor,
  id: string,
  versaoEsperada: number,
  novoPrazo: string,
): Promise<Documento | null> {
  const { affectedRows } = await tx.query(
    `UPDATE documentos
        SET data_revisao = $3, reprogramado = true, qtd_reprogramacoes = qtd_reprogramacoes + 1,
            versao = versao + 1, data_modificacao = now()
      WHERE id = $1 AND versao = $2`,
    [id, versaoEsperada, novoPrazo],
  );
  if (!affectedRows) return null;
  return buscarDocumento(tx, id);
}

// --- Painel (F3) ---------------------------------------------------------------------

interface LinhaCartao {
  id: string;
  codigo: string | null;
  titulo: string;
  revisao: number;
  status: StatusDocumento;
  tipo_documento: string;
  area_id: string;
  area: string;
  remetente: string;
  data_recebimento: string;
  data_revisao: string | null;
  reprogramado: boolean;
  qtd_reprogramacoes: number;
  qtd_devolucoes: number;
  data_aprovacao: string | null;
  versao: number;
  criado_em: Date | string;
  data_modificacao: Date | string;
}

/** Status cuja fase é 'devolvido', pela tabela explícita (nunca pelo texto). */
const STATUS_DEVOLVIDO = STATUS_DOCUMENTO.filter((s) => FASE_DO_STATUS[s] === 'devolvido');

/**
 * Cartões do painel (só campos de exibição; sem observação, arquivos nem `criadoPor`).
 * `qtd_devolucoes` = eventos STATUS/CANCELAMENTO que entraram na fase 'devolvido'
 * (vindos de outra fase); `data_aprovacao` = dia (fuso de São Paulo) do evento STATUS
 * mais recente com status 'Aprovado'. Os dois vêm de eventos, nunca de contador editável.
 * Ordem: prazo crescente (nulos por último), depois cadastro, depois id.
 * @param areaId null = todas as áreas; senão, só essa área.
 * @param incluirCancelados false = só documentos que não estão cancelados.
 */
export async function listarCartoes(db: Executor, areaId: string | null, incluirCancelados: boolean): Promise<CartaoPainel[]> {
  const { rows } = await db.query<LinhaCartao>(
    `SELECT d.id, d.codigo, d.titulo, d.revisao, d.status, t.nome AS tipo_documento, d.area_id, a.nome AS area,
            d.remetente, to_char(d.data_recebimento, 'YYYY-MM-DD') AS data_recebimento,
            to_char(d.data_revisao, 'YYYY-MM-DD') AS data_revisao, d.reprogramado, d.qtd_reprogramacoes,
            (SELECT count(*)::int FROM eventos_historico e
              WHERE e.id_documento = d.id
                AND e.tipo_acao IN ('STATUS', 'CANCELAMENTO')
                AND e.status = ANY($3::text[])
                AND (e.status_anterior IS NULL OR NOT (e.status_anterior = ANY($3::text[])))) AS qtd_devolucoes,
            (SELECT to_char(max(e.data_hora) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
               FROM eventos_historico e
              WHERE e.id_documento = d.id AND e.tipo_acao = 'STATUS' AND e.status = 'Aprovado') AS data_aprovacao,
            d.versao, d.criado_em, d.data_modificacao
       FROM documentos d
       JOIN tipos_documento t ON t.id = d.tipo_documento_id
       JOIN areas a ON a.id = d.area_id
      WHERE ($1::text IS NULL OR d.area_id = $1)
        AND ($2::boolean OR d.status <> 'Cancelado')
      ORDER BY d.data_revisao ASC NULLS LAST, d.criado_em ASC, d.id`,
    [areaId, incluirCancelados, STATUS_DEVOLVIDO],
  );
  return rows.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    titulo: l.titulo,
    revisao: l.revisao,
    status: l.status,
    fase: FASE_DO_STATUS[l.status],
    tipoDocumento: l.tipo_documento,
    areaId: l.area_id,
    area: l.area,
    remetente: l.remetente,
    dataRecebimento: l.data_recebimento,
    dataRevisao: l.data_revisao,
    reprogramado: l.reprogramado,
    qtdReprogramacoes: l.qtd_reprogramacoes,
    qtdDevolucoes: l.qtd_devolucoes,
    dataAprovacao: l.data_aprovacao,
    versao: l.versao,
    criadoEm: iso(l.criado_em),
    dataModificacao: iso(l.data_modificacao),
  }));
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

interface LinhaEvento {
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
}

const SELECT_EVENTO = `
  SELECT id, id_documento, codigo, tipo_acao, status, status_anterior, data_hora, destino,
         responsavel, autor_id, autor_nome, detalhes, observacao
  FROM eventos_historico`;

function paraEvento(l: LinhaEvento): EventoHistorico {
  return {
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
  };
}

export async function listarEventos(db: Executor, idDocumento: string): Promise<EventoHistorico[]> {
  const { rows } = await db.query<LinhaEvento>(`${SELECT_EVENTO} WHERE id_documento = $1 ORDER BY ordem`, [idDocumento]);
  return rows.map(paraEvento);
}

export async function buscarEvento(db: Executor, id: string): Promise<EventoHistorico | null> {
  const { rows } = await db.query<LinhaEvento>(`${SELECT_EVENTO} WHERE id = $1`, [id]);
  return rows[0] ? paraEvento(rows[0]) : null;
}

/** Último evento gravado do documento (pela ordem de gravação), ou null. */
export async function ultimoEvento(db: Executor, idDocumento: string): Promise<EventoHistorico | null> {
  const { rows } = await db.query<LinhaEvento>(
    `${SELECT_EVENTO} WHERE id_documento = $1 ORDER BY ordem DESC LIMIT 1`,
    [idDocumento],
  );
  return rows[0] ? paraEvento(rows[0]) : null;
}
