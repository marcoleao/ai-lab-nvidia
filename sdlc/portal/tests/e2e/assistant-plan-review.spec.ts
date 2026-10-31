import { test, expect, type Page, type Dialog } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pipelineTasks } from '../../packages/shared/src/pipeline-plan';
import { assistantMessagePage } from './assistant-fixtures';
import type { ChatTurn } from '../../apps/web/app/assistant-chat';

if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Assistant proposal fixtures require the isolated test environment');
const now = '2026-10-25T15:00:00Z';
const requirements = { version: 1, objective: 'Consultar o resultado das solicitações do próprio usuário.', behavior: 'O usuário informa o protocolo e consulta sua situação.', actors: ['Solicitante'], inputs: [], outputs: [], businessRules: ['Exibir apenas solicitações do próprio usuário.'], functionalCriteria: ['Consultar o protocolo e a situação.'], technicalCriteria: ['Validar o vínculo do usuário.'], dependencies: [{ description: 'Serviço de consulta.', kind: 'external', status: 'confirmed', impact: 'informative' }], exceptions: [], nonFunctional: [], assumptions: [], outOfScope: [], openQuestions: [] };
const story = (title: string) => ({ title, description: 'Consultar o protocolo e a situação da solicitação.', repositoryIds: ['repo-a'], acceptanceCriteria: [...requirements.functionalCriteria], requirements: structuredClone(requirements), tasks: [] as any[] });
type Write = { method: string; path: string; key: string; persona: string; body: any };

