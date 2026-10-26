import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { assistantMessagePage } from './assistant-fixtures';

const now = '2026-10-25T13:00:00Z';
const context = (id: string, kind: string, parentId: string | null, name: string, extra: any = {}) => ({ id, kind, parentId, name, key: id.toUpperCase(), status: 'active', projectLifecycle: kind === 'project' ? 'active' : undefined, archived: false, description: '', version: 1, data: {}, createdAt: now, updatedAt: now, ...extra });
const requirements = { version: 1, objective: 'Permitir ao solicitante consultar o resultado de sua solicitação.', behavior: 'O solicitante informa o protocolo e consulta a situação de sua própria solicitação.', actors: [] as string[], inputs: [], outputs: [{ name: 'Resultado da solicitação', type: 'Texto', description: 'Situação e protocolo disponíveis para o solicitante.' }], businessRules: ['Consultar somente as próprias solicitações.'], functionalCriteria: ['O usuário consulta o resultado e o protocolo.'], technicalCriteria: ['O contrato deve validar o vínculo do usuário com a solicitação.'], dependencies: [] as any[], exceptions: ['Informar quando o protocolo não existir.'], nonFunctional: ['A interface deve permitir navegação por teclado.'], assumptions: ['A sessão do solicitante já está autenticada.'], outOfScope: ['Alterar solicitações já registradas.'], openQuestions: [] as string[] };
const plan = (id = 'rich-plan', title = 'Consultar uma solicitação') => ({ id, projectId: 'project-a', version: 1, status: 'draft', projectVersion: 1, sessionVersion: 1, content: { summary: `Plano para ${title}.`, epics: [{ title: 'Consulta', description: 'Consulta de solicitações.', stories: [{ title, description: 'O solicitante consulta a situação e o protocolo de uma solicitação previamente registrada.', repositoryIds: [], acceptanceCriteria: [...requirements.functionalCriteria], requirements: structuredClone(requirements), tasks: [] as any[] }] }] }, appliedItemIds: [], createdAt: now });
const pagination = (page: number, total: number) => ({ page, total, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)), hasMore: page * 20 < total });

