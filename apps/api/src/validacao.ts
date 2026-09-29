import {
  CAMPOS_EDITAVEIS,
  ehDataSoDia,
  ehPerfil,
  ehStatusDocumento,
  exigeResponsavel,
  normalizarObservacao,
  validarJustificativa,
  validarMotivoCancelamento,
  validarNovoPrazo,
  validarDadosDocumento,
  validarObservacao,
  type AlteracaoPessoa,
  type EdicaoDocumento,
  type NovaPessoa,
  type NovaReativacao,
  type NovaReprogramacao,
  type NovaTransicao,
  type NovoCancelamento,
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

const CAMPOS_NOVO_DOCUMENTO = ['id', ...CAMPOS_EDITAVEIS] as const satisfies readonly (keyof NovoDocumento)[];

/** Data só-dia válida: a mesma regra da interface, em `@docsync/compartilhado`. */
export { ehDataSoDia };

/**
 * Valida a parte 'dados' do cadastro (documento 03, seção 6). Esquema fechado:
 * campo desconhecido é recusado, e `status` tem mensagem própria (P-03).
 * `dataRecebimento` e `dataRevisao` são do servidor (decisões 0011 e 0012):
 * enviá-las é "Campo não permitido.", como qualquer campo fora do esquema.
 * Os 8 campos cadastrais passam por `validarDadosDocumento` (compartilhado), a
 * mesma função da edição e da interface (contrato F6, 2.2; P-14).
 */
export function validarNovoDocumento(corpo: unknown): Validado<NovoDocumento> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { dados: 'Envie os dados do documento.' } };
  const campos: Record<string, string> = camposDesconhecidos(corpo, CAMPOS_NOVO_DOCUMENTO);
  if ('status' in corpo) {
    campos.status = 'O status inicial é sempre Recebido e não pode ser escolhido no cadastro.';
  }

  const id = corpo.id;
  if (typeof id !== 'string' || !ID_DOCUMENTO.test(id)) {
    campos.id = 'Identificador inválido. Recarregue o formulário e tente de novo.';
  }

  const { erros, dados } = validarDadosDocumento(corpo);
  Object.assign(campos, erros);

  if (Object.keys(campos).length > 0 || dados === null) return { ok: false, campos };
  return { ok: true, dados: { id: id as string, ...dados } };
}

// ---------------------------------------------------------------------------
// Edição de dados (F6) — corpo de PUT /documentos/:id/dados
// ---------------------------------------------------------------------------

const CAMPOS_EDICAO = [...CAMPOS_EDITAVEIS, 'versao'] as const satisfies readonly (keyof EdicaoDocumento)[];

/**
 * Valida a edição (contrato F6, 4.2, passo 5): esquema fechado (os 8 campos + `versao`;
 * `status` com mensagem própria, P-14), `validarDadosDocumento` (a mesma do cadastro)
 * e `versao` inteiro ≥ 1. O corpo é sempre completo: campo ausente é tratado como
 * vazio (e recusado se obrigatório), nunca como "manter".
 */
export function validarEdicaoDocumento(corpo: unknown): Validado<EdicaoDocumento> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie os dados do documento e a versão.' } };
  const campos: Record<string, string> = camposDesconhecidos(corpo, CAMPOS_EDICAO);
  if ('status' in corpo) campos.status = 'O status muda só por Atualizar etapa.';

  const { erros, dados } = validarDadosDocumento(corpo);
  Object.assign(campos, erros);
  const versao = validarVersao(corpo.versao, campos);

  if (Object.keys(campos).length > 0 || dados === null) return { ok: false, campos };
  return { ok: true, dados: { ...dados, versao } };
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
// Mudança de status (F5) — corpos de POST /documentos/:id/{transicoes,cancelamentos,reativacoes}
// ---------------------------------------------------------------------------

const ID_USUARIO = /^USR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MENSAGEM_VERSAO = 'Versão inválida. Recarregue o painel e tente de novo.';

function validarVersao(valor: unknown, campos: Record<string, string>): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) {
    campos.versao = MENSAGEM_VERSAO;
    return 0;
  }
  return valor;
}

