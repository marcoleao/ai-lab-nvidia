import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import type {Release,Repository,ReleaseCompositionRevision,ReleaseBranchPlanDecision,Prisma} from '../../../packages/db/generated/client.ts';
import {releaseBranchPolicy,type BranchPlanDecision,type BranchPlanRecording} from '../../../packages/shared/src/release-branch-policy.ts';
import type {BranchPlanObservation,ReleaseBranchPlan} from '../../../packages/shared/src/release-branch-plan.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';
import {currentComposition} from './release-compositions.ts';

export const branchPolicyDigest=auditFingerprint(releaseBranchPolicy);
type Context={release:Release;repository:Repository;composition:ReleaseCompositionRevision|null;system:{status:string;archived:boolean};decision:ReleaseBranchPlanDecision|null};
export function decisionSummary(row:ReleaseBranchPlanDecision):BranchPlanDecision{return {id:row.id,number:row.number,releaseId:row.releaseId,releaseRecordVersion:row.releaseRecordVersion,compositionRevisionId:row.compositionRevisionId,compositionNumber:row.compositionNumber,repositoryId:row.repositoryId,repositoryRecordVersion:row.repositoryRecordVersion,branchName:row.branchName,defaultBranch:row.defaultBranch,baseSha:row.baseSha,scenario:'initial',policyVersion:row.policyVersion,policyDigest:row.policyDigest,actorName:row.actorName,createdAt:row.createdAt.toISOString()};}
export function recordingReading(context:Context,observed:BranchPlanObservation,scenario:string):BranchPlanRecording{
 const {release,repository,composition,system,decision}=context,blockers:string[]=[];
 if(release.compositionStatus!=='OPEN'||release.flowEnvironment!=='DEV')blockers.push('Registrar decisão exige release OPEN no fluxo DEV.');
 if(system.archived||system.status!=='active')blockers.push('Ative o Sistema para registrar a decisão do plano.');
 if(!composition)blockers.push('A composição vigente ainda não está identificada.');
 if(scenario!=='initial')blockers.push(scenario==='production'?'A origem em produção precisa de uma fonte confirmada; este registro atende somente ao cenário inicial declarado.':'Escolha o cenário de primeira release para revisar a base inicial.');
 if(!observed.baseCommit)blockers.push('Informe e consulte o SHA completo da base inicial.');
 if(!observed.defaultBranch)blockers.push('A branch padrão precisa estar identificada na consulta.');
 const eligible=release.compositionStatus==='OPEN'&&release.flowEnvironment==='DEV'&&!system.archived&&system.status==='active';
 const same=!!decision&&decision.releaseRecordVersion===release.version&&decision.compositionRevisionId===composition?.id&&decision.repositoryId===repository.id&&decision.repositoryRecordVersion===repository.version&&decision.gitlabProjectId===repository.gitlabProjectId&&decision.policyDigest===branchPolicyDigest&&decision.defaultBranch===observed.defaultBranch?.name;
 const contextToken=blockers.length?null:auditFingerprint({releaseId:release.id,releaseVersion:release.version,compositionRevisionId:composition!.id,repositoryId:repository.id,repositoryVersion:repository.version,gitlabProjectId:repository.gitlabProjectId,baseSha:observed.baseCommit!.sha,scenario,policyDigest:branchPolicyDigest,defaultBranch:observed.defaultBranch,proposedBranch:observed.proposedBranch});
 return {policy:releaseBranchPolicy,policyDigest:branchPolicyDigest,contextToken,blockers,current:decision?decisionSummary(decision):null,currentState:!decision?'absent':!eligible?'retained':same?'current':'context_changed',latestDecisionId:decision?.id??null};
}

