import { randomUUID } from 'node:crypto';
import type {
  Area,
  DetalheDocumento,
  Documento,
  NovoDocumento,
  Pessoa,
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

let entra: EntraFalso;
let amb: Ambiente;

beforeAll(async () => {
  entra = await criarEntraFalso();
});
beforeEach(async () => {
  amb = await criarAmbiente(entra);
  await amb.chamar(ADMIN, 'GET', '/eu'); // bootstrap do Administrador
});
afterEach(async () => {
  await amb.fechar();
});

const MB = 1024 * 1024;

async function idDaArea(nome: string): Promise<string> {
  const areas = (await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
  return areas.find((a) => a.nome === nome)!.id;
}

async function idDoTipo(nome = 'PR - Procedimento'): Promise<string> {
  const tipos = (await amb.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
  return tipos.find((t) => t.nome === nome)!.id;
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

async function novoDocumento(extra: Partial<NovoDocumento> = {}): Promise<NovoDocumento> {
  return {
    id: `DOC-${randomUUID()}`,
    codigo: null,
    titulo: 'Procedimento: Compras & Contratos',
    tipoDocumentoId: await idDoTipo(),
    revisao: 0,
    dataRecebimento: '2026-09-29',
    dataRevisao: '2026-10-15',
    remetente: 'Remetente Fictício',
    areaId: await idDaArea('Qualidade'),
    disciplina: null,
    observacao: 'Cadastro inicial de teste',
    ...extra,
  };
}

const PDF = { campo: 'arquivoPrincipal', arquivo: 'procedimento.pdf', conteudo: '%PDF-1.4 conteúdo fictício', tipo: 'application/pdf' };

function formulario(dados: unknown, arquivos: ParteFormulario[] = [PDF]): ParteFormulario[] {
  return [{ campo: 'dados', valor: JSON.stringify(dados) }, ...arquivos];
}

function cadastrar(identidade: JWTPayload, dados: unknown, arquivos?: ParteFormulario[]) {
  return amb.enviarFormulario(identidade, '/documentos', formulario(dados, arquivos));
}

async function eventosDe(id: string) {
  return (await amb.chamar(ADMIN, 'GET', `/documentos/${id}`)).json<DetalheDocumento>().eventos;
}

describe('GET /tipos-documento', () => {
  it('lista os 8 tipos ativos (inclusive Memorial Descritivo, P-10) em ordem alfabética pt-BR', async () => {
    const resposta = await amb.chamar(ADMIN, 'GET', '/tipos-documento');
    expect(resposta.statusCode).toBe(200);
    const tipos = resposta.json<TipoDocumento[]>();
    expect(tipos.map((t) => t.nome)).toEqual([
      'AT - Ata de Reunião',
      'ET - Especificação Técnica',
      'IT - Instrução de Trabalho',
      'LD - Lista de Documentos',
      'Memorial Descritivo',
      'MP - Mapas / Riscos',
      'PR - Procedimento',
      'RL - Relatório',
    ]);
    for (const t of tipos) expect(t.id).toMatch(/^TIPO-/);
  });

  it('exige token', async () => {
    expect((await amb.app.inject({ method: 'GET', url: '/tipos-documento' })).statusCode).toBe(401);
  });
});

describe('POST /documentos — cadastro', () => {
  it('cadastra com principal e anexos, status Recebido, pasta pelo ID e evento CRIACAO do token', async () => {
    const dados = await novoDocumento({ codigo: 'PR-QUA-001', disciplina: 'Corporativo' });
    const resposta = await cadastrar(ADMIN, dados, [
      PDF,
      { campo: 'anexos', arquivo: 'planilha.xlsx', conteudo: 'xlsx' },
      { campo: 'anexos', arquivo: 'foto.JPG', conteudo: 'jpg' },
      { campo: 'anexos', arquivo: 'planilha.xlsx', conteudo: 'outra' },
    ]);
    expect(resposta.statusCode).toBe(201);
    const doc = resposta.json<Documento>();
    const eu = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    expect(doc).toMatchObject({
      id: dados.id,
      codigo: 'PR-QUA-001',
      status: 'Recebido',
      tipoDocumento: 'PR - Procedimento',
      area: 'Qualidade',
      revisao: 0,
      dataRecebimento: '2026-09-29',
      dataRevisao: '2026-10-15',
      nomePasta: 'Procedimento- Compras - Contratos',
      nomeArquivoPrincipal: 'procedimento.pdf',
      qtdAnexos: 3,
      idDocumentoOrigem: null,
      versao: 1,
      criadoPor: eu.id,
    });
    expect(new Date(doc.criadoEm).toISOString()).toBe(doc.criadoEm);
    expect(new Date(doc.dataModificacao).toISOString()).toBe(doc.dataModificacao);

    // P-07: pasta pelo ID; principal na raiz, anexos em Anexos/, nomes repetidos com sufixo.
    expect(amb.armazenamento.listar(dados.id)).toEqual([
      'Anexos/foto.jpg',
      'Anexos/planilha (2).xlsx',
      'Anexos/planilha.xlsx',
      'procedimento.pdf',
    ]);
    expect((await amb.armazenamento.ler(dados.id, 'procedimento.pdf'))!.toString()).toBe(PDF.conteudo);

    const eventos = await eventosDe(dados.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      id: expect.stringMatching(/^HIST-[0-9a-f-]{36}$/),
      idDocumento: dados.id,
      codigo: 'PR-QUA-001',
      tipoAcao: 'CRIACAO',
      status: 'Recebido',
      statusAnterior: null,
      autorId: eu.id,
      autorNome: 'Admin Fictício',
      detalhes: [],
      observacao: 'Cadastro inicial de teste',
    });
  });

  it('P-02: sem arquivo principal → 400 no campo arquivoPrincipal', async () => {
    const resposta = await cadastrar(ADMIN, await novoDocumento(), []);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      codigo: 'dados_invalidos',
      campos: { arquivoPrincipal: 'Selecione o arquivo do documento principal.' },
    });
  });

  it('recusa mais de um arquivo principal', async () => {
    const resposta = await cadastrar(ADMIN, await novoDocumento(), [PDF, { ...PDF, arquivo: 'outro.pdf' }]);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos.arquivoPrincipal).toBe('Envie um único arquivo principal.');
  });

  it('P-09: recusa extensão fora da lista (principal e anexo)', async () => {
    const resposta = await cadastrar(ADMIN, await novoDocumento(), [
      { campo: 'arquivoPrincipal', arquivo: 'programa.exe', conteudo: 'MZ' },
      { campo: 'anexos', arquivo: 'pacote.zip', conteudo: 'PK' },
    ]);
    expect(resposta.statusCode).toBe(400);
    const campos = resposta.json().campos;
    expect(campos.arquivoPrincipal).toMatch(/Formato não permitido/);
    expect(campos.anexos).toMatch(/^pacote\.zip: Formato não permitido/);
  });

  it('P-09: recusa arquivo acima de 20 MB e nada é gravado', async () => {
    const dados = await novoDocumento();
    const resposta = await cadastrar(ADMIN, dados, [PDF, { campo: 'anexos', arquivo: 'grande.pdf', conteudo: Buffer.alloc(20 * MB + 1) }]);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos.anexos).toMatch(/20 MB/);
    expect((await amb.chamar(ADMIN, 'GET', `/documentos/${dados.id}`)).statusCode).toBe(404);
    expect(amb.armazenamento.listar(dados.id)).toEqual([]);
  });

  it('recusa mais de 20 anexos', async () => {
    const anexos = Array.from({ length: 21 }, (_, i) => ({ campo: 'anexos', arquivo: `a${i}.pdf`, conteudo: 'x' }));
    const resposta = await cadastrar(ADMIN, await novoDocumento(), [PDF, ...anexos]);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos.anexos).toBe('Envie no máximo 20 anexos.');
  });

  it('P-03: status no corpo é recusado; o cadastro é sempre Recebido', async () => {
    const dados = await novoDocumento();
    const recusado = await cadastrar(ADMIN, { ...dados, status: 'Aprovado' });
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json().campos.status).toMatch(/sempre Recebido/);

    const aceito = await cadastrar(ADMIN, dados);
    expect(aceito.statusCode).toBe(201);
    expect(aceito.json<Documento>().status).toBe('Recebido');
  });

  it('esquema fechado com mensagens pt-BR por campo', async () => {
    const resposta = await cadastrar(ADMIN, {
      id: 'DOC-nao-uuid',
      titulo: '  ',
      tipoDocumentoId: '',
      revisao: -1,
      dataRecebimento: '2026-02-30',
      dataRevisao: 'amanhã',
      remetente: '',
      areaId: '',
      extra: 1,
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().campos).toEqual({
      id: 'Identificador inválido. Recarregue o formulário e tente de novo.',
      titulo: 'Informe o título do documento.',
      tipoDocumentoId: 'Selecione o tipo de documento.',
      revisao: 'O número de revisão deve ser um inteiro de 0 a 999.',
      dataRecebimento: 'Data de recebimento inválida.',
      dataRevisao: 'Data de revisão (prazo) inválida.',
      remetente: 'Informe o remetente ou solicitante.',
      areaId: 'Selecione a área.',
      extra: 'Campo não permitido.',
    });
  });

  it('sem a parte dados, ou com JSON inválido → 400 no campo dados', async () => {
    const semDados = await amb.enviarFormulario(ADMIN, '/documentos', [PDF]);
    expect(semDados.json().campos.dados).toBe('Envie os dados do documento.');
    const jsonRuim = await amb.enviarFormulario(ADMIN, '/documentos', [{ campo: 'dados', valor: '{ruim' }, PDF]);
    expect(jsonRuim.json().campos.dados).toBe('Os dados do documento não estão em JSON válido.');
  });

  it('JSON em vez de multipart → 400', async () => {
    const resposta = await amb.chamar(ADMIN, 'POST', '/documentos', await novoDocumento());
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().codigo).toBe('dados_invalidos');
  });

  it('tipo ou área inexistente → 400 no campo', async () => {
    const tipo = await cadastrar(ADMIN, await novoDocumento({ tipoDocumentoId: 'TIPO-x' }));
    expect(tipo.json().campos).toEqual({ tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.' });
    const area = await cadastrar(ADMIN, await novoDocumento({ areaId: 'AREA-x' }));
    expect(area.json().campos).toEqual({ areaId: 'Área não encontrada ou inativa.' });
  });

  it('decisão 0004: código + revisão repetidos → 409 (sem diferenciar maiúsculas); outra revisão é aceita', async () => {
    expect((await cadastrar(ADMIN, await novoDocumento({ codigo: 'IT-001' }))).statusCode).toBe(201);
    const repetido = await cadastrar(ADMIN, await novoDocumento({ codigo: 'it-001' }));
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().codigo).toBe('codigo_revisao_existente');
    expect((await cadastrar(ADMIN, await novoDocumento({ codigo: 'IT-001', revisao: 1 }))).statusCode).toBe(201);
    // Sem código não há regra de unicidade (código e título não são identidade).
    expect((await cadastrar(ADMIN, await novoDocumento())).statusCode).toBe(201);
    expect((await cadastrar(ADMIN, await novoDocumento())).statusCode).toBe(201);
  });
});

