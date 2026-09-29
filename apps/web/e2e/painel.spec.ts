import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Painel (F3) na vitrine: sessão e API simuladas, "hoje" fixo em 29/09/2026. Dados fictícios.
const URL = '/e2e/vitrine/index.html?rota=%2Fpainel';
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;
/** Abre direto os detalhes do DOC-P4 (prazo vencido há 2 dias: o único lugar do Reprogramar). */
const DOC_P4 = `&rota=${encodeURIComponent('/painel?documento=DOC-P4')}`;

async function abrir(page: Page, { tema = 'claro', largura = 1440, extra = '' }: { tema?: 'claro' | 'escuro'; largura?: number; extra?: string } = {}) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  // `extra` começando por &rota= troca a rota (ex.: abrir direto os detalhes); senão, soma parâmetros.
  await page.goto(extra.startsWith('&rota=') ? `/e2e/vitrine/index.html?${extra.slice(1)}` : `${URL}${extra}`);
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
    test(`painel ${tema} em ${largura}px: 4 KPIs, 5 fases, cartões Planner, axe e sem rolagem horizontal da página`, async ({ page }) => {
      await abrir(page, { tema, largura });
      const quadro = page.getByRole('region', { name: 'Quadro de tramitação' });
      await expect(quadro).toBeVisible();
      await expect(quadro).not.toHaveAttribute('aria-busy', 'true');
      await expect(quadro.getByRole('heading', { level: 2 })).toHaveCount(5);
      const kpis = page.getByRole('region', { name: 'Indicadores' });
      await expect(kpis.getByText('Aprovados no mês')).toBeVisible();
      await expect(kpis).toContainText('Concluídos em setembro de 2026');
      await expect(kpis).toContainText('1 dentro da meta de 40 dias');
      // Prazo curto com o estado no texto acessível (cor nunca sozinha).
      for (const [curto, tom, acessivel] of [
        ['02/10', 'alerta', 'Vence em 3 dias'],
        ['27/09', 'erro', 'Atrasado há 2 dias'],
        ['19/10', 'neutro', 'Vence em 20 dias'],
        ['29/09', 'alerta', 'Vence hoje'],
      ] as const) {
        const prazo = quadro.locator('[data-tom]', { hasText: curto });
        await expect(prazo.getByText(curto, { exact: true })).toBeVisible();
        await expect(prazo).toHaveAttribute('data-tom', tom);
        await expect(prazo).toContainText(acessivel);
      }
      await expect(quadro.getByText('Reprogramado', { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('article', { name: 'Inspeção de andaimes' }).getByText('Responsável: Bruno Teste')).toHaveCount(1);
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

  test(`diálogo Reprogramar ${tema} (nos detalhes, prazo vencido): foco preso, Esc fecha e devolve o foco, axe`, async ({ page }) => {
    await abrir(page, { tema, extra: DOC_P4 });
    const botao = page.getByRole('dialog', { name: 'Inspeção de andaimes' }).getByRole('button', { name: 'Reprogramar' });
    await botao.click();
    const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Prazo atual: 27/09/2026');
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

test('reprogramar nos detalhes: sucesso atualiza o modal e o cartão', async ({ page }) => {
  await abrir(page, { extra: DOC_P4 });
  const detalhes = page.getByRole('dialog', { name: 'Inspeção de andaimes' });
  await detalhes.getByRole('button', { name: 'Reprogramar' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
  await dialogo.getByLabel(/Novo prazo/).fill('2026-11-05');
  await dialogo.getByLabel(/Justificativa/).fill('Aguardando retorno da área responsável');
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(detalhes.getByRole('status').filter({ hasText: 'Prazo reprogramado para 05/11/2026.' })).toBeAttached();
  await expect(detalhes.getByText('Prazo: 05/11/2026')).toBeVisible();
  await page.keyboard.press('Escape');
  const cartao = page.getByRole('article', { name: 'Inspeção de andaimes' });
  await expect(cartao.getByText('05/11', { exact: true })).toBeVisible();
  await expect(cartao.getByText('Reprogramado', { exact: false })).toBeVisible();
});

test('reprogramar: 409 conflito_versao mostra o prazo atual e o reenvio funciona', async ({ page }) => {
  await abrir(page, { extra: `${DOC_P4}&reprog=conflito` });
  await page.getByRole('dialog', { name: 'Inspeção de andaimes' }).getByRole('button', { name: 'Reprogramar' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reprogramar prazo' });
  await dialogo.getByLabel(/Novo prazo/).fill('2026-11-05');
  await dialogo.getByLabel(/Justificativa/).fill('Aguardando retorno da área responsável');
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('O prazo atual agora é 27/09/2026');
  await axe(page);
  await dialogo.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Inspeção de andaimes' }).getByText('Prazo: 05/11/2026')).toBeVisible();
});

test('colunas rolam por dentro: a altura da coluna acompanha a janela, não o número de cartões', async ({ page }) => {
  await abrir(page, { largura: 1440 });
  await page.setViewportSize({ width: 1440, height: 640 });
  const coluna = page.locator('[data-fase="revisao"]');
  await expect(coluna.getByRole('article')).toHaveCount(4);
  const medidas = await coluna.evaluate((el) => {
    const lista = el.querySelector('ul')!;
    return { altura: el.getBoundingClientRect().height, rola: lista.scrollHeight > lista.clientHeight, overflow: getComputedStyle(lista).overflowY };
  });
  expect(medidas.overflow).toBe('auto');
  expect(medidas.rola).toBe(true);
  expect(medidas.altura).toBeLessThanOrEqual(640);
  // O último cartão é alcançável pela rolagem interna (e pelo teclado).
  const ultimo = coluna.getByRole('article').last();
  await ultimo.getByRole('button').focus();
  await expect(ultimo).toBeInViewport();
  await semRolagemHorizontal(page);
});

test('busca e área filtram o quadro e a contagem de cancelados', async ({ page }) => {
  await abrir(page);
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('ANDAIMES');
  await expect(page.getByText('1 documento encontrado')).toBeVisible();
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('');
  await page.getByRole('combobox', { name: 'Área' }).selectOption({ label: 'Comercial' });
  await expect(page.getByRole('button', { name: 'Cancelados (1)' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Área' }).selectOption({ label: 'Suprimentos' });
  await expect(page.getByRole('region', { name: 'Quadro de tramitação' }).getByRole('article')).toHaveCount(3);
  // A busca também procura no responsável (contrato F5, seção 4).
  await page.getByRole('combobox', { name: 'Área' }).selectOption({ label: 'Todas as áreas' });
  await page.getByRole('searchbox', { name: /Buscar/ }).fill('eduardo');
  await expect(page.getByText('2 documentos encontrados')).toBeVisible();
});

test('cartão Planner: etiquetas, título, área, prazo curto e iniciais; sem código, recebimento nem remetente', async ({ page }) => {
  await abrir(page);
  const cartao = page.getByRole('article', { name: 'Inspeção de andaimes' });
  await expect(cartao.getByText('Em revisão da qualidade', { exact: true })).toBeVisible();
  await expect(cartao.getByText('Área: Engenharia')).toBeVisible();
  await expect(cartao.getByText('BT', { exact: true })).toBeVisible();
  await expect(cartao).not.toContainText('IT-ENG-0042');
  await expect(cartao).not.toContainText('Recebido em');
  await expect(cartao).not.toContainText('PR - Procedimento');
  await expect(cartao.getByRole('button')).toHaveCount(1);
});

for (const tema of TEMAS) {
  test(`Solicitante ${tema}: "Área: <a dele>" em texto, sem seleção de área, axe`, async ({ page }) => {
    await abrir(page, { tema, extra: '&perfil=Solicitante' });
    const filtros = page.getByRole('search', { name: 'Filtrar documentos' });
    await expect(filtros).toContainText('Área: Qualidade');
    await expect(page.getByRole('combobox', { name: 'Área' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Quadro de tramitação' }).getByRole('article')).toHaveCount(4);
    await axe(page);
  });
}

test('Tab alcança filtros e o título de cada cartão (o cartão não tem outros botões)', async ({ page }) => {
  await abrir(page);
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.getByRole('searchbox', { name: /Buscar/ }).focus();
  const visitados: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    visitados.push(
      await page.evaluate(() =>
        document.activeElement?.hasAttribute('data-cartao-id')
          ? 'CARTAO'
          : (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? ''),
      ),
    );
  }
  expect(visitados).toContain('SELECT');
  // F4: o alvo do foco no cartão é o botão do título (abre os detalhes).
  expect(visitados).toContain('CARTAO');
  expect(visitados.some((v) => v.startsWith('Reprogramar'))).toBe(false);
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
    expect(alturas.some((a) => a.nome === 'Novo documento')).toBe(true);
    for (const { nome, altura } of alturas) {
      expect(altura, `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
    }
  });
});
