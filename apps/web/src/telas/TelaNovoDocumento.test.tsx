import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { Area, Documento, NovoDocumento, Pessoa, TipoDocumento } from '@docsync/compartilhado';
import { ContextoApi, type Api } from '../api/cliente.ts';
import { ErroApi } from '../api/erros.ts';
import { ContextoSessao } from '../autenticacao/Sessao.tsx';
import { ProvedorToast } from '../componentes/Toast.tsx';
import { TelaNovoDocumento, validarDocumento, dadosIniciais } from './TelaNovoDocumento.tsx';

// Dados fictícios (CLAUDE.md, seção 4).
const EU: Pessoa = { id: 'USR-1', nome: 'Bruna Teste', email: 'bruna@exemplo.test', perfil: 'Qualidade', area: 'Engenharia', areaId: 'a1', status: 'Ativo' };
const SOLICITANTE: Pessoa = { ...EU, id: 'USR-2', nome: 'Caio Solicitante', perfil: 'Solicitante' };
const AREAS: Area[] = [
  { id: 'a3', nome: 'Suprimentos', ativa: true },
  { id: 'a1', nome: 'Engenharia', ativa: true },
  { id: 'a2', nome: 'Comercial', ativa: true },
];
const TIPOS: TipoDocumento[] = [
  { id: 'T1', nome: 'PR - Procedimento', ativo: true },
  { id: 'T2', nome: 'IT - Instrução de Trabalho', ativo: true },
];

function documentoDe(d: NovoDocumento): Documento {
  return {
    ...d,
    codigo: d.codigo,
    status: 'Recebido',
    // Gravadas pelo servidor (decisões 0011 e 0012).
    dataRecebimento: '2026-09-29',
    dataRevisao: '2026-10-29',
    reprogramado: false,
    qtdReprogramacoes: 0,
    tipoDocumento: 'PR - Procedimento',
    area: 'Engenharia',
    nomePasta: d.titulo,
    nomeArquivoPrincipal: 'principal.pdf',
    qtdAnexos: 0,
    idDocumentoOrigem: null,
    responsavelId: null,
    responsavel: null,
    versao: 1,
    criadoPor: 'USR-1',
    criadoEm: '2026-09-29T12:00:00Z',
    dataModificacao: '2026-09-29T12:00:00Z',
  };
}

function apiSimulada(sobrescrever: Partial<Api> = {}): Api {
  return {
    eu: vi.fn(),
    pessoas: vi.fn(),
    areas: vi.fn().mockResolvedValue(AREAS),
    criarPessoa: vi.fn(),
    alterarPessoa: vi.fn(),
    tiposDocumento: vi.fn().mockResolvedValue(TIPOS),
    baixarArquivo: vi.fn(),
    documentosRecentes: vi.fn().mockResolvedValue([]),
    criarDocumento: vi.fn(async (d: NovoDocumento) => documentoDe(d)),
    documento: vi.fn().mockRejectedValue(new ErroApi(404, 'desconhecido')),
    painel: vi.fn(),
    mudarStatus: vi.fn(),
    cancelarDocumento: vi.fn(),
    reativarDocumento: vi.fn(),
    responsaveis: vi.fn(),
    reprogramarPrazo: vi.fn(),
    ...sobrescrever,
  };
}

/** Mostra o endereço atual (destino da ação "Abrir detalhes" do toast). */
function SondaRota() {
  const local = useLocation();
  return <p>Endereço: {local.pathname}</p>;
}

function renderizar(api: Api, eu: Pessoa = EU) {
  // applyAccept: false deixa o teste escolher arquivos fora do "accept" (validação por script).
  const usuario = userEvent.setup({ applyAccept: false });
  render(
    <ContextoApi.Provider value={api}>
      <ContextoSessao.Provider value={{ eu, sair: () => undefined }}>
        <MemoryRouter initialEntries={['/documentos/novo']}>
          <ProvedorToast>
            <Routes>
              <Route path="/documentos/novo" element={<TelaNovoDocumento />} />
              <Route path="/documentos/:id" element={<SondaRota />} />
            </Routes>
          </ProvedorToast>
        </MemoryRouter>
      </ContextoSessao.Provider>
    </ContextoApi.Provider>,
  );
  return usuario;
}

