import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID,createHash} from 'node:crypto';
import type {Transaction} from '../../../packages/db/client.ts';
import type {Prisma} from '../../../packages/db/generated/client.ts';
import {auditEnvelopeSchema,auditOutcomes,auditPhases,auditDecisions,type AuditActor,type AuditChange,type AuditDecision,type AuditEnvelope,type AuditEvidence,type AuditOutcome,type AuditPhase,type AuditTarget} from '../../../packages/shared/src/audit.ts';
import {auditPolicy} from './audit-catalog.ts';
export type {AuditActor,AuditChange,AuditDecision,AuditEnvelope,AuditEvidence,AuditOutcome,AuditPhase,AuditTarget} from '../../../packages/shared/src/audit.ts';

type Person={id:string;name:string;type?:string;authentication?:string;assurance?:string};
export type AuditItem={id:string;kind?:string;key?:string;name?:string;parentId?:string|null;version?:number;[key:string]:unknown};
export type AuditContext={operationId?:string;requestId?:string;attemptId?:string;causationEventId?:string;initiator?:Person;onBehalfOf?:Person;source?:string|{component:string;channel:string}};
export type AuditOptions={before?:Record<string,unknown>|null;after?:Record<string,unknown>|null;changes?:AuditChange[];outcome?:AuditOutcome;phase?:AuditPhase;decision?:AuditDecision;initiator?:Person;executor?:Person;onBehalfOf?:Person;operationId?:string;requestId?:string;attemptId?:string;causationEventId?:string;reasonCode?:string;evidence?:AuditEvidence[];targets?:AuditTarget[];subject?:AuditTarget;occurredAt?:Date;changeCoverage?:AuditEnvelope['changeCoverage'];deduplicationKey?:string};
const contextStorage=new AsyncLocalStorage<AuditContext>();
export function withAuditContext<T>(context:AuditContext,fn:()=>T):T{return contextStorage.run({...contextStorage.getStore(),...context},fn);}
export function currentAuditContext(){return contextStorage.getStore();}
function plain(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function safeAuditText(value:unknown,max=240):string{
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\bBearer\s+\S+/gi,'Bearer [restrito]').replace(/\b(glpat-|sk-)[A-Za-z0-9_-]{8,}/g,'[restrito]').slice(0,max);
}
function identifier(value:unknown,label:string){const result=safeAuditText(value);if(!result)throw new Error(`AUDIT_${label}_REQUIRED`);return result;}
function actor(value:Person|undefined,fallbackType='unknown'):AuditActor{
  if(!value)return {id:'unknown:initiator',name:'Iniciador não capturado',type:'unknown',authentication:'unknown'};
  const type=['human','agent','system','service','anonymous','unknown'].includes(value.type??'')?value.type as AuditActor['type']:fallbackType==='human'?'human':fallbackType==='agent'?'agent':fallbackType==='system'?'system':'service';
  const claimed=value.authentication??value.assurance;
  const authentication:AuditActor['authentication']=type==='anonymous'?'unauthenticated':type==='human'?(claimed==='verified'?'verified':'declared_demo'):type==='unknown'?'unknown':'service';
  return {id:identifier(value.id,'ACTOR'),name:identifier(value.name,'ACTOR_NAME'),type,authentication};
}
function safeUrl(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>1000)return undefined;
  try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return undefined;u.search='';u.hash='';return u.toString();}catch{return undefined;}
}
function evidence(value:AuditEvidence):AuditEvidence{
  const url=safeUrl(value.url);
  return {type:identifier(value.type,'EVIDENCE_TYPE'),...(value.id?{id:safeAuditText(value.id)}:{}),...(url?{url}:{}),...(value.revision?{revision:safeAuditText(value.revision)}:{}),...(value.source?{source:safeAuditText(value.source)}:{}),...(value.observedAt?{observedAt:value.observedAt}:{})};
}
function target(value:AuditTarget):AuditTarget{return {type:identifier(value.type,'TARGET_TYPE'),id:identifier(value.id,'TARGET'),...(value.key?{key:safeAuditText(value.key)}:{}),...(value.name?{name:safeAuditText(value.name)}:{}),...(Number.isInteger(value.version)&&value.version!>=0?{version:value.version}:{})};}
const publicFields=new Set(['id','kind','key','name','status','version','archived','parentId','parentKind','projectLifecycle','repositoryIds','taskIds','taskId','releaseId','fromReleaseId','toReleaseId','plannedStoryVersion','gitlabState','gitlabGroupId','gitlabGroupPath','gitlabProjectId','gitlabPath','state','stage','attempts','currentAttemptId','currentVersion','currentPackageDigest','decision','gate','sha','commitSha','baseSha','policyVersion','revision','sourceBranch','targetBranch','allowDependencies','completion','scope','links','stories','storyId','repositoryId','storyVersion','releaseVersion','descriptionRevision','descriptionDigest']);
for(const field of ['linkId','sourceType','sourceId','sourceVersion','projectId','planProposalId','planRevision','sourceTurnId'])publicFields.add(field);
type AuditJson=Extract<AuditChange['before'],{kind:'value'}>['value'];
function cleanValue(value:unknown,depth=0):AuditJson{
  if(depth>5)throw new Error('AUDIT_VALUE_TOO_DEEP');
  if(value===null)return null;
  if(typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('AUDIT_VALUE_INVALID');return value;}
  if(typeof value==='string')return safeAuditText(value,1000);
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value)){if(value.length>5000)throw new Error('AUDIT_VALUE_TOO_LARGE');return value.map(v=>cleanValue(v,depth+1));}
  if(value&&typeof value==='object'){
    const result:Record<string,AuditJson>={};
    for(const [key,field] of Object.entries(value))if(publicFields.has(key))result[key]=cleanValue(field,depth+1);
    return result;
  }
  throw new Error('AUDIT_VALUE_INVALID');
}
function auditValue(field:string,record:Record<string,unknown>|null|undefined):AuditChange['before']{
  if(record===undefined)return {kind:'not_observed'};
  if(record===null||!Object.prototype.hasOwnProperty.call(record,field))return {kind:'absent'};
  if(record[field]===undefined)return {kind:'absent'};
  if(!publicFields.has(field))return {kind:'restricted'};
  return {kind:'value',value:cleanValue(record[field])};
}
function normalizeChange(value:AuditChange):AuditChange{
  const field=identifier(value.field,'FIELD');
  const normalize=(v:AuditChange['before']):AuditChange['before']=>v.kind==='value'?(publicFields.has(field)?{kind:'value',value:cleanValue(v.value)}:{kind:'restricted'}):v;
  return {field,before:normalize(value.before),after:normalize(value.after)};
}
export function auditChanges(before:Record<string,unknown>|null|undefined,after:Record<string,unknown>|null|undefined):AuditChange[]{
  const fields=new Set([...Object.keys(before??{}),...Object.keys(after??{})]);
  const changes:AuditChange[]=[];
  for(const field of fields){
    if(['updatedAt','createdAt','parent','children','data'].includes(field))continue;
    const a=auditValue(field,before),b=auditValue(field,after);
    // Restricted content can change even when the two safe representations match.
    const different=JSON.stringify(before?.[field])!==JSON.stringify(after?.[field]);
    if(different||a.kind!==b.kind)changes.push({field:safeAuditText(field),before:a,after:b});
  }
  return changes;
}
export function safePublicAudit(value:unknown):AuditEnvelope|null{
  const parsed=auditEnvelopeSchema.safeParse(value);if(!parsed.success)return null;
  try{
    const v=parsed.data;
    return auditEnvelopeSchema.parse({...v,target:target(v.target),targets:v.targets.map(target),initiator:actor(v.initiator,v.initiator.type),executor:actor(v.executor,v.executor.type),...(v.onBehalfOf?{onBehalfOf:actor(v.onBehalfOf,v.onBehalfOf.type)}:{}),changes:v.changes.map(normalizeChange),evidence:v.evidence.map(evidence),...(v.reasonCode?{reasonCode:safeAuditText(v.reasonCode)}:{}),source:{component:safeAuditText(v.source.component),channel:safeAuditText(v.source.channel)}});
  }catch{return null;}
}
const payloadScalars=new Set(['metricsVersion','key','status','version','releaseVersion','plannedStoryVersion','projectLifecycle','from','to','state','result','outcome','durationMs','processingMs','queueMs','runId','executionId','operationId','activityId','attemptId','turnId','messageId','proposalId','checkId','releaseId','repositoryId','projectId','previousRunId','fromReleaseId','toReleaseId','correlationId','requestId','commitSha','sha','baseSha','revision','gate','stage','kind','policyVersion','errorCode','model','retry','ready','origin','mergedBy','gitlabGroupId','gitlabGroupPath','gitlabProjectId','gitlabPath','name','storyCount','storyId','storyVersion','removed','workProcess','workKind','workScopeKey']);
const payloadArrays=new Set(['itemIds','taskIds','repositoryIds','transferredStoryIds','fromReleaseIds','categories']);
for(const field of ['linkId','sourceType','sourceId','sourceVersion','planProposalId','planRevision','sourceTurnId'])payloadScalars.add(field);
export function safeStoredPayload(value:unknown):Prisma.InputJsonValue{
  const result:Record<string,Prisma.JsonValue>={};
  for(const [key,field] of Object.entries(plain(value))){
    if(payloadScalars.has(key)&&(field===null||typeof field==='boolean'||typeof field==='string'||typeof field==='number'))result[key]=cleanValue(field);
    else if(payloadArrays.has(key)&&Array.isArray(field)){
      if(field.length>5000)throw new Error('AUDIT_PAYLOAD_TOO_LARGE');
      result[key]=field.filter(entry=>typeof entry==='string').map(entry=>safeAuditText(entry));
    }else if(key==='gitlabUrl'){
      const url=safeUrl(field);if(url)result[key]=url;
    }else if(key==='severities'){
      const severities:Record<string,number>={};
      for(const [severity,count] of Object.entries(plain(field)))if(['CRITICAL','HIGH','MEDIUM','LOW','INFO'].includes(severity)&&typeof count==='number'&&Number.isInteger(count)&&count>=0)severities[severity]=count;
      result[key]=severities;
    }else if(['before','after'].includes(key)&&Array.isArray(field))result[key]=cleanValue(field) as Prisma.JsonValue;
  }
  return result;
}
function canonical(value:unknown):unknown{
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function auditFingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function automaticEvidence(payload:Record<string,unknown>):AuditEvidence[]{
  const result:AuditEvidence[]=[];
  if(typeof payload.gitlabGroupId==='number'||typeof payload.gitlabProjectId==='number')result.push({type:typeof payload.gitlabGroupId==='number'?'gitlab_group':'gitlab_project',id:String(payload.gitlabGroupId??payload.gitlabProjectId),source:'gitlab',...(safeUrl(payload.gitlabUrl)?{url:safeUrl(payload.gitlabUrl)}:{})});
  for(const key of ['commitSha','sha','runId','operationId','attemptId','turnId','proposalId','checkId','releaseId','repositoryId']){
    if(typeof payload[key]==='string'&&payload[key])result.push({type:key,id:safeAuditText(payload[key]),...(['sha','commitSha'].includes(key)?{revision:safeAuditText(payload[key])}:{})});
  }
  return result;
}
export async function recordAudit(tx:Transaction,item:AuditItem,person:Person,action:string,message:string,payload:unknown,actorType='human',options:AuditOptions={}):Promise<void>{
  const policy=auditPolicy(action),context=contextStorage.getStore(),p=plain(payload);
  let outcome=options.outcome??policy.outcome,phase=options.phase??policy.phase,decision=options.decision??policy.decision;
  if(action==='QUALITY_CHECK_COMPLETED'){
    if(!['passed','blocked'].includes(String(p.result)))throw new Error('AUDIT_QUALITY_RESULT_REQUIRED');
    const verdict=p.result==='passed'?'APPROVED':'REJECTED';
    if(options.decision&&options.decision!==verdict)throw new Error('AUDIT_QUALITY_DECISION_CONFLICT');
    decision=verdict;
  }
  if(!auditOutcomes.includes(outcome)||!auditPhases.includes(phase)||(decision!==undefined&&!auditDecisions.includes(decision)))throw new Error('AUDIT_OUTCOME_INVALID');
  if(outcome==='UNKNOWN'&&phase!=='OBSERVED')throw new Error('AUDIT_UNKNOWN_REQUIRES_OBSERVATION');
  if(outcome==='ACCEPTED'&&phase!=='REQUESTED')throw new Error('AUDIT_ACCEPTED_REQUIRES_REQUEST');
  if(phase==='STARTED'&&outcome!=='SUCCEEDED')throw new Error('AUDIT_STARTED_CONFIRMS_START_ONLY');
  if(policy.effect==='local'&&!['SUCCEEDED','NO_CHANGE'].includes(outcome))throw new Error('AUDIT_LOCAL_FACT_REQUIRES_CONFIRMATION');
  if(phase==='REQUESTED'&&!['ACCEPTED','REJECTED','FAILED'].includes(outcome))throw new Error('AUDIT_REQUEST_OUTCOME_INVALID');
  if(!(policy.allowedOutcomes??[policy.outcome]).includes(outcome)||!(policy.allowedPhases??[policy.phase]).includes(phase))throw new Error(`AUDIT_ACTION_OUTCOME_NOT_ALLOWED: ${action}`);
  if(action==='QUALITY_CHECK_FAILED'&&decision!=='NOT_EVALUATED')throw new Error('AUDIT_FAILED_ANALYSIS_CANNOT_DECIDE');
  const subject=target(options.subject??{type:item.kind??'item',id:item.id,key:item.key,name:item.name,version:item.version});
  const installation=await tx.auditInstallation.findUniqueOrThrow({where:{id:1},select:{epochId:true}});
  const auditEpochId=identifier(installation.epochId,'EPOCH');
  const ancestorIds:string[]=[];let parentId=item.parentId;const seen=new Set([item.id]);
  while(parentId){
    if(seen.has(parentId))throw new Error('AUDIT_ANCESTOR_CYCLE');seen.add(parentId);
    const parent=await tx.item.findUnique({where:{id:parentId},select:{id:true,parentId:true}});
    if(!parent)throw new Error('AUDIT_ANCESTOR_MISSING');ancestorIds.unshift(parent.id);parentId=parent.parentId;
  }
  const executor=actor(options.executor??{...person,type:actorType},actorType);
  const initiator=actor(options.initiator??context?.initiator??(executor.type==='human'?person:undefined),executor.type==='human'?'human':'unknown');
  let before=options.before,after=options.after;
  if(action==='ITEM_CREATED'&&before===undefined){before=null;after=after??item;}
  if(policy.changes==='expected'&&options.changes===undefined&&(before===undefined||after===undefined))throw new Error(`AUDIT_CHANGES_REQUIRED: ${action}`);
  const changes=(options.changes??auditChanges(before,after)).map(normalizeChange);
  if(policy.changes==='expected'&&changes.some(change=>change.before.kind==='not_observed'||change.after.kind==='not_observed'))throw new Error(`AUDIT_CHANGE_VALUE_NOT_OBSERVED: ${action}`);
  const changeCoverage=options.changeCoverage??(options.changes!==undefined||before!==undefined||after!==undefined?'captured':policy.changes==='not_applicable'?'not_applicable':'not_captured');
  const onBehalfOf=options.onBehalfOf??context?.onBehalfOf;
  const source=typeof context?.source==='string'?{component:context.source,channel:actorType==='human'?'http':'worker'}:context?.source??{component:'portal-api',channel:actorType==='human'?'http':'worker'};
  const envelope=auditEnvelopeSchema.parse({schemaVersion:2,auditEpochId,target:subject,targets:(options.targets??[]).map(target),initiator,executor,...(onBehalfOf?{onBehalfOf:actor(onBehalfOf,'human')}:{}),changes,changeCoverage,evidence:(options.evidence??automaticEvidence(p)).map(evidence),...((options.reasonCode??p.errorCode)?{reasonCode:safeAuditText(options.reasonCode??p.errorCode)}:{}),source,coverage:{version:2}});
  const correlation=options.operationId??context?.operationId??(['operationId','runId','activityId','turnId','proposalId','repositoryId'].find(k=>typeof p[k]==='string')?String(p[['operationId','runId','activityId','turnId','proposalId','repositoryId'].find(k=>typeof p[k]==='string')!]):undefined)??randomUUID();
  const occurredAt=options.occurredAt??new Date();if(!Number.isFinite(occurredAt.getTime()))throw new Error('AUDIT_TIME_INVALID');
  // One INSERT seals the full event, changes and targets. Any failure propagates
  // to the domain transaction; no best-effort catch can silently save a change.
  const data={itemId:item.id,ancestorIds,actorId:executor.id,actorName:executor.name,actorType:executor.type,action,message:safeAuditText(message,3000),payload:safeStoredPayload(payload),
    schemaVersion:2,auditEpochId,outcome,phase,decision:decision??null,operationId:identifier(correlation,'OPERATION'),requestId:options.requestId??context?.requestId??null,attemptId:options.attemptId??context?.attemptId??(typeof p.attemptId==='string'?p.attemptId:null),causationEventId:options.causationEventId??context?.causationEventId??null,subjectType:subject.type,subjectId:subject.id,occurredAt,audit:envelope as unknown as Prisma.InputJsonValue};
  if(options.deduplicationKey===undefined){await tx.historyEvent.create({data});return;}
  if(!options.deduplicationKey||options.deduplicationKey.length>500)throw new Error('AUDIT_DEDUP_KEY_INVALID');
  if(!options.operationId&&!context?.operationId)throw new Error('AUDIT_DEDUP_REQUIRES_STABLE_OPERATION');
  const deduplicationKey=auditFingerprint({auditEpochId,source,operationId:data.operationId,action,subject:{type:subject.type,id:subject.id},attemptId:data.attemptId,key:options.deduplicationKey});
  const eventDigest=auditFingerprint({...data,requestId:undefined,occurredAt:options.occurredAt});
  // ON CONFLICT DO NOTHING avoids both UPDATE on an immutable row and a unique
  // violation that would poison the caller's PostgreSQL transaction.
  const inserted=await tx.$queryRaw<{id:string}[]>`INSERT INTO "HistoryEvent" (id,"itemId","ancestorIds","actorId","actorName","actorType",action,message,payload,"schemaVersion","auditEpochId",outcome,phase,decision,"operationId","requestId","attemptId","causationEventId","subjectType","subjectId","occurredAt",audit,"deduplicationKey","eventDigest") VALUES (${randomUUID()},${data.itemId},${data.ancestorIds}::text[],${data.actorId},${data.actorName},${data.actorType},${data.action},${data.message},${JSON.stringify(data.payload)}::jsonb,2,${data.auditEpochId},${data.outcome},${data.phase},${data.decision},${data.operationId},${data.requestId},${data.attemptId},${data.causationEventId},${data.subjectType},${data.subjectId},${data.occurredAt},${JSON.stringify(data.audit)}::jsonb,${deduplicationKey},${eventDigest}) ON CONFLICT ("deduplicationKey") DO NOTHING RETURNING id`;
  if(inserted.length)return;
  const existing=await tx.historyEvent.findUnique({where:{deduplicationKey},select:{eventDigest:true}});
  if(!existing||existing.eventDigest!==eventDigest)throw new Error('AUDIT_DEDUPLICATION_CONFLICT');
}
