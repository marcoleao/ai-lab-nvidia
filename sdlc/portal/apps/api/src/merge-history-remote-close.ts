import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeProvider,MergeInspection} from './merge-provider.ts';
import type {MergeHistoryConsult} from './merge-history-reconciliation.ts';
import {historicalMergeContext} from './merge-history-context.ts';
import {mergeClosureObservationSchema,mergeOpenClosureObservationSchema} from './merge-closure-observation.ts';
import {observedIntegrationSchema,integrationReadings} from './merge-integration-reference.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';

export function registerMergeHistoryRemoteClose(app:FastifyInstance,h:AssistantHelpers,consult:MergeHistoryConsult,provider?:MergeProvider){
 app.get<{Params:{id:string}}>('/api/merge-operations/:id/remote-close',async request=>{
  const op=await h.db.mergeOperation.findUnique({where:{id:request.params.id}});if(!op)throw new DomainError('MERGE_NOT_FOUND','Operação não encontrada.',404);
  await h.db.$transaction(tx=>h.live(tx,op.storyId,true));
  return {integrationReference:(await h.db.$transaction(tx=>integrationReadings(tx,[op.id]))).get(op.id)};
 });
 app.post<{Params:{id:string}}>('/api/merge-operations/:id/remote-close',async request=>{
  const body=z.object({confirmed:z.literal(true),contextToken:z.string().regex(/^[a-f0-9]{64}$/),observation:mergeOpenClosureObservationSchema,reason:z.string().trim().min(10).max(2000)}).strict().parse(request.body);
  const person=h.actor(request);h.canPlan(person);const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']),id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
  const cached=()=>h.mutate(request,async()=>{throw Error('Expected remote close receipt');});
  if(await h.db.requestKey.findUnique({where:{id}}))return cached();
  let reviewed:Awaited<ReturnType<MergeHistoryConsult>>;
  try{reviewed=await consult(request.params.id);if(!reviewed.remoteCloseAllowed||body.contextToken!==reviewed.contextToken||auditFingerprint(body.observation)!==auditFingerprint(reviewed.openObservation))throw new DomainError('HISTORY_REMOTE_CLOSE_CHANGED','O MR ou o contexto mudou. Consulte novamente e confirme o fechamento da mesma revisão.',409);}
  catch(error){if(await h.db.requestKey.findUnique({where:{id}}))return cached();throw error;}
  return h.mutate(request,async(tx,actor)=>{
   const current=await historicalMergeContext(tx,h,request.params.id);
   if(current.digest!==reviewed.local.digest||current.op.state==='succeeded'||await tx.mergeIntegrationReference.count({where:{operationId:current.op.id}})||await tx.workAttempt.count({where:{sourceType:'merge',sourceId:current.op.id,state:'succeeded'}}))throw new DomainError('HISTORY_REMOTE_CLOSE_CHANGED','O contexto ou a integração registrada mudou. Atualize antes de fechar.',409);
   const job=await tx.mergeHistoryCloseOperation.create({data:{mergeOperationId:current.op.id,executionId:current.run.id,storyId:current.story.id,projectId:current.op.projectId,iid:current.op.iid,sourceBranch:current.op.sourceBranch,targetBranch:current.op.targetBranch,sha:current.op.sha,remoteUpdatedAt:body.observation.updatedAt,contextDigest:current.digest,reason:body.reason,actorId:actor.id,actorName:actor.name,message:'Fechamento solicitado. Aguardando execução; o MR ainda não foi confirmado como fechado.'}});
   await h.event(tx,current.story,actor,'MERGE_HISTORY_CLOSE_REQUESTED','Fechamento do MR anterior solicitado para a revisão confirmada; resultado remoto ainda pendente.',{operationId:job.id,remoteClosureId:job.id,runId:job.executionId,sourceSha:job.sha,reasonDigest:auditFingerprint(job.reason)},'human',{before:{state:null},after:{state:'queued',remoteClosureId:job.id},operationId:job.id,subject:{type:'merge_history_close',id:job.id}});
   return {receiptType:'remote_close_requested',integrationReference:(await integrationReadings(tx,[current.op.id])).get(current.op.id)};
  });
 });
 app.post<{Params:{id:string;jobId:string}}>('/api/merge-operations/:id/remote-close/:jobId/reconcile',async request=>{
  z.object({}).strict().parse(request.body);
  return h.mutate(request,async(tx,actor)=>{
   const job=await tx.mergeHistoryCloseOperation.findUnique({where:{id:request.params.jobId}});if(!job||job.mergeOperationId!==request.params.id)throw new DomainError('HISTORY_CLOSE_NOT_FOUND','Pedido de fechamento não encontrado nesta operação.',404);
   const story=await h.live(tx,job.storyId,true);
   if(['queued','running','succeeded','merged'].includes(job.state)){
    await h.event(tx,story,actor,'MERGE_HISTORY_CLOSE_RECONCILIATION_REQUESTED','O acompanhamento do mesmo pedido já está disponível; nenhuma nova execução foi solicitada.',{operationId:job.id,remoteClosureId:job.id,runId:job.executionId},'human',{outcome:'NO_CHANGE',phase:'COMPLETED',before:{state:job.state,version:job.version},after:{state:job.state,version:job.version},operationId:job.id,subject:{type:'merge_history_close',id:job.id}});
    return {receiptType:'remote_close_reconciliation',integrationReference:(await integrationReadings(tx,[job.mergeOperationId])).get(job.mergeOperationId)};
   }
   await tx.mergeHistoryCloseOperation.update({where:{id:job.id},data:{state:'queued',reconcileOnly:true,version:{increment:1},message:'Verificação do resultado solicitada. Este pedido somente consulta o GitLab.',leaseId:null,leaseUntil:null}});
   await h.event(tx,story,actor,'MERGE_HISTORY_CLOSE_RECONCILIATION_REQUESTED','Consulta do resultado do mesmo fechamento solicitada, sem autorização para repetir a escrita.',{operationId:job.id,remoteClosureId:job.id,runId:job.executionId},'human',{before:{state:job.state,version:job.version},after:{state:'queued',version:job.version+1},operationId:job.id,subject:{type:'merge_history_close',id:job.id}});
   return {receiptType:'remote_close_reconciliation',integrationReference:(await integrationReadings(tx,[job.mergeOperationId])).get(job.mergeOperationId)};
  });
 });
 let processing=false;
 async function processHistoryCloseJobs(){
  if(processing||!provider)return false;processing=true;
  try{
   const claimed=await h.db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
    const now=new Date(),job=await tx.mergeHistoryCloseOperation.findFirst({where:{OR:[{state:'queued'},{state:'running',leaseUntil:{lt:now}}]},orderBy:[{createdAt:'asc'},{id:'asc'}]});if(!job)return null;
    const value=await tx.mergeHistoryCloseOperation.update({where:{id:job.id},data:{state:'running',leaseId:randomUUID(),leaseUntil:new Date(Date.now()+180000),version:{increment:1}}});
    const story=await tx.item.findUniqueOrThrow({where:{id:job.storyId}});
    await h.event(tx,story,{id:'agent:merge',name:'Assistente de integração'},'MERGE_HISTORY_CLOSE_STARTED','Verificação do pedido de fechamento iniciada; o efeito remoto ainda não está confirmado.',{operationId:job.id,remoteClosureId:job.id,runId:job.executionId},'agent',{before:{state:job.state,version:job.version},after:{state:'running',version:value.version},operationId:job.id,attemptId:value.leaseId!,initiator:{id:job.actorId,name:job.actorName,type:'human'},subject:{type:'merge_history_close',id:job.id}});
    return value;
   });
   if(!claimed)return false;
   let state='unknown',message='O resultado do fechamento ainda não foi confirmado. Verifique o mesmo pedido.',action='MERGE_HISTORY_CLOSE_UNCONFIRMED';
   const ref={projectId:claimed.projectId,iid:claimed.iid,sourceBranch:claimed.sourceBranch,targetBranch:claimed.targetBranch,sha:claimed.sha,remoteUpdatedAt:claimed.remoteUpdatedAt};
   const matches=(v:{projectId:number;iid:number;sourceBranch:string;targetBranch:string;sourceSha:string})=>v.projectId===ref.projectId&&v.iid===ref.iid&&v.sourceBranch===ref.sourceBranch&&v.targetBranch===ref.targetBranch&&v.sourceSha===ref.sha;
   let wrote=Boolean(claimed.writeStartedAt),alreadyClosed=false;
   try{
    let result:MergeInspection=await provider.inspect(ref);
    if(!wrote&&!claimed.reconcileOnly&&result.state==='opened'){
     if(!provider.closeHistorical)throw new DomainError('HISTORY_CLOSE_UNAVAILABLE','O executor de fechamento não está configurado.',503);
     const open=mergeOpenClosureObservationSchema.safeParse(result.openForClosure);
     if(!open.success||!matches(open.data)||open.data.updatedAt!==claimed.remoteUpdatedAt||result.blocks.some(b=>b.category==='changed'))throw new DomainError('HISTORY_CLOSE_STALE','O MR mudou desde a confirmação. Consulte e revise um novo pedido antes de fechar.',409);
     await h.db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const own=await tx.mergeHistoryCloseOperation.findUniqueOrThrow({where:{id:claimed.id}});
      if(own.state!=='running'||own.leaseId!==claimed.leaseId||!own.leaseUntil||own.leaseUntil<=new Date())throw new DomainError('HISTORY_CLOSE_LEASE_EXPIRED','O prazo do executor expirou. Verifique o resultado do pedido.',409);
      const local=await historicalMergeContext(tx,h,claimed.mergeOperationId,claimed.id);
      if(local.digest!==claimed.contextDigest||local.op.state==='succeeded'||await tx.mergeIntegrationReference.count({where:{operationId:local.op.id}}))throw new DomainError('HISTORY_CLOSE_STALE','O contexto mudou antes da execução. Consulte e revise um novo pedido.',409);
      const started=await tx.mergeHistoryCloseOperation.update({where:{id:claimed.id},data:{writeStartedAt:new Date(),version:{increment:1}}});
      await h.event(tx,local.story,{id:'agent:merge',name:'Assistente de integração'},'MERGE_HISTORY_CLOSE_WRITE_PLANNED','Intenção de fechamento registrada antes da comunicação com o GitLab.',{operationId:claimed.id,remoteClosureId:claimed.id,runId:claimed.executionId},'agent',{before:{writeStartedAt:null},after:{writeStartedAt:started.writeStartedAt},operationId:claimed.id,attemptId:claimed.leaseId!,initiator:{id:claimed.actorId,name:claimed.actorName,type:'human'},subject:{type:'merge_history_close',id:claimed.id}});
     });
     wrote=true;result=await provider.closeHistorical(ref);
    }else alreadyClosed=result.state==='closed';
    const closed=mergeClosureObservationSchema.safeParse(result.closure),merged=observedIntegrationSchema.safeParse(result.integration);
    if(result.state==='closed'&&closed.success&&matches(closed.data)&&result.sha===ref.sha&&!result.blocks.some(b=>b.category==='changed')){state='succeeded';action='MERGE_HISTORY_CLOSE_COMPLETED';message=alreadyClosed?'MR já estava fechado na consulta. Encerre o acompanhamento local se ainda estiver pendente.':'MR fechado no GitLab. Encerre o acompanhamento local do pedido anterior para concluir essa resolução.';}
    else if(result.state==='merged'&&merged.success&&matches(merged.data)&&!result.blocks.length){state='merged';action='MERGE_HISTORY_CLOSE_MERGED';message='O GitLab informou MR integrado, não fechamento. Consulte e confirme essa integração para preservar a referência histórica.';}
    else if(result.state==='opened'&&claimed.reconcileOnly){state='blocked';message='O MR estava aberto na última consulta; o fechamento anterior não foi confirmado. Revise e confirme um novo pedido se ainda desejar fechá-lo.';}
    else if(!wrote&&!claimed.reconcileOnly){state='blocked';action='MERGE_HISTORY_CLOSE_BLOCKED';message='A consulta não confirmou as condições do mesmo MR para fechar. Atualize e revise antes de outro pedido.';}
   }catch(error){
    const blocked=error instanceof DomainError&&['HISTORY_CLOSE_STALE','HISTORY_REMOTE_CLOSE_PENDING','HISTORY_OPERATION_BUSY','HISTORY_OPERATION_UNAVAILABLE','HISTORY_REPOSITORY_CHANGED','HISTORY_CURRENT_EXECUTION','ITEM_NOT_FOUND','PROJECT_CLOSED','HISTORY_CLOSE_UNAVAILABLE','HIERARCHY_INACTIVE','HIERARCHY_CLOSED','ITEM_ARCHIVED','STORY_FINISHED','STORY_CANCELLATION_PENDING'].includes(error.code)&&!wrote;
    if(blocked){state='blocked';action='MERGE_HISTORY_CLOSE_BLOCKED';}
    message=error instanceof DomainError?error.message:'A confirmação do GitLab não chegou. Verifique o resultado do mesmo fechamento antes de outra ação.';
   }
   await h.db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
    const own=await tx.mergeHistoryCloseOperation.findUniqueOrThrow({where:{id:claimed.id}});
    if(own.state!=='running'||own.leaseId!==claimed.leaseId)return;
    if(!own.leaseUntil||own.leaseUntil<=new Date()){state='unknown';action='MERGE_HISTORY_CLOSE_UNCONFIRMED';message='A resposta chegou após o prazo. Verifique o mesmo pedido; nenhuma nova escrita será executada por essa consulta.';}
    const value=await tx.mergeHistoryCloseOperation.update({where:{id:own.id},data:{state,message,version:{increment:1},checkedAt:new Date(),leaseId:null,leaseUntil:null}}),story=await tx.item.findUniqueOrThrow({where:{id:own.storyId}});
    await h.event(tx,story,{id:'agent:merge',name:'Assistente de integração'},action,message,{operationId:own.id,remoteClosureId:own.id,runId:own.executionId,alreadyClosed},'agent',{before:{state:'running',version:own.version},after:{state,version:value.version},operationId:own.id,attemptId:claimed.leaseId!,initiator:{id:own.actorId,name:own.actorName,type:'human'},subject:{type:'merge_history_close',id:own.id}});
   });
   return true;
  }finally{processing=false;}
 }
 return {processHistoryCloseJobs};
}
