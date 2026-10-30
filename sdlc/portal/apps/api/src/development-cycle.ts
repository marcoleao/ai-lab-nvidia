import type {Item,Repository,StoryExecution} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {auditFingerprint} from './audit.ts';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** A new development cycle invalidates old approvals even if content is identical. */
export function executionCycleCurrent(snapshot:unknown,data:unknown){
 const cycle=object(data).developmentCycleId;
 return !cycle||object(snapshot).developmentCycleId===cycle;
}
export async function developmentCycleReview(tx:Transaction,story:Item,run:StoryExecution,repository:Repository){
 const merge=await tx.mergeOperation.findUnique({where:{executionId:run.id}});
 const required=story.status==='testing'||merge?.state==='succeeded';
 const context={storyId:story.id,storyVersion:story.version,status:story.status,runId:run.id,sha:run.commitSha,repositoryId:repository.id,repositoryVersion:repository.version,projectId:repository.gitlabProjectId,mergeId:merge?.id??null,mergeState:merge?.state??null,mergeSha:merge?.sha??null,targetBranch:merge?.targetBranch??null};
 if(!required)return {required,context,reason:null,contextToken:null};
 let reason:string|null=null;
 if(!['coding','code_review','security_scan','merge_request','testing'].includes(story.status)||run.state!=='succeeded'||!run.commitSha)reason='O novo ciclo exige uma entrega de código concluída e ainda em desenvolvimento. Consulte a execução atual.';
 else if(merge?.state!=='succeeded'||merge.sha!==run.commitSha||merge.projectId!==repository.gitlabProjectId)reason='Confirme ou reconcilie a integração desta revisão antes de iniciar outro ciclo. Consulte o Merge Request na etapa atual.';
 else {
  const now=new Date(),busy=await Promise.all([
   tx.storyExecution.count({where:{storyId:story.id,id:{not:run.id},state:{notIn:['succeeded','cancelled']}}}),
   tx.storyExecution.count({where:{storyId:story.id,leaseUntil:{gt:now}}}),
   tx.developmentBuild.count({where:{storyId:story.id,state:{in:['queued','running','paused','unknown']}}}),
   tx.developmentDeployment.count({where:{storyId:story.id,state:{in:['queued','running','paused','unknown']}}}),
   tx.developmentTest.count({where:{storyId:story.id,state:{in:['queued','running','paused','unknown']}}}),
   tx.qualityCheck.count({where:{storyId:story.id,state:{in:['queued','running','paused']}}}),
   tx.mergeOperation.count({where:{storyId:story.id,OR:[{state:{in:['queued','running','paused','failed']}},{leaseUntil:{gt:now}}]}}),
   tx.mergePreparation.count({where:{storyId:story.id,OR:[{state:{in:['queued','running','paused','failed']}},{leaseUntil:{gt:now}}]}}),
   tx.mergeHistoryCloseOperation.count({where:{storyId:story.id,OR:[{state:{in:['queued','running','paused','unknown']}},{leaseUntil:{gt:now}}]}}),
   tx.mergeDiscussionTurn.count({where:{operation:{storyId:story.id},state:{in:['queued','running','paused']}}}),
   tx.chatTurn.count({where:{session:{contextId:story.id},status:{in:['queued','running','paused']}}}),
   tx.workAttempt.count({where:{activity:{storyId:story.id},state:{in:['queued','running','paused']}}}),
  ]);
  if(busy.some(Boolean))reason='Há trabalho pendente ou resultado de integração sem confirmação, inclusive de operações anteriores. Consulte a atividade e a Auditoria; conclua, cancele ou reconcilie a operação antes de iniciar outro ciclo.';
 }
 return {required,context,reason,contextToken:reason?null:auditFingerprint(context)};
}
