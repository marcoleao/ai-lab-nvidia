import {repositoryFixture} from './repository-fixture';
import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {assistantMetrics} from '../apps/api/src/assistant-metrics.ts';
import type {Item} from '../packages/db/generated/client.ts';
import type {LLMProvider} from '../apps/api/src/llm.ts';

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw new Error('Conversation tests require the disposable portal_test database');

describe.skipIf(!url)('conversation scope and traceability in an isolated database',()=>{
  const db=database(url!);
  const prompts:string[]=[];
  const responses:string[]=[];
  const llm:LLMProvider={model:'isolated-conversation-model',models:async()=>['isolated-conversation-model'],complete:async messages=>{
    prompts.push(messages.map(message=>message.content).join('\n'));
    return {model:'isolated-conversation-model',content:responses.shift()??'Resposta contextual para revisão humana; nenhuma ação foi autorizada.'};
  }};
  const runtime=createApp({db,demoMode:true,llm});
  afterAll(async()=>{await runtime.app.close();await db.$disconnect();});

  async function fixture(){
    const prefix='conversation-'+randomUUID();
    const system=await db.item.create({data:{key:prefix,name:'Sistema '+prefix,kind:'system',status:'active'}});
    const project=await db.item.create({data:{key:prefix+'-P',name:'Projeto '+prefix,kind:'project',parentId:system.id,parentKind:'system',status:'awaiting_approval',projectLifecycle:'active'}});
    const epic=await db.item.create({data:{key:prefix+'-E',name:'Épico '+prefix,kind:'epic',parentId:project.id,parentKind:'project',status:'todo'}});
    const story=await db.item.create({data:{key:prefix+'-S',name:'História '+prefix,kind:'story',parentId:epic.id,parentKind:'epic',status:'specification',data:{acceptanceCriteria:['Critério específico da História.']}}});
    const task=await db.item.create({data:{key:prefix+'-T',name:'Tarefa '+prefix,kind:'task',parentId:story.id,parentKind:'story',status:'todo'}});
    return {system,project,epic,story,task,prefix};
  }
  async function secondStory(f:Awaited<ReturnType<typeof fixture>>){
    return db.item.create({data:{key:f.prefix+'-S2',name:'Segunda História',kind:'story',parentId:f.epic.id,parentKind:'epic',status:'specification'}});
  }
  async function completedTurn(context:Item,extra:Record<string,unknown>={}){
    const session=await db.chatSession.create({data:{contextId:context.id,version:3,nextTurn:2}});
    return db.chatTurn.create({data:{sessionId:session.id,sequence:1,input:'CONTEUDO_RESTRITO_ORIGEM '+context.id,output:'CONTEUDO_RESTRITO_RESPOSTA',status:'succeeded',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:context.id,kind:context.kind,...extra}}});
  }
  async function post(path:string,payload:unknown,key=randomUUID()){
    return runtime.app.inject({method:'POST',url:path,headers:{'x-persona':'admin','idempotency-key':key},payload});
  }
  async function get(path:string){
    const response=await runtime.app.inject(path);
    expect(response.statusCode,response.body).toBe(200);
    return response.json();
  }
  const linkBody=(story:Item,sourceId:string)=>({sourceType:'chat_turn',sourceId,sourceVersion:0,expectedVersion:story.version,confirmed:true});

  test('Project planning and Story delivery have independent sessions, with Task conversations routed to their Story',async()=>{
    const f=await fixture(),beforeExecutions=await db.storyExecution.count(),beforePrompts=prompts.length;
    const planning=await post('/api/assistant/turns',{contextId:f.project.id,message:'MARCADOR_EXCLUSIVO_PLANEJAMENTO',expectedVersion:0,assistantMode:'planning'});
    const delivery=await post('/api/assistant/turns',{contextId:f.task.id,message:'MARCADOR_EXCLUSIVO_EXECUCAO',expectedVersion:0,assistantMode:'delivery'});
    expect(planning.statusCode,planning.body).toBe(200);expect(delivery.statusCode,delivery.body).toBe(200);
    await runtime.processChatJobs();await runtime.processChatJobs();
    const project=await get('/api/assistant?contextId='+f.project.id),story=await get('/api/assistant?contextId='+f.story.id),task=await get('/api/assistant?contextId='+f.task.id);
    expect(project).toMatchObject({assistantMode:'planning',context:{id:f.project.id},readOnly:false});
    expect(story).toMatchObject({assistantMode:'delivery',context:{id:f.story.id},readOnly:false});
    expect(task.session.id).toBe(story.session.id);expect(project.session.id).not.toBe(story.session.id);
    expect(project.turns.map((turn:any)=>turn.input)).toEqual(['MARCADOR_EXCLUSIVO_PLANEJAMENTO']);
    expect(story.turns.map((turn:any)=>turn.input)).toEqual(['MARCADOR_EXCLUSIVO_EXECUCAO']);
    const calls=prompts.slice(beforePrompts);expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain('MARCADOR_EXCLUSIVO_EXECUCAO');expect(calls[1]).not.toContain('MARCADOR_EXCLUSIVO_PLANEJAMENTO');
    expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('specification');
    expect(await db.storyExecution.count()).toBe(beforeExecutions);
    const mismatch=await post('/api/assistant/turns',{contextId:f.story.id,message:'Escopo incorreto',expectedVersion:story.session.version,assistantMode:'planning'});
    expect(mismatch.statusCode).toBe(409);expect(mismatch.json().error.code).toBe('ASSISTANT_CONTEXT_MISMATCH');
    const plan=await post('/api/assistant/plans',{contextId:f.story.id,expectedVersion:story.session.version});
    expect([400,409]).toContain(plan.statusCode);expect(plan.json().error.code).toBe('PROJECT_REQUIRED');
  });

  test('all 61 turns and 23 proposals remain accessible, independently of active work and older successful interview',async()=>{
    const f=await fixture(),session=await db.chatSession.create({data:{contextId:f.project.id,version:61,nextTurn:62}}),createdAt=new Date('2026-10-23T12:00:00Z');
    const turns=[];
    for(let index=1;index<=61;index++)turns.push(await db.chatTurn.create({data:{sessionId:session.id,sequence:index,kind:index>38?'plan':'chat',input:'Interação '+index,output:index===1?'Entrevista concluída':null,status:index===61?'queued':index===1?'succeeded':'failed',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:f.project.id},createdAt}}));
    for(let index=0;index<23;index++)await db.planProposal.create({data:{turnId:turns[index+38].id,projectId:f.project.id,projectVersion:f.project.version,sessionVersion:61,contextFingerprint:'isolated-test',status:'applied',content:{summary:'Proposta '+(index+1),epics:[]},createdAt:new Date(createdAt.getTime()+index)}});
    const first=await get('/api/assistant?contextId='+f.project.id+'&page=1&proposalsPage=1');
    expect(first.turnsPage).toMatchObject({total:61,page:1,pageSize:20,totalPages:4,hasMore:true});
    expect(first.proposalsPage).toMatchObject({total:23,page:1,pageSize:20,totalPages:2});
    expect(first.activeTurn.id).toBe(turns[60].id);expect(first.hasSuccessfulInterview).toBe(true);
    const seen:string[]=[];
    for(let page=1;page<=4;page++){
      const result=await get(`/api/assistant?contextId=${f.project.id}&page=${page}`);
      seen.push(...result.turns.map((turn:any)=>turn.id));
      expect(result.activeTurn.id).toBe(turns[60].id);expect(result.hasSuccessfulInterview).toBe(true);
    }
    expect(new Set(seen).size).toBe(61);expect(seen).toContain(turns[0].id);expect(seen).toContain(turns[50].id);
    const second=await get('/api/assistant?contextId='+f.project.id+'&proposalsPage=2');
    expect(second.proposals).toHaveLength(3);expect(new Set([...first.proposals,...second.proposals].map((proposal:any)=>proposal.id)).size).toBe(23);
    const invalid=await runtime.app.inject('/api/assistant?contextId='+f.project.id+'&page=0');expect(invalid.statusCode).toBe(422);
    await db.chatTurn.update({where:{id:turns[60].id},data:{status:'cancelled'}});
  });

  test('applying a plan preserves its original interview and exposes one common decision in each resulting Story',async()=>{
    const f=await fixture();
    const start=await post('/api/assistant/turns',{contextId:f.project.id,message:'Definir consulta de protocolo para o solicitante.',expectedVersion:0,assistantMode:'planning'});
    expect(start.statusCode,start.body).toBe(200);await runtime.processChatJobs();
    const before=await get('/api/assistant?contextId='+f.project.id);
    responses.push(JSON.stringify({summary:'Consulta de protocolo.',epics:[{title:'Consultar protocolos',description:'Permitir ao solicitante consultar seus protocolos.',stories:[{title:'Consultar o próprio protocolo',description:'O solicitante consulta seus protocolos e respectivos resultados.',acceptanceCriteria:['A consulta retorna somente protocolos do solicitante.'],repositoryIds:[],tasks:[{title:'Implementar consulta de protocolo',description:'Validar o solicitante e retornar o resultado do protocolo.',repositoryIds:[]}]}]}]}));
    const complete=await post('/api/assistant/complete',{contextId:f.project.id,projectId:f.project.id,expectedVersion:before.session.version,confirmed:true});
    expect(complete.statusCode,complete.body).toBe(200);await runtime.processChatJobs();
    const proposal=await db.planProposal.findUniqueOrThrow({where:{turnId:complete.json().turn.id}});
    expect(proposal.status).toBe('applied');
    const planned=await db.item.findFirstOrThrow({where:{kind:'story',data:{path:['planProposalId'],equals:proposal.id}}});
    expect(planned.status).toBe('specification');
    const origin=await get(`/api/items/${planned.id}/conversations?source=planning`);
    expect(origin.total).toBe(2);expect(origin.messages.every((message:any)=>message.relation==='planning_origin')).toBe(true);
    expect(origin.messages.map((message:any)=>message.sourceId)).toContain(start.json().turn.id);
    const beforeCreation=new Date(planned.createdAt.getTime()-1).toISOString();
    expect((await get(`/api/items/${planned.id}/conversations?source=planning&asOf=${encodeURIComponent(beforeCreation)}`)).total).toBe(0);
    expect(await db.conversationLink.count({where:{storyId:planned.id}})).toBe(0);
    const history=await get(`/api/items/${planned.id}/history?scope=self&type=PLAN_APPLIED`);
    expect(history.total).toBe(1);expect(history.events[0].itemId).toBe(f.project.id);
    const session=await db.chatSession.findUniqueOrThrow({where:{contextId:f.project.id}});
    await db.chatTurn.create({data:{sessionId:session.id,sequence:session.nextTurn,input:'Assunto posterior sem relação com esta História',output:'Nova discussão de Projeto.',status:'succeeded',actorId:'admin',actorName:'Admin',contextSnapshot:{contextId:f.project.id}}});
    expect((await get(`/api/items/${planned.id}/conversations?source=planning`)).total).toBe(2);
    const payload={sourceType:'plan_proposal',sourceId:proposal.id,sourceVersion:1,expectedVersion:f.story.version,confirmed:true};
    const linked=await post(`/api/items/${f.story.id}/conversation-links`,payload);expect(linked.statusCode,linked.body).toBe(200);
    expect((await get(`/api/items/${f.story.id}/conversations?source=planning`)).total).toBe(2);
  });

  test('a shared decision links two Stories without copying its source, duplicating reads or replaying audit effects',async()=>{
    const f=await fixture(),other=await secondStory(f),source=await completedTurn(f.project),beforeTurns=await db.chatTurn.count(),key=randomUUID(),payload=linkBody(f.story,source.id);
    const first=await post(`/api/items/${f.story.id}/conversation-links`,payload,key);expect(first.statusCode,first.body).toBe(200);
    const replay=await post(`/api/items/${f.story.id}/conversation-links`,payload,key);expect(replay.json()).toEqual(first.json());
    const second=await post(`/api/items/${other.id}/conversation-links`,linkBody(other,source.id));expect(second.statusCode,second.body).toBe(200);
    expect(await db.chatTurn.count()).toBe(beforeTurns);
    expect(await db.conversationLink.count({where:{sourceId:source.id}})).toBe(2);
    expect(await db.historyEvent.count({where:{action:'CONVERSATION_LINKED',itemId:f.project.id}})).toBe(2);
    for(const story of [f.story,other]){
      const list=await get(`/api/items/${story.id}/conversations`);
      expect(list.messages.filter((message:any)=>message.sourceId===source.id)).toHaveLength(1);
      expect(list.messages.find((message:any)=>message.sourceId===source.id)).toMatchObject({relation:'linked',source:'planning',context:{id:f.project.id}});
      const history=await get(`/api/items/${story.id}/history?scope=self&type=CONVERSATION_LINKED`);
      expect(history.total).toBe(1);expect(history.events[0].itemId).toBe(f.project.id);
      expect(JSON.stringify(history)).not.toContain('CONTEUDO_RESTRITO');
    }
    const combined=await get(`/api/items/${f.project.id}/conversations?scope=descendants`);
    expect(combined.messages.filter((message:any)=>message.sourceId===source.id)).toHaveLength(1);
    const own=await get(`/api/items/${f.project.id}/history?scope=self&type=CONVERSATION_LINKED`);
    const descendants=await get(`/api/items/${f.project.id}/history?scope=descendants&type=CONVERSATION_LINKED`);
    expect(own.total).toBe(2);expect(descendants.total).toBe(2);
    const noChange=await post(`/api/items/${f.story.id}/conversation-links`,payload);expect(noChange.statusCode,noChange.body).toBe(200);expect(noChange.json().noChange).toBe(true);
    expect(await db.conversationLink.count({where:{sourceId:source.id}})).toBe(2);
    expect(await db.historyEvent.count({where:{action:'CONVERSATION_LINKED',itemId:f.project.id,outcome:'NO_CHANGE'}})).toBe(1);
    const events=await db.historyEvent.findMany({where:{action:'CONVERSATION_LINKED',itemId:f.project.id}});
    expect(JSON.stringify(events)).not.toContain('CONTEUDO_RESTRITO');
    expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).version).toBe(f.story.version);
  });

  test('source scope, source completion, target version and archive are enforced without creating links',async()=>{
    const f=await fixture(),foreign=await fixture(),source=await completedTurn(foreign.project),before=await db.conversationLink.count();
    const denied=await post(`/api/items/${f.story.id}/conversation-links`,linkBody(f.story,source.id));
    expect(denied.statusCode).toBe(403);expect(denied.json().error.code).toBe('CONVERSATION_SOURCE_SCOPE');
    const local=await completedTurn(f.project);
    const stale=await post(`/api/items/${f.story.id}/conversation-links`,{...linkBody(f.story,local.id),expectedVersion:f.story.version+1});
    expect(stale.statusCode).toBe(409);expect(stale.json().error.code).toBe('VERSION_CONFLICT');
    await db.chatTurn.update({where:{id:local.id},data:{status:'queued'}});
    const pending=await post(`/api/items/${f.story.id}/conversation-links`,linkBody(f.story,local.id));
    expect(pending.statusCode).toBe(409);expect(pending.json().error.code).toBe('CONVERSATION_SOURCE_NOT_READY');
    await db.chatTurn.update({where:{id:local.id},data:{status:'succeeded'}});
    await db.item.update({where:{id:f.project.id},data:{archived:true}});
    const archived=await post(`/api/items/${f.story.id}/conversation-links`,linkBody(f.story,local.id));expect([404,409]).toContain(archived.statusCode);
    expect(await db.conversationLink.count()).toBe(before);
    const ordinary=await runtime.app.inject(`/api/items/${f.story.id}/conversations`);expect(ordinary.statusCode).toBe(404);
    const archive=await get(`/api/items/${f.story.id}/conversations?includeArchived=true`);expect(archive.readOnly).toBe(true);
    const assistant=await get(`/api/assistant?contextId=${f.task.id}&includeArchived=true`);expect(assistant).toMatchObject({readOnly:true,context:{id:f.story.id}});
    const write=await post('/api/assistant/turns',{contextId:f.task.id,message:'Não criar mensagem no acervo',expectedVersion:0,assistantMode:'delivery'});expect([404,409]).toContain(write.statusCode);
  });

  test('links preserve the exact immutable proposal revision and its target revision after a later proposal edit',async()=>{
    const f=await fixture(),other=await secondStory(f),seed=await completedTurn(f.project);
    const original={summary:'Proposta original restrita',epics:[]},revised={summary:'Revisão humana posterior restrita',epics:[]};
    const source=await db.chatTurn.update({where:{id:seed.id},data:{kind:'plan',output:JSON.stringify(original)}});
    const proposal=await db.planProposal.create({data:{turnId:source.id,projectId:f.project.id,projectVersion:1,sessionVersion:3,contextFingerprint:'isolated',version:2,content:revised}});
    await db.planRevision.createMany({data:[{proposalId:proposal.id,version:1,content:original,source:'model',actorId:'assistant:local',actorName:'Modelo isolado'},{proposalId:proposal.id,version:2,content:revised,source:'human',actorId:'admin',actorName:'Admin'}]});
    const available=await get(`/api/items/${f.project.id}/conversations`);
    expect(available.messages.find((message:any)=>message.sourceId===source.id)).toMatchObject({proposal:{id:proposal.id,version:2,status:'draft'},references:[]});
    for(const [story,sourceVersion] of [[f.story,1],[other,2]] as const){
      const linked=await post(`/api/items/${story.id}/conversation-links`,{sourceType:'plan_proposal',sourceId:proposal.id,sourceVersion,expectedVersion:story.version,confirmed:true});
      expect(linked.statusCode,linked.body).toBe(200);
      const conversation=await get(`/api/items/${story.id}/conversations`);
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.messages[0].references).toEqual(expect.arrayContaining([expect.objectContaining({sourceType:'plan_proposal',sourceId:proposal.id,sourceVersion,storyId:story.id,storyVersion:story.version,relation:'linked'})]));
      expect(conversation.messages[0].output).toBe(source.output);
    }
    const first=await get(`/api/assistant/plans/${proposal.id}/revisions/1`),second=await get(`/api/assistant/plans/${proposal.id}/revisions/2`);
    expect(first).toMatchObject({proposalId:proposal.id,version:1,revision:{content:original,source:'model'},context:{id:f.project.id}});
    expect(second).toMatchObject({proposalId:proposal.id,version:2,revision:{content:revised,source:'human'}});
    const history=await get(`/api/items/${f.story.id}/history?scope=self&type=CONVERSATION_LINKED`);
    const occurrences=await db.historyEvent.findMany({where:{itemId:f.project.id,action:'CONVERSATION_LINKED'},select:{timestamp:true,audit:true,payload:true}});
    expect(history.total,JSON.stringify({asOf:history.asOf,occurrences})).toBe(1);expect(JSON.stringify(history)).not.toContain('restrita');
    expect((await db.planProposal.findUniqueOrThrow({where:{id:proposal.id}})).content).toEqual(revised);
  });

  test('a discussion from another Story can be related inside the same Project while a foreign Project is rejected',async()=>{
    const f=await fixture(),other=await secondStory(f),source=await completedTurn(f.story),foreign=await fixture(),foreignSource=await completedTurn(foreign.story);
    const linked=await post(`/api/items/${other.id}/conversation-links`,linkBody(other,source.id));expect(linked.statusCode,linked.body).toBe(200);
    const target=await get(`/api/items/${other.id}/conversations`);
    expect(target.messages).toHaveLength(1);expect(target.messages[0]).toMatchObject({source:'story',sourceId:source.id,relation:'linked',context:{id:f.story.id}});
    expect(target.messages[0].references).toEqual(expect.arrayContaining([expect.objectContaining({sourceType:'chat_turn',sourceId:source.id,sourceVersion:0,storyId:other.id,relation:'linked'})]));
    const denied=await post(`/api/items/${other.id}/conversation-links`,linkBody(other,foreignSource.id));
    expect(denied.statusCode).toBe(403);expect(denied.json().error.code).toBe('CONVERSATION_SOURCE_SCOPE');
    const combined=await get(`/api/items/${f.project.id}/conversations?scope=descendants`);
    expect(combined.messages.filter((message:any)=>message.sourceId===source.id)).toHaveLength(1);
    await db.item.update({where:{id:f.story.id},data:{archived:true}});
    expect((await get(`/api/items/${other.id}/conversations`)).total).toBe(0);
    const archived=await get(`/api/items/${other.id}/conversations?includeArchived=true`);
    expect(archived.messages.find((message:any)=>message.sourceId===source.id)).toMatchObject({context:{id:f.story.id,archived:true,readOnly:true}});
  });

  test('an archived source Epic requires explicit archive access while the target Story remains active',async()=>{
    const f=await fixture(),source=await completedTurn(f.story);
    const targetEpic=await db.item.create({data:{key:f.prefix+'-E2',name:'Épico de destino ativo',kind:'epic',parentId:f.project.id,parentKind:'project',status:'todo'}});
    const target=await db.item.create({data:{key:f.prefix+'-TARGET',name:'História de destino ativa',kind:'story',parentId:targetEpic.id,parentKind:'epic',status:'specification'}});
    const linked=await post(`/api/items/${target.id}/conversation-links`,linkBody(target,source.id));expect(linked.statusCode,linked.body).toBe(200);
    await db.item.update({where:{id:f.epic.id},data:{archived:true}});
    expect((await get(`/api/items/${target.id}/conversations`)).total).toBe(0);
    const archive=await get(`/api/items/${target.id}/conversations?includeArchived=true`);
    expect(archive.readOnly).toBe(false);
    expect(archive.messages.find((message:any)=>message.sourceId===source.id)).toMatchObject({context:{id:f.story.id,archived:true,readOnly:true}});
    expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).archived).toBe(false);
  });

  test('an archived Task stays read only when its conversation resolves to an active Story',async()=>{
    const f=await fixture();await db.item.update({where:{id:f.task.id},data:{archived:true}});
    const assistant=await get(`/api/assistant?contextId=${f.task.id}&includeArchived=true`);
    const conversation=await get(`/api/items/${f.task.id}/conversations?includeArchived=true`);
    expect(assistant).toMatchObject({readOnly:true,context:{id:f.story.id}});
    expect(conversation).toMatchObject({readOnly:true,context:{id:f.story.id}});
    expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).archived).toBe(false);
    const mutation=await post('/api/assistant/turns',{contextId:f.task.id,message:'Mensagem não autorizada no acervo',expectedVersion:0,assistantMode:'delivery'});
    expect(mutation.statusCode).toBe(404);
  });

  test('the unified Story query preserves source identity and execution/merge ownership with complete pagination',async()=>{
    const f=await fixture(),other=await secondStory(f),source=await completedTurn(f.story);
    const repository=await repositoryFixture(db,{data:{systemId:f.system.id,key:'CONVERSATION',name:'Componente isolado',runtime:'node',state:'ready'}});
    const execution=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:repository.id,storyVersion:f.story.version,state:'failed',stage:'completed',snapshot:{},error:'Falha atual não atribuível às mensagens antigas.',actorId:'admin',actorName:'Admin'}});
    await db.executionMessage.createMany({data:Array.from({length:25},(_,index)=>({executionId:execution.id,sequence:index+1,role:index%2?'assistant':'user',content:'Mensagem de execução '+index,state:'succeeded',actorId:'admin',actorName:'Admin'}))});
    const operation=await db.mergeOperation.create({data:{executionId:execution.id,storyId:f.story.id,projectId:1,iid:1,sourceBranch:'feature/test',targetBranch:'main',sha:'a'.repeat(40)}});
    const merge=await db.mergeDiscussionTurn.create({data:{operationId:operation.id,sequence:1,input:'Dúvida de integração',state:'failed',error:'Falha da consulta preservada nesta rodada.',actorId:'admin',actorName:'Admin'}});
    const first=await get(`/api/items/${f.story.id}/conversations`);
    expect(first).toMatchObject({total:27,pageSize:20,totalPages:2});
    const second=await get(`/api/items/${f.story.id}/conversations?page=2&asOf=${encodeURIComponent(first.asOf)}`);
    const messages=[...first.messages,...second.messages];expect(new Set(messages.map((message:any)=>message.id)).size).toBe(27);
    expect(messages.some((message:any)=>message.sourceId===source.id&&message.source==='story')).toBe(true);
    expect(messages.some((message:any)=>message.sourceId===merge.id&&message.source==='merge')).toBe(true);
    expect(messages.filter((message:any)=>message.source==='execution')).toHaveLength(25);
    expect(messages.find((message:any)=>message.sourceId===merge.id)).toMatchObject({state:'failed',error:'Falha da consulta preservada nesta rodada.'});
    expect(messages.filter((message:any)=>message.source==='execution').every((message:any)=>message.error===null)).toBe(true);
    expect(JSON.stringify(messages)).not.toContain('Falha atual não atribuível');
    expect((await get(`/api/items/${other.id}/conversations`)).total).toBe(0);
    const task=await get(`/api/items/${f.task.id}/conversations?source=execution`);expect(task.total).toBe(25);
    expect((await get(`/api/items/${f.project.id}/conversations?scope=self`)).total).toBe(0);
    expect((await get(`/api/items/${f.project.id}/conversations?scope=descendants`)).total).toBe(27);
    const invalid=await runtime.app.inject(`/api/items/${f.story.id}/conversations?source=unknown`);expect(invalid.statusCode).toBe(422);
  });

  test('fresh history and conversation cutoffs use the ledger clock when the API clock is behind',async()=>{
    const f=await fixture(),source=await completedTurn(f.project);
    const linked=await post(`/api/items/${f.story.id}/conversation-links`,linkBody(f.story,source.id));
    expect(linked.statusCode,linked.body).toBe(200);
    const applicationTime=Date.now()-60000;
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(applicationTime);
    try{
      const history=await get(`/api/items/${f.story.id}/history?scope=self&type=CONVERSATION_LINKED`);
      expect(history.total).toBe(1);
      expect(new Date(history.asOf).getTime()).toBeGreaterThan(applicationTime+30000);
      const conversations=await get(`/api/items/${f.story.id}/conversations`);
      expect(conversations.messages.map((message:any)=>message.sourceId)).toContain(source.id);
      expect(new Date(conversations.asOf).getTime()).toBeGreaterThan(applicationTime+30000);
    }finally{vi.useRealTimers();}
  });

  test('Story requirements discussions do not inflate Project interview indicators',async()=>{
    const f=await fixture();
    await completedTurn(f.project,{requirementsVersion:1,assistantMode:'planning'});
    await completedTurn(f.story,{requirementsVersion:1,assistantMode:'delivery'});
    const now=new Date(Date.now()+1000),start=new Date(now.getTime()-86400000),end=new Date(now.getTime()+86400000);
    const result=await db.$transaction(tx=>assistantMetrics(tx,now,[{start:start.toISOString(),end:end.toISOString(),label:'Isolated test',partial:true}],[f.project.id,f.story.id]));
    expect(result.total.started).toBe(1);expect(result.total.completed).toBe(0);
  });

  test('audit insertion failure rolls back a link and a retry can safely apply the original intent',async()=>{
    const f=await fixture(),source=await completedTurn(f.project),key=randomUUID(),payload=linkBody(f.story,source.id);
    const trigger='conversation_test_reject_'+randomUUID().replaceAll('-','');
    await db.$executeRawUnsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CONVERSATION_LINKED' THEN RAISE EXCEPTION 'isolated audit insertion failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try{
      const failed=await post(`/api/items/${f.story.id}/conversation-links`,payload,key);expect(failed.statusCode).toBeGreaterThanOrEqual(400);
      expect(await db.conversationLink.count({where:{storyId:f.story.id}})).toBe(0);
      expect(await db.historyEvent.count({where:{action:'CONVERSATION_LINKED',itemId:f.project.id}})).toBe(0);
    }finally{
      await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "HistoryEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
    const applied=await post(`/api/items/${f.story.id}/conversation-links`,payload,key);expect(applied.statusCode,applied.body).toBe(200);
    const replay=await post(`/api/items/${f.story.id}/conversation-links`,payload,key);expect(replay.json()).toEqual(applied.json());
    expect(await db.conversationLink.count({where:{storyId:f.story.id}})).toBe(1);
    expect(await db.historyEvent.count({where:{action:'CONVERSATION_LINKED',itemId:f.project.id}})).toBe(1);
  });
});
