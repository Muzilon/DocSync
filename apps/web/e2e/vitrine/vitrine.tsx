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
  filtrarCartoes,
  somarDias,
  type Area,
  type CartaoPainel,
  type Documento,
  type Perfil,
  type Pessoa,
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
    versao: 1, criadoPor: 'p1', criadoEm: '2026-09-20T12:00:00Z', dataModificacao: '2026-09-20T12:00:00Z',
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
    reprogramado: false, qtdReprogramacoes: 0, qtdDevolucoes: 0, dataAprovacao: null, versao: 1,
    criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-01T12:00:00Z', ...extra,
  };
}
const [suprimentos, comercial, qualidade, engenharia] = areas as [Area, Area, Area, Area];
let cartoes: CartaoPainel[] = modoPainel === 'vazio' ? [] : [
  cartao(1, 'PR-QUA-0010', 'Procedimento de auditoria interna', 'Recebido', qualidade, 20),
  cartao(2, null, 'Instrução de solda em campo', 'Recebido', engenharia, 3),
  cartao(3, null, 'Plano de emergência importado', 'Recebido', suprimentos, null),
  cartao(4, 'IT-ENG-0042', 'Inspeção de andaimes', 'Em revisão da qualidade', engenharia, -2, { reprogramado: true, qtdReprogramacoes: 1 }),
  cartao(5, 'PR-SUP-0003', 'Compras emergenciais', 'Em revisão junto à área', suprimentos, 0),
  cartao(6, 'PR-QUA-0007', 'Controle de informação documentada', 'Devolvido para correção', qualidade, 10, { qtdDevolucoes: 2, reprogramado: true, qtdReprogramacoes: 2 }),
  cartao(7, 'RL-COM-0001', 'Relatório de satisfação de clientes', 'Para aprovação qualidade', comercial, 1),
  cartao(8, 'PR-QUA-0001', 'Manual do Sistema de Gestão Integrada', 'Aprovado', qualidade, -5, { dataAprovacao: somarDias(HOJE, -6) }),
  cartao(9, 'AT-COM-0001', 'Ata da reunião de análise crítica', 'Cancelado', comercial, 4),
  cartao(10, null, 'Formulário antigo de entrega de EPI', 'Cancelado', suprimentos, null),
];
function documentoDoCartao(c: CartaoPainel): Documento {
  return {
    ...documento(0, c.codigo, c.titulo, c.status, areas.find((a) => a.id === c.areaId)!),
    id: c.id, revisao: c.revisao, dataRecebimento: c.dataRecebimento, dataRevisao: c.dataRevisao, reprogramado: c.reprogramado,
    qtdReprogramacoes: c.qtdReprogramacoes, remetente: c.remetente, versao: c.versao, tipoDocumento: c.tipoDocumento,
  };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const api: Api = {
  eu: async () => eu,
  pessoas: async () => pessoas,
  areas: async () => areas,
  criarPessoa: async (d) => ({ id: 'novo', nome: d.nome, email: d.email, perfil: d.perfil ?? null, area: 'Qualidade', areaId: 'a2', status: 'Ativo' }),
  alterarPessoa: async (id) => pessoas.find((p) => p.id === id) ?? eu,
  tiposDocumento: async () => tipos,
  documentosRecentes: async () => recentes,
  documento: async (id) => {
    const achado = recentes.find((d) => d.id === id);
    if (!achado) throw new ErroApi(404, 'desconhecido');
    return { documento: achado, eventos: [] };
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
  reprogramarPrazo: async (id, dados) => {
    await esperar(300);
    const atual = cartoes.find((c) => c.id === id);
    if (!atual) throw new ErroApi(404, 'nao_encontrado');
    if (conflitoReprogramacao) {
      // Outra pessoa reprogramou antes: prazo +7 dias e versão nova.
      conflitoReprogramacao = false;
      const alterado = { ...atual, dataRevisao: somarDias(atual.dataRevisao ?? HOJE, 7), versao: atual.versao + 1, reprogramado: true, qtdReprogramacoes: atual.qtdReprogramacoes + 1 };
      cartoes = cartoes.map((c) => (c.id === id ? alterado : c));
      throw new ErroApi(409, 'conflito_versao', {}, documentoDoCartao(alterado));
    }
    if (dados.versao !== atual.versao) throw new ErroApi(409, 'conflito_versao', {}, documentoDoCartao(atual));
    const novo = { ...atual, dataRevisao: dados.novoPrazo, versao: atual.versao + 1, reprogramado: true, qtdReprogramacoes: atual.qtdReprogramacoes + 1 };
    cartoes = cartoes.map((c) => (c.id === id ? novo : c));
    return {
      documento: documentoDoCartao(novo),
      evento: {
        id: 'HIST-1', idDocumento: id, codigo: novo.codigo, tipoAcao: 'REPROGRAMACAO', status: novo.status, statusAnterior: null,
        dataHora: '2026-09-29T12:00:00Z', destino: null, responsavel: null, autorId: eu.id, autorNome: eu.nome,
        detalhes: [{ campo: 'dataRevisao', antes: atual.dataRevisao, depois: dados.novoPrazo }], observacao: dados.justificativa,
      },
    };
  },
  criarDocumento: async (d, principal, anexos) => {
    await new Promise((r) => setTimeout(r, 300));
    if (falharEnvio) {
      falharEnvio = false;
      throw new ErroApi(0, 'sem_conexao');
    }
    const area = areas.find((a) => a.id === d.areaId) ?? areas[0]!;
    return {
      ...documento(99, d.codigo, d.titulo, 'Recebido', area),
      id: d.id, revisao: d.revisao, dataRecebimento: HOJE, dataRevisao: somarDias(HOJE, 30), tipoDocumento: tipos.find((t) => t.id === d.tipoDocumentoId)?.nome ?? '',
      nomeArquivoPrincipal: principal.name, qtdAnexos: anexos.length,
    };
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
