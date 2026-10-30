import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import type {ReleaseBranchPreparation,Prisma} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import type {ReleaseBranchProvider} from './release-branch-provider.ts';
import type {BranchPreparationReading,BranchPreparationOperation,ReleaseBranchReference,BranchPreparationInspection} from '../../../packages/shared/src/release-branch-preparation.ts';
import {branchPolicyDigest} from './branch-plan-decisions.ts';
import {currentComposition} from './release-compositions.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';

type Helpers=Pick<AssistantHelpers,'db'|'actor'|'live'|'event'>;
const managers=['admin','release_manager'];
const unresolved=['queued','running','unknown','succeeded'];
const worker={id:'system:release-branch',name:'Preparação de branch da release'};
const summary=(row:ReleaseBranchPreparation):BranchPreparationOperation=>({id:row.id,number:row.number,decisionId:row.decisionId,state:row.state as BranchPreparationOperation['state'],message:row.message,branchName:row.branchName,baseSha:row.baseSha,observedSha:row.observedSha,protectionReady:row.protectionReady,actorName:row.actorName,createdAt:row.createdAt.toISOString(),checkedAt:row.checkedAt?.toISOString()??null});
const reference=(row:ReleaseBranchPreparation):ReleaseBranchReference=>({projectId:row.gitlabProjectId,branchName:row.branchName,baseSha:row.baseSha,defaultBranch:row.defaultBranch});

