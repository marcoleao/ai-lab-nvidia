import { test, expect, type Page } from '@playwright/test';
import {storyDeliveryReading} from '../../packages/shared/src/story-delivery';
import {storyLifecycleReading} from '../../packages/shared/src/story-lifecycle-reading';
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
    story, storyLifecycle:storyLifecycleReading({id:story.id,status:story.status,version:story.version,revision:{specification:{id:'specification-revision-4',number:4},execution:{id:'journey-run',sha,storyRecordVersion:3,state:'succeeded',stage:'completed'}},executionContext:'current'}), current: { phase: 'CODE REVIEW', state: 'blocked', kind: 'code_review', taskId: review.id, activityId: 'review-activity', title: 'Code Review encontrou achados; correção necessária', message: 'O acesso ao GitLab funcionou. O achado pertence ao código.', who: 'Responsável pela correção', updatedAt: now },
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
    if (path === `/api/items/${story.id}/development-deployment`) return route.fulfill({ json: { storyId: story.id, configured: false, operation: null, deployment: null, preparation: null, asOf: now } });
    if (path === `/api/items/${story.id}/development-test`) return route.fulfill({ json: { storyId: story.id, configured: false, operation: null, evidence: null, current: false, taskId: null, asOf: now } });
    if (path === `/api/items/${story.id}/development-approval`) return route.fulfill({ json: { storyId: story.id, approval: null, validity: { state: 'not_recorded', label: 'Sem aprovação registrada', reasons: [] }, approvalAvailable: false, asOf: now } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: { context: story, readOnly: false, messages: [], total: 0, page: 1, pageSize: 20, totalPages: 1, asOf: now } });
    if (path.endsWith('/history')) return route.fulfill({ json: { events: [], total: 0, page: 1, pageSize: 20, totalPages: 1, asOf: now } });
    if (path.endsWith('/journey')) {
      if (state.disconnected) return route.fulfill({ status: 503, json: { error: { message: 'Consulta indisponível no ensaio isolado.' } } });
      const allowed = ['admin', 'ana', 'bruno'].includes(req.headers()['x-persona']);
      const copy = structuredClone(state.journey);
      copy.permissions.canAct = allowed;
      for (const action of [copy.nextAction, ...copy.secondaryActions].filter(Boolean)) if (!allowed) { action.enabled = false; action.reason = 'Selecione uma persona autorizada para executar.'; }
      return route.fulfill({ json: copy });
    }
    if (path.endsWith('/release')) return route.fulfill({ json: { story: { ...story, projectId: 'project', projectName: 'Projeto', epicId: 'epic', epicName: 'Épico' }, assignment: null, system: { id: 'system', name: 'Sistema do ensaio' }, releases: [], truncated: false, totalChoices: 0 } });
    if (path.endsWith('/specification')) return route.fulfill({ json: { story:{id:story.id,version:story.version},content:{requirements:{objective:'Disponibilizar a consulta desta entrega.',behavior:'Receber a entrada e apresentar o resultado esperado.',functionalCriteria:['O resultado atende ao contrato confirmado.']},technical:state.journey.run.specification},revision:null,draft:null,readOnly:false,history:{items:[],page:1,pageSize:20,total:0,asOf:now} } });
    if (path.endsWith('/results')) return route.fulfill({ json: { results:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},asOf:now,readOnly:false,coverage:{source:'TaskResultRevision',legacyResultAvailable:false} } });
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

