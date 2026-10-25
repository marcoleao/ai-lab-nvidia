import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const observations = new WeakMap();
const storyRoute = '#/story/story-consulta';
const storyName = 'Consultar andamento da solicitação';
const main = page => page.locator('#main-content');
const planning = page => page.getByTestId('story-releases');
const save = page => page.getByTestId('save-story-release');
const releaseChoice = page => page.locator('#story-release-select');
const plannedLink = page => page.getByTestId('planned-release-link');

async function capture(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage: true});
}

async function createPlannedRelease(page, name) {
  const storyRoute = new URL(page.url()).hash;
  const systemId = (await page.locator('#breadcrumbs').innerText()).includes('Gestão de Pedidos') ? 'system-pedidos' : 'system-atendimento';
  await page.goto('/#/release-create');
  await page.locator('#release-create-system').selectOption(systemId);
  await page.locator('#release-create-name').fill(name);
  await page.getByTestId('create-release').click();
  await expect(page).toHaveURL(/#\/release\/release-draft-\d+\/composition$/);
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  const route = new URL(page.url()).hash;
  await page.goto('/' + storyRoute);
  await expect(releaseChoice(page).locator('option[value="__new__"]')).toHaveCount(0);
  await expect(page.locator('#story-release-name, #story-release-name-field')).toHaveCount(0);
  await expect(page.getByTestId('create-release')).toHaveCount(0);
  await releaseChoice(page).selectOption(route.split('/')[2]);
  await save(page).click();
  await expect(plannedLink(page)).toBeVisible();
  return route;
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
  expect(observation.requests, 'O planejamento simulado não deve consultar APIs nem serviços externos').toEqual([]);
  expect(observation.errors, 'A navegação integrada não deve gerar erros de JavaScript').toEqual([]);
});

test('História escolhe release criada no menu central e abre a mesma identidade pela composição', async ({page}) => {
  await page.goto('/' + storyRoute + '/overview');
  await expect(page.getByRole('heading', {name: storyName, exact: true})).toBeVisible();
  await expect(page.locator('.process-section')).toContainText('SPECIFICATION');
  await page.locator('.tab-nav').getByRole('link', {name: 'Releases', exact: true}).click();
  await expect(page).toHaveURL(/#\/story\/story-consulta\/releases$/);
  await expect(planning(page)).toBeVisible();
  const route = await createPlannedRelease(page, 'Entrega de consulta ao cliente');
  await expect(planning(page)).toContainText('Entrega de consulta ao cliente');
  await plannedLink(page).click();
  await expect(page).toHaveURL(new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  const row = page.getByTestId('planned-story-row').filter({hasText: 'HIS-01'});
  await expect(row).toContainText(storyName);
  await expect(row).toHaveAttribute('href', '#/story/story-consulta/releases');
  await row.click();
  await expect(page.getByRole('heading', {name: storyName, exact: true})).toBeVisible();
  await expect(page.locator('#breadcrumbs')).toContainText('Atendimento ao Cliente');
  await expect(page.locator('#breadcrumbs')).toContainText('Atendimento Digital');
  await expect(page.locator('#breadcrumbs')).toContainText('Consulta de solicitações');
  await capture(page, 'story-release-integrated-desktop');
});

test('escolha de release existente só é salva explicitamente e persiste na recarga; reinício limpa planejamento', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  const route = await createPlannedRelease(page, 'Consulta confirmada');
  await releaseChoice(page).selectOption('');
  await save(page).click();
  await expect(plannedLink(page)).toHaveCount(0);
  await releaseChoice(page).selectOption(route.split('/')[2]);
  await page.reload();
  await expect(plannedLink(page)).toHaveCount(0);
  await expect(releaseChoice(page)).toHaveValue('');
  await releaseChoice(page).selectOption(route.split('/')[2]);
  await save(page).click();
  await page.reload();
  await expect(plannedLink(page)).toHaveAttribute('href', route);
  await expect(planning(page)).toContainText('Consulta confirmada');
  await page.locator('#reset-demo').click();
  await expect(plannedLink(page)).toHaveCount(0);
  await page.goto('/' + route);
  await expect(main(page)).not.toContainText('Consulta confirmada');
});

test('planejar revisão atual não altera release fechada nem aprova revisão pendente', async ({page}) => {
  await page.goto('/#/release/release-r1/composition');
  const digest = await page.getByTestId('artifact-digest').getAttribute('title');
  const oldStory = page.locator('[data-testid="release-composition"] .release-story-group [data-story-id="H01"]');
  await expect(oldStory).toContainText('r1');
  await page.goto('/' + storyRoute + '/releases');
  await expect(releaseChoice(page).locator('option[value="release-r1"]')).toHaveCount(0);
  await expect(releaseChoice(page).locator('option[value="release-r2"]')).toHaveCount(0);
  await expect(page.getByTestId('story-release-history')).toContainText('revisão 1');
  await createPlannedRelease(page, 'Próxima revisão da consulta');
  await plannedLink(page).click();
  const row = page.getByTestId('planned-story-row').filter({hasText: 'HIS-01'});
  await expect(row).toContainText('revisão planejada 2');
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  const freeze = page.locator('[data-story-release-prepare]');
  await expect(freeze).toBeDisabled();
  await expect(main(page)).toContainText(/pendente|impedimento|SPECIFICATION/i);
  await page.goto('/#/release/release-r1/composition');
  await expect(page.getByTestId('artifact-digest')).toHaveAttribute('title', digest);
  await expect(oldStory).toContainText('r1');
  await expect(page.locator('[data-testid="release-composition"] .release-story-group [data-release-action="inspect-story"]')).toHaveCount(10);
});

test('outra História do mesmo Sistema escolhe o rascunho já criado e mantém identidades distintas', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  const route = await createPlannedRelease(page, 'Consulta e notificações');
  const draftId = route.split('/')[2];
  await page.goto('/#/story/story-notificacoes/releases');
  await releaseChoice(page).selectOption(draftId);
  await expect(plannedLink(page)).toHaveCount(0);
  await save(page).click();
  await expect(plannedLink(page)).toHaveAttribute('href', route);
  await plannedLink(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(2);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-01'})).toContainText(storyName);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-02'})).toContainText('Receber aviso de atualização');
});

