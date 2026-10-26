import {test, expect, type Page} from '@playwright/test';

async function fixture(page: Page, kind = 'system', initial = 'active', parentLifecycle = 'active') {
  const stamp = '2026-10-24T15:00:00.000Z';
  let item = {id: 'planning-item', key: 'PLAN', name: 'Planejamento isolado', kind, status: initial, projectLifecycle: kind === 'project' ? initial : undefined, description: 'Somente dados interceptados.', parentId: kind === 'system' ? null : kind === 'project' ? 'parent-system' : 'parent-project', archived: false, version: 7, data: {}, createdAt: stamp, updatedAt: stamp};
  const system = {...item, id: 'parent-system', kind: 'system', status: 'active', name: 'Sistema de origem', parentId: null};
  const ancestors = kind === 'epic' ? [system, {...item, id: 'parent-project', kind: 'project', projectLifecycle: parentLifecycle, status: parentLifecycle, name: 'Projeto de origem', parentId: 'parent-system'}] : kind === 'project' ? [system] : [];
  let fail = false, hold: Promise<void> | null = null;
  const writes: {body: any; headers: Record<string, string>; path: string}[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const send = (json: unknown, status = 200) => route.fulfill({json, status});
    if (path === '/api/personas') return send({personas: [{id: 'admin', name: 'Admin', role: 'admin'}, {id: 'qa', name: 'QA', role: 'qa_lead'}]});
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); writes.push({body, path, headers: request.headers()});
      if (hold) await hold;
      if (fail) return send({error: 'Versão desatualizada. Consulte o estado atual.'}, 409);
      const status = body.lifecycle || body.status;
      item = {...item, status, ...(kind === 'project' ? {projectLifecycle: status} : {}), version: item.version + 1};
      return send({item});
    }
    if (path === '/api/collections/items') return send({items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, extraCount: 0});
    if (path.startsWith('/api/items/')) {
      const parentBlocked = kind === 'epic' && parentLifecycle !== 'active', writable = !parentBlocked && item.status === 'active';
      const readOnlyReason = parentBlocked ? `O Projeto Projeto de origem está ${parentLifecycle.toUpperCase()}. ${parentLifecycle === 'inactive' ? 'Reative o Projeto' : 'Reabra o Projeto em sua aba Execução'} para alterar esta árvore.` : item.status !== 'active' ? `O ${kind === 'system' ? 'Sistema' : kind === 'project' ? 'Projeto' : 'Épico'} está ${item.status.toUpperCase()}. Reative ou reabra para alterar sua árvore.` : null;
      return send({item, ancestors, hierarchy: {writable, reason: readOnlyReason}, readOnlyReason, capabilities: {canMutate: writable, canChangeLifecycle: !parentBlocked}, children: [], repositories: [], availableRepositories: [], environments: [], history: []});
    }
    return send({items: []});
  });
  await page.goto(`/${kind === 'system' ? 'systems' : kind === 'epic' ? 'epics' : 'projects'}/planning-item?tab=planning`);
  const card = page.getByRole('region', {name: kind === 'system' ? 'Ciclo do Sistema' : kind === 'epic' ? 'Ciclo do Épico' : 'Ciclo do Projeto', exact: true});
  await expect(card).toBeVisible();
  await expect(page.getByRole('navigation', {name: `Seções de ${kind === 'system' ? 'Sistema' : kind === 'epic' ? 'Épico' : 'Projeto'}`}).getByRole('link', {name: 'Execução', exact: true})).toHaveAttribute('aria-current', 'page');
  return {card, writes, errors, setFail: (value: boolean) => {fail = value;}, setHold: (value: Promise<void> | null) => {hold = value;}};
}

