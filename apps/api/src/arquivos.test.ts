/**
 * F4 (parte servidor): GET /documentos/:id estendido, download de arquivos sem marca
 * d'água, nome do principal pela decisão 0014 e registro imutável de acesso.
 * Banco PGlite em memória, armazenamento em memória, JWKS local. Nada de internet.
 */
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Area, DetalheDocumento, Documento, NovoDocumento, Pessoa, TipoDocumento } from '@docsync/compartilhado';
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
import { listarAcessosArquivos } from './banco/documentos.ts';
import { hojeNoFuso } from './datas.ts';

let entra: EntraFalso;
let amb: Ambiente;
/** Conteúdo fictício com cabeçalho de PDF; a API não interpreta o conteúdo (decisão 0014). */
const pdfValido = Buffer.from('%PDF-1.4\n% conteúdo fictício de teste\n%%EOF\n');

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
  const tipos = (await amb.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
  return {
    id: `DOC-${randomUUID()}`,
    codigo: null,
    titulo: 'Procedimento de teste',
    tipoDocumentoId: tipos[0]!.id,
    revisao: 0,
    remetente: 'Remetente Fictício',
    areaId: await idDaArea('Qualidade'),
    disciplina: null,
    observacao: null,
    ...extra,
  };
}

const ANEXOS_PADRAO: ParteFormulario[] = [
  { campo: 'anexos', arquivo: 'Zebra.xlsx', conteudo: 'xlsx-zebra' },
  { campo: 'anexos', arquivo: 'ábaco.docx', conteudo: 'docx-abaco' },
  { campo: 'anexos', arquivo: 'Foto.JPG', conteudo: 'jpg-foto' },
];

/** Cadastra um documento com PDF real como principal e devolve o detalhe. */
async function cadastrarComArquivos(
  identidade: JWTPayload = ADMIN,
  extra: Partial<NovoDocumento> = {},
  anexos: ParteFormulario[] = ANEXOS_PADRAO,
  principal: ParteFormulario = { campo: 'arquivoPrincipal', arquivo: 'Relatório Final.pdf', conteudo: pdfValido, tipo: 'application/pdf' },
): Promise<DetalheDocumento> {
  const dados = await novoDocumento(extra);
  const resposta = await amb.enviarFormulario(identidade, '/documentos', [
    { campo: 'dados', valor: JSON.stringify(dados) },
    principal,
    ...anexos,
  ]);
  expect(resposta.statusCode).toBe(201);
  const detalhe = await amb.chamar(ADMIN, 'GET', `/documentos/${dados.id}`);
  expect(detalhe.statusCode).toBe(200);
  return detalhe.json<DetalheDocumento>();
}

const principalDe = (d: DetalheDocumento) => d.arquivos.find((a) => a.papel === 'principal')!;
const anexoDe = (d: DetalheDocumento, nome: string) => d.arquivos.find((a) => a.nomeOriginal === nome)!;

