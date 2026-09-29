import type { ErroApi } from '@docsync/compartilhado';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../banco/conexao.ts';
import {
  atualizarUsuario,
  buscarAreaAtiva,
  buscarPorEmail,
  bloquearDecisaoAdministradores,
  buscarPorId,
  contarAdministradoresAtivos,
  inserirUsuario,
  listarAreasAtivas,
  listarAuditoria,
  listarResponsaveis,
  listarUsuarios,
  paraPessoa,
  registrarAuditoria,
  type CamposUsuario,
} from '../banco/pessoas.ts';
import { enviarErro, exigir } from '../autenticacao/plugin.ts';
import { validarAlteracaoPessoa, validarNovaPessoa, validarQueryVazia } from '../validacao.ts';

/** Violação de unicidade no PostgreSQL. */
const VIOLACAO_UNICA = '23505';

/** Recusa de regra de negócio dentro de uma transação (desfaz a transação). */
class ErroNegocio extends Error {
  constructor(
    readonly status: number,
    readonly corpo: ErroApi,
  ) {
    super(corpo.codigo);
  }
}

const AREA_INVALIDA = new ErroNegocio(400, {
  codigo: 'dados_invalidos',
  campos: { areaId: 'Área não encontrada ou inativa.' },
});

/** Rotas protegidas da F1: /eu, /areas e /pessoas. Registradas num escopo autenticado. */
export function registrarRotasPessoas(escopo: FastifyInstance, banco: Banco) {
  // Sempre 200, mesmo sem perfil: a interface decide mostrar "acesso ainda não liberado".
  escopo.get('/eu', async (requisicao) => paraPessoa(requisicao.usuario));

  escopo.get('/areas', async () => listarAreasAtivas(banco));

  const soAdministrador = { preHandler: exigir('gerenciarPessoas') };

  escopo.get('/pessoas', soAdministrador, async () => (await listarUsuarios(banco)).map(paraPessoa));

  escopo.post('/pessoas', soAdministrador, async (requisicao, resposta) => {
    const validacao = validarNovaPessoa(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const dados = validacao.dados;
    const autorId = requisicao.usuario.id;

    try {
      const criado = await banco.transaction(async (tx) => {
        if (await buscarPorEmail(tx, dados.email)) throw new ErroNegocio(409, { codigo: 'email_existente' });
        const area = dados.areaId === null ? null : await buscarAreaAtiva(tx, dados.areaId);
        if (dados.areaId !== null && !area) throw AREA_INVALIDA;

        const usuario = await inserirUsuario(tx, { ...dados, idEntra: null });
        const auditar = (campo: string, depois: string | null) =>
          registrarAuditoria(tx, { idUsuario: usuario.id, autorId, campo, antes: null, depois });
        await auditar('cadastro', `pré-cadastro de ${usuario.email}`);
        if (usuario.perfil) await auditar('perfil', usuario.perfil);
        if (area) await auditar('area', area.nome);
        return usuario;
      });
      return resposta.code(201).send(paraPessoa(criado));
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      if ((erro as { code?: string }).code === VIOLACAO_UNICA) {
        return enviarErro(resposta, 409, { codigo: 'email_existente' });
      }
      throw erro;
    }
  });

  escopo.patch<{ Params: { id: string } }>('/pessoas/:id', soAdministrador, async (requisicao, resposta) => {
    const validacao = validarAlteracaoPessoa(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;
    const autorId = requisicao.usuario.id;

    try {
      const alterado = await banco.transaction(async (tx) => {
        // Perfil e situação decidem quem é Administrador ativo: bloqueia ANTES de ler a
        // pessoa e contar, para que duas alterações simultâneas não rebaixem, cada uma,
        // um dos dois últimos Administradores (a segunda espera e lê o estado novo).
        if (pedido.perfil !== undefined || pedido.status !== undefined) {
          await bloquearDecisaoAdministradores(tx);
        }
        const atual = await buscarPorId(tx, requisicao.params.id);
        if (!atual) throw new ErroNegocio(404, { codigo: 'nao_encontrado' });

        const campos: CamposUsuario = {};
        const auditoria: { campo: string; antes: string | null; depois: string | null }[] = [];

        if (pedido.perfil !== undefined && pedido.perfil !== atual.perfil) {
          campos.perfil = pedido.perfil;
          auditoria.push({ campo: 'perfil', antes: atual.perfil, depois: pedido.perfil });
        }
        if (pedido.areaId !== undefined && pedido.areaId !== atual.areaId) {
          const area = pedido.areaId === null ? null : await buscarAreaAtiva(tx, pedido.areaId);
          if (pedido.areaId !== null && !area) throw AREA_INVALIDA;
          campos.area_id = pedido.areaId;
          auditoria.push({ campo: 'area', antes: atual.area, depois: area?.nome ?? null });
        }
        if (pedido.status !== undefined && pedido.status !== atual.status) {
          campos.status = pedido.status;
          auditoria.push({ campo: 'status', antes: atual.status, depois: pedido.status });
        }

        // O último Administrador ativo não pode ser rebaixado nem inativado.
        const perfilFinal = campos.perfil === undefined ? atual.perfil : campos.perfil;
        const statusFinal = campos.status ?? atual.status;
        const eraAdminAtivo = atual.perfil === 'Administrador' && atual.status === 'Ativo';
        const continuaAdminAtivo = perfilFinal === 'Administrador' && statusFinal === 'Ativo';
        if (eraAdminAtivo && !continuaAdminAtivo && (await contarAdministradoresAtivos(tx, atual.id)) === 0) {
          throw new ErroNegocio(409, {
            codigo: 'ultimo_administrador',
            mensagem: 'O DocSync precisa de ao menos um Administrador ativo.',
          });
        }

        const usuario = await atualizarUsuario(tx, atual.id, campos);
        for (const registro of auditoria) {
          await registrarAuditoria(tx, { idUsuario: atual.id, autorId, ...registro });
        }
        return usuario;
      });
      return paraPessoa(alterado);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      throw erro;
    }
  });

  // F5 (contrato 3.5): pessoas elegíveis a responsável pela etapa, sem e-mail (LGPD).
  // Quem pode: quem muda status (Administrador, Qualidade, Solicitante); Leitor → 403.
  // Sem HEAD automático (padrão das rotas de leitura desde a F4) e query fechada.
  escopo.get('/responsaveis', { exposeHeadRoute: false, preHandler: exigir('mudarStatus') }, async (requisicao, resposta) => {
    const query = validarQueryVazia(requisicao.query);
    if (!query.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: query.campos });
    return listarResponsaveis(banco);
  });

  escopo.get<{ Params: { id: string } }>('/pessoas/:id/auditoria', soAdministrador, async (requisicao, resposta) => {
    if (!(await buscarPorId(banco, requisicao.params.id))) {
      return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    }
    return listarAuditoria(banco, requisicao.params.id);
  });
}
