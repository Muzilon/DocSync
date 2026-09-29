import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Area, Pessoa } from '@docsync/compartilhado';
import { ContextoApi, type Api } from '../api/cliente.ts';
import { ErroApi } from '../api/erros.ts';
import { ProvedorToast } from '../componentes/Toast.tsx';
import { TelaPessoas } from './TelaPessoas.tsx';

// Dados fictícios (CLAUDE.md, seção 4).
const PESSOAS: Pessoa[] = [
  { id: 'p1', nome: 'Bruna Teste', email: 'bruna@exemplo.test', perfil: 'Qualidade', area: 'Engenharia', areaId: 'a1', status: 'Ativo' },
  { id: 'p2', nome: 'Ana Admin', email: 'ana@exemplo.test', perfil: 'Administrador', area: null, areaId: null, status: 'Ativo' },
  { id: 'p3', nome: 'Caio Novo', email: 'caio@exemplo.test', perfil: null, area: null, areaId: null, status: 'Ativo' },
];

// Fora de ordem de propósito: a tela precisa ordenar.
const AREAS: Area[] = [
  { id: 'a3', nome: 'Suprimentos', ativa: true },
  { id: 'a1', nome: 'Engenharia', ativa: true },
  { id: 'a4', nome: 'Área Inativa', ativa: false },
  { id: 'a2', nome: 'Comercial', ativa: true },
  { id: 'a5', nome: 'Saúde Ocupacional', ativa: true },
];

function apiSimulada(sobrescrever: Partial<Api> = {}): Api {
  return {
    eu: vi.fn(),
    pessoas: vi.fn().mockResolvedValue(PESSOAS),
    areas: vi.fn().mockResolvedValue(AREAS),
    criarPessoa: vi.fn(),
    alterarPessoa: vi.fn(),
    ...sobrescrever,
  };
}

function renderizar(api: Api) {
  const usuario = userEvent.setup();
  render(
    <ContextoApi.Provider value={api}>
      <ProvedorToast>
        <TelaPessoas />
      </ProvedorToast>
    </ContextoApi.Provider>,
  );
  return usuario;
}

