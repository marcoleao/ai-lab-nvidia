import { test, expect } from '@playwright/test';

if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Validation retry fixtures require the isolated test environment');

test('legacy validation failure resumes technical correction without repeating user choices or G1', async ({ page, request }) => {
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const now = new Date().toISOString();
  const item = { id: 'validation-retry-ui', kind: 'story', key: 'UI-VR1', name: 'Correção técnica exclusiva do teste', description: '', status: 'coding', version: 7, archived: false, parentId: 'ui-epic', data: { acceptanceCriteria: ['Preservar o comportamento escolhido.'] }, createdAt: now, updatedAt: now };
  const specification = { requirements: 'Manter a escolha confirmada pelo usuário.', architecture: 'Usar a abordagem aprovada no G1.', testCases: [{ criterionIndex: 0, description: 'Conferir o comportamento já aprovado.' }], risks: [] };
  const discussion = { version: 4, messages: [{ id: 'chosen-option', role: 'user', content: 'Mantenha a alternativa que escolhi e as autorizações existentes.', state: 'succeeded', createdAt: now }], proposal: null, allowDependencies: true };
  let run: any = { id: 'validation-run-ui', state: 'waiting_input', stage: 'generation', error: 'Patch contém caminho não permitido ou duplicado.', technicalRetryAvailable: true, validationIssues: [{ path: 'src/application.config.ts', code: 'PATCH_CONTAINS_PATH', message: 'Caminho rejeitado pela validação anterior.' }], discussionVersion: 4, specification, branch: null, commitSha: null, mergeRequestUrl: null, createdAt: now, updatedAt: now };
  const writes: string[] = [];
  let key = '';
  await page.route('**/api/items/validation-retry-ui', route => route.fulfill({ json: { item, ancestors: [], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  await page.route('**/api/items/validation-retry-ui/execution', route => route.fulfill({ json: { run, configured: true } }));
  await page.route('**/api/executions/validation-run-ui/*', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'GET' && path.endsWith('/discussion')) return route.fulfill({ json: discussion });
    writes.push(path);
    expect(path).toBe('/api/executions/validation-run-ui/retry');
    expect(req.method()).toBe('POST');
    expect(req.headers()['x-persona']).toBe('admin');
    expect(req.postDataJSON()).toEqual({});
    if (!key) {
      key = req.headers()['idempotency-key']; expect(key).toBeTruthy();
      run = { ...run, state: 'queued', stage: 'generation', error: null, technicalRetryAvailable: false, validationIssues: [] };
      return route.abort();
    }
    expect(req.headers()['idempotency-key']).toBe(key);
    return route.fulfill({ json: { run } });
  });
  await page.goto('/stories/validation-retry-ui');
  const panel = page.getByRole('region', { name: 'Execução assistida da história' });
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  await expect(panel.getByRole('button', { name: 'Retomar correção técnica' })).toBeDisabled();
  await expect(panel.getByRole('heading', { name: 'Diagnóstico da validação' })).toBeVisible();
  await expect(panel.getByText('src/application.config.ts', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await panel.getByRole('button', { name: 'Retomar correção técnica' }).click();
  await expect(panel.getByText('QUEUED', { exact: true })).toBeVisible({ timeout: 10000 });
  await panel.getByRole('button', { name: 'Confirmar solicitação de correção técnica' }).click();
  expect(writes).toEqual(['/api/executions/validation-run-ui/retry', '/api/executions/validation-run-ui/retry']);
  await expect(panel.getByText('Manter a escolha confirmada pelo usuário.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Aprovar G1 e gerar código' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Confirmar solicitação de correção técnica' })).toHaveCount(0);
  expect(item.version).toBe(7);
  expect(discussion.allowDependencies).toBe(true);
  expect(discussion.version).toBe(4);
  expect(discussion.messages).toHaveLength(1);
});