type Helpers=Pick<AssistantHelpers,'db'|'actor'|'live'|'ensureNotArchived'|'event'>;
export function registerBranchPlanDecisions(app:FastifyInstance,h:Helpers,inspect:(id:string,baseSha:string)=>Promise<ReleaseBranchPlan>){
 app.post<{Params:{id:string}}>('/api/releases/:id/branch-plan/decisions',async request=>{
  const person=h.actor(request);
  // Same scope of authority as existing Release composition planning. This
  // grants no GitLab credential, software gate or deployment permission.
  if(!['admin','release_manager','product_owner','architect'].includes(person.role))throw new DomainError('ROLE_DENIED','Esta persona pode consultar, mas não registrar decisões de planejamento da release.',403);
  const body=z.object({expectedVersion:z.number().int().positive(),expectedDecisionId:z.string().min(1).nullable(),expectedContextToken:z.string().regex(/^[a-f0-9]{64}$/),baseSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),scenario:z.literal('initial'),policyVersion:z.string().min(1).max(100),reason:z.string().trim().min(10).max(500).refine(value=>Array.from(value).length>=10),confirmed:z.literal(true)}).strict().parse(request.body);
  const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']),id=createHash('sha256').update(`${person.id}:${key}`).digest('hex'),requestHash=auditFingerprint([request.method,request.url,request.body]);
  async function cached(tx:Transaction){
   const row=await tx.requestKey.findUnique({where:{id}});if(row&&row.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT','Solicitação já utilizada para outro conteúdo.',409);return row;
  }
  const prior=await h.db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;return cached(tx);});
  if(prior)return prior.result;
  if(body.policyVersion!==releaseBranchPolicy.version)throw new DomainError('BRANCH_PLAN_POLICY_CHANGED','A política oferecida mudou. Atualize a consulta e revise o plano antes de registrar.',409);
  // Fresh GET-only GitLab inspection happens outside the write transaction.
  // A cached successful decision can reconcile even while GitLab is offline.
  const reviewed=await inspect(request.params.id,body.baseSha);
  if(reviewed.release.version!==body.expectedVersion||reviewed.recording.contextToken!==body.expectedContextToken||reviewed.recording.latestDecisionId!==body.expectedDecisionId)throw new DomainError('BRANCH_PLAN_REVIEW_CHANGED','O contexto do plano mudou. Atualize a consulta e revise a decisão; sua justificativa pode ser mantida.',409);
  if(!reviewed.recording.contextToken)throw new DomainError('BRANCH_PLAN_NOT_RECORDABLE','Consulte o cenário inicial e resolva as pendências antes de registrar.',409);
  return h.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;const replay=await cached(tx);if(replay)return replay.result;
   const release=await tx.release.findUnique({where:{id:request.params.id}});if(!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
   const system=await h.live(tx,release.systemId);await h.ensureNotArchived(tx,system);
   const repository=await tx.repository.findUnique({where:{systemId:release.systemId}}),composition=await currentComposition(tx,release.id),previous=await tx.releaseBranchPlanDecision.findFirst({where:{releaseId:release.id},orderBy:{number:'desc'}});
   if(!repository||repository.state!=='ready')throw new DomainError('REPOSITORY_NOT_READY','O repositório do Sistema ainda não está pronto.',409);
   const reading=recordingReading({release,repository,composition,system,decision:previous},reviewed.observed,'initial');
   if(!reading.contextToken||reading.contextToken!==body.expectedContextToken||previous?.id!== (body.expectedDecisionId??undefined))throw new DomainError('BRANCH_PLAN_REVIEW_CHANGED','A composição, o repositório ou a decisão mudou antes do registro. Atualize a consulta e revise novamente.',409);
   const decisionDigest=auditFingerprint({reasonDigest:auditFingerprint(body.reason),releaseId:release.id,releaseRecordVersion:release.version,compositionRevisionId:composition!.id,repositoryId:repository.id,repositoryRecordVersion:repository.version,gitlabProjectId:repository.gitlabProjectId,baseSha:body.baseSha,scenario:body.scenario,policyDigest:branchPolicyDigest,defaultBranch:reviewed.observed.defaultBranch!.name,branchName:reviewed.proposal.branchName});
   const unchanged=previous?.decisionDigest===decisionDigest,operationId=`branch-plan:${id}`;
   const saved=unchanged?previous!:await tx.releaseBranchPlanDecision.create({data:{releaseId:release.id,number:(previous?.number??0)+1,releaseRecordVersion:release.version,compositionRevisionId:composition!.id,compositionNumber:composition!.number,repositoryId:repository.id,repositoryRecordVersion:repository.version,gitlabProjectId:repository.gitlabProjectId!,baseSha:body.baseSha,scenario:body.scenario,policy:releaseBranchPolicy as unknown as Prisma.InputJsonValue,policyVersion:releaseBranchPolicy.version,policyDigest:branchPolicyDigest,contextDigest:reading.contextToken,decisionDigest,branchName:reviewed.proposal.branchName,defaultBranch:reviewed.observed.defaultBranch!.name,defaultBranchSha:reviewed.observed.defaultBranch!.sha,observedBranchSha:reviewed.observed.proposedBranch?.sha??null,observedAt:new Date(reviewed.observed.observedAt),reason:body.reason,actorId:person.id,actorName:person.name,operationId}});
   const reference=(row:ReleaseBranchPlanDecision)=>({branchPlanId:row.id,branchPlanNumber:row.number,compositionRevisionId:row.compositionRevisionId,repositoryId:row.repositoryId,baseSha:row.baseSha,baseScenario:row.scenario,branchName:row.branchName,defaultBranch:row.defaultBranch,policyVersion:row.policyVersion,policyDigest:row.policyDigest,decisionDigest:row.decisionDigest});
   await h.event(tx,system,person,'RELEASE_BRANCH_PLAN_RECORDED','Decisão local de base e política do plano registrada; nenhuma branch, código ou implantação alterados.',{releaseId:release.id,releaseKey:release.key,releaseVersion:release.version,...reference(saved)},'human',{operationId,subject:{type:'release',id:release.id,key:release.key,name:release.name,version:release.version},outcome:unchanged?'NO_CHANGE':'SUCCEEDED',decision:'APPROVED',before:previous?reference(previous):null,after:reference(saved),reasonCode:unchanged?'BRANCH_PLAN_ALREADY_RECORDED':'BRANCH_PLAN_LOCAL_DECISION'});
   const result={decision:decisionSummary(saved),changed:!unchanged,gitlabChanged:false};
   await tx.requestKey.create({data:{id,requestHash,result}});return result;
  },{timeout:15000});
 });
}
