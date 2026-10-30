import type {Transaction} from '../../../packages/db/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {inheritedRepository} from './system-repository.ts';
import {DomainError} from './errors.ts';
import {auditFingerprint} from './audit.ts';
export async function historicalMergeContext(tx:Transaction,h:AssistantHelpers,id:string,ignoreCloseId?:string){
  const op=await tx.mergeOperation.findUnique({where:{id}});if(!op)throw new DomainError('MERGE_NOT_FOUND','A operação de integração não foi encontrada.',404);
  const story=await h.live(tx,op.storyId);await h.ensureNotArchived(tx,story);
  const run=await tx.storyExecution.findUniqueOrThrow({where:{id:op.executionId}}),repo=await inheritedRepository(tx,story);
  const latest=await tx.storyExecution.findFirst({where:{storyId:story.id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if(latest?.id===run.id)throw new DomainError('HISTORY_CURRENT_EXECUTION','Esta integração pertence à execução atual. Acompanhe ou verifique a solicitação na atividade atual da História.',409);
  const resolution=await tx.mergeHistoryResolution.findUnique({where:{operationId:op.id}});
  if((!(op.state==='cancelled'&&resolution)&&!['tracking','blocked','failed','succeeded'].includes(op.state))||run.state!=='succeeded'||run.storyId!==story.id||run.commitSha!==op.sha)throw new DomainError('HISTORY_OPERATION_UNAVAILABLE','A verificação histórica exige uma entrega de código concluída, com a mesma revisão e sem integração em andamento. Acompanhe a solicitação existente.',409);
  const now=new Date();
  if(await tx.mergeHistoryCloseOperation.count({where:{mergeOperationId:op.id,id:{not:ignoreCloseId??''},state:{in:['queued','running','unknown','paused']}}}))throw new DomainError('HISTORY_REMOTE_CLOSE_PENDING','Há um fechamento deste MR aguardando confirmação. Verifique o resultado do pedido existente.',409);
  if(op.leaseUntil&&op.leaseUntil>now||await tx.mergePreparation.count({where:{operationId:op.id,OR:[{state:{in:['queued','running','paused','failed']}},{leaseUntil:{gt:now}}]}})||await tx.workAttempt.count({where:{sourceType:'merge',sourceId:op.id,state:{in:['queued','running','paused']}}}))throw new DomainError('HISTORY_OPERATION_BUSY','Há consulta, integração ou liberação ainda pendente nesta operação. Acompanhe esse pedido antes de registrar outra confirmação.',409);
  if(!repo||repo.id!==run.repositoryId||repo.state!=='ready'||repo.gitlabProjectId!==op.projectId)throw new DomainError('HISTORY_REPOSITORY_CHANGED','O repositório da integração não corresponde ao repositório atual do Sistema. Revise esse vínculo antes de continuar.',409);
  // State/lease are guarded separately; a concurrent confirmation may satisfy the same observation.
  const context={storyId:story.id,storyVersion:story.version,latestExecutionId:latest?.id,repositoryId:repo.id,repositoryVersion:repo.version,projectId:op.projectId,operationId:op.id,executionId:run.id,sourceBranch:op.sourceBranch,targetBranch:op.targetBranch,sourceSha:op.sha,executionState:run.state};
  return {op,story,run,repo,resolution,context,digest:auditFingerprint(context)};
 }
