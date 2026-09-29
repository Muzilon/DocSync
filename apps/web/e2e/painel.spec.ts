import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Painel (F3) na vitrine: sessão e API simuladas, "hoje" fixo em 29/09/2026. Dados fictícios.
const URL = '/e2e/vitrine/index.html?rota=%2Fpainel';
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;

async function abrir(page: Page, { tema = 'claro', largura = 1440, extra = '' }: { tema?: 'claro' | 'escuro'; largura?: number; extra?: string } = {}) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  await page.goto(`${URL}${extra}`);
  await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
}

async function axe(page: Page) {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(resultado.violations).toEqual([]);
}

async function semRolagemHorizontal(page: Page) {
  const { rolagem, largura } = await page.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(rolagem).toBeLessThanOrEqual(largura);
}

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test(`painel ${tema} em ${largura}px: 5 fases, etiquetas, axe e sem rolagem horizontal da página`, async ({ page }) => {
      await abrir(page, { tema, largura });
      const quadro = page.getByRole('region', { name: 'Quadro de tramitação' });
      await expect(quadro).toBeVisible();
      await expect(quadro).not.toHaveAttribute('aria-busy', 'true');
      await expect(quadro.getByRole('heading', { level: 2 })).toHaveCount(5);
      for (const texto of ['Vence em 3 dias', 'Atrasado há 2 dias', 'Prazo: 19/10/2026', 'Vence hoje']) {
        await expect(quadro.getByText(texto)).toBeVisible();
      }
      await expect(quadro.getByText('Reprogramado', { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
      await semRolagemHorizontal(page);
      if (largura < 1024) {
        // No tablet as colunas rolam por dentro do quadro.
        const interno = await quadro.evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(interno).toBe(true);
      }
      await axe(page);
    });
  }

  test(`diálogo Reprogramar ${tema}: foco preso, Esc fecha e devolve o foco, axe`, async ({ page }) => {
    await abrir(page, { tema });
    const botao = page.getByRole('button', { name: 'Reprogramar prazo de Procedimento de auditoria interna' });
    await botao.click();
    const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Prazo atual: 19/10/2026');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(dialogo.getByText('Corrija 2 campos:')).toBeVisible();
    await axe(page);
    // Foco preso: 12 Tabs continuam dentro do diálogo.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(botao).toBeFocused();
  });

  test(`janela de cancelados ${tema}: lista, axe e Esc`, async ({ page }) => {
    await abrir(page, { tema });
    await page.getByRole('button', { name: 'Cancelados (2)' }).click();
    const janela = page.getByRole('dialog', { name: 'Documentos cancelados (2)' });
    await expect(janela.getByRole('article')).toHaveCount(2);
    await expect(janela.getByRole('button', { name: /Reprogramar/ })).toHaveCount(0);
    await axe(page);
    await page.keyboard.press('Escape');
    await expect(janela).toBeHidden();
  });
}

test('reprogramar: sucesso atualiza o cartão e mostra o toast', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Reprogramar prazo de Procedimento de auditoria interna' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
  await dialogo.getByLabel(/Novo prazo/).fill('2026-11-05');
  await dialogo.getByLabel(/Justificativa/).fill('Aguardando retorno da área responsável');
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Prazo reprogramado para 05/11/2026' })).toBeVisible();
  const cartao = page.getByRole('article', { name: 'Procedimento de auditoria interna' });
  await expect(cartao.getByText('Prazo: 05/11/2026')).toBeVisible();
  await expect(cartao.getByText('Reprogramado', { exact: false })).toBeVisible();
});

test('reprogramar: 409 conflito_versao mostra o prazo atual e o reenvio funciona', async ({ page }) => {
  await abrir(page, { extra: '&reprog=conflito' });
  await page.getByRole('button', { name: 'Reprogramar prazo de Procedimento de auditoria interna' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
  await dialogo.getByLabel(/Novo prazo/).fill('2026-11-05');
  await dialogo.getByLabel(/Justificativa/).fill('Aguardando retorno da área responsável');
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('O prazo atual agora é 26/10/2026');
  await axe(page);
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Prazo reprogramado para 05/11/2026' })).toBeVisible();
});

test('busca e área filtram o quadro e a contagem de cancelados', async ({ page }) => {
  await abrir(page);
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('ANDAIMES');
  await expect(page.getByText('1 documento encontrado')).toBeVisible();
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('');
  await page.getByRole('combobox', { name: 'Área' }).selectOption({ label: 'Comercial' });
  await expect(page.getByRole('button', { name: 'Cancelados (1)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Área' }).selectOption({ label: 'Suprimentos' });
  await expect(page.getByRole('region', { name: 'Quadro de tramitação' }).getByRole('article')).toHaveCount(2);
});

test('Tab alcança filtros, cartões e o botão Reprogramar', async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.getByRole('searchbox', { name: /Buscar/ }).focus();
  const visitados: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    visitados.push(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? '')));
  }
  expect(visitados).toContain('SELECT');
  expect(visitados).toContain('ARTICLE');
  expect(visitados.some((v) => v.startsWith('Reprogramar prazo de'))).toBe(true);
});

for (const [estado, texto] of [
  ['vazio', 'Nenhum documento cadastrado ainda'],
  ['erro', 'Não foi possível carregar'],
] as const) {
  test(`estado ${estado}: mensagem e axe`, async ({ page }) => {
    await abrir(page, { extra: `&painel=${estado}` });
    await expect(page.getByText(texto)).toBeVisible();
    await axe(page);
  });
}

test('estado carregando: esqueleto com aria-busy e KPIs com "—"', async ({ page }) => {
  await abrir(page, { extra: '&painel=carregando' });
  await expect(page.getByRole('region', { name: 'Quadro de tramitação' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('—').first()).toBeVisible();
  await axe(page);
});

test('Início tem "Abrir o painel" e o menu tem Painel logo abaixo de Início', async ({ page }) => {
  await page.goto('/e2e/vitrine/index.html?rota=%2F');
  const links = page.getByRole('navigation', { name: 'Menu' }).getByRole('link');
  await expect(links.nth(0)).toHaveAccessibleName('Início');
  await expect(links.nth(1)).toHaveAccessibleName('Painel');
  await page.getByRole('link', { name: 'Abrir o painel' }).click();
  await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
});

// B10: em tela de toque (pointer: coarse) todo botão do Painel tem no mínimo 44px de altura (decisão 0005).
test.describe('toque emulado em 768px', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('botões do Painel com altura mínima de 44px', async ({ page }) => {
    await abrir(page, { largura: 768 });
    await expect(page.getByRole('region', { name: 'Quadro de tramitação' })).not.toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const alturas = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('main button, main a[class*="botao"]'))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ nome: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', altura: el.getBoundingClientRect().height })),
    );
    expect(alturas.some((a) => a.nome.startsWith('Cancelados'))).toBe(true);
    expect(alturas.some((a) => a.nome.startsWith('Reprogramar prazo de'))).toBe(true);
    expect(alturas.some((a) => a.nome === 'Novo documento')).toBe(true);
    for (const { nome, altura } of alturas) {
      expect(altura, `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
    }
  });
});
