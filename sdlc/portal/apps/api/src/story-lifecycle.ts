import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Transaction} from '../../../packages/db/client.ts';
import type {Item,Prisma} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {currentAuditContext} from './audit.ts';
import {ensureHierarchyWritable} from './lifecycle-policy.ts';

const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const data=(item:Item)=>item.data as Record<string,any>;
type Helpers=Pick<AssistantHelpers,'mutate'|'live'|'event'>;

/** The worker calls this only after persisting its reconciled publication result. */
export async function finalizeStoryCancellation(tx:Transaction,h:Pick<AssistantHelpers,'live'|'event'>,storyId:string,executor?:{id:string;name:string;type:'human'|'agent'|'system'}){
  const story=await h.live(tx,storyId),request=data(story).cancellationRequested;
  if(story.status==='cancelled')return {item:story,pending:false};
  if(!request)return {item:story,pending:false};
  if(await tx.storyExecution.count({where:{storyId,state:'cancel_pending'}}))return {item:story,pending:true};
  const person={id:String(request.actorId),name:String(request.actorName)},operationId=String(request.operationId),actor=executor??person,actorType=executor?.type??'human';
  const openTasks=await tx.item.findMany({where:{parentId:storyId,kind:'task',archived:false,status:{notIn:['done','cancelled']}},orderBy:{id:'asc'}});
  for(const task of openTasks){
    const changed=await tx.item.update({where:{id:task.id},data:{status:'cancelled',version:{increment:1},data:json({...data(task),cancellation:{storyId,operationId,actorId:person.id,at:new Date().toISOString()}})}});
    await h.event(tx,changed,actor,'WORK_TASK_STATUS_CHANGED','Tarefa aberta cancelada com a História; trabalhos concluídos preservados.',{storyId,operationId},actorType,{before:{status:task.status,version:task.version},after:{status:changed.status,version:changed.version},operationId,initiator:{...person,type:'human'}});
  }
  const attempts=await tx.workAttempt.findMany({where:{activity:{storyId},state:{notIn:['succeeded','cancelled','superseded']}},select:{id:true,stage:true}});
  for(const attempt of attempts){
    await tx.workAttempt.update({where:{id:attempt.id},data:{state:'cancelled',finishedAt:new Date(),waitingSince:null,summary:'Trabalho cancelado com a História; resultados anteriores preservados.'}});
    await tx.workEvent.upsert({where:{attemptId_key:{attemptId:attempt.id,key:`story-cancel:${operationId}`}},create:{attemptId:attempt.id,key:`story-cancel:${operationId}`,kind:'cancelled',stage:attempt.stage,message:'Tentativa cancelada com a História.',payload:{storyId,operationId}},update:{}});
  }
  const next:Record<string,any>={...data(story),cancellation:{...request,confirmedAt:new Date().toISOString()}};delete next.cancellationRequested;
  const changed=await tx.item.update({where:{id:storyId},data:{status:'cancelled',version:{increment:1},data:json(next)}});
  await h.event(tx,changed,actor,'STORY_CANCELLED','Cancelamento da História confirmado; artefatos e trabalhos concluídos preservados.',{metricsVersion:1,from:story.status,to:'cancelled',operationId},actorType,{before:{status:story.status,version:story.version},after:{status:changed.status,version:changed.version},operationId,initiator:{...person,type:'human'}});
  return {item:changed,pending:false};
}

