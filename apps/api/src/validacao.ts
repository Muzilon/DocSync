import {
  ehDataSoDia,
  ehPerfil,
  validarJustificativa,
  validarNovoPrazo,
  type AlteracaoPessoa,
  type NovaPessoa,
  type NovaReprogramacao,
  type NovoDocumento,
  type Perfil,
} from '@docsync/compartilhado';

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

// ---------------------------------------------------------------------------
// Cadastro de documento (F2) — parte 'dados' de POST /documentos
// ---------------------------------------------------------------------------

const ID_DOCUMENTO = /^DOC-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIMITES_TEXTO = { codigo: 100, titulo: 300, remetente: 200, disciplina: 100, observacao: 2000 } as const;
const REVISAO_MAXIMA = 999;

const CAMPOS_NOVO_DOCUMENTO = [
  'id',
  'codigo',
  'titulo',
  'tipoDocumentoId',
  'revisao',
  'remetente',
  'areaId',
  'disciplina',
  'observacao',
] as const satisfies readonly (keyof NovoDocumento)[];

/** Data só-dia válida: a mesma regra da interface, em `@docsync/compartilhado`. */
export { ehDataSoDia };

/**
 * Texto opcional: ausente, null ou só espaços → null. Aparado.
 * Registra erro se não for texto ou passar do limite.
 */
function textoOpcional(
  corpo: Record<string, unknown>,
  campo: keyof typeof LIMITES_TEXTO,
  rotulo: string,
  campos: Record<string, string>,
): string | null {
  const valor = corpo[campo];
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    campos[campo] = `${rotulo} inválido.`;
    return null;
  }
  const limpo = valor.trim();
  if (limpo.length > LIMITES_TEXTO[campo]) campos[campo] = `${rotulo} pode ter até ${LIMITES_TEXTO[campo]} caracteres.`;
  return limpo === '' ? null : limpo;
}

function textoObrigatorio(
  corpo: Record<string, unknown>,
  campo: keyof typeof LIMITES_TEXTO,
  mensagemVazio: string,
  rotulo: string,
  campos: Record<string, string>,
): string {
  const valor = textoOpcional(corpo, campo, rotulo, campos);
  if (valor === null && !campos[campo]) campos[campo] = mensagemVazio;
  return valor ?? '';
}

/**
 * Valida a parte 'dados' do cadastro (documento 03, seção 6). Esquema fechado:
 * campo desconhecido é recusado, e `status` tem mensagem própria (P-03).
 * `dataRecebimento` e `dataRevisao` são do servidor (decisões 0011 e 0012):
 * enviá-las é "Campo não permitido.", como qualquer campo fora do esquema.
 */
export function validarNovoDocumento(corpo: unknown): Validado<NovoDocumento> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { dados: 'Envie os dados do documento.' } };
  const campos = camposDesconhecidos(corpo, CAMPOS_NOVO_DOCUMENTO);
  if ('status' in corpo) {
    campos.status = 'O status inicial é sempre Recebido e não pode ser escolhido no cadastro.';
  }

  const id = corpo.id;
  if (typeof id !== 'string' || !ID_DOCUMENTO.test(id)) {
    campos.id = 'Identificador inválido. Recarregue o formulário e tente de novo.';
  }

  const titulo = textoObrigatorio(corpo, 'titulo', 'Informe o título do documento.', 'O título', campos);
  const codigo = textoOpcional(corpo, 'codigo', 'O código', campos);
  const remetente = textoObrigatorio(corpo, 'remetente', 'Informe o remetente ou solicitante.', 'O remetente', campos);
  const disciplina = textoOpcional(corpo, 'disciplina', 'A disciplina', campos);
  const observacao = textoOpcional(corpo, 'observacao', 'A observação', campos);

  const tipoDocumentoId = corpo.tipoDocumentoId;
  if (typeof tipoDocumentoId !== 'string' || tipoDocumentoId.trim() === '') {
    campos.tipoDocumentoId = 'Selecione o tipo de documento.';
  }
  const areaId = corpo.areaId;
  if (typeof areaId !== 'string' || areaId.trim() === '') campos.areaId = 'Selecione a área.';

  const revisao = corpo.revisao ?? 0;
  if (typeof revisao !== 'number' || !Number.isInteger(revisao) || revisao < 0 || revisao > REVISAO_MAXIMA) {
    campos.revisao = `O número de revisão deve ser um inteiro de 0 a ${REVISAO_MAXIMA}.`;
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    dados: {
      id: id as string,
      codigo,
      titulo,
      tipoDocumentoId: tipoDocumentoId as string,
      revisao: revisao as number,
      remetente,
      areaId: areaId as string,
      disciplina,
      observacao,
    },
  };
}

