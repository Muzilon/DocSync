import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Mudança de status (F5) na vitrine: sessão e API simuladas com as mesmas regras puras da API
// (máquina de estados, `pode`, responsável obrigatório). "Hoje" fixo em 29/09/2026. Dados fictícios.
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;

function url(rota: string, extra = '') {
  return `/e2e/vitrine/index.html?rota=${encodeURIComponent(rota)}${extra}`;
}

async function abrir(page: Page, { tema = 'claro', largura = 1440, rota = '/painel', extra = '' } = {}) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  await page.goto(url(rota, extra));
  await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
}

async function axe(page: Page) {
  // Espera o fim da animação de entrada dos diálogos (a opacidade parcial falsearia o contraste).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
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

const coluna = (page: Page, fase: string) => page.locator(`[data-fase="${fase}"]`);
const rodape = (dialogo: ReturnType<Page['getByRole']>) =>
  dialogo.locator('button').filter({ hasNotText: /^$/ }).evaluateAll((botoes) =>
    botoes
      .filter((b) => b.closest('[class*="rodape"]'))
      .map((b) => b.textContent?.trim() ?? ''),
  );

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test(`detalhes com ações ${tema} em ${largura}px: rodapé sem rolagem horizontal, metas e axe`, async ({ page }) => {
      await abrir(page, { tema, largura, rota: '/painel?documento=DOC-P1' });
      const dialogo = page.getByRole('dialog', { name: 'Procedimento de auditoria interna' });
      await expect(dialogo.getByRole('button', { name: 'Iniciar revisão' })).toBeVisible();
      expect(await rodape(dialogo)).toEqual(['Iniciar revisão', 'Revisar junto à área', 'Devolver à área', 'Atualizar etapa…', 'Cancelar', 'Fechar']);
      await expect(dialogo.getByRole('region', { name: 'Metas do ciclo' })).toContainText('Estourada');
      await semRolagemHorizontal(page);
      const caixa = await dialogo.boundingBox();
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura);
      await axe(page);
    });
  }

  test(`"Atualizar etapa" empilhado ${tema}: foco preso, Esc fecha só ele e devolve o foco ao botão, axe`, async ({ page }) => {
    await abrir(page, { tema, rota: '/painel?documento=DOC-P1' });
    const detalhes = page.getByRole('dialog', { name: 'Procedimento de auditoria interna' });
    const botao = detalhes.getByRole('button', { name: 'Iniciar revisão' });
    await botao.click();
    const etapa = page.getByRole('dialog', { name: 'Atualizar etapa' });
    await expect(etapa.getByRole('combobox', { name: /Etapa/ })).toHaveValue('Em revisão da qualidade');
    // Sugerido: Qualidade/Administrador, com "eu" (Ana, Administrador) em primeiro.
    await expect(etapa.getByRole('combobox', { name: /Responsável/ })).toHaveValue('p1');
    await axe(page);
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      expect(await etapa.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await etapa.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(etapa).toBeHidden();
    await expect(detalhes).toBeVisible();
    await expect(botao).toBeFocused();
  });

  test(`cancelar e Desfazer pelo teclado ${tema}: o cartão sai e volta, axe`, async ({ page }) => {
    await abrir(page, { tema, rota: '/painel?documento=DOC-P7' });
    await expect(page.getByRole('button', { name: 'Cancelados (2)' })).toBeVisible();
    const detalhes = page.getByRole('dialog', { name: 'Relatório de satisfação de clientes' });
    await detalhes.getByRole('button', { name: 'Cancelar' }).click();
    const cancelar = page.getByRole('dialog', { name: 'Cancelar documento' });
    await expect(cancelar.getByLabel(/Motivo do cancelamento/)).toBeFocused();
    await page.keyboard.type('Pesquisa substituída pelo novo formulário.');
    await axe(page);
    await cancelar.getByRole('button', { name: 'Sim, cancelar' }).click();
    await expect(detalhes).toBeHidden();
    await expect(page.getByRole('article', { name: 'Relatório de satisfação de clientes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancelados (3)' })).toBeVisible();
    const desfazer = page.getByRole('button', { name: 'Desfazer' });
    await expect(page.getByRole('status').filter({ hasText: 'Documento cancelado.' })).toBeVisible();
    await axe(page);
    await desfazer.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Cancelamento desfeito: o documento voltou para Para aprovação qualidade.' })).toBeVisible();
    await expect(coluna(page, 'aprovacao').getByRole('article', { name: 'Relatório de satisfação de clientes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelados (2)' })).toBeVisible();
  });
}

