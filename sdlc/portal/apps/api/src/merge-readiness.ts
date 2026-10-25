import type {Transaction} from '../../../packages/db/client.ts';
import {DomainError} from './errors.ts';

import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const qualityRulesDigest=createHash('sha256').update(readFileSync(new URL('../../../security/rules.yaml',import.meta.url))).digest('hex');
export const qualityPolicy='quality-v2-syntax-memory-zero-findings-'+qualityRulesDigest;
type Reference={id:string;storyId:string;commitSha:string|null};
// Only durable results produced by the quality workers may satisfy this gate.
// Story status, a conversation, a successful pipeline or a manual MR approval
// cannot substitute for either phase. No legacy approvals are synthesized.
export async function mergeReadiness(tx:Transaction,run:Reference,baseSha?:string){
 const checks=await tx.qualityCheck.findMany({where:{executionId:run.id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
 const phases=(['code_review','security_scan'] as const).map(kind=>{
  const check=checks.find(c=>c.kind===kind),evidence=check?.evidence as Record<string,unknown>|null;
  const passed=!!run.commitSha&&check?.state==='passed'&&check.sha===run.commitSha&&check.policyVersion===qualityPolicy&&(!baseSha||check.baseSha===baseSha)&&typeof evidence?.digest==='string'&&/^[a-f0-9]{64}$/.test(evidence.digest);
  return {kind,label:kind==='code_review'?'CODE REVIEW':'SECURITY SCAN',passed,checkId:check?.id??null};
 });
 return {ready:phases.every(phase=>phase.passed),phases,commitSha:run.commitSha};
}
export async function requireMergeReadiness(tx:Transaction,run:Reference,baseSha?:string){
 const status=await mergeReadiness(tx,run,baseSha);
 if(!status.ready)throw new DomainError('QUALITY_PHASES_REQUIRED',`Merge indisponível: ${status.phases.filter(p=>!p.passed).map(p=>p.label).join(' e ')} precisam de aprovação registrada para este mesmo commit. Um pipeline aprovado ou uma conversa não substitui essas verificações.`,409);
}