describe('TelaPessoas', () => {
  it('lista as pessoas em ordem alfabética e as áreas ativas em ordem pt-BR', async () => {
    renderizar(apiSimulada());
    const linhas = await screen.findAllByRole('row');
    const nomes = linhas.slice(1).map((l) => within(l).getAllByRole('cell')[0]?.textContent);
    expect(nomes).toEqual(['Ana Admin', 'Bruna Teste', 'Caio Novo']);

    const selecaoArea = screen.getByLabelText(/^Área/, { selector: '#pessoa-area' });
    const opcoes = within(selecaoArea).getAllByRole('option').map((o) => o.textContent);
    expect(opcoes).toEqual(['Selecione', 'Comercial', 'Engenharia', 'Saúde Ocupacional', 'Suprimentos']);
  });

  it('filtra por nome ou e-mail, sem diferenciar acentos', async () => {
    const usuario = renderizar(apiSimulada());
    await screen.findByText('Bruna Teste');
    await usuario.type(screen.getByLabelText('Buscar por nome ou e-mail'), 'caio@');
    expect(screen.queryByText('Bruna Teste')).not.toBeInTheDocument();
    expect(screen.getByText('Caio Novo')).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('Buscar por nome ou e-mail'));
    await usuario.type(screen.getByLabelText('Buscar por nome ou e-mail'), 'xyz');
    expect(screen.getByText('Nenhuma pessoa encontrada para "xyz".')).toBeInTheDocument();
  });

  it('valida por script, mostra resumo e mensagens inline sem chamar a API', async () => {
    const api = apiSimulada();
    const usuario = renderizar(api);
    await screen.findByText('Bruna Teste');
    await usuario.type(screen.getByLabelText(/E-mail corporativo/), 'invalido');
    await usuario.click(screen.getByRole('button', { name: 'Pré-cadastrar' }));

    const resumo = screen.getByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 4 campos antes de salvar');
    expect(screen.getByLabelText(/E-mail corporativo/)).toHaveAccessibleDescription(
      'Informe um e-mail válido, como nome@empresa.com.br.',
    );
    expect(screen.getByLabelText(/^Nome/)).toHaveAttribute('aria-invalid', 'true');
    expect(api.criarPessoa).not.toHaveBeenCalled();
  });

  async function preencher(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.type(screen.getByLabelText(/E-mail corporativo/), 'dora@exemplo.test');
    await usuario.type(screen.getByLabelText(/^Nome/), 'Dora Silva');
    await usuario.selectOptions(screen.getByLabelText(/^Perfil/, { selector: '#pessoa-perfil' }), 'Solicitante');
    await usuario.selectOptions(screen.getByLabelText(/^Área/, { selector: '#pessoa-area' }), 'Engenharia');
  }

  it('pré-cadastra, mostra toast e inclui a pessoa na lista', async () => {
    const nova: Pessoa = { id: 'p4', nome: 'Dora Silva', email: 'dora@exemplo.test', perfil: 'Solicitante', area: 'Engenharia', areaId: 'a1', status: 'Ativo' };
    const api = apiSimulada({ criarPessoa: vi.fn().mockResolvedValue(nova) });
    const usuario = renderizar(api);
    await screen.findByText('Bruna Teste');
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Pré-cadastrar' }));

    expect(api.criarPessoa).toHaveBeenCalledWith({ email: 'dora@exemplo.test', nome: 'Dora Silva', perfil: 'Solicitante', areaId: 'a1' });
    expect(await screen.findByText('Dora Silva foi pré-cadastrada.')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Dora Silva' })).toBeInTheDocument();
  });

  it('mostra "e-mail já existe" no campo quando a API responde 409', async () => {
    const api = apiSimulada({ criarPessoa: vi.fn().mockRejectedValue(new ErroApi(409, 'email_existente')) });
    const usuario = renderizar(api);
    await screen.findByText('Bruna Teste');
    await preencher(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Pré-cadastrar' }));

    expect(await screen.findByLabelText(/E-mail corporativo/)).toHaveAccessibleDescription(
      'Já existe uma pessoa cadastrada com este e-mail.',
    );
  });

  it('inativa com diálogo customizado e mostra o erro do último administrador em pt-BR', async () => {
    const api = apiSimulada({ alterarPessoa: vi.fn().mockRejectedValue(new ErroApi(409, 'ultimo_administrador')) });
    const usuario = renderizar(api);
    await usuario.click(await screen.findByRole('button', { name: 'Inativar Ana Admin' }));

    const dialogo = screen.getByRole('dialog', { name: 'Inativar Ana Admin?' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Inativar' }));

    expect(api.alterarPessoa).toHaveBeenCalledWith('p2', { status: 'Inativo' });
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Não é possível remover o último administrador ativo.');
  });

  it('edita perfil e área enviando só o que mudou', async () => {
    const atualizada: Pessoa = { ...PESSOAS[0]!, perfil: 'Leitor', area: 'Comercial', areaId: 'a2' };
    const api = apiSimulada({ alterarPessoa: vi.fn().mockResolvedValue(atualizada) });
    const usuario = renderizar(api);
    await usuario.click(await screen.findByRole('button', { name: 'Editar Bruna Teste' }));

    const dialogo = screen.getByRole('dialog', { name: 'Editar Bruna Teste' });
    await usuario.selectOptions(within(dialogo).getByLabelText('Perfil'), 'Leitor');
    await usuario.selectOptions(within(dialogo).getByLabelText('Área'), 'Comercial');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));

    expect(api.alterarPessoa).toHaveBeenCalledWith('p1', { perfil: 'Leitor', areaId: 'a2' });
    expect(await screen.findByText('Dados de Bruna Teste atualizados.')).toBeInTheDocument();
  });

  it('no diálogo, usa o areaId da pessoa e marca a área atual inativa como "(inativa)"', async () => {
    const antiga: Pessoa = {
      id: 'p5',
      nome: 'Eva Antiga',
      email: 'eva@exemplo.test',
      perfil: 'Leitor',
      area: 'Área Inativa',
      areaId: 'a4',
      status: 'Ativo',
    };
    const atualizada: Pessoa = { ...antiga, perfil: 'Qualidade' };
    const api = apiSimulada({
      pessoas: vi.fn().mockResolvedValue([...PESSOAS, antiga]),
      alterarPessoa: vi.fn().mockResolvedValue(atualizada),
    });
    const usuario = renderizar(api);
    await usuario.click(await screen.findByRole('button', { name: 'Editar Eva Antiga' }));

    const dialogo = screen.getByRole('dialog', { name: 'Editar Eva Antiga' });
    const area = within(dialogo).getByLabelText('Área');
    expect(area).toHaveValue('a4');
    expect(within(area).getByRole('option', { selected: true })).toHaveTextContent('Área Inativa (inativa)');
    expect(within(area).queryByRole('option', { name: 'Sem área' })).not.toBeInTheDocument();

    // Mudar só o perfil não reenvia a área atual.
    await usuario.selectOptions(within(dialogo).getByLabelText('Perfil'), 'Qualidade');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    expect(api.alterarPessoa).toHaveBeenCalledWith('p5', { perfil: 'Qualidade' });
  });

  it('mostra erro de conexão com "Tentar novamente"', async () => {
    const pessoas = vi.fn().mockRejectedValueOnce(new ErroApi(0, 'sem_conexao')).mockResolvedValue(PESSOAS);
    const usuario = renderizar(apiSimulada({ pessoas }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor');
    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Bruna Teste')).toBeInTheDocument();
  });
});
