import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const observations = new WeakMap();
const rows = page => page.getByTestId('release-planning-row');
const choice = (page, id) => page.locator(`input[data-plan-story="${id}"]`);
const view = (page, name) => page.locator(`[data-plan-view="${name}"]`);
const selectedCount = page => page.getByTestId('planning-selected-count');
const save = page => page.getByTestId('save-release-composition');
const main = page => page.locator('#main-content');

async function capture(page, name, fullPage = true) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage});
}

async function createDraft(page, name = 'Entrega planejada em equipe') {
  await page.goto('/#/releases');
  await page.locator('#workflow-actions').getByTestId('release-primary').click();
  await page.locator('#release-create-system').selectOption('system-atendimento');
  await page.locator('#release-create-name').fill(name);
  await page.getByTestId('create-release').click();
  await expect(page).toHaveURL(/#\/release\/release-draft-\d+\/composition$/);
  return new URL(page.url()).hash;
}

async function openPicker(page) {
  await page.getByTestId('manage-release-composition').click();
  await expect(page).toHaveURL(/\/planning$/);
  await view(page, 'all').click();
}

async function chooseOption(page, selector, label) {
  const select = page.locator(selector);
  const option = select.locator('option').filter({hasText: label});
  await expect(option).toHaveCount(1);
  await select.selectOption(await option.getAttribute('value'));
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
  expect(observation.requests, 'O seletor simulado não deve consultar APIs nem serviços externos').toEqual([]);
  expect(observation.errors, 'Filtros e seleção não devem gerar erros de JavaScript ou de CSP').toEqual([]);
});

