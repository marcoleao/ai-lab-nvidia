import {test,expect} from '@playwright/test';

const observed=new WeakMap();
const main=page=>page.getByRole('main');
const workflow=page=>page.locator('#workflow-actions');
const release=(id,tab='overview')=>`#/release/${id}/${tab}`;
const action=(page,name)=>workflow(page).locator(`[data-release-action="${name}"]`);
const cards=page=>page.getByTestId('release-overview-card');
const included=page=>page.getByTestId('release-composition').locator('.release-story-group [data-release-action="inspect-story"]');
const candidateRows=page=>page.locator('[data-query-id="candidate"]');
const pickerRows=page=>page.getByTestId('release-planning-row');
const selected=page=>page.getByTestId('planning-selected-count');
const choose=(page,id)=>page.locator(`input[data-plan-story="${id}"]`);
const collection=page=>page.locator('[data-query-id="releases"]');
const next=scope=>scope.getByRole('navigation').first().getByRole('button',{name:'Próxima',exact:true});
async function openFilters(scope){const details=scope.locator('[data-query-disclosure]');if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();}
async function expand(details){if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();}

async function open(page,hash){await page.goto('/'+hash);await page.locator('#persona-select').selectOption('admin');}
async function digest(page){const target=page.getByTestId('artifact-digest');await expect(target).toBeVisible();const value=await target.getAttribute('title');expect(value).toMatch(/^sha256:[a-f0-9]{64}$/);return value;}
async function stage(page,value){await expect(page.getByTestId('release-summary')).toHaveAttribute('data-release-stage',value);}
async function blockedProduction(page){const control=action(page,'deploy-production');if(await control.count())await expect(control).toBeDisabled();else await expect(control).toHaveCount(0);}
async function confirmGate(page,name){await expect(action(page,name)).toBeDisabled();await expect(workflow(page).getByRole('checkbox')).not.toBeChecked();await workflow(page).getByRole('checkbox').check();await action(page,name).click();}
async function enterHml(page){await action(page,'run-checks').click();await stage(page,'qa_passed');await confirmGate(page,'approve-qa');await stage(page,'qa_approved');await action(page,'deploy-hml').click();await stage(page,'hml_pending');}
async function createDraft(page,name='Entrega planejada vazia',system='system-atendimento'){
 await open(page,'#/release-create');await page.getByRole('combobox',{name:'Sistema',exact:true}).selectOption(system);await page.getByRole('textbox',{name:'Nome da release',exact:true}).fill(name);await workflow(page).getByRole('button',{name:'Criar release',exact:true}).click();await expect(page).toHaveURL(/#\/release\/release-draft-\d+\/composition$/);return new URL(page.url()).hash;
}
async function commit(page,id){await included(page).and(page.locator(`[data-story-id="${id}"]`)).click();const panel=page.getByTestId('release-story-inspector');await panel.locator('summary').click();return (await panel.getByText('Commit',{exact:true}).locator('xpath=following-sibling::dd[1]').innerText()).trim();}
async function freshControls(page,hash){await page.goto('/'+hash.replace('/overview','/history'));for(const title of ['Code review','Security scan','Testes e regressão em QA','Gate G2','Homologação e regressão em HML','Gate G3'])await expect(page.locator('.release-checks > div').filter({hasText:title})).toContainText('PENDING');}

test.beforeEach(async({page,baseURL})=>{
 const result={errors:[],requests:[],sockets:[]};observed.set(page,result);
 page.on('pageerror',error=>result.errors.push(error.message));page.on('websocket',socket=>result.sockets.push(socket.url()));
 page.on('request',request=>{const url=new URL(request.url());if(url.origin!==new URL(baseURL).origin||request.method()!=='GET'||/\/api(?:\/|$)/.test(url.pathname))result.requests.push(`${request.method()} ${request.url()}`);});
});
test.afterEach(async({page})=>expect(observed.get(page),'A gestão simulada usa somente arquivos estáticos e não acessa serviços ou dados reais.').toEqual({errors:[],requests:[],sockets:[]}));

test('release hub paginates all 34 visible releases, preserves descending creation order and scopes queries by System',async({page})=>{
 await open(page,'#/releases');const list=collection(page);
 await expect(cards(page)).toHaveCount(20);await expect(list.getByRole('navigation').first()).toContainText('1–20 de 34 resultados · Página 1 de 2');
 await expect(list.locator('th[aria-sort="descending"]')).toContainText('Criação');await expect(list.getByRole('combobox',{name:'Ordenar por',exact:true})).toHaveCount(0);
 const first=await cards(page).evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.releaseId,date:Date.parse(node.dataset.createdAt)})));
 expect(first.map(item=>item.date)).toEqual(first.map(item=>item.date).sort((a,b)=>b-a));
 await next(list).click();await expect(page).toHaveURL(/releases.page=2/);await expect(cards(page)).toHaveCount(14);
 const second=await cards(page).evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.releaseId,date:Date.parse(node.dataset.createdAt)})));
 expect(new Set([...first,...second].map(item=>item.id)).size).toBe(34);expect([...first,...second].map(item=>item.date)).toEqual([...first,...second].map(item=>item.date).sort((a,b)=>b-a));await expect(next(list)).toBeDisabled();
 await cards(page).first().click();await expect(page.getByTestId('release-summary')).toBeVisible();await page.goBack();await expect(page).toHaveURL(/releases.page=2/);await expect(cards(page)).toHaveCount(14);
 await openFilters(list);await list.getByRole('button',{name:'Limpar filtros',exact:true}).click();await page.locator('[data-release-overview-stage="production"]').click();await expect(cards(page)).toHaveCount(7);await expect(list).toContainText('7 resultados');
 await list.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expand(page.locator('#releases-system-disclosure'));await page.getByRole('combobox',{name:'Consultar releases de um Sistema',exact:true}).selectOption('system-pedidos');await page.getByRole('button',{name:'Aplicar Sistema',exact:true}).click();await expect(page).toHaveURL(/#\/releases\/system-pedidos/);await expect(cards(page)).toHaveCount(6);for(const row of await list.locator('tbody tr').all())await expect(row).toContainText('Gestão de Pedidos');
 await openFilters(list);await list.getByRole('searchbox').fill('Sem resultado conhecido');await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(cards(page)).toHaveCount(0);await expect(list).toContainText('0 resultados');await expect(list).toContainText('Nenhuma release neste recorte');await list.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(page).toHaveURL(/#\/releases\/system-pedidos/);await expect(cards(page)).toHaveCount(6);
});