test('System planning preserves roles, loading, conflict recovery, audit headers and current versions', async ({page}) => {
  const state = await fixture(page), {card} = state;
  const action = card.getByRole('button');
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  await expect(card.locator('li')).toHaveText(['ACTIVE', 'INACTIVE']);
  await expect(action).toBeDisabled();
  await page.getByRole('combobox').first().selectOption('qa'); await expect(action).toBeDisabled();
  await page.getByRole('combobox').first().selectOption('admin'); await expect(action).toBeEnabled();
  let release!: () => void; state.setHold(new Promise<void>(resolve => {release = resolve;})); state.setFail(true);
  await action.click(); await expect(card.locator('.experience-spinner')).toBeVisible(); await expect(action).toBeDisabled();
  release(); await expect(card.getByRole('alert')).toContainText('Versão desatualizada');
  await expect(card.getByRole('alert')).toHaveCSS('color', 'rgb(178, 61, 50)');
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  state.setFail(false); state.setHold(null); await action.click();
  await expect(card.locator('[aria-current=step]')).toHaveText('INACTIVE');
  await expect(card.getByRole('status')).toContainText('Sistema inativado');
  await card.getByRole('button', {name: 'Reativar · ACTIVE', exact: true}).click();
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  expect(state.writes.map(write => write.body)).toEqual([{status: 'inactive', expectedVersion: 7}, {status: 'inactive', expectedVersion: 7}, {status: 'active', expectedVersion: 8}]);
  expect(state.writes.every(write => write.path === '/api/items/planning-item/status' && write.headers['x-persona'] === 'admin' && !!write.headers['idempotency-key'])).toBe(true);
  expect(state.writes[0].headers['idempotency-key']).toBe(state.writes[1].headers['idempotency-key']);
  expect(state.errors).toEqual([]);
});

