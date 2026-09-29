import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;

async function semRolagemHorizontal(pagina: Page) {
  const { rolagem, largura } = await pagina.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(rolagem).toBeLessThanOrEqual(largura);
}

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test(`login ${tema} em ${largura}px: sem violações do axe e sem rolagem horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-tema', tema);
      await expect(page.getByRole('button', { name: 'Entrar com a conta Microsoft' })).toBeVisible();
      // Sem campos de senha nem acesso rápido.
      await expect(page.locator('input')).toHaveCount(0);
      await semRolagemHorizontal(page);

      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(resultado.violations).toEqual([]);
    });
  }
}

test('rota protegida sem sessão vai ao login guardando o destino', async ({ page }) => {
  await page.goto('/pessoas');
  await expect(page).toHaveURL(/\/login\?destino=%2Fpessoas$/);
});

test('destino externo é descartado na URL de login', async ({ page }) => {
  await page.goto('/login?destino=//site-externo.test');
  await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
  // A tela não navega sozinha para fora; o destino inválido vira "/".
  await expect(page).toHaveURL(/\/login/);
});

test('aviso de sessão expirada aparece em região de status', async ({ page }) => {
  await page.goto('/login?aviso=sessao_expirada');
  await expect(page.getByRole('status').filter({ hasText: 'Sua sessão expirou' })).toBeVisible();
});

test('botão de tema alterna e guarda a escolha', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('iniciado')) {
      localStorage.setItem('docsync.tema', 'claro');
      sessionStorage.setItem('iniciado', '1');
    }
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
});