async function fixture(page: Page) {
  const system = { id: 'proposal-system', kind: 'system', parentId: null, key: 'SYSTEM', name: 'Sistema do ensaio', status: 'active', version: 1, archived: false, description: '', data: {}, createdAt: now, updatedAt: now };
  const project = { ...system, id: 'proposal-project', kind: 'project', parentId: system.id, key: 'PROJET', name: 'Projeto do ensaio', projectLifecycle: 'active' };
  const initialStory = story('Consultar uma solicitação');
  initialStory.tasks = [{ title: 'Codificar a consulta', description: 'Implementar a consulta aprovada.', repositoryIds: ['repo-a'], pipelineStage: 'coding' }, { title: 'Documentar o contrato', description: 'Registrar o contrato da consulta.', repositoryIds: ['repo-a'] }];
  const state = { proposal: { id: 'proposal-review', turnId: 'previous-plan-generation', version: 1, projectVersion: 1, sessionVersion: 1, status: 'draft', content: { summary: 'Consulta de solicitações.', epics: [{ title: 'Consulta', description: 'Consulta pelo solicitante.', stories: [initialStory] }] }, appliedItemIds: [] as string[], creationReceipt: null as any, createdAt: now }, writes: [] as Write[], abortPatch: false, abortApply: false, abortPlan: false, readOnly: false, latestTurn: null as ChatTurn | null, activeTurn: null as ChatTurn | null, questions: [] as string[], historicalProposals: [] as any[] };
  const turns = [{ id: 'proposal-interview', sequence: 1, kind: 'chat', input: 'Quero consultar solicitações.', output: 'Requisitos confirmados.', status: 'succeeded', model: null, error: null, actorName: 'Admin', createdAt: now }];
  const receipts = new Map<string, unknown>();
  const personas = [{ id: 'admin', name: 'Admin', role: 'admin' }, { id: 'ana', name: 'Ana', role: 'product_owner' }, { id: 'bruno', name: 'Bruno', role: 'architect' }, { id: 'carla', name: 'Carla', role: 'qa_lead' }];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') {
      const write = { method: request.method(), path: url.pathname, key: request.headers()['idempotency-key'], persona: request.headers()['x-persona'], body: request.postDataJSON() };
      state.writes.push(write);
      if (receipts.has(write.key)) return route.fulfill({ json: receipts.get(write.key) });
      if (write.method === 'POST' && url.pathname === '/api/assistant/plans') {
        state.latestTurn = { id: 'retried-plan-generation', sequence: 3, kind: 'plan', input: 'Gerar proposta para revisão.', output: null, status: 'queued', model: null, error: null, actorName: 'Admin', createdAt: '2026-10-25T15:02:00Z' };
        state.activeTurn = state.latestTurn;
        const receipt = { turn: structuredClone(state.latestTurn) }; receipts.set(write.key, receipt);
        if (state.abortPlan) { state.abortPlan = false; return route.abort(); }
        return route.fulfill({ json: receipt });
      }
      if (write.method === 'PATCH' && url.pathname === '/api/assistant/plans/proposal-review') {
        if (write.body.expectedVersion !== state.proposal.version) return route.fulfill({ status: 409, json: { error: { message: 'A proposta foi alterada.' } } });
        state.proposal.content = write.body.content; state.proposal.version++;
        const receipt = { proposal: structuredClone(state.proposal) }; receipts.set(write.key, receipt);
        if (state.abortPatch) { state.abortPatch = false; return route.abort(); }
        return route.fulfill({ json: receipt });
      }
      if (write.method === 'POST' && url.pathname === '/api/assistant/plans/proposal-review/apply') {
        const items: any[] = [];
        const add = (kind: string, name: string, parentId: string) => { const id = `created-${items.length + 1}`; items.push({ id, kind, name, parentId, key: `KEY-${items.length + 1}`, status: kind === 'epic' ? 'active' : kind === 'story' ? 'specification' : 'todo', archived: false }); return id; };
        for (const epic of state.proposal.content.epics) {
          const epicId = add('epic', epic.title, project.id);
          for (const entry of epic.stories) {
            const storyId = add('story', entry.title, epicId);
            for (const task of pipelineTasks) add('task', entry.tasks.find(detail => detail.pipelineStage === task.stage)?.title || task.name, storyId);
            for (const task of entry.tasks.filter(detail => !detail.pipelineStage)) add('task', task.title, storyId);
          }
        }
        state.proposal.status = 'applied'; state.proposal.appliedItemIds = items.map(item => item.id);
        state.proposal.creationReceipt = { itemIds: [...state.proposal.appliedItemIds], items, totals: { epics: 1, stories: 1, tasks: 7, total: 9 }, coverage: { expected: items.length, available: items.length, complete: true } };
        const receipt = { proposal: structuredClone(state.proposal), itemIds: state.proposal.appliedItemIds, creationReceipt: state.proposal.creationReceipt }; receipts.set(write.key, receipt);
        if (state.abortApply) { state.abortApply = false; return route.abort(); }
        return route.fulfill({ json: receipt });
      }
      return route.fulfill({ status: 400, json: { error: { message: 'Comando não previsto na fixture.' } } });
    }
    if (url.pathname === '/api/personas') return route.fulfill({ json: { personas } });
    if (url.pathname === '/api/items') return route.fulfill({ json: { items: [system] } });
    if (url.pathname === '/api/collections/items') {
      const items = url.searchParams.get('kind') === 'system' ? [system] : [project];
      return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 20, totalPages: 1, extraCount: 0 } });
    }
    if (url.pathname === '/api/assistant/messages') return route.fulfill({ json: { contextId: project.id, ...assistantMessagePage(turns, url.searchParams), readOnly: state.readOnly, readOnlyReason: state.readOnly ? 'O Projeto está INACTIVE.' : null } });
    if (url.pathname === '/api/assistant') return route.fulfill({ json: {
      context: state.readOnly ? { ...project, status: 'inactive', projectLifecycle: 'inactive' } : project, session: { id: 'proposal-session', version: 1 }, turns, latestTurn: state.latestTurn ?? turns.at(-1), proposals: [state.proposal, ...state.historicalProposals], currentProposal: state.proposal,
      activeTurn: state.activeTurn, hasSuccessfulInterview: true, configured: true, requirementsMode: true, readOnly: state.readOnly, readOnlyReason: state.readOnly ? 'O Projeto está INACTIVE.' : null,
      hierarchy: { writable: !state.readOnly, reason: state.readOnly ? 'O Projeto está INACTIVE.' : null, blockedBy: state.readOnly ? project.id : null }, capabilities: { canEditPlan: !state.readOnly, canApplyPlan: !state.readOnly, canChat: !state.readOnly, canGeneratePlan: !state.readOnly, canCompleteInterview: !state.readOnly },
      availableRepositories: [{ id: 'repo-a', key: 'API', name: 'API de consulta' }], brief: { summary: 'Consulta pelo solicitante.', confirmedFacts: ['Consultar somente solicitações próprias.'], openQuestions: state.questions },
      turnsPage: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasMore: false }, proposalsPage: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasMore: false }
    } });
    const item = url.pathname === `/api/items/${system.id}` ? system : url.pathname === `/api/items/${project.id}` ? project : null;
    if (item) return route.fulfill({ json: { item, children: item.kind === 'system' ? [project] : [], ancestors: item.kind === 'project' ? [system] : [], repositories: [], availableRepositories: [], environments: [], history: [], hierarchy: { writable: !state.readOnly }, capabilities: { canMutate: !state.readOnly } } });
    return route.fulfill({ json: {} });
  });
  return state;
}
async function open(page: Page, persona = 'admin') {
  await page.goto('/assistant?system=proposal-system&project=proposal-project');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption(persona);
  await page.getByRole('button', { name: /^Proposta/ }).click();
  return page.getByRole('region', { name: 'Revisão do plano' }).first();
}
async function reload(page: Page) {
  const persona = await page.getByRole('combobox', { name: /Persona/ }).inputValue();
  const acceptReload = async (dialog: Dialog) => { expect(dialog.type()).toBe('beforeunload'); await dialog.accept(); };
  page.on('dialog', acceptReload);
  try {
    await page.reload();
    await expect(page.getByRole('combobox', { name: /Persona/ })).toHaveValue(persona);
    await expect(page.getByRole('region', { name: 'Revisão do plano' }).first()).toBeVisible();
  } finally { page.off('dialog', acceptReload); }
}

