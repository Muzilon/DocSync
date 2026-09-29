/**
 * Edição de dados cadastrais (fatia F6): PUT /documentos/:id/dados.
 *
 * Fonte: contrato docs/contratos/f6-edicao-de-dados.md (seção 4.2, ordem de decisão;
 * a seção 9 prevalece). Validação, diferenças, estado editável e permissão vêm do
 * pacote compartilhado (as mesmas funções da interface); aqui elas decidem de
 * verdade. Status, responsável, datas do servidor e ID nunca mudam por esta rota
 * (P-14). Autor do evento EDICAO vem do token.
 */

import {
  diferencasDocumento,
  pode,
  podeEditarAgora,
  sanitizarNomePasta,
  type Documento,
  type EdicaoDocumento,
  type ErroApi,
  type EventoHistorico,
  type ResultadoEdicao,
} from '@docsync/compartilhado';
import type { FastifyInstance } from 'fastify';
import { enviarErro } from '../autenticacao/plugin.ts';
import type { Banco, Executor } from '../banco/conexao.ts';
import {
  aplicarEdicao,
  buscarDocumento,
  buscarDocumentoParaAtualizar,
  buscarEvento,
  buscarTipoAtivo,
  existeOutroComCodigoRevisao,
  registrarEvento,
  ultimoEvento,
} from '../banco/documentos.ts';
import { buscarAreaAtiva, type Usuario } from '../banco/pessoas.ts';
import { validarEdicaoDocumento } from '../validacao.ts';
import { corpoErroCodigoRevisao } from './documentos.ts';

/** Violação de unicidade no PostgreSQL. */
const VIOLACAO_UNICA = '23505';

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
    mensagem: 'Alguém alterou este documento enquanto você editava. Veja os valores atuais e tente de novo.',
    documento,
  });

/** Mensagem do 409 para documento que não aceita edição (contrato 4.2, passo 4); null se aceita. */
function motivoNaoEditavel(documento: Pick<Documento, 'status'>): string | null {
  if (podeEditarAgora(documento)) return null;
  return documento.status === 'Aprovado'
    ? 'Documento aprovado é final. Para corrigir, cadastre uma revisão.'
    : 'Documento cancelado: reative antes de editar.';
}

/**
 * O pedido PODE ser o reenvio de uma edição já aplicada (versão pedida = atual − 1)?
 * Então a checagem de estado antes da transação é pulada e a transação decide, na
 * ordem idempotência → conflito → estado (mesmo padrão da F5).
 */
function talvezReenvio(corpo: unknown, visto: Documento): boolean {
  return typeof corpo === 'object' && corpo !== null && (corpo as { versao?: unknown }).versao === visto.versao - 1;
}

/** Contexto completo da permissão de edição: área e status do documento (contrato 3.1). */
const contextoEdicao = (documento: Pick<Documento, 'areaId' | 'status'>) => ({
  areaId: documento.areaId,
  status: documento.status,
});

/** Recusa de perfil com a mensagem do contrato quando o motivo é a fase (Solicitante fora de devolvido). */
function semPermissaoEdicao(eu: Usuario, documento: Documento): ErroApi {
  const soPelaFase = pode(eu, 'editarDados', { areaId: documento.areaId });
  return soPelaFase
    ? { codigo: 'sem_permissao', mensagem: 'Você só pode editar documentos devolvidos à sua área.' }
    : { codigo: 'sem_permissao' };
}

/**
 * Reenvio (contrato 4.5): a versão avançou exatamente uma vez, o último evento é uma
 * EDICAO deste autor e o documento já está igual ao pedido. Cobre duplo clique e
 * "Tentar novamente"; reenvio depois de outra ação intermediária fica para a F9.
 */
async function edicaoJaAplicada(db: Executor, documento: Documento, eu: Usuario, pedido: EdicaoDocumento) {
  if (documento.versao !== pedido.versao + 1) return null;
  const ultimo = await ultimoEvento(db, documento.id);
  if (!ultimo || ultimo.tipoAcao !== 'EDICAO' || ultimo.autorId !== eu.id) return null;
  const nomes = { tipoDocumento: documento.tipoDocumento, area: documento.area };
  return diferencasDocumento(documento, pedido, nomes).length === 0 ? ultimo : null;
}

type Resultado = { status: 200 | 201; documento: Documento; evento: EventoHistorico | null };

