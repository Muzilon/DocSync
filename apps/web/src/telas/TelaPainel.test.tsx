import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import {
  FASE_DO_STATUS,
  somarDias,
  type Area,
  type CartaoPainel,
  type Documento,
  type NovaReprogramacao,
  type Pessoa,
  type RespostaPainel,
  type ResultadoTransicao,
} from '@docsync/compartilhado';
import { ContextoApi, queryPainel, type Api } from '../api/cliente.ts';
import { ErroApi } from '../api/erros.ts';
import { ContextoSessao } from '../autenticacao/Sessao.tsx';
import { ProvedorToast } from '../componentes/Toast.tsx';
import { prazoMinimo } from '../componentes/DialogoReprogramar.tsx';
import { TelaPainel, ordenarCartoesPainel } from './TelaPainel.tsx';
import { RedirecionarDocumento } from '../App.tsx';

// Dados fictícios (CLAUDE.md, seção 4). "Hoje" vem do servidor simulado.
const HOJE = '2026-09-29';
const QUALIDADE: Pessoa = { id: 'USR-1', nome: 'Bruna Teste', email: 'bruna@exemplo.test', perfil: 'Qualidade', area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const ADMIN: Pessoa = { ...QUALIDADE, id: 'USR-0', perfil: 'Administrador' };
const SOLICITANTE: Pessoa = { ...QUALIDADE, id: 'USR-2', perfil: 'Solicitante', area: 'Engenharia', areaId: 'a1' };
const LEITOR: Pessoa = { ...QUALIDADE, id: 'USR-3', perfil: 'Leitor' };

// Fora de ordem de propósito (e com uma inativa): o filtro precisa ordenar e esconder a inativa.
const AREAS: Area[] = [
  { id: 'a3', nome: 'Suprimentos', ativa: true },
  { id: 'a1', nome: 'Engenharia', ativa: true },
  { id: 'a9', nome: 'Área Antiga', ativa: false },
  { id: 'a2', nome: 'Qualidade', ativa: true },
  { id: 'a4', nome: 'Ética', ativa: true },
];

function cartao(id: string, titulo: string, status: CartaoPainel['status'], prazo: number | null, extra: Partial<CartaoPainel> = {}): CartaoPainel {
  return {
    id, codigo: `COD-${id}`, titulo, revisao: 0, status, fase: FASE_DO_STATUS[status], tipoDocumento: 'PR - Procedimento',
    areaId: 'a2', area: 'Qualidade', remetente: 'Ana Exemplo', dataRecebimento: '2026-09-01',
    dataRevisao: prazo === null ? null : somarDias(HOJE, prazo), reprogramado: false, qtdReprogramacoes: 0,
    qtdDevolucoes: 0, dataAprovacao: null, dataInicioRevisao: null, responsavelId: null, responsavel: null,
    statusAntesDoCancelamento: null, versao: 3, criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-01T12:00:00Z',
    ...extra,
  };
}

const CARTOES: CartaoPainel[] = [
  cartao('DOC-1', 'Procedimento de auditoria', 'Recebido', 20),
  cartao('DOC-2', 'Instrução de solda', 'Recebido', 3, { areaId: 'a1', area: 'Engenharia', codigo: null }),
  cartao('DOC-3', 'Inspeção de andaimes', 'Em revisão da qualidade', -2, {
    reprogramado: true, qtdReprogramacoes: 1, responsavelId: 'USR-5', responsavel: 'Célia Maria Teste',
  }),
  cartao('DOC-4', 'Controle de informação', 'Devolvido para correção', 0, { qtdDevolucoes: 2, remetente: 'José Ação' }),
  cartao('DOC-5', 'Relatório de clientes', 'Para aprovação qualidade', null),
  // Aprovado neste mês (01/09 → 25/09: 24 dias, dentro da meta de 40).
  cartao('DOC-6', 'Manual do SGI', 'Aprovado', -5, { dataAprovacao: '2026-09-25' }),
];
const CANCELADOS: CartaoPainel[] = [
  cartao('DOC-7', 'Ata de reunião', 'Cancelado', 4, { statusAntesDoCancelamento: 'Em revisão da qualidade' }),
  cartao('DOC-8', 'Formulário de EPI', 'Cancelado', null, { areaId: 'a1', area: 'Engenharia' }),
];

function resposta(cartoes = CARTOES, qtdCancelados = CANCELADOS.length): RespostaPainel {
  return { cartoes, qtdCancelados, hoje: HOJE };
}

function documentoDe(c: CartaoPainel, mudancas: Partial<Documento> = {}): Documento {
  return {
    id: c.id, codigo: c.codigo, titulo: c.titulo, status: c.status, tipoDocumentoId: 'TIPO-1', tipoDocumento: c.tipoDocumento,
    revisao: c.revisao, dataRecebimento: c.dataRecebimento, dataRevisao: c.dataRevisao, reprogramado: c.reprogramado,
    qtdReprogramacoes: c.qtdReprogramacoes, remetente: c.remetente, areaId: c.areaId, area: c.area, disciplina: null,
    observacao: null, nomePasta: c.titulo, nomeArquivoPrincipal: 'a.pdf', qtdAnexos: 0, idDocumentoOrigem: null,
    responsavelId: c.responsavelId, responsavel: c.responsavel,
    versao: c.versao, criadoPor: 'USR-9', criadoEm: c.criadoEm, dataModificacao: c.dataModificacao, ...mudancas,
  };
}

function apiSimulada(sobrescrever: Partial<Api> = {}): Api {
  return {
    eu: vi.fn(),
    pessoas: vi.fn(),
    areas: vi.fn().mockResolvedValue(AREAS),
    criarPessoa: vi.fn(),
    alterarPessoa: vi.fn(),
    tiposDocumento: vi.fn(),
    criarDocumento: vi.fn(),
    baixarArquivo: vi.fn(),
    documentosRecentes: vi.fn(),
    documento: vi.fn(),
    painel: vi.fn(async (consulta) =>
      consulta?.cancelados ? resposta([...CARTOES, ...CANCELADOS]) : resposta(),
    ),
    reprogramarPrazo: vi.fn(async (id: string, dados: NovaReprogramacao) => {
      const atual = CARTOES.find((c) => c.id === id)!;
      const documento = documentoDe(atual, {
        dataRevisao: dados.novoPrazo, versao: atual.versao + 1, reprogramado: true, qtdReprogramacoes: atual.qtdReprogramacoes + 1,
      });
      return { documento, evento: {} as never };
    }),
    responsaveis: vi.fn().mockResolvedValue([]),
    mudarStatus: vi.fn(async (id: string, dados) => {
      const atual = [...CARTOES, ...CANCELADOS].find((c) => c.id === id)!;
      return { documento: documentoDe(atual, { status: dados.para, responsavelId: dados.responsavelId, versao: atual.versao + 1 }), evento: {} as never };
    }),
    cancelarDocumento: vi.fn(async (id: string) => {
      const atual = CARTOES.find((c) => c.id === id)!;
      return { documento: documentoDe(atual, { status: 'Cancelado', versao: atual.versao + 1 }), evento: {} as never };
    }),
    reativarDocumento: vi.fn(async (id: string, dados) => {
      const atual = [...CARTOES, ...CANCELADOS].find((c) => c.id === id)!;
      const status = atual.statusAntesDoCancelamento ?? atual.status;
      return { documento: documentoDe(atual, { status, versao: dados.versao + 1 }), evento: {} as never } as ResultadoTransicao;
    }),
    ...sobrescrever,
  };
}

function renderizar(api: Api, eu: Pessoa = QUALIDADE) {
  const usuario = userEvent.setup();
  render(
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter>
          <ProvedorToast>
            <TelaPainel />
          </ProvedorToast>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>,
  );
  return usuario;
}

const quadro = () => screen.findByRole('region', { name: 'Quadro de tramitação' });
const coluna = (nome: RegExp) => screen.getByRole('region', { name: nome });
const kpi = (rotulo: string) => screen.getByText(rotulo).parentElement!;
const cartaoDe = (titulo: string) => screen.getByRole('article', { name: titulo });
const botaoDe = (titulo: string) => screen.getByRole('button', { name: `${titulo}, abrir detalhes` });

describe('queryPainel', () => {
  it('só manda parâmetros preenchidos (a API recusa desconhecidos)', () => {
    expect(queryPainel()).toBe('');
    expect(queryPainel({ busca: '  ', areaId: null, cancelados: false })).toBe('');
    expect(queryPainel({ busca: 'solda', areaId: 'AREA-1', cancelados: true })).toBe('?busca=solda&areaId=AREA-1&cancelados=true');
  });
});

describe('ordenarCartoesPainel (B6)', () => {
  it('prazo crescente com nulos no fim, depois criadoEm, depois id (mesma chave do servidor)', () => {
    const lista = [
      cartao('DOC-b', 'Sem prazo', 'Recebido', null),
      cartao('DOC-z', 'Prazo 5, criado antes', 'Recebido', 5, { criadoEm: '2026-08-01T10:00:00Z' }),
      cartao('DOC-c', 'Prazo 5, criado depois, id c', 'Recebido', 5, { criadoEm: '2026-09-02T10:00:00Z' }),
      cartao('DOC-a', 'Sem prazo, id a', 'Recebido', null),
      cartao('DOC-y', 'Prazo 1', 'Recebido', 1),
      cartao('DOC-B', 'Prazo 5, criado depois, id B', 'Recebido', 5, { criadoEm: '2026-09-02T10:00:00Z' }),
    ];
    expect(ordenarCartoesPainel(lista).map((c) => c.id)).toEqual(['DOC-y', 'DOC-z', 'DOC-B', 'DOC-c', 'DOC-a', 'DOC-b']);
    expect(lista[0]!.id).toBe('DOC-b'); // não altera a lista original
  });
});

describe('prazoMinimo', () => {
  it('é o maior entre hoje e o dia seguinte ao prazo atual', () => {
    expect(prazoMinimo('2026-10-10', HOJE)).toBe('2026-10-11');
    expect(prazoMinimo('2026-09-01', HOJE)).toBe(HOJE);
    expect(prazoMinimo(null, HOJE)).toBe(HOJE);
  });
});

describe('TelaPainel', () => {
  it('carregando: esqueleto com aria-busy e KPIs com "—", nunca 0 falso', async () => {
    renderizar(apiSimulada({ painel: vi.fn(() => new Promise<RespostaPainel>(() => undefined)) }));
    const esqueleto = screen.getByRole('region', { name: 'Quadro de tramitação' });
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(within(kpi('Em tramitação')).getByText('—')).toBeInTheDocument();
    expect(within(kpi('Atrasados')).queryByText('0')).not.toBeInTheDocument();
  });

  it('KPIs e 5 colunas por fase, sem cancelados no quadro', async () => {
    renderizar(apiSimulada());
    await quadro();
    expect(within(kpi('Em tramitação')).getByText('5')).toBeInTheDocument();
    expect(within(kpi('Vencendo em até 5 dias')).getByText('2')).toBeInTheDocument();
    expect(within(kpi('Atrasados')).getByText('1')).toBeInTheDocument();
    // P-12: quarto KPI, com o mês por extenso e a meta de 40 dias.
    const aprovados = kpi('Aprovados no mês');
    expect(within(aprovados).getByText('1')).toBeInTheDocument();
    expect(aprovados).toHaveTextContent('Concluídos em setembro de 2026');
    expect(aprovados).toHaveTextContent('1 dentro da meta de 40 dias');

    const colunas = within(await quadro()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(colunas).toEqual([
      'Recebido2, 2 documentos',
      'Em Revisão1, 1 documento',
      'Devolvido à Área1, 1 documento',
      'Em Aprovação1, 1 documento',
      'Aprovado1, 1 documento',
    ]);
    expect(screen.queryByText('Ata de reunião')).not.toBeInTheDocument();
    expect(within(coluna(/^Recebido/)).getAllByRole('article')).toHaveLength(2);
  });

  it('cartão no estilo do Planner (decisão 0015): etiquetas, título, área, prazo curto e responsável; sem botões', async () => {
    renderizar(apiSimulada());
    await quadro();
    // Prazo curto: neutro em dia, laranja vencendo, vermelho vencido; o estado vai no texto acessível.
    const auditoria = cartaoDe('Procedimento de auditoria');
    const prazoNeutro = within(auditoria).getByText('19/10').parentElement!;
    expect(prazoNeutro).toHaveAttribute('data-tom', 'neutro');
    expect(prazoNeutro).toHaveTextContent('Vence em 20 dias, prazo 19/10/2026');
    expect(within(cartaoDe('Instrução de solda')).getByText('02/10').parentElement).toHaveAttribute('data-tom', 'alerta');
    expect(cartaoDe('Instrução de solda')).toHaveTextContent('Vence em 3 dias, prazo 02/10/2026');
    const andaimes = cartaoDe('Inspeção de andaimes');
    expect(within(andaimes).getByText('27/09').parentElement).toHaveAttribute('data-tom', 'erro');
    expect(andaimes).toHaveTextContent('Atrasado há 2 dias, prazo 27/09/2026');
    expect(within(cartaoDe('Controle de informação')).getByText('29/09').parentElement).toHaveTextContent('Vence hoje');
    // Etiquetas no topo: status e "Reprogramado".
    expect(within(andaimes).getByText('Em revisão da qualidade')).toBeInTheDocument();
    expect(within(andaimes).getByText(/Reprogramado/)).toHaveAttribute('title', 'Reprogramado 1 vez');
    // Responsável: iniciais (desenho) e nome como texto acessível.
    expect(within(andaimes).getByText('CT')).toHaveAttribute('aria-hidden', 'true');
    expect(within(andaimes).getByText('Responsável: Célia Maria Teste')).toHaveClass('visualmente-oculto');
    expect(within(auditoria).queryByText(/Responsável/)).not.toBeInTheDocument();
    // Área no lugar da lista de verificação do Planner.
    expect(within(auditoria).getByText('Área:')).toHaveClass('visualmente-oculto');
    expect(auditoria).toHaveTextContent('Qualidade');
    // Fora do cartão (ficam nos detalhes): código, revisão, remetente, tipo, devoluções, recebimento.
    expect(auditoria).not.toHaveTextContent(/COD-DOC-1|Rev\.|Recebido em|PR - Procedimento|Ana Exemplo/);
    expect(cartaoDe('Controle de informação')).not.toHaveTextContent(/Devolvido 2 vezes|José Ação|↺/);
    // Aprovado sem prazo.
    expect(within(cartaoDe('Manual do SGI')).queryByText(/\d{2}\/\d{2}/)).not.toBeInTheDocument();
    // Nenhum botão de ação: o único controle é o título, que abre os detalhes.
    for (const artigo of screen.getAllByRole('article')) {
      const botoes = within(artigo).getAllByRole('button');
      expect(botoes).toHaveLength(1);
      expect(botoes[0]).toHaveAccessibleName(/, abrir detalhes$/);
    }
  });

  it('busca sem acento filtra no cliente, atualiza a contagem e os KPIs', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await quadro();
    expect(screen.getByText('6 documentos encontrados')).toBeInTheDocument();
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar por título, código, remetente ou responsável' }), 'jose acao');
    expect(screen.getByText('1 documento encontrado')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(within(kpi('Em tramitação')).getByText('1')).toBeInTheDocument();
    expect(within(coluna(/^Recebido/)).getByText('Nenhum documento nesta fase')).toBeInTheDocument();
    // A contagem de cancelados é pedida ao servidor com a busca em vigor.
    await waitFor(() => expect(api.painel).toHaveBeenCalledWith({ busca: 'jose acao', areaId: null }));
  });

  it('filtro de área: todas as áreas ativas em ordem pt-BR; vazio por filtro com "Limpar filtros"', async () => {
    const usuario = renderizar(apiSimulada());
    await quadro();
    const area = screen.getByRole('combobox', { name: 'Área' });
    await waitFor(() => expect(within(area).getAllByRole('option')).toHaveLength(5));
    expect(within(area).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas as áreas', 'Engenharia', 'Ética', 'Qualidade', 'Suprimentos',
    ]);
    await usuario.selectOptions(area, 'a1');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await usuario.selectOptions(area, 'a3');
    expect(screen.getByText('Nenhum documento corresponde à busca')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(area).toHaveValue('');
  });

  it('Solicitante: sem seleção de área; mostra "Área: <a dele>" em texto (provisório)', async () => {
    renderizar(apiSimulada(), SOLICITANTE);
    await quadro();
    expect(screen.queryByRole('combobox', { name: 'Área' })).not.toBeInTheDocument();
    const filtros = screen.getByRole('search', { name: 'Filtrar documentos' });
    expect(filtros).toHaveTextContent('Área: Engenharia');
    // A busca continua procurando no remetente e no responsável, mesmo sem o nome aparecer no cartão.
    expect(screen.getByRole('searchbox', { name: 'Buscar por título, código, remetente ou responsável' })).toBeInTheDocument();
  });

  it('Cancelados (N) abre a janela com os cancelados, respeitando a área', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await quadro();
    await usuario.click(screen.getByRole('button', { name: 'Cancelados (2)' }));
    const janela = await screen.findByRole('dialog', { name: 'Documentos cancelados (2)' });
    expect(await within(janela).findByRole('article', { name: 'Ata de reunião' })).toBeInTheDocument();
    expect(within(janela).getByRole('article', { name: 'Formulário de EPI' })).toBeInTheDocument();
    expect(within(janela).queryByRole('button', { name: /Reprogramar/ })).not.toBeInTheDocument();
    expect(api.painel).toHaveBeenCalledWith({ cancelados: true });
    await usuario.click(within(janela).getByRole('button', { name: 'Fechar' }));

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Área' }), 'a1');
    await usuario.click(screen.getByRole('button', { name: /^Cancelados/ }));
    const filtrada = await screen.findByRole('dialog', { name: 'Documentos cancelados (1)' });
    expect(within(filtrada).getByRole('article', { name: 'Formulário de EPI' })).toBeInTheDocument();
  });

  it('janela de cancelados vazia', async () => {
    const usuario = renderizar(apiSimulada({ painel: vi.fn().mockResolvedValue(resposta(CARTOES, 0)) }));
    await quadro();
    await usuario.click(screen.getByRole('button', { name: 'Cancelados (0)' }));
    expect(await screen.findByText('Nenhum documento cancelado')).toBeInTheDocument();
  });

  it('B4: sem contagem, o título da janela não traz número; ao reabrir não mostra a lista antiga', async () => {
    let resolverCancelados: ((r: RespostaPainel) => void) | null = null;
    const painel = vi.fn((consulta?: { cancelados?: boolean }) =>
      consulta?.cancelados
        ? new Promise<RespostaPainel>((resolver) => {
            resolverCancelados = resolver;
          })
        : Promise.resolve(resposta()),
    );
    const usuario = renderizar(apiSimulada({ painel: painel as unknown as Api['painel'] }));
    await quadro();
    // Busca que muda a contagem: enquanto o servidor não responde, a contagem fica a de antes;
    // com erro na contagem, o botão e a janela ficam sem número.
    painel.mockImplementationOnce(() => Promise.reject(new Error('falha')));
    await usuario.type(screen.getByRole('searchbox', { name: /Buscar/ }), 'ata');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelados' })).toBeInTheDocument(), { timeout: 2000 });
    await usuario.click(screen.getByRole('button', { name: 'Cancelados' }));
    const janela = await screen.findByRole('dialog', { name: 'Documentos cancelados' });
    expect(within(janela).getByText('Carregando documentos cancelados…')).toBeInTheDocument();
    expect(within(janela).queryByText(/\(0\)/)).not.toBeInTheDocument();
    resolverCancelados!(resposta([...CARTOES, ...CANCELADOS]));
    expect(await screen.findByRole('dialog', { name: 'Documentos cancelados (1)' })).toBeInTheDocument();
    await usuario.click(within(janela).getByRole('button', { name: 'Fechar' }));

    // Reabre: enquanto a nova resposta não chega, só "carregando", nunca a lista anterior.
    await usuario.click(screen.getByRole('button', { name: 'Cancelados' }));
    const reaberta = await screen.findByRole('dialog', { name: 'Documentos cancelados' });
    expect(within(reaberta).getByText('Carregando documentos cancelados…')).toBeInTheDocument();
    expect(within(reaberta).queryByRole('article')).not.toBeInTheDocument();
    resolverCancelados!(resposta([...CARTOES, ...CANCELADOS]));
    expect(await within(reaberta).findByRole('article', { name: 'Ata de reunião' })).toBeInTheDocument();
  });

  it('B5: só com cancelados, "Nenhum documento em tramitação" e o botão Cancelados continua', async () => {
    renderizar(apiSimulada({ painel: vi.fn().mockResolvedValue(resposta([], 2)) }));
    expect(await screen.findByText('Nenhum documento em tramitação')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum documento cadastrado ainda')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelados (2)' })).toBeEnabled();
  });

  it('vazio geral: mensagem e link para Novo documento (se puder cadastrar)', async () => {
    renderizar(apiSimulada({ painel: vi.fn().mockResolvedValue(resposta([], 0)) }));
    expect(await screen.findByText('Nenhum documento cadastrado ainda')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Novo documento' }).length).toBeGreaterThan(0);
    expect(within(kpi('Em tramitação')).getByText('0')).toBeInTheDocument();
  });

  it('Leitor não vê "Novo documento"', async () => {
    renderizar(apiSimulada({ painel: vi.fn().mockResolvedValue(resposta([], 0)) }), LEITOR);
    await screen.findByText('Nenhum documento cadastrado ainda');
    expect(screen.queryByRole('link', { name: 'Novo documento' })).not.toBeInTheDocument();
  });

  it('erro de carga com "Tentar novamente"', async () => {
    const painel = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValue(resposta());
    const usuario = renderizar(apiSimulada({ painel }));
    await usuario.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await quadro()).toBeInTheDocument();
  });

  it('setas ↓ e → movem o foco entre cartões e colunas', async () => {
    const usuario = renderizar(apiSimulada());
    await quadro();
    // F4: o alvo do foco e das setas é o botão do título (o <article> deixou de ser focável).
    botaoDe('Procedimento de auditoria').focus();
    await usuario.keyboard('{ArrowDown}');
    expect(botaoDe('Instrução de solda')).toHaveFocus();
    await usuario.keyboard('{ArrowRight}');
    expect(botaoDe('Inspeção de andaimes')).toHaveFocus();
    await usuario.keyboard('{ArrowLeft}');
    expect(botaoDe('Procedimento de auditoria')).toHaveFocus();
    expect(cartaoDe('Procedimento de auditoria')).not.toHaveAttribute('tabindex');
  });
});

