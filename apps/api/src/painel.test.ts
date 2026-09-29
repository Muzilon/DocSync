/**
 * F3: reprogramação do prazo e leitura do painel (contrato docs/contratos/f3-painel-kanban.md).
 */
import { randomUUID } from 'node:crypto';
import { calcularPrazoAutomatico, somarDias } from '@docsync/compartilhado';
import type {
  Area,
  CartaoPainel,
  DetalheDocumento,
  Documento,
  EventoHistorico,
  NovoDocumento,
  Pessoa,
  RespostaPainel,
  ResultadoReprogramacao,
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
const PRAZO_PADRAO = calcularPrazoAutomatico(HOJE);
const NOVO_PRAZO = somarDias(PRAZO_PADRAO, 10);
const JUSTIFICATIVA = 'Aguardando parecer técnico da engenharia.';

async function idDaArea(nome: string): Promise<string> {
  const areas = (await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
  return areas.find((a) => a.nome === nome)!.id;
}

async function pessoaComPerfil(apelido: string, perfil: Pessoa['perfil'], area = 'Qualidade'): Promise<JWTPayload> {
  const identidade = pessoaFicticia(apelido);
  const criada = await amb.chamar(ADMIN, 'POST', '/pessoas', {
    email: identidade.preferred_username,
    nome: identidade.name,
    perfil,
    areaId: await idDaArea(area),
  });
  expect(criada.statusCode).toBe(201);
  return identidade;
}

const PDF: ParteFormulario = { campo: 'arquivoPrincipal', arquivo: 'doc.pdf', conteudo: '%PDF-1.4 fictício', tipo: 'application/pdf' };

/** Cadastra um documento pela API (status Recebido, prazo automático) e devolve a resposta. */
async function cadastrar(extra: Partial<NovoDocumento> = {}, quem: JWTPayload = ADMIN): Promise<Documento> {
  const tipos = (await amb.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
  const dados: NovoDocumento = {
    id: `DOC-${randomUUID()}`,
    codigo: null,
    titulo: 'Procedimento de Compras',
    tipoDocumentoId: tipos[0]!.id,
    revisao: 0,
    remetente: 'Remetente Fictício',
    areaId: await idDaArea('Qualidade'),
    disciplina: null,
    observacao: 'Observação sigilosa',
    ...extra,
  };
  const resposta = await amb.enviarFormulario(quem, '/documentos', [{ campo: 'dados', valor: JSON.stringify(dados) }, PDF]);
  expect(resposta.statusCode).toBe(201);
  return resposta.json<Documento>();
}

/** Muda o status direto no banco e grava o evento (a F5 ainda não existe). */
async function mudarStatusNoBanco(id: string, status: string, statusAnterior: string | null, dataHora?: string) {
  await amb.banco.query('UPDATE documentos SET status = $2 WHERE id = $1', [id, status]);
  const eu = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
  await amb.banco.query(
    `INSERT INTO eventos_historico (id, id_documento, tipo_acao, status, status_anterior, autor_id, autor_nome, data_hora)
     VALUES ($1, $2, 'STATUS', $3, $4, $5, $6, COALESCE($7::timestamptz, clock_timestamp()))`,
    [`HIST-${randomUUID()}`, id, status, statusAnterior, eu.id, eu.nome, dataHora ?? null],
  );
}

function reprogramar(quem: JWTPayload, id: string, corpo: unknown) {
  return amb.chamar(quem, 'POST', `/documentos/${id}/reprogramacoes`, corpo);
}

async function eventosDe(id: string): Promise<EventoHistorico[]> {
  return (await amb.chamar(ADMIN, 'GET', `/documentos/${id}`)).json<DetalheDocumento>().eventos;
}

// ---------------------------------------------------------------------------

describe('POST /documentos — prazo automático (decisões 0011 e 0012)', () => {
  it('grava dataRecebimento = hoje (São Paulo) e dataRevisao = hoje + 30, com detalhe no evento CRIACAO', async () => {
    const doc = await cadastrar();
    expect(doc.dataRecebimento).toBe(HOJE);
    expect(doc.dataRevisao).toBe(PRAZO_PADRAO);
    expect(doc.reprogramado).toBe(false);
    const [criacao] = await eventosDe(doc.id);
    expect(criacao!.tipoAcao).toBe('CRIACAO');
    expect(criacao!.detalhes).toEqual([{ campo: 'dataRevisao', antes: null, depois: PRAZO_PADRAO }]);
  });
});

describe('POST /documentos/:id/reprogramacoes', () => {
  it('201: documento com versão +1, reprogramado e contagem; evento REPROGRAMACAO com autor do token', async () => {
    const qualidade = await pessoaComPerfil('qualidade', 'Qualidade');
    const doc = await cadastrar();
    const resposta = await reprogramar(qualidade, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: `  ${JUSTIFICATIVA}  `, versao: 1 });
    expect(resposta.statusCode).toBe(201);
    const { documento, evento } = resposta.json<ResultadoReprogramacao>();
    expect(documento).toMatchObject({ id: doc.id, dataRevisao: NOVO_PRAZO, reprogramado: true, qtdReprogramacoes: 1, versao: 2, status: 'Recebido' });
    expect(new Date(documento.dataModificacao).getTime()).toBeGreaterThanOrEqual(new Date(doc.dataModificacao).getTime());

    const eu = (await amb.chamar(qualidade, 'GET', '/eu')).json<Pessoa>();
    expect(evento).toMatchObject({
      id: expect.stringMatching(/^HIST-/),
      idDocumento: doc.id,
      tipoAcao: 'REPROGRAMACAO',
      status: 'Recebido',
      statusAnterior: null,
      autorId: eu.id,
      autorNome: 'Pessoa qualidade',
      detalhes: [{ campo: 'dataRevisao', antes: PRAZO_PADRAO, depois: NOVO_PRAZO }],
      observacao: JUSTIFICATIVA, // aparada
    });
    const eventos = await eventosDe(doc.id);
    expect(eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO', 'REPROGRAMACAO']);

    // Segunda reprogramação: só adia de novo; contagem 2, versão 3.
    const segunda = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(NOVO_PRAZO, 1), justificativa: JUSTIFICATIVA, versao: 2 });
    expect(segunda.statusCode).toBe(201);
    expect(segunda.json<ResultadoReprogramacao>().documento).toMatchObject({ qtdReprogramacoes: 2, versao: 3 });
  });

  it('autorId no corpo → 400 por campo desconhecido (autor sempre do token)', async () => {
    const doc = await cadastrar();
    const resposta = await reprogramar(ADMIN, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1, autorId: 'USR-x' });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos).toEqual({ autorId: 'Campo não permitido.' });
  });

  it('reenvio idêntico → 200 com o estado atual, sem novo evento', async () => {
    const doc = await cadastrar();
    const corpo = { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 };
    const primeiro = await reprogramar(ADMIN, doc.id, corpo);
    expect(primeiro.statusCode).toBe(201);
    const segundo = await reprogramar(ADMIN, doc.id, corpo);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json()).toEqual(primeiro.json());
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('versão velha (mesmo com outros dados) → 409 conflito_versao com o documento atual', async () => {
    const doc = await cadastrar();
    await reprogramar(ADMIN, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 });
    const outro = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(NOVO_PRAZO, 5), justificativa: 'Outra justificativa longa.', versao: 1 });
    expect(outro.statusCode).toBe(409);
    expect(outro.json()).toMatchObject({
      codigo: 'conflito_versao',
      mensagem: expect.stringMatching(/Alguém alterou/),
      documento: { id: doc.id, versao: 2, dataRevisao: NOVO_PRAZO },
    });
    // Versão do futuro também é conflito.
    const futuro = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(NOVO_PRAZO, 5), justificativa: JUSTIFICATIVA, versao: 9 });
    expect(futuro.statusCode).toBe(409);
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('mesmo pedido por outro autor não é reenvio: cai na validação normal (400, prazo não posterior ao atual) e nada é gravado', async () => {
    const qualidade = await pessoaComPerfil('q2', 'Qualidade');
    const doc = await cadastrar();
    const corpo = { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 };
    expect((await reprogramar(ADMIN, doc.id, corpo)).statusCode).toBe(201);
    const outro = await reprogramar(qualidade, doc.id, corpo);
    expect(outro.statusCode).toBe(400);
    expect(outro.json().campos.novoPrazo).toMatch(/posterior ao prazo atual/);
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('reenvio com a mesma versão mas justificativa diferente → 409 conflito_versao', async () => {
    const doc = await cadastrar();
    expect((await reprogramar(ADMIN, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 })).statusCode).toBe(201);
    const outro = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(NOVO_PRAZO, 3), justificativa: 'Justificativa diferente da primeira.', versao: 1 });
    expect(outro.statusCode).toBe(409);
    expect(outro.json().codigo).toBe('conflito_versao');
  });

  it('Aprovado ou Cancelado → 409 acao_nao_permitida', async () => {
    const aprovado = await cadastrar();
    await mudarStatusNoBanco(aprovado.id, 'Aprovado', 'Recebido');
    const cancelado = await cadastrar();
    await mudarStatusNoBanco(cancelado.id, 'Cancelado', 'Recebido');
    const corpo = { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 };
    const r1 = await reprogramar(ADMIN, aprovado.id, corpo);
    expect(r1.statusCode).toBe(409);
    expect(r1.json()).toMatchObject({ codigo: 'acao_nao_permitida', mensagem: expect.stringMatching(/aprovado/) });
    const r2 = await reprogramar(ADMIN, cancelado.id, corpo);
    expect(r2.statusCode).toBe(409);
    expect(r2.json()).toMatchObject({ codigo: 'acao_nao_permitida', mensagem: expect.stringMatching(/cancelado/) });
  });

  it('validação: justificativa curta, prazo passado, igual/anterior ao atual, versão inválida, campo extra', async () => {
    const doc = await cadastrar();
    const curta = await reprogramar(ADMIN, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: 'curta', versao: 1 });
    expect(curta.statusCode).toBe(400);
    expect(curta.json().campos).toEqual({ justificativa: 'A justificativa precisa ter ao menos 10 caracteres.' });

    const passado = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(HOJE, -1), justificativa: JUSTIFICATIVA, versao: 1 });
    expect(passado.json().campos.novoPrazo).toMatch(/anterior a hoje/);

    const igual = await reprogramar(ADMIN, doc.id, { novoPrazo: PRAZO_PADRAO, justificativa: JUSTIFICATIVA, versao: 1 });
    expect(igual.json().campos.novoPrazo).toMatch(/posterior ao prazo atual/);
    const anterior = await reprogramar(ADMIN, doc.id, { novoPrazo: somarDias(PRAZO_PADRAO, -1), justificativa: JUSTIFICATIVA, versao: 1 });
    expect(anterior.json().campos.novoPrazo).toMatch(/posterior ao prazo atual/);

    const invalida = await reprogramar(ADMIN, doc.id, { novoPrazo: '2026-02-30', justificativa: JUSTIFICATIVA, versao: '1', extra: true });
    expect(invalida.json().campos).toEqual({
      novoPrazo: 'Novo prazo inválido.',
      versao: 'Versão inválida. Recarregue o painel e tente de novo.',
      extra: 'Campo não permitido.',
    });

    const vazio = await reprogramar(ADMIN, doc.id, {});
    expect(vazio.json().campos).toEqual({
      novoPrazo: 'Informe o novo prazo.',
      justificativa: 'Informe a justificativa da reprogramação.',
      versao: 'Versão inválida. Recarregue o painel e tente de novo.',
    });
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it('documento sem prazo (importado): aceita hoje como novo prazo', async () => {
    const doc = await cadastrar();
    await amb.banco.query('UPDATE documentos SET data_revisao = NULL WHERE id = $1', [doc.id]);
    const resposta = await reprogramar(ADMIN, doc.id, { novoPrazo: HOJE, justificativa: JUSTIFICATIVA, versao: 1 });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<ResultadoReprogramacao>().evento.detalhes).toEqual([{ campo: 'dataRevisao', antes: null, depois: HOJE }]);
  });

  it('permissões: Solicitante 403 na própria área e 404 em área alheia; Leitor 403; inexistente 404; sem perfil 403', async () => {
    const solicitante = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const leitor = await pessoaComPerfil('lei', 'Leitor');
    const daEngenharia = await cadastrar({ areaId: await idDaArea('Engenharia') });
    const deCustos = await cadastrar({ areaId: await idDaArea('Custos') });
    const corpo = { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 };

    const propria = await reprogramar(solicitante, daEngenharia.id, corpo);
    expect(propria.statusCode).toBe(403);
    expect(propria.json().codigo).toBe('sem_permissao');
    const alheia = await reprogramar(solicitante, deCustos.id, corpo);
    expect(alheia.statusCode).toBe(404);
    expect(alheia.json()).toEqual({ codigo: 'nao_encontrado' });

    expect((await reprogramar(leitor, daEngenharia.id, corpo)).statusCode).toBe(403);
    expect((await reprogramar(ADMIN, `DOC-${randomUUID()}`, corpo)).statusCode).toBe(404);
    expect((await reprogramar(pessoaFicticia('sem'), daEngenharia.id, corpo)).statusCode).toBe(403);
    expect(await eventosDe(daEngenharia.id)).toHaveLength(1);
  });

  it('evento REPROGRAMACAO não pode ser alterado nem apagado (gatilho)', async () => {
    const doc = await cadastrar();
    await reprogramar(ADMIN, doc.id, { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 });
    await expect(
      amb.banco.query("UPDATE eventos_historico SET observacao = 'x' WHERE tipo_acao = 'REPROGRAMACAO'"),
    ).rejects.toThrow(/imutável/);
    await expect(amb.banco.query("DELETE FROM eventos_historico WHERE tipo_acao = 'REPROGRAMACAO'")).rejects.toThrow(/imutável/);
  });
});