for(const [width,height] of [[1440,1000],[390,844]])test(`pre-publication interruption exposes direct technical retry and a folded diagnostic at ${width}px`,async({page})=>{
 const state=await fixture(page),summary='Não foi possível confirmar a conclusão desta tentativa de implementação. Esta tentativa não publicou alterações. Retome a correção técnica com o mesmo escopo.';
 Object.assign(state.story,{status:'coding'});Object.assign(state.journey.current,{phase:'CODING',kind:'coding',state:'failed',title:'O agente precisa retomar a implementação',message:summary});
 Object.assign(state.journey.run,{state:'failed',stage:'generation',technicalRetryAvailable:true,error:'CODING_EXECUTOR_UNKNOWN: resultado local sem confirmação; evidência preservada.',commitSha:null});
 state.journey.nextAction={id:'retry',kind:'retry',label:'Retomar correção técnica',enabled:true,path:'/api/executions/journey-run/retry',method:'POST',body:{}};state.journey.secondaryActions=[];
 state.onWrite=()=>{Object.assign(state.journey.current,{state:'queued',title:'Solicitação recebida; aguardando processamento'});state.journey.nextAction=null;Object.assign(state.journey.run,{state:'queued',technicalRetryAvailable:false,error:null});};
 await page.setViewportSize({width,height});await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);await openInteraction(page);
 const panel=interaction(page),retry=panel.getByRole('button',{name:'Retomar correção técnica',exact:true});
 await expect(retry).toBeVisible();await expect(panel.getByText(summary,{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Responder impedimento',exact:true})).toHaveCount(0);
 const diagnostic=panel.getByTestId('activity-message-details');await expect(diagnostic).not.toHaveAttribute('open','');await expect(diagnostic.getByLabel('Relato integral da atividade')).toBeHidden();expect(state.writes).toHaveLength(0);
 await diagnostic.getByText('Consultar diagnóstico técnico completo',{exact:true}).click();await expect(diagnostic.getByLabel('Relato integral da atividade')).toContainText('CODING_EXECUTOR_UNKNOWN');expect(state.writes).toHaveLength(0);
 await retry.click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0]).toMatchObject({path:'/api/executions/journey-run/retry',body:{},persona:'admin'});await expect(panel.getByText('Solicitação recebida; aguardando processamento',{exact:true})).toBeVisible();
});

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
  const phase = page.getByTestId('story-phase');
  await expect(phase).toContainText('CODE REVIEW'); await expect(phase).toBeInViewport();
  await page.screenshot({ path: `${directory}/story-central-cancel-mobile.png`, fullPage: true });
  await page.getByTestId('create-item').click();
  await expect(form.getByRole('textbox', { name: /Nome ou título/ })).toHaveValue('');
  await form.getByRole('textbox', { name: /Nome ou título/ }).fill('Tarefa criada pelo formulário central');
  await form.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Criação confirmada no mock isolado.');
  await topActions(page).getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/central-created-task$/);
  expect(state.created).toBe(1); expect(state.requests).toHaveLength(1);
  expect(state.requests[0].body).toEqual({ kind: 'task', parentId: 'journey-story', name: 'Tarefa criada pelo formulário central', description: 'Criação confirmada no mock isolado.' });
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
  const cycle = page.getByRole('list', { name: 'Ciclo da História', exact: true });
  await expect(cycle).toBeVisible();
  await expect(cycle.locator('[aria-current="step"]')).toHaveText(/CODE REVIEW/);
  const tabs = page.getByRole('navigation', { name: 'Seções de História' });
  await expect(tabs.getByRole('link')).toHaveText(['Tarefas2', 'Execução', 'Especificação', 'Conversas', 'Auditoria', 'Configurações']);
  await expect(tabs.getByRole('link', { name: 'Resumo', exact: true })).toHaveCount(0);
  await expect(tabs.getByRole('link', { name: 'Componentes', exact: true })).toHaveCount(0);
  await tabs.getByRole('link', { name: 'Execução', exact: true }).click();
  await expect(interaction(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ciclo da História', exact: true })).toHaveCount(0);
  await expect(cycle).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Excecução com Assistente de I.A.', exact: true })).toHaveCount(0);
  await expect(interaction(page).getByRole('group', { name: 'Conteúdo do processo' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Detalhes da execução' })).toBeVisible();
  await tabs.getByRole('link', { name: /^Tarefas/ }).click();
  await expect(page.getByText('Remover credencial fixa do código.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assistente IA', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('story-journey-header').getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toHaveCount(0);
  await page.getByTestId('journey-task-list').getByRole('link', { name: /Revisar código desta entrega/ }).click();
  await expect(page).toHaveURL(url => url.pathname === '/tasks/journey-review');
  await expect(cycle).toBeVisible();
  await expect(cycle.locator('[aria-current="step"]')).toHaveText(/CODE REVIEW/);
  await expect(page.getByText('Remover credencial fixa do código.')).toBeVisible();
  await actAsAdmin(page);
  await openInteraction(page);
  await expect(interaction(page)).toBeVisible();
  await expect(interaction(page).getByRole('button', { name: 'Solicitar correção à IA', exact: true })).toBeEnabled();
  await expect(page.getByTestId('story-journey-header').getByRole('button', { name: 'Abrir Code Review', exact: true })).toHaveCount(0);
  await expect(interaction(page).locator('button.primary:visible')).toHaveCount(1);
  await expect(interaction(page).getByRole('button', { name: 'Executar novamente Code Review', exact: true })).not.toBeVisible();
});

for (const width of [1440, 390]) test(`Story cycle stays visible across tabs, Task navigation and reload at ${width}px without commands`, async ({ page }) => {
  const state = await fixture(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/stories/journey-story');
  const cycle = page.getByRole('list', { name: 'Ciclo da História', exact: true });
  const current = cycle.locator('[aria-current="step"]');
  const check = async () => {
    await expect(cycle).toBeVisible();
    await expect(cycle.getByRole('listitem')).toHaveCount(10);
    await expect(cycle.getByRole('listitem').nth(5)).toHaveText('6MERGE REQUEST');
    await expect(cycle.getByText('CANCELLED', { exact: true })).toHaveCount(0);
    await expect(current).toHaveText(/CODE REVIEW/);
    await expect(current).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check();
  for (const name of ['Execução', 'Especificação', 'Conversas', 'Auditoria', 'Configurações']) {
    await page.getByRole('navigation', { name: 'Seções de História' }).getByRole('link', { name, exact: true }).click();
    await check();
  }
  await page.reload(); await check();
  await page.getByRole('navigation', { name: 'Seções de História' }).getByRole('link', { name: /^Tarefas/ }).click();
  await page.getByTestId('journey-task-list').getByRole('link', { name: /Revisar código desta entrega/ }).click();
  await expect(page).toHaveURL(url => url.pathname === '/tasks/journey-review');
  await check();
  await page.reload(); await check();
  await page.goBack(); await check();
  expect(state.writes).toEqual([]);
});

for (const phase of ['SECURITY SCAN','MERGE REQUEST', 'TESTING', 'CANCELLED']) test(`Merge Request indicator respects current journey and ${phase} without changing lifecycle`, async ({ page }) => {
  const state = await fixture(page);
  Object.assign(state.journey.current, { phase, kind: 'merge', state: phase === 'CANCELLED' ? 'cancelled' : 'waiting_human' });
  state.story.status = phase.toLowerCase().replaceAll(' ', '_');
  await page.goto('/stories/journey-story');
  const cycle = page.getByRole('list', { name: 'Ciclo da História', exact: true });
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await expect(page.getByTestId('story-phase')).toHaveText(phase);
    if (['CANCELLED','TESTING'].includes(phase)) await expect(cycle.locator('[aria-current="step"]')).toHaveCount(0);
    else await expect(cycle.locator('[aria-current="step"]')).toContainText(phase);
    if(phase==='CANCELLED')await expect(page.getByTestId('story-journey-header').locator('.sw-operation')).toHaveText('História cancelada');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(state.writes).toEqual([]);
});

for (const width of [1440,390]) test(`blocked merge explains Draft and resolution before retry in Story and Task at ${width}px`, async ({page}) => {
  const state=await fixture(page);
  Object.assign(state.journey.current,{kind:'merge',state:'blocked',title:'Integração impedida; consulte o diagnóstico',message:'O MR está em Draft.'});
  Object.assign(state.journey,{merge:{state:'blocked',blocks:[{category:'draft',message:'O MR está em Draft.'},{category:'checks',message:'Condição recusada: draft_status.'}]}});
  Object.assign(state.journey.nextAction,{id:'merge',label:'Solicitar merge ao assistente',path:'/api/executions/journey-run/merge',body:{expectedVersion:state.story.version,expectedSha:sha},confirmation:{title:'Confirmar integração',description:'Confirme a revisão atual sem remover bloqueios.',checkboxLabel:'Confirmo a integração desta revisão.'}});
  await page.setViewportSize({width,height:844});await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);
  const diagnostic=page.getByTestId('merge-impediment');
  await expect(diagnostic.getByRole('alert')).toBeVisible();await expect(diagnostic.getByRole('heading',{name:'Merge impedido',exact:true})).toBeVisible();
  await expect(diagnostic).toContainText('retirar a marcação Draft');await expect(diagnostic).toContainText('Como resolver');
  await expect(diagnostic.getByRole('link',{name:/Revisar impedimento/})).toHaveAttribute('href',state.journey.run.mergeRequestUrl);
  const retry=interaction(page).getByRole('button',{name:'Reavaliar e solicitar merge',exact:true});await expect(retry).toBeEnabled();
  expect((await diagnostic.boundingBox())!.y).toBeLessThan((await retry.boundingBox())!.y);
  expect(state.writes).toEqual([]);
  const directory=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/merge-impediment-${width}.png`,fullPage:true});
  await retry.click();await expect(interaction(page).getByRole('button',{name:'Confirmar: Solicitar merge ao assistente',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);
  await interaction(page).getByRole('button',{name:'Voltar',exact:true}).click();
  await page.goto('/tasks/journey-review?tab=planning');await expect(diagnostic).toBeVisible();await expect(diagnostic).toContainText('retirar a marcação Draft');
  state.disconnected=true;await expect(page.getByText('Situação atual não confirmada',{exact:true})).toBeVisible();await expect(diagnostic).toBeVisible();await expect(retry).toBeDisabled();
  expect(state.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('merge failure requests reconciliation without claiming a confirmed blocker; resolved state clears old diagnosis',async({page})=>{
  const state=await fixture(page);
  Object.assign(state.journey.current,{kind:'merge',state:'failed',title:'Resultado da integração precisa ser reconciliado',message:'A confirmação não chegou.'});
  await page.goto('/stories/journey-story?tab=planning');
  const diagnostic=page.getByTestId('merge-impediment');await expect(diagnostic).toContainText('Resultado do merge precisa ser verificado');await expect(diagnostic).toContainText('Reconciliar a solicitação');await expect(diagnostic.getByRole('heading',{name:'Merge impedido',exact:true})).toHaveCount(0);
  state.journey.current.state='queued';await expect(diagnostic).toHaveCount(0);expect(state.writes).toEqual([]);
});

for(const width of [1440,390]) test(`Draft is released from the assistant with separate confirmation and no merge at ${width}px`,async({page})=>{
 const state=await fixture(page);Object.assign(state.journey.current,{kind:'merge',state:'blocked',message:'Rascunho aguardando liberação.',title:'Integração impedida'});
 Object.assign(state.journey,{preparation:{eligible:true,preparation:null},merge:{state:'blocked',blocks:[{category:'draft',message:'MR em rascunho.'}]},chat:{mode:'merge',executionId:'journey-run',enabled:true}});
 const release={id:'release_draft',label:'Liberar para integração',path:'/api/executions/journey-run/merge/prepare',method:'POST',enabled:true,body:{expectedVersion:state.story.version,expectedSha:sha,confirmed:true},confirmation:{title:'Liberar para integração?',description:'Retirar Draft da revisão confirmada. Isso não faz merge nem publica em ambiente.',checkboxLabel:'Confirmo a liberação desta revisão para integração.'}};
 Object.assign(state.journey.nextAction,release);
 await page.route('**/api/executions/journey-run/merge/discussion',route=>route.fulfill({json:{version:0,turns:[],configured:true}}));
 state.onWrite=path=>{if(path.endsWith('/prepare')){Object.assign(state.journey.current,{state:'queued',title:'Liberação em andamento'});state.journey.nextAction=null as any;Object.assign(state.journey,{preparation:{eligible:false,preparation:{id:'release-ui',state:'queued',sha,message:'Liberação solicitada; aguardando confirmação.'}}});}};
 await page.setViewportSize({width,height:844});await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);
 await page.getByTestId('merge-impediment').getByRole('button',{name:'Conversar sobre impedimento do merge'}).click();
 const proposed=page.getByRole('region',{name:'Ação proposta pelo assistente'});await expect(proposed).toBeVisible();await proposed.getByRole('button',{name:'Revisar liberação para integração'}).click();
 const confirm=interaction(page).getByRole('button',{name:'Confirmar liberação',exact:true});await expect(confirm).toBeDisabled();expect(state.writes).toEqual([]);
 await interaction(page).getByRole('checkbox',{name:'Confirmo a liberação desta revisão para integração.'}).check();
 const directory=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/release-confirmation-${width}.png`,fullPage:true});
 await confirm.click();await expect(interaction(page)).toContainText('Liberação solicitada');expect(state.writes).toHaveLength(1);expect(state.writes[0]).toMatchObject({path:release.path,body:release.body,persona:'admin'});
 Object.assign(state.journey.current,{state:'tracking',message:'Draft removido · integração ainda não solicitada.'});Object.assign(state.journey,{preparation:{eligible:false,preparation:{id:'release-ui',state:'succeeded',sha,message:'Draft removido · integração ainda não solicitada.'}}});state.journey.nextAction={...release,id:'merge',label:'Solicitar merge ao assistente',path:'/api/executions/journey-run/merge'} as any;
 await expect(interaction(page).getByRole('button',{name:'Solicitar merge ao assistente',exact:true})).toBeVisible();await page.reload();await expect(interaction(page)).toContainText('Draft removido');expect(state.writes).toHaveLength(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('assistant requests architect diagnosis inside the portal and preserves specialist attribution without release writes',async({page})=>{
 const state=await fixture(page);Object.assign(state.journey.current,{kind:'merge',state:'blocked'});Object.assign(state.journey,{chat:{mode:'merge',executionId:'journey-run',enabled:true}});
 let version=0;const turns:any[]=[];const writes:any[]=[];
 await page.route('**/api/executions/journey-run/merge/discussion',async route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);version++;turns.push({id:'specialist-ui',specialist:body.specialist,input:body.message,output:'Diagnóstico e plano propostos; nenhuma alteração executada.',state:'succeeded',createdAt:now});return route.fulfill({json:{turnId:'specialist-ui'}});}return route.fulfill({json:{version,turns,configured:true}});});
 await page.goto('/stories/journey-story?tab=planning&process=conversation');await actAsAdmin(page);await page.getByRole('button',{name:'Pedir diagnóstico de arquitetura',exact:true}).click();
 await expect(page.getByRole('log',{name:'Histórico da conversa de merge'})).toContainText('Agente arquiteto');expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({specialist:'architecture',expectedVersion:0});expect(state.writes).toEqual([]);
});

test('unknown Draft release offers result verification without claiming Draft remains or requesting another release confirmation',async({page})=>{
 const state=await fixture(page);Object.assign(state.journey.current,{kind:'merge',state:'blocked'});Object.assign(state.journey,{preparation:{eligible:false,preparation:{id:'release-uncertain',state:'failed',sha,message:'A confirmação não chegou.'}}});
 Object.assign(state.journey.nextAction,{id:'release_draft',label:'Verificar resultado da liberação',path:'/api/executions/journey-run/merge/prepare',confirmation:undefined,body:{expectedVersion:state.story.version,expectedSha:sha,confirmed:true}});
 await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);await expect(interaction(page)).toContainText('Resultado da liberação precisa ser verificado');await expect(page.getByTestId('merge-impediment')).toHaveCount(0);expect(state.writes).toEqual([]);
 await interaction(page).getByRole('button',{name:'Verificar resultado da liberação',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0].path).toBe('/api/executions/journey-run/merge/prepare');await expect(interaction(page).getByRole('checkbox')).toHaveCount(0);
});

test('the Specification Gateway requires review and confirmation, and an uncertain G1 request reuses its identity after reload', async ({ page }) => {
  const state = await fixture(page);
  Object.assign(state.journey.current, { phase: 'SPECIFICATION', state: 'waiting_approval', title: 'Especificação pronta; G1 aguarda sua decisão', taskId: null });
  state.journey.nextAction = { id: 'approve', kind: 'approve', label: 'Aprovar G1 e gerar código', enabled: true, path: '/api/executions/journey-run/approve', method: 'POST', body: { expectedVersion: state.story.version }, confirmation: { title: 'Aprovar especificação G1', description: 'Confira requisitos, arquitetura e casos de teste.', checkboxLabel: 'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.' } };
  state.journey.secondaryActions = [];
  await page.goto('/stories/journey-story?tab=specification');
  await actAsAdmin(page);
  await expect(page.getByRole('region',{name:'Especificação da História',exact:true}).getByRole('region',{name:'Plano técnico consultado',exact:true}).getByText('Requisito verificável desta entrega.',{exact:true})).toBeVisible();
  const executionPlan=page.locator('details[aria-label="Plano técnico registrado na execução"]');
  await expect(executionPlan.getByRole('heading',{name:'Requisitos técnicos da execução',exact:true})).toBeHidden();
  await executionPlan.getByText('Consultar plano técnico registrado na execução',{exact:true}).click();
  await expect(executionPlan.getByText('journey-run',{exact:true})).toBeVisible();
  await expect(executionPlan.getByText('Requisito verificável desta entrega.',{exact:true})).toBeVisible();
  await openInteraction(page);
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await expect(interaction(page)).toContainText('Gateway de Especificação');
  await interaction(page).getByRole('button', { name: 'Revisar aprovação', exact: true }).click();
  const confirm = interaction(page).getByRole('button', { name: 'Aprovar e enfileirar codificação', exact: true });
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

for(const width of [1440,390])test(`stale specification presents interruption directly and preserves its confirmation and uncertain request at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const state=await fixture(page);
  state.story.status='specification';
  Object.assign(state.journey.current,{phase:'SPECIFICATION',kind:'specification',state:'stale',title:'O escopo mudou; as evidências anteriores permanecem no histórico',message:'A especificação vigente mudou. Use Interromper tentativa para encerrar esta execução antes de preparar a nova especificação. A História permanece aberta e as evidências anteriores são preservadas.',taskId:null,activityId:null});
  Object.assign(state.journey.run,{state:'waiting_approval',stage:'gate',commitSha:null});
  state.journey.nextAction={id:'cancel',kind:'cancel',label:'Interromper tentativa',enabled:true,path:'/api/executions/journey-run/cancel',method:'POST',body:{},confirmation:{title:'Interromper tentativa',description:'Interrompe esta tentativa para permitir revisão. A História permanece aberta; branches e evidências existentes são preservados.',checkboxLabel:'Confirmo a interrupção desta tentativa.'}};
  state.journey.secondaryActions=[{id:'cancel_story',kind:'cancel_story',label:'Cancelar História',enabled:true,path:'/api/items/journey-story/cancel',method:'POST',body:{expectedVersion:state.story.version}}];
  await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);
  const panel=interaction(page),primary=panel.locator('.sw-action-primary').getByRole('button',{name:'Interromper tentativa',exact:true});
  await expect(primary).toBeVisible();await expect(primary).toBeEnabled();
  await expect(panel).toContainText('Use Interromper tentativa');await expect(panel.getByText('Nenhuma ação executável disponível nesta etapa.',{exact:true})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Cancelar História',exact:true})).toBeHidden();
  await expect(panel.getByRole('button',{name:'Revisar aprovação',exact:true})).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/stale-interruption-primary-${width}.png`,fullPage:true});}
  await primary.focus();await expect(primary).toBeFocused();await page.keyboard.press('Enter');
  const confirm=panel.getByRole('button',{name:'Confirmar: Interromper tentativa',exact:true}),checkbox=panel.getByRole('checkbox',{name:'Confirmo a interrupção desta tentativa.',exact:true});
  await expect(confirm).toBeDisabled();await expect(checkbox).not.toBeChecked();expect(state.writes).toHaveLength(0);
  await panel.getByRole('button',{name:'Voltar',exact:true}).click();await expect(primary).toBeEnabled();expect(state.writes).toHaveLength(0);
  await primary.click();await checkbox.check();await expect(confirm).toBeEnabled();
  state.abortNext=true;
  state.onWrite=()=>{
    state.journey.run.state='cancelled';
    Object.assign(state.journey.current,{state:'cancelled',title:'Execução cancelada; um novo ciclo exige outro G1',message:'Prepare a nova especificação para o escopo atual. As evidências anteriores permanecem no histórico.'});
    state.journey.nextAction={id:'replan',kind:'replan',label:'Preparar nova especificação',enabled:true,path:'/api/executions/journey-run/replan',method:'POST',body:{expectedVersion:state.story.version,confirmed:true},confirmation:{title:'Iniciar outro ciclo de especificação',description:'O escopo atual será analisado novamente e exigirá novo G1.',checkboxLabel:'Confirmo outro ciclo de especificação e um novo G1 para o escopo atual.'}};
  };
  await confirm.click();await expect(page.getByTestId('pending-command')).toContainText('Interromper tentativa');
  await page.reload();await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');
  const verify=panel.getByRole('button',{name:'Verificar a mesma solicitação',exact:true});
  await expect(verify).toBeDisabled();await actAsAdmin(page);await expect(verify).toBeEnabled();await verify.click();
  await expect(page.getByTestId('pending-command')).toHaveCount(0);
  await expect(panel.locator('.sw-action-primary').getByRole('button',{name:'Preparar nova especificação',exact:true})).toBeEnabled();
  await expect(panel.getByRole('button',{name:'Revisar aprovação',exact:true})).toHaveCount(0);
  const operation=page.getByTestId('story-journey-header').locator('.sw-operation');
  await expect(page.getByTestId('story-phase')).toHaveText('SPECIFICATION');await expect(operation).toHaveText('Tentativa interrompida');
  await page.reload();await expect(operation).toHaveText('Tentativa interrompida');await expect(page.getByTestId('story-phase')).toHaveText('SPECIFICATION');
  state.disconnected=true;await expect(operation).toHaveText('Situação atual não confirmada');
  state.disconnected=false;await page.getByRole('alert').filter({hasText:'A atualização da situação não chegou.'}).getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(operation).toHaveText('Tentativa interrompida');
  expect(state.writes).toHaveLength(2);expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.writes[0]).toMatchObject({path:'/api/executions/journey-run/cancel',body:{},persona:'admin'});
  expect(state.writes.every(write=>write.path==='/api/executions/journey-run/cancel')).toBe(true);
  expect(state.story.status).toBe('specification');
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
  state.onWrite = (path, body) => { if (path.endsWith('/status')) { state.planned.status = body.status; state.planned.version++; if(body.result)state.planned.data={taskResult:{summary:body.result,evidence:body.evidence}}; } };
  await page.goto('/tasks/journey-planned?interact=administration');
  await actAsAdmin(page);
  await interaction(page).getByRole('button', { name: 'DOING', exact: true }).click();
  await expect(interaction(page).getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const done=interaction(page).getByRole('button', { name: 'DONE', exact: true });await expect(done).toBeDisabled();
  await interaction(page).getByRole('textbox',{name:/^Resultado do trabalho/}).fill('Integração concluída e contrato conferido.');
  await interaction(page).getByRole('textbox',{name:/^Evidências ou referências/}).fill('http://gitlab/test/-/merge_requests/11');
  await done.click();
  await expect(page.getByRole('region', { name: 'Ciclo da Tarefa', exact: true }).locator('[aria-current="step"]')).toHaveText('DONE');
  await expect(interaction(page).getByRole('button', { name: 'Planejamento', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(state.writes.map(write => write.body.status)).toEqual(['doing', 'done']);
  expect(state.writes[1].body).toEqual({status:'done',expectedVersion:4,result:'Integração concluída e contrato conferido.',evidence:['http://gitlab/test/-/merge_requests/11']});
  expect(state.planned.data).toEqual({taskResult:{summary:'Integração concluída e contrato conferido.',evidence:['http://gitlab/test/-/merge_requests/11']}});
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
  await expect(page).toHaveURL(url => url.searchParams.get('tab') === 'planning' && url.searchParams.get('process') === 'administration');
  await expect(interaction(page).getByRole('heading', { name: 'Escopo das Tarefas', exact: true })).toBeVisible();
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

for (const width of [1440,390]) test(`delivery destinations separate DEV from immutable release and retain current phase at ${width}px`,async({page})=>{
 const state=await fixture(page);state.story.status='merge_request';Object.assign(state.journey.current,{phase:'MERGE REQUEST',kind:'merge',state:'succeeded'});
 state.journey.delivery=storyDeliveryReading({status:'merge_request',mergeConfirmed:true,release:null});
 await page.setViewportSize({width,height:844});await page.goto('/stories/journey-story?taskFilter=planned&taskSearch=servico');await actAsAdmin(page);
 const cycle=page.getByRole('list',{name:'Ciclo da História',exact:true});
 await expect(cycle.getByRole('listitem').nth(6)).toContainText('DEV');await expect(cycle.getByRole('listitem').nth(9)).toContainText('PROD');
 await expect(cycle.locator('[aria-current="step"]')).toContainText('MERGE REQUEST');
 await expect(cycle.locator('[data-state="previous"].sw-destination')).toHaveCount(0);
 await cycle.getByRole('button',{name:/Consultar DEV/}).click();
 const detail=page.getByTestId('story-environment-detail');await expect(detail).toContainText('sem associação a uma release');await expect(detail).toContainText('A História pode seguir com publicação e testes em DEV');
 await expect(detail.getByRole('button',{name:'Escolher release'})).toHaveCount(0);await expect(interaction(page)).toBeHidden();
 const destinationScreens=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(destinationScreens,{recursive:true});await page.screenshot({path:`${destinationScreens}/story-dev-${width}.png`,fullPage:true});
 await expect(page).toHaveURL(/process=environment/);expect(new URL(page.url()).searchParams.get('taskSearch')).toBe('servico');
 await cycle.getByRole('button',{name:/Consultar QA/}).click();await expect(detail).toContainText('História ainda sem release associada');await expect(detail).toContainText('Todas as Histórias');await expect(detail).toContainText('pacote imutável');
 await expect(cycle.locator('[aria-current="step"]')).toContainText('MERGE REQUEST');await expect(cycle.getByRole('button',{name:/Consultar QA/})).toHaveAttribute('aria-pressed','true');
 await detail.getByRole('button',{name:'Escolher release',exact:true}).click();await expect(page).toHaveURL(/returnEnvironment=QA/);
 await page.getByRole('button',{name:'Voltar à consulta de QA',exact:true}).click();await expect(detail).toBeVisible();
 await page.reload();await expect(detail).toContainText('História ainda sem release associada');
 const directory=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/story-qa-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(state.writes).toEqual([]);
});

test('Task destination consultation preserves historical attempt, current journey and read-only context',async({page})=>{
 const state=await fixture(page);state.journey.delivery=storyDeliveryReading({status:'code_review',release:null});
 await page.goto('/tasks/journey-review?tab=planning&process=environment&environment=PROD&attempt=attempt-old&returnTo=%2Fstories%2Fjourney-story%3Ftab%3Dtasks%26taskSearch%3Dservico');
 const detail=page.getByTestId('story-environment-detail');await expect(detail).toContainText('PROD');await expect(detail).toContainText('preserva a tentativa');await expect(detail.getByRole('button',{name:'Voltar à atividade consultada',exact:true})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Escolher release'})).toHaveCount(0);await expect(page.getByRole('list',{name:'Ciclo da História',exact:true}).locator('[aria-current="step"]')).toContainText('CODE REVIEW');
 await page.getByRole('button',{name:/Consultar DEV/}).click();expect(new URL(page.url()).searchParams.get('attempt')).toBe('attempt-old');
 const parent=detail.getByRole('link',{name:/Consultar entrega na História/});expect(new URL(await parent.getAttribute('href')??'',page.url()).searchParams.getAll('tab')).toEqual(['planning']);
 await parent.click();await expect(page).toHaveURL(/stories\/journey-story/);expect(new URL(page.url()).searchParams.get('taskSearch')).toBe('servico');expect(state.writes).toEqual([]);
});


test('destination keyboard consultation keeps unsaved release choice separate from confirmed association across tabs',async({page})=>{
 const state=await fixture(page);state.journey.delivery=storyDeliveryReading({status:'code_review',release:null});
 await page.route('**/api/items/journey-story/release',route=>route.fulfill({json:{story:{...state.story},assignment:null,system:{id:'system',name:'Sistema isolado'},releases:[{id:'pending-release',key:'R-P',name:'Escolha pendente',version:1,compositionStatus:'OPEN'}],truncated:false,totalChoices:1}}));
 await page.goto('/stories/journey-story');await actAsAdmin(page);
 const qa=page.getByRole('button',{name:/Consultar QA/});await qa.focus();await qa.press('Enter');
 const detail=page.getByTestId('story-environment-detail');await expect(detail).toBeFocused();await detail.getByRole('button',{name:'Escolher release',exact:true}).click();
 const choice=page.getByRole('combobox',{name:'Release planejada',exact:true});await choice.selectOption('pending-release');
 await page.getByRole('button',{name:'Voltar à consulta de QA',exact:true}).click();await expect(detail).toContainText('História ainda sem release associada');await expect(detail).not.toContainText('Escolha pendente');
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:/Tarefas/}).click();
 await qa.click();await detail.getByRole('button',{name:'Escolher release',exact:true}).click();await expect(choice).toHaveValue('pending-release');
 expect(state.writes).toEqual([]);
});

test('RA-03 keeps development and completion separate with revision details collapsed',async({page})=>{
 const state=await fixture(page);await page.goto('/stories/journey-story');
 const reading=page.getByTestId('story-lifecycle-status');
 await expect(reading).toContainText('Sem aprovação registrada');await expect(reading).toContainText('Aberta; depende da entrada em produção');
 await expect(reading.locator('details')).not.toHaveAttribute('open','');await expect(reading.getByText(sha,{exact:true})).not.toBeVisible();
 await reading.getByText('Consultar revisão e evidências',{exact:true}).click();await expect(reading).toContainText('Revisão 4');await expect(reading.getByText(sha,{exact:true})).toBeVisible();
 await expect(reading).toContainText('não representa aprovação do conteúdo');
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true}).click();
 await expect(reading.locator('details')).toHaveAttribute('open','');await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
 await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/tmp'}/ra03-story-desktop.png`,fullPage:true});
 expect(state.writes).toHaveLength(0);
});

test('RA-03 Task DONE and historical evidence keep the current parent Story reading on mobile',async({page})=>{
 const state=await fixture(page);state.review.status='done';await page.setViewportSize({width:390,height:844});
 await page.goto('/tasks/journey-review?tab=evidence&attempt=attempt-old');const reading=page.getByTestId('story-lifecycle-status');
 await expect(reading).toContainText('Situação da História · independente da tentativa consultada');
 await expect(reading).toContainText('Sem aprovação registrada');
 await reading.getByText('Consultar revisão e evidências',{exact:true}).click();await expect(reading.getByText(sha,{exact:true})).toBeVisible();
 await expect(reading.getByText(oldSha,{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/tmp'}/ra03-task-mobile.png`,fullPage:true});expect(state.writes).toHaveLength(0);
});

test('RA-03 missing references and lost refresh retain uncertainty without approving or reopening legacy completion',async({page})=>{
 const state=await fixture(page);state.journey.storyLifecycle=storyLifecycleReading({id:state.story.id,status:'completed',version:9,revision:{specification:null,execution:null}});
 state.story.status='completed';state.journey.current.phase='COMPLETED';await page.goto('/stories/journey-story');const reading=page.getByTestId('story-lifecycle-status');
 await expect(reading).toContainText('Conclusão registrada; produção não confirmada');await reading.getByText('Consultar revisão e evidências',{exact:true}).click();
 await expect(reading).toContainText('Ainda não registrada.');await expect(reading).toContainText('Execução ainda não registrada.');
 state.disconnected=true;await expect(reading).toContainText('Última leitura preservada; situação atual não confirmada.',{timeout:10000});
 await expect(reading).toContainText('Sem aprovação registrada');await expect(page.getByTestId('story-phase')).toHaveText('COMPLETED');expect(state.writes).toHaveLength(0);
});

test('RA-03 collection keeps phase primary and the same reading as Story details',async({page})=>{
 const state=await fixture(page);state.story.status='merge_request';
 state.journey.storyLifecycle=storyLifecycleReading({id:state.story.id,status:state.story.status,version:3,revision:{specification:null,execution:null}});
 const epic={...item('ra03-epic','epic','Épico do ensaio RA-03','active')};
 await page.route(url=>url.pathname==='/api/items/ra03-epic',route=>route.fulfill({json:{item:epic,ancestors:[],children:[state.story],repositories:[],availableRepositories:[],environments:[],history:[]}}));
 await page.route(url=>url.pathname==='/api/collections/items',route=>route.fulfill({json:{items:[{...state.story,storyLifecycle:state.journey.storyLifecycle}],page:1,total:1,totalPages:1,pageSize:20,extraCount:0}}));
 await page.goto('/epics/ra03-epic');const row=page.getByRole('row').filter({has:page.getByRole('link',{name:/Entrega na nova navegação/})});
 await expect(row.locator('.badge')).toHaveText('MERGE REQUEST');await expect(row.getByTestId('story-lifecycle-status')).toContainText('Sem aprovação registrada');
 await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/tmp'}/ra03-list-desktop.png`,fullPage:true});
 await row.getByRole('link',{name:/Entrega na nova navegação/}).click();await expect(page.getByTestId('story-lifecycle-status')).toContainText('Aberta; depende da entrada em produção');expect(state.writes).toHaveLength(0);
});

for(const width of [1440,390])test(`successful Draft release is a stage record instead of an outdated integration claim at ${width}px`,async({page})=>{
 const state=await fixture(page),releaseMessage='Draft removido · integração ainda não solicitada. Solicite o merge na atividade.';
 Object.assign(state.journey.current,{phase:'MERGE REQUEST',kind:'merge',state:'succeeded',title:'Código integrado',message:'Integração da revisão corrente confirmada.'});Object.assign(state.journey,{merge:{state:'succeeded',sha,blocks:[]},preparation:{eligible:false,preparation:{id:'release-record-ui',state:'succeeded',sha,message:releaseMessage}},nextAction:{id:'development_build',label:'Preparar versão DEV',href:'/stories/journey-story?tab=planning&process=environment&environment=DEV',enabled:true},secondaryActions:[]});
 await page.setViewportSize({width,height:1000});await page.goto('/stories/journey-story?tab=planning');await actAsAdmin(page);const workPanel=await openInteraction(page),record=workPanel.getByTestId('draft-release-record');await expect(record.getByRole('status')).toContainText('A integração da revisão atual já foi confirmada');await expect(record.getByText(releaseMessage,{exact:true})).not.toBeVisible();await expect(workPanel.getByRole('button',{name:'Preparar versão DEV',exact:true})).toBeEnabled();
 if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/integrated-draft-record-${width}.png`,fullPage:true});}
 await record.locator('summary').focus();await page.keyboard.press('Enter');await expect(record.getByText(releaseMessage,{exact:true})).toBeVisible();await expect(record).toContainText('Mensagem registrada na etapa de liberação');await expect(record).toContainText('release-record-ui');await expect(record).toContainText(sha);await record.locator('summary').click();expect(state.writes).toEqual([]);
 state.journey.merge.sha=oldSha;await expect(record.getByRole('status')).toContainText('Acompanhe a integração pela situação atual');await expect(record.getByRole('status')).not.toContainText('já foi confirmada');state.journey.merge.sha=sha;state.journey.current.state='failed';state.journey.current.title='Resultado atual da integração não confirmado';await expect(record.getByRole('status')).not.toContainText('já foi confirmada');
 state.journey.preparation.preparation.state='unknown';state.journey.preparation.preparation.message='O resultado da liberação ainda precisa ser verificado; consulte a mesma operação.';await expect(record).toHaveCount(0);await expect(workPanel).toContainText(state.journey.preparation.preparation.message);expect(state.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
