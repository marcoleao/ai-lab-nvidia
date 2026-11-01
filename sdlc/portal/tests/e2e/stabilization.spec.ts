import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {systemKey} from './system-fixtures';
import {mockPersonas,mockTaskCollection,uiJourney} from './journey-fixtures';
import type {MergeIntegrationReading} from '../../packages/shared/src/merge-integration-reference';

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
 for(const name of ['Codificação','Teste em DEV','Revisão de Código','Revisão de Segurança','Teste em QA','Merge de Código'])await expect(tasks.getByRole('link',{name:new RegExp(`${name}$`)})).toBeVisible();
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
 await page.goto(`/stories/${f.story.id}/execution`);await chooseAdmin(page);const reopenLink=page.getByTestId('story-execution-hub').getByRole('link',{name:'Reabrir História',exact:true});await expect(reopenLink).toHaveAttribute('href',`/stories/${f.story.id}/execution/actions/reopen_story`);await reopenLink.click();await expect(page).toHaveURL(`/stories/${f.story.id}/execution/actions/reopen_story`);
 const reopen=page.getByRole('region',{name:'Reabrir História',exact:true});await expect(reopen).toBeVisible();await expect(reopen.getByRole('button',{name:'Reabrir em SPECIFICATION'})).toBeDisabled();
 await reopen.getByRole('textbox',{name:'Justificativa',exact:true}).fill('Retomar o escopo após decisão explícita de planejamento.');await reopen.getByRole('button',{name:'Reabrir em SPECIFICATION'}).click();
 await expect(page.getByTestId('story-phase')).toHaveText('SPECIFICATION');
 const journey=await (await request.get(`/api/items/${f.story.id}/journey`,{headers:{'X-Persona':'admin'}})).json();expect(journey.story.status).toBe('specification');expect(journey.tasks).toHaveLength(6);expect(journey.tasks.every((task:any)=>task.status==='cancelled')).toBe(true);expect(journey.run).toBeNull();
});

