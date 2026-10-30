import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeProvider} from './merge-provider.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {DomainError} from './errors.ts';
import {checkExecutionScope,executionStoryVersionCurrent} from './execution.ts';
import {repositoriesOfSystem} from './system-repository.ts';
import {hierarchyState} from './lifecycle-policy.ts';
import {requireMergeReadiness,mergeReadiness} from './merge-readiness.ts';

export async function mergePreparationView(tx:Transaction,runId:string,available:boolean){
 const run=await tx.storyExecution.findUniqueOrThrow({where:{id:runId}}),op=await tx.mergeOperation.findUnique({where:{executionId:runId}});
 const preparation=op?await tx.mergePreparation.findUnique({where:{operationId:op.id}}):null;
 const blocks=z.array(z.object({category:z.string(),message:z.string()})).catch([]).parse(op?.blocks);
 const quality=await mergeReadiness(tx,run);
 const eligible=!!op&&available&&run.state==='succeeded'&&run.commitSha===op.sha&&quality.ready&&blocks.some(b=>b.category==='draft')&&!blocks.some(b=>!['draft','checks'].includes(b.category))&&!['queued','running','failed'].includes(preparation?.state||'')&&!['queued','running','succeeded'].includes(op.state);
 return {eligible,preparation:preparation?{id:preparation.id,state:preparation.state,message:preparation.message,sha:preparation.sha}:null};
}

