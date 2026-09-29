const comparador = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Ordena em ordem alfabética pt-BR, sem diferenciar maiúsculas nem acentos
 * (decisão 0006: listas como a de áreas aparecem sempre em ordem alfabética).
 * Não altera a lista recebida.
 */
export function ordenarAlfabetico<T>(itens: readonly T[], rotulo: (item: T) => string): T[] {
  return [...itens].sort((a, b) => comparador.compare(rotulo(a), rotulo(b)));
}
