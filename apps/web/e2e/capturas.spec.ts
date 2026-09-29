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
    // F5 (decisão 0015): Reprogramar fica nos detalhes e só com prazo vencido.
    await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P4')}`);
    await page.getByRole('dialog', { name: 'Inspeção de andaimes' }).getByRole('button', { name: 'Reprogramar' }).click();
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

// F5: cartão no estilo do Planner (decisão 0015) e detalhes com o rodapé de ações.
for (const tema of ['claro', 'escuro'] as const) {
  for (const largura of [1440, 1024, 768]) {
    test(`captura painel-planner-${largura}-${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
      await page.goto('/e2e/vitrine/index.html?rota=%2Fpainel');
      await page.getByRole('region', { name: 'Quadro de tramitação' }).getByRole('article').first().waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${pasta}/painel-planner-${largura}-${tema}.png` });
    });
  }

  test(`captura detalhes-acoes-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P4')}`);
    await page.getByRole('region', { name: 'Metas do ciclo' }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/detalhes-acoes-${tema}.png` });
  });

  test(`captura detalhes-acoes-768-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P1')}`);
    await page.getByRole('region', { name: 'Metas do ciclo' }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/detalhes-acoes-768-${tema}.png` });
  });

  test(`captura detalhes-acoes-etapa-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P1')}`);
    await page.getByRole('dialog', { name: 'Procedimento de auditoria interna' }).getByRole('button', { name: 'Iniciar revisão' }).click();
    await page.getByRole('dialog', { name: 'Atualizar etapa' }).getByRole('combobox', { name: /Responsável/ }).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/detalhes-acoes-etapa-${tema}.png` });
  });

  test(`captura detalhes-acoes-desfazer-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P7')}`);
    await page.getByRole('dialog', { name: 'Relatório de satisfação de clientes' }).getByRole('button', { name: 'Cancelar documento' }).click();
    await page.getByLabel(/Motivo do cancelamento/).fill('Pesquisa substituída pelo novo formulário.');
    await page.getByRole('button', { name: 'Sim, cancelar' }).click();
    await page.getByRole('button', { name: 'Desfazer' }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${pasta}/detalhes-acoes-desfazer-${tema}.png` });
  });
}

// F6: Editar dados (diálogo empilhado sobre os detalhes do DOC-P6, em devolvido).
const EDITAR = `/e2e/vitrine/index.html?rota=${encodeURIComponent('/painel?documento=DOC-P6')}&editar=1`;
for (const tema of ['claro', 'escuro'] as const) {
  for (const largura of [1440, 1024, 768]) {
    test(`captura editar-dados-${largura}-${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
      await page.goto(EDITAR);
      await page.getByRole('dialog', { name: 'Editar dados' }).getByLabel(/Título do documento/).waitFor();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${pasta}/editar-dados-${largura}-${tema}.png` });
    });
  }

  test(`captura editar-dados-conflito-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`${EDITAR}&edicao=conflito`);
    const dialogo = page.getByRole('dialog', { name: 'Editar dados' });
    await dialogo.getByLabel(/Título do documento/).fill('Controle de documentos');
    await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
    await dialogo.getByText('Alguém alterou este documento enquanto você editava.').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${pasta}/editar-dados-conflito-${tema}.png` });
  });

  test(`captura editar-dados-erros-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(EDITAR);
    const dialogo = page.getByRole('dialog', { name: 'Editar dados' });
    await dialogo.getByLabel(/Título do documento/).fill('');
    await dialogo.getByLabel(/Remetente/).fill('');
    await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
    await dialogo.getByText('Corrija 2 campos antes de salvar:').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${pasta}/editar-dados-erros-${tema}.png` });
  });

  test(`captura editar-dados-salvo-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(EDITAR);
    const dialogo = page.getByRole('dialog', { name: 'Editar dados' });
    await dialogo.getByLabel(/Título do documento/).fill('Controle de documentos do SGI');
    await dialogo.getByLabel(/^Área/).selectOption({ label: 'Engenharia' });
    await dialogo.getByRole('button', { name: 'Salvar alterações' }).click();
    const linha = page.getByRole('dialog', { name: 'Controle de documentos do SGI' }).getByRole('region', { name: 'Linha do tempo' });
    const primeiro = linha.locator('ol > li').first();
    await primeiro.getByText('Edição de dados', { exact: true }).waitFor();
    await primeiro.getByRole('button', { name: /Detalhes/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${pasta}/editar-dados-salvo-${tema}.png` });
  });

  test(`captura editar-dados-solicitante-${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.addInitScript((t) => localStorage.setItem('docsync.tema', t), tema);
    await page.goto(`${EDITAR}&perfil=Solicitante`);
    await page.getByRole('dialog', { name: 'Editar dados' }).getByLabel(/Título do documento/).waitFor();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}/editar-dados-solicitante-${tema}.png` });
  });
}
