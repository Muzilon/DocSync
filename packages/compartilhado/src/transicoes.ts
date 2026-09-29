/**
 * Mudança de status (fatia F5): máquina de estados, ações por perfil, responsável
 * pela etapa, reativação e corpos das rotas de transição.
 *
 * Fonte: contrato docs/contratos/f5-mudanca-de-status.md (seções 2 e 3, com as
 * respostas do Eric na seção 11), documento 02 (3.2 e 7.3), documento 03 (10.1) e
 * decisão 0004. Tudo puro: a API decide com estas funções e a interface só esconde
 * o que a pessoa não pode fazer. Nenhum texto de status é escrito à mão fora de
 * `STATUS_DOCUMENTO`.
 */

import {
  FASE_DO_STATUS,
  LIMITES_JUSTIFICATIVA,
  STATUS_DOCUMENTO,
  type Documento,
  type EventoHistorico,
  type Fase,
  type StatusDocumento,
} from './documentos.ts';
import { ordenarAlfabetico } from './ordenacao.ts';
import { TRANSICOES_SOLICITANTE, pode, type Perfil, type Pessoa } from './pessoas.ts';

export { TRANSICOES_SOLICITANTE };

// ---------------------------------------------------------------------------
// 2.2 Máquina de estados (independente de perfil)
// ---------------------------------------------------------------------------

/**
 * Fases de destino permitidas a partir de cada fase (documento 02, 3.2, mais os
 * atalhos do documento 03, 10.1, mantidos pelo Eric: Recebido → Devolvido,
 * Devolvido → Em Aprovação e Em Revisão → Aprovado). Mudar entre dois status da
 * mesma fase é permitido: muda quem está com o documento sem mudar a coluna.
 */
export const DESTINOS_POR_FASE: Record<Fase, readonly Fase[]> = {
  recebido: ['revisao', 'devolvido'],
  revisao: ['revisao', 'devolvido', 'aprovacao', 'aprovado'],
  devolvido: ['devolvido', 'revisao', 'aprovacao'],
  aprovacao: ['aprovacao', 'devolvido', 'aprovado'],
  aprovado: [], // final (decisão 0004)
  cancelado: [], // só por reativação (rota própria)
};

/**
 * 'Em Revisão' (genérico) existe só para dados migrados: nunca é destino de uma
 * transição nova (como origem, é um status da fase 'revisao' como outro qualquer).
 * 'Cancelado' tem rota própria.
 */
const NUNCA_DESTINO: readonly StatusDocumento[] = ['Em Revisão', 'Cancelado'];

/**
 * Status que podem ser escolhidos como destino a partir de `de`, na ordem de
 * `STATUS_DOCUMENTO`. Exclui 'Em Revisão' (genérico), 'Cancelado' (rota própria),
 * o próprio `de` e qualquer status fora de DESTINOS_POR_FASE.
 */
export function destinosPermitidos(de: StatusDocumento): StatusDocumento[] {
  const fasesDestino = DESTINOS_POR_FASE[FASE_DO_STATUS[de]];
  return STATUS_DOCUMENTO.filter(
    (para) => para !== de && !NUNCA_DESTINO.includes(para) && fasesDestino.includes(FASE_DO_STATUS[para]),
  );
}

/** A máquina aceita `de` → `para`? (= destinosPermitidos(de).includes(para)). */
export function transicaoPermitida(de: StatusDocumento, para: StatusDocumento): boolean {
  return destinosPermitidos(de).includes(para);
}

/** Status que aceitam cancelamento: qualquer um exceto Aprovado (final) e Cancelado. */
export function podeSerCancelado(status: StatusDocumento): boolean {
  return status !== 'Aprovado' && status !== 'Cancelado';
}

// ---------------------------------------------------------------------------
// 2.4 Responsável pela etapa
// ---------------------------------------------------------------------------

/** Pessoa como sai de GET /responsaveis: o mínimo para escolher e exibir (sem e-mail, LGPD). */
export interface PessoaResumo {
  id: string;
  nome: string;
  perfil: Perfil;
  areaId: string | null;
  area: string | null;
}

