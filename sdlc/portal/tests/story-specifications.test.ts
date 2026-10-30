import {reviewedGateBody} from './reviewed-gate';
import {repositoryFixture} from './repository-fixture';
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';
import {recordAudit} from '../apps/api/src/audit.ts';
import {storySpecificationContentSchema,specificationReadiness,canonicalSpecification,initializeStorySpecification} from '../apps/api/src/story-specifications.ts';

const technical={requirements:'Retornar os resultados conforme os critérios aprovados.',architecture:'Validar a entrada e consultar somente os dados autorizados.',testCases:[{criterionIndex:0,description:'Consultar um identificador válido e conferir o resultado esperado.'}],risks:[]};
const content=(withTechnical=true)=>storySpecificationContentSchema.parse({requirements:{objective:'Consultar uma solicitação autorizada pelo seu identificador.',behavior:'Ao informar um identificador válido, apresentar a situação da solicitação.',functionalCriteria:['Um identificador válido apresenta a situação correspondente.'],technicalCriteria:['UNIQUE_TECHNICAL_CONSTRAINT: manter o contrato de autorização.'],inputs:[{name:'Identificador',type:'texto',description:'Identificador da solicitação.',required:true,validation:'UNIQUE_INPUT_VALIDATION: rejeitar caracteres não permitidos.'}],businessRules:['UNIQUE_BUSINESS_RULE: consultar somente solicitações autorizadas.'],nonFunctional:['UNIQUE_NFR: permitir operação por teclado.']},technical:withTechnical?technical:null});

test('drafts may be incomplete while G1 requires essential content and actual test coverage',()=>{
 const draft=storySpecificationContentSchema.parse({requirements:{}});
 expect(specificationReadiness(draft)).toMatchObject({canPrepare:false,canApprove:false});
 expect(specificationReadiness(content(false))).toMatchObject({canPrepare:true,canApprove:false});
 const complete=content();expect(specificationReadiness(complete)).toMatchObject({canPrepare:true,canApprove:true});
 complete.requirements.functionalCriteria.push('Outro resultado verificável.');expect(specificationReadiness(complete).canApprove).toBe(false);
});
test('only explicitly blocking pending dependencies prevent G1; object order cannot create another revision',()=>{
 const specification=content();specification.requirements.dependencies=[{description:'Contrato de integração pendente.',kind:'external',status:'pending',impact:'informative'}];
 expect(specificationReadiness(specification).canApprove).toBe(true);
 specification.requirements.dependencies[0].impact='blocking';expect(specificationReadiness(specification)).toMatchObject({canPrepare:true,canApprove:false});
 expect(canonicalSpecification({requirements:specification.requirements,technical})).toBe(canonicalSpecification({technical,requirements:specification.requirements}));
});

