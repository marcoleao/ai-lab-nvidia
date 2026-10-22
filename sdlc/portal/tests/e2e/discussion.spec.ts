import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Discussion fixtures require the isolated test environment');

test('impediment conversation preserves history and confirms an explicit decision with safe retries and a new G1', async ({ page, request }) => {
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const now = new Date().toISOString();
  const item = { id: 'discussion-ui-only', kind: 'story', key: 'UI-DS1', name: 'Discussão exclusiva do teste', description: '', status: 'coding', version: 4, archived: false, parentId: 'ui-epic', data: { acceptanceCriteria: ['Resultado validado pela pessoa.'] }, createdAt: now, updatedAt: now };
  let run: any = { id: 'discussion-run-ui', state: 'waiting_input', stage: 'discussion', error: 'A estratégia precisa de orientação do usuário.', branch: null, mergeRequestUrl: null, commitSha: null, specification: null, createdAt: now, updatedAt: now };
  let data: any = { version: 1, messages: [{ id: 'previous-failure', role: 'assistant', content: 'Qual alternativa você prefere?', state: 'failed', createdAt: now }], proposal: null, allowDependencies: false };
  let messageKey = '', preparationKey = '', decisionKey = '', messageCount = 0, preparationCount = 0, decisionCount = 0;
  await page.route('**/api/items/discussion-ui-only', route => route.fulfill({ json: { item, ancestors: [], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  await page.route('**/api/items/discussion-ui-only/execution', route => route.fulfill({ json: { run, configured: true } }));
  await page.route('**/api/executions/discussion-run-ui/*', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/discussion')) return route.fulfill({ json: data });
    expect(req.headers()['x-persona']).toBe('admin');
    if (path.endsWith('/messages')) {
      if (req.postDataJSON().intent === 'prepare_decision') {
        expect(req.postDataJSON()).toEqual({ expectedVersion: 3, intent: 'prepare_decision' }); preparationCount++;
        if (!preparationKey) {
          preparationKey = req.headers()['idempotency-key']; expect(preparationKey).toBeTruthy();
          data = { ...data, version: 4, proposal: { ...data.proposal, ready: true } };
          return route.abort();
        }
        expect(req.headers()['idempotency-key']).toBe(preparationKey);
        return route.fulfill({ json: { accepted: true } });
      }
      expect(req.postDataJSON()).toEqual({ message: 'Prefiro a alternativa com uma nova dependência.', expectedVersion: 1 }); messageCount++;
      if (!messageKey) {
        messageKey = req.headers()['idempotency-key']; expect(messageKey).toBeTruthy();
        data = { ...data, version: 2, messages: [...data.messages, { id: 'user-message', role: 'user', content: req.postDataJSON().message, state: 'succeeded', createdAt: now }] };
        return route.abort();
      }
      expect(req.headers()['idempotency-key']).toBe(messageKey);
      data = { ...data, version: 3, messages: [...data.messages, { id: 'agent-reply', role: 'assistant', content: 'Podemos adicionar a dependência escolhida e revisar o contrato.', state: 'succeeded', createdAt: now }], proposal: { ready: false, summary: 'Adicionar a dependência escolhida para atender à decisão.', requestedCapabilities: ['dependencies'] } };
      run = { ...run, state: 'waiting_input', stage: 'discussion', error: null };
      return route.fulfill({ json: { accepted: true } });
    }
    expect(path.endsWith('/resolve')).toBe(true);
    expect(req.postDataJSON()).toEqual({ expectedVersion: 4, confirmed: true, allowDependencies: true }); decisionCount++;
    if (!decisionKey) {
      decisionKey = req.headers()['idempotency-key']; expect(decisionKey).toBeTruthy();
      data = { ...data, version: 5, allowDependencies: true };
      item.status = 'specification'; item.version++;
      run = { ...run, state: 'waiting_approval', stage: 'gate', specification: { requirements: 'Requisitos revisados após a conversa.', architecture: 'Arquitetura revisada.', testCases: [{ criterionIndex: 0, description: 'Conferir o resultado da nova decisão.' }], risks: [] } };
      return route.abort();
    }
    expect(req.headers()['idempotency-key']).toBe(decisionKey);
    return route.fulfill({ json: { accepted: true } });
  });
  await page.goto('/stories/discussion-ui-only');
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  const execution = page.getByRole('region', { name: 'Execução assistida da história' });
  const conversation = page.getByRole('region', { name: 'Conversa sobre impedimento' });
  await expect(conversation.getByRole('button', { name: 'Enviar para a assistente' })).toBeDisabled();
  await expect(conversation.getByRole('button', { name: 'Preparar decisão para revisão' })).toBeDisabled();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await expect(conversation.getByText(/a rodada falhou/)).toBeVisible();
  await conversation.getByRole('textbox', { name: 'Sua mensagem sobre o impedimento' }).fill('Prefiro a alternativa com uma nova dependência.');
  await conversation.getByRole('button', { name: 'Enviar para a assistente' }).click();
  await conversation.getByRole('button', { name: 'Verificar envio da mensagem' }).click();
  expect(messageCount).toBe(2);
  await expect(conversation.getByText('Podemos adicionar a dependência escolhida e revisar o contrato.')).toBeVisible();
  await expect(conversation.getByRole('button', { name: 'Confirmar decisão e revisar especificação' })).toHaveCount(0);
  await conversation.getByRole('button', { name: 'Preparar decisão para revisão' }).click();
  await conversation.getByRole('button', { name: 'Verificar preparação da decisão' }).click();
  expect(preparationCount).toBe(2);
  await expect(conversation.getByRole('button', { name: 'Confirmar decisão e revisar especificação' })).toBeDisabled();
  await conversation.getByRole('checkbox', { name: /Autorizo adicionar dependências/ }).check();
  mkdirSync(process.env.SCREENSHOT_DIR || '/output', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/output'}/execution-discussion-${width}.png`, fullPage: true });
  }
  await conversation.getByRole('button', { name: 'Confirmar decisão e revisar especificação' }).click();
  await expect(execution.getByRole('button', { name: 'Aprovar G1 e gerar código' })).toBeDisabled({ timeout: 10000 });
  await conversation.getByRole('button', { name: 'Verificar confirmação da decisão' }).click();
  expect(decisionCount).toBe(2);
  await expect(execution.getByRole('button', { name: 'Aprovar G1 e gerar código' })).toBeDisabled();
  await expect(execution.getByText('Requisitos revisados após a conversa.')).toBeVisible();
  expect(data.messages.filter((message: any) => message.role === 'user')).toHaveLength(1);
});
