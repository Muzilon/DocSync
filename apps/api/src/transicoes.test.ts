/**
 * F5: transições, cancelamento, reativação, responsáveis e painel com os campos novos
 * (contrato docs/contratos/f5-mudanca-de-status.md, seção 8).
 */
import { randomUUID } from 'node:crypto';
import {
  OBSERVACAO_CANCELAMENTO_DESFEITO,
  SUFIXO_REATIVACAO_RESERVA,
  avaliarMetas,
  contarDevolucoes,
  dataAprovacao,
  dataInicioRevisao,
  statusDeReativacao,
} from '@docsync/compartilhado';
import type {
  Area,
  DetalheDocumento,
  Documento,
  EventoHistorico,
  NovoDocumento,
  Pessoa,
  PessoaResumo,
  RespostaPainel,
  ResultadoTransicao,
  StatusDocumento,
  TipoDocumento,
} from '@docsync/compartilhado';
import type { JWTPayload } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN,
  criarAmbiente,
  criarEntraFalso,
  pessoaFicticia,
  type Ambiente,
  type EntraFalso,
  type ParteFormulario,
} from './apoio-testes.ts';
import { hojeNoFuso } from './datas.ts';

let entra: EntraFalso;
let amb: Ambiente;

beforeAll(async () => {
  entra = await criarEntraFalso();
});
beforeEach(async () => {
  amb = await criarAmbiente(entra);
  await amb.chamar(ADMIN, 'GET', '/eu');
});
afterEach(async () => {
  await amb.fechar();
});

const HOJE = hojeNoFuso();
const MOTIVO = 'Documento substituído pela revisão seguinte.';

