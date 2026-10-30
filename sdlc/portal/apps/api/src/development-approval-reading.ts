import {Prisma,type StoryDevelopmentApproval} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import type {DevelopmentApproval,DevelopmentApprovalValidity} from '../../../packages/shared/src/development-approval.ts';
import {qualityPolicy} from './merge-readiness.ts';
export const developmentApprovalPolicy='development-approval-v1';
export type DevelopmentReference={referenceDigest:string;storyId:string;specificationId:string|null;specificationNumber:number|null;executionId:string|null;sourceSha:string|null;repositoryId:string|null;repositoryVersion:number|null;integrationReferenceId:string|null;integrationSha:string|null;buildId:string|null;buildSourceSha:string|null;imageId:string|null;archiveDigest:string|null;deploymentId:string|null};
export function approvalProjection(v:StoryDevelopmentApproval|Record<string,unknown>):DevelopmentApproval{
 const fields=['id','storyId','number','policyVersion','actorId','actorName','reason','specificationId','executionId','sourceSha','integrationReferenceId','integrationSha','buildId','buildSourceSha','imageId','archiveDigest','deploymentId','testId','suiteDigest','reviewId','securityId'];
 const value=Object.fromEntries(fields.map(k=>[k,(v as unknown as Record<string,unknown>)[k]]));const date=v.createdAt;return {...value,createdAt:date instanceof Date?date.toISOString():new Date(String(date).match(/(?:Z|[+-]\d\d:\d\d)$/)?String(date):String(date)+'Z').toISOString()} as DevelopmentApproval;
}
export async function developmentApprovalViews(tx:Transaction,ids:readonly string[]){
 if(!ids.length)return new Map<string,{approval:DevelopmentApproval|null;validity:DevelopmentApprovalValidity;reference:DevelopmentReference}>();
 const rows=await tx.$queryRaw<{id:string;approval:Record<string,unknown>|null;validity:DevelopmentApprovalValidity;reference:DevelopmentReference}[]>`SELECT i.id,to_jsonb(a) AS approval,sdlc_development_approval_validity(i.id,${qualityPolicy}) AS validity,sdlc_development_reference(i.id) AS reference FROM "Item" i LEFT JOIN LATERAL(SELECT * FROM "StoryDevelopmentApproval" WHERE "storyId"=i.id ORDER BY number DESC LIMIT 1)a ON true WHERE i.kind='story' AND i.id IN (${Prisma.join([...new Set(ids)])})`;
 return new Map(rows.map(v=>[v.id,{approval:v.approval?approvalProjection(v.approval):null,validity:v.validity,reference:v.reference}]));
}
