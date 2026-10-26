import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mockPersonas, uiJourney } from './journey-fixtures';
import { assistantMessagePage } from './assistant-fixtures';

const now = '2026-10-24T16:00:00.000Z';
const item = (id: string, kind: string, parentId: string | null, name: string) => ({ id, kind, parentId, name, key: id.toUpperCase(), status: kind === 'system' ? 'active' : kind === 'story' ? 'specification' : kind === 'task' ? 'todo' : 'approved', projectLifecycle: kind === 'project' ? 'active' : undefined, version: 3, archived: false, description: 'Escopo registrado e preservado.', data: {}, createdAt: now, updatedAt: now });

async function fixtures(page: Page) {
  const system = item('system', 'system', null, 'Sistema de atendimento'), project = item('project', 'project', system.id, 'Projeto de solicitações'), epic = item('epic', 'epic', project.id, 'Consulta de solicitações'), story = item('story', 'story', epic.id, 'Consultar uma solicitação'), task = item('task', 'task', story.id, 'Implementar consulta');
  const stories = Array.from({ length: 42 }, (_, index) => item(`story-${String(index + 1).padStart(2, '0')}`, 'story', epic.id, `História ${String(index + 1).padStart(2, '0')}`));
  const context = (value: typeof story) => ({ id: value.id, kind: value.kind, name: value.name, key: value.key, systemId: system.id, projectId: project.id, archived: value.archived, readOnly: value.archived });
  const messages = Array.from({ length: 45 }, (_, index) => ({ id: `chat_turn:turn-${index + 1}`, source: index % 2 ? 'story' : 'planning', sourceId: `turn-${index + 1}`, sourceType: 'chat_turn', sourceVersion: 0, relation: index % 2 ? 'descendant' : 'direct', input: `Mensagem registrada ${index + 1}`, output: `Resposta registrada ${index + 1}`, state: 'succeeded', error: null as string | null, actorName: 'Ana', createdAt: new Date(Date.parse(now) - index * 60000).toISOString(), context: context(index % 2 ? story : project), proposal: null as { id: string; version: number; status: string } | null, references: index === 0 ? [{ sourceType: 'plan_proposal', sourceId: 'proposal', sourceVersion: 2, storyId: story.id, storyVersion: null, linkedAt: now }] : [] }));
  const state = { writes: [] as { path: string; body: any; key: string | undefined }[], queries: [] as URL[], messages, story, project, failLinkOnce: false, activeTurn: null as any, readOnly: false, conversationFailure: false };
  await mockPersonas(page);
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/personas') return route.fallback();
    if (request.method() !== 'GET') {
      state.writes.push({ path, body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (path.endsWith('/conversation-links') && state.failLinkOnce) { state.failLinkOnce = false; return route.abort('failed'); }
      if (path === '/api/assistant/turns') return route.fulfill({ json: { turn: { id: 'submitted-contextual-turn', status: 'queued' } } });
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/items') return route.fulfill({ json: { items: [system] } });
    if (path === '/api/assistant/messages') {
      const turns = [{ id: 'current-2', sequence: 25, kind: 'chat', input: 'Pergunta anterior preservada', output: 'Resposta consultiva anterior.', status: 'succeeded', actorName: 'Ana', model: 'isolated-model', error: null, createdAt: now }, { id: 'latest-contextual-turn', sequence: 45, kind: 'chat', input: 'Pergunta atual', output: 'Resposta consultiva.', status: 'succeeded', actorName: 'Ana', model: 'isolated-model', error: null, createdAt: now }, ...(state.activeTurn ? [{ ...state.activeTurn, sequence: 46 }] : [])];
      return route.fulfill({ json: { contextId: url.searchParams.get('contextId'), ...assistantMessagePage(turns, url.searchParams) } });
    }
    if (path === '/api/assistant') {
      const current = url.searchParams.get('contextId') === story.id ? story : project, pageNumber = Number(url.searchParams.get('page')) || 1;
      return route.fulfill({ json: { context: current, session: { id: `session-${current.id}`, version: 4 }, turns: [{ id: `current-${pageNumber}`, sequence: pageNumber === 1 ? 45 : 25, kind: 'chat', input: pageNumber === 1 ? 'Pergunta atual' : 'Pergunta anterior preservada', output: 'Resposta consultiva.', status: 'succeeded', actorName: 'Ana', model: 'isolated-model', error: null, createdAt: now }], latestTurn: state.activeTurn ? { ...state.activeTurn, sequence: 46 } : { id: 'latest-contextual-turn', sequence: 45, kind: 'chat', input: 'Pergunta atual', output: 'Resposta consultiva.', status: 'succeeded', actorName: 'Ana', model: 'isolated-model', error: null, createdAt: now }, currentProposal: null, proposals: [], availableRepositories: [], configured: true, model: 'isolated-model', assistantMode: current.kind === 'story' ? 'delivery' : 'planning', readOnly: state.readOnly, activeTurn: state.activeTurn, hasSuccessfulInterview: true, turnsPage: { page: pageNumber, pageSize: 20, total: 45, totalPages: 3, hasMore: pageNumber < 3 }, proposalsPage: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasMore: false }, brief: null } });
    }
    if (path === '/api/assistant/plans/proposal/revisions/2') return route.fulfill({ json: { proposalId: 'proposal', version: 2, context: context(project), readOnly: false, revision: { content: { summary: 'Revisão humana exata número dois.', epics: [] }, actorName: 'Ana', source: 'human', createdAt: now } } });
    if (path.endsWith('/release')) return route.fulfill({ json: { story: { ...story, projectId: project.id, projectName: project.name, epicId: epic.id, epicName: epic.name }, assignment: null, system: { id: system.id, name: system.name }, releases: [], truncated: false, totalChoices: 0 } });
    if (path === '/api/collections/items') {
      const kind = url.searchParams.get('kind'), query = (url.searchParams.get('q') || '').toLocaleLowerCase('pt-BR');
      const all = kind === 'system' ? [system] : kind === 'project' ? [project] : kind === 'task' ? [task] : stories;
      const filtered = all.filter(value => !query || `${value.key} ${value.name}`.toLocaleLowerCase('pt-BR').includes(query));
      const total = filtered.length, current = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), Math.max(1, Math.ceil(total / 20)));
      return route.fulfill({ json: { items: filtered.slice((current - 1) * 20, current * 20), total, page: current, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)), extraCount: 0 } });
    }
    if (path.endsWith('/conversations')) {
      state.queries.push(url);
      if (state.conversationFailure) return route.fulfill({ status: 503, json: { error: { message: 'A consulta não chegou ao servidor.' } } });
      const selectedId = path.split('/')[3], current = [story.id, task.id].includes(selectedId) ? story : project;
      const filtered = state.messages.filter(message => (!url.searchParams.get('messageId') || message.id === url.searchParams.get('messageId')) && (url.searchParams.get('source') === 'all' || message.source === url.searchParams.get('source')));
      if (url.searchParams.get('direction') === 'asc') filtered.reverse();
      const total = filtered.length, currentPage = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), Math.max(1, Math.ceil(total / 20)));
      return route.fulfill({ json: { context: context(current), readOnly: state.readOnly || current.archived, messages: filtered.slice((currentPage - 1) * 20, currentPage * 20).map(message => ({ ...message, relation: message.context.id === current.id ? 'direct' : current.kind === 'story' && message.context.kind === 'project' ? 'planning_origin' : 'descendant' })), total, page: currentPage, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)), asOf: url.searchParams.get('asOf') || now, coverage: { description: 'Fontes reais preservadas; dados deste cenário ficam isolados no navegador.' } } });
    }
    if (path.endsWith('/journey')) return route.fulfill({ json: uiJourney(story, null, { tasks: [task], activities: [{ id: 'work', kind: 'coding', label: 'Codificação', taskId: task.id, state: 'not_started', attempts: [] }], current: { phase: 'SPECIFICATION', state: 'not_started', title: 'Especificação aguardando preparo', taskId: task.id, activityId: 'work' } }) });
    const selected = [system, project, epic, story, task, ...stories].find(value => value.id === path.split('/').at(-1));
    if (selected) return route.fulfill({ json: { item: selected, ancestors: selected.kind === 'system' ? [] : selected.kind === 'project' ? [system] : selected.kind === 'epic' ? [system, project] : selected.kind === 'story' ? [system, project, epic] : [system, project, epic, story], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } });
    return route.fulfill({ json: {} });
  });
  return state;
}

