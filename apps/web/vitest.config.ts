import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Testes de unidade e de tela (jsdom). Os testes Playwright ficam em e2e/ e não entram aqui.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/testes/configurar.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
