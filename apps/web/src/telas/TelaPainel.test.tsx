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
    qtdDevolucoes: 0, dataAprovacao: null, versao: 3, criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-01T12:00:00Z',
    ...extra,
  };
}

const CARTOES: CartaoPainel[] = [
  cartao('DOC-1', 'Procedimento de auditoria', 'Recebido', 20),
  cartao('DOC-2', 'Instrução de solda', 'Recebido', 3, { areaId: 'a1', area: 'Engenharia', codigo: null }),
  cartao('DOC-3', 'Inspeção de andaimes', 'Em revisão da qualidade', -2, { reprogramado: true, qtdReprogramacoes: 1 }),
  cartao('DOC-4', 'Controle de informação', 'Devolvido para correção', 0, { qtdDevolucoes: 2, remetente: 'José Ação' }),
  cartao('DOC-5', 'Relatório de clientes', 'Para aprovação qualidade', null),
  cartao('DOC-6', 'Manual do SGI', 'Aprovado', -5),
];
const CANCELADOS: CartaoPainel[] = [
  cartao('DOC-7', 'Ata de reunião', 'Cancelado', 4),
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
    visualizarArquivo: vi.fn(),
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
    expect(screen.queryByText('Aprovados no mês')).not.toBeInTheDocument();

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

  it('cartão enxuto: área, etiquetas de prazo, Reprogramado, devoluções e data de recebimento', async () => {
    renderizar(apiSimulada());
    await quadro();
    expect(within(cartaoDe('Procedimento de auditoria')).getByText('Prazo: 19/10/2026')).toBeInTheDocument();
    expect(within(cartaoDe('Instrução de solda')).getByText('Vence em 3 dias')).toBeInTheDocument();
    expect(within(cartaoDe('Instrução de solda')).getByText('S/ código')).toBeInTheDocument();
    const andaimes = cartaoDe('Inspeção de andaimes');
    expect(within(andaimes).getByText('Atrasado há 2 dias')).toBeInTheDocument();
    expect(within(andaimes).getByText(/Reprogramado/)).toHaveAttribute('title', 'Reprogramado 1 vez');
    const devolvido = cartaoDe('Controle de informação');
    expect(within(devolvido).getByText('Vence hoje')).toBeInTheDocument();
    expect(within(devolvido).getByText('Devolvido 2 vezes')).toBeInTheDocument();
    expect(within(cartaoDe('Relatório de clientes')).getByText('Recebido em 01/09/2026')).toBeInTheDocument();
    // Enxuto (pedido do Eric): área como etiqueta; recebimento sempre; sem tipo, remetente nem "Revisão até".
    const auditoria = cartaoDe('Procedimento de auditoria');
    expect(within(auditoria).getByText('Qualidade')).toBeInTheDocument();
    expect(within(auditoria).getByText('Área:')).toHaveClass('visualmente-oculto');
    expect(within(auditoria).getByText('Recebido em 01/09/2026')).toBeInTheDocument();
    expect(auditoria).not.toHaveTextContent(/Revisão até|PR - Procedimento|Ana Exemplo|Remetente/);
    expect(devolvido).not.toHaveTextContent('José Ação');
    // Aprovado não tem etiqueta de prazo.
    expect(within(cartaoDe('Manual do SGI')).queryByText(/Atrasado|Vence|Prazo:/)).not.toBeInTheDocument();
    // Nada decorativo: só o título (abre os detalhes, F4) e Reprogramar.
    for (const artigo of screen.getAllByRole('article')) {
      for (const botao of within(artigo).queryAllByRole('button')) expect(botao).toHaveTextContent(/Reprogramar|, abrir detalhes$/);
    }
  });

  it('busca sem acento filtra no cliente, atualiza a contagem e os KPIs', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await quadro();
    expect(screen.getByText('6 documentos encontrados')).toBeInTheDocument();
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar por título, código ou remetente' }), 'jose acao');
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
    // A busca continua procurando no remetente, mesmo sem ele aparecer no cartão.
    expect(screen.getByRole('searchbox', { name: 'Buscar por título, código ou remetente' })).toBeInTheDocument();
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

  it.each([
    ['Qualidade', QUALIDADE, 5],
    ['Administrador', ADMIN, 5],
    ['Solicitante', SOLICITANTE, 0],
    ['Leitor', LEITOR, 0],
  ])('botão Reprogramar para %s: %i cartões (nunca em Aprovado)', async (_nome, eu, quantidade) => {
    renderizar(apiSimulada(), eu);
    await quadro();
    expect(screen.queryAllByRole('button', { name: /^Reprogramar/ })).toHaveLength(quantidade);
    expect(within(cartaoDe('Manual do SGI')).queryByRole('button', { name: /Reprogramar/ })).not.toBeInTheDocument();
  });

  it('diálogo valida, envia { novoPrazo, justificativa, versao } e atualiza o cartão sem recarregar', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await quadro();
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByRole('button', { name: /Reprogramar/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    expect(dialogo).toHaveTextContent('Prazo atual: 19/10/2026');
    const campoPrazo = within(dialogo).getByLabelText(/Novo prazo/);
    expect(campoPrazo).toHaveAttribute('min', '2026-10-20');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    const resumo = await within(dialogo).findByText('Corrija 2 campos:');
    await waitFor(() => expect(resumo.parentElement).toHaveFocus());
    expect(api.reprogramarPrazo).not.toHaveBeenCalled();

    await usuario.type(campoPrazo, '2026-10-19'); // igual ao atual: só adia
    const justificativa = within(dialogo).getByLabelText(/Justificativa/);
    await usuario.type(justificativa, 'curta');
    expect(campoPrazo).toHaveAccessibleDescription(/posterior ao prazo atual/);
    expect(justificativa).toHaveAccessibleDescription(/5\/500/);
    await usuario.clear(campoPrazo);
    await usuario.type(campoPrazo, '2026-11-05');
    await usuario.type(justificativa, ' demais: aguardando a área');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Prazo reprogramado para 05/11/2026')).toBeInTheDocument();
    expect(api.reprogramarPrazo).toHaveBeenCalledWith('DOC-1', {
      novoPrazo: '2026-11-05',
      justificativa: 'curta demais: aguardando a área',
      versao: 3,
    });
    const atualizado = cartaoDe('Procedimento de auditoria');
    expect(within(atualizado).getByText('Prazo: 05/11/2026')).toBeInTheDocument();
    expect(within(atualizado).getByText(/Reprogramado/)).toBeInTheDocument();
    expect(api.painel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Reprogramar prazo' })).not.toBeInTheDocument());
  });

  it('409 conflito_versao: mostra o prazo atual vindo do erro e reenvia com a versão nova', async () => {
    const original = CARTOES[0]!;
    const atual = documentoDe(original, { dataRevisao: '2026-10-26', versao: 4, reprogramado: true, qtdReprogramacoes: 1 });
    const reprogramarPrazo = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'conflito_versao', {}, atual))
      .mockResolvedValueOnce({ documento: { ...atual, dataRevisao: '2026-11-10', versao: 5, qtdReprogramacoes: 2 }, evento: {} });
    const usuario = renderizar(apiSimulada({ reprogramarPrazo }));
    await quadro();
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByRole('button', { name: /Reprogramar/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(dialogo).getByLabelText(/Novo prazo/), '2026-11-10');
    await usuario.type(within(dialogo).getByLabelText(/Justificativa/), 'Aguardando retorno da área');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    const aviso = await within(dialogo).findByText('Alguém alterou este documento');
    expect(aviso.parentElement).toHaveTextContent('O prazo atual agora é 26/10/2026');
    expect(dialogo).toHaveTextContent('Prazo atual: 26/10/2026');
    // O cartão do quadro já mostra o estado atual.
    expect(within(cartaoDe('Procedimento de auditoria')).getByText('Prazo: 26/10/2026')).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Prazo reprogramado para 10/11/2026');
    expect(reprogramarPrazo.mock.calls[1]![1]).toMatchObject({ versao: 4 });
  });

  it('409 acao_nao_permitida e 403 mostram as mensagens de api/erros.ts', async () => {
    const reprogramarPrazo = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'acao_nao_permitida'))
      .mockRejectedValueOnce(new ErroApi(403, 'sem_permissao'));
    const usuario = renderizar(apiSimulada({ reprogramarPrazo }));
    await quadro();
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByRole('button', { name: /Reprogramar/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(dialogo).getByLabelText(/Novo prazo/), '2026-11-10');
    await usuario.type(within(dialogo).getByLabelText(/Justificativa/), 'Aguardando retorno da área');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialogo).findByText(/não aceita esta ação no status atual/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialogo).findByText('Você não tem permissão para esta ação.')).toBeInTheDocument();
  });

  it('B6: depois de reprogramar, o cartão muda de posição na coluna sem recarregar', async () => {
    // Ordem do servidor: Instrução de solda (prazo em 3 dias) antes de Procedimento de auditoria (20 dias).
    const [doc1, doc2, ...resto] = CARTOES;
    const api = apiSimulada({ painel: vi.fn().mockResolvedValue(resposta([doc2!, doc1!, ...resto])) });
    const usuario = renderizar(api);
    await quadro();
    const antes = within(coluna(/Recebido/)).getAllByRole('article');
    expect(antes[0]).toBe(cartaoDe('Instrução de solda'));
    expect(antes[1]).toBe(cartaoDe('Procedimento de auditoria'));
    await usuario.click(within(cartaoDe('Instrução de solda')).getByRole('button', { name: /Reprogramar/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(dialogo).getByLabelText(/Novo prazo/), '2026-11-05');
    await usuario.type(within(dialogo).getByLabelText(/Justificativa/), 'aguardando a área de engenharia');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Prazo reprogramado para 05/11/2026');
    const depois = within(coluna(/Recebido/)).getAllByRole('article');
    expect(depois[0]).toBe(cartaoDe('Procedimento de auditoria'));
    expect(depois[1]).toBe(cartaoDe('Instrução de solda'));
    expect(depois).toHaveLength(2);
    expect(api.painel).toHaveBeenCalledTimes(1);
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
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByText('Recebido em 01/09/2026'));
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

  it('clique em Reprogramar não abre os detalhes', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api);
    await quadro();
    await usuario.click(within(cartaoDe('Procedimento de auditoria')).getByRole('button', { name: /Reprogramar/ }));
    expect(await screen.findByRole('dialog', { name: 'Reprogramar prazo' })).toBeInTheDocument();
    expect(api.documento).not.toHaveBeenCalled();
    expect(endereco()).toBe('/painel');
  });

  it('botão do título: nome = título + ", abrir detalhes"; descrição com código, status e prazo', async () => {
    renderizarComRotas(apiComDetalhes());
    await quadro();
    const botao = botaoDe('Procedimento de auditoria');
    expect(botao).toHaveAccessibleDescription(/COD-DOC-1\s*Rev\. 0\s*Recebido\s*Prazo: 19\/10\/2026/);
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

  it('reprogramar dentro dos detalhes atualiza o cartão do quadro', async () => {
    const api = apiComDetalhes();
    const usuario = renderizarComRotas(api, '/painel?documento=DOC-1');
    await quadro();
    const dialogo = await screen.findByRole('dialog', { name: 'Procedimento de auditoria' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-11-30');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'Pedido formal da área.');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(within(cartaoDe('Procedimento de auditoria')).getByText('Prazo: 30/11/2026')).toBeInTheDocument());
  });
});