test('a release can be explicitly created and reopened as an empty DRAFT without a package or deployment',async({page})=>{
 const hash=await createDraft(page);
 await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage','draft');await expect(page.getByTestId('empty-release-draft')).toBeVisible();await expect(page.getByTestId('planned-story-row')).toHaveCount(0);await expect(workflow(page).getByRole('button',{name:'Revisar seleção elegível',exact:true})).toBeDisabled();await expect(page.getByTestId('artifact-digest')).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('empty-release-draft')).toBeVisible();
 await page.goto('/#/releases');await page.locator('[data-release-overview-stage="draft"]').click();await expect(cards(page)).toHaveCount(1);await expect(cards(page).first()).toContainText('Entrega planejada vazia');await expect(collection(page).locator('tbody tr').first()).toContainText('0 Histórias');await cards(page).first().click();await expect(page).toHaveURL(new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));await expect(page.getByTestId('empty-release-draft')).toBeVisible();
});

test('a Story selects an existing DRAFT of its System with explicit save while closed releases and other Systems stay excluded',async({page})=>{
 const atendimento=await createDraft(page,'Entrega do Atendimento');const atendimentoId=atendimento.split('/')[2];const pedidos=await createDraft(page,'Entrega dos Pedidos','system-pedidos');const pedidosId=pedidos.split('/')[2];
 await page.goto('/#/release/release-r1/composition');const preserved=await digest(page);await expect(included(page)).toHaveCount(10);
 await page.goto('/#/story/story-consulta/releases');const select=page.getByRole('combobox',{name:'Release planejada neste Sistema',exact:true});
 await expect(select.locator(`option[value="${atendimentoId}"]`)).toHaveCount(1);for(const id of [pedidosId,'release-r1','release-r2','__new__'])await expect(select.locator(`option[value="${id}"]`)).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Nome da release',exact:true})).toHaveCount(0);await expect(page.getByTestId('create-release')).toHaveCount(0);
 await select.selectOption(atendimentoId);await expect(page.getByTestId('planned-release-link')).toHaveCount(0);await page.reload();await expect(select).toHaveValue('');await select.selectOption(atendimentoId);await workflow(page).getByRole('button',{name:'Salvar planejamento',exact:true}).click();await expect(page.getByTestId('planned-release-link')).toHaveAttribute('href',atendimento);await page.reload();await expect(select).toHaveValue(atendimentoId);
 await page.getByTestId('planned-release-link').click();await expect(page.getByTestId('planned-story-row')).toHaveCount(1);await expect(page.getByTestId('planned-story-row')).toContainText('revisão planejada 2');await expect(workflow(page).getByRole('button',{name:'Revisar seleção elegível',exact:true})).toBeDisabled();
 await page.goto('/#/release/release-r1/composition');expect(await digest(page)).toBe(preserved);await expect(included(page)).toHaveCount(10);await expect(included(page).filter({hasText:'HIS-01'})).toContainText('r1');
 await page.goto('/#/releases');await page.locator('[data-release-overview-stage="draft"]').click();await expect(cards(page)).toHaveCount(2);
});

