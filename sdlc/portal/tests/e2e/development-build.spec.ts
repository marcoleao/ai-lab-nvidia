import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import type {DevelopmentBuildContext,DevelopmentBuildOperation,DevelopmentBuildReading} from '../../packages/shared/src/development-build';
import {storyDeliveryReading} from '../../packages/shared/src/story-delivery';
import {mockPersonas,mockTaskCollection,uiJourney} from './journey-fixtures';

// Fully intercepted interface fixtures. No operational database, repository,
// application, model or executor is contacted by this file.
const storyId='build-story-isolated',sha='a'.repeat(40),digest='b'.repeat(64),base=`/api/items/${storyId}/development-build`;
const url=`/stories/${storyId}?tab=planning&process=environment&environment=DEV&tasks.q=preservar`;
const reason='Construir a revisão integrada para conferir a versão de trabalho.';
const panel=(page:Page)=>page.getByTestId('development-build'),confirmation=(page:Page)=>page.getByTestId('development-build-confirmation');
type Write={path:string;body:any;persona:string;key:string};
function operation(state:DevelopmentBuildOperation['state']='queued',version=1):DevelopmentBuildOperation{
 return {id:'build-job-isolated',number:1,version,state,message:state==='succeeded'?'Construção concluída; artefato verificado.':'Pedido de construção recebido para esta revisão.',actorName:'Ana',reason,sourceSha:sha,contractDigest:digest,unitId:'web',policyVersion:'node-dev-v1',createdAt:'2026-10-29T18:00:00Z',updatedAt:'2026-10-29T18:00:00Z',startedAt:null,finishedAt:state==='succeeded'?'2026-10-29T18:01:00Z':null,dispatchStartedAt:state==='succeeded'?'2026-10-29T18:00:30Z':null,artifact:state==='succeeded'?{imageId:'sha256:'+'c'.repeat(64),archiveDigest:'d'.repeat(64),size:4096}:null};
}
async function fixture(page:Page){
 const stamp='2026-10-29T18:00:00Z',itemBase={description:'Somente fixture de interface.',version:7,archived:false,data:{},createdAt:stamp,updatedAt:stamp};
 const system={...itemBase,id:'build-system',kind:'system',key:'COURSE',name:'Sistema isolado de cursos',status:'active',parentId:null};
 const project={...itemBase,id:'build-project',kind:'project',key:'COURSE-P',name:'Projeto isolado',status:'active',parentId:system.id};
 const epic={...itemBase,id:'build-epic',kind:'epic',key:'COURSE-E',name:'Épico isolado',status:'active',parentId:project.id};
 const story={...itemBase,id:storyId,kind:'story',key:'COURSE-1',name:'Consultar cursos disponíveis',status:'merge_request',parentId:epic.id};
 const task={...itemBase,id:'build-task',kind:'task',key:'COURSE-T',name:'Tarefa do ensaio',status:'todo',parentId:storyId,managed:false};
 const state={reading:{storyId,configured:true,operation:null,artifact:null,asOf:stamp} as DevelopmentBuildReading,
  context:{storyId,storyKey:story.key,systemId:system.id,repositoryId:'build-repository',repositoryName:'Repositório isolado de cursos',projectId:42,sourceSha:sha,targetBranch:'main',integrationReferenceId:'build-reference',contractDigest:digest,unitId:'web',runtime:'Node 24',policyVersion:'node-dev-v1',executorReady:true,allowed:true,blockers:[],token:'context-original',asOf:stamp} as DevelopmentBuildContext,
  writes:[] as Write[],unexpected:[] as string[],errors:[] as string[],readingFailed:false,loseAck:false,rejectChanged:false,effects:0,requests:new Map<string,unknown>(),localReads:[] as string[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 await page.addInitScript(()=>sessionStorage.setItem('sdlc-persona','ana'));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,method=request.method(),send=(value:unknown)=>route.fulfill({json:value});
  if(!['GET','HEAD'].includes(method)){
   const write={path,body:request.postDataJSON(),persona:request.headers()['x-persona'],key:request.headers()['idempotency-key']};state.writes.push(write);
   if(path===base){
    if(state.requests.has(write.key))return send(state.requests.get(write.key));
    if(state.rejectChanged)return route.fulfill({status:409,json:{error:{code:'DEVELOPMENT_BUILD_CHANGED',message:'A fonte mudou. Confira novamente a versão para construir.'}}});
    state.effects++;state.reading.operation=operation();const receipt={receiptType:'development_build_requested',operation:state.reading.operation};state.requests.set(write.key,receipt);
    if(state.loseAck){state.loseAck=false;return route.abort();}return send(receipt);
   }
   if(path===base+'/build-job-isolated/reconcile'){state.reading.operation=operation('succeeded',3);state.reading.artifact=state.reading.operation;return send({receiptType:'development_build_observed',operation:state.reading.operation});}
   if(path===base+'/build-job-isolated/resume'){state.reading.operation={...operation(),version:3};return send({receiptType:'development_build_resumed',operation:state.reading.operation});}
   if(path===base+'/build-job-isolated/cancel'){state.reading.operation=operation('cancelled',3);return send({receiptType:'development_build_cancelled',operation:state.reading.operation});}
   state.unexpected.push(method+' '+path);return route.fulfill({status:409,json:{error:{message:'Mutação fora do roteiro isolado.'}}});
  }
  if(path===base){state.localReads.push(path);if(state.readingFailed)return route.fulfill({status:503,json:{error:{message:'Executor indisponível para a consulta do ensaio.'}}});return send(state.reading);}
  if(path===`/api/items/${storyId}/development-test`)return send({storyId,configured:false,operation:null,evidence:null,current:false,taskId:null,asOf:stamp});
  if(path===`/api/items/${storyId}/development-approval`)return send({storyId,approval:null,validity:{state:'not_recorded',label:'Sem aprovação registrada',reasons:[]},approvalAvailable:false,asOf:stamp});
  if(path===base+'/context')return send(state.context);
  if(path===`/api/items/${storyId}/development-deployment`)return send({storyId,configured:false,operation:null,deployment:null,preparation:null,asOf:stamp});
  if(path.endsWith('/development-build')){state.localReads.push(path);return route.fulfill({status:404,json:{error:{message:'Essa consulta não pertence à História do ensaio.'}}});}
  if(path.endsWith('/journey'))return send(uiJourney(story,{id:'build-run',state:'succeeded',stage:'completed',commitSha:sha,createdAt:stamp},{current:{kind:'merge',state:'succeeded',title:'Código integrado',message:'Merge confirmado. A construção DEV é uma decisão separada.'},merge:{state:'succeeded',sha,blocks:[],integrationReference:{state:'recorded',id:'build-reference',operationId:'build-merge',executionId:'build-run',projectId:42,iid:1,sourceBranch:'sdlc/story-build-run',targetBranch:'main',sourceSha:sha,integrationSha:sha,mergeCommitSha:sha,squashCommitSha:null,mergedAt:stamp,observedAt:stamp,policyVersion:'gitlab-merge-reference-v1'}},tasks:[task],delivery:storyDeliveryReading({status:story.status,mergeConfirmed:true}),permissions:{canAct:['ana','bruno','admin'].includes(request.headers()['x-persona'])},repositoryName:'Repositório isolado de cursos'}));
  if(path.endsWith('/release'))return send({story:{...story,projectId:project.id,projectName:project.name,epicId:epic.id,epicName:epic.name},assignment:null,system,releases:[],truncated:false,totalChoices:0});
  if(path.endsWith('/history'))return send({events:[],page:1,pageSize:20,total:0,totalPages:1,asOf:stamp,actors:[],types:[],results:[]});
  if(path.endsWith('/results'))return send({results:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},asOf:stamp,readOnly:false,coverage:{source:'TaskResultRevision',legacyResultAvailable:false}});
  const selected=[system,project,epic,story,task].find(item=>path===`/api/items/${item.id}`);
  if(selected)return send({item:selected,ancestors:[system,project,epic,...(selected.kind==='task'?[story]:[])],children:selected.id===storyId?[task]:[],repositories:[],availableRepositories:[],environments:[],history:[],hierarchy:{writable:true}});
  return send({items:[]});
 });
 await mockPersonas(page);await mockTaskCollection(page,()=>[task]);return state;
}
async function open(page:Page,width:number,path=url){await page.setViewportSize({width,height:1000});await page.goto(path);await expect(panel(page)).toBeVisible();await expect(panel(page).getByRole('button',{name:'Conferir versão para construir',exact:true})).toBeEnabled();}
async function review(page:Page){await panel(page).getByRole('button',{name:'Conferir versão para construir',exact:true}).click();await expect(confirmation(page)).toBeFocused();}
async function accept(page:Page){await confirmation(page).getByRole('textbox',{name:'Motivo da construção DEV',exact:true}).fill(reason);await confirmation(page).getByRole('checkbox').check();}
const submit=(page:Page)=>confirmation(page).getByRole('button',{name:'Confirmar construção DEV',exact:true}).click();
function clean(state:Awaited<ReturnType<typeof fixture>>){expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);}
async function capture(page:Page,name:string){if(!process.env.SCREENSHOT_DIR)return;mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.evaluate(()=>{(document.activeElement as HTMLElement|null)?.blur();window.scrollTo(0,0);});await page.screenshot({path:process.env.SCREENSHOT_DIR+'/'+name+'.png',fullPage:true});}

