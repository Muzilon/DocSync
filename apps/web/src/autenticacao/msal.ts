import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

/**
 * Configuração do login Microsoft (Entra ID). Os IDs vêm do .env da raiz (VITE_*),
 * são identificadores públicos, não segredos (CLAUDE.md, seção 4; decisão 0008).
 */
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? '';
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? '';
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI || window.location.origin;

/** Falso quando o .env não tem os IDs: a tela de login avisa em vez de quebrar. */
export const loginConfigurado = tenantId.length > 0 && clientId.length > 0;

export const ESCOPOS_API = [`api://${clientId}/acesso_usuario`];

const configuracao: Configuration = {
  auth: {
    clientId: clientId || '00000000-0000-0000-0000-000000000000',
    authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
    redirectUri,
    postLogoutRedirectUri: `${redirectUri.replace(/\/$/, '')}/login?aviso=saiu`,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const msal = new PublicClientApplication(configuracao);