for (const width of [1440, 390]) test(`proposal shows the latest generation failure separately from the applied receipt and preserves retry identity at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await fixture(page);
  state.proposal.status = 'applied'; state.proposal.appliedItemIds = ['previous-epic', 'previous-story'];
  state.latestTurn = { id: 'failed-plan-generation', sequence: 2, kind: 'plan', input: 'Gerar outra proposta para revisão.', output: null, status: 'running', error: null, model: null, actorName: 'Admin', createdAt: '2026-10-25T15:01:00Z' };
  state.activeTurn = state.latestTurn;
  await page.addInitScript(() => sessionStorage.setItem('sdlc-assistant-workspace:proposal-project', JSON.stringify({ version: 1, contextId: 'proposal-project', view: 'proposal', drafts: { admin: 'Rascunho para esclarecer a nova proposta.' }, pending: null })));
  await page.goto('/assistant?system=proposal-system&project=proposal-project&assistant.view=proposal&assistant.page=2&assistant.before=2');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const panel = page.getByRole('region', { name: 'Proposta do contexto', exact: true });
  const notice = panel.getByRole('region', { name: 'Falha da nova geração de proposta', exact: true });
  await expect(page.getByText('RUNNING · gerando resposta', { exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  state.latestTurn = { ...state.latestTurn, status: 'failed', error: 'A proposta não cobre os fatos confirmados. Revise os vínculos antes de tentar novamente.', output: '{"privateCandidate":"CANDIDATA_PRIVADA_NAO_VALIDADA"}', updatedAt: '2026-10-25T15:01:30Z' }; state.activeTurn = null;
  await expect(notice.getByRole('alert')).toContainText('Não foi possível gerar a nova proposta.');
  await expect(notice).toContainText(state.latestTurn.error!);
  await expect(notice).toContainText('A proposta já aplicada foi preservada.');
  await expect(notice).toContainText('failed-plan-generation');
  await expect(panel.locator('.assistant-proposal-source')).toContainText('Aplicada');
  await expect(panel.getByText('Plano aplicado', { exact: true })).toBeVisible();
  await expect(panel).not.toContainText('CANDIDATA_PRIVADA_NAO_VALIDADA');
  expect(state.writes).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.SCREENSHOT_DIR) { mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/assistant-failed-new-proposal-${width}.png`, fullPage: true }); }
  const conversationAction = notice.getByRole('button', { name: 'Revisar falha na conversa', exact: true });
  await conversationAction.focus(); await expect(conversationAction).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#assistant-panel-conversation')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('assistant.before')).toBeNull();
  expect(new URL(page.url()).searchParams.get('assistant.page')).toBe('1');
  await expect(page.getByRole('textbox', { name: 'Sua mensagem', exact: true })).toHaveValue('Rascunho para esclarecer a nova proposta.');
  await page.getByRole('button', { name: /^Proposta/ }).click();
  state.abortPlan = true;
  await notice.getByRole('button', { name: 'Gerar nova proposta para revisão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar geração do plano', exact: true })).toBeEnabled();
  await expect(notice.getByRole('button', { name: 'Gerar nova proposta para revisão', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar geração do plano', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar geração do plano', exact: true })).toHaveCount(0);
  expect(state.writes).toHaveLength(2); expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.writes[0]).toMatchObject({ method: 'POST', path: '/api/assistant/plans', persona: 'admin', body: { contextId: 'proposal-project', expectedVersion: 1, requirementsMode: true } });
  expect(state.proposal.status).toBe('applied'); expect(state.proposal.appliedItemIds).toEqual(['previous-epic', 'previous-story']);
});