describe('GET /painel', () => {
  async function painel(quem: JWTPayload, query = '') {
    const resposta = await amb.chamar(quem, 'GET', `/painel${query}`);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<RespostaPainel>();
  }

  it('cartões só com campos de exibição, fase resolvida, hoje presente e ordem por prazo', async () => {
    const a = await cadastrar({ titulo: 'Segundo', codigo: 'B-2' });
    const b = await cadastrar({ titulo: 'Primeiro', codigo: 'A-1' });
    await reprogramar(ADMIN, a.id, { novoPrazo: NOVO_PRAZO, justificativa: JUSTIFICATIVA, versao: 1 });

    const resposta = await painel(ADMIN);
    expect(resposta.hoje).toBe(HOJE);
    expect(resposta.qtdCancelados).toBe(0);
    expect(resposta.cartoes.map((c) => c.titulo)).toEqual(['Primeiro', 'Segundo']); // prazo crescente
    const cartao = resposta.cartoes[1]!;
    expect(cartao).toEqual({
      id: a.id,
      codigo: 'B-2',
      titulo: 'Segundo',
      revisao: 0,
      status: 'Recebido',
      fase: 'recebido',
      tipoDocumento: a.tipoDocumento,
      areaId: a.areaId,
      area: 'Qualidade',
      remetente: 'Remetente Fictício',
      dataRecebimento: HOJE,
      dataRevisao: NOVO_PRAZO,
      reprogramado: true,
      qtdReprogramacoes: 1,
      qtdDevolucoes: 0,
      dataAprovacao: null,
      versao: 2,
      criadoEm: a.criadoEm,
      dataModificacao: expect.any(String),
    } satisfies CartaoPainel);
    // LGPD: nada além do contrato.
    for (const c of resposta.cartoes) {
      expect(c).not.toHaveProperty('observacao');
      expect(c).not.toHaveProperty('criadoPor');
      expect(c).not.toHaveProperty('nomeArquivoPrincipal');
      expect(c).not.toHaveProperty('qtdAnexos');
    }
    void b;
  });

  it('busca (sem acento/maiúsculas) e área aplicadas; qtdCancelados respeita os filtros; cancelados só quando pedidos', async () => {
    const eng = await idDaArea('Engenharia');
    const custos = await idDaArea('Custos');
    await cadastrar({ titulo: 'Instrução de Solda', areaId: eng });
    await cadastrar({ titulo: 'Relatório Ambiental', areaId: custos });
    const cancelado = await cadastrar({ titulo: 'Instrução Cancelada', areaId: eng });
    await mudarStatusNoBanco(cancelado.id, 'Cancelado', 'Recebido');

    const tudo = await painel(ADMIN);
    expect(tudo.cartoes.map((c) => c.titulo).sort()).toEqual(['Instrução de Solda', 'Relatório Ambiental']);
    expect(tudo.qtdCancelados).toBe(1);

    const busca = await painel(ADMIN, '?busca=INSTRUCAO');
    expect(busca.cartoes.map((c) => c.titulo)).toEqual(['Instrução de Solda']);
    expect(busca.qtdCancelados).toBe(1);

    const semCancelado = await painel(ADMIN, '?busca=relatorio');
    expect(semCancelado.qtdCancelados).toBe(0);

    const porArea = await painel(ADMIN, `?areaId=${custos}`);
    expect(porArea.cartoes.map((c) => c.titulo)).toEqual(['Relatório Ambiental']);
    expect(porArea.qtdCancelados).toBe(0);

    const comCancelados = await painel(ADMIN, '?cancelados=true&busca=instru');
    expect(comCancelados.cartoes.map((c) => c.titulo).sort()).toEqual(['Instrução Cancelada', 'Instrução de Solda']);
    expect(comCancelados.cartoes.find((c) => c.fase === 'cancelado')!.status).toBe('Cancelado');
  });

  it('esquema fechado na query: parâmetro desconhecido, área inexistente, cancelados inválido, busca longa → 400', async () => {
    const extra = await amb.chamar(ADMIN, 'GET', '/painel?ordem=titulo');
    expect(extra.statusCode).toBe(400);
    expect(extra.json().campos).toEqual({ ordem: 'Campo não permitido.' });
    const area = await amb.chamar(ADMIN, 'GET', '/painel?areaId=AREA-x');
    expect(area.statusCode).toBe(400);
    expect(area.json().campos).toEqual({ areaId: 'Área não encontrada.' });
    const cancelados = await amb.chamar(ADMIN, 'GET', '/painel?cancelados=sim');
    expect(cancelados.json().campos).toEqual({ cancelados: 'Use true ou false.' });
    const longa = await amb.chamar(ADMIN, 'GET', `/painel?busca=${'x'.repeat(201)}`);
    expect(longa.json().campos.busca).toMatch(/200 caracteres/);
  });

  it('área inativa (ainda com documentos) é aceita no filtro', async () => {
    const eng = await idDaArea('Engenharia');
    await cadastrar({ areaId: eng });
    await amb.banco.query('UPDATE areas SET ativa = false WHERE id = $1', [eng]);
    expect((await painel(ADMIN, `?areaId=${eng}`)).cartoes).toHaveLength(1);
  });

  it('Solicitante só vê a própria área, mesmo pedindo outra (vazio, não 403); Leitor vê tudo; sem perfil 403', async () => {
    const solicitante = await pessoaComPerfil('sol2', 'Solicitante', 'Engenharia');
    const leitor = await pessoaComPerfil('lei2', 'Leitor', 'Custos');
    const eng = await idDaArea('Engenharia');
    const custos = await idDaArea('Custos');
    await cadastrar({ titulo: 'Da Engenharia', areaId: eng });
    const deCustos = await cadastrar({ titulo: 'De Custos', areaId: custos });
    await mudarStatusNoBanco(deCustos.id, 'Cancelado', 'Recebido');

    const doSolicitante = await painel(solicitante);
    expect(doSolicitante.cartoes.map((c) => c.titulo)).toEqual(['Da Engenharia']);
    expect(doSolicitante.qtdCancelados).toBe(0);
    const outraArea = await painel(solicitante, `?areaId=${custos}`);
    expect(outraArea.cartoes).toEqual([]);
    expect(outraArea.qtdCancelados).toBe(0);

    const doLeitor = await painel(leitor);
    expect(doLeitor.cartoes.map((c) => c.titulo)).toEqual(['Da Engenharia']);
    expect(doLeitor.qtdCancelados).toBe(1);

    expect((await amb.chamar(pessoaFicticia('sem2'), 'GET', '/painel')).statusCode).toBe(403);
  });

  it('qtdDevolucoes e dataAprovacao calculados dos eventos (inseridos direto no banco)', async () => {
    const doc = await cadastrar();
    // Entra em devolvido, muda dentro da fase (não conta), sai, volta (conta de novo) e é aprovado.
    await mudarStatusNoBanco(doc.id, 'Em revisão da qualidade', 'Recebido');
    await mudarStatusNoBanco(doc.id, 'Devolvido para correção', 'Em revisão da qualidade');
    await mudarStatusNoBanco(doc.id, 'Em revisão do solicitante', 'Devolvido para correção');
    await mudarStatusNoBanco(doc.id, 'Para aprovação qualidade', 'Em revisão do solicitante');
    await mudarStatusNoBanco(doc.id, 'Devolvido para área para revisão', 'Para aprovação qualidade');
    await mudarStatusNoBanco(doc.id, 'Para aprovação qualidade', 'Devolvido para área para revisão');
    // 02:00 UTC de 10/10 = 23:00 de 09/10 em São Paulo.
    await mudarStatusNoBanco(doc.id, 'Aprovado', 'Para aprovação qualidade', '2026-10-10T02:00:00Z');

    const [cartao] = (await painel(ADMIN)).cartoes;
    expect(cartao).toMatchObject({ status: 'Aprovado', fase: 'aprovado', qtdDevolucoes: 2, dataAprovacao: '2026-10-09' });
  });
});
