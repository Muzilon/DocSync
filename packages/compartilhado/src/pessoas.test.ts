import { describe, expect, it } from 'vitest';
import { PERFIS, acessoLiberado, ehPerfil, pode, type Acao, type Perfil, type Pessoa } from './pessoas.ts';

function pessoa(perfil: Perfil | null, extra: Partial<Pessoa> = {}): Pessoa {
  return {
    id: 'USR-teste',
    nome: 'Pessoa Fictícia',
    email: 'pessoa@exemplo.test',
    perfil,
    area: 'Qualidade',
    areaId: 'AREA-teste',
    status: 'Ativo',
    ...extra,
  };
}

describe('pode — tabela de permissões (sem contexto)', () => {
  const tabela: Record<Acao, Record<Perfil, boolean>> = {
    gerenciarPessoas: { Administrador: true, Qualidade: false, Solicitante: false, Leitor: false },
    verDocumentos: { Administrador: true, Qualidade: true, Solicitante: true, Leitor: true },
    // Solicitante só cadastra com contexto da sua área (ver o bloco seguinte).
    cadastrarDocumento: { Administrador: true, Qualidade: true, Solicitante: false, Leitor: false },
    // Decisão 0011: reprogramam Qualidade e Administrador.
    reprogramarPrazo: { Administrador: true, Qualidade: true, Solicitante: false, Leitor: false },
    // Decisão 0014: Leitor não baixa; Solicitante só com contexto da sua área (bloco seguinte).
    baixarArquivo: { Administrador: true, Qualidade: true, Solicitante: true, Leitor: false },
  };

  for (const [acao, porPerfil] of Object.entries(tabela) as [Acao, Record<Perfil, boolean>][]) {
    for (const perfil of PERFIS) {
      it(`${perfil} ${porPerfil[perfil] ? 'pode' : 'não pode'} ${acao}`, () => {
        expect(pode(pessoa(perfil), acao)).toBe(porPerfil[perfil]);
      });
    }
  }

  it('ninguém autenticado não pode nada', () => {
    expect(pode(null, 'verDocumentos')).toBe(false);
    expect(pode(null, 'gerenciarPessoas')).toBe(false);
  });

  it('pessoa sem perfil não pode nada', () => {
    expect(pode(pessoa(null), 'verDocumentos')).toBe(false);
    expect(pode(pessoa(null), 'gerenciarPessoas')).toBe(false);
  });

  it('pessoa inativa não pode nada, nem Administrador', () => {
    expect(pode(pessoa('Administrador', { status: 'Inativo' }), 'gerenciarPessoas')).toBe(false);
    expect(pode(pessoa('Leitor', { status: 'Inativo' }), 'verDocumentos')).toBe(false);
  });

  it('perfil sem área não pode nada, exceto Administrador', () => {
    expect(pode(pessoa('Qualidade', { area: null, areaId: null }), 'verDocumentos')).toBe(false);
    expect(pode(pessoa('Administrador', { area: null }), 'gerenciarPessoas')).toBe(true);
  });
});

describe('acessoLiberado e ehPerfil', () => {
  it('só libera pessoa ativa com perfil (e área, se não for Administrador)', () => {
    expect(acessoLiberado(pessoa('Leitor'))).toBe(true);
    expect(acessoLiberado(pessoa(null))).toBe(false);
    expect(acessoLiberado(pessoa('Leitor', { area: null }))).toBe(false);
    expect(acessoLiberado(pessoa('Administrador', { area: null }))).toBe(true);
    expect(acessoLiberado(null)).toBe(false);
  });

  it('reconhece só os perfis da lista', () => {
    expect(ehPerfil('Qualidade')).toBe(true);
    expect(ehPerfil('qualidade')).toBe(false);
    expect(ehPerfil(null)).toBe(false);
  });
});