const pdf = (nome = 'principal.pdf') => new File(['%PDF-conteudo'], nome, { type: 'application/pdf' });
const inputPrincipal = () => screen.getByLabelText(/Arquivo do documento principal/) as HTMLInputElement;
const inputAnexos = () => screen.getByLabelText(/Documentos complementares/) as HTMLInputElement;

async function preencherObrigatorios(usuario: ReturnType<typeof userEvent.setup>, comArquivo = true) {
  await usuario.type(await screen.findByLabelText(/Título do documento/), 'Procedimento de compras');
  await usuario.selectOptions(screen.getByLabelText(/Tipo de documento/), 'T1');
  if (comArquivo) await usuario.upload(inputPrincipal(), pdf());
}

describe('validarDocumento', () => {
  it('exige título, tipo, remetente, área e arquivo principal; revisão inteira >= 0', () => {
    const dados = { ...dadosIniciais(EU), remetente: ' ', revisao: '-1', areaId: '' };
    const erros = validarDocumento(dados, null, []);
    expect(Object.keys(erros).sort()).toEqual(
      ['arquivoPrincipal', 'areaId', 'remetente', 'revisao', 'tipoDocumentoId', 'titulo'].sort(),
    );
  });

  it('parte do estado inicial com remetente, área do usuário e revisão 0', () => {
    expect(dadosIniciais(EU)).toMatchObject({ remetente: 'Bruna Teste', areaId: 'a1', revisao: '0' });
  });
});

