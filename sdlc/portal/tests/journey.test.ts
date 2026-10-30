import {repositoryFixture} from './repository-fixture';
import {randomUUID,createHash} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {qualityPolicy} from '../apps/api/src/merge-readiness.ts';
import {workLinksVersion} from '../apps/api/src/work-activities.ts';
import {withAuditContext} from '../apps/api/src/audit.ts';

describe.skipIf(!process.env.TEST_DATABASE_URL)('canonical story journey and task bindings',()=>{
 const db=database(process.env.TEST_DATABASE_URL!),runtime=createApp({db,demoMode:true,git:{health:async()=>true,codeContext:async()=>({sha:'b'.repeat(40),targetBranch:'main',files:[]}),publishCode:async()=>({sha:'a'.repeat(40),url:'http://gitlab/mr/1'}),qualityContext:async()=>({sha:'a'.repeat(40),baseSha:'b'.repeat(40),files:[],changes:[]}),publishCorrection:async()=>({sha:'c'.repeat(40),url:'http://gitlab/mr/1'}),ensureGroup:async()=>{throw Error('unused');},ensureProject:async()=>{throw Error('unused');},inspectProject:async()=>{throw Error('unused');}},llm:{model:'test-only',models:async()=>['test-only'],complete:async()=>{throw Error('No inference expected');}},scannerUrl:'http://isolated-scanner:8080'});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 async function fixture(){
  const create=(kind:'system'|'project'|'epic'|'story'|'task',parentId?:string,parentKind?:'system'|'project'|'epic'|'story')=>db.item.create({data:{kind,key:'J-'+randomUUID(),name:'Journey isolated',description:'Planned scope',status:kind==='story'?'coding':kind==='task'?'todo':'active',parentId,parentKind,...(kind==='project'?{projectLifecycle:'active'}:{}),data:kind==='story'?{acceptanceCriteria:['Return a result.']}:{} }});
  const system=await create('system'),project=await create('project',system.id,'system'),epic=await create('epic',project.id,'project'),story=await create('story',epic.id,'epic'),task=await create('task',story.id,'story');
  const repo=await repositoryFixture(db,{data:{systemId:system.id,key:'J-'+randomUUID(),name:'Journey repo',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)+100}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repo.id}});
  const fingerprint=createHash('sha256').update(JSON.stringify({name:story.name,description:story.description,data:story.data,ancestors:[system,project,epic].map(i=>[i.id,i.version,i.status,i.projectLifecycle]),tasks:[{id:task.id,name:task.name,description:task.description,data:task.data,repositoryLinks:[]}],repository:[repo.id,repo.version]})).digest('hex');
  const sha='a'.repeat(40),baseSha='b'.repeat(40),run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repo.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:{scopeRevision:2,fingerprint,codeContext:{sha:baseSha,targetBranch:'main',files:[{path:'private.js',content:'PRIVATE_BACKEND_CONTEXT'}]}},commitSha:sha,mergeRequestUrl:'http://gitlab/mr/1',branch:'sdlc/story-fixture',actorId:'admin',actorName:'Admin'}});
  await db.mergeOperation.create({data:{executionId:run.id,storyId:story.id,projectId:repo.gitlabProjectId!,iid:1,sha,sourceBranch:run.branch!,targetBranch:'main',checkedAt:new Date('2099-01-01')}});
  const get=(id=story.id,persona?:string)=>runtime.app.inject({method:'GET',url:`/api/items/${id}/journey`,headers:persona?{'x-persona':persona}:{}});
  const bind=async(links:unknown[],key=randomUUID(),version=1,expectedLinksVersion?:string)=>runtime.app.inject({method:'POST',url:`/api/items/${story.id}/work-links`,headers:{'x-persona':'admin','idempotency-key':key},payload:{expectedVersion:version,expectedLinksVersion:expectedLinksVersion??workLinksVersion(await db.workTaskLink.findMany({where:{activity:{storyId:story.id,kind:'coding'}}})),links}});
  return {story,task,repo,run,sha,baseSha,get,bind};
 }
 test('lifecycle reading agrees across collection, Story, Task and journey without leaking revision payloads or writing',async()=>{
  const f=await fixture();
  const spec=await db.storySpecificationRevision.create({data:{storyId:f.story.id,number:2,content:{private:'PRIVATE_SPECIFICATION_PAYLOAD'},actorId:'admin',actorName:'Admin',source:'human'}});
  const before={story:await db.item.findUniqueOrThrow({where:{id:f.story.id}}),history:await db.historyEvent.count(),specs:await db.storySpecificationRevision.count(),runs:await db.storyExecution.count()};
  const list=await runtime.app.inject(`/api/collections/items?kind=story&parentId=${f.story.parentId}`),detail=await runtime.app.inject(`/api/items/${f.story.id}`),task=await runtime.app.inject(`/api/items/${f.task.id}`),journey=await f.get(),taskJourney=await f.get(f.task.id);
  for(const response of [list,detail,task,journey,taskJourney]){expect(response.statusCode,response.body).toBe(200);expect(response.body).not.toContain('PRIVATE_SPECIFICATION_PAYLOAD');expect(response.body).not.toContain('PRIVATE_BACKEND_CONTEXT');}
  const reading=detail.json().storyLifecycle;
  expect(list.json().items.find((row:any)=>row.id===f.story.id).storyLifecycle).toEqual(reading);
  expect(task.json().storyLifecycle).toEqual(reading);
  expect(journey.json().storyLifecycle).toEqual({...reading,revision:{...reading.revision,executionContext:'current'}});
  expect(taskJourney.json().storyLifecycle).toEqual(journey.json().storyLifecycle);
  expect(reading).toMatchObject({storyId:f.story.id,development:{state:'not_recorded'},completion:{state:'awaiting_production'},revision:{recordVersion:1,specification:{id:spec.id,number:2},execution:{id:f.run.id,sha:f.sha,storyRecordVersion:1},executionContext:'not_checked'}});
  expect({story:await db.item.findUniqueOrThrow({where:{id:f.story.id}}),history:await db.historyEvent.count(),specs:await db.storySpecificationRevision.count(),runs:await db.storyExecution.count()}).toEqual(before);
 });
 test('administrative version and historical query do not substitute content revision or attest approval',async()=>{
  const f=await fixture();const spec=await db.storySpecificationRevision.create({data:{storyId:f.story.id,number:4,content:{},actorId:'admin',actorName:'Admin',source:'human'}});
  await db.item.update({where:{id:f.story.id},data:{description:'Changed current Story scope',version:{increment:1}}});
  const view=(await f.get()).json().storyLifecycle;
  expect(view.revision).toMatchObject({recordVersion:2,specification:{id:spec.id,number:4},execution:{sha:f.sha,storyRecordVersion:1},executionContext:'outdated'});
  await runtime.app.inject(`/api/items/${f.story.id}/history?page=99`);
  expect((await f.get()).json().storyLifecycle).toEqual(view);
  expect(view.development.state).toBe('not_recorded');expect(view.completion.production).toBe('unconfirmed');
 });
 test('missing latest references stay unknown and never fall back to an older code revision',async()=>{
  const f=await fixture();
  await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repo.id,storyVersion:1,state:'failed',stage:'context',snapshot:{},actorId:'admin',actorName:'Admin',createdAt:new Date(Date.now()+1000)}});
  const view=(await f.get()).json().storyLifecycle;
  expect(view.revision.specification).toBeNull();expect(view.revision.execution.sha).toBeNull();expect(view.revision.execution.id).not.toBe(f.run.id);
  const empty=await db.item.create({data:{kind:'story',parentId:f.story.parentId,parentKind:'epic',key:'EMPTY-'+randomUUID(),name:'No revision',status:'testing',data:{}}});
  const missing=(await f.get(empty.id)).json().storyLifecycle;
  expect(missing.revision).toMatchObject({specification:null,execution:null,executionContext:'not_checked'});expect(missing.development.state).toBe('not_recorded');
 });
 test('legacy completion is preserved without inventing DEV approval or production',async()=>{
  const f=await fixture();await db.item.update({where:{id:f.story.id},data:{status:'completed'}});
  const reading=(await f.get()).json().storyLifecycle;
  expect(reading.completion.state).toBe('recorded_without_production_evidence');expect(reading.completion.production).toBe('unconfirmed');expect(reading.development.state).toBe('not_recorded');
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('completed');
 });
 test('generic status and PATCH cannot approve development or complete a Story; Task DONE does not close its parent',async()=>{
  const f=await fixture(),post=(path:string,payload:unknown)=>runtime.app.inject({method:'POST',url:'/api'+path,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload});
  const blocked=await post(`/items/${f.story.id}/status`,{expectedVersion:1,status:'completed'});expect(blocked.statusCode,blocked.body).toBe(409);expect(blocked.json().error).toMatchObject({code:'PIPELINE_STATUS_ONLY'});expect(blocked.json().error.message).toContain('produção');
  const patch=await runtime.app.inject({method:'PATCH',url:`/api/items/${f.story.id}`,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{expectedVersion:1,name:f.story.name,description:f.story.description,status:'completed',developmentApproved:true}});expect(patch.statusCode,patch.body).toBe(422);
  await db.item.update({where:{id:f.task.id},data:{status:'done'}});
  expect((await f.get(f.task.id)).json().storyLifecycle).toMatchObject({development:{state:'not_recorded'},completion:{state:'awaiting_production'}});
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('coding');
  const close=await post(`/items/${f.story.parentId}/lifecycle`,{expectedVersion:1,lifecycle:'completed',comment:'Do not force unfinished Stories closed.'});expect(close.statusCode,close.body).toBe(409);expect(close.json().error.code).toBe('UNFINISHED_CHILDREN');
 });
 test('delivery consultation shares Story ownership with Tasks without inferring deployments or changing data',async()=>{
  const f=await fixture();
  const before={story:await db.item.findUniqueOrThrow({where:{id:f.story.id}}),history:await db.historyEvent.count()};
  const view=(await f.get(f.story.id)).json();
  expect(view.delivery.development).toMatchObject({unit:'story',releaseRequired:false,publication:'unconfirmed',approval:'unconfirmed',publicationAvailable:false});
  expect(view.delivery.release).toMatchObject({association:'unassigned',reference:null,candidate:'unconfirmed'});
  expect(view.delivery.promotion).toMatchObject({releaseRequiredFrom:'QA',immutableCandidateRequired:true,allStoriesDevelopmentApprovalRequired:true});
  expect((await f.get(f.task.id)).json().delivery).toEqual(view.delivery);
  const release=await db.release.create({data:{key:'R-'+randomUUID(),name:'Delivery read fixture',systemId:f.repo.systemId,compositionStatus:'OPEN',createdById:'admin',createdByName:'Admin'}});
  await db.releaseStory.create({data:{releaseId:release.id,storyId:f.story.id,plannedStoryVersion:f.story.version}});
  await db.release.update({where:{id:release.id},data:{compositionStatus:'CLOSED'}});
  const assigned=(await f.get()).json().delivery;
  expect(assigned.release).toMatchObject({association:'assigned',reference:{id:release.id,compositionStatus:'CLOSED'},candidate:'unconfirmed'});
  expect(assigned.destinations.every((d:any)=>d.publication==='unconfirmed'&&d.validation==='unconfirmed')).toBe(true);
  expect(await db.item.findUniqueOrThrow({where:{id:f.story.id}})).toEqual(before.story);
  expect(await db.historyEvent.count()).toBe(before.history);
 });
 test('only a confirmed merge for the current revision identifies DEV as next',async()=>{
  const f=await fixture();
  await db.mergeOperation.update({where:{executionId:f.run.id},data:{state:'succeeded'}});
  expect((await f.get()).json().delivery.development.next).toBe(true);
  await db.item.update({where:{id:f.story.id},data:{description:'A newer scope needs another development cycle',version:{increment:1}}});
  expect((await f.get()).json().delivery.development.next).toBe(false);
 });
 test('phase reconciliation uses real gates, stays open, and agrees across list, filter, order and journey',async()=>{
  const f=await fixture(),plan=[{id:f.story.id,expectedVersion:f.story.version,executionId:f.run.id}];
  await expect(runtime.reconcileStoryPhases(plan)).rejects.toThrow('evidência vigente');
  for(const kind of ['code_review','security_scan'])await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind,sha:f.sha,baseSha:f.baseSha,policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'d'.repeat(64)}}});
  const operationId='phase-test:'+randomUUID();
  const result=await withAuditContext({operationId,source:'isolated-maintenance'},()=>runtime.reconcileStoryPhases(plan));expect(result.updated).toEqual([f.story.id]);
  const detail=(await f.get()).json();expect(detail.story.status).toBe('merge_request');expect(detail.current.phase).toBe('MERGE REQUEST');expect(detail.story.status).not.toBe('completed');
  const list=await runtime.app.inject(`/api/collections/items?kind=story&parentId=${f.story.parentId}&status=merge_request&sort=status`);expect(list.statusCode,list.body).toBe(200);expect(list.json().items.map((row:{id:string;status:string})=>[row.id,row.status])).toContainEqual([f.story.id,'merge_request']);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).storyVersion).toBe(detail.story.version);
  expect((await runtime.reconcileStoryPhases(plan)).unchanged).toEqual([f.story.id]);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_MERGE_PHASE_ENTERED',operationId}})).toBe(1);
 });
 test('phase audit failure rolls back Story and execution version; the same plan can retry',async()=>{
  const f=await fixture(),plan=[{id:f.story.id,expectedVersion:f.story.version,executionId:f.run.id}];await db.mergeOperation.update({where:{executionId:f.run.id},data:{state:'succeeded'}});
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_phase_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='STORY_MERGE_PHASE_ENTERED' THEN RAISE EXCEPTION 'phase audit rollback'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER reject_phase_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_phase_fixture()');
  try{await expect(runtime.reconcileStoryPhases(plan)).rejects.toThrow('phase audit rollback');expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('coding');expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).storyVersion).toBe(f.story.version);}
  finally{await db.$executeRawUnsafe('DROP TRIGGER reject_phase_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_phase_fixture()');}
  expect((await runtime.reconcileStoryPhases(plan)).updated).toEqual([f.story.id]);
 });
 test('GET preserves all business data, exposes no source files and disables commands without a persona',async()=>{
  const f=await fixture(),before={tasks:await db.item.count({where:{parentId:f.story.id}}),activities:await db.workActivity.count({where:{storyId:f.story.id}})};
  const response=await f.get();expect(response.statusCode,response.body).toBe(200);expect(response.body).not.toContain('PRIVATE_BACKEND_CONTEXT');
  expect(response.json()).toMatchObject({story:{id:f.story.id},current:{kind:'code_review',state:'not_started'},permissions:{canAct:false},nextAction:{id:'code_review',enabled:false}});
  expect({tasks:await db.item.count({where:{parentId:f.story.id}}),activities:await db.workActivity.count({where:{storyId:f.story.id}})}).toEqual(before);
  expect((await f.get(f.story.id,'admin')).json().nextAction).toMatchObject({id:'code_review',enabled:true,body:{expectedVersion:1,expectedSha:f.sha}});
 });
 test('old findings are historical after a new commit and never unlock merge',async()=>{
  const f=await fixture();await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind:'code_review',sha:'d'.repeat(40),baseSha:f.baseSha,policyVersion:qualityPolicy,state:'blocked',actorId:'admin',actorName:'Admin',summary:'Old finding',findings:[{path:'app.js',line:1,message:'Old credential finding',severity:'HIGH'}]}});
  const response=(await f.get(f.story.id,'admin')).json();expect(response.current).toMatchObject({kind:'code_review',state:'stale'});expect(response.nextAction.id).toBe('code_review');expect(response.readiness.ready).toBe(false);expect(response.activities.some((a:any)=>a.legacy&&a.attempts.some((attempt:any)=>attempt.summary==='Old finding'))).toBe(true);
 });
 test('explicit links prepare the six pipeline Tasks once, preserve additional planned work, and replay without duplication',async()=>{
  const f=await fixture(),key=randomUUID(),links=[{taskId:f.task.id,scope:'Implementation of the planned lookup.',completion:'publish_code'}];
  const token=workLinksVersion([]),first=await f.bind(links,key,1,token);expect(first.statusCode,first.body).toBe(200);expect((await f.bind(links,key,1,token)).json()).toEqual(first.json());
  expect(await db.workActivity.count({where:{storyId:f.story.id,kind:'coding'}})).toBe(1);expect(await db.item.count({where:{parentId:f.story.id}})).toBe(7);expect((await db.item.findUniqueOrThrow({where:{id:f.task.id}})).status).toBe('todo');
  const response=(await f.get(f.task.id,'admin')).json();expect(response.selectedItem.id).toBe(f.task.id);expect(response.binding.tasks[0]).toMatchObject({id:f.task.id,linked:true,completion:'publish_code'});expect(response.nextAction.body.expectedVersion).toBe(f.story.version);
 });
 test('links can be removed and process task state cannot be manually used as approval',async()=>{
  const f=await fixture();const bound=await f.bind([{taskId:f.task.id,scope:'Code publication only',completion:'publish_code'}]);expect(bound.statusCode,bound.body).toBe(200);
  const activity=await db.workActivity.findUniqueOrThrow({where:{id:bound.json().activityId}}),process=await db.item.findUniqueOrThrow({where:{id:activity.taskId}});
  const status=await runtime.app.inject({method:'POST',url:`/api/items/${process.id}/status`,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{expectedVersion:process.version,status:'doing'}});expect(status.statusCode).toBe(409);expect(status.json().error.code).toBe('PROCESS_TASK_CONTROLLED');
  expect((await f.bind([])).statusCode).toBe(200);expect(await db.workTaskLink.count({where:{activityId:activity.id}})).toBe(0);
 });
 test('binding rejects a task from another story, stale version and active attempts',async()=>{
  const f=await fixture(),other=await fixture();expect((await f.bind([{taskId:other.task.id,scope:'Wrong story',completion:'manual_evidence'}])).statusCode).toBe(409);
  expect((await f.bind([],undefined,99)).statusCode).toBe(409);
  const activity=(await f.bind([])).json().activityId;const attempt=await db.workAttempt.create({data:{activityId:activity,sourceType:'execution',sourceId:f.run.id,sourceKey:randomUUID(),actorId:'admin',actorName:'Admin',state:'running'}});await db.workActivity.update({where:{id:activity},data:{currentAttemptId:attempt.id}});
  expect((await f.bind([{taskId:f.task.id,scope:'Do not change active scope',completion:'publish_code'}])).statusCode).toBe(409);
 });
 test('pending execution keeps cancellation as a secondary command while no new execution is offered',async()=>{
  const f=await fixture();await db.storyExecution.update({where:{id:f.run.id},data:{state:'running',stage:'generation'}});
  const view=(await f.get(f.story.id,'admin')).json();expect(view.nextAction).toBeNull();expect(view.secondaryActions.map((a:any)=>a.id)).toContain('cancel');expect(view.current.kind).toBe('coding');
 });
 test('a newer conversation cannot replace the current merge attempt or its observable signals',async()=>{
  const f=await fixture();for(const kind of ['code_review','security_scan'])await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind,sha:f.sha,baseSha:f.baseSha,policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'e'.repeat(64)}}});
  const operation=await db.mergeOperation.update({where:{executionId:f.run.id},data:{state:'blocked'}});
  const process=await db.item.create({data:{kind:'task',key:randomUUID(),name:'Merge process',parentId:f.story.id,parentKind:'story',status:'doing',data:{workProcess:true}}});
  const activity=await db.workActivity.create({data:{storyId:f.story.id,repositoryId:f.repo.id,taskId:process.id,kind:'merge',scopeKey:randomUUID()}});
  const main=await db.workAttempt.create({data:{activityId:activity.id,sourceType:'merge',sourceId:operation.id,sourceKey:randomUUID(),state:'blocked',actorId:'admin',actorName:'Admin',provider:'gitlab',queuedAt:new Date(Date.now()-60000)}});
  await db.workActivity.update({where:{id:activity.id},data:{currentAttemptId:main.id}});
  await db.workAttempt.create({data:{activityId:activity.id,sourceType:'merge_discussion',sourceId:'chat',sourceKey:randomUUID(),state:'succeeded',actorId:'admin',actorName:'Admin',provider:'local-llm'}});
  const view=(await f.get(f.story.id,'admin')).json(),work=view.activities.find((a:any)=>a.id===activity.id);expect(view.current.kind).toBe('merge');expect(work.state).toBe('blocked');expect(work.attempts[0].id).toBe(main.id);expect(view.signals.provider).toBe('gitlab');
 });
 test('an approved check from another policy is stale and the previous execution conversation stays consultable at G1',async()=>{
  const f=await fixture();await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind:'code_review',sha:f.sha,baseSha:f.baseSha,policyVersion:'old-policy',state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'f'.repeat(64)}}});
  expect((await f.get(f.story.id,'admin')).json().current.state).toBe('stale');
  await db.storyExecution.update({where:{id:f.run.id},data:{state:'waiting_approval',stage:'gate',discussionVersion:3}});
  const view=(await f.get(f.story.id,'admin')).json();expect(view.chat).toMatchObject({mode:'execution',enabled:false});expect(view.nextAction.id).toBe('approve');
 });
 test('binding planned tasks preserves historical publication evidence and rejects an obsolete selection',async()=>{
  const f=await fixture(),before=(await f.get(f.story.id,'admin')).json(),token=before.binding.expectedLinksVersion;
  expect((await f.bind([{taskId:f.task.id,scope:'Explicit code scope',completion:'publish_code'}],undefined,1,token)).statusCode).toBe(200);
  const view=(await f.get(f.story.id,'admin')).json();expect(view.activities.some((a:any)=>a.legacy&&a.kind==='coding'&&a.attempts[0].sha===f.sha)).toBe(true);
  const stale=await f.bind([],undefined,1,token);expect(stale.statusCode,stale.body).toBe(409);expect(stale.json().error.code).toBe('WORK_LINKS_CHANGED');
  expect(await db.workTaskLink.count({where:{activity:{storyId:f.story.id}}})).toBe(1);
 });
 test('a scope change offers explicit replan instead of an action the backend will refuse',async()=>{
  const f=await fixture();await db.item.update({where:{id:f.task.id},data:{description:'A changed functional scope',version:{increment:1}}});
  const view=(await f.get(f.story.id,'admin')).json();expect(view.current.state).toBe('stale');expect(view.nextAction).toMatchObject({id:'replan',enabled:true,path:`/api/executions/${f.run.id}/replan`,body:{expectedVersion:1,confirmed:true}});
  expect(view.nextAction.confirmation.checkboxLabel).toBeTruthy();expect(view.chat.enabled).toBe(false);
  await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind:'code_review',sha:f.sha,baseSha:f.baseSha,policyVersion:qualityPolicy,state:'running',actorId:'admin',actorName:'Admin'}});
  expect((await f.get(f.story.id,'admin')).json().nextAction.enabled).toBe(false);
 });
 test('stale G1 requires cancellation before another cycle and does not enable old approval',async()=>{
  const f=await fixture();await db.storyExecution.update({where:{id:f.run.id},data:{state:'waiting_approval',stage:'gate'}});await db.item.update({where:{id:f.story.id},data:{version:{increment:1}}});
  const view=(await f.get(f.story.id,'admin')).json();expect(view.current.state).toBe('stale');expect(view.nextAction).toBeNull();expect(view.secondaryActions.map((action:any)=>action.id)).toEqual(['cancel','cancel_story']);
 });
 test('checks for another base cannot approve the current delivery',async()=>{
  const f=await fixture();for(const kind of ['code_review','security_scan'])await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind,sha:f.sha,baseSha:'d'.repeat(40),policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'e'.repeat(64)}}});
  const view=(await f.get(f.story.id,'admin')).json();expect(view.readiness.ready).toBe(false);expect(view.current).toMatchObject({kind:'code_review',state:'stale'});expect(view.nextAction.id).toBe('code_review');
 });
 test('a process task exposes an old approval as stale without rewriting the recorded outcome',async()=>{
  const f=await fixture(),check=await db.qualityCheck.create({data:{storyId:f.story.id,executionId:f.run.id,kind:'code_review',sha:'d'.repeat(40),baseSha:f.baseSha,policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'e'.repeat(64)}}});
  const process=await db.item.create({data:{kind:'task',key:randomUUID(),name:'Review process',parentId:f.story.id,parentKind:'story',status:'todo',data:{workProcess:true}}}),activity=await db.workActivity.create({data:{storyId:f.story.id,repositoryId:f.repo.id,taskId:process.id,kind:'code_review',scopeKey:randomUUID()}});
  const attempt=await db.workAttempt.create({data:{activityId:activity.id,sourceType:'quality',sourceId:check.id,sourceKey:randomUUID(),state:'succeeded',revision:check.sha,actorId:'admin',actorName:'Admin'}});await db.workActivity.update({where:{id:activity.id},data:{currentAttemptId:attempt.id}});
  const view=(await f.get(process.id,'admin')).json();expect(view.tasks.find((task:any)=>task.id===process.id).operationalState).toBe('stale');expect(view.activities.find((a:any)=>a.id===activity.id).attempts[0]).toMatchObject({state:'stale',recordedState:'succeeded'});
  expect((await db.workAttempt.findUniqueOrThrow({where:{id:attempt.id}})).state).toBe('succeeded');expect((await db.qualityCheck.findUniqueOrThrow({where:{id:check.id}})).state).toBe('passed');
 });
});
