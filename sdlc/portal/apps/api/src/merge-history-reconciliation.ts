import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {MergeProvider} from './merge-provider.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {historicalMergeContext} from './merge-history-context.ts';
import {mergeClosureObservationSchema,mergeOpenClosureObservationSchema} from './merge-closure-observation.ts';
import {DomainError} from './errors.ts';
import {auditFingerprint} from './audit.ts';
import {captureMergeIntegration,integrationReadings,observedIntegrationSchema} from './merge-integration-reference.ts';

/** An observation of a past merge. Never enqueues work or invokes a provider write. */
export function registerMergeHistoryReconciliation(app:FastifyInstance,h:AssistantHelpers,provider?:MergeProvider){
 const local=(tx:Transaction,id:string)=>historicalMergeContext(tx,h,id);
 async function consult(id:string){
  if(!provider)throw new DomainError('HISTORY_PROVIDER_UNAVAILABLE','A consulta de integração ao GitLab não está configurada.',503);
  const before=await h.db.$transaction(tx=>local(tx,id),{isolationLevel:'RepeatableRead'});
  const remote=await provider.inspect(before.op),parsed=observedIntegrationSchema.safeParse(remote.integration);
  const v=parsed.success?parsed.data:null;
  const confirmable=remote.state==='merged'&&!remote.blocks.length&&remote.sha===before.op.sha&&v!==null&&v.projectId===before.op.projectId&&v.iid===before.op.iid&&v.sourceBranch===before.op.sourceBranch&&v.targetBranch===before.op.targetBranch&&v.sourceSha===before.op.sha;
  const reason=confirmable?null:remote.state==='opened'?'O Merge Request continua aberto. Não há merge confirmado para registrar. Revise essa integração anterior com a pessoa responsável; esta verificação não executa merge.':remote.state==='closed'?'O Merge Request está fechado sem confirmação de merge. Fechar um MR não comprova integração. Revise a entrega com a pessoa responsável.':'O GitLab não confirmou a mesma revisão, projeto e branches da operação. Revise a referência com a pessoa responsável; nenhum sucesso foi presumido.';
  const closed=mergeClosureObservationSchema.safeParse(remote.closure);
  const closureObservation=closed.success?closed.data:null;
  const closureAllowed=remote.state==='closed'&&!remote.integration&&remote.sha===before.op.sha&&remote.mergedAt===null&&closureObservation!==null&&closureObservation.projectId===before.op.projectId&&closureObservation.iid===before.op.iid&&closureObservation.sourceSha===before.op.sha&&closureObservation.sourceBranch===before.op.sourceBranch&&closureObservation.targetBranch===before.op.targetBranch&&!remote.blocks.some(b=>b.category==='changed')&&before.op.state!=='succeeded';
  const opened=mergeOpenClosureObservationSchema.safeParse(remote.openForClosure),openObservation=opened.success?opened.data:null;
  const remoteCloseAllowed=!!provider.closeHistorical&&remote.state==='opened'&&!remote.integration&&remote.mergedAt===null&&remote.sha===before.op.sha&&openObservation!==null&&openObservation.projectId===before.op.projectId&&openObservation.iid===before.op.iid&&openObservation.sourceSha===before.op.sha&&openObservation.sourceBranch===before.op.sourceBranch&&openObservation.targetBranch===before.op.targetBranch&&openObservation.sourceBranch.startsWith('sdlc/')&&!remote.blocks.some(b=>b.category==='changed')&&before.op.state!=='succeeded';
  const after=await h.db.$transaction(tx=>local(tx,id),{isolationLevel:'RepeatableRead'});
  if(after.digest!==before.digest)throw new DomainError('HISTORY_CONTEXT_CHANGED','O contexto mudou durante a consulta. Consulte novamente antes de registrar.',409);
  return {local:after,remote,observation:v,confirmable,reason,closureObservation,closureAllowed,openObservation,remoteCloseAllowed,queriedAt:new Date().toISOString(),contextToken:auditFingerprint({context:after.context,observation:v,mergedBy:remote.mergedBy,remoteState:remote.state,confirmable,...(closureObservation?{closureObservation,closureAllowed}:{}),...(openObservation?{openObservation,remoteCloseAllowed}:{})})};
 }
 app.get<{Params:{id:string}}>('/api/merge-operations/:id/historical-reconciliation-review',async request=>{
  z.object({}).strict().parse(request.query);const result=await consult(request.params.id);
  const op=result.local.op;
  return {operationId:op.id,executionId:result.local.run.id,repositoryName:result.local.repo.name,storyVersion:result.local.story.version,contextToken:result.contextToken,expected:{iid:op.iid,sourceSha:op.sha,sourceBranch:op.sourceBranch,targetBranch:op.targetBranch},observation:result.confirmable?result.observation:null,remoteState:result.remote.state,closureObservation:result.closureAllowed?result.closureObservation:null,closureAllowed:result.closureAllowed,openObservation:result.remoteCloseAllowed?result.openObservation:null,remoteCloseAllowed:result.remoteCloseAllowed,confirmable:result.confirmable,reason:result.reason,queriedAt:result.queriedAt};
 });
 app.post<{Params:{id:string}}>('/api/merge-operations/:id/historical-reconciliation',async request=>{
  const body=z.object({confirmed:z.literal(true),contextToken:z.string().regex(/^[a-f0-9]{64}$/),observation:observedIntegrationSchema}).strict().parse(request.body);
  const person=h.actor(request);h.canPlan(person);const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']),id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
  const cached=()=>h.mutate(request,async()=>{throw Error('Expected cached historical confirmation');});
  if(await h.db.requestKey.findUnique({where:{id}}))return cached();
  let reviewed:Awaited<ReturnType<typeof consult>>;
  try{reviewed=await consult(request.params.id);if(!reviewed.confirmable||body.contextToken!==reviewed.contextToken||auditFingerprint(body.observation)!==auditFingerprint(reviewed.observation))throw new DomainError('HISTORY_OBSERVATION_CHANGED',reviewed.reason||'A referência ou o contexto mudou. Consulte novamente e revise a confirmação.',409);}
  catch(error){if(await h.db.requestKey.findUnique({where:{id}}))return cached();throw error;}
  return h.mutate(request,async(tx,actor)=>{
   const current=await local(tx,request.params.id);
   if(current.digest!==reviewed.local.digest)throw new DomainError('HISTORY_CONTEXT_CHANGED','O contexto mudou antes do registro. Consulte novamente antes de confirmar.',409);
   const old=await tx.mergeIntegrationReference.findUnique({where:{operationId:current.op.id}});
   const before={state:current.op.state,finishedAt:current.op.finishedAt?.toISOString()??null,origin:current.op.origin,mergedBy:current.op.mergedBy,integrationReferenceId:old?.id??null};
   const changed=current.op.state!=='succeeded'||!old;
   // The original attempt and all current pipeline facts remain unchanged.
   if(current.op.state!=='succeeded')await tx.mergeOperation.update({where:{id:current.op.id},data:{state:'succeeded',checkedAt:new Date(),finishedAt:reviewed.observation?.mergedAt?new Date(reviewed.observation.mergedAt):null,origin:reviewed.remote.mergedBy?reviewed.remote.mergedBy==='sdlc-agent-for-merge'?'assistant':'human':null,mergedBy:reviewed.remote.mergedBy,message:'Merge confirmado em verificação histórica posterior. A tentativa original e a revisão atual permanecem preservadas.',blocks:[],leaseId:null,leaseUntil:null}});
   const row=old??await captureMergeIntegration(tx,current.op,reviewed.remote);
   if(!row)throw new DomainError('HISTORY_OBSERVATION_CHANGED','A consulta não forneceu uma confirmação que possa ser registrada.',409);
   const updated=await tx.mergeOperation.findUniqueOrThrow({where:{id:current.op.id}}),after={state:updated.state,finishedAt:updated.finishedAt?.toISOString()??null,origin:updated.origin,mergedBy:updated.mergedBy,integrationReferenceId:row.id};
   await h.event(tx,current.story,actor,'MERGE_HISTORY_RECONCILED',changed?'Integração anterior confirmada por consulta e confirmação humana posteriores; nenhuma nova integração ou aprovação foi executada.':'Integração anterior já confirmada; registro e fonte imutável preservados.',{operationId:current.op.id,runId:current.run.id,sourceSha:row.sourceSha,integrationSha:row.integrationSha,integrationReferenceId:row.id,targetBranch:row.targetBranch},'human',{outcome:changed?'SUCCEEDED':'NO_CHANGE',phase:'COMPLETED',decision:'NOT_APPLICABLE',before,after,operationId:current.op.id,subject:{type:'merge_operation',id:current.op.id}});
   return {changed,integrationReference:{...(await integrationReadings(tx,[current.op.id])).get(current.op.id)!,historicalReconciliation:true}};
  });
 });
 return {consult};
}
export type MergeHistoryConsult=ReturnType<typeof registerMergeHistoryReconciliation>['consult'];
