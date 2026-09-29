import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Detalhes do documento (F4) na vitrine: sessão e API simuladas,
// "hoje" fixo em 29/09/2026. O DOC-P6 tem eventos de todos os tipos, 1 principal + 3 anexos. Dados fictícios.
const PAINEL = '/e2e/vitrine/index.html?rota=%2Fpainel';
const DIRETO = `/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P6')}`;
const TITULO = 'Controle de informação documentada';
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;

interface Opcoes {
  tema?: 'claro' | 'escuro';
  largura?: number;
  extra?: string;
  url?: string;
}

async function abrir(page: Page, { tema = 'claro', largura = 1440, extra = '', url = PAINEL }: Opcoes = {}) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  await page.goto(`${url}${extra}`);
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

const detalhes = (page: Page, titulo = TITULO) => page.getByRole('dialog', { name: titulo });
/** Botão do título do cartão: o Chrome põe um espaço antes do texto oculto ", abrir detalhes". */
const tituloCartao = (raiz: Page | ReturnType<Page['getByRole']>, titulo: string) =>
  raiz.getByRole('button', { name: new RegExp(`^${titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ?, abrir detalhes$`) });
const linhaDoTempo = (page: Page) => page.getByRole('region', { name: 'Linha do tempo' });

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test(`detalhes ${tema} em ${largura}px: três seções, axe e sem rolagem horizontal da página`, async ({ page }) => {
      await abrir(page, { tema, largura, url: DIRETO });
      const dialogo = detalhes(page);
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByRole('region', { name: 'Dados' })).toBeVisible();
      await expect(dialogo.getByRole('region', { name: 'Arquivos' })).toBeVisible();
      await expect(linhaDoTempo(page).locator('ol > li')).toHaveCount(9);
      await expect(dialogo.getByText('Devolvido 2 vezes')).toBeVisible();
      // Expande um evento para o axe também ver o conteúdo aberto.
      await linhaDoTempo(page).getByRole('button', { name: /Detalhes/ }).first().click();
      await semRolagemHorizontal(page);
      // O modal nunca passa da largura da janela.
      const caixa = await dialogo.boundingBox();
      expect(caixa!.x).toBeGreaterThanOrEqual(0);
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura);
      // Duas colunas a partir de 860px: a linha do tempo fica à direita dos dados.
      const dados = await dialogo.getByRole('region', { name: 'Dados' }).boundingBox();
      const linha = await linhaDoTempo(page).boundingBox();
      if (largura >= 860) expect(linha!.x).toBeGreaterThan(dados!.x + dados!.width - 1);
      else expect(linha!.y).toBeGreaterThan(dados!.y);
      await axe(page);
    });
  }

}

test('abrir pelo teclado: foco preso (Tab e Shift+Tab), Esc fecha e devolve o foco ao título do cartão', async ({ page }) => {
  await abrir(page);
  const titulo = tituloCartao(page, TITULO);
  await titulo.focus();
  await page.keyboard.press('Enter');
  const dialogo = detalhes(page);
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Fechar detalhes' })).toBeFocused();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(titulo).toBeFocused();
});

test('Espaço no título abre; clique no corpo do cartão abre; o cartão não tem outros botões (decisão 0015)', async ({ page }) => {
  await abrir(page);
  await tituloCartao(page, 'Inspeção de andaimes').focus();
  await page.keyboard.press(' ');
  await expect(detalhes(page, 'Inspeção de andaimes')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('article', { name: 'Compras emergenciais' }).getByText('Suprimentos').click();
  await expect(detalhes(page, 'Compras emergenciais')).toBeVisible();
  await page.keyboard.press('Escape');
  for (const cartao of await page.getByRole('region', { name: 'Quadro de tramitação' }).getByRole('article').all()) {
    await expect(cartao.getByRole('button')).toHaveCount(1);
  }
});

test('janela de cancelados: o cartão abre os detalhes por cima e o Esc volta para a janela', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Cancelados (2)' }).click();
  const janela = page.getByRole('dialog', { name: 'Documentos cancelados (2)' });
  const cartao = tituloCartao(janela, 'Ata da reunião de análise crítica');
  await cartao.click();
  const dialogo = detalhes(page, 'Ata da reunião de análise crítica');
  await expect(dialogo).toBeVisible();
  await expect(linhaDoTempo(page)).toContainText('Cancelado (estava em Em revisão da qualidade)');
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(janela).toBeVisible();
  await expect(cartao).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(janela).toBeHidden();
});

test('Baixar: nome devolvido pelo servidor, blob sem token na URL; sem Visualizar (saiu da F4)', async ({ page }) => {
  // O Chromium headless ignora nome com acento no atributo download (vira "download"); o nome
  // pedido pela tela é conferido no próprio <a download>, e o evento de download pelo nome ASCII.
  await page.addInitScript(() => {
    const original = HTMLAnchorElement.prototype.click;
    (window as unknown as { nomes: string[] }).nomes = [];
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      (window as unknown as { nomes: string[] }).nomes.push(`${this.download}|${this.href.slice(0, 5)}`);
      original.call(this);
    };
  });
  await abrir(page, { url: DIRETO });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar Checklist de revisão.xlsx' }).click(),
  ]);
  expect(download.url()).toMatch(/^blob:/);
  expect(await page.evaluate(() => (window as unknown as { nomes: string[] }).nomes)).toEqual(['Checklist de revisão.xlsx|blob:']);
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar Anexo A - Fluxograma.pdf' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe('Anexo A - Fluxograma.pdf');
  await expect(detalhes(page).getByRole('button', { name: /Visualizar/ })).toHaveCount(0);
});

