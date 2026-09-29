import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  Area,
  DetalheDocumento,
  Documento,
  EdicaoDocumento,
  EventoHistorico,
  Pessoa,
  ResultadoEdicao,
  StatusDocumento,
  TipoDocumento,
} from '@docsync/compartilhado';
import { ContextoApi, type Api } from '../api/cliente.ts';
import { ErroApi } from '../api/erros.ts';
import { ContextoSessao } from '../autenticacao/Sessao.tsx';
import { podeEditar } from '../permissoes.ts';
import { DetalhesDocumento } from './DetalhesDocumento.tsx';
import { textoDiferenca } from './DialogoEditarDados.tsx';

// Dados fictícios (CLAUDE.md, seção 4).
const HOJE = '2026-09-29';
const QUALIDADE: Pessoa = { id: 'USR-1', nome: 'Bruna Teste', email: 'bruna@exemplo.test', perfil: 'Qualidade', area: 'Qualidade', areaId: 'a2', status: 'Ativo' };
const ADMIN: Pessoa = { ...QUALIDADE, id: 'USR-0', perfil: 'Administrador' };
const LEITOR: Pessoa = { ...QUALIDADE, id: 'USR-3', perfil: 'Leitor' };
const SOLICITANTE: Pessoa = { ...QUALIDADE, id: 'USR-4', perfil: 'Solicitante' };
const SOLICITANTE_OUTRA_AREA: Pessoa = { ...SOLICITANTE, id: 'USR-5', area: 'Engenharia', areaId: 'a1' };

const AREAS: Area[] = [
  { id: 'a1', nome: 'Engenharia', ativa: true },
  { id: 'a2', nome: 'Qualidade', ativa: true },
  { id: 'a0', nome: 'Almoxarifado', ativa: true },
  { id: 'a9', nome: 'Obras antigas', ativa: false },
];
const TIPOS: TipoDocumento[] = [
  { id: 'TIPO-1', nome: 'PR - Procedimento', ativo: true },
  { id: 'TIPO-2', nome: 'IT - Instrução de Trabalho', ativo: true },
  { id: 'TIPO-8', nome: 'MN - Manual antigo', ativo: false },
];

const DOCUMENTO: Documento = {
  id: 'DOC-1', codigo: 'PR-QUA-0007', titulo: 'Controle de informação documentada', status: 'Devolvido para correção',
  tipoDocumentoId: 'TIPO-1', tipoDocumento: 'PR - Procedimento', revisao: 2, dataRecebimento: '2026-09-01', dataRevisao: '2026-10-09',
  reprogramado: false, qtdReprogramacoes: 0, remetente: 'Ana Exemplo', areaId: 'a2', area: 'Qualidade', disciplina: null,
  observacao: null, nomePasta: 'x', nomeArquivoPrincipal: 'x.pdf', qtdAnexos: 0, idDocumentoOrigem: null,
  responsavelId: 'USR-5', responsavel: 'Célia Teste', versao: 4, criadoPor: 'USR-9', criadoEm: '2026-09-01T12:00:00Z', dataModificacao: '2026-09-10T15:00:00Z',
};

function evento(n: number, extra: Partial<EventoHistorico> = {}): EventoHistorico {
  return {
    id: `HIST-${n}`, idDocumento: 'DOC-1', codigo: 'PR-QUA-0007', tipoAcao: 'CRIACAO', status: 'Recebido', statusAnterior: null,
    dataHora: `2026-09-${String(n).padStart(2, '0')}T12:00:00Z`, destino: null, responsavel: null, responsavelId: null,
    autorId: 'USR-9', autorNome: 'Ana Exemplo', detalhes: [], observacao: null, ...extra,
  };
}
const EVENTOS = [evento(1)];

function detalhe(documento: Partial<Documento> = {}, eventos = EVENTOS): DetalheDocumento {
  return { documento: { ...DOCUMENTO, ...documento }, arquivos: [], eventos, hoje: HOJE };
}

function apiSimulada(sobrescrever: Partial<Api> = {}): Api {
  return {
    eu: vi.fn(), pessoas: vi.fn(), criarPessoa: vi.fn(), alterarPessoa: vi.fn(), criarDocumento: vi.fn(),
    documentosRecentes: vi.fn(), painel: vi.fn(), baixarArquivo: vi.fn(), reprogramarPrazo: vi.fn(), mudarStatus: vi.fn(),
    cancelarDocumento: vi.fn(), reativarDocumento: vi.fn(), responsaveis: vi.fn().mockResolvedValue([]),
    areas: vi.fn().mockResolvedValue(AREAS),
    tiposDocumento: vi.fn().mockResolvedValue(TIPOS),
    documento: vi.fn().mockResolvedValue(detalhe()),
    editarDados: vi.fn(async (_id: string, dados: EdicaoDocumento): Promise<ResultadoEdicao> => ({
      documento: { ...DOCUMENTO, ...dados, versao: dados.versao + 1 },
      evento: evento(20, { tipoAcao: 'EDICAO', status: DOCUMENTO.status, detalhes: [{ campo: 'titulo', antes: DOCUMENTO.titulo, depois: dados.titulo }] }),
    })),
    ...sobrescrever,
  };
}