describe('GET /documentos/:id — detalhe estendido (contrato F4, seção 2)', () => {
  it('devolve documento, arquivos (principal primeiro, anexos em pt-BR), eventos em ordem e hoje', async () => {
    const detalhe = await cadastrarComArquivos();
    expect(detalhe.hoje).toBe(hojeNoFuso());
    expect(detalhe.arquivos.map((a) => [a.papel, a.nomeOriginal])).toEqual([
      ['principal', 'Relatório Final.pdf'],
      ['anexo', 'ábaco.docx'],
      ['anexo', 'Foto.JPG'],
      ['anexo', 'Zebra.xlsx'],
    ]);
    for (const a of detalhe.arquivos) {
      expect(a.id).toMatch(/^ARQ-/);
      expect(a.tamanho).toBeGreaterThan(0);
      expect(new Date(a.criadoEm).toISOString()).toBe(a.criadoEm);
      expect(a).not.toHaveProperty('nomeArmazenado');
      expect(a).not.toHaveProperty('tipoMime');
      expect(a).not.toHaveProperty('idDocumento');
    }
    expect(principalDe(detalhe).tamanho).toBe(pdfValido.length);
    expect(detalhe.eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO']);
    expect(detalhe.documento.id).toBe(detalhe.eventos[0]!.idDocumento);
  });

  it('eventos ficam em ordem de gravação (reprogramação depois do cadastro)', async () => {
    const detalhe = await cadastrarComArquivos();
    const doc = detalhe.documento;
    // Decisão 0015: reprogramar só com prazo vencido; vence o prazo direto no banco.
    await amb.banco.query("UPDATE documentos SET data_revisao = '2026-01-01' WHERE id = $1", [doc.id]);
    const reprogramada = await amb.chamar(ADMIN, 'POST', `/documentos/${doc.id}/reprogramacoes`, {
      novoPrazo: '2030-01-01',
      justificativa: 'Justificativa suficiente para o teste.',
      versao: doc.versao,
    });
    expect(reprogramada.statusCode).toBe(201);
    const depois = (await amb.chamar(ADMIN, 'GET', `/documentos/${doc.id}`)).json<DetalheDocumento>();
    expect(depois.eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO', 'REPROGRAMACAO']);
    expect(depois.documento.versao).toBe(doc.versao + 1);
  });

  it('esquema fechado: parâmetro de query → 400 por campo', async () => {
    const detalhe = await cadastrarComArquivos();
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}?campo=1`);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({ codigo: 'dados_invalidos', campos: { campo: 'Campo não permitido.' } });
  });

  it('Solicitante de outra área → 404; pessoa sem acesso liberado → 403; sem token → 401', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, { areaId: await idDaArea('Custos') });
    const solicitante = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const escondido = await amb.chamar(solicitante, 'GET', `/documentos/${detalhe.documento.id}`);
    expect(escondido.statusCode).toBe(404);
    expect(escondido.json()).toEqual({ codigo: 'nao_encontrado' });
    expect((await amb.chamar(pessoaFicticia('sem'), 'GET', `/documentos/${detalhe.documento.id}`)).statusCode).toBe(403);
    expect((await amb.app.inject({ method: 'GET', url: `/documentos/${detalhe.documento.id}` })).statusCode).toBe(401);
  });
});

describe('GET /documentos/:id/arquivos/:arquivoId — download (contrato F4, seções 4 e 10; decisão 0014)', () => {
  it('anexo: 200 com o corpo igual ao gravado, Content-Length, tipo pela extensão e nome original (sem prefixo)', async () => {
    const detalhe = await cadastrarComArquivos();
    const anexo = anexoDe(detalhe, 'Zebra.xlsx');
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexo.id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.rawPayload.toString()).toBe('xlsx-zebra');
    expect(resposta.headers['content-length']).toBe(String(Buffer.byteLength('xlsx-zebra')));
    expect(resposta.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resposta.headers['content-disposition']).toBe(
      `attachment; filename="Zebra.xlsx"; filename*=UTF-8''Zebra.xlsx`,
    );
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['cache-control']).toBe('private, no-store');
    expect(resposta.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  });

  it('principal: sai byte a byte igual ao gravado, sem marca, com nome [código]-[título]_[revisão]=[versão].[ext]', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, { codigo: 'PR-QUA-0010', titulo: 'Procedimento de auditoria: interna', revisao: 2 });
    const principal = principalDe(detalhe);
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${principal.id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('application/pdf');
    expect(resposta.headers['content-disposition']).toBe(
      `attachment; filename="PR-QUA-0010-Procedimento de auditoria- interna_2=1.pdf"; filename*=UTF-8''PR-QUA-0010-Procedimento%20de%20auditoria-%20interna_2%3D1.pdf`,
    );
    expect(resposta.headers['content-length']).toBe(String(pdfValido.length));
    expect(resposta.rawPayload.equals(pdfValido)).toBe(true);
    // Original no armazenamento não muda.
    const gravado = await amb.armazenamento.ler(detalhe.documento.id, 'Relatório Final.pdf');
    expect(gravado!.equals(pdfValido)).toBe(true);
  });

  it('principal sem código: SEM-CODIGO-[título]_[revisão]=1; anexo com acento sai com o nome original codificado', async () => {
    const detalhe = await cadastrarComArquivos();
    const principal = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${principalDe(detalhe).id}`);
    expect(principal.headers['content-disposition']).toBe(
      `attachment; filename="SEM-CODIGO-Procedimento de teste_0=1.pdf"; filename*=UTF-8''SEM-CODIGO-Procedimento%20de%20teste_0%3D1.pdf`,
    );
    const anexo = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexoDe(detalhe, 'ábaco.docx').id}`);
    expect(anexo.headers['content-disposition']).toBe(`attachment; filename="_baco.docx"; filename*=UTF-8''%C3%A1baco.docx`);
  });

  it('tipo_mime gravado como text/html nunca sai como text/html', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, {}, [
      { campo: 'anexos', arquivo: 'pagina.png', conteudo: '<html>', tipo: 'text/html' },
    ]);
    const anexo = anexoDe(detalhe, 'pagina.png');
    const { rows } = await amb.banco.query<{ tipo_mime: string }>('SELECT tipo_mime FROM arquivos_documento WHERE id = $1', [anexo.id]);
    expect(rows[0]!.tipo_mime).toBe('text/html');
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexo.id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('image/png');
  });

  it('arquivoId de OUTRO documento → 404; arquivoId inexistente → 404', async () => {
    const a = await cadastrarComArquivos();
    const b = await cadastrarComArquivos();
    const alheio = await amb.chamar(ADMIN, 'GET', `/documentos/${a.documento.id}/arquivos/${principalDe(b).id}`);
    expect(alheio.statusCode).toBe(404);
    expect(alheio.json()).toEqual({ codigo: 'nao_encontrado' });
    expect((await amb.chamar(ADMIN, 'GET', `/documentos/${a.documento.id}/arquivos/ARQ-${randomUUID()}`)).statusCode).toBe(404);
    // Nenhum registro de acesso para tentativas recusadas.
    expect(await listarAcessosArquivos(amb.banco, a.documento.id)).toEqual([]);
  });

  it('documento invisível (Solicitante de outra área) → 404 mesmo com arquivoId certo; Leitor → 403 (decisão 0014); sem acesso → 403; sem token → 401', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, { areaId: await idDaArea('Custos') });
    const url = `/documentos/${detalhe.documento.id}/arquivos/${anexoDe(detalhe, 'Foto.JPG').id}`;
    const solicitante = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const leitor = await pessoaComPerfil('lei', 'Leitor', 'Suprimentos');
    const escondido = await amb.chamar(solicitante, 'GET', url);
    expect(escondido.statusCode).toBe(404);
    expect(escondido.json()).toEqual({ codigo: 'nao_encontrado' });
    const doLeitor = await amb.chamar(leitor, 'GET', url);
    expect(doLeitor.statusCode).toBe(403);
    expect(doLeitor.json()).toEqual({ codigo: 'sem_permissao' });
    // O Leitor continua vendo os detalhes (só não baixa).
    expect((await amb.chamar(leitor, 'GET', `/documentos/${detalhe.documento.id}`)).statusCode).toBe(200);
    expect((await amb.chamar(pessoaFicticia('sem'), 'GET', url)).statusCode).toBe(403);
    expect((await amb.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    // Recusas não geram registro de acesso.
    expect(await listarAcessosArquivos(amb.banco, detalhe.documento.id)).toEqual([]);
  });

  it('Solicitante da área do documento e Qualidade de outra área baixam', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, { areaId: await idDaArea('Engenharia') });
    const solicitante = await pessoaComPerfil('sol', 'Solicitante', 'Engenharia');
    const qualidade = await pessoaComPerfil('qua', 'Qualidade', 'Qualidade');
    const url = `/documentos/${detalhe.documento.id}/arquivos/${anexoDe(detalhe, 'Foto.JPG').id}`;
    const resposta = await amb.chamar(solicitante, 'GET', url);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('image/jpeg');
    expect((await amb.chamar(qualidade, 'GET', url)).statusCode).toBe(200);
  });

  it('arquivo ausente no armazenamento → 404 arquivo_indisponivel, sem registro de acesso', async () => {
    const detalhe = await cadastrarComArquivos();
    await amb.armazenamento.remover(detalhe.documento.id, ['Anexos/Zebra.xlsx']);
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexoDe(detalhe, 'Zebra.xlsx').id}`);
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ codigo: 'arquivo_indisponivel' });
    expect(await listarAcessosArquivos(amb.banco, detalhe.documento.id)).toEqual([]);
  });

  it('nome_armazenado adulterado para ../x → o armazenamento recusa (500), nunca lê fora da pasta', async () => {
    const detalhe = await cadastrarComArquivos();
    const anexo = anexoDe(detalhe, 'Zebra.xlsx');
    await amb.banco.query('UPDATE arquivos_documento SET nome_armazenado = $2 WHERE id = $1', [anexo.id, '../x']);
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexo.id}`);
    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ codigo: 'erro_interno' });
  });

  it('PDF cifrado ou corrompido é entregue como está (sem marca d\u2019água, nada a aplicar)', async () => {
    const detalhe = await cadastrarComArquivos(ADMIN, {}, [
      { campo: 'anexos', arquivo: 'quebrado.pdf', conteudo: '%PDF-1.4 conteúdo fictício' },
    ]);
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${anexoDe(detalhe, 'quebrado.pdf').id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.rawPayload.toString()).toBe('%PDF-1.4 conteúdo fictício');
  });

  it('esquema fechado: parâmetro de query → 400', async () => {
    const detalhe = await cadastrarComArquivos();
    const resposta = await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${principalDe(detalhe).id}?inline=1`);
    expect(resposta.statusCode).toBe(400);
  });

  it('o log da requisição não contém o token', async () => {
    const linhas: string[] = [];
    const destino = new Writable({
      write(pedaco, _codificacao, proximo) {
        linhas.push(String(pedaco));
        proximo();
      },
    });
    const ambComLog = await criarAmbiente(entra, { logger: { level: 'info', stream: destino } });
    try {
      await ambComLog.chamar(ADMIN, 'GET', '/eu');
      const dados = await novoDocumento();
      const tipos = (await ambComLog.chamar(ADMIN, 'GET', '/tipos-documento')).json<TipoDocumento[]>();
      const areas = (await ambComLog.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
      const cadastro = await ambComLog.enviarFormulario(ADMIN, '/documentos', [
        { campo: 'dados', valor: JSON.stringify({ ...dados, tipoDocumentoId: tipos[0]!.id, areaId: areas[0]!.id }) },
        { campo: 'arquivoPrincipal', arquivo: 'a.pdf', conteudo: pdfValido },
      ]);
      expect(cadastro.statusCode).toBe(201);
      const detalhe = (await ambComLog.chamar(ADMIN, 'GET', `/documentos/${dados.id}`)).json<DetalheDocumento>();
      const token = await entra.token(ADMIN);
      const resposta = await ambComLog.app.inject({
        method: 'GET',
        url: `/documentos/${dados.id}/arquivos/${principalDe(detalhe).id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(resposta.statusCode).toBe(200);
      const log = linhas.join('');
      expect(log).toContain(`/documentos/${dados.id}/arquivos/`);
      expect(log).not.toContain(token);
      expect(log).not.toContain(token.split('.')[2]!);
    } finally {
      await ambComLog.fechar();
    }
  });
});

describe('rota de visualização removida (decisão 0014)', () => {
  it('GET .../visualizacao → 404 sem registro de acesso', async () => {
    const detalhe = await cadastrarComArquivos();
    const url = `/documentos/${detalhe.documento.id}/arquivos/${principalDe(detalhe).id}/visualizacao`;
    expect((await amb.chamar(ADMIN, 'GET', url)).statusCode).toBe(404);
    expect(await listarAcessosArquivos(amb.banco, detalhe.documento.id)).toEqual([]);
  });
});

describe('registros_acesso_arquivos — registro imutável (decisão 0014, item 3)', () => {
  it('grava DOWNLOAD com autor do token, em ordem, sem tocar na linha do tempo', async () => {
    const detalhe = await cadastrarComArquivos();
    const qualidade = await pessoaComPerfil('qua', 'Qualidade', 'Qualidade');
    const base = `/documentos/${detalhe.documento.id}/arquivos`;
    const principal = principalDe(detalhe);
    const anexo = anexoDe(detalhe, 'Foto.JPG');
    expect((await amb.chamar(qualidade, 'GET', `${base}/${principal.id}`)).statusCode).toBe(200);
    expect((await amb.chamar(ADMIN, 'GET', `${base}/${anexo.id}`)).statusCode).toBe(200);
    expect((await amb.chamar(qualidade, 'GET', `${base}/${principal.id}`)).statusCode).toBe(200);

    const eu = (await amb.chamar(qualidade, 'GET', '/eu')).json<Pessoa>();
    const admin = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    const registros = await listarAcessosArquivos(amb.banco, detalhe.documento.id);
    expect(registros.map((r) => [r.tipo, r.idArquivo, r.autorId, r.autorNome])).toEqual([
      ['DOWNLOAD', principal.id, eu.id, eu.nome],
      ['DOWNLOAD', anexo.id, admin.id, admin.nome],
      ['DOWNLOAD', principal.id, eu.id, eu.nome],
    ]);
    for (const r of registros) {
      expect(r.id).toMatch(/^ACS-/);
      expect(r.idDocumento).toBe(detalhe.documento.id);
      expect(new Date(r.dataHora).toISOString()).toBe(r.dataHora);
    }
    // Fora da linha do tempo de tramitação.
    const depois = (await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}`)).json<DetalheDocumento>();
    expect(depois.eventos.map((e) => e.tipoAcao)).toEqual(['CRIACAO']);
    expect(depois.documento.versao).toBe(detalhe.documento.versao);
  });

  it('HEAD no download e nos detalhes → não 200 e nenhum registro de acesso (sem HEAD automático do Fastify)', async () => {
    const detalhe = await cadastrarComArquivos();
    const principal = principalDe(detalhe);
    const download = await amb.chamar(ADMIN, 'HEAD', `/documentos/${detalhe.documento.id}/arquivos/${principal.id}`);
    expect(download.statusCode).not.toBe(200);
    expect(download.headers['content-disposition']).toBeUndefined();
    const detalhes = await amb.chamar(ADMIN, 'HEAD', `/documentos/${detalhe.documento.id}`);
    expect(detalhes.statusCode).not.toBe(200);
    expect(await listarAcessosArquivos(amb.banco, detalhe.documento.id)).toEqual([]);
    // O GET continua funcionando e registrando.
    expect((await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${principal.id}`)).statusCode).toBe(200);
    expect(await listarAcessosArquivos(amb.banco, detalhe.documento.id)).toHaveLength(1);
  });

  it('UPDATE, DELETE e TRUNCATE são recusados; tipo fora da lista também (VISUALIZACAO fica previsto, sem uso)', async () => {
    const detalhe = await cadastrarComArquivos();
    const principal = principalDe(detalhe);
    expect((await amb.chamar(ADMIN, 'GET', `/documentos/${detalhe.documento.id}/arquivos/${principal.id}`)).statusCode).toBe(200);
    await expect(amb.banco.query("UPDATE registros_acesso_arquivos SET tipo = 'DOWNLOAD'")).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('DELETE FROM registros_acesso_arquivos')).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('TRUNCATE registros_acesso_arquivos')).rejects.toThrow(/imutável/);
    await expect(
      amb.banco.query(
        `INSERT INTO registros_acesso_arquivos (id, id_documento, id_arquivo, tipo, autor_id, autor_nome)
         VALUES ('ACS-x', $1, $2, 'IMPRESSAO', 'USR-x', 'x')`,
        [detalhe.documento.id, principal.id],
      ),
    ).rejects.toThrow();
    expect((await listarAcessosArquivos(amb.banco, detalhe.documento.id)).length).toBe(1);
  });

  it('migração 0004 registrada', async () => {
    const { rows } = await amb.banco.query<{ versao: string }>("SELECT versao FROM migracoes WHERE versao = '0004'");
    expect(rows).toHaveLength(1);
  });
});

describe('regressão: cadastro e reprogramação continuam iguais', () => {
  it('POST /documentos idempotente e POST reprogramações com conflito de versão', async () => {
    const dados = await novoDocumento();
    const partes: ParteFormulario[] = [
      { campo: 'dados', valor: JSON.stringify(dados) },
      { campo: 'arquivoPrincipal', arquivo: 'a.pdf', conteudo: pdfValido },
    ];
    expect((await amb.enviarFormulario(ADMIN, '/documentos', partes)).statusCode).toBe(201);
    const repetido = await amb.enviarFormulario(ADMIN, '/documentos', partes);
    expect(repetido.statusCode).toBe(200);
    const doc = repetido.json<Documento>();
    const desatualizada = await amb.chamar(ADMIN, 'POST', `/documentos/${doc.id}/reprogramacoes`, {
      novoPrazo: '2030-01-01',
      justificativa: 'Justificativa suficiente para o teste.',
      versao: doc.versao + 5,
    });
    expect(desatualizada.statusCode).toBe(409);
    expect(desatualizada.json()).toMatchObject({ codigo: 'conflito_versao' });
  });
});
