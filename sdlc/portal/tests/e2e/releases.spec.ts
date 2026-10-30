import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {systemKey} from './system-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Release browser tests require the isolated portal_test database');

const headers=(persona='admin')=>({'X-Persona':persona,'Idempotency-Key':crypto.randomUUID()});
async function createItem(request:APIRequestContext,kind:string,parentId?:string,name=`${kind} do ensaio de releases`){
  const response=await request.post('/api/items',{headers:headers(),data:{kind,name,description:'Criado somente no banco isolado para verificar a navegação real.',...(parentId?{parentId}:{}),...(kind==='system'?{key:systemKey()}:kind==='project'?{key:systemKey()}:{})}});
  expect(response.ok(),await response.text()).toBe(true);
  const {item}=await response.json();if(kind==='story')item.referenceToken=(await(await request.get('/api/items/'+item.id+'/release')).json()).story.referenceToken;return item;
}
async function scope(request:APIRequestContext){
  const system=await createItem(request,'system');const project=await createItem(request,'project',system.id,'Projeto de composição');const epic=await createItem(request,'epic',project.id,'Épico de composição');
  const story=await createItem(request,'story',epic.id,'História escolhida no ensaio');const second=await createItem(request,'story',epic.id,'Segunda História do ensaio');return {system,project,epic,story,second};
}
async function draft(request:APIRequestContext,systemId:string,name='Release do ensaio',persona='elisa'){
  const response=await request.post('/api/releases',{headers:headers(persona),data:{systemId,name}});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).release;
}
async function selectPersona(page:Page,persona:string){await page.getByRole('combobox',{name:/Persona/}).selectOption(persona);}
async function openFilters(page:Page,title:string){const panel=page.locator('details.experience-filters').filter({has:page.getByText(title,{exact:true})});if(!await panel.evaluate(element=>(element as HTMLDetailsElement).open))await panel.locator(':scope > summary').click();return panel;}
const actions=(page:Page)=>page.getByRole('region',{name:'Situação e próxima ação'});
const snapshot=(name:string)=>{const folder=process.env.SCREENSHOT_DIR||'test-results/screenshots';mkdirSync(folder,{recursive:true});return join(folder,name);};

