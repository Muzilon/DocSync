import type { Area, Pessoa, RegistroAuditoriaPessoa } from '@docsync/compartilhado';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN,
  EMAIL_ADMIN_INICIAL,
  criarAmbiente,
  criarEntraFalso,
  pessoaFicticia,
  type Ambiente,
  type EntraFalso,
} from './apoio-testes.ts';
import { aplicarMigracoes } from './banco/conexao.ts';
import { lerAreaAdministradorInicial } from './config.ts';

let entra: EntraFalso;
let amb: Ambiente;

beforeAll(async () => {
  entra = await criarEntraFalso();
});
beforeEach(async () => {
  amb = await criarAmbiente(entra);
});
afterEach(async () => {
  await amb.fechar();
});

async function idDaArea(nome: string): Promise<string> {
  const areas = (await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>();
  return areas.find((a) => a.nome === nome)!.id;
}

/** Pré-cadastra uma pessoa com perfil e área (via Administrador) e faz o primeiro login dela. */
async function pessoaComPerfil(apelido: string, perfil: Pessoa['perfil']): Promise<Pessoa> {
  await amb.chamar(ADMIN, 'GET', '/eu');
  const identidade = pessoaFicticia(apelido);
  const criada = await amb.chamar(ADMIN, 'POST', '/pessoas', {
    email: identidade.preferred_username,
    nome: identidade.name,
    perfil,
    areaId: await idDaArea('Qualidade'),
  });
  expect(criada.statusCode).toBe(201);
  return (await amb.chamar(identidade, 'GET', '/eu')).json<Pessoa>();
}

describe('rotas públicas', () => {
  it('responde à verificação de funcionamento sem token', async () => {
    const resposta = await amb.app.inject({ method: 'GET', url: '/saude' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
  });

  it('responde 404 para rota inexistente', async () => {
    expect((await amb.app.inject({ method: 'GET', url: '/nao-existe' })).statusCode).toBe(404);
  });
});

describe('autenticação', () => {
  for (const url of ['/eu', '/areas', '/pessoas', '/pessoas/USR-x/auditoria']) {
    it(`GET ${url} sem token → 401 nao_autenticado`, async () => {
      const resposta = await amb.app.inject({ method: 'GET', url });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ codigo: 'nao_autenticado' });
      expect(resposta.headers['www-authenticate']).toMatch(/^Bearer/);
    });
  }

  it('token com assinatura inválida → 401', async () => {
    const token = await entra.token(ADMIN, { chave: entra.chaveEstranha });
    const resposta = await amb.app.inject({ method: 'GET', url: '/eu', headers: { authorization: `Bearer ${token}` } });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ codigo: 'nao_autenticado' });
  });

  it('esquema diferente de Bearer → 401', async () => {
    const resposta = await amb.app.inject({ method: 'GET', url: '/eu', headers: { authorization: 'Basic abc' } });
    expect(resposta.statusCode).toBe(401);
  });

  it('não usa o corpo da requisição para identidade nem permissão', async () => {
    const comum = (await amb.chamar(pessoaFicticia('comum'), 'GET', '/eu')).json<Pessoa>();
    const resposta = await amb.chamar(pessoaFicticia('comum'), 'PATCH', `/pessoas/${comum.id}`, {
      perfil: 'Administrador',
    });
    expect(resposta.statusCode).toBe(403);
  });
});

