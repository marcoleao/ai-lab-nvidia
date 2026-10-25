import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const STORY = '#/story/story-consulta';
const TASK = `${STORY}/task/task-consulta`;
const workspace = page => page.getByTestId('story-workspace');
const situation = page => page.getByTestId('story-situation');
const phase = page => page.getByTestId('story-phase');
const panel = page => page.getByTestId('interaction-panel');
const primary = page => page.getByTestId('process-primary');
const observations = new WeakMap();

async function scenario(page, name) {
  const select = page.getByTestId('simulator-select');
  if (!await select.isVisible()) await page.getByTestId('simulation-controls').locator('summary').click();
  await select.selectOption(name);
  await expect(workspace(page)).toBeVisible();
}

async function nextEvent(page) {
  const next = page.getByTestId('simulator-next');
  if (!await next.isVisible()) await page.getByTestId('simulation-controls').locator('summary').click();
  await next.click();
}

async function onlyInteraction(page, primaryCount = 1) {
  await expect(situation(page)).toHaveCount(1);
  await expect(panel(page)).toHaveCount(1);
  await expect(primary(page)).toHaveCount(primaryCount);
  await expect(panel(page).getByTestId('process-primary')).toHaveCount(primaryCount);
  await expect(page.locator('.button.primary:visible')).toHaveCount(primaryCount);
}

async function capture(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage: true});
}

test.beforeEach(async ({page, baseURL}) => {
  const observation = {requests: [], errors: [], sockets: []};
  observations.set(page, observation);
  const origin = new URL(baseURL).origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== origin || /\/api(?:\/|$)/.test(url.pathname) || request.method() !== 'GET') observation.requests.push(`${request.method()} ${request.url()}`);
  });
  page.on('websocket', socket => observation.sockets.push(socket.url()));
  page.on('pageerror', error => observation.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy|Refused to|Failed to load module script/i.test(message.text())) observation.errors.push(message.text());
  });
});

test.afterEach(async ({page}) => {
  const observation = observations.get(page);
  expect(observation.requests, 'O workspace simulado carrega somente arquivos estáticos locais, sem API, provedor ou mutação de rede').toEqual([]);
  expect(observation.sockets, 'A simulação não abre conexão com executores reais').toEqual([]);
  expect(observation.errors, 'As jornadas não devem gerar erros JavaScript ou CSP').toEqual([]);
});

test('História macro e detalhe da Tarefa mantêm fase, contexto e uma única área de interação', async ({page}) => {
  await page.goto(`/${STORY}/overview`);
  await scenario(page, 'review-findings');
  await expect(phase(page)).toContainText('CODE REVIEW');
  await onlyInteraction(page);
  for (const tab of ['tasks', 'specification', 'delivery', 'more']) {
    await page.goto(`/${STORY}/${tab}`);
    await expect(phase(page)).toContainText('CODE REVIEW');
    await onlyInteraction(page);
  }
  await page.goto(`/${STORY}/tasks`);
  await page.getByTestId('task-row-task-consulta').getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/story\/story-consulta\/task\/task-consulta\/overview$/);
  await expect(page.locator('#breadcrumbs')).toContainText('Consultar andamento da solicitação');
  await expect(page.locator('#breadcrumbs')).toContainText('Construir a consulta de andamento');
  await expect(phase(page)).toContainText('CODE REVIEW');
  await expect(panel(page)).toContainText(/Code Review/i);
  await expect(panel(page)).toContainText(/consultando uma Tarefa diferente/i);
  await onlyInteraction(page, 0);
  await capture(page, 'story-task-current-context-desktop');
});

test('G1 exige confirmação, fila não inicia Tarefa e publicação não conclui trabalho sem evidência', async ({page}) => {
  await page.goto(`/${STORY}/tasks`);
  await scenario(page, 'approval');
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await expect(situation(page)).toContainText(/fila|aguardando executor/i);
  await expect(page.getByTestId('task-status-task-consulta')).toHaveText('TO DO');
  await onlyInteraction(page, 0);
  await nextEvent(page);
  await expect(phase(page)).toContainText('CODING');
  await expect(page.getByTestId('task-status-task-consulta')).toHaveText('DOING');
  await expect(situation(page)).toContainText(/aguardando resposta/i);
  await nextEvent(page);
  await expect(situation(page)).toContainText(/publicad|Code Review/i);
  await expect(page.getByTestId('task-status-task-acessibilidade')).toHaveText('TO DO');
  await expect(phase(page)).toHaveText('CODING');
  await expect(primary(page)).toContainText(/Code Review/i);
  await capture(page, 'story-task-published-desktop');
});

