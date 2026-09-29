import { test } from '@playwright/test';

// Capturas para validação visual; só rodam com CAPTURAS=<pasta> (fora do npm run test:e2e normal).
const pasta = process.env.CAPTURAS;
test.skip(!pasta, 'defina CAPTURAS para gerar capturas');
// Campos de data no formato brasileiro, como no navegador das pessoas usuárias.
test.use({ locale: 'pt-BR' });

const casos = [
  ['login-claro', '/login', 'claro'],
  ['login-escuro', '/login', 'escuro'],
  ['casca-pessoas-claro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'claro'],
  ['casca-pessoas-escuro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'escuro'],
  ['casca-inicio-claro', '/e2e/vitrine/index.html?rota=%2F', 'claro'],
  ['casca-pessoas-768-claro', '/e2e/vitrine/index.html?rota=%2Fpessoas', 'claro', 768],
  ['novo-documento-claro', '/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo', 'claro'],
  ['novo-documento-escuro', '/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo', 'escuro'],
  ['painel-1440-claro', '/e2e/vitrine/index.html?rota=%2Fpainel', 'claro', 1440],
  ['painel-1440-escuro', '/e2e/vitrine/index.html?rota=%2Fpainel', 'escuro', 1440],
  ['painel-768-claro', '/e2e/vitrine/index.html?rota=%2Fpainel', 'claro', 768],
  ['painel-768-escuro', '/e2e/vitrine/index.html?rota=%2Fpainel', 'escuro', 768],
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

for (const tema of ['claro', 'escuro'] as const) {
  test(`captura painel-reprogramar-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto('/e2e/vitrine/index.html?rota=%2Fpainel');
    await page.getByRole('button', { name: 'Reprogramar prazo de Inspeção de andaimes' }).click();
    await page.getByRole('dialog', { name: 'Reprogramar prazo' }).waitFor();
    await page.waitForTimeout(500); // fim da animação de entrada do diálogo
    await page.screenshot({ path: `${pasta}/painel-reprogramar-${tema}.png` });
  });

  test(`captura painel-cancelados-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto('/e2e/vitrine/index.html?rota=%2Fpainel');
    await page.getByRole('button', { name: 'Cancelados (2)' }).click();
    await page.getByRole('dialog').getByRole('article').first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/painel-cancelados-${tema}.png` });
  });
}

// F4: detalhes do documento (DOC-P6 tem eventos de todos os tipos e 1 principal + 3 anexos).
const DETALHES = `/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P6')}`;
for (const tema of ['claro', 'escuro'] as const) {
  for (const largura of [1440, 1024, 768]) {
    test(`captura detalhes-${largura}-${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
      await page.goto(DETALHES);
      const linha = page.getByRole('region', { name: 'Linha do tempo' });
      await linha.locator('ol > li').first().waitFor();
      // Abre os detalhes do evento mais recente (reprogramação, com a justificativa) e volta ao topo.
      await linha.getByRole('button', { name: /Detalhes/ }).first().click();
      await page.evaluate(() => document.querySelectorAll('dialog[open] > div').forEach((d) => d.scrollTo(0, 0)));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${pasta}/detalhes-${largura}-${tema}.png` });
    });
  }

  test(`captura detalhes-sobre-cancelados-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto('/e2e/vitrine/index.html?rota=%2Fpainel');
    await page.getByRole('button', { name: 'Cancelados (2)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Ata da reunião/ }).click();
    await page.getByRole('region', { name: 'Linha do tempo' }).locator('ol > li').first().waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/detalhes-sobre-cancelados-${tema}.png` });
  });
}
