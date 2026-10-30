import {afterAll,afterEach,describe,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {executionScope,executionSnapshot} from '../apps/api/src/execution.ts';
import {repositoryFixture} from './repository-fixture';
const url=process.env.TEST_DEVELOPMENT_CYCLE_DATABASE_URL;
describe.skipIf(!url)('explicit development cycles',()=>{
 const db=database(url!),base='a'.repeat(40),sha='b'.repeat(40);
 const publish=vi.fn(async()=>({sha:'c'.repeat(40),url:'http://gitlab.invalid/new/-/merge_requests/2'}));
 const llm={model:'isolated',models:async()=>['isolated'],complete:vi.fn(async()=>({model:'isolated',content:JSON.stringify({summary:'Isolated implementation',files:[{path:'app.js',content:'export const value=2;'}]})}))};
 const git={health:async()=>true,qualityContext:vi.fn(),developmentDestination:async()=>({sha:base,targetBranch:'main'}),codeContext:async(_id:number,revision?:{sha:string;targetBranch:string})=>({sha:revision?.sha??base,targetBranch:revision?.targetBranch??'main',files:[{path:'app.js',content:'export const value=1;'}]}),publishCode:publish};
 const mergeProvider={inspect:vi.fn(async(ref:any)=>({state:'merged',sha:ref.sha,targetSha:base,draft:false,blocks:[],mergedBy:'sdlc-agent-for-merge',mergedAt:new Date().toISOString()})),merge:vi.fn(),releaseDraft:vi.fn()};
 const runtime=createApp({db,demoMode:true,git,llm,merge:mergeProvider as any,scannerUrl:'http://127.0.0.1:9988'});
 const write=(path:string,payload:unknown,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:'/api'+path,headers:{'x-persona':persona,'idempotency-key':key},payload});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 afterEach(async()=>{publish.mockClear();llm.complete.mockClear();await db.storyExecution.updateMany({where:{state:{in:['queued','running','waiting_approval','waiting_input','paused','failed']}},data:{state:'cancelled',leaseId:null,leaseUntil:null}});await db.mergePreparation.updateMany({where:{state:{in:['queued','running','paused','failed']}},data:{state:'cancelled',leaseId:null,leaseUntil:null}});});
 async function fixture(status='merge_request'){
  const system=await db.item.create({data:{kind:'system',key:randomUUID(),name:'Cycle System',status:'active'}});
  const repo=await repositoryFixture(db,{data:{systemId:system.id,key:randomUUID(),name:'Cycle repository',runtime:'node',state:'ready',gitlabProjectId:10000+await db.repository.count()}});
  const project=await db.item.create({data:{kind:'project',key:randomUUID(),name:'Cycle Project',status:'active',parentId:system.id,parentKind:'system',projectLifecycle:'active'}});
  const epic=await db.item.create({data:{kind:'epic',key:randomUUID(),name:'Cycle Epic',status:'active',parentId:project.id,parentKind:'project'}});
  const story=await db.item.create({data:{kind:'story',key:randomUUID(),name:'Cycle Story',status:'specification',parentId:epic.id,parentKind:'epic'}});
  const content={requirements:{objective:'Consultar valor.',behavior:'Retornar valor pelo contrato.',functionalCriteria:['Retornar o valor solicitado.']},technical:{requirements:'Implementar contrato.',architecture:'Módulo ES sem dependências.',testCases:[{criterionIndex:0,description:'Conferir valor.'}],risks:[]}};
  const draft=await runtime.app.inject({method:'PUT',url:'/api/items/'+story.id+'/specification/draft',headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{expectedDraftVersion:0,baseRevision:0,content}});expect(draft.statusCode,draft.body).toBe(200);
  expect((await write('/items/'+story.id+'/specification/apply',{expectedDraftVersion:draft.json().draft.version,expectedVersion:1,confirmed:true})).statusCode).toBe(200);
  const prepared=await write('/items/'+story.id+'/execution',{expectedVersion:2});expect(prepared.statusCode,prepared.body).toBe(200);
  const run=await db.storyExecution.findUniqueOrThrow({where:{id:prepared.json().runId}});
  const old=await db.storyExecution.update({where:{id:run.id},data:{state:'succeeded',stage:'completed',branch:'sdlc/story-'+run.id,commitSha:sha,mergeRequestUrl:'http://gitlab.invalid/project/-/merge_requests/1',snapshot:{...run.snapshot as object,codeContext:{sha:base,targetBranch:'main',files:[]}}}});
  await db.item.update({where:{id:story.id},data:{status,version:{increment:1}}});
  await db.workAttempt.updateMany({where:{sourceId:run.id},data:{state:'succeeded',waitingSince:null,finishedAt:new Date()}});
  const merge=await db.mergeOperation.create({data:{executionId:run.id,storyId:story.id,projectId:repo.gitlabProjectId!,iid:1,sha,sourceBranch:old.branch!,targetBranch:'main',state:'succeeded',finishedAt:new Date()}});
  const get=()=>runtime.app.inject({url:'/api/items/'+story.id+'/journey',headers:{'x-persona':'admin'}});
  const view=(await get()).json(),action=view.nextAction;expect(action.id).toBe('development_cycle');expect(action.enabled,action.reason).toBe(true);
  return {system,project,story,repo,old,merge,get,action,path:'/executions/'+run.id+'/replan'};
 }
 test.each(['merge_request','testing'])('new cycle from %s preserves delivery and Tasks, requires a new Gateway, and works without Release',async status=>{
  const f=await fixture(status),tasks=await db.item.findMany({where:{parentId:f.story.id}});
  await db.item.updateMany({where:{id:{in:tasks.map(t=>t.id)}},data:{status:'done'}});
  const before=await db.storyExecution.findUniqueOrThrow({where:{id:f.old.id}}),events=await db.historyEvent.count();await f.get();expect(await db.historyEvent.count()).toBe(events);
  const result=await write(f.path,f.action.body);expect(result.statusCode,result.body).toBe(200);
  const run=await db.storyExecution.findUniqueOrThrow({where:{id:result.json().runId}}),story=await db.item.findUniqueOrThrow({where:{id:f.story.id}});
  expect(run.id).not.toBe(f.old.id);expect(run).toMatchObject({state:'waiting_approval',stage:'gate',commitSha:null,mergeRequestUrl:null});
  expect(run.snapshot).toMatchObject({replannedFrom:f.old.id,destinationReviewRequired:true,developmentCycleId:(story.data as any).developmentCycleId,previousDevelopmentDelivery:{mergeId:f.merge.id,sha}});
  expect((story.data as any).requiresNewG1).toBe(true);expect(story.status).toBe('specification');expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.old.id}})).toEqual(before);
  expect(await db.item.count({where:{parentId:f.story.id}})).toBe(tasks.length);expect(await db.item.count({where:{parentId:f.story.id,status:'done'}})).toBe(tasks.length);
  expect(await db.releaseStory.count({where:{storyId:f.story.id}})).toBe(0);expect(publish).not.toHaveBeenCalled();expect(llm.complete).not.toHaveBeenCalled();
  const current=(await f.get()).json();expect(current.nextAction.id).toBe('approve');expect(current.merge).toBeNull();expect(current.delivery.development.mergeConfirmed).not.toBe(true);
 });
 test('new cycle requires the reviewed context and refuses repository drift or an unconfirmed merge',async()=>{
  const f=await fixture('testing');expect((await write(f.path,{expectedVersion:3,confirmed:true})).json().error.code).toBe('DEVELOPMENT_CYCLE_CHANGED');
  await db.repository.update({where:{id:f.repo.id},data:{version:{increment:1}}});expect((await write(f.path,f.action.body)).statusCode).toBe(409);
  await db.mergeOperation.update({where:{id:f.merge.id},data:{state:'failed'}});const view=(await f.get()).json();expect(view.nextAction.enabled).toBe(false);expect(view.nextAction.reason).toContain('reconcilie');expect((await write(f.path,f.action.body)).statusCode).toBe(409);
  expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(1);
 });
 test.each(['queued','paused','failed'])('pending or uncertain integration (%s) blocks a previously reviewed cycle',async state=>{
  const f=await fixture();await db.mergePreparation.create({data:{operationId:f.merge.id,executionId:f.old.id,storyId:f.story.id,sha,storyVersion:3,actorId:'admin',actorName:'Admin',state}});
  const view=(await f.get()).json();expect([view.nextAction,...view.secondaryActions].find(a=>a.id==='development_cycle')).toMatchObject({enabled:false});expect((await write(f.path,f.action.body)).statusCode).toBe(409);expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(1);
 });
 test('permission, inactive hierarchy, later delivery and stale version cannot start another cycle',async()=>{
  const f=await fixture();expect((await write(f.path,f.action.body,randomUUID(),'carla')).statusCode).toBe(403);
  await db.item.update({where:{id:f.system.id},data:{status:'inactive'}});expect((await write(f.path,f.action.body)).statusCode).toBe(409);
  await db.item.update({where:{id:f.system.id},data:{status:'active'}});await db.item.update({where:{id:f.story.id},data:{status:'uat',version:{increment:1}}});expect((await write(f.path,{...f.action.body,expectedVersion:4})).statusCode).toBe(409);
  expect((await write(f.path,f.action.body)).statusCode).toBe(409);
 });
 test('concurrent commands and lost acknowledgement create one cycle; replay retains the original receipt',async()=>{
  const f=await fixture(),key=randomUUID(),responses=await Promise.all([write(f.path,f.action.body,key),write(f.path,f.action.body,key),write(f.path,f.action.body)]);
  expect(responses.filter(r=>r.statusCode===200)).toHaveLength(2);expect(responses.find(r=>r.statusCode!==200)?.statusCode).toBe(409);
  const accepted=responses.find(r=>r.statusCode===200)!;expect((await write(f.path,f.action.body,key)).json()).toEqual(accepted.json());
  expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(2);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'EXECUTION_REPLANNED'}})).toBe(1);
 });
 test('recorder failure rolls back cycle, Story, work and key; retry records the same intent',async()=>{
  const f=await fixture(),key=randomUUID(),before=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),work=await db.workAttempt.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_cycle_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='EXECUTION_REPLANNED' THEN RAISE EXCEPTION 'Isolated cycle recorder failure'; END IF; RETURN NEW; END; $$`);await db.$executeRawUnsafe('CREATE TRIGGER reject_cycle_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_cycle_fixture()');
  try{expect((await write(f.path,f.action.body,key)).statusCode).toBeGreaterThanOrEqual(500);expect(await db.item.findUniqueOrThrow({where:{id:f.story.id}})).toEqual(before);expect(await db.workAttempt.count()).toBe(work);expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(1);}finally{await db.$executeRawUnsafe('DROP TRIGGER reject_cycle_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_cycle_fixture()');}
  expect((await write(f.path,f.action.body,key)).statusCode).toBe(200);
 });
 test('identical content does not allow old quality or merge commands after a new cycle',async()=>{
  const f=await fixture();expect((await write(f.path,f.action.body)).statusCode).toBe(200);
  const quality=await write('/executions/'+f.old.id+'/quality',{kind:'code_review',expectedVersion:4,expectedSha:sha});expect(quality.statusCode,quality.body).toBe(409);expect(quality.json().error.code).toBe('QUALITY_STALE');
  const merge=await write('/executions/'+f.old.id+'/merge',{expectedVersion:4,expectedSha:sha});expect(merge.statusCode).toBe(409);expect(merge.json().error.code).toBe('MERGE_STALE');
  expect(mergeProvider.merge).not.toHaveBeenCalled();
 });
 test('the new Gateway authorizes a separate fixed-base run; it never edits the merged MR',async()=>{
  const f=await fixture(),result=await write(f.path,f.action.body),id=result.json().runId;
  expect((await write('/executions/'+id+'/approve',{expectedVersion:4})).json().error.code).toBe('GATE_DESTINATION_REQUIRED');
  const review=(await runtime.app.inject('/api/executions/'+id+'/code-destination')).json();
  const accepted=await write('/executions/'+id+'/approve',{expectedVersion:4,codeDestination:{destination:review.destination,contextToken:review.contextToken}});expect(accepted.statusCode,accepted.body).toBe(200);
  for(let i=0;i<4;i++)await runtime.processExecutionJobs();
  const run=await db.storyExecution.findUniqueOrThrow({where:{id}});expect(run.state,run.error||run.stage).toBe('succeeded');expect(publish).toHaveBeenCalledWith(f.repo.gitlabProjectId,id,expect.objectContaining({sha:base,targetBranch:'main'}),expect.anything(),f.story.name,expect.anything());
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.old.id}})).mergeRequestUrl).toBe(f.old.mergeRequestUrl);expect((await db.mergeOperation.findUniqueOrThrow({where:{id:f.merge.id}})).state).toBe('succeeded');
 });
 test('new development preserves an existing CLOSED release and its planning membership',async()=>{
  const f=await fixture(),release=await db.release.create({data:{key:randomUUID(),name:'Preserved release',systemId:f.system.id,createdById:'admin',createdByName:'Admin'}});
  const membership=await db.releaseStory.create({data:{releaseId:release.id,storyId:f.story.id,plannedStoryVersion:3}});
  const closed=await db.release.update({where:{id:release.id},data:{compositionStatus:'CLOSED'}});
  expect((await write(f.path,f.action.body)).statusCode).toBe(200);
  expect(await db.release.findUniqueOrThrow({where:{id:release.id}})).toEqual(closed);expect(await db.releaseStory.findUniqueOrThrow({where:{storyId:f.story.id}})).toEqual(membership);
 });
 test('an active read lease prevents a new cycle until the prior observer releases ownership',async()=>{
  const f=await fixture();await db.mergeOperation.update({where:{id:f.merge.id},data:{leaseId:randomUUID(),leaseUntil:new Date(Date.now()+60000)}});
  expect((await write(f.path,f.action.body)).statusCode).toBe(409);await db.mergeOperation.update({where:{id:f.merge.id},data:{leaseId:null,leaseUntil:null}});
  expect((await write(f.path,f.action.body)).statusCode).toBe(200);
 });
 test('uncertain current preparation exposes the existing read reconciliation before a new cycle',async()=>{
  const f=await fixture();await db.mergePreparation.create({data:{operationId:f.merge.id,executionId:f.old.id,storyId:f.story.id,sha,storyVersion:3,actorId:'admin',actorName:'Admin',state:'failed'}});
  const action=(await f.get()).json().nextAction;expect(action).toMatchObject({id:'release_draft',enabled:true,label:'Verificar resultado da liberação'});
  expect((await write(action.path.replace('/api',''),action.body)).statusCode).toBe(200);await runtime.processMergeJobs();
  expect(await db.mergePreparation.findUniqueOrThrow({where:{operationId:f.merge.id}})).toMatchObject({state:'blocked',message:'A integração desta revisão já foi confirmada; não é necessário liberar o rascunho.'});expect(mergeProvider.releaseDraft).not.toHaveBeenCalled();expect(mergeProvider.merge).not.toHaveBeenCalled();
  expect((await f.get()).json().nextAction).toMatchObject({id:'development_cycle',enabled:true});
 });
});