test('Code Review reutiliza Tarefa técnica e correção preserva tentativa anterior sem liberar o novo commit', async ({page}) => {
  await page.goto(`/${STORY}/tasks`);
  await scenario(page, 'published');
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(0);
  await primary(page).click();
  await expect(phase(page)).toContainText('CODE REVIEW');
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('TO DO');
  await onlyInteraction(page, 0);
  await nextEvent(page);
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('DOING');
  await page.reload();
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await nextEvent(page);
  await expect(situation(page)).toContainText(/achad|correção/i);
  await primary(page).click();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await expect(phase(page)).toContainText('CODING');
  await nextEvent(page);
  await nextEvent(page);
  await expect(situation(page)).toContainText(/nova revisão|novo commit|Code Review/i);
  await expect(primary(page)).toContainText(/Code Review/i);
  await primary(page).click();
  await nextEvent(page);
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('DOING');
  await page.goto(`/${STORY}/task/sw-review/attempts`);
  await expect(workspace(page)).toContainText(/tentativa.*1|primeira tentativa/i);
  await expect(workspace(page)).toContainText(/tentativa.*2|segunda tentativa/i);
  await expect(workspace(page)).toContainText(/históric|anterior/i);
  await capture(page, 'story-review-attempts-desktop');
  await nextEvent(page);
  await primary(page).click();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await nextEvent(page);
  await nextEvent(page);
  await expect(situation(page)).toContainText('revisão 3');
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('TO DO');
});

