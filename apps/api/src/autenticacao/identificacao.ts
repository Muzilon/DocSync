import type { Banco } from '../banco/conexao.ts';
import {
  AUTOR_SISTEMA,
  atualizarUsuario,
  buscarAreaAtivaPorNome,
  buscarPorEmail,
  bloquearDecisaoAdministradores,
  buscarPorIdEntra,
  contarAdministradoresAtivos,
  inserirUsuario,
  registrarAuditoria,
  type Usuario,
} from '../banco/pessoas.ts';
import type { Identidade } from './token.ts';

export type ResultadoIdentificacao =
  /** `aviso`: algo a registrar no log (ex.: área do bootstrap não encontrada). */
  | { tipo: 'ok'; usuario: Usuario; aviso?: string }
  /** O e-mail já está vinculado a outro objeto do Entra: não associa em silêncio. */
  | { tipo: 'conflito' }
  /** Primeiro login sem nenhum e-mail no token: impossível cadastrar. */
  | { tipo: 'sem_email' };

/**
 * Localiza a pessoa do token (decisão 0007), a cada requisição:
 * 1. pelo ID do objeto no Entra (oid), vínculo definitivo;
 * 2. senão, pelo e-mail, num pré-cadastro ainda sem vínculo (grava o oid);
 * 3. senão, cria o registro sem perfil ("acesso ainda não liberado").
 * Depois, bootstrap: se não houver Administrador ativo e o e-mail estiver em
 * ADMINISTRADORES_INICIAIS, a pessoa vira Administrador (auditado como 'sistema').
 */
export async function identificarPessoa(
  banco: Banco,
  identidade: Identidade,
  administradoresIniciais: readonly string[],
  /** Nome da área do primeiro Administrador (decisão 0010); null = sem área. */
  areaAdministradorInicial: string | null = null,
): Promise<ResultadoIdentificacao> {
  return banco.transaction(async (tx) => {
    let usuario = await buscarPorIdEntra(tx, identidade.oid);

    if (!usuario) {
      if (!identidade.email) return { tipo: 'sem_email' } as const;
      const existente = await buscarPorEmail(tx, identidade.email);
      if (existente && existente.idEntra !== null) return { tipo: 'conflito' } as const;
      if (existente) {
        usuario = await atualizarUsuario(tx, existente.id, { id_entra: identidade.oid });
        await registrarAuditoria(tx, {
          idUsuario: usuario.id,
          autorId: AUTOR_SISTEMA,
          campo: 'vinculoEntra',
          antes: null,
          depois: 'primeiro login associado ao pré-cadastro pelo e-mail',
        });
      } else {
        usuario = await inserirUsuario(tx, {
          idEntra: identidade.oid,
          nome: identidade.nome ?? identidade.email,
          email: identidade.email,
          perfil: null,
          areaId: null,
        });
        await registrarAuditoria(tx, {
          idUsuario: usuario.id,
          autorId: AUTOR_SISTEMA,
          campo: 'cadastro',
          antes: null,
          depois: 'criado no primeiro login, sem perfil',
        });
      }
    }

    let aviso: string | undefined;
    const candidatoBootstrap =
      usuario.status === 'Ativo' &&
      usuario.perfil !== 'Administrador' &&
      administradoresIniciais.includes(usuario.email);
    if (candidatoBootstrap) {
      // Bloqueia antes de contar: dois bootstraps simultâneos não criam dois admins.
      await bloquearDecisaoAdministradores(tx);
    }
    if (candidatoBootstrap && (await contarAdministradoresAtivos(tx)) === 0) {
      const antes = usuario.perfil;
      usuario = await atualizarUsuario(tx, usuario.id, { perfil: 'Administrador' });
      await registrarAuditoria(tx, {
        idUsuario: usuario.id,
        autorId: AUTOR_SISTEMA,
        campo: 'perfil',
        antes,
        depois: 'Administrador',
      });

      // Decisão 0010: o primeiro Administrador nasce com área. Só aqui, no bootstrap:
      // Administrador que já existe sem área não é alterado em silêncio no login.
      // Pré-cadastro que já tinha área mantém a sua.
      if (usuario.areaId === null && areaAdministradorInicial !== null) {
        const area = await buscarAreaAtivaPorNome(tx, areaAdministradorInicial);
        if (!area) {
          aviso = `AREA_ADMINISTRADOR_INICIAL "${areaAdministradorInicial}" não existe ou está inativa; primeiro Administrador ficou sem área.`;
        } else {
          usuario = await atualizarUsuario(tx, usuario.id, { area_id: area.id });
          await registrarAuditoria(tx, {
            idUsuario: usuario.id,
            autorId: AUTOR_SISTEMA,
            campo: 'area',
            antes: null,
            depois: area.nome,
          });
        }
      }
    }

    return aviso === undefined ? ({ tipo: 'ok', usuario } as const) : ({ tipo: 'ok', usuario, aviso } as const);
  });
}
