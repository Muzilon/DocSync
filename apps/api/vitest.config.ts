import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cada teste clona um banco PGlite migrado; sob carga (vários arquivos em paralelo)
    // o clone pode passar dos 10 s padrão do hook.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
