import { createHash } from 'node:crypto';
import type { Multipart } from '@fastify/multipart';
import {
  LIMITES_ARQUIVO,
  STATUS_INICIAL,
  calcularPrazoAutomatico,
  filtrarCartoes,
  lerReprogramacao,
  nomeDownloadPrincipal,
  pode,
  sanitizarNomePasta,
  validarArquivo,
  validarConjuntoArquivos,
  validarNovoPrazo,
  type CartaoPainel,
  type DetalheDocumento,
  type Documento,
  type ErroApi,
  type EventoHistorico,
  type NovaReprogramacao,
  type NovoDocumento,
  type RespostaPainel,
  type ResultadoReprogramacao,
} from '@docsync/compartilhado';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ErroArmazenamento,
  planejarArquivos,
  type ArmazenamentoArquivos,
  sanitizarNomeArquivo,
  type ArquivoParaSalvar,
  type PapelArquivo,
} from '../armazenamento/arquivos.ts';
import { cabecalhosDownload } from '../armazenamento/download.ts';
import { enviarErro } from '../autenticacao/plugin.ts';
import type { Banco, Executor } from '../banco/conexao.ts';
import {
  aplicarReprogramacao,
  buscarArquivoDoDocumento,
  buscarDocumento,
  buscarDocumentoParaAtualizar,
  buscarEvento,
  buscarOrigemCadastro,
  buscarTipoAtivo,
  existeCodigoRevisao,
  inserirArquivos,
  inserirDocumento,
  listarArquivos,
  listarCartoes,
  listarEventos,
  listarRecentes,
  listarTiposAtivos,
  paraArquivoDocumento,
  registrarAcessoArquivo,
  registrarEvento,
  ultimoEvento,
} from '../banco/documentos.ts';
import { buscarArea, buscarAreaAtiva, type Usuario } from '../banco/pessoas.ts';
import { hojeNoFuso } from '../datas.ts';
import { validarNovaReprogramacao, validarNovoDocumento, validarQueryPainel, validarQueryVazia } from '../validacao.ts';

const MB = 1024 * 1024;
const LIMITE_ARQUIVO_BYTES = LIMITES_ARQUIVO.tamanhoMaximoMB * MB;
const LIMITE_TOTAL_BYTES = LIMITES_ARQUIVO.totalMaximoMB * MB;
const QTD_RECENTES = 10;
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

const ERRO_CODIGO_REVISAO = (codigo: string, revisao: number) =>
  new ErroNegocio(409, {
    codigo: 'codigo_revisao_existente',
    mensagem: `Já existe um documento com o código ${codigo} na revisão ${revisao}.`,
    campos: { codigo: 'Este código já está cadastrado nesta revisão.' },
  });

const ERRO_ID_EXISTENTE = new ErroNegocio(409, {
  codigo: 'id_existente',
  mensagem: 'Este identificador de cadastro já foi usado. Recarregue o formulário e tente de novo.',
});

// ---------------------------------------------------------------------------
// Visibilidade (documento 02, seção 7.3): a mesma função `pode` decide.
// ---------------------------------------------------------------------------

/** Área que nenhum documento tem: pergunta a `pode` se a pessoa vê "qualquer área". */
const AREA_QUALQUER = 'AREA-__qualquer__';

/**
 * null = vê todas as áreas; texto = só essa área; 'nenhuma' = não vê documentos.
 * Derivado da função única de permissão, para a regra não existir em dois lugares.
 */
function areaVisivel(eu: Usuario): string | null | 'nenhuma' {
  if (!pode(eu, 'verDocumentos')) return 'nenhuma';
  if (pode(eu, 'verDocumentos', { areaId: AREA_QUALQUER })) return null;
  return eu.areaId ?? 'nenhuma';
}

function podeVer(eu: Usuario, documento: Pick<Documento, 'areaId'>): boolean {
  return pode(eu, 'verDocumentos', { areaId: documento.areaId });
}

// ---------------------------------------------------------------------------
// Reprogramação: detecção de reenvio (contrato F3, 3.3)
// ---------------------------------------------------------------------------