async function idDaArea(nome: string): Promise<string> {
  const areas = (await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
  return areas.find((a) => a.nome === nome)!.id;
}

/** Pré-cadastra uma pessoa (perfil e área) e devolve a identidade do token e o registro. */
async function pessoaComPerfil(apelido: string, perfil: Pessoa['perfil'], area: string | null = 'Qualidade') {
  const identidade = pessoaFicticia(apelido);
  const criada = await amb.chamar(ADMIN, 'POST', '/pessoas', {
    email: identidade.preferred_username,
    nome: identidade.name,
    perfil,
    areaId: area === null ? null : await idDaArea(area),
  });
  expect(criada.statusCode).toBe(201);
  return { identidade, pessoa: criada.json<Pessoa>() };
}

async function euDe(identidade: JWTPayload): Promise<Pessoa> {
  return (await amb.chamar(identidade, 'GET', '/eu')).json<Pessoa>();
}

const PDF: ParteFormulario = { campo: 'arquivoPrincipal', arquivo: 'doc.pdf', conteudo: '%PDF-1.4 fictício', tipo: 'application/pdf' };

async function cadastrar(extra: Partial<NovoDocumento> = {}, quem: JWTPayload = ADMIN): Promise<Documento> {
  const tipos = (await amb.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
  const dados: NovoDocumento = {
    id: `DOC-${randomUUID()}`,
    codigo: null,
    titulo: 'Procedimento de Compras',
    tipoDocumentoId: tipos[0]!.id,
    revisao: 0,
    remetente: 'Remetente Fictício',
    areaId: await idDaArea('Engenharia'),
    disciplina: null,
    observacao: null,
    ...extra,
  };
  const resposta = await amb.enviarFormulario(quem, '/documentos', [{ campo: 'dados', valor: JSON.stringify(dados) }, PDF]);
  expect(resposta.statusCode).toBe(201);
  return resposta.json<Documento>();
}

const transicionar = (quem: JWTPayload, id: string, corpo: unknown) => amb.chamar(quem, 'POST', `/documentos/${id}/transicoes`, corpo);
const cancelar = (quem: JWTPayload, id: string, corpo: unknown) => amb.chamar(quem, 'POST', `/documentos/${id}/cancelamentos`, corpo);
const reativar = (quem: JWTPayload, id: string, corpo: unknown) => amb.chamar(quem, 'POST', `/documentos/${id}/reativacoes`, corpo);

async function detalhe(id: string): Promise<DetalheDocumento> {
  const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${id}`);
  expect(resposta.statusCode).toBe(200);
  return resposta.json<DetalheDocumento>();
}
const eventosDe = async (id: string): Promise<EventoHistorico[]> => (await detalhe(id)).eventos;

/** Aplica uma transição que deve dar 201 e devolve o documento atualizado. */
async function avancar(quem: JWTPayload, doc: Documento, para: StatusDocumento, responsavelId: string | null, observacao: string | null = null) {
  const resposta = await transicionar(quem, doc.id, { para, responsavelId, observacao, versao: doc.versao });
  expect(resposta.statusCode, JSON.stringify(resposta.json())).toBe(201);
  return resposta.json<ResultadoTransicao>();
}

/** Cadastra e leva até 'Em revisão da qualidade' com o responsável dado (1 transição). */
async function emRevisao(responsavelId: string, extra: Partial<NovoDocumento> = {}) {
  const doc = await cadastrar(extra);
  return (await avancar(ADMIN, doc, 'Em revisão da qualidade', responsavelId)).documento;
}

/** Insere um evento direto no banco (só para simular dados migrados / hora fixa). */
async function inserirEventoNoBanco(id: string, tipoAcao: string, status: string, statusAnterior: string | null) {
  const eu = await euDe(ADMIN);
  await amb.banco.query(
    `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, status_anterior, autor_id, autor_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [`HIST-${randomUUID()}`, id, tipoAcao, status, statusAnterior, eu.id, eu.nome],
  );
}

// ---------------------------------------------------------------------------

describe('POST /documentos/:id/transicoes', () => {
  it('201: status, responsável (id e nome atual), versão + 1; evento STATUS com statusAnterior, responsável e autor do token', async () => {
    const { identidade: qualidade, pessoa: q } = await pessoaComPerfil('qualidade', 'Qualidade');
    const doc = await cadastrar();
    const resposta = await transicionar(qualidade, doc.id, {
      para: 'Em revisão da qualidade',
      responsavelId: q.id,
      observacao: '  Iniciando a revisão.  ',
      versao: 1,
    });
    expect(resposta.statusCode).toBe(201);
    const { documento, evento } = resposta.json<ResultadoTransicao>();
    expect(documento).toMatchObject({
      id: doc.id,
      status: 'Em revisão da qualidade',
      responsavelId: q.id,
      responsavel: 'Pessoa qualidade',
      versao: 2,
      dataRevisao: doc.dataRevisao, // P-14: só status, responsável, versão e modificação mudam.
      reprogramado: false,
    });
    expect(new Date(documento.dataModificacao).getTime()).toBeGreaterThanOrEqual(new Date(doc.dataModificacao).getTime());
    expect(evento).toMatchObject({
      id: expect.stringMatching(/^HIST-/),
      idDocumento: doc.id,
      tipoAcao: 'STATUS',
      status: 'Em revisão da qualidade',
      statusAnterior: 'Recebido',
      responsavel: 'Pessoa qualidade',
      responsavelId: q.id,
      autorId: q.id,
      autorNome: 'Pessoa qualidade',
      destino: null,
      detalhes: [],
      observacao: 'Iniciando a revisão.',
    });
    expect((await eventosDe(doc.id)).map((e) => e.tipoAcao)).toEqual(['CRIACAO', 'STATUS']);
    // GET /documentos/:id devolve o responsável.
    expect((await detalhe(doc.id)).documento).toMatchObject({ responsavelId: q.id, responsavel: 'Pessoa qualidade' });
  });

  it('Aprovado: responsável fica null, evento sem responsável; observação vazia vira null; reenvio do "Aprovar" → 200', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await emRevisao(q.id);
    const { documento, evento } = await avancar(ADMIN, doc, 'Aprovado', null, '   ');
    expect(documento).toMatchObject({ status: 'Aprovado', responsavelId: null, responsavel: null, versao: 3 });
    expect(evento).toMatchObject({ status: 'Aprovado', statusAnterior: 'Em revisão da qualidade', responsavel: null, responsavelId: null, observacao: null });
    // Duplo clique em Aprovar: o estado final não esconde o reenvio.
    const reenvio = await transicionar(ADMIN, doc.id, { para: 'Aprovado', responsavelId: null, observacao: '   ', versao: doc.versao });
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json<ResultadoTransicao>().evento.id).toBe(evento.id);
    // Mas outro pedido com a versão velha sobre o Aprovado é 409 (final), não conflito silencioso.
    const outro = await transicionar(ADMIN, doc.id, { para: 'Para aprovação qualidade', responsavelId: q.id, observacao: null, versao: doc.versao });
    expect(outro.statusCode).toBe(409);
    expect(await eventosDe(doc.id)).toHaveLength(3);
  });

  it('esquema fechado: autorId, status, dataHora e id no corpo → 400 campo desconhecido', async () => {
    const doc = await cadastrar();
    const resposta = await transicionar(ADMIN, doc.id, {
      para: 'Em revisão da qualidade',
      responsavelId: null,
      observacao: null,
      versao: 1,
      autorId: 'USR-x',
      status: 'Recebido',
      dataHora: '2026-01-01T00:00:00Z',
      id: 'HIST-x',
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos).toMatchObject({
      autorId: 'Campo não permitido.',
      status: 'Campo não permitido.',
      dataHora: 'Campo não permitido.',
      id: 'Campo não permitido.',
    });
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it("para 'Em Revisão', 'Cancelado' ou fora da lista → 400; responsável ausente quando exigido → 400; responsável em Aprovado → 400", async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await cadastrar();
    const base = { responsavelId: q.id, observacao: null, versao: 1 };
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Em Revisão' })).json().campos.para).toMatch(/dados migrados/);
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Cancelado' })).json().campos.para).toMatch(/Cancelar/);
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Em análise' })).json().campos).toEqual({ para: 'Selecione a etapa de destino.' });
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Em revisão da qualidade', responsavelId: null })).json().campos).toEqual({
      responsavelId: 'Informe o responsável por esta etapa.',
    });
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Aprovado' })).json().campos).toEqual({
      responsavelId: 'Documento aprovado não tem responsável.',
    });
    expect((await transicionar(ADMIN, doc.id, { ...base, para: 'Em revisão da qualidade', responsavelId: 'fulano' })).json().campos).toEqual({
      responsavelId: 'Responsável inválido.',
    });
    const longa = await transicionar(ADMIN, doc.id, { ...base, para: 'Em revisão da qualidade', observacao: 'x'.repeat(501) });
    expect(longa.json().campos).toEqual({ observacao: 'A observação pode ter até 500 caracteres.' });
    const vazio = await transicionar(ADMIN, doc.id, {});
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().campos).toEqual({ para: 'Selecione a etapa de destino.', versao: 'Versão inválida. Recarregue o painel e tente de novo.' });
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it('responsável inexistente, inativo, Leitor, sem perfil ou sem área → 400 (Administrador sem área é elegível)', async () => {
    const { pessoa: inativa } = await pessoaComPerfil('inativa', 'Qualidade');
    await amb.chamar(ADMIN, 'PATCH', `/pessoas/${inativa.id}`, { status: 'Inativo' });
    const { pessoa: leitor } = await pessoaComPerfil('leitor', 'Leitor');
    const { pessoa: semPerfil } = await pessoaComPerfil('semperfil', null);
    const { pessoa: semArea } = await pessoaComPerfil('semarea', 'Solicitante', null);
    const { pessoa: adminSemArea } = await pessoaComPerfil('adminsemarea', 'Administrador', null);
    const doc = await cadastrar();
    const corpo = (responsavelId: string) => ({ para: 'Em revisão da qualidade', responsavelId, observacao: null, versao: 1 });
    for (const id of [`USR-${randomUUID()}`, inativa.id, leitor.id, semPerfil.id, semArea.id]) {
      const resposta = await transicionar(ADMIN, doc.id, corpo(id));
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json().campos).toEqual({ responsavelId: 'Pessoa não encontrada ou não pode ser responsável.' });
    }
    expect((await transicionar(ADMIN, doc.id, corpo(adminSemArea.id))).statusCode).toBe(201);
  });

  it('mesmo status → 409; transição fora da máquina (Recebido → Aprovado) → 409, com mensagem', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await cadastrar();
    const mesmo = await transicionar(ADMIN, doc.id, { para: 'Recebido', responsavelId: null, observacao: null, versao: 1 });
    expect(mesmo.statusCode).toBe(409);
    expect(mesmo.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'O documento já está neste status.' });
    const pulo = await transicionar(ADMIN, doc.id, { para: 'Aprovado', responsavelId: null, observacao: null, versao: 1 });
    expect(pulo.statusCode).toBe(409);
    expect(pulo.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Não é possível ir de Recebido para Aprovado.' });
    const aprovacao = await transicionar(ADMIN, doc.id, { para: 'Para aprovação qualidade', responsavelId: q.id, observacao: null, versao: 1 });
    expect(aprovacao.statusCode).toBe(409);
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it('Solicitante da área: par permitido → 201; par fora (→ Aprovado, → Em revisão junto à área) → 403; outra área → 404; Leitor → 403; sem perfil → 403', async () => {
    const { identidade: sol, pessoa: s } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const { identidade: leitor } = await pessoaComPerfil('lei', 'Leitor');
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const emRev = await emRevisao(q.id);
    const devolvido = (await avancar(ADMIN, emRev, 'Devolvido para correção', s.id)).documento;

    // Fora da lista, mesmo com a máquina aceitando: 403 com mensagem.
    const foraDaLista = await transicionar(sol, devolvido.id, { para: 'Em revisão junto à área', responsavelId: q.id, observacao: null, versao: devolvido.versao });
    expect(foraDaLista.statusCode).toBe(403);
    expect(foraDaLista.json()).toEqual({ codigo: 'sem_permissao', mensagem: 'Seu perfil não pode aplicar esta etapa.' });
    // → Aprovado nem passa pela máquina a partir de Devolvido; e o Solicitante nunca aprova.
    expect((await transicionar(sol, devolvido.id, { para: 'Aprovado', responsavelId: null, observacao: null, versao: devolvido.versao })).statusCode).toBe(409);

    const reenvio = await transicionar(sol, devolvido.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: 'Corrigido.', versao: devolvido.versao });
    expect(reenvio.statusCode).toBe(201);
    expect(reenvio.json<ResultadoTransicao>().documento).toMatchObject({ status: 'Em revisão da qualidade', responsavelId: q.id });
    expect(reenvio.json<ResultadoTransicao>().evento.autorId).toBe(s.id);

    // Leitor: vê, mas não muda (403 na pergunta genérica).
    const doLeitor = await transicionar(leitor, devolvido.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 4 });
    expect(doLeitor.statusCode).toBe(403);
    // Outra área: 404, como se não existisse.
    const deCustos = await cadastrar({ areaId: await idDaArea('Custos') });
    const alheio = await transicionar(sol, deCustos.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 1 });
    expect(alheio.statusCode).toBe(404);
    expect(alheio.json()).toEqual({ codigo: 'nao_encontrado' });
    expect((await transicionar(pessoaFicticia('sem'), deCustos.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 1 })).statusCode).toBe(403);
    expect((await transicionar(ADMIN, `DOC-${randomUUID()}`, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 1 })).statusCode).toBe(404);
  });

  it('Solicitante em "Para aprovação da área solicitante" aprova pela área (→ Para aprovação qualidade), nunca Aprovado', async () => {
    const { identidade: sol, pessoa: s } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const emRev = await emRevisao(q.id);
    const paraArea = (await avancar(ADMIN, emRev, 'Para aprovação da área solicitante', s.id)).documento;
    const aprovadoFinal = await transicionar(sol, paraArea.id, { para: 'Aprovado', responsavelId: null, observacao: null, versao: paraArea.versao });
    expect(aprovadoFinal.statusCode).toBe(403);
    const pelaArea = await transicionar(sol, paraArea.id, { para: 'Para aprovação qualidade', responsavelId: q.id, observacao: null, versao: paraArea.versao });
    expect(pelaArea.statusCode).toBe(201);
    expect(pelaArea.json<ResultadoTransicao>().documento.status).toBe('Para aprovação qualidade');
  });

  it('Aprovado → 409 "final"; Cancelado → 409 "use Reativar" (antes mesmo de validar o corpo)', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const aprovado = (await avancar(ADMIN, await emRevisao(q.id), 'Aprovado', null)).documento;
    const r1 = await transicionar(ADMIN, aprovado.id, { qualquer: 'coisa' });
    expect(r1.statusCode).toBe(409);
    expect(r1.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento aprovado é final.' });

    const doc = await cadastrar();
    const cancelado = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: 1 })).json<ResultadoTransicao>().documento;
    const r2 = await transicionar(ADMIN, cancelado.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 2 });
    expect(r2.statusCode).toBe(409);
    expect(r2.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento cancelado: use Reativar.' });
  });

  it('reenvio idêntico → 200 sem novo evento; versão velha → 409 com o documento atual; 2.º envio diferente com a mesma versão → 409', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await cadastrar();
    const corpo = { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: ' Início. ', versao: 1 };
    const primeiro = await transicionar(ADMIN, doc.id, corpo);
    expect(primeiro.statusCode).toBe(201);
    const segundo = await transicionar(ADMIN, doc.id, corpo);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json()).toEqual(primeiro.json());
    expect(await eventosDe(doc.id)).toHaveLength(2);

    // Mesma versão, outro destino: conflito com o estado atual (não é reenvio).
    const outro = await transicionar(ADMIN, doc.id, { ...corpo, para: 'Em revisão junto à área' });
    expect(outro.statusCode).toBe(409);
    expect(outro.json()).toMatchObject({
      codigo: 'conflito_versao',
      mensagem: expect.stringMatching(/agora está em Em revisão da qualidade/),
      documento: { id: doc.id, versao: 2, status: 'Em revisão da qualidade' },
    });
    // Mesma versão e destino, outra observação ou outro responsável: também conflito.
    expect((await transicionar(ADMIN, doc.id, { ...corpo, observacao: 'Outra.' })).statusCode).toBe(409);
    // Mesmo pedido por outro autor: não é reenvio.
    const { identidade: outraPessoa } = await pessoaComPerfil('q2', 'Qualidade');
    expect((await transicionar(outraPessoa, doc.id, corpo)).statusCode).toBe(409);
    // Versão do futuro.
    expect((await transicionar(ADMIN, doc.id, { ...corpo, versao: 9 })).statusCode).toBe(409);
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('B2: reenvio idêntico com campo extra → 400 (esquema fechado antes da idempotência)', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await cadastrar();
    const corpo = { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: 1 };
    expect((await transicionar(ADMIN, doc.id, corpo)).statusCode).toBe(201);
    const comExtra = await transicionar(ADMIN, doc.id, { ...corpo, autorId: 'USR-x' });
    expect(comExtra.statusCode).toBe(400);
    expect(comExtra.json()).toEqual({ codigo: 'dados_invalidos', campos: { autorId: 'Campo não permitido.' } });
  });

  it('evento STATUS é imutável (gatilho) mesmo depois da migração 0005', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    await emRevisao(q.id);
    await expect(amb.banco.query("UPDATE eventos_historico SET responsavel_id = NULL WHERE tipo_acao = 'STATUS'")).rejects.toThrow(/imutável/);
    await expect(amb.banco.query("DELETE FROM eventos_historico WHERE tipo_acao = 'STATUS'")).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('TRUNCATE eventos_historico')).rejects.toThrow(/imutável/);
  });
});

