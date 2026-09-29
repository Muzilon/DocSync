/**
 * Mudança de status (fatia F5): transições, cancelamento e reativação.
 *
 * Fonte: contrato docs/contratos/f5-mudanca-de-status.md (seções 3.2 a 3.4, com as
 * respostas do Eric na seção 11) e decisão 0004. A máquina de estados e a permissão
 * vêm do pacote compartilhado (as mesmas funções que a interface usa para esconder
 * botões); aqui elas decidem de verdade. Autor de todo evento vem do token.
 */

import {
  OBSERVACAO_CANCELAMENTO_DESFEITO,
  SUFIXO_REATIVACAO_RESERVA,
  pode,
  podeSerCancelado,
  statusDeReativacao,
  transicaoPermitida,
  type Documento,
  type ErroApi,
  type EventoHistorico,
  type NovaReativacao,
  type NovaTransicao,
  type NovoCancelamento,
  type ResultadoTransicao,
} from '@docsync/compartilhado';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { enviarErro } from '../autenticacao/plugin.ts';
import type { Banco, Executor } from '../banco/conexao.ts';
import {
  aplicarCancelamento,
  aplicarReativacao,
  aplicarTransicao,
  buscarDocumento,
  buscarDocumentoParaAtualizar,
  buscarEvento,
  listarEventos,
  registrarEvento,
  ultimoEvento,
} from '../banco/documentos.ts';
import { buscarResponsavelElegivel, type Usuario } from '../banco/pessoas.ts';
import { validarNovaReativacao, validarNovaTransicao, validarNovoCancelamento } from '../validacao.ts';

export { OBSERVACAO_CANCELAMENTO_DESFEITO };

/** Recusa de regra de negócio dentro da transação (desfaz a transação). */
class ErroNegocio extends Error {
  constructor(
    readonly status: number,
    readonly corpo: ErroApi,
  ) {
    super(corpo.codigo);
  }
}

const conflitoVersao = (documento: Documento) =>
  new ErroNegocio(409, {
    codigo: 'conflito_versao',
    mensagem: `Alguém alterou este documento: agora está em ${documento.status}. Veja o estado atual e tente de novo.`,
    documento,
  });

const acaoNaoPermitida = (mensagem: string) => new ErroNegocio(409, { codigo: 'acao_nao_permitida', mensagem });

/** Mensagem do 409 para documento que não aceita mudança de status (contrato 3.2, passo 4). */
function motivoEstadoFinal(documento: Pick<Documento, 'status'>): string | null {
  if (documento.status === 'Aprovado') return 'Documento aprovado é final.';
  if (documento.status === 'Cancelado') return 'Documento cancelado: use Reativar.';
  return null;
}

function podeVer(eu: Usuario, documento: Pick<Documento, 'areaId'>): boolean {
  return pode(eu, 'verDocumentos', { areaId: documento.areaId });
}

/**
 * O pedido PODE ser o reenvio de uma ação já aplicada (versão pedida = atual − 1)?
 * Nesse caso a checagem de estado antes da transação é pulada: quem decide é a
 * transação, na ordem idempotência (200) → conflito de versão → estado (409). Sem
 * isso, o reenvio de "Aprovar" ou de "Cancelar" receberia 409 em vez do 200 do
 * contrato (3.2–3.4, passo 6.1). Fora desse caso, o estado final responde antes
 * de o corpo ser validado (passo 4).
 */
function talvezReenvio(corpo: unknown, visto: Documento): boolean {
  return typeof corpo === 'object' && corpo !== null && (corpo as { versao?: unknown }).versao === visto.versao - 1;
}

type Resultado = { criado: boolean; documento: Documento; evento: EventoHistorico };

function responder(resposta: FastifyReply, resultado: Resultado) {
  const corpo: ResultadoTransicao = { documento: resultado.documento, evento: resultado.evento };
  return resposta.code(resultado.criado ? 201 : 200).send(corpo);
}

