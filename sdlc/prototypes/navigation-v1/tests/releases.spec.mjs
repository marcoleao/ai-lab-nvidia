import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const system = '#/system/system-atendimento';
const releases = '#/releases/system-atendimento';
const builder = '#/release-new/system-atendimento';
const release = (id, tab = 'overview') => `#/release/${id}/${tab}`;
const action = (page, name) => page.locator(`[data-release-action="${name}"]`);
const rows = page => page.getByTestId('release-story-row');
const includedStories = page => page.locator('[data-testid="release-composition"] .release-story-group [data-release-action="inspect-story"]');
const storyChoice = (page, id) => page.locator(`input[data-release-story="${id}"]`);
const main = page => page.locator('#main-content');
const observations = new WeakMap();

async function capture(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true});
}

async function cannotPromote(page) {
  const promote = action(page, 'deploy-production');
  if (await promote.count()) await expect(promote).toBeDisabled();
  else await expect(promote).toHaveCount(0);
}

async function currentDigest(page) {
  const digest = page.getByTestId('artifact-digest');
  await expect(digest).toBeVisible();
  const value = await digest.getAttribute('title');
  expect(value, 'A identidade completa do artefato precisa estar disponível para conferência').toMatch(/^sha256:[a-f0-9]{64}$/);
  return value;
}

async function inspectCommit(page, id) {
  await includedStories(page).and(page.locator(`[data-story-id="${id}"]`)).click();
  const inspector = page.getByTestId('release-story-inspector');
  await inspector.getByText('Referências técnicas fictícias', {exact: true}).click();
  return (await inspector.getByText('Commit', {exact: true}).locator('xpath=following-sibling::dd[1]').innerText()).trim();
}

test.beforeEach(async ({page, baseURL}) => {
  const observation = {requests: [], errors: []};
  observations.set(page, observation);
  page.on('pageerror', error => observation.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy|Refused to|Failed to load module script/i.test(message.text())) observation.errors.push(message.text());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || /\/api(?:\/|$)/.test(url.pathname)) observation.requests.push(request.url());
  });
});

test.afterEach(async ({page}) => {
  const observation = observations.get(page);
  expect(observation.requests, 'As releases simuladas não devem consultar APIs nem serviços externos').toEqual([]);
  expect(observation.errors, 'As jornadas de release não devem gerar erros de JavaScript').toEqual([]);
});

