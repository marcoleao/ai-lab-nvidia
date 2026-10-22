import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Story execution fixtures require the isolated test environment');

test('story execution prepares specification, requires G1, recovers uncertain requests and links the MR', async ({ page, request }) => {
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const now = new Date().toISOString();
  const item = { id: 'execution-ui-only', kind: 'story', key: 'UI-ST1', name: 'História exclusiva do teste de execução', description: 'Fixture somente no navegador.', status: 'specification', version: 1, archived: false, parentId: 'epic-ui-only', data: { acceptanceCriteria: ['A pessoa consulta o resultado solicitado.'] }, createdAt: now, updatedAt: now };
  const specification = { requirements: 'Implementar a consulta descrita no critério de aceite.', architecture: 'Usar o repositório selecionado e preservar os contratos existentes.', testCases: [{ criterionIndex: 0, description: 'Consultar e conferir o resultado solicitado.' }], risks: ['Conferir o contrato com o serviço externo.'] };
  let run: any = null;
  let preparationKey = '', resumeKey = '', preparationRequests = 0, resumeRequests = 0;
  await page.route('**/api/items/execution-ui-only', route => route.fulfill({ json: { item, ancestors: [], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  await page.route('**/api/items/execution-ui-only/execution', async route => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { run, configured: true } });
    expect(req.headers()['x-persona']).toBe('admin');
    expect(req.postDataJSON()).toEqual({ expectedVersion: 1 });
    preparationRequests++;
    if (!preparationKey) {
      preparationKey = req.headers()['idempotency-key'];
      expect(preparationKey).toBeTruthy();
      run = { id: 'execution-run-ui', state: 'queued', stage: 'specification', error: null, specification: null, branch: null, mergeRequestUrl: null, commitSha: null, createdAt: now, updatedAt: now };
      return route.abort();
    }
    expect(req.headers()['idempotency-key']).toBe(preparationKey);
    run = { ...run, state: 'waiting_approval', stage: 'gate', specification };
    return route.fulfill({ json: { run } });
  });
  await page.route('**/api/executions/execution-run-ui/*', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    expect(req.headers()['x-persona']).toBe('admin');
    if (path.endsWith('/approve')) {
      expect(req.postDataJSON()).toEqual({ expectedVersion: item.version });
      item.status = 'coding'; item.version++;
      run = { ...run, state: 'failed', stage: 'generation', error: 'Falha transitória exclusiva da fixture.' };
      return route.fulfill({ json: { run } });
    }
    expect(path.endsWith('/retry')).toBe(true);
    expect(req.postDataJSON()).toEqual({}); resumeRequests++;
    if (!resumeKey) { resumeKey = req.headers()['idempotency-key']; return route.abort(); }
    expect(req.headers()['idempotency-key']).toBe(resumeKey);
    item.status = 'code_review'; item.version++;
    run = { ...run, state: 'succeeded', stage: 'completed', error: null, branch: 'sdlc/ui-story-execution', commitSha: 'c'.repeat(40), mergeRequestUrl: 'http://127.0.0.1:3180/test-only/product/-/merge_requests/7' };
    return route.fulfill({ json: { run } });
  });
  await page.goto('/stories/execution-ui-only');
  const panel = page.getByRole('region', { name: 'Execução assistida da história' });
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  await expect(panel.getByRole('button', { name: 'Preparar execução', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await panel.getByRole('button', { name: 'Preparar execução', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirmar solicitação de preparação' }).click();
  expect(preparationRequests).toBe(2);
  await expect(panel.getByRole('heading', { name: 'Requisitos propostos' })).toBeVisible();
  await expect(panel.getByText('Critério 1:', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Aprovar G1 e gerar código' })).toBeDisabled();
  mkdirSync(process.env.SCREENSHOT_DIR || '/output', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/output'}/story-execution-${width}.png`, fullPage: true });
  }
  await panel.getByRole('checkbox', { name: /Revisei a especificação/ }).check();
  await panel.getByRole('button', { name: 'Aprovar G1 e gerar código' }).click();
  await expect(panel.getByRole('button', { name: 'Retomar execução', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Cancelar e voltar à especificação' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Retomar execução', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirmar solicitação de retomada' }).click();
  expect(resumeRequests).toBe(2);
  await expect(panel.getByRole('link', { name: 'Abrir Merge Request no GitLab' })).toHaveAttribute('href', 'http://127.0.0.1:3180/test-only/product/-/merge_requests/7');
  await expect(panel.getByText('sdlc/ui-story-execution', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Preparar nova execução' })).toHaveCount(0);
});
