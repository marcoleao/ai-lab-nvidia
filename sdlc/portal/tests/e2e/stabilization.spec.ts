import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {systemKey} from './system-fixtures';

// Real API/browser behavior is confined to the disposable database. No provider
// or inference is required by these scenarios, and no application is executed.
test.skip(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'),'Requires isolated portal_test API');
const headers=()=>({'X-Persona':'admin','Idempotency-Key':randomUUID()});
async function setup(request:APIRequestContext){
 const health=await request.get('/api/health');expect(health.ok()).toBe(true);expect((await health.json()).databaseMode).toBe('test');
 const create=async(data:unknown)=>{const response=await request.post('/api/items',{headers:headers(),data});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).item;};
 const system=await create({kind:'system',key:systemKey(),name:'Sistema de estabilização isolado'}),project=await create({kind:'project',parentId:system.id,key:systemKey(),name:'Projeto de estabilização isolado'}),epic=await create({kind:'epic',parentId:project.id,name:'Épico de estabilização isolado'}),story=await create({kind:'story',parentId:epic.id,name:'História de estabilização isolada'});
 return {system,project,epic,story};
}
async function chooseAdmin(page:Page){await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');}

test('Project key uses the System six-letter rule in the form and persistence',async({page,request})=>{
 const f=await setup(request);await page.goto(`/systems/${f.system.id}`);await chooseAdmin(page);
 await page.getByTestId('create-item').click();
 const form=page.getByRole('form',{name:'Formulário do item'}),input=form.getByRole('textbox',{name:/Chave/});
 await expect(input).toHaveAttribute('minlength','6');await expect(input).toHaveAttribute('maxlength','6');await expect(input).toHaveAttribute('pattern','[A-Z]{6}');
 await input.fill('a1b2c3');await expect(input).toHaveValue('ABC');expect(await input.evaluate(element=>(element as HTMLInputElement).checkValidity())).toBe(false);
 const key=systemKey();await input.fill(key.toLowerCase());await expect(input).toHaveValue(key);
 await form.getByRole('textbox',{name:/Nome ou título/}).fill('Projeto com chave padronizada');
 await page.getByRole('button',{name:'Salvar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Projeto com chave padronizada',exact:true})).toBeVisible();
 const response=await request.get(`/api/items/${new URL(page.url()).pathname.split('/').at(-1)}`);expect(response.ok()).toBe(true);
 const persisted=(await response.json()).item;expect(persisted.data.code).toBe(key);expect(persisted.key).toBe(`${f.system.key}-${key}`);
});

async function specification(page:Page,storyId:string){await page.goto(`/stories/${storyId}?tab=specification`);await chooseAdmin(page);const editor=page.getByRole('region',{name:'Especificação da História',exact:true});await expect(editor).toBeVisible();return editor;}
async function fillBusiness(editor:ReturnType<Page['getByRole']>){
 await editor.getByRole('button',{name:'Editar especificação',exact:true}).click();
 await editor.getByRole('textbox',{name:'Objetivo',exact:true}).fill('Consultar a situação de uma solicitação pelo identificador.');
 await editor.getByRole('textbox',{name:'Comportamento esperado',exact:true}).fill('Informar um identificador e receber sua situação correspondente.');
 await editor.getByRole('textbox',{name:'Critérios de aceite funcionais',exact:true}).fill('Uma solicitação existente apresenta sua situação correspondente.');
}