describe('POST /documentos/:id/cancelamentos', () => {
  it('201: Cancelado, responsável mantido, versão + 1; evento CANCELAMENTO com statusAnterior, motivo aparado e autor do token', async () => {
    const { identidade: qualidade, pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await emRevisao(q.id);
    const resposta = await cancelar(qualidade, doc.id, { motivo: `  ${MOTIVO}  `, versao: doc.versao });
    expect(resposta.statusCode).toBe(201);
    const { documento, evento } = resposta.json<ResultadoTransicao>();
    expect(documento).toMatchObject({ status: 'Cancelado', responsavelId: q.id, responsavel: 'Pessoa q', versao: 3 });
    expect(evento).toMatchObject({
      tipoAcao: 'CANCELAMENTO',
      status: 'Cancelado',
      statusAnterior: 'Em revisão da qualidade',
      responsavel: 'Pessoa q',
      responsavelId: q.id,
      observacao: MOTIVO,
      autorId: q.id,
      detalhes: [],
    });
  });

  it('motivo curto, longo ou ausente → 400; campo extra → 400; versão inválida → 400', async () => {
    const doc = await cadastrar();
    expect((await cancelar(ADMIN, doc.id, { motivo: 'curto', versao: 1 })).json().campos).toEqual({ motivo: 'O motivo precisa ter ao menos 10 caracteres.' });
    expect((await cancelar(ADMIN, doc.id, { motivo: 'x'.repeat(501), versao: 1 })).json().campos).toEqual({ motivo: 'O motivo pode ter até 500 caracteres.' });
    expect((await cancelar(ADMIN, doc.id, { versao: 1 })).json().campos).toEqual({ motivo: 'Informe o motivo do cancelamento.' });
    expect((await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: 1, autorId: 'USR-x' })).json().campos).toEqual({ autorId: 'Campo não permitido.' });
    expect((await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: '1' })).json().campos).toEqual({ versao: 'Versão inválida. Recarregue o painel e tente de novo.' });
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it('Aprovado → 409; já cancelado → 409; Solicitante → 403 (na própria área) e 404 (alheia); Leitor → 403', async () => {
    const { identidade: sol } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const { identidade: leitor } = await pessoaComPerfil('lei', 'Leitor');
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const aprovado = (await avancar(ADMIN, await emRevisao(q.id), 'Aprovado', null)).documento;
    const r1 = await cancelar(ADMIN, aprovado.id, { motivo: MOTIVO, versao: aprovado.versao });
    expect(r1.statusCode).toBe(409);
    expect(r1.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento aprovado é final e não pode ser cancelado.' });

    const doc = await cadastrar();
    expect((await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: 1 })).statusCode).toBe(201);
    const r2 = await cancelar(ADMIN, doc.id, { motivo: 'Outro motivo qualquer.', versao: 2 });
    expect(r2.statusCode).toBe(409);
    expect(r2.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento já cancelado.' });

    const daEngenharia = await cadastrar();
    expect((await cancelar(sol, daEngenharia.id, { motivo: MOTIVO, versao: 1 })).statusCode).toBe(403);
    expect((await cancelar(leitor, daEngenharia.id, { motivo: MOTIVO, versao: 1 })).statusCode).toBe(403);
    const deCustos = await cadastrar({ areaId: await idDaArea('Custos') });
    expect((await cancelar(sol, deCustos.id, { motivo: MOTIVO, versao: 1 })).statusCode).toBe(404);
  });

  it('reenvio → 200 sem novo evento; versão velha → 409 conflito_versao', async () => {
    const doc = await cadastrar();
    const corpo = { motivo: MOTIVO, versao: 1 };
    const primeiro = await cancelar(ADMIN, doc.id, corpo);
    expect(primeiro.statusCode).toBe(201);
    const segundo = await cancelar(ADMIN, doc.id, corpo);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json()).toEqual(primeiro.json());
    expect(await eventosDe(doc.id)).toHaveLength(2);

    // Outro documento: versão velha (alguém já mudou o status) → conflito antes do estado.
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const outro = await emRevisao(q.id); // versão 2
    const velho = await cancelar(ADMIN, outro.id, { motivo: MOTIVO, versao: 1 });
    expect(velho.statusCode).toBe(409);
    expect(velho.json()).toMatchObject({ codigo: 'conflito_versao', documento: { id: outro.id, versao: 2, status: 'Em revisão da qualidade' } });
    expect(await eventosDe(outro.id)).toHaveLength(2);
  });
});

