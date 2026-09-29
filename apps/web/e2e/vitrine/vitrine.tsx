/**
 * Vitrine SÓ para testes Playwright: renderiza a casca e as telas com sessão e API simuladas,
 * sem MSAL. Servida apenas pelo Vite em desenvolvimento (fora do build, que só usa index.html).
 * Dados fictícios.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import {
  FASE_DO_STATUS,
  diaEmSaoPaulo,
  exigeResponsavel,
  filtrarCartoes,
  nomeDownloadPrincipal,
  pode,
  podeReprogramarAgora,
  podeSerCancelado,
  somarDias,
  statusDeReativacao,
  transicaoPermitida,
  type Area,
  type ArquivoDocumento,
  type CartaoPainel,
  type Documento,
  type EventoHistorico,
  type Perfil,
  type Pessoa,
  type PessoaResumo,
  type ResultadoTransicao,
  type TipoDocumento,
} from '@docsync/compartilhado';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '../../src/estilos/tokens.css';
import '../../src/estilos/base.css';
import { ContextoApi, type Api } from '../../src/api/cliente.ts';
import { ErroApi } from '../../src/api/erros.ts';
import { podeCadastrarDocumento } from '../../src/permissoes.ts';
import { RedirecionarDocumento } from '../../src/App.tsx';
import { TelaNovoDocumento } from '../../src/telas/TelaNovoDocumento.tsx';
import { ContextoSessao } from '../../src/autenticacao/Sessao.tsx';
import { Casca } from '../../src/telas/Casca.tsx';
import { TelaInicio } from '../../src/telas/TelaInicio.tsx';
import { TelaPessoas } from '../../src/telas/TelaPessoas.tsx';
import { TelaPainel } from '../../src/telas/TelaPainel.tsx';
import { aplicarTema, temaSalvo } from '../../src/tema.ts';

const parametros = new URLSearchParams(location.search);
// ?perfil=Leitor|Solicitante muda o perfil simulado; ?envio=falha faz o 1º envio falhar (sem conexão).
// Painel: ?painel=vazio|erro|carregando; ?reprog=conflito faz a 1ª reprogramação dar 409 conflito_versao.
// Detalhes (F4): ?rota=/painel?documento=DOC-P6 abre direto; ?detalhes=erro|404|carregando; ?download=erro.
// Status (F5): ?status=conflito faz a 1ª etapa dar 409 conflito_versao; ?responsaveis=erro faz a lista falhar
// uma vez; ?desfazer=conflito faz o "Desfazer" dar 409.
const perfil = (parametros.get('perfil') ?? 'Administrador') as Perfil;
const eu: Pessoa = { id: 'p1', nome: 'Ana Exemplo', email: 'ana@exemplo.test', perfil, area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const pessoas: Pessoa[] = [
  eu,
  { id: 'p2', nome: 'Bruno Teste', email: 'bruno@exemplo.test', perfil: 'Qualidade', area: 'Engenharia', areaId: 'a3', status: 'Ativo' },
  { id: 'p3', nome: 'Carla Fictícia', email: 'carla.ficticia.com.nome.longo@exemplo.test', perfil: null, area: null, areaId: null, status: 'Ativo' },
  { id: 'p4', nome: 'Diego Modelo', email: 'diego@exemplo.test', perfil: 'Leitor', area: 'Suprimentos', areaId: 'a0', status: 'Inativo' },
];
const areas: Area[] = ['Suprimentos', 'Comercial', 'Qualidade', 'Engenharia'].map((nome, i) => ({ id: `a${i}`, nome, ativa: true }));
const tipos: TipoDocumento[] = ['IT - Instrução de Trabalho', 'PR - Procedimento', 'RL - Relatório'].map((nome, i) => ({ id: `TIPO-${i}`, nome, ativo: true }));
function documento(n: number, codigo: string | null, titulo: string, status: Documento['status'], area: Area): Documento {
  return {
    id: `DOC-${n}`, codigo, titulo, status, tipoDocumentoId: 'TIPO-1', tipoDocumento: 'PR - Procedimento', revisao: n % 3,
    dataRecebimento: `2026-09-${String(10 + n).padStart(2, '0')}`, dataRevisao: null, reprogramado: false, qtdReprogramacoes: 0, remetente: 'Ana Exemplo', areaId: area.id, area: area.nome,
    disciplina: null, observacao: null, nomePasta: titulo, nomeArquivoPrincipal: 'arquivo.pdf', qtdAnexos: 0, idDocumentoOrigem: null,
    responsavelId: null, responsavel: null, versao: 1, criadoPor: 'p1', criadoEm: '2026-09-20T12:00:00Z', dataModificacao: '2026-09-20T12:00:00Z',
  };
}
const recentes: Documento[] = [
  documento(1, 'MR-IND-0001-CTO-001', 'Procedimento de compras e contratos', 'Recebido', areas[0]!),
  documento(2, null, 'Instrução de solda em campo', 'Em revisão da qualidade', areas[3]!),
  documento(3, 'PR-QUA-0007', 'Controle de informação documentada', 'Devolvido para correção', areas[2]!),
  documento(4, 'IT-ENG-0042', 'Inspeção de andaimes', 'Para aprovação qualidade', areas[3]!),
  documento(5, 'RL-SUP-0003', 'Relatório de avaliação de fornecedores', 'Aprovado', areas[0]!),
  documento(6, 'AT-COM-0001', 'Ata da reunião de análise crítica', 'Cancelado', areas[1]!),
];
let falharEnvio = parametros.get('envio') === 'falha';

// Painel (F3). "Hoje" fixo para as capturas e as etiquetas serem estáveis.
const HOJE = '2026-09-29';
const modoPainel = parametros.get('painel');
let conflitoReprogramacao = parametros.get('reprog') === 'conflito';
function cartao(
  n: number, codigo: string | null, titulo: string, status: Documento['status'], area: Area,
  prazo: number | null, extra: Partial<CartaoPainel> = {},
): CartaoPainel {
  return {
    id: `DOC-P${n}`, codigo, titulo, revisao: n % 3, status, fase: FASE_DO_STATUS[status], tipoDocumento: 'PR - Procedimento',
    areaId: area.id, area: area.nome, remetente: ['Ana Exemplo', 'Bruno Teste', 'Célia Simulação'][n % 3]!,
    dataRecebimento: somarDias(HOJE, -20 - n), dataRevisao: prazo === null ? null : somarDias(HOJE, prazo),
    reprogramado: false, qtdReprogramacoes: 0, qtdDevolucoes: 0, dataAprovacao: null, dataInicioRevisao: null,
    responsavelId: null, responsavel: null, statusAntesDoCancelamento: null, versao: 1,
    criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-01T12:00:00Z', ...extra,
  };
}
const [suprimentos, comercial, qualidade, engenharia] = areas as [Area, Area, Area, Area];
// Responsáveis elegíveis (GET /responsaveis): ordem pt-BR, sem e-mail. Dados fictícios.
const responsaveis: PessoaResumo[] = [
  { id: 'p1', nome: eu.nome, perfil: perfil === 'Leitor' ? 'Qualidade' : perfil, areaId: eu.areaId, area: eu.area },
  { id: 'p2', nome: 'Bruno Teste', perfil: 'Qualidade', areaId: 'a3', area: 'Engenharia' },
  { id: 'p5', nome: 'Célia Simulação', perfil: 'Solicitante', areaId: 'a2', area: 'Qualidade' },
  { id: 'p6', nome: 'Eduardo Ficção', perfil: 'Solicitante', areaId: 'a3', area: 'Engenharia' },
  { id: 'p7', nome: 'Fernanda Amostra', perfil: 'Solicitante', areaId: 'a1', area: 'Comercial' },
];
const resp = (id: string) => {
  const p = responsaveis.find((r) => r.id === id)!;
  return { responsavelId: p.id, responsavel: p.nome };
};
let cartoes: CartaoPainel[] = modoPainel === 'vazio' ? [] : [
  cartao(1, 'PR-QUA-0010', 'Procedimento de auditoria interna', 'Recebido', qualidade, 20),
  cartao(2, null, 'Instrução de solda em campo', 'Recebido', engenharia, 3),
  cartao(3, null, 'Plano de emergência importado', 'Recebido', suprimentos, null),
  cartao(4, 'IT-ENG-0042', 'Inspeção de andaimes', 'Em revisão da qualidade', engenharia, -2, { reprogramado: true, qtdReprogramacoes: 1, dataInicioRevisao: somarDias(HOJE, -4), ...resp('p2') }),
  cartao(5, 'PR-SUP-0003', 'Compras emergenciais', 'Em revisão junto à área', suprimentos, 0, { dataInicioRevisao: somarDias(HOJE, -12), ...resp('p1') }),
  cartao(6, 'PR-QUA-0007', 'Controle de informação documentada', 'Devolvido para correção', qualidade, 10, {
    qtdDevolucoes: 2, reprogramado: true, qtdReprogramacoes: 2, dataRecebimento: '2026-09-01', dataInicioRevisao: '2026-09-02', ...resp('p5'),
  }),
  cartao(7, 'RL-COM-0001', 'Relatório de satisfação de clientes', 'Para aprovação qualidade', comercial, 1, { dataInicioRevisao: somarDias(HOJE, -20), ...resp('p2') }),
  cartao(8, 'PR-QUA-0001', 'Manual do Sistema de Gestão Integrada', 'Aprovado', qualidade, -5, { dataAprovacao: somarDias(HOJE, -6), dataInicioRevisao: somarDias(HOJE, -20) }),
  cartao(11, 'PR-SUP-0009', 'Procedimento de inventário anual', 'Aprovado', suprimentos, -20, {
    dataRecebimento: somarDias(HOJE, -60), dataInicioRevisao: somarDias(HOJE, -50), dataAprovacao: somarDias(HOJE, -2),
  }),
  cartao(12, 'IT-ENG-0050', 'Instrução de içamento de cargas', 'Em revisão da qualidade', engenharia, 25, { dataInicioRevisao: somarDias(HOJE, -3), ...resp('p6') }),
  cartao(13, 'PR-QUA-0012', 'Procedimento de calibração de instrumentos', 'Em revisão do solicitante', qualidade, 14, { dataInicioRevisao: somarDias(HOJE, -10), ...resp('p5') }),
  cartao(14, 'IT-ENG-0051', 'Instrução de trabalho em altura', 'Em revisão junto à área', engenharia, 18, { dataInicioRevisao: somarDias(HOJE, -8), ...resp('p6') }),
  cartao(9, 'AT-COM-0001', 'Ata da reunião de análise crítica', 'Cancelado', comercial, 4, { statusAntesDoCancelamento: 'Em revisão da qualidade', ...resp('p2') }),
  cartao(10, null, 'Formulário antigo de entrega de EPI', 'Cancelado', suprimentos, null),
];
function documentoDoCartao(c: CartaoPainel): Documento {
  return {
    ...documento(0, c.codigo, c.titulo, c.status, areas.find((a) => a.id === c.areaId)!),
    id: c.id, revisao: c.revisao, dataRecebimento: c.dataRecebimento, dataRevisao: c.dataRevisao, reprogramado: c.reprogramado,
    qtdReprogramacoes: c.qtdReprogramacoes, remetente: c.remetente, versao: c.versao, tipoDocumento: c.tipoDocumento,
    responsavelId: c.responsavelId, responsavel: c.responsavel,
  };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Detalhes (F4). ?detalhes=erro|404|carregando força os estados; ?download=erro faz o download falhar.
const modoDetalhes = parametros.get('detalhes');
const modoDownload = parametros.get('download');
let sequenciaEvento = 0;
function evento(
  idDocumento: string, tipoAcao: EventoHistorico['tipoAcao'], status: Documento['status'], statusAnterior: Documento['status'] | null,
  dataHora: string, autorNome: string, extra: Partial<EventoHistorico> = {},
): EventoHistorico {
  sequenciaEvento += 1;
  return {
    id: `HIST-${sequenciaEvento}`, idDocumento, codigo: null, tipoAcao, status, statusAnterior, dataHora, destino: null, responsavel: null,
    responsavelId: null, autorId: 'p1', autorNome, detalhes: [], observacao: null, ...extra,
  };
}
function arquivo(n: number, papel: ArquivoDocumento['papel'], nomeOriginal: string, tamanho: number): ArquivoDocumento {
  return { id: `ARQ-${n}`, papel, nomeOriginal, tamanho, criadoEm: '2026-09-01T12:00:00Z' };
}
const OBSERVACAO_LONGA =
  'Documento enviado para a revisão anual do SGI.\nConferir as referências normativas (ISO 9001:2015, 7.5) e a tabela de retenção de registros.\n\nA área pediu prioridade porque a auditoria externa está marcada para novembro.';
/** Eventos por documento, em ordem de gravação (a tela inverte). O DOC-P6 tem todos os tipos. */
const eventosPorDocumento = new Map<string, EventoHistorico[]>();
eventosPorDocumento.set('DOC-P6', [
  evento('DOC-P6', 'CRIACAO', 'Recebido', null, '2026-09-01T12:00:00Z', 'Ana Exemplo', {
    detalhes: [{ campo: 'dataRevisao', antes: null, depois: '2026-10-01' }], observacao: 'Documento enviado para a revisão anual do SGI.',
  }),
  evento('DOC-P6', 'STATUS', 'Em revisão da qualidade', 'Recebido', '2026-09-02T13:30:00Z', 'Bruno Teste', { destino: 'Qualidade', responsavel: 'Bruno Teste' }),
  evento('DOC-P6', 'STATUS', 'Devolvido para correção', 'Em revisão da qualidade', '2026-09-05T17:10:00Z', 'Bruno Teste', {
    observacao: 'Faltam as referências normativas na seção 4.',
  }),
  evento('DOC-P6', 'ANEXO', 'Devolvido para correção', null, '2026-09-08T11:00:00Z', 'Ana Exemplo', {
    detalhes: [
      { campo: 'arquivo', antes: null, depois: 'Checklist de revisão.xlsx' },
      { campo: 'arquivo', antes: null, depois: 'Evidência fotográfica.png' },
    ],
  }),
  evento('DOC-P6', 'EDICAO', 'Devolvido para correção', null, '2026-09-08T11:05:00Z', 'Ana Exemplo', {
    detalhes: [
      { campo: 'titulo', antes: 'Controle de documentos', depois: 'Controle de informação documentada' },
      { campo: 'disciplina', antes: null, depois: 'Corporativo' },
      { campo: 'dataRecebimento', antes: '2026-09-01', depois: '2026-09-03' },
    ],
  }),
  evento('DOC-P6', 'STATUS', 'Em revisão da qualidade', 'Devolvido para correção', '2026-09-09T14:00:00Z', 'Bruno Teste'),
  evento('DOC-P6', 'REPROGRAMACAO', 'Em revisão da qualidade', null, '2026-09-10T15:00:00Z', 'Ana Exemplo', {
    detalhes: [{ campo: 'dataRevisao', antes: '2026-10-01', depois: '2026-10-05' }],
    observacao: 'A área pediu mais prazo para incluir as referências normativas.',
  }),
  evento('DOC-P6', 'STATUS', 'Devolvido para correção', 'Em revisão da qualidade', '2026-09-15T18:20:00Z', 'Bruno Teste', {
    observacao: 'A tabela de retenção ainda está incompleta.',
  }),
  evento('DOC-P6', 'REPROGRAMACAO', 'Devolvido para correção', null, '2026-09-16T12:45:00Z', 'Ana Exemplo', {
    detalhes: [{ campo: 'dataRevisao', antes: '2026-10-05', depois: '2026-10-09' }],
    observacao: 'Nova devolução: prazo ajustado para a correção da tabela.',
  }),
]);
eventosPorDocumento.set('DOC-P9', [
  evento('DOC-P9', 'CRIACAO', 'Recebido', null, '2026-09-03T12:00:00Z', 'Carla Fictícia', { detalhes: [{ campo: 'dataRevisao', antes: null, depois: '2026-10-03' }] }),
  evento('DOC-P9', 'STATUS', 'Em revisão da qualidade', 'Recebido', '2026-09-04T12:00:00Z', 'Bruno Teste'),
  evento('DOC-P9', 'CANCELAMENTO', 'Cancelado', 'Em revisão da qualidade', '2026-09-06T12:00:00Z', 'Bruno Teste', {
    observacao: 'A ata foi substituída pela ata consolidada do trimestre.',
  }),
]);
const arquivosPorDocumento = new Map<string, ArquivoDocumento[]>([
  ['DOC-P6', [
    arquivo(1, 'principal', 'PR-QUA-0007 Controle de informação documentada.pdf', 250_880),
    arquivo(2, 'anexo', 'Anexo A - Fluxograma.pdf', 98_304),
    arquivo(3, 'anexo', 'Checklist de revisão.xlsx', 15_360),
    arquivo(4, 'anexo', 'Evidência fotográfica.png', 1_572_864),
  ]],
]);
const extrasDocumento: Record<string, Partial<Documento>> = {
  'DOC-P6': { disciplina: 'Corporativo', observacao: OBSERVACAO_LONGA, criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-16T12:45:00Z' },
};
/** Histórico coerente com o cartão (datas do ciclo iguais às do painel), para documentos sem eventos próprios. */
function eventosPadrao(c: CartaoPainel): EventoHistorico[] {
  const lista = [
    evento(c.id, 'CRIACAO', 'Recebido', null, `${c.dataRecebimento}T12:00:00Z`, c.remetente, { detalhes: [{ campo: 'dataRevisao', antes: null, depois: c.dataRevisao }] }),
  ];
  const extra = { responsavel: c.responsavel, responsavelId: c.responsavelId };
  if (c.dataInicioRevisao) {
    lista.push(evento(c.id, 'STATUS', 'Em revisão da qualidade', 'Recebido', `${c.dataInicioRevisao}T13:00:00Z`, 'Bruno Teste', extra));
    const atual = c.status === 'Aprovado' ? 'Para aprovação qualidade' : c.status;
    if (atual !== 'Em revisão da qualidade' && atual !== 'Cancelado') {
      lista.push(evento(c.id, 'STATUS', atual, 'Em revisão da qualidade', `${c.dataAprovacao ?? HOJE}T11:00:00Z`, 'Bruno Teste', extra));
    }
  }
  if (c.dataAprovacao) lista.push(evento(c.id, 'STATUS', 'Aprovado', 'Para aprovação qualidade', `${c.dataAprovacao}T14:00:00Z`, 'Bruno Teste'));
  return lista;
}

function detalheDe(c: CartaoPainel) {
  const documento = { ...documentoDoCartao(c), ...extrasDocumento[c.id] };
  const eventos = eventosPorDocumento.get(c.id) ?? eventosPadrao(c);
  eventosPorDocumento.set(c.id, eventos);
  const arquivos = arquivosPorDocumento.get(c.id) ?? [arquivo(100 + Number(c.id.replace(/\D/g, '')), 'principal', `${c.codigo ?? 'Documento sem código'}.pdf`, 340_000)];
  return { documento, arquivos, eventos, hoje: HOJE };
}

// F5: mudança de status, cancelamento, reativação e responsáveis, com as MESMAS regras puras da API
// (máquina de estados, `pode`, responsável obrigatório), para a vitrine recusar o que a API recusaria.
let conflitoStatus = parametros.get('status') === 'conflito';
// Duas falhas: o StrictMode do desenvolvimento roda o efeito de carga duas vezes ao abrir.
let falhasResponsaveis = parametros.get('responsaveis') === 'erro' ? 2 : 0;
let conflitoDesfazer = parametros.get('desfazer') === 'conflito';
const AGORA = '2026-09-29T15:00:00Z';
function documentoCompleto(c: CartaoPainel): Documento {
  return { ...documentoDoCartao(c), ...extrasDocumento[c.id], dataModificacao: AGORA };
}
function cartaoVisivel(id: string): CartaoPainel {
  const c = cartoes.find((x) => x.id === id);
  if (!c || (perfil === 'Solicitante' && c.areaId !== eu.areaId)) throw new ErroApi(404, 'nao_encontrado');
  return c;
}
function gravar(atual: CartaoPainel, novo: CartaoPainel, registrado: EventoHistorico): ResultadoTransicao {
  const anteriores = detalheDe(atual).eventos;
  cartoes = cartoes.map((c) => (c.id === novo.id ? novo : c));
  eventosPorDocumento.set(novo.id, [...anteriores, registrado]);
  return { documento: documentoCompleto(novo), evento: registrado };
}

function acharArquivo(id: string, arquivoId: string): { documento: Documento; arquivo: ArquivoDocumento } {
  const c = cartoes.find((x) => x.id === id);
  if (!c) throw new ErroApi(404, 'nao_encontrado');
  const detalhe = detalheDe(c);
  const achado = detalhe.arquivos.find((a) => a.id === arquivoId);
  if (!achado) throw new ErroApi(404, 'nao_encontrado');
  return { documento: detalhe.documento, arquivo: achado };
}

const api: Api = {
  eu: async () => eu,
  pessoas: async () => pessoas,
  areas: async () => areas,
  criarPessoa: async (d) => ({ id: 'novo', nome: d.nome, email: d.email, perfil: d.perfil ?? null, area: 'Qualidade', areaId: 'a2', status: 'Ativo' }),
  alterarPessoa: async (id) => pessoas.find((p) => p.id === id) ?? eu,
  tiposDocumento: async () => tipos,
  documentosRecentes: async () => recentes,
  documento: async (id) => {
    if (modoDetalhes === 'carregando') await new Promise(() => undefined);
    await esperar(150);
    if (modoDetalhes === 'erro') throw new ErroApi(0, 'sem_conexao');
    if (modoDetalhes === '404') throw new ErroApi(404, 'nao_encontrado');
    const c = cartoes.find((x) => x.id === id);
    // Como a API: o Solicitante não vê documento de outra área (404, como se não existisse).
    if (c && !(perfil === 'Solicitante' && c.areaId !== eu.areaId)) return detalheDe(c);
    const recente = recentes.find((d) => d.id === id);
    if (!recente) throw new ErroApi(404, 'nao_encontrado');
    return { documento: recente, arquivos: [], eventos: [], hoje: HOJE };
  },
  baixarArquivo: async (id, arquivoId) => {
    await esperar(400);
    if (modoDownload === 'erro') throw new ErroApi(404, 'arquivo_indisponivel');
    const { documento: d, arquivo: a } = acharArquivo(id, arquivoId);
    // Como o servidor (decisão 0014): principal `[código]-[título]_[revisão]=[versão].[ext]`, anexo com o nome original.
    const nomeArquivo = a.papel === 'principal' ? nomeDownloadPrincipal(d, a.nomeOriginal) : a.nomeOriginal;
    return { blob: new Blob(['conteudo ficticio'], { type: 'application/octet-stream' }), nomeArquivo };
  },
  painel: async (consulta = {}) => {
    if (modoPainel === 'carregando') await new Promise(() => undefined);
    await esperar(150);
    if (modoPainel === 'erro') throw new ErroApi(0, 'sem_conexao');
    const filtro = { busca: consulta.busca ?? '', areaId: consulta.areaId ?? null };
    // Como a API: o Solicitante só vê os documentos da sua área.
    const daPessoa = perfil === 'Solicitante' ? cartoes.filter((c) => c.areaId === eu.areaId) : cartoes;
    const visiveis = filtrarCartoes(daPessoa, filtro);
    return {
      cartoes: consulta.cancelados ? visiveis : visiveis.filter((c) => c.fase !== 'cancelado'),
      qtdCancelados: visiveis.filter((c) => c.fase === 'cancelado').length,
      hoje: HOJE,
    };
  },
  responsaveis: async () => {
    await esperar(150);
    if (falhasResponsaveis > 0) {
      falhasResponsaveis -= 1;
      throw new ErroApi(0, 'sem_conexao');
    }
    if (!pode(eu, 'mudarStatus')) throw new ErroApi(403, 'sem_permissao');
    return responsaveis;
  },
  mudarStatus: async (id, dados) => {
    await esperar(300);
    const atual = cartaoVisivel(id);
    if (!pode(eu, 'mudarStatus', { areaId: atual.areaId })) throw new ErroApi(403, 'sem_permissao');
    if (conflitoStatus) {
      // Outra pessoa registrou uma etapa antes: o documento foi para "Em revisão junto à área".
      conflitoStatus = false;
      const alterado: CartaoPainel = { ...atual, status: 'Em revisão junto à área', fase: 'revisao', versao: atual.versao + 1, ...resp('p2') };
      cartoes = cartoes.map((c) => (c.id === id ? alterado : c));
      throw new ErroApi(409, 'conflito_versao', {}, documentoCompleto(alterado));
    }
    if (dados.versao !== atual.versao) throw new ErroApi(409, 'conflito_versao', {}, documentoCompleto(atual));
    if (!transicaoPermitida(atual.status, dados.para)) {
      throw new ErroApi(409, 'acao_nao_permitida', {}, null, `Não é possível ir de ${atual.status} para ${dados.para}.`);
    }
    if (!pode(eu, 'mudarStatus', { areaId: atual.areaId, transicao: { de: atual.status, para: dados.para } })) {
      throw new ErroApi(403, 'sem_permissao', {}, null, 'Seu perfil não pode aplicar esta etapa.');
    }
    const pessoa = responsaveis.find((r) => r.id === dados.responsavelId) ?? null;
    if (exigeResponsavel(dados.para) && !pessoa) {
      throw new ErroApi(400, 'dados_invalidos', { responsavelId: 'Informe o responsável por esta etapa.' });
    }
    const fase = FASE_DO_STATUS[dados.para];
    const novo: CartaoPainel = {
      ...atual, status: dados.para, fase, versao: atual.versao + 1,
      responsavelId: dados.para === 'Aprovado' ? null : (pessoa?.id ?? null),
      responsavel: dados.para === 'Aprovado' ? null : (pessoa?.nome ?? null),
      dataAprovacao: dados.para === 'Aprovado' ? diaEmSaoPaulo(AGORA) : atual.dataAprovacao,
      dataInicioRevisao: atual.dataInicioRevisao ?? (fase === 'revisao' ? diaEmSaoPaulo(AGORA) : null),
      qtdDevolucoes: atual.qtdDevolucoes + (fase === 'devolvido' && atual.fase !== 'devolvido' ? 1 : 0),
    };
    return gravar(atual, novo, evento(id, 'STATUS', dados.para, atual.status, AGORA, eu.nome, {
      codigo: atual.codigo, responsavel: novo.responsavel, responsavelId: novo.responsavelId, observacao: dados.observacao,
    }));
  },
  cancelarDocumento: async (id, dados) => {
    await esperar(300);
    const atual = cartaoVisivel(id);
    if (!pode(eu, 'cancelarDocumento', { areaId: atual.areaId })) throw new ErroApi(403, 'sem_permissao');
    if (!podeSerCancelado(atual.status)) throw new ErroApi(409, 'acao_nao_permitida', {}, null, 'Documento aprovado é final e não pode ser cancelado.');
    if (dados.versao !== atual.versao) throw new ErroApi(409, 'conflito_versao', {}, documentoCompleto(atual));
    const novo: CartaoPainel = { ...atual, status: 'Cancelado', fase: 'cancelado', versao: atual.versao + 1, statusAntesDoCancelamento: atual.status };
    return gravar(atual, novo, evento(id, 'CANCELAMENTO', 'Cancelado', atual.status, AGORA, eu.nome, {
      codigo: atual.codigo, responsavel: atual.responsavel, responsavelId: atual.responsavelId, observacao: dados.motivo,
    }));
  },
  reativarDocumento: async (id, dados) => {
    await esperar(300);
    const atual = cartaoVisivel(id);
    if (!pode(eu, 'reativarDocumento', { areaId: atual.areaId })) throw new ErroApi(403, 'sem_permissao');
    if (atual.status !== 'Cancelado') throw new ErroApi(409, 'acao_nao_permitida', {}, null, 'Só documentos cancelados podem ser reativados.');
    if (conflitoDesfazer) {
      conflitoDesfazer = false;
      throw new ErroApi(409, 'conflito_versao', {}, documentoCompleto({ ...atual, versao: atual.versao + 1 }));
    }
    if (dados.versao !== atual.versao) throw new ErroApi(409, 'conflito_versao', {}, documentoCompleto(atual));
    // Decisão 0004: volta ao status anterior ao último cancelamento, lido do histórico.
    const volta = statusDeReativacao(detalheDe(atual).eventos);
    const novo: CartaoPainel = { ...atual, status: volta, fase: FASE_DO_STATUS[volta], versao: atual.versao + 1, statusAntesDoCancelamento: null };
    return gravar(atual, novo, evento(id, 'STATUS', volta, 'Cancelado', AGORA, eu.nome, {
      codigo: atual.codigo, responsavel: atual.responsavel, responsavelId: atual.responsavelId, observacao: dados.observacao,
    }));
  },
  reprogramarPrazo: async (id, dados) => {
    await esperar(300);
    const atual = cartoes.find((c) => c.id === id);
    if (!atual) throw new ErroApi(404, 'nao_encontrado');
    // Decisão 0015: só com prazo vencido (a API responde 409 acao_nao_permitida).
    if (!podeReprogramarAgora(atual, HOJE)) {
      throw new ErroApi(409, 'acao_nao_permitida', {}, null, 'O prazo ainda não venceu: só é possível reprogramar depois do vencimento.');
    }
    if (conflitoReprogramacao) {
      // Outra pessoa mexeu antes (registrou uma etapa): versão nova, o prazo continua vencido.
      conflitoReprogramacao = false;
      const alterado = { ...atual, versao: atual.versao + 1 };
      cartoes = cartoes.map((c) => (c.id === id ? alterado : c));
      throw new ErroApi(409, 'conflito_versao', {}, documentoDoCartao(alterado));
    }
    if (dados.versao !== atual.versao) throw new ErroApi(409, 'conflito_versao', {}, documentoDoCartao(atual));
    const novo = { ...atual, dataRevisao: dados.novoPrazo, versao: atual.versao + 1, reprogramado: true, qtdReprogramacoes: atual.qtdReprogramacoes + 1 };
    cartoes = cartoes.map((c) => (c.id === id ? novo : c));
    const registrado = evento(id, 'REPROGRAMACAO', novo.status, null, '2026-09-29T12:00:00Z', eu.nome, {
      codigo: novo.codigo, detalhes: [{ campo: 'dataRevisao', antes: atual.dataRevisao, depois: dados.novoPrazo }], observacao: dados.justificativa,
    });
    // A linha do tempo dos detalhes ganha o evento (como a API grava em eventos_historico).
    eventosPorDocumento.set(id, [...(detalheDe(atual).eventos), registrado]);
    return { documento: { ...documentoDoCartao(novo), ...extrasDocumento[id], dataModificacao: '2026-09-29T12:00:00Z' }, evento: registrado };
  },
  criarDocumento: async (d, principal, anexos) => {
    await new Promise((r) => setTimeout(r, 300));
    if (falharEnvio) {
      falharEnvio = false;
      throw new ErroApi(0, 'sem_conexao');
    }
    const area = areas.find((a) => a.id === d.areaId) ?? areas[0]!;
    const criado: Documento = {
      ...documento(99, d.codigo, d.titulo, 'Recebido', area),
      id: d.id, revisao: d.revisao, dataRecebimento: HOJE, dataRevisao: somarDias(HOJE, 30), tipoDocumento: tipos.find((t) => t.id === d.tipoDocumentoId)?.nome ?? '',
      nomeArquivoPrincipal: principal.name, qtdAnexos: anexos.length, remetente: d.remetente, observacao: d.observacao,
    };
    // Entra no quadro e nos detalhes ("Abrir detalhes" do toast, F4), com os arquivos enviados.
    cartoes = [...cartoes, cartao(99, criado.codigo, criado.titulo, 'Recebido', area, 30, { id: criado.id, revisao: criado.revisao, remetente: criado.remetente, dataRecebimento: HOJE })];
    extrasDocumento[criado.id] = { observacao: criado.observacao };
    arquivosPorDocumento.set(criado.id, [
      arquivo(900, 'principal', principal.name, principal.size),
      ...anexos.map((f, i) => arquivo(901 + i, 'anexo', f.name, f.size)),
    ]);
    return criado;
  },
};

aplicarTema(temaSalvo());
const rota = parametros.get('rota') ?? '/';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route element={<Casca />}>
              <Route index element={<TelaInicio />} />
              <Route path="painel" element={<TelaPainel />} />
              <Route path="pessoas" element={<TelaPessoas />} />
              <Route path="documentos/:id" element={<RedirecionarDocumento />} />
              <Route
                path="documentos/novo"
                element={podeCadastrarDocumento(eu) ? <TelaNovoDocumento /> : <Navigate to="/" replace />}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>
  </StrictMode>,
);
