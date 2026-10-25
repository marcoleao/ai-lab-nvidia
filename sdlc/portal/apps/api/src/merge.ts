import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeProvider} from './merge-provider.ts';
import type {MergeOperation,Prisma} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import {registerMergeDiscussion,mergeGuidance} from './merge-discussion.ts';
import {mergeReadiness,requireMergeReadiness} from './merge-readiness.ts';
import {checkExecutionScope} from './execution.ts';
import {enqueueAttempt,currentAttempt,startAttempt,finishAttempt,progress,withWorkHeartbeat,workErrorCategory} from './work-activities.ts';

export function registerMerge(app:FastifyInstance,h:AssistantHelpers,provider?:MergeProvider){
 const {processMergeDiscussionJobs}=registerMergeDiscussion(app,h,provider);
 const publicJob=(job:MergeOperation|null)=>job?{id:job.id,state:job.state,sha:job.sha,projectId:job.projectId,iid:job.iid,sourceBranch:job.sourceBranch,targetBranch:job.targetBranch,message:job.message,blocks:job.blocks,origin:job.origin,mergedBy:job.mergedBy,requestedAt:job.requestedAt,finishedAt:job.finishedAt,checkedAt:job.checkedAt}:null;
 app.get<{Params:{id:string}}>('/api/executions/:id/merge',async request=>{
  const run=await h.db.storyExecution.findUnique({where:{id:request.params.id}});
  if(!run)throw new DomainError('EXECUTION_NOT_FOUND','Execução não encontrada.',404);
  await h.db.$transaction(tx=>h.live(tx,run.storyId));
  const repository=await h.db.repository.findUnique({where:{id:run.repositoryId},select:{name:true}});
  const operation=await h.db.mergeOperation.findUnique({where:{executionId:run.id}});
  const quality=await h.db.$transaction(tx=>mergeReadiness(tx,run));
  return {operation:publicJob(operation),quality,guidance:(quality.ready?'':'Antes de integrar, execute CODE REVIEW e SECURITY SCAN na faixa de verificações. Havendo achados, consulte o resultado e use Solicitar correção à IA. Conversar não aprova essas fases.\n\n')+mergeGuidance(operation?.blocks),configured:!!provider,repositoryName:repository?.name??null};
 });
 app.post<{Params:{id:string}}>('/api/executions/:id/merge',async request=>{
  const body=z.object({expectedSha:z.string().regex(/^[a-f0-9]{40,64}$/),expectedVersion:z.number().int().positive()}).strict().parse(request.body);
  return h.mutate(request,async(tx,person)=>{
   if(!provider)throw new DomainError('MERGE_NOT_CONFIGURED','A conta exclusiva de merge ainda não está configurada.',503);
   const run=await tx.storyExecution.findUnique({where:{id:request.params.id}});
   if(!run)throw new DomainError('EXECUTION_NOT_FOUND','Execução não encontrada.',404);
   const story=await h.live(tx,run.storyId);await h.ensureNotArchived(tx,story);
   const job=await tx.mergeOperation.findUnique({where:{executionId:run.id}});
   const links=await tx.itemRepository.findMany({where:{itemId:story.id}});
   if(!job||run.state!=='succeeded'||run.commitSha!==body.expectedSha||job.sha!==body.expectedSha||story.version!==body.expectedVersion||story.version!==run.storyVersion||links.length!==1||links[0].repositoryId!==run.repositoryId)throw new DomainError('MERGE_STALE','A História ou a entrega mudou. Atualize e revise antes de solicitar o merge.',409);
   const scope=await checkExecutionScope(h,tx,run);if(!scope.current)throw new DomainError('MERGE_STALE',scope.reason||'O escopo aprovado mudou. Prepare nova especificação e G1.',409);
   if(job.state==='succeeded')return {operation:publicJob(job)};
   await requireMergeReadiness(tx,run);
   if(['queued','running'].includes(job.state))throw new DomainError('MERGE_BUSY','Já existe uma solicitação em andamento. Consulte o resultado.',409);
   // Failure can mean an uncertain external result. Preserve its original intent.
   const reconcile=job.state==='failed';
   const updated=await tx.mergeOperation.update({where:{id:job.id},data:{state:'queued',message:'Solicitação recebida; o assistente consultará as condições reais do GitLab.',blocks:[],leaseId:null,leaseUntil:null,...(!reconcile?{actorId:person.id,actorName:person.name,requestedAt:new Date(),finishedAt:null,origin:'assistant'}:{})}});
   await enqueueAttempt(tx,h,{storyId:run.storyId,repositoryId:run.repositoryId,kind:'merge',sourceType:'merge',sourceId:job.id,sourceKey:`merge:${job.id}:${randomUUID()}`,revision:job.sha,person});
   await h.event(tx,story,person,reconcile?'MERGE_RECONCILIATION_REQUESTED':'MERGE_REQUESTED',reconcile?'Consulta do resultado incerto solicitada, preservando a intenção original.':'Merge solicitado ao assistente para o commit revisado.',{metricsVersion:1,operationId:job.id,runId:run.id,sha:job.sha,iid:job.iid,origin:'assistant'});
   return {operation:publicJob(updated)};
  });
 });
 let processing=false;
 async function processMergeJobs(){
  if(processing||!provider)return;processing=true;
  try{
   const job=await h.db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
    const now=new Date();
    const next=await tx.mergeOperation.findFirst({where:{OR:[{state:'queued'},{state:'running',leaseUntil:{lt:now}}],AND:[{OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]}]},orderBy:[{checkedAt:'asc'},{id:'asc'}]})??await tx.mergeOperation.findFirst({where:{state:{in:['tracking','blocked','failed']},checkedAt:{lt:new Date(Date.now()-30000)},OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},orderBy:[{checkedAt:'asc'},{id:'asc'}]});
    if(!next)return null;
    // Tracking and failure reconciliation never issue another merge PUT.
    const active=next.state==='queued'||next.state==='running';
    const claimed=await tx.mergeOperation.update({where:{id:next.id},data:{state:active?'running':next.state,leaseId:randomUUID(),leaseUntil:new Date(Date.now()+120000),checkedAt:now}});
    const work=await currentAttempt(tx,'merge',claimed.id);if(active&&work)await startAttempt(tx,work.sourceKey,claimed.leaseId!,'gitlab_reconcile');
    return {value:claimed,previous:next.state,active};
   });
   if(!job)return;
   const {value,active,previous}=job;
   const work=await h.db.$transaction(tx=>currentAttempt(tx,'merge',value.id));
   const report=async(stage:string,message:string)=>{if(work&&active)await progress(h.db,work.sourceKey,value.leaseId!,{stage,message,provider:'gitlab'});};
   let errorCategory:string|undefined;
   let state=previous==='running'?'failed':previous,message='Aguardando solicitação ou atualização no GitLab.',blocks:unknown[]=[],origin=value.origin,mergedBy=value.mergedBy,finishedAt=value.finishedAt,action:string|undefined,payload:Record<string,unknown>={};
   try{
    await withWorkHeartbeat(h.db,active?work?.sourceKey:undefined,value.leaseId,async()=>{
    const context=await h.db.$transaction(async tx=>{const story=await h.live(tx,value.storyId);await h.ensureNotArchived(tx,story);const run=await tx.storyExecution.findUniqueOrThrow({where:{id:value.executionId}});const links=await tx.itemRepository.findMany({where:{itemId:story.id}});const scope=await checkExecutionScope(h,tx,run);if(!scope.current)throw new DomainError('MERGE_STALE',scope.reason||'O escopo aprovado mudou.',409);return {story,run,links};});
    if(context.story.version!==context.run.storyVersion||context.run.commitSha!==value.sha||context.links.length!==1||context.links[0].repositoryId!==context.run.repositoryId)throw new DomainError('MERGE_STALE','O contexto da entrega mudou. Revise a História antes de integrar.',409);
    // Always reconcile before a write, including after worker restart/timeout.
    await report('gitlab_reconcile','Consultando o estado real do Merge Request antes de qualquer integração.');
    let result=await provider.inspect(value);
    if(active&&result.state!=='merged'){
     if(!result.targetSha)throw new DomainError('QUALITY_PHASES_REQUIRED','Não foi possível confirmar a base revisada para o merge.',409);
     await h.db.$transaction(tx=>requireMergeReadiness(tx,context.run,result.targetSha));
    }
    if(active&&result.state!=='merged'&&!result.blocks.length){
     const ownership=await h.db.mergeOperation.findUniqueOrThrow({where:{id:value.id}});
     if(ownership.leaseId!==value.leaseId||ownership.state!=='running'||!ownership.leaseUntil||ownership.leaseUntil.getTime()<=Date.now())throw new DomainError('MERGE_LEASE_EXPIRED','Prazo da operação expirado. O resultado será consultado antes de qualquer nova integração.',409);
     await h.db.$transaction(async tx=>{const fresh=await tx.storyExecution.findUniqueOrThrow({where:{id:value.executionId}}),scope=await checkExecutionScope(h,tx,fresh);if(!scope.current||fresh.commitSha!==value.sha||fresh.state!=='succeeded')throw new DomainError('MERGE_STALE',scope.reason||'A revisão mudou antes da integração.',409);});
     await report('gitlab_merge','Condições confirmadas; solicitando a integração ao GitLab.');result=await provider.merge({...value,expectedTargetSha:result.targetSha});await report('gitlab_response','Resposta da operação recebida; confirmando o resultado.');
    }
    blocks=result.blocks;
    if(result.state==='merged'&&!blocks.length){
     state='succeeded';mergedBy=result.mergedBy;origin=result.mergedBy==='sdlc-agent-for-merge'?'assistant':'human';finishedAt=result.mergedAt?new Date(result.mergedAt):new Date();message='Código integrado no GitLab. A História não foi concluída e nenhum deploy foi iniciado.';action='MERGE_COMPLETED';
    }else if(active){state='blocked';message=blocks.length?result.blocks.map(block=>block.message).join(' '):'O GitLab ainda não confirmou o merge. Consulte o resultado antes de tentar novamente.';finishedAt=new Date();action='MERGE_BLOCKED';}
    else{message=blocks.length?result.blocks.map(block=>block.message).join(' '):'MR consultado. Você pode revisar no GitLab ou solicitar o merge ao assistente.';}
    payload={origin,mergedBy,categories:result.blocks.map(block=>block.category),...(value.requestedAt&&finishedAt&&origin==='assistant'?{durationMs:Math.max(0,finishedAt.getTime()-value.requestedAt.getTime())}:{})};
    if(state==='blocked')errorCategory=result.blocks[0]?.category??'integration_checks';
    });
   }catch(error){
    message=error instanceof DomainError?error.message:'Falha ao consultar o resultado. Nenhum sucesso foi presumido.';
    const code=error instanceof DomainError?error.code:'MERGE_ERROR';
    errorCategory=workErrorCategory(error);
    const blocked=['MERGE_ACCESS_DENIED','MERGE_IDENTITY_INVALID','MERGE_SCOPE_DENIED','MERGE_STALE','MERGE_REFERENCE_INVALID','MERGE_REFUSED','QUALITY_PHASES_REQUIRED','ITEM_NOT_FOUND','PROJECT_CLOSED'].includes(code);
    const category=['MERGE_STALE','MERGE_REFERENCE_INVALID'].includes(code)?'changed':['MERGE_REFUSED','QUALITY_PHASES_REQUIRED'].includes(code)?'checks':'access';
    if(active){state=blocked?'blocked':'failed';finishedAt=new Date();action=blocked?'MERGE_BLOCKED':'MERGE_FAILED';if(blocked)blocks=[{category,message}];}
    payload={errorCode:code,origin:value.origin,...(blocked?{categories:[category]}:{})};
   }
   await h.db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
    if(active&&state==='succeeded'&&(!value.leaseUntil||value.leaseUntil.getTime()<=Date.now())){state='failed';message='A resposta chegou após o prazo. O SDLC consultará o mesmo resultado no GitLab antes de confirmar a integração.';errorCategory='provider_unavailable';action='MERGE_FAILED';}
    const changed=await tx.mergeOperation.updateMany({where:{id:value.id,leaseId:value.leaseId,state:value.state},data:{state,message,blocks:blocks as Prisma.InputJsonValue,origin,mergedBy,finishedAt,checkedAt:new Date(),leaseId:null,leaseUntil:null}});
    if(changed.count&&work&&['succeeded','failed','blocked'].includes(state)&&(active||state==='succeeded')){
     const fresh=await tx.storyExecution.findUniqueOrThrow({where:{id:value.executionId}}),scope=await checkExecutionScope(h,tx,fresh),valid=scope.current&&fresh.commitSha===value.sha;
     await finishAttempt(tx,h,work.sourceKey,{state:valid?state:'stale',summary:valid?message:'Resultado preservado para o escopo anterior; as Tarefas atuais exigem novas evidências.',category:valid?errorCategory:'changed_scope',revision:value.sha,completeTask:state==='succeeded'&&valid,...(active?{leaseId:value.leaseId}:{})});
    }
    if(changed.count&&action){
     const item=await tx.item.findUniqueOrThrow({where:{id:value.storyId}});
     await h.event(tx,item,{id:'agent:merge',name:'Assistente de merge'},action,state==='succeeded'?'Merge confirmado no GitLab; consulte a evidência da operação.':state==='blocked'?'Merge impedido por uma condição registrada; consulte a operação.':'Resultado do merge ainda não confirmado; consulte a operação para reconciliação.',{metricsVersion:1,operationId:value.id,runId:value.executionId,sha:value.sha,iid:value.iid,...payload},'agent',{before:{state:previous},after:{state},operationId:value.id,subject:{type:'merge_operation',id:value.id},...(value.actorId&&value.actorName?{initiator:{id:value.actorId,name:value.actorName,type:'human' as const}}:{}),...(state==='failed'?{outcome:'UNKNOWN',phase:'OBSERVED'}:{})});
    }
   });
  }finally{processing=false;}
 }
 return {processMergeJobs,processMergeDiscussionJobs};
}