describe('POST /documentos — idempotência', () => {
  it('reenvio igual do mesmo autor → 200 com o mesmo documento, sem duplicar evento nem arquivos', async () => {
    const dados = await novoDocumento();
    const anexos: ParteFormulario[] = [PDF, { campo: 'anexos', arquivo: 'a.docx', conteudo: 'docx' }];
    const primeiro = await cadastrar(ADMIN, dados, anexos);
    expect(primeiro.statusCode).toBe(201);
    const segundo = await cadastrar(ADMIN, dados, anexos);
    expect(segundo.statusCode).toBe(200);
    expect(segundo.json()).toEqual(primeiro.json());

    expect(await eventosDe(dados.id)).toHaveLength(1);
    expect(amb.armazenamento.listar(dados.id)).toEqual(['Anexos/a.docx', 'procedimento.pdf']);
    const { rows } = await amb.banco.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM arquivos_documento WHERE id_documento = $1',
      [dados.id],
    );
    expect(rows[0]!.total).toBe(2);
  });

  it('mesmo ID com outros dados → 409 id_existente', async () => {
    const dados = await novoDocumento();
    await cadastrar(ADMIN, dados);
    const resposta = await cadastrar(ADMIN, { ...dados, titulo: 'Outro título' });
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().codigo).toBe('id_existente');
  });

  it('mesmo ID com outro arquivo → 409 id_existente', async () => {
    const dados = await novoDocumento();
    await cadastrar(ADMIN, dados);
    const resposta = await cadastrar(ADMIN, dados, [{ ...PDF, conteudo: 'outro conteúdo' }]);
    expect(resposta.json().codigo).toBe('id_existente');
  });

  it('mesmo ID e dados, mas outro autor → 409 id_existente', async () => {
    const qualidade = await pessoaComPerfil('qualidade', 'Qualidade');
    const dados = await novoDocumento();
    await cadastrar(ADMIN, dados);
    const resposta = await cadastrar(qualidade, dados);
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().codigo).toBe('id_existente');
  });
});