async function workspace(page: Page) {
  const systems = [context('system-a', 'system', null, 'Sistema A'), context('system-b', 'system', null, 'Sistema B')];
  const projects = [context('project-a', 'project', 'system-a', 'Projeto A'), context('project-b', 'project', 'system-b', 'Projeto B'), context('project-closed', 'project', 'system-a', 'Projeto encerrado', { projectLifecycle: 'completed' }), context('project-archived', 'project', 'system-a', 'Projeto arquivado', { archived: true })];
  const state = { proposals: [] as any[], turns: [] as any[], brief: { summary: '', confirmedFacts: [] as string[], openQuestions: [] as string[] }, writes: [] as any[] };
  const lifecycle = (item: any) => item.kind === 'project' ? item.projectLifecycle : item.status;
  const availability = (item: any) => {
    const chain = item.kind === 'project' ? [...systems.filter(system => system.id === item.parentId), item] : [item];
    const blockedBy = chain.find(value => value.archived || lifecycle(value) !== 'active');
    const reason = blockedBy ? `${blockedBy.kind === 'system' ? 'Sistema' : 'Projeto'} ${blockedBy.name} está ${blockedBy.archived ? 'ARCHIVED' : lifecycle(blockedBy).toUpperCase()}. Consulte o ciclo do agrupador para continuar.` : null;
    return { blockedBy: blockedBy ? { ...blockedBy, lifecycle: lifecycle(blockedBy) } : null, hierarchy: { writable: !blockedBy, ...(reason ? { reason, blockedBy: blockedBy.id } : {}) }, readOnlyReason: reason, capabilities: { canMutate: !blockedBy, canChangeLifecycle: !chain.slice(0, -1).some(value => value.archived || lifecycle(value) !== 'active') } };
  };
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') {
      const body = req.postDataJSON(); state.writes.push(body);
      const proposal = state.proposals.find(value => url.pathname.includes(value.id));
      if (req.method() === 'PATCH' && proposal) { proposal.content = body.content; proposal.version++; return route.fulfill({ json: { proposal } }); }
      return route.fulfill({ status: 400, json: { error: 'Mutação não prevista neste cenário isolado.' } });
    }
    if (url.pathname === '/api/personas') return route.fulfill({ json: { personas: [{ id: 'admin', name: 'Admin', role: 'admin' }, { id: 'bruno', name: 'Bruno', role: 'architect' }] } });
    if (url.pathname === '/api/items') return route.fulfill({ json: { items: systems } });
    if (url.pathname === '/api/assistant/messages') return route.fulfill({ json: { contextId: url.searchParams.get('contextId'), ...assistantMessagePage(state.turns, url.searchParams) } });
    if (url.pathname === '/api/collections/items') {
      const kind = url.searchParams.get('kind'), term = (url.searchParams.get('q') || '').toLocaleLowerCase('pt-BR');
      const items = (kind === 'system' ? systems : projects.filter(item => item.parentId === url.searchParams.get('parentId'))).filter(item => !item.archived && lifecycle(item) === 'active' && (!term || `${item.key} ${item.name}`.toLocaleLowerCase('pt-BR').includes(term))).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      const total = items.length, current = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), Math.max(1, Math.ceil(total / 20)));
      return route.fulfill({ json: { items: items.slice((current - 1) * 20, current * 20), ...pagination(current, total), extraCount: 0 } });
    }
    if (url.pathname === '/api/assistant') {
      const item = [...systems, ...projects].find(value => value.id === url.searchParams.get('contextId'))!;
      const access = availability(item), allowed = ['admin', 'bruno'].includes(req.headers()['x-persona'] || '') && access.hierarchy.writable;
      const turnsPage = Math.min(Number(url.searchParams.get('page')) || 1, Math.max(1, Math.ceil(state.turns.length / 20)));
      const proposalsPage = Math.min(Number(url.searchParams.get('proposalsPage')) || 1, Math.max(1, Math.ceil(state.proposals.length / 20)));
      const ordered = assistantMessagePage(state.turns, new URLSearchParams()).turns;
      return route.fulfill({ json: { context: { ...item, lifecycle: lifecycle(item) }, session: { id: `session-${item.id}`, version: 1 }, turns: state.turns.slice(Math.max(0, state.turns.length - turnsPage * 20), state.turns.length - (turnsPage - 1) * 20), latestTurn: ordered.at(-1) || null, activeTurn: ordered.find(value => ['queued', 'running', 'paused'].includes(value.status)) || null, hasSuccessfulInterview: state.turns.some(value => value.kind !== 'plan' && value.status === 'succeeded'), proposals: state.proposals.slice((proposalsPage - 1) * 20, proposalsPage * 20), currentProposal: state.proposals[0] || null, turnsPage: pagination(turnsPage, state.turns.length), proposalsPage: pagination(proposalsPage, state.proposals.length), availableRepositories: [], configured: true, model: 'isolated-model', requirementsMode: true, brief: state.brief, hierarchy: access.hierarchy, readOnly: !access.hierarchy.writable, readOnlyReason: access.readOnlyReason, blockedBy: access.blockedBy, capabilities: { canMessage: allowed, canGeneratePlan: allowed, canComplete: allowed, canApplyPlan: allowed, canEditPlan: allowed, canCancelTurn: allowed } } });
    }
    const item = [...systems, ...projects].find(value => value.id === url.pathname.split('/').at(-1));
    if (item) return route.fulfill({ json: { item, ...availability(item), children: projects.filter(project => project.parentId === item.id), ancestors: systems.filter(system => system.id === item.parentId), repositories: [], availableRepositories: [], environments: [], history: [] } });
    return route.fulfill({ json: {} });
  });
  return { state, systems, projects };
}