test('ramificação usa código, título e navegação da História que existe na hierarquia', async ({page}) => {
  await page.goto('/#/release/release-r1/branches');
  await page.getByTestId('release-graph').locator('[data-release-action="inspect-story"][data-story-id="H01"]').click();
  const inspector = page.getByTestId('release-story-inspector');
  await expect(inspector).toContainText('HIS-01');
  await expect(inspector).toContainText(storyName);
  await expect(inspector).toContainText('Atendimento Digital');
  await expect(inspector).toContainText('Consulta de solicitações');
  await inspector.locator('a[href^="#/story/story-consulta/"]').click();
  await expect(page.getByRole('heading', {name: storyName, exact: true})).toBeVisible();
  await expect(page.locator('#breadcrumbs')).toContainText('Consulta de solicitações');
});

test('rascunhos ficam restritos ao Sistema e a História rejeita criação ou associações forjadas', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  const atendimentoRoute = await createPlannedRelease(page, 'Entrega do Atendimento');
  const atendimentoId = atendimentoRoute.split('/')[2];

  await page.goto('/#/manage/create/epic-entregas');
  await page.getByLabel('Nome ou título').fill('Consultar prazo do pedido');
  await page.getByRole('button', {name: 'Criar · simulação', exact: true}).click();
  const pedidosStoryRoute = new URL(page.url()).hash.replace(/\/overview$/, '/releases');
  await page.goto('/' + pedidosStoryRoute);
  await expect(page.locator('#breadcrumbs')).toContainText('Gestão de Pedidos');
  await expect(releaseChoice(page).locator(`option[value="${atendimentoId}"]`)).toHaveCount(0);
  const pedidosRoute = await createPlannedRelease(page, 'Entrega dos Pedidos');
  const pedidosId = pedidosRoute.split('/')[2];

  await page.goto('/' + storyRoute + '/releases');
  await expect(releaseChoice(page).locator(`option[value="${atendimentoId}"]`)).toHaveCount(1);
  await expect(releaseChoice(page).locator(`option[value="${pedidosId}"]`)).toHaveCount(0);
  const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sdlc-navigation-prototype-v1')).releases);
  for (const value of ['__new__', pedidosId, 'release-r1']) {
    await releaseChoice(page).evaluate((select, value) => {select.add(new Option('Escolha forjada no teste', value)); select.value = value;}, value);
    await save(page).click();
    await expect(page.locator('#story-release-error')).not.toHaveText('');
    const after = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sdlc-navigation-prototype-v1')).releases);
    expect(after.plannedDrafts).toEqual(before.plannedDrafts);
    expect(after.assignments).toEqual(before.assignments);
    await expect(plannedLink(page)).toHaveAttribute('href', atendimentoRoute);
  }
  await page.goto('/#/releases/system-pedidos');
  await expect(main(page)).toContainText('Entrega dos Pedidos');
  await expect(main(page)).not.toContainText('Entrega do Atendimento');
  await page.goto('/#/releases/system-atendimento');
  await expect(main(page)).toContainText('Entrega do Atendimento');
  await expect(main(page)).not.toContainText('Entrega dos Pedidos');
});

