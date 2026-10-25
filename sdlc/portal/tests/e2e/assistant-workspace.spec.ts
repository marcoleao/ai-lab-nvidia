import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const now = '2026-10-24T13:00:00Z';
const context = (id: string, kind: string, parentId: string | null, name: string, extra: any = {}) => ({ id, kind, parentId, name, key: id.toUpperCase(), status: kind === 'system' ? 'active' : 'awaiting_approval', projectLifecycle: kind === 'project' ? 'planned' : undefined, archived: false, description: '', version: 1, data: {}, createdAt: now, updatedAt: now, ...extra });
const requirements = { version: 1, objective: 'Permitir ao solicitante consultar o resultado de sua solicitação.', actors: ['Solicitante autenticado'], inputs: [], outputs: [{ name: 'Resultado da solicitação', type: 'Texto', description: 'Situação e protocolo disponíveis para o solicitante.' }], businessRules: ['Consultar somente as próprias solicitações.'], functionalCriteria: ['O usuário consulta o resultado e o protocolo.'], technicalCriteria: ['O contrato deve validar o vínculo do usuário com a solicitação.'], dependencies: [], exceptions: ['Informar quando o protocolo não existir.'], nonFunctional: ['A interface deve permitir navegação por teclado.'], assumptions: ['A sessão do solicitante já está autenticada.'], outOfScope: ['Alterar solicitações já registradas.'], openQuestions: [] };

async function workspace(page: Page) {
  const systems = [context('system-a', 'system', null, 'Sistema A'), context('system-b', 'system', null, 'Sistema B')];
  const projects = [context('project-a', 'project', 'system-a', 'Projeto A'), context('project-b', 'project', 'system-b', 'Projeto B'), context('project-closed', 'project', 'system-a', 'Projeto encerrado', { projectLifecycle: 'completed' }), context('project-archived', 'project', 'system-a', 'Projeto arquivado', { archived: true })];
  const state = { proposals: [] as any[], turns: [] as any[], brief: { summary: '', confirmedFacts: [] as string[], openQuestions: [] as string[] }, writes: [] as any[] };
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') { state.writes.push(req.postDataJSON()); return route.fulfill({ json: { proposal: state.proposals[0] } }); }
    if (url.pathname === '/api/personas') return route.fulfill({ json: { personas: [{ id: 'admin', name: 'Admin', role: 'admin' }] } });
    if (url.pathname === '/api/items') return route.fulfill({ json: { items: systems } });
    if (url.pathname === '/api/collections/items') {
      const kind = url.searchParams.get('kind'), term = (url.searchParams.get('q') || '').toLocaleLowerCase('pt-BR');
      const items = (kind === 'system' ? systems : projects.filter(item => item.parentId === url.searchParams.get('parentId'))).filter(item => !item.archived && !['completed', 'cancelled'].includes(item.projectLifecycle || '') && (!term || `${item.key} ${item.name}`.toLocaleLowerCase('pt-BR').includes(term)));
      const total = items.length, current = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), Math.max(1, Math.ceil(total / 20)));
      return route.fulfill({ json: { items: items.slice((current - 1) * 20, current * 20), total, page: current, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)), extraCount: 0 } });
    }
    if (url.pathname === '/api/assistant') return route.fulfill({ json: { context: projects.find(item => item.id === url.searchParams.get('contextId')) || systems[0], session: { id: 'session', version: 1 }, turns: state.turns, proposals: state.proposals, availableRepositories: [], configured: true, model: 'isolated-model', requirementsMode: true, brief: state.brief } });
    const system = systems.find(item => item.id === url.pathname.split('/').at(-1));
    if (system) return route.fulfill({ json: { item: system, children: projects.filter(item => item.parentId === system.id), ancestors: [], repositories: [], availableRepositories: [], environments: [], history: [] } });
    const project = projects.find(item => item.id === url.pathname.split('/').at(-1));
    if (project) return route.fulfill({ json: { item: project, children: [], ancestors: systems.filter(item => item.id === project.parentId), repositories: [], availableRepositories: [], environments: [], history: [] } });
    return route.fulfill({ json: {} });
  });
  return { state, systems, projects };
}

