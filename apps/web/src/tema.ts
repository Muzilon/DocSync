/** Tema claro/escuro: só troca o atributo data-tema do <html> (os tokens fazem o resto). */
export type Tema = 'claro' | 'escuro';

const CHAVE = 'docsync.tema';

export function temaSalvo(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE);
    if (valor === 'claro' || valor === 'escuro') return valor;
  } catch {
    // armazenamento bloqueado: segue a preferência do sistema
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema;
}

export function salvarTema(tema: Tema): void {
  aplicarTema(tema);
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