const target=process.env.TEST_DATABASE_URL;
if(target&&new URL(target).pathname!=='/portal_test')throw Error('Specification tests require isolated portal_test');
describe.skipIf(!target)('manual and agent story specifications through the real API',()=>{
 const db=database(target!),runtimes:ReturnType<typeof createApp>[]=[];
 // Workers consume a shared queue. Stop only this suite's disposable attempts
 // between scenarios so another scenario cannot consume the previous fixture.
 afterEach(async()=>{await db.storyExecution.updateMany({where:{state:{in:['queued','running','waiting_approval','waiting_input','paused']}},data:{state:'cancelled',leaseId:null,leaseUntil:null}});});
 afterAll(async()=>{for(const runtime of runtimes)await runtime.app.close();await db.$disconnect();});
 async function fixture(options:{llm?:boolean;publish?:GitProvider['publishCode']}={}){
  const sent:{role:string;content:string}[][]=[];
  const complete=vi.fn(async(messages:{role:string;content:string}[])=>{sent.push(messages);return {model:'isolated',content:JSON.stringify(messages[0].content.includes('agente de codificação')?{summary:'Implementação isolada.',files:[{path:'answer.js',content:'export const answer = 42;'}]}:technical)};});
  const publish=options.publish??vi.fn(async()=>({sha:'b'.repeat(40),url:'http://isolated-gitlab/project/-/merge_requests/12'}));
  const git:GitProvider={health:async()=>true,ensureGroup:async()=>{throw Error('unused');},ensureProject:async()=>{throw Error('unused');},inspectProject:async()=>{throw Error('unused');},codeContext:async()=>({sha:'a'.repeat(40),targetBranch:'main',files:[]}),publishCode:publish};
  const runtime=createApp({db,demoMode:true,git,...(options.llm===false?{}:{llm:{model:'isolated',models:async()=>['isolated'],complete}})});runtimes.push(runtime);
  const request=async(method:'POST'|'PUT'|'PATCH',url:string,payload:unknown,key=randomUUID())=>runtime.app.inject({method,url:'/api'+url,headers:{'x-persona':'admin','idempotency-key':key},payload:await reviewedGateBody(runtime.app,url,payload,key)});
  const create=async(kind:string,parentId?:string,extra:Record<string,unknown>={})=>{
   const response=await request('POST','/items',{kind,parentId,name:'Especificação isolada '+kind,...extra});expect(response.statusCode,response.body).toBe(200);return response.json().item;
  };
  const key=(randomUUID().replace(/[^a-z]/gi,'')+'AAAAAA').slice(0,6).toUpperCase();
  const system=await create('system',undefined,{key});
  const repository=await repositoryFixture(db,{data:{systemId:system.id,key:randomUUID(),name:'Componente isolado',runtime:'node',mode:'link',state:'ready',gitlabProjectId:Math.floor(Math.random()*100000000)+100}});
  const project=await create('project',system.id,{key:randomUUID().slice(0,6).split('').map(char=>'ABCDEFGHIJKLMNOP'[parseInt(char,16)]).join(''),repositoryIds:[repository.id]});
  const epic=await create('epic',project.id),story=await create('story',epic.id,{repositoryIds:[repository.id]});
  const get=async()=>(await runtime.app.inject({method:'GET',url:`/api/items/${story.id}/specification`,headers:{'x-persona':'admin'}})).json();
  const save=async(value:unknown,key?:string)=>{const view=await get();return request('PUT',`/items/${story.id}/specification/draft`,{expectedDraftVersion:view.draft?.version??0,baseRevision:view.revision?.number??0,content:value},key);};
  const apply=async(key?:string)=>{const view=await get();return request('POST',`/items/${story.id}/specification/apply`,{expectedDraftVersion:view.draft.version,expectedVersion:view.expectedVersion,confirmed:true},key);};
  const configure=async(value:unknown=content())=>{const saved=await save(value);expect(saved.statusCode,saved.body).toBe(200);const applied=await apply();expect(applied.statusCode,applied.body).toBe(200);return applied.json();};
  const prepare=async()=>{const item=await db.item.findUniqueOrThrow({where:{id:story.id}});return request('POST',`/items/${story.id}/execution`,{expectedVersion:item.version});};
  const approve=async(runId:string)=>{const item=await db.item.findUniqueOrThrow({where:{id:story.id}});return request('POST',`/executions/${runId}/approve`,{expectedVersion:item.version});};
  return {runtime,request,system,project,epic,story,repository,get,save,apply,configure,prepare,approve,complete,sent,publish};
 }
 test('manual Story follows draft -> specification -> G1 without an LLM or Project approval',async()=>{
  const f=await fixture({llm:false});expect(f.project.status).toBe('active');expect(f.epic.status).toBe('active');
  const draft=await f.save({requirements:{objective:'Rascunho'}});expect(draft.statusCode,draft.body).toBe(200);expect((await f.apply()).statusCode).toBe(409);
  await f.configure();const prepared=await f.prepare();expect(prepared.statusCode,prepared.body).toBe(200);
  const run=await db.storyExecution.findUniqueOrThrow({where:{id:prepared.json().runId}});expect(run).toMatchObject({state:'waiting_approval',stage:'gate',specification:technical});
  expect(await db.item.count({where:{parentId:f.story.id,kind:'task'}})).toBe(6);expect(await db.workActivity.count({where:{storyId:f.story.id,kind:'specification',taskId:null}})).toBe(1);
  expect((await f.approve(run.id)).statusCode).toBe(503);expect(f.complete).not.toHaveBeenCalled();
 });
 test('draft saves and applications replay exactly once and stale drafts cannot overwrite another editor',async()=>{
  const f=await fixture(),saveKey=randomUUID(),payload={expectedDraftVersion:0,baseRevision:0,content:content()};
  const first=await f.request('PUT',`/items/${f.story.id}/specification/draft`,payload,saveKey);expect(first.statusCode,first.body).toBe(200);
  expect((await f.request('PUT',`/items/${f.story.id}/specification/draft`,payload,saveKey)).json()).toEqual(first.json());
  expect((await f.request('PUT',`/items/${f.story.id}/specification/draft`,payload)).statusCode).toBe(409);
  const view=await f.get(),applyKey=randomUUID(),application={expectedDraftVersion:view.draft.version,expectedVersion:view.expectedVersion,confirmed:true};
  const applied=await f.request('POST',`/items/${f.story.id}/specification/apply`,application,applyKey);expect(applied.statusCode,applied.body).toBe(200);
  expect((await f.request('POST',`/items/${f.story.id}/specification/apply`,application,applyKey)).json()).toEqual(applied.json());
  expect(await db.storySpecificationRevision.count({where:{storyId:f.story.id}})).toBe(1);
 });
 test('new unchanged commands are audited as NO_CHANGE while replays and saves create no revisions',async()=>{
  const f=await fixture();await f.configure();const before=await f.get(),draftKey=randomUUID(),appliedKey=randomUUID();
  const saved=await f.save(content(),draftKey);expect(saved.statusCode,saved.body).toBe(200);expect(saved.json()).toMatchObject({changed:false,draft:{version:before.draft.version}});
  expect((await f.save(content(),draftKey)).json()).toEqual(saved.json());
  const applied=await f.apply(appliedKey);expect(applied.statusCode,applied.body).toBe(200);expect(applied.json().changed).toBe(false);expect((await f.apply(appliedKey)).json()).toEqual(applied.json());
  expect(await db.storySpecificationRevision.count({where:{storyId:f.story.id}})).toBe(1);expect((await f.get()).expectedVersion).toBe(before.expectedVersion);
  expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_SPECIFICATION_DRAFT_SAVED',outcome:'NO_CHANGE'}})).toBe(1);
  expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_SPECIFICATION_APPLIED',outcome:'NO_CHANGE'}})).toBe(1);
 });
 test('editing a proposal before G1 preserves the old technical output and requires a new submission',async()=>{
  const f=await fixture();await f.configure();const first=await f.prepare(),runId=first.json().runId;
  const revised=content();revised.technical!.architecture='Uma arquitetura revista explicitamente pela pessoa responsável.';
  expect((await f.save(revised)).statusCode).toBe(200);expect((await f.apply()).statusCode).toBe(200);
  const previous=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});expect(previous.state).toBe('cancelled');expect(previous.specification).toEqual(technical);
  const item=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),replan=await f.request('POST',`/executions/${runId}/replan`,{expectedVersion:item.version,confirmed:true});expect(replan.statusCode,replan.body).toBe(200);
  const current=await db.storyExecution.findUniqueOrThrow({where:{id:replan.json().runId}});expect(current).toMatchObject({state:'waiting_approval',stage:'gate',specification:revised.technical});
 });
 test('current G1 signals select the new Story activity instead of a stale legacy specification Task',async()=>{
  const f=await fixture();await f.configure();const oldDate=new Date(Date.now()-60000);
  const legacyTask=await db.item.create({data:{kind:'task',key:'LEGACY-'+randomUUID(),name:'Especificação legada',parentId:f.story.id,parentKind:'story',status:'done',data:{workProcess:true}}});
  const oldRun=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:(await f.get()).expectedVersion,state:'cancelled',stage:'gate',snapshot:{scopeRevision:2,fingerprint:'historical-opaque-signature'},actorId:'admin',actorName:'Admin',createdAt:oldDate}});
  const oldActivity=await db.workActivity.create({data:{storyId:f.story.id,repositoryId:f.repository.id,kind:'specification',scopeKey:`${f.story.id}:${f.repository.id}:specification`,taskId:legacyTask.id,createdAt:oldDate}});
  const oldAttempt=await db.workAttempt.create({data:{activityId:oldActivity.id,sourceType:'execution',sourceId:oldRun.id,sourceKey:'legacy-spec-'+randomUUID(),state:'succeeded',stage:'gate',actorId:'admin',actorName:'Admin',queuedAt:oldDate,finishedAt:oldDate}});await db.workActivity.update({where:{id:oldActivity.id},data:{currentAttemptId:oldAttempt.id}});
  await db.workEvent.create({data:{attemptId:oldAttempt.id,key:'old-spec-result',kind:'succeeded',stage:'gate',message:'OLD_SPEC_EVIDENCE',timestamp:oldDate}});
  const prepared=await f.prepare();expect(prepared.statusCode,prepared.body).toBe(200);const current=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'specification',taskId:null}});
  const response=await f.runtime.app.inject({method:'GET',url:`/api/items/${f.story.id}/journey`,headers:{'x-persona':'admin'}});expect(response.statusCode,response.body).toBe(200);const view=response.json();
  expect(view.current).toMatchObject({kind:'specification',state:'waiting_approval',activityId:current.id,taskId:null});expect(view.nextAction).toMatchObject({id:'approve',enabled:true});expect(view.events.every((event:any)=>event.message!=='OLD_SPEC_EVIDENCE')).toBe(true);
  expect(view.activities.find((activity:any)=>activity.id===oldActivity.id).state).toBe('stale');expect((await db.item.findUniqueOrThrow({where:{id:legacyTask.id}}))).toMatchObject({status:'done',name:'Especificação legada'});
 });
 test('saving a parallel draft never changes the approved scope or publishes it during coding',async()=>{
  const f=await fixture();await f.configure();const prepared=await f.prepare(),runId=prepared.json().runId;expect((await f.approve(runId)).statusCode).toBe(200);
  const before=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),runBefore=await db.storyExecution.findUniqueOrThrow({where:{id:runId}}),revised=content();revised.requirements.behavior='Outro comportamento que ainda não foi autorizado para execução.';
  expect((await f.save(revised)).statusCode).toBe(200);expect((await f.apply()).statusCode).toBe(409);
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).version).toBe(before.version);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}})).snapshot).toEqual(runBefore.snapshot);
  expect((await f.get()).draft.content.requirements.behavior).toBe(revised.requirements.behavior);
 });
 test('renaming and pausing/reactivating ancestors preserve a current G1 and never start agents',async()=>{
  const f=await fixture();await f.configure();const prepared=await f.prepare(),runId=prepared.json().runId;
  const renamed=await f.request('PATCH',`/items/${f.story.id}`,{expectedVersion:(await f.get()).expectedVersion,name:'Título apenas organizacional',description:f.story.description});expect(renamed.statusCode,renamed.body).toBe(200);
  const paused=await f.request('POST',`/items/${f.project.id}/lifecycle`,{expectedVersion:f.project.version,lifecycle:'inactive'});expect(paused.statusCode,paused.body).toBe(200);
  const active=await f.request('POST',`/items/${f.project.id}/lifecycle`,{expectedVersion:paused.json().item.version,lifecycle:'active'});expect(active.statusCode,active.body).toBe(200);
  expect(f.complete).not.toHaveBeenCalled();expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}})).state).toBe('waiting_approval');
  expect((await f.approve(runId)).statusCode).toBe(200);
 });
 test('pausing queued coding records durable boundaries and only an explicit idempotent resume requeues it',async()=>{
  const f=await fixture();await f.configure();const prepared=await f.prepare(),runId=prepared.json().runId;expect((await f.approve(runId)).statusCode).toBe(200);
  const before=await db.workAttempt.findFirstOrThrow({where:{sourceId:runId,activity:{kind:'coding'}}});
  const pause=await f.request('POST',`/items/${f.project.id}/lifecycle`,{expectedVersion:f.project.version,lifecycle:'inactive'});expect(pause.statusCode,pause.body).toBe(200);
  expect((await db.workAttempt.findUniqueOrThrow({where:{id:before.id}})).state).toBe('paused');expect(await db.workEvent.count({where:{attemptId:before.id,kind:'paused'}})).toBe(1);
  const activate=await f.request('POST',`/items/${f.project.id}/lifecycle`,{expectedVersion:pause.json().item.version,lifecycle:'active'});expect(activate.statusCode,activate.body).toBe(200);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}})).state).toBe('paused');expect(await db.workEvent.count({where:{attemptId:before.id,kind:'resumed'}})).toBe(0);
  const key=randomUUID(),payload={expectedVersion:(await f.get()).expectedVersion},resumed=await f.request('POST',`/items/${f.story.id}/resume-work`,payload,key);expect(resumed.statusCode,resumed.body).toBe(200);expect((await f.request('POST',`/items/${f.story.id}/resume-work`,payload,key)).json()).toEqual(resumed.json());
  expect(await db.workEvent.count({where:{attemptId:before.id,kind:'resumed'}})).toBe(1);const after=await db.workAttempt.findUniqueOrThrow({where:{id:before.id}});expect(after.state).toBe('queued');expect(after.queuedAt).toEqual(before.queuedAt);
 });
 test('pause and resume audit the actual repository/provisioning states rather than inventing QUEUED',async()=>{
  const f=await fixture();await db.repository.update({where:{id:f.repository.id},data:{state:'failed'}});
  const pause=await f.request('POST',`/items/${f.system.id}/status`,{expectedVersion:f.system.version,status:'inactive'});expect(pause.statusCode,pause.body).toBe(200);
  const recorded=await db.historyEvent.findFirstOrThrow({where:{itemId:f.system.id,action:'HIERARCHY_WORK_PAUSED'}}),change=(recorded.audit as any).changes.find((value:any)=>value.field==='state');
  expect(change.before.value).toContainEqual({kind:'repository',state:'failed',count:1});expect(change.before.value).toContainEqual({kind:'provisioning_job',state:'pending',count:1});
  expect(change.after.value).toContainEqual({kind:'repository',state:'paused',count:1});
  const activated=await f.request('POST',`/items/${f.system.id}/status`,{expectedVersion:pause.json().item.version,status:'active'});expect(activated.statusCode,activated.body).toBe(200);
  const resume=await f.request('POST',`/items/${f.system.id}/resume-work`,{expectedVersion:activated.json().item.version});expect(resume.statusCode,resume.body).toBe(200);
  const resumed=await db.historyEvent.findFirstOrThrow({where:{itemId:f.system.id,action:'HIERARCHY_WORK_RESUMED'}}),resumedChange=(resumed.audit as any).changes.find((value:any)=>value.field==='state');
  expect(resumedChange.before.value).toContainEqual({kind:'repository',state:'paused',count:1});expect(resumedChange.after.value).toContainEqual({kind:'repository',state:'pending',count:1});expect(resumedChange.after.value).toContainEqual({kind:'provisioning_job',state:'pending',count:1});
 });
 test('manually completed linked task scope reaches the snapshot and functional edits invalidate G1 while status/title do not',async()=>{
  const f=await fixture();await f.configure();const created=await f.request('POST','/items',{kind:'task',parentId:f.story.id,name:'Trabalho com evidência manual',description:'Implementar a parte específica do contrato de consulta.'});expect(created.statusCode,created.body).toBe(200);let task=created.json().item;
  const journey=(await f.runtime.app.inject({method:'GET',url:`/api/items/${f.story.id}/journey`,headers:{'x-persona':'admin'}})).json();
  const bound=await f.request('POST',`/items/${f.story.id}/work-links`,{expectedVersion:(await f.get()).expectedVersion,expectedLinksVersion:journey.binding.expectedLinksVersion,links:[{taskId:task.id,scope:'UNIQUE_MANUAL_CODING_SCOPE: preservar o contrato de autorização.',completion:'manual_evidence'}]});expect(bound.statusCode,bound.body).toBe(200);
  const prepared=await f.prepare();expect(prepared.statusCode,prepared.body).toBe(200);const run=await db.storyExecution.findUniqueOrThrow({where:{id:prepared.json().runId}});expect((run.snapshot as any).tasks).toContainEqual(expect.objectContaining({id:task.id,scope:expect.stringContaining('UNIQUE_MANUAL_CODING_SCOPE'),completion:'manual_evidence'}));
  const renamed=await f.request('PATCH',`/items/${task.id}`,{expectedVersion:task.version,name:'Outro título organizacional',description:task.description});expect(renamed.statusCode,renamed.body).toBe(200);task=renamed.json().item;
  const started=await f.request('POST',`/items/${task.id}/status`,{expectedVersion:task.version,status:'doing'});expect(started.statusCode,started.body).toBe(200);task=started.json().item;
  const current=(await f.runtime.app.inject({method:'GET',url:`/api/items/${f.story.id}/journey`,headers:{'x-persona':'admin'}})).json();expect(current.nextAction).toMatchObject({id:'approve',enabled:true});
  const changed=await f.request('PATCH',`/items/${task.id}`,{expectedVersion:task.version,name:task.name,description:'Um escopo funcional diferente que ainda precisa ser aprovado.'});expect(changed.statusCode,changed.body).toBe(200);expect((await f.approve(run.id)).statusCode).toBe(409);
 });
 test('only pending blocking dependencies prevent G1',async()=>{
  for(const impact of ['informative','blocking'] as const){const f=await fixture(),definition=content();definition.requirements.dependencies=[{description:'Contrato ainda pendente.',kind:'external',status:'pending',impact}];await f.configure(definition);const prepared=await f.prepare();expect(prepared.statusCode,prepared.body).toBe(200);const response=await f.approve(prepared.json().runId);expect(response.statusCode,response.body).toBe(impact==='blocking'?409:200);}
 });
 test('all confirmed detailed requirements reach technical generation and coding, and publication completes the same Coding task',async()=>{
  const f=await fixture();await f.configure(content(false));const coding=await db.item.findFirstOrThrow({where:{parentId:f.story.id,data:{path:['pipelineStage'],equals:'coding'}}});
  const prepared=await f.prepare();expect(prepared.statusCode,prepared.body).toBe(200);await f.runtime.processExecutionJobs();
  const runId=prepared.json().runId;expect((await f.approve(runId)).statusCode).toBe(200);
  for(let stage=0;stage<3;stage++)await f.runtime.processExecutionJobs();
  expect(f.sent).toHaveLength(2);for(const messages of f.sent)for(const marker of ['UNIQUE_TECHNICAL_CONSTRAINT','UNIQUE_INPUT_VALIDATION','UNIQUE_BUSINESS_RULE','UNIQUE_NFR'])expect(messages.at(-1)!.content).toContain(marker);
  const codingPrompt=JSON.parse(f.sent[1].at(-1)!.content);expect(codingPrompt.testContract).toContain('node:test não exporta expect');expect(codingPrompt.testContract).toContain('Importe explicitamente');expect(codingPrompt.testContract).toContain('import assert from "node:assert/strict"');
  expect((await db.item.findUniqueOrThrow({where:{id:coding.id}})).status).toBe('done');expect(await db.item.count({where:{parentId:f.story.id,kind:'task'}})).toBe(6);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}}))).toMatchObject({state:'succeeded',commitSha:'b'.repeat(40)});
 });
 test('publication cancellation is pending until the remote effect is confirmed and never marks Coding successful',async()=>{
  let release!:(value:{sha:string;url:string})=>void,started!:()=>void;const publication=new Promise<{sha:string;url:string}>(resolve=>{release=resolve;}),called=new Promise<void>(resolve=>{started=resolve;});
  const f=await fixture({publish:async()=>{started();return publication;}});await f.configure();const prepared=await f.prepare(),runId=prepared.json().runId;expect((await f.approve(runId)).statusCode).toBe(200);
  await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();const worker=f.runtime.processExecutionJobs();await called;
  const story=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),cancelled=await f.runtime.app.inject({method:'POST',url:`/api/items/${f.story.id}/cancel`,headers:{'x-persona':'bruno','idempotency-key':randomUUID()},payload:{expectedVersion:story.version}});expect(cancelled.statusCode,cancelled.body).toBe(200);expect(cancelled.json().pending).toBe(true);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}})).state).toBe('cancel_pending');
  release({sha:'c'.repeat(40),url:'http://isolated-gitlab/project/-/merge_requests/14'});await worker;
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('cancelled');expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}}))).toMatchObject({state:'cancelled',commitSha:'c'.repeat(40)});
  expect(await db.item.count({where:{parentId:f.story.id,status:'cancelled'}})).toBe(6);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_CANCELLED'}})).toBe(1);
  const coding=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'coding'}}),attempt=await db.workAttempt.findFirstOrThrow({where:{activityId:coding.id},orderBy:{queuedAt:'desc'}});expect(attempt).toMatchObject({state:'cancelled',revision:'c'.repeat(40)});
  expect(await db.workEvent.count({where:{attemptId:attempt.id,kind:'publication_observed'}})).toBe(1);
  const requested=await db.historyEvent.findFirstOrThrow({where:{itemId:f.story.id,action:'STORY_CANCELLATION_REQUESTED'}}),reconciled=await db.historyEvent.findFirstOrThrow({where:{itemId:f.story.id,action:'EXECUTION_CANCELLATION_RECONCILED'}});
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}})).actorId).toBe('admin');expect((reconciled.audit as any).initiator.id).toBe('bruno');expect(reconciled.actorId).toBe('agent:execution');expect(reconciled.operationId).toBe(requested.operationId);expect(reconciled.causationEventId).toBe(requested.id);
 });
 test('a failed audit rolls back specification and pointer updates and retry creates one immutable revision',async()=>{
  const f=await fixture(),story=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),person={id:'admin',name:'Admin'};
  await expect(db.$transaction(tx=>initializeStorySpecification(tx,{event:async()=>{throw Error('isolated recorder failure');}},story,person,content()))).rejects.toThrow('isolated recorder failure');
  expect(await db.storySpecificationRevision.count({where:{storyId:story.id}})).toBe(0);expect((await db.item.findUniqueOrThrow({where:{id:story.id}})).version).toBe(story.version);
  const result=await db.$transaction(tx=>initializeStorySpecification(tx,{event:recordAudit},story,person,content()));expect(result.revision.number).toBe(1);
  await expect(db.storySpecificationRevision.update({where:{id:result.revision.id},data:{source:'modified'}})).rejects.toThrow();
  expect((await db.storySpecificationRevision.findUniqueOrThrow({where:{id:result.revision.id}})).source).toBe('human');
  const fresh=await db.item.findUniqueOrThrow({where:{id:story.id}}),unchanged=await db.$transaction(tx=>initializeStorySpecification(tx,{event:recordAudit},fresh,person,content(),'agent'));expect(unchanged.changed).toBe(false);expect(await db.storySpecificationRevision.count({where:{storyId:story.id}})).toBe(1);expect(await db.historyEvent.count({where:{itemId:story.id,action:'STORY_SPECIFICATION_AGENT_PREPARED',outcome:'NO_CHANGE'}})).toBe(1);
 });
});
