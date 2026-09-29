import { createContext, useContext } from 'react';
import type {
  AlteracaoPessoa,
  Area,
  DetalheDocumento,
  Documento,
  NovaPessoa,
  NovaReprogramacao,
  NovoDocumento,
  Pessoa,
  RespostaPainel,
  ResultadoReprogramacao,
  TipoDocumento,
} from '@docsync/compartilhado';
import { ErroApi, codigoConhecido } from './erros.ts';

// Contrato das rotas vem do pacote compartilhado (fonte única com a API).
export type { AlteracaoPessoa, NovaPessoa, NovaReprogramacao, NovoDocumento };

/** Parâmetros de GET /painel (contrato F3, seção 4.1). Só os informados vão na query. */
export interface ConsultaPainel {
  busca?: string;
  areaId?: string | null;
  cancelados?: boolean;
}

/** Monta a query de /painel sem parâmetros vazios (a API recusa parâmetro desconhecido). */
export function queryPainel(consulta: ConsultaPainel = {}): string {
  const parametros = new URLSearchParams();
  const busca = consulta.busca?.trim();
  if (busca) parametros.set('busca', busca);
  if (consulta.areaId) parametros.set('areaId', consulta.areaId);
  if (consulta.cancelados) parametros.set('cancelados', 'true');
  const texto = parametros.toString();
  return texto ? `?${texto}` : '';
}

/**
 * Nome do arquivo em `Content-Disposition` (contrato F4, 4.4): `filename*` (UTF-8, decodificado),
 * senão `filename`, senão o nome informado pela tela. Barras e caracteres de controle nunca passam.
 */
export function nomeDoCabecalho(cabecalho: string | null, reserva: string): string {
  let nome: string | null = null;
  if (cabecalho) {
    const estendido = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cabecalho);
    if (estendido?.[1]) {
      try {
        nome = decodeURIComponent(estendido[1].trim());
      } catch {
        nome = null;
      }
    }
    if (!nome) {
      const simples = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(cabecalho);
      nome = (simples?.[1] ?? simples?.[2] ?? '').trim() || null;
    }
  }
  const limpo = (nome ?? reserva).replace(/[\\/\u0000-\u001f]/g, '_').trim();
  return limpo || reserva;
}

/** Conteúdo binário de um arquivo do documento (download ou visualização). */
export interface ArquivoBaixado {
  blob: Blob;
  /** Nome devolvido pelo servidor (Content-Disposition), já com o prefixo que ele decidir. */
  nomeArquivo: string;
}

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
  /** GET /painel: cartões visíveis, contagem de cancelados e o "hoje" do servidor. */
  painel(consulta?: ConsultaPainel): Promise<RespostaPainel>;
  /** POST /documentos/:id/reprogramacoes (JSON). 409 conflito_versao traz o documento atual no erro. */
  reprogramarPrazo(id: string, dados: NovaReprogramacao): Promise<ResultadoReprogramacao>;
  /**
   * GET /documentos/:id/arquivos/:arquivoId (contrato F4, 4.4): fetch com Bearer, nunca token na URL.
   * PDF já vem com a marca "CÓPIA NÃO CONTROLADA" (decisão 0013). `nomeOriginal` é só a reserva do nome.
   */
  baixarArquivo(id: string, arquivoId: string, nomeOriginal: string): Promise<ArquivoBaixado>;
  /** GET /documentos/:id/arquivos/:arquivoId/visualizacao (decisão 0013): PDF com marca, para o visualizador. */
  visualizarArquivo(id: string, arquivoId: string): Promise<ArrayBuffer>;
}

/** Cliente HTTP real: prefixo /api (o proxy do Vite o remove) e token Bearer em toda chamada. */
export function criarApi(obterToken: () => Promise<string>): Api {
  /** Erro da API a partir da resposta (JSON `{ codigo, campos?, documento? }`). */
  function erroDaResposta(resposta: Response, dados: unknown): ErroApi {
    // Proxy sem API atrás responde 5xx sem corpo: tratamos como falta de conexão.
    if (dados === null && resposta.status >= 500) return new ErroApi(resposta.status, 'sem_conexao');
    const erro = (dados ?? {}) as { codigo?: unknown; campos?: unknown; documento?: unknown };
    const campos = erro.campos && typeof erro.campos === 'object' ? (erro.campos as Record<string, string>) : {};
    const documento = erro.documento && typeof erro.documento === 'object' ? (erro.documento as Documento) : null;
    return new ErroApi(resposta.status, codigoConhecido(erro.codigo), campos, documento);
  }

  /** Caminho binário, separado de `chamar()` (que sempre lê JSON). Erro continua vindo em JSON. */
  async function binario(caminho: string): Promise<Response> {
    const token = await obterToken();
    let resposta: Response;
    try {
      resposta = await fetch(`/api${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new ErroApi(0, 'sem_conexao');
    }
    if (!resposta.ok) {
      const dados: unknown = await resposta.json().catch(() => null);
      throw erroDaResposta(resposta, dados);
    }
    return resposta;
  }

  function caminhoArquivo(id: string, arquivoId: string): string {
    return `/documentos/${encodeURIComponent(id)}/arquivos/${encodeURIComponent(arquivoId)}`;
  }

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
    if (!resposta.ok) throw erroDaResposta(resposta, dados);
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
    painel: (consulta) => chamar<RespostaPainel>('GET', `/painel${queryPainel(consulta)}`),
    reprogramarPrazo: (id, dados) =>
      chamar<ResultadoReprogramacao>('POST', `/documentos/${encodeURIComponent(id)}/reprogramacoes`, dados),
    baixarArquivo: async (id, arquivoId, nomeOriginal) => {
      const resposta = await binario(caminhoArquivo(id, arquivoId));
      const blob = await resposta.blob();
      return { blob, nomeArquivo: nomeDoCabecalho(resposta.headers.get('Content-Disposition'), nomeOriginal) };
    },
    visualizarArquivo: async (id, arquivoId) => {
      const resposta = await binario(`${caminhoArquivo(id, arquivoId)}/visualizacao`);
      return resposta.arrayBuffer();
    },
  };
}

export const ContextoApi = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ContextoApi);
  if (!api) throw new Error('useApi fora de ContextoApi.');
  return api;
}