for(const width of [1440,390]){
 test(`DEV build confirms fixed source without release or deployment at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);expect(state.writes).toEqual([]);await review(page);await expect(confirmation(page)).toContainText(sha);await expect(confirmation(page)).toContainText(digest);await accept(page);await capture(page,`development-build-confirmation-${width}`);await submit(page);
  await expect(panel(page)).toContainText('Construção solicitada · na fila');await expect(page.getByTestId('development-build-result')).toBeFocused();expect(state.effects).toBe(1);expect(state.writes[0].body).toEqual({expectedStoryVersion:7,expectedOperationId:null,contextToken:'context-original',reason,confirmed:true});expect(state.writes[0].persona).toBe('ana');expect(state.writes[0].key).toBeTruthy();await expect(page).toHaveURL(/tasks.q=preservar/);await expect(page.getByTestId('story-environment-detail')).toContainText('Consulte o quadro Publicar versão em DEV');await expect(page.locator('.sidebar .brand')).toContainText('Dell Technologies');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,`development-build-queued-${width}`);clean(state);
 });
 test(`DEV build preserves known artifact when a later GET fails at ${width}px`,async({page})=>{
  const state=await fixture(page);state.reading.operation=operation('succeeded',4);state.reading.artifact=state.reading.operation;await open(page,width);await expect(panel(page)).toContainText('Último artefato confirmado');state.readingFailed=true;await panel(page).getByRole('button',{name:'Atualizar acompanhamento da construção',exact:true}).click();await expect(panel(page)).toContainText('O último resultado conhecido foi preservado');await expect(panel(page)).toContainText('sha256:'+'c'.repeat(64));await expect(panel(page)).toContainText('não confirma publicação em DEV, testes ou Desenvolvimento Finalizado');await review(page);await expect(confirmation(page).getByRole('button',{name:'Confirmar construção DEV',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);await capture(page,`development-build-artifact-query-failure-${width}`);clean(state);
 });
 test(`DEV build lost ACK recovers the original request across tabs and reload at ${width}px`,async({page})=>{
  const state=await fixture(page);state.loseAck=true;await open(page,width);await review(page);await accept(page);await submit(page);await expect(panel(page)).toContainText('Solicitação aguardando confirmação');const first=state.writes[0];await page.getByRole('navigation',{name:'Seções de História',exact:true}).getByRole('link',{name:/^Tarefas/}).click();await expect(page.getByTestId('development-build-recovery')).toBeVisible();await page.reload();await expect(page.getByTestId('development-build-recovery')).toBeVisible();await page.getByTestId('development-build-recovery').getByRole('button',{name:'Voltar à construção DEV',exact:true}).click();await expect(panel(page)).toBeVisible();await panel(page).getByRole('button',{name:'Verificar recebimento da construção',exact:true}).click();await expect(panel(page).getByText('Solicitação aguardando confirmação',{exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(2);expect(state.writes[1]).toEqual(first);expect(state.effects).toBe(1);clean(state);
 });
 test(`DEV build context refusal preserves draft and requires another review at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);await review(page);await accept(page);state.rejectChanged=true;await submit(page);await expect(panel(page)).toContainText('A fonte mudou');state.rejectChanged=false;state.context={...state.context,sourceSha:'e'.repeat(40),token:'context-new'};await review(page);await expect(confirmation(page).getByRole('textbox',{name:'Motivo da construção DEV',exact:true})).toHaveValue(reason);await expect(confirmation(page).getByRole('checkbox')).not.toBeChecked();await expect(confirmation(page)).toContainText('e'.repeat(40));expect(state.effects).toBe(0);clean(state);
 });
 test(`DEV build read-only persona sees blockers and cannot authorize at ${width}px`,async({page})=>{
  const state=await fixture(page);state.context={...state.context,allowed:false,executorReady:false,blockers:['O contrato de execução ainda não foi integrado.','O executor de construção não está disponível.']};await open(page,width);await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');await review(page);await expect(confirmation(page)).toContainText('O contrato de execução ainda não foi integrado');await expect(confirmation(page)).toContainText('O executor de construção não está disponível');await expect(confirmation(page).getByRole('checkbox')).toBeDisabled();await expect(confirmation(page).getByRole('button',{name:'Confirmar construção DEV',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);await capture(page,`development-build-blocked-${width}`);clean(state);
 });
 test(`DEV build persona change invalidates confirmation and preserves reason at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);await review(page);await accept(page);await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');await expect(confirmation(page).getByRole('checkbox')).not.toBeChecked();await expect(confirmation(page).getByRole('textbox',{name:'Motivo da construção DEV',exact:true})).toHaveValue(reason);await expect(panel(page)).toContainText('A revisão, o pedido ou a persona mudou');await expect(confirmation(page).getByRole('button',{name:'Confirmar construção DEV',exact:true})).toBeDisabled();expect(state.writes).toEqual([]);clean(state);
 });
 test(`DEV build result reconciliation observes the same operation at ${width}px`,async({page})=>{
  const state=await fixture(page);state.reading.operation={...operation('unknown',2),dispatchStartedAt:'2026-10-29T18:00:10Z',message:'A resposta do executor não foi confirmada; consulte o mesmo pedido.'};await open(page,width);await panel(page).getByRole('button',{name:'Verificar resultado da construção',exact:true}).click();await expect(panel(page)).toContainText('Último artefato confirmado');expect(state.writes.map(write=>write.path)).toEqual([base+'/build-job-isolated/reconcile']);expect(state.effects).toBe(0);clean(state);
 });
 test(`DEV build pause requires explicit resume of the original operation at ${width}px`,async({page})=>{
  const state=await fixture(page);state.reading.operation=operation('paused',2);await open(page,width);await panel(page).getByRole('button',{name:'Revisar retomada da construção',exact:true}).click();await expect(confirmation(page)).toBeFocused();await confirmation(page).getByRole('checkbox').check();await confirmation(page).getByRole('button',{name:'Confirmar retomada da construção',exact:true}).click();await expect(panel(page)).toContainText('Construção solicitada · na fila');expect(state.writes[0]).toMatchObject({path:base+'/build-job-isolated/resume',body:{expectedVersion:2,confirmed:true}});expect(state.effects).toBe(0);clean(state);
 });
 test(`DEV build cancellation is explicit before dispatch at ${width}px`,async({page})=>{
  const state=await fixture(page);state.reading.operation=operation('queued',2);await open(page,width);await panel(page).getByRole('button',{name:'Revisar cancelamento da construção',exact:true}).click();await expect(confirmation(page)).toBeFocused();await expect(confirmation(page)).toContainText('ainda não foi enviada ao executor');await confirmation(page).getByRole('checkbox').check();await confirmation(page).getByRole('button',{name:'Confirmar cancelamento da construção',exact:true}).click();await expect(panel(page)).toContainText('Construção cancelada');expect(state.writes[0]).toMatchObject({path:base+'/build-job-isolated/cancel',body:{expectedVersion:2,confirmed:true}});clean(state);
 });
 test(`DEV build from a task consults the owning story at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width,`/tasks/build-task?tab=planning&process=environment&environment=DEV`);await expect(panel(page)).toContainText('Nenhuma construção solicitada nesta História');expect(state.localReads).toContain(base);expect(state.localReads).not.toContain('/api/items/build-task/development-build');expect(state.writes).toEqual([]);clean(state);
 });
}