test('manual Story creates the six Tasks and supports draft, manual technical plan and historical consultation',async({page,request})=>{
 const f=await setup(request);await page.goto(`/stories/${f.story.id}?tab=tasks`);await chooseAdmin(page);
 const tasks=page.getByTestId('journey-task-list');await expect(tasks.locator('tbody tr')).toHaveCount(6);
 for(const name of ['Codificação','Teste','Revisão de Código','Revisão de Segurança','Teste Final','Merge de Código'])await expect(tasks.getByRole('link',{name:new RegExp(`${name}$`)})).toBeVisible();
 const editor=await specification(page,f.story.id);await fillBusiness(editor);
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:/^Tarefas/}).click();
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Especificação',exact:true}).click();
 await expect(editor.getByRole('textbox',{name:'Comportamento esperado',exact:true})).toHaveValue('Informar um identificador e receber sua situação correspondente.');
 await editor.getByRole('checkbox',{name:'Preparar plano técnico manualmente'}).check();
 await editor.getByRole('textbox',{name:'Requisitos técnicos',exact:true}).fill('Validar o identificador e consultar a situação correspondente.');
 await editor.getByRole('textbox',{name:'Arquitetura',exact:true}).fill('Uma função de consulta preserva o contrato e retorna a situação.');
 await editor.getByRole('button',{name:'Adicionar caso de teste',exact:true}).click();
 await editor.getByRole('textbox',{name:'Cenário verificável',exact:true}).fill('Informar um identificador conhecido e verificar a situação retornada.');
 await editor.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
 await expect(editor.getByText('Exibindo o rascunho salvo para revisão.',{exact:false})).toBeVisible();
 expect((await (await request.get(`/api/items/${f.story.id}/specification`,{headers:{'X-Persona':'admin'}})).json()).revision).toBeNull();
 await page.reload();await expect(editor.getByText('Exibindo a especificação vigente da História.',{exact:true})).toBeVisible();
 await editor.getByRole('button',{name:'Revisar rascunho salvo',exact:true}).click();
 await editor.getByRole('checkbox',{name:'Confirmo aplicar o rascunho salvo à História.'}).check();
 await editor.getByRole('button',{name:'Aplicar especificação',exact:true}).click();
 await expect(editor.getByText('Nova especificação vigente registrada.',{exact:false})).toBeVisible();
 const saved=await (await request.get(`/api/items/${f.story.id}/specification`,{headers:{'X-Persona':'admin'}})).json();expect(saved.revision.number).toBe(1);expect(saved.content.technical.architecture).toContain('Uma função de consulta');
 await editor.getByText(/^Revisões aplicadas ·/).click();await editor.getByRole('button',{name:'Consultar revisão 1',exact:true}).click();
 await expect(editor.getByText('Exibindo a revisão histórica #1',{exact:false})).toBeVisible();
 expect((await (await request.get(`/api/items/${f.story.id}/journey`,{headers:{'X-Persona':'admin'}})).json()).run).toBeNull();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('an uncertain draft command survives reload and reuses the same idempotency key',async({page,request})=>{
 const f=await setup(request),editor=await specification(page,f.story.id);await fillBusiness(editor);let drop=true;const keys:string[]=[];
 await page.route(`**/api/items/${f.story.id}/specification/draft`,async route=>{
  if(route.request().method()!=='PUT')return route.continue();keys.push(route.request().headers()['idempotency-key']);
  if(drop){drop=false;const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort('failed');}else await route.continue();
 });
 await editor.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await expect(editor.getByRole('button',{name:'Verificar a mesma solicitação',exact:true})).toBeVisible();
 await page.reload();await chooseAdmin(page);await editor.getByRole('button',{name:'Verificar a mesma solicitação',exact:true}).click();
 await expect(editor.getByText('Rascunho salvo. A revisão em execução permanece preservada.',{exact:true})).toBeVisible();
 expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);const state=await (await request.get(`/api/items/${f.story.id}/specification`,{headers:{'X-Persona':'admin'}})).json();expect(state.draft.version).toBe(1);expect(state.revision).toBeNull();
});

test('inactive ancestors freeze editing and explicit Story reopening preserves cancelled Tasks',async({page,request})=>{
 const f=await setup(request);let response=await request.post(`/api/items/${f.project.id}/lifecycle`,{headers:headers(),data:{expectedVersion:f.project.version,lifecycle:'inactive'}});expect(response.ok(),await response.text()).toBe(true);const inactive=(await response.json()).item;
 const editor=await specification(page,f.story.id);await expect(editor.getByRole('button',{name:'Editar especificação',exact:true})).toBeDisabled();
 response=await request.post('/api/items',{headers:headers(),data:{kind:'task',parentId:f.story.id,name:'Criação bloqueada'}});expect(response.status()).toBe(409);
 response=await request.post(`/api/items/${f.project.id}/lifecycle`,{headers:headers(),data:{expectedVersion:inactive.version,lifecycle:'active'}});expect(response.ok(),await response.text()).toBe(true);
 const current=(await (await request.get(`/api/items/${f.story.id}`)).json()).item;
 response=await request.post(`/api/items/${f.story.id}/cancel`,{headers:headers(),data:{expectedVersion:current.version}});expect(response.ok(),await response.text()).toBe(true);
 await page.goto(`/stories/${f.story.id}?tab=planning`);await chooseAdmin(page);await page.getByRole('button',{name:'Reabrir História',exact:true}).click();
 const reopen=page.getByRole('region',{name:'Reabrir História',exact:true});await expect(reopen).toBeVisible();await expect(reopen.getByRole('button',{name:'Reabrir em SPECIFICATION'})).toBeDisabled();
 await reopen.getByRole('textbox',{name:'Justificativa',exact:true}).fill('Retomar o escopo após decisão explícita de planejamento.');await reopen.getByRole('button',{name:'Reabrir em SPECIFICATION'}).click();
 await expect(page.getByTestId('story-phase')).toHaveText('SPECIFICATION');
 const journey=await (await request.get(`/api/items/${f.story.id}/journey`,{headers:{'X-Persona':'admin'}})).json();expect(journey.story.status).toBe('specification');expect(journey.tasks).toHaveLength(6);expect(journey.tasks.every((task:any)=>task.status==='cancelled')).toBe(true);expect(journey.run).toBeNull();
});