test('proposal failure uses current request correlation, not a late update or historical proposal date, and respects generation prerequisites', async ({ page }) => {
  const state = await fixture(page);
  state.latestTurn = { id: 'failed-plan-generation', sequence: 2, kind: 'plan', input: 'Gerar outra proposta para revisão.', output: '{"privateCandidate":"CANDIDATA_PRIVADA_NAO_VALIDADA"}', status: 'failed', error: 'A geração da nova proposta falhou.', model: null, actorName: 'Admin', createdAt: '2026-10-25T15:01:00Z', updatedAt: '2026-10-25T15:03:00Z' };
  state.historicalProposals = [{ ...structuredClone(state.proposal), id: 'historical-proposal', turnId: 'historical-generation', content: { ...structuredClone(state.proposal.content), summary: 'Proposta histórica preservada.' } }];
  state.questions = ['Qual perfil pode consultar o protocolo?'];
  await page.goto('/assistant?system=proposal-system&project=proposal-project&assistant.view=proposal&assistant.proposal=historical-proposal');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const panel = page.getByRole('region', { name: 'Proposta do contexto', exact: true }), notice = panel.getByRole('region', { name: 'Falha da nova geração de proposta', exact: true });
  await expect(notice).toContainText('Este aviso descreve a situação atual do contexto');
  await expect(notice.getByRole('button', { name: 'Gerar nova proposta para revisão', exact: true })).toBeDisabled();
  await expect(panel).not.toContainText('CANDIDATA_PRIVADA_NAO_VALIDADA');
  state.questions = []; state.proposal.createdAt = '2026-10-25T15:02:00Z'; state.proposal.turnId = 'new-successful-plan';
  await reload(page);
  await expect(notice).toHaveCount(0); // Failure updated later, but its request preceded the current proposal.
  await expect(panel.getByRole('button', { name: 'Gerar nova proposta para revisão', exact: true })).toBeEnabled();
  state.proposal.createdAt = now; state.proposal.turnId = state.latestTurn.id;
  await reload(page); await expect(notice).toHaveCount(0); // Never label the result of the same turn as a different failed generation.
  state.proposal.turnId = 'previous-plan-generation'; state.latestTurn = { ...state.latestTurn, id: 'later-chat-failure', kind: 'chat', createdAt: '2026-10-25T15:04:00Z' };
  await reload(page); await expect(notice).toHaveCount(0); // A failed interview is not a failed proposal generation.
  expect(state.writes).toHaveLength(0);
});