test('Reprogramar só com prazo vencido: some no documento em dia', async ({ page }) => {
  await abrir(page, { url: DIRETO });
  await expect(linhaDoTempo(page).locator('ol > li')).toHaveCount(9);
  await expect(detalhes(page).getByRole('button', { name: 'Reprogramar' })).toHaveCount(0);
});

test('reprogramar (prazo vencido) dentro dos detalhes: modal e cartão se atualizam, evento novo no topo da linha do tempo', async ({ page }) => {
  await abrir(page, { url: `/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P4')}` });
  const dialogo = detalhes(page, 'Inspeção de andaimes');
  await dialogo.getByRole('button', { name: 'Reprogramar' }).click();
  const reprog = page.getByRole('dialog', { name: 'Reprogramar prazo' });
  await reprog.getByLabel(/Novo prazo/).fill('2026-10-30');
  await reprog.getByLabel(/Justificativa/).fill('Auditoria externa remarcada pela certificadora.');
  await reprog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(reprog).toBeHidden();
  await expect(dialogo.getByText('Prazo: 30/10/2026')).toBeVisible();
  await expect(linhaDoTempo(page).locator('ol > li').first()).toContainText('Prazo de 27/09/2026 para 30/10/2026');
  // O prazo deixou de estar vencido: o botão some e o foco vai para o ✕ (nunca se perde).
  await expect(dialogo.getByRole('button', { name: 'Reprogramar' })).toHaveCount(0);
  await expect(dialogo.getByRole('button', { name: 'Fechar detalhes' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('article', { name: 'Inspeção de andaimes' }).getByText('30/10')).toBeVisible();
});

// Decisão 0014: o Leitor vê os arquivos, mas não baixa; o Solicitante baixa os da sua área.
for (const [perfil, baixar, reprogramar] of [
  ['Leitor', 0, false],
  ['Solicitante', 4, false],
] as const) {
  test(`${perfil}: ${baixar} botões Baixar, sem Reprogramar, axe`, async ({ page }) => {
    await abrir(page, { url: DIRETO, extra: `&perfil=${perfil}` });
    const dialogo = detalhes(page);
    await expect(dialogo.getByRole('button', { name: /^Baixar/ })).toHaveCount(baixar);
    await expect(dialogo.getByRole('button', { name: 'Reprogramar' })).toHaveCount(reprogramar ? 1 : 0);
    // Contrato F4, 11.6: quem não baixa vê o motivo.
    await expect(dialogo.getByText('Seu perfil pode ver, mas não baixar arquivos.')).toHaveCount(baixar ? 0 : 1);
    await axe(page);
  });
}

for (const [estado, titulo, texto] of [
  ['erro', 'Detalhes do documento', 'Não foi possível carregar'],
  ['404', 'Documento não encontrado', 'Ele pode ter sido removido ou você não tem acesso a ele.'],
  ['carregando', 'Detalhes do documento', ''],
] as const) {
  test(`estado ${estado} dos detalhes: mensagem e axe`, async ({ page }) => {
    await abrir(page, { url: DIRETO, extra: `&detalhes=${estado}` });
    const dialogo = detalhes(page, titulo);
    await expect(dialogo).toBeVisible();
    if (texto) await expect(dialogo.getByText(texto)).toBeVisible();
    else await expect(dialogo.locator('[aria-busy="true"]')).toHaveCount(1);
    await axe(page);
  });
}

test('Baixar com erro (arquivo_indisponivel): mensagem dentro do modal e axe', async ({ page }) => {
  await abrir(page, { url: DIRETO, extra: '&download=erro' });
  await page.getByRole('button', { name: 'Baixar Checklist de revisão.xlsx' }).click();
  const alerta = page.getByRole('region', { name: 'Arquivos' }).getByRole('alert');
  await expect(alerta).toContainText('Este arquivo não está disponível no momento');
  await axe(page);
});

test('prefers-reduced-motion: o anel do evento mais recente fica parado', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page, { url: DIRETO });
  const ponto = linhaDoTempo(page).locator('ol > li').first().locator('span').first();
  await expect(ponto).toBeVisible();
  expect(await ponto.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('/documentos/:id redireciona para os detalhes no Painel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e2e/vitrine/index.html?rota=%2Fdocumentos%2FDOC-P4');
  await expect(detalhes(page, 'Inspeção de andaimes')).toBeVisible();
});

test.describe('toque emulado em 768px', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('botões dos detalhes e títulos dos cartões com no mínimo 44px', async ({ page }) => {
    await abrir(page, { largura: 768, url: DIRETO });
    await expect(linhaDoTempo(page).locator('ol > li')).toHaveCount(9);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const medir = (seletor: string) =>
      page.evaluate(
        (s) =>
          Array.from(document.querySelectorAll<HTMLElement>(s))
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => ({ nome: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', altura: el.getBoundingClientRect().height })),
        seletor,
      );
    const noModal = await medir('dialog[open] button');
    expect(noModal.some((a) => a.nome.startsWith('Baixar'))).toBe(true);
    expect(noModal.some((a) => a.nome.startsWith('Detalhes'))).toBe(true);
    for (const { nome, altura } of noModal) expect(altura, `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    const titulos = await medir('main [data-cartao-id]');
    expect(titulos.length).toBeGreaterThan(0);
    for (const { nome, altura } of titulos) expect(altura, `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
  });
});
