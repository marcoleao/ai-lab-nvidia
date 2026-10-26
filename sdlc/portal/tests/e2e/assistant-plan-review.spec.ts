import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pipelineTasks } from '../../packages/shared/src/pipeline-plan';
import { assistantMessagePage } from './assistant-fixtures';

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
  const state = { proposal: { id: 'proposal-review', version: 1, projectVersion: 1, sessionVersion: 1, status: 'draft', content: { summary: 'Consulta de solicitações.', epics: [{ title: 'Consulta', description: 'Consulta pelo solicitante.', stories: [initialStory] }] }, appliedItemIds: [] as string[], creationReceipt: null as any, createdAt: now }, writes: [] as Write[], abortPatch: false, abortApply: false, readOnly: false };
  const turns = [{ id: 'proposal-interview', sequence: 1, kind: 'chat', input: 'Quero consultar solicitações.', output: 'Requisitos confirmados.', status: 'succeeded', model: null, error: null, actorName: 'Admin', createdAt: now }];
  const receipts = new Map<string, unknown>();
  const personas = [{ id: 'admin', name: 'Admin', role: 'admin' }, { id: 'ana', name: 'Ana', role: 'product_owner' }, { id: 'bruno', name: 'Bruno', role: 'architect' }, { id: 'carla', name: 'Carla', role: 'qa_lead' }];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET') {
      const write = { method: request.method(), path: url.pathname, key: request.headers()['idempotency-key'], persona: request.headers()['x-persona'], body: request.postDataJSON() };
      state.writes.push(write);
      if (receipts.has(write.key)) return route.fulfill({ json: receipts.get(write.key) });
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
      context: state.readOnly ? { ...project, status: 'inactive', projectLifecycle: 'inactive' } : project, session: { id: 'proposal-session', version: 1 }, turns, latestTurn: turns.at(-1), proposals: [state.proposal], currentProposal: state.proposal,
      activeTurn: null, hasSuccessfulInterview: true, configured: true, requirementsMode: true, readOnly: state.readOnly, readOnlyReason: state.readOnly ? 'O Projeto está INACTIVE.' : null,
      hierarchy: { writable: !state.readOnly, reason: state.readOnly ? 'O Projeto está INACTIVE.' : null, blockedBy: state.readOnly ? project.id : null }, capabilities: { canEditPlan: !state.readOnly, canApplyPlan: !state.readOnly, canChat: !state.readOnly, canGeneratePlan: !state.readOnly, canCompleteInterview: !state.readOnly },
      availableRepositories: [{ id: 'repo-a', key: 'API', name: 'API de consulta' }], brief: { summary: 'Consulta pelo solicitante.', confirmedFacts: ['Consultar somente solicitações próprias.'], openQuestions: [] },
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
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
}

test('proposal counts the six fixed stages, preserves stage identity and focuses one Story at a time', async ({ page }) => {
  const state = await fixture(page), review = await open(page, 'bruno');
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
