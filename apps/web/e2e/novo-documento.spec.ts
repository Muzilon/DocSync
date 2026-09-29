import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Tela Novo documento na vitrine (sessão e API simuladas). Dados fictícios.
const URL = '/e2e/vitrine/index.html?rota=%2Fdocumentos%2Fnovo';
const TEMAS = ['claro', 'escuro'] as const;

async function abrir(page: Page, tema: 'claro' | 'escuro' = 'claro', extra = '') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
  await page.goto(`${URL}${extra}`);
  await expect(page.getByRole('heading', { name: 'Novo documento', level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
}

async function axe(page: Page) {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(resultado.violations).toEqual([]);
}

async function preencher(page: Page) {
  await page.getByLabel(/Título do documento/).fill('Procedimento de teste');
  await page.getByLabel(/Tipo de documento/).selectOption({ label: 'PR - Procedimento' });
  await page.getByLabel(/Arquivo do documento principal/).setInputFiles({
    name: 'principal.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 teste'),
  });
}

for (const tema of TEMAS) {
  test(`novo documento ${tema}: axe com erros de validação e arquivos escolhidos`, async ({ page }) => {
    await abrir(page, tema);
    await page.getByRole('button', { name: 'Registrar documento' }).click();
    const resumo = page.getByRole('alert');
    await expect(resumo).toContainText('Corrija 3 campos antes de registrar');
    await expect(resumo).toBeFocused();
    await axe(page);

    await preencher(page);
    await page.getByLabel(/Documentos complementares/).setInputFiles([
      { name: 'anexo-1.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('a') },
      { name: 'anexo-2.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('b') },
    ]);
    await expect(page.getByRole('list', { name: 'Anexos a enviar' }).getByRole('listitem')).toHaveCount(2);
    await axe(page);
  });
}

test('P-02: o link do resumo leva o foco ao arquivo principal e o anel aparece em "Procurar arquivo"', async ({ page }) => {
  await abrir(page);
  await page.getByLabel(/Título do documento/).fill('Sem arquivo');
  await page.getByRole('button', { name: 'Registrar documento' }).click();
  await page.getByRole('link', { name: /Arquivo do documento principal/ }).click();
  await expect(page.getByLabel(/Arquivo do documento principal/)).toBeFocused();
  const contorno = await page.getByText('Procurar arquivo').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(contorno).toBe('solid');
});

test('soltar mais de um arquivo no principal mostra a mensagem do documento 04', async ({ page }) => {
  await abrir(page);
  const transferencia = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    dt.items.add(new File(['b'], 'b.pdf', { type: 'application/pdf' }));
    return dt;
  });
  const zona = page.getByText('Arraste o arquivo aqui ou').locator('..').locator('..');
  await zona.dispatchEvent('drop', { dataTransfer: transferencia });
  await expect(page.getByText('Solte apenas um arquivo. Os demais vão em "Documentos complementares".')).toBeVisible();
});

test('erro de envio: banner, "Tentar novamente" e sucesso com "Abrir detalhes" levando aos detalhes no Painel', async ({ page }) => {
  await abrir(page, 'claro', '&envio=falha');
  await preencher(page);
  await page.getByRole('button', { name: 'Registrar documento' }).click();
  await expect(page.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('Não foi possível registrar o documento');
  await expect(page.getByLabel(/Título do documento/)).toHaveValue('Procedimento de teste');
  await axe(page);

  await banner.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Documento registrado' })).toBeVisible();
  await expect(page.getByLabel(/Título do documento/)).toHaveValue('');
  await expect(page.getByLabel(/Remetente/)).toHaveValue('Ana Exemplo');
  await expect(page.getByRole('row', { name: /Procedimento de teste/ })).toBeVisible();
  // F4: o toast leva a /documentos/<id>, que redireciona para /painel?documento=<id> (P-01).
  await page.getByRole('button', { name: 'Abrir detalhes' }).click();
  const detalhes = page.getByRole('dialog', { name: 'Procedimento de teste' });
  await expect(detalhes).toBeVisible();
  await expect(detalhes.getByRole('region', { name: 'Arquivos' })).toContainText('Principal');
  await expect(page.getByRole('heading', { name: 'Painel', level: 1 })).toBeVisible();
});

test('Leitor não vê o link e, pela rota, volta ao Início', async ({ page }) => {
  await page.goto(`${URL}&perfil=Leitor`);
  await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Novo documento' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Novo documento' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
});

test('Solicitante vê a área travada na própria área', async ({ page }) => {
  await page.goto(`${URL}&perfil=Solicitante`);
  const area = page.getByLabel(/^Área/);
  await expect(area).toHaveAttribute('readonly', '');
  await expect(area).toHaveValue('Qualidade');
});

test('formulário em 1 coluna abaixo de 640px, sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto(URL);
  const titulo = await page.getByLabel(/Código do documento/).boundingBox();
  const tipo = await page.getByLabel(/Tipo de documento/).boundingBox();
  expect(tipo!.y).toBeGreaterThan(titulo!.y);
  const { rolagem, largura } = await page.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(rolagem).toBeLessThanOrEqual(largura);
});