describe('TelaNovoDocumento', () => {
  it('P-02: sem arquivo principal mostra a mensagem no resumo e no campo, e o link foca o campo', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await preencherObrigatorios(usuario, false);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));

    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 1 campo antes de registrar:');
    await waitFor(() => expect(resumo).toHaveFocus());
    expect(inputPrincipal()).toHaveAttribute('aria-invalid', 'true');
    expect(inputPrincipal()).toHaveAccessibleDescription(/Selecione o arquivo do documento principal\./);

    await usuario.click(within(resumo).getByRole('link', { name: /Arquivo do documento principal/ }));
    expect(inputPrincipal()).toHaveFocus();
    expect(api.criarDocumento).not.toHaveBeenCalled();
  });

  it('recusa arquivo com extensão proibida antes do envio', async () => {
    const usuario = renderizar(apiSimulada());
    await screen.findByLabelText(/Título do documento/);
    await usuario.upload(inputPrincipal(), new File(['MZ'], 'programa.exe', { type: 'application/octet-stream' }));
    expect(screen.getByText(/programa\.exe: Formato não permitido/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover arquivo/ })).not.toBeInTheDocument();
  });

  it('anexos se somam a cada seleção e cada um pode ser removido', async () => {
    const usuario = renderizar(apiSimulada());
    await screen.findByLabelText(/Título do documento/);
    await usuario.upload(inputAnexos(), [pdf('a.pdf'), pdf('b.pdf')]);
    await usuario.upload(inputAnexos(), pdf('c.pdf'));
    expect(within(screen.getByRole('list', { name: 'Anexos a enviar' })).getAllByRole('listitem')).toHaveLength(3);
    await usuario.click(screen.getByRole('button', { name: 'Remover anexo b.pdf' }));
    expect(within(screen.getByRole('list', { name: 'Anexos a enviar' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('erro de envio: banner com "Tentar novamente", dados preservados e o reenvio usa o MESMO id', async () => {
    const criarDocumento = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(0, 'sem_conexao'))
      .mockImplementationOnce(async (d: NovoDocumento) => documentoDe(d));
    const usuario = renderizar(apiSimulada({ criarDocumento }));
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Não foi possível registrar o documento');
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('Procedimento de compras');
    expect(screen.getByRole('button', { name: 'Remover arquivo principal.pdf' })).toBeInTheDocument();

    await usuario.click(within(banner).getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText(/^Documento registrado\./);
    const [primeiro] = criarDocumento.mock.calls[0] as [NovoDocumento];
    const [segundo] = criarDocumento.mock.calls[1] as [NovoDocumento];
    expect(primeiro.id).toMatch(/^DOC-[0-9a-f-]{36}$/);
    expect(segundo.id).toBe(primeiro.id);
  });

  it('sucesso: toast, formulário limpo com remetente e área repreenchidos, e id renovado', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await preencherObrigatorios(usuario);
    await usuario.clear(screen.getByLabelText(/Remetente/));
    await usuario.type(screen.getByLabelText(/Remetente/), 'Outra Pessoa');
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));

    await screen.findByText(/^Documento registrado\./);
    expect(screen.getByRole('button', { name: 'Abrir detalhes' })).toBeInTheDocument();
    const enviado = vi.mocked(api.criarDocumento).mock.calls[0]![0];
    expect(enviado).not.toHaveProperty('dataRevisao');
    expect(enviado).not.toHaveProperty('dataRecebimento');
    expect(enviado).toMatchObject({ titulo: 'Procedimento de compras', remetente: 'Outra Pessoa', revisao: 0, codigo: null, areaId: 'a1' });
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('');
    expect(screen.getByLabelText(/Remetente/)).toHaveValue('Bruna Teste');
    expect(screen.getByLabelText(/^Área/)).toHaveValue('a1');
    expect(screen.queryByRole('button', { name: /Remover arquivo/ })).not.toBeInTheDocument();
    // O item aparece na lista de recentes.
    expect(screen.getByRole('cell', { name: 'Procedimento de compras' })).toBeInTheDocument();

    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    await waitFor(() => expect(api.criarDocumento).toHaveBeenCalledTimes(2));
    const segundo = vi.mocked(api.criarDocumento).mock.calls[1]![0];
    expect(segundo.id).not.toBe(enviado.id);
  });

  it('toast "Abrir detalhes" leva a /documentos/<id> (que redireciona para os detalhes no Painel)', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    await usuario.click(await screen.findByRole('button', { name: 'Abrir detalhes' }));
    const enviado = vi.mocked(api.criarDocumento).mock.calls[0]![0];
    expect(await screen.findByText(`Endereço: /documentos/${enviado.id}`)).toBeInTheDocument();
  });

  it('Limpar formulário (com confirmação) zera arquivo principal e anexos e repreenche remetente', async () => {
    const usuario = renderizar(apiSimulada());
    await preencherObrigatorios(usuario);
    await usuario.upload(inputAnexos(), pdf('anexo.pdf'));
    await usuario.clear(screen.getByLabelText(/Remetente/));

    await usuario.click(screen.getByRole('button', { name: 'Limpar formulário' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Limpar o formulário?' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Limpar formulário' }));

    expect(screen.queryByRole('button', { name: /Remover arquivo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Anexos a enviar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('');
    expect(screen.getByLabelText(/Remetente/)).toHaveValue('Bruna Teste');
    expect(screen.getByLabelText(/N° de revisão/)).toHaveValue(0);
  });

  it('Solicitante fica travado na própria área (campo só leitura)', async () => {
    renderizar(apiSimulada(), SOLICITANTE);
    const area = await screen.findByLabelText(/^Área/);
    expect(area.tagName).toBe('INPUT');
    expect(area).toHaveAttribute('readonly');
    expect(area).toHaveValue('Engenharia');
  });

  it('áreas em ordem alfabética pt-BR para quem pode escolher', async () => {
    renderizar(apiSimulada());
    const area = await screen.findByLabelText(/^Área/);
    expect(within(area).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Selecione a área…',
      'Comercial',
      'Engenharia',
      'Suprimentos',
    ]);
  });

  it('não mostra campos de prazo nem de data de recebimento (decisões 0010, 0011 e 0012)', async () => {
    renderizar(apiSimulada());
    await screen.findByLabelText(/Título do documento/);
    expect(screen.queryByLabelText(/Data de revisão/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Data de recebimento/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/prazo/i)).not.toBeInTheDocument();
  });

  it('toast de sucesso mostra o prazo devolvido pelo servidor', async () => {
    const usuario = renderizar(apiSimulada());
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    expect(await screen.findByText('Documento registrado. Prazo: 29/10/2026.')).toBeInTheDocument();
  });

  it('409 de código + revisão aparece no campo Código', async () => {
    const criarDocumento = vi.fn().mockRejectedValue(new ErroApi(409, 'codigo_revisao_existente'));
    const usuario = renderizar(apiSimulada({ criarDocumento }));
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText(/Código do documento/), 'PR-QUA-0001');
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));

    const codigo = screen.getByLabelText(/Código do documento/);
    await waitFor(() => expect(codigo).toHaveAttribute('aria-invalid', 'true'));
    expect(codigo).toHaveAccessibleDescription(/Já existe um documento com este código nesta revisão\./);
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('Procedimento de compras');
  });

  it('erros de campo da API vão para os campos, inclusive arquivos', async () => {
    const criarDocumento = vi
      .fn()
      .mockRejectedValue(new ErroApi(400, 'dados_invalidos', { anexos: 'Anexo recusado pelo servidor.', titulo: 'Título muito longo.' }));
    const usuario = renderizar(apiSimulada({ criarDocumento }));
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Título do documento: Título muito longo.');
    expect(resumo).toHaveTextContent('Documentos complementares: Anexo recusado pelo servidor.');
  });

  it('lista de recentes: vazio e erro com "Tentar novamente"', async () => {
    const documentosRecentes = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValueOnce([]);
    const usuario = renderizar(apiSimulada({ documentosRecentes }));
    const secao = screen.getByRole('region', { name: 'Documentos registrados recentemente' });
    await usuario.click(await within(secao).findByRole('button', { name: 'Tentar novamente' }));
    expect(await within(secao).findByText('Nenhum documento registrado ainda.')).toBeInTheDocument();
  });

  it('409 id_existente de documento da própria pessoa: trata como já registrado, limpa e só então renova o id', async () => {
    let gravado: Documento | null = null;
    const criarDocumento = vi
      .fn()
      .mockImplementationOnce(async (d: NovoDocumento) => {
        gravado = documentoDe(d); // gravou, mas a resposta se perdeu
        throw new ErroApi(0, 'sem_conexao');
      })
      .mockRejectedValueOnce(new ErroApi(409, 'id_existente'))
      .mockImplementation(async (d: NovoDocumento) => documentoDe(d));
    const documento = vi.fn(async () => ({ documento: gravado!, eventos: [], arquivos: [], hoje: '2026-09-29' }));
    const usuario = renderizar(apiSimulada({ criarDocumento, documento }));
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    await screen.findByText('Não foi possível registrar o documento');
    await usuario.type(screen.getByLabelText(/Título do documento/), ' editado');
    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText(/Este documento já tinha sido registrado/)).toBeInTheDocument();
    const idOriginal = (criarDocumento.mock.calls[0] as [NovoDocumento])[0].id;
    expect(documento).toHaveBeenCalledWith(idOriginal);
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('');
    expect(screen.getByRole('row', { name: /Procedimento de compras/ })).toBeInTheDocument();

    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    await waitFor(() => expect(criarDocumento).toHaveBeenCalledTimes(3));
    expect((criarDocumento.mock.calls[2] as [NovoDocumento])[0].id).not.toBe(idOriginal);
  });

  it('409 id_existente sem documento da pessoa (colisão): gera id novo e avisa para tentar de novo', async () => {
    const criarDocumento = vi
      .fn()
      .mockRejectedValueOnce(new ErroApi(409, 'id_existente'))
      .mockImplementation(async (d: NovoDocumento) => documentoDe(d));
    const outro = { ...documentoDe({ ...dadosIniciais(EU), id: 'x', codigo: null, revisao: 0, disciplina: null, observacao: null }), criadoPor: 'USR-OUTRO' };
    const documento = vi.fn(async () => ({ documento: outro, eventos: [], arquivos: [], hoje: '2026-09-29' }));
    const usuario = renderizar(apiSimulada({ criarDocumento, documento }));
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar documento' }));
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('Um novo identificador foi gerado');
    expect(screen.getByLabelText(/Título do documento/)).toHaveValue('Procedimento de compras');
    await usuario.click(within(banner).getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText(/^Documento registrado\./);
    const ids = criarDocumento.mock.calls.map((c) => (c as [NovoDocumento])[0].id);
    expect(ids[1]).not.toBe(ids[0]);
  });
});
