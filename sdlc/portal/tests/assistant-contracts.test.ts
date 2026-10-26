import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {materializedPlanCounts,pipelineStages,planLimits} from '../packages/shared/src/pipeline-plan.ts';
import {planSchema} from '../apps/api/src/plan-schema.ts';
import type {Item} from '../packages/db/generated/client.ts';

test('the browser-safe count matches the schema for fixed stages, extra Tasks and the item limit',()=>{
 const story={title:'Consultar situação',description:'Retornar a situação solicitada.',acceptanceCriteria:['Apresentar a situação correspondente.'],repositoryIds:[],tasks:[] as {title:string;description:string;pipelineStage?:typeof pipelineStages[number]}[]};
 const plan={summary:'Planejamento para revisão.',epics:[{title:'Consulta',description:'Permitir consulta.',stories:[story]}]};
 expect(materializedPlanCounts(plan)).toEqual({epics:1,stories:1,tasks:6,pipelineTasks:6,additionalTasks:0,total:8});
 story.tasks=pipelineStages.map(pipelineStage=>({title:pipelineStage,description:'Detalhar a etapa existente.',pipelineStage}));
 expect(materializedPlanCounts(plan).total).toBe(8);
 story.tasks.push({title:'Revisão humana adicional',description:'Registrar uma decisão de negócio.'});
 expect(materializedPlanCounts(plan)).toMatchObject({tasks:7,additionalTasks:1,total:9});
 plan.epics[0].stories=Array.from({length:3},()=>structuredClone(story));
 expect(materializedPlanCounts(plan).total).toBe(25);expect(planSchema.safeParse(plan).success).toBe(true);
 plan.epics[0].stories[0].tasks.push(...Array.from({length:5},(_,index)=>({title:'Adicional '+index,description:'Registrar o trabalho.'})));
 expect(materializedPlanCounts(plan).total).toBe(planLimits.maxItems);expect(planSchema.safeParse(plan).success).toBe(true);
 plan.epics[0].stories[1].tasks.push({title:'Excede o limite',description:'Não materializar esta proposta.'});
 expect(materializedPlanCounts(plan).total).toBe(planLimits.maxItems+1);expect(planSchema.safeParse(plan).success).toBe(false);
});

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw new Error('Assistant contract tests require the disposable portal_test database');

