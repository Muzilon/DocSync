import { describe, expect, it } from 'vitest';
import { ordenarAlfabetico } from './ordenacao.ts';

describe('ordenarAlfabetico', () => {
  it('ordena as áreas iniciais em ordem alfabética pt-BR', () => {
    const areas = [
      'Comercial',
      'Engenharia',
      'Qualidade',
      'Segurança do Trabalho',
      'Saúde Ocupacional',
      'Sistema de Gestão Ambiental',
      'Custos',
      'Suprimentos',
    ];

    expect(ordenarAlfabetico(areas, (a) => a)).toEqual([
      'Comercial',
      'Custos',
      'Engenharia',
      'Qualidade',
      'Saúde Ocupacional',
      'Segurança do Trabalho',
      'Sistema de Gestão Ambiental',
      'Suprimentos',
    ]);
  });

  it('não diferencia acentos nem maiúsculas', () => {
    expect(ordenarAlfabetico(['área b', 'Area a'], (a) => a)).toEqual(['Area a', 'área b']);
  });

  it('não altera a lista original', () => {
    const original = ['b', 'a'];
    ordenarAlfabetico(original, (a) => a);
    expect(original).toEqual(['b', 'a']);
  });
});