/** Endereço atual, para conferir o parâmetro ?documento= (contrato F4, 5.1). */
function SondaEndereco() {
  const local = useLocation();
  return <p data-testid="endereco">{`${local.pathname}${local.search}`}</p>;
}

function detalheDe(c: CartaoPainel) {
  return { documento: documentoDe(c), arquivos: [], eventos: [], hoje: HOJE };
}

function renderizarComRotas(api: Api, entrada = '/painel', eu: Pessoa = QUALIDADE) {
  const usuario = userEvent.setup();
  render(
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter initialEntries={[entrada]}>
          <ProvedorToast>
            <Routes>
              <Route
                path="/painel"
                element={
                  <>
                    <TelaPainel />
                    <SondaEndereco />
                  </>
                }
              />
              <Route path="/documentos/:id" element={<RedirecionarDocumento />} />
            </Routes>
          </ProvedorToast>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>,
  );
  return usuario;
}

function apiComDetalhes(sobrescrever: Partial<Api> = {}): Api {
  return apiSimulada({
    documento: vi.fn(async (id: string) => {
      const c = [...CARTOES, ...CANCELADOS].find((x) => x.id === id);
      if (!c) throw new ErroApi(404, 'nao_encontrado');
      return detalheDe(c);
    }),
    ...sobrescrever,
  });
}