test('registrar etapa: o cartão troca de coluna, ganha o responsável e a linha do tempo mostra o evento', async ({ page }) => {
  await abrir(page, { rota: '/painel?documento=DOC-P1' });
  const detalhes = page.getByRole('dialog', { name: 'Procedimento de auditoria interna' });
  await detalhes.getByRole('button', { name: 'Iniciar revisão' }).click();
  const etapa = page.getByRole('dialog', { name: 'Atualizar etapa' });
  await etapa.getByRole('combobox', { name: /Responsável/ }).selectOption({ label: 'Bruno Teste (Engenharia)' });
  await etapa.getByLabel(/Observação/).fill('Revisão pela Qualidade.');
  await etapa.getByRole('button', { name: 'Registrar etapa' }).click();
  await expect(etapa).toBeHidden();
  await expect(detalhes.getByRole('status').filter({ hasText: 'Etapa registrada: Em revisão da qualidade.' })).toBeAttached();
  await expect(page.getByRole('region', { name: 'Linha do tempo' }).locator('ol > li').first()).toContainText('De Recebido para Em revisão da qualidade');
  await expect(detalhes.getByRole('region', { name: 'Dados' })).toContainText('Bruno Teste');
  // O botão usado sumiu (o status mudou): o foco não se perde.
  await expect(detalhes.getByRole('button', { name: 'Fechar detalhes' })).toBeFocused();
  await page.keyboard.press('Escape');
  const cartao = coluna(page, 'revisao').getByRole('article', { name: 'Procedimento de auditoria interna' });
  await expect(cartao.getByText('BT', { exact: true })).toBeVisible();
});

test('Atualizar etapa…: sem etapa escolhida, resumo de erros; 409 mostra o status atual e mantém o diálogo', async ({ page }) => {
  await abrir(page, { rota: '/painel?documento=DOC-P1', extra: '&status=conflito' });
  const detalhes = page.getByRole('dialog', { name: 'Procedimento de auditoria interna' });
  await detalhes.getByRole('button', { name: 'Atualizar etapa…' }).click();
  const etapa = page.getByRole('dialog', { name: 'Atualizar etapa' });
  await etapa.getByRole('button', { name: 'Registrar etapa' }).click();
  await expect(etapa.getByText('Corrija 1 campo:')).toBeVisible();
  await axe(page);
  await etapa.getByRole('combobox', { name: /Etapa/ }).selectOption('Em revisão da qualidade');
  await etapa.getByRole('button', { name: 'Registrar etapa' }).click();
  await expect(etapa.getByRole('alert').first()).toContainText('Alguém alterou este documento: agora está em Em revisão junto à área.');
  await expect(etapa).toBeVisible();
  await axe(page);
});