describe('pode — com contexto de área (documento 02, seção 7.3)', () => {
  const suaArea = { areaId: 'AREA-teste' };
  const outraArea = { areaId: 'AREA-outra' };

  it('cadastrarDocumento: Administrador e Qualidade em qualquer área', () => {
    for (const perfil of ['Administrador', 'Qualidade'] as const) {
      expect(pode(pessoa(perfil), 'cadastrarDocumento', suaArea)).toBe(true);
      expect(pode(pessoa(perfil), 'cadastrarDocumento', outraArea)).toBe(true);
    }
  });

  it('cadastrarDocumento: Solicitante só na sua área', () => {
    expect(pode(pessoa('Solicitante'), 'cadastrarDocumento', suaArea)).toBe(true);
    expect(pode(pessoa('Solicitante'), 'cadastrarDocumento', outraArea)).toBe(false);
    expect(pode(pessoa('Solicitante'), 'cadastrarDocumento', {})).toBe(false);
  });

  it('cadastrarDocumento: Leitor nunca, nem na sua área', () => {
    expect(pode(pessoa('Leitor'), 'cadastrarDocumento', suaArea)).toBe(false);
  });

  it('verDocumentos: Solicitante só documentos da sua área; demais perfis, todos', () => {
    expect(pode(pessoa('Solicitante'), 'verDocumentos', suaArea)).toBe(true);
    expect(pode(pessoa('Solicitante'), 'verDocumentos', outraArea)).toBe(false);
    for (const perfil of ['Administrador', 'Qualidade', 'Leitor'] as const) {
      expect(pode(pessoa(perfil), 'verDocumentos', outraArea)).toBe(true);
    }
  });

  it('reprogramarPrazo: Administrador e Qualidade em qualquer área; Solicitante e Leitor nunca, nem na sua', () => {
    for (const perfil of ['Administrador', 'Qualidade'] as const) {
      expect(pode(pessoa(perfil), 'reprogramarPrazo', suaArea)).toBe(true);
      expect(pode(pessoa(perfil), 'reprogramarPrazo', outraArea)).toBe(true);
    }
    for (const perfil of ['Solicitante', 'Leitor'] as const) {
      expect(pode(pessoa(perfil), 'reprogramarPrazo', suaArea)).toBe(false);
      expect(pode(pessoa(perfil), 'reprogramarPrazo', outraArea)).toBe(false);
      expect(pode(pessoa(perfil), 'reprogramarPrazo')).toBe(false);
    }
  });

  it('baixarArquivo (decisão 0014): Administrador e Qualidade em qualquer área; Solicitante só da sua; Leitor nunca', () => {
    for (const perfil of ['Administrador', 'Qualidade'] as const) {
      expect(pode(pessoa(perfil), 'baixarArquivo', suaArea)).toBe(true);
      expect(pode(pessoa(perfil), 'baixarArquivo', outraArea)).toBe(true);
    }
    expect(pode(pessoa('Leitor'), 'baixarArquivo', suaArea)).toBe(false);
    expect(pode(pessoa('Leitor'), 'baixarArquivo', outraArea)).toBe(false);
    expect(pode(pessoa('Leitor'), 'baixarArquivo')).toBe(false);
    expect(pode(pessoa('Solicitante'), 'baixarArquivo', suaArea)).toBe(true);
    expect(pode(pessoa('Solicitante'), 'baixarArquivo', outraArea)).toBe(false);
    expect(pode(pessoa('Solicitante', { areaId: null, area: null }), 'baixarArquivo', suaArea)).toBe(false);
  });

  it('Administrador sem área continua podendo cadastrar e ver com contexto', () => {
    const admin = pessoa('Administrador', { area: null, areaId: null });
    expect(pode(admin, 'cadastrarDocumento', outraArea)).toBe(true);
    expect(pode(admin, 'verDocumentos', outraArea)).toBe(true);
  });

  it('contexto não libera quem não tem acesso', () => {
    expect(pode(null, 'verDocumentos', suaArea)).toBe(false);
    expect(pode(pessoa('Solicitante', { status: 'Inativo' }), 'cadastrarDocumento', suaArea)).toBe(false);
  });
});
