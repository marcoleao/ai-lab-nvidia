import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {systemKey} from './system-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Release browser tests require the isolated portal_test database');

const systems:string[]=[];
const headers=(persona='admin')=>({'X-Persona':persona,'Idempotency-Key':crypto.randomUUID()});
async function createItem(request:APIRequestContext,kind:string,parentId?:string,name=`${kind} do ensaio de releases`){
  const response=await request.post('/api/items',{headers:headers(),data:{kind,name,description:'Criado somente no banco isolado para verificar a navegação real.',...(parentId?{parentId}:{}),...(kind==='system'?{key:systemKey()}:kind==='project'?{key:systemKey()}:{})}});
  expect(response.ok(),await response.text()).toBe(true);
  const {item}=await response.json();if(kind==='system')systems.push(item.id);return item;
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

test.beforeEach(async({request})=>{expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');systems.length=0;});
test.afterEach(async({request})=>{for(const id of systems){const response=await request.get(`/api/items/${id}`);if(!response.ok())continue;const {item}=await response.json();const archived=await request.delete(`/api/items/${id}`,{headers:headers(),data:{expectedVersion:item.version}});expect(archived.ok(),await archived.text()).toBe(true);}});

test('Release Manager creates an empty persisted DRAFT and leaves composition for another person',async({page,request})=>{
  const system=await createItem(request,'system');
  await page.goto(`/releases/new?system=${system.id}`);await selectPersona(page,'elisa');
  await expect(page.getByText('Histórias são opcionais neste momento')).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Sistema',exact:true})).toHaveValue(system.id);
  await page.getByRole('textbox',{name:'Nome da release',exact:true}).fill('Rascunho criado sem Histórias');
  await actions(page).getByRole('button',{name:'Criar release',exact:true}).click();
  await expect(page).toHaveURL(/\/releases\/(?!new)[^/?]+$/);
  const id=new URL(page.url()).pathname.split('/')[2];
  await expect(page.getByText('Este DRAFT está vazio e é válido.')).toBeVisible();
  await expect(actions(page).getByRole('button',{name:'Fechar candidata · indisponível',exact:true})).toBeDisabled();
  let persisted=await (await request.get(`/api/releases/${id}`)).json();
  expect(persisted.release).toMatchObject({systemId:system.id,stage:'DRAFT',storyCount:0,version:1});expect(persisted.stories).toEqual([]);expect(persisted.capabilities).toMatchObject({canBuild:false,canPromote:false,qualityChecksAvailable:false});
  await page.reload();await selectPersona(page,'admin');await expect(page.getByText('Este DRAFT está vazio e é válido.')).toBeVisible();
  persisted=await (await request.get(`/api/releases/${id}`)).json();expect(persisted.history.filter((event:any)=>event.action==='RELEASE_CREATED')).toHaveLength(1);
  await page.screenshot({path:snapshot('release-empty-desktop.png')});
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
  await expect(actions(page).getByText('2 selecionadas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/releases/${release.id}$`));
  const composed=await (await request.get(`/api/releases/${release.id}`)).json();expect(composed.stories.map((story:any)=>story.id).sort()).toEqual([own.story.id,own.second.id].sort());expect(composed.stories.every((story:any)=>!story.ready)).toBe(true);
  await page.goto(`/stories/${own.story.id}?tab=planning`);await selectPersona(page,'ana');
  const association=page.getByRole('region',{name:'Associação de release da História'});
  await expect(association.getByRole('link',{name:new RegExp(release.name)})).toHaveAttribute('href',`/releases/${release.id}`);
  await expect(page.getByRole('combobox',{name:'Release planejada',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Alterar release',exact:true}).click();
  const select=page.getByRole('combobox',{name:'Release planejada',exact:true});await expect(select).toHaveValue(release.id);
  expect(await select.locator('option').evaluateAll(options=>options.some(option=>option.getAttribute('value')==='__new__'))).toBe(false);
  await expect(page.getByRole('button',{name:'Criar release',exact:true})).toHaveCount(0);
  await select.selectOption(next.id);await expect(page.getByTestId('story-interaction')).toHaveCount(0);await page.getByRole('button',{name:'Salvar planejamento',exact:true}).click();
  await expect.poll(async()=>((await (await request.get(`/api/items/${own.story.id}/release`)).json()).assignment?.releaseId)).toBe(next.id);
  await page.goto(`/stories/${own.story.id}?tab=planning`);
  await expect(association.getByRole('link',{name:new RegExp(next.name)})).toHaveAttribute('href',`/releases/${next.id}`);
  await page.getByRole('button',{name:'Alterar release',exact:true}).click();await expect(select).toHaveValue(next.id);
  await select.selectOption('');await page.getByRole('button',{name:'Salvar planejamento',exact:true}).click();
  await expect.poll(async()=>((await (await request.get(`/api/items/${own.story.id}/release`)).json()).assignment)).toBeNull();
  await page.goto(`/stories/${own.story.id}?tab=planning`);
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
  const other=await request.put(`/api/releases/${release.id}/stories`,{headers:headers('admin'),data:{expectedVersion:1,stories:[{id:own.second.id,expectedVersion:own.second.version,expectedReleaseId:null,expectedReleaseVersion:null}]}});expect(other.ok(),await other.text()).toBe(true);
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();
  await expect(actions(page).getByRole('alert')).toContainText('Os dados foram alterados');
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await page.getByRole('button',{name:'Atualizar contexto e manter seleção',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:new RegExp(own.story.name)})).toBeChecked();
  await expect(page.getByText('Release do ensaio · versão planejada 1',{exact:true})).toBeVisible();
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
  await expect(page).toHaveURL(new RegExp(`/releases/${release.id}$`));
  const final=await (await request.get(`/api/releases/${release.id}`)).json();expect(final.release.version).toBe(3);expect(final.stories).toHaveLength(2);expect(final.history.filter((event:any)=>event.action==='RELEASE_COMPOSITION_CHANGED')).toHaveLength(2);
});

test('visual release consultation uses real stage counts and newest-first pages of twenty on desktop and mobile',async({page,request})=>{
  const system=await createItem(request,'system');
  for(let index=0;index<21;index++)await draft(request,system.id,`Release paginada ${String(index).padStart(2,'0')}`);
  const api=await (await request.get(`/api/releases?systemId=${system.id}`)).json();expect(api.pagination).toMatchObject({page:1,pageSize:20,total:21,totalPages:2});
  await page.goto(`/releases?system=${system.id}`);await selectPersona(page,'elisa');
  await expect(page.getByTestId('release-card')).toHaveCount(20);
  expect(await page.getByTestId('release-card').getByRole('heading').allTextContents()).toEqual(api.releases.map((release:any)=>release.name));
  const times=await page.getByTestId('release-card').locator('time').evaluateAll(elements=>elements.map(element=>Date.parse(element.getAttribute('datetime')!)));expect(times.every((time,index)=>!index||time<=times[index-1])).toBe(true);
  await expect(page.getByTestId('release-stage-DRAFT')).toContainText('21');await expect(page.getByTestId('release-stage-QA')).toContainText('0');
  const pager=page.getByRole('navigation',{name:'Paginação superior de releases',exact:true});await pager.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(page).toHaveURL(/page=2/);await expect(page.getByTestId('release-card')).toHaveCount(1);await expect(pager.getByRole('button',{name:'Próxima',exact:true})).toBeDisabled();
  await page.getByTestId('release-stage-QA').click();await expect(page.getByText('Nenhuma release neste recorte',{exact:true})).toBeVisible();await expect(page.getByTestId('release-stage-DRAFT')).toContainText('21');
  await page.getByTestId('release-stage-DRAFT').click();await expect(page.getByTestId('release-card')).toHaveCount(20);
  await openFilters(page,'Filtrar releases');const filter=page.getByRole('form',{name:'Filtrar releases'});await filter.getByRole('searchbox',{name:'Buscar release',exact:true}).fill('Release paginada 20');await filter.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(page.getByTestId('release-card')).toHaveCount(1);
  await expect(filter.getByRole('combobox',{name:'Sistema',exact:true})).toHaveValue(system.id);
  await page.screenshot({path:snapshot('release-list-desktop.png')});
  await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByTestId('release-stage-HML')).toBeVisible();await expect(page.getByTestId('release-stage-PRODUCTION')).toBeVisible();
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
  await expect(page.locator('details.experience-filters')).not.toHaveAttribute('open');
  await page.getByRole('checkbox',{name:new RegExp(first.name)}).check();
  const pager=page.getByRole('navigation',{name:'Paginação superior de Histórias para composição',exact:true});await pager.getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(page).toHaveURL(/picker.page=2/);await expect(rows).toHaveCount(5);await page.getByRole('checkbox',{name:new RegExp(second.name)}).check();
  await expect(actions(page).getByText('2 selecionadas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  const filters=await openFilters(page,'Filtrar Histórias');await filters.getByRole('searchbox',{name:'Buscar História, Projeto ou Épico',exact:true}).fill(first.name);await filters.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(rows).toHaveCount(1);await expect(page.getByRole('checkbox',{name:new RegExp(first.name)})).toBeChecked();await expect(page).not.toHaveURL(/picker.page=2/);
  await expect(actions(page).getByText('2 selecionadas · 1 fora desta página ou dos filtros. Rascunho vazio é válido.')).toBeVisible();
  await actions(page).getByRole('button',{name:'Salvar composição',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/releases/${release.id}$`));
  const persisted=await (await request.get(`/api/releases/${release.id}`)).json();expect(persisted.stories.map((story:any)=>story.id).sort()).toEqual([first.id,second.id].sort());expect(persisted.release).toMatchObject({stage:'DRAFT',storyCount:2,version:2});
  await page.reload();await expect(page.locator('.real-release-detail-stories a')).toHaveCount(2);
});