const endereco = () => screen.getByTestId('endereco').textContent;

describe('TelaPainel: detalhes (F4)', () => {
  it('clique no corpo do cartão abre os detalhes e grava ?documento= na URL; fechar limpa e devolve o foco ao título', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api);
    await quadro();
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByText('19/10'));
    const dialogo = await screen.findByRole('dialog', { name: 'Procedimento de auditoria' });
    expect(api.documento).toHaveBeenCalledWith('DOC-1');
    expect(endereco()).toBe('/painel?documento=DOC-1');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(endereco()).toBe('/painel'));
    expect(botaoDe('Procedimento de auditoria')).toHaveFocus();
  });

  it.each([['{Enter}'], [' ']])('tecla %s no título abre os detalhes', async (tecla) => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api);
    await quadro();
    botaoDe('Instrução de solda').focus();
    await usuario.keyboard(tecla);
    expect(await screen.findByRole('dialog', { name: 'Instrução de solda' })).toBeInTheDocument();
    expect(endereco()).toBe('/painel?documento=DOC-2');
  });

  it('botão do título: nome = título + ", abrir detalhes"; descrição com status, área, prazo e responsável', async () => {
    renderizarComRotas(apiComDetalhes());
    await quadro();
    expect(botaoDe('Procedimento de auditoria')).toHaveAccessibleDescription(
      'Recebido. Área: Qualidade. Vence em 20 dias, prazo 19/10/2026.',
    );
    expect(botaoDe('Inspeção de andaimes')).toHaveAccessibleDescription(
      'Em revisão da qualidade. Área: Qualidade. Atrasado há 2 dias, prazo 27/09/2026. Responsável: Célia Maria Teste',
    );
  });

  it('?documento= na URL abre os detalhes ao carregar; fechar remove o parâmetro e leva o foco ao título da tela', async () => {
    const usuario = renderizarComRotas(apiComDetalhes(), '/painel?documento=DOC-4');
    const dialogo = await screen.findByRole('dialog', { name: 'Controle de informação' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Fechar detalhes' }));
    await waitFor(() => expect(endereco()).toBe('/painel'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Painel' })).toHaveFocus());
  });

  it('/documentos/:id redireciona para /painel?documento=:id', async () => {
    renderizarComRotas(apiComDetalhes(), '/documentos/DOC-3');
    expect(await screen.findByRole('dialog', { name: 'Inspeção de andaimes' })).toBeInTheDocument();
    expect(endereco()).toBe('/painel?documento=DOC-3');
  });

  it('documento inexistente na URL: 404 dentro do modal', async () => {
    renderizarComRotas(apiComDetalhes(), '/painel?documento=DOC-999');
    expect(await screen.findByRole('dialog', { name: 'Documento não encontrado' })).toBeInTheDocument();
  });

  it('cartão da janela de cancelados abre os detalhes por cima (modal sobre modal)', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api);
    await quadro();
    await usuario.click(screen.getByRole('button', { name: 'Cancelados (2)' }));
    const janela = await screen.findByRole('dialog', { name: /Documentos cancelados/ });
    await usuario.click(await within(janela).findByRole('button', { name: 'Ata de reunião, abrir detalhes' }));
    const detalhes = await screen.findByRole('dialog', { name: 'Ata de reunião' });
    expect(api.documento).toHaveBeenCalledWith('DOC-7');
    await usuario.click(within(detalhes).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(within(janela).getByRole('button', { name: 'Ata de reunião, abrir detalhes' })).toHaveFocus());
    expect(screen.getByRole('dialog', { name: /Documentos cancelados/ })).toBeInTheDocument();
  });

  it('reprogramar (só com prazo vencido) dentro dos detalhes atualiza o cartão do quadro sem recarregar o painel', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-3');
    await quadro();
    const dialogo = await screen.findByRole('dialog', { name: 'Inspeção de andaimes' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    expect(reprog).toHaveTextContent('Prazo atual: 27/09/2026');
    expect(within(reprog).getByLabelText(/Novo prazo/)).toHaveAttribute('min', HOJE);
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    const resumo = await within(reprog).findByText('Corrija 2 campos:');
    await waitFor(() => expect(resumo.parentElement).toHaveFocus());
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-11-30');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'Pedido formal da área.');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(within(cartaoDe('Inspeção de andaimes')).getByText('30/11')).toBeInTheDocument());
    expect(api.reprogramarPrazo).toHaveBeenCalledWith('DOC-3', { novoPrazo: '2026-11-30', justificativa: 'Pedido formal da área.', versao: 3 });
    expect(api.painel).toHaveBeenCalledTimes(1);
  });

  it('reprogramar: 409 conflito_versao mostra o prazo atual e reenvia com a versão nova', async () => {
    const original = CARTOES[2]!;
    const atual = documentoDe(original, { dataRevisao: '2026-09-28', versao: 4, qtdReprogramacoes: 2 });
    const reprogramarPrazo = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'conflito_versao', {}, atual))
      .mockResolvedValueOnce({ documento: { ...atual, dataRevisao: '2026-11-10', versao: 5 }, evento: {} });
    const usuario = renderizarComRotas(apiComDetalhes({ reprogramarPrazo }), '/painel?documento=DOC-3');
    await quadro();
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Inspeção de andaimes' })).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-11-10');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'Aguardando retorno da área');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    const aviso = await within(reprog).findByText('Alguém alterou este documento');
    expect(aviso.parentElement).toHaveTextContent('O prazo atual agora é 28/09/2026');
    await waitFor(() => expect(within(cartaoDe('Inspeção de andaimes')).getByText('28/09')).toBeInTheDocument());
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(reprogramarPrazo.mock.calls[1]![1]).toMatchObject({ versao: 4 }));
  });

  it('reprogramar: 409 acao_nao_permitida (prazo não vencido) mostra a mensagem do servidor', async () => {
    const reprogramarPrazo = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'acao_nao_permitida', {}, null, 'O prazo ainda não venceu.'))
      .mockRejectedValueOnce(new ErroApi(403, 'sem_permissao'));
    const usuario = renderizarComRotas(apiComDetalhes({ reprogramarPrazo }), '/painel?documento=DOC-3');
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Inspeção de andaimes' })).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-11-10');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'Aguardando retorno da área');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(reprog).findByText('O prazo ainda não venceu.')).toBeInTheDocument();
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(reprog).findByText('Você não tem permissão para esta ação.')).toBeInTheDocument();
  });

  it('B6: depois de reprogramar, o cartão muda de posição na coluna sem recarregar', async () => {
    const vencido = cartao('DOC-9', 'Checklist vencido', 'Em revisão da qualidade', -5);
    const [doc1, doc2, doc3, ...resto] = CARTOES;
    const api = apiComDetalhes({
      painel: vi.fn().mockResolvedValue(resposta([doc1!, doc2!, vencido, doc3!, ...resto])),
      documento: vi.fn(async (id: string) => detalheDe(id === 'DOC-9' ? vencido : CARTOES.find((c) => c.id === id)!)),
      reprogramarPrazo: vi.fn(async (_id: string, dados: NovaReprogramacao) => ({
        documento: documentoDe(vencido, { dataRevisao: dados.novoPrazo, versao: 4, reprogramado: true, qtdReprogramacoes: 1 }),
        evento: {} as never,
      })),
    });
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-9');
    await quadro();
    expect(within(coluna(/^Em Revisão/)).getAllByRole('article')[0]).toBe(cartaoDe('Checklist vencido'));
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Checklist vencido' })).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-12-05');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'aguardando a área de engenharia');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(within(coluna(/^Em Revisão/)).getAllByRole('article')[1]).toBe(cartaoDe('Checklist vencido')));
    expect(api.painel).toHaveBeenCalledTimes(1);
  });
});