test('proposal counts the six fixed stages, preserves stage identity and focuses one Story at a time', async ({ page }) => {
  const state = await fixture(page), review = await open(page, 'bruno');
  await expect(review.getByRole('region',{name:'Recorte da entrega',exact:true})).toContainText('Proponha uma capacidade que possa ser verificada de ponta a ponta');
  await expect(review.locator('.plan-destination')).toContainText('1 épico(s) → 1 história(s) → 7 tarefa(s)');
  await expect(review.getByText('9/30 itens', { exact: false })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Conferir criação dos itens' })).toBeEnabled();
  const pipeline = review.getByRole('region', { name: 'Tarefas padrão do pipeline' });
  await expect(pipeline.locator('summary')).toHaveCount(6);
  await pipeline.getByText('Codificação', { exact: false }).first().click();
  await pipeline.getByRole('textbox', { name: 'Título da tarefa' }).fill('Implementar consulta autenticada');
  await review.getByRole('button', { name: 'Adicionar história ao Épico 1' }).click();
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveCount(1);
  await review.getByRole('textbox', { name: 'Título da história' }).fill('Consultar falha de protocolo');
  await review.getByRole('textbox', { name: 'Critério 1', exact: true }).fill('Protocolo inexistente apresenta uma orientação.');
  await expect(review.locator('.plan-destination')).toContainText('1 épico(s) → 2 história(s) → 13 tarefa(s)');
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].persona).toBe('bruno');
  const stories = state.writes[0].body.content.epics[0].stories;
  expect(stories[0].tasks[0]).toMatchObject({ title: 'Implementar consulta autenticada', pipelineStage: 'coding' });
  expect(stories[0].requirements.dependencies).toEqual(requirements.dependencies);
  expect(stories[1].tasks).toEqual([]);
  expect(stories[1].deliverySlice).toBeUndefined();
  await expect(review.getByRole('button', { name: 'Conferir criação dos itens' })).toBeEnabled();
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/assistant-proposal-${width}.png`, fullPage: true });
  }
});

test('proposal uses materialized item limits while detailing a fixed stage consumes no extra item', async ({ page }) => {
  const state = await fixture(page);
  state.proposal.content.epics[0].stories = [story('Primeira História'), story('Segunda História'), story('Terceira História')];
  const review = await open(page);
  await expect(review.getByText('22/30 itens', { exact: false })).toBeVisible();
  await review.getByRole('button', { name: 'Adicionar épico', exact: true }).click();
  await expect(review.getByText('30/30 itens', { exact: false })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Adicionar épico', exact: true })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Adicionar história ao Épico 2' })).toBeDisabled();
  await expect(review.getByRole('button', { name: 'Adicionar tarefa adicional' })).toBeDisabled();
  const pipeline = review.getByRole('region', { name: 'Tarefas padrão do pipeline' });
  await pipeline.locator('summary').first().click();
  await pipeline.getByRole('button', { name: 'Detalhar Codificação', exact: true }).click();
  await expect(review.getByText('30/30 itens', { exact: false })).toBeVisible();
  await expect(pipeline.locator('summary')).toHaveCount(6);
  await pipeline.getByRole('button', { name: 'Restaurar planejamento padrão de Codificação', exact: true }).click();
  await expect(pipeline.locator('summary')).toHaveCount(6);
  await expect(review.getByText('30/30 itens', { exact: false })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('proposal edits preserve the complete specification, criteria contract and dependency meaning', async ({ page }) => {
  const state = await fixture(page), review = await open(page);
  await review.getByRole('textbox', { name: 'Comportamento esperado', exact: true }).fill('Consultar a solicitação e orientar quando o protocolo não existir.');
  await review.getByText('Detalhamento complementar', { exact: true }).click();
  await review.getByRole('textbox', { name: /Regras de negócio/ }).fill('Consultar apenas as próprias solicitações.\nRegistrar o protocolo da consulta.');
  const dependency = review.getByRole('group', { name: 'Dependência 1', exact: true });
  await dependency.getByRole('combobox', { name: 'Situação', exact: true }).selectOption('pending');
  await dependency.getByRole('combobox', { name: 'Efeito', exact: true }).selectOption('blocking');
  await dependency.getByRole('textbox', { name: 'Referência', exact: true }).fill('Contrato da API em revisão.');
  await review.getByRole('button', { name: 'Adicionar entrada', exact: true }).click();
  const input = review.getByRole('group', { name: 'Entrada 1', exact: true });
  await input.getByRole('textbox', { name: 'Nome', exact: true }).fill('Protocolo');
  await input.getByRole('textbox', { name: 'Tipo', exact: true }).fill('Texto');
  await input.getByRole('textbox', { name: 'Descrição', exact: true }).fill('Identificador da solicitação.');
  await input.getByRole('textbox', { name: 'Validação', exact: true }).fill('Deve corresponder a uma solicitação do usuário.');
  await input.getByRole('checkbox', { name: 'Obrigatória' }).check();
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  const saved = state.writes[0].body.content.epics[0].stories[0];
  expect(saved.requirements.behavior).toBe('Consultar a solicitação e orientar quando o protocolo não existir.');
  expect(saved.requirements.businessRules).toEqual(['Consultar apenas as próprias solicitações.', 'Registrar o protocolo da consulta.']);
  expect(saved.requirements.dependencies[0]).toEqual({ ...requirements.dependencies[0], status: 'pending', impact: 'blocking', reference: 'Contrato da API em revisão.' });
  expect(saved.requirements.inputs[0]).toMatchObject({ name: 'Protocolo', type: 'Texto', required: true });
  expect(saved.requirements.functionalCriteria).toEqual(saved.acceptanceCriteria);
});

test('an invalid complementary edit remains recoverable after reload and does not send a mutation', async ({ page }) => {
  const state = await fixture(page), review = await open(page), localText = 'x'.repeat(601);
  await review.getByText('Detalhamento complementar', { exact: true }).click();
  await review.getByRole('textbox', { name: /Critérios de aceite técnicos/ }).fill(localText);
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect(review.getByText('use até 12 itens em cada lista complementar', { exact: false })).toBeVisible();
  await reload(page);
  await review.getByText('Detalhamento complementar', { exact: true }).click();
  await expect(review.getByRole('textbox', { name: /Critérios de aceite técnicos/ })).toHaveValue(localText);
  expect(state.writes).toHaveLength(0);
});

test('drafts survive reload, persona changes and a concurrent revision without overwriting another edit', async ({ page }) => {
  const state = await fixture(page), review = await open(page);
  await review.getByRole('textbox', { name: 'Título da história' }).fill('Meu texto local preservado');
  state.proposal.version = 2; state.proposal.content.epics[0].stories[0].title = 'Texto da outra pessoa';
  await expect(review.getByText('Existe uma revisão mais recente.', { exact: false })).toBeVisible({ timeout: 15000 });
  await expect(review.getByRole('button', { name: 'Salvar revisão', exact: true })).toBeDisabled();
  await reload(page);
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveValue('Meu texto local preservado');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('bruno');
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveValue('Texto da outra pessoa');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveValue('Meu texto local preservado');
  await review.getByRole('button', { name: 'Descartar alterações locais' }).click();
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveValue('Meu texto local preservado');
  await review.getByRole('button', { name: 'Confirmar descarte do rascunho' }).click();
  await expect(review.getByRole('textbox', { name: 'Título da história' })).toHaveValue('Texto da outra pessoa');
  expect(state.writes).toHaveLength(0);
});

test('an uncertain revision keeps its body and key across reload, persona changes and an inactive context', async ({ page }) => {
  const state = await fixture(page), review = await open(page);
  state.abortPatch = true;
  await review.getByRole('textbox', { name: 'Critério 1', exact: true }).fill('Critério preservado com sua operação original.');
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  state.readOnly = true;
  await reload(page);
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('bruno');
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeDisabled();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await review.getByRole('button', { name: 'Confirmar operação pendente' }).click();
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.proposal.version).toBe(2);
  expect(state.writes[0].body.content.epics[0].stories[0].requirements.functionalCriteria).toEqual(['Critério preservado com sua operação original.']);
});

test('an uncertain creation recovers its confirmed receipt and actual item links without creating duplicates', async ({ page }) => {
  const state = await fixture(page), review = await open(page, 'bruno');
  state.abortApply = true;
  await review.getByRole('button', { name: 'Conferir criação dos itens' }).click();
  const confirmation = review.getByRole('group', { name: 'Confirmar aplicação do plano' });
  await expect(confirmation).toContainText('7 tarefa(s): 6 padrão + 1 adicionais');
  await confirmation.getByRole('checkbox').check();
  await confirmation.getByRole('button', { name: 'Confirmar criação', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  await reload(page);
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  await review.getByRole('button', { name: 'Confirmar operação pendente' }).click();
  await expect(review.locator('[aria-label="Recibo do plano aplicado"]')).toContainText('9 itens disponíveis');
  await expect(review.getByRole('link', { name: /Consultar uma solicitação/ })).toHaveAttribute('href', '/stories/created-2');
  await expect(review.getByRole('link', { name: /Abrir Projeto/ })).toHaveAttribute('href', '/projects/proposal-project');
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.proposal.appliedItemIds).toHaveLength(9);
  await expect(review.getByRole('button', { name: 'Conferir criação dos itens' })).toHaveCount(0);
});

test('a newer proposal and reload cannot conceal the uncertain operation of an older proposal', async ({ page }) => {
  const state = await fixture(page), review = await open(page);
  state.abortApply = true;
  await review.getByRole('button', { name: 'Conferir criação dos itens' }).click();
  const confirmation = review.getByRole('group', { name: 'Confirmar aplicação do plano' });
  await confirmation.getByRole('checkbox').check();
  await confirmation.getByRole('button', { name: 'Confirmar criação', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  const originalIds = [...state.proposal.appliedItemIds];
  state.proposal = { ...structuredClone(state.proposal), id: 'proposal-newer', status: 'draft', version: 1, appliedItemIds: [], creationReceipt: null, content: { summary: 'Nova proposta recebida enquanto a confirmação anterior estava pendente.', epics: [{ title: 'Novo planejamento', description: 'Uma nova fatia.', stories: [story('Outra proposta recebida')] }] } };
  await reload(page);
  const recovery = page.getByRole('region', { name: 'Operações anteriores aguardando confirmação', exact: true });
  await expect(recovery).toBeVisible();
  await expect(recovery.getByRole('button', { name: 'Confirmar operação pendente' })).toBeEnabled();
  const createButtons = page.getByRole('button', { name: 'Conferir criação dos itens' });
  await expect(createButtons.first()).toBeDisabled();
  await page.getByRole('button', { name: 'Conversa', exact: true }).click();
  await page.getByRole('textbox', { name: 'Sua mensagem', exact: true }).fill('Aguardar a confirmação da proposta anterior.');
  await expect(page.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Abrir propostas pendentes', exact: true }).click();
  await recovery.getByRole('button', { name: 'Confirmar operação pendente' }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  expect(state.writes[1]).toEqual(state.writes[0]);
  expect(originalIds).toHaveLength(9);
  expect(state.proposal.id).toBe('proposal-newer');
  expect(state.proposal.status).toBe('draft');
  expect(state.proposal.appliedItemIds).toEqual([]);
  await expect(page.getByRole('button', { name: 'Conferir criação dos itens' }).first()).toBeEnabled();
});

async function sliceFixture(page: Page) {
  const state=await fixture(page);
  const facts=['Registrar uma solicitação e gerar protocolo.','Consultar a situação pelo protocolo do solicitante.'];
  const consultation=Object.assign(story('Consultar uma solicitação'),{deliverySlice:{id:'slice-consult',outcome:'Consultar a situação da própria solicitação pelo protocolo.',rationale:'Uma consulta completa, com autorização e resultado verificável.',dependsOn:['slice-register'],sourceFacts:[1]}});
  const registration=Object.assign(story('Registrar uma solicitação'),{deliverySlice:{id:'slice-register',outcome:'Registrar os dados e obter um protocolo.',rationale:'Uma entrega verificável de registro antes da consulta.',dependsOn:[] as string[],sourceFacts:[0]}});
  registration.acceptanceCriteria=['Registrar os dados e receber um protocolo.'];registration.requirements.functionalCriteria=[...registration.acceptanceCriteria];
  state.proposal.content.epics[0].stories=[consultation,registration];
  Object.assign(state.proposal.content,{planningFacts:facts});
  return {state,facts,consultation,registration};
}

for(const width of [1440,390])test(`delivery slices preserve facts, criteria, stable identities and the same uncertain revision at ${width}px`,async({page})=>{
 const {state,facts,consultation,registration}=await sliceFixture(page);
 await page.setViewportSize({width,height:1000});const review=await open(page,'bruno'),slice=review.getByRole('region',{name:'Recorte da entrega',exact:true});
 await expect(slice.getByRole('textbox',{name:'Resultado verificável',exact:true})).toHaveValue(consultation.deliverySlice.outcome);const details=slice.locator('details');await expect(details).not.toHaveAttribute('open','');
 await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(slice).toContainText('A posição na lista não determina a execução');
 const prerequisites=slice.getByRole('group',{name:'Pré-requisitos de integração',exact:true});await expect(prerequisites.getByRole('checkbox',{name:'Registrar uma solicitação',exact:true})).toBeChecked();await expect(prerequisites).toContainText('antes de codificar esta História');
 const factGroup=slice.getByRole('group',{name:'Fatos da entrevista relacionados',exact:true});await expect(factGroup.getByRole('checkbox',{name:facts[1],exact:true})).toBeChecked();await expect(factGroup.getByRole('checkbox',{name:facts[0],exact:true})).not.toBeChecked();
 const alignment=await factGroup.getByRole('checkbox',{name:facts[1],exact:true}).evaluate(input=>{const control=input.getBoundingClientRect(),text=input.closest('label')!.querySelector('span')!.getBoundingClientRect();return {controlRight:control.right,textLeft:text.left,topDifference:Math.abs(control.top-text.top)};});expect(alignment.controlRight).toBeLessThanOrEqual(alignment.textLeft);expect(alignment.topDifference).toBeLessThan(12);
 if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/assistant-delivery-slice-${width}.png`,fullPage:true});}
 await slice.getByRole('textbox',{name:'Resultado verificável',exact:true}).fill('Consultar situação e orientação pelo protocolo informado.');await slice.getByRole('textbox',{name:'Justificativa do recorte',exact:true}).fill('Conferir o resultado da consulta como capacidade independente.');
 await review.getByRole('textbox',{name:'Critério 1',exact:true}).fill('Consultar o próprio protocolo e receber a situação atual.');await expect(slice).toContainText('O conteúdo desta História mudou');
 state.abortPatch=true;await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect(review.getByRole('button',{name:'Confirmar operação pendente',exact:true})).toBeEnabled();await reload(page);await review.getByRole('button',{name:'Confirmar operação pendente',exact:true}).click();await expect(review.getByRole('button',{name:'Confirmar operação pendente',exact:true})).toHaveCount(0);
 expect(state.writes).toHaveLength(2);expect(state.writes[1]).toEqual(state.writes[0]);const sent=state.writes[0].body.content;expect(sent.planningFacts).toEqual(facts);expect(sent.epics[0].stories[0].deliverySlice).toMatchObject({id:'slice-consult',dependsOn:['slice-register'],sourceFacts:[1]});expect(sent.epics[0].stories[1].deliverySlice).toEqual(registration.deliverySlice);expect(sent.epics[0].stories[0].acceptanceCriteria).toEqual(['Consultar o próprio protocolo e receber a situação atual.']);expect(sent.epics[0].stories[0].requirements.functionalCriteria).toEqual(sent.epics[0].stories[0].acceptanceCriteria);
 await expect(slice).toContainText('O conteúdo desta História mudou');await slice.getByRole('button',{name:'Conferi este recorte',exact:true}).click();await expect(slice.getByText('O conteúdo desta História mudou',{exact:false})).toHaveCount(0);await reload(page);await expect(slice.getByText('O conteúdo desta História mudou',{exact:false})).toHaveCount(0);await expect(slice.getByRole('textbox',{name:'Resultado verificável',exact:true})).toHaveValue('Consultar situação e orientação pelo protocolo informado.');
 await review.getByRole('button',{name:'Conferir criação dos itens',exact:true}).click();await expect(review.getByRole('group',{name:'Confirmar aplicação do plano',exact:true})).toBeVisible();await review.getByRole('textbox',{name:'Critério 1',exact:true}).fill('Consultar o protocolo próprio com a orientação atual.');await expect(review.getByRole('group',{name:'Confirmar aplicação do plano',exact:true})).toHaveCount(0);await expect(slice).toContainText('O conteúdo desta História mudou');expect(state.writes.every(write=>write.method==='PATCH')).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await review.getByRole('button',{name:'Adicionar história ao Épico 1',exact:true}).click();await review.getByRole('textbox',{name:'Título da história',exact:true}).fill('Explicar o acompanhamento do protocolo');await review.getByRole('textbox',{name:'Critério 1',exact:true}).fill('Apresentar a orientação para acompanhar o protocolo.');await slice.getByRole('textbox',{name:'Resultado verificável',exact:true}).fill('O solicitante entende como acompanhar o protocolo.');await slice.getByRole('textbox',{name:'Justificativa do recorte',exact:true}).fill('Complemento humano verificável sem alterar os fatos capturados.');await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(3);const createdSlice=state.writes[2].body.content.epics[0].stories[2].deliverySlice;expect(createdSlice.id).toMatch(/^slice-[a-f0-9-]{36}$/);expect(createdSlice.sourceFacts).toEqual([]);expect(state.writes[2].body.content.planningFacts).toEqual(facts);await reload(page);await expect(slice.getByRole('textbox',{name:'Resultado verificável',exact:true})).toHaveValue('O solicitante entende como acompanhar o protocolo.');expect(state.writes.filter(write=>write.method==='POST')).toHaveLength(0);
});

