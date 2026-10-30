import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeProvider} from './merge-provider.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {inheritedRepository} from './system-repository.ts';
import {DomainError} from './errors.ts';
import {auditFingerprint} from './audit.ts';
import {captureMergeIntegration,integrationReadings,observedIntegrationSchema} from './merge-integration-reference.ts';

export function registerMergeReferenceCapture(app:FastifyInstance,h:AssistantHelpers,provider?:MergeProvider){
 async function local(tx:Transaction,id:string){
  const op=await tx.mergeOperation.findUnique({where:{id}});if(!op)throw new DomainError('MERGE_NOT_FOUND','A operação de integração não foi encontrada.',404);
  const story=await h.live(tx,op.storyId);await h.ensureNotArchived(tx,story);
  const run=await tx.storyExecution.findUniqueOrThrow({where:{id:op.executionId}}),repo=await inheritedRepository(tx,story);
  if(op.state!=='succeeded'||run.state!=='succeeded'||run.storyId!==story.id||run.commitSha!==op.sha)throw new DomainError('REFERENCE_MERGE_UNCONFIRMED','A captura exige uma integração já confirmada para a mesma revisão. Consulte ou reconcilie a operação antes de continuar.',409);
  if(!repo||repo.id!==run.repositoryId||repo.state!=='ready'||repo.gitlabProjectId!==op.projectId)throw new DomainError('REFERENCE_REPOSITORY_CHANGED','O repositório da integração não corresponde ao repositório atual do Sistema. Revise esse vínculo antes de registrar a referência.',409);
  const context={storyId:story.id,storyVersion:story.version,repositoryId:repo.id,repositoryVersion:repo.version,projectId:repo.gitlabProjectId,operationId:op.id,executionId:run.id,sourceBranch:op.sourceBranch,targetBranch:op.targetBranch,sourceSha:op.sha,state:op.state,executionState:run.state};
  return {op,story,run,repo,context,digest:auditFingerprint(context)};
 }
 async function consult(id:string){
  if(!provider)throw new DomainError('REFERENCE_PROVIDER_UNAVAILABLE','A consulta ao GitLab da integração não está configurada.',503);
  const before=await h.db.$transaction(tx=>local(tx,id),{isolationLevel:'RepeatableRead'});
  const observation=await provider.inspect(before.op);
  const parsed=observedIntegrationSchema.safeParse(observation.integration);
  if(observation.state!=='merged'||observation.blocks.length||observation.sha!==before.op.sha||!parsed.success)throw new DomainError('REFERENCE_OBSERVATION_CHANGED','O GitLab não confirmou a referência da mesma integração. Consulte a operação; nenhum registro foi gravado.',409);
  const v=parsed.data;
  if(v.projectId!==before.op.projectId||v.iid!==before.op.iid||v.sourceBranch!==before.op.sourceBranch||v.targetBranch!==before.op.targetBranch||v.sourceSha!==before.op.sha)throw new DomainError('REFERENCE_OBSERVATION_CHANGED','O projeto, as branches ou a revisão consultada divergem da operação. Nenhuma referência foi registrada.',409);
  const after=await h.db.$transaction(tx=>local(tx,id),{isolationLevel:'RepeatableRead'});
  if(after.digest!==before.digest)throw new DomainError('REFERENCE_CONTEXT_CHANGED','O contexto mudou durante a consulta. Consulte novamente antes de registrar.',409);
  return {local:after,observation:{...observation,integration:v},contextToken:auditFingerprint({context:after.context,observation:v,mergedBy:observation.mergedBy})};
 }
 app.get<{Params:{id:string}}>('/api/merge-operations/:id/integration-reference-review',async request=>{
  z.object({}).strict().parse(request.query);
  const result=await consult(request.params.id);
  return {operationId:result.local.op.id,executionId:result.local.run.id,repositoryName:result.local.repo.name,storyVersion:result.local.story.version,contextToken:result.contextToken,observation:result.observation.integration,queriedAt:new Date().toISOString()};
 });
 app.post<{Params:{id:string}}>('/api/merge-operations/:id/integration-reference',async request=>{
  const body=z.object({confirmed:z.literal(true),contextToken:z.string().regex(/^[a-f0-9]{64}$/),observation:observedIntegrationSchema}).strict().parse(request.body);
  const person=h.actor(request);h.canPlan(person);
  const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']);
  const id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
  if(await h.db.requestKey.findUnique({where:{id}}))return h.mutate(request,async()=>{throw Error('Expected cached reference receipt');});
  let reviewed:Awaited<ReturnType<typeof consult>>;
  try{reviewed=await consult(request.params.id);if(body.contextToken!==reviewed.contextToken||auditFingerprint(body.observation)!==auditFingerprint(reviewed.observation.integration))throw new DomainError('REFERENCE_OBSERVATION_CHANGED','A referência ou o contexto mudou desde a consulta. Consulte novamente e revise a confirmação.',409);}
  catch(error){if(await h.db.requestKey.findUnique({where:{id}}))return h.mutate(request,async()=>{throw Error('Expected concurrent reference receipt');});throw error;}
  return h.mutate(request,async(tx,actor)=>{
   const current=await local(tx,request.params.id);
   if(current.digest!==reviewed.local.digest)throw new DomainError('REFERENCE_CONTEXT_CHANGED','O contexto mudou antes do registro. Consulte novamente antes de confirmar.',409);
   const old=await tx.mergeIntegrationReference.findUnique({where:{operationId:current.op.id}});
   const row=old??await captureMergeIntegration(tx,current.op,reviewed.observation);
   if(!row)throw new DomainError('REFERENCE_OBSERVATION_CHANGED','A consulta não forneceu uma referência que possa ser registrada.',409);
   const fields={integrationReferenceId:row.id,sourceSha:row.sourceSha,integrationSha:row.integrationSha,mergeCommitSha:row.mergeCommitSha,squashCommitSha:row.squashCommitSha,targetBranch:row.targetBranch};
   const before=old?{state:old.integrationSha?'recorded':'partial',...fields}:{state:'not_captured',integrationReferenceId:null};
   await h.event(tx,current.story,actor,'MERGE_INTEGRATION_REFERENCE_CAPTURED',old?'Referência já registrada; a fonte imutável foi preservada.':'Referência histórica da integração registrada após consulta e confirmação humana. O merge anterior permanece preservado.',{operationId:current.op.id,runId:current.run.id,...fields},'human',{outcome:old?'NO_CHANGE':'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',before,after:{state:row.integrationSha?'recorded':'partial',...fields},operationId:current.op.id,subject:{type:'merge_operation',id:current.op.id}});
   return {changed:!old,integrationReference:(await integrationReadings(tx,[current.op.id])).get(current.op.id)};
  });
 });
}
