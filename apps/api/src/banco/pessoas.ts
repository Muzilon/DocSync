import { randomUUID } from 'node:crypto';
import {
  ordenarAlfabetico,
  type Area,
  type Perfil,
  type Pessoa,
  type RegistroAuditoriaPessoa,
  type StatusPessoa,
} from '@docsync/compartilhado';
import type { Executor } from './conexao.ts';

/** Autor de registros gerados pelo próprio sistema (bootstrap, vínculo no 1º login). */
export const AUTOR_SISTEMA = 'sistema';

/** Linha de usuário com os campos internos que a API precisa (idEntra não sai na resposta). */
export interface Usuario extends Pessoa {
  idEntra: string | null;
}

interface LinhaUsuario {
  id: string;
  id_entra: string | null;
  nome: string;
  email: string;
  perfil: Perfil | null;
  area_id: string | null;
  area: string | null;
  status: StatusPessoa;
}

const SELECT_USUARIO = `
  SELECT u.id, u.id_entra, u.nome, u.email, u.perfil, u.area_id, a.nome AS area, u.status
  FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id`;

function paraUsuario(l: LinhaUsuario): Usuario {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    perfil: l.perfil,
    area: l.area,
    status: l.status,
    idEntra: l.id_entra,
    areaId: l.area_id,
  };
}

/** Só os campos do contrato `Pessoa` (dados minimizados, LGPD). */
export function paraPessoa(u: Usuario): Pessoa {
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, area: u.area, areaId: u.areaId, status: u.status };
}

export function novoIdUsuario(): string {
  return `USR-${randomUUID()}`;
}

async function umUsuario(db: Executor, where: string, valor: string): Promise<Usuario | null> {
  const { rows } = await db.query<LinhaUsuario>(`${SELECT_USUARIO} WHERE ${where} = $1`, [valor]);
  return rows[0] ? paraUsuario(rows[0]) : null;
}

export const buscarPorId = (db: Executor, id: string) => umUsuario(db, 'u.id', id);
export const buscarPorIdEntra = (db: Executor, idEntra: string) => umUsuario(db, 'u.id_entra', idEntra);
export const buscarPorEmail = (db: Executor, email: string) => umUsuario(db, 'u.email', email.toLowerCase());

export async function listarUsuarios(db: Executor): Promise<Usuario[]> {
  const { rows } = await db.query<LinhaUsuario>(SELECT_USUARIO);
  return ordenarAlfabetico(rows.map(paraUsuario), (u) => u.nome);
}

/** Chave fixa do bloqueio que serializa as decisões sobre "quem é Administrador ativo". */
const CHAVE_BLOQUEIO_ADMINISTRADORES = 7_007_001;

/**
 * Bloqueia, até o fim da transação, qualquer outra transação que também vá decidir
 * sobre Administradores ativos (bootstrap e regra do último Administrador).
 * Sem isso, duas transações simultâneas poderiam contar "1 admin" e rebaixar cada
 * uma um admin diferente, ou duas pessoas poderiam virar admin pelo bootstrap.
 * Usa advisory lock (não FOR UPDATE) porque o bootstrap precisa bloquear justamente
 * quando não existe nenhuma linha de Administrador para travar.
 * Chame dentro da transação, antes de contarAdministradoresAtivos.
 */
export async function bloquearDecisaoAdministradores(tx: Executor): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock($1)', [CHAVE_BLOQUEIO_ADMINISTRADORES]);
}

export async function contarAdministradoresAtivos(db: Executor, excetoId?: string): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM usuarios
     WHERE perfil = 'Administrador' AND status = 'Ativo' AND ($1::text IS NULL OR id <> $1)`,
    [excetoId ?? null],
  );
  return rows[0]?.total ?? 0;
}

export interface DadosNovoUsuario {
  idEntra: string | null;
  nome: string;
  email: string;
  perfil: Perfil | null;
  areaId: string | null;
}

export async function inserirUsuario(db: Executor, dados: DadosNovoUsuario): Promise<Usuario> {
  const id = novoIdUsuario();
  await db.query(
    `INSERT INTO usuarios (id, id_entra, nome, email, perfil, area_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, dados.idEntra, dados.nome, dados.email.toLowerCase(), dados.perfil, dados.areaId],
  );
  return (await buscarPorId(db, id))!;
}

/** Colunas que podem ser alteradas por atualizarUsuario. */
export interface CamposUsuario {
  id_entra?: string;
  perfil?: Perfil | null;
  area_id?: string | null;
  status?: StatusPessoa;
}

export async function atualizarUsuario(db: Executor, id: string, campos: CamposUsuario): Promise<Usuario> {
  const colunas = Object.keys(campos) as (keyof CamposUsuario)[];
  if (colunas.length > 0) {
    const sets = colunas.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await db.query(`UPDATE usuarios SET ${sets}, atualizado_em = now() WHERE id = $1`, [
      id,
      ...colunas.map((c) => campos[c] ?? null),
    ]);
  }
  return (await buscarPorId(db, id))!;
}

// --- Áreas ------------------------------------------------------------------

export async function listarAreasAtivas(db: Executor): Promise<Area[]> {
  const { rows } = await db.query<Area>('SELECT id, nome, ativa FROM areas WHERE ativa');
  return ordenarAlfabetico(rows, (a) => a.nome);
}

/** Área ativa pelo nome exato (usada só no bootstrap, que recebe o nome do .env). */
export async function buscarAreaAtivaPorNome(db: Executor, nome: string): Promise<Area | null> {
  const { rows } = await db.query<Area>('SELECT id, nome, ativa FROM areas WHERE nome = $1 AND ativa', [nome]);
  return rows[0] ?? null;
}

export async function buscarAreaAtiva(db: Executor, id: string): Promise<Area | null> {
  const { rows } = await db.query<Area>('SELECT id, nome, ativa FROM areas WHERE id = $1 AND ativa', [id]);
  return rows[0] ?? null;
}

// --- Auditoria (imutável: só INSERT) ------------------------------------------

export interface NovoRegistroAuditoria {
  idUsuario: string;
  autorId: string;
  campo: string;
  antes: string | null;
  depois: string | null;
}

export async function registrarAuditoria(db: Executor, r: NovoRegistroAuditoria): Promise<void> {
  await db.query(
    `INSERT INTO auditoria_pessoas (id, id_usuario, autor_id, campo, antes, depois)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`AUD-${randomUUID()}`, r.idUsuario, r.autorId, r.campo, r.antes, r.depois],
  );
}

export async function listarAuditoria(db: Executor, idUsuario: string): Promise<RegistroAuditoriaPessoa[]> {
  const { rows } = await db.query<{
    id: string;
    id_usuario: string;
    autor_id: string;
    autor_nome: string | null;
    data_hora: Date;
    campo: string;
    antes: string | null;
    depois: string | null;
  }>(
    `SELECT ap.id, ap.id_usuario, ap.autor_id, u.nome AS autor_nome, ap.data_hora, ap.campo, ap.antes, ap.depois
     FROM auditoria_pessoas ap LEFT JOIN usuarios u ON u.id = ap.autor_id
     WHERE ap.id_usuario = $1
     ORDER BY ap.ordem`,
    [idUsuario],
  );
  return rows.map((l) => ({
    id: l.id,
    idUsuario: l.id_usuario,
    autorId: l.autor_id,
    autorNome: l.autor_id === AUTOR_SISTEMA ? 'Sistema' : (l.autor_nome ?? l.autor_id),
    dataHora: new Date(l.data_hora).toISOString(),
    campo: l.campo,
    antes: l.antes,
    depois: l.depois,
  }));
}
