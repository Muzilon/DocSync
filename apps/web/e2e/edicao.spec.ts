import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Edição de dados (F6) na vitrine: sessão e API simuladas com as mesmas regras puras da API
// (validarDadosDocumento, diferencasDocumento, podeEditarAgora, pode 'editarDados'). Dados fictícios.
const LARGURAS = [768, 1024, 1440];
const TEMAS = ['claro', 'escuro'] as const;
const DOC_P6 = 'Controle de informação documentada';

function url(rota: string, extra = '') {
  return `/e2e/vitrine/index.html?rota=${encodeURIComponent(rota)}${extra}`;
}

async function abrir(page: Page, { tema = 'claro', largura = 1440, documento = 'DOC-P6', extra = '' } = {}) {
  await page.setViewportSize({ width: largura, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  await page.goto(url(`/painel?documento=${documento}`, extra));
  await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
}

async function axe(page: Page) {
  // Espera o fim da animação de entrada dos diálogos (a opacidade parcial falsearia o contraste).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
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

const edicao = (page: Page) => page.getByRole('dialog', { name: 'Editar dados' });

for (const tema of TEMAS) {
  for (const largura of LARGURAS) {
    test(`Editar dados ${tema} em ${largura}px: diálogo cabe sem rolagem horizontal, axe`, async ({ page }) => {
      await abrir(page, { tema, largura, extra: '&editar=1' });
      const dialogo = edicao(page);
      await expect(dialogo.getByLabel(/Título do documento/)).toBeFocused();
      await expect(dialogo.getByLabel(/Título do documento/)).toHaveValue(DOC_P6);
      await semRolagemHorizontal(page);
      const caixa = await dialogo.boundingBox();
      expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(largura);
      await axe(page);
      // Com erro de validação (resumo + inline) também sem violações.
      await dialogo.getByLabel(/Título do documento/).fill('');
      await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(dialogo.getByText('Corrija 1 campo antes de salvar:')).toBeVisible();
      await axe(page);
    });
  }

  test(`teclado ${tema}: abre pelo teclado, foco preso, Esc pede confirmação só no de cima e devolve o foco`, async ({ page }) => {
    await abrir(page, { tema });
    const detalhes = page.getByRole('dialog', { name: DOC_P6 });
    const botao = detalhes.getByRole('button', { name: 'Editar dados' });
    await botao.focus();
    await page.keyboard.press('Enter');
    const dialogo = edicao(page);
    await expect(dialogo.getByLabel(/Título do documento/)).toBeFocused();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await dialogo.getByLabel(/Disciplina/).fill('Mecânica');
    await page.keyboard.press('Escape');
    const confirmar = page.getByRole('dialog', { name: 'Descartar alterações?' });
    await expect(confirmar).toBeVisible();
    await expect(dialogo).toBeVisible();
    await axe(page);
    await page.keyboard.press('Escape');
    await expect(confirmar).toBeHidden();
    await expect(dialogo.getByLabel(/Disciplina/)).toHaveValue('Mecânica');
    await dialogo.getByRole('button', { name: 'Voltar' }).click();
    await page.getByRole('dialog', { name: 'Descartar alterações?' }).getByRole('button', { name: 'Descartar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(detalhes).toBeVisible();
    await expect(botao).toBeFocused();
  });
}

test('editar título e área → salvar: cartão e modal mudam, linha do tempo mostra "antes → depois"', async ({ page }) => {
  await abrir(page, { extra: '&editar=1' });
  const dialogo = edicao(page);
  await dialogo.getByLabel(/Título do documento/).fill('Controle de informação documentada (rev. texto)');
  await dialogo.getByLabel(/^Área/).selectOption({ label: 'Engenharia' });
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(dialogo).toBeHidden();
  const detalhes = page.getByRole('dialog', { name: 'Controle de informação documentada (rev. texto)' });
  await expect(detalhes.getByRole('status').filter({ hasText: 'Dados atualizados: Título, Área.' })).toBeAttached();
  await expect(detalhes.getByRole('region', { name: 'Dados' })).toContainText('Engenharia');
  const primeiro = detalhes.getByRole('region', { name: 'Linha do tempo' }).locator('ol > li').first();
  await expect(primeiro).toContainText('Edição de dados');
  await expect(primeiro).toContainText('Título e Área alterados');
  await primeiro.getByRole('button', { name: /Detalhes/ }).click();
  await expect(primeiro).toContainText('Controle de informação documentada');
  await expect(primeiro).toContainText('Qualidade');
  await expect(primeiro).toContainText('Engenharia');
  await expect(primeiro).toContainText('→');
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(detalhes).toBeHidden();
  const cartao = page.locator('[data-fase="devolvido"]').getByRole('article', { name: 'Controle de informação documentada (rev. texto)' });
  await expect(cartao).toContainText('Engenharia');
});

test('sem alteração não envia; remetente vazio é recusado (P-14)', async ({ page }) => {
  await abrir(page, { extra: '&editar=1' });
  const dialogo = edicao(page);
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('Nenhum campo foi alterado.');
  await dialogo.getByLabel(/Remetente/).fill('   ');
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(dialogo.getByRole('link', { name: 'Remetente / solicitante: Informe o remetente ou solicitante.' })).toBeVisible();
});

test('conflito: a segunda pessoa vê o que a primeira mudou, mantém o digitado e salva com a versão nova', async ({ page }) => {
  await abrir(page, { extra: '&editar=1&edicao=conflito' });
  const dialogo = edicao(page);
  await dialogo.getByLabel(/Título do documento/).fill('Controle de documentos');
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
  const aviso = dialogo.getByRole('alert').filter({ hasText: 'Alguém alterou este documento enquanto você editava.' });
  await expect(aviso).toBeFocused();
  await expect(aviso).toContainText('Remetente: “Ana Exemplo” → “Bruno Teste”');
  await expect(aviso).toContainText('Disciplina: “Corporativo” → “Qualidade”');
  await expect(dialogo.getByLabel(/Título do documento/)).toHaveValue('Controle de documentos');
  await expect(dialogo.getByLabel(/Remetente/)).toHaveValue('Bruno Teste');
  await axe(page);
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Controle de documentos' })).toBeVisible();
});

test('Solicitante: área travada em devolvido; sem botão em Recebido. Leitor: sem botão', async ({ page }) => {
  await abrir(page, { extra: '&perfil=Solicitante&editar=1' });
  const area = edicao(page).getByLabel(/^Área/);
  await expect(area).toHaveAttribute('readonly', '');
  await expect(area).toHaveValue('Qualidade');
  await axe(page);

  await abrir(page, { documento: 'DOC-P1', extra: '&perfil=Solicitante' });
  await expect(page.getByRole('dialog', { name: 'Procedimento de auditoria interna' }).getByRole('button', { name: 'Fechar detalhes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar dados' })).toHaveCount(0);

  await abrir(page, { extra: '&perfil=Leitor' });
  await expect(page.getByRole('dialog', { name: DOC_P6 }).getByRole('region', { name: 'Dados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar dados' })).toHaveCount(0);
});

test('Aprovado: sem "Editar dados" (nem para o Administrador)', async ({ page }) => {
  await abrir(page, { documento: 'DOC-P8' });
  await expect(page.getByRole('dialog', { name: 'Manual do Sistema de Gestão Integrada' }).getByRole('region', { name: 'Dados' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar dados' })).toHaveCount(0);
});

test.describe('toque', () => {
  test.use({ hasTouch: true, isMobile: false });
  test('botões do diálogo com pelo menos 44px em pointer: coarse', async ({ page }) => {
    await abrir(page, { largura: 768, extra: '&editar=1' });
    const dialogo = edicao(page);
    await expect(dialogo.getByLabel(/Título do documento/)).toBeFocused();
    for (const nome of ['Salvar alterações', 'Voltar']) {
      const caixa = await dialogo.getByRole('button', { name: nome }).boundingBox();
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
