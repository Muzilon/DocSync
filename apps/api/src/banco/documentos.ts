import { randomUUID } from 'node:crypto';
import {
  FASE_DO_STATUS,
  STATUS_DOCUMENTO,
  ordenarAlfabetico,
  type ArquivoDocumento,
  type CartaoPainel,
  type DadosDocumento,
  type Documento,
  type EventoHistorico,
  type NovoDocumento,
  type RegistroAcessoArquivo,
  type StatusDocumento,
  type TipoAcaoHistorico,
  type TipoAcessoArquivo,
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
  responsavel_id: string | null;
  responsavel: string | null;
  versao: number;
  criado_por: string;
  criado_em: Date | string;
  data_modificacao: Date | string;
}

/** Datas só-dia saem como texto 'AAAA-MM-DD' (sem fuso); data/hora em ISO UTC. Responsável por JOIN (nome atual). */
const SELECT_DOCUMENTO = `
  SELECT d.id, d.codigo, d.titulo, d.status, d.tipo_documento_id, t.nome AS tipo_documento,
         d.revisao, to_char(d.data_recebimento, 'YYYY-MM-DD') AS data_recebimento,
         to_char(d.data_revisao, 'YYYY-MM-DD') AS data_revisao, d.reprogramado, d.qtd_reprogramacoes,
         d.remetente, d.area_id,
         a.nome AS area, d.disciplina, d.observacao, d.nome_pasta, d.nome_arquivo_principal,
         d.qtd_anexos, d.id_documento_origem, d.responsavel_id, r.nome AS responsavel,
         d.versao, d.criado_por, d.criado_em, d.data_modificacao
  FROM documentos d
  JOIN tipos_documento t ON t.id = d.tipo_documento_id
  JOIN areas a ON a.id = d.area_id
  LEFT JOIN usuarios r ON r.id = d.responsavel_id`;

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
    responsavelId: l.responsavel_id,
    responsavel: l.responsavel,
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
 * Existe OUTRO documento (id diferente de `excetoId`) com o mesmo código e revisão,
 * sem diferenciar maiúsculas? Usado na edição (contrato F6, 4.2 passo 6.5).
 */