test('Story reopening recovers a committed lost acknowledgment with the original comment persona body and key',async({page,request})=>{
 const f=await setup(request),comment='Retomar o escopo após conferir a reabertura e preservar as Tarefas anteriores.';
 const cancelledResponse=await request.post(`/api/items/${f.story.id}/cancel`,{headers:headers(),data:{expectedVersion:f.story.version}});expect(cancelledResponse.ok(),await cancelledResponse.text()).toBe(true);const cancelled=(await cancelledResponse.json()).item;
 const attempts:{body:string;key:string;persona:string}[]=[],errors:string[]=[];let committedVersion=0;page.on('pageerror',error=>errors.push(error.message));
 await page.route(`**/api/items/${f.story.id}/reopen`,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const req=route.request();attempts.push({body:req.postData()!,key:req.headers()['idempotency-key'],persona:req.headers()['x-persona']});
  const response=await route.fetch();expect(response.ok()).toBe(true);
  if(attempts.length===1){const receipt=await response.json();expect(receipt.item.status).toBe('specification');committedVersion=receipt.item.version;return route.abort('failed');}
  return route.fulfill({response});
 });
 const audit=async()=>{const response=await request.get(`/api/items/${f.story.id}/history?scope=self&type=STORY_REOPENED`);expect(response.ok(),await response.text()).toBe(true);return response.json();};
 await page.goto(`/stories/${f.story.id}/execution`);await chooseAdmin(page);await page.getByTestId('story-execution-hub').getByRole('link',{name:'Reabrir História',exact:true}).click();
 const reopen=page.getByRole('region',{name:'Reabrir História',exact:true}),draft=page.locator('section[aria-label="Reabrir História"] textarea');await reopen.getByRole('textbox',{name:'Justificativa',exact:true}).fill(comment);await reopen.getByRole('button',{name:'Reabrir em SPECIFICATION',exact:true}).click();
 await expect(page.getByTestId('pending-command')).toBeVisible();await expect(draft).toHaveValue(comment);expect(attempts).toHaveLength(1);expect(attempts[0].key).toBeTruthy();expect(attempts[0].persona).toBe('admin');expect(JSON.parse(attempts[0].body)).toEqual({expectedVersion:cancelled.version,comment});
 const committed=(await(await request.get(`/api/items/${f.story.id}`)).json()).item;expect(committed.status).toBe('specification');expect(committed.version).toBe(committedVersion);expect((await audit()).total).toBe(1);
 await page.getByRole('link',{name:'Voltar à Execução',exact:true}).click();await page.getByTestId('story-execution-hub').getByRole('link',{name:'Verificar solicitação pendente',exact:true}).click();await expect(page).toHaveURL(`/stories/${f.story.id}/execution/actions/pending`);await page.reload();await chooseAdmin(page);
 const retry=page.getByTestId('pending-command').getByRole('button',{name:'Verificar a mesma solicitação',exact:true});await expect(retry).toBeVisible();
 const saved=await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`sdlc-journey:${id}`)!),f.story.id);expect(saved.body).toEqual({expectedVersion:cancelled.version,comment});expect(saved.key).toBe(attempts[0].key);expect(saved.persona).toBe('admin');
 await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');await expect(retry).toBeDisabled();expect(attempts).toHaveLength(1);await chooseAdmin(page);await retry.click();
 await expect(page.getByTestId('pending-command')).toHaveCount(0);await expect(page).toHaveURL(`/stories/${f.story.id}/execution`);expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);
 const final=(await(await request.get(`/api/items/${f.story.id}`)).json()).item;expect(final.status).toBe('specification');expect(final.version).toBe(committedVersion);const history=await audit();expect(history.total).toBe(1);expect(history.events).toHaveLength(1);expect(history.events[0].action).toBe('STORY_REOPENED');
 const journey=await(await request.get(`/api/items/${f.story.id}/journey`,{headers:{'X-Persona':'admin'}})).json();expect(journey.tasks).toHaveLength(6);expect(journey.tasks.every((task:any)=>task.status==='cancelled')).toBe(true);expect(journey.run).toBeNull();expect(errors).toEqual([]);
});

