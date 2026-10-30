import {repositoryFixture} from './repository-fixture';
import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {recordAudit} from '../apps/api/src/audit.ts';
import {hierarchyBlock,itemLifecycle,isTerminalItem} from '../apps/api/src/lifecycle-policy.ts';
import {finalizeStoryCancellation} from '../apps/api/src/story-lifecycle.ts';

const item=(kind:string,status:string,extra:Record<string,unknown>={})=>({id:kind,kind,status,projectLifecycle:null,archived:false,parentId:null,data:{},...extra}) as any;
test('group lifecycle separates pause, terminal outcome and legacy presentation',()=>{
  expect(itemLifecycle(item('project','approved',{projectLifecycle:'active'}))).toBe('active');
  expect(itemLifecycle(item('epic','doing'))).toBe('active');
  expect(itemLifecycle(item('epic','done'))).toBe('completed');
  expect(isTerminalItem(item('epic','inactive'))).toBe(false);
  expect(isTerminalItem(item('story','cancelled'))).toBe(true);
  expect(isTerminalItem(item('task','done'))).toBe(true);
});
test('the same hierarchy policy blocks descendants and permits explicit self-reactivation only',()=>{
  const chain=[item('system','active'),item('project','inactive',{projectLifecycle:'inactive'}),item('epic','active'),item('story','coding')];
  expect(hierarchyBlock(chain)).toMatchObject({code:'HIERARCHY_INACTIVE',itemId:'project'});
  expect(hierarchyBlock(chain.slice(0,2),false)).toBeNull();
  expect(hierarchyBlock([item('system','inactive')],false)).toBeNull();
  expect(hierarchyBlock([item('story','coding',{data:{cancellationRequested:{actorId:'admin'}}})])).toMatchObject({code:'STORY_CANCELLATION_PENDING'});
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('lifecycle contract through the real API in portal_test',()=>{
  const db=database(process.env.TEST_DATABASE_URL!),runtime=createApp({db,demoMode:true});
  afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
  const headers={'x-persona':'admin'};
  let fixtureSequence=0;
  const post=(path:string,body:unknown,key=randomUUID())=>runtime.app.inject({method:'POST',url:'/api'+path,headers:{...headers,'idempotency-key':key},payload:body});
  async function create(kind:string,parentId?:string){
    const token=String(fixtureSequence++).padStart(4,'0').replace(/\d/g,digit=>String.fromCharCode(65+Number(digit)));
    const response=await post('/items',{kind,parentId,name:`Isolated ${kind}`,description:'Isolated contract scope',...(kind==='system'?{key:'LC'+token}:kind==='project'?{key:'PR'+token}:{} )});
    expect(response.statusCode,response.body).toBe(200);return response.json().item;
  }
  async function fixture(){const system=await create('system'),project=await create('project',system.id),epic=await create('epic',project.id),story=await create('story',epic.id);const repo=await repositoryFixture(db,{data:{systemId:system.id,key:'isolated-'+randomUUID(),name:'Isolated repository without provider effects',runtime:'node',state:'ready'}});return {system,project,epic,story,repo};}
  async function current(id:string){return db.item.findUniqueOrThrow({where:{id}});}

  test('manual creation has active groupers and six fixed pipeline tasks in the same idempotent operation',async()=>{
    const f=await fixture();expect([f.project.status,f.epic.status,f.story.status]).toEqual(['active','active','specification']);
    const tasks=await db.item.findMany({where:{parentId:f.story.id},orderBy:{createdAt:'asc'}});
    expect(tasks).toHaveLength(6);expect(new Set(tasks.map(t=>(t.data as any).pipelineStage)).size).toBe(6);
    expect(tasks.map(t=>t.name)).toEqual(['Codificação','Teste','Revisão de Código','Revisão de Segurança','Teste Final','Merge de Código']);
    expect((f.story.data as any).creationOrigin).toBe('manual');
    expect((await post(`/items/${f.project.id}/approve`,{expectedVersion:1})).json().error.code).toBe('PLANNING_APPROVAL_REMOVED');
    const protectedStatus=await post(`/items/${tasks[0].id}/status`,{expectedVersion:tasks[0].version,status:'doing'});expect(protectedStatus.statusCode).toBe(409);
  });
  test('inactivation freezes descendants, pauses queued work and reactivation never resumes it',async()=>{
    const f=await fixture();const run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repo.id,storyVersion:1,stage:'context',snapshot:{},actorId:'admin',actorName:'Admin'}});
    const paused=await post(`/items/${f.project.id}/lifecycle`,{expectedVersion:1,lifecycle:'inactive'});expect(paused.statusCode,paused.body).toBe(200);
    expect((await db.storyExecution.findUniqueOrThrow({where:{id:run.id}})).state).toBe('paused');
    expect((await post('/items',{kind:'task',parentId:f.story.id,name:'Forbidden while paused'})).statusCode).toBe(409);
    const edit=await runtime.app.inject({method:'PATCH',url:`/api/items/${f.story.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{name:'Must remain unchanged',description:'No write',expectedVersion:1}});expect(edit.statusCode).toBe(409);expect((await current(f.story.id)).name).toBe(f.story.name);
    const reopened=await post(`/items/${f.project.id}/lifecycle`,{expectedVersion:paused.json().item.version,lifecycle:'active'});expect(reopened.statusCode,reopened.body).toBe(200);
    expect((await db.storyExecution.findUniqueOrThrow({where:{id:run.id}})).state).toBe('paused');
    expect((await post(`/items/${f.project.id}/resume-work`,{expectedVersion:reopened.json().item.version})).statusCode).toBe(200);
    expect((await db.storyExecution.findUniqueOrThrow({where:{id:run.id}})).state).toBe('queued');
  });
  test('running work prevents inactivation and both close outcomes reject open descendants',async()=>{
    const f=await fixture();const run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repo.id,storyVersion:1,state:'running',snapshot:{},actorId:'admin',actorName:'Admin',leaseUntil:new Date(Date.now()+60000)}});
    expect((await post(`/items/${f.project.id}/lifecycle`,{expectedVersion:1,lifecycle:'inactive'})).json().error.code).toBe('HIERARCHY_WORK_RUNNING');
    expect((await current(f.project.id)).status).toBe('active');
    await db.storyExecution.update({where:{id:run.id},data:{state:'failed',leaseUntil:null}});
    for(const lifecycle of ['completed','cancelled'])expect((await post(`/items/${f.epic.id}/lifecycle`,{expectedVersion:1,lifecycle,comment:'Reason given in isolated test.'})).json().error.code).toBe('UNFINISHED_CHILDREN');
    const archived=await runtime.app.inject({method:'DELETE',url:`/api/items/${f.story.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:1}});expect(archived.json().error.code).toBe('ARCHIVE_REQUIRES_FINALIZED');
  });
  test('empty groupers may close with a reason and ancestor reactivation is explicit',async()=>{
    const system=await create('system'),project=await create('project',system.id);
    expect((await post(`/items/${project.id}/lifecycle`,{expectedVersion:1,lifecycle:'completed'})).json().error.code).toBe('CLOSURE_REASON_REQUIRED');
    const closed=await post(`/items/${project.id}/lifecycle`,{expectedVersion:1,lifecycle:'completed',comment:'No remaining work in this isolated case.'});expect(closed.statusCode,closed.body).toBe(200);
    const reopen=await post(`/items/${project.id}/lifecycle`,{expectedVersion:closed.json().item.version,lifecycle:'active',comment:'Reopening the isolated grouping.'});expect(reopen.statusCode,reopen.body).toBe(200);
  });
  test('manual task results are required and remain immutable after reopening and another completion',async()=>{
    const f=await fixture(),task=await create('task',f.story.id);
    let response=await post(`/items/${task.id}/status`,{expectedVersion:1,status:'doing'});expect(response.statusCode,response.body).toBe(200);
    const version=response.json().item.version;
    expect((await post(`/items/${task.id}/status`,{expectedVersion:version,status:'done'})).json().error.code).toBe('TASK_RESULT_REQUIRED');
    response=await post(`/items/${task.id}/status`,{expectedVersion:version,status:'done',result:'First observed result',evidence:['isolated-check:1']});expect(response.statusCode,response.body).toBe(200);
    const first=response.json().item;response=await post(`/items/${task.id}/status`,{expectedVersion:first.version,status:'doing',comment:'Another explicit attempt is required.'});
    response=await post(`/items/${task.id}/status`,{expectedVersion:response.json().item.version,status:'done',result:'Second observed result'});expect(response.statusCode,response.body).toBe(200);
    const results=await runtime.app.inject({method:'GET',url:`/api/items/${task.id}/results`,headers});expect(results.statusCode,results.body).toBe(200);
    expect(results.json().pagination.total).toBe(2);expect(results.json().results.map((r:any)=>r.summary)).toEqual(['Second observed result','First observed result']);
  });
  test('task result pages retain their source snapshot while current hierarchy and context stay independent',async()=>{
    const f=await fixture(),task=await create('task',f.story.id),other=await create('task',f.story.id);
    const createdAt=new Date(Date.now()-60000);
    // Isolated immutable source fixtures deliberately share timestamps; versions must break the tie.
    await db.taskResultRevision.createMany({data:Array.from({length:23},(_,index)=>({taskId:task.id,version:index+1,summary:`Observed result ${index+1}`,evidence:[],actorId:'admin',actorName:'Admin',createdAt}))});
    await db.taskResultRevision.create({data:{taskId:other.id,version:99,summary:'Another task private result',evidence:[],actorId:'admin',actorName:'Admin',createdAt}});
    const get=(id:string,query='')=>runtime.app.inject({method:'GET',url:`/api/items/${id}/results${query}`,headers});
    let response=await get(task.id);expect(response.statusCode,response.body).toBe(200);const first=response.json();
    expect(first.pagination).toEqual({page:1,pageSize:20,total:23,totalPages:2});expect(first.readOnly).toBe(false);
    expect(first.results.map((row:any)=>row.version)).toEqual(Array.from({length:20},(_,index)=>23-index));
    expect(first.query).toEqual({page:1,asOf:first.asOf});expect(Number.isFinite(Date.parse(first.asOf))).toBe(true);
    await db.taskResultRevision.create({data:{taskId:task.id,version:24,summary:'Appended after the first snapshot',evidence:[],actorId:'admin',actorName:'Admin',createdAt:new Date(Date.parse(first.asOf)+1)}});
    const snapshot=`?page=2&asOf=${encodeURIComponent(first.asOf)}`;
    response=await get(task.id,snapshot);expect(response.statusCode,response.body).toBe(200);
    expect(response.json().results.map((row:any)=>row.version)).toEqual([3,2,1]);expect(response.json().pagination.total).toBe(23);expect(response.json().asOf).toBe(first.asOf);
    expect((await get(task.id,`?page=999&asOf=${encodeURIComponent(first.asOf)}`)).json().pagination.page).toBe(2);
    response=await get(task.id);expect(response.statusCode,response.body).toBe(200);expect(response.json().pagination.total).toBe(24);expect(response.json().results[0].version).toBe(24);
    const inactive=await post(`/items/${f.project.id}/lifecycle`,{expectedVersion:f.project.version,lifecycle:'inactive'});expect(inactive.statusCode,inactive.body).toBe(200);
    response=await get(task.id,snapshot);expect(response.statusCode,response.body).toBe(200);expect(response.json()).toMatchObject({asOf:first.asOf,readOnly:true,pagination:{page:2,total:23}});
    expect(response.json().results.map((row:any)=>row.version)).toEqual([3,2,1]);
    expect((await get(other.id)).json().results.map((row:any)=>row.summary)).toEqual(['Another task private result']);
    expect((await get(f.story.id)).json().error.code).toBe('TASK_REQUIRED');expect((await get('missing-result-context')).statusCode).toBe(404);
    for(const query of ['?asOf=invalid','?asOf=2026-10-25T12:00:00','?page=0','?page=1.5','?unknown=true'])expect((await get(task.id,query)).statusCode).toBe(422);
    expect((await runtime.app.inject({method:'GET',url:`/api/items/${task.id}/results`,headers:{'x-persona':'invalid'}})).statusCode).toBe(403);
    expect(await db.taskResultRevision.count({where:{taskId:task.id}})).toBe(24);expect((await current(task.id)).version).toBe(task.version);
  });
  test('story cancellation is idempotent, preserves completed tasks and reopens without resetting children',async()=>{
    const f=await fixture(),extra=await create('task',f.story.id);
    await post(`/items/${extra.id}/status`,{expectedVersion:1,status:'doing'});await post(`/items/${extra.id}/status`,{expectedVersion:2,status:'done',result:'Completed before the cancellation.'});
    const key=randomUUID(),body={expectedVersion:1,comment:'Explicit cancellation in isolated fixture.'};
    const cancelled=await post(`/items/${f.story.id}/cancel`,body,key);expect(cancelled.statusCode,cancelled.body).toBe(200);expect(cancelled.json()).toMatchObject({pending:false,item:{status:'cancelled'}});
    expect((await post(`/items/${f.story.id}/cancel`,body,key)).json()).toEqual(cancelled.json());
    expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_CANCELLED'}})).toBe(1);
    expect((await current(extra.id)).status).toBe('done');expect(await db.item.count({where:{parentId:f.story.id,status:'cancelled'}})).toBe(6);
    const reopen=await post(`/items/${f.story.id}/reopen`,{expectedVersion:cancelled.json().item.version,comment:'New scope review after explicit reopening.'});expect(reopen.statusCode,reopen.body).toBe(200);expect(reopen.json().item.status).toBe('specification');
    expect(await db.item.count({where:{parentId:f.story.id,status:'cancelled'}})).toBe(6);
  });
  test('publishing cancellation remains pending until confirmed effects are preserved',async()=>{
    const f=await fixture();const story=await db.item.update({where:{id:f.story.id},data:{status:'coding'}}),run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:f.repo.id,storyVersion:story.version,state:'running',stage:'publishing',snapshot:{},actorId:'admin',actorName:'Admin',leaseUntil:new Date(Date.now()+60000)}});
    const pending=await post(`/items/${story.id}/cancel`,{expectedVersion:story.version});expect(pending.statusCode,pending.body).toBe(200);expect(pending.json().pending).toBe(true);expect((await current(story.id)).status).toBe('coding');
    expect(await db.historyEvent.count({where:{itemId:story.id,action:'STORY_CANCELLED'}})).toBe(0);
    await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      await tx.storyExecution.update({where:{id:run.id},data:{state:'cancelled',leaseId:null,leaseUntil:null,commitSha:'a'.repeat(40),branch:'isolated/preserved',mergeRequestUrl:'http://isolated/mr/1'}});
      const outcome=await finalizeStoryCancellation(tx,{live:async(t,id)=>t.item.findUniqueOrThrow({where:{id}}),event:recordAudit},story.id);expect(outcome.pending).toBe(false);
    });
    expect((await current(story.id)).status).toBe('cancelled');expect((await db.storyExecution.findUniqueOrThrow({where:{id:run.id}})).mergeRequestUrl).toBe('http://isolated/mr/1');
  });
  test('a later failure rolls back the whole cancellation and a retry still succeeds once',async()=>{
    const f=await fixture();
    await expect(db.$transaction(async tx=>{
      const marked=await tx.item.update({where:{id:f.story.id},data:{data:{cancellationRequested:{actorId:'admin',actorName:'Admin',operationId:'rollback:'+f.story.id,requestedAt:new Date().toISOString()}}}});
      await finalizeStoryCancellation(tx,{live:async(t,id)=>t.item.findUniqueOrThrow({where:{id}}),event:recordAudit},marked.id);
      throw Error('Isolated rollback after recorder');
    })).rejects.toThrow('Isolated rollback');
    expect((await current(f.story.id)).status).toBe('specification');expect(await db.item.count({where:{parentId:f.story.id,status:'todo'}})).toBe(6);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_CANCELLED'}})).toBe(0);
    const retry=await post(`/items/${f.story.id}/cancel`,{expectedVersion:1});expect(retry.statusCode,retry.body).toBe(200);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'STORY_CANCELLED'}})).toBe(1);
  });
});
