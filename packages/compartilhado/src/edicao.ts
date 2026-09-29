/**
 * Edição de dados cadastrais (fatia F6).
 *
 * Fonte: contrato docs/contratos/f6-edicao-de-dados.md (seções 2 a 4; a seção 9
 * prevalece). P-14: a edição usa a MESMA validação do cadastro, por esta única
 * função pura (`validarDadosDocumento`), na API (cadastro e edição) e na interface
 * (tela Novo documento e diálogo Editar dados). Tudo aqui é puro.
 */

import { emTramitacao, type Documento, type EventoHistorico } from './documentos.ts';

/** Os campos cadastrais que uma pessoa pode alterar depois do cadastro (documento 03, 10.3, menos os que o servidor governa). */
export const CAMPOS_EDITAVEIS = [
  'titulo',
  'codigo',
  'tipoDocumentoId',
  'revisao',
  'remetente',
  'areaId',
  'disciplina',
  'observacao',
] as const satisfies readonly (keyof DadosDocumento)[];
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Dados cadastrais de um documento: o que o cadastro recebe (menos o `id`) e o que a edição substitui por inteiro. */
export interface DadosDocumento {
  codigo: string | null;
  titulo: string;
  tipoDocumentoId: string;
  revisao: number;
  remetente: string;
  areaId: string;
  disciplina: string | null;
  observacao: string | null;
}

export const LIMITES_TEXTO_DOCUMENTO = { codigo: 100, titulo: 300, remetente: 200, disciplina: 100, observacao: 2000 } as const;
export const REVISAO_MAXIMA = 999;

export interface ValidacaoDados {
  /** Mensagem pt-BR por campo. */
  erros: Partial<Record<CampoEditavel, string>>;
  /** Dados normalizados (aparados, vazios → null, revisão como número) quando não há erro; senão null. */
  dados: DadosDocumento | null;
}

type CampoTexto = keyof typeof LIMITES_TEXTO_DOCUMENTO;

/** Rótulo usado nas mensagens de limite e de tipo inválido (as mesmas do cadastro da F2). */
const ROTULO_MENSAGEM: Record<CampoTexto, string> = {
  titulo: 'O título',
  codigo: 'O código',
  remetente: 'O remetente',
  disciplina: 'A disciplina',
  observacao: 'A observação',
};

const MENSAGEM_VAZIO = {
  titulo: 'Informe o título do documento.',
  remetente: 'Informe o remetente ou solicitante.',
  tipoDocumentoId: 'Selecione o tipo de documento.',
  areaId: 'Selecione a área.',
} as const;

const MENSAGEM_REVISAO = `O número de revisão deve ser um inteiro de 0 a ${REVISAO_MAXIMA}.`;

/** Texto opcional: ausente, null ou só espaços → null; aparado; erro se não for texto ou passar do limite. */
function textoOpcional(valor: unknown, campo: CampoTexto, erros: ValidacaoDados['erros']): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    erros[campo] = `${ROTULO_MENSAGEM[campo]} inválido.`;
    return null;
  }
  const limpo = valor.trim();
  if (limpo.length > LIMITES_TEXTO_DOCUMENTO[campo]) {
    erros[campo] = `${ROTULO_MENSAGEM[campo]} pode ter até ${LIMITES_TEXTO_DOCUMENTO[campo]} caracteres.`;
  }
  return limpo === '' ? null : limpo;
}

function textoObrigatorio(valor: unknown, campo: 'titulo' | 'remetente', erros: ValidacaoDados['erros']): string {
  const limpo = textoOpcional(valor, campo, erros);
  if (limpo === null && !erros[campo]) erros[campo] = MENSAGEM_VAZIO[campo];
  return limpo ?? '';
}

function idObrigatorio(valor: unknown, campo: 'tipoDocumentoId' | 'areaId', erros: ValidacaoDados['erros']): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    erros[campo] = MENSAGEM_VAZIO[campo];
    return '';
  }
  return valor;
}

/** Revisão: inteiro 0–999, como número ou como texto só de dígitos (o formulário envia texto). */
function revisaoValida(valor: unknown, erros: ValidacaoDados['erros']): number {
  let numero: number | null = null;
  if (typeof valor === 'number') numero = valor;
  else if (typeof valor === 'string' && /^\d+$/.test(valor.trim())) numero = Number(valor.trim());
  if (numero === null || !Number.isInteger(numero) || numero < 0 || numero > REVISAO_MAXIMA) {
    erros.revisao = MENSAGEM_REVISAO;
    return 0;
  }
  return numero;
}

