/**
 * F6: edição de dados cadastrais (contrato docs/contratos/f6-edicao-de-dados.md,
 * seção 7.1, linhas da API).
 */
import { randomUUID } from 'node:crypto';
import type {
  Area,
  DetalheDocumento,
  Documento,
  EventoHistorico,
  NovoDocumento,
  Pessoa,
  RespostaPainel,
  ResultadoEdicao,
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
import { validarEdicaoDocumento, validarNovoDocumento } from './validacao.ts';

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

async function idDaArea(nome: string): Promise<string> {
  const areas = (await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
  return areas.find((a) => a.nome === nome)!.id;
}

async function tipos(): Promise<TipoDocumento[]> {
  return (await amb.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
}

async function pessoaComPerfil(apelido: string, perfil: Pessoa['perfil'], area: string | null = 'Engenharia') {
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

const PDF: ParteFormulario = { campo: 'arquivoPrincipal', arquivo: 'doc.pdf', conteudo: '%PDF-1.4 fictício', tipo: 'application/pdf' };

function formularioDe(dados: NovoDocumento): ParteFormulario[] {
  return [{ campo: 'dados', valor: JSON.stringify(dados) }, PDF];
}

async function novoDocumento(extra: Partial<NovoDocumento> = {}): Promise<NovoDocumento> {
  return {
    id: `DOC-${randomUUID()}`,
    codigo: 'PR-001',
    titulo: 'Procedimento de Compras',
    tipoDocumentoId: (await tipos())[0]!.id,
    revisao: 0,
    remetente: 'Remetente Fictício',
    areaId: await idDaArea('Engenharia'),
    disciplina: 'Civil',
    observacao: null,
    ...extra,
  };
}

async function cadastrar(extra: Partial<NovoDocumento> = {}, quem: JWTPayload = ADMIN): Promise<Documento> {
  const resposta = await amb.enviarFormulario(quem, '/documentos', formularioDe(await novoDocumento(extra)));
  expect(resposta.statusCode, resposta.body).toBe(201);
  return resposta.json<Documento>();
}

/** Corpo completo de edição a partir do documento como está (+ alterações). */
function corpoDe(doc: Documento, extra: Record<string, unknown> = {}) {
  return {
    titulo: doc.titulo,
    codigo: doc.codigo,
    tipoDocumentoId: doc.tipoDocumentoId,
    revisao: doc.revisao,
    remetente: doc.remetente,
    areaId: doc.areaId,
    disciplina: doc.disciplina,
    observacao: doc.observacao,
    versao: doc.versao,
    ...extra,
  };
}

const editar = (quem: JWTPayload, id: string, corpo: unknown) => amb.chamar(quem, 'PUT', `/documentos/${id}/dados`, corpo);

async function detalhe(id: string): Promise<DetalheDocumento> {
  const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${id}`);
  expect(resposta.statusCode).toBe(200);
  return resposta.json<DetalheDocumento>();
}
const eventosDe = async (id: string): Promise<EventoHistorico[]> => (await detalhe(id)).eventos;

async function levarPara(doc: Documento, para: StatusDocumento, responsavelId: string | null): Promise<Documento> {
  const resposta = await amb.chamar(ADMIN, 'POST', `/documentos/${doc.id}/transicoes`, {
    para,
    responsavelId,
    observacao: null,
    versao: doc.versao,
  });
  expect(resposta.statusCode, resposta.body).toBe(201);
  return resposta.json<ResultadoTransicao>().documento;
}

async function eu(identidade: JWTPayload): Promise<Pessoa> {
  return (await amb.chamar(identidade, 'GET', '/eu')).json<Pessoa>();
}

// ---------------------------------------------------------------------------

describe('validarNovoDocumento e validarEdicaoDocumento (contrato F6, 2.2 e 4.2 passo 5)', () => {
  const base = {
    titulo: 'T',
    codigo: null,
    tipoDocumentoId: 'TIPO-1',
    revisao: 0,
    remetente: 'R',
    areaId: 'AREA-1',
    disciplina: null,
    observacao: null,
  };

  it('cadastro: mesmas mensagens da F2 (regressão)', () => {
    const r = validarNovoDocumento({ id: 'DOC-x', titulo: ' ', tipoDocumentoId: '', revisao: -1, remetente: '', areaId: '', extra: 1 });
    expect(r).toEqual({
      ok: false,
      campos: {
        id: 'Identificador inválido. Recarregue o formulário e tente de novo.',
        titulo: 'Informe o título do documento.',
        tipoDocumentoId: 'Selecione o tipo de documento.',
        revisao: 'O número de revisão deve ser um inteiro de 0 a 999.',
        remetente: 'Informe o remetente ou solicitante.',
        areaId: 'Selecione a área.',
        extra: 'Campo não permitido.',
      },
    });
  });

  it('edição: válida com versão; dados normalizados', () => {
    expect(validarEdicaoDocumento({ ...base, titulo: '  T  ', revisao: '2', versao: 3 })).toEqual({
      ok: true,
      dados: { ...base, revisao: 2, versao: 3 },
    });
  });

  it('edição: campo desconhecido, status com mensagem própria, campos do servidor → "Campo não permitido."', () => {
    const r = validarEdicaoDocumento({
      ...base,
      versao: 1,
      extra: 1,
      status: 'Aprovado',
      id: 'DOC-1',
      responsavelId: 'USR-1',
      dataRevisao: '2026-10-10',
      dataRecebimento: '2026-09-01',
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.campos).toEqual({
      extra: 'Campo não permitido.',
      status: 'O status muda só por Atualizar etapa.',
      id: 'Campo não permitido.',
      responsavelId: 'Campo não permitido.',
      dataRevisao: 'Campo não permitido.',
      dataRecebimento: 'Campo não permitido.',
    });
  });

  it('edição: versão ausente, 0 ou texto → erro em versao; corpo incompleto → obrigatórios', () => {
    for (const versao of [undefined, 0, '2']) {
      const r = validarEdicaoDocumento({ ...base, versao });
      expect(!r.ok && r.campos.versao).toMatch(/Versão inválida/);
    }
    const r = validarEdicaoDocumento({ versao: 1 });
    expect(!r.ok && Object.keys(r.campos).sort()).toEqual(['areaId', 'remetente', 'revisao', 'tipoDocumentoId', 'titulo']);
    expect(validarEdicaoDocumento(null).ok).toBe(false);
  });
});

describe('PUT /documentos/:id/dados', () => {
  it('201: 8 campos novos, versão + 1, nomePasta recalculado, campos do servidor intactos; evento EDICAO na ordem, com nomes e autor do token', async () => {
    const { identidade: qualidade, pessoa: q } = await pessoaComPerfil('qualidade', 'Qualidade', 'Qualidade');
    const doc = await cadastrar({ observacao: 'Antiga' });
    const [, outroTipo] = await tipos();
    const areaNova = await idDaArea('Qualidade');
    const resposta = await editar(
      qualidade,
      doc.id,
      corpoDe(doc, {
        titulo: '  Controle / informação: nova ',
        codigo: 'PR-002',
        tipoDocumentoId: outroTipo!.id,
        revisao: '3',
        remetente: 'Ana Exemplo',
        areaId: areaNova,
        disciplina: '',
        observacao: 'Nova',
      }),
    );
    expect(resposta.statusCode, resposta.body).toBe(201);
    const { documento, evento } = resposta.json<ResultadoEdicao>();
    expect(documento).toMatchObject({
      id: doc.id,
      titulo: 'Controle / informação: nova',
      codigo: 'PR-002',
      tipoDocumentoId: outroTipo!.id,
      tipoDocumento: outroTipo!.nome,
      revisao: 3,
      remetente: 'Ana Exemplo',
      areaId: areaNova,
      area: 'Qualidade',
      disciplina: null,
      observacao: 'Nova',
      versao: doc.versao + 1,
      status: doc.status,
      responsavelId: doc.responsavelId,
      dataRecebimento: doc.dataRecebimento,
      dataRevisao: doc.dataRevisao,
      criadoPor: doc.criadoPor,
      criadoEm: doc.criadoEm,
      nomeArquivoPrincipal: doc.nomeArquivoPrincipal,
    });
    expect(documento.nomePasta).not.toBe(doc.nomePasta);
    expect(documento.nomePasta).not.toMatch(/[/:]/);
    expect(evento).toMatchObject({
      id: expect.stringMatching(/^HIST-/),
      tipoAcao: 'EDICAO',
      status: 'Recebido',
      statusAnterior: null,
      codigo: 'PR-002',
      responsavel: null,
      responsavelId: null,
      destino: null,
      observacao: null,
      autorId: q.id,
      autorNome: 'Pessoa qualidade',
    });
    expect(evento!.detalhes).toEqual([
      { campo: 'titulo', antes: 'Procedimento de Compras', depois: 'Controle / informação: nova' },
      { campo: 'codigo', antes: 'PR-001', depois: 'PR-002' },
      { campo: 'tipoDocumento', antes: doc.tipoDocumento, depois: outroTipo!.nome },
      { campo: 'revisao', antes: '0', depois: '3' },
      { campo: 'remetente', antes: 'Remetente Fictício', depois: 'Ana Exemplo' },
      { campo: 'area', antes: 'Engenharia', depois: 'Qualidade' },
      { campo: 'disciplina', antes: 'Civil', depois: null },
      { campo: 'observacao', antes: 'Antiga', depois: 'Nova' },
    ]);
    // hash_cadastro não muda com a edição.
    const { rows } = await amb.banco.query<{ hash_cadastro: string }>('SELECT hash_cadastro FROM documentos WHERE id = $1', [doc.id]);
    expect(rows[0]!.hash_cadastro).toMatch(/^[0-9a-f]{64}$/);
    // GET /documentos/:id devolve o evento em ordem.
    const d = await detalhe(doc.id);
    expect(d.documento).toEqual(documento);
    expect(d.eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO', 'EDICAO']);
  });

  it('autor vem do token: autorId no corpo é recusado', async () => {
    const doc = await cadastrar();
    const resposta = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'X', autorId: 'USR-falso' }));
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos).toEqual({ autorId: 'Campo não permitido.' });
  });

  it('corpo igual ao atual → 200 com evento null, versão intacta, nenhum evento novo', async () => {
    const doc = await cadastrar();
    const resposta = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: `  ${doc.titulo}  `, disciplina: 'Civil' }));
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<ResultadoEdicao>()).toMatchObject({ evento: null, documento: { versao: doc.versao } });
    expect(await eventosDe(doc.id)).toHaveLength(1);
  });

  it('reenvio idêntico → 200 com o mesmo evento, sem gravar; campo extra no reenvio → 400', async () => {
    const doc = await cadastrar();
    const corpo = corpoDe(doc, { titulo: 'Novo título' });
    const primeira = await editar(ADMIN, doc.id, corpo);
    expect(primeira.statusCode).toBe(201);
    const reenvio = await editar(ADMIN, doc.id, corpo);
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json<ResultadoEdicao>().evento!.id).toBe(primeira.json<ResultadoEdicao>().evento!.id);
    expect(reenvio.json<ResultadoEdicao>().documento.versao).toBe(doc.versao + 1);
    expect((await editar(ADMIN, doc.id, { ...corpo, extra: 1 })).statusCode).toBe(400);
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('reenvio de outro autor ou com outros dados na versão velha → 409 conflito_versao', async () => {
    const { identidade: qualidade } = await pessoaComPerfil('q2', 'Qualidade', 'Qualidade');
    const doc = await cadastrar();
    expect((await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Primeiro' }))).statusCode).toBe(201);
    // Dois envios em sequência com a mesma versão: o segundo (outros dados) recebe 409 com o documento atual.
    const segundo = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Segundo' }));
    expect(segundo.statusCode).toBe(409);
    expect(segundo.json()).toMatchObject({ codigo: 'conflito_versao', documento: { titulo: 'Primeiro', versao: doc.versao + 1 } });
    const deOutro = await editar(qualidade, doc.id, corpoDe(doc, { titulo: 'Primeiro' }));
    expect(deOutro.statusCode).toBe(409);
    expect(deOutro.json().codigo).toBe('conflito_versao');
    expect(await eventosDe(doc.id)).toHaveLength(2);
  });

  it('versão velha (depois de outra ação) → 409 conflito_versao com o documento atual; nada gravado', async () => {
    const doc = await cadastrar();
    const agora = await levarPara(doc, 'Devolvido para correção', (await eu(ADMIN)).id);
    const resposta = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Velho' }));
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ codigo: 'conflito_versao', documento: { versao: agora.versao, status: 'Devolvido para correção' } });
    expect((await detalhe(doc.id)).documento.titulo).toBe(doc.titulo);
  });

  describe('código + revisão (decisão 0004, P-06)', () => {
    it('código de outro documento (mesma revisão, caixa diferente) → 409 codigo_revisao_existente; nada gravado', async () => {
      await cadastrar({ codigo: 'IT-010' });
      const doc = await cadastrar({ codigo: 'IT-011' });
      const resposta = await editar(ADMIN, doc.id, corpoDe(doc, { codigo: 'it-010', titulo: 'Outro' }));
      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toMatchObject({ codigo: 'codigo_revisao_existente', campos: { codigo: expect.any(String) } });
      expect((await detalhe(doc.id)).documento).toMatchObject({ codigo: 'IT-011', titulo: doc.titulo, versao: doc.versao });
      expect(await eventosDe(doc.id)).toHaveLength(1);
    });

    it('manter o próprio código (ou só mudar a caixa) → 201', async () => {
      const doc = await cadastrar({ codigo: 'IT-020' });
      const mesmo = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Outro título' }));
      expect(mesmo.statusCode).toBe(201);
      const caixa = await editar(ADMIN, doc.id, corpoDe(mesmo.json<ResultadoEdicao>().documento, { codigo: 'it-020' }));
      expect(caixa.statusCode).toBe(201);
      expect(caixa.json<ResultadoEdicao>().evento!.detalhes).toEqual([{ campo: 'codigo', antes: 'IT-020', depois: 'it-020' }]);
    });

    it('mudar só a revisão para uma combinação já usada → 409; para uma livre → 201', async () => {
      await cadastrar({ codigo: 'IT-030', revisao: 1 });
      const doc = await cadastrar({ codigo: 'IT-030', revisao: 0 });
      expect((await editar(ADMIN, doc.id, corpoDe(doc, { revisao: 1 }))).json().codigo).toBe('codigo_revisao_existente');
      expect((await editar(ADMIN, doc.id, corpoDe(doc, { revisao: 2 }))).statusCode).toBe(201);
    });
  });

  describe('tipo e área', () => {
    it('trocar para tipo inativo → 400; tipo atual inativado mantido → 201', async () => {
      const [tipoA, tipoB] = await tipos();
      const doc = await cadastrar({ tipoDocumentoId: tipoA!.id });
      await amb.banco.query('UPDATE tipos_documento SET ativo = false WHERE id = $1', [tipoB!.id]);
      const trocar = await editar(ADMIN, doc.id, corpoDe(doc, { tipoDocumentoId: tipoB!.id }));
      expect(trocar.statusCode).toBe(400);
      expect(trocar.json().campos).toEqual({ tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.' });
      expect((await editar(ADMIN, doc.id, corpoDe(doc, { tipoDocumentoId: 'TIPO-nao-existe' }))).statusCode).toBe(400);

      await amb.banco.query('UPDATE tipos_documento SET ativo = false WHERE id = $1', [tipoA!.id]);
      const manter = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Mantém o tipo' }));
      expect(manter.statusCode).toBe(201);
      expect(manter.json<ResultadoEdicao>().documento.tipoDocumentoId).toBe(tipoA!.id);
    });

    it('trocar para área inativa → 400; área atual inativada mantida → 201', async () => {
      const doc = await cadastrar();
      const qualidade = await idDaArea('Qualidade');
      await amb.banco.query('UPDATE areas SET ativa = false WHERE id = $1', [qualidade]);
      const trocar = await editar(ADMIN, doc.id, corpoDe(doc, { areaId: qualidade }));
      expect(trocar.statusCode).toBe(400);
      expect(trocar.json().campos).toEqual({ areaId: 'Área não encontrada ou inativa.' });

      await amb.banco.query('UPDATE areas SET ativa = false WHERE id = $1', [doc.areaId]);
      expect((await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Mantém a área' }))).statusCode).toBe(201);
    });
  });

  describe('quem edita (contrato 3.1) e em que fase (3.2)', () => {
    it('Solicitante: em Devolvido na sua área → 201; em Recebido → 403 com mensagem; mudando a área → 403; de outra área → 404', async () => {
      const { identidade: solicitante, pessoa: s } = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
      const doc = await cadastrar();
      const recebido = await editar(solicitante, doc.id, corpoDe(doc, { titulo: 'Tentativa' }));
      expect(recebido.statusCode).toBe(403);
      expect(recebido.json()).toEqual({ codigo: 'sem_permissao', mensagem: 'Você só pode editar documentos devolvidos à sua área.' });

      const devolvido = await levarPara(doc, 'Devolvido para correção', s.id);
      const ok = await editar(solicitante, doc.id, corpoDe(devolvido, { titulo: 'Corrigido pelo solicitante' }));
      expect(ok.statusCode).toBe(201);
      expect(ok.json<ResultadoEdicao>().evento).toMatchObject({ autorId: s.id, status: 'Devolvido para correção' });
      // Status e responsável intactos.
      expect(ok.json<ResultadoEdicao>().documento).toMatchObject({ status: 'Devolvido para correção', responsavelId: s.id });

      const atual = ok.json<ResultadoEdicao>().documento;
      const mover = await editar(solicitante, doc.id, corpoDe(atual, { areaId: await idDaArea('Qualidade') }));
      expect(mover.statusCode).toBe(403);
      expect(mover.json()).toEqual({ codigo: 'sem_permissao', mensagem: 'Seu perfil não pode mover o documento para outra área.' });

      const deOutraArea = await cadastrar({ areaId: await idDaArea('Qualidade'), codigo: null });
      expect((await editar(solicitante, deOutraArea.id, corpoDe(deOutraArea))).statusCode).toBe(404);
      expect((await editar(solicitante, `DOC-${randomUUID()}`, corpoDe(doc))).statusCode).toBe(404);
    });

    it('Qualidade em qualquer fase de tramitação → 201', async () => {
      const { identidade: qualidade, pessoa: q } = await pessoaComPerfil('qual', 'Qualidade', 'Qualidade');
      let doc = await cadastrar();
      const caminho: [StatusDocumento, string | null][] = [
        ['Recebido', null],
        ['Em revisão da qualidade', q.id],
        ['Devolvido para correção', q.id],
        ['Para aprovação qualidade', q.id],
      ];
      for (const [status, responsavel] of caminho) {
        if (doc.status !== status) doc = await levarPara(doc, status, responsavel);
        const resposta = await editar(qualidade, doc.id, corpoDe(doc, { observacao: `Em ${status}` }));
        expect(resposta.statusCode, status).toBe(201);
        doc = resposta.json<ResultadoEdicao>().documento;
      }
    });

    it('Leitor → 403; pessoa sem acesso liberado → 403', async () => {
      const { identidade: leitor } = await pessoaComPerfil('leitor', 'Leitor', 'Engenharia');
      const doc = await cadastrar();
      expect((await editar(leitor, doc.id, corpoDe(doc, { titulo: 'X' }))).statusCode).toBe(403);
      expect((await editar(pessoaFicticia('sem-acesso'), doc.id, corpoDe(doc, { titulo: 'X' }))).statusCode).toBe(403);
    });

    it('Aprovado → 409 acao_nao_permitida (também para Administrador); Cancelado → 409', async () => {
      const adminId = (await eu(ADMIN)).id;
      const doc = await cadastrar();
      const revisao = await levarPara(doc, 'Em revisão da qualidade', adminId);
      const aprovado = await levarPara(revisao, 'Aprovado', null);
      const r1 = await editar(ADMIN, doc.id, corpoDe(aprovado, { titulo: 'X' }));
      expect(r1.statusCode).toBe(409);
      expect(r1.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento aprovado é final. Para corrigir, cadastre uma revisão.' });

      const outro = await cadastrar({ codigo: null });
      const cancelado = await amb.chamar(ADMIN, 'POST', `/documentos/${outro.id}/cancelamentos`, {
        motivo: 'Cancelado para o teste de edição.',
        versao: outro.versao,
      });
      expect(cancelado.statusCode).toBe(201);
      const r2 = await editar(ADMIN, outro.id, corpoDe(cancelado.json<ResultadoTransicao>().documento, { titulo: 'X' }));
      expect(r2.statusCode).toBe(409);
      expect(r2.json()).toEqual({ codigo: 'acao_nao_permitida', mensagem: 'Documento cancelado: reative antes de editar.' });
    });

    it('edição com a versão anterior sobre documento que acabou de ser aprovado → 409 conflito_versao (ajuste 14.7 da F5)', async () => {
      const adminId = (await eu(ADMIN)).id;
      const doc = await levarPara(await cadastrar(), 'Em revisão da qualidade', adminId);
      await levarPara(doc, 'Aprovado', null);
      const resposta = await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Tarde demais' }));
      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toMatchObject({ codigo: 'conflito_versao', documento: { status: 'Aprovado' } });
    });

    it('reenvio de uma edição depois de a pessoa cancelar o documento → 409 acao_nao_permitida (nada gravado)', async () => {
      const doc = await cadastrar();
      const corpo = corpoDe(doc, { titulo: 'Editado' });
      const editado = (await editar(ADMIN, doc.id, corpo)).json<ResultadoEdicao>().documento;
      await amb.chamar(ADMIN, 'POST', `/documentos/${doc.id}/cancelamentos`, { motivo: 'Cancelado depois da edição.', versao: editado.versao });
      const reenvio = await editar(ADMIN, doc.id, corpo);
      expect(reenvio.statusCode).toBe(409);
      expect(reenvio.json().codigo).toBe('acao_nao_permitida');
    });
  });

  it('400 antes da idempotência: corpo inválido com status, e JSON que não é objeto', async () => {
    const doc = await cadastrar();
    const r = await editar(ADMIN, doc.id, corpoDe(doc, { status: 'Aprovado', remetente: '  ' }));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ status: 'O status muda só por Atualizar etapa.', remetente: 'Informe o remetente ou solicitante.' });
    expect((await editar(ADMIN, doc.id, [1, 2])).statusCode).toBe(400);
  });
});

describe('regressões e leituras (contrato F6, 7.1)', () => {
  it('evento EDICAO é imutável (gatilho)', async () => {
    const doc = await cadastrar();
    const { evento } = (await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Imutável' }))).json<ResultadoEdicao>();
    await expect(amb.banco.query("UPDATE eventos_historico SET observacao = 'x' WHERE id = $1", [evento!.id])).rejects.toThrow();
    await expect(amb.banco.query('DELETE FROM eventos_historico WHERE id = $1', [evento!.id])).rejects.toThrow();
  });

  it('GET /painel e GET /documentos/recentes refletem título, área e código novos', async () => {
    const doc = await cadastrar();
    const qualidade = await idDaArea('Qualidade');
    expect((await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Título novo', codigo: 'NV-1', areaId: qualidade }))).statusCode).toBe(201);
    const cartao = (await amb.chamar(ADMIN, 'GET', '/painel')).json<RespostaPainel>().cartoes.find((c) => c.id === doc.id)!;
    expect(cartao).toMatchObject({ titulo: 'Título novo', codigo: 'NV-1', areaId: qualidade, area: 'Qualidade', versao: doc.versao + 1 });
    const recente = (await amb.chamar(ADMIN, 'GET', '/documentos/recentes')).json<Documento[]>().find((d) => d.id === doc.id)!;
    expect(recente).toMatchObject({ titulo: 'Título novo', codigo: 'NV-1', area: 'Qualidade' });
  });

  it('reenvio do cadastro original DEPOIS de uma edição → 200 com o documento editado (nunca reverte nem duplica)', async () => {
    const dados = await novoDocumento();
    const criado = await amb.enviarFormulario(ADMIN, '/documentos', formularioDe(dados));
    expect(criado.statusCode).toBe(201);
    const doc = criado.json<Documento>();
    expect((await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Editado depois' }))).statusCode).toBe(201);
    const reenvio = await amb.enviarFormulario(ADMIN, '/documentos', formularioDe(dados));
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json<Documento>()).toMatchObject({ id: doc.id, titulo: 'Editado depois', versao: doc.versao + 1 });
  });

  it('download continua pelo ID depois de mudar o título (pasta pelo ID, P-07)', async () => {
    const doc = await cadastrar();
    await editar(ADMIN, doc.id, corpoDe(doc, { titulo: 'Outro nome de pasta' }));
    const principal = (await detalhe(doc.id)).arquivos.find((a) => a.papel === 'principal')!;
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${doc.id}/arquivos/${principal.id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toBe('%PDF-1.4 fictício');
  });

  it('HEAD e métodos não previstos em /dados não existem', async () => {
    const doc = await cadastrar();
    expect((await amb.chamar(ADMIN, 'POST', `/documentos/${doc.id}/dados`, corpoDe(doc))).statusCode).toBe(404);
    expect((await amb.chamar(ADMIN, 'PATCH', `/documentos/${doc.id}`, corpoDe(doc))).statusCode).toBe(404);
  });
});