test('Aprovar pede confirmação e soma no KPI "Aprovados no mês"', async ({ page }) => {
  await abrir(page, { rota: '/painel?documento=DOC-P7' });
  const kpi = page.getByRole('region', { name: 'Indicadores' });
  await expect(kpi).toContainText('Aprovados no mês2');
  const detalhes = page.getByRole('dialog', { name: 'Relatório de satisfação de clientes' });
  await detalhes.getByRole('button', { name: 'Aprovar' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Aprovar documento' });
  await expect(confirmar).toContainText('A aprovação é final e encerra a tramitação.');
  await axe(page);
  await confirmar.getByRole('button', { name: 'Aprovar' }).click();
  await expect(confirmar).toBeHidden();
  await expect(detalhes.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(coluna(page, 'aprovado').getByRole('article', { name: 'Relatório de satisfação de clientes' })).toBeVisible();
  await expect(kpi).toContainText('Aprovados no mês3');
});

test('janela de cancelados: Reativar nos detalhes por cima nomeia o status de volta e devolve o cartão ao quadro', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Cancelados (2)' }).click();
  const janela = page.getByRole('dialog', { name: 'Documentos cancelados (2)' });
  await janela.getByRole('button', { name: /^Ata da reunião de análise crítica ?, abrir detalhes$/ }).click();
  const detalhes = page.getByRole('dialog', { name: 'Ata da reunião de análise crítica' });
  await expect(detalhes.getByRole('button', { name: 'Reativar' })).toBeVisible();
  expect(await rodape(detalhes)).toEqual(['Reativar', 'Fechar']);
  await detalhes.getByRole('button', { name: 'Reativar' }).click();
  const confirmar = page.getByRole('dialog', { name: 'Reativar documento' });
  await expect(confirmar).toContainText('Ele volta para Em revisão da qualidade.');
  await axe(page);
  await confirmar.getByRole('button', { name: 'Reativar' }).click();
  await expect(detalhes.getByRole('status').filter({ hasText: 'Documento reativado: Em revisão da qualidade.' })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Documentos cancelados (1)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(coluna(page, 'revisao').getByRole('article', { name: 'Ata da reunião de análise crítica' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelados (1)' })).toBeVisible();
});

for (const [perfil, doc, titulo, esperado] of [
  ['Leitor', 'DOC-P6', 'Controle de informação documentada', ['Fechar']],
  ['Solicitante', 'DOC-P6', 'Controle de informação documentada', ['Reenviar à Qualidade', 'Atualizar etapa…', 'Fechar']],
  ['Qualidade', 'DOC-P8', 'Manual do Sistema de Gestão Integrada', ['Fechar']],
] as const) {
  test(`${perfil} em ${doc}: rodapé ${esperado.join(', ')}; axe`, async ({ page }) => {
    await abrir(page, { rota: `/painel?documento=${doc}`, extra: `&perfil=${perfil}` });
    const detalhes = page.getByRole('dialog', { name: titulo });
    await expect(detalhes.getByRole('region', { name: 'Metas do ciclo' })).toBeVisible();
    await expect(detalhes.getByRole('region', { name: 'Linha do tempo' }).locator('ol > li').first()).toBeVisible();
    expect(await rodape(detalhes)).toEqual([...esperado]);
    await axe(page);
  });
}

test('lista de responsáveis com erro: "Tentar de novo" carrega a lista', async ({ page }) => {
  await abrir(page, { rota: '/painel?documento=DOC-P1', extra: '&responsaveis=erro' });
  await page.getByRole('dialog', { name: 'Procedimento de auditoria interna' }).getByRole('button', { name: 'Iniciar revisão' }).click();
  const etapa = page.getByRole('dialog', { name: 'Atualizar etapa' });
  await expect(etapa.getByText(/Não foi possível carregar os responsáveis/)).toBeVisible();
  await axe(page);
  await etapa.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(etapa.getByRole('combobox', { name: /Responsável/ })).toBeVisible();
});

test.describe('toque emulado em 768px', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('rodapé de ações e diálogo Atualizar etapa com alvos de 44px', async ({ page }) => {
    await abrir(page, { largura: 768, rota: '/painel?documento=DOC-P4' });
    const detalhes = page.getByRole('dialog', { name: 'Inspeção de andaimes' });
    await expect(detalhes.getByRole('button', { name: 'Reprogramar' })).toBeVisible();
    const medir = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('dialog[open] button'))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({ nome: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '', altura: el.getBoundingClientRect().height })),
      );
    // Arredonda: o Chromium mede 43,9999 px em alguns botões de 44 px.
    for (const { nome, altura } of await medir()) expect(Math.round(altura), `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
    await semRolagemHorizontal(page);
    await detalhes.getByRole('button', { name: 'Atualizar etapa…' }).click();
    await expect(page.getByRole('dialog', { name: 'Atualizar etapa' }).getByRole('combobox', { name: /Etapa/ })).toBeVisible();
    for (const { nome, altura } of await medir()) expect(Math.round(altura), `altura de "${nome}"`).toBeGreaterThanOrEqual(44);
  });
});