export function registrarRotasEdicao(escopo: FastifyInstance, banco: Banco) {
  escopo.put<{ Params: { id: string } }>('/documentos/:id/dados', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    // 1. Permissão geral.
    if (!pode(eu, 'verDocumentos')) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    // 2. Existência e visibilidade (não revela documento que a pessoa não vê).
    const visto = await buscarDocumento(banco, requisicao.params.id);
    if (!visto || !pode(eu, 'verDocumentos', { areaId: visto.areaId })) {
      return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    }
    // 3. Perfil para editar ESTE documento (área e fase).
    if (!pode(eu, 'editarDados', contextoEdicao(visto))) return enviarErro(resposta, 403, semPermissaoEdicao(eu, visto));
    // 4. Estado final (Aprovado/Cancelado), salvo possível reenvio.
    const final = motivoNaoEditavel(visto);
    if (final && !talvezReenvio(requisicao.body, visto)) {
      return enviarErro(resposta, 409, { codigo: 'acao_nao_permitida', mensagem: final });
    }
    // 5. Corpo: esquema fechado e a mesma validação do cadastro, antes da idempotência (B2 da F3).
    const validacao = validarEdicaoDocumento(requisicao.body);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;

    try {
      const resultado = await banco.transaction(async (tx): Promise<Resultado> => {
        const documento = (await buscarDocumentoParaAtualizar(tx, visto.id))!;
        // 6.1 Idempotência.
        const repetido = await edicaoJaAplicada(tx, documento, eu, pedido);
        if (repetido) return { status: 200, documento, evento: repetido };
        // 6.2 Concorrência otimista: nunca sobrescreve em silêncio.
        if (documento.versao !== pedido.versao) throw conflitoVersao(documento);
        // 6.3 Estado (e perfil de novo, sobre o estado bloqueado).
        const recusa = motivoNaoEditavel(documento);
        if (recusa) throw new ErroNegocio(409, { codigo: 'acao_nao_permitida', mensagem: recusa });
        if (!pode(eu, 'editarDados', contextoEdicao(documento))) throw new ErroNegocio(403, semPermissaoEdicao(eu, documento));

        // 6.4 Tipo e área: só conferidos quando mudam (o valor atual vale mesmo se inativado).
        let nomeTipo = documento.tipoDocumento;
        if (pedido.tipoDocumentoId !== documento.tipoDocumentoId) {
          const tipo = await buscarTipoAtivo(tx, pedido.tipoDocumentoId);
          if (!tipo) {
            throw new ErroNegocio(400, {
              codigo: 'dados_invalidos',
              campos: { tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.' },
            });
          }
          nomeTipo = tipo.nome;
        }
        let nomeArea = documento.area;
        if (pedido.areaId !== documento.areaId) {
          const area = await buscarAreaAtiva(tx, pedido.areaId);
          if (!area) throw new ErroNegocio(400, { codigo: 'dados_invalidos', campos: { areaId: 'Área não encontrada ou inativa.' } });
          if (!pode(eu, 'editarDados', { areaId: pedido.areaId, status: documento.status })) {
            throw new ErroNegocio(403, { codigo: 'sem_permissao', mensagem: 'Seu perfil não pode mover o documento para outra área.' });
          }
          nomeArea = area.nome;
        }

        // 6.5 Código + revisão (decisão 0004, P-06): conflito é erro, nunca fusão.
        const codigoOuRevisaoMudou = pedido.codigo !== documento.codigo || pedido.revisao !== documento.revisao;
        if (
          codigoOuRevisaoMudou &&
          pedido.codigo !== null &&
          (await existeOutroComCodigoRevisao(tx, pedido.codigo, pedido.revisao, documento.id))
        ) {
          throw new ErroNegocio(409, corpoErroCodigoRevisao(pedido.codigo, pedido.revisao));
        }

        // 6.6 Diferenças: nada mudou → 200 sem gravar (versão intacta).
        const detalhes = diferencasDocumento(documento, pedido, { tipoDocumento: nomeTipo, area: nomeArea });
        if (detalhes.length === 0) return { status: 200, documento, evento: null };

        // 6.7 Gravação com `WHERE versao = $n` (corrida no PostgreSQL real → conflito).
        const nomePasta = pedido.titulo === documento.titulo ? documento.nomePasta : sanitizarNomePasta(pedido.titulo);
        const atualizado = await aplicarEdicao(tx, documento.id, pedido.versao, pedido, nomePasta);
        if (!atualizado) throw conflitoVersao((await buscarDocumento(tx, documento.id))!);

        // 6.8 Evento EDICAO (contrato 4.4), autor do token.
        const idEvento = await registrarEvento(tx, {
          idDocumento: documento.id,
          codigo: atualizado.codigo,
          tipoAcao: 'EDICAO',
          status: atualizado.status,
          statusAnterior: null,
          destino: null,
          responsavel: null,
          responsavelId: null,
          autorId: eu.id,
          autorNome: eu.nome,
          detalhes,
          observacao: null,
        });
        return { status: 201, documento: atualizado, evento: (await buscarEvento(tx, idEvento))! };
      });
      const corpo: ResultadoEdicao = { documento: resultado.documento, evento: resultado.evento };
      return resposta.code(resultado.status).send(corpo);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      if ((erro as { code?: string }).code === VIOLACAO_UNICA) {
        // Corrida com outra gravação do mesmo código + revisão (PostgreSQL com várias conexões).
        const restricao = (erro as { constraint?: string }).constraint ?? String((erro as Error).message);
        if (restricao.includes('documentos_codigo_revisao') && pedido.codigo !== null) {
          return enviarErro(resposta, 409, corpoErroCodigoRevisao(pedido.codigo, pedido.revisao));
        }
      }
      throw erro;
    }
  });
}