describe('identificação da pessoa (decisão 0007)', () => {
  it('primeiro login sem pré-cadastro cria registro sem perfil; /eu responde 200', async () => {
    const resposta = await amb.chamar(pessoaFicticia('nova'), 'GET', '/eu');
    expect(resposta.statusCode).toBe(200);
    const pessoa = resposta.json<Pessoa>();
    expect(pessoa).toEqual({
      id: expect.stringMatching(/^USR-[0-9a-f-]{36}$/),
      nome: 'Pessoa nova',
      email: 'nova@exemplo.test',
      perfil: null,
      area: null,
      areaId: null,
      status: 'Ativo',
    });
    // Mesmo oid → mesmo registro.
    expect((await amb.chamar(pessoaFicticia('nova'), 'GET', '/eu')).json<Pessoa>().id).toBe(pessoa.id);
  });

  it('bootstrap: e-mail de ADMINISTRADORES_INICIAIS vira Administrador, auditado como sistema', async () => {
    const eu = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    expect(eu.perfil).toBe('Administrador');

    const auditoria = (await amb.chamar(ADMIN, 'GET', `/pessoas/${eu.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
    expect(auditoria).toContainEqual(
      expect.objectContaining({ campo: 'perfil', antes: null, depois: 'Administrador', autorId: 'sistema', autorNome: 'Sistema' }),
    );
  });

  it('e-mail de ADMINISTRADORES_INICIAIS não vira Administrador se já existe um ativo', async () => {
    await pessoaComPerfil('primeiro-admin', 'Administrador'); // ADMIN já é o bootstrap
    const inicial = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    // Rebaixa o inicial (há outro admin ativo) e confere que o bootstrap não o promove de novo.
    await amb.chamar(pessoaFicticia('primeiro-admin'), 'PATCH', `/pessoas/${inicial.id}`, { perfil: 'Leitor' });
    expect((await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>().perfil).toBe('Leitor');
  });

  it('mesmo e-mail com outro oid do Entra → 409 conflito_identidade (não associa em silêncio)', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const outraConta = { oid: 'oid-outra', email: EMAIL_ADMIN_INICIAL.toUpperCase() };
    const resposta = await amb.chamar(outraConta, 'GET', '/eu');
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ codigo: 'conflito_identidade' });
  });

  it('bootstrap funciona com conta convidada que só traz upn #EXT#', async () => {
    const convidado = {
      oid: 'oid-convidado',
      preferred_username: undefined,
      upn: 'admin.inicial_exemplo.test#EXT#@locatario.onmicrosoft.com',
    };
    const eu = (await amb.chamar(convidado, 'GET', '/eu')).json<Pessoa>();
    expect(eu.email).toBe(EMAIL_ADMIN_INICIAL);
    expect(eu.perfil).toBe('Administrador');
  });

  it('associa o primeiro login a um pré-cadastro pelo e-mail e grava o vínculo', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const criada = await amb.chamar(ADMIN, 'POST', '/pessoas', {
      email: 'Pre.Cadastro@Exemplo.test',
      nome: 'Pré-cadastrada',
      perfil: 'Qualidade',
      areaId: await idDaArea('Engenharia'),
    });
    expect(criada.statusCode).toBe(201);
    const pre = criada.json<Pessoa>();
    expect(pre.email).toBe('pre.cadastro@exemplo.test');

    const login = { oid: 'oid-pre', email: 'PRE.CADASTRO@exemplo.test', name: 'Nome do Entra' };
    const eu = (await amb.chamar(login, 'GET', '/eu')).json<Pessoa>();
    expect(eu).toEqual({ ...pre, perfil: 'Qualidade', area: 'Engenharia' });

    // Depois do vínculo, localiza pelo oid mesmo que o e-mail mude no Entra.
    const depois = (await amb.chamar({ ...login, email: 'novo@exemplo.test' }, 'GET', '/eu')).json<Pessoa>();
    expect(depois.id).toBe(pre.id);

    const auditoria = (await amb.chamar(ADMIN, 'GET', `/pessoas/${pre.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
    expect(auditoria.map((r) => r.campo)).toEqual(['cadastro', 'perfil', 'area', 'vinculoEntra']);
  });

  it('pessoa inativa recebe 403 inativo em qualquer rota', async () => {
    const pessoa = await pessoaComPerfil('saiu', 'Leitor');
    await amb.chamar(ADMIN, 'PATCH', `/pessoas/${pessoa.id}`, { status: 'Inativo' });
    for (const url of ['/eu', '/areas']) {
      const resposta = await amb.chamar(pessoaFicticia('saiu'), 'GET', url);
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({ codigo: 'inativo' });
    }
  });

  it('perfil é lido do banco a cada requisição', async () => {
    const pessoa = await pessoaComPerfil('promovida', 'Qualidade');
    expect((await amb.chamar(pessoaFicticia('promovida'), 'GET', '/pessoas')).statusCode).toBe(403);
    await amb.chamar(ADMIN, 'PATCH', `/pessoas/${pessoa.id}`, { perfil: 'Administrador' });
    expect((await amb.chamar(pessoaFicticia('promovida'), 'GET', '/pessoas')).statusCode).toBe(200);
  });
});

describe('GET /areas', () => {
  it('lista as 8 áreas ativas em ordem alfabética pt-BR, com ID estável', async () => {
    const resposta = await amb.chamar(pessoaFicticia('sem-perfil'), 'GET', '/areas');
    expect(resposta.statusCode).toBe(200);
    const areas = resposta.json<Area[]>();
    expect(areas.map((a) => a.nome)).toEqual([
      'Comercial',
      'Custos',
      'Engenharia',
      'Qualidade',
      'Saúde Ocupacional',
      'Segurança do Trabalho',
      'Sistema de Gestão Ambiental',
      'Suprimentos',
    ]);
    expect(areas.every((a) => /^AREA-[0-9a-f-]{36}$/.test(a.id) && a.ativa)).toBe(true);
    expect((await amb.chamar(pessoaFicticia('sem-perfil'), 'GET', '/areas')).json<Area[]>()).toEqual(areas);
  });
});

describe('/pessoas', () => {
  it('não Administrador recebe 403 sem_permissao em todas as rotas de pessoas', async () => {
    const qualidade = await pessoaComPerfil('qualidade', 'Qualidade');
    const eu = pessoaFicticia('qualidade');
    const respostas = [
      await amb.chamar(eu, 'GET', '/pessoas'),
      await amb.chamar(eu, 'POST', '/pessoas', { email: 'x@exemplo.test', nome: 'X' }),
      await amb.chamar(eu, 'PATCH', `/pessoas/${qualidade.id}`, { perfil: 'Administrador' }),
      await amb.chamar(eu, 'GET', `/pessoas/${qualidade.id}/auditoria`),
      await amb.chamar(pessoaFicticia('sem-perfil'), 'GET', '/pessoas'),
    ];
    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toEqual({ codigo: 'sem_permissao' });
    }
  });

  it('lista pessoas em ordem alfabética pt-BR de nome', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const nomes: [string, string][] = [
      ['Úrsula', 'ursula'],
      ['bruno', 'bruno'],
      ['Álvaro', 'alvaro'],
    ];
    for (const [nome, email] of nomes) {
      await amb.chamar(ADMIN, 'POST', '/pessoas', { email: `${email}@exemplo.test`, nome });
    }
    const lista = (await amb.chamar(ADMIN, 'GET', '/pessoas')).json<Pessoa[]>().map((p) => p.nome);
    expect(lista).toEqual(['Admin Fictício', 'Álvaro', 'bruno', 'Úrsula']);
  });

  it('pré-cadastro sem perfil nem área é aceito (acesso não liberado)', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const resposta = await amb.chamar(ADMIN, 'POST', '/pessoas', { email: 'so@exemplo.test', nome: 'Só e-mail' });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<Pessoa>()).toMatchObject({ perfil: null, area: null, status: 'Ativo' });
  });

  it('e-mail repetido (sem diferenciar maiúsculas) → 409 email_existente', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    await amb.chamar(ADMIN, 'POST', '/pessoas', { email: 'repetido@exemplo.test', nome: 'Um' });
    const resposta = await amb.chamar(ADMIN, 'POST', '/pessoas', { email: 'REPETIDO@exemplo.test', nome: 'Dois' });
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({ codigo: 'email_existente' });
  });

  it('esquema fechado: campo desconhecido e valores inválidos → 400 com mensagens pt-BR', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const resposta = await amb.chamar(ADMIN, 'POST', '/pessoas', {
      email: 'invalido',
      nome: '',
      perfil: 'Chefe',
      id: 'USR-forjado',
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      codigo: 'dados_invalidos',
      campos: {
        id: 'Campo não permitido.',
        email: 'Informe um e-mail válido.',
        nome: 'Informe o nome.',
        perfil: 'Perfil inválido. Use Administrador, Qualidade, Solicitante ou Leitor.',
      },
    });

    const areaInexistente = await amb.chamar(ADMIN, 'POST', '/pessoas', {
      email: 'ok@exemplo.test',
      nome: 'Ok',
      areaId: 'AREA-inexistente',
    });
    expect(areaInexistente.statusCode).toBe(400);
    expect(areaInexistente.json().campos).toEqual({ areaId: 'Área não encontrada ou inativa.' });

    const patch = await amb.chamar(ADMIN, 'PATCH', '/pessoas/USR-x', { nome: 'Novo' });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().campos).toEqual({ nome: 'Campo não permitido.' });

    expect((await amb.chamar(ADMIN, 'PATCH', '/pessoas/USR-x', {})).statusCode).toBe(400);
  });

  it('PATCH em pessoa inexistente → 404 nao_encontrado', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    const resposta = await amb.chamar(ADMIN, 'PATCH', '/pessoas/USR-inexistente', { perfil: 'Leitor' });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ codigo: 'nao_encontrado' });
  });

  it('PATCH grava auditoria campo a campo, com o autor autenticado', async () => {
    const admin = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    const pessoa = await pessoaComPerfil('auditada', 'Leitor');
    const resposta = await amb.chamar(ADMIN, 'PATCH', `/pessoas/${pessoa.id}`, {
      perfil: 'Solicitante',
      areaId: await idDaArea('Custos'),
      status: 'Ativo', // sem mudança: não gera registro
    });
    expect(resposta.statusCode).toBe(200);
    const custos = await idDaArea('Custos');
    expect(resposta.json<Pessoa>()).toMatchObject({ perfil: 'Solicitante', area: 'Custos', areaId: custos });

    const auditoria = (await amb.chamar(ADMIN, 'GET', `/pessoas/${pessoa.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
    const alteracoes = auditoria.slice(-2);
    expect(alteracoes).toEqual([
      expect.objectContaining({
        campo: 'perfil',
        antes: 'Leitor',
        depois: 'Solicitante',
        autorId: admin.id,
        autorNome: 'Admin Fictício',
      }),
      expect.objectContaining({ campo: 'area', antes: 'Qualidade', depois: 'Custos', autorId: admin.id }),
    ]);
    expect(alteracoes.every((r) => /^AUD-/.test(r.id) && !Number.isNaN(Date.parse(r.dataHora)))).toBe(true);
  });

  it('último Administrador ativo não pode se rebaixar nem se inativar (409)', async () => {
    const admin = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    for (const corpo of [{ perfil: 'Qualidade' }, { perfil: null }, { status: 'Inativo' }]) {
      const resposta = await amb.chamar(ADMIN, 'PATCH', `/pessoas/${admin.id}`, corpo);
      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toMatchObject({ codigo: 'ultimo_administrador' });
    }
    expect((await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>().perfil).toBe('Administrador');

    // Com um segundo Administrador ativo, o rebaixamento é permitido.
    await pessoaComPerfil('segundo-admin', 'Administrador');
    const rebaixa = await amb.chamar(ADMIN, 'PATCH', `/pessoas/${admin.id}`, { perfil: 'Qualidade' });
    expect(rebaixa.statusCode).toBe(200);
  });

  it('devolve areaId e mantém nome e ID de área que foi inativada', async () => {
    const pessoa = await pessoaComPerfil('area-inativa', 'Leitor');
    const qualidade = await idDaArea('Qualidade');
    expect(pessoa).toMatchObject({ area: 'Qualidade', areaId: qualidade });

    await amb.banco.query('UPDATE areas SET ativa = false WHERE id = $1', [qualidade]);
    const lista = (await amb.chamar(ADMIN, 'GET', '/pessoas')).json<Pessoa[]>();
    expect(lista.find((p) => p.id === pessoa.id)).toMatchObject({ area: 'Qualidade', areaId: qualidade });
    expect((await amb.chamar(ADMIN, 'GET', '/areas')).json<Area[]>().some((a) => a.id === qualidade)).toBe(false);
  });

  it('dois rebaixamentos simultâneos dos dois últimos Administradores: só um passa', async () => {
    const admin = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    const segundo = await pessoaComPerfil('outro-admin', 'Administrador');
    const respostas = await Promise.all([
      amb.chamar(ADMIN, 'PATCH', `/pessoas/${segundo.id}`, { perfil: 'Leitor' }),
      amb.chamar(pessoaFicticia('outro-admin'), 'PATCH', `/pessoas/${admin.id}`, { status: 'Inativo' }),
    ]);
    const codigos = respostas.map((r) => r.statusCode);
    expect(codigos.filter((c) => c === 200)).toHaveLength(1);
    const { rows } = await amb.banco.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM usuarios WHERE perfil = 'Administrador' AND status = 'Ativo'",
    );
    expect(rows[0]!.total).toBe(1);
  });

  it('JSON malformado → 400 dados_invalidos', async () => {
    const token = await entra.token(ADMIN);
    const resposta = await amb.app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ codigo: 'dados_invalidos' });
  });
});

describe('banco', () => {
  it('migrações não são reaplicadas', async () => {
    expect(await aplicarMigracoes(amb.banco)).toEqual([]);
  });

  it('auditoria é imutável (UPDATE e DELETE recusados pelo banco)', async () => {
    await amb.chamar(ADMIN, 'GET', '/eu');
    await expect(amb.banco.query("UPDATE auditoria_pessoas SET depois = 'x'")).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('DELETE FROM auditoria_pessoas')).rejects.toThrow(/imutável/);
    await expect(amb.banco.query('TRUNCATE auditoria_pessoas')).rejects.toThrow(/imutável/);
  });
});

describe('área do primeiro Administrador (decisão 0010)', () => {
  it('bootstrap define a área de AREA_ADMINISTRADOR_INICIAL e audita como sistema', async () => {
    const eu = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    expect(eu).toMatchObject({ perfil: 'Administrador', area: 'Qualidade', areaId: await idDaArea('Qualidade') });
    const auditoria = (await amb.chamar(ADMIN, 'GET', `/pessoas/${eu.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
    expect(auditoria).toContainEqual(
      expect.objectContaining({ campo: 'area', antes: null, depois: 'Qualidade', autorId: 'sistema' }),
    );
  });

  it('área inexistente ou inativa: Administrador fica sem área (e o acesso continua liberado)', async () => {
    const outro = await criarAmbiente(entra, { areaAdministradorInicial: 'Área Que Não Existe' });
    try {
      const eu = (await outro.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
      expect(eu).toMatchObject({ perfil: 'Administrador', area: null, areaId: null });
      expect((await outro.chamar(ADMIN, 'GET', '/pessoas')).statusCode).toBe(200);
      const auditoria = (await outro.chamar(ADMIN, 'GET', `/pessoas/${eu.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
      expect(auditoria.map((r) => r.campo)).not.toContain('area');
    } finally {
      await outro.fechar();
    }
  });

  it('variável nula: bootstrap sem área', async () => {
    const outro = await criarAmbiente(entra, { areaAdministradorInicial: null });
    try {
      expect((await outro.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>().areaId).toBeNull();
    } finally {
      await outro.fechar();
    }
  });

  it('Administrador já existente sem área não é alterado no login', async () => {
    const eu = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    await amb.banco.query('UPDATE usuarios SET area_id = NULL WHERE id = $1', [eu.id]);
    const depois = (await amb.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
    expect(depois).toMatchObject({ perfil: 'Administrador', areaId: null });
    const auditoria = (await amb.chamar(ADMIN, 'GET', `/pessoas/${eu.id}/auditoria`)).json<RegistroAuditoriaPessoa[]>();
    expect(auditoria.filter((r) => r.campo === 'area')).toHaveLength(1); // só a do bootstrap
  });

  it('pré-cadastro com área que vira Administrador pelo bootstrap mantém a própria área', async () => {
    const outro = await criarAmbiente(entra);
    try {
      // Sem nenhum Administrador ainda: insere o pré-cadastro direto no banco, com área Custos.
      const { rows } = await outro.banco.query<{ id: string }>("SELECT id FROM areas WHERE nome = 'Custos'");
      await outro.banco.query(
        "INSERT INTO usuarios (id, nome, email, area_id) VALUES ('USR-pre-admin', 'Pré Admin', $1, $2)",
        [EMAIL_ADMIN_INICIAL, rows[0]!.id],
      );
      const eu = (await outro.chamar(ADMIN, 'GET', '/eu')).json<Pessoa>();
      expect(eu).toMatchObject({ perfil: 'Administrador', area: 'Custos' });
    } finally {
      await outro.fechar();
    }
  });
});

describe('lerAreaAdministradorInicial', () => {
  it('padrão Qualidade quando vazia ou placeholder; senão o nome aparado', () => {
    expect(lerAreaAdministradorInicial(undefined)).toBe('Qualidade');
    expect(lerAreaAdministradorInicial('  ')).toBe('Qualidade');
    expect(lerAreaAdministradorInicial('<nome-da-area>')).toBe('Qualidade');
    expect(lerAreaAdministradorInicial(' Engenharia ')).toBe('Engenharia');
  });
});
