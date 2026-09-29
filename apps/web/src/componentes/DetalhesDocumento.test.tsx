import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  ArquivoDocumento,
  DetalheDocumento,
  Documento,
  EventoHistorico,
  Pessoa,
  PessoaResumo,
  ResultadoTransicao,
  StatusDocumento,
} from '@docsync/compartilhado';
import { ContextoApi, nomeDoCabecalho, type Api } from '../api/cliente.ts';
import { ErroApi } from '../api/erros.ts';
import { ContextoSessao } from '../autenticacao/Sessao.tsx';
import { formatarDataHora } from '../formatacao.ts';
import { DetalhesDocumento, acoesRapidas, ehIdDocumento } from './DetalhesDocumento.tsx';
import { textoOpcaoEtapa } from './DialogoAtualizarEtapa.tsx';


// Dados fictícios (CLAUDE.md, seção 4).
const HOJE = '2026-09-29';
const QUALIDADE: Pessoa = { id: 'USR-1', nome: 'Bruna Teste', email: 'bruna@exemplo.test', perfil: 'Qualidade', area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const LEITOR: Pessoa = { ...QUALIDADE, id: 'USR-3', perfil: 'Leitor' };
const SOLICITANTE_OUTRA_AREA: Pessoa = { ...QUALIDADE, id: 'USR-2', perfil: 'Solicitante', area: 'Engenharia', areaId: 'a1' };
const SOLICITANTE_DA_AREA: Pessoa = { ...QUALIDADE, id: 'USR-4', perfil: 'Solicitante' };
const ADMIN: Pessoa = { ...QUALIDADE, id: 'USR-0', perfil: 'Administrador' };

const DOCUMENTO: Documento = {
  id: 'DOC-1', codigo: 'PR-QUA-0007', titulo: 'Controle de informação documentada', status: 'Devolvido para correção',
  tipoDocumentoId: 'TIPO-1', tipoDocumento: 'PR - Procedimento', revisao: 2, dataRecebimento: '2026-09-01', dataRevisao: '2026-10-09',
  reprogramado: true, qtdReprogramacoes: 1, remetente: 'Ana Exemplo', areaId: 'a2', area: 'Qualidade', disciplina: null,
  observacao: 'Linha um.\nLinha dois <b>sem HTML</b>.', nomePasta: 'x', nomeArquivoPrincipal: 'x.pdf', qtdAnexos: 2,
  idDocumentoOrigem: null, responsavelId: 'USR-5', responsavel: 'Célia Teste', versao: 4, criadoPor: 'USR-9', criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-10T15:00:00Z',
};

const ARQUIVOS: ArquivoDocumento[] = [
  { id: 'ARQ-1', papel: 'principal', nomeOriginal: 'Procedimento.pdf', tamanho: 250_880, criadoEm: '2026-09-01T12:00:00Z' },
  { id: 'ARQ-2', papel: 'anexo', nomeOriginal: 'Checklist.xlsx', tamanho: 1536, criadoEm: '2026-09-01T12:00:00Z' },
  { id: 'ARQ-3', papel: 'anexo', nomeOriginal: 'Foto.png', tamanho: 1_572_864, criadoEm: '2026-09-01T12:00:00Z' },
];

function evento(n: number, extra: Partial<EventoHistorico> = {}): EventoHistorico {
  return {
    id: `HIST-${n}`, idDocumento: 'DOC-1', codigo: 'PR-QUA-0007', tipoAcao: 'STATUS', status: 'Em revisão da qualidade',
    statusAnterior: 'Recebido', dataHora: `2026-09-${String(n).padStart(2, '0')}T12:00:00Z`, destino: null, responsavel: null,
    responsavelId: null, autorId: 'USR-9', autorNome: `Pessoa ${n}`, detalhes: [], observacao: null, ...extra,
  };
}

const EVENTOS: EventoHistorico[] = [
  evento(1, {
    tipoAcao: 'CRIACAO', status: 'Recebido', statusAnterior: null, autorNome: 'Ana Exemplo',
    detalhes: [{ campo: 'dataRevisao', antes: null, depois: '2026-10-01' }], observacao: 'Observação do cadastro',
  }),
  evento(2, { autorNome: 'Bruno Teste', destino: 'Qualidade', responsavel: 'Bruno Teste' }),
  evento(3, {
    tipoAcao: 'REPROGRAMACAO', status: 'Em revisão da qualidade', statusAnterior: null, autorNome: 'Carla Teste',
    detalhes: [{ campo: 'dataRevisao', antes: '2026-10-01', depois: '2026-10-09' }], observacao: 'A área pediu mais prazo.',
  }),
  evento(4, { status: 'Devolvido para correção', statusAnterior: 'Em revisão da qualidade', autorNome: 'Bruno Teste' }),
];

function detalhe(mudancas: Partial<DetalheDocumento> = {}): DetalheDocumento {
  return { documento: DOCUMENTO, arquivos: ARQUIVOS, eventos: EVENTOS, hoje: HOJE, ...mudancas };
}

function apiSimulada(sobrescrever: Partial<Api> = {}): Api {
  return {
    eu: vi.fn(), pessoas: vi.fn(), areas: vi.fn(), criarPessoa: vi.fn(), alterarPessoa: vi.fn(), tiposDocumento: vi.fn(),
    criarDocumento: vi.fn(), documentosRecentes: vi.fn(), painel: vi.fn(),
    documento: vi.fn().mockResolvedValue(detalhe()),
    baixarArquivo: vi.fn(async (_id: string, _arq: string, nome: string) => ({ blob: new Blob(['x']), nomeArquivo: `servidor-${nome}` })),
    reprogramarPrazo: vi.fn(async (_id, dados) => ({
      documento: { ...DOCUMENTO, dataRevisao: dados.novoPrazo, versao: 5, qtdReprogramacoes: 2 },
      evento: evento(9),
    })),
    responsaveis: vi.fn().mockResolvedValue(RESPONSAVEIS),
    mudarStatus: vi.fn(async (_id, dados) => resultado({ status: dados.para, responsavelId: dados.responsavelId, versao: 5 })),
    cancelarDocumento: vi.fn(async () => resultado({ status: 'Cancelado', versao: 5 }, 'CANCELAMENTO')),
    reativarDocumento: vi.fn(async () => resultado({ status: 'Devolvido para correção', versao: 6 })),
    ...sobrescrever,
  };
}

// Responsáveis elegíveis (GET /responsaveis), em ordem pt-BR.
const RESPONSAVEIS: PessoaResumo[] = [
  { id: 'USR-7', nome: 'Alice Área', perfil: 'Solicitante', areaId: 'a2', area: 'Qualidade' },
  { id: 'USR-1', nome: 'Bruna Teste', perfil: 'Qualidade', areaId: 'a2', area: 'Qualidade' },
  { id: 'USR-8', nome: 'Diego Engenharia', perfil: 'Solicitante', areaId: 'a1', area: 'Engenharia' },
  { id: 'USR-9', nome: 'Zeca Qualidade', perfil: 'Qualidade', areaId: 'a3', area: 'Suprimentos' },
];

function resultado(mudancas: Partial<Documento>, tipoAcao: EventoHistorico['tipoAcao'] = 'STATUS'): ResultadoTransicao {
  const documento = { ...DOCUMENTO, ...mudancas };
  return { documento, evento: evento(20, { tipoAcao, status: documento.status, statusAnterior: DOCUMENTO.status }) };
}

function comStatus(status: StatusDocumento, extra: Partial<Documento> = {}, eventos = EVENTOS) {
  return vi.fn().mockResolvedValue(detalhe({ documento: { ...DOCUMENTO, status, ...extra }, eventos }));
}

function renderizar(
  api: Api,
  { eu = QUALIDADE, id = 'DOC-1', aoFechar = vi.fn(), aoAtualizarDocumento = vi.fn(), aoMudarStatus = vi.fn(), aoCancelar = vi.fn(), aoReativar = vi.fn() } = {},
) {
  const usuario = userEvent.setup();
  render(
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <DetalhesDocumento
          documentoId={id}
          aoFechar={aoFechar}
          aoAtualizarDocumento={aoAtualizarDocumento}
          aoMudarStatus={aoMudarStatus}
          aoCancelar={aoCancelar}
          aoReativar={aoReativar}
        />
      </ContextoSessao.Provider>
    </ContextoApi.Provider>,
  );
  return { usuario, aoFechar, aoAtualizarDocumento, aoMudarStatus, aoCancelar, aoReativar };
}

/** Botões do rodapé, na ordem da tela. */
function rodape(dialogo: HTMLElement): string[] {
  const botoes = within(dialogo).getAllByRole('button');
  const fechar = botoes.findIndex((b) => b.textContent === 'Fechar');
  const primeiro = botoes.findIndex((b, i) => i <= fechar && b.parentElement === botoes[fechar]!.parentElement);
  return botoes.slice(primeiro, fechar + 1).map((b) => b.textContent ?? '');
}

const modal = () => screen.findByRole('dialog', { name: 'Controle de informação documentada' });
const secao = (nome: string) => screen.getByRole('region', { name: nome });

describe('funções puras dos detalhes', () => {
  it('ehIdDocumento aceita só DOC-…', () => {
    expect(ehIdDocumento('DOC-0f2c1a4e-1111-4222-8333-444455556666')).toBe(true);
    expect(ehIdDocumento('ARQ-1')).toBe(false);
    expect(ehIdDocumento('DOC-../x')).toBe(false);
    expect(ehIdDocumento(null)).toBe(false);
  });

  it('nomeDoCabecalho: filename* decodificado, senão filename, senão a reserva; nunca barra', () => {
    expect(nomeDoCabecalho(`attachment; filename="Relat_rio.pdf"; filename*=UTF-8''Relat%C3%B3rio%20final.pdf`, 'r.pdf')).toBe('Relatório final.pdf');
    expect(nomeDoCabecalho('attachment; filename="Ata.pdf"', 'r.pdf')).toBe('Ata.pdf');
    expect(nomeDoCabecalho(null, 'reserva.pdf')).toBe('reserva.pdf');
    expect(nomeDoCabecalho(`attachment; filename*=UTF-8''..%2F..%2Fx.pdf`, 'r.pdf')).toBe('.._.._x.pdf');
  });

  it('formatarDataHora usa o fuso de São Paulo', () => {
    expect(formatarDataHora('2026-09-29T02:30:00Z')).toBe('28/09/2026, 23:30');
    expect(formatarDataHora(null)).toBe('—');
    expect(formatarDataHora('lixo')).toBe('—');
  });

});

describe('DetalhesDocumento', () => {
  let criarUrl: ReturnType<typeof vi.fn>;
  let clique: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    criarUrl = vi.fn(() => 'blob:simulado');
    Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() });
    clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => clique.mockRestore());

  it('carregando: esqueleto com aria-busy, sem número nem data falsa', () => {
    renderizar(apiSimulada({ documento: vi.fn(() => new Promise<DetalheDocumento>(() => undefined)) }));
    const dialogo = screen.getByRole('dialog', { name: 'Detalhes do documento', hidden: true });
    expect(within(dialogo).getByText('Carregando detalhes…')).toBeInTheDocument();
    expect(dialogo.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(dialogo).not.toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('cabeçalho, Dados (rótulos, "—" para nulos, observação como texto) e ✕ com foco inicial', async () => {
    renderizar(apiSimulada());
    const dialogo = await modal();
    expect(within(dialogo).getByRole('button', { name: 'Fechar detalhes' })).toHaveFocus();
    expect(within(dialogo).getByText('PR-QUA-0007')).toBeInTheDocument();
    expect(within(dialogo).getByText('Rev. 2')).toBeInTheDocument();
    expect(within(dialogo).getByText('DOC-1')).toBeInTheDocument();
    expect(within(dialogo).getByText('Prazo: 09/10/2026')).toBeInTheDocument();
    expect(within(dialogo).getByText('Devolvido 1 vez')).toBeInTheDocument();
    const dados = secao('Dados');
    const valor = (rotulo: string) => within(dados).getByText(rotulo).nextElementSibling;
    expect(valor('Tipo de documento')).toHaveTextContent('PR - Procedimento');
    expect(valor('Disciplina')).toHaveTextContent('—');
    expect(valor('Data de recebimento')).toHaveTextContent('01/09/2026');
    expect(valor('Prazo (data de revisão)')).toHaveTextContent('09/10/2026');
    expect(valor('Responsável atual')).toHaveTextContent('Célia Teste');
    expect(valor('Cadastrado em')).toHaveTextContent('01/09/2026, 09:00');
    expect(valor('Observações complementares')).toHaveTextContent('Linha dois <b>sem HTML</b>.');
    expect(dados.querySelector('b')).toBeNull();
    expect(within(dados).queryByText('Revisão de')).not.toBeInTheDocument();
    // Nada decorativo: sem Editar, Histórico completo, Anexar (F6, F7).
    expect(within(dialogo).queryByRole('button', { name: /Editar|Histórico completo|Anexar/ })).not.toBeInTheDocument();
  });

  it('Arquivos: principal primeiro, tamanho e Baixar com o nome devolvido pelo servidor (sem Visualizar)', async () => {
    const api = apiSimulada();
    const { usuario } = renderizar(api);
    await modal();
    const itens = within(secao('Arquivos')).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Procedimento.pdf');
    expect(itens[0]).toHaveTextContent('Principal');
    expect(itens[0]).toHaveTextContent('245 KB');
    expect(itens[2]).toHaveTextContent('1,5 MB');
    // O visualizador de PDF saiu da F4 (decisão do Eric): só Baixar, nada de abrir em aba ou no Office.
    expect(screen.queryByRole('button', { name: /Visualizar|Abrir/ })).not.toBeInTheDocument();
    expect(within(secao('Arquivos')).queryByRole('link')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Baixar Checklist.xlsx' }));
    await waitFor(() => expect(api.baixarArquivo).toHaveBeenCalledWith('DOC-1', 'ARQ-2', 'Checklist.xlsx'));
    await waitFor(() => expect(clique).toHaveBeenCalled());
    const link = clique.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('servidor-Checklist.xlsx');
    expect(link.href).toBe('blob:simulado');
    expect(link.isConnected).toBe(false);
  });

  it('Baixar: enquanto baixa mostra "Baixando…"; erro arquivo_indisponivel aparece dentro do modal', async () => {
    let falhar: (e: unknown) => void = () => undefined;
    const api = apiSimulada({ baixarArquivo: vi.fn(() => new Promise<never>((_r, rej) => (falhar = rej))) });
    const { usuario } = renderizar(api);
    await modal();
    await usuario.click(screen.getByRole('button', { name: 'Baixar Procedimento.pdf' }));
    expect(await screen.findByRole('button', { name: 'Baixando… Procedimento.pdf' })).toBeDisabled();
    falhar(new ErroApi(404, 'arquivo_indisponivel'));
    expect(await within(secao('Arquivos')).findByRole('alert')).toHaveTextContent('Este arquivo não está disponível no momento');
  });

  it.each([
    // Decisão 0014: o Leitor vê os detalhes e os arquivos, mas não baixa.
    ['Leitor', false, LEITOR],
    ['Solicitante de outra área', false, SOLICITANTE_OUTRA_AREA],
  ])('%s: botões Baixar visíveis = %s', async (_nome, visiveis, eu) => {
    renderizar(apiSimulada(), { eu });
    await modal();
    expect(screen.queryAllByRole('button', { name: /^Baixar/ })).toHaveLength(visiveis ? 3 : 0);
    expect(within(secao('Arquivos')).getByText('Procedimento.pdf', { selector: 'p' })).toBeInTheDocument();
    // Contrato F4, 11.6: quem não baixa vê o motivo.
    expect(within(secao('Arquivos')).getByText('Seu perfil pode ver, mas não baixar arquivos.')).toBeInTheDocument();
  });

  it('quem baixa não vê a frase "Seu perfil pode ver, mas não baixar arquivos."', async () => {
    renderizar(apiSimulada());
    await modal();
    expect(screen.queryByText('Seu perfil pode ver, mas não baixar arquivos.')).not.toBeInTheDocument();
  });

  it('Leitor sem arquivos: só "Nenhum arquivo anexado", sem a frase de perfil', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ arquivos: [] })) }), { eu: LEITOR });
    await modal();
    expect(within(secao('Arquivos')).getByText('Nenhum arquivo anexado')).toBeInTheDocument();
    expect(screen.queryByText('Seu perfil pode ver, mas não baixar arquivos.')).not.toBeInTheDocument();
  });

  it('"Revisa o documento" fica escondido até a F8, mesmo com idDocumentoOrigem preenchido', async () => {
    const comOrigem = detalhe({ documento: { ...DOCUMENTO, idDocumentoOrigem: 'DOC-ORIGEM-1' } });
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(comOrigem) }));
    await modal();
    expect(within(secao('Dados')).queryByText('Revisão de')).not.toBeInTheDocument();
    expect(screen.queryByText(/Revisa o documento|DOC-ORIGEM-1/)).not.toBeInTheDocument();
  });

  it('lista vazia: "Nenhum arquivo anexado"', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ arquivos: [] })) }));
    await modal();
    expect(within(secao('Arquivos')).getByText('Nenhum arquivo anexado')).toBeInTheDocument();
  });

  it('Linha do tempo: mais recente primeiro, autor e data; expandir mostra diferenças, justificativa, destino e responsável', async () => {
    const { usuario } = renderizar(apiSimulada());
    await modal();
    const linha = secao('Linha do tempo');
    const itens = within(linha).getAllByRole('listitem').filter((li) => li.parentElement?.tagName === 'OL');
    expect(itens).toHaveLength(4);
    expect(itens[0]).toHaveTextContent('Mudança de status');
    expect(itens[0]).toHaveTextContent('De Em revisão da qualidade para Devolvido para correção');
    expect(itens[3]).toHaveTextContent('Cadastro');
    expect(itens[3]).toHaveTextContent('Ana Exemplo');
    expect(within(itens[3]!).getByText('01/09/2026, 09:00')).toHaveAttribute('dateTime', '2026-09-01T12:00:00Z');
    // Sem detalhes a expandir: sem botão.
    expect(within(itens[0]!).queryByRole('button')).not.toBeInTheDocument();

    const cadastro = within(itens[3]!).getByRole('button', { name: /Detalhes/ });
    expect(cadastro).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(cadastro);
    expect(cadastro).toHaveAttribute('aria-expanded', 'true');
    expect(itens[3]).toHaveTextContent(/Prazo: — →\s*para 01\/10\/2026/);
    expect(itens[3]).toHaveTextContent('Observação do cadastro');

    const reprogramacao = itens[1]!;
    expect(reprogramacao).toHaveTextContent('Prazo de 01/10/2026 para 09/10/2026');
    await usuario.click(within(reprogramacao).getByRole('button', { name: /Detalhes/ }));
    expect(within(reprogramacao).getByText('Justificativa')).toBeInTheDocument();
    expect(reprogramacao).toHaveTextContent('A área pediu mais prazo.');

    await usuario.click(within(itens[2]!).getByRole('button', { name: /Detalhes/ }));
    expect(within(itens[2]!).getByText('Destino').nextElementSibling).toHaveTextContent('Qualidade');
    expect(within(itens[2]!).getByText('Responsável').nextElementSibling).toHaveTextContent('Bruno Teste');
  });

  it('Linha do tempo com 50 eventos: todos aparecem, em ordem inversa', async () => {
    const muitos = Array.from({ length: 50 }, (_, i) => evento(i + 1, { dataHora: `2026-09-01T${String(i % 24).padStart(2, '0')}:00:00Z`, autorNome: `Pessoa ${i + 1}` }));
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ eventos: muitos })) }));
    await modal();
    const itens = within(secao('Linha do tempo')).getAllByRole('listitem').filter((li) => li.parentElement?.tagName === 'OL');
    expect(itens).toHaveLength(50);
    expect(itens[0]).toHaveTextContent('Pessoa 50');
    expect(itens[49]).toHaveTextContent('Pessoa 1');
  });

  it('erro de rede: "Tentar novamente" recarrega', async () => {
    const documento = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValue(detalhe());
    const { usuario } = renderizar(apiSimulada({ documento }));
    await usuario.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await modal()).toBeInTheDocument();
    expect(documento).toHaveBeenCalledTimes(2);
  });

  it('404: "Documento não encontrado" sem repetir; id inválido nem chama a API', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockRejectedValue(new ErroApi(404, 'nao_encontrado')) }));
    const dialogo = await screen.findByRole('dialog', { name: 'Documento não encontrado' });
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('Ele pode ter sido removido ou você não tem acesso a ele.');
    expect(within(dialogo).queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('id que não é DOC-… não chama a API', async () => {
    const api = apiSimulada();
    renderizar(api, { id: 'qualquer-coisa' });
    expect(await screen.findByRole('dialog', { name: 'Documento não encontrado' })).toBeInTheDocument();
    expect(api.documento).not.toHaveBeenCalled();
  });

  it('403 sem_permissao: mensagem de api/erros.ts', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockRejectedValue(new ErroApi(403, 'sem_permissao')) }));
    expect(await screen.findByText('Você não tem permissão para esta ação.')).toBeInTheDocument();
  });

  it('Fechar e ✕ chamam aoFechar', async () => {
    const { usuario, aoFechar } = renderizar(apiSimulada());
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Fechar detalhes' }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
  });

  it('Reprogramar dentro do modal: envia com a versão do documento, atualiza o cartão e recarrega os detalhes', async () => {
    // Decisão 0015: Reprogramar só aparece com prazo vencido.
    const api = apiSimulada({ documento: comStatus('Devolvido para correção', { dataRevisao: '2026-09-20' }) });
    const { usuario, aoAtualizarDocumento } = renderizar(api);
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reprogramar' }));
    const reprog = await screen.findByRole('dialog', { name: 'Reprogramar prazo' });
    await usuario.type(within(reprog).getByLabelText(/Novo prazo/), '2026-10-20');
    await usuario.type(within(reprog).getByLabelText(/Justificativa/), 'Mais prazo pedido pela área.');
    await usuario.click(within(reprog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.reprogramarPrazo).toHaveBeenCalledWith('DOC-1', { novoPrazo: '2026-10-20', justificativa: 'Mais prazo pedido pela área.', versao: 4 }),
    );
    await waitFor(() => expect(aoAtualizarDocumento).toHaveBeenCalledWith(expect.objectContaining({ dataRevisao: '2026-10-20' })));
    await waitFor(() => expect(api.documento).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Prazo reprogramado para 20/10/2026.')).toBeInTheDocument();
  });

  it.each([
    ['Leitor', LEITOR],
    ['Solicitante', SOLICITANTE_OUTRA_AREA],
  ])('%s não vê Reprogramar no modal, mesmo com prazo vencido', async (_nome, eu) => {
    renderizar(apiSimulada({ documento: comStatus('Devolvido para correção', { dataRevisao: '2026-09-20' }) }), { eu });
    await modal();
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeInTheDocument();
  });

  it('prazo ainda não vencido (inclusive "vence hoje"): sem Reprogramar', async () => {
    renderizar(apiSimulada({ documento: comStatus('Devolvido para correção', { dataRevisao: HOJE }) }));
    await modal();
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeInTheDocument();
  });

  it('Aprovado não mostra Reprogramar', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ documento: { ...DOCUMENTO, status: 'Aprovado' } })) }));
    await modal();
    expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeInTheDocument();
  });


});