test('Sistema, Projeto e Épico oferecem contexto de leitura e levam a gestão para o menu Releases', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  await createPlannedRelease(page, 'Consulta planejada');
  await page.goto('/#/story/story-release-h31/releases');
  await createPlannedRelease(page, 'Operação planejada');

  await page.goto('/#/project/project-atendimento/overview');
  await expect(main(page)).toContainText('Consulta planejada');
  await expect(main(page)).not.toContainText('Operação planejada');
  await page.goto('/#/epic/epic-consulta/overview');
  await expect(main(page)).toContainText('Consulta planejada');
  await expect(main(page)).not.toContainText('Operação planejada');
  await page.goto('/#/project/project-operacao/overview');
  await expect(main(page)).toContainText('Operação planejada');
  await expect(main(page)).not.toContainText('Consulta planejada');
  for (const route of ['system/system-atendimento/overview', 'project/project-atendimento/overview', 'epic/epic-consulta/overview']) {
    await page.goto('/#/' + route);
    await expect(page.locator('.tab-nav a[href$="/releases"]')).toHaveCount(0);
    const link = main(page).locator('a[href="#/releases/system-atendimento"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator('[data-global-nav="releases"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#hub-system-filter')).toHaveValue('system-atendimento');
  }
});

test('cache anterior recebe identidade da hierarquia sem reconstruir pacote ou perder planejamento', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  const plannedRoute = await createPlannedRelease(page, 'Planejamento preservado da sessão');
  await page.goto('/#/release/release-r1/composition');
  const originalDigest = await page.getByTestId('artifact-digest').getAttribute('title');
  const preserved = await page.evaluate(() => {
    const key = 'sdlc-navigation-prototype-v1';
    const cache = JSON.parse(sessionStorage.getItem(key));
    const release = cache.releases.items.find(item => item.id === 'release-r1');
    const member = release.stories.find(item => item.id === 'H01');
    const before = {digest: release.digest, stage: release.stage, commit: member.commit, revision: member.revision, count: release.stories.length};
    // Reproduz o formato anterior: somente as referências de navegação faltavam.
    // Conteúdo, aprovações e evidências continuam exatamente no cache original.
    for (const item of cache.releases.items) {
      for (const story of item.stories) {
        delete story.entityId;
        delete story.key;
      }
    }
    delete cache.releases.identityVersion;
    sessionStorage.setItem(key, JSON.stringify(cache));
    return before;
  });
  await page.reload();
  await expect(page.getByTestId('artifact-digest')).toHaveAttribute('title', originalDigest);
  await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage', preserved.stage);
  const chip = page.locator('[data-testid="release-composition"] .release-story-group [data-story-id="H01"]');
  await expect(chip).toContainText('HIS-01');
  await expect(chip).toContainText(`r${preserved.revision}`);
  await chip.click();
  const inspector = page.getByTestId('release-story-inspector');
  await inspector.getByText('Referências técnicas fictícias', {exact: true}).click();
  await expect(inspector).toContainText(preserved.commit);
  await inspector.locator('a[href="#/story/story-consulta/releases"]').click();
  await expect(plannedLink(page)).toHaveAttribute('href', plannedRoute);
  const participation = page.getByTestId('story-release-history').locator('a[href="#/release/release-r1/composition"]');
  await expect(participation).toContainText(`revisão ${preserved.revision}`);
  await participation.click();
  await expect(page.getByTestId('artifact-digest')).toHaveAttribute('title', preserved.digest);
  await expect(page.locator('[data-testid="release-composition"] .release-story-group [data-release-action="inspect-story"]')).toHaveCount(preserved.count);
});

