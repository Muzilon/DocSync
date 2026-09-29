import { defineConfig, devices } from '@playwright/test';

// Testes de tela (Playwright + axe). Sobe o Vite sozinho; o login real com a Microsoft
// não é automatizável sem credenciais, então aqui só entra o que não depende dele.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
