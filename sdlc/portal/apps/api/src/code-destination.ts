import {generationReferenceMessages} from './agent-context.ts';
import {patchPolicy} from './code-schema.ts';
import {z} from 'zod';
import type {AssistantHelpers} from './assistant.ts';
import type {executionScope} from './execution.ts';
import type {GitProvider} from './gitlab.ts';
import {codeDestinationPolicy,type CodeDestinationReview} from '../../../packages/shared/src/code-destination.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {executionCycleCurrent} from './development-cycle.ts';
export const destinationSchema=z.object({policy:z.literal(codeDestinationPolicy),repositoryId:z.string(),repositoryVersion:z.number().int().positive(),projectId:z.number().int().positive(),targetBranch:z.string().min(1).max(255),baseSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)}).strict();
export const destinationApprovalSchema=z.object({contextToken:z.string().regex(/^[a-f0-9]{64}$/),destination:destinationSchema}).strict();
export const destinationOf=(snapshot:unknown)=>destinationSchema.safeParse((snapshot as Record<string,unknown>)?.codeDestination);
export const destinationSummary=(snapshot:unknown)=>{const parsed=destinationOf(snapshot);return parsed.success?parsed.data:null;};
export async function requireApprovedCodeDestination(tx:Transaction,run:{id:string;storyId:string;snapshot:unknown}){
 const destination=destinationSummary(run.snapshot);if(!destination)return;
 const event=await tx.historyEvent.findFirst({where:{itemId:run.storyId,operationId:run.id,action:'GATE_APPROVED'},orderBy:[{timestamp:'desc'},{id:'desc'}]});
 const value=event?.payload as Record<string,unknown>|undefined;
 if(!value||value.targetBranch!==destination.targetBranch||value.baseSha!==destination.baseSha||value.repositoryId!==destination.repositoryId||value.gitlabProjectId!==destination.projectId||value.repositoryVersion!==destination.repositoryVersion||value.policyVersion!==destination.policy)throw new DomainError('CODE_DESTINATION_UNAPPROVED','O destino da execução não corresponde à autorização registrada. Revise o Gateway de Especificação.',409);
}
export async function observeDevelopmentDestination(git:GitProvider,id:number){
 const value=git.developmentDestination?await git.developmentDestination(id):await git.codeContext!(id);
 if(!value.targetBranch||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.sha))throw new DomainError('CODE_DESTINATION_UNAVAILABLE','O GitLab não confirmou a branch e o commit de desenvolvimento.',503);
 return {targetBranch:value.targetBranch,baseSha:value.sha};
}
export function codeDestinationReader(h:AssistantHelpers,git:GitProvider|undefined,scope:(tx:Transaction,id:string,snapshot?:unknown)=>ReturnType<typeof executionScope>){
 async function local(id:string){return h.db.$transaction(async tx=>{
  const run=await tx.storyExecution.findUnique({where:{id}});if(!run)throw new DomainError('EXECUTION_NOT_FOUND','Execução não encontrada.',404);
  const s=await scope(tx,run.storyId,run.snapshot);
  if(run.state!=='waiting_approval'||run.stage!=='gate'||!executionCycleCurrent(run.snapshot,s.story.data)||(run.snapshot as Record<string,unknown>).fingerprint!==s.fingerprint)throw new DomainError('GATE_STALE','A especificação ou a execução mudou. Consulte a etapa atual antes de revisar o destino.',409);
  return {run,s};
 },{isolationLevel:'RepeatableRead'});}
 return async(id:string):Promise<CodeDestinationReview>=>{
  if(!git?.codeContext)throw new DomainError('CODE_DESTINATION_UNAVAILABLE','Configure a integração GitLab antes de revisar o destino.',503);
  const before=await local(id),observed=await observeDevelopmentDestination(git,before.s.repository.gitlabProjectId!);
  const expectedSource=(before.run.snapshot as {qualityCorrection?:{expectedSha?:string}}).qualityCorrection?.expectedSha??observed.baseSha;
  const code=await git.codeContext(before.s.repository.gitlabProjectId!,{sha:expectedSource,targetBranch:observed.targetBranch});
  if(code.sha!==expectedSource||code.targetBranch!==observed.targetBranch)throw new DomainError('CODE_DESTINATION_CHANGED','A fonte mudou durante a revisão. Confira o destino novamente.',409);
  generationReferenceMessages(before.run.snapshot,before.run.specification,code,observed.baseSha,before.run.allowDependencies,patchPolicy);
  const after=await local(id);
  if(before.s.story.version!==after.s.story.version||before.s.fingerprint!==after.s.fingerprint||before.s.repository.version!==after.s.repository.version||before.s.repository.gitlabProjectId!==after.s.repository.gitlabProjectId||before.run.updatedAt.getTime()!==after.run.updatedAt.getTime())throw new DomainError('CODE_DESTINATION_CHANGED','O contexto mudou durante a consulta. Atualize o destino e revise novamente.',409);
  const destination={policy:codeDestinationPolicy,repositoryId:after.s.repository.id,repositoryVersion:after.s.repository.version,projectId:after.s.repository.gitlabProjectId!,...observed};
  return {executionId:id,storyVersion:after.s.story.version,repositoryName:after.s.repository.name,destination,contextToken:auditFingerprint({executionId:id,storyVersion:after.s.story.version,fingerprint:after.s.fingerprint,destination}),observedAt:new Date().toISOString(),required:(after.run.snapshot as Record<string,unknown>).destinationReviewRequired===true};
 };
}