describe('funções puras do rodapé (F5)', () => {
  it('acoesRapidas: a principal primeiro, no máximo 3', () => {
    const acao = (para: StatusDocumento, principal = false) => ({ para, rotulo: para, principal, exigeResponsavel: true, exigeConfirmacao: false });
    const lista = [acao('Em revisão junto à área'), acao('Devolvido para correção'), acao('Em revisão do solicitante'), acao('Para aprovação da área solicitante', true)];
    expect(acoesRapidas(lista).map((a) => a.para)).toEqual(['Para aprovação da área solicitante', 'Em revisão junto à área', 'Devolvido para correção']);
    expect(acoesRapidas([])).toEqual([]);
  });

  it('textoOpcaoEtapa: o rótulo e o status entre parênteses, sem repetir', () => {
    expect(textoOpcaoEtapa('Iniciar revisão', 'Em revisão da qualidade')).toBe('Iniciar revisão (Em revisão da qualidade)');
    expect(textoOpcaoEtapa('Mover para Em revisão do solicitante', 'Em revisão do solicitante')).toBe('Mover para Em revisão do solicitante');
  });
});

describe('DetalhesDocumento: ações de status (F5)', () => {
  it('Qualidade em Recebido: principal "Iniciar revisão" primeiro, mais 2 rápidas, Atualizar etapa…, Cancelar e Fechar', async () => {
    renderizar(apiSimulada({ documento: comStatus('Recebido', { responsavelId: null, responsavel: null }) }));
    const dialogo = await modal();
    expect(rodape(dialogo)).toEqual(['Iniciar revisão', 'Revisar junto à área', 'Devolver à área', 'Atualizar etapa…', 'Cancelar', 'Fechar']);
    expect(within(dialogo).getByRole('button', { name: 'Iniciar revisão' })).toHaveClass('primario');
    // Nenhum botão desabilitado "de enfeite".
    for (const botao of within(dialogo).getAllByRole('button')) expect(botao).toBeEnabled();
  });

  it.each([
    ['Leitor', LEITOR, 'Devolvido para correção' as StatusDocumento],
    ['Solicitante de outra área', SOLICITANTE_OUTRA_AREA, 'Devolvido para correção' as StatusDocumento],
    ['Qualidade em Aprovado', QUALIDADE, 'Aprovado' as StatusDocumento],
  ])('%s: rodapé só com Fechar', async (_nome, eu, status) => {
    renderizar(apiSimulada({ documento: comStatus(status) }), { eu });
    const dialogo = await modal();
    expect(rodape(dialogo)).toEqual(['Fechar']);
  });

  it('Solicitante da área em Devolvido: só "Reenviar à Qualidade" (principal) e Atualizar etapa…; sem Cancelar', async () => {
    renderizar(apiSimulada(), { eu: SOLICITANTE_DA_AREA });
    const dialogo = await modal();
    expect(rodape(dialogo)).toEqual(['Reenviar à Qualidade', 'Atualizar etapa…', 'Fechar']);
  });

  it('Cancelado: Reativar (Administrador), sem etapas nem Cancelar; Leitor não vê Reativar', async () => {
    const cancelado = comStatus('Cancelado', {}, [...EVENTOS, evento(5, { tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior: 'Devolvido para correção' })]);
    renderizar(apiSimulada({ documento: cancelado }), { eu: ADMIN });
    const dialogo = await modal();
    expect(rodape(dialogo)).toEqual(['Reativar', 'Fechar']);
  });

  it('ação rápida abre "Atualizar etapa" já preenchido, com o responsável sugerido; envia { para, responsavelId, observacao, versao }', async () => {
    const api = apiSimulada({ documento: comStatus('Recebido', { responsavelId: null, responsavel: null }) });
    const { usuario, aoMudarStatus, aoAtualizarDocumento } = renderizar(api);
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Iniciar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    expect(within(etapa).getByRole('combobox', { name: /Etapa/ })).toHaveValue('Em revisão da qualidade');
    expect(etapa).toHaveTextContent('De:');
    const responsavel = await within(etapa).findByRole('combobox', { name: /Responsável/ });
    // Revisão: Qualidade/Administrador sugeridos, e "eu" (Bruna, Qualidade) em primeiro.
    expect(responsavel).toHaveValue('USR-1');
    const grupos = within(responsavel).getAllByRole('group');
    expect(grupos.map((g) => g.getAttribute('label'))).toEqual(['Sugeridos', 'Outras pessoas']);
    expect(within(grupos[0]!).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bruna Teste (Qualidade)', 'Zeca Qualidade (Suprimentos)']);
    await usuario.type(within(etapa).getByLabelText(/Observação/), '  Começando pela seção 4.  ');
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    await waitFor(() =>
      expect(api.mudarStatus).toHaveBeenCalledWith('DOC-1', {
        para: 'Em revisão da qualidade', responsavelId: 'USR-1', observacao: 'Começando pela seção 4.', versao: 4,
      }),
    );
    await waitFor(() => expect(aoMudarStatus).toHaveBeenCalled());
    expect(aoAtualizarDocumento).toHaveBeenCalledWith(expect.objectContaining({ status: 'Em revisão da qualidade' }));
    expect(await screen.findByText('Etapa registrada: Em revisão da qualidade.')).toBeInTheDocument();
    await waitFor(() => expect(api.documento).toHaveBeenCalledTimes(2));
  });

  it('Atualizar etapa…: valida etapa e responsável com resumo focável e erros inline; destino na área sugere a área', async () => {
    const api = apiSimulada();
    const { usuario } = renderizar(api);
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Atualizar etapa…' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    const resumo = await within(etapa).findByText('Corrija 1 campo:');
    await waitFor(() => expect(resumo.parentElement).toHaveFocus());
    expect(within(etapa).getByRole('combobox', { name: /Etapa/ })).toHaveAccessibleDescription('Escolha a etapa.');
    expect(api.mudarStatus).not.toHaveBeenCalled();
    // Devolver à área: sugere pessoas da área do documento (Qualidade, a2).
    await usuario.selectOptions(within(etapa).getByRole('combobox', { name: /Etapa/ }), 'Devolvido para área para revisão');
    const responsavel = await within(etapa).findByRole('combobox', { name: /Responsável/ });
    const sugeridos = within(responsavel).getAllByRole('group')[0]!;
    expect(within(sugeridos).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['USR-1', 'USR-7']);
    await usuario.selectOptions(responsavel, '');
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    expect(await within(etapa).findByText('Responsável: Informe o responsável por esta etapa.')).toBeInTheDocument();
    expect(api.mudarStatus).not.toHaveBeenCalled();
  });

  it('409 conflito_versao: mostra o status atual, refaz as opções e reenvia com a versão nova', async () => {
    const atual: Documento = { ...DOCUMENTO, status: 'Em revisão junto à área', versao: 7 };
    const mudarStatus = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'conflito_versao', {}, atual))
      .mockResolvedValueOnce(resultado({ status: 'Para aprovação da área solicitante', versao: 8 }));
    const { usuario, aoAtualizarDocumento } = renderizar(apiSimulada({ mudarStatus }));
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retomar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    await within(etapa).findByRole('combobox', { name: /Responsável/ });
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    expect(await within(etapa).findByText('Alguém alterou este documento: agora está em Em revisão junto à área.')).toBeInTheDocument();
    expect(aoAtualizarDocumento).toHaveBeenCalledWith(atual);
    // "Retomar revisão" (Em revisão da qualidade) continua valendo a partir de "Em revisão junto à área".
    const opcoes = within(within(etapa).getByRole('combobox', { name: /Etapa/ })).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(opcoes).toContain('Aprovado');
    expect(opcoes).not.toContain('Em revisão junto à área');
    await usuario.selectOptions(within(etapa).getByRole('combobox', { name: /Etapa/ }), 'Para aprovação da área solicitante');
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    await waitFor(() => expect(mudarStatus.mock.calls[1]![1]).toMatchObject({ para: 'Para aprovação da área solicitante', versao: 7 }));
  });

  it('403 e 409 acao_nao_permitida: mensagem do servidor no diálogo', async () => {
    const mudarStatus = vi.fn().mockRejectedValue(new ErroApi(403, 'sem_permissao', {}, null, 'Seu perfil não pode aplicar esta etapa.'));
    const { usuario } = renderizar(apiSimulada({ mudarStatus }));
    await usuario.click(within(await modal()).getByRole('button', { name: 'Retomar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    await within(etapa).findByRole('combobox', { name: /Responsável/ });
    await usuario.click(within(etapa).getByRole('button', { name: 'Registrar etapa' }));
    expect(await within(etapa).findByText('Seu perfil não pode aplicar esta etapa.')).toBeInTheDocument();
  });

  it('lista de responsáveis com erro: "Tentar de novo" recarrega', async () => {
    const responsaveis = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValue(RESPONSAVEIS);
    const { usuario } = renderizar(apiSimulada({ responsaveis }));
    await usuario.click(within(await modal()).getByRole('button', { name: 'Retomar revisão' }));
    const etapa = await screen.findByRole('dialog', { name: 'Atualizar etapa' });
    await usuario.click(await within(etapa).findByRole('button', { name: 'Tentar de novo' }));
    expect(await within(etapa).findByRole('combobox', { name: /Responsável/ })).toBeInTheDocument();
  });

  it('Aprovar pede confirmação ("a aprovação é final") e envia responsavelId null', async () => {
    const api = apiSimulada({ documento: comStatus('Para aprovação qualidade') });
    const { usuario } = renderizar(api);
    const dialogo = await modal();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprovar' }));
    const confirmar = await screen.findByRole('dialog', { name: 'Aprovar documento' });
    expect(confirmar).toHaveTextContent('Aprovar Controle de informação documentada?');
    expect(confirmar).toHaveTextContent('A aprovação é final e encerra a tramitação.');
    await usuario.click(within(confirmar).getByRole('button', { name: 'Voltar' }));
    expect(api.mudarStatus).not.toHaveBeenCalled();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprovar' }));
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Aprovar documento' })).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() =>
      expect(api.mudarStatus).toHaveBeenCalledWith('DOC-1', { para: 'Aprovado', responsavelId: null, observacao: null, versao: 4 }),
    );
    expect(await screen.findByText('Etapa registrada: Aprovado.')).toBeInTheDocument();
  });

  it('Cancelar exige motivo de 10 a 500 caracteres e entrega o resultado ao Painel', async () => {
    const api = apiSimulada();
    const { usuario, aoCancelar } = renderizar(api);
    await usuario.click(within(await modal()).getByRole('button', { name: 'Cancelar' }));
    const cancelar = await screen.findByRole('dialog', { name: 'Cancelar documento' });
    const motivo = within(cancelar).getByLabelText(/Motivo do cancelamento/);
    await waitFor(() => expect(motivo).toHaveFocus());
    await usuario.type(motivo, 'curto');
    await usuario.click(within(cancelar).getByRole('button', { name: 'Sim, cancelar' }));
    expect(await within(cancelar).findByText(/Motivo do cancelamento: /)).toBeInTheDocument();
    expect(motivo).toHaveAccessibleDescription(/5\/500/);
    expect(api.cancelarDocumento).not.toHaveBeenCalled();
    await usuario.type(motivo, ' demais: documento substituído');
    await usuario.click(within(cancelar).getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() =>
      expect(api.cancelarDocumento).toHaveBeenCalledWith('DOC-1', { motivo: 'curto demais: documento substituído', versao: 4 }),
    );
    await waitFor(() => expect(aoCancelar).toHaveBeenCalledWith(expect.objectContaining({ documento: expect.objectContaining({ status: 'Cancelado' }) })));
  });

  it('Reativar confirma nomeando o status de volta (último cancelamento) e usa a rota de reativação', async () => {
    const eventos = [
      ...EVENTOS,
      evento(5, { tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior: 'Em revisão da qualidade' }),
      evento(6, { status: 'Em revisão da qualidade', statusAnterior: 'Cancelado' }),
      evento(7, { tipoAcao: 'CANCELAMENTO', status: 'Cancelado', statusAnterior: 'Devolvido para correção' }),
    ];
    const api = apiSimulada({ documento: comStatus('Cancelado', {}, eventos) });
    const { usuario, aoReativar } = renderizar(api);
    await usuario.click(within(await modal()).getByRole('button', { name: 'Reativar' }));
    const confirmar = await screen.findByRole('dialog', { name: 'Reativar documento' });
    expect(confirmar).toHaveTextContent('Ele volta para Devolvido para correção.');
    await usuario.click(within(confirmar).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(api.reativarDocumento).toHaveBeenCalledWith('DOC-1', { observacao: null, versao: 4 }));
    await waitFor(() => expect(aoReativar).toHaveBeenCalled());
    expect(await screen.findByText('Documento reativado: Devolvido para correção.')).toBeInTheDocument();
  });

  it('Metas do ciclo nos três tons, com o estado por extenso', async () => {
    // Recebido em 01/09, revisão iniciada em 02/09 (1 dia: cumprida), sem aprovação (28 dias: no prazo).
    renderizar(apiSimulada());
    await modal();
    const metas = secao('Metas do ciclo');
    expect(metas).toHaveTextContent('Início da revisãoCumpridaIniciada em 1 dia (meta: 14)');
    expect(metas).toHaveTextContent('ConclusãoNo prazoEm andamento: 28 dias (meta: 40)');
    expect(within(metas).getByText('Cumprida').parentElement).toHaveAttribute('data-tom', 'sucesso');
    expect(within(metas).getByText('No prazo').parentElement).toHaveAttribute('data-tom', 'neutro');
  });

  it('Metas do ciclo: revisão não iniciada há mais de 14 dias fica "Estourada"; cancelado "Não se aplica"', async () => {
    const semRevisao = [EVENTOS[0]!];
    renderizar(apiSimulada({ documento: comStatus('Recebido', {}, semRevisao) }));
    await modal();
    const metas = secao('Metas do ciclo');
    expect(metas).toHaveTextContent('EstouradaAinda não iniciada: 28 dias (meta: 14)');
    expect(within(metas).getByText('Estourada').parentElement).toHaveAttribute('data-tom', 'erro');
  });
});