test('QA, new G2, HML, acceptance and G3 preserve the exact digest and composition promoted to production',async({page})=>{
 await open(page,release('release-r2','composition'));const original=await digest(page);const ids=await included(page).evaluateAll(nodes=>nodes.map(node=>node.dataset.storyId).sort());expect(ids).toHaveLength(9);await blockedProduction(page);
 await enterHml(page);expect(await digest(page)).toBe(original);await blockedProduction(page);await expect(workflow(page)).toContainText('HML');
 await confirmGate(page,'homologate');await stage(page,'hml_passed');expect(await digest(page)).toBe(original);await blockedProduction(page);await confirmGate(page,'approve-production');await stage(page,'production_approved');expect(await digest(page)).toBe(original);await action(page,'deploy-production').click();await stage(page,'production');expect(await digest(page)).toBe(original);expect(await included(page).evaluateAll(nodes=>nodes.map(node=>node.dataset.storyId).sort())).toEqual(ids);
 await page.reload();await stage(page,'production');expect(await digest(page)).toBe(original);await page.goto('/'+release('release-r2','history'));for(const title of ['Code review','Security scan','Testes e regressão em QA','Gate G2','Homologação e regressão em HML','Gate G3'])await expect(page.locator('.release-checks > div').filter({hasText:title})).toContainText('PASSED');
 await page.goto('/#/releases/system-atendimento');await expect(page.getByTestId('environment-map').locator('[data-environment="prd"]')).toHaveAttribute('href',release('release-r2'));await expect(page.getByTestId('environment-map').locator('[data-environment="hml"]')).toHaveAttribute('href',release('release-r2'));
});

