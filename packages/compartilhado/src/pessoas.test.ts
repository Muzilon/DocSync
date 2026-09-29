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

describe('pode — tabela de permissões da F1', () => {
  const tabela: Record<Acao, Record<Perfil, boolean>> = {
    gerenciarPessoas: { Administrador: true, Qualidade: false, Solicitante: false, Leitor: false },
    verDocumentos: { Administrador: true, Qualidade: true, Solicitante: true, Leitor: true },
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
