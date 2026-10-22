import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {WorkItem} from '@sdlc/shared';

const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('/portal_test'))throw new Error('Tests require an explicit disposable portal_test database');
const db=database(url);
const {app,processJobs}=createApp({db,demoMode:true});
const headers={'x-persona':'admin'};
let root:WorkItem,project:WorkItem,epic:WorkItem,story:WorkItem,task:WorkItem;
async function post(path:string,payload:unknown,persona='admin',key=randomUUID()){
  return app.inject({method:'POST',url:`/api${path}`,headers:{'x-persona':persona,'idempotency-key':key},payload});
}
async function create(kind:string,parentId?:string,extra:Record<string,unknown>={}){
  const response=await post('/items',{kind,parentId,name:`Item ${kind}`,description:'Definido pelo usuário',...extra});
  expect(response.statusCode,response.body).toBe(200);return response.json<{item:WorkItem}>().item;
}
beforeAll(async()=>{await app.ready();});
afterAll(async()=>{await app.close();await db.$disconnect();});

test('empty installation has no seeded business data and health never creates it',async()=>{
  expect(await db.item.count()).toBe(0);
  expect((await app.inject('/api/health')).statusCode).toBe(200);
  const health=(await app.inject('/api/integrations/health')).json();
  expect(health.ready).toBe(false);expect(health.checks.every((c:{status:string})=>c.status==='not_configured')).toBe(true);
  expect(await db.item.count()).toBe(0);expect(await db.historyEvent.count()).toBe(0);
  const dashboard=(await app.inject('/api/metrics/dashboard')).json();
  expect(dashboard.inventory.every((i:{total:number})=>i.total===0)).toBe(true);
  expect(dashboard.weeks).toHaveLength(4);expect(dashboard.dora.every((m:{value:unknown})=>m.value===null)).toBe(true);
  expect(await db.item.count()).toBe(0);expect(await db.historyEvent.count()).toBe(0);
});
test('hierarchy creation has exact statuses, unique keys, history and three empty environments',async()=>{
  root=await create('system',undefined,{key:'LIVE'});
  project=await create('project',root.id,{key:'APP'});
  epic=await create('epic',project.id);story=await create('story',epic.id);task=await create('task',story.id);
  expect([root.status,project.status,epic.status,story.status,task.status]).toEqual(['active','awaiting_approval','todo','specification','todo']);
  const detail=(await app.inject(`/api/items/${task.id}`)).json();
  expect(detail.ancestors.map((i:WorkItem)=>i.kind)).toEqual(['system','project','epic','story']);
  expect(await db.environment.count()).toBe(0);
  expect(project.data.gitlabState).toBeUndefined();
  expect(await db.provisioningJob.count({where:{itemId:project.id}})).toBe(0);
  expect((await app.inject(`/api/items/${root.id}`)).json().history).toHaveLength(5);
});
test('hierarchy errors, whitespace, unknown fields and duplicate keys are rejected without side effects',async()=>{
  expect((await post('/items',{kind:'story',parentId:root.id,name:'Wrong parent'})).statusCode).toBe(400);
  expect((await post('/items',{kind:'system',name:'   ',key:'BLANK'})).statusCode).toBe(422);
  expect((await post('/items',{kind:'task',parentId:story.id,name:'Task',status:'done'})).statusCode).toBe(422);
  expect((await post('/items',{kind:'system',name:'Duplicate',key:'LIVE'})).statusCode).toBe(409);
  expect(await db.item.count()).toBe(5);
});
test('idempotency survives retries, rejects different payload and serializes concurrent submissions',async()=>{
  const key=randomUUID();const payload={kind:'task',parentId:story.id,name:'Atomic task'};
  const [a,b]=await Promise.all([post('/items',payload,'admin',key),post('/items',payload,'admin',key)]);
  expect(a.statusCode).toBe(200);expect(b.statusCode).toBe(200);expect(a.json()).toEqual(b.json());
  expect((await post('/items',{...payload,name:'Different'},'admin',key)).statusCode).toBe(409);
});
test('persona and origin controls deny mutation but allow read-only inspection',async()=>{
  expect((await post('/items',{kind:'system',key:'NOPE',name:'Denied'},'carla')).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/items',headers:{'idempotency-key':randomUUID()},payload:{kind:'system',name:'Denied',key:'NONE'}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/items',headers:{...headers,'idempotency-key':randomUUID(),origin:'https://elsewhere.invalid'},payload:{kind:'system',name:'Denied',key:'NONE'}})).statusCode).toBe(403);
  expect((await app.inject(`/api/items/${root.id}`)).statusCode).toBe(200);
});
test('planning approvals are authorized, independent, and cannot approve stories',async()=>{
  expect((await post(`/items/${epic.id}/approve`,{expectedVersion:epic.version})).statusCode).toBe(409);
  expect((await post(`/items/${project.id}/approve`,{expectedVersion:project.version},'bruno')).statusCode).toBe(403);
  const response=await post(`/items/${project.id}/approve`,{expectedVersion:project.version},'ana');
  expect(response.statusCode,response.body).toBe(200);project=response.json().item;
  expect((await post(`/items/${epic.id}/approve`,{expectedVersion:epic.version},'ana')).statusCode).toBe(200);
  expect((await post(`/items/${story.id}/approve`,{expectedVersion:story.version})).statusCode).toBe(409);
  expect((await db.item.findUniqueOrThrow({where:{id:story.id}})).status).toBe('specification');
});
test('task transitions do not skip steps and reopening requires an explanation',async()=>{
  expect((await post(`/items/${task.id}/status`,{status:'done',expectedVersion:task.version})).statusCode).toBe(409);
  let response=await post(`/items/${task.id}/status`,{status:'doing',expectedVersion:task.version});
  expect(response.statusCode,response.body).toBe(200);task=response.json().item;
  response=await post(`/items/${task.id}/status`,{status:'done',expectedVersion:task.version});task=response.json().item;
  expect(task.status).toBe('done');
  expect((await post(`/items/${task.id}/status`,{status:'doing',expectedVersion:task.version})).statusCode).toBe(400);
  expect((await post(`/items/${task.id}/status`,{status:'doing',expectedVersion:task.version,comment:'Nova necessidade identificada pelo usuário'})).statusCode).toBe(200);
});
test('epics cannot finish while stories remain unfinished',async()=>{
  let current=await db.item.findUniqueOrThrow({where:{id:epic.id}});
  expect((await post(`/items/${epic.id}/status`,{status:'doing',expectedVersion:current.version})).statusCode).toBe(200);
  current=await db.item.findUniqueOrThrow({where:{id:epic.id}});
  expect((await post(`/items/${epic.id}/status`,{status:'done',expectedVersion:current.version})).statusCode).toBe(409);
});
test('stories cannot manually bypass pipeline states and stale edits do not overwrite data',async()=>{
  expect((await post(`/items/${story.id}/status`,{status:'production',expectedVersion:story.version})).statusCode).toBe(409);
  const changed=await app.inject({method:'PATCH',url:`/api/items/${story.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{name:'Revisada',description:'Mudança humana',expectedVersion:story.version}});
  expect(changed.statusCode).toBe(200);
  expect((await app.inject({method:'PATCH',url:`/api/items/${story.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{name:'Estado antigo',description:'',expectedVersion:story.version}})).statusCode).toBe(409);
});
test('provisioning failure preserves the hierarchy and records a technical condition, never a fake repo',async()=>{
  await processJobs();const current=await db.item.findUniqueOrThrow({where:{id:root.id}});
  expect((current.data as {gitlabState:string}).gitlabState).toBe('not_configured');
  expect((current.data as {gitlabUrl?:string}).gitlabUrl).toBeUndefined();
  expect(current.status).toBe('active');
  expect(current.version).toBe(root.version); // Technical conditions do not stale human drafts/approvals.
});
test('restart uses persisted state and never seeds data',async()=>{
  const count=await db.item.count();const other=createApp({db,demoMode:true});await other.app.ready();
  expect((await other.app.inject(`/api/items/${root.id}`)).statusCode).toBe(200);
  expect(await db.item.count()).toBe(count);await other.app.close();
});
test('history is append-only in PostgreSQL',async()=>{
  const first=await db.historyEvent.findFirstOrThrow();
  await expect(db.historyEvent.update({where:{id:first.id},data:{message:'Overwrite'}})).rejects.toThrow();
  await expect(db.historyEvent.delete({where:{id:first.id}})).rejects.toThrow();
});