describe('POST /documentos/:id/reativacoes', () => {
  it('volta ao statusAnterior do último CANCELAMENTO; evento STATUS "De Cancelado para X"; responsável intacto', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await emRevisao(q.id);
    const cancelado = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: doc.versao })).json<ResultadoTransicao>().documento;
    const resposta = await reativar(ADMIN, doc.id, { observacao: null, versao: cancelado.versao });
    expect(resposta.statusCode).toBe(201);
    const { documento, evento } = resposta.json<ResultadoTransicao>();
    expect(documento).toMatchObject({ status: 'Em revisão da qualidade', responsavelId: q.id, versao: 4 });
    expect(evento).toMatchObject({
      tipoAcao: 'STATUS',
      status: 'Em revisão da qualidade',
      statusAnterior: 'Cancelado',
      responsavelId: q.id,
      observacao: null,
      autorId: (await euDe(ADMIN)).id,
    });
    // A função pura da interface concorda com o destino gravado.
    const eventos = await eventosDe(doc.id);
    expect(eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO', 'STATUS', 'CANCELAMENTO', 'STATUS']);
    expect(statusDeReativacao(eventos.slice(0, 3))).toBe('Em revisão da qualidade');
  });

  it("2.º cancelamento com outro status → volta ao 2.º; 'Em Revisão' migrado é restaurado tal como estava", async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await cadastrar();
    let atual = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: 1 })).json<ResultadoTransicao>().documento;
    atual = (await reativar(ADMIN, doc.id, { observacao: null, versao: atual.versao })).json<ResultadoTransicao>().documento;
    expect(atual.status).toBe('Recebido');
    atual = (await avancar(ADMIN, atual, 'Em revisão junto à área', q.id)).documento;
    atual = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: atual.versao })).json<ResultadoTransicao>().documento;
    atual = (await reativar(ADMIN, doc.id, { observacao: null, versao: atual.versao })).json<ResultadoTransicao>().documento;
    expect(atual.status).toBe('Em revisão junto à área');

    // Dado migrado: cancelado a partir de 'Em Revisão' (genérico).
    const migrado = await cadastrar();
    await amb.banco.query("UPDATE documentos SET status = 'Cancelado' WHERE id = $1", [migrado.id]);
    await inserirEventoNoBanco(migrado.id, 'CANCELAMENTO', 'Cancelado', 'Em Revisão');
    const volta = await reativar(ADMIN, migrado.id, { observacao: null, versao: 1 });
    expect(volta.statusCode).toBe(201);
    expect(volta.json<ResultadoTransicao>().documento.status).toBe('Em Revisão');
    expect(volta.json<ResultadoTransicao>().evento.observacao).toBeNull();
  });

  it("CANCELAMENTO sem statusAnterior (dado importado) → 'Recebido' com o sufixo na observação", async () => {
    const doc = await cadastrar();
    await amb.banco.query("UPDATE documentos SET status = 'Cancelado' WHERE id = $1", [doc.id]);
    await inserirEventoNoBanco(doc.id, 'CANCELAMENTO', 'Cancelado', null);
    const resposta = await reativar(ADMIN, doc.id, { observacao: 'Reativando.', versao: 1 });
    expect(resposta.statusCode).toBe(201);
    const { documento, evento } = resposta.json<ResultadoTransicao>();
    expect(documento.status).toBe('Recebido');
    expect(evento.observacao).toBe(`Reativando.${SUFIXO_REATIVACAO_RESERVA}`);
    // Sem observação: só o sufixo, aparado.
    const semCancelamento = await cadastrar();
    await amb.banco.query("UPDATE documentos SET status = 'Cancelado' WHERE id = $1", [semCancelamento.id]);
    const r = await reativar(ADMIN, semCancelamento.id, { observacao: null, versao: 1 });
    expect(r.json<ResultadoTransicao>().evento.observacao).toBe(SUFIXO_REATIVACAO_RESERVA.trim());
  });

  it('não cancelado → 409; Solicitante → 403; Leitor → 403; corpo com campo extra → 400', async () => {
    const { identidade: sol } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const { identidade: leitor } = await pessoaComPerfil('lei', 'Leitor');
    const doc = await cadastrar();
    const r = await reativar(ADMIN, doc.id, { observacao: null, versao: 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Só documentos cancelados podem ser reativados.' });
    const cancelado = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: 1 })).json<ResultadoTransicao>().documento;
    expect((await reativar(sol, doc.id, { observacao: null, versao: cancelado.versao })).statusCode).toBe(403);
    expect((await reativar(leitor, doc.id, { observacao: null, versao: cancelado.versao })).statusCode).toBe(403);
    const extra = await reativar(ADMIN, doc.id, { observacao: null, versao: cancelado.versao, motivo: 'x' });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().campos).toEqual({ motivo: 'Campo não permitido.' });
    expect((await detalhe(doc.id)).documento.status).toBe('Cancelado');
  });

  it('Desfazer (mesma rota, versão devolvida pelo cancelamento) → 201; reenvio → 200; versão velha → 409', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await emRevisao(q.id);
    const cancelamento = (await cancelar(ADMIN, doc.id, { motivo: MOTIVO, versao: doc.versao })).json<ResultadoTransicao>();
    const corpo = { observacao: OBSERVACAO_CANCELAMENTO_DESFEITO, versao: cancelamento.documento.versao };
    const desfeito = await reativar(ADMIN, doc.id, corpo);
    expect(desfeito.statusCode).toBe(201);
    expect(desfeito.json<ResultadoTransicao>()).toMatchObject({
      documento: { status: 'Em revisão da qualidade', versao: 4 },
      evento: { statusAnterior: 'Cancelado', observacao: 'Cancelamento desfeito.' },
    });
    const reenvio = await reativar(ADMIN, doc.id, corpo);
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json()).toEqual(desfeito.json());
    expect(await eventosDe(doc.id)).toHaveLength(4);

    // Alguém mexeu depois de cancelar (cancelou de novo... não: mudou o status): versão velha.
    const outro = await cadastrar();
    const c = (await cancelar(ADMIN, outro.id, { motivo: MOTIVO, versao: 1 })).json<ResultadoTransicao>();
    expect((await reativar(ADMIN, outro.id, { observacao: null, versao: c.documento.versao })).statusCode).toBe(201);
    const velho = await reativar(ADMIN, outro.id, { observacao: 'diferente', versao: c.documento.versao });
    expect(velho.statusCode).toBe(409);
    expect(velho.json()).toMatchObject({ codigo: 'conflito_versao', documento: { id: outro.id, versao: 3, status: 'Recebido' } });
  });
});