test('atalho do Sistema abre o menu Releases com ambientes, composição e ramificações navegáveis', async ({page}) => {
  await page.goto('/' + system);
  await main(page).locator(`a[href="${releases}"]`).first().click();
  await expect(page).toHaveURL(/#\/releases\/system-atendimento$/);
  await expect(page.locator('[data-global-nav="releases"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-global-nav="systems"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('environment-map')).toBeVisible();
  await expect(page.getByTestId('environment-map')).toContainText(/testes/i);
  await expect(page.getByTestId('environment-map')).toContainText(/homologa[çc][aã]o/i);
  await expect(page.getByTestId('environment-map')).toContainText(/produ[çc][aã]o/i);
  await capture(page, 'releases-environments-desktop');
  await main(page).locator(`a[href="${release('release-r1')}"]`).first().click();
  await expect(page.getByTestId('release-summary')).toBeVisible();
  await expect(page.locator('#breadcrumbs')).toContainText('Atendimento ao Cliente');
  await main(page).locator(`a[href="${release('release-r1', 'composition')}"]`).first().click();
  await expect(page.getByTestId('release-composition')).toBeVisible();
  await expect(includedStories(page)).toHaveCount(10);
  await main(page).locator(`a[href="${release('release-r1', 'branches')}"]`).first().click();
  await expect(page.getByTestId('release-graph')).toBeVisible();
  await capture(page, 'releases-branches-desktop');
  const textMap = main(page).locator('.release-graph-equivalent');
  await textMap.locator('summary').click();
  await expect(textMap.getByRole('list')).toBeVisible();
  await expect(textMap).toContainText(/mesmo artefato/i);
  await page.getByTestId('release-graph').locator('[data-release-action="inspect-story"][data-story-id="H07"]').click();
  const inspector = page.getByTestId('release-story-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('HIS-07');
  await inspector.getByText('Referências técnicas fictícias', {exact: true}).click();
  await expect(inspector).toContainText('Ramificação');
  await expect(inspector).toContainText('Commit');
  await page.getByTestId('release-graph').locator(`a[href="${release('release-r2', 'composition')}"]`).click();
  await expect(page).toHaveURL(/#\/release\/release-r2\/composition$/);
  await expect(includedStories(page)).toHaveCount(9);
});

test('retirar uma História de homologação cria nova candidata e preserva o pacote original', async ({page}) => {
  await page.goto('/' + release('release-r1'));
  const originalDigest = await currentDigest(page);
  await cannotPromote(page);
  await action(page, 'revise-release').click();
  await expect(page).toHaveURL(/#\/release-new\/system-atendimento$/);
  await expect(page.locator('#release-scenario')).toHaveValue('ten');
  await expect(page.getByTestId('selection-count')).toContainText('9');
  await expect(storyChoice(page, 'H07')).not.toBeChecked();
  await action(page, 'create-candidate').click();
  await expect(page).toHaveURL(/#\/release\/release-candidate-\d+\/overview$/);
  const candidateRoute = new URL(page.url()).hash;
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'qa_checks');
  const candidateDigest = await currentDigest(page);
  expect(candidateDigest).not.toEqual(originalDigest);
  await cannotPromote(page);
  await page.goto('/' + candidateRoute.replace('/overview', '/composition'));
  await expect(includedStories(page)).toHaveCount(9);
  await expect(includedStories(page).filter({hasText: 'HIS-07'})).toHaveCount(0);
  await page.goto('/' + release('release-r1', 'composition'));
  await expect(includedStories(page)).toHaveCount(10);
  await expect(includedStories(page).filter({hasText: 'HIS-07'})).toHaveCount(1);
  await page.goto('/' + release('release-r1'));
  expect(await currentDigest(page)).toEqual(originalDigest);
  await capture(page, 'release-original-preserved-desktop');
});

test('nova composição repete testes e aprovações e promove o mesmo artefato até produção', async ({page}) => {
  await page.goto('/' + release('release-r2'));
  const digest = await currentDigest(page);
  await cannotPromote(page);
  await action(page, 'run-checks').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'qa_passed');
  await main(page).locator(`a[href="${release('release-r2', 'history')}"]`).first().click();
  await expect(main(page)).toContainText(/CODE REVIEW|revis[aã]o de c[oó]digo/i);
  await expect(main(page)).toContainText(/SECURITY SCAN|seguran[çc]a/i);
  await expect(main(page)).toContainText(/TESTING|testes/i);
  await expect(action(page, 'approve-qa')).toBeDisabled();
  await page.locator('#release-confirm').check();
  await action(page, 'approve-qa').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'qa_approved');
  await cannotPromote(page);
  await action(page, 'deploy-hml').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'hml_pending');
  expect(await currentDigest(page)).toEqual(digest);
  await cannotPromote(page);
  await expect(action(page, 'homologate')).toBeDisabled();
  await expect(page.locator('#release-confirm')).not.toBeChecked();
  await page.locator('#release-confirm').check();
  await action(page, 'homologate').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'hml_passed');
  await expect(action(page, 'approve-production')).toBeDisabled();
  await page.locator('#release-confirm').check();
  await action(page, 'approve-production').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'production_approved');
  await action(page, 'deploy-production').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'production');
  expect(await currentDigest(page)).toEqual(digest);
  await page.reload();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'production');
  expect(await currentDigest(page)).toEqual(digest);
  await capture(page, 'release-production-same-artifact-desktop');
});