test('repositories belong to the system, can serve multiple projects, and scopes cannot cross systems',async()=>{
  const result=await post(`/systems/${root.id}/repositories`,{name:'Componente',key:'backend',runtime:'python',mode:'create'});
  expect(result.statusCode,result.body).toBe(200);const repo=result.json().repository;
  expect(await db.environment.count({where:{repositoryId:repo.id}})).toBe(3);
  const assign=async(itemId:string,repositoryIds:string[])=>app.inject({method:'PATCH',url:`/api/items/${itemId}/repositories`,headers:{...headers,'idempotency-key':randomUUID()},payload:{repositoryIds,expectedVersion:(await db.item.findUniqueOrThrow({where:{id:itemId}})).version}});
  expect((await assign(project.id,[repo.id])).statusCode).toBe(200);
  const second=await create('project',root.id,{key:'SECOND',repositoryIds:[repo.id]});
  expect(await db.repository.count()).toBe(1);
  expect(await db.provisioningJob.count({where:{itemId:second.id}})).toBe(0);
  expect((await assign(story.id,[repo.id])).statusCode).toBe(200);
  expect((await assign(task.id,[repo.id])).statusCode).toBe(200);
  expect((await assign(project.id,[])).statusCode).toBe(409);
  expect((await app.inject(`/api/items/${root.id}`)).json().environments).toHaveLength(3);
  expect((await app.inject(`/api/items/${project.id}`)).json().environments).toHaveLength(0);
  const foreign=await create('system',undefined,{key:'FOREIGN'});
  const forbidden=await post('/items',{kind:'project',parentId:foreign.id,key:'NO',name:'Wrong scope',repositoryIds:[repo.id]});
  expect(forbidden.statusCode).toBe(409);
  await app.inject({method:'DELETE',url:`/api/items/${foreign.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:foreign.version}});
  await processJobs();expect((await db.repository.findUniqueOrThrow({where:{id:repo.id}})).state).toBe('not_configured');
});

test('linking an existing repository is read-only remotely and project closure preserves the product',async()=>{
  let writes=0;
  const connected=createApp({db,demoMode:true,git:{health:async()=>true,ensureGroup:async()=>{writes++;throw Error('unexpected write');},ensureProject:async()=>{writes++;throw Error('unexpected write');},inspectProject:async id=>({id,path_with_namespace:'external/component',web_url:'http://gitlab/external/component'})}});
  const linked=await connected.app.inject({method:'POST',url:`/api/systems/${root.id}/repositories`,headers:{...headers,'idempotency-key':randomUUID()},payload:{name:'Existente',key:'existing',runtime:'node',mode:'link',gitlabProjectId:42}});
  expect(linked.statusCode,linked.body).toBe(200);const repo=linked.json().repository;expect(repo.state).toBe('ready');expect(writes).toBe(0);
  let initiative=await create('project',root.id,{key:'CYCLE',repositoryIds:[repo.id]});
  expect((await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'active',expectedVersion:initiative.version})).statusCode).toBe(409);
  initiative=(await post(`/items/${initiative.id}/approve`,{expectedVersion:initiative.version})).json().item;
  initiative=(await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'active',expectedVersion:initiative.version})).json().item;
  expect((await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'completed',expectedVersion:initiative.version})).statusCode).toBe(409);
  initiative=(await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'cancelled',expectedVersion:initiative.version})).json().item;
  expect((await post('/items',{kind:'epic',parentId:initiative.id,name:'Closed work'})).statusCode).toBe(409);
  expect((await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'planned',expectedVersion:initiative.version})).statusCode).toBe(400);
  expect((await post(`/items/${initiative.id}/lifecycle`,{lifecycle:'planned',expectedVersion:initiative.version,comment:'Nova iniciativa autorizada pelo usuário'})).statusCode).toBe(200);
  expect(await db.repository.findUnique({where:{id:repo.id}})).not.toBeNull();expect(await db.environment.count({where:{repositoryId:repo.id}})).toBe(3);
  await connected.app.close();
});
test('archive cascades locally, blocks descendants and preserves audit history',async()=>{
  const current=await db.item.findUniqueOrThrow({where:{id:root.id}});const history=await db.historyEvent.count();
  const response=await app.inject({method:'DELETE',url:`/api/items/${root.id}`,headers:{...headers,'idempotency-key':randomUUID()},payload:{expectedVersion:current.version}});
  expect(response.statusCode,response.body).toBe(200);
  expect(await db.item.count({where:{archived:false}})).toBe(0);
  expect((await app.inject(`/api/items/${task.id}`)).statusCode).toBe(404);
  expect((await post('/items',{kind:'task',parentId:story.id,name:'Late task'})).statusCode).toBe(404);
  expect(await db.historyEvent.count()).toBeGreaterThan(history);
});

test('technical model probe requires an operator, serializes inference and never creates business data',async()=>{
  const count=await db.item.count(),history=await db.historyEvent.count();
  let finish!:(value:{model:string;content:string})=>void,started!:()=>void;
  const active=new Promise<void>(resolve=>{started=resolve;});
  const inference=new Promise<{model:string;content:string}>(resolve=>{finish=resolve;});
  const connected=createApp({db,demoMode:true,llm:{model:'local-test',models:async()=>['local-test'],complete:async()=>{started();return inference;}}});
  const health=(await connected.app.inject('/api/integrations/health')).json();
  expect(health.checks.find((c:{id:string})=>c.id==='llm').status).toBe('ready');
  expect((await connected.app.inject('/api/integrations/models')).json().selectedModel).toBe('local-test');
  expect((await connected.app.inject({method:'POST',url:'/api/integrations/llm/probe',headers:{'x-persona':'ana'},payload:{}})).statusCode).toBe(403);
  const first=connected.app.inject({method:'POST',url:'/api/integrations/llm/probe',headers:{'x-persona':'admin'},payload:{}}).then(r=>r);
  await active;
  expect((await connected.app.inject({method:'POST',url:'/api/integrations/llm/probe',headers:{'x-persona':'admin'},payload:{}})).statusCode).toBe(409);
  finish({model:'local-test',content:'Fixture only'});expect((await first).statusCode).toBe(200);
  expect(await db.item.count()).toBe(count);expect(await db.historyEvent.count()).toBe(history);
  await connected.app.close();
});

test('assistant persists context, rejects duplicate concurrent messages and never applies the proposed plan',async()=>{
  const system=await create('system',undefined,{key:'CHAT'});
  const initiative=await create('project',system.id,{key:'PLAN'});
  const grouping=await create('epic',initiative.id);const work=await create('story',grouping.id);
  let calls=0,fail=false;
  const connected=createApp({db,demoMode:true,llm:{model:'isolated-test',models:async()=>['isolated-test'],complete:async messages=>{calls++;expect(messages[0].content).toContain('analista');if(fail)throw Error('private error');return {model:'isolated-test',content:'Resposta exclusiva da fixture isolada'};}}});
  const read=async()=> (await connected.app.inject(`/api/assistant?contextId=${work.id}`)).json();
  expect((await read()).context.id).toBe(initiative.id);expect((await read()).session).toBeNull();expect(await db.chatSession.count()).toBe(0);
  const send=(message:string,expectedVersion:number,key=randomUUID(),persona='admin')=>connected.app.inject({method:'POST',url:'/api/assistant/turns',headers:{'x-persona':persona,'idempotency-key':key},payload:{contextId:work.id,message,expectedVersion}});
  const count=await db.item.count(),key=randomUUID();
  expect((await send('Não autorizado',0,randomUUID(),'carla')).statusCode).toBe(403);
  const first=await send('Quero esclarecer meu objetivo.',0,key);expect(first.statusCode,first.body).toBe(200);
  expect((await send('Quero esclarecer meu objetivo.',0,key)).json()).toEqual(first.json());
  expect((await send('Outro texto',0,key)).statusCode).toBe(409);
  expect((await send('Outro texto',1)).statusCode).toBe(409);
  await connected.processChatJobs();let state=await read();expect(calls).toBe(1);expect(state.turns[0].status).toBe('succeeded');expect(state.turns[0].output).toContain('fixture');
  fail=true;expect((await send('Mensagem que sofrerá falha.',state.session.version)).statusCode).toBe(200);
  await connected.processChatJobs();state=await read();expect(state.turns[1].status).toBe('failed');expect(state.turns[1].output).toBeNull();expect(state.turns[1].error).not.toContain('private error');
  expect(await db.item.count()).toBe(count);expect(await db.chatTurn.count()).toBe(2);
  const restarted=createApp({db,demoMode:true});await restarted.processChatJobs();
  expect((await restarted.app.inject(`/api/assistant?contextId=${initiative.id}`)).json().turns).toHaveLength(2);
  await restarted.app.close();await connected.app.close();
});

test('cancelling a running assistant turn discards late output and expired leases fail without regeneration',async()=>{
  const system=await db.item.findFirstOrThrow({where:{key:'CHAT'}});
  let start!:()=>void,finish!:(value:{model:string;content:string})=>void;
  const started=new Promise<void>(resolve=>{start=resolve;});
  const result=new Promise<{model:string;content:string}>(resolve=>{finish=resolve;});
  const connected=createApp({db,demoMode:true,llm:{model:'isolated-test',models:async()=>['isolated-test'],complete:async()=>{start();return result;}}});
  const sent=await connected.app.inject({method:'POST',url:'/api/assistant/turns',headers:{...headers,'idempotency-key':randomUUID()},payload:{contextId:system.id,message:'Cancelar esta rodada.',expectedVersion:0}});
  expect(sent.statusCode,sent.body).toBe(200);const id=sent.json().turn.id;
  const processing=connected.processChatJobs();await started;
  const cancel=await connected.app.inject({method:'POST',url:`/api/assistant/turns/${id}/cancel`,headers:{...headers,'idempotency-key':randomUUID()},payload:{}});
  expect(cancel.statusCode,cancel.body).toBe(200);finish({model:'isolated-test',content:'Late output must not be saved'});await processing;
  const turn=await db.chatTurn.findUniqueOrThrow({where:{id}});expect(turn.status).toBe('cancelled');expect(turn.output).toBeNull();
  await db.chatTurn.update({where:{id},data:{status:'running',leaseId:'expired',leaseUntil:new Date(0)}});
  await connected.processChatJobs();expect((await db.chatTurn.findUniqueOrThrow({where:{id}})).status).toBe('failed');
  await connected.app.close();
});

test('reviewed plans apply atomically, preserve initial statuses, require confirmation and cannot duplicate',async()=>{
  const system=await create('system',undefined,{key:'PROPOSALS'}),initiative=await create('project',system.id,{key:'INIT'});
  const plan={summary:'Escopo exclusivo do teste',epics:[{title:'Épico do teste',description:'Proposta isolada',stories:[{title:'História do teste',description:'Definida no ensaio',acceptanceCriteria:['Critério verificável informado no teste'],repositoryIds:[],tasks:[{title:'Tarefa do teste',description:'Trabalho isolado',repositoryIds:[]}]}]}]};
  let answer:unknown=plan;
  const runtime=createApp({db,demoMode:true,llm:{model:'plan-fixture',models:async()=>['plan-fixture'],complete:async(_messages,options)=>({model:'plan-fixture',content:options?.json?JSON.stringify(answer):'Pergunta da fixture para esclarecer o objetivo.'})}});
  const read=async()=>(await runtime.app.inject(`/api/assistant?contextId=${initiative.id}`)).json();
  const action=async(path:string,payload:unknown,method:'POST'|'PATCH'='POST',key=randomUUID(),persona='admin')=>runtime.app.inject({method,url:`/api${path}`,headers:{'x-persona':persona,'idempotency-key':key},payload});
  expect((await action('/assistant/plans',{contextId:initiative.id,expectedVersion:0})).statusCode).toBe(409);
  expect((await action('/assistant/turns',{contextId:initiative.id,expectedVersion:0,message:'Objetivo do ensaio isolado.'})).statusCode).toBe(200);await runtime.processChatJobs();
  const generate=async()=>{const state=await read();const response=await action('/assistant/plans',{contextId:initiative.id,expectedVersion:state.session.version});expect(response.statusCode,response.body).toBe(200);await runtime.processChatJobs();return (await read()).proposals.find((p:{turnId:string})=>p.turnId===response.json().turn.id);};
  const count=await db.item.count();let proposal=await generate();expect(await db.item.count()).toBe(count);expect(proposal.stale).toBe(false);
  const revised=structuredClone(plan);revised.epics[0].title='Título revisado pelo humano';
  const revision=await action(`/assistant/plans/${proposal.id}`,{expectedVersion:proposal.version,content:revised},'PATCH');expect(revision.statusCode,revision.body).toBe(200);proposal=revision.json().proposal;
  expect(await db.planRevision.count({where:{proposalId:proposal.id}})).toBe(2);
  await expect(db.planRevision.update({where:{proposalId_version:{proposalId:proposal.id,version:1}},data:{actorName:'Overwrite'}})).rejects.toThrow();
  const applyBody={expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true};
  expect((await action(`/assistant/plans/${proposal.id}/apply`,{...applyBody,confirmed:false})).statusCode).toBe(422);
  expect((await action(`/assistant/plans/${proposal.id}/apply`,applyBody,'POST',randomUUID(),'bruno')).statusCode).toBe(403);
  const key=randomUUID();const [first,replay]=await Promise.all([action(`/assistant/plans/${proposal.id}/apply`,applyBody,'POST',key),action(`/assistant/plans/${proposal.id}/apply`,applyBody,'POST',key)]);
  expect(first.statusCode,first.body).toBe(200);expect(replay.json()).toEqual(first.json());expect(await db.item.count()).toBe(count+3);
  const ids=first.json().itemIds;const rows=await Promise.all(ids.map((id:string)=>db.item.findUniqueOrThrow({where:{id}})));
  expect(rows.map(i=>i.status)).toEqual(['todo','specification','todo']);expect(rows[0].name).toBe(revised.epics[0].title);expect(rows[1].parentId).toBe(rows[0].id);expect(rows[2].parentId).toBe(rows[1].id);
  expect((rows[1].data as {planProposalId:string}).planProposalId).toBe(proposal.id);
  expect((await db.item.findUniqueOrThrow({where:{id:initiative.id}})).status).toBe('awaiting_approval');
  expect((await action(`/assistant/plans/${proposal.id}/apply`,applyBody)).statusCode).toBe(409);
  expect(await db.historyEvent.count({where:{itemId:initiative.id,action:'PLAN_APPLIED'}})).toBe(1);

  proposal=await generate();let state=await read();
  await action('/assistant/turns',{contextId:initiative.id,expectedVersion:state.session.version,message:'Nova informação na entrevista.'});await runtime.processChatJobs();
  expect((await read()).proposals.find((p:{id:string})=>p.id===proposal.id).stale).toBe(true);
  expect((await action(`/assistant/plans/${proposal.id}/apply`,{expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true})).statusCode).toBe(409);
  proposal=await generate();const beforeVersion=(await db.item.findUniqueOrThrow({where:{id:initiative.id}})).version;
  await create('epic',initiative.id);expect((await db.item.findUniqueOrThrow({where:{id:initiative.id}})).version).toBe(beforeVersion);
  expect((await read()).proposals.find((p:{id:string})=>p.id===proposal.id).stale).toBe(true); // Detect graph changes even when the parent version did not change.
  expect((await action(`/assistant/plans/${proposal.id}/apply`,{expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true})).statusCode).toBe(409);

  const proposals=await db.planProposal.count();answer={...plan,epics:[{...plan.epics[0],stories:[{...plan.epics[0].stories[0],repositoryIds:['foreign-repository']}]}]};
  state=await read();await action('/assistant/plans',{contextId:initiative.id,expectedVersion:state.session.version});await runtime.processChatJobs();
  state=await read();expect(state.turns.at(-1).status).toBe('failed');expect(await db.planProposal.count()).toBe(proposals);
  const omitted=structuredClone(plan) as any;delete omitted.epics[0].stories[0].tasks[0].repositoryIds;answer=omitted;proposal=await generate();
  expect(proposal.content.epics[0].stories[0].tasks[0].repositoryIds).toEqual([]);
  const beforeRollback={items:await db.item.count(),events:await db.historyEvent.count(),counters:await db.counter.findMany({orderBy:{scope:'asc'}})};
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_test_plan_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='task' AND NEW.name='Tarefa do teste' THEN RAISE EXCEPTION 'isolated rollback check'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER reject_test_plan_task BEFORE INSERT ON "Item" FOR EACH ROW EXECUTE FUNCTION reject_test_plan_task()');
  const rollbackBody={expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true},rollbackKey=randomUUID();
  try{
    expect((await action(`/assistant/plans/${proposal.id}/apply`,rollbackBody,'POST',rollbackKey)).statusCode).toBe(500);
    expect(await db.item.count()).toBe(beforeRollback.items);expect(await db.historyEvent.count()).toBe(beforeRollback.events);expect(await db.counter.findMany({orderBy:{scope:'asc'}})).toEqual(beforeRollback.counters);
    expect((await db.planProposal.findUniqueOrThrow({where:{id:proposal.id}})).status).toBe('draft');
  }finally{await db.$executeRawUnsafe('DROP TRIGGER reject_test_plan_task ON "Item"');await db.$executeRawUnsafe('DROP FUNCTION reject_test_plan_task()');}
  expect((await action(`/assistant/plans/${proposal.id}/apply`,rollbackBody,'POST',rollbackKey)).statusCode).toBe(200);
  expect(await db.item.count()).toBe(beforeRollback.items+3);
  await runtime.app.close();
});

test('assistant completes a System interview in the selected Project exactly once and rejects unsafe creation',async()=>{
  const system=await create('system',undefined,{key:'COMPLETE'}),target=await create('project',system.id,{key:'TARGET'});
  const other=await create('system',undefined,{key:'OTHER'}),foreign=await create('project',other.id,{key:'FOREIGN'});
  let invalid=false;
  const plan={summary:'Plano da entrevista isolada',epics:[{title:'Épico informado',description:'Escopo da conversa',stories:[{title:'História informada',description:'Objetivo definido',acceptanceCriteria:['Resultado definido na entrevista'],repositoryIds:[],tasks:[{title:'Tarefa informada',description:'Trabalho definido',repositoryIds:[]}]}]}]};
  const runtime=createApp({db,demoMode:true,llm:{model:'completion-fixture',models:async()=>[],complete:async(messages,options)=>{
    if(options?.json){expect(messages.some(m=>m.content.includes('Objetivo real da entrevista isolada'))).toBe(true);return {model:'completion-fixture',content:JSON.stringify(invalid?{invalid:true}:plan)};}
    return {model:'completion-fixture',content:'Plano textual da entrevista isolada'};
  }}});
  const read=async()=>(await runtime.app.inject(`/api/assistant?contextId=${system.id}`)).json();
  const action=(path:string,payload:unknown,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:`/api/assistant/${path}`,headers:{'x-persona':persona,'idempotency-key':key},payload});
  await action('turns',{contextId:system.id,message:'Objetivo real da entrevista isolada',expectedVersion:0});await runtime.processChatJobs();
  let state=await read();expect(state.targetProjects.map((p:{id:string})=>p.id)).toContain(target.id);expect(state.targetProjects.map((p:{id:string})=>p.id)).not.toContain(foreign.id);
  const payload={contextId:system.id,projectId:target.id,expectedVersion:state.session.version,confirmed:true};
  expect((await action('complete',{...payload,confirmed:false})).statusCode).toBe(422);
  expect((await action('complete',payload,randomUUID(),'bruno')).statusCode).toBe(403);
  expect((await action('complete',{...payload,projectId:foreign.id})).statusCode).toBe(409);
  const count=await db.item.count(),key=randomUUID();
  const first=await action('complete',payload,key);expect(first.statusCode,first.body).toBe(200);
  expect((await action('complete',payload,key)).json()).toEqual(first.json());expect(await db.item.count()).toBe(count);
  await runtime.processChatJobs();state=await read();expect(state.turns.at(-1).status,JSON.stringify(state.turns.at(-1))).toBe('succeeded');expect(state.turns.at(-1).output).toContain('Criados no Projeto');expect(await db.item.count()).toBe(count+3);
  const proposal=await db.planProposal.findUniqueOrThrow({where:{turnId:first.json().turn.id}});expect(proposal.status).toBe('applied');
  const items=await db.item.findMany({where:{id:{in:proposal.appliedItemIds}}});expect(items.find(i=>i.kind==='epic')?.parentId).toBe(target.id);expect(items.map(i=>i.status).sort()).toEqual(['specification','todo','todo']);
  expect((await action('complete',payload,key)).json()).toEqual(first.json());await runtime.processChatJobs();expect(await db.item.count()).toBe(count+3);
  expect((await action('complete',{...payload,expectedVersion:state.session.version})).statusCode).toBe(409);
  await action('turns',{contextId:system.id,message:'Objetivo real da entrevista isolada: ajuste adicional',expectedVersion:state.session.version});await runtime.processChatJobs();state=await read();invalid=true;
  await action('complete',{...payload,expectedVersion:state.session.version});await runtime.processChatJobs();state=await read();expect(state.turns.at(-1).status).toBe('failed');expect(await db.item.count()).toBe(count+3);
  invalid=false;
  await action('complete',{...payload,expectedVersion:state.session.version});await create('epic',target.id);const before=await db.item.count();await runtime.processChatJobs();state=await read();expect(state.turns.at(-1).error).toContain('Projeto mudou');expect(await db.item.count()).toBe(before);
  await runtime.app.close();
});



test('story execution requires G1, pins context and reconciles publication without regenerating code',async()=>{
  const system=await create('system',undefined,{key:'EXEC'}),initiative=await create('project',system.id,{key:'CODE'});
  await post(`/items/${initiative.id}/approve`,{expectedVersion:initiative.version});
  const group=await create('epic',initiative.id);await post(`/items/${group.id}/approve`,{expectedVersion:group.version});
  const repository=await db.repository.create({data:{systemId:system.id,key:'CODE',name:'Fixture',runtime:'python',state:'ready',gitlabProjectId:987}});
  await db.itemRepository.create({data:{itemId:initiative.id,repositoryId:repository.id}});
  const work=await create('story',group.id,{repositoryIds:[repository.id]});
  await db.item.update({where:{id:work.id},data:{data:{acceptanceCriteria:['O resultado é verificável.']}}});
  let generations=0,publishCalls=0,failPublish=true,alwaysInvalid=false;
  const runtime=createApp({db,demoMode:true,git:{health:async()=>true,ensureGroup:async()=>{throw Error('unused')},ensureProject:async()=>{throw Error('unused')},inspectProject:async()=>{throw Error('unused')},codeContext:async()=>({sha:'a'.repeat(40),targetBranch:'main',files:[]}),publishCode:async()=>{publishCalls++;if(failPublish)throw Error('lost ack');return {sha:'b'.repeat(40),url:'http://gitlab.test/merge_requests/1'};}},llm:{model:'fixture',models:async()=>[],complete:async messages=>{
    if(messages[0].content.includes('codificação')){
      generations++;const prompt=JSON.parse(messages.at(-1)!.content);expect(prompt.patchPolicy).toBeDefined();
      if(alwaysInvalid||generations===2)return {model:'fixture',content:JSON.stringify({summary:'Teste de travessia',files:[{path:'../outside.py',content:'x=1'}]})};
      if(generations===1)return {model:'fixture',content:JSON.stringify({summary:'Teste de duplicação',files:[{path:'src/result.py',content:'x=1'},{path:'src/result.py',content:'x=2'}]})};
      if(generations===3)expect(prompt.story.patchRepair.issues[0].code).toBe('UNSAFE_PATH');
      return {model:'fixture',content:JSON.stringify({summary:'Implementa o resultado',files:[{path:'src/result.py',content:'def result(): return True'}]})};
    }
    return {model:'fixture',content:JSON.stringify({requirements:'Resultado deve ser verificável.',architecture:'Uma função pura simples.',testCases:[{criterionIndex:0,description:'Verificar o retorno esperado.'}],risks:[]})};
  }}});
  const act=(url:string,payload:unknown,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:'/api'+url,headers:{'x-persona':persona,'idempotency-key':key},payload});
  const read=async()=>(await runtime.app.inject(`/api/items/${work.id}/execution`)).json().run;
  const key=randomUUID(),payload={expectedVersion:work.version};
  expect((await act(`/items/${work.id}/execution`,payload,randomUUID(),'carla')).statusCode).toBe(403);
  const first=await act(`/items/${work.id}/execution`,payload,key);expect(first.statusCode,first.body).toBe(200);expect((await act(`/items/${work.id}/execution`,payload,key)).json()).toEqual(first.json());
  await runtime.processExecutionJobs();let run=await read();expect(run.state).toBe('waiting_approval');expect(generations).toBe(0);
  await runtime.processExecutionJobs();expect(generations).toBe(0);
  expect((await act(`/executions/${run.id}/approve`,{expectedVersion:work.version},randomUUID(),'carla')).statusCode).toBe(403);
  expect((await act(`/executions/${run.id}/approve`,{expectedVersion:work.version})).statusCode).toBe(200);
  await runtime.processExecutionJobs();expect((await read()).stage).toBe('generation');
  await runtime.processExecutionJobs();expect((await read()).state).toBe('queued');expect((await read()).validationIssues[0].code).toBe('DUPLICATE_PATH');expect(publishCalls).toBe(0);
  await runtime.processExecutionJobs();expect((await read()).state).toBe('queued');expect((await read()).validationIssues[0].code).toBe('UNSAFE_PATH');
  await runtime.processExecutionJobs();expect((await read()).stage).toBe('publishing');expect(generations).toBe(3);
    await runtime.processExecutionJobs();run=await read();expect(run.state).toBe('failed');failPublish=false;
    const failureEvents=await db.historyEvent.findMany({where:{itemId:work.id,action:'EXECUTION_FAILED'}});
    expect(failureEvents).toHaveLength(1);expect(failureEvents[0].payload).toMatchObject({runId:run.id,stage:'publishing',metricsVersion:1});
  expect((await act(`/executions/${run.id}/retry`,{})).statusCode).toBe(200);await runtime.processExecutionJobs();run=await read();expect(run.state).toBe('succeeded');expect(run.mergeRequestUrl).toContain('/merge_requests/1');expect(generations).toBe(3);expect(publishCalls).toBe(2);
  expect((await db.item.findUniqueOrThrow({where:{id:work.id}})).status).toBe('coding');expect(await db.historyEvent.count({where:{itemId:work.id,action:'GATE_APPROVED'}})).toBe(1);
  const second=await create('story',group.id,{repositoryIds:[repository.id]});await db.item.update({where:{id:second.id},data:{data:{acceptanceCriteria:['O resultado é verificável.']}}});alwaysInvalid=true;
  await act(`/items/${second.id}/execution`,{expectedVersion:second.version});await runtime.processExecutionJobs();const other=await db.storyExecution.findFirstOrThrow({where:{storyId:second.id}});await act(`/executions/${other.id}/approve`,{expectedVersion:second.version});await runtime.processExecutionJobs();
  for(let attempt=0;attempt<3;attempt++)await runtime.processExecutionJobs();expect((await db.storyExecution.findUniqueOrThrow({where:{id:other.id}})).state).toBe('failed');expect(publishCalls).toBe(2);
  const before=generations;await runtime.processExecutionJobs();expect(generations).toBe(before);
  // Legacy failure can resume technically without another user decision or G1.
  await db.storyExecution.update({where:{id:other.id},data:{state:'waiting_input',error:'Patch contém caminho não permitido ou duplicado.'}});alwaysInvalid=false;
  expect((await act(`/executions/${other.id}/retry`,{})).statusCode).toBe(200);await runtime.processExecutionJobs();expect((await db.storyExecution.findUniqueOrThrow({where:{id:other.id}})).stage).toBe('publishing');expect(await db.historyEvent.count({where:{itemId:second.id,action:'GATE_APPROVED'}})).toBe(1);
  await act(`/executions/${other.id}/cancel`,{});
  await runtime.app.close();
});
test('execution impediment becomes a persistent discussion and confirmed capability requires a new G1',async()=>{
  const system=await create('system',undefined,{key:'DIALOG'}),project=await create('project',system.id,{key:'DECIDE'});
  await post(`/items/${project.id}/approve`,{expectedVersion:project.version});
  const epic=await create('epic',project.id);await post(`/items/${epic.id}/approve`,{expectedVersion:epic.version});
  const repository=await db.repository.create({data:{systemId:system.id,key:'DIALOG',name:'Fixture',runtime:'node',state:'ready',gitlabProjectId:988}});
  await db.itemRepository.create({data:{itemId:project.id,repositoryId:repository.id}});
  const story=await create('story',epic.id,{repositoryIds:[repository.id]});await db.item.update({where:{id:story.id},data:{data:{acceptanceCriteria:['Resultado definido pelo usuário.']}}});
  let generations=0,discussions=0,specifications=0,published=false;
  const runtime=createApp({db,demoMode:true,git:{health:async()=>true,ensureGroup:async()=>{throw Error('unused')},ensureProject:async()=>{throw Error('unused')},inspectProject:async()=>{throw Error('unused')},codeContext:async()=>({sha:'a'.repeat(40),targetBranch:'main',files:[]}),publishCode:async(_id,_run,_context,_patch,_title,permissions)=>{expect(permissions?.dependencies).toBe(true);published=true;return {sha:'b'.repeat(40),url:'http://gitlab.test/mr/decision'};}},llm:{model:'dialog-fixture',models:async()=>[],complete:async messages=>{
    let response:unknown;
    if(messages[0].content.includes('O usuário solicitou uma proposta de decisão')){expect(messages.some(m=>m.content.includes('Escolho adicionar a dependência proposta.'))).toBe(true);response={summary:'Adicionar a dependência escolhida pelo usuário.',requestedCapabilities:['dependencies'],openQuestions:[]};}
    else if(messages[0].content.includes('Discuta o impedimento')){discussions++;response={reply:'Escolha registrada, mas a fixture mantém ready false.',ready:false,summary:'Orientação disponível para revisão.',requestedCapabilities:['dependencies']};}
    else if(messages[0].content.includes('codificação')){generations++;const context=JSON.parse(messages.at(-1)!.content);response=context.capabilities.dependencies?{summary:'Implementação conforme decisão',files:[{path:'package.json',content:'{"dependencies":{"chosen-package":"1.0.0"}}'},{path:'src/result.js',content:'export const result = true;'}]}:{blocker:{reason:'Esta implementação precisa de uma dependência ainda não autorizada.',question:'Como deseja prosseguir?',options:['Discutir a dependência','Avaliar outra alternativa'],requestedCapabilities:['dependencies']}};}
    else{specifications++;if(specifications>1)expect(messages.at(-1)!.content).toContain('Adicionar a dependência escolhida pelo usuário.');response={requirements:'Requisito definido pelo usuário.',architecture:'Arquitetura sujeita ao G1.',testCases:[{criterionIndex:0,description:'Verificar o resultado definido.'}],risks:[]};}
    return {model:'dialog-fixture',content:JSON.stringify(response)};
  }}});
  const act=(path:string,payload:unknown,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:'/api'+path,headers:{'x-persona':persona,'idempotency-key':key},payload});
  const read=async()=>(await runtime.app.inject(`/api/items/${story.id}/execution`)).json().run;
  await act(`/items/${story.id}/execution`,{expectedVersion:story.version});await runtime.processExecutionJobs();let run=await read();await act(`/executions/${run.id}/approve`,{expectedVersion:story.version});
  await runtime.processExecutionJobs();await runtime.processExecutionJobs();run=await read();expect(run.state).toBe('waiting_input');expect(run.error).toContain('ainda não autorizada');expect(published).toBe(false);
  const discussion=async()=>(await runtime.app.inject(`/api/executions/${run.id}/discussion`)).json();let state=await discussion();expect(state.messages[0].content).toContain('Como deseja prosseguir');
  expect((await act(`/executions/${run.id}/messages`,{expectedVersion:state.version,message:'Pergunta'},randomUUID(),'carla')).statusCode).toBe(403);
  const key=randomUUID(),message={expectedVersion:state.version,message:'Quais informações faltam?'};
  const first=await act(`/executions/${run.id}/messages`,message,key);expect(first.statusCode,first.body).toBe(200);expect((await act(`/executions/${run.id}/messages`,message,key)).json()).toEqual(first.json());
  await runtime.processExecutionJobs();state=await discussion();expect(state.proposal.ready).toBe(false);expect(generations).toBe(1);
  expect((await act(`/executions/${run.id}/resolve`,{expectedVersion:state.version,confirmed:true,allowDependencies:true})).statusCode).toBe(409);
  await act(`/executions/${run.id}/messages`,{expectedVersion:state.version,message:'Escolho adicionar a dependência proposta.'});await runtime.processExecutionJobs();state=await discussion();expect(state.proposal.ready).toBe(false);
  const prepareKey=randomUUID(),prepareBody={expectedVersion:state.version,intent:'prepare_decision'};
  const prepared=await act(`/executions/${run.id}/messages`,prepareBody,prepareKey);expect(prepared.statusCode,prepared.body).toBe(200);expect((await act(`/executions/${run.id}/messages`,prepareBody,prepareKey)).json()).toEqual(prepared.json());
  await runtime.processExecutionJobs();state=await discussion();expect(state.proposal.ready).toBe(true);expect(generations).toBe(1);
  expect((await act(`/executions/${run.id}/resolve`,{expectedVersion:state.version,confirmed:true,allowDependencies:false})).statusCode).toBe(409);
  expect((await act(`/executions/${run.id}/resolve`,{expectedVersion:state.version,confirmed:false,allowDependencies:true})).statusCode).toBe(422);
  const resolveKey=randomUUID(),decision={expectedVersion:state.version,confirmed:true,allowDependencies:true};const receipt=await act(`/executions/${run.id}/resolve`,decision,resolveKey);expect(receipt.statusCode,receipt.body).toBe(200);expect((await act(`/executions/${run.id}/resolve`,decision,resolveKey)).json()).toEqual(receipt.json());
  await runtime.processExecutionJobs();run=await read();expect(run.state).toBe('waiting_approval');expect(generations).toBe(1);expect(published).toBe(false);
  const updated=await db.item.findUniqueOrThrow({where:{id:story.id}});expect(updated.status).toBe('specification');await act(`/executions/${run.id}/approve`,{expectedVersion:updated.version});
  for(let step=0;step<3;step++)await runtime.processExecutionJobs();expect((await read()).state).toBe('succeeded');expect(published).toBe(true);expect(generations).toBe(2);expect(specifications).toBe(2);
  expect(await db.historyEvent.count({where:{itemId:story.id,action:'EXECUTION_DECISION_CONFIRMED'}})).toBe(1);expect(await db.historyEvent.count({where:{itemId:story.id,action:'GATE_APPROVED'}})).toBe(2);
  expect((await discussion()).messages).toHaveLength(8);
  await runtime.app.close();
});

test('dashboard combines user, system and project scopes without leaking other work or narrowing options',async()=>{
  const a=await create('system',undefined,{key:'FILTERA'});
  const bResponse=await post('/items',{kind:'system',key:'FILTERB',name:'Sistema de outra pessoa'},'ana');
  expect(bResponse.statusCode).toBe(200);const b=bResponse.json().item;
  const p=await create('project',a.id,{key:'SCOPEA'});
  const qResponse=await post('/items',{kind:'project',parentId:b.id,key:'SCOPEB',name:'Outro projeto'},'ana');
  expect(qResponse.statusCode).toBe(200);const q=qResponse.json().item;
  const e=await create('epic',p.id),s=await create('story',e.id);
  await db.historyEvent.create({data:{itemId:s.id,ancestorIds:[a.id,p.id,e.id],actorId:'agent:execution',actorName:'Agente',actorType:'agent',action:'PATCH_VALIDATION_REJECTED',message:'Fixture técnica',payload:{runId:'filter-run'}}});
  const get=async(query:string)=>(await app.inject('/api/metrics/dashboard?'+query)).json();
  const selected=await get(`systemId=${a.id}&projectId=${p.id}&userId=admin`);
  expect(selected.inventory.map((i:{total:number})=>i.total)).toEqual([1,1,1,1,0]);
  expect(selected.weeks.at(-1).metrics.find((m:{key:string})=>m.key==='loops').value).toBe(1);
  expect(selected.filterOptions.systems.some((i:{id:string})=>i.id===b.id)).toBe(true);
  expect(selected.filterOptions.projects.some((i:{id:string})=>i.id===q.id)).toBe(true);
  const empty=await get(`systemId=${b.id}&userId=admin`);
  expect(empty.inventory.every((i:{total:number})=>i.total===0)).toBe(true);
  expect(empty.weeks.every((w:{metrics:{key:string;value:number}[]})=>w.metrics.find(m=>m.key==='loops')!.value===0)).toBe(true);
  const other=await get(`projectId=${q.id}&userId=ana`);
  expect(other.inventory.map((i:{total:number})=>i.total)).toEqual([1,1,0,0,0]);
  expect((await app.inject(`/api/metrics/dashboard?systemId=${a.id}&projectId=${q.id}`)).statusCode).toBe(400);
  expect((await app.inject('/api/metrics/dashboard?userId=does-not-exist')).statusCode).toBe(400);
  expect((await app.inject('/api/metrics/dashboard?systemId=')).statusCode).toBe(422);
});
