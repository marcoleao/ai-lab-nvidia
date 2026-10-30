import {reviewedGateBody} from './reviewed-gate';
import {repositoryFixture} from './repository-fixture';
import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {planSchema} from '../apps/api/src/plan-schema.ts';
import {ensurePipelineTasks,pipelineStageOf,pipelineTasks} from '../apps/api/src/pipeline-tasks.ts';
import {ensureActivity,workLinksVersion} from '../apps/api/src/work-activities.ts';
import type {AssistantHelpers} from '../apps/api/src/assistant.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';

const plan=(tasks:unknown[]=[])=>({summary:'Entrega com planejamento explícito.',epics:[{title:'Consulta',description:'Disponibilizar consulta.',stories:[{title:'Consultar situação',description:'Mostrar a situação solicitada e permitir nova consulta.',acceptanceCriteria:['Retornar a situação correspondente ao identificador informado.'],repositoryIds:[],tasks}]}]});
test('the proposal describes pipeline stages once and automatically accounts for all six Tasks',()=>{
 expect(planSchema.parse(plan()).epics[0].stories[0].tasks).toEqual([]);
 expect(planSchema.parse(plan([{title:'Codificação',description:'Implementar a consulta.',pipelineStage:'coding',repositoryIds:[]}])).epics[0].stories[0].tasks[0].pipelineStage).toBe('coding');
 expect(planSchema.safeParse(plan([{title:'Código 1',description:'Primeira',pipelineStage:'coding'},{title:'Código 2',description:'Segunda',pipelineStage:'coding'}])).success).toBe(false);
 const tooMany=plan(Array.from({length:3},(_,index)=>({title:`Trabalho adicional ${index}`,description:'Detalhamento humano.'})));tooMany.epics[0].stories=Array.from({length:3},()=>structuredClone(tooMany.epics[0].stories[0]));
 expect(planSchema.safeParse(tooMany).success).toBe(false);
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('planned pipeline Tasks',()=>{
 const db=database(process.env.TEST_DATABASE_URL!),runtime=createApp({db,demoMode:true});
 const headers=(key=randomUUID())=>({'x-persona':'admin','idempotency-key':key});
 const create=async(payload:unknown,key=randomUUID())=>{
  const response=await runtime.app.inject({method:'POST',url:'/api/items',headers:headers(key),payload});
  expect(response.statusCode,response.body).toBe(200);return response.json().item;
 };
 const freshKey=()=>randomUUID().replaceAll('-','').slice(0,6).split('').map(char=>'ABCDEFGHIJKLMNOP'[parseInt(char,16)]).join('');
 async function fixture(){
  const system=await create({kind:'system',key:freshKey(),name:'Sistema isolado'});
  const project=await create({kind:'project',key:freshKey(),name:'Projeto isolado',parentId:system.id});
  const epic=await create({kind:'epic',name:'Épico isolado',parentId:project.id});
  return {system,project,epic};
 }
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 test('manual creation creates the six fixed Tasks once without starting an executor',async()=>{
  const f=await fixture(),payload={kind:'story',name:'História manual',parentId:f.epic.id},key=randomUUID();
  const story=await create(payload,key),replayed=await create(payload,key);
  expect(replayed.id).toBe(story.id);expect(story.status).toBe('specification');expect(story.data.creationOrigin).toBe('manual');
  const tasks=await db.item.findMany({where:{parentId:story.id},orderBy:{createdAt:'asc'}});
  expect(tasks).toHaveLength(6);expect(new Set(tasks.map(pipelineStageOf))).toEqual(new Set(pipelineTasks.map(task=>task.stage)));
  expect(tasks.map(task=>task.name).sort()).toEqual(pipelineTasks.map(task=>task.name).sort());
  expect(tasks.every(task=>task.status==='todo'&&(task.data as any).creationOrigin==='pipeline')).toBe(true);
  expect(await db.storyExecution.count({where:{storyId:story.id}})).toBe(0);
  expect(await db.workAttempt.count({where:{activity:{storyId:story.id}}})).toBe(0);
 });
 test('execution activity reuses Codificação and G1 has no seventh Task',async()=>{
  const f=await fixture(),story=await create({kind:'story',name:'Planejamento de execução',parentId:f.epic.id});
  const repo=await repositoryFixture(db,{data:{systemId:f.system.id,key:randomUUID(),name:'Componente isolado',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)}});
  await db.itemRepository.create({data:{itemId:story.id,repositoryId:repo.id}});
  const response=await runtime.app.inject({method:'POST',url:`/api/items/${story.id}/work-links`,headers:headers(),payload:{expectedVersion:story.version,expectedLinksVersion:workLinksVersion([]),links:[]}});
  expect(response.statusCode,response.body).toBe(200);
  const coding=await db.workActivity.findUniqueOrThrow({where:{id:response.json().activityId}}),task=await db.item.findUniqueOrThrow({where:{id:coding.taskId!}});
  expect(pipelineStageOf(task)).toBe('coding');
  const h={live:async(tx:any,id:string)=>tx.item.findUniqueOrThrow({where:{id}}),ensureNotArchived:async()=>{},createItem:async()=>{throw Error('No additional Task may be created');}} as unknown as AssistantHelpers;
  const spec=await db.$transaction(tx=>ensureActivity(tx,h,{storyId:story.id,repositoryId:repo.id,kind:'specification',person:{id:'admin',name:'Admin'}}));
  expect(spec.taskId).toBeNull();expect(await db.item.count({where:{parentId:story.id}})).toBe(6);
  const remove=await runtime.app.inject({method:'DELETE',url:`/api/items/${task.id}`,headers:headers(),payload:{expectedVersion:task.version}});
  expect(remove.statusCode).toBe(409);
 });
 test('failure during default creation rolls back the Story and its partially created Tasks',async()=>{
  const f=await fixture(),before=await db.item.count(),storyId=randomUUID();
  await expect(db.$transaction(async tx=>{
   const story=await tx.item.create({data:{id:storyId,key:randomUUID(),kind:'story',parentId:f.epic.id,parentKind:'epic',name:'Rollback isolado',status:'specification'}});
   let calls=0;
   const createTask=(async(_tx:any,_person:any,body:any,provenance:any)=>{
    if(++calls===3)throw Error('isolated injected creation failure');
    return tx.item.create({data:{kind:'task',parentId:story.id,parentKind:'story',key:randomUUID(),name:body.name,description:body.description,status:'todo',data:provenance}});
   }) as AssistantHelpers['createItem'];
   await ensurePipelineTasks(tx,story,{id:'admin',name:'Admin'},createTask);
  })).rejects.toThrow('isolated injected creation failure');
  expect(await db.item.count()).toBe(before);expect(await db.item.findUnique({where:{id:storyId}})).toBeNull();
 });
 test('an agent plan details the existing pipeline Task and keeps its provenance without duplicates',async()=>{
  const f=await fixture(),content=plan([{title:'Codificação',description:'Implementar a consulta e registrar o commit e o MR da revisão.',pipelineStage:'coding',repositoryIds:[]}]);
  const agent=createApp({db,demoMode:true,llm:{model:'isolated-planning',models:async()=>['isolated-planning'],complete:async messages=>({model:'isolated-planning',content:messages[0].content.startsWith('Gere somente')?JSON.stringify(content):'Objetivo e critérios registrados para revisão.'})}});
  try{
   const post=(path:string,payload:unknown,key=randomUUID())=>agent.app.inject({method:'POST',url:`/api/assistant/${path}`,headers:headers(key),payload});
   let response=await post('turns',{contextId:f.project.id,expectedVersion:0,message:'Quero consultar uma situação pelo identificador.'});expect(response.statusCode,response.body).toBe(200);await agent.processChatJobs();
   const read=async()=> (await agent.app.inject(`/api/assistant?contextId=${f.project.id}`)).json();
   let view=await read();response=await post('plans',{contextId:f.project.id,expectedVersion:view.session.version});expect(response.statusCode,response.body).toBe(200);await agent.processChatJobs();
   view=await read();let proposal=view.proposals[0];
   const revised=structuredClone(content);revised.epics[0].stories[0].description='Detalhamento revisado pela pessoa responsável, preservando os critérios e o escopo confirmado.';
   const edited=await agent.app.inject({method:'PATCH',url:`/api/assistant/plans/${proposal.id}`,headers:{'x-persona':'ana','idempotency-key':randomUUID()},payload:{expectedVersion:proposal.version,content:revised}});expect(edited.statusCode,edited.body).toBe(200);proposal=edited.json().proposal;
   const key=randomUUID(),body={expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true};
   const applied=await post(`plans/${proposal.id}/apply`,body,key);expect(applied.statusCode,applied.body).toBe(200);
   expect(applied.json().creationReceipt).toMatchObject({totals:{epics:1,stories:1,tasks:6,total:8},coverage:{expected:8,available:8,complete:true}});
   expect(applied.json().creationReceipt.itemIds).toEqual(applied.json().itemIds);
   expect(applied.json().proposal.project).toEqual({id:f.project.id,key:f.project.key,name:f.project.name});
   expect((await post(`plans/${proposal.id}/apply`,body,key)).json()).toEqual(applied.json());
   const confirmed=await read();expect(confirmed.currentProposal).toMatchObject({id:proposal.id,status:'applied',creationReceipt:applied.json().creationReceipt});
   const story=await db.item.findFirstOrThrow({where:{id:{in:applied.json().itemIds},kind:'story'}}),tasks=await db.item.findMany({where:{parentId:story.id}});
   expect((story.data as any).creationOrigin).toBe('assistant');expect(tasks).toHaveLength(6);
   const coding=tasks.find(task=>pipelineStageOf(task)==='coding')!;
   expect(coding.description).toBe('Implementar a consulta e registrar o commit e o MR da revisão.');
   expect((coding.data as any).creationOrigin).toBe('pipeline');expect(await db.storySpecificationRevision.count({where:{storyId:story.id}})).toBe(1);
   const revision=await db.storySpecificationRevision.findFirstOrThrow({where:{storyId:story.id}});expect(revision).toMatchObject({source:'human',actorId:'ana'});
   const event=await db.historyEvent.findFirstOrThrow({where:{itemId:story.id,action:'STORY_SPECIFICATION_APPLIED'}});expect((event.audit as any).initiator.id).toBe('admin');expect((event.audit as any).executor.id).toBe('admin');
   expect(await db.storyExecution.count({where:{storyId:story.id}})).toBe(0);
  }finally{await agent.app.close();}
 });
 test('reopening requires a new G1 and only the explicitly started coding Task is reopened',async()=>{
  const f=await fixture(),story=await create({kind:'story',name:'Retomada explícita de codificação',parentId:f.epic.id});
  const git={health:async()=>true,codeContext:async()=>({sha:'b'.repeat(40),targetBranch:'main',files:[{path:'app.js',content:'export const answer=0;'}]}),publishCode:async()=>({sha:'c'.repeat(40),url:'http://gitlab/test/-/merge_requests/1'})} as GitProvider;
  const execution=createApp({db,demoMode:true,git,llm:{model:'isolated',models:async()=>['isolated'],complete:async()=>{throw Error('Generation is not part of this scope-start test');}}});
  const command=async(path:string,payload:unknown,method:'POST'|'PUT'='POST')=>{const response=await execution.app.inject({method,url:`/api${path}`,headers:headers(),payload:await reviewedGateBody(execution.app,path,payload,randomUUID())});expect(response.statusCode,response.body).toBe(200);return response.json();};
  try{
   const cancelled=await command(`/items/${story.id}/cancel`,{expectedVersion:story.version});
   expect(await db.item.count({where:{parentId:story.id,status:'cancelled'}})).toBe(6);
   const reopened=await command(`/items/${story.id}/reopen`,{expectedVersion:cancelled.item.version,comment:'Retomar a entrega com revisão explícita do planejamento.'});
   expect(await db.item.count({where:{parentId:story.id,status:'cancelled'}})).toBe(6);
   const repository=await repositoryFixture(db,{data:{systemId:f.system.id,key:randomUUID(),name:'Componente da retomada',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)+100}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repository.id}});
   const content={requirements:{objective:'Consultar a situação de uma solicitação.',behavior:'Receber o identificador e mostrar a situação correspondente.',functionalCriteria:['Uma solicitação existente apresenta sua situação.']},technical:{requirements:'Validar a entrada e consultar a situação correspondente.',architecture:'Uma função de consulta mantém o contrato existente.',testCases:[{criterionIndex:0,description:'Uma entrada válida apresenta a situação correspondente.'}],risks:[]}};
   const draft=await command(`/items/${story.id}/specification/draft`,{expectedDraftVersion:0,content},'PUT');
   await command(`/items/${story.id}/specification/apply`,{expectedDraftVersion:draft.draft.version,expectedVersion:reopened.item.version,confirmed:true});
   const current=await db.item.findUniqueOrThrow({where:{id:story.id}}),prepared=await command(`/items/${story.id}/execution`,{expectedVersion:current.version});
   const view=(await execution.app.inject({method:'GET',url:`/api/items/${story.id}/journey`,headers:{'x-persona':'admin'}})).json();
   expect(view.nextAction).toMatchObject({id:'approve',enabled:true});
   await command(`/executions/${prepared.runId}/approve`,{expectedVersion:current.version});await execution.processExecutionJobs();
   const tasks=await db.item.findMany({where:{parentId:story.id}}),coding=tasks.find(task=>pipelineStageOf(task)==='coding')!;
   expect(coding.status).toBe('doing');expect(tasks.filter(task=>task.id!==coding.id).every(task=>task.status==='cancelled')).toBe(true);
   const activity=await db.workActivity.findFirstOrThrow({where:{storyId:story.id,kind:'coding'}});
   expect(await db.workEvent.count({where:{attemptId:activity.currentAttemptId!,kind:'reopened'}})).toBe(1);
   const audit=await db.historyEvent.findFirstOrThrow({where:{itemId:coding.id,action:'WORK_TASK_STATUS_CHANGED'},orderBy:{timestamp:'desc'}});
   expect((audit.audit as any).changes).toContainEqual({field:'status',before:{kind:'value',value:'cancelled'},after:{kind:'value',value:'doing'}});
  }finally{await execution.app.close();}
 });
 test('pipeline inherits the System repository and queued coding freezes content while titles preserve G1',async()=>{
  const f=await fixture(),story=await create({kind:'story',name:'Escopo planejado e execução protegida',parentId:f.epic.id});
  const tasks=await db.item.findMany({where:{parentId:story.id}}),coding=tasks.find(task=>pipelineStageOf(task)==='coding')!;
  const repository=await repositoryFixture(db,{data:{systemId:f.system.id,key:randomUUID(),name:'Repositório único do Sistema',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)+100}});
  const git={codeContext:async()=>({sha:'b'.repeat(40),targetBranch:'main',files:[]}),publishCode:async()=>({sha:'c'.repeat(40),url:'http://gitlab/test/-/merge_requests/80'})} as unknown as GitProvider;
  const execution=createApp({db,demoMode:true,git,llm:{model:'isolated',models:async()=>['isolated'],complete:async()=>{throw Error('No worker or model runs in this queued-scope test');}}});
  const command=async(path:string,payload:unknown,method:'POST'|'PUT'|'PATCH'='POST')=>{const response=await execution.app.inject({method,url:`/api${path}`,headers:headers(),payload:await reviewedGateBody(execution.app,path,payload,randomUUID())});expect(response.statusCode,response.body).toBe(200);return response.json();};
  try{
   const selected={item:story},cleared={item:coding};
   const inherited=(await execution.app.inject('/api/items/'+story.id)).json();
   expect(inherited.repositories.map((value:{id:string})=>value.id)).toEqual([repository.id]);
   expect(await db.itemRepository.count({where:{itemId:{in:[story.id,coding.id]}}})).toBe(0);
   const content={requirements:{objective:'Consultar a situação de uma solicitação.',behavior:'Receber o identificador e apresentar sua situação.',functionalCriteria:['Uma solicitação existente apresenta sua situação.']},technical:{requirements:'Validar o identificador e consultar a situação correspondente.',architecture:'Uma função mantém o contrato de consulta estabelecido.',testCases:[{criterionIndex:0,description:'Uma entrada conhecida apresenta a situação correspondente.'}],risks:[]}};
   const draft=await command(`/items/${story.id}/specification/draft`,{expectedDraftVersion:0,content},'PUT');
   const applied=await command(`/items/${story.id}/specification/apply`,{expectedDraftVersion:draft.draft.version,expectedVersion:selected.item.version,confirmed:true});
   const current=await db.item.findUniqueOrThrow({where:{id:story.id}}),prepared=await command(`/items/${story.id}/execution`,{expectedVersion:current.version});
   await command(`/executions/${prepared.runId}/approve`,{expectedVersion:current.version});
   const approved=await db.storyExecution.findUniqueOrThrow({where:{id:prepared.runId}});expect(approved).toMatchObject({state:'queued',stage:'context',repositoryId:repository.id});
   const changedScope=await execution.app.inject({method:'PATCH',url:`/api/items/${coding.id}`,headers:headers(),payload:{expectedVersion:cleared.item.version,name:coding.name,description:'Alterar o contrato funcional enquanto o executor está na fila.'}});
   expect(changedScope.statusCode,changedScope.body).toBe(409);expect(changedScope.json().error.code).toBe('TASK_SCOPE_BUSY');
   expect(await db.item.findUniqueOrThrow({where:{id:coding.id}})).toMatchObject({description:coding.description,version:cleared.item.version});
   const repositoryChange=await execution.app.inject({method:'PATCH',url:`/api/items/${coding.id}/repositories`,headers:headers(),payload:{expectedVersion:cleared.item.version,repositoryIds:[repository.id]}});
   expect(repositoryChange.statusCode,repositoryChange.body).toBe(409);expect(repositoryChange.json().error.code).toBe('SYSTEM_REPOSITORY_INHERITED');
   expect(await db.itemRepository.count({where:{itemId:coding.id}})).toBe(0);
   const renamed=await command(`/items/${coding.id}`,{expectedVersion:cleared.item.version,name:'Codificação do contrato de consulta',description:coding.description},'PATCH');
   expect(renamed.item.name).toBe('Codificação do contrato de consulta');
   expect((await db.storyExecution.findUniqueOrThrow({where:{id:prepared.runId}})).snapshot).toEqual(approved.snapshot);
   const journey=await execution.app.inject({method:'GET',url:`/api/items/${story.id}/journey`,headers:{'x-persona':'admin'}});expect(journey.statusCode,journey.body).toBe(200);
   expect(journey.json().current).toMatchObject({state:'queued',kind:'coding',taskId:coding.id});expect(journey.json().run.id).toBe(prepared.runId);
   expect(applied.revision.id).toBe((approved.snapshot as any).specificationRevisionId);
  }finally{await execution.app.close();}
 });
 test('an explicit legacy replan adopts the existing coding Task and preserves its historical attempts',async()=>{
  const f=await fixture(),technical={requirements:'Validar a entrada e retornar a situação correspondente.',architecture:'Uma função de consulta mantém o contrato estabelecido.',testCases:[{criterionIndex:0,description:'Uma entrada conhecida apresenta a situação correspondente.'}],risks:[]};
  const story=await db.item.create({data:{kind:'story',key:randomUUID(),name:'Entrega legada observada',description:'Consultar a situação de uma solicitação pelo identificador.',status:'coding',parentId:f.epic.id,parentKind:'epic',data:{requirements:{objective:'Consultar uma solicitação pelo identificador.',behavior:'Informar o identificador e apresentar sua situação.',functionalCriteria:['Uma solicitação existente apresenta sua situação.']},acceptanceCriteria:['Uma solicitação existente apresenta sua situação.'],technicalPlan:technical}}});
  const repository=await repositoryFixture(db,{data:{systemId:f.system.id,key:randomUUID(),name:'Componente legado isolado',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)+100}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repository.id}});
  const task=await db.item.create({data:{kind:'task',parentId:story.id,parentKind:'story',key:randomUUID(),name:'Codificar e publicar a revisão legada',description:'Preservar este detalhamento de codificação já planejado.',status:'done',data:{workProcess:true,result:{summary:'Resultado observado da tentativa anterior.'}}}});
  const prior=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:{scopeRevision:1},mergeRequestUrl:'http://gitlab/test/-/merge_requests/70',actorId:'admin',actorName:'Admin'}});
  const activity=await db.workActivity.create({data:{storyId:story.id,repositoryId:repository.id,kind:'coding',scopeKey:`${story.id}:${repository.id}:coding`,taskId:task.id}}),attempt=await db.workAttempt.create({data:{activityId:activity.id,sourceType:'execution',sourceId:prior.id,sourceKey:randomUUID(),state:'succeeded',summary:'Tentativa histórica preservada.',actorId:'ana',actorName:'Ana'}});await db.workActivity.update({where:{id:activity.id},data:{currentAttemptId:attempt.id}});
  const git={codeContext:async()=>({sha:'b'.repeat(40),targetBranch:'main',files:[]}),publishCode:async()=>({sha:'c'.repeat(40),url:'http://gitlab/test/-/merge_requests/71'})} as unknown as GitProvider;
  const execution=createApp({db,demoMode:true,git,llm:{model:'isolated',models:async()=>['isolated'],complete:async()=>{throw Error('No model call before coding starts');}}});
  try{
   const response=await execution.app.inject({method:'POST',url:`/api/executions/${prior.id}/replan`,headers:headers(),payload:{expectedVersion:story.version,confirmed:true}});expect(response.statusCode,response.body).toBe(200);
   const children=await db.item.findMany({where:{parentId:story.id}}),adopted=children.find(candidate=>candidate.id===task.id)!;
   expect(children).toHaveLength(6);expect(pipelineStageOf(adopted)).toBe('coding');expect(adopted).toMatchObject({name:task.name,description:task.description,status:'done'});expect((adopted.data as any).result).toEqual((task.data as any).result);expect((adopted.data as any).creationOrigin).toBeUndefined();
   expect(await db.workActivity.findUniqueOrThrow({where:{id:activity.id}})).toMatchObject({taskId:task.id,currentAttemptId:attempt.id});expect(await db.workAttempt.findUniqueOrThrow({where:{id:attempt.id}})).toEqual(attempt);
   expect((await db.storyExecution.findUniqueOrThrow({where:{id:prior.id}})).mergeRequestUrl).toBe(prior.mergeRequestUrl);
   const adoptedEvent=await db.historyEvent.findFirstOrThrow({where:{itemId:task.id,action:'PIPELINE_TASK_ADOPTED'}});expect((adoptedEvent.audit as any).initiator.id).toBe('admin');expect((adoptedEvent.audit as any).changes).toContainEqual({field:'pipelineStage',before:{kind:'absent'},after:{kind:'value',value:'coding'}});expect(await db.historyEvent.count({where:{itemId:task.id,action:'ITEM_CREATED'}})).toBe(0);
   const conflicting=await db.item.create({data:{kind:'task',parentId:story.id,parentKind:'story',key:randomUUID(),name:'Outra tarefa técnica histórica',status:'done',data:{workProcess:true}}});await db.workActivity.create({data:{storyId:story.id,repositoryId:repository.id,kind:'coding',scopeKey:randomUUID(),taskId:conflicting.id}});
   const nextStory=await db.item.findUniqueOrThrow({where:{id:story.id}}),conflict=await execution.app.inject({method:'POST',url:`/api/items/${story.id}/work-links`,headers:headers(),payload:{expectedVersion:nextStory.version,expectedLinksVersion:workLinksVersion([]),links:[]}});
   expect(conflict.statusCode,conflict.body).toBe(409);expect(conflict.json().error.code).toBe('PIPELINE_TASK_MIGRATION_REVIEW');expect((await db.workActivity.findUniqueOrThrow({where:{id:activity.id}})).taskId).toBe(task.id);expect(pipelineStageOf(await db.item.findUniqueOrThrow({where:{id:conflicting.id}}))).toBeNull();
  }finally{await execution.app.close();}
 });
});