test('withdrawing a Story in HML creates a different candidate in QA and preserves the rejected source package',async({page})=>{
 await open(page,release('release-r2'));const sourceDigest=await digest(page);await enterHml(page);await action(page,'revise-release').click();await expect(page.getByTestId('selection-count')).toHaveText('9');
 await page.goto('/'+release('release-r2'));await stage(page,'hml_pending');expect(await digest(page)).toBe(sourceDigest);await action(page,'revise-release').click();await page.locator('input[data-release-story="H08"]').uncheck();await expect(page.getByTestId('selection-count')).toHaveText('8');await action(page,'create-candidate').click();await stage(page,'qa_checks');const candidateHash=new URL(page.url()).hash;expect(await digest(page)).not.toBe(sourceDigest);await blockedProduction(page);await freshControls(page,candidateHash);
 await page.goto('/'+candidateHash.replace('/overview','/composition'));await expect(included(page)).toHaveCount(8);await expect(included(page).filter({hasText:'HIS-08'})).toHaveCount(0);await expect(page.getByTestId('release-diff')).toContainText('9 → 8 Histórias');
 await page.goto('/'+release('release-r2','composition'));await stage(page,'rejected');expect(await digest(page)).toBe(sourceDigest);await expect(included(page)).toHaveCount(9);await expect(included(page).filter({hasText:'HIS-08'})).toHaveCount(1);await blockedProduction(page);await page.reload();await stage(page,'rejected');expect(await digest(page)).toBe(sourceDigest);
 await page.goto('/'+candidateHash.replace('/overview','/branches'));await expect(page.getByTestId('release-graph')).toBeVisible();await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('a correction in HML keeps Story identities but creates a new revision, commit, digest and unapproved cycle',async({page})=>{
 await open(page,release('release-r2','composition'));const sourceDigest=await digest(page),sourceIds=await included(page).evaluateAll(nodes=>nodes.map(node=>node.dataset.storyId).sort()),oldCommit=await commit(page,'H01');await enterHml(page);await action(page,'revise-release').click();await page.getByRole('combobox',{name:'O que mudou na homologação?',exact:true}).selectOption('correction');await page.getByRole('combobox',{name:'História com correção simulada',exact:true}).selectOption('H01');await expect(page.getByTestId('selection-count')).toHaveText('9');await action(page,'create-candidate').click();await stage(page,'qa_checks');const hash=new URL(page.url()).hash;expect(await digest(page)).not.toBe(sourceDigest);await freshControls(page,hash);
 await page.goto('/'+hash.replace('/overview','/composition'));expect(await included(page).evaluateAll(nodes=>nodes.map(node=>node.dataset.storyId).sort())).toEqual(sourceIds);await expect(included(page).filter({hasText:'HIS-01'})).toContainText('r2');expect(await commit(page,'H01')).not.toBe(oldCommit);
 await page.goto('/'+release('release-r2','composition'));await stage(page,'rejected');expect(await digest(page)).toBe(sourceDigest);await expect(included(page).filter({hasText:'HIS-01'})).toContainText('r1');expect(await commit(page,'H01')).toBe(oldCommit);await blockedProduction(page);
});

test('the planning picker pages 60 Stories and preserves individual and page selections outside filters before explicit save',async({page})=>{
 const draft=await createDraft(page,'Entrega composta em páginas');await page.getByTestId('manage-release-composition').click();await expand(page.locator('#release-plan-filters-disclosure'));await page.locator('[data-plan-view="all"]').click();await expect(pickerRows(page)).toHaveCount(20);await expect(page.getByRole('navigation',{name:'Paginação de Histórias para planejamento'}).first()).toContainText('1–20 de 60 Histórias · Página 1 de 3');await expect(selected(page)).toHaveText('0');
 await choose(page,'story-release-h11').check();await expect(selected(page)).toHaveText('1');await page.getByRole('navigation',{name:'Paginação de Histórias para planejamento'}).first().getByRole('link',{name:'Próxima',exact:true}).click();await expect(pickerRows(page)).toHaveCount(20);await expect(page).toHaveURL(/picker.page=2/);await expect(page.getByTestId('planning-hidden-selected-count')).toHaveText('1');await page.getByRole('button',{name:'Selecionar visíveis',exact:true}).click();await expect(selected(page)).toHaveText('21');
 await page.locator('#release-plan-search').fill('HIS-11');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(pickerRows(page)).toHaveCount(1);await expect(choose(page,'story-release-h11')).toBeChecked();await expect(selected(page)).toHaveText('21');await expect(page.getByTestId('planning-hidden-selected-count')).toHaveText('20');await page.reload();await expect(selected(page)).toHaveText('21');await expect(choose(page,'story-release-h11')).toBeChecked();
 await workflow(page).getByRole('button',{name:'Salvar composição',exact:true}).click();await expect(page.getByTestId('planned-story-row')).toHaveCount(21);await page.reload();await expect(page.getByTestId('planned-story-row')).toHaveCount(21);await page.goto('/'+draft);await expect(page.getByTestId('release-plan-summary')).toHaveAttribute('data-stage','draft');await expect(page.getByTestId('artifact-digest')).toHaveCount(0);
});

test('candidate pagination retains global selection and a missing dependency blocks closing instead of silently adding it',async({page})=>{
 await open(page,'#/release-new/system-atendimento');const list=candidateRows(page);await expect(list.locator('tbody tr')).toHaveCount(20);await expect(page.getByTestId('selection-count')).toHaveText('44');await expect(list.getByRole('navigation').first()).toContainText('1–20 de 60 resultados · Página 1 de 3');
 await page.locator('input[data-release-story="H07"]').uncheck();await expect(page.getByTestId('blocked-count')).toHaveText('1');await expect(action(page,'create-candidate')).toBeDisabled();await expect(list.locator('[data-story-id="H09"]')).toContainText('HIS-07');
 await next(list).click();await expect(list.locator('tbody tr')).toHaveCount(20);await expect(page.getByTestId('selection-count')).toHaveText('43');await page.reload();await expect(page.getByTestId('blocked-count')).toHaveText('1');await expect(action(page,'create-candidate')).toBeDisabled();await page.getByRole('button',{name:'Retirar Histórias dependentes da seleção',exact:true}).click();await expect(page.getByTestId('selection-count')).toHaveText('42');await expect(page.getByTestId('blocked-count')).toHaveText('0');await expect(action(page,'create-candidate')).toBeEnabled();await list.getByRole('button',{name:'Anterior',exact:true}).first().click();await expect(page.locator('input[data-release-story="H07"]')).not.toBeChecked();await expect(page.locator('input[data-release-story="H09"]')).not.toBeChecked();
});
