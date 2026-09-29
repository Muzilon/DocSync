import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Casca e telas internas com sessão/API simuladas (vitrine só de teste, sem MSAL).
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;
const ROTAS = [
  ['início', '/'],
  ['pessoas', '/pessoas'],
] as const;

for (const tema of TEMAS) {
  for (const [nome, rota] of ROTAS) {
    for (const largura of LARGURAS) {
      test(`${nome} ${tema} em ${largura}px: axe e sem rolagem horizontal`, async ({ page }) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
        await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent(rota)}`);
        await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
        if (rota === '/pessoas') await expect(page.getByRole('table')).toBeVisible();
        const { rolagem, largura: visivel } = await page.evaluate(() => ({
          rolagem: document.documentElement.scrollWidth,
          largura: document.documentElement.clientWidth,
        }));
        expect(rolagem).toBeLessThanOrEqual(visivel);
        // Link ativo com aria-current e nome acessível mesmo em 76px.
        const ativo = page.getByRole('link', { name: rota === '/' ? 'Início' : 'Pessoas' });
        await expect(ativo).toHaveAttribute('aria-current', 'page');
        const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(resultado.violations).toEqual([]);
      });
    }
  }
}
