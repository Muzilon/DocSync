import { ehPerfil, type AlteracaoPessoa, type NovaPessoa, type Perfil } from '@docsync/compartilhado';

/** Resultado de validação: dados limpos ou mensagens pt-BR por campo. */
export type Validado<T> = { ok: true; dados: T } | { ok: false; campos: Record<string, string> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAMANHO_MAXIMO_NOME = 200;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Esquema fechado: todo campo fora de `permitidos` gera erro. */
function camposDesconhecidos(corpo: Record<string, unknown>, permitidos: readonly string[]) {
  const campos: Record<string, string> = {};
  for (const chave of Object.keys(corpo)) {
    if (!permitidos.includes(chave)) campos[chave] = 'Campo não permitido.';
  }
  return campos;
}

function validarPerfil(valor: unknown, campos: Record<string, string>) {
  if (valor !== null && !ehPerfil(valor)) {
    campos.perfil = 'Perfil inválido. Use Administrador, Qualidade, Solicitante ou Leitor.';
  }
}

function validarAreaId(valor: unknown, campos: Record<string, string>) {
  if (valor !== null && (typeof valor !== 'string' || valor.trim() === '')) {
    campos.areaId = 'Área inválida.';
  }
}

export function validarNovaPessoa(corpo: unknown): Validado<Required<NovaPessoa>> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie os dados da pessoa.' } };
  const campos = camposDesconhecidos(corpo, ['email', 'nome', 'perfil', 'areaId']);

  const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) campos.email = 'Informe um e-mail válido.';

  const nome = typeof corpo.nome === 'string' ? corpo.nome.trim() : '';
  if (nome === '') campos.nome = 'Informe o nome.';
  else if (nome.length > TAMANHO_MAXIMO_NOME) campos.nome = `O nome pode ter até ${TAMANHO_MAXIMO_NOME} caracteres.`;

  const perfil = corpo.perfil ?? null;
  validarPerfil(perfil, campos);
  const areaId = corpo.areaId ?? null;
  validarAreaId(areaId, campos);

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    dados: { email, nome, perfil: perfil as Perfil | null, areaId: areaId as string | null },
  };
}

export function validarAlteracaoPessoa(corpo: unknown): Validado<AlteracaoPessoa> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie ao menos um campo para alterar.' } };
  const campos = camposDesconhecidos(corpo, ['perfil', 'areaId', 'status']);
  const dados: AlteracaoPessoa = {};

  if ('perfil' in corpo) {
    validarPerfil(corpo.perfil, campos);
    if (!campos.perfil) dados.perfil = corpo.perfil as Perfil | null;
  }
  if ('areaId' in corpo) {
    validarAreaId(corpo.areaId, campos);
    if (!campos.areaId) dados.areaId = corpo.areaId as string | null;
  }
  if ('status' in corpo) {
    if (corpo.status === 'Ativo' || corpo.status === 'Inativo') dados.status = corpo.status;
    else campos.status = 'Situação inválida. Use Ativo ou Inativo.';
  }
  if (Object.keys(campos).length === 0 && Object.keys(dados).length === 0) {
    campos.corpo = 'Envie ao menos um campo para alterar.';
  }
  return Object.keys(campos).length > 0 ? { ok: false, campos } : { ok: true, dados };
}