export function registerReleaseBranchPreparation(app:FastifyInstance,h:Helpers,provider?:ReleaseBranchProvider){
 async function context(tx:Transaction,id:string,includeArchived=false){
  const release=await tx.release.findUnique({where:{id}});if(!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
  const system=includeArchived?await tx.item.findUniqueOrThrow({where:{id:release.systemId}}):await h.live(tx,release.systemId),repository=await tx.repository.findUnique({where:{systemId:release.systemId}}),composition=await currentComposition(tx,id),decision=await tx.releaseBranchPlanDecision.findFirst({where:{releaseId:id},orderBy:{number:'desc'}}),operation=await tx.releaseBranchPreparation.findFirst({where:{releaseId:id},orderBy:{number:'desc'}});
  const blockers:string[]=[];
  if(!provider)blockers.push('A preparação não está configurada. Confira a credencial da conta dedicada em Integrações.');
  if(release.compositionStatus!=='OPEN'||release.flowEnvironment!=='DEV')blockers.push('Preparar a branch exige release OPEN no fluxo DEV.');
  if(system.status!=='active'||system.archived)blockers.push('Ative o Sistema antes de preparar a branch.');
  if(!repository||repository.state!=='ready'||!repository.gitlabProjectId)blockers.push('O repositório do Sistema precisa estar pronto.');
  const valid=!!decision&&decision.releaseRecordVersion===release.version&&decision.compositionRevisionId===composition?.id&&decision.repositoryId===repository?.id&&decision.repositoryRecordVersion===repository?.version&&decision.gitlabProjectId===repository?.gitlabProjectId&&decision.policyDigest===branchPolicyDigest&&decision.branchName===`sdlc/release-${id}`;
  if(!valid)blockers.push('Registre uma decisão de política e base válida para a composição e o repositório atuais.');
  if(operation&&unresolved.includes(operation.state))blockers.push(operation.state==='succeeded'?'A preparação desta release já foi confirmada.':operation.state==='unknown'?'Verifique o resultado da preparação anterior antes de qualquer nova solicitação.':'Aguarde ou consulte a preparação em andamento.');
  const contextToken=blockers.length?null:auditFingerprint({releaseVersion:release.version,decisionId:decision!.id,repositoryVersion:repository!.version,compositionId:composition!.id,previousOperationId:operation?.id??null});
  const reading:BranchPreparationReading={releaseId:id,releaseKey:release.key,releaseVersion:release.version,repositoryName:repository?.name??null,decision:decision?{id:decision.id,number:decision.number,compositionNumber:decision.compositionNumber,branchName:decision.branchName,baseSha:decision.baseSha}:null,blockers,contextToken,operation:operation?summary(operation):null,asOf:new Date().toISOString()};
  return {release,system,repository,decision,composition,operation,reading,valid};
 }
 function command(request:FastifyRequest){
  const person=h.actor(request);if(!managers.includes(person.role))throw new DomainError('ROLE_DENIED','A preparação no GitLab exige Admin ou Release Manager. O registro local do plano tem sua própria permissão.',403);
  const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']),id=createHash('sha256').update(`${person.id}:${key}`).digest('hex'),hash=auditFingerprint([request.method,request.url,request.body]);
  async function cached(tx:Transaction){const row=await tx.requestKey.findUnique({where:{id}});if(row&&row.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT','Solicitação já utilizada para outro conteúdo.',409);return row;}
  async function mutate(fn:(tx:Transaction)=>Promise<unknown>){return h.db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;const prior=await cached(tx);if(prior)return prior.result;const result=await fn(tx);await tx.requestKey.create({data:{id,requestHash:hash,result:JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue}});return result;},{timeout:15000});}
  return {person,cached,mutate};
 }
 const eventOptions=(ctx:Awaited<ReturnType<typeof context>>,row:ReleaseBranchPreparation)=>({operationId:row.id,subject:{type:'release',id:ctx.release.id,key:ctx.release.key,name:ctx.release.name,version:ctx.release.version},initiator:{id:row.actorId,name:row.actorName,type:'human' as const}});
 app.get<{Params:{id:string}}>('/api/releases/:id/branch-preparation',async request=>{z.object({}).strict().parse(request.query);return h.db.$transaction(async tx=>(await context(tx,request.params.id)).reading,{isolationLevel:'RepeatableRead'});});
 app.post<{Params:{id:string}}>('/api/releases/:id/branch-preparation',async request=>{
  const body=z.object({expectedVersion:z.number().int().positive(),decisionId:z.string().min(1),expectedContextToken:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict().parse(request.body),cmd=command(request);
  const cached=await h.db.$transaction(tx=>cmd.cached(tx));if(cached)return cached.result;
  const prior=await h.db.$transaction(tx=>context(tx,request.params.id));
  if(!prior.reading.contextToken||prior.reading.contextToken!==body.expectedContextToken||prior.release.version!==body.expectedVersion||prior.decision?.id!==body.decisionId)throw new DomainError('RELEASE_BRANCH_REVIEW_CHANGED','O plano, a composição ou o repositório mudou. Atualize a consulta e revise a preparação.',409);
  const decision=prior.decision!;
  const observed=await provider!.inspect({projectId:decision.gitlabProjectId,branchName:decision.branchName,baseSha:decision.baseSha,defaultBranch:decision.defaultBranch});
  if(observed.blockers.length)throw new DomainError('RELEASE_BRANCH_BLOCKED',observed.blockers.join(' '),409);
  return cmd.mutate(async tx=>{
   const ctx=await context(tx,request.params.id);
   if(!ctx.reading.contextToken||ctx.reading.contextToken!==body.expectedContextToken)throw new DomainError('RELEASE_BRANCH_REVIEW_CHANGED','O contexto mudou durante a conferência no GitLab. Atualize e revise a preparação.',409);
   const row=await tx.releaseBranchPreparation.create({data:{releaseId:ctx.release.id,number:(ctx.operation?.number??0)+1,decisionId:decision.id,releaseRecordVersion:decision.releaseRecordVersion,compositionRevisionId:decision.compositionRevisionId,repositoryId:decision.repositoryId,repositoryRecordVersion:decision.repositoryRecordVersion,gitlabProjectId:decision.gitlabProjectId,branchName:decision.branchName,defaultBranch:decision.defaultBranch,baseSha:decision.baseSha,message:'Preparação solicitada · na fila.',actorId:cmd.person.id,actorName:cmd.person.name}});
   await h.event(tx,ctx.system,cmd.person,'RELEASE_BRANCH_PREPARATION_REQUESTED','Preparação da referência Git da release solicitada para a base confirmada.',{releaseId:ctx.release.id,branchPlanId:decision.id,branchName:row.branchName,baseSha:row.baseSha},'human',{...eventOptions(ctx,row),before:null,after:{state:'queued',branchName:row.branchName,baseSha:row.baseSha}});
   return {operation:summary(row)};
  });
 });
 app.post<{Params:{id:string;operationId:string}}>('/api/releases/:id/branch-preparations/:operationId/reconcile',async request=>{
  z.object({confirmed:z.literal(true)}).strict().parse(request.body);const cmd=command(request);
  return cmd.mutate(async tx=>{
   const ctx=await context(tx,request.params.id),row=await tx.releaseBranchPreparation.findUnique({where:{id:request.params.operationId}});
   if(!row||row.releaseId!==ctx.release.id)throw new DomainError('RELEASE_BRANCH_OPERATION_NOT_FOUND','Preparação não encontrada nesta release.',404);
   if(!provider)throw new DomainError('RELEASE_BRANCH_UNAVAILABLE','A integração dedicada não está configurada.',503);
   if(row.state==='succeeded'||row.state==='queued'||row.state==='running'||ctx.operation?.id!==row.id)return {operation:summary(row)};
   const saved=await tx.releaseBranchPreparation.update({where:{id:row.id},data:{state:'queued',reconcileOnly:true,message:'Consulta do resultado solicitada · sem repetir escrita no GitLab.'}});
   await h.event(tx,ctx.system,cmd.person,'RELEASE_BRANCH_RECONCILIATION_REQUESTED','Consulta da mesma preparação solicitada; nenhuma nova escrita remota autorizada.',{releaseId:ctx.release.id,operationId:row.id},'human',{...eventOptions(ctx,row),initiator:{id:cmd.person.id,name:cmd.person.name,type:'human'},before:{state:row.state},after:{state:'queued'}});
   return {operation:summary(saved)};
  });
 });
 async function requireCurrent(tx:Transaction,row:ReleaseBranchPreparation){
  const ctx=await context(tx,row.releaseId,true);
  if(!ctx.valid||ctx.decision?.id!==row.decisionId||ctx.release.compositionStatus!=='OPEN'||ctx.release.flowEnvironment!=='DEV'||ctx.system.status!=='active'||ctx.system.archived)throw new DomainError('RELEASE_BRANCH_CONTEXT_CHANGED','O plano, a composição ou o Sistema mudou. A preparação foi interrompida; confira a decisão atual.',409);
  return ctx;
 }
 async function processReleaseBranchJobs(){
  if(!provider)return false;
  const job=await h.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
   const row=await tx.releaseBranchPreparation.findFirst({where:{OR:[{state:'queued'},{state:'running',leaseUntil:{lt:new Date()}}]},orderBy:[{updatedAt:'asc'},{id:'asc'}]});if(!row)return null;
   const ctx=await context(tx,row.releaseId,true),saved=await tx.releaseBranchPreparation.update({where:{id:row.id},data:{state:'running',leaseId:randomUUID(),leaseUntil:new Date(Date.now()+120000),reconcileOnly:row.reconcileOnly||!!row.writeStartedAt||row.state==='running',message:'Conferindo a referência e as proteções no GitLab.'}});
   await h.event(tx,ctx.system,worker,'RELEASE_BRANCH_PREPARATION_STARTED','Processamento da preparação iniciado; resultado remoto ainda não confirmado.',{releaseId:row.releaseId,operationId:row.id},'system',{...eventOptions(ctx,row),before:{state:row.state},after:{state:'running'}});
   return saved;
  });
  if(!job)return false;
  let observed:BranchPreparationInspection|undefined,state='unknown',message='Resultado da preparação não confirmado. Verifique a mesma operação.',errorCode:string|null=null;
  try{
   if(job.reconcileOnly)observed=await provider.inspect(reference(job));
   else{
    await h.db.$transaction(tx=>requireCurrent(tx,job));
    observed=await provider.prepare(reference(job),async()=>{await h.db.$transaction(async tx=>{
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;await requireCurrent(tx,job);
     const row=await tx.releaseBranchPreparation.findUniqueOrThrow({where:{id:job.id}});
     if(row.state!=='running'||row.leaseId!==job.leaseId||!row.leaseUntil||row.leaseUntil<=new Date())throw new DomainError('RELEASE_BRANCH_LEASE','O prazo da preparação expirou. Consulte o resultado.',409);
     if(!row.writeStartedAt)await tx.releaseBranchPreparation.update({where:{id:job.id},data:{writeStartedAt:new Date()}});
    });});
   }
   if(observed.branchSha===job.baseSha&&observed.protectionReady&&!observed.blockers.length){state='succeeded';message='Branch preparada no GitLab · referência e proteção confirmadas para a base autorizada.';}
   else if(observed.blockers.length){state='blocked';message=observed.blockers.join(' ');}
   else{state='unknown';message=observed.branchSha?'Branch localizada; proteção ainda não confirmada. Verifique a mesma operação.':observed.protectionReady?'Proteção localizada; criação da branch ainda não confirmada. Verifique a mesma operação.':'Branch não localizada nesta consulta. O resultado anterior continua sem confirmação; nenhuma escrita foi repetida.';}
  }catch(error){
   errorCode=error instanceof DomainError?error.code:'RELEASE_BRANCH_UNAVAILABLE';message=error instanceof DomainError?error.message:'Resultado da preparação não confirmado. Verifique a mesma operação.';
   const current=await h.db.releaseBranchPreparation.findUniqueOrThrow({where:{id:job.id}});
   state=current.writeStartedAt||job.reconcileOnly?'unknown':'blocked';
  }
  await h.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
   const owned=await tx.releaseBranchPreparation.findUniqueOrThrow({where:{id:job.id}});if(owned.state!=='running'||owned.leaseId!==job.leaseId)return;
   const ctx=await context(tx,job.releaseId,true);
   if(state==='succeeded'&&(!owned.leaseUntil||owned.leaseUntil<=new Date())){state='unknown';message='A confirmação chegou após o prazo. Verifique o resultado da mesma preparação.';}
   if(state==='succeeded'&&(!ctx.valid||ctx.decision?.id!==job.decisionId||ctx.release.compositionStatus!=='OPEN'||ctx.system.status!=='active'))message+=' O contexto da release mudou; revise o plano antes de usar a referência.';
   const confirmedAt=state==='succeeded'?(await tx.$queryRaw<{value:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS value`)[0].value:null;
   const saved=await tx.releaseBranchPreparation.update({where:{id:job.id},data:{state,message,errorCode,leaseId:null,leaseUntil:null,...(confirmedAt?{confirmedAt}:{}),...(observed?{observedSha:observed.branchSha,protectionReady:observed.protectionReady,checkedAt:new Date(observed.observedAt)}:{})}});
   await h.event(tx,ctx.system,worker,state==='succeeded'?'RELEASE_BRANCH_PREPARATION_COMPLETED':state==='blocked'?'RELEASE_BRANCH_PREPARATION_BLOCKED':'RELEASE_BRANCH_PREPARATION_UNCONFIRMED',state==='succeeded'?'Referência e proteção da branch da release confirmadas.':'Preparação sem conclusão confirmada; consulte os impedimentos e a mesma operação.',{releaseId:job.releaseId,operationId:job.id,branchPlanId:job.decisionId,branchName:job.branchName,baseSha:job.baseSha,...(observed?{sha:observed.branchSha}:{} )},'system',{...eventOptions(ctx,job),before:{state:'running',sha:owned.observedSha,branchProtected:owned.checkedAt?owned.protectionReady:null},after:{state,sha:saved.observedSha,branchProtected:saved.checkedAt?saved.protectionReady:null},...(errorCode?{reasonCode:errorCode}:{})});
  });return true;
 }
 return {processReleaseBranchJobs};
}