test('Assistente is a main destination and Project choices depend on its selected System', async ({ page }) => {
  const { state } = await workspace(page);
  await page.goto('/assistant');
  const menu = page.getByRole('navigation', { name: 'Principal' });
  expect(await menu.getByRole('link').allTextContents()).toEqual(['Visão geral', 'Assistente', 'Sistemas', 'Releases', 'Integrações']);
  await expect(menu.getByRole('link', { name: 'Assistente', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.assistant-launcher')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const system = page.getByRole('combobox', { name: 'Sistema', exact: true }), project = page.getByRole('combobox', { name: 'Projeto', exact: true });
  await expect(project).toBeDisabled();
  await system.selectOption('system-a');
  await expect(project).toBeEnabled();
  expect(await project.locator('option').allTextContents()).toEqual(['Selecione um Projeto', 'PROJECT-A · Projeto A']);
  await project.selectOption('project-a');
  await expect(page).toHaveURL(/system=system-a&project=project-a/);
  await expect(page.getByRole('region', { name: 'Entrevista e planejamento' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Cobertura de requisitos' })).toContainText('Ainda não especificado');
  await page.reload();
  await expect(project).toHaveValue('project-a');
  await system.selectOption('system-b');
  await expect(project).toHaveValue('');
  await expect(project.locator('option')).toHaveCount(2);
  expect(await project.locator('option').allTextContents()).toContain('PROJECT-B · Projeto B');
  expect(state.writes).toHaveLength(0);
});

test('coverage uses structured requirements and the recorded interview questions without claiming completeness', async ({ page }) => {
  const { state } = await workspace(page);
  state.turns = [{ id: 'chat', kind: 'chat', input: 'Quero consultar uma solicitação.', output: 'Qual deve ser o comportamento para um protocolo inexistente?', status: 'succeeded', actorName: 'Admin', createdAt: now }];
  state.brief = { summary: 'Consulta pelo solicitante.', confirmedFacts: ['A consulta é feita pelo próprio usuário.'], openQuestions: ['Como apresentar um protocolo inexistente?'] };
  state.proposals = [{ id: 'rich-plan', version: 1, status: 'draft', projectVersion: 1, sessionVersion: 1, content: { summary: 'Plano para revisão humana.', epics: [{ title: 'Consulta', description: 'Consulta de solicitações.', stories: [{ title: 'Consultar uma solicitação', description: 'O solicitante consulta a situação e o protocolo de uma solicitação previamente registrada.', repositoryIds: [], acceptanceCriteria: requirements.functionalCriteria, requirements, tasks: [{ title: 'Implementar consulta', description: 'Implementar o contrato validando o vínculo do solicitante.', repositoryIds: [] }] }] }] }, appliedItemIds: [], createdAt: now }];
  await page.goto('/assistant?system=system-a&project=project-a');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  const coverage = page.getByRole('complementary', { name: 'Cobertura de requisitos' });
  await expect(coverage.getByText('Sem entradas declaradas')).toBeVisible();
  await expect(coverage.getByText('Sem dependências declaradas')).toBeVisible();
  await expect(coverage).toContainText('Presença de campos não significa completude');
  await expect(coverage.getByText('Como apresentar um protocolo inexistente?')).toBeVisible();
  const directory = process.env.SCREENSHOT_DIR || 'test-results/screenshots'; mkdirSync(directory, { recursive: true });
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/assistant-workspace-${width}.png`, fullPage: true }); }
  await page.getByRole('button', { name: /2 · Propostas e confirmação/ }).click();
  await expect(page.getByRole('button', { name: 'Gerar proposta para revisão', exact: true })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test('editing functional criteria preserves the technical requirements and their matching contract', async ({ page }) => {
  const { state } = await workspace(page);
  state.proposals = [{ id: 'rich-plan-edit', version: 1, status: 'draft', projectVersion: 1, sessionVersion: 1, content: { summary: 'Proposta detalhada.', epics: [{ title: 'Consulta', description: 'Consulta de solicitações.', stories: [{ title: 'Consultar uma solicitação', description: 'O solicitante consulta a situação e o protocolo de uma solicitação previamente registrada.', repositoryIds: [], acceptanceCriteria: [...requirements.functionalCriteria], requirements: structuredClone(requirements), tasks: [{ title: 'Implementar consulta', description: 'Implementar o contrato validando o vínculo do solicitante.', repositoryIds: [] }] }] }] }, appliedItemIds: [], createdAt: now }];
  await page.goto('/assistant?system=system-a&project=project-a');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await page.getByRole('button', { name: /2 · Propostas e confirmação/ }).click();
  const review = page.getByRole('region', { name: 'Revisão do plano' });
  await review.getByText('História 1:', { exact: false }).click();
  await review.getByRole('textbox', { name: 'Critério 1', exact: true }).fill('O usuário consulta protocolo e data da solicitação.');
  await review.getByRole('button', { name: 'Salvar revisão', exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  const story = state.writes[0].content.epics[0].stories[0];
  expect(story.requirements.functionalCriteria).toEqual(story.acceptanceCriteria);
  expect(story.requirements.technicalCriteria).toEqual(requirements.technicalCriteria);
  expect(story.requirements.outputs).toEqual(requirements.outputs);
});
