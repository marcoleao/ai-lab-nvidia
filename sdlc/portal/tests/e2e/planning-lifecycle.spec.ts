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
      if (fail) return send({error: kind==='epic'?{message:'Versão desatualizada. Consulte o estado atual.'}:'Versão desatualizada. Consulte o estado atual.'}, 409);
      const status = body.lifecycle || body.status;
      item = {...item, status, ...(kind === 'project' ? {projectLifecycle: status} : {}), version: item.version + 1};
      return send({item});
    }
    if (path === '/api/collections/items') return send({items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, extraCount: 0});
    if(path==='/api/items/planning-item/epic-execution'){
      const parentBlocked=parentLifecycle!=='active',blockers=parentBlocked?['Reative ou reabra o Projeto de origem para alterar o Épico.']:[],targets=item.status==='active'?['inactive','completed','cancelled']:['active'];
      return send({item:{id:item.id,name:item.name,version:item.version,recordedStatus:item.status,lifecycle:item.status},stories:{total:0,open:0,archived:0},openDescendants:0,archivedOpenDescendants:0,running:0,includesArchived:true,asOf:stamp,contextToken:`${item.version}:${item.status}:${parentLifecycle}`,actions:targets.map(target=>({target,label:target==='active'?(item.status==='inactive'?'Reativar':'Reabrir'):({inactive:'Inativar',completed:'Concluir',cancelled:'Cancelar'} as Record<string,string>)[target],reasonRequired:['completed','cancelled'].includes(target)||['completed','cancelled'].includes(item.status),blockers})),resume:{paused:0,eligible:0,blockers:['Nenhum trabalho pausado elegível na consulta.']}});
    }
    if (path.startsWith('/api/items/')) {
      const parentBlocked = kind === 'epic' && parentLifecycle !== 'active', writable = !parentBlocked && item.status === 'active';
      const readOnlyReason = parentBlocked ? `O Projeto Projeto de origem está ${parentLifecycle.toUpperCase()}. ${parentLifecycle === 'inactive' ? 'Reative o Projeto' : 'Reabra o Projeto em sua aba Execução'} para alterar esta árvore.` : item.status !== 'active' ? `O ${kind === 'system' ? 'Sistema' : kind === 'project' ? 'Projeto' : 'Épico'} está ${item.status.toUpperCase()}. Reative ou reabra para alterar sua árvore.` : null;
      return send({item, ancestors, hierarchy: {writable, reason: readOnlyReason}, readOnlyReason, capabilities: {canMutate: writable, canChangeLifecycle: !parentBlocked}, children: [], repositories: [], availableRepositories: [], environments: [], history: []});
    }
    return send({items: []});
  });
  await page.goto(`/${kind === 'system' ? 'systems' : kind === 'epic' ? 'epics' : 'projects'}/planning-item?tab=planning`);
  const card = kind==='epic'?page.locator('.epic-execution'):page.getByRole('region', {name:kind==='system'?'Ciclo do Sistema':'Ciclo do Projeto',exact:true});
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

test('Epic starts ACTIVE without a planning gate and exposes explicit Project planning',async({page})=>{
 const {card,writes,errors}=await fixture(page,'epic');await expect(card.locator('[aria-current=step]')).toHaveCount(0);await expect(card.getByRole('link',{name:'Acompanhar Histórias deste Épico →'})).toBeVisible();await card.getByText('Gerenciar ciclo do Épico',{exact:true}).click();await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeDisabled();await page.getByRole('combobox').first().selectOption('admin');await expect(page.getByRole('button',{name:'Aprovar épico',exact:true})).toHaveCount(0);await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeEnabled();await card.getByText('Planejar no Projeto · Projeto de origem',{exact:true}).click();await expect(card.getByRole('link',{name:'Abrir planejamento do Projeto Projeto de origem →'})).toHaveAttribute('href','/assistant?system=parent-system&project=parent-project');await page.reload();await expect(card).toBeVisible();expect(writes).toEqual([]);expect(errors).toEqual([]);
});
test('Epic transitions confirm explicitly and preserve versions and reason after definite rejection',async({page})=>{
 const state=await fixture(page,'epic'),{card}=state;await card.getByText('Gerenciar ciclo do Épico',{exact:true}).click();await page.getByRole('combobox').first().selectOption('qa');await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeDisabled();await page.getByRole('combobox').first().selectOption('admin');await card.getByRole('button',{name:'Inativar · INACTIVE',exact:true}).click();expect(state.writes).toHaveLength(0);await card.getByRole('button',{name:'Confirmar inativação',exact:true}).click();await expect(card.getByRole('button',{name:'Reativar · ACTIVE',exact:true})).toBeEnabled();await card.getByRole('button',{name:'Reativar · ACTIVE',exact:true}).click();await card.getByRole('button',{name:'Confirmar reativação',exact:true}).click();await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeEnabled();
 const comment='Todos os filhos deste agrupador foram encerrados.';await card.getByRole('textbox',{name:'Justificativa'}).fill(comment);state.setFail(true);await card.getByRole('button',{name:'Concluir · COMPLETED',exact:true}).click();await card.getByRole('button',{name:'Confirmar conclusão',exact:true}).click();await expect(card.getByRole('alert')).toBeVisible();await card.getByRole('button',{name:'Voltar sem alterar',exact:true}).click();await expect(card.getByRole('textbox')).toHaveValue(comment);state.setFail(false);await card.getByRole('button',{name:'Atualizar consulta do Épico'}).click();await card.getByRole('button',{name:'Concluir · COMPLETED',exact:true}).click();await card.getByRole('button',{name:'Confirmar conclusão',exact:true}).click();await expect(card.getByRole('button',{name:'Reabrir · ACTIVE',exact:true})).toBeDisabled();await card.getByRole('textbox').fill('Nova História exige reabertura.');await card.getByRole('button',{name:'Reabrir · ACTIVE',exact:true}).click();await card.getByRole('button',{name:'Confirmar reabertura',exact:true}).click();await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeEnabled();expect(state.writes.map(w=>w.body)).toEqual([{status:'inactive',expectedVersion:7},{status:'active',expectedVersion:8},{status:'completed',expectedVersion:9,comment},{status:'completed',expectedVersion:9,comment},{status:'active',expectedVersion:10,comment:'Nova História exige reabertura.'}]);expect(state.writes[2].headers['idempotency-key']).not.toBe(state.writes[3].headers['idempotency-key']);expect(state.errors).toEqual([]);
});
for(const parent of ['inactive','completed'])test(`Epic explains ${parent} ancestor and blocks mutations`,async({page})=>{const {card,writes}=await fixture(page,'epic','active',parent);await page.getByRole('combobox').first().selectOption('admin');await card.getByText('Gerenciar ciclo do Épico',{exact:true}).click();await expect(card).toContainText('Reative ou reabra o Projeto de origem');await expect(card.getByRole('textbox')).toBeDisabled();await expect(card.getByRole('button',{name:'Inativar · INACTIVE',exact:true})).toBeDisabled();await expect(page.getByTestId('edit-item')).toBeDisabled();await expect(page.getByTestId('create-item')).toBeDisabled();expect(writes).toEqual([]);});