describe('TelaPainel: mudança de status (F5)', () => {
  it('etapa registrada nos detalhes move o cartão de coluna e recarrega o painel em silêncio', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-1');
    await quadro();
    const dialogo = await screen.findByRole('dialog', { name: 'Procedimento de auditoria' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Iniciar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    // Sem responsáveis carregados (lista vazia): o campo aparece vazio e a validação pede a pessoa.
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    expect(await within(etapa).findByText('Responsável: Informe o responsável por esta etapa.')).toBeInTheDocument();
    expect(api.mudarStatus).not.toHaveBeenCalled();
  });

  it('com responsável escolhido: o cartão troca de coluna e o quadro não pisca (recarga silenciosa)', async () => {
    // A recarga silenciosa traz o estado do servidor (já com a etapa nova).
    const depois = CARTOES.map((c) =>
      c.id === 'DOC-1' ? { ...c, status: 'Em revisão da qualidade' as const, fase: 'revisao' as const, responsavel: 'Bruna Teste', versao: 4 } : c,
    );
    const api = apiComDetalhes({
      responsaveis: vi.fn().mockResolvedValue([{ id: 'USR-1', nome: 'Bruna Teste', perfil: 'Qualidade', areaId: 'a2', area: 'Qualidade' }]),
      painel: vi.fn().mockResolvedValueOnce(resposta()).mockResolvedValue(resposta(depois)),
    });
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-1');
    await quadro();
    const dialogo = await screen.findByRole('dialog', { name: 'Procedimento de auditoria' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Iniciar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    expect(await within(etapa).findByRole('combobox', { name: /Responsável/ })).toHaveValue('USR-1');
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    await waitFor(() => expect(within(coluna(/^Em Revisão/)).getByRole('article', { name: 'Procedimento de auditoria' })).toBeInTheDocument());
    await waitFor(() => expect(api.painel).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('region', { name: 'Quadro de tramitação' })).not.toHaveAttribute('aria-busy');
  });

  it('cancelar: fecha os detalhes, tira o cartão, soma em Cancelados e o "Desfazer" reativa pela mesma rota com a versão do cancelamento', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-4');
    await quadro();
    const dialogo = await screen.findByRole('dialog', { name: 'Controle de informação' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar documento' }));
    const cancelar = await screen.findByRole('dialog', { name: 'Cancelar documento' });
    await usuario.type(within(cancelar).getByLabelText(/Motivo/), 'Substituído por outro procedimento.');
    await usuario.click(within(cancelar).getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() => expect(endereco()).toBe('/painel'));
    expect(screen.queryByRole('article', { name: 'Controle de informação' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelados (3)' })).toBeInTheDocument();
    expect(screen.getByText('Documento cancelado.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() =>
      expect(api.reativarDocumento).toHaveBeenCalledWith('DOC-4', { observacao: 'Cancelamento desfeito.', versao: 4 }),
    );
    expect(await screen.findByText('Cancelamento desfeito: o documento voltou para Devolvido para correção.')).toBeInTheDocument();
    expect(within(coluna(/^Devolvido/)).getByRole('article', { name: 'Controle de informação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelados (2)' })).toBeInTheDocument();
  });

  it('"Desfazer" com 409 conflito_versao: avisa que o documento foi alterado', async () => {
    const api = apiComDetalhes({ reativarDocumento: vi.fn().mockRejectedValue(new ErroApi(409, 'conflito_versao', {}, null)) });
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-4');
    await quadro();
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Controle de informação' })).getByRole('button', { name: 'Cancelar documento' }));
    const cancelar = await screen.findByRole('dialog', { name: 'Cancelar documento' });
    await usuario.type(within(cancelar).getByLabelText(/Motivo/), 'Substituído por outro procedimento.');
    await usuario.click(within(cancelar).getByRole('button', { name: 'Sim, cancelar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('Não foi possível desfazer: o documento foi alterado. Veja em Cancelados.')).toBeInTheDocument();
  });

  it('janela de cancelados: os cartões não têm botões; Reativar nos detalhes por cima confirma o status de volta e recarrega a janela', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api);
    await quadro();
    await usuario.click(screen.getByRole('button', { name: 'Cancelados (2)' }));
    const janela = await screen.findByRole('dialog', { name: /Documentos cancelados/ });
    const ata = await within(janela).findByRole('article', { name: 'Ata de reunião' });
    expect(within(ata).getAllByRole('button')).toHaveLength(1);
    await usuario.click(within(ata).getByRole('button', { name: 'Ata de reunião, abrir detalhes' }));
    const detalhes = await screen.findByRole('dialog', { name: 'Ata de reunião' });
    await usuario.click(within(detalhes).getByRole('button', { name: 'Reativar' }));
    const confirmar = await screen.findByRole('dialog', { name: 'Reativar documento' });
    // Sem eventos de cancelamento no histórico simulado: volta para Recebido (decisão 0004, reserva).
    expect(confirmar).toHaveTextContent('Ele volta para Recebido.');
    await usuario.click(within(confirmar).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(api.reativarDocumento).toHaveBeenCalledWith('DOC-7', { observacao: null, versao: 3 }));
    // A janela recarrega (GET /painel?cancelados=true de novo) e o painel também.
    await waitFor(() => expect(vi.mocked(api.painel).mock.calls.filter(([c]) => c?.cancelados)).toHaveLength(2));
    await waitFor(() => expect(vi.mocked(api.painel).mock.calls.filter(([c]) => !c?.cancelados).length).toBeGreaterThanOrEqual(2));
  });
});