const CAMPOS_TRANSICAO = ['para', 'responsavelId', 'observacao', 'versao'] as const satisfies readonly (keyof NovaTransicao)[];

/**
 * Valida a transição (contrato F5, 3.2, passo 5). Esquema fechado. `para` é um
 * StatusDocumento diferente de 'Em Revisão' (genérico, só dados migrados) e de
 * 'Cancelado' (rota própria); responsável obrigatório quando o destino exige e
 * proibido em Aprovado. Observação devolvida aparada (vazia → null).
 */
export function validarNovaTransicao(corpo: unknown): Validado<NovaTransicao> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie a etapa, o responsável, a observação e a versão.' } };
  const campos = camposDesconhecidos(corpo, CAMPOS_TRANSICAO);

  const para = corpo.para;
  if (!ehStatusDocumento(para)) campos.para = 'Selecione a etapa de destino.';
  else if (para === 'Em Revisão') campos.para = 'Escolha um status específico de revisão (Em Revisão é só de dados migrados).';
  else if (para === 'Cancelado') campos.para = 'Para cancelar, use a ação Cancelar.';

  const responsavelId = corpo.responsavelId ?? null;
  if (responsavelId !== null && (typeof responsavelId !== 'string' || !ID_USUARIO.test(responsavelId))) {
    campos.responsavelId = 'Responsável inválido.';
  } else if (!campos.para && ehStatusDocumento(para)) {
    if (para === 'Aprovado' && responsavelId !== null) campos.responsavelId = 'Documento aprovado não tem responsável.';
    else if (exigeResponsavel(para) && responsavelId === null) campos.responsavelId = 'Informe o responsável por esta etapa.';
  }

  const erroObservacao = validarObservacao(corpo.observacao);
  if (erroObservacao) campos.observacao = erroObservacao;

  const versao = validarVersao(corpo.versao, campos);

  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    dados: {
      para: para as NovaTransicao['para'],
      responsavelId: responsavelId as string | null,
      observacao: normalizarObservacao(corpo.observacao),
      versao,
    },
  };
}

const CAMPOS_CANCELAMENTO = ['motivo', 'versao'] as const satisfies readonly (keyof NovoCancelamento)[];

/** Valida o cancelamento (contrato 3.3, passo 5): motivo 10–500 após trim; versão ≥ 1. Motivo devolvido aparado. */
export function validarNovoCancelamento(corpo: unknown): Validado<NovoCancelamento> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie o motivo e a versão.' } };
  const campos = camposDesconhecidos(corpo, CAMPOS_CANCELAMENTO);
  const erroMotivo = validarMotivoCancelamento(corpo.motivo);
  if (erroMotivo) campos.motivo = erroMotivo;
  const versao = validarVersao(corpo.versao, campos);
  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, dados: { motivo: (corpo.motivo as string).trim(), versao } };
}

const CAMPOS_REATIVACAO = ['observacao', 'versao'] as const satisfies readonly (keyof NovaReativacao)[];

/** Valida a reativação (contrato 3.4, passo 5): observação opcional ≤ 500; versão ≥ 1. */
export function validarNovaReativacao(corpo: unknown): Validado<NovaReativacao> {
  if (!ehObjeto(corpo)) return { ok: false, campos: { corpo: 'Envie a observação e a versão.' } };
  const campos = camposDesconhecidos(corpo, CAMPOS_REATIVACAO);
  const erroObservacao = validarObservacao(corpo.observacao);
  if (erroObservacao) campos.observacao = erroObservacao;
  const versao = validarVersao(corpo.versao, campos);
  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, dados: { observacao: normalizarObservacao(corpo.observacao), versao } };
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

// ---------------------------------------------------------------------------
// Rotas de leitura sem parâmetros (F4) — GET /documentos/:id e arquivos
// ---------------------------------------------------------------------------

/** Esquema fechado numa rota que não aceita query: qualquer parâmetro → erro por campo. */
export function validarQueryVazia(query: unknown): Validado<Record<never, never>> {
  const corpo = ehObjeto(query) ? query : {};
  const campos = camposDesconhecidos(corpo, []);
  return Object.keys(campos).length > 0 ? { ok: false, campos } : { ok: true, dados: {} };
}