describe.skipIf(!url)('Assistant current state and confirmed receipts in an isolated database',()=>{
 const db=database(url!),runtime=createApp({db,demoMode:true,llm:{model:'isolated-contract',models:async()=>['isolated-contract'],complete:async()=>{throw Error('This read-only contract test never runs an inference worker');}}});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 async function fixture(){
  const prefix='assistant-contract-'+randomUUID();
  const system=await db.item.create({data:{key:prefix,name:'Sistema isolado',kind:'system',status:'active'}});
  const project=await db.item.create({data:{key:prefix+'-P',name:'Projeto isolado',kind:'project',status:'active',projectLifecycle:'active',parentId:system.id,parentKind:'system'}});
  const epic=await db.item.create({data:{key:prefix+'-E',name:'Épico isolado',kind:'epic',status:'active',parentId:project.id,parentKind:'project'}});
  const story=await db.item.create({data:{key:prefix+'-S',name:'História isolada',kind:'story',status:'specification',parentId:epic.id,parentKind:'epic'}});
  const task=await db.item.create({data:{key:prefix+'-T',name:'Tarefa isolada',kind:'task',status:'todo',parentId:story.id,parentKind:'story'}});
  return {system,project,epic,story,task};
 }
 async function interview(context:Item){
  const session=await db.chatSession.create({data:{contextId:context.id,version:3,nextTurn:2}});
  const turn=await db.chatTurn.create({data:{sessionId:session.id,sequence:1,status:'succeeded',input:'Objetivo registrado.',output:'Entrevista para revisão.',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:context.id}}});
  return {session,turn};
 }
 async function get(contextId:string,persona?:string,query=''){
  const response=await runtime.app.inject({method:'GET',url:`/api/assistant?contextId=${contextId}${query}`,headers:persona?{'x-persona':persona}:{}});
  expect(response.statusCode,response.body).toBe(200);return response.json();
 }
 async function snapshot(){
  return {items:await db.item.findMany({select:{id:true,version:true,status:true,archived:true},orderBy:{id:'asc'}}),sessions:await db.chatSession.findMany({orderBy:{id:'asc'}}),turns:await db.chatTurn.count(),proposals:await db.planProposal.count(),events:await db.historyEvent.count(),requests:await db.requestKey.count()};
 }
 test('current proposal and current permissions do not follow the historical page and GET does not write',async()=>{
  const f=await fixture(),{session}=await interview(f.project),proposals=[];
  for(let sequence=2;sequence<=24;sequence++){
   const turn=await db.chatTurn.create({data:{sessionId:session.id,sequence,kind:'plan',status:'succeeded',input:'Proposta histórica',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:f.project.id}}});
   proposals.push(await db.planProposal.create({data:{turnId:turn.id,projectId:f.project.id,projectVersion:1,sessionVersion:3,contextFingerprint:'isolated-legacy',status:'applied',content:{summary:'Proposta '+sequence,epics:[]},createdAt:new Date(Date.UTC(2026,9,23,12,0,sequence))}}));
  }
  const before=await snapshot(),first=await get(f.project.id,'bruno'),second=await get(f.project.id,'bruno','&page=2&proposalsPage=2');
  expect(first.latestTurn).toMatchObject({id:proposals.at(-1)!.turnId,kind:'plan',status:'succeeded'});
  expect(second.latestTurn).toEqual(first.latestTurn);expect(second.turns.some((turn:any)=>turn.id===second.latestTurn.id)).toBe(false);
  expect(first.currentProposal.id).toBe(proposals.at(-1)!.id);expect(second.currentProposal.id).toBe(first.currentProposal.id);
  expect(second.proposals).toHaveLength(3);expect(second.proposals[0].id).not.toBe(second.currentProposal.id);
  expect(second.capabilities).toMatchObject({canMessage:true,canGeneratePlan:true,canEditPlan:true,canApplyPlan:true});
  expect(second.currentProposal.creationReceipt).toBeNull();
  expect(await snapshot()).toEqual(before);
 });
 test('declared Admin, Product Owner and Architect see their real permissions while absent and consultation personas gain no commands',async()=>{
  const f=await fixture();await interview(f.project);
  for(const persona of ['admin','ana','bruno'])expect((await get(f.project.id,persona)).capabilities).toMatchObject({canMessage:true,canGeneratePlan:true,canComplete:true,canEditPlan:true,canApplyPlan:true,canCancelTurn:false});
  for(const persona of [undefined,'unknown','carla'])expect(Object.values((await get(f.project.id,persona)).capabilities).every(value=>value===false)).toBe(true);
  expect((await get(f.system.id,'bruno')).capabilities.canCreateProject).toBe(true);
 });
 test('a paused turn stays visible outside history and blocks all new generations after reactivation until explicitly resumed or cancelled',async()=>{
  const f=await fixture(),{session}=await interview(f.project);
  const paused=await db.chatTurn.create({data:{sessionId:session.id,sequence:2,status:'paused',input:'Pedido pausado',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:f.project.id}}});
  await db.item.update({where:{id:f.system.id},data:{status:'inactive'}});
  const blocked=await get(f.project.id,'bruno','&page=99');
  expect(blocked).toMatchObject({readOnly:true,hierarchy:{writable:false,code:'HIERARCHY_INACTIVE',blockedBy:f.system.id},blockedBy:{id:f.system.id,kind:'system',lifecycle:'inactive'},activeTurn:{id:paused.id,status:'paused'},capabilities:{canMessage:false,canGeneratePlan:false,canComplete:false,canCancelTurn:false}});
  expect(blocked.readOnlyReason).toBe(blocked.hierarchy.reason);
  await db.item.update({where:{id:f.system.id},data:{status:'active'}});
  const reactivated=await get(f.project.id,'bruno');
  expect(reactivated).toMatchObject({readOnly:false,activeTurn:{id:paused.id,status:'paused'},capabilities:{canMessage:false,canGeneratePlan:false,canComplete:false,canCancelTurn:true}});
  const before=await db.chatTurn.count({where:{sessionId:session.id}});
  for(const path of ['plans','complete']){
   const payload={contextId:f.project.id,expectedVersion:session.version,...(path==='complete'?{projectId:f.project.id,confirmed:true}:{})};
   const denied=await runtime.app.inject({method:'POST',url:'/api/assistant/'+path,headers:{'x-persona':'bruno','idempotency-key':randomUUID()},payload});
   expect(denied.statusCode,denied.body).toBe(409);expect(denied.json().error.code).toBe('CHAT_BUSY');
  }
  expect(await db.chatTurn.count({where:{sessionId:session.id}})).toBe(before);
  expect((await db.chatTurn.findUniqueOrThrow({where:{id:paused.id}})).status).toBe('paused');
  const cancelled=await runtime.app.inject({method:'POST',url:`/api/assistant/turns/${paused.id}/cancel`,headers:{'x-persona':'bruno','idempotency-key':randomUUID()},payload:{}});
  expect(cancelled.statusCode,cancelled.body).toBe(200);expect((await get(f.project.id,'bruno')).capabilities.canMessage).toBe(true);
 });
 test('an archived requested Task keeps its own blocking reason even when its conversation resolves to an active Story',async()=>{
  const f=await fixture();await db.item.update({where:{id:f.task.id},data:{archived:true}});
  const result=await get(f.task.id,'admin','&includeArchived=true');
  expect(result).toMatchObject({context:{id:f.story.id,status:'specification',archived:false},readOnly:true,hierarchy:{code:'ITEM_ARCHIVED',blockedBy:f.task.id},blockedBy:{id:f.task.id,kind:'task',archived:true},capabilities:{canMessage:false,canCancelTurn:false}});
 });
 test('a receipt uses persisted IDs and real safe items, identifies missing or foreign items and preserves the System interview origin',async()=>{
  const f=await fixture(),foreign=await fixture(),{turn}=await interview(f.system);
  await db.item.update({where:{id:f.project.id},data:{name:'Projeto real da criação',description:'Conteúdo restrito fora da projeção de destino.',data:{privateDetails:'Não expor no recibo.'}}});
  await db.chatTurn.update({where:{id:turn.id},data:{kind:'plan',contextSnapshot:{contextId:f.project.id,createItems:true}}});
  const proposal=await db.planProposal.create({data:{turnId:turn.id,projectId:f.project.id,projectVersion:1,sessionVersion:3,contextFingerprint:'isolated',status:'applied',appliedItemIds:[f.epic.id,f.story.id,f.task.id,'missing-item',foreign.story.id],content:{summary:'Itens criados a partir do Sistema.',epics:[]}}});
  const before=await snapshot(),system=await get(f.system.id,'admin'),project=await get(f.project.id,'admin');
  expect(system.context.id).toBe(f.system.id);expect(system.proposals).toEqual([]);
  expect(system.currentProposal.id).toBe(proposal.id);expect(project.currentProposal.id).toBe(proposal.id);
  expect(system.currentProposal.project).toEqual({id:f.project.id,key:f.project.key,name:'Projeto real da criação'});
  expect(project.currentProposal.project).toEqual(system.currentProposal.project);
  expect(JSON.stringify(system.currentProposal.project)).not.toContain('Conteúdo restrito');expect(JSON.stringify(system.currentProposal.project)).not.toContain('privateDetails');
  const receipt=system.currentProposal.creationReceipt;
  expect(receipt.totals).toEqual({epics:1,stories:1,tasks:1,total:3});
  expect(receipt.coverage).toEqual({expected:5,available:3,complete:false});
  expect(receipt.items.map((item:any)=>item.id)).toEqual([f.epic.id,f.story.id,f.task.id]);
  expect(receipt.items.every((item:any)=>!('description' in item)&&!('data' in item)&&!('parent' in item))).toBe(true);
  expect(project.currentProposal.creationReceipt).toEqual(receipt);expect(await snapshot()).toEqual(before);
 });
});
