import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {mockTaskCollection,openWorkPanel} from './journey-fixtures';

const now = '2026-10-23T15:00:00.000Z';
const sha = 'a'.repeat(40), oldSha = 'b'.repeat(40);
const personae = [{ id: 'admin', name: 'Administrador', role: 'admin' }, { id: 'ana', name: 'Ana', role: 'product_owner' }, { id: 'bruno', name: 'Bruno', role: 'architect' }, { id: 'carla', name: 'Carla', role: 'qa_lead' }];
const item = (id: string, kind: string, name: string, status = 'todo') => ({ id, kind, key: id.toUpperCase(), name, status, version: 3, description: `Escopo registrado de ${name}.`, archived: false, parentId: kind === 'task' ? 'journey-story' : null, data: {}, createdAt: now, updatedAt: now });

async function fixture(page: Page) {
  const story = item('journey-story', 'story', 'Entrega na nova navegação', 'code_review');
  const review = { ...item('journey-review', 'task', 'Revisar código desta entrega', 'doing'), managed: true, processOwned: true, activityKind: 'code_review', operationalState: 'blocked' };
  const planned = { ...item('journey-planned', 'task', 'Integrar serviço planejado'), managed: false, activityKind: 'coding', operationalState: null };
  const currentAttempt = { id: 'attempt-latest', state: 'blocked', stage: 'code_review', sha, summary: 'Um achado precisa de correção.', error: null, findings: [{ path: 'src/config.js', line: 8, severity: 'HIGH', message: 'Remover credencial fixa do código.' }], evidence: { scope: 'Diff da revisão atual', engine: 'local-llm' }, createdAt: now, updatedAt: now, finishedAt: now, heartbeatAt: null, events: [] };
  const journey: any = {
    story, current: { phase: 'CODE REVIEW', state: 'blocked', kind: 'code_review', taskId: review.id, activityId: 'review-activity', title: 'Code Review encontrou achados; correção necessária', message: 'O acesso ao GitLab funcionou. O achado pertence ao código.', who: 'Responsável pela correção', updatedAt: now },
    nextAction: { id: 'correct', kind: 'correct', label: 'Solicitar correção à IA', enabled: true, path: '/api/executions/journey-run/quality/correct', method: 'POST', body: { expectedVersion: story.version, expectedSha: sha, checkId: 'check-current' }, confirmation: { title: 'Autorizar correção dos achados', description: 'Uma nova revisão precisará passar novamente por Code Review e Security Scan.', checkboxLabel: 'Autorizo corrigir os achados preservando o escopo aprovado.' } },
    secondaryActions: [{ id: 'review', kind: 'review', label: 'Executar novamente Code Review', enabled: true, method: 'POST', path: '/api/executions/journey-run/quality', body: { kind: 'code_review', expectedVersion: story.version, expectedSha: sha } }],
    tasks: [review, planned], activities: [{ id: 'review-activity', kind: 'code_review', label: 'Code Review', taskId: review.id, state: 'blocked', links: [], attempts: [currentAttempt, { ...currentAttempt, id: 'attempt-old', sha: oldSha, summary: 'Parecer da revisão anterior.', createdAt: '2026-10-22T15:00:00Z', findings: [{ path: 'src/old.js', line: 4, severity: 'LOW', message: 'Achado antigo preservado.' }] }] }],
    run: { id: 'journey-run', state: 'succeeded', stage: 'completed', commitSha: sha, branch: 'sdlc/story-journey', mergeRequestUrl: 'http://gitlab/product/-/merge_requests/7', specification: { requirements: 'Requisito verificável desta entrega.', architecture: 'Arquitetura proposta para aprovação.', testCases: [{ criterionIndex: 0, description: 'Conferir o resultado no contrato.' }], risks: ['Preservar contratos.'] }, discussionVersion: 0 },
    chat: { mode: null, executionId: null, enabled: false, reason: 'Consulte o resultado da atividade.' }, permissions: { canAct: true }, configured: { execution: true, quality: true, merge: true },
    events: [{ id: 'queued-event', timestamp: '2026-10-23T14:58:00Z', message: 'Pedido recebido na fila.' }, { id: 'result-event', timestamp: now, message: 'Relatório recebido e validado.' }],
    signals: { lastEventAt: now, lastHeartbeatAt: null, heartbeatStaleAfterMs: 45000, stage: 'code_review', provider: 'local-llm', legacy: false },
    binding: { activityId: 'coding-activity', enabled: true, expectedLinksVersion: 'work-links-test-v1', tasks: [{ id: planned.id, key: planned.key, name: planned.name, description: planned.description, linked: false, scope: '', completion: 'manual_evidence' }] },
  };
  const state = { journey, story, review, planned, writes: [] as { path: string; body: any; persona: string; key: string }[], disconnected: false, abortNext: false, failWrite: false, onWrite: (_path: string, _body: any) => {} };
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') {
      state.writes.push({ path, body: req.postDataJSON(), persona: req.headers()['x-persona'], key: req.headers()['idempotency-key'] });
      if (state.failWrite) return route.fulfill({ status: 409, json: { error: { message: 'O contexto mudou no ensaio; atualize antes de salvar.' } } });
      if (state.abortNext) { state.abortNext = false; state.onWrite(path, req.postDataJSON()); return route.abort(); }
      state.onWrite(path, req.postDataJSON());
      if (path.endsWith('/work-links')) return route.fulfill({ json: { linked: true } });
      return route.fulfill({ json: { run: state.journey.run, confirmed: true } });
    }
    if (path === '/api/personas') return route.fulfill({ json: { personas: personae } });
    if (path.endsWith('/journey')) {
      if (state.disconnected) return route.fulfill({ status: 503, json: { error: { message: 'Consulta indisponível no ensaio isolado.' } } });
      const allowed = ['admin', 'ana', 'bruno'].includes(req.headers()['x-persona']);
      const copy = structuredClone(state.journey);
      copy.permissions.canAct = allowed;
      for (const action of [copy.nextAction, ...copy.secondaryActions].filter(Boolean)) if (!allowed) { action.enabled = false; action.reason = 'Selecione uma persona autorizada para executar.'; }
      return route.fulfill({ json: copy });
    }
    if (path.endsWith('/release')) return route.fulfill({ json: { story: { ...story, projectId: 'project', projectName: 'Projeto', epicId: 'epic', epicName: 'Épico' }, assignment: null, system: { id: 'system', name: 'Sistema do ensaio' }, releases: [], truncated: false, totalChoices: 0 } });
    const selected = path.split('/').at(-1);
    const found = [story, review, planned].find(value => value.id === selected);
    if (found) return route.fulfill({ json: { item: found, ancestors: found.kind === 'task' ? [story] : [], children: found.kind === 'story' ? [review, planned] : [], repositories: [], availableRepositories: [], environments: [], history: [] } });
    return route.fulfill({ json: {} });
  });
  await mockTaskCollection(page,()=>state.journey.tasks);
  return state;
}