test('delivery slice prerequisite removal is explicit and cyclic integration relations never save',async({page})=>{
 const {state}=await sliceFixture(page);const review=await open(page),picker=review.getByRole('navigation',{name:'Histórias da proposta',exact:true});
 await picker.getByRole('button',{name:/História 2: Registrar uma solicitação/}).click();await review.getByRole('button',{name:'Remover história 2 e suas tarefas',exact:true}).click();await expect(review).toContainText('Não foi possível remover: “Consultar uma solicitação” possui pré-requisito');await expect(picker.getByRole('button',{name:/História 2: Registrar uma solicitação/})).toBeVisible();expect(state.writes).toHaveLength(0);
 const slice=review.getByRole('region',{name:'Recorte da entrega',exact:true});await slice.locator('summary').click();await slice.getByRole('group',{name:'Pré-requisitos de integração',exact:true}).getByRole('checkbox',{name:'Consultar uma solicitação',exact:true}).check();await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect(review).toContainText('Os pré-requisitos formam um ciclo entre Histórias');expect(state.writes).toHaveLength(0);
 await slice.getByRole('group',{name:'Pré-requisitos de integração',exact:true}).getByRole('checkbox',{name:'Consultar uma solicitação',exact:true}).uncheck();await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0].body.content.epics[0].stories.map((entry:any)=>entry.deliverySlice.id)).toEqual(['slice-consult','slice-register']);expect(state.writes[0].body.content.epics[0].stories[0].deliverySlice.dependsOn).toEqual(['slice-register']);
});