test('fechar seleção elegível consome só a revisão pronta e mantém pendência e vínculo com a candidata', async ({page}) => {
  await page.goto('/' + storyRoute + '/releases');
  const plannedRoute = await createPlannedRelease(page, 'Entrega com pendência preservada');
  const draftId = plannedRoute.split('/')[2];
  await page.goto('/#/story/story-release-h07/releases');
  await releaseChoice(page).selectOption(draftId);
  await save(page).click();
  await plannedLink(page).click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(2);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-01'})).toContainText('PENDING');
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-07'})).toContainText('ELIGIBLE');
  await page.locator('[data-story-release-prepare]').click();
  await expect(page.locator('input[data-release-story="H07"]')).toBeChecked();
  await expect(page.locator('input[data-release-story="H01"]')).toBeDisabled();
  await expect(page.locator('input[data-release-story="H01"]')).not.toBeChecked();
  await page.locator('[data-release-action="create-candidate"]').click();
  await expect(page).toHaveURL(/#\/release\/release-candidate-\d+\/overview$/);
  const candidateRoute = new URL(page.url()).hash.replace('/overview', '/composition');
  await page.goto('/' + candidateRoute);
  const included = page.locator('[data-testid="release-composition"] .release-story-group [data-release-action="inspect-story"]');
  await expect(included).toHaveCount(1);
  await expect(included).toContainText('HIS-07');
  await expect(included).toContainText('r1');

  await page.goto('/' + plannedRoute);
  await expect(page.getByTestId('planned-story-row')).toHaveCount(1);
  await expect(page.getByTestId('planned-story-row')).toContainText('HIS-01');
  await expect(page.getByTestId('planned-story-row')).toContainText('PENDING');
  await expect(page.getByTestId('planned-candidate-link')).toHaveAttribute('href', candidateRoute);
  await page.getByTestId('planned-candidate-link').click();
  await expect(page).toHaveURL(new RegExp(candidateRoute + '$'));

  await page.goto('/#/story/story-release-h07/releases');
  await expect(releaseChoice(page)).toHaveValue('');
  await expect(plannedLink(page)).toHaveCount(0);
  const historical = page.getByTestId('story-release-history').locator(`a[href="${candidateRoute}"]`);
  await expect(historical).toContainText('revisão 1');
  await page.reload();
  await expect(releaseChoice(page)).toHaveValue('');
  await expect(historical).toContainText('revisão 1');
});

test('celular cria no menu Releases e escolhe na História com ação no breadcrumb sem transbordamento', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/' + storyRoute + '/releases');
  await expect(page.locator('#workflow-actions').getByTestId('save-story-release')).toBeVisible();
  await createPlannedRelease(page, 'Entrega revisada no celular');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
  await expect(save(page)).toBeInViewport();
  await capture(page, 'story-release-planning-mobile');
  await plannedLink(page).click();
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, 'story-release-composition-mobile');
});