// Each test owns a distinct System. The disposable database is removed after
// validation; cleanup must not bypass lifecycle rules by archiving active work.
test.beforeEach(async({request})=>{expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');});

test('Releases shows DEV and the other System destinations separately from composition, including read failure',async({page,request})=>{
 const own=await scope(request);await draft(request,own.system.id);await page.goto(`/releases?system=${own.system.id}`);
 const environments=page.getByRole('region',{name:'Ambientes em Releases',exact:true});
 await expect(environments.getByRole('heading',{level:3})).toHaveText(['DEV','QA','HML','PRD']);
 await expect(environments.getByTestId('release-environment-count-DEV')).toHaveText('1');await expect(environments.getByTestId('release-environment-count-QA')).toHaveText('0');
 const order=await page.evaluate(()=>{const results=document.getElementById('release-list-results')!,state=document.querySelector('[aria-label="Estado das releases"]')!,env=document.querySelector('[aria-label="Ambientes em Releases"]')!;return Boolean(results.compareDocumentPosition(state)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(state.compareDocumentPosition(env)&Node.DOCUMENT_POSITION_FOLLOWING);});expect(order).toBe(true);
 const back=page.getByRole('link',{name:'Voltar à lista de releases ↑',exact:true});await back.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(url=>url.hash==='#release-list-results');await expect(page.locator('#release-list-results')).toBeFocused();await expect(environments.getByText('Referência cadastrada',{exact:true})).toHaveCount(4);
 await expect(page.getByRole('heading',{name:'Estado da release',exact:true})).toBeVisible();await expect(page.getByText(/Legado/)).toHaveCount(0);
 await expect(page.getByTestId('release-stage-CLOSED')).toContainText('CLOSED · Fechada');
 await expect(page.getByTestId('release-stage-CANCELED')).toContainText('CANCELED · Cancelada');
 await page.screenshot({path:snapshot('releases-destinations-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:snapshot('releases-destinations-mobile.png'),fullPage:true});
 await page.route(`**/api/systems/${own.system.id}/environments`,route=>route.fulfill({status:503,json:{error:{message:'Ambientes indisponíveis no ensaio.'}}}));await page.reload();
 await expect(environments.getByRole('alert')).toContainText('Ambientes indisponíveis no ensaio.');await expect(environments.getByTestId('release-environment-count-DEV')).toHaveText('1');await expect(environments.getByText('Referência não cadastrada',{exact:true})).toHaveCount(0);
 await page.unroute(`**/api/systems/${own.system.id}/environments`);await page.route(url=>url.pathname==='/api/releases',route=>route.fulfill({status:503,json:{error:{message:'Totais indisponíveis no ensaio.'}}}));await page.reload();
 await expect(environments.getByText('Referência cadastrada',{exact:true})).toHaveCount(4);await expect(environments.getByRole('alert')).toContainText('Totais indisponíveis no ensaio.');await expect(environments.getByTestId('release-environment-count-DEV')).toHaveText('—');
});

test('Release Manager creates an empty persisted OPEN and leaves composition for another person',async({page,request})=>{
  const system=await createItem(request,'system');
  await page.goto(`/releases/new?system=${system.id}`);await selectPersona(page,'elisa');
  await expect(page.getByText('Histórias são opcionais neste momento')).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Sistema',exact:true})).toHaveValue(system.id);
  await page.getByRole('textbox',{name:'Nome da release',exact:true}).fill('Rascunho criado sem Histórias');
  await actions(page).getByRole('button',{name:'Criar release',exact:true}).click();
  await expect(page).toHaveURL(/\/releases\/(?!new)[^/?]+$/);
  const id=new URL(page.url()).pathname.split('/')[2];
  await expect(page.getByText('Esta release OPEN está vazia e é válida.')).toBeVisible();
  await expect(actions(page)).toContainText('Fechar e gerar cópia serão disponibilizados');
  await expect(page.getByTestId('release-situation')).toContainText('OPEN · Aberta');await expect(page.getByTestId('release-situation')).toContainText('DEV · ambiente inicial do fluxo');
  let persisted=await (await request.get(`/api/releases/${id}`)).json();
  expect(persisted.release).toMatchObject({systemId:system.id,compositionStatus:'OPEN',storyCount:0,version:1});expect(persisted.stories).toEqual([]);expect(persisted.capabilities).toMatchObject({canBuild:false,canPromote:false,qualityChecksAvailable:false});
  await page.reload();await selectPersona(page,'admin');await expect(page.getByText('Esta release OPEN está vazia e é válida.')).toBeVisible();
  persisted=await (await request.get(`/api/releases/${id}`)).json();expect(persisted.history.filter((event:any)=>event.action==='RELEASE_CREATED')).toHaveLength(1);
  await page.screenshot({path:snapshot('release-empty-desktop.png')});
  await page.getByRole('navigation',{name:'Seções da release'}).getByRole('link',{name:'Auditoria',exact:true}).click();
  const audit=page.getByRole('region',{name:'Auditoria da release',exact:true});await audit.locator('details.audit-details').first().locator('summary').click();
  await expect(audit.getByRole('rowheader',{name:'Ambiente do fluxo',exact:true})).toBeVisible();await expect(audit.getByRole('rowheader',{name:'Estado da release',exact:true})).toBeVisible();
  await page.screenshot({path:snapshot('release-created-audit.png'),fullPage:true});
});

test('central composition filters stories, preserves choices and shares the exact association with the Story',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id),next=await draft(request,own.system.id,'Outra release existente');
  await page.goto(`/releases/${release.id}?view=planning`);await selectPersona(page,'elisa');
  await openFilters(page,'Filtrar Histórias');
  await page.getByRole('button',{name:/^Prontas e sem release/}).click();
  await expect(page.getByText(/Nenhuma História nesta combinação/)).toBeVisible();
  await page.getByRole('button',{name:/^Sem release/}).click();
  const search=page.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true});
  await search.fill(own.story.key);await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();
  await search.fill(own.second.key);await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await page.getByRole('checkbox',{name:new RegExp(own.second.name)}).check();
  await expect(actions(page).getByText('2 escolhidas, ainda não salvas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(page).toHaveURL(url=>url.pathname===`/releases/${release.id}`&&!url.searchParams.has('view'));
  const composed=await (await request.get(`/api/releases/${release.id}`)).json();expect(composed.stories.map((story:any)=>story.id).sort()).toEqual([own.story.id,own.second.id].sort());expect(composed.stories.every((story:any)=>!story.ready)).toBe(true);
  await page.goto(`/stories/${own.story.id}?tab=planning&process=delivery`);await selectPersona(page,'ana');
  const association=page.getByRole('region',{name:'Associação de release da História'});
  await expect(association.getByRole('link',{name:new RegExp(release.name)})).toHaveAttribute('href',`/releases/${release.id}`);
  await expect(page.getByRole('combobox',{name:'Release planejada',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Alterar release',exact:true}).click();
  const select=page.getByRole('combobox',{name:'Release planejada',exact:true});await expect(select).toHaveValue(release.id);
  expect(await select.locator('option').evaluateAll(options=>options.some(option=>option.getAttribute('value')==='__new__'))).toBe(false);
  await expect(page.getByRole('button',{name:'Criar release',exact:true})).toHaveCount(0);
  await select.selectOption(next.id);await expect(page.getByTestId('story-interaction')).toHaveCount(0);await page.getByRole('button',{name:'Salvar planejamento',exact:true}).click();
  await expect.poll(async()=>((await (await request.get(`/api/items/${own.story.id}/release`)).json()).assignment?.releaseId)).toBe(next.id);
  await page.goto(`/stories/${own.story.id}?tab=planning&process=delivery`);
  await expect(association.getByRole('link',{name:new RegExp(next.name)})).toHaveAttribute('href',`/releases/${next.id}`);
  await page.getByRole('button',{name:'Alterar release',exact:true}).click();await expect(select).toHaveValue(next.id);
  await select.selectOption('');await page.getByRole('button',{name:'Salvar planejamento',exact:true}).click();
  await expect.poll(async()=>((await (await request.get(`/api/items/${own.story.id}/release`)).json()).assignment)).toBeNull();
  await page.goto(`/stories/${own.story.id}?tab=planning&process=delivery`);
  await expect(association.getByText('Nenhuma release vinculada a esta História.')).toBeVisible();
  await page.getByRole('button',{name:'Escolher release',exact:true}).click();await expect(select).toHaveValue('');
  const stored=await (await request.get(`/api/items/${own.story.id}`)).json();expect(stored.item.status).toBe('specification');expect(stored.item.version).toBe(own.story.version);
});

test('concurrent composition requires review and uncertain acknowledgement replays the original request once',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id);
  await page.goto(`/releases/${release.id}?view=planning`);await selectPersona(page,'carla');
  await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeDisabled();
  const denied=await request.put(`/api/releases/${release.id}/stories`,{headers:headers('carla'),data:{expectedVersion:1,stories:[]}});expect(denied.status()).toBe(403);
  await selectPersona(page,'elisa');await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();
  const other=await request.put(`/api/releases/${release.id}/stories`,{headers:headers('admin'),data:{expectedVersion:1,stories:[{id:own.second.id,expectedVersion:own.second.version,expectedReferenceToken:own.second.referenceToken,expectedReleaseId:null,expectedReleaseVersion:null}]}});expect(other.ok(),await other.text()).toBe(true);
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(actions(page).getByRole('alert')).toContainText('Os dados foram alterados');
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await expect(page.getByRole('heading',{name:'As informações mudaram',exact:true})).toBeVisible();
  await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Revisar alterações',exact:true}).click();
  await expect(page.getByText('Composição registrada: versão 1 → 2.',{exact:true})).toBeVisible();
  await expect(page.getByText(`Incluída na composição registrada: ${own.second.name}.`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Continuar com dados atualizados',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.second.name)})).not.toBeChecked();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await expect(page.locator('.real-release-story').filter({hasText:own.second.name}).getByText('Release do ensaio',{exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:new RegExp(own.second.name)}).check();
  let first=true,originalKey='',originalBody='';
  await page.route(`**/api/releases/${release.id}/stories`,async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    if(first){first=false;originalKey=route.request().headers()['idempotency-key'];originalBody=route.request().postData()!;const applied=await route.fetch();expect(applied.ok(),await applied.text()).toBe(true);return route.abort();}
    expect(route.request().headers()['idempotency-key']).toBe(originalKey);expect(route.request().postData()).toBe(originalBody);return route.continue();
  });
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(actions(page).getByRole('button',{name:'Verificar resultado da solicitação',exact:true})).toBeEnabled();
  await selectPersona(page,'admin');await expect(actions(page).getByRole('button',{name:'Verificar resultado da solicitação',exact:true})).toBeDisabled();
  await page.reload();await selectPersona(page,'elisa');
  await actions(page).getByRole('button',{name:'Verificar resultado da solicitação',exact:true}).click();
  await expect(page).toHaveURL(url=>url.pathname===`/releases/${release.id}`&&!url.searchParams.has('view'));
  const final=await (await request.get(`/api/releases/${release.id}`)).json();expect(final.release.version).toBe(3);expect(final.stories).toHaveLength(2);expect(final.history.filter((event:any)=>event.action==='RELEASE_COMPOSITION_CHANGED')).toHaveLength(2);
});

test('visual release consultation uses real compositionStatus counts and newest-first pages of twenty on desktop and mobile',async({page,request})=>{
  const system=await createItem(request,'system');
  for(let index=0;index<21;index++)await draft(request,system.id,`Release paginada ${String(index).padStart(2,'0')}`);
  const api=await (await request.get(`/api/releases?systemId=${system.id}`)).json();expect(api.pagination).toMatchObject({page:1,pageSize:20,total:21,totalPages:2});
  await page.goto(`/releases?system=${system.id}`);await selectPersona(page,'elisa');
  await expect(page.getByTestId('release-card')).toHaveCount(20);
  expect(await page.getByTestId('release-card').getByRole('heading').allTextContents()).toEqual(api.releases.map((release:any)=>release.name));
  const times=await page.getByTestId('release-card').locator('time').evaluateAll(elements=>elements.map(element=>Date.parse(element.getAttribute('datetime')!)));expect(times.every((time,index)=>!index||time<=times[index-1])).toBe(true);
  await expect(page.getByTestId('release-stage-OPEN')).toContainText('21');await expect(page.getByTestId('release-stage-CLOSED')).toContainText('0');await expect(page.getByTestId('release-environment-count-DEV')).toHaveText('21');
  const pager=page.getByRole('navigation',{name:'Paginação superior de releases',exact:true});await pager.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(page).toHaveURL(/page=2/);await expect(page.getByTestId('release-card')).toHaveCount(1);await expect(page.getByTestId('release-environment-count-DEV')).toHaveText('21');await expect(pager.getByRole('button',{name:'Próxima',exact:true})).toBeDisabled();
  await page.getByTestId('release-stage-CLOSED').click();await expect(page.getByText('Nenhuma release neste recorte',{exact:true})).toBeVisible();await expect(page.getByTestId('release-environment-count-DEV')).toHaveText('0');await expect(page.getByTestId('release-stage-OPEN')).toContainText('21');
  await page.getByTestId('release-stage-OPEN').click();await expect(page.getByTestId('release-card')).toHaveCount(20);
  await openFilters(page,'Filtrar releases');const filter=page.getByRole('form',{name:'Filtrar releases'});await filter.getByRole('searchbox',{name:'Buscar release',exact:true}).fill('Release paginada 20');await filter.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(page.getByTestId('release-card')).toHaveCount(1);
  await expect(filter.getByRole('combobox',{name:'Sistema',exact:true})).toHaveValue(system.id);
  await page.screenshot({path:snapshot('release-list-desktop.png')});
  await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByTestId('release-stage-CLOSED')).toBeVisible();await expect(page.getByTestId('release-stage-CANCELED')).toBeVisible();
  await page.screenshot({path:snapshot('release-list-mobile.png')});
});

test('composition keeps selections from two server pages when a later filter hides one of twenty-five Stories',async({page,request})=>{
  const system=await createItem(request,'system'),project=await createItem(request,'project',system.id,'Projeto de paginação da composição'),epic=await createItem(request,'epic',project.id,'Épico de paginação da composição');
  for(let index=0;index<25;index++)await createItem(request,'story',epic.id,`História de volume ${String(index+1).padStart(2,'0')}`);
  const release=await draft(request,system.id,'Composição de duas páginas');
  const firstPage=await (await request.get(`/api/releases/${release.id}/stories?page=1&sort=key&direction=asc`)).json();
  const secondPage=await (await request.get(`/api/releases/${release.id}/stories?page=2&sort=key&direction=asc`)).json();
  expect(firstPage.pagination).toMatchObject({page:1,pageSize:20,total:25,totalPages:2});expect(firstPage.stories).toHaveLength(20);expect(secondPage.stories).toHaveLength(5);
  const first=firstPage.stories[0],second=secondPage.stories[0];
  await page.goto(`/releases/${release.id}?view=planning&picker.sort=key&picker.direction=asc`);await selectPersona(page,'elisa');
  const rows=page.locator('.real-release-story');await expect(rows).toHaveCount(20);
  await expect(page.locator('details.experience-filters').filter({visible:true})).not.toHaveAttribute('open');
  await page.getByRole('checkbox',{name:new RegExp(first.name)}).check();
  const pager=page.getByRole('navigation',{name:'Paginação superior de Histórias para composição',exact:true});await pager.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(page).toHaveURL(/picker.page=2/);await expect(rows).toHaveCount(5);await page.getByRole('checkbox',{name:new RegExp(second.name)}).check();
  await expect(actions(page).getByText('2 escolhidas, ainda não salvas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  const filters=await openFilters(page,'Filtrar Histórias');await filters.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true}).fill(first.name);await filters.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(rows).toHaveCount(1);await expect(page.getByRole('checkbox',{name:new RegExp(first.name)})).toBeChecked();await expect(page).not.toHaveURL(/picker.page=2/);
  await expect(actions(page).getByText('2 escolhidas, ainda não salvas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();await expect(page).toHaveURL(url=>url.pathname===`/releases/${release.id}`&&!url.searchParams.has('view'));
  const persisted=await (await request.get(`/api/releases/${release.id}`)).json();expect(persisted.stories.map((story:any)=>story.id).sort()).toEqual([first.id,second.id].sort());expect(persisted.release).toMatchObject({compositionStatus:'OPEN',storyCount:2,version:2});
  await page.reload();await expect(page.locator('.real-release-detail-stories a')).toHaveCount(2);
});

test('quick views preserve applied scope and pending Project and Epic fields',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id);
  const another=await createItem(request,'project',own.system.id,'Outro Projeto do mesmo Sistema');
  const epic=await createItem(request,'epic',another.id,'Outro Épico do Sistema');
  const outside=await createItem(request,'story',epic.id,'História fora do Projeto escolhido');
  await page.goto(`/releases/${release.id}?view=planning`);await selectPersona(page,'elisa');
  await openFilters(page,'Filtrar Histórias');
  const project=page.getByRole('combobox',{name:'Projeto',exact:true}),epicField=page.getByRole('combobox',{name:'Épico',exact:true});
  await project.selectOption(own.project.id);await epicField.selectOption(own.epic.id);
  for(const title of ['Prontas e sem release','Sem release','Pendentes','Todas']){
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(project).toHaveValue(own.project.id);await expect(epicField).toHaveValue(own.epic.id);
    await expect(page.getByText('Filtros alterados. Use Aplicar filtros.',{exact:true})).toBeVisible();
    expect(new URL(page.url()).searchParams.has('picker.project')).toBe(false);
  }
  await expect(page.getByRole('checkbox',{name:new RegExp(outside.name)})).toBeVisible();
  await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(outside.name)})).toHaveCount(0);
  await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();
  for(const title of ['Prontas e sem release','Sem release']){
    await page.getByRole('button',{name:title,exact:true}).click();
    await expect(page).toHaveURL(url=>url.searchParams.get('picker.project')===own.project.id&&url.searchParams.get('picker.epic')===own.epic.id);
    await expect(project).toHaveValue(own.project.id);await expect(epicField).toHaveValue(own.epic.id);
  }
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await expect(page.getByText('Filtros alterados. Use Aplicar filtros.',{exact:true})).toHaveCount(0);
  await page.screenshot({path:snapshot('release-picker-scope-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:snapshot('release-picker-scope-mobile.png'),fullPage:true});
});

test('Audit tab preserves composition draft and independent query fields, including legacy bookmarks',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id);let historyReads=0,writes=0;
  page.on('request',req=>{if(req.url().includes(`/api/releases/${release.id}/history`))historyReads++;if(req.method()==='PUT'&&req.url().includes(`/api/releases/${release.id}/stories`))writes++;});
  await page.goto(`/releases/${release.id}?view=planning&picker.project=${own.project.id}&history.q=Release`);await selectPersona(page,'elisa');
  await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();
  await openFilters(page,'Filtrar Histórias');
  await page.getByRole('combobox',{name:'Épico',exact:true}).selectOption(own.epic.id);
  await page.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true}).fill('Rascunho ainda não aplicado');
  expect(historyReads).toBe(0);await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toHaveCount(0);
  const tabs=page.getByRole('navigation',{name:'Seções da release'});
  await tabs.getByRole('link',{name:'Auditoria',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toBeVisible();
  await expect(tabs.getByRole('link',{name:'Auditoria',exact:true})).toHaveAttribute('aria-current','page');
  await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toHaveCount(0);
  await openFilters(page,'Filtrar histórico');await page.getByRole('searchbox',{name:'Buscar mensagem ou identificador',exact:true}).fill('criada');
  await page.getByRole('form',{name:'Filtros do histórico'}).getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page).toHaveURL(url=>url.searchParams.get('history.q')==='criada'&&url.searchParams.get('picker.project')===own.project.id&&url.searchParams.get('view')==='planning');
  await page.screenshot({path:snapshot('release-audit-desktop.png'),fullPage:true});
  await tabs.getByRole('link',{name:'Composição',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await expect(page.getByRole('combobox',{name:'Épico',exact:true})).toHaveValue(own.epic.id);
  await expect(page.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true})).toHaveValue('Rascunho ainda não aplicado');
  await expect(page.getByText('Filtros alterados. Use Aplicar filtros.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toHaveCount(0);
  await page.goBack();await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toBeVisible();
  await page.goForward();await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  expect(writes).toBe(0);expect((await (await request.get(`/api/releases/${release.id}`)).json()).stories).toEqual([]);
  await page.goto(`/releases/${release.id}#release-history`);
  await expect(page).toHaveURL(url=>url.searchParams.get('tab')==='activity');
  await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:snapshot('release-audit-mobile.png'),fullPage:true});
  await page.goto(`/releases/${release.id}?history.event=old-event&history.q=old-event`);
  await expect(page).toHaveURL(url=>url.searchParams.get('tab')==='activity'&&url.searchParams.get('history.event')==='old-event');
  await tabs.getByRole('link',{name:'Composição',exact:true}).click();
  await expect(page).toHaveURL(url=>url.searchParams.get('tab')==='composition'&&url.searchParams.get('history.event')==='old-event');
  await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('region',{name:'Auditoria da release',exact:true})).toHaveCount(0);
});

test('refresh reviews changed selected Stories outside the filter and preserves choices on a read failure',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id);let writes=0;
  page.on('request',req=>{if(req.method()==='PUT'&&req.url().includes(`/api/releases/${release.id}/stories`))writes++;});
  await page.goto(`/releases/${release.id}?view=planning`);await selectPersona(page,'elisa');
  await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();await openFilters(page,'Filtrar Histórias');
  const search=page.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true});
  await search.fill(own.second.key);await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toHaveCount(0);
  await search.fill('Filtro ainda não aplicado');
  const edit=await request.patch(`/api/items/${own.story.id}`,{headers:headers(),data:{expectedVersion:own.story.version,name:'História revisada durante o ensaio',description:'Revisão concorrente em banco isolado.'}});expect(edit.ok(),await edit.text()).toBe(true);
  await page.route(`**/api/releases/${release.id}`,route=>route.fulfill({status:503,json:{error:{message:'Consulta indisponível no ensaio.'}}}));
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Consulta indisponível no ensaio.'})).toBeVisible();
  await expect(search).toHaveValue('Filtro ainda não aplicado');
  await expect(actions(page)).toContainText('1 escolhida, ainda não salva · 1 fora desta página ou dos filtros');
  await page.unroute(`**/api/releases/${release.id}`);await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();
  await page.getByRole('button',{name:'Revisar alterações',exact:true}).click();
  await expect(page.getByText(new RegExp(`${own.story.name}: cadastro 1 → 2`))).toBeVisible();
  await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeDisabled();
  await expect(search).toHaveValue('Filtro ainda não aplicado');expect(new URL(page.url()).searchParams.get('picker.q')).toBe(own.second.key);
  await page.screenshot({path:snapshot('release-refresh-review-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Continuar com dados atualizados',exact:true}).click();
  expect(writes).toBe(0);await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeEnabled();
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(page).toHaveURL(url=>url.pathname===`/releases/${release.id}`&&!url.searchParams.has('view'));
  const persisted=await (await request.get(`/api/releases/${release.id}`)).json();expect(persisted.stories).toHaveLength(1);expect(persisted.stories[0]).toMatchObject({id:own.story.id,plannedVersion:2});
});