describe('GET /responsaveis', () => {
  it('só elegíveis, em ordem pt-BR, sem e-mail; Leitor → 403; sem perfil → 403; query → 400; HEAD → 404', async () => {
    const { pessoa: inativa } = await pessoaComPerfil('inativa', 'Qualidade');
    await amb.chamar(ADMIN, 'PATCH', `/pessoas/${inativa.id}`, { status: 'Inativo' });
    const { identidade: leitor } = await pessoaComPerfil('leitor', 'Leitor');
    await pessoaComPerfil('semperfil', null);
    await pessoaComPerfil('semarea', 'Solicitante', null);
    const { identidade: sol, pessoa: s } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const { pessoa: adminSemArea } = await pessoaComPerfil('adminsemarea', 'Administrador', null);
    // Nomes: 'Admin Fictício', 'Pessoa adminsemarea', 'Pessoa q', 'Pessoa sol'.
    const resposta = await amb.chamar(sol, 'GET', '/responsaveis');
    expect(resposta.statusCode).toBe(200);
    const lista = resposta.json<PessoaResumo[]>();
    expect(lista.map((p) => p.nome)).toEqual(['Admin Fictício', 'Pessoa adminsemarea', 'Pessoa q', 'Pessoa sol']);
    expect(lista.map((p) => p.id)).toEqual([(await euDe(ADMIN)).id, adminSemArea.id, q.id, s.id]);
    for (const p of lista) {
      expect(p).not.toHaveProperty('email');
      expect(p).not.toHaveProperty('status');
      expect(Object.keys(p).sort()).toEqual(['area', 'areaId', 'id', 'nome', 'perfil']);
    }
    expect(lista.find((p) => p.id === s.id)).toMatchObject({ perfil: 'Solicitante', area: 'Engenharia' });
    expect(lista.find((p) => p.id === adminSemArea.id)).toMatchObject({ perfil: 'Administrador', areaId: null, area: null });

    expect((await amb.chamar(leitor, 'GET', '/responsaveis')).statusCode).toBe(403);
    expect((await amb.chamar(pessoaFicticia('sem'), 'GET', '/responsaveis')).statusCode).toBe(403);
    const comQuery = await amb.chamar(ADMIN, 'GET', '/responsaveis?perfil=Qualidade');
    expect(comQuery.statusCode).toBe(400);
    expect(comQuery.json().campos).toEqual({ perfil: 'Campo não permitido.' });
    expect((await amb.chamar(ADMIN, 'HEAD', '/responsaveis')).statusCode).toBe(404);
  });
});

