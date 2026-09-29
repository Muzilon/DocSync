import { createContext, useContext } from 'react';
import type { AlteracaoPessoa, Area, DetalheDocumento, Documento, NovaPessoa, NovoDocumento, Pessoa, TipoDocumento } from '@docsync/compartilhado';
import { ErroApi, codigoConhecido } from './erros.ts';

// Contrato das rotas vem do pacote compartilhado (fonte única com a API).
export type { AlteracaoPessoa, NovaPessoa, NovoDocumento };

/** Operações da API usadas pela interface. Os testes injetam uma versão simulada. */
export interface Api {
  eu(): Promise<Pessoa>;
  areas(): Promise<Area[]>;
  pessoas(): Promise<Pessoa[]>;
  criarPessoa(dados: NovaPessoa): Promise<Pessoa>;
  alterarPessoa(id: string, dados: AlteracaoPessoa): Promise<Pessoa>;
  tiposDocumento(): Promise<TipoDocumento[]>;
  /** Multipart. Reenviar com o mesmo `dados.id` é idempotente (200 = já gravado, tratado como sucesso). */
  criarDocumento(dados: NovoDocumento, arquivoPrincipal: File, anexos: File[]): Promise<Documento>;
  documentosRecentes(): Promise<Documento[]>;
  /** GET /documentos/:id (404 se não existe ou a pessoa não pode ver). */
  documento(id: string): Promise<DetalheDocumento>;
}

/** Cliente HTTP real: prefixo /api (o proxy do Vite o remove) e token Bearer em toda chamada. */
export function criarApi(obterToken: () => Promise<string>): Api {
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const token = await obterToken();
    // FormData (multipart): o navegador define o Content-Type com o boundary.
    const multipart = corpo instanceof FormData;
    let resposta: Response;
    try {
      resposta = await fetch(`/api${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(corpo === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(corpo === undefined ? {} : { body: multipart ? corpo : JSON.stringify(corpo) }),
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
    tiposDocumento: () => chamar<TipoDocumento[]>('GET', '/tipos-documento'),
    criarDocumento: (dados, arquivoPrincipal, anexos) => {
      const formulario = new FormData();
      formulario.append('dados', JSON.stringify(dados));
      formulario.append('arquivoPrincipal', arquivoPrincipal, arquivoPrincipal.name);
      for (const anexo of anexos) formulario.append('anexos', anexo, anexo.name);
      return chamar<Documento>('POST', '/documentos', formulario);
    },
    documentosRecentes: () => chamar<Documento[]>('GET', '/documentos/recentes'),
    documento: (id) => chamar<DetalheDocumento>('GET', `/documentos/${encodeURIComponent(id)}`),
  };
}

export const ContextoApi = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ContextoApi);
  if (!api) throw new Error('useApi fora de ContextoApi.');
  return api;
}