/** Perfis que podem ser responsáveis por uma etapa (o Leitor não atua). */
export const PERFIS_RESPONSAVEL: readonly Perfil[] = ['Administrador', 'Qualidade', 'Solicitante'];

/** Quem exige responsável: destino em fase 'revisao', 'devolvido' ou 'aprovacao'. Aprovado limpa. */
export function exigeResponsavel(para: StatusDocumento): boolean {
  const fase = FASE_DO_STATUS[para];
  return fase === 'revisao' || fase === 'devolvido' || fase === 'aprovacao';
}

/** Os "sugeridos" para um destino são pessoas da Qualidade (Qualidade/Administrador) ou da área do documento? */
function sugestaoParaDestino(para: StatusDocumento): 'qualidade' | 'area' | null {
  const fase = FASE_DO_STATUS[para];
  if (fase === 'devolvido' || para === 'Para aprovação da área solicitante') return 'area';
  if (fase === 'revisao' || para === 'Para aprovação qualidade') return 'qualidade';
  return null;
}

/**
 * Ordena as pessoas elegíveis colocando as sugeridas primeiro (só para a interface
 * pré-selecionar; o servidor não usa):
 * - destino em fase 'devolvido' ou 'Para aprovação da área solicitante' → pessoas da área do documento;
 * - destino em fase 'revisao' ou 'Para aprovação qualidade' → pessoas com perfil Qualidade ou Administrador.
 * Se `eu` está entre as sugeridas, vem em primeiro. Dentro de cada grupo, ordem pt-BR do nome.
 */
export function sugerirResponsaveis(
  para: StatusDocumento,
  documento: Pick<Documento, 'areaId'>,
  pessoas: readonly PessoaResumo[],
  eu: Pick<Pessoa, 'id'>,
): PessoaResumo[] {
  const sugerida = (p: PessoaResumo) => ehResponsavelSugerido(para, documento, p);
  const ordenadas = ordenarAlfabetico(pessoas, (p) => p.nome);
  const sugeridas = ordenadas.filter(sugerida);
  const outras = ordenadas.filter((p) => !sugerida(p));
  const euSugerido = sugeridas.find((p) => p.id === eu.id);
  return [...(euSugerido ? [euSugerido] : []), ...sugeridas.filter((p) => p !== euSugerido), ...outras];
}

/** As pessoas sugeridas para o destino (o primeiro grupo de `sugerirResponsaveis`), para o `<optgroup>`. */
export function ehResponsavelSugerido(
  para: StatusDocumento,
  documento: Pick<Documento, 'areaId'>,
  pessoa: PessoaResumo,
): boolean {
  const criterio = sugestaoParaDestino(para);
  if (criterio === 'area') return pessoa.areaId === documento.areaId;
  if (criterio === 'qualidade') return pessoa.perfil === 'Qualidade' || pessoa.perfil === 'Administrador';
  return false;
}

// ---------------------------------------------------------------------------
// 2.5 Reativação (decisão 0004)
// ---------------------------------------------------------------------------

/** Status para o qual um cancelado volta quando o histórico não diz (dados importados incompletos). */
export const STATUS_REATIVACAO_RESERVA: StatusDocumento = 'Recebido';

/** O último evento CANCELAMENTO do documento (pela ordem da lista), ou null. */
export function ultimoCancelamento(eventos: readonly EventoHistorico[]): EventoHistorico | null {
  for (let i = eventos.length - 1; i >= 0; i--) {
    if (eventos[i]!.tipoAcao === 'CANCELAMENTO') return eventos[i]!;
  }
  return null;
}

/**
 * Status para o qual um documento cancelado volta (decisão 0004): `statusAnterior`
 * do ÚLTIMO evento CANCELAMENTO. Sem esse evento ou sem statusAnterior (dados
 * importados incompletos) → 'Recebido' (o que o documento 02 previa); a API
 * registra isso na observação do evento de reativação.
 */