test('menu principal Releases reúne todos os Sistemas, filtra e exige Sistema na criação central', async ({page}) => {
  await page.goto('/#/release-create');
  await expect(page.locator('#release-create-system')).toHaveValue('');
  await expect(page.locator('#release-create-system')).toHaveAttribute('required', '');
  await page.locator('#release-create-name').fill('Entrega central do Atendimento');
  expect(await page.locator('#release-create-form').evaluate(form => form.checkValidity())).toBe(false);
  await expect(page.locator('#workflow-actions').getByTestId('create-release')).toBeVisible();
  await page.locator('#release-create-system').selectOption('system-atendimento');
  await page.getByTestId('create-release').click();
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  await expect(page.getByTestId('planned-story-row')).toHaveCount(0);
  await expect(page.locator('[data-story-release-prepare]')).toBeDisabled();
  await page.goto('/#/release-create');
  await page.locator('#release-create-system').selectOption('system-pedidos');
  await page.locator('#release-create-name').fill('Entrega central dos Pedidos');
  await page.getByTestId('create-release').click();
  const nav = page.locator('.global-nav');
  await expect(nav.getByRole('link', {name: 'Releases', exact: true})).toHaveCount(1);
  await nav.getByRole('link', {name: 'Releases', exact: true}).click();
  await expect(page).toHaveURL(/#\/releases$/);
  await expect(page.locator('[data-global-nav="releases"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-global-nav="systems"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(main(page)).toContainText('Entrega central do Atendimento');
  await expect(main(page)).toContainText('Entrega central dos Pedidos');
  await capture(page, 'releases-global-menu-desktop');
  await page.locator('#hub-system-filter').selectOption('system-pedidos');
  await page.locator('#releases-hub-filter').evaluate(form => form.requestSubmit());
  await expect(main(page)).toContainText('Entrega central dos Pedidos');
  await expect(main(page)).not.toContainText('Entrega central do Atendimento');
  await nav.getByRole('link', {name: 'Releases', exact: true}).click();
  await expect(page).toHaveURL(/#\/releases$/);
  await expect(page.locator('#hub-system-filter')).toHaveValue('');
  await expect(main(page)).toContainText('Entrega central do Atendimento');
  await expect(main(page)).toContainText('Entrega central dos Pedidos');
  await page.locator('#workflow-actions').getByTestId('release-primary').click();
  await expect(page).toHaveURL(/#\/release-create$/);
  await expect(page.locator('#release-create-system')).toHaveValue('');
  await nav.getByRole('link', {name: 'Sistemas', exact: true}).click();
  await expect(page).toHaveURL(/#\/systems$/);
  await expect(page.locator('[data-global-nav="systems"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-global-nav="releases"]')).not.toHaveAttribute('aria-current', 'page');
});

test('composição central inclui e retira Histórias do mesmo Sistema e preserva pendências e seleção filtrada', async ({page}) => {
  await page.goto('/#/manage/create/epic-entregas');
  await page.getByLabel('Nome ou título').fill('História exclusiva de Pedidos');
  await page.getByRole('button', {name: 'Criar · simulação', exact: true}).click();
  const pedidosStoryId = new URL(page.url()).hash.split('/')[2];
  await page.goto('/' + storyRoute + '/releases');
  const route = await createPlannedRelease(page, 'Composição central');
  await plannedLink(page).click();
  await page.getByTestId('manage-release-composition').click();
  await expect(page).toHaveURL(new RegExp(`#/release/${route.split('/')[2]}/planning$`));
  await expect(page.locator('#workflow-actions').getByTestId('save-release-composition')).toBeVisible();
  await expect(page.locator(`input[data-plan-story="${pedidosStoryId}"]`)).toHaveCount(0);
  for (const id of ['story-notificacoes', 'story-release-h07']) await page.locator(`input[data-plan-story="${id}"]`).check();
  await page.getByTestId('save-release-composition').click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(3);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-01'})).toContainText('PENDING');
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-07'})).toContainText('ELIGIBLE');
  await page.getByTestId('manage-release-composition').click();
  await page.locator('input[data-plan-story="story-notificacoes"]').uncheck();
  await page.getByTestId('save-release-composition').click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(2);
  await expect(page.getByTestId('planned-story-row').filter({hasText: 'HIS-02'})).toHaveCount(0);
  await page.goto('/#/story/story-notificacoes/releases');
  await expect(plannedLink(page)).toHaveCount(0);
  await page.goto('/' + route.replace('/composition', '/planning'));
  await page.locator('#release-plan-search').fill('HIS-07');
  await page.locator('#release-plan-filter').evaluate(form => form.requestSubmit());
  await expect(page.locator('input[data-plan-story]')).toHaveCount(1);
  await page.getByTestId('save-release-composition').click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(2);
  await page.goto('/' + storyRoute + '/releases');
  await expect(plannedLink(page)).toHaveAttribute('href', route);
});