/**
 * O pedido já foi aplicado? Sim quando `documento.versao === pedido.versao + 1` e o
 * último evento do documento é REPROGRAMACAO do mesmo autor, com o mesmo prazo novo
 * e a mesma justificativa (já aparada). Devolve esse evento, ou null.
 * Recebe o pedido já validado pelo esquema fechado (B2 do QA): só compara, não grava.
 */
async function reprogramacaoJaAplicada(
  db: Executor,
  documento: Documento,
  eu: Usuario,
  pedido: NovaReprogramacao,
): Promise<EventoHistorico | null> {
  if (documento.versao !== pedido.versao + 1) return null;
  const ultimo = await ultimoEvento(db, documento.id);
  if (!ultimo || ultimo.tipoAcao !== 'REPROGRAMACAO' || ultimo.autorId !== eu.id) return null;
  if (ultimo.observacao !== pedido.justificativa) return null;
  const prazo = lerReprogramacao(ultimo);
  return prazo && prazo.prazoNovo === pedido.novoPrazo ? ultimo : null;
}

// ---------------------------------------------------------------------------
// Leitura do formulário multipart
// ---------------------------------------------------------------------------

interface ArquivoLido {
  papel: PapelArquivo;
  nomeOriginal: string;
  tipoMime: string;
  conteudo: Buffer;
}

interface FormularioLido {
  dados: unknown;
  principais: ArquivoLido[];
  anexos: ArquivoLido[];
  campos: Record<string, string>;
}

const PAPEL_DO_CAMPO: Record<string, PapelArquivo> = { arquivoPrincipal: 'principal', anexos: 'anexo' };

/** Descarta o restante de um arquivo sem guardar na memória. */
async function descartar(parte: Extract<Multipart, { type: 'file' }>) {
  for await (const _ of parte.file) {
    // só consome
  }
}

/**
 * Lê as partes do formulário: 'dados' (JSON), 'arquivoPrincipal' e 'anexos'.
 * Valida cada arquivo ao chegar (extensão, tamanho) e o conjunto (quantidade, total).
 * Arquivo recusado é descartado; nada vai para o disco aqui.
 */
async function lerFormulario(requisicao: FastifyRequest): Promise<FormularioLido> {
  const lido: FormularioLido = { dados: undefined, principais: [], anexos: [], campos: {} };
  let qtdDados = 0;
  let totalBytes = 0;
  let qtdAnexosRecebidos = 0;

  const erroArquivo = (campo: 'arquivoPrincipal' | 'anexos', mensagem: string) => {
    lido.campos[campo] ??= mensagem;
  };

  try {
    const partes = requisicao.parts({
      limits: {
        fileSize: LIMITE_ARQUIVO_BYTES,
        // Folga acima do máximo para responder com mensagem clara em vez de cortar.
        files: LIMITES_ARQUIVO.maxAnexos + 10,
        fields: 5,
        fieldSize: 100_000,
        parts: LIMITES_ARQUIVO.maxAnexos + 15,
      },
    });
    for await (const parte of partes) {
      if (parte.type === 'field') {
        if (parte.fieldname !== 'dados') {
          lido.campos[parte.fieldname] = 'Campo não permitido.';
          continue;
        }
        qtdDados++;
        lido.dados = parte.value;
        continue;
      }

      const papel = PAPEL_DO_CAMPO[parte.fieldname];
      if (!papel) {
        lido.campos[parte.fieldname] = 'Campo não permitido.';
        await descartar(parte);
        continue;
      }
      const campo = papel === 'principal' ? 'arquivoPrincipal' : 'anexos';
      if (papel === 'anexo') qtdAnexosRecebidos++;

      if (totalBytes > LIMITE_TOTAL_BYTES) {
        await descartar(parte);
        continue;
      }
      const conteudo = await parte.toBuffer();
      const tamanho = parte.file.truncated ? LIMITE_ARQUIVO_BYTES + 1 : conteudo.length;
      totalBytes += tamanho;
      const problema = validarArquivo(parte.filename, tamanho);
      if (problema) {
        erroArquivo(campo, papel === 'anexo' ? `${parte.filename}: ${problema}` : problema);
        continue;
      }
      const arquivo = { papel, nomeOriginal: parte.filename, tipoMime: parte.mimetype, conteudo };
      (papel === 'principal' ? lido.principais : lido.anexos).push(arquivo);
    }
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;
    if (codigo === 'FST_FILES_LIMIT' || codigo === 'FST_PARTS_LIMIT') {
      erroArquivo('anexos', `Envie no máximo ${LIMITES_ARQUIVO.maxAnexos} anexos.`);
    } else if (codigo === 'FST_INVALID_JSON_FIELD_ERROR') {
      lido.campos.dados = 'Os dados do documento não estão em JSON válido.';
    } else if (typeof codigo === 'string' && codigo.startsWith('FST_')) {
      lido.campos.formulario = 'Formulário inválido. Tente enviar de novo.';
    } else {
      throw erro;
    }
  }

  // Parte 'dados': texto JSON (ou já interpretada, se enviada como application/json).
  if (qtdDados > 1) lido.campos.dados = 'Envie os dados do documento uma única vez.';
  else if (qtdDados === 0) lido.campos.dados ??= 'Envie os dados do documento.';
  else if (typeof lido.dados === 'string') {
    try {
      lido.dados = JSON.parse(lido.dados);
    } catch {
      lido.campos.dados = 'Os dados do documento não estão em JSON válido.';
    }
  }

  // P-02: exatamente um arquivo principal, com mensagem no próprio campo.
  const principaisRecebidos = lido.principais.length + (lido.campos.arquivoPrincipal ? 1 : 0);
  if (principaisRecebidos === 0) erroArquivo('arquivoPrincipal', 'Selecione o arquivo do documento principal.');
  else if (principaisRecebidos > 1) lido.campos.arquivoPrincipal = 'Envie um único arquivo principal.';

  const conjunto = validarConjuntoArquivos(qtdAnexosRecebidos, totalBytes);
  if (conjunto) erroArquivo(qtdAnexosRecebidos > 0 ? 'anexos' : 'arquivoPrincipal', conjunto);

  return lido;
}

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

