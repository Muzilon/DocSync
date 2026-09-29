/**
 * Destino pós-login: só rotas internas do próprio DocSync.
 * Evita redirecionamento aberto (ex.: "//site-externo.com", "https://...", "/\\site").
 */
export const ROTA_LOGIN = '/login';
export const DESTINO_PADRAO = '/';

export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 2048) return DESTINO_PADRAO;
  if (!valor.startsWith('/') || valor.startsWith('//')) return DESTINO_PADRAO;
  // Barra invertida e caracteres de controle podem ser normalizados pelo navegador em "//".
  if (/[\\\u0000-\u001f\u007f]/.test(valor)) return DESTINO_PADRAO;
  // Voltar para a própria tela de login criaria um laço.
  const caminho = valor.split(/[?#]/)[0] ?? '';
  if (caminho === ROTA_LOGIN || caminho.startsWith(`${ROTA_LOGIN}/`)) return DESTINO_PADRAO;
  return valor;
}

export type AvisoLogin = 'sessao_expirada' | 'saiu';

/** Monta a URL da tela de login guardando o destino pedido (já validado) e um aviso opcional. */
export function urlDeLogin(destino: string, aviso?: AvisoLogin): string {
  const parametros = new URLSearchParams();
  const seguro = destinoSeguro(destino);
  if (seguro !== DESTINO_PADRAO) parametros.set('destino', seguro);
  if (aviso) parametros.set('aviso', aviso);
  const consulta = parametros.toString();
  return consulta ? `${ROTA_LOGIN}?${consulta}` : ROTA_LOGIN;
}
