import {randomUUID,createHash} from 'node:crypto';
import type {Database,Transaction} from '../../../packages/db/client.ts';
import type {Prisma} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {recordAudit} from './audit.ts';
import {ensurePipelineTasks,pipelineStageOf} from './pipeline-tasks.ts';
import {ensureHierarchyWritable} from './lifecycle-policy.ts';

type Person={id:string;name:string};
type Kind='specification'|'coding'|'code_review'|'security_scan'|'merge';
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const humanWait=new Set(['waiting_input','waiting_approval','blocked','failed']);
const auxiliary=(attempt:{sourceType:string})=>attempt.sourceType==='merge_discussion';

export async function ensureActivity(tx:Transaction,h:AssistantHelpers,args:{storyId:string;repositoryId:string;kind:Kind;person:Person}){
 const story=await h.live(tx,args.storyId);await h.ensureNotArchived(tx,story);
 let scopeKey=`${args.storyId}:${args.repositoryId}:${args.kind}`;
 let prior=await tx.workActivity.findUnique({where:{scopeKey}});
 if(args.kind==='specification'&&prior?.taskId){scopeKey+=':story';prior=await tx.workActivity.findUnique({where:{scopeKey}});}
 // Requirements and G1 belong to the Story. They never manufacture a seventh
 // process Task. Every executable pipeline phase uses its planned Task.
 const task=args.kind==='specification'?null:(await ensurePipelineTasks(tx,story,args.person,h.createItem)).find(task=>pipelineStageOf(task)===args.kind);
 if(args.kind!=='specification'&&!task)throw new DomainError('PIPELINE_TASK_REQUIRED','Planeje a Tarefa desta etapa antes de iniciar a execução.',409);
 if(prior){if(prior.taskId!==(task?.id??null))throw new DomainError('PIPELINE_TASK_MIGRATION_REVIEW','A Tarefa desta atividade precisa de revisão; os apontadores históricos foram preservados.',409);return prior;}
 return tx.workActivity.create({data:{storyId:args.storyId,repositoryId:args.repositoryId,kind:args.kind,scopeKey,taskId:task?.id??null}});
}
async function event(tx:Transaction,attemptId:string,key:string,kind:string,stage:string,message:string,extra:{provider?:string;category?:string;payload?:unknown}={}){
 return tx.workEvent.upsert({where:{attemptId_key:{attemptId,key}},create:{attemptId,key,kind,stage,message,provider:extra.provider,category:extra.category,payload:json(extra.payload??{})},update:{}});
}
export async function enqueueAttempt(tx:Transaction,h:AssistantHelpers,args:{storyId:string;repositoryId:string;kind:Kind;sourceType:string;sourceId:string;sourceKey:string;revision?:string|null;person:Person}){
 const existing=await tx.workAttempt.findUnique({where:{sourceKey:args.sourceKey}});if(existing)return existing;
 const activity=await ensureActivity(tx,h,args),now=new Date();
 const previous=args.sourceType==='merge_discussion'?null:activity.currentAttemptId?await tx.workAttempt.findUnique({where:{id:activity.currentAttemptId}}):null;
 if(previous&&['queued','running'].includes(previous.state))throw new DomainError('WORK_BUSY','Uma tentativa desta atividade já está ativa. Consulte o resultado antes de iniciar outra.',409);
 if(previous?.waitingSince){
  await event(tx,previous.id,`wait-resolved:${args.sourceKey}`,'wait_resolved',previous.stage,'Usuário deu continuidade ao trabalho.',{category:previous.errorCategory??undefined,payload:{durationMs:Math.max(0,now.getTime()-previous.waitingSince.getTime()),waitKind:previous.state,category:previous.errorCategory,resumedAfterFailure:previous.state==='failed',actorId:args.person.id}});
  await tx.workAttempt.update({where:{id:previous.id},data:{waitingSince:null}});
 }
 const attempt=await tx.workAttempt.create({data:{activityId:activity.id,sourceType:args.sourceType,sourceId:args.sourceId,sourceKey:args.sourceKey,revision:args.revision,actorId:args.person.id,actorName:args.person.name}});
 if(!auxiliary(attempt))await tx.workActivity.update({where:{id:activity.id},data:{currentAttemptId:attempt.id}});
 await event(tx,attempt.id,'queued','queued','queued','Solicitação recebida; aguardando recurso de execução.');
 if(previous&&['failed','blocked','stale','cancelled'].includes(previous.state))await event(tx,attempt.id,'resumed','resumed','queued','Nova tentativa solicitada; evidências anteriores preservadas.',{category:previous.errorCategory??undefined,payload:{previousAttemptId:previous.id,previousState:previous.state}});
 return attempt;
}
export async function currentAttempt(tx:Transaction,sourceType:string,sourceId:string,kind?:string){
 const attempts=await tx.workAttempt.findMany({where:{sourceType,sourceId,...(kind?{activity:{kind}}:{})},include:{activity:true},orderBy:[{queuedAt:'desc'},{id:'desc'}]});
 return attempts.find(a=>a.activity.currentAttemptId===a.id||auxiliary(a))??null;
}
export async function startAttempt(tx:Transaction,sourceKey:string,leaseId:string,stage:string){
 const attempt=await tx.workAttempt.findUnique({where:{sourceKey},include:{activity:{include:{taskLinks:true}}}});if(!attempt||(!auxiliary(attempt)&&attempt.activity.currentAttemptId!==attempt.id)||!['queued','running'].includes(attempt.state))return;
 const story=await tx.item.findUniqueOrThrow({where:{id:attempt.activity.storyId}});await ensureHierarchyWritable(tx,story);
 const now=new Date();await tx.workAttempt.update({where:{id:attempt.id},data:{state:'running',stage,leaseId,heartbeatAt:now,...(!attempt.startedAt?{startedAt:now}:{})}});
 const taskIds=auxiliary(attempt)?[]:[attempt.activity.taskId,...attempt.activity.taskLinks.map(link=>link.taskId)].filter((id):id is string=>!!id);
 const tasks=await tx.item.findMany({where:{id:{in:taskIds},kind:'task',archived:false,status:{in:['todo','done','cancelled']}}});
 const reopened=tasks.filter(task=>['done','cancelled'].includes(task.status));
 for(const task of tasks){
  const changed=await tx.item.update({where:{id:task.id},data:{status:'doing',version:{increment:1}}});
  await recordAudit(tx,changed,{id:'agent:work',name:'Executor SDLC'},'WORK_TASK_STATUS_CHANGED','Executor confirmou o início do trabalho da Tarefa.',{attemptId:attempt.id,activityId:attempt.activityId,stage},'agent',{before:{status:task.status,version:task.version},after:{status:changed.status,version:changed.version},initiator:{id:attempt.actorId,name:attempt.actorName,type:'human'},operationId:attempt.sourceId,attemptId:attempt.id});
 }
 if(!attempt.startedAt)await event(tx,attempt.id,'started','started',stage,'Executor iniciou esta tentativa.',{payload:{queueMs:Math.max(0,now.getTime()-attempt.queuedAt.getTime())}});
 const lastQueue=await tx.workEvent.findFirst({where:{attemptId:attempt.id,kind:'stage_queued'},orderBy:{timestamp:'desc'}});
 await event(tx,attempt.id,`stage-start:${leaseId}`,'stage_started',stage,'Executor assumiu esta etapa.',{payload:{queueMs:Math.max(0,now.getTime()-(lastQueue?.timestamp??attempt.queuedAt).getTime())}});
 if(reopened.length)await event(tx,attempt.id,`reopened:${stage}`,'reopened',stage,'Trabalho reaberto para esta revisão.',{payload:{taskIds:reopened.map(t=>t.id),reason:'Nova tentativa/revisão exige nova evidência.'}});
}
export async function pauseAttempt(tx:Transaction,sourceKey:string,leaseId:string,stage:string){
 const attempt=await tx.workAttempt.findUnique({where:{sourceKey},include:{activity:true}});if(!attempt||attempt.activity.currentAttemptId!==attempt.id||attempt.state!=='running'||attempt.leaseId!==leaseId)return;
 const started=await tx.workEvent.findUnique({where:{attemptId_key:{attemptId:attempt.id,key:`stage-start:${leaseId}`}}});
 await event(tx,attempt.id,`stage-finished:${leaseId}`,'stage_finished',attempt.stage,'Etapa encerrada; resultado local preservado.',{payload:{processingMs:started?Math.max(0,Date.now()-started.timestamp.getTime()):null}});
 await event(tx,attempt.id,`stage-queued:${leaseId}`,'stage_queued',stage,'Próxima etapa aguarda recurso de execução.');
 await tx.workAttempt.update({where:{id:attempt.id},data:{state:'queued',stage,provider:null,leaseId:null}});
}
export async function progress(db:Database,sourceKey:string,leaseId:string,args:{stage:string;message:string;provider?:string;key?:string}){
 await db.$transaction(async tx=>{
  const attempt=await tx.workAttempt.findUnique({where:{sourceKey},include:{activity:true}});if(!attempt||attempt.state!=='running'||attempt.leaseId!==leaseId||(!auxiliary(attempt)&&attempt.activity.currentAttemptId!==attempt.id))return;
  await tx.workAttempt.update({where:{id:attempt.id},data:{stage:args.stage,provider:args.provider??null,heartbeatAt:new Date()}});
  await event(tx,attempt.id,args.key??randomUUID(),'progress',args.stage,args.message,{provider:args.provider});
 });
}
export async function withWorkHeartbeat<T>(db:Database,sourceKey:string|undefined,leaseId:string|null,fn:()=>Promise<T>):Promise<T>{
 if(!sourceKey||!leaseId)return fn();
 let busy=false;
 const timer=setInterval(()=>{
  if(busy)return;busy=true;
  void db.workAttempt.updateMany({where:{sourceKey,leaseId,state:'running'},data:{heartbeatAt:new Date()}}).catch(()=>{}).finally(()=>{busy=false;});
 },15000);
 timer.unref();try{return await fn();}finally{clearInterval(timer);}
}
export function workErrorCategory(error:unknown){
 const code=error instanceof DomainError?error.code:'';
 const upstreamStatus=error instanceof DomainError&&error.details&&typeof error.details==='object'?(error.details as {status?:unknown}).status:undefined;
 if(upstreamStatus===401||upstreamStatus===403)return 'integration_access';
 if(/ACCESS|AUTH|IDENTITY|SCOPE_DENIED|TOKEN/.test(code))return 'integration_access';
 if(/TIMEOUT|UNAVAILABLE|LEASE_EXPIRED/.test(code))return 'provider_unavailable';
 if(/STALE|CHANGED/.test(code))return 'changed_scope';
 if(/DEPENDENC|CAPABILITY|INPUT/.test(code))return 'user_decision';
 return 'execution_failure';
}
export async function finishAttempt(tx:Transaction,h:AssistantHelpers,sourceKey:string,args:{state:string;summary?:string;category?:string;revision?:string;completeTask?:boolean;leaseId?:string|null}){
 const attempt=await tx.workAttempt.findUnique({where:{sourceKey},include:{activity:{include:{taskLinks:true}}}});
 if(!attempt||(!auxiliary(attempt)&&attempt.activity.currentAttemptId!==attempt.id)||(args.leaseId&&attempt.leaseId!==args.leaseId)||['cancelled','stale'].includes(attempt.state))return;
 const now=new Date();
 const stages=await tx.workEvent.findMany({where:{attemptId:attempt.id,kind:{in:['stage_started','stage_finished','succeeded','waiting_input','waiting_approval','failed','blocked']}}});
 const payloadOf=(value:unknown)=>value as {processingMs?:number|null;queueMs?:number};
 const priorResult=stages.find(e=>!['stage_started','stage_finished'].includes(e.kind)&&typeof payloadOf(e.payload).processingMs==='number');
 const activeStage=attempt.leaseId?stages.find(e=>e.key===`stage-start:${attempt.leaseId}`):null;
 const processingMs=priorResult&&!attempt.leaseId?payloadOf(priorResult.payload).processingMs:stages.filter(e=>e.kind==='stage_finished').reduce((sum,e)=>sum+(payloadOf(e.payload).processingMs??0),0)+(activeStage?Math.max(0,now.getTime()-activeStage.timestamp.getTime()):0);
 const queueMs=stages.filter(e=>e.kind==='stage_started').reduce((sum,e)=>sum+(payloadOf(e.payload).queueMs??0),0);
 if(attempt.waitingSince&&!humanWait.has(args.state))await event(tx,attempt.id,`wait-resolved:${args.state}`,'wait_resolved',attempt.stage,'Decisão registrada para esta atividade.',{category:attempt.errorCategory??undefined,payload:{durationMs:Math.max(0,now.getTime()-attempt.waitingSince.getTime()),waitKind:attempt.state,category:attempt.errorCategory}});
 await tx.workAttempt.update({where:{id:attempt.id},data:{state:args.state,summary:args.summary,errorCategory:args.category??null,revision:args.revision??attempt.revision,finishedAt:now,waitingSince:humanWait.has(args.state)?now:null,leaseId:null}});
 await event(tx,attempt.id,`finish:${args.state}`,args.state,attempt.stage,args.summary??'Tentativa encerrada.',{category:args.category,payload:{processingMs:attempt.startedAt?processingMs:null,queueMs,revision:args.revision??attempt.revision}});
 if(args.completeTask&&args.state==='succeeded'&&!auxiliary(attempt)){
  const story=await h.live(tx,attempt.activity.storyId);await h.ensureNotArchived(tx,story);
  const taskIds=[attempt.activity.taskId,...(attempt.activity.kind==='coding'?attempt.activity.taskLinks.filter(link=>link.completion==='publish_code').map(link=>link.taskId):[])].filter((id):id is string=>!!id);
  const tasks=await tx.item.findMany({where:{id:{in:taskIds},kind:'task',archived:false,status:{not:'done'}}});
  for(const task of tasks){
   const changed=await tx.item.update({where:{id:task.id},data:{status:'done',version:{increment:1},data:json({...task.data as object,result:{summary:args.summary??'Execução concluída com evidência registrada.',attemptId:attempt.id,activityId:attempt.activityId,sourceType:attempt.sourceType,sourceId:attempt.sourceId,revision:args.revision??attempt.revision,recordedAt:now.toISOString()}})}});
   await recordAudit(tx,changed,{id:'agent:work',name:'Executor SDLC'},'WORK_TASK_STATUS_CHANGED','Tarefa concluída mediante a evidência desta tentativa.',{attemptId:attempt.id,activityId:attempt.activityId,revision:args.revision??attempt.revision},'agent',{before:{status:task.status,version:task.version},after:{status:changed.status,version:changed.version},initiator:{id:attempt.actorId,name:attempt.actorName,type:'human'},operationId:attempt.sourceId,attemptId:attempt.id});
  }
  if(taskIds.length)await h.event(tx,story,{id:'agent:work',name:'Executor SDLC'},'WORK_TASKS_COMPLETED','Conclusão das Tarefas vinculadas registrada com evidência desta tentativa.',{attemptId:attempt.id,activityId:attempt.activityId,taskIds,revision:args.revision??attempt.revision},'agent',{initiator:{id:attempt.actorId,name:attempt.actorName,type:'human'},operationId:attempt.sourceId,attemptId:attempt.id});
 }
}
export function workLinksVersion(links:ReadonlyArray<{taskId:string;scope:string;completion:string}>){
 const tuples=links.map(link=>[link.taskId,link.scope,link.completion]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 return createHash('sha256').update(JSON.stringify(tuples)).digest('hex');
}
export async function bindActivityTasks(tx:Transaction,h:AssistantHelpers,args:{activityId:string;expectedLinksVersion:string;taskIds:{taskId:string;scope:string;completion?:'publish_code'|'manual_evidence'}[];person:Person}){
 // Complete replacement requires one serialized read/compare/write, including callers
 // outside the portal's global command lock. A stale tab must not erase newer links.
 await tx.$queryRaw`SELECT "id" FROM "WorkActivity" WHERE "id"=${args.activityId} FOR UPDATE`;
 const currentLinks=await tx.workTaskLink.findMany({where:{activityId:args.activityId}});
 if(workLinksVersion(currentLinks)!==args.expectedLinksVersion)throw new DomainError('WORK_LINKS_CHANGED','Os vínculos foram alterados por outra interação. Revise a seleção atual antes de salvar novamente.',409);
 const activity=await tx.workActivity.findUniqueOrThrow({where:{id:args.activityId}});if(activity.kind!=='coding')throw new DomainError('WORK_LINK_KIND','Associe Tarefas planejadas à atividade de codificação.',409);
 const attempt=activity.currentAttemptId?await tx.workAttempt.findUnique({where:{id:activity.currentAttemptId}}):null;
 if(attempt&&['queued','running'].includes(attempt.state))throw new DomainError('WORK_BUSY','Aguarde a operação antes de alterar os vínculos das Tarefas.',409);
 if(new Set(args.taskIds.map(link=>link.taskId)).size!==args.taskIds.length)throw new DomainError('WORK_DUPLICATE_TASK','Selecione cada Tarefa uma única vez.',409);
 for(const link of args.taskIds){
  const task=await h.live(tx,link.taskId);
  if(task.kind!=='task'||task.parentId!==activity.storyId||task.archived||(task.data as Record<string,unknown>).workProcess)throw new DomainError('WORK_LINK_SCOPE','Selecione Tarefas planejadas desta História.',409);
  if(!link.scope.trim()||link.scope.length>2000)throw new DomainError('WORK_LINK_SCOPE','Descreva o escopo atendido para cada Tarefa.',409);
  const explicit=await tx.itemRepository.findMany({where:{itemId:task.id}});if(explicit.length&&!explicit.some(r=>r.repositoryId===activity.repositoryId))throw new DomainError('WORK_LINK_REPOSITORY','O componente da Tarefa não corresponde a esta execução.',409);
  await tx.workTaskLink.upsert({where:{activityId_taskId:{activityId:activity.id,taskId:task.id}},create:{activityId:activity.id,taskId:task.id,scope:link.scope,completion:link.completion??'manual_evidence',actorId:args.person.id,actorName:args.person.name},update:{scope:link.scope,completion:link.completion??'manual_evidence',actorId:args.person.id,actorName:args.person.name}});
 }
 await tx.workTaskLink.deleteMany({where:{activityId:activity.id,taskId:{notIn:args.taskIds.map(link=>link.taskId)}}});
 if(attempt)await event(tx,attempt.id,`tasks-bound:${randomUUID()}`,'tasks_bound',attempt.stage,'Usuário definiu explicitamente o escopo das Tarefas atendidas.',{payload:{taskIds:args.taskIds.map(t=>t.taskId),actorId:args.person.id}});
 await h.event(tx,await h.live(tx,activity.storyId),args.person,'WORK_TASKS_BOUND','Tarefas associadas à codificação com escopo e condição de conclusão explícitos.',{activityId:activity.id,taskIds:args.taskIds.map(t=>t.taskId)},'human',{before:{links:currentLinks.map(link=>({taskId:link.taskId,scope:link.scope,completion:link.completion}))},after:{links:args.taskIds.map(link=>({taskId:link.taskId,scope:link.scope,completion:link.completion??'manual_evidence'}))},operationId:activity.id,subject:{type:'work_activity',id:activity.id}});
 return activity;
}
export async function invalidateActivities(tx:Transaction,args:{storyId:string;repositoryId:string;kinds:string[];reason:string;person?:Person;reopenTasks?:boolean}){
 const activities=await tx.workActivity.findMany({where:{storyId:args.storyId,repositoryId:args.repositoryId,kind:{in:args.kinds}}});
 for(const activity of activities){
  const task=activity.taskId?await tx.item.findUniqueOrThrow({where:{id:activity.taskId}}):null,attempt=activity.currentAttemptId?await tx.workAttempt.findUnique({where:{id:activity.currentAttemptId}}):null;
  if(attempt?.waitingSince){await event(tx,attempt.id,`wait-resolved:${randomUUID()}`,'wait_resolved',attempt.stage,args.reason,{category:attempt.errorCategory??undefined,payload:{durationMs:Math.max(0,Date.now()-attempt.waitingSince.getTime()),waitKind:attempt.state,category:attempt.errorCategory,resolution:'correction_or_recheck_requested'}});await tx.workAttempt.update({where:{id:attempt.id},data:{waitingSince:null}});}
  if(args.reopenTasks!==false&&task?.status==='done'){
   const changed=await tx.item.update({where:{id:task.id},data:{status:'todo',version:{increment:1}}});
   await recordAudit(tx,changed,{id:'agent:work',name:'Executor SDLC'},'WORK_TASK_STATUS_CHANGED','Tarefa reaberta porque a evidência anterior não autoriza a revisão atual.',{activityId:activity.id,...(attempt?{attemptId:attempt.id}:{})},'agent',{before:{status:task.status,version:task.version},after:{status:changed.status,version:changed.version},...(args.person?{initiator:{...args.person,type:'human' as const}}:attempt?{initiator:{id:attempt.actorId,name:attempt.actorName,type:'human' as const}}:{}),operationId:activity.id,reasonCode:'EVIDENCE_INVALIDATED'});
   if(attempt)await event(tx,attempt.id,`reopened:${randomUUID()}`,'reopened',attempt.stage,args.reason,{payload:{taskIds:[task.id],reason:args.reason}});
  }
 }
}
export async function listStoryActivities(tx:Transaction,storyId:string){
 const activities=await tx.workActivity.findMany({where:{storyId},include:{taskLinks:true,attempts:{orderBy:[{queuedAt:'desc'},{id:'desc'}],include:{events:{orderBy:[{timestamp:'asc'},{id:'asc'}]}}}},orderBy:{createdAt:'asc'}});
 const ids=activities.flatMap(a=>[a.taskId,...a.taskLinks.map(l=>l.taskId)]).filter((id):id is string=>!!id),tasks=await tx.item.findMany({where:{id:{in:ids}}});
 return activities.map(a=>({...a,task:tasks.find(t=>t.id===a.taskId)??null,taskLinks:a.taskLinks.map(l=>({...l,task:tasks.find(t=>t.id===l.taskId)??null}))}));
}