/**
 * Resumo do pedido de cadastro normalizado: dados validados + papel, nome e conteúdo
 * de cada arquivo, na ordem recebida. Reenvio idêntico → mesmo resumo.
 */
function resumoCadastro(dados: NovoDocumento, arquivos: readonly ArquivoLido[]): string {
  const hash = createHash('sha256');
  const dadosOrdenados = Object.fromEntries(Object.entries(dados).sort(([a], [b]) => a.localeCompare(b)));
  hash.update(JSON.stringify(dadosOrdenados));
  for (const a of arquivos) {
    const conteudo = createHash('sha256').update(a.conteudo).digest('hex');
    hash.update(`\n${a.papel}\u0000${a.nomeOriginal}\u0000${a.conteudo.length}\u0000${conteudo}`);
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export interface OpcoesRotasDocumentos {
  banco: Banco;
  armazenamento: ArmazenamentoArquivos;
}

/** Rotas protegidas da F2: tipos de documento e cadastro/consulta de documentos. */
export function registrarRotasDocumentos(escopo: FastifyInstance, { banco, armazenamento }: OpcoesRotasDocumentos) {
  escopo.get('/tipos-documento', async () => listarTiposAtivos(banco));

  escopo.post('/documentos', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    // Pré-checagem antes de receber arquivos: quem não cadastra em área nenhuma para aqui.
    const podeAlgumaArea =
      pode(eu, 'cadastrarDocumento', { areaId: AREA_QUALQUER }) ||
      (eu.areaId !== null && pode(eu, 'cadastrarDocumento', { areaId: eu.areaId }));
    if (!podeAlgumaArea) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });

    if (!requisicao.isMultipart()) {
      return enviarErro(resposta, 400, {
        codigo: 'dados_invalidos',
        mensagem: 'Envie o formulário como multipart/form-data.',
      });
    }

    const formulario = await lerFormulario(requisicao);
    const validacao = formulario.campos.dados ? null : validarNovoDocumento(formulario.dados);
    const campos = { ...formulario.campos, ...(validacao && !validacao.ok ? validacao.campos : {}) };
    if (!validacao || !validacao.ok || Object.keys(campos).length > 0) {
      return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos });
    }
    const dados = validacao.dados;

    if (!pode(eu, 'cadastrarDocumento', { areaId: dados.areaId })) {
      return enviarErro(resposta, 403, {
        codigo: 'sem_permissao',
        mensagem: 'Você só pode cadastrar documentos da sua área.',
      });
    }

    const principal = formulario.principais[0]!;
    const arquivosLidos = [principal, ...formulario.anexos];
    const hashCadastro = resumoCadastro(dados, arquivosLidos);
    const planejados: ArquivoParaSalvar[] = planejarArquivos(arquivosLidos);

    return cadastrar(requisicao, resposta, { dados, eu, principal, planejados, hashCadastro, qtdAnexos: formulario.anexos.length });
  });

  async function cadastrar(
    requisicao: FastifyRequest,
    resposta: FastifyReply,
    p: {
      dados: NovoDocumento;
      eu: Usuario;
      principal: ArquivoLido;
      planejados: ArquivoParaSalvar[];
      hashCadastro: string;
      qtdAnexos: number;
    },
  ) {
    const { dados, eu } = p;
    /** Idempotência: mesmo autor e mesmo pedido → devolve o existente; senão, conflito. */
    const decidirExistente = async (executor: Executor) => {
      const origem = await buscarOrigemCadastro(executor, dados.id);
      if (!origem) return null;
      if (origem.criadoPor !== eu.id || origem.hashCadastro !== p.hashCadastro) throw ERRO_ID_EXISTENTE;
      return (await buscarDocumento(executor, dados.id))!;
    };

    let gravouArquivos = false;
    try {
      const resultado = await banco.transaction(async (tx) => {
        const existente = await decidirExistente(tx);
        if (existente) return { criado: false, documento: existente };

        if (!(await buscarTipoAtivo(tx, dados.tipoDocumentoId))) {
          throw new ErroNegocio(400, {
            codigo: 'dados_invalidos',
            campos: { tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.' },
          });
        }
        if (!(await buscarAreaAtiva(tx, dados.areaId))) {
          throw new ErroNegocio(400, { codigo: 'dados_invalidos', campos: { areaId: 'Área não encontrada ou inativa.' } });
        }
        if (dados.codigo !== null && (await existeCodigoRevisao(tx, dados.codigo, dados.revisao))) {
          throw ERRO_CODIGO_REVISAO(dados.codigo, dados.revisao);
        }

        // Decisões 0011 e 0012: data de recebimento = dia do cadastro (fuso de São Paulo);
        // prazo = esse dia + 30. Nunca vêm do corpo, e não entram no resumo de idempotência.
        const dataRecebimento = hojeNoFuso();
        const dataRevisao = calcularPrazoAutomatico(dataRecebimento);
        await inserirDocumento(tx, {
          ...dados,
          status: STATUS_INICIAL, // P-03: nunca vem do corpo.
          dataRecebimento,
          dataRevisao,
          nomePasta: sanitizarNomePasta(dados.titulo),
          nomeArquivoPrincipal: p.principal.nomeOriginal,
          qtdAnexos: p.qtdAnexos,
          criadoPor: eu.id,
          hashCadastro: p.hashCadastro,
        });
        await inserirArquivos(
          tx,
          dados.id,
          p.planejados.map((a) => ({
            papel: a.papel,
            nomeOriginal: a.nomeOriginal,
            nomeArmazenado: a.nomeArmazenado,
            tamanho: a.conteudo.length,
            tipoMime: a.tipoMime,
          })),
        );
        await registrarEvento(tx, {
          idDocumento: dados.id,
          codigo: dados.codigo,
          tipoAcao: 'CRIACAO',
          status: STATUS_INICIAL,
          statusAnterior: null,
          destino: null,
          responsavel: null,
          autorId: eu.id, // Autor sempre do token.
          autorNome: eu.nome,
          // O histórico mostra de onde veio o prazo (contrato F3, 2.2).
          detalhes: [{ campo: 'dataRevisao', antes: null, depois: dataRevisao }],
          observacao: dados.observacao,
        });

        // Último passo da transação: se o disco falhar, o banco é desfeito
        // (e `salvar` já apagou o que tinha gravado nesta chamada).
        await armazenamento.salvar(dados.id, p.planejados);
        gravouArquivos = true;
        return { criado: true, documento: (await buscarDocumento(tx, dados.id))! };
      });
      return resposta.code(resultado.criado ? 201 : 200).send(resultado.documento);
    } catch (erro) {
      // Falha depois de gravar os arquivos (ex.: no COMMIT): apaga os arquivos.
      if (gravouArquivos) {
        await armazenamento
          .remover(
            dados.id,
            p.planejados.map((a) => a.nomeArmazenado),
          )
          .catch((e: unknown) => requisicao.log.error(e, 'falha ao desfazer arquivos do cadastro'));
      }
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      if (erro instanceof ErroArmazenamento) {
        requisicao.log.error(erro, 'falha do armazenamento no cadastro');
        return enviarErro(resposta, 500, {
          codigo: 'erro_interno',
          mensagem: 'Não foi possível gravar os arquivos. Nada foi cadastrado; tente de novo.',
        });
      }
      if ((erro as { code?: string }).code === VIOLACAO_UNICA) {
        // Corrida com outro envio (em PostgreSQL com várias conexões): decide de novo.
        const restricao = (erro as { constraint?: string }).constraint ?? String((erro as Error).message);
        if (restricao.includes('documentos_codigo_revisao') && dados.codigo !== null) {
          return enviarErro(resposta, 409, ERRO_CODIGO_REVISAO(dados.codigo, dados.revisao).corpo);
        }
        try {
          const existente = await decidirExistente(banco);
          if (existente) return resposta.code(200).send(existente);
        } catch (e) {
          if (e instanceof ErroNegocio) return enviarErro(resposta, e.status, e.corpo);
          throw e;
        }
      }
      throw erro;
    }
  }

  escopo.get('/documentos/recentes', async (requisicao, resposta) => {
    const area = areaVisivel(requisicao.usuario);
    if (area === 'nenhuma') return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    const documentos = await listarRecentes(banco, area, QTD_RECENTES);
    // Conferência final pela mesma função de permissão.
    return documentos.filter((d) => podeVer(requisicao.usuario, d));
  });

  // Sem HEAD automático (o Fastify criaria um para cada GET): HEAD não é usado pela
  // interface e, no download, executaria a rota inteira e gravaria um acesso falso.
  const semHead = { exposeHeadRoute: false } as const;

  escopo.get<{ Params: { id: string } }>('/documentos/:id', semHead, async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    // Ordem de decisão do contrato F4 (2.2): permissão geral → existência/visibilidade →
    // resposta. Esquema fechado também na query.
    if (!pode(eu, 'verDocumentos')) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    const documento = await buscarDocumento(banco, requisicao.params.id);
    // Sem permissão para este documento = mesmo 404 de inexistente (não revela existência).
    if (!documento || !podeVer(eu, documento)) return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    const query = validarQueryVazia(requisicao.query);
    if (!query.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: query.campos });
    const detalhe: DetalheDocumento = {
      documento,
      arquivos: (await listarArquivos(banco, documento.id)).map(paraArquivoDocumento),
      eventos: await listarEventos(banco, documento.id),
      hoje: hojeNoFuso(),
    };
    return detalhe;
  });

  // --- Arquivos: download (F4, contrato seções 4 e 10; decisão 0014) ------------------

  type ParamsArquivo = { Params: { id: string; arquivoId: string } };

  /**
   * Entrega um arquivo do documento para download. Ordem de decisão do contrato (4.2):
   * permissão geral → existência/visibilidade do documento → permissão da ação →
   * arquivo pertence a ESTE documento → conteúdo no armazenamento → registro de
   * acesso → resposta. O conteúdo sai como foi gravado (sem marca d'água, decisão 0014).
   */
  escopo.get<ParamsArquivo>('/documentos/:id/arquivos/:arquivoId', semHead, async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    const { id, arquivoId } = requisicao.params;
    if (!pode(eu, 'verDocumentos')) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    const documento = await buscarDocumento(banco, id);
    if (!documento || !podeVer(eu, documento)) return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    if (!pode(eu, 'baixarArquivo', { areaId: documento.areaId })) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
    const query = validarQueryVazia(requisicao.query);
    if (!query.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: query.campos });

    // O arquivoId sozinho nunca localiza nada: tem de pertencer a este documento.
    const arquivo = await buscarArquivoDoDocumento(banco, documento.id, arquivoId);
    if (!arquivo) return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });

    let conteudo: Buffer | null;
    try {
      conteudo = await armazenamento.ler(documento.id, arquivo.nomeArmazenado);
    } catch (erro) {
      // Inclui nome armazenado inválido (nunca lê fora da pasta). Só IDs no log.
      requisicao.log.error({ idDocumento: documento.id, idArquivo: arquivo.id }, 'falha do armazenamento na leitura');
      return enviarErro(resposta, 500, { codigo: 'erro_interno' });
    }
    if (conteudo === null) {
      requisicao.log.error({ idDocumento: documento.id, idArquivo: arquivo.id }, 'arquivo registrado sem conteúdo no armazenamento');
      return enviarErro(resposta, 404, {
        codigo: 'arquivo_indisponivel',
        mensagem: 'Este arquivo não está disponível no momento. Avise o administrador do DocSync.',
      });
    }

    // Registro imutável de acesso, com autor do token (decisão 0014, item 3).
    await registrarAcessoArquivo(banco, {
      idDocumento: documento.id,
      idArquivo: arquivo.id,
      tipo: 'DOWNLOAD',
      autorId: eu.id,
      autorNome: eu.nome,
    });

    // Decisão 0014 (item 4): principal como `[código]-[título]_[revisão]=[versão].[ext]`
    // (versão 1 até a F7); anexo com o nome original.
    const nome =
      arquivo.papel === 'principal'
        ? nomeDownloadPrincipal(documento, arquivo.nomeArmazenado)
        : sanitizarNomeArquivo(arquivo.nomeOriginal);
    return resposta.code(200).headers(cabecalhosDownload(nome, arquivo.nomeArmazenado, conteudo.length)).send(conteudo);
  });

  // --- Painel (F3, contrato seção 4) --------------------------------------------------

  escopo.get('/painel', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    const area = areaVisivel(eu);
    if (area === 'nenhuma') return enviarErro(resposta, 403, { codigo: 'sem_permissao' });

    const validacao = validarQueryPainel(requisicao.query);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const filtro = validacao.dados;
    if (filtro.areaId !== null && !(await buscarArea(banco, filtro.areaId))) {
      return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: { areaId: 'Área não encontrada.' } });
    }

    // Carrega tudo o que a pessoa pode ver (com cancelados, para contar) e aplica busca
    // e área com a mesma função pura da interface. Conferência final por cartão com `pode`.
    // Pendência anotada: filtrar em SQL quando a base crescer.
    const visiveis = (await listarCartoes(banco, area, true)).filter((c) => podeVer(eu, c));
    const filtrados = filtrarCartoes(visiveis, { busca: filtro.busca, areaId: filtro.areaId });
    const cancelados = filtrados.filter((c) => c.fase === 'cancelado');
    const cartoes: CartaoPainel[] = filtro.cancelados ? filtrados : filtrados.filter((c) => c.fase !== 'cancelado');
    const painel: RespostaPainel = { cartoes, qtdCancelados: cancelados.length, hoje: hojeNoFuso() };
    return painel;
  });

  // --- Reprogramação do prazo (F3, contrato seção 3) -----------------------------------

  const STATUS_SEM_PRAZO = new Set<Documento['status']>(['Aprovado', 'Cancelado']);

  escopo.post<{ Params: { id: string } }>('/documentos/:id/reprogramacoes', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    // Ordem de decisão do contrato (3.3): permissão geral → existência/visibilidade →
    // permissão da ação → estado → corpo (esquema fechado e formato) → transação
    // (idempotência → conflito de versão → estado → "só adia" → gravação).
    if (!pode(eu, 'verDocumentos')) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    const visto = await buscarDocumento(banco, requisicao.params.id);
    if (!visto || !podeVer(eu, visto)) return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    if (!pode(eu, 'reprogramarPrazo', { areaId: visto.areaId })) {
      return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    }
    if (STATUS_SEM_PRAZO.has(visto.status)) {
      return enviarErro(resposta, 409, {
        codigo: 'acao_nao_permitida',
        mensagem: `Documento ${visto.status === 'Aprovado' ? 'aprovado' : 'cancelado'} não tem prazo a reprogramar.`,
      });
    }
    // Corpo: esquema fechado, formato e "não anterior a hoje" (B2 do QA: campo desconhecido
    // é 400 mesmo num reenvio idêntico). A regra "só adia", que depende do prazo atual,
    // fica para dentro da transação, depois da idempotência e do conflito de versão.
    const hoje = hojeNoFuso();
    const validacao = validarNovaReprogramacao(requisicao.body, null, hoje);
    if (!validacao.ok) return enviarErro(resposta, 400, { codigo: 'dados_invalidos', campos: validacao.campos });
    const pedido = validacao.dados;

    try {
      const resultado = await banco.transaction(async (tx) => {
        const documento = (await buscarDocumentoParaAtualizar(tx, visto.id))!;

        // Idempotência (contrato 3.3), com a linha bloqueada: reenvio idêntico já aplicado
        // responde 200 sem gravar. Vem antes da regra "só adia" porque o reenvio, por
        // definição, traz um prazo igual ao atual e reprovaria nela.
        const repetido = await reprogramacaoJaAplicada(tx, documento, eu, pedido);
        if (repetido) return { criado: false, documento, evento: repetido };
        // Concorrência otimista (B1 do QA): versão desatualizada → conflito com o estado
        // atual, antes de qualquer regra que dependa do prazo que a pessoa não viu.
        if (documento.versao !== pedido.versao) {
          throw new ErroNegocio(409, {
            codigo: 'conflito_versao',
            mensagem: 'Alguém alterou este documento. Veja o prazo atual e tente de novo.',
            documento,
          });
        }
        // O estado pode ter mudado entre a leitura sem bloqueio e esta (mesma versão = mesmo
        // prazo e status, mas a conferência é barata e mantém a regra num lugar só).
        if (STATUS_SEM_PRAZO.has(documento.status)) {
          throw new ErroNegocio(409, { codigo: 'acao_nao_permitida', mensagem: 'Documento não tem prazo a reprogramar.' });
        }
        // "Só adia" (decisão 0012), contra o prazo atual da linha bloqueada.
        const erroPrazo = validarNovoPrazo(pedido.novoPrazo, documento.dataRevisao, hoje);
        if (erroPrazo) {
          throw new ErroNegocio(400, { codigo: 'dados_invalidos', campos: { novoPrazo: erroPrazo } });
        }

        const atualizado = await aplicarReprogramacao(tx, documento.id, pedido.versao, pedido.novoPrazo);
        if (!atualizado) {
          throw new ErroNegocio(409, {
            codigo: 'conflito_versao',
            mensagem: 'Alguém alterou este documento. Veja o prazo atual e tente de novo.',
            documento: (await buscarDocumento(tx, documento.id))!,
          });
        }
        const idEvento = await registrarEvento(tx, {
          idDocumento: documento.id,
          codigo: documento.codigo,
          tipoAcao: 'REPROGRAMACAO',
          status: documento.status,
          statusAnterior: null,
          destino: null,
          responsavel: null,
          autorId: eu.id, // Autor sempre do token.
          autorNome: eu.nome,
          detalhes: [{ campo: 'dataRevisao', antes: documento.dataRevisao, depois: pedido.novoPrazo }],
          observacao: pedido.justificativa,
        });
        return { criado: true, documento: atualizado, evento: (await buscarEvento(tx, idEvento))! };
      });
      const corpo: ResultadoReprogramacao = { documento: resultado.documento, evento: resultado.evento };
      return resposta.code(resultado.criado ? 201 : 200).send(corpo);
    } catch (erro) {
      if (erro instanceof ErroNegocio) return enviarErro(resposta, erro.status, erro.corpo);
      throw erro;
    }
  });
}