function renderizar(api: Api, eu: Pessoa = QUALIDADE) {
  const usuario = userEvent.setup();
  const aoAtualizarDocumento = vi.fn();
  render(
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <DetalhesDocumento documentoId="DOC-1" aoFechar={vi.fn()} aoAtualizarDocumento={aoAtualizarDocumento} />
      </ContextoSessao.Provider>
    </ContextoApi.Provider>,
  );
  return { usuario, aoAtualizarDocumento };
}

const detalhes = () => screen.findByRole('dialog', { name: 'Controle de informação documentada' });

async function abrirEdicao(api: Api, eu: Pessoa = QUALIDADE) {
  const r = renderizar(api, eu);
  const modal = await detalhes();
  const botao = within(modal).getByRole('button', { name: 'Editar dados' });
  await r.usuario.click(botao);
  const dialogo = await screen.findByRole('dialog', { name: 'Editar dados' });
  await within(dialogo).findByLabelText(/Título do documento/);
  return { ...r, modal, botao, dialogo };
}

const campo = (dialogo: HTMLElement, rotulo: RegExp) => within(dialogo).getByLabelText(rotulo);

describe('podeEditar (botão "Editar dados")', () => {
  it.each<[string, Pessoa, StatusDocumento, boolean]>([
    ['Qualidade em Recebido', QUALIDADE, 'Recebido', true],
    ['Qualidade em Para aprovação', QUALIDADE, 'Para aprovação qualidade', true],
    ['Administrador em Aprovado', ADMIN, 'Aprovado', false],
    ['Administrador em Cancelado', ADMIN, 'Cancelado', false],
    ['Solicitante da área em Recebido', SOLICITANTE, 'Recebido', false],
    ['Solicitante da área em Devolvido', SOLICITANTE, 'Devolvido para correção', true],
    ['Solicitante de outra área em Devolvido', SOLICITANTE_OUTRA_AREA, 'Devolvido para correção', false],
    ['Leitor', LEITOR, 'Devolvido para correção', false],
  ])('%s → %s', (_nome, eu, status, esperado) => {
    expect(podeEditar(eu, { status, areaId: 'a2' })).toBe(esperado);
  });

  it('textoDiferenca: rótulo do histórico, aspas e "—" para vazio', () => {
    expect(textoDiferenca({ campo: 'titulo', antes: 'A', depois: 'B' })).toBe('Título: “A” → “B”');
    expect(textoDiferenca({ campo: 'disciplina', antes: null, depois: 'Corporativo' })).toBe('Disciplina: — → “Corporativo”');
  });
});

