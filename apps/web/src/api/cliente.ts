import { createContext, useContext } from 'react';
import type { AlteracaoPessoa, Area, NovaPessoa, Pessoa } from '@docsync/compartilhado';
import { ErroApi, codigoConhecido } from './erros.ts';

// Contrato das rotas vem do pacote compartilhado (fonte única com a API).
export type { AlteracaoPessoa, NovaPessoa };

/** Operações da API usadas pela interface. Os testes injetam uma versão simulada. */
export interface Api {
  eu(): Promise<Pessoa>;
  areas(): Promise<Area[]>;
  pessoas(): Promise<Pessoa[]>;
  criarPessoa(dados: NovaPessoa): Promise<Pessoa>;
  alterarPessoa(id: string, dados: AlteracaoPessoa): Promise<Pessoa>;
}

/** Cliente HTTP real: prefixo /api (o proxy do Vite o remove) e token Bearer em toda chamada. */
export function criarApi(obterToken: () => Promise<string>): Api {
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const token = await obterToken();
    let resposta: Response;
    try {
      resposta = await fetch(`/api${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
    } catch {
      throw new ErroApi(0, 'sem_conexao');
    }
    const dados: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // Proxy sem API atrás responde 5xx sem corpo: tratamos como falta de conexão.
      if (dados === null && resposta.status >= 500) throw new ErroApi(resposta.status, 'sem_conexao');
      const erro = (dados ?? {}) as { codigo?: unknown; campos?: unknown };
      const campos =
        erro.campos && typeof erro.campos === 'object' ? (erro.campos as Record<string, string>) : {};
      throw new ErroApi(resposta.status, codigoConhecido(erro.codigo), campos);
    }
    return dados as T;
  }

  return {
    eu: () => chamar<Pessoa>('GET', '/eu'),
    areas: () => chamar<Area[]>('GET', '/areas'),
    pessoas: () => chamar<Pessoa[]>('GET', '/pessoas'),
    criarPessoa: (dados) => chamar<Pessoa>('POST', '/pessoas', dados),
    alterarPessoa: (id, dados) => chamar<Pessoa>('PATCH', `/pessoas/${encodeURIComponent(id)}`, dados),
  };
}

export const ContextoApi = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ContextoApi);
  if (!api) throw new Error('useApi fora de ContextoApi.');
  return api;
}