test('conversations preserve pagination, filters, direct links and the last confirmed result after a query failure', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/projects/project?tab=conversations');
  const collection = page.getByRole('region', { name: 'Conversas e referências' });
  await expect(collection.getByText('Mensagem registrada 1', { exact: true })).toBeVisible();
  await expect(collection.getByText('Mensagem registrada 21', { exact: true })).toHaveCount(0);
  await expect(collection.locator('details.experience-filters')).not.toHaveAttribute('open', '');
  expect(state.queries.at(-1)?.searchParams.get('includeArchived')).toBe('false');
  await collection.getByRole('navigation', { name: 'Paginação das conversas', exact: true }).getByRole('button', { name: 'Próxima' }).click();
  await expect(page).toHaveURL(/conversations.page=2/);
  await expect(collection.getByText('Mensagem registrada 21', { exact: true })).toBeVisible();
  expect(state.queries.at(-1)?.searchParams.get('asOf')).toBe(now);
  await page.reload();
  await expect(collection.getByText('Mensagem registrada 21', { exact: true })).toBeVisible();
  state.conversationFailure = true;
  await collection.getByRole('button', { name: 'Atualizar conversas' }).click();
  await expect(collection.getByRole('alert')).toContainText('A consulta não chegou');
  await expect(collection.getByText('Mensagem registrada 21', { exact: true })).toBeVisible();
  state.conversationFailure = false;
  await collection.getByRole('button', { name: 'Tentar novamente' }).click();
  await collection.locator('details.experience-filters>summary').click();
  await collection.getByRole('combobox', { name: 'Origem da conversa' }).selectOption('planning');
  await collection.getByRole('checkbox', { name: 'Incluir conversas de itens arquivados' }).check();
  await collection.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page).toHaveURL(/conversations.source=planning/);
  await expect(collection.getByText('Mensagem registrada 2', { exact: true })).toHaveCount(0);
  expect(state.queries.at(-1)?.searchParams.get('includeArchived')).toBe('true');
  await collection.getByRole('link', { name: 'Link para esta mensagem', exact: true }).first().click();
  await expect(collection.locator('.conversation-entries>li')).toHaveCount(1);
  await page.reload();
  await expect(collection.locator('.conversation-selected')).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('relating an original message searches and pages stories, requires confirmation and reconciles the same request after reload', async ({ page }) => {
  const state = await fixtures(page); state.failLinkOnce = true;
  await page.goto('/projects/project?tab=conversations&conversations.message=chat_turn%3Aturn-1');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await page.getByRole('button', { name: 'Relacionar a uma História', exact: true }).click();
  const form = page.getByRole('region', { name: 'Relacionar conversa a uma História' });
  await form.getByRole('navigation', { name: 'Paginação de Histórias para referência' }).getByRole('button', { name: 'Próxima' }).click();
  await form.getByRole('radio', { name: 'STORY-23 · História 23' }).check();
  await form.getByRole('searchbox', { name: 'Buscar História deste Projeto' }).fill('História 41');
  await form.getByRole('button', { name: 'Buscar Histórias', exact: true }).click();
  await expect(form.getByRole('radio', { name: 'STORY-41 · História 41' })).toBeVisible();
  await expect(form).toContainText('História escolhida: STORY-23 · História 23');
  await expect(form.getByRole('button', { name: 'Confirmar referência' })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await form.getByRole('checkbox', { name: /Confirmo relacionar/ }).check();
  await form.getByRole('button', { name: 'Confirmar referência' }).click();
  await expect(page.getByRole('button', { name: 'Verificar vínculo da conversa' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Verificar vínculo da conversa' }).click();
  await expect(page.getByText(/Referência relacionada à História STORY-23/)).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].key).toBe(state.writes[1].key);
  expect(state.writes[0].body).toEqual({ sourceType: 'chat_turn', sourceId: 'turn-1', sourceVersion: 0, expectedVersion: 3, confirmed: true });
  expect(state.writes[1].body).toEqual(state.writes[0].body);
  expect(state.story.status).toBe('specification');
});

test('story and task use the same contextual consultation without project plan actions or implicit execution', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/stories/story?tab=planning&process=conversation');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const conversation = page.getByRole('region', { name: 'Conversa contextual da História' });
  await expect(conversation).toContainText('Conversar sobre esta História');
  await expect(conversation.getByRole('button', { name: /Gerar proposta|Concluir entrevista/ })).toHaveCount(0);
  await conversation.getByRole('textbox', { name: 'Sua mensagem', exact: true }).fill('Como comprovar o aceite desta História?');
  await conversation.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].path).toBe('/api/assistant/turns');
  expect(state.writes[0].body).toMatchObject({ contextId: 'story', assistantMode: 'delivery' });
  await page.goto('/tasks/task?tab=planning&process=conversation');
  await expect(conversation).toContainText('Consultar uma solicitação');
  await expect(page.getByTestId('story-phase')).toHaveText('SPECIFICATION');
  expect(state.writes).toHaveLength(1);
});