export function registerStoryLifecycle(app:FastifyInstance,h:Helpers){
  app.post<{Params:{id:string}}>('/api/items/:id/cancel',async request=>{
    const body=z.object({expectedVersion:z.number().int().positive(),comment:z.string().trim().max(2000).optional()}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Cancelamento da entrega pertence à História.',409);
      if(story.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A História mudou; atualize antes de cancelar.',409);
      await ensureHierarchyWritable(tx,story,{includeSelf:false});
      if(story.status==='completed')throw new DomainError('STORY_FINISHED','Uma História concluída não pode ser cancelada.',409);
      if(story.status==='cancelled')throw new DomainError('STORY_ALREADY_CANCELLED','O cancelamento da História já foi confirmado.',409);
      if(data(story).cancellationRequested)throw new DomainError('STORY_CANCELLATION_PENDING','O cancelamento já foi solicitado. Consulte a confirmação da mesma operação.',409);
      // Later pipeline stages retain their independent effect reconciliation.
      if(await tx.mergeOperation.count({where:{storyId:story.id,state:'running'}}))throw new DomainError('MERGE_IN_PROGRESS','Aguarde a confirmação da integração em andamento antes de cancelar a História.',409);
      const operationId=currentAuditContext()?.operationId??`story-cancel:${story.id}:${story.version}`;
      const cancellationRequested={actorId:person.id,actorName:person.name,operationId,requestedAt:new Date().toISOString(),...(body.comment?{comment:body.comment}:{})};
      const marked=await tx.item.update({where:{id:story.id},data:{version:{increment:1},data:json({...data(story),cancellationRequested})}});
      const runs=await tx.storyExecution.findMany({where:{storyId:story.id,state:{notIn:['succeeded','cancelled']}},orderBy:{createdAt:'asc'}});
      for(const run of runs){
        const publishing=run.stage==='publishing'&&['running','cancel_pending'].includes(run.state);
        await tx.storyExecution.update({where:{id:run.id},data:{state:publishing?'cancel_pending':'cancelled',error:publishing?'Cancelamento solicitado; publicação será reconciliada.':'Cancelado com a História; saídas tardias não autorizam continuação.'}});
        await tx.executionMessage.updateMany({where:{executionId:run.id,state:{in:['queued','running','paused']}},data:{state:'cancelled'}});
      }
      await tx.chatTurn.updateMany({where:{session:{contextId:story.id},status:{in:['queued','running','paused']}},data:{status:'cancelled'}});
      await tx.qualityCheck.updateMany({where:{storyId:story.id,state:{in:['queued','running','paused']}},data:{state:'cancelled',finishedAt:new Date()}});
      await tx.mergeOperation.updateMany({where:{storyId:story.id,state:{in:['queued','paused']}},data:{state:'cancelled',finishedAt:new Date()}});
      await tx.mergeDiscussionTurn.updateMany({where:{operation:{storyId:story.id},state:{in:['queued','running','paused']}},data:{state:'cancelled'}});
      await h.event(tx,marked,person,'STORY_CANCELLATION_REQUESTED','Cancelamento solicitado; novas operações bloqueadas e publicação em andamento sujeita a confirmação.',{storyId:story.id,operationId},'human',{before:{state:'active',version:story.version},after:{state:'cancel_pending',version:marked.version},operationId});
      return finalizeStoryCancellation(tx,h,story.id);
    });
  });
  app.post<{Params:{id:string}}>('/api/items/:id/reopen',async request=>{
    const body=z.object({expectedVersion:z.number().int().positive(),comment:z.string().trim().min(10).max(2000)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Reabertura pertence à História.',409);
      if(story.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A História mudou. Atualize antes de reabrir.',409);
      await ensureHierarchyWritable(tx,story,{includeSelf:false});
      if(story.status!=='cancelled')throw new DomainError('INVALID_TRANSITION','Somente Histórias canceladas podem ser reabertas nesta fase.',409);
      const next={...data(story),reopening:{actorId:person.id,actorName:person.name,at:new Date().toISOString(),comment:body.comment},requiresNewG1:true};
      const changed=await tx.item.update({where:{id:story.id},data:{status:'specification',version:{increment:1},data:json(next)}});
      await h.event(tx,changed,person,'STORY_REOPENED','História reaberta para especificação e novo G1; Tarefas e artefatos anteriores preservados.',{metricsVersion:1,from:'cancelled',to:'specification'},'human',{before:{status:story.status,version:story.version},after:{status:changed.status,version:changed.version}});
      return {item:changed};
    });
  });
}