describe('DetalhesDocumento: Editar dados (F6)', () => {
  it('rodapé: "Editar dados" depois de "Atualizar etapa…" e antes de "Cancelar documento"', async () => {
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ status: 'Recebido', responsavelId: null, responsavel: null })) }));
    const modal = await detalhes();
    const textos = within(modal).getAllByRole('button').map((b) => b.textContent);
    expect(textos.indexOf('Editar dados')).toBe(textos.indexOf('Atualizar etapa…') + 1);
    expect(textos.indexOf('Cancelar documento')).toBe(textos.indexOf('Editar dados') + 1);
  });

  it.each<[string, Pessoa, StatusDocumento]>([
    ['Leitor', LEITOR, 'Devolvido para correção'],
    ['Solicitante fora de devolvido', SOLICITANTE, 'Recebido'],
    ['Aprovado (mesmo Administrador)', ADMIN, 'Aprovado'],
    ['Cancelado (mesmo Administrador)', ADMIN, 'Cancelado'],
  ])('%s: sem botão (nem desativado)', async (_nome, eu, status) => {
    renderizar(apiSimulada({ documento: vi.fn().mockResolvedValue(detalhe({ status })) }), eu);
    const modal = await detalhes();
    expect(within(modal).queryByRole('button', { name: 'Editar dados' })).not.toBeInTheDocument();
  });

  it('diálogo preenchido com os valores atuais, foco no Título, sem arquivo nem status editável', async () => {
    const { dialogo } = await abrirEdicao(apiSimulada());
    await waitFor(() => expect(campo(dialogo, /Título do documento/)).toHaveFocus());
    expect(campo(dialogo, /Título do documento/)).toHaveValue('Controle de informação documentada');
    expect(campo(dialogo, /Código do documento/)).toHaveValue('PR-QUA-0007');
    expect(campo(dialogo, /Tipo de documento/)).toHaveValue('TIPO-1');
    expect(campo(dialogo, /Remetente/)).toHaveValue('Ana Exemplo');
    expect(campo(dialogo, /Área/)).toHaveValue('a2');
    expect(campo(dialogo, /N° de revisão/)).toHaveValue(2);
    expect(campo(dialogo, /Disciplina/)).toHaveValue('');
    expect(dialogo).toHaveTextContent('Status, responsável, data de recebimento, prazo e arquivos não se alteram aqui.');
    expect(dialogo.querySelector('input[type="file"]')).toBeNull();
    expect(within(dialogo).queryByLabelText(/Status/)).not.toBeInTheDocument();
    // Áreas: só ativas, em ordem pt-BR; tipo inativo não aparece (o atual está ativo).
    const areas = within(campo(dialogo, /Área/)).getAllByRole('option').map((o) => o.textContent);
    expect(areas).toEqual(['Selecione a área…', 'Almoxarifado', 'Engenharia', 'Qualidade']);
    expect(within(campo(dialogo, /Tipo de documento/)).queryByText(/Manual antigo/)).not.toBeInTheDocument();
  });

  it('tipo atual inativo aparece como "(inativo)" e área atual inativa como "(inativa)"', async () => {
    const api = apiSimulada({
      documento: vi.fn().mockResolvedValue(detalhe({ tipoDocumentoId: 'TIPO-8', tipoDocumento: 'MN - Manual antigo', areaId: 'a9', area: 'Obras antigas' })),
    });
    const { dialogo } = await abrirEdicao(api);
    expect(campo(dialogo, /Tipo de documento/)).toHaveValue('TIPO-8');
    expect(within(dialogo).getByRole('option', { name: 'MN - Manual antigo (inativo)' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('option', { name: 'Obras antigas (inativa)' })).toBeInTheDocument();
  });

  it('Solicitante (devolvido, sua área): área travada, com a dica', async () => {
    const { dialogo } = await abrirEdicao(apiSimulada(), SOLICITANTE);
    const area = campo(dialogo, /Área/);
    expect(area.tagName).toBe('INPUT');
    expect(area).toHaveAttribute('readonly');
    expect(area).toHaveValue('Qualidade');
    expect(area).toHaveAccessibleDescription(/Você edita documentos só na sua área\./);
  });

  it('validação pela função compartilhada: resumo focável com links e erros inline; nada enviado', async () => {
    const api = apiSimulada();
    const { usuario, dialogo } = await abrirEdicao(api);
    await usuario.clear(campo(dialogo, /Título do documento/));
    await usuario.clear(campo(dialogo, /Remetente/));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    const resumo = within(dialogo).getByText('Corrija 2 campos antes de salvar:').parentElement!;
    await waitFor(() => expect(resumo).toHaveFocus());
    expect(within(resumo).getByRole('link', { name: 'Título do documento: Informe o título do documento.' })).toHaveAttribute('href', '#edicao-titulo');
    expect(campo(dialogo, /Remetente/)).toHaveAccessibleDescription(/Informe o remetente ou solicitante\./);
    expect(campo(dialogo, /Remetente/)).toHaveAttribute('aria-invalid', 'true');
    await usuario.click(within(resumo).getByRole('link', { name: /Remetente/ }));
    expect(campo(dialogo, /Remetente/)).toHaveFocus();
    expect(api.editarDados).not.toHaveBeenCalled();
  });

  it('sem alteração: "Nenhum campo foi alterado." e nenhuma chamada', async () => {
    const api = apiSimulada();
    const { usuario, dialogo } = await abrirEdicao(api);
    // Espaços a mais não contam: a validação apara antes de comparar.
    await usuario.type(campo(dialogo, /Título do documento/), '  ');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    // Informativo (role=status), não erro; o foco vai para o bloco.
    const aviso = within(dialogo).getByRole('status');
    expect(aviso).toHaveTextContent('Nenhum campo foi alterado.');
    expect(aviso).toHaveFocus();
    expect(within(dialogo).queryByRole('alert')).toBeNull();
    expect(api.editarDados).not.toHaveBeenCalled();
  });

  it('salvar: envia os 8 campos + versão, fecha, anuncia, atualiza o cartão e a linha do tempo ganha o EDICAO', async () => {
    const editado: Documento = { ...DOCUMENTO, titulo: 'Controle de documentos', areaId: 'a1', area: 'Engenharia', versao: 5 };
    const eventoEdicao = evento(20, {
      tipoAcao: 'EDICAO', status: DOCUMENTO.status,
      detalhes: [
        { campo: 'titulo', antes: DOCUMENTO.titulo, depois: 'Controle de documentos' },
        { campo: 'area', antes: 'Qualidade', depois: 'Engenharia' },
      ],
    });
    const documento = vi.fn().mockResolvedValueOnce(detalhe()).mockResolvedValue(detalhe(editado, [...EVENTOS, eventoEdicao]));
    const editarDados = vi.fn().mockResolvedValue({ documento: editado, evento: eventoEdicao });
    const api = apiSimulada({ documento, editarDados });
    const { usuario, dialogo, botao, aoAtualizarDocumento } = await abrirEdicao(api);
    const titulo = campo(dialogo, /Título do documento/);
    await usuario.clear(titulo);
    await usuario.type(titulo, '  Controle de documentos ');
    await usuario.selectOptions(campo(dialogo, /Área/), 'a1');
    await usuario.type(campo(dialogo, /Disciplina/), '   ');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));

    expect(editarDados).toHaveBeenCalledWith('DOC-1', {
      titulo: 'Controle de documentos', codigo: 'PR-QUA-0007', tipoDocumentoId: 'TIPO-1', revisao: 2, remetente: 'Ana Exemplo',
      areaId: 'a1', disciplina: null, observacao: null, versao: 4,
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar dados' })).not.toBeInTheDocument());
    expect(aoAtualizarDocumento).toHaveBeenCalledWith(editado);
    expect(botao).toHaveFocus();
    const modal = await screen.findByRole('dialog', { name: 'Controle de documentos' });
    expect(within(modal).getByRole('status')).toHaveTextContent('Dados atualizados: Título, Área.');
    const linha = within(modal).getByRole('region', { name: 'Linha do tempo' });
    await waitFor(() => expect(linha).toHaveTextContent('Edição de dados'));
    expect(linha).toHaveTextContent('Título e Área alterados');
    await usuario.click(within(linha).getAllByRole('button', { name: /Detalhes/ })[0]!);
    expect(linha).toHaveTextContent(/Título:\s*Controle de informação documentada\s*→\s*para Controle de documentos/);
  });

  it('409 conflito_versao: mantém o digitado, lista o que mudou, dica nos campos e reenvia com a versão nova', async () => {
    const atual: Documento = { ...DOCUMENTO, remetente: 'Outra Pessoa', disciplina: 'Corporativo', versao: 6 };
    const editarDados = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'conflito_versao', {}, atual))
      .mockResolvedValue({ documento: { ...atual, titulo: 'Meu título', versao: 7 }, evento: evento(21, { tipoAcao: 'EDICAO', detalhes: [{ campo: 'titulo', antes: 'x', depois: 'Meu título' }] }) });
    const { usuario, dialogo, aoAtualizarDocumento } = await abrirEdicao(apiSimulada({ editarDados }));
    const titulo = campo(dialogo, /Título do documento/);
    await usuario.clear(titulo);
    await usuario.type(titulo, 'Meu título');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));

    const aviso = await within(dialogo).findByText('Alguém alterou este documento enquanto você editava.');
    await waitFor(() => expect(aviso.parentElement).toHaveFocus());
    expect(aviso.parentElement).toHaveTextContent('Remetente: “Ana Exemplo” → “Outra Pessoa”');
    expect(aviso.parentElement).toHaveTextContent('Disciplina: — → “Corporativo”');
    expect(dialogo).toBeInTheDocument();
    expect(titulo).toHaveValue('Meu título');
    // Campos que a pessoa não tocou passam ao valor atual (nada volta atrás em silêncio).
    expect(campo(dialogo, /Remetente/)).toHaveValue('Outra Pessoa');
    expect(campo(dialogo, /Remetente/)).toHaveAccessibleDescription(/Valor atual no servidor: Outra Pessoa\./);
    expect(aoAtualizarDocumento).toHaveBeenCalledWith(atual);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    expect(editarDados).toHaveBeenLastCalledWith('DOC-1', expect.objectContaining({ titulo: 'Meu título', remetente: 'Outra Pessoa', disciplina: 'Corporativo', versao: 6 }));
  });

  it('409 conflito_versao para Aprovado: o botão Salvar some e o aviso diz o porquê', async () => {
    const aprovado: Documento = { ...DOCUMENTO, status: 'Aprovado', responsavelId: null, responsavel: null, versao: 5 };
    const editarDados = vi.fn().mockRejectedValue(new ErroApi(409, 'conflito_versao', {}, aprovado));
    const { usuario, dialogo } = await abrirEdicao(apiSimulada({ editarDados }));
    await usuario.type(campo(dialogo, /Disciplina/), 'Mecânica');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    expect(await within(dialogo).findByText('Documento aprovado é final. Para corrigir, cadastre uma revisão.')).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });

  it('409 codigo_revisao_existente: erro inline em Código', async () => {
    const editarDados = vi.fn().mockRejectedValue(new ErroApi(409, 'codigo_revisao_existente', { codigo: 'x' }));
    const { usuario, dialogo } = await abrirEdicao(apiSimulada({ editarDados }));
    const codigo = campo(dialogo, /Código do documento/);
    await usuario.clear(codigo);
    await usuario.type(codigo, 'PR-QUA-0001');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(codigo).toHaveAccessibleDescription(/Já existe um documento com este código nesta revisão\./));
    expect(within(dialogo).getByText('Corrija 1 campo antes de salvar:')).toBeInTheDocument();
  });

  it('400 dados_invalidos inline por campo; 403 com a mensagem do servidor', async () => {
    const editarDados = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(400, 'dados_invalidos', { tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.' }))
      .mockRejectedValueOnce(new ErroApi(403, 'sem_permissao', {}, null, 'Seu perfil não pode mover o documento para outra área.'));
    const { usuario, dialogo } = await abrirEdicao(apiSimulada({ editarDados }));
    await usuario.selectOptions(campo(dialogo, /Tipo de documento/), 'TIPO-2');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(campo(dialogo, /Tipo de documento/)).toHaveAccessibleDescription(/não encontrado ou inativo/));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    expect(await within(dialogo).findByText('Seu perfil não pode mover o documento para outra área.')).toBeInTheDocument();
  });

  it('sem conexão: "Tentar novamente" reenvia o MESMO corpo', async () => {
    const editarDados = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(0, 'sem_conexao'))
      .mockResolvedValue({ documento: { ...DOCUMENTO, disciplina: 'Mecânica', versao: 5 }, evento: evento(22, { tipoAcao: 'EDICAO', detalhes: [{ campo: 'disciplina', antes: null, depois: 'Mecânica' }] }) });
    const { usuario, dialogo } = await abrirEdicao(apiSimulada({ editarDados }));
    await usuario.type(campo(dialogo, /Disciplina/), 'Mecânica');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    const repetir = await within(dialogo).findByRole('button', { name: 'Tentar novamente' });
    expect(dialogo).toHaveTextContent('O que você digitou foi mantido.');
    await usuario.click(repetir);
    await waitFor(() => expect(editarDados).toHaveBeenCalledTimes(2));
    expect(editarDados.mock.calls[1]).toEqual(editarDados.mock.calls[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar dados' })).not.toBeInTheDocument());
  });

  it('listas com erro: "Tentar novamente" dentro do diálogo recarrega', async () => {
    const tiposDocumento = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValue(TIPOS);
    const { usuario } = renderizar(apiSimulada({ tiposDocumento }));
    const modal = await detalhes();
    await usuario.click(within(modal).getByRole('button', { name: 'Editar dados' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar dados' });
    await usuario.click(await within(dialogo).findByRole('button', { name: /Tentar/ }));
    expect(await within(dialogo).findByLabelText(/Título do documento/)).toBeInTheDocument();
  });

  it('Esc com alterações pede "Descartar alterações?"; "Continuar editando" mantém; sem alterações fecha e devolve o foco', async () => {
    const { usuario, dialogo, botao } = await abrirEdicao(apiSimulada());
    await usuario.type(campo(dialogo, /Disciplina/), 'Mecânica');
    fireEvent(dialogo, new Event('cancel', { cancelable: true }));
    const confirmar = await screen.findByRole('dialog', { name: 'Descartar alterações?' });
    await usuario.click(within(confirmar).getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).not.toBeInTheDocument();
    expect(campo(dialogo, /Disciplina/)).toHaveValue('Mecânica');

    await usuario.click(within(dialogo).getByRole('button', { name: 'Voltar' }));
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar dados' })).not.toBeInTheDocument());
    expect(botao).toHaveFocus();

    await usuario.click(botao);
    const denovo = await screen.findByRole('dialog', { name: 'Editar dados' });
    expect(within(denovo).getByLabelText(/Disciplina/)).toHaveValue('');
    fireEvent(denovo, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar dados' })).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
  });
});
