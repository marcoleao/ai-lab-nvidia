import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeHistoryConsult} from './merge-history-reconciliation.ts';
import {historicalMergeContext} from './merge-history-context.ts';
import {mergeClosureObservationSchema} from './merge-closure-observation.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';
import {integrationReadings} from './merge-integration-reference.ts';

/** Ends local tracking only, recording the closed MR observed at that time. */
export function registerMergeHistoryClosure(app:FastifyInstance,h:AssistantHelpers,consult:MergeHistoryConsult){
 app.post<{Params:{id:string}}>('/api/merge-operations/:id/historical-closure',async request=>{
  const body=z.object({confirmed:z.literal(true),contextToken:z.string().regex(/^[a-f0-9]{64}$/),observation:mergeClosureObservationSchema,reason:z.string().trim().min(10).max(2000)}).strict().parse(request.body);
  const person=h.actor(request);h.canPlan(person);const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']),id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
  const cached=()=>h.mutate(request,async()=>{throw Error('Expected historical closure receipt');});
  if(await h.db.requestKey.findUnique({where:{id}}))return cached();
  let reviewed:Awaited<ReturnType<MergeHistoryConsult>>;
  try{reviewed=await consult(request.params.id);if(!reviewed.closureAllowed||body.contextToken!==reviewed.contextToken||auditFingerprint(body.observation)!==auditFingerprint(reviewed.closureObservation))throw new DomainError('HISTORY_CLOSURE_UNCONFIRMED','O MR não está confirmado como fechado para a mesma revisão, ou o contexto mudou. Consulte novamente; nenhum acompanhamento foi encerrado.',409);}
  catch(error){if(await h.db.requestKey.findUnique({where:{id}}))return cached();throw error;}
  return h.mutate(request,async(tx,actor)=>{
   const current=await historicalMergeContext(tx,h,request.params.id);
   if(current.digest!==reviewed.local.digest)throw new DomainError('HISTORY_CONTEXT_CHANGED','O contexto mudou antes do encerramento. Consulte novamente antes de confirmar.',409);
   if(current.op.state==='succeeded'||await tx.mergeIntegrationReference.count({where:{operationId:current.op.id}})||await tx.workAttempt.count({where:{sourceType:'merge',sourceId:current.op.id,state:'succeeded'}}))throw new DomainError('HISTORY_INTEGRATION_RECORDED','Há integração ou tentativa confirmada nesta operação. O encerramento sem merge não pode substituir essa evidência.',409);
   const old=current.resolution,before={state:current.op.state,finishedAt:current.op.finishedAt?.toISOString()??null,historyResolutionId:old?.id??null,reasonDigest:old?auditFingerprint(old.reason):null};
   if(!old)await tx.mergeOperation.update({where:{id:current.op.id},data:{state:'cancelled',checkedAt:new Date(),finishedAt:new Date(),message:'Acompanhamento do pedido anterior encerrado após consulta de MR fechado; sem merge confirmado naquela consulta. A tentativa original permanece preservada.',blocks:[],leaseId:null,leaseUntil:null}});
   const row=old??await tx.mergeHistoryResolution.create({data:{operationId:current.op.id,executionId:current.run.id,storyId:current.story.id,repositoryId:current.repo.id,repositoryVersion:current.repo.version,projectId:current.op.projectId,iid:current.op.iid,sourceBranch:current.op.sourceBranch,targetBranch:current.op.targetBranch,sourceSha:current.op.sha,observedState:'closed',observedAt:new Date(reviewed.queriedAt),actorId:actor.id,actorName:actor.name,reason:body.reason,policyVersion:'gitlab-closed-mr-observation-v1'}});
   const updated=await tx.mergeOperation.findUniqueOrThrow({where:{id:current.op.id}}),after={state:updated.state,finishedAt:updated.finishedAt?.toISOString()??null,historyResolutionId:row.id,reasonDigest:auditFingerprint(row.reason)};
   await h.event(tx,current.story,actor,'MERGE_HISTORY_CLOSED',old?'O acompanhamento já estava encerrado; decisão e motivo originais preservados.':'Acompanhamento da integração anterior encerrado após consulta e confirmação humana. Sem merge confirmado naquela consulta; o ciclo atual permanece preservado.',{operationId:current.op.id,runId:current.run.id,historyResolutionId:row.id,sourceSha:row.sourceSha,targetBranch:row.targetBranch,reasonDigest:auditFingerprint(row.reason)},'human',{outcome:old?'NO_CHANGE':'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',before,after,operationId:current.op.id,subject:{type:'merge_operation',id:current.op.id}});
   return {changed:!old,integrationReference:(await integrationReadings(tx,[current.op.id])).get(current.op.id)};
  });
 });
}