test('credencial encontrada no código e autenticação HTTP 401 têm ações e contextos diferentes', async ({page}) => {
  await page.goto(`/${STORY}/overview`);
  await scenario(page, 'auth-error');
  await expect(panel(page)).toContainText(/autenticação|acesso da integração/i);
  await expect(panel(page)).toContainText(/401/);
  await expect(primary(page)).not.toContainText(/corrigir código|autorizar correção/i);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const authAction = await primary(page).innerText();
  await capture(page, 'story-integration-auth-error');
  await scenario(page, 'review-findings');
  await expect(panel(page)).toContainText(/achad|código/i);
  await expect(workspace(page)).toContainText(/credencial/i);
  expect(await primary(page).innerText()).not.toBe(authAction);
  await primary(page).click();
  await expect(page.getByTestId('process-confirmation')).toBeVisible();
  await expect(primary(page)).toBeDisabled();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('fila, resposta do modelo, desconexão da tela e ausência de heartbeat são distinguíveis', async ({page}) => {
  await page.goto(`/${STORY}/overview`);
  await scenario(page, 'queued');
  await expect(situation(page)).toContainText(/fila|aguardando executor/i);
  await expect(situation(page)).not.toContainText(/modelo.*(?:gerando|processando)/i);
  await scenario(page, 'running');
  await expect(situation(page)).toContainText(/aguardando resposta do modelo/i);
  await page.getByTestId('current-activity-link').click();
  const signals = page.getByTestId('processing-signals');
  await expect(signals).toContainText(/consulta da tela/i);
  await expect(signals).toContainText(/presença do executor/i);
  await expect(signals).toContainText(/atividade da ferramenta/i);
  await expect(signals).toContainText(/heartbeat/i);
  await expect(panel(page)).not.toContainText(/\d+\s*%/);
  await capture(page, 'story-processing-signals');
  await scenario(page, 'disconnected');
  await expect(situation(page)).toContainText(/(?:consulta|tela|interface).*(?:falh|conex|atualiza)|últim[oa].*confirmad/i);
  await expect(primary(page)).not.toContainText(/reiniciar|gerar novamente|corrigir código/i);
  await scenario(page, 'no-heartbeat');
  await expect(situation(page)).toContainText(/sem confirmação recente|heartbeat/i);
  await expect(situation(page)).not.toContainText(/processo travado|execução fracassada/i);
  await expect(panel(page)).not.toContainText(/\d+\s*%/);
});

test('conversa e rascunho persistem no contexto da Tarefa sem conceder aprovação ou trocar seu alvo', async ({page}) => {
  await page.goto(`/${STORY}/overview`);
  await scenario(page, 'review-findings');
  await page.getByTestId('current-activity-link').click();
  await panel(page).getByText('Conversar sobre esta atividade', {exact: true}).click();
  const draft = 'Explique o achado e preserve o escopo aprovado; ainda não autorizo a correção.';
  await page.getByTestId('interaction-message').fill(draft);
  await page.goto(`/${STORY}/specification`);
  await expect(page.getByTestId('interaction-message')).toHaveValue(draft);
  await page.goto(`/${TASK}/overview`);
  await expect(panel(page)).toContainText(/consultando uma Tarefa diferente/i);
  await expect(page.getByTestId('interaction-message')).toHaveCount(0);
  await onlyInteraction(page, 0);
  await page.getByTestId('return-current').click();
  await expect(page).toHaveURL(/\/task\/sw-review\/overview$/);
  await expect(page.getByTestId('interaction-message')).toHaveValue(draft);
  await page.reload();
  await expect(page.getByTestId('interaction-message')).toHaveValue(draft);
  await page.getByTestId('conversation-send').click();
  await expect(panel(page)).toContainText(draft);
  await expect(panel(page)).toContainText(/correção só será solicitada após preparar e confirmar/i);
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await expect(primary(page)).toContainText('Preparar correção');
  await expect(page.getByTestId('process-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('interaction-message')).toHaveValue('');
  await page.reload();
  await expect(panel(page)).toContainText(draft);
  await capture(page, 'story-task-conversation-context');
});

test('novo commit torna review e scan pendentes e a aprovação antiga permanece consultável somente como histórico', async ({page}) => {
  await page.goto(`/${STORY}/tasks`);
  await scenario(page, 'scan-findings');
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('DONE');
  await expect(page.getByTestId('task-status-sw-scan')).toHaveText('DOING');
  await page.goto(`/${STORY}/task/sw-review/attempts`);
  const oldAttempt = page.locator('[data-testid^="attempt-link-"]').first();
  const oldRoute = await oldAttempt.getAttribute('href');
  await expect(page.getByTestId('attempt-detail')).toContainText('Parecer aprovado');
  await page.getByTestId('return-current').click();
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await nextEvent(page);
  await nextEvent(page);
  await page.goto(`/${STORY}/tasks`);
  await expect(phase(page)).toHaveText('CODING');
  await expect(situation(page)).toContainText('revisão 2');
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('TO DO');
  await expect(page.getByTestId('task-status-sw-scan')).toHaveText('TO DO');
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await expect(page.getByTestId('task-row-sw-scan')).toHaveCount(1);
  await expect(primary(page)).toContainText('Code Review da nova revisão');
  await page.goto('/' + oldRoute);
  await expect(page.getByTestId('attempt-detail')).toHaveAttribute('data-history', 'true');
  await expect(page.getByTestId('attempt-detail')).toContainText('revisão 1');
  await expect(page.getByTestId('attempt-detail')).toContainText('Parecer aprovado');
  await expect(panel(page)).toContainText(/CONSULTA HISTÓRICA.*SOMENTE LEITURA/);
  await onlyInteraction(page, 0);
  await expect(page.getByTestId('interaction-message')).toHaveCount(0);
  await expect(phase(page)).toHaveText('CODING');
  await page.reload();
  await expect(page.getByTestId('attempt-detail')).toHaveAttribute('data-history', 'true');
  await expect(phase(page)).toHaveText('CODING');
  await capture(page, 'story-review-historical-readonly');
  await page.getByTestId('return-current').click();
  await expect(page).toHaveURL(/\/task\/task-consulta\/overview$/);
  await expect(primary(page)).toContainText('Code Review da nova revisão');
});

test('situação, ciclo e navegação por teclado permanecem visíveis ao rolar em desktop e celular', async ({page}) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({width, height: 844});
    await page.goto(`/${STORY}/specification`);
    await scenario(page, 'review-findings');
    await page.evaluate(() => window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
    await expect(situation(page)).toBeInViewport();
    await expect(phase(page)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.goto(`/${TASK}/overview`);
    await expect(phase(page)).toContainText('CODE REVIEW');
    await expect(situation(page)).toBeInViewport();
    await onlyInteraction(page, 0);
    await capture(page, `story-task-context-${width}`);
  }
  await page.goto(`/${STORY}/overview`);
  const tasks = page.getByRole('navigation', {name: 'Seções da História'}).getByRole('link', {name: 'Tarefas', exact: true});
  await tasks.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator('#main-content h1')).toBeFocused();
});

test('identidade visual e menu Releases permanecem no novo workspace sem confundir release com deploy da História', async ({page}) => {
  await page.goto(`/${STORY}/delivery`);
  await scenario(page, 'scan-passed');
  const identity = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {blue: style.getPropertyValue('--blue').trim(), navy: style.getPropertyValue('--navy').trim(), font: style.fontFamily};
  });
  expect(identity).toMatchObject({blue: '#0076ce', navy: '#012169'});
  expect(identity.font).toContain('Segoe UI');
  await expect(page.locator('.brand')).toContainText('Dell Technologies');
  await expect(page.locator('.prototype-badge')).toContainText('Protótipo · dados simulados');
  await expect(page.locator('[data-global-nav="releases"]')).toHaveCount(1);
  await expect(workspace(page)).toContainText(/release/i);
  await expect(primary(page)).not.toContainText(/deploy|produção|homologar/i);
  await page.locator('[data-global-nav="releases"]').click();
  await expect(page).toHaveURL(/#\/releases$/);
  await expect(page.locator('[data-global-nav="releases"]')).toHaveAttribute('aria-current', 'page');
});

test('Tarefa manual criada em Mais permanece editável e seus estados e arquivamento aparecem no mapa', async ({page}) => {
  await page.goto(`/${STORY}/more`);
  await scenario(page, 'review-findings');
  await page.getByRole('link', {name: 'Criar Tarefa manual', exact: true}).click();
  await page.getByLabel('Nome ou título').fill('Validar entendimento das mensagens');
  await page.getByLabel('Descrição', {exact: true}).fill('Revisão manual com uma pessoa do negócio.');
  await page.getByRole('button', {name: 'Criar · simulação', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Validar entendimento das mensagens', exact: true, level: 1})).toBeVisible();
  const routeParts = new URL(page.url()).hash.split('/');
  const taskId = routeParts[1] === 'task' ? routeParts[2] : routeParts[4];
  expect(taskId).toMatch(/^local-/);
  const taskRoute = `${STORY}/task/${taskId}/overview`;
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId(`task-status-${taskId}`)).toHaveText('TO DO');
  await page.getByTestId(`task-row-${taskId}`).getByRole('link').click();
  const manage = async mode => {
    const link = page.locator(`a[href="#/manage/${mode}/${taskId}"]`);
    await expect(link).toBeAttached();
    const details = link.locator('xpath=ancestor::details');
    if (await details.count() && !await link.isVisible()) await details.locator('summary').click();
    await expect(link).toBeVisible();
    await link.click();
  };
  await manage('edit');
  await page.getByLabel('Nome ou título').fill('Validar mensagens com o negócio');
  await page.getByLabel('Descrição', {exact: true}).fill('Registrar a evidência da consulta manual.');
  await page.getByRole('button', {name: 'Salvar alterações · simulação', exact: true}).click();
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId(`task-row-${taskId}`)).toContainText('Validar mensagens com o negócio');
  await expect(page.getByTestId(`task-row-${taskId}`)).toContainText('Registrar a evidência da consulta manual.');
  await page.goto('/' + taskRoute);
  await manage('state');
  await page.getByRole('button', {name: 'Confirmar situação · simulação', exact: true}).click();
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId(`task-status-${taskId}`)).toHaveText('DOING');
  await page.goto('/' + taskRoute);
  await manage('state');
  await page.getByLabel('Próxima situação').selectOption('done');
  await page.getByRole('button', {name: 'Confirmar situação · simulação', exact: true}).click();
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId(`task-status-${taskId}`)).toHaveText('DONE');
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await page.goto('/' + taskRoute);
  await manage('archive');
  await page.locator('#management-form input[type="checkbox"]').check();
  await page.getByRole('button', {name: 'Confirmar arquivamento · simulação', exact: true}).click();
  await page.goto(`/${STORY}/tasks`);
  await page.reload();
  await expect(page.getByTestId(`task-row-${taskId}`)).toHaveCount(0);
  await expect(page.getByTestId('task-row-sw-review')).toHaveCount(1);
  await expect(phase(page)).toHaveText('CODE REVIEW');
});