describe('GET /painel e GET /documentos/:id com os campos da F5', () => {
  async function painel(quem: JWTPayload, query = '') {
    const resposta = await amb.chamar(quem, 'GET', `/painel${query}`);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<RespostaPainel>();
  }

  it('responsavel, dataInicioRevisao e statusAntesDoCancelamento calculados; busca encontra pelo responsável', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const recebido = await cadastrar({ titulo: 'Só recebido' });
    const emRev = await emRevisao(q.id, { titulo: 'Em revisão' });
    const paraCancelar = await emRevisao(q.id, { titulo: 'Cancelado depois' });
    await cancelar(ADMIN, paraCancelar.id, { motivo: MOTIVO, versao: paraCancelar.versao });

    const { cartoes } = await painel(ADMIN, '?cancelados=true');
    const por = (id: string) => cartoes.find((c) => c.id === id)!;
    expect(por(recebido.id)).toMatchObject({ responsavelId: null, responsavel: null, dataInicioRevisao: null, statusAntesDoCancelamento: null });
    expect(por(emRev.id)).toMatchObject({ responsavelId: q.id, responsavel: 'Pessoa q', dataInicioRevisao: HOJE, statusAntesDoCancelamento: null });
    expect(por(paraCancelar.id)).toMatchObject({
      status: 'Cancelado',
      responsavelId: q.id,
      responsavel: 'Pessoa q',
      dataInicioRevisao: HOJE,
      statusAntesDoCancelamento: 'Em revisão da qualidade',
    });
    // LGPD: nada além do contrato.
    expect(por(emRev.id)).not.toHaveProperty('observacao');

    const busca = await painel(ADMIN, '?busca=pessoa%20q');
    expect(busca.cartoes.map((c) => c.titulo).sort()).toEqual(['Em revisão']);
    expect(busca.qtdCancelados).toBe(1);
  });

  it('nome do responsável no cartão e no documento é o ATUAL; o do evento fica como era', async () => {
    const { pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const doc = await emRevisao(q.id);
    await amb.banco.query('UPDATE usuarios SET nome = $2 WHERE id = $1', [q.id, 'Nome Novo']);
    expect((await painel(ADMIN)).cartoes[0]!.responsavel).toBe('Nome Novo');
    const d = await detalhe(doc.id);
    expect(d.documento.responsavel).toBe('Nome Novo');
    expect(d.eventos[1]!.responsavel).toBe('Pessoa q');
  });

  it('regressão: cadastro devolve responsavelId/responsavel nulos; reprogramação e download seguem iguais', async () => {
    const doc = await cadastrar();
    expect(doc).toMatchObject({ responsavelId: null, responsavel: null, status: 'Recebido', versao: 1 });
    const d = await detalhe(doc.id);
    expect(d.eventos[0]).toMatchObject({ tipoAcao: 'CRIACAO', responsavelId: null, responsavel: null });
    const download = await amb.chamar(ADMIN, 'GET', `/documentos/${doc.id}/arquivos/${d.arquivos[0]!.id}`);
    expect(download.statusCode).toBe(200);
  });
});