test('delivery slice missing references and uncovered facts stay recoverable until explicitly revised',async({page})=>{
 const {state,facts,consultation}=await sliceFixture(page);consultation.deliverySlice.dependsOn=['slice-unavailable'];facts.push('Explicar ao solicitante como acompanhar o protocolo.');const review=await open(page),slice=review.getByRole('region',{name:'Recorte da entrega',exact:true});
 await slice.locator('summary').click();await expect(slice).toContainText('Pré-requisito indisponível: slice-unavailable');await slice.getByRole('textbox',{name:'Resultado verificável',exact:true}).fill('Consultar o próprio protocolo e receber orientação.');await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect(review).toContainText('Há referência indisponível, repetida ou à própria História');expect(state.writes).toHaveLength(0);await reload(page);await slice.locator('summary').click();await expect(slice).toContainText('Pré-requisito indisponível: slice-unavailable');
 await slice.getByRole('button',{name:'Remover pré-requisito indisponível slice-unavailable',exact:true}).click();await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect(review).toContainText('Há fatos da entrevista sem vínculo a uma História');expect(state.writes).toHaveLength(0);
 await slice.getByRole('group',{name:'Fatos da entrevista relacionados',exact:true}).getByRole('checkbox',{name:facts[2],exact:true}).check();await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0].body.content.planningFacts).toEqual(facts);expect(state.writes[0].body.content.epics[0].stories[0].deliverySlice).toMatchObject({id:'slice-consult',dependsOn:[],sourceFacts:[1,2]});expect(state.writes[0].body.content.epics[0].stories[0].acceptanceCriteria).toEqual(requirements.functionalCriteria);await expect(review.getByRole('button',{name:'Conferir criação dos itens',exact:true})).toBeEnabled();expect(state.writes[0].method).toBe('PATCH');
});