export function registerMergePreparation(app:FastifyInstance,h:AssistantHelpers,provider?:MergeProvider){
 async function context(tx:Transaction,runId:string,sha:string,version:number){
  const run=await tx.storyExecution.findUnique({where:{id:runId}});if(!run)throw new DomainError('EXECUTION_NOT_FOUND','Execução não encontrada.',404);
  const story=await h.live(tx,run.storyId);await h.ensureNotArchived(tx,story);
  const op=await tx.mergeOperation.findUnique({where:{executionId:run.id}}),repositories=await repositoriesOfSystem(tx,story),scope=await checkExecutionScope(h,tx,run);
  if(!op||run.state!=='succeeded'||run.commitSha!==sha||op.sha!==sha||story.version!==version||!executionStoryVersionCurrent(run,story)||!scope.current||repositories.length!==1||repositories[0].id!==run.repositoryId)throw new DomainError('MERGE_STALE','A História ou a revisão mudou. Consulte a proposta atual antes de liberar.',409);
  return {run,story,op};
 }
 app.post<{Params:{id:string}}>('/api/executions/:id/merge/prepare',async request=>{
  const body=z.object({expectedSha:z.string().regex(/^[a-f0-9]{40,64}$/),expectedVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
  return h.mutate(request,async(tx,person)=>{
   if(!provider?.releaseDraft)throw new DomainError('MERGE_PREPARATION_UNAVAILABLE','A liberação de rascunho não está configurada nesta integração.',503);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
   const {run,story,op}=await context(tx,request.params.id,body.expectedSha,body.expectedVersion);
   const prior=await tx.mergePreparation.findUnique({where:{operationId:op.id}});
   if(['queued','running'].includes(op.state)||op.leaseUntil&&op.leaseUntil>new Date())throw new DomainError('MERGE_BUSY','Aguarde a consulta ou integração em andamento.',409);
   if(prior&&['queued','running'].includes(prior.state))throw new DomainError('MERGE_PREPARATION_BUSY','Uma liberação já está em andamento. Consulte o resultado.',409);
   if(prior?.state==='succeeded'&&prior.sha===op.sha&&!z.array(z.object({category:z.string()})).catch([]).parse(op.blocks).some(b=>b.category==='draft'))return {preparation:{id:prior.id,state:prior.state,message:prior.message}};
   const view=await mergePreparationView(tx,run.id,true),reconcile=prior?.state==='failed';
   if(!reconcile)await requireMergeReadiness(tx,run);
   if(!reconcile&&!view.eligible)throw new DomainError('MERGE_PREPARATION_BLOCKED','Há outras pendências ou a revisão não permite liberar Draft. Consulte o diagnóstico.',409);
   const value={executionId:run.id,storyId:story.id,sha:op.sha,storyVersion:story.version,state:'queued',actorId:person.id,actorName:person.name,leaseId:null,leaseUntil:null,reconcileOnly:reconcile,message:reconcile?'Consulta do resultado da liberação solicitada.':'Liberação de rascunho solicitada. Esta ação não faz merge.',...(!reconcile?{writeStartedAt:null}:{})};
   const job=await tx.mergePreparation.upsert({where:{operationId:op.id},create:{operationId:op.id,...value},update:value});
   await h.event(tx,story,person,'MERGE_PREPARATION_REQUESTED','Liberação de rascunho solicitada para a revisão confirmada.',{operationId:job.id,runId:run.id,sha:op.sha,iid:op.iid,reconcile:!!reconcile},'human',{before:{state:prior?.state??null},after:{state:'queued'},operationId:job.id});
   return {preparation:{id:job.id,state:job.state,message:job.message}};
  });
 });
 async function processMergePreparationJobs(){
  if(!provider?.releaseDraft)return false;
  const job=await h.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
   const now=new Date(),next=await tx.mergePreparation.findFirst({where:{OR:[{state:'queued'},{state:'running',leaseUntil:{lt:now}}]},orderBy:{updatedAt:'asc'}});
   if(!next)return null;
   const story=await tx.item.findUnique({where:{id:next.storyId}});if(!story||!(await hierarchyState(tx,story)).writable)return null;
   const op=await tx.mergeOperation.findUniqueOrThrow({where:{id:next.operationId}});if(['queued','running'].includes(op.state)||op.leaseUntil&&op.leaseUntil>now)return null;
   return tx.mergePreparation.update({where:{id:next.id},data:{state:'running',leaseId:randomUUID(),leaseUntil:new Date(Date.now()+120000),reconcileOnly:next.reconcileOnly||next.state==='running'||!!next.writeStartedAt}});
  });
  if(!job)return false;
  let state='failed',message='Não foi possível confirmar a liberação. Consulte o mesmo resultado antes de continuar.',draftBefore:boolean|undefined,draftAfter:boolean|undefined;
  let result:Awaited<ReturnType<MergeProvider['inspect']>>|undefined;
  try{
   const ctx=await h.db.$transaction(tx=>context(tx,job.executionId,job.sha,job.storyVersion));
   result=await provider.inspect(ctx.op);draftBefore=result.draft??result.blocks.some(b=>b.category==='draft');
   if(result.state==='merged'&&result.sha===job.sha&&!result.blocks.length)throw new DomainError('MERGE_PREPARATION_BLOCKED','A integração desta revisão já foi confirmada; não é necessário liberar o rascunho.',409);
   if(result.sha!==job.sha||result.state!=='opened'||result.blocks.some(b=>['changed','closed','access'].includes(b.category)))throw new DomainError('MERGE_PREPARATION_BLOCKED','A revisão, o estado ou o acesso mudou. Revise a proposta antes de liberar.',409);
   if(draftBefore&&!job.reconcileOnly){
    if(!result.targetSha||result.blocks.some(b=>!['draft','checks'].includes(b.category)))throw new DomainError('MERGE_PREPARATION_BLOCKED','Resolva as demais pendências antes de liberar o rascunho.',409);
    await h.db.$transaction(async tx=>{
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
     const fresh=await context(tx,job.executionId,job.sha,job.storyVersion);await requireMergeReadiness(tx,fresh.run,result!.targetSha);
     const owned=await tx.mergePreparation.updateMany({where:{id:job.id,state:'running',leaseId:job.leaseId,leaseUntil:{gt:new Date()}},data:{writeStartedAt:new Date()}});
     if(!owned.count)throw new DomainError('MERGE_PREPARATION_LEASE','O prazo da liberação expirou. Consulte o resultado.',409);
    });
    result=await provider.releaseDraft({...ctx.op,expectedTargetSha:result.targetSha});
   }
   draftAfter=result.draft??result.blocks.some(b=>b.category==='draft');
   if(result.sha!==job.sha||result.state!=='opened'||result.blocks.some(b=>b.category==='changed'))throw new DomainError('MERGE_PREPARATION_BLOCKED','A revisão mudou durante a liberação. Nenhuma integração foi autorizada.',409);
   state=draftAfter?'blocked':'succeeded';message=draftAfter?'O MR permanece em Draft. Revise e confirme uma nova liberação.':'Draft removido · integração ainda não solicitada. As demais verificações continuam obrigatórias.';
  }catch(error){
   message=error instanceof DomainError?error.message:'Não foi possível confirmar o resultado da liberação. Verifique o resultado antes de reenviar.';
   state=error instanceof DomainError&&['MERGE_PREPARATION_BLOCKED','MERGE_STALE','QUALITY_PHASES_REQUIRED','MERGE_ACCESS_DENIED','MERGE_SCOPE_DENIED','MERGE_IDENTITY_INVALID','ITEM_NOT_FOUND','PROJECT_CLOSED'].includes(error.code)?'blocked':'failed';
  }
  if(state==='succeeded'&&(!job.leaseUntil||job.leaseUntil<=new Date())){state='failed';message='A confirmação chegou após o prazo. Consulte o mesmo resultado antes de continuar.';}
  await h.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
   const updated=await tx.mergePreparation.updateMany({where:{id:job.id,state:'running',leaseId:job.leaseId},data:{state,message,leaseId:null,leaseUntil:null}});if(!updated.count)return;
   if(result&&state==='succeeded')await tx.mergeOperation.updateMany({where:{id:job.operationId,sha:job.sha,state:{notIn:['queued','running','succeeded']}},data:{state:'tracking',blocks:result.blocks,message,checkedAt:new Date()}});
   const story=await tx.item.findUniqueOrThrow({where:{id:job.storyId}});
   await h.event(tx,story,{id:'agent:merge',name:'Assistente de integração'},state==='succeeded'?'MERGE_PREPARATION_COMPLETED':state==='blocked'?'MERGE_PREPARATION_BLOCKED':'MERGE_PREPARATION_FAILED',state==='succeeded'?'Liberação do rascunho confirmada, sem integração de código.':'Liberação não concluída; consulte a operação.',{operationId:job.id,runId:job.executionId,sha:job.sha},'agent',{operationId:job.id,initiator:{id:job.actorId,name:job.actorName,type:'human'},before:{state:'running',draft:draftBefore??null},after:{state,draft:draftAfter??null},...(state==='failed'?{outcome:'UNKNOWN',phase:'OBSERVED'}:{})});
  });
  return true;
 }
 return {processMergePreparationJobs};
}
