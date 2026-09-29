import { defineConfig, devices } from '@playwright/test';

// Testes de tela (Playwright + axe). Sobe um Vite PRÓPRIO na porta 5174, para não reutilizar
// um `npm run dev` aberto (que pode estar com módulos desatualizados). O login real com a
// Microsoft não é automatizável sem credenciais; a casca é testada pela vitrine (e2e/vitrine).
const PORTA = 5174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORTA}`, ...devices['Desktop Chrome'] },
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