test('seleção em lote considera revisões atuais pendentes e evidencia dependência retirada', async ({page}) => {
  await page.goto('/' + builder);
  await expect(page.locator('#release-scenario')).toHaveValue('sixty');
  await expect(rows(page)).toHaveCount(60);
  await expect(page.locator('input[data-release-story]:checked')).toHaveCount(44);
  await expect(page.locator('input[data-release-story]:disabled')).toHaveCount(16);
  await storyChoice(page, 'H07').uncheck();
  await expect(page.getByTestId('blocked-count')).toContainText('1');
  await expect(page.locator('[data-testid="release-story-row"][data-story-id="H09"]')).toContainText('HIS-07');
  await expect(action(page, 'create-candidate')).toBeDisabled();
  await capture(page, 'release-selection-dependency-desktop');
  await action(page, 'deselect-dependents').click();
  await expect(page.getByTestId('selection-count')).toContainText('42');
  await expect(page.getByTestId('blocked-count')).toContainText('0');
  await expect(storyChoice(page, 'H09')).not.toBeChecked();
  await expect(action(page, 'create-candidate')).toBeEnabled();
});

test('filtros e recarga preservam a seleção global e reinício limpa somente a simulação', async ({page}) => {
  await page.goto('/' + builder);
  await storyChoice(page, 'H08').uncheck();
  await expect(page.getByTestId('selection-count')).toContainText('43');
  await page.locator('#release-search').fill('HIS-08');
  await page.locator('#release-search').press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(storyChoice(page, 'H08')).not.toBeChecked();
  await expect(page.getByTestId('selection-count')).toContainText('43');
  await page.reload();
  await expect(page.getByTestId('selection-count')).toContainText('43');
  await expect(storyChoice(page, 'H08')).not.toBeChecked();
  await page.locator('#release-search').fill('');
  await page.locator('#release-search').press('Enter');
  await expect(rows(page)).toHaveCount(60);
  await expect(page.locator('input[data-release-story]:checked')).toHaveCount(43);
  await page.locator('#reset-demo').click();
  await expect(page.getByTestId('selection-count')).toContainText('44');
  await expect(page.locator('input[data-release-story]:checked')).toHaveCount(44);
  await expect(page.locator('.prototype-badge')).toContainText('dados simulados');
});

test('celular mantém ações junto ao breadcrumb e gráficos contidos sem transbordar a página', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/' + releases);
  await expect(page.getByTestId('environment-map')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'releases-environments-mobile');
  await page.goto('/' + release('release-r1', 'branches'));
  const graph = page.getByTestId('release-graph');
  await expect(graph).toBeVisible();
  await expect(page.locator('#workflow-actions').getByTestId('release-primary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await graph.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await graph.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => graph.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await capture(page, 'releases-branches-mobile');
  await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
  await expect(page.locator('#workflow-actions').getByTestId('release-primary')).toBeInViewport({ratio: 1});
  await action(page, 'revise-release').click();
  await expect(page.locator('#workflow-actions').getByTestId('release-primary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'release-selection-mobile');
});

test('outro Sistema não apresenta releases ou ramificações do cenário de Atendimento', async ({page}) => {
  await page.goto('/#/releases/system-pedidos');
  await expect(page.locator('#breadcrumbs')).toContainText('Gestão de Pedidos');
  await expect(main(page).locator('.release-card')).toHaveCount(0);
  await expect(main(page).locator('a[href*="release-r1"], a[href*="release-r2"], a[href*="release-stable"]')).toHaveCount(0);
  await expect(main(page).locator('[data-release-id="release-r1"], [data-release-id="release-r2"]')).toHaveCount(0);
});

test('confirmar mudança em HML bloqueia a composição anterior e exige outro ciclo sem herdar aprovações', async ({page}) => {
  await page.goto('/' + release('release-r2'));
  const originalDigest = await currentDigest(page);
  await action(page, 'run-checks').click();
  await page.locator('#release-confirm').check();
  await action(page, 'approve-qa').click();
  await action(page, 'deploy-hml').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'hml_pending');

  await action(page, 'revise-release').click();
  await expect(page.getByTestId('selection-count')).toContainText('9');
  // Abrir um rascunho permite voltar sem registrar uma rejeição inexistente.
  await page.goto('/' + release('release-r2'));
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'hml_pending');
  expect(await currentDigest(page)).toEqual(originalDigest);
  await page.goto('/' + builder);
  await storyChoice(page, 'H08').uncheck();
  await expect(page.getByTestId('selection-count')).toContainText('8');
  await action(page, 'create-candidate').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'qa_checks');
  const candidateRoute = new URL(page.url()).hash;
  expect(await currentDigest(page)).not.toEqual(originalDigest);
  await cannotPromote(page);
  await page.goto('/' + candidateRoute.replace('/overview', '/history'));
  for (const gate of ['Gate G2', 'Gate G3']) {
    await expect(main(page).locator('.release-checks > div').filter({hasText: gate})).toContainText('PENDING');
  }
  await page.goto('/' + candidateRoute.replace('/overview', '/composition'));
  await expect(includedStories(page)).toHaveCount(8);
  await expect(includedStories(page).filter({hasText: 'HIS-08'})).toHaveCount(0);

  await page.goto('/' + release('release-r2'));
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'rejected');
  expect(await currentDigest(page)).toEqual(originalDigest);
  await cannotPromote(page);
  await page.reload();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'rejected');
  expect(await currentDigest(page)).toEqual(originalDigest);
  await cannotPromote(page);
});