const interaction = (page: Page) => page.getByTestId('story-process');
async function actAsAdmin(page: Page) { await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin'); }
async function openInteraction(page: Page) { return openWorkPanel(page); }

async function planningFixture(page: Page) {
  const state = await fixture(page);
  const result = { state, requests: [] as { path: string; method: string; key: string; body: any }[], created: 0, updated: 0, abortNext: false, rejectNext: false };
  const replay = new Map<string, any>();
  const createdTask = { ...item('central-created-task', 'task', 'Tarefa criada pelo formulário central'), version: 1, managed: false, processOwned: false };
  await page.route(url => ['/api/items', '/api/items/journey-story', '/api/items/journey-planned'].includes(url.pathname), async route => {
    const request = route.request();
    if (!['POST', 'PATCH'].includes(request.method())) return route.fallback();
    const body = request.postDataJSON(), key = request.headers()['idempotency-key'];
    result.requests.push({ path: new URL(request.url()).pathname, method: request.method(), key, body });
    expect(request.headers()['x-persona']).toBe('admin');
    if (result.rejectNext) { result.rejectNext = false; return route.fulfill({ status: 409, json: { error: { message: 'Versão alterada no ensaio isolado.' } } }); }
    let response = replay.get(key);
    if (!response) {
      if (request.method() === 'POST') {
        Object.assign(createdTask, { name: body.name, description: body.description });
        state.journey.tasks.push(createdTask); result.created++;
        response = { item: structuredClone(createdTask) };
      } else {
        const target = new URL(request.url()).pathname.endsWith('/journey-planned') ? state.planned : state.story;
        Object.assign(target, { name: body.name, description: body.description, version: target.version + 1 }); result.updated++;
        response = { item: structuredClone(target) };
      }
      replay.set(key, response);
    }
    if (result.abortNext) { result.abortNext = false; return route.abort(); }
    return route.fulfill({ json: response });
  });
  await page.route(url => url.pathname === '/api/items/central-created-task', route => route.fulfill({ json: { item: createdTask, ancestors: [state.story], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  return result;
}

const planningForm = (page: Page) => page.getByRole('form', { name: 'Formulário do item' });
const topActions = (page: Page) => page.getByRole('region', { name: 'Situação e próxima ação' });

async function editPlannedTask(page: Page) {
  await page.goto('/tasks/journey-planned?interact=administration'); await actAsAdmin(page);
  const panel = page.getByTestId('story-process');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('edit-item').click();
  await expect(planningForm(page)).toBeVisible();
  return panel;
}

test('Task editing uses a central mobile form and unique header actions, and Cancel restores its prior central process section', async ({ page }) => {
  const state = await planningFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await editPlannedTask(page), form = planningForm(page);
  await expect(page.locator('.sw-content').getByRole('form', { name: 'Formulário do item' })).toBeVisible();
  await expect(form).toHaveCount(1); await expect(panel).toBeHidden();
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(page.getByTestId('story-workspace')).not.toHaveClass(/sw-with-interaction/);
  await expect(topActions(page)).toContainText('Editar tarefa');
  await expect(topActions(page).getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(1);
  await expect(topActions(page).getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(1);
  await expect(page.locator('button[type="submit"][form="item-form"]')).toHaveCount(1);
  await expect(form.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Rascunho cancelado da Tarefa');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/task-central-edit-mobile.png`, fullPage: true });
  await topActions(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(form).toHaveCount(0); await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-item')).toBeVisible();
  await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
  await expect(page.getByTestId('story-journey-header').locator('.sw-cycle [aria-current="step"]')).toBeInViewport();
  expect(state.requests).toEqual([]); expect(state.state.planned.name).toBe('Integrar serviço planejado');
});

test('central Task edit preserves its draft across tabs, permission changes and a rejected save before confirming the versioned PATCH', async ({ page }) => {
  const state = await planningFixture(page);
  const panel = await editPlannedTask(page), form = planningForm(page);
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa revisada no centro');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Escopo preservado no rascunho da Tarefa.');
  await page.getByRole('navigation', { name: 'Seções de Tarefa' }).getByRole('link', { name: 'Evidências', exact: true }).click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Tarefa revisada no centro');
  await expect(panel).toBeHidden();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  await expect(topActions(page).getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await expect(topActions(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
  await expect(form.getByRole('textbox', { name: 'Descrição', exact: true })).toHaveValue('Escopo preservado no rascunho da Tarefa.');
  await actAsAdmin(page); state.rejectNext = true;
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(topActions(page).getByRole('alert')).toContainText('Versão alterada no ensaio isolado');
  await topActions(page).getByRole('alert').getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Tarefa revisada no centro');
  await expect(form.getByRole('textbox', { name: 'Descrição', exact: true })).toHaveValue('Escopo preservado no rascunho da Tarefa.');
  expect(state.requests).toHaveLength(1);
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(form).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Tarefa revisada no centro', exact: true })).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Seções de Tarefa' }).getByRole('link', { name: 'Evidências', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(state.updated).toBe(1);
  expect(state.requests).toHaveLength(2);
  expect(state.requests.every(request => request.method === 'PATCH' && request.path === '/api/items/journey-planned' && request.body.expectedVersion === 3)).toBe(true);
  expect(state.state.planned).toMatchObject({ status: 'todo', version: 4, description: 'Escopo preservado no rascunho da Tarefa.' });
});

test('a lost central Task edit acknowledgement retries the original PATCH identity without applying the update twice', async ({ page }) => {
  const state = await planningFixture(page);
  await editPlannedTask(page); const form = planningForm(page);
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa com confirmação recuperada');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Reenvio conserva a solicitação original.');
  state.abortNext = true;
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(topActions(page).getByRole('alert')).toBeVisible();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Tarefa com confirmação recuperada');
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(interaction(page)).toBeHidden();
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(form).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Tarefa com confirmação recuperada', exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(2); expect(state.requests[0].key).toBeTruthy(); expect(state.requests[1]).toEqual(state.requests[0]);
  expect(state.requests[0]).toMatchObject({ method: 'PATCH', path: '/api/items/journey-planned', body: { name: 'Tarefa com confirmação recuperada', description: 'Reenvio conserva a solicitação original.', expectedVersion: 3 } });
  expect(state.updated).toBe(1); expect(state.state.planned.version).toBe(4);
});

test('Story creates a Task in the central form with one Save and Cancel in the header and preserves a cancelled draft across tabs', async ({ page }) => {
  const state = await planningFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stories/journey-story?tasks.q=preservado');
  await actAsAdmin(page);
  await page.getByTestId('create-item').click();
  const form = planningForm(page);
  await expect(page.locator('.sw-content').getByRole('form', { name: 'Formulário do item' })).toBeVisible();
  await expect(form).toHaveCount(1); await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(topActions(page)).toContainText('Criar tarefa');
  await expect(topActions(page).getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(1);
  await expect(topActions(page).getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(1);
  await expect(form.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa em rascunho');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Descrição preservada entre abas.');
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${directory}/story-central-form-mobile.png`, fullPage: true });
  const tabs = page.getByRole('navigation', { name: 'Seções de História' });
  await tabs.getByRole('link', { name: 'Especificação', exact: true }).click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Tarefa em rascunho');
  await tabs.getByRole('link', { name: /^Tarefas/ }).click();
  await expect(form.getByRole('textbox', { name: 'Descrição', exact: true })).toHaveValue('Descrição preservada entre abas.');
  await expect(page).toHaveURL(/tasks.q=preservado/);
  await topActions(page).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(form).toHaveCount(0); expect(state.requests).toEqual([]);
  const phase = page.getByTestId('story-journey-header').locator('.sw-cycle [aria-current="step"]');
  await expect(phase).toContainText('CODE REVIEW'); await expect(phase).toBeInViewport();
  await page.screenshot({ path: `${directory}/story-central-cancel-mobile.png`, fullPage: true });
  await page.getByTestId('create-item').click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('');
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa criada pelo formulário central');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Criação confirmada no mock isolado.');
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/central-created-task$/);
  expect(state.created).toBe(1); expect(state.requests).toHaveLength(1);
  expect(state.requests[0].body).toEqual({ kind: 'task', parentId: 'journey-story', name: 'Tarefa criada pelo formulário central', description: 'Criação confirmada no mock isolado.', repositoryIds: [] });
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Seções de Tarefa' }).getByRole('link', { name: 'Resumo', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('a lost central Task creation acknowledgement keeps its draft and retries the same idempotency identity', async ({ page }) => {
  const state = await planningFixture(page);
  await page.goto('/stories/journey-story'); await actAsAdmin(page); await page.getByTestId('create-item').click();
  const form = planningForm(page);
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa de confirmação incerta');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Rascunho preservado após resposta perdida.');
  state.abortNext = true;
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(topActions(page).getByRole('alert')).toBeVisible();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Tarefa de confirmação incerta');
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/central-created-task$/);
  expect(state.requests).toHaveLength(2); expect(state.requests[0].key).toBeTruthy(); expect(state.requests[1]).toEqual(state.requests[0]); expect(state.created).toBe(1);
});

test('central Story editing retains a rejected draft across persona and tab changes and can be confirmed from the header', async ({ page }) => {
  const state = await planningFixture(page);
  await page.goto('/stories/journey-story'); await actAsAdmin(page); await page.getByTestId('edit-item').click();
  const form = planningForm(page);
  await expect(topActions(page)).toContainText('Editar história');
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('História revisada no formulário central');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Escopo revisado apenas na fixture interceptada.');
  state.rejectNext = true;
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(topActions(page).getByRole('alert')).toContainText('Versão alterada no ensaio isolado');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  await expect(topActions(page).getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await expect(topActions(page).getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('História revisada no formulário central');
  await actAsAdmin(page);
  await page.getByRole('navigation', { name: 'Seções de História' }).getByRole('link', { name: 'Especificação', exact: true }).click();
  await expect(form.getByRole('textbox', { name: 'Descrição', exact: true })).toHaveValue('Escopo revisado apenas na fixture interceptada.');
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(form).toHaveCount(0); await expect(page.getByRole('heading', { name: 'História revisada no formulário central', exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(2); expect(state.requests.every(request => request.method === 'PATCH' && request.path === '/api/items/journey-story' && request.body.expectedVersion === 3)).toBe(true);
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
});

test('Story remains macro and task drill down keeps phase and one place for interaction', async ({ page }) => {
  await fixture(page);
  await page.goto('/stories/journey-story');
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
  await expect(page.getByRole('heading', { name: 'Tarefas da História' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Seções de História' }).getByRole('link', { name: 'Resumo', exact: true })).toHaveCount(0);
  await expect(page.getByText('Remover credencial fixa do código.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assistente IA', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('story-journey-header').getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toHaveCount(0);
  await page.getByTestId('journey-task-list').getByRole('link', { name: /Revisar código desta entrega/ }).click();
  await expect(page).toHaveURL(url => url.pathname === '/tasks/journey-review');
  await expect(page.getByText('Remover credencial fixa do código.')).toBeVisible();
  await actAsAdmin(page);
  await openInteraction(page);
  await expect(interaction(page)).toBeVisible();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toBeEnabled();
  await expect(page.getByTestId('story-journey-header').getByRole('button', { name: 'Abrir Code Review', exact: true })).toHaveCount(0);
  await expect(interaction(page).locator('button.primary:visible')).toHaveCount(1);
  await expect(interaction(page).getByRole('button', { name: 'Executar novamente Code Review', exact: true })).not.toBeVisible();
});

test('G1 requires review and confirmation, and an uncertain request reuses its identity after reload', async ({ page }) => {
  const state = await fixture(page);
  Object.assign(state.journey.current, { phase: 'SPECIFICATION', state: 'waiting_approval', title: 'Especificação pronta; G1 aguarda sua decisão', taskId: null });
  state.journey.nextAction = { id: 'approve', kind: 'approve', label: 'Aprovar G1 e gerar código', enabled: true, path: '/api/executions/journey-run/approve', method: 'POST', body: { expectedVersion: state.story.version }, confirmation: { title: 'Aprovar especificação G1', description: 'Confira requisitos, arquitetura e casos de teste.', checkboxLabel: 'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.' } };
  state.journey.secondaryActions = [];
  await page.goto('/stories/journey-story?tab=specification');
  await actAsAdmin(page);
  await expect(page.getByText('Requisito verificável desta entrega.')).toBeVisible();
  await openInteraction(page);
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await interaction(page).getByRole('button', { name: 'Aprovar G1 e gerar código', exact: true }).click();
  const confirm = interaction(page).getByRole('button', { name: 'Confirmar: Aprovar G1 e gerar código', exact: true });
  await expect(confirm).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await interaction(page).getByRole('checkbox', { name: /Revisei a especificação/ }).check();
  state.abortNext = true;
  await confirm.click();
  await expect(interaction(page).getByText('A confirmação da solicitação está pendente.')).toBeVisible();
  await page.reload();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('bruno');
  await expect(interaction(page).getByRole('button', { name: 'Verificar a mesma solicitação' })).toBeDisabled();
  await actAsAdmin(page);
  state.onWrite = () => { state.journey.nextAction = null; Object.assign(state.journey.current, { phase: 'CODING', state: 'queued', title: 'Codificação recebida; aguardando executor' }); };
  await interaction(page).getByRole('button', { name: 'Verificar a mesma solicitação' }).click();
  await expect(page.getByTestId('story-phase')).toHaveText('CODING');
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.writes[0].body).toEqual({ expectedVersion: state.story.version });
});

test('historical evidence and other tasks cannot execute the current review', async ({ page }) => {
  const state = await fixture(page);
  state.journey.activities[0].links.push({ taskId: state.planned.id, scope: 'Escopo explicitamente atendido', completion: 'publish_code' });
  await page.goto('/tasks/journey-planned?tab=evidence');
  await actAsAdmin(page);
  await expect(page.getByText('Remover credencial fixa do código.')).toBeVisible();
  await openInteraction(page);
  await expect(interaction(page).getByText(/Esta Tarefa está explicitamente vinculada/)).toBeVisible();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toBeEnabled();
  state.journey.activities[0].links = [];
  await page.reload();
  await expect(interaction(page).getByText('Esta Tarefa não é a atividade pendente da História.')).toBeVisible();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toHaveCount(0);
  await page.goto('/tasks/journey-review?tab=evidence&attempt=attempt-old');
  await expect(page.getByText('Achado antigo preservado.')).toBeVisible();
  await openInteraction(page);
  await expect(interaction(page).getByText('Tentativa anterior, somente leitura.')).toBeVisible();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toHaveCount(0);
  await interaction(page).getByRole('button', { name: 'Ir à atividade atual', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/tasks/journey-review' && url.searchParams.get('tab') === 'planning' && url.searchParams.get('process') === 'action' && !url.searchParams.has('attempt'));
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('a lost correction confirmation can be reconciled with its original identity after the current task changes', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/tasks/journey-review?interact=action');
  await actAsAdmin(page);
  await interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true }).click();
  await interaction(page).getByRole('checkbox', { name: 'Autorizo corrigir os achados preservando o escopo aprovado.' }).check();
  state.abortNext = true;
  state.onWrite = () => { state.journey.nextAction = null; state.journey.secondaryActions = []; Object.assign(state.journey.current, { phase: 'CODING', state: 'queued', title: 'Correção autorizada; aguardando executor', taskId: state.planned.id, activityId: 'coding-activity' }); };
  await interaction(page).getByRole('button', { name: 'Confirmar: Solicitar correção à IA', exact: true }).click();
  await expect(page.getByTestId('story-phase')).toHaveText('CODING');
  await expect(interaction(page).getByText('Esta Tarefa não é a atividade pendente da História.')).toBeVisible();
  await expect(page.getByTestId('pending-command')).toContainText('Solicitar correção à IA');
  await page.reload();
  await expect(page).toHaveURL(url => url.searchParams.get('tab') === 'planning' && url.searchParams.get('process') === 'action');
  await expect(interaction(page)).toBeVisible(); await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(interaction(page).getByRole('button', { name: 'Verificar a mesma solicitação' })).toBeEnabled();
  await interaction(page).getByRole('button', { name: 'Verificar a mesma solicitação' }).click();
  await expect(page.getByTestId('pending-command')).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.writes[0].body.expectedSha).toBe(sha);
});

test('processing distinguishes screen connection, executor heartbeat and last real tool event', async ({ page }) => {
  const state = await fixture(page);
  state.journey.current.state = 'running'; state.journey.current.title = 'Aguardando resposta do modelo'; state.journey.nextAction = null; state.journey.secondaryActions = [];
  state.journey.signals.lastHeartbeatAt = '2020-01-01T12:00:00Z';
  await page.goto('/stories/journey-story?interact=processing');
  await expect(interaction(page).getByText('Relatório recebido e validado.', { exact: true }).first()).toBeVisible();
  await expect(interaction(page).getByText(/Sem confirmação recente. Último sinal/)).toBeVisible();
  await expect(interaction(page).getByText(/O sinal não comprova progresso interno/)).toBeVisible();
  await expect(interaction(page).locator('[data-testid="processing-signals"]')).not.toContainText('Pedido recebido na fila.');
  state.disconnected = true;
  await expect(page.getByTestId('story-journey-header')).toContainText('Situação atual não confirmada');
  await expect(page.getByText('A atualização da situação não chegou.')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  state.disconnected = false;
  await page.getByRole('alert').filter({hasText:'A atualização da situação não chegou.'}).getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('A atualização da situação não chegou.')).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test('planned work binding has explicit scope and a completion criterion without silently completing tasks', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/stories/journey-story?interact=administration');
  await actAsAdmin(page);
  await interaction(page).getByText('Vincular Tarefas à codificação', { exact: true }).click();
  await interaction(page).getByRole('checkbox', { name: 'Integrar serviço planejado', exact: true }).check();
  await interaction(page).getByRole('textbox', { name: 'Escopo atendido' }).fill('Implementar o contrato de consulta descrito nos critérios.');
  await interaction(page).getByRole('combobox', { name: 'Condição de conclusão' }).selectOption('publish_code');
  await interaction(page).getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].path).toBe('/api/items/journey-story/work-links');
  expect(state.writes[0].body).toEqual({ expectedVersion: state.story.version, expectedLinksVersion: 'work-links-test-v1', links: [{ taskId: state.planned.id, scope: 'Implementar o contrato de consulta descrito nos critérios.', completion: 'publish_code' }] });
  expect(state.planned.status).toBe('todo');
});

test('existing results remain readable without creating artificial process tasks', async ({ page }) => {
  const state = await fixture(page);
  state.journey.tasks = [state.planned];
  state.journey.current.taskId = null;
  state.journey.activities[0].taskId = null;
  state.journey.activities[0].legacy = true;
  await page.goto('/stories/journey-story');
  await expect(page.getByText('Remover credencial fixa do código.')).toHaveCount(0);
  await page.getByText('Code Review · Impedimento · 2 tentativa(s)', { exact: true }).click();
  await expect(page.getByText('Remover credencial fixa do código.')).toBeVisible();
  await expect(page.getByText('Achado antigo preservado.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Atividades anteriores ao vínculo de Tarefas' })).toBeVisible();
  expect(state.journey.tasks).toHaveLength(1);
  expect(state.writes).toHaveLength(0);
});

test('a binding draft keeps its original concurrency token until the user reviews a newer selection', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/stories/journey-story?interact=administration');
  await actAsAdmin(page);
  await interaction(page).getByText('Vincular Tarefas à codificação', { exact: true }).click();
  await interaction(page).getByRole('checkbox', { name: 'Integrar serviço planejado', exact: true }).check();
  const scope = interaction(page).getByRole('textbox', { name: 'Escopo atendido' });
  await scope.fill('Meu escopo permanece no rascunho.');
  state.journey.binding.expectedLinksVersion = 'work-links-test-v2';
  await expect(interaction(page).getByText('Os vínculos mudaram durante sua edição.')).toBeVisible();
  await expect(scope).toHaveValue('Meu escopo permanece no rascunho.');
  await expect(interaction(page).getByRole('button', { name: 'Salvar vínculos', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await interaction(page).getByRole('button', { name: 'Revisar vínculos atualizados', exact: true }).click();
  await expect(scope).toHaveValue('Meu escopo permanece no rascunho.');
  await interaction(page).getByRole('button', { name: 'Salvar vínculos', exact: true }).click();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.expectedLinksVersion).toBe('work-links-test-v2');
  expect(state.writes[0].body.links[0].scope).toBe('Meu escopo permanece no rascunho.');
});

test('a newer assistant conversation never replaces the canonical blocked merge attempt', async ({ page }) => {
  const state = await fixture(page);
  Object.assign(state.journey.current, { phase: 'SECURITY SCAN', kind: 'merge', label: 'Integração do código', activityId: 'merge-activity', state: 'blocked', title: 'Integração impedida; consulte o diagnóstico' });
  state.journey.activities = [{ id: 'merge-activity', kind: 'merge', label: 'Integração do código', taskId: state.review.id, currentAttemptId: 'main-merge', state: 'blocked', links: [], attempts: [{ id: 'main-merge', sourceType: 'merge', state: 'blocked', sha, summary: 'Merge impedido: aprovação obrigatória ausente.', createdAt: now, updatedAt: now, findings: [] }, { id: 'newer-conversation', sourceType: 'merge_discussion', state: 'succeeded', summary: 'A assistente respondeu à pergunta sobre a integração.', createdAt: '2026-10-23T15:10:00Z', updatedAt: '2026-10-23T15:10:00Z', findings: [] }] }];
  await page.goto('/tasks/journey-review');
  await expect(page.getByText('Merge impedido: aprovação obrigatória ausente.')).toBeVisible();
  await expect(page.getByText('A assistente respondeu à pergunta sobre a integração.')).toHaveCount(0);
  await page.goto('/tasks/journey-review?tab=evidence&attempt=newer-conversation');
  await expect(page.getByText('A assistente respondeu à pergunta sobre a integração.')).toBeVisible();
  await openInteraction(page);
  await expect(interaction(page).getByText('Tentativa anterior, somente leitura.')).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('manual task status updates preserve the active central planning section from DOING through DONE', async ({ page }) => {
  const state = await fixture(page);
  state.onWrite = (path, body) => { if (path.endsWith('/status')) { state.planned.status = body.status; state.planned.version++; } };
  await page.goto('/tasks/journey-planned?interact=administration');
  await actAsAdmin(page);
  await interaction(page).getByRole('button', { name: 'DOING', exact: true }).click();
  await expect(interaction(page).getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await interaction(page).getByRole('button', { name: 'DONE', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Ciclo da Tarefa', exact: true }).locator('[aria-current="step"]')).toHaveText('DONE');
  await expect(interaction(page).getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.writes.map(write => write.body.status)).toEqual(['doing', 'done']);
});

test('refreshing the same item preserves edit and binding drafts and the interaction section', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/stories/journey-story?interact=administration');
  await actAsAdmin(page);
  await interaction(page).getByText('Vincular Tarefas à codificação', { exact: true }).click();
  await interaction(page).getByRole('checkbox', { name: 'Integrar serviço planejado', exact: true }).check();
  await interaction(page).getByRole('textbox', { name: 'Escopo atendido' }).fill('Escopo mantido durante a atualização.');
  await page.getByTestId('edit-item').click();
  const form = page.getByRole('form', { name: 'Formulário do item' });
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Nome mantido durante a atualização');
  state.failWrite = true;
  await page.getByRole('region',{name:'Situação e próxima ação'}).getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('alert').filter({hasText:'Seu rascunho permanece disponível.'}).getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('Nome mantido durante a atualização');
  await page.getByRole('region',{name:'Situação e próxima ação'}).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(interaction(page).getByRole('button', { name: 'Vínculos', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(interaction(page).getByRole('textbox', { name: 'Escopo atendido' })).toHaveValue('Escopo mantido durante a atualização.');
});

test('desktop and mobile keep both Story and Task processes central without any interaction sidebar', async ({ page }) => {
  await fixture(page);
  await page.goto('/stories/journey-story');
  await actAsAdmin(page);
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await page.screenshot({ path: `${directory}/journey-story-desktop.png`, fullPage: true });
  await openInteraction(page);
  await page.screenshot({ path: `${directory}/journey-interaction-desktop.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(interaction(page)).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${directory}/journey-interaction-mobile.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true }).scrollIntoViewIfNeeded();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: /Recolher.*interação/ })).toHaveCount(0);
  await expect(page.getByTestId('story-journey-header')).toBeVisible();
  await page.getByRole('navigation', { name: 'Seções de História' }).getByRole('link', { name: /^Tarefas/ }).click();
  await expect(page.getByRole('heading', { name: 'Tarefas da História' })).toBeVisible();
  await page.screenshot({ path: `${directory}/journey-tasks-mobile.png`, fullPage: true });
  await page.goto('/tasks/journey-review');
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Área única de interação' })).toHaveCount(0);
  await expect(page.getByTestId('story-journey-header').getByTestId('create-item')).toHaveCount(0);
  await expect(page.getByTestId('story-journey-header').getByTestId('edit-item')).toBeVisible();
  await openInteraction(page);
  await expect(interaction(page)).toHaveAttribute('aria-label', 'Processo e decisões da Tarefa');
  await interaction(page).scrollIntoViewIfNeeded();
  await expect(interaction(page)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${directory}/task-central-process-mobile.png`, fullPage: true });
});

test('legacy Task interaction URLs normalize to central process views and survive reload without writes', async ({ page }) => {
  const state = await fixture(page);
  const cases = [
    { query: 'interact=administration', process: 'administration', button: 'Planejamento' },
    { query: 'interact=processing', process: 'processing', button: 'Processamento' },
    { query: 'tab=blockers', process: 'conversation', button: 'Conversa' },
    { query: 'tab=releases', process: 'release', button: null },
  ];
  for (const entry of cases) {
    await page.goto(`/tasks/journey-review?${entry.query}&attempts.page=2`);
    await expect(page).toHaveURL(url => url.pathname === '/tasks/journey-review' && url.searchParams.get('tab') === 'planning' && url.searchParams.get('process') === entry.process && !url.searchParams.has('interact') && url.searchParams.get('attempts.page') === '2');
    await expect(interaction(page)).toBeVisible();
    if (entry.button) await expect(interaction(page).getByRole('button', { name: entry.button, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await expect(interaction(page)).toBeVisible();
    if (entry.button) await expect(interaction(page).getByRole('button', { name: entry.button, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
    await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  }
  expect(state.writes).toEqual([]);
});
