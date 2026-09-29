import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus, type AccountInfo } from '@azure/msal-browser';
import type { Pessoa } from '@docsync/compartilhado';
import { ContextoApi, criarApi, type Api } from '../api/cliente.ts';
import { ErroApi, mensagemDeErro } from '../api/erros.ts';
import { Carregando, ErroCarregamento } from '../componentes/Estados.tsx';
import { TelaAviso } from '../telas/TelaAviso.tsx';
import { ESCOPOS_API } from './msal.ts';
import { urlDeLogin } from './redirecionamento.ts';

export interface Sessao {
  eu: Pessoa;
  sair: () => void;
}

export const ContextoSessao = createContext<Sessao | null>(null);

export function useSessao(): Sessao {
  const sessao = useContext(ContextoSessao);
  if (!sessao) throw new Error('useSessao fora da rota protegida.');
  return sessao;
}

/** Sem conta Microsoft em sessão: vai para o login guardando a rota pedida. */
export function RotaProtegida() {
  const { instance, accounts, inProgress } = useMsal();
  const local = useLocation();
  const conta = instance.getActiveAccount() ?? accounts[0] ?? null;

  if (!conta && inProgress !== InteractionStatus.None) {
    return <Carregando telaInteira texto="Verificando sua sessão…" />;
  }
  if (!conta) return <Navigate to={urlDeLogin(`${local.pathname}${local.search}`)} replace />;
  return <ProvedorSessao conta={conta} />;
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'inativo' }
  | { tipo: 'naoLiberado'; eu: Pessoa }
  | { tipo: 'ok'; eu: Pessoa };

const CODIGOS_SESSAO = new Set(['nao_autenticado', 'sessao_expirada']);

function ProvedorSessao({ conta }: { conta: AccountInfo }) {
  const { instance } = useMsal();
  const navegar = useNavigate();
  const local = useLocation();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  const sair = useCallback(() => {
    void instance.logoutRedirect({ account: conta });
  }, [instance, conta]);

  // Token expirado e sem renovação silenciosa: limpa a sessão local e volta ao login com aviso.
  const expirar = useCallback(async () => {
    await instance.clearCache({ account: conta }).catch(() => undefined);
    instance.setActiveAccount(null);
    navegar(urlDeLogin(`${local.pathname}${local.search}`, 'sessao_expirada'), { replace: true });
  }, [instance, conta, navegar, local.pathname, local.search]);

  const api = useMemo<Api>(() => {
    const base = criarApi(async () => {
      try {
        const resultado = await instance.acquireTokenSilent({ scopes: ESCOPOS_API, account: conta });
        return resultado.accessToken;
      } catch {
        throw new ErroApi(401, 'sessao_expirada');
      }
    });
    // Qualquer chamada que descubra sessão expirada leva ao login.
    const vigiar =
      <A extends unknown[], R>(funcao: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        try {
          return await funcao(...args);
        } catch (erro) {
          if (erro instanceof ErroApi && CODIGOS_SESSAO.has(erro.codigo)) void expirar();
          throw erro;
        }
      };
    return {
      eu: vigiar(base.eu),
      areas: vigiar(base.areas),
      pessoas: vigiar(base.pessoas),
      criarPessoa: vigiar(base.criarPessoa),
      alterarPessoa: vigiar(base.alterarPessoa),
      tiposDocumento: vigiar(base.tiposDocumento),
      criarDocumento: vigiar(base.criarDocumento),
      documentosRecentes: vigiar(base.documentosRecentes),
      documento: vigiar(base.documento),
      painel: vigiar(base.painel),
      reprogramarPrazo: vigiar(base.reprogramarPrazo),
    };
  }, [instance, conta, expirar]);

  useEffect(() => {
    let ativo = true;
    setEstado({ tipo: 'carregando' });
    api
      .eu()
      .then((eu) => {
        if (!ativo) return;
        if (eu.status === 'Inativo') setEstado({ tipo: 'inativo' });
        else if (eu.perfil === null) setEstado({ tipo: 'naoLiberado', eu });
        else setEstado({ tipo: 'ok', eu });
      })
      .catch((erro: unknown) => {
        if (!ativo) return;
        if (erro instanceof ErroApi && erro.codigo === 'inativo') setEstado({ tipo: 'inativo' });
        else if (!(erro instanceof ErroApi && CODIGOS_SESSAO.has(erro.codigo)))
          setEstado({ tipo: 'erro', mensagem: mensagemDeErro(erro) });
      });
    return () => {
      ativo = false;
    };
    // `tentativa` força nova busca em "Tentar novamente".
  }, [api, tentativa]);

  switch (estado.tipo) {
    case 'carregando':
      return <Carregando telaInteira texto="Carregando seus dados…" />;
    case 'erro':
      return <ErroCarregamento telaInteira mensagem={estado.mensagem} aoTentarNovamente={() => setTentativa((n) => n + 1)} />;
    case 'inativo':
      return (
        <TelaAviso titulo="Acesso inativo" aoSair={sair}>
          Seu acesso ao DocSync está inativo. Fale com o administrador do DocSync.
        </TelaAviso>
      );
    case 'naoLiberado':
      return (
        <TelaAviso titulo="Acesso ainda não liberado" aoSair={sair}>
          Acesso ainda não liberado. Peça ao administrador do DocSync.
        </TelaAviso>
      );
    case 'ok':
      return (
        <ContextoApi.Provider value={api}>
          <ContextoSessao.Provider value={{ eu: estado.eu, sair }}>
            <Outlet />
          </ContextoSessao.Provider>
        </ContextoApi.Provider>
      );
  }
}