test('the first association of a saved plan revision is available before any references exist', async ({ page }) => {
  const state = await fixtures(page);
  state.messages[0].references = [];
  state.messages[0].proposal = { id: 'proposal', version: 2, status: 'draft' };
  await page.goto('/projects/project?tab=conversations&conversations.message=chat_turn%3Aturn-1');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await page.getByRole('button', { name: 'Relacionar revisão salva 2 a uma História' }).click();
  const form = page.getByRole('region', { name: 'Relacionar conversa a uma História' });
  await form.getByRole('radio', { name: 'STORY-01 · História 01' }).check();
  await form.getByRole('checkbox', { name: /Confirmo relacionar/ }).check();
  await form.getByRole('button', { name: 'Confirmar referência' }).click();
  await expect(page.getByText(/Referência relacionada à História STORY-01/)).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({ sourceType: 'plan_proposal', sourceId: 'proposal', sourceVersion: 2, expectedVersion: 3, confirmed: true });
});

test('a running turn outside the consulted page still blocks new messages, and archived conversations stay read only', async ({ page }) => {
  const state = await fixtures(page);
  state.activeTurn = { id: 'active-outside', status: 'running', input: 'Pergunta atual em processamento', output: null, actorName: 'Ana', createdAt: now };
  await page.goto('/stories/story?tab=planning&process=conversation&assistant.page=2');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const conversation = page.getByRole('region', { name: 'Conversa contextual da História' });
  await expect(conversation).toContainText('Pergunta anterior preservada');
  await expect(conversation).toContainText('A atividade atual continua identificada ao consultar o histórico.');
  await conversation.getByRole('textbox', { name: 'Sua mensagem', exact: true }).fill('Rascunho preservado');
  await expect(conversation.getByRole('button', { name: 'Enviar mensagem', exact: true })).toBeDisabled();
  state.story.archived = true; state.readOnly = true;
  state.messages[0].context.archived = true; state.messages[0].context.readOnly = true;
  await page.goto('/stories/story?tab=conversations');
  const history = page.getByRole('region', { name: 'Conversas e referências' });
  await expect(history).toContainText('somente leitura');
  await expect(history.getByRole('button', { name: 'Relacionar a uma História', exact: true })).toHaveCount(0);
  await expect(history.getByRole('link', { name: 'Consultar na origem', exact: true }).first()).toHaveAttribute('href', /conversations.includeArchived=true/);
  expect(state.queries.at(-1)?.searchParams.get('includeArchived')).toBe('true');
  expect(state.writes).toHaveLength(0);
});