describe('fluxo completo pela API (contrato F5, seção 8)', () => {
  it('Recebido → Em rev. qualidade → Devolvido → (Solicitante) Em rev. qualidade → P/ aprov. da área → (Solicitante) P/ aprov. qualidade → Aprovado', async () => {
    const { identidade: qualidade, pessoa: q } = await pessoaComPerfil('q', 'Qualidade');
    const { identidade: sol, pessoa: s } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    let doc = await cadastrar({ titulo: 'Fluxo completo' });

    doc = (await avancar(qualidade, doc, 'Em revisão da qualidade', q.id, 'Iniciando.')).documento;
    doc = (await avancar(qualidade, doc, 'Devolvido para correção', s.id, 'Faltou assinatura.')).documento;
    expect(doc).toMatchObject({ responsavelId: s.id, responsavel: 'Pessoa sol' });
    doc = (await avancar(sol, doc, 'Em revisão da qualidade', q.id, 'Assinado.')).documento;
    doc = (await avancar(qualidade, doc, 'Para aprovação da área solicitante', s.id)).documento;
    doc = (await avancar(sol, doc, 'Para aprovação qualidade', q.id)).documento;
    doc = (await avancar(qualidade, doc, 'Aprovado', null)).documento;
    expect(doc).toMatchObject({ status: 'Aprovado', responsavelId: null, responsavel: null, versao: 7 });

    const { cartoes, hoje } = (await amb.chamar(ADMIN, 'GET', '/painel')).json<RespostaPainel>();
    const cartao = cartoes.find((c) => c.id === doc.id)!;
    expect(cartao).toMatchObject({ status: 'Aprovado', fase: 'aprovado', qtdDevolucoes: 1, dataAprovacao: HOJE, dataInicioRevisao: HOJE, responsavel: null });

    // As funções puras sobre os eventos concordam com o SQL do painel.
    const d = await detalhe(doc.id);
    expect(contarDevolucoes(d.eventos)).toBe(cartao.qtdDevolucoes);
    expect(dataAprovacao(d.eventos)).toBe(cartao.dataAprovacao);
    expect(dataInicioRevisao(d.eventos)).toBe(cartao.dataInicioRevisao);
    expect(d.eventos.map((e) => `${e.tipoAcao}:${e.statusAnterior ?? '-'}→${e.status}`)).toEqual([
      'CRIACAO:-→Recebido',
      'STATUS:Recebido→Em revisão da qualidade',
      'STATUS:Em revisão da qualidade→Devolvido para correção',
      'STATUS:Devolvido para correção→Em revisão da qualidade',
      'STATUS:Em revisão da qualidade→Para aprovação da área solicitante',
      'STATUS:Para aprovação da área solicitante→Para aprovação qualidade',
      'STATUS:Para aprovação qualidade→Aprovado',
    ]);
    // Autores: cada evento do token de quem agiu.
    expect(d.eventos.slice(1).map((e) => e.autorId)).toEqual([q.id, q.id, s.id, q.id, s.id, q.id]);
    // Metas do ciclo (tudo hoje): cumpridas; KPI conta o aprovado no mês.
    const metas = avaliarMetas({ ...cartao, dataInicioRevisao: dataInicioRevisao(d.eventos), dataAprovacao: dataAprovacao(d.eventos) }, hoje);
    expect(metas.inicioRevisao).toMatchObject({ estado: 'cumprida', dias: 0 });
    expect(metas.conclusao).toMatchObject({ estado: 'cumprida', dias: 0 });

    // Aprovado é final: não transita, não cancela, não reprograma.
    expect((await transicionar(qualidade, doc.id, { para: 'Em revisão da qualidade', responsavelId: q.id, observacao: null, versao: doc.versao })).statusCode).toBe(409);
    expect((await cancelar(qualidade, doc.id, { motivo: MOTIVO, versao: doc.versao })).statusCode).toBe(409);
    expect((await amb.chamar(qualidade, 'POST', `/documentos/${doc.id}/reprogramacoes`, { novoPrazo: HOJE, justificativa: MOTIVO, versao: doc.versao })).statusCode).toBe(409);
    expect((await detalhe(doc.id)).eventos).toHaveLength(7);
  });
});