async function choosePersona(page: Page, id = 'admin') { await page.getByRole('combobox', { name: /Persona/ }).selectOption(id); }
async function openCoverage(page: Page) {
  const coverage = page.getByRole('region', { name: 'Resumo da especificação', exact: true });
  const details = coverage.locator(':scope > details');
  if (!await details.evaluate(element => element.hasAttribute('open'))) await details.locator(':scope > summary').click();
  return coverage;
}

test('Assistente keeps the destination compact and restores focus and dependent Project choices', async ({ page }) => {
  const { state } = await workspace(page);
  await page.goto('/assistant');
  const menu = page.getByRole('navigation', { name: 'Principal' });
  expect(await menu.getByRole('link').allTextContents()).toEqual(['Visão geral', 'Assistente', 'Sistemas', 'Releases', 'Integrações']);
  await expect(menu.getByRole('link', { name: 'Assistente', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.assistant-launcher')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const system = page.getByRole('combobox', { name: 'Sistema', exact: true }), project = page.getByRole('combobox', { name: 'Projeto', exact: true });
  await expect(project).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Comece pelo contexto da entrega' })).toBeVisible();
  await system.selectOption('system-a');
  await expect(project).toBeEnabled();
  expect(await project.locator('option').allTextContents()).toEqual(['Selecione um Projeto', 'PROJECT-A · Projeto A']);
  await project.selectOption('project-a');
  await expect(page).toHaveURL(/system=system-a&project=project-a/);
  await expect(page.getByRole('region', { name: 'Entrevista e planejamento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alterar contexto' })).toBeFocused();
  await expect(page.locator('#assistant-context-controls')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Destino do planejamento' })).toContainText('Sistema AProjeto A');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Alterar contexto' })).toBeVisible();
  await page.getByRole('button', { name: 'Alterar contexto' }).click();
  await expect(page.getByRole('dialog', { name: 'Alterar contexto', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar Sistema' })).toBeFocused();
  await expect(project).toHaveValue('project-a');
  await system.selectOption('system-b');
  await expect(project).toHaveValue('');
  await expect(project.locator('option')).toHaveCount(2);
  expect(await project.locator('option').allTextContents()).toContain('PROJECT-B · Projeto B');
  expect(state.writes).toHaveLength(0);
});

test('the selected proposal separates essential fields, optional detail and blocking dependencies', async ({ page }) => {
  const { state } = await workspace(page);
  state.turns = [{ id: 'chat', kind: 'chat', input: 'Quero consultar uma solicitação.', output: 'Qual deve ser o comportamento para um protocolo inexistente?', status: 'succeeded', actorName: 'Admin', createdAt: now }];
  state.brief = { summary: 'Consulta pelo solicitante.', confirmedFacts: ['A consulta é feita pelo próprio usuário.'], openQuestions: ['Como apresentar um protocolo inexistente?'] };
  state.proposals = [plan()];
  state.proposals[0].content.epics[0].stories[0].requirements.dependencies = [{ description: 'Confirmar contrato do componente de consulta.', kind: 'internal', impact: 'blocking', status: 'pending' }, { description: 'Acompanhar guia de termos do solicitante.', kind: 'decision', impact: 'informative', status: 'pending' }];
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  await page.getByRole('button', { name: /^Resumo/ }).click();
  await expect(page.getByText('Como apresentar um protocolo inexistente?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar resumo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resumo da especificação', exact: true })).toBeHidden();
  await page.getByRole('button', { name: /^Proposta/ }).click();
  const coverage = await openCoverage(page);
  await expect(coverage.locator('.analyst-coverage-fields [data-recorded=true]')).toHaveCount(3);
  await expect(coverage).toContainText('1 impeditiva(s) pendente(s) para codificar · 1 informativa(s)');
  await expect(coverage).toContainText('Presença de campos não significa completude');
  await expect(coverage).toContainText('Revisão salva 1');
  await coverage.getByText(/^Detalhamento complementar ·/).click();
  await expect(coverage.locator('.analyst-coverage-fields>div').filter({ has: page.locator('dt', { hasText: 'Entradas' }) })).toContainText('Não informado');
  await expect(page.getByRole('button', { name: 'Gerar nova proposta para revisão', exact: true })).toBeDisabled();
  const review = page.getByRole('region', { name: 'Revisão do plano' });
  await expect(review).toContainText('6 Tarefas padrão e 0 adicionais. 8/30 itens');
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/assistant-workspace-${width}.png`, fullPage: true }); }
  expect(state.writes).toHaveLength(0);
});

test('editing functional criteria preserves technical and complementary requirements', async ({ page }) => {
  const { state } = await workspace(page);
  state.proposals = [plan('rich-plan-edit')];
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  await page.getByRole('button', { name: /^Proposta/ }).click();
  const review = page.getByRole('region', { name: 'Revisão do plano' });
  await review.getByRole('textbox', { name: 'Critério 1', exact: true }).fill('O usuário consulta protocolo e data da solicitação.');
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  const story = state.writes[0].content.epics[0].stories[0];
  expect(story.requirements.functionalCriteria).toEqual(story.acceptanceCriteria);
  expect(story.requirements.technicalCriteria).toEqual(requirements.technicalCriteria);
  expect(story.requirements.outputs).toEqual(requirements.outputs);
  expect(story.requirements.behavior).toEqual(requirements.behavior);
  await expect(review.getByRole('button', { name: 'Salvar revisão', exact: true })).toBeDisabled();
});

test('context search and all result pages preserve the selected destination and message draft', async ({ page }) => {
  const { state, systems } = await workspace(page);
  for (let index = 1; index <= 23; index++) systems.push(context(`other-${index}`, 'system', null, `Outro Sistema ${String(index).padStart(2, '0')}`));
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  const message = page.getByRole('textbox', { name: 'Sua mensagem', exact: true });
  await message.fill('Este rascunho deve continuar no Projeto A.');
  await page.getByRole('button', { name: 'Alterar contexto' }).click();
  const selector = page.locator('.analyst-context-lookup').first();
  await expect(selector.getByRole('combobox', { name: 'Sistema', exact: true })).toHaveValue('system-a');
  await expect(selector).toContainText('O contexto escolhido foi preservado fora desta página.');
  await selector.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page).toHaveURL(/context.system.page=2/);
  await expect(selector).toContainText('21–25 de 25 resultados');
  await selector.getByRole('searchbox', { name: 'Buscar Sistema' }).fill('Outro');
  await selector.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page).toHaveURL(/context.system.q=Outro/);
  await expect(selector).toContainText('23 resultado(s)');
  await expect(selector.getByRole('combobox', { name: 'Sistema', exact: true })).toHaveValue('system-a');
  await expect(selector).toContainText('O contexto escolhido foi preservado fora desta página.');
  await page.getByRole('button', { name: 'Concluir escolha' }).click();
  await expect(message).toHaveValue('Este rascunho deve continuar no Projeto A.');
  await page.reload();
  await expect(message).toHaveValue('Este rascunho deve continuar no Projeto A.');
  await page.getByRole('button', { name: 'Alterar contexto' }).click();
  await expect(selector.getByRole('searchbox', { name: 'Buscar Sistema' })).toHaveValue('Outro');
  await expect(selector.getByRole('combobox', { name: 'Sistema', exact: true })).toHaveValue('system-a');
  expect(state.writes).toHaveLength(0);
});

test('historical pages do not replace the current proposal and explicit historical selection is read only', async ({ page }) => {
  const { state } = await workspace(page);
  state.proposals = [plan('current', 'Consulta vigente'), ...Array.from({ length: 19 }, (_, index) => plan(`middle-${index}`, `Consulta anterior ${index}`)), plan('oldest', 'Consulta histórica')];
  await page.goto('/assistant?system=system-a&project=project-a&assistant.proposalsPage=2&assistant.view=proposal');
  await choosePersona(page);
  let coverage = await openCoverage(page);
  await expect(coverage).toContainText('Consulta vigente');
  await expect(coverage).not.toContainText('Consulta histórica');
  await page.getByRole('button', { name: 'Histórico de propostas', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar proposta', exact: true }).click();
  coverage = await openCoverage(page);
  await expect(coverage).toContainText('Consulta histórica');
  await expect(page.getByText('Proposta anterior em consulta.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Título da história', exact: true })).toBeDisabled();
  await expect(page).toHaveURL(/assistant.proposal=oldest/);
  await page.reload();
  coverage = await openCoverage(page);
  await expect(coverage).toContainText('Consulta histórica');
  await expect(page.getByText('Proposta anterior em consulta.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Título da história', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar à proposta atual', exact: true }).click();
  await expect(coverage).toContainText('Consulta vigente');
  await expect(page).not.toHaveURL(/assistant.proposal=/);
  expect(state.writes).toHaveLength(0);
});

test('an inactive System keeps consultation available and removes Project creation', async ({ page }) => {
  const { state, systems } = await workspace(page);
  systems[0].status = 'inactive';
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  await expect(page.getByText('Somente leitura.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Consultar Sistema responsável/ })).toHaveAttribute('href', '/systems/system-a?tab=planning');
  await page.getByRole('button', { name: 'Alterar contexto' }).click();
  await expect(page.getByRole('link', { name: 'Criar novo Projeto', exact: true })).toHaveCount(0);
  await expect(page.locator('.analyst-create-disabled')).toContainText('Sistema Sistema A está INACTIVE');
  await expect(page.getByRole('link', { name: 'Criar novo Sistema', exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test('a reduced mobile viewport keeps the focused message and Send visible without document scrolling', async ({ page }) => {
  const { state } = await workspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  const message = page.getByRole('textbox', { name: 'Sua mensagem', exact: true });
  await message.fill('Rascunho preservado com a área disponível reduzida.');
  await message.focus();
  // This only emulates the area available while a keyboard is open. It does
  // not exercise a native mobile keyboard or its browser-specific behavior.
  await page.setViewportSize({ width: 390, height: 500 });
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeFocused();
  const messageBounds = (await message.boundingBox())!;
  expect(messageBounds.y).toBeGreaterThanOrEqual(0);
  expect(messageBounds.y + messageBounds.height).toBeLessThanOrEqual(500);
  const unobscured = async (element: typeof message) => element.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  });
  expect(await unobscured(message)).toBe(true);
  const send = page.getByRole('button', { name: 'Enviar mensagem', exact: true });
  await send.scrollIntoViewIfNeeded();
  await expect(message).toBeFocused();
  await expect(send).toBeEnabled();
  expect(await unobscured(send)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(send).toBeFocused();
  const sendBounds = (await send.boundingBox())!;
  expect(sendBounds.y).toBeGreaterThanOrEqual(0);
  expect(sendBounds.y + sendBounds.height).toBeLessThanOrEqual(500);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/assistant-keyboard-area-390x500.png` });
  expect(state.writes).toHaveLength(0);
});

test('selected mobile chat exposes all global destinations in an accessible menu and restores ordinary navigation on exit', async ({ page }) => {
  const { state } = await workspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/assistant?system=system-a&project=project-a');
  await choosePersona(page);
  const message = page.getByRole('textbox', { name: 'Sua mensagem', exact: true });
  await message.fill('Rascunho antes de consultar outro destino.');
  const trigger = page.getByRole('button', { name: 'Abrir menu principal', exact: true });
  await expect(trigger).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Menu principal', exact: true });
  await expect(dialog).toBeVisible();
  const menu = dialog.getByRole('navigation', { name: 'Principal', exact: true });
  expect(await menu.getByRole('link').allTextContents()).toEqual(['Visão geral', 'Assistente', 'Sistemas', 'Releases', 'Integrações']);
  await expect(menu.getByRole('link', { name: 'Assistente', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole('link', { name: 'Sistemas', exact: true }).click();
  await expect(page).toHaveURL(/\/systems$/);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Sistemas', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(trigger).toBeVisible();
  await expect(message).toHaveValue('Rascunho antes de consultar outro destino.');
  expect(state.writes).toHaveLength(0);
});