test('Project groups work with four lifecycle states, no approval and explicit self-reactivation', async ({page}) => {
  const {card, writes, errors} = await fixture(page, 'project');
  await page.getByRole('combobox').first().selectOption('admin');
  await expect(card.getByRole('button', {name: 'Iniciar'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Aprovar projeto',exact:true})).toHaveCount(0);
  await expect(card.locator('li')).toHaveText(['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED']);
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  await expect(card.getByRole('button', {name: 'Inativar · INACTIVE', exact: true})).toBeEnabled();
  await expect(card.getByRole('button', {name: 'Concluir · COMPLETED', exact: true})).toBeDisabled();
  await expect(card.getByRole('button', {name: 'Cancelar · CANCELLED', exact: true})).toBeDisabled();
  await card.getByRole('textbox', {name: 'Justificativa'}).fill('Encerramento com motivo verificável.');
  await expect(card.getByRole('button', {name: 'Concluir · COMPLETED', exact: true})).toBeEnabled();
  await expect(card.getByRole('button', {name: 'Cancelar · CANCELLED', exact: true})).toBeEnabled();
  await card.getByRole('textbox', {name: 'Justificativa'}).fill('');
  await card.getByRole('button', {name: 'Inativar · INACTIVE', exact: true}).click();
  await expect(card.locator('[aria-current=step]')).toHaveText('INACTIVE');
  await expect(page.getByTestId('edit-item')).toBeDisabled(); await expect(page.getByTestId('create-item')).toBeDisabled();
  await card.getByRole('button', {name: 'Reativar · ACTIVE', exact: true}).click();
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  await expect(page.getByTestId('edit-item')).toBeEnabled();
  expect(writes.map(write => write.body)).toEqual([{lifecycle:'inactive',expectedVersion:7},{lifecycle:'active',expectedVersion:8}]);
  expect(writes.every(write => write.path === '/api/items/planning-item/lifecycle')).toBe(true); expect(errors).toEqual([]);
});

test('Project reopening requires justification, preserves it after failure and disables edits for readonly roles', async ({page}) => {
  const state = await fixture(page, 'project', 'completed'), {card} = state;
  const input = card.getByRole('textbox'), action = card.getByRole('button');
  await expect(input).toBeDisabled();
  await page.getByRole('combobox').first().selectOption('admin');
  await input.fill('Curta'); await expect(action).toBeDisabled();
  const comment = 'Retomar o planejamento por novo escopo.'; await input.fill(comment);
  state.setFail(true); await action.click(); await expect(card.getByRole('alert')).toBeVisible(); await expect(input).toHaveValue(comment);
  await page.getByRole('combobox').first().selectOption('qa'); await expect(input).toBeDisabled(); await expect(input).toHaveValue(comment);
  await page.getByRole('combobox').first().selectOption('admin'); state.setFail(false); await action.click();
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  expect(state.writes[1].body).toEqual({lifecycle: 'active', expectedVersion: 7, comment});
  expect(state.writes[1].path).toBe('/api/items/planning-item/lifecycle'); expect(state.errors).toEqual([]);
});

test('Epic starts ACTIVE without a planning gate and preserves the assistant ancestor scope', async ({page}) => {
  const {card, writes, errors} = await fixture(page, 'epic');
  await expect(card.locator('li')).toHaveText(['ACTIVE', 'INACTIVE', 'COMPLETED', 'CANCELLED']);
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeDisabled();
  await page.getByRole('combobox').first().selectOption('admin');
  await expect(page.getByRole('button', {name: 'Aprovar épico', exact: true})).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Iniciar'})).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeEnabled();
  await expect(page.getByRole('link', {name: 'Abrir Assistente neste contexto'})).toHaveAttribute('href', '/assistant?system=parent-system&project=parent-project');
  await page.reload(); await expect(card).toBeVisible();
  await expect(page.getByRole('navigation', {name: 'Seções de Épico'}).getByRole('link', {name: 'Execução', exact: true})).toHaveAttribute('aria-current', 'page');
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test('Epic transitions preserve permission, versions, errors and reopening justification', async ({page}) => {
  const state = await fixture(page, 'epic'), {card} = state;
  await page.getByRole('combobox').first().selectOption('admin');
  await page.getByRole('combobox').first().selectOption('qa'); await expect(card.getByRole('button', {name:'Inativar · INACTIVE',exact:true})).toBeDisabled();
  await page.getByRole('combobox').first().selectOption('admin'); await card.getByRole('button', {name: 'Inativar · INACTIVE', exact:true}).click();
  await expect(card.locator('[aria-current=step]')).toHaveText('INACTIVE');
  await card.getByRole('button', {name:'Reativar · ACTIVE',exact:true}).click(); await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  const comment='Todos os filhos deste agrupador foram encerrados.';await card.getByRole('textbox').fill(comment);
  state.setFail(true); await card.getByRole('button', {name: 'Concluir · COMPLETED',exact:true}).click(); await expect(card.getByRole('alert')).toBeVisible();
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');await expect(card.getByRole('textbox')).toHaveValue(comment);state.setFail(false);
  await card.getByRole('button', {name: 'Concluir · COMPLETED',exact:true}).click(); await expect(card.locator('[aria-current=step]')).toHaveText('COMPLETED');
  await expect(card.getByRole('button')).toBeDisabled();await card.getByRole('textbox').fill('Nova História exige reabertura.');
  await card.getByRole('button', {name: 'Reabrir · ACTIVE',exact:true}).click(); await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  expect(state.writes.map(write => [write.path, write.body])).toEqual([
    ['/api/items/planning-item/status', {status: 'inactive', expectedVersion: 7}],
    ['/api/items/planning-item/status', {status: 'active', expectedVersion: 8}],
    ['/api/items/planning-item/status', {status: 'completed', expectedVersion: 9, comment}],
    ['/api/items/planning-item/status', {status: 'completed', expectedVersion: 9, comment}],
    ['/api/items/planning-item/status', {status: 'active', expectedVersion: 10, comment: 'Nova História exige reabertura.'}],
  ]);
  expect(state.writes[2].headers['idempotency-key']).toBe(state.writes[3].headers['idempotency-key']);
  await page.setViewportSize({width: 390, height: 844}); await expect(card).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(state.errors).toEqual([]);
});

test('Epic planning explains closed Project and blocks changes until its reopening', async ({page}) => {
  const {card, writes} = await fixture(page, 'epic', 'completed', 'completed');
  await page.getByRole('combobox').first().selectOption('admin');
  await expect(page.getByRole('status').filter({hasText:'Reabra o Projeto em sua aba Execução'})).toBeVisible();
  await expect(card.getByRole('button')).toBeDisabled(); await expect(card.getByRole('textbox')).toBeDisabled();
  await expect(page.getByTestId('edit-item')).toBeDisabled(); await expect(page.getByTestId('create-item')).toBeDisabled();
  expect(writes).toEqual([]);
});

test('Inactive ancestor keeps an active Epic queryable and blocks lifecycle and child editing', async ({page}) => {
  const {card,writes,errors}=await fixture(page,'epic','active','inactive');
  await page.getByRole('combobox').first().selectOption('admin');
  await expect(card.locator('[aria-current=step]')).toHaveText('ACTIVE');
  await expect(page.getByRole('status').filter({hasText:'Reative o Projeto'})).toBeVisible();
  for(const button of await card.getByRole('button').all())await expect(button).toBeDisabled();
  await expect(card.getByRole('textbox')).toBeDisabled(); await expect(page.getByTestId('edit-item')).toBeDisabled();await expect(page.getByTestId('create-item')).toBeDisabled();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
