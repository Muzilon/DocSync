import { test } from '@playwright/test';

// Capturas para validação visual; só rodam com CAPTURAS=<pasta> (fora do npm run test:e2e normal).
const pasta = process.env.CAPTURAS;
test.skip(!pasta, 'defina CAPTURAS para gerar capturas');

const casos = [
  ['login-claro', '/login', 'claro'],
  ['login-escuro', '/login', 'escuro'],
  ['casca-pessoas-claro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'claro'],
  ['casca-pessoas-escuro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'escuro'],
  ['casca-inicio-claro', '/e2e/vitrine/index.html?rota=%2F', 'claro'],
  ['casca-pessoas-768-claro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'claro', 768],
] as const;

for (const [nome, rota, tema, largura] of casos) {
  test(`captura ${nome}`, async ({ page }) => {
    await page.setViewportSize({ width: largura ?? 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${pasta}/${nome}.png`, fullPage: true });
  });
}