test('correção em HML mantém as Histórias e cria nova revisão, commit e pacote sem alterar a origem', async ({page}) => {
  await page.goto('/' + release('release-r2', 'composition'));
  const originalDigest = await currentDigest(page);
  const originalIds = await includedStories(page).evaluateAll(stories => stories.map(story => story.dataset.storyId).sort());
  expect(originalIds).toHaveLength(9);
  const originalCommit = await inspectCommit(page, 'H01');
  await expect(includedStories(page).filter({hasText: 'HIS-01'})).toContainText('r1');
  await page.goto('/' + release('release-r2'));
  await action(page, 'run-checks').click();
  await page.locator('#release-confirm').check();
  await action(page, 'approve-qa').click();
  await action(page, 'deploy-hml').click();
  await action(page, 'revise-release').click();
  await page.locator('#release-change-kind').selectOption('correction');
  await page.locator('#release-correction-story').selectOption('H01');
  await expect(page.getByTestId('selection-count')).toContainText('9');
  await action(page, 'create-candidate').click();
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'qa_checks');
  const candidateRoute = new URL(page.url()).hash;
  expect(await currentDigest(page)).not.toEqual(originalDigest);
  await cannotPromote(page);
  await page.goto('/' + candidateRoute.replace('/overview', '/composition'));
  expect(await includedStories(page).evaluateAll(stories => stories.map(story => story.dataset.storyId).sort())).toEqual(originalIds);
  await expect(includedStories(page).filter({hasText: 'HIS-01'})).toContainText('r2');
  await expect(main(page)).toContainText(/1 revis[aã]o.*corrigid/i);
  expect(await inspectCommit(page, 'H01')).not.toEqual(originalCommit);
  await capture(page, 'release-correction-new-revision-desktop');
  await page.goto('/' + candidateRoute.replace('/overview', '/history'));
  for (const gate of ['Gate G2', 'Gate G3']) {
    await expect(main(page).locator('.release-checks > div').filter({hasText: gate})).toContainText('PENDING');
  }

  await page.goto('/' + release('release-r2', 'composition'));
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', 'rejected');
  expect(await currentDigest(page)).toEqual(originalDigest);
  expect(await includedStories(page).evaluateAll(stories => stories.map(story => story.dataset.storyId).sort())).toEqual(originalIds);
  await expect(includedStories(page).filter({hasText: 'HIS-01'})).toContainText('r1');
  expect(await inspectCommit(page, 'H01')).toEqual(originalCommit);
  await cannotPromote(page);
});
