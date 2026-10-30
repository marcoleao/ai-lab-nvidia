import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import pg from 'pg';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {systemKey} from './system-fixtures';
const target=process.env.TEST_DATABASE_URL;
if(!target||new URL(target).pathname!=='/portal_test')throw Error('Environment browser tests require isolated portal_test');
const headers=(persona='admin')=>({'X-Persona':persona,'Idempotency-Key':crypto.randomUUID()});
const panel=(page:Page)=>page.getByRole('region',{name:'Ambientes do Sistema',exact:true});
async function sql(query:string,values:unknown[]=[]){const client=new pg.Client({connectionString:target});await client.connect();try{return await client.query(query,values);}finally{await client.end();}}
async function legacy(){
 const id=crypto.randomUUID(),repositoryId=crypto.randomUUID();
 await sql('INSERT INTO "Item" (id,kind,key,name,status,description,"updatedAt") VALUES ($1,\'system\',$2,\'Sistema do ensaio de ambientes\',\'active\',\'Fixture isolada RA-02\',now())',[id,systemKey()]);
 await sql('INSERT INTO "Repository" (id,"systemId",key,name,runtime,mode,state,"updatedAt") VALUES ($1,$2,\'app\',\'Repositório do ensaio\',\'generic\',\'link\',\'ready\',now())',[repositoryId,id]);
 for(const code of ['QA','HML','PRD'])await sql('INSERT INTO "Environment" (id,"repositoryId",code,"liveStatus","currentVersion",url) VALUES ($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),repositoryId,code,code==='QA'?'legacy_registered':'not_deployed',code==='QA'?'1.2.3':null,code==='QA'?'https://qa.invalid/preserved':null]);
 return {id,repositoryId};
}
async function context(request:APIRequestContext,id:string){const response=await request.get(`/api/systems/${id}/environments`);expect(response.ok(),await response.text()).toBe(true);return response.json();}
async function open(page:Page,id:string,persona='admin'){await page.goto(`/systems/${id}?tab=environments`);await page.getByRole('combobox',{name:/Persona/}).selectOption(persona);await expect(panel(page).getByRole('article',{name:'Ambiente DEV',exact:true})).toBeVisible();await expect(panel(page).getByRole('button',{name:'Atualizar consulta',exact:true})).toBeEnabled();}
const screenshot=(name:string)=>{const dir=process.env.SCREENSHOT_DIR||'test-results/screenshots';mkdirSync(dir,{recursive:true});return join(dir,name);};
async function activeTabVisible(page:Page){await expect.poll(()=>page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Ambientes',exact:true}).evaluate(element=>{const tab=element.getBoundingClientRect(),nav=element.closest('nav')!.getBoundingClientRect();return tab.left>=nav.left-1&&tab.right<=nav.right+1;})).toBe(true);}
test.beforeEach(async({request})=>expect((await(await request.get('/api/health')).json()).databaseMode).toBe('test'));

test('new System shows four ordered registered destinations without deployment claims or read mutations',async({page,request})=>{
 const created=await request.post('/api/items',{headers:headers(),data:{kind:'system',key:systemKey(),name:'Sistema novo com DEV'}});expect(created.ok(),await created.text()).toBe(true);const {item}=await created.json();let writes=0;
 page.on('request',req=>{if(req.method()==='POST'&&req.url().includes('/environment-references'))writes++;});
 await open(page,item.id);
 await expect(panel(page).getByRole('heading',{level:3})).toHaveText(['DEV','QA','HML','PRD']);
 await expect(panel(page).getByText('Referência cadastrada',{exact:true})).toHaveCount(4);await expect(panel(page).getByText('Sem evidência de implantação disponível.',{exact:true})).toHaveCount(4);
 await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toHaveCount(0);
 await panel(page).getByRole('button',{name:'Atualizar consulta',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Atualizar consulta',exact:true})).toBeEnabled();expect(writes).toBe(0);
 await page.screenshot({path:screenshot('environments-new-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:900});await activeTabVisible(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:screenshot('environments-new-mobile.png'),fullPage:true});
});
test('legacy recovery reviews exact missing DEV, preserves saved metadata and can cancel without mutation',async({page,request})=>{
 const value=await legacy(),before=await context(request,value.id);await open(page,value.id);
 await expect(panel(page).getByRole('article',{name:'Ambiente DEV',exact:true})).toContainText('Referência não cadastrada');
 const qa=panel(page).getByRole('article',{name:'Ambiente QA',exact:true});await expect(qa.getByRole('link',{name:'Abrir URL registrada ↗',exact:true})).toHaveAttribute('href','https://qa.invalid/preserved');
 await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).focus();await page.keyboard.press('Enter');
 const confirm=page.getByRole('region',{name:'Confirmar cadastro de referências',exact:true});await expect(confirm).toContainText('somente as referências DEV');await expect(confirm).toContainText('Repositório do ensaio · app');await expect(confirm.getByRole('button',{name:'Confirmar cadastro',exact:true})).toBeFocused();
 await confirm.getByRole('button',{name:'Voltar',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toBeFocused();expect((await context(request,value.id)).missingCodes).toEqual(['DEV']);
 await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();await page.screenshot({path:screenshot('environments-recovery-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:900});await activeTabVisible(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:screenshot('environments-recovery-mobile.png'),fullPage:true});
 await confirm.getByRole('button',{name:'Confirmar cadastro',exact:true}).click();await expect(panel(page).getByText(/Referências DEV cadastradas\./)).toBeVisible();
 const after=await context(request,value.id);expect(after.missingCodes).toEqual([]);expect(after.environments.filter((row:{code:string})=>row.code!=='DEV')).toEqual(before.environments);
 await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Auditoria',exact:true}).click();await expect(page.locator('.audit-history').getByText('Referências de ambiente cadastradas',{exact:true}).filter({visible:true}).first()).toBeVisible();
});
test('permission and confirmation changes require reviewing persona and repository revision',async({page,request})=>{
 const value=await legacy();await open(page,value.id,'carla');await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toHaveCount(0);await expect(panel(page)).toContainText('Selecione Administrador, Product Owner ou Arquiteto');
 await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');await expect(page.getByRole('region',{name:'Confirmar cadastro de referências',exact:true})).toHaveCount(0);await expect(panel(page)).toContainText('O contexto ou a persona mudou');
 await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();await sql('UPDATE "Repository" SET version=version+1 WHERE id=$1',[value.repositoryId]);
 await panel(page).getByRole('button',{name:'Confirmar cadastro',exact:true}).click();await expect(panel(page).getByRole('alert')).toContainText('O repositório mudou');expect((await context(request,value.id)).missingCodes).toEqual(['DEV']);
 await panel(page).getByRole('button',{name:'Atualizar consulta',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toBeEnabled();
 await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();await panel(page).getByRole('button',{name:'Confirmar cadastro',exact:true}).click();await expect(panel(page).getByText(/Referências DEV cadastradas\./)).toBeVisible();
});
test('lost response survives reload and replays the original key, body and persona once',async({page,request})=>{
 const value=await legacy();await open(page,value.id);let first=true,key='',body='';
 await page.route(`**/api/systems/${value.id}/environment-references`,async route=>{
  if(first){first=false;key=route.request().headers()['idempotency-key'];body=route.request().postData()!;const applied=await route.fetch();expect(applied.ok(),await applied.text()).toBe(true);return route.abort();}
  expect(route.request().headers()['idempotency-key']).toBe(key);expect(route.request().postData()).toBe(body);expect(route.request().headers()['x-persona']).toBe('admin');return route.continue();
 });
 await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();await panel(page).getByRole('button',{name:'Confirmar cadastro',exact:true}).click();await expect(panel(page).getByText('Cadastro ainda não confirmado',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');await expect(panel(page).getByRole('button',{name:'Verificar resultado do cadastro',exact:true})).toBeDisabled();
 await page.reload();await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');await panel(page).getByRole('button',{name:'Verificar resultado do cadastro',exact:true}).click();await expect(panel(page).getByText('Cadastro ainda não confirmado',{exact:true})).toHaveCount(0);
 expect((await context(request,value.id)).environments).toHaveLength(4);
 const rows=await sql('SELECT count(*)::integer AS count FROM "HistoryEvent" WHERE "itemId"=$1 AND action=\'ENVIRONMENT_REFERENCES_REGISTERED\'',[value.id]);expect(rows.rows[0].count).toBe(1);
});
test('read failure preserves the last reference grid and blocks recovery until a confirmed query',async({page,request})=>{
 const value=await legacy();await page.setViewportSize({width:390,height:900});await open(page,value.id);await activeTabVisible(page);
 await page.route(`**/api/systems/${value.id}/environments`,route=>route.fulfill({status:503,json:{error:{message:'Consulta indisponível no ensaio.'}}}));
 await panel(page).getByRole('button',{name:'Atualizar consulta',exact:true}).click();await expect(panel(page).getByRole('alert')).toContainText('Consulta indisponível no ensaio.');await expect(panel(page).getByText('Referência cadastrada',{exact:true})).toHaveCount(3);
 await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toBeDisabled();await page.screenshot({path:screenshot('environments-query-error.png'),fullPage:true});
 await page.unroute(`**/api/systems/${value.id}/environments`);await panel(page).getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true})).toBeEnabled();expect((await context(request,value.id)).missingCodes).toEqual(['DEV']);
});
test('a concurrently completed registration is a neutral NO_CHANGE and never a deployment',async({page,request})=>{
 const value=await legacy(),before=await context(request,value.id);await open(page,value.id);await panel(page).getByRole('button',{name:'Cadastrar referências ausentes',exact:true}).click();
 const other=await request.post(`/api/systems/${value.id}/environment-references`,{headers:headers('ana'),data:{expectedVersion:before.system.version,expectedRepositoryId:before.repository.id,expectedRepositoryVersion:before.repository.version,codes:['DEV']}});expect(other.ok(),await other.text()).toBe(true);
 await panel(page).getByRole('button',{name:'Confirmar cadastro',exact:true}).click();await expect(panel(page).getByText(/As referências solicitadas já estavam cadastradas\./)).toBeVisible();await expect(panel(page).getByText(/Referências DEV cadastradas\./)).toHaveCount(0);
 expect((await context(request,value.id)).environments).toHaveLength(4);
});