export function statusDeReativacao(eventos: readonly EventoHistorico[]): StatusDocumento {
  const cancelamento = ultimoCancelamento(eventos);
  const anterior = cancelamento?.statusAnterior ?? null;
  // Um cancelamento cujo "anterior" fosse Cancelado ou Aprovado seria dado corrompido: reserva.
  if (anterior === null || anterior === 'Cancelado' || anterior === 'Aprovado') return STATUS_REATIVACAO_RESERVA;
  return anterior;
}

// ---------------------------------------------------------------------------
// 2.6 Ações disponíveis (função pura para a interface)
// ---------------------------------------------------------------------------

export interface AcaoStatus {
  para: StatusDocumento;
  /** Texto do botão (ROTULO_TRANSICAO ou "Mover para <status>"). */
  rotulo: string;
  /** A ação principal do status de origem (ACAO_PRINCIPAL), com estilo primário no modal. */
  principal: boolean;
  exigeResponsavel: boolean;
  /** Aprovado é final: sempre pede confirmação (resposta 1 do Eric). */
  exigeConfirmacao: boolean;
}

type ChaveRotulo = `${Fase | 'qualquer'} → ${StatusDocumento}`;

/** Rótulos dos botões para Qualidade/Administrador (contrato 2.6). Sem chave: "Mover para <status>". */
export const ROTULO_TRANSICAO: Partial<Record<ChaveRotulo, string>> = {
  'recebido → Em revisão da qualidade': 'Iniciar revisão',
  'devolvido → Em revisão da qualidade': 'Retomar revisão',
  'qualquer → Em revisão junto à área': 'Revisar junto à área',
  'qualquer → Devolvido para área para revisão': 'Devolver à área',
  'qualquer → Devolvido para correção': 'Devolver para correção',
  'qualquer → Em revisão do solicitante': 'Enviar ao solicitante',
  'qualquer → Para aprovação da área solicitante': 'Enviar à aprovação da área',
  'qualquer → Para aprovação qualidade': 'Enviar à aprovação da Qualidade',
  'qualquer → Aprovado': 'Aprovar',
};

/** Rótulos do Solicitante (só para os pares de TRANSICOES_SOLICITANTE). */
export const ROTULO_TRANSICAO_SOLICITANTE: Partial<Record<ChaveRotulo, string>> = {
  'devolvido → Em revisão da qualidade': 'Reenviar à Qualidade',
  'qualquer → Para aprovação qualidade': 'Aprovar pela área',
};

/** Rótulo do botão para `de` → `para`, pelo perfil de quem age. */
export function rotuloTransicao(de: StatusDocumento, para: StatusDocumento, perfil: Perfil): string {
  const tabela = perfil === 'Solicitante' ? ROTULO_TRANSICAO_SOLICITANTE : ROTULO_TRANSICAO;
  return tabela[`${FASE_DO_STATUS[de]} → ${para}`] ?? tabela[`qualquer → ${para}`] ?? `Mover para ${para}`;
}

/** Ação principal por status (ou fase) de origem: o destino "natural" do fluxo. */
export const ACAO_PRINCIPAL: Partial<Record<StatusDocumento | Fase, StatusDocumento>> = {
  Recebido: 'Em revisão da qualidade',
  revisao: 'Para aprovação da área solicitante',
  devolvido: 'Em revisão da qualidade',
  'Para aprovação da área solicitante': 'Para aprovação qualidade',
  'Para aprovação qualidade': 'Aprovado',
};

/** Destino da ação principal a partir de `de` (status tem prioridade sobre a fase); null se não há. */
export function acaoPrincipal(de: StatusDocumento): StatusDocumento | null {
  return ACAO_PRINCIPAL[de] ?? ACAO_PRINCIPAL[FASE_DO_STATUS[de]] ?? null;
}

/**
 * Transições que ESTA pessoa pode aplicar a ESTE documento agora (máquina ∩
 * perfil), na ordem de `destinosPermitidos`. Vazio para Aprovado, Cancelado,
 * Leitor, Solicitante de outra área e pessoa sem acesso liberado.
 */