test('atalhos distinguem revisão atual sem release, histórico e verificações prontas', async ({page}) => {
  await createDraft(page);
  await openPicker(page);
  await expect(rows(page)).toHaveCount(60);
  await expect(selectedCount(page)).toHaveText('0');

  await view(page, 'ready-unassigned').click();
  await expect(view(page, 'ready-unassigned')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(40);
  await expect(choice(page, 'story-release-h11')).toBeVisible();
  await expect(choice(page, 'story-consulta')).toHaveCount(0);
  await expect(choice(page, 'story-release-h07')).toHaveCount(0);
  await expect(choice(page, 'story-release-h51')).toHaveCount(0);
  await expect(selectedCount(page)).toHaveText('0');
  await capture(page, 'release-picker-ready-unassigned-desktop');

  await view(page, 'unassigned').click();
  await expect(rows(page)).toHaveCount(56);
  const newerRevision = rows(page).filter({has: choice(page, 'story-consulta')});
  await expect(newerRevision).toContainText(/revisão\s+2/i);
  await expect(newerRevision).toContainText('SPECIFICATION');
  await expect(choice(page, 'story-release-h07')).toHaveCount(0);
  await expect(choice(page, 'story-release-h51')).toBeVisible();
  await view(page, 'pending').click();
  await expect(rows(page)).toHaveCount(16);
  await expect(rows(page).filter({has: choice(page, 'story-release-h51')})).toContainText('SECURITY SCAN');
  await expect(rows(page).filter({has: choice(page, 'story-release-h56')})).toContainText('TESTING');
});

test('sem release exclui planejamento em outro rascunho e transferência é avisada antes de salvar', async ({page}) => {
  const first = await createDraft(page, 'Entrega da equipe A');
  await openPicker(page);
  await choice(page, 'story-release-h11').check();
  await save(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(1);
  const second = await createDraft(page, 'Entrega da equipe B');
  await openPicker(page);
  await view(page, 'ready-unassigned').click();
  await expect(choice(page, 'story-release-h11')).toHaveCount(0);
  await expect(rows(page)).toHaveCount(39);
  await view(page, 'all').click();
  await page.locator('#release-plan-association').selectOption('other-draft');
  await expect(rows(page)).toHaveCount(1);
  await page.locator('#release-plan-search').focus();
  await page.locator('#release-plan-search').pressSequentially('HIS-11');
  await expect(page.locator('#release-plan-search')).toHaveValue('HIS-11');
  await expect(page.locator('#release-plan-search')).toBeFocused();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Entrega da equipe A');
  await choice(page, 'story-release-h11').check();
  await expect(page.getByTestId('planning-transfer-warning')).toBeVisible();
  await expect(page.getByTestId('planning-transfer-warning')).toContainText('Entrega da equipe A');
  await expect(page.getByTestId('planning-dirty-notice')).toBeVisible();
  await save(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(1);
  await page.goto('/' + first);
  await expect(page.getByTestId('planned-story-row')).toHaveCount(0);
  await page.goto('/#/story/story-release-h11/releases');
  await expect(page.getByTestId('planned-release-link')).toHaveAttribute('href', second);
});

test('Projeto limita Épicos e filtros separam status de negócio de prontidão das verificações', async ({page}) => {
  await createDraft(page);
  await openPicker(page);
  await expect(page.locator('#release-plan-epic')).toBeDisabled();
  await chooseOption(page, '#release-plan-project', 'Atendimento Digital');
  await expect(rows(page)).toHaveCount(30);
  await expect(page.locator('#release-plan-epic')).toBeEnabled();
  await expect(page.locator('#release-plan-epic option').filter({hasText: 'Consulta operacional'})).toHaveCount(0);
  await chooseOption(page, '#release-plan-epic', 'Consulta de solicitações');
  await expect(rows(page).filter({hasText: 'Acesso e acessibilidade'})).toHaveCount(0);
  await expect(rows(page).filter({hasText: 'Consulta de solicitações'})).not.toHaveCount(0);
  await chooseOption(page, '#release-plan-project', 'Operação de Atendimento');
  await expect(page.locator('#release-plan-epic')).toHaveValue('');
  await expect(page.locator('#release-plan-epic option').filter({hasText: 'Consulta de solicitações'})).toHaveCount(0);
  await chooseOption(page, '#release-plan-status', 'SECURITY SCAN');
  await expect(rows(page)).toHaveCount(5);
  for (const n of [51, 52, 53, 54, 55]) await expect(choice(page, `story-release-h${n}`)).toBeVisible();
  await page.locator('[data-plan-reset]').first().click();
  await chooseOption(page, '#release-plan-status', 'TESTING');
  await expect(rows(page)).toHaveCount(49);
  await chooseOption(page, '#release-plan-readiness', /pendente/i);
  await expect(rows(page)).toHaveCount(5);
  await expect(choice(page, 'story-release-h56')).toBeVisible();
  await expect(choice(page, 'story-release-h11')).toHaveCount(0);
});

test('seleção global persiste ao buscar, filtrar e recarregar; lote atua só nas Histórias visíveis', async ({page}) => {
  await createDraft(page);
  await openPicker(page);
  await choice(page, 'story-release-h31').check();
  await choice(page, 'story-release-h11').check();
  await page.locator('#release-plan-search').fill('HIS-1');
  await expect(rows(page)).toHaveCount(10);
  const master = page.locator('#release-plan-visible');
  await expect.poll(() => master.evaluate(input => input.indeterminate)).toBe(true);
  await expect(selectedCount(page)).toHaveText('2');
  await expect(page.getByTestId('planning-hidden-selected-count')).toContainText('1');
  await master.check();
  await expect(selectedCount(page)).toHaveText('11');
  await expect(page.locator('input[data-plan-story]:checked')).toHaveCount(10);
  await expect.poll(() => master.evaluate(input => input.indeterminate)).toBe(false);
  await page.locator('#release-plan-search').fill('HIS-31');
  await expect(rows(page)).toHaveCount(1);
  await expect(master).toBeChecked();
  await page.locator('[data-plan-select="none"]').click();
  await expect(selectedCount(page)).toHaveText('10');
  await expect(choice(page, 'story-release-h31')).not.toBeChecked();
  await page.reload();
  await expect(selectedCount(page)).toHaveText('10');
  await expect(page.locator('#release-plan-search')).toHaveValue('HIS-31');
  await expect(page.getByTestId('planning-hidden-selected-count')).toContainText('10');
  await view(page, 'selected').click();
  // A view does not silently clear other filters, so explicitly restore the list.
  await page.locator('#release-plan-search').fill('');
  await expect(rows(page)).toHaveCount(10);
  await save(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(10);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-31'})).toHaveCount(0);
});

test('resultado vazio explica a situação e limpar filtros preserva seleção sem salvar automaticamente', async ({page}) => {
  const route = await createDraft(page);
  await openPicker(page);
  await choice(page, 'story-release-h11').check();
  await page.locator('#release-plan-search').fill('não existe esta História');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId('planning-empty-results')).toBeVisible();
  await expect(selectedCount(page)).toHaveText('1');
  await expect(page.locator('#release-plan-visible')).toBeDisabled();
  await page.locator('[data-plan-reset]').first().click();
  await expect(rows(page)).toHaveCount(60);
  await expect(choice(page, 'story-release-h11')).toBeChecked();
  await expect(selectedCount(page)).toHaveText('1');
  await expect(page.getByTestId('planning-dirty-notice')).toBeVisible();
  await page.locator('[data-plan-cancel]').click();
  await expect(page).toHaveURL(new RegExp(route + '$'));
  await expect(page.getByTestId('planned-story-row')).toHaveCount(0);
  await openPicker(page);
  await expect(selectedCount(page)).toHaveText('0');
  await choice(page, 'story-release-h11').check();
  await choice(page, 'story-release-h31').check();
  await page.locator('#release-plan-search').fill('HIS-11');
  await page.locator('[data-plan-select="clear"]').click();
  await expect(selectedCount(page)).toHaveText('0');
  await page.locator('[data-plan-reset]').first().click();
  await expect(choice(page, 'story-release-h31')).not.toBeChecked();
});

test('release vazia persiste como DRAFT e permite escolher Histórias posteriormente pelo menu central', async ({page}) => {
  const route = await createDraft(page, 'Entrega preparada pela gestão de releases');
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  await expect(page.getByTestId('planned-story-row')).toHaveCount(0);
  await expect(page.locator('[data-story-release-prepare]')).toBeDisabled();
  await expect(main(page)).toContainText(/nenhuma.*História|sem.*Histórias|rascunho vazio/i);
  await expect(page.getByTestId('artifact-digest')).toHaveCount(0);
  await page.reload();
  await page.locator('[data-global-nav="releases"]').click();
  await main(page).locator(`a[href="${route}"]`).first().click();
  await openPicker(page);
  await view(page, 'ready-unassigned').click();
  await choice(page, 'story-release-h11').check();
  await choice(page, 'story-release-h12').check();
  await save(page).click();
  await expect(page).toHaveURL(new RegExp(route + '$'));
  await expect(page.getByTestId('planned-story-row')).toHaveCount(2);
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  await expect(page.getByTestId('artifact-digest')).toHaveCount(0);
  await expect(page.locator('[data-release-action="approve-qa"], [data-release-action="deploy-hml"], [data-release-action="deploy-production"]')).toHaveCount(0);
  await page.locator('[data-story-release-prepare]').click();
  await expect(page.getByRole('heading', {level: 1})).toContainText('Revisar candidata');
  const refineSelection = page.getByTestId('refine-planned-stories');
  await expect(refineSelection).toHaveAttribute('href', route.replace('/composition', '/planning'));
  await refineSelection.click();
  await expect(page).toHaveURL(new RegExp(route.replace('/composition', '/planning') + '$'));
  await expect(selectedCount(page)).toHaveText('2');
  await page.goto('/#/story/story-release-h11/releases');
  await expect(page.getByTestId('planned-release-link')).toHaveAttribute('href', route);
  await expect(page.getByTestId('create-release')).toHaveCount(0);
  await expect(page.locator('#story-release-select option[value="__new__"]')).toHaveCount(0);
});

test('celular oferece atalhos, filtros e seleção sem transbordamento e conserva a ação superior', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await createDraft(page, 'Entrega organizada no celular');
  await openPicker(page);
  await view(page, 'ready-unassigned').click();
  const refinements = page.locator('#release-plan-refinements');
  const expand = refinements.locator('summary');
  await expect(refinements).not.toHaveAttribute('open');
  await expect(page.locator('#release-plan-search')).toBeVisible();
  await expect(page.locator('#release-plan-project')).not.toBeVisible();
  await rows(page).first().scrollIntoViewIfNeeded();
  await expect(rows(page).first()).toBeInViewport();
  await choice(page, 'story-release-h11').check();
  await expand.click();
  await expect(refinements).toHaveAttribute('open', '');
  await chooseOption(page, '#release-plan-project', 'Atendimento Digital');
  await expect(refinements).toHaveAttribute('open', '');
  await expect(rows(page)).toHaveCount(20);
  await expect(expand).toContainText('Refinar filtros (1)');
  await expand.click();
  await expect(refinements).not.toHaveAttribute('open');
  await expect(page.getByTestId('planning-active-filters')).toContainText('Atendimento Digital');
  await expand.click();
  await expect(page.locator('#release-plan-project')).toHaveValue('project-atendimento');
  await chooseOption(page, '#release-plan-status', 'TESTING');
  await expect(expand).toContainText('Refinar filtros (2)');
  await expand.click();
  await expect(refinements).not.toHaveAttribute('open');
  await expect(page.locator('#workflow-actions').getByTestId('save-release-composition')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('heading', {level: 1}).focus();
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
  await capture(page, 'release-picker-mobile-viewport', false);
  await capture(page, 'release-picker-ready-unassigned-mobile');
  await rows(page).first().scrollIntoViewIfNeeded();
  await capture(page, 'release-picker-mobile-list-viewport', false);
  await page.locator('#release-plan-search').focus();
  await page.locator('#release-plan-search').pressSequentially('HIS-11');
  await expect(page.locator('#release-plan-search')).toHaveValue('HIS-11');
  await expect(page.locator('#release-plan-search')).toBeFocused();
  await expect(refinements).not.toHaveAttribute('open');
  await expect(rows(page)).toHaveCount(1);
  await expect(choice(page, 'story-release-h11')).toBeChecked();
  await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
  await expect(save(page)).toBeInViewport({ratio: 1});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await save(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(1);
});