test('A pending reference blocks the Story reopening owner without clearing its draft or sending a mutation',async({page})=>{
 // Synthetic browser DTOs and a recoverable browser attempt only. Every API is
 // intercepted; no database, GitLab resource or operational result is changed.
 const id='reopen-pending-isolated',operationId='reopen-reference-isolated',stamp='2026-11-01T09:00:00.000Z',source='a'.repeat(40),comment='A justificativa permanece até resolver a confirmação histórica pendente.';
 const common={description:'Fixture de interface isolada.',version:7,archived:false,data:{},createdAt:stamp,updatedAt:stamp};
 const system={...common,id:'reopen-isolated-system',kind:'system',key:'REOPEN',name:'Sistema isolado',status:'active',parentId:null},project={...common,id:'reopen-isolated-project',kind:'project',key:'REOPEN-P',name:'Projeto isolado',status:'active',projectLifecycle:'active',parentId:system.id},epic={...common,id:'reopen-isolated-epic',kind:'epic',key:'REOPEN-E',name:'Épico isolado',status:'active',parentId:project.id},story={...common,id,kind:'story',key:'REOPEN-1',name:'História cancelada isolada',status:'cancelled',parentId:epic.id};
 const reference:MergeIntegrationReading={state:'not_captured',operationId,executionId:'reopen-previous-execution',projectId:42,iid:1,sourceBranch:'sdlc/previous',targetBranch:'main',sourceSha:source,observedAt:stamp,policyVersion:'gitlab-merge-reference-v1'};
 const original={path:`/merge-operations/${operationId}/integration-reference`,method:'POST',body:{confirmed:true,contextToken:'isolated-reference-context',observation:{projectId:42,iid:1,sourceBranch:'sdlc/previous',targetBranch:'main',sourceSha:source,mergeCommitSha:'b'.repeat(40),squashCommitSha:null,mergedAt:stamp}},persona:'admin',key:'isolated-original-reference-key'};
 const state={referenceVisible:false,writes:[] as string[],errors:[] as string[]};page.on('pageerror',error=>state.errors.push(error.message));
 await page.addInitScript(({operationId,original})=>{sessionStorage.setItem('sdlc-persona','admin');sessionStorage.setItem(`sdlc-release-operation:merge-reference:${operationId}`,JSON.stringify(original));},{operationId,original});
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname,send=(json:unknown)=>route.fulfill({json});
  if(!['GET','HEAD'].includes(req.method())){state.writes.push(req.method()+' '+path);return route.abort();}
  if(path===`/api/items/${id}/journey`)return send(uiJourney(story,{id:reference.executionId,state:'succeeded',stage:'completed',commitSha:source,createdAt:stamp},{current:{phase:'CANCELLED',kind:'specification',state:'cancelled',title:'História cancelada',message:'A reabertura exige justificativa e novo Gateway de Especificação.'},nextAction:{id:'reopen_story',kind:'reopen_story',label:'Reabrir História',href:`/stories/${id}?tab=manage`,enabled:true},permissions:{canAct:true,canManageLifecycle:true},merge:state.referenceVisible?{id:operationId,state:'succeeded',sha:source,integrationReference:reference}:null}));
  if(path===`/api/items/${id}/development-build`)return send({storyId:id,configured:false,operation:null,artifact:null,asOf:stamp});
  if(path===`/api/items/${id}/development-deployment`)return send({storyId:id,configured:false,operation:null,deployment:null,preparation:null,asOf:stamp});
  if(path===`/api/items/${id}/development-test`)return send({storyId:id,configured:false,operation:null,evidence:null,current:false,taskId:null,asOf:stamp});
  if(path===`/api/items/${id}/development-approval`)return send({storyId:id,approval:null,validity:{state:'not_recorded',label:'Sem aprovação registrada',reasons:[]},approvalAvailable:false,asOf:stamp});
  if(path===`/api/items/${id}/release`)return send({story,assignment:null,releases:[],system,truncated:false,totalChoices:0});
  if(path.endsWith('/history'))return send({events:[],page:1,pageSize:20,total:0,totalPages:1,actors:[],types:[],results:[],asOf:stamp});
  const selected=[system,project,epic,story].find(item=>path===`/api/items/${item.id}`);if(selected)return send({item:selected,ancestors:[system,project,epic],children:[],repositories:[],availableRepositories:[],environments:[],history:[],hierarchy:{writable:true}});
  return send({items:[]});
 });
 await mockPersonas(page);await mockTaskCollection(page,()=>[]);await page.goto(`/stories/${id}/execution/actions/reopen_story`);
 const reopen=page.getByRole('region',{name:'Reabrir História',exact:true}),draft=reopen.getByRole('textbox',{name:'Justificativa',exact:true}),submit=reopen.getByRole('button',{name:'Reabrir em SPECIFICATION',exact:true});await draft.fill(comment);await expect(submit).toBeEnabled();
 state.referenceVisible=true;await expect(submit).toBeDisabled({timeout:10000});await expect(draft).toBeDisabled();await expect(draft).toHaveValue(comment);
 const process=page.getByTestId('story-process');await expect(process.getByRole('status').filter({hasText:'Há um registro de integração aguardando confirmação. Preserve a justificativa e recupere a solicitação original antes de reabrir.'})).toBeVisible();await expect(process.getByRole('link',{name:'Recuperar registro de integração pendente',exact:true})).toHaveAttribute('href',`/stories/${id}/execution/processing`);expect(state.writes).toEqual([]);
 await page.getByRole('link',{name:'Voltar à Execução',exact:true}).click();await expect(page.getByTestId('story-execution-hub').getByRole('link',{name:'Recuperar registro de integração pendente',exact:true})).toBeVisible();
 expect(await page.evaluate(operationId=>JSON.parse(sessionStorage.getItem(`sdlc-release-operation:merge-reference:${operationId}`)!),operationId)).toEqual(original);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