// ---------------------------------------------------------------------------
// Reprogramação de prazo (F3) — corpo de POST /documentos/:id/reprogramacoes
// ---------------------------------------------------------------------------

const CAMPOS_REPROGRAMACAO = ['novoPrazo', 'justificativa', 'versao'] as const satisfies readonly (keyof NovaReprogramacao)[];

/**
 * Valida a reprogramação (contrato F3, 3.2) com as regras puras de
 * `@docsync/compartilhado`. Esquema fechado. Justificativa devolvida aparada.
 * @param prazoAtual prazo do documento (null = sem prazo: só a regra de hoje).
 * @param hoje 'AAAA-MM-DD' de `hojeNoFuso()`.
 */
export function validarNovaReprogramacao(corpo: unknown, prazoAtual: string | null, hoje: string): Validado<NovaReprogramacao> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie o novo prazo, a justificativa e a versão.' } };
  const campos = camposDesconhecidos(corpo, CAMPOS_REPROGRAMACAO);

  const erroPrazo = validarNovoPrazo(corpo.novoPrazo, prazoAtual, hoje);
  if (erroPrazo) campos.novoPrazo = erroPrazo;

  const erroJustificativa = validarJustificativa(corpo.justificativa);
  if (erroJustificativa) campos.justificativa = erroJustificativa;

  const versao = corpo.versao;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    campos.versao = 'Versão inválida. Recarregue o painel e tente de novo.';
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    dados: {
      novoPrazo: corpo.novoPrazo as string,
      justificativa: (corpo.justificativa as string).trim(),
      versao: versao as number,
    },
  };
}

// ---------------------------------------------------------------------------
// Painel (F3) — query de GET /painel
// ---------------------------------------------------------------------------

export interface FiltroPainelQuery {
  busca: string;
  areaId: string | null;
  cancelados: boolean;
}

const TAMANHO_MAXIMO_BUSCA = 200;
const CAMPOS_QUERY_PAINEL = ['busca', 'areaId', 'cancelados'] as const;

/** Esquema fechado também na query: parâmetro desconhecido ou repetido → erro por campo. */
export function validarQueryPainel(query: unknown): Validado<FiltroPainelQuery> {
  const corpo = ehObjeto(query) ? query : {};
  const campos = camposDesconhecidos(corpo, CAMPOS_QUERY_PAINEL);

  let busca = '';
  if (corpo.busca !== undefined) {
    if (typeof corpo.busca !== 'string') campos.busca = 'Busca inválida.';
    else if (corpo.busca.length > TAMANHO_MAXIMO_BUSCA) campos.busca = `A busca pode ter até ${TAMANHO_MAXIMO_BUSCA} caracteres.`;
    else busca = corpo.busca;
  }

  let areaId: string | null = null;
  if (corpo.areaId !== undefined && corpo.areaId !== '') {
    if (typeof corpo.areaId !== 'string') campos.areaId = 'Área inválida.';
    else areaId = corpo.areaId;
  }

  let cancelados = false;
  if (corpo.cancelados !== undefined) {
    if (corpo.cancelados === 'true') cancelados = true;
    else if (corpo.cancelados !== 'false') campos.cancelados = 'Use true ou false.';
  }

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, dados: { busca, areaId, cancelados } };
}