test('registered plan revisions remain distinct from the original model response and the view fits desktop and mobile', async ({ page }) => {
  await fixtures(page);
  await page.goto('/stories/story?tab=conversations&conversations.message=chat_turn%3Aturn-1');
  const history = page.getByRole('region', { name: 'Conversas e referências' });
  await history.getByText('Rastreabilidade desta mensagem', { exact: true }).click();
  await expect(history).toContainText('Versão não capturada');
  await history.getByRole('button', { name: 'Consultar revisão 2 do plano' }).click();
  await expect(history.getByRole('region', { name: 'Revisão 2 do plano' })).toContainText('Revisão humana exata número dois.');
  await expect(history).toContainText('Resposta registrada 1');
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); }); await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/conversations-${width}.png`, fullPage: true }); }
});

test('failed messages show a red failure signal and only the cause captured by their own source', async ({ page }) => {
  const state = await fixtures(page);
  state.messages[0].state = 'failed'; state.messages[0].error = 'A fonte registrou interrupção da geração.';
  await page.goto('/projects/project?tab=conversations&conversations.message=chat_turn%3Aturn-1');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const history = page.getByRole('region', { name: 'Conversas e referências' });
  await expect(history.locator('.badge.danger')).toContainText('FAILED');
  await expect(history.locator('.badge.danger svg')).toHaveCount(1);
  await expect(history.getByRole('alert')).toContainText('A fonte registrou interrupção da geração.');
  await expect(history.getByRole('button', { name: 'Relacionar a uma História', exact: true })).toHaveCount(0);
  state.messages[0].error = null;
  await history.getByRole('button', { name: 'Atualizar conversas' }).click();
  await expect(history.getByRole('alert')).toContainText('Detalhe da falha não registrado nesta fonte.');
  expect(state.writes).toHaveLength(0);
});
