import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do monorepo (mesma profundidade a partir de src/ e de dist/). */
export const RAIZ_MONOREPO = fileURLToPath(new URL('../../../', import.meta.url));

export interface ConfiguracaoAutenticacao {
  tenantId: string;
  clientId: string;
  /** E-mails (minúsculos) que viram Administrador enquanto não houver nenhum ativo. */
  administradoresIniciais: string[];
}

export interface Configuracao {
  porta: number;
  /** Caminho absoluto da pasta do PGlite. */
  bancoPasta: string;
  autenticacao: ConfiguracaoAutenticacao;
}

export function lerListaEmails(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '' && !e.startsWith('<'));
}

function obrigatoria(env: NodeJS.ProcessEnv, nome: string): string {
  const valor = env[nome]?.trim();
  if (!valor || valor.startsWith('<')) {
    throw new Error(`Variável de ambiente ${nome} não configurada. Copie .env.example para .env e preencha.`);
  }
  return valor;
}

/** Lê a configuração do ambiente (.env da raiz, carregado pelo script dev). */
export function lerConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const pasta = env.BANCO_PASTA?.trim() || './dados-locais/banco';
  return {
    porta: Number(env.API_PORTA ?? 3001),
    bancoPasta: isAbsolute(pasta) ? pasta : resolve(RAIZ_MONOREPO, pasta),
    autenticacao: {
      tenantId: obrigatoria(env, 'ENTRA_TENANT_ID'),
      clientId: obrigatoria(env, 'ENTRA_CLIENT_ID'),
      administradoresIniciais: lerListaEmails(env.ADMINISTRADORES_INICIAIS),
    },
  };
}
