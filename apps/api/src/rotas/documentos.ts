import { createHash } from 'node:crypto';
import type { Multipart } from '@fastify/multipart';
import {
  LIMITES_ARQUIVO,
  STATUS_INICIAL,
  pode,
  sanitizarNomePasta,
  validarArquivo,
  validarConjuntoArquivos,
  type DetalheDocumento,
  type Documento,
  type ErroApi,
  type NovoDocumento,
} from '@docsync/compartilhado';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ErroArmazenamento,
  planejarArquivos,
  type ArmazenamentoArquivos,
  type ArquivoParaSalvar,
  type PapelArquivo,
} from '../armazenamento/arquivos.ts';
import { enviarErro } from '../autenticacao/plugin.ts';
import type { Banco, Executor } from '../banco/conexao.ts';
import {
  buscarDocumento,
  buscarOrigemCadastro,
  buscarTipoAtivo,
  existeCodigoRevisao,
  inserirArquivos,
  inserirDocumento,
  listarEventos,
  listarRecentes,
  listarTiposAtivos,
  registrarEvento,
} from '../banco/documentos.ts';
import { buscarAreaAtiva, type Usuario } from '../banco/pessoas.ts';
import { validarNovoDocumento } from '../validacao.ts';

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

function podeVer(eu: Usuario, documento: Documento): boolean {
  return pode(eu, 'verDocumentos', { areaId: documento.areaId });
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

        await inserirDocumento(tx, {
          ...dados,
          status: STATUS_INICIAL, // P-03: nunca vem do corpo.
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
          detalhes: [],
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

  escopo.get<{ Params: { id: string } }>('/documentos/:id', async (requisicao, resposta) => {
    const eu = requisicao.usuario;
    if (!pode(eu, 'verDocumentos')) return enviarErro(resposta, 403, { codigo: 'sem_permissao' });
    const documento = await buscarDocumento(banco, requisicao.params.id);
    // Sem permissão para este documento = mesmo 404 de inexistente (não revela existência).
    if (!documento || !podeVer(eu, documento)) return enviarErro(resposta, 404, { codigo: 'nao_encontrado' });
    const detalhe: DetalheDocumento = { documento, eventos: await listarEventos(banco, documento.id) };
    return detalhe;
  });
}
