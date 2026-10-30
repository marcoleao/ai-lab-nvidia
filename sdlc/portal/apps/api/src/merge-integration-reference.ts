import {z} from 'zod';
import type {Transaction} from '../../../packages/db/client.ts';
import type {MergeOperation} from '../../../packages/db/generated/client.ts';
import type {MergeInspection} from './merge-provider.ts';
import type {MergeIntegrationReading} from '../../../packages/shared/src/merge-integration-reference.ts';
const sha=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const observedIntegrationSchema=z.object({projectId:z.number().int().positive(),iid:z.number().int().positive(),sourceBranch:z.string().min(1).max(255),targetBranch:z.string().min(1).max(255),sourceSha:sha,mergeCommitSha:sha.nullable(),squashCommitSha:sha.nullable(),mergedAt:z.string().datetime({offset:true}).nullable()}).strict();
export async function captureMergeIntegration(tx:Transaction,op:MergeOperation,inspection:MergeInspection){
 if(inspection.state!=='merged'||inspection.blocks.length||!inspection.integration)return null;
 const v=observedIntegrationSchema.parse(inspection.integration);
 if(v.projectId!==op.projectId||v.iid!==op.iid||v.sourceBranch!==op.sourceBranch||v.targetBranch!==op.targetBranch||v.sourceSha!==op.sha)throw Error('Observed integration reference differs from the authorized operation');
 const old=await tx.mergeIntegrationReference.findUnique({where:{operationId:op.id}});if(old)return old;
 const run=await tx.storyExecution.findUniqueOrThrow({where:{id:op.executionId}}),repo=await tx.repository.findUniqueOrThrow({where:{id:run.repositoryId}});
 return tx.mergeIntegrationReference.create({data:{operationId:op.id,executionId:run.id,storyId:run.storyId,repositoryId:repo.id,repositoryVersion:repo.version,projectId:v.projectId,iid:v.iid,sourceBranch:v.sourceBranch,targetBranch:v.targetBranch,sourceSha:v.sourceSha,mergeCommitSha:v.mergeCommitSha,squashCommitSha:v.squashCommitSha,integrationSha:v.mergeCommitSha??v.squashCommitSha,mergedAt:v.mergedAt?new Date(v.mergedAt):null,mergedBy:inspection.mergedBy,policyVersion:'gitlab-merge-reference-v1'}});
}
export async function integrationReadings(tx:Transaction,ids:string[]){
 const rows=await tx.mergeIntegrationReference.findMany({where:{operationId:{in:ids}}});
 const resolutions=await tx.mergeHistoryResolution.findMany({where:{operationId:{in:ids}}});
 const jobs=await tx.mergeHistoryCloseOperation.findMany({where:{mergeOperationId:{in:ids}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
 const operations=await tx.mergeOperation.findMany({where:{id:{in:ids}},select:{id:true,executionId:true,projectId:true,iid:true,sourceBranch:true,targetBranch:true,sha:true}});
 return new Map<string,MergeIntegrationReading>(ids.map(id=>{
  const row=rows.find(r=>r.operationId===id),closed=resolutions.find(r=>r.operationId===id);
  const value:MergeIntegrationReading=row?{state:row.integrationSha?'recorded':'partial',id:row.id,operationId:id,executionId:row.executionId,projectId:row.projectId,iid:row.iid,sourceBranch:row.sourceBranch,targetBranch:row.targetBranch,sourceSha:row.sourceSha,integrationSha:row.integrationSha,mergeCommitSha:row.mergeCommitSha,squashCommitSha:row.squashCommitSha,mergedAt:row.mergedAt?.toISOString()??null,observedAt:row.observedAt.toISOString(),policyVersion:row.policyVersion}:closed?{state:'resolved',operationId:id,executionId:closed.executionId,projectId:closed.projectId,iid:closed.iid,sourceBranch:closed.sourceBranch,targetBranch:closed.targetBranch,sourceSha:closed.sourceSha,historicalReconciliation:true}:{state:'not_captured',operationId:id};
  const job=jobs.find(v=>v.mergeOperationId===id);
  const op=operations.find(v=>v.id===id);
  return [id,{...value,...(!row&&!closed&&op?{executionId:op.executionId,projectId:op.projectId,iid:op.iid,sourceBranch:op.sourceBranch,targetBranch:op.targetBranch,sourceSha:op.sha}:{}),...(job?{state:!row&&!closed?'unconfirmed' as const:value.state,historicalReconciliation:true,remoteClosure:{id:job.id,state:job.state,version:job.version,createdAt:job.createdAt.toISOString(),updatedAt:job.updatedAt.toISOString(),message:job.message,reason:job.reason,actorName:job.actorName,writeStartedAt:job.writeStartedAt?.toISOString()??null,leaseUntil:job.leaseUntil?.toISOString()??null}}:{}),...(closed?{historicalReconciliation:true,resolution:{id:closed.id,observedAt:closed.observedAt.toISOString(),decidedAt:closed.decidedAt.toISOString(),actorName:closed.actorName,reason:closed.reason,observedState:'closed' as const}}:{})}];
 }));
}