test('release list shortcuts preserve the applied System and pending System selection',async({page,request})=>{
  const own=await scope(request),other=await scope(request);await draft(request,own.system.id,'Release do primeiro Sistema');await draft(request,other.system.id,'Release do segundo Sistema');
  await page.goto(`/releases?system=${own.system.id}`);await openFilters(page,'Filtrar releases');
  const system=page.getByRole('combobox',{name:'Sistema',exact:true});
  await system.selectOption(other.system.id);await page.getByTestId('release-stage-CLOSED').click();
  await expect(system).toHaveValue(other.system.id);await expect(page).toHaveURL(url=>url.searchParams.get('system')===own.system.id&&url.searchParams.get('compositionStatus')==='CLOSED');
  await expect(page.getByText('Filtros alterados. Use Aplicar filtros.',{exact:true})).toBeVisible();
  await page.getByTestId('release-stage-OPEN').click();await expect(system).toHaveValue(other.system.id);
  await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page).toHaveURL(url=>url.searchParams.get('system')===other.system.id&&url.searchParams.get('compositionStatus')==='OPEN');
  await expect(page.getByTestId('release-card')).toHaveCount(1);await expect(page.getByTestId('release-card')).toContainText('Release do segundo Sistema');
});

test('an unavailable selected Story is reported and never silently removed on refresh',async({page,request})=>{
  const own=await scope(request),release=await draft(request,own.system.id);
  await page.goto(`/releases/${release.id}?view=planning`);await selectPersona(page,'elisa');await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).check();
  await page.route(`**/api/releases/${release.id}/selection-context?**`,async route=>{
    const result=await (await route.fetch()).json();return route.fulfill({json:{...result,items:[],missingIds:[own.story.id]}});
  });
  await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();await page.getByRole('button',{name:'Revisar alterações',exact:true}).click();
  await expect(page.getByText(`História indisponível no escopo: ${own.story.name}.`,{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continuar com dados atualizados',exact:true})).toBeDisabled();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:new RegExp(own.story.name)}).uncheck();await page.getByRole('button',{name:'Continuar com dados atualizados',exact:true}).click();
  await expect(actions(page).getByRole('button',{name:'Salvar composição',exact:true})).toBeEnabled();
  expect((await (await request.get(`/api/releases/${release.id}`)).json()).stories).toEqual([]);
});