export function acoesDeStatus(eu: Pessoa | null, documento: Pick<Documento, 'status' | 'areaId'>): AcaoStatus[] {
  if (eu === null || eu.perfil === null) return [];
  if (!pode(eu, 'mudarStatus', { areaId: documento.areaId })) return [];
  const perfil = eu.perfil;
  const principal = acaoPrincipal(documento.status);
  return destinosPermitidos(documento.status)
    .filter((para) => pode(eu, 'mudarStatus', { areaId: documento.areaId, transicao: { de: documento.status, para } }))
    .map((para) => ({
      para,
      rotulo: rotuloTransicao(documento.status, para, perfil),
      principal: para === principal,
      exigeResponsavel: exigeResponsavel(para),
      exigeConfirmacao: para === 'Aprovado',
    }));
}

// ---------------------------------------------------------------------------
// 3.1 Corpos e respostas das rotas
// ---------------------------------------------------------------------------

/** Corpo de POST /documentos/:id/transicoes. Campo desconhecido é rejeitado. */
export interface NovaTransicao {
  para: StatusDocumento;
  /** 'USR-uuid'. Obrigatório quando exigeResponsavel(para); deve ser null quando para = 'Aprovado'. */
  responsavelId: string | null;
  /** Até 500 caracteres depois de trim; null ou '' = sem observação. */
  observacao: string | null;
  /** Versão do documento que a pessoa está vendo (concorrência otimista, decisão 0002). */
  versao: number;
}

/** Corpo de POST /documentos/:id/cancelamentos. */
export interface NovoCancelamento {
  /** Obrigatório, 10 a 500 caracteres (LIMITES_JUSTIFICATIVA), resposta 4 do Eric. */
  motivo: string;
  versao: number;
}

/** Corpo de POST /documentos/:id/reativacoes. O "Desfazer" do toast manda 'Cancelamento desfeito.'. */
export interface NovaReativacao {
  observacao: string | null;
  versao: number;
}

/** Resposta 200/201 das três rotas (mesmo formato de ResultadoReprogramacao). */
export interface ResultadoTransicao {
  documento: Documento;
  evento: EventoHistorico;
}

export const LIMITES_OBSERVACAO = { maximo: 500 } as const;

/** Observação do "Desfazer" do toast (contrato 3.4). */
export const OBSERVACAO_CANCELAMENTO_DESFEITO = 'Cancelamento desfeito.';

/** Sufixo gravado na observação da reativação quando o histórico não dizia o status anterior. */
export const SUFIXO_REATIVACAO_RESERVA = ' (status anterior desconhecido; voltou para Recebido)';

/**
 * Motivo do cancelamento: obrigatório; depois de `trim`, entre 10 e 500 caracteres
 * (mesmos limites da justificativa de reprogramação). @returns mensagem pt-BR ou null.
 */
export function validarMotivoCancelamento(texto: unknown): string | null {
  if (typeof texto !== 'string' || texto.trim() === '') return 'Informe o motivo do cancelamento.';
  const tamanho = texto.trim().length;
  if (tamanho < LIMITES_JUSTIFICATIVA.minimo) {
    return `O motivo precisa ter ao menos ${LIMITES_JUSTIFICATIVA.minimo} caracteres.`;
  }
  if (tamanho > LIMITES_JUSTIFICATIVA.maximo) {
    return `O motivo pode ter até ${LIMITES_JUSTIFICATIVA.maximo} caracteres.`;
  }
  return null;
}

/**
 * Observação opcional de transição/reativação: ausente, null ou vazia é aceita
 * (vira null); texto com até 500 caracteres depois de `trim`. @returns mensagem ou null.
 */
export function validarObservacao(texto: unknown): string | null {
  if (texto === undefined || texto === null) return null;
  if (typeof texto !== 'string') return 'Observação inválida.';
  if (texto.trim().length > LIMITES_OBSERVACAO.maximo) {
    return `A observação pode ter até ${LIMITES_OBSERVACAO.maximo} caracteres.`;
  }
  return null;
}

/** Observação normalizada: aparada; vazia → null. Use depois de `validarObservacao`. */
export function normalizarObservacao(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const limpo = texto.trim();
  return limpo === '' ? null : limpo;
}