/**
 * Passos 1 e 2 comuns às três rotas: permissão geral → existência/visibilidade
 * (documento que a pessoa não pode ver responde 404, como se não existisse).
 * Devolve o documento visto (leitura sem bloqueio) ou já envia a resposta de erro.
 */
async function localizarVisivel(banco: Banco, requisicao: FastifyRequest<{ Params: { id: string } }>, resposta: FastifyReply) {
  const eu = requisicao.usuario;
  if (!pode(eu, 'verDocumentos')) {
    await enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    return null;
  }
  const visto = await buscarDocumento(banco, requisicao.params.id);
  if (!visto || !podeVer(eu, visto)) {
    await enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    return null;
  }
  return visto;
}

export function registrarRotasTransicoes(escopo: FastifyInstance, banco: Banco) {
  type Rota = { Params: { id: string } };

  // --- 3.2 Transição ------------------------------------------------------------------

  escopo.post<Rota>('/documentos/:id/transicoes', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    const visto = await localizarVisivel(banco, requisicao, resposta);
    if (!visto) return;
    // 3. Pergunta genérica: este perfil muda status de documentos desta área?
    if (!pode(eu, 'mudarStatus', { areaId: visto.areaId })) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
    // 4. Estado final (leitura sem bloqueio; conferido de novo na transação pela máquina).
    const final = motivoEstadoFinal(visto);
    if (final && !talvezReenvio(requisicao.body, visto)) {
      return enviarErro(resposta, 409, { codigo: 'acao_nao_permitida', mensagem: final });
    }
    // 5. Corpo: esquema fechado antes da idempotência (B2 do QA da F3).
    const validacao = validarNovaTransicao(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;

    try {
      const resultado = await banco.transaction(async (tx): Promise<Resultado> => {
        const documento = (await buscarDocumentoParaAtualizar(tx, visto.id))!;
        // 6.1 Idempotência: o mesmo pedido já foi aplicado → 200 sem gravar.
        const repetido = await transicaoJaAplicada(tx, documento, eu, pedido);
        if (repetido) return { criado: false, documento, evento: repetido };
        // 6.2 Concorrência otimista.
        if (documento.versao !== pedido.versao) throw conflitoVersao(documento);
        // 6.3 Máquina de estados (cobre estado final e "mesmo status").
        if (!transicaoPermitida(documento.status, pedido.para)) {
          throw acaoNaoPermitida(
            documento.status === pedido.para
              ? 'O documento já está neste status.'
              : (motivoEstadoFinal(documento) ?? `Não é possível ir de ${documento.status} para ${pedido.para}.`),
          );
        }
        // 6.4 Perfil para ESTA transição (o Solicitante só nos pares da sua lista).
        if (!pode(eu, 'mudarStatus', { areaId: documento.areaId, transicao: { de: documento.status, para: pedido.para } })) {
          throw new ErroNegocio(403, { codigo: 'sem_permissao', mensagem: 'Seu perfil não pode aplicar esta etapa.' });
        }
        // 6.5 Responsável: pessoa cadastrada, ativa, com acesso liberado e perfil que atua.
        const responsavel = pedido.responsavelId === null ? null : await buscarResponsavelElegivel(tx, pedido.responsavelId);
        if (pedido.responsavelId !== null && !responsavel) {
          throw new ErroNegocio(400, {
            codigo: 'dados_invalidos',
            campos: { responsavelId: 'Pessoa não encontrada ou não pode ser responsável.' },
          });
        }
        // 6.6 Gravação com `WHERE versao = $n` (corrida no PostgreSQL real → conflito).
        const atualizado = await aplicarTransicao(tx, documento.id, pedido.versao, pedido.para, responsavel?.id ?? null);
        if (!atualizado) throw conflitoVersao((await buscarDocumento(tx, documento.id))!);
        // 6.7 Evento STATUS (contrato 2.5), autor do token.
        const idEvento = await registrarEvento(tx, {
          idDocumento: documento.id,
          codigo: documento.codigo,
          tipoAcao: 'STATUS',
          status: pedido.para,
          statusAnterior: documento.status,
          destino: null,
          responsavel: responsavel?.nome ?? null,
          responsavelId: responsavel?.id ?? null,
          autorId: eu.id,
          autorNome: eu.nome,
          detalhes: [],
          observacao: pedido.observacao,
        });
        return { criado: true, documento: atualizado, evento: (await buscarEvento(tx, idEvento))! };
      });
      return responder(resposta, resultado);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      throw erro;
    }
  });

  // --- 3.3 Cancelamento ---------------------------------------------------------------

  escopo.post<Rota>('/documentos/:id/cancelamentos', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    const visto = await localizarVisivel(banco, requisicao, resposta);
    if (!visto) return;
    if (!pode(eu, 'cancelarDocumento', { areaId: visto.areaId })) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
    const final = motivoCancelamentoRecusado(visto);
    if (final && !talvezReenvio(requisicao.body, visto)) {
      return enviarErro(resposta, 409, { codigo: 'acao_nao_permitida', mensagem: final });
    }
    const validacao = validarNovoCancelamento(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;

    try {
      const resultado = await banco.transaction(async (tx): Promise<Resultado> => {
        const documento = (await buscarDocumentoParaAtualizar(tx, visto.id))!;
        const repetido = await cancelamentoJaAplicado(tx, documento, eu, pedido);
        if (repetido) return { criado: false, documento, evento: repetido };
        if (documento.versao !== pedido.versao) throw conflitoVersao(documento);
        const recusa = motivoCancelamentoRecusado(documento);
        if (recusa) throw acaoNaoPermitida(recusa);

        // `responsavel_id` fica intacto: a reativação encontra quem estava.
        const atualizado = await aplicarCancelamento(tx, documento.id, pedido.versao);
        if (!atualizado) throw conflitoVersao((await buscarDocumento(tx, documento.id))!);
        const idEvento = await registrarEvento(tx, {
          idDocumento: documento.id,
          codigo: documento.codigo,
          tipoAcao: 'CANCELAMENTO',
          status: 'Cancelado',
          statusAnterior: documento.status, // A reativação lê daqui (decisão 0004).
          destino: null,
          responsavel: documento.responsavel,
          responsavelId: documento.responsavelId,
          autorId: eu.id,
          autorNome: eu.nome,
          detalhes: [],
          observacao: pedido.motivo,
        });
        return { criado: true, documento: atualizado, evento: (await buscarEvento(tx, idEvento))! };
      });
      return responder(resposta, resultado);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      throw erro;
    }
  });

  // --- 3.4 Reativação (decisão 0004; mesma rota para o Desfazer, P-17) -------------------

  escopo.post<Rota>('/documentos/:id/reativacoes', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    const visto = await localizarVisivel(banco, requisicao, resposta);
    if (!visto) return;
    if (!pode(eu, 'reativarDocumento', { areaId: visto.areaId })) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
    if (visto.status !== 'Cancelado' && !talvezReenvio(requisicao.body, visto)) {
      return enviarErro(resposta, 409, { codigo: 'acao_nao_permitida', mensagem: MENSAGEM_SO_CANCELADOS });
    }
    const validacao = validarNovaReativacao(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;

    try {
      const resultado = await banco.transaction(async (tx): Promise<Resultado> => {
        const documento = (await buscarDocumentoParaAtualizar(tx, visto.id))!;
        const repetido = await reativacaoJaAplicada(tx, documento, eu, pedido);
        if (repetido) return { criado: false, documento, evento: repetido };
        if (documento.versao !== pedido.versao) throw conflitoVersao(documento);
        if (documento.status !== 'Cancelado') throw acaoNaoPermitida(MENSAGEM_SO_CANCELADOS);

        // Status de volta pela mesma função pura da interface, sobre os eventos gravados.
        const eventos = await listarEventos(tx, documento.id);
        const destino = statusDeReativacao(eventos);
        const caiuNaReserva = eventos.findLast((e) => e.tipoAcao === 'CANCELAMENTO')?.statusAnterior !== destino;
        const observacao = caiuNaReserva ? `${pedido.observacao ?? ''}${SUFIXO_REATIVACAO_RESERVA}`.trim() : pedido.observacao;

        const atualizado = await aplicarReativacao(tx, documento.id, pedido.versao, destino);
        if (!atualizado) throw conflitoVersao((await buscarDocumento(tx, documento.id))!);
        const idEvento = await registrarEvento(tx, {
          idDocumento: documento.id,
          codigo: documento.codigo,
          tipoAcao: 'STATUS',
          status: destino,
          statusAnterior: 'Cancelado',
          destino: null,
          responsavel: documento.responsavel,
          responsavelId: documento.responsavelId,
          autorId: eu.id,
          autorNome: eu.nome,
          detalhes: [],
          observacao,
        });
        return { criado: true, documento: atualizado, evento: (await buscarEvento(tx, idEvento))! };
      });
      return responder(resposta, resultado);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      throw erro;
    }
  });
}

