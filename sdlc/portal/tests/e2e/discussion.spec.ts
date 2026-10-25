import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {uiJourney,uiAction,openWorkPanel,mockTaskCollection} from './journey-fixtures';
test.beforeEach(async({page})=>mockTaskCollection(page,()=>[]));
if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Discussion fixtures require the isolated test environment');

test('impediment conversation preserves history and confirms an explicit decision with safe retries and a new G1', async ({ page, request }) => {
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const now = new Date().toISOString();
  const item = { id: 'discussion-ui-only', kind: 'story', key: 'UI-DS1', name: 'Discussão exclusiva do teste', description: '', status: 'coding', version: 4, archived: false, parentId: 'ui-epic', data: { acceptanceCriteria: ['Resultado validado pela pessoa.'] }, createdAt: now, updatedAt: now };
  let run: any = { id: 'discussion-run-ui', state: 'waiting_input', stage: 'discussion', error: 'A estratégia precisa de orientação do usuário.', branch: null, mergeRequestUrl: null, commitSha: null, specification: null, createdAt: now, updatedAt: now };
  let data: any = { version: 1, messages: [{ id: 'previous-failure', role: 'assistant', content: 'Qual alternativa você prefere?', state: 'failed', createdAt: now }], proposal: null, allowDependencies: false };
  let messageKey = '', preparationKey = '', decisionKey = '', messageCount = 0, preparationCount = 0, decisionCount = 0;
  await page.route(url => url.pathname === '/api/items/discussion-ui-only', route => route.fulfill({ json: { item, ancestors: [], children: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  await page.route('**/api/items/discussion-ui-only/execution', route => route.fulfill({ json: { run, configured: true } }));
  await page.route('**/api/items/discussion-ui-only/journey',route=>route.fulfill({json:uiJourney(item,run,{current:run.state==='waiting_approval'?{kind:'specification',state:'waiting_approval',title:'Especificação pronta; G1 aguarda sua decisão'}:{kind:'coding',state:run.state,title:'A atividade precisa da sua orientação',message:run.error},nextAction:run.state==='waiting_approval'?uiAction('approve','Aprovar G1 e gerar código','/api/executions/discussion-run-ui/approve',{expectedVersion:item.version},{title:'Aprovar especificação G1',description:'Revise a nova especificação antes de aprovar.',checkboxLabel:'Revisei a especificação e autorizo gerar o código.'}):null,chat:{mode:'execution',executionId:run.id,enabled:run.state!=='waiting_approval',guidance:'Esclareça a decisão; mudanças exigem confirmação e novo G1.'}})}));
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
  const panel=await openWorkPanel(page);
  await panel.getByRole('button',{name:'Conversa',exact:true}).click();
  const conversation = page.getByRole('region', { name: 'Conversa sobre impedimento' });
  await expect(conversation.getByRole('button', { name: 'Enviar para a assistente' })).toBeDisabled();
  await expect(conversation.getByRole('button', { name: 'Preparar decisão para revisão' })).toBeDisabled();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await expect(conversation.getByText(/a rodada falhou/)).toBeVisible();
  await conversation.getByRole('textbox', { name: 'Sua mensagem sobre o impedimento' }).fill('Prefiro a alternativa com uma nova dependência.');
  await panel.getByRole('button',{name:'Próxima ação',exact:true}).click();
  await expect(conversation).toBeHidden();
  await panel.getByRole('button',{name:'Conversa',exact:true}).click();
  await expect(conversation.getByRole('textbox', { name: 'Sua mensagem sobre o impedimento' })).toHaveValue('Prefiro a alternativa com uma nova dependência.');
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
  await expect(page.getByTestId('story-journey-header')).toContainText('G1 aguarda sua decisão',{timeout:10000});
  await conversation.getByRole('button', { name: 'Verificar confirmação da decisão' }).click();
  expect(decisionCount).toBe(2);
  await panel.getByRole('button',{name:'Próxima ação',exact:true}).click();
  await panel.getByRole('button',{name:'Aprovar G1 e gerar código',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Confirmar: Aprovar G1 e gerar código',exact:true})).toBeDisabled();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Especificação',exact:true}).click();
  await expect(page.getByText('Requisitos revisados após a conversa.',{exact:true})).toBeVisible();
  expect(data.messages.filter((message: any) => message.role === 'user')).toHaveLength(1);
});