test('associar uma release existente usa o comando único e preserva escolha, fase e composições anteriores', async ({page}) => {
  await page.goto(`/${STORY}/overview`);
  await scenario(page, 'review-findings');
  await page.goto('/#/release-create');
  await page.locator('#release-create-system').selectOption('system-atendimento');
  await page.locator('#release-create-name').fill('Consulta com planejamento preservado');
  await page.getByTestId('create-release').click();
  await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage', 'draft');
  const releaseRoute = new URL(page.url()).hash;
  const releaseId = releaseRoute.split('/')[2];
  await page.goto(`/${STORY}/delivery`);
  await page.getByRole('link', {name: 'Escolher uma release existente e consultar participações →', exact: true}).click();
  await expect(page).toHaveURL(/#\/story\/story-consulta\/releases$/);
  await expect(page.getByTestId('story-releases')).toBeVisible();
  await onlyInteraction(page);
  await expect(primary(page)).toContainText('Salvar planejamento');
  await expect(page.getByTestId('save-story-release')).toHaveCount(0);
  const historyBefore = await page.getByTestId('story-release-history').textContent();
  await page.locator('#story-release-select').selectOption(releaseId);
  await expect(page.getByTestId('planned-release-link')).toHaveCount(0);
  await primary(page).click();
  await expect(page.getByTestId('planned-release-link')).toHaveAttribute('href', releaseRoute);
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await onlyInteraction(page);
  await page.reload();
  await expect(page.locator('#story-release-select')).toHaveValue(releaseId);
  await expect(page.getByTestId('planned-release-link')).toHaveAttribute('href', releaseRoute);
  await expect(page.getByTestId('story-release-history')).toHaveText(historyBefore);
  await page.getByTestId('planned-release-link').click();
  await expect(page.getByTestId('planned-story-row')).toHaveCount(1);
  await expect(page.getByTestId('planned-story-row')).toContainText('HIS-01');
  await page.goto(`/${STORY}/releases`);
  await page.locator('#story-release-select').selectOption('');
  await primary(page).click();
  await expect(page.getByTestId('planned-release-link')).toHaveCount(0);
  await expect(page.getByTestId('story-release-history')).toHaveText(historyBefore);
  await expect(phase(page)).toHaveText('CODE REVIEW');
});

test('review, scan e merge concluem suas Tarefas pela evidência sem concluir a História nem trabalho manual', async ({page}) => {
  await page.goto(`/${STORY}/tasks`);
  await scenario(page, 'published');
  await primary(page).click();
  await nextEvent(page);
  const passReview = page.getByTestId('simulator-alternative');
  if (!await passReview.isVisible()) await page.getByTestId('simulation-controls').locator('summary').click();
  await passReview.click();
  await expect(page.getByTestId('task-status-sw-review')).toHaveText('DONE');
  await expect(primary(page)).toContainText('Security Scan');
  await primary(page).click();
  await expect(page.getByTestId('task-status-sw-scan')).toHaveText('TO DO');
  await nextEvent(page);
  await expect(page.getByTestId('task-status-sw-scan')).toHaveText('DOING');
  await onlyInteraction(page, 0);
  await nextEvent(page);
  await expect(page.getByTestId('task-status-sw-scan')).toHaveText('DONE');
  await expect(primary(page)).toContainText('merge');
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await expect(page.getByTestId('task-status-sw-merge')).toHaveText('TO DO');
  await nextEvent(page);
  await expect(page.getByTestId('task-status-sw-merge')).toHaveText('DOING');
  await nextEvent(page);
  await expect(page.getByTestId('task-status-sw-merge')).toHaveText('DONE');
  await expect(page.getByTestId('task-status-task-acessibilidade')).toHaveText('TO DO');
  await expect(phase(page)).toHaveText('TESTING');
  await expect(situation(page)).toContainText('testes e entrega continuam pendentes');
  await expect(primary(page)).toHaveText('Consultar entrega e release');
  for (const id of ['sw-review', 'sw-scan', 'sw-merge']) await expect(page.getByTestId(`task-row-${id}`)).toHaveCount(1);
  await page.reload();
  await expect(phase(page)).toHaveText('TESTING');
  await expect(page.getByTestId('task-status-sw-merge')).toHaveText('DONE');
  await capture(page, 'story-task-quality-merge-complete');
});