describe('POST /documentos — permissões', () => {
  it('Leitor não cadastra → 403', async () => {
    const leitor = await pessoaComPerfil('leitor', 'Leitor');
    const resposta = await cadastrar(leitor, await novoDocumento());
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().codigo).toBe('sem_permissao');
  });

  it('pessoa sem perfil não cadastra → 403', async () => {
    const resposta = await cadastrar(pessoaFicticia('sem-perfil'), await novoDocumento());
    expect(resposta.statusCode).toBe(403);
  });

  it('Solicitante cadastra só na sua área', async () => {
    const solicitante = await pessoaComPerfil('solicitante', 'Solicitante', 'Engenharia');
    const naSua = await cadastrar(solicitante, await novoDocumento({ areaId: await idDaArea('Engenharia') }));
    expect(naSua.statusCode).toBe(201);
    const emOutra = await cadastrar(solicitante, await novoDocumento({ areaId: await idDaArea('Custos') }));
    expect(emOutra.statusCode).toBe(403);
    expect(emOutra.json().codigo).toBe('sem_permissao');
  });

  it('Qualidade cadastra em qualquer área; autor do evento é quem está no token', async () => {
    const qualidade = await pessoaComPerfil('q2', 'Qualidade');
    const dados = await novoDocumento({ areaId: await idDaArea('Custos'), remetente: 'Outra Pessoa' });
    const resposta = await cadastrar(qualidade, dados);
    expect(resposta.statusCode).toBe(201);
    const eu = (await amb.chamar(qualidade, 'GET', '/eu')).json<Pessoa>();
    const [evento] = await eventosDe(dados.id);
    expect(evento).toMatchObject({ autorId: eu.id, autorNome: 'Pessoa q2' });
    expect(resposta.json<Documento>().remetente).toBe('Outra Pessoa');
  });
});