/**
 * Valida os 8 campos cadastrais (contrato F6, tabela 2.1). Recebe valores crus
 * (`unknown`: o formulário manda texto, a API manda JSON) e devolve erros e dados
 * normalizados. NÃO confere esquema fechado, existência de tipo/área nem unicidade
 * de código: isso é do servidor. P-14 fica garantido por construção.
 */
export function validarDadosDocumento(entrada: Partial<Record<CampoEditavel, unknown>>): ValidacaoDados {
  const erros: ValidacaoDados['erros'] = {};
  const titulo = textoObrigatorio(entrada.titulo, 'titulo', erros);
  const codigo = textoOpcional(entrada.codigo, 'codigo', erros);
  const tipoDocumentoId = idObrigatorio(entrada.tipoDocumentoId, 'tipoDocumentoId', erros);
  const revisao = revisaoValida(entrada.revisao, erros);
  const remetente = textoObrigatorio(entrada.remetente, 'remetente', erros);
  const areaId = idObrigatorio(entrada.areaId, 'areaId', erros);
  const disciplina = textoOpcional(entrada.disciplina, 'disciplina', erros);
  const observacao = textoOpcional(entrada.observacao, 'observacao', erros);
  if (Object.keys(erros).length > 0) return { erros, dados: null };
  return { erros, dados: { titulo, codigo, tipoDocumentoId, revisao, remetente, areaId, disciplina, observacao } };
}

// ---------------------------------------------------------------------------
// Diferenças campo a campo (evento EDICAO, contrato F4 3.3)
// ---------------------------------------------------------------------------

/** Um item de `detalhes[]` do evento EDICAO: nome do campo como `ROTULO_CAMPO_HISTORICO` conhece. */
export interface DetalheEdicao {
  campo: 'titulo' | 'codigo' | 'tipoDocumento' | 'revisao' | 'remetente' | 'area' | 'disciplina' | 'observacao';
  antes: string | null;
  depois: string | null;
}

/**
 * Diferenças entre o documento como está e os dados novos, na ordem de CAMPOS_EDITAVEIS.
 * Tipo e área comparam pelo ID e gravam o NOME (o de agora, em `atual`, e o novo, em
 * `nomes`), nunca o ID. Revisão vira texto. Comparação exata (código só com caixa
 * diferente conta como mudança). Vazio = nada mudou.
 */
export function diferencasDocumento(
  atual: Pick<Documento, CampoEditavel | 'tipoDocumento' | 'area'>,
  novo: DadosDocumento,
  nomes: { tipoDocumento: string; area: string },
): DetalheEdicao[] {
  const diferencas: DetalheEdicao[] = [];
  for (const campo of CAMPOS_EDITAVEIS) {
    if (atual[campo] === novo[campo]) continue;
    switch (campo) {
      case 'tipoDocumentoId':
        diferencas.push({ campo: 'tipoDocumento', antes: atual.tipoDocumento, depois: nomes.tipoDocumento });
        break;
      case 'areaId':
        diferencas.push({ campo: 'area', antes: atual.area, depois: nomes.area });
        break;
      case 'revisao':
        diferencas.push({ campo: 'revisao', antes: String(atual.revisao), depois: String(novo.revisao) });
        break;
      default:
        diferencas.push({ campo, antes: atual[campo], depois: novo[campo] });
    }
  }
  return diferencas;
}

/** Documento em tramitação (nem Aprovado nem Cancelado) aceita edição de dados (contrato 3.2). = emTramitacao. */
export function podeEditarAgora(documento: Pick<Documento, 'status'>): boolean {
  return emTramitacao(documento);
}

// ---------------------------------------------------------------------------
// Rota PUT /documentos/:id/dados
// ---------------------------------------------------------------------------

/** Corpo de PUT /documentos/:id/dados: os 8 campos editáveis, sempre completos, mais a versão vista. Campo desconhecido é rejeitado. */
export interface EdicaoDocumento extends DadosDocumento {
  versao: number;
}

/** Resposta 200/201. `evento` é null quando nada mudou (200; nada gravado). */
export interface ResultadoEdicao {
  documento: Documento;
  evento: EventoHistorico | null;
}
