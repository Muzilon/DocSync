import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do monorepo (mesma profundidade a partir de src/ e de dist/). */
export const RAIZ_MONOREPO = fileURLToPath(new URL('../../../', import.meta.url));

export interface ConfiguracaoAutenticacao {
  tenantId: string;
  clientId: string;
  /** E-mails (minúsculos) que viram Administrador enquanto não houver nenhum ativo. */
  administradoresIniciais: string[];
  /**
   * Nome da área que o primeiro Administrador recebe no bootstrap (decisão 0010).
   * null = bootstrap sem área.
   */
  areaAdministradorInicial: string | null;
}

export interface Configuracao {
  porta: number;
  /** Caminho absoluto da pasta do PGlite. */
  bancoPasta: string;
  /** Caminho absoluto da pasta dos arquivos dos documentos (decisão 0003). */
  armazenamentoPasta: string;
  autenticacao: ConfiguracaoAutenticacao;
}

export function lerListaEmails(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '' && !e.startsWith('<'));
}

/** Caminho vindo do ambiente: absoluto como está; relativo, a partir da raiz do monorepo. */
function caminhoDaRaiz(valor: string | undefined, padrao: string): string {
  const pasta = valor?.trim() || padrao;
  return isAbsolute(pasta) ? pasta : resolve(RAIZ_MONOREPO, pasta);
}

/** AREA_ADMINISTRADOR_INICIAL: nome da área; vazio ou placeholder → padrão "Qualidade" (decisão 0010). */
export function lerAreaAdministradorInicial(valor: string | undefined): string {
  const nome = valor?.trim() ?? '';
  return nome === '' || nome.startsWith('<') ? 'Qualidade' : nome;
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
  return {
    porta: Number(env.API_PORTA ?? 3001),
    bancoPasta: caminhoDaRaiz(env.BANCO_PASTA, './dados-locais/banco'),
    armazenamentoPasta: caminhoDaRaiz(env.ARMAZENAMENTO_PASTA, './armazenamento-local'),
    autenticacao: {
      tenantId: obrigatoria(env, 'ENTRA_TENANT_ID'),
      clientId: obrigatoria(env, 'ENTRA_CLIENT_ID'),
      administradoresIniciais: lerListaEmails(env.ADMINISTRADORES_INICIAIS),
      areaAdministradorInicial: lerAreaAdministradorInicial(env.AREA_ADMINISTRADOR_INICIAL),
    },
  };
}