const MENSAGEM_SO_CANCELADOS = 'Só documentos cancelados podem ser reativados.';

function motivoCancelamentoRecusado(documento: Pick<Documento, 'status'>): string | null {
  if (documento.status === 'Aprovado') return 'Documento aprovado é final e não pode ser cancelado.';
  if (documento.status === 'Cancelado') return 'Documento já cancelado.';
  return podeSerCancelado(documento.status) ? null : `Documento em ${documento.status} não pode ser cancelado.`;
}

// ---------------------------------------------------------------------------
// Detecção de reenvio (contrato 3.2–3.4, passo 6.1; padrão da F3: versão + último evento).
// Cobre o duplo clique e o reenvio imediato; a chave de idempotência por evento
// gerada pelo cliente fica para a F9 (contrato 3.6).
// ---------------------------------------------------------------------------

async function ultimoDoMesmoAutor(db: Executor, documento: Documento, eu: Usuario, versaoPedida: number) {
  if (documento.versao !== versaoPedida + 1) return null;
  const ultimo = await ultimoEvento(db, documento.id);
  return ultimo && ultimo.autorId === eu.id ? ultimo : null;
}

async function transicaoJaAplicada(db: Executor, documento: Documento, eu: Usuario, pedido: NovaTransicao) {
  const ultimo = await ultimoDoMesmoAutor(db, documento, eu, pedido.versao);
  if (!ultimo || ultimo.tipoAcao !== 'STATUS' || ultimo.statusAnterior === 'Cancelado') return null;
  const mesmoPedido =
    ultimo.status === pedido.para && ultimo.responsavelId === pedido.responsavelId && ultimo.observacao === pedido.observacao;
  return mesmoPedido ? ultimo : null;
}

async function cancelamentoJaAplicado(db: Executor, documento: Documento, eu: Usuario, pedido: NovoCancelamento) {
  const ultimo = await ultimoDoMesmoAutor(db, documento, eu, pedido.versao);
  return ultimo && ultimo.tipoAcao === 'CANCELAMENTO' && ultimo.observacao === pedido.motivo ? ultimo : null;
}

async function reativacaoJaAplicada(db: Executor, documento: Documento, eu: Usuario, pedido: NovaReativacao) {
  const ultimo = await ultimoDoMesmoAutor(db, documento, eu, pedido.versao);
  if (!ultimo || ultimo.tipoAcao !== 'STATUS' || ultimo.statusAnterior !== 'Cancelado') return null;
  // A observação gravada pode ter ganhado o sufixo da reserva; compara sem ele.
  const gravada = ultimo.observacao?.replace(SUFIXO_REATIVACAO_RESERVA.trim(), '').trim() || null;
  return gravada === pedido.observacao ? ultimo : null;
}
