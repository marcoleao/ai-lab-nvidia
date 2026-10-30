import type {Transaction} from '../../../packages/db/client.ts';
import type {StoryExecution} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {mergeReadiness} from './merge-readiness.ts';
import {checkExecutionScope} from './execution.ts';
import type {AuditOptions} from './audit.ts';

// Phase is a persisted workflow fact. The existence of an MR alone is not a
// handoff: the current gates or a confirmed integration must support it.
export async function enterMergeRequestPhase(tx:Transaction,h:AssistantHelpers,run:StoryExecution,initiator?:{id:string;name:string;type?:string},audit:AuditOptions={}){
 const story=await tx.item.findUniqueOrThrow({where:{id:run.storyId}});
 if(story.archived||!['coding','code_review','security_scan'].includes(story.status)||run.state!=='succeeded'||!run.commitSha)return false;
 if(!(await checkExecutionScope(h,tx,run)).current)return false;
 const merge=await tx.mergeOperation.findUnique({where:{executionId:run.id}});
 const confirmed=merge?.state==='succeeded'&&merge.sha===run.commitSha;
 const base=(run.snapshot as {codeContext?:{sha?:string}}).codeContext?.sha;
 if(!confirmed&&!(await mergeReadiness(tx,run,base)).ready)return false;
 const changed=await tx.item.update({where:{id:story.id},data:{status:'merge_request',version:{increment:1}}});
 await tx.storyExecution.update({where:{id:run.id},data:{storyVersion:changed.version}});
 await h.event(tx,changed,{id:'system:pipeline',name:'Fluxo da História'},'STORY_MERGE_PHASE_ENTERED','História na fase de Merge Request; integração não conclui a História nem comprova implantação.',{runId:run.id,commitSha:run.commitSha,status:'merge_request'},'system',{
  ...audit,before:{status:story.status,version:story.version},after:{status:changed.status,version:changed.version},operationId:audit.operationId??run.id,
  ...(initiator?{initiator}:{}),reasonCode:confirmed?'MERGE_CONFIRMED':'CURRENT_QUALITY_GATES_PASSED'
 });
 return true;
}