export async function existeOutroComCodigoRevisao(
  db: Executor,
  codigo: string,
  revisao: number,
  excetoId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM documentos WHERE lower(codigo) = lower($1) AND revisao = $2 AND id <> $3',
    [codigo, revisao, excetoId],
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

// --- Edição de dados (F6) ------------------------------------------------------------

/**
 * Edição de dados (contrato F6, 4.2 passo 6.7): grava os 8 campos cadastrais, o
 * `nome_pasta` recalculado (só exibição; a pasta real é pelo ID, P-07) e incrementa a
 * versão. Só atualiza se a versão for a esperada (`WHERE versao = $n`); devolve o
 * documento atualizado ou null se já mudou. NÃO toca em status, responsável, datas do
 * servidor, contadores, `hash_cadastro`, `criado_por` nem `id_documento_origem` (P-14).
 */
export async function aplicarEdicao(
  tx: Executor,
  id: string,
  versaoEsperada: number,
  dados: DadosDocumento,
  nomePasta: string,
): Promise<Documento | null> {
  const { affectedRows } = await tx.query(
    `UPDATE documentos
        SET titulo = $3, codigo = $4, tipo_documento_id = $5, revisao = $6, remetente = $7, area_id = $8,
            disciplina = $9, observacao = $10, nome_pasta = $11, versao = versao + 1, data_modificacao = now()
      WHERE id = $1 AND versao = $2`,
    [
      id,
      versaoEsperada,
      dados.titulo,
      dados.codigo,
      dados.tipoDocumentoId,
      dados.revisao,
      dados.remetente,
      dados.areaId,
      dados.disciplina,
      dados.observacao,
      nomePasta,
    ],
  );
  if (!affectedRows) return null;
  return buscarDocumento(tx, id);
}

// --- Mudança de status (F5) -----------------------------------------------------------

/**
 * Transição de status (contrato F5, 3.2, passo 6.6): grava o status novo, o responsável
 * pela etapa (null em Aprovado) e incrementa a versão. Só atualiza se a versão for a
 * esperada (`WHERE versao = $n`); devolve o documento atualizado ou null se já mudou.
 * A F5 muda SÓ `status`, `responsavel_id`, `versao` e `data_modificacao` (P-14).
 */
export async function aplicarTransicao(
  tx: Executor,
  id: string,
  versaoEsperada: number,
  status: StatusDocumento,
  responsavelId: string | null,
): Promise<Documento | null> {
  const { affectedRows } = await tx.query(
    `UPDATE documentos
        SET status = $3, responsavel_id = $4, versao = versao + 1, data_modificacao = now()
      WHERE id = $1 AND versao = $2`,
    [id, versaoEsperada, status, responsavelId],
  );
  if (!affectedRows) return null;
  return buscarDocumento(tx, id);
}

/** Cancelamento (contrato 3.3): status 'Cancelado', `responsavel_id` intacto, versão + 1. */
export async function aplicarCancelamento(tx: Executor, id: string, versaoEsperada: number): Promise<Documento | null> {
  return mudarSoStatus(tx, id, versaoEsperada, 'Cancelado');
}

/** Reativação (contrato 3.4, decisão 0004): volta ao `destino`, `responsavel_id` intacto, versão + 1. */
export async function aplicarReativacao(
  tx: Executor,
  id: string,
  versaoEsperada: number,
  destino: StatusDocumento,
): Promise<Documento | null> {
  return mudarSoStatus(tx, id, versaoEsperada, destino);
}

async function mudarSoStatus(tx: Executor, id: string, versaoEsperada: number, status: StatusDocumento) {
  const { affectedRows } = await tx.query(
    `UPDATE documentos SET status = $3, versao = versao + 1, data_modificacao = now()
      WHERE id = $1 AND versao = $2`,
    [id, versaoEsperada, status],
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
  data_inicio_revisao: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  status_antes_do_cancelamento: StatusDocumento | null;
  versao: number;
  criado_em: Date | string;
  data_modificacao: Date | string;
}

/** Status cuja fase é 'devolvido' / 'revisao', pela tabela explícita (nunca pelo texto). */
const STATUS_DEVOLVIDO = STATUS_DOCUMENTO.filter((s) => FASE_DO_STATUS[s] === 'devolvido');
const STATUS_REVISAO = STATUS_DOCUMENTO.filter((s) => FASE_DO_STATUS[s] === 'revisao');

/**
 * Cartões do painel (só campos de exibição; sem observação, arquivos nem `criadoPor`).
 * `qtd_devolucoes` = eventos STATUS/CANCELAMENTO que entraram na fase 'devolvido'
 * (vindos de outra fase); `data_aprovacao` = dia (fuso de São Paulo) do evento STATUS
 * mais recente com status 'Aprovado'; `data_inicio_revisao` = dia do PRIMEIRO evento STATUS
 * em fase 'revisao'; `status_antes_do_cancelamento` = statusAnterior do último CANCELAMENTO
 * (só quando o documento está Cancelado). Tudo vem de eventos, nunca de contador editável;
 * as funções puras `contarDevolucoes`, `dataAprovacao` e `dataInicioRevisao` (compartilhado)
 * aplicam a mesma regra sobre os eventos devolvidos por GET /documentos/:id.
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
            (SELECT to_char(min(e.data_hora) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
               FROM eventos_historico e
              WHERE e.id_documento = d.id AND e.tipo_acao = 'STATUS'
                AND e.status = ANY($4::text[])) AS data_inicio_revisao,
            d.responsavel_id, r.nome AS responsavel,
            CASE WHEN d.status = 'Cancelado' THEN
              (SELECT e.status_anterior FROM eventos_historico e
                WHERE e.id_documento = d.id AND e.tipo_acao = 'CANCELAMENTO'
                ORDER BY e.ordem DESC LIMIT 1)
            END AS status_antes_do_cancelamento,
            d.versao, d.criado_em, d.data_modificacao
       FROM documentos d
       JOIN tipos_documento t ON t.id = d.tipo_documento_id
       JOIN areas a ON a.id = d.area_id
       LEFT JOIN usuarios r ON r.id = d.responsavel_id
      WHERE ($1::text IS NULL OR d.area_id = $1)
        AND ($2::boolean OR d.status <> 'Cancelado')
      ORDER BY d.data_revisao ASC NULLS LAST, d.criado_em ASC, d.id`,
    [areaId, incluirCancelados, STATUS_DEVOLVIDO, STATUS_REVISAO],
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
    dataInicioRevisao: l.data_inicio_revisao,
    responsavelId: l.responsavel_id,
    responsavel: l.responsavel,
    statusAntesDoCancelamento: l.status_antes_do_cancelamento,
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

/** Arquivo como está no banco: metadados públicos + o caminho relativo no armazenamento. */
export interface ArquivoGravado extends ArquivoDocumento {
  idDocumento: string;
  nomeArmazenado: string;
}

interface LinhaArquivo {
  id: string;
  id_documento: string;
  papel: PapelArquivo;
  nome_original: string;
  nome_armazenado: string;
  tamanho: number;
  criado_em: Date | string;
}

const SELECT_ARQUIVO = `
  SELECT id, id_documento, papel, nome_original, nome_armazenado, tamanho::integer AS tamanho, criado_em
  FROM arquivos_documento`;

function paraArquivo(l: LinhaArquivo): ArquivoGravado {
  return {
    id: l.id,
    idDocumento: l.id_documento,
    papel: l.papel,
    nomeOriginal: l.nome_original,
    nomeArmazenado: l.nome_armazenado,
    tamanho: l.tamanho,
    criadoEm: iso(l.criado_em),
  };
}

/** Só os campos do contrato (sem `nomeArmazenado`, sem `tipoMime`, sem `idDocumento`). */
export function paraArquivoDocumento(a: ArquivoGravado): ArquivoDocumento {
  return { id: a.id, papel: a.papel, nomeOriginal: a.nomeOriginal, tamanho: a.tamanho, criadoEm: a.criadoEm };
}

/** Arquivos do documento: principal primeiro, depois anexos em ordem alfabética pt-BR do nome original. */
export async function listarArquivos(db: Executor, idDocumento: string): Promise<ArquivoGravado[]> {
  const { rows } = await db.query<LinhaArquivo>(`${SELECT_ARQUIVO} WHERE id_documento = $1`, [idDocumento]);
  const arquivos = rows.map(paraArquivo);
  const principais = arquivos.filter((a) => a.papel === 'principal');
  const anexos = ordenarAlfabetico(
    arquivos.filter((a) => a.papel === 'anexo'),
    (a) => a.nomeOriginal,
  );
  return [...principais, ...anexos];
}

/**
 * Arquivo pelo ID, só se pertencer a ESTE documento (contrato F4, 4.2, passo 4):
 * um `ARQ-uuid` de outro documento responde null, como se não existisse.
 */
export async function buscarArquivoDoDocumento(
  db: Executor,
  idDocumento: string,
  idArquivo: string,
): Promise<ArquivoGravado | null> {
  const { rows } = await db.query<LinhaArquivo>(`${SELECT_ARQUIVO} WHERE id = $1 AND id_documento = $2`, [
    idArquivo,
    idDocumento,
  ]);
  return rows[0] ? paraArquivo(rows[0]) : null;
}

// --- Registro de acesso a arquivos (decisão 0013; imutável: só INSERT) -----------------

export interface NovoRegistroAcesso {
  idDocumento: string;
  idArquivo: string;
  tipo: TipoAcessoArquivo;
  /** Sempre do token. */
  autorId: string;
  autorNome: string;
}

export async function registrarAcessoArquivo(db: Executor, r: NovoRegistroAcesso): Promise<string> {
  const id = `ACS-${randomUUID()}`;
  await db.query(
    `INSERT INTO registros_acesso_arquivos (id, id_documento, id_arquivo, tipo, autor_id, autor_nome)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, r.idDocumento, r.idArquivo, r.tipo, r.autorId, r.autorNome],
  );
  return id;
}

interface LinhaAcesso {
  id: string;
  id_documento: string;
  id_arquivo: string;
  tipo: TipoAcessoArquivo;
  autor_id: string;
  autor_nome: string;
  data_hora: Date | string;
}

/** Registros de acesso de um documento, em ordem de gravação (sem tela nesta fatia; usado em testes). */
export async function listarAcessosArquivos(db: Executor, idDocumento: string): Promise<RegistroAcessoArquivo[]> {
  const { rows } = await db.query<LinhaAcesso>(
    `SELECT id, id_documento, id_arquivo, tipo, autor_id, autor_nome, data_hora
       FROM registros_acesso_arquivos WHERE id_documento = $1 ORDER BY ordem`,
    [idDocumento],
  );
  return rows.map((l) => ({
    id: l.id,
    idDocumento: l.id_documento,
    idArquivo: l.id_arquivo,
    tipo: l.tipo,
    autorId: l.autor_id,
    autorNome: l.autor_nome,
    dataHora: iso(l.data_hora),
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
  /** Nome do responsável pela etapa no momento (F5); null quando não há. */
  responsavel: string | null;
  /** ID do responsável (F5, migração 0005); null quando não há. */
  responsavelId: string | null;
  autorId: string;
  autorNome: string;
  detalhes: EventoHistorico['detalhes'];
  observacao: string | null;
}

export async function registrarEvento(db: Executor, e: NovoEvento): Promise<string> {
  const id = `HIST-${randomUUID()}`;
  await db.query(
    `INSERT INTO eventos_historico (
       id, id_documento, codigo, tipo_acao, status, status_anterior, destino, responsavel, responsavel_id,
       autor_id, autor_nome, detalhes, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
    [
      id,
      e.idDocumento,
      e.codigo,
      e.tipoAcao,
      e.status,
      e.statusAnterior,
      e.destino,
      e.responsavel,
      e.responsavelId,
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
  responsavel_id: string | null;
  autor_id: string;
  autor_nome: string;
  detalhes: EventoHistorico['detalhes'] | string;
  observacao: string | null;
}

const SELECT_EVENTO = `
  SELECT id, id_documento, codigo, tipo_acao, status, status_anterior, data_hora, destino,
         responsavel, responsavel_id, autor_id, autor_nome, detalhes, observacao
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
    responsavelId: l.responsavel_id,
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