describe('POST /documentos — falha do armazenamento', () => {
  it('desfaz o banco e apaga os arquivos já gravados', async () => {
    amb.armazenamento.falharAposGravar = 1;
    const dados = await novoDocumento();
    const resposta = await cadastrar(ADMIN, dados, [PDF, { campo: 'anexos', arquivo: 'a.pdf', conteudo: 'a' }]);
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toMatchObject({ codigo: 'erro_interno', mensagem: expect.stringMatching(/Nada foi cadastrado/) });
    expect(amb.armazenamento.listar(dados.id)).toEqual([]);

    for (const tabela of ['documentos', 'eventos_historico', 'arquivos_documento']) {
      const coluna = tabela === 'documentos' ? 'id' : 'id_documento';
      const { rows } = await amb.banco.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${tabela} WHERE ${coluna} = $1`,
        [dados.id],
      );
      expect(rows[0]!.total).toBe(0);
    }

    // Depois de o disco voltar, o mesmo envio funciona (a fila do cliente reenvia).
    amb.armazenamento.falharAposGravar = null;
    expect((await cadastrar(ADMIN, dados, [PDF, { campo: 'anexos', arquivo: 'a.pdf', conteudo: 'a' }])).statusCode).toBe(201);
  });
});

describe('histórico imutável', () => {
  it('UPDATE, DELETE e TRUNCATE em eventos_historico são recusados', async () => {
    const dados = await novoDocumento();
    await cadastrar(ADMIN, dados);
    await expect(amb.banco.query("UPDATE eventos_historico SET observacao = 'x'")).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('DELETE FROM eventos_historico')).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('TRUNCATE eventos_historico CASCADE')).rejects.toThrow(/imutável/);
  });
});

describe('GET /documentos/recentes e /documentos/:id — visibilidade', () => {
  it('Solicitante vê só os da sua área; Leitor e Qualidade veem todos, os mais recentes primeiro', async () => {
    const solicitante = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const leitor = await pessoaComPerfil('lei', 'Leitor', 'Custos');
    const daEngenharia = await novoDocumento({ areaId: await idDaArea('Engenharia'), titulo: 'Da Engenharia' });
    const deCustos = await novoDocumento({ areaId: await idDaArea('Custos'), titulo: 'De Custos' });
    await cadastrar(ADMIN, daEngenharia);
    await cadastrar(ADMIN, deCustos);

    const doSolicitante = (await amb.chamar(solicitante, 'GET', '/documentos/recentes')).json<Documento[]>();
    expect(doSolicitante.map((d) => d.titulo)).toEqual(['Da Engenharia']);

    const doLeitor = (await amb.chamar(leitor, 'GET', '/documentos/recentes')).json<Documento[]>();
    expect(doLeitor.map((d) => d.titulo)).toEqual(['De Custos', 'Da Engenharia']);

    // 404 igual ao de inexistente: não revela que o documento existe.
    const escondido = await amb.chamar(solicitante, 'GET', `/documentos/${deCustos.id}`);
    expect(escondido.statusCode).toBe(404);
    expect(escondido.json()).toEqual({ codigo: 'nao_encontrado' });
    expect((await amb.chamar(solicitante, 'GET', `/documentos/${daEngenharia.id}`)).statusCode).toBe(200);
    expect((await amb.chamar(leitor, 'GET', `/documentos/${daEngenharia.id}`)).statusCode).toBe(200);
  });

  it('limita a 10 documentos', async () => {
    for (let i = 0; i < 12; i++) await cadastrar(ADMIN, await novoDocumento({ titulo: `Doc ${i}` }));
    const recentes = (await amb.chamar(ADMIN, 'GET', '/documentos/recentes')).json<Documento[]>();
    expect(recentes).toHaveLength(10);
    expect(recentes[0]!.titulo).toBe('Doc 11');
  });

  it('documento inexistente → 404; pessoa sem perfil → 403', async () => {
    expect((await amb.chamar(ADMIN, 'GET', `/documentos/DOC-${randomUUID()}`)).statusCode).toBe(404);
    expect((await amb.chamar(pessoaFicticia('sem'), 'GET', '/documentos/recentes')).statusCode).toBe(403);
  });
});
