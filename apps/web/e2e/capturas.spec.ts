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
  ['novo-documento-claro', '/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo', 'claro'],
  ['novo-documento-escuro', '/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo', 'escuro'],
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

test('captura novo-documento-erros-claro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('docsync.tema', 'claro'));
  await page.goto('/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo');
  await page.getByRole('button', { name: 'Registrar documento' }).click();
  await page.getByRole('alert').first().waitFor();
  await page.screenshot({ path: `${pasta}/novo-documento-erros-claro.png`, fullPage: true });
});
