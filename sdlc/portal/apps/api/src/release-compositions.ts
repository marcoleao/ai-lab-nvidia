import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Release,type ReleaseCompositionRevision} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {canonicalSpecification} from './story-specifications.ts';
import {planningReferences,requirePlanningReference} from './planning-references.ts';
import {DomainError} from './errors.ts';
import {compositionCodeTraceability} from './composition-code-traceability.ts';

const reference=z.object({storyId:z.string(),storyKey:z.string(),storyName:z.string(),recordVersion:z.number().int().positive(),specification:z.object({id:z.string(),number:z.number().int().positive()}).nullable(),execution:z.object({id:z.string(),sha:z.string().nullable(),storyRecordVersion:z.number().int().positive()}).nullable(),contentDigest:z.string().nullable(),contentPolicy:z.string().optional(),referenceToken:z.string().optional()});
export type CompositionStory=z.infer<typeof reference>;
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
export const compositionMembers=(row:{stories:unknown})=>z.array(reference).parse(row.stories);
export function compositionSummary(row:ReleaseCompositionRevision){const {stories,...summary}=row;return summary;}
export const currentComposition=(tx:Transaction,releaseId:string)=>tx.releaseCompositionRevision.findFirst({where:{releaseId},orderBy:{number:'desc'}});

// Only existing authorized commands call this writer, before their recorder and
// RequestKey commit. No GET, worker startup, or historical query creates facts.
export async function recordComposition(tx:Transaction,release:Release,actor:{id:string;name:string},refreshIds:readonly string[]=[],expectedReferences?:ReadonlyMap<string,{token?:string;version:number}>){
 const [previous,links]=await Promise.all([currentComposition(tx,release.id),tx.releaseStory.findMany({where:{releaseId:release.id},include:{story:true},orderBy:{storyId:'asc'}})]);
 const retained=new Map(previous?compositionMembers(previous).map(row=>[row.storyId,row]):[]),refresh=new Set(refreshIds);
 const fresh=links.filter(row=>refresh.has(row.storyId)).map(row=>row.storyId),readings=await planningReferences(tx,fresh);
 for(const id of fresh){const current=readings.get(id)!;const expected=expectedReferences?.get(id);requirePlanningReference(current,expected?.token);if(current.recordVersion!==expected?.version)throw new DomainError('VERSION_CONFLICT','O cadastro da História mudou durante o salvamento. Atualize e revise suas escolhas.',409);}
 const stories:CompositionStory[]=links.map(link=>{
  const old=retained.get(link.storyId),reading=readings.get(link.storyId),item=link.story;
  if(old&&(!reading&&old.recordVersion===link.plannedStoryVersion||reading?.referenceToken&&old.referenceToken===reading.referenceToken))return old;
  if(reading)return reading;
  return {storyId:item.id,storyKey:item.key,storyName:item.name,recordVersion:link.plannedStoryVersion,specification:null,execution:null,contentDigest:null};
 });
 const digest=createHash('sha256').update(canonicalSpecification(stories)).digest('hex');
 return tx.releaseCompositionRevision.create({data:{releaseId:release.id,number:(previous?.number??0)+1,releaseRecordVersion:release.version,compositionStatus:release.compositionStatus,flowEnvironment:release.flowEnvironment,source:'planned',storyCount:stories.length,stories:json(stories),digest,actorId:actor.id,actorName:actor.name,operationId:release.id}});
}

type Helpers=Pick<AssistantHelpers,'db'|'live'|'ancestors'>;
const paging=z.object({page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),asOf:z.string().datetime().optional()}).strict();
const pageInfo=(requested:number,total:number)=>{const totalPages=Math.max(1,Math.ceil(total/20)),page=Math.min(requested,totalPages);return {page,pageSize:20,total,totalPages};};
export function registerReleaseCompositions(app:FastifyInstance,h:Helpers){
 async function scopedRelease(tx:Transaction,id:string){const release=await tx.release.findUnique({where:{id}});if(!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);await h.live(tx,release.systemId);return release;}
 app.get<{Params:{id:string}}>('/api/releases/:id/composition-revisions',async request=>{
  const query=paging.parse(request.query);
  return h.db.$transaction(async tx=>{
   // A clock adjustment must not hide rows already visible in this snapshot.
   const asOf=query.asOf??(await tx.$queryRaw<{asOf:Date}[]>`SELECT GREATEST(CURRENT_TIMESTAMP(3),max("createdAt")) AS "asOf" FROM "ReleaseCompositionRevision" WHERE "releaseId"=${request.params.id}`)[0].asOf.toISOString();
   await scopedRelease(tx,request.params.id);const current=await currentComposition(tx,request.params.id),where={releaseId:request.params.id,createdAt:{lte:new Date(asOf)}},total=await tx.releaseCompositionRevision.count({where}),pagination=pageInfo(query.page,total);
   const rows=await tx.releaseCompositionRevision.findMany({where,orderBy:[{number:'desc'},{id:'desc'}],skip:(pagination.page-1)*20,take:20});
   return {items:rows.map(compositionSummary),pagination,asOf,currentRevisionId:current?.id??null,currentRevisionNumber:current?.number??null};
  },{isolationLevel:'RepeatableRead'});
 });
 app.get<{Params:{id:string;revisionId:string}}>('/api/releases/:id/composition-revisions/:revisionId',async request=>{
  const query=paging.pick({page:true}).parse(request.query);
  return h.db.$transaction(async tx=>{
   const release=await scopedRelease(tx,request.params.id),row=await tx.releaseCompositionRevision.findUnique({where:{id:request.params.revisionId}});
   if(!row||row.releaseId!==release.id)throw new DomainError('COMPOSITION_REVISION_NOT_FOUND','Revisão não encontrada nesta release.',404);
   const current=await currentComposition(tx,release.id),members=compositionMembers(row),pagination=pageInfo(query.page,members.length);
   const stories=members.slice((pagination.page-1)*20,pagination.page*20),traces=await compositionCodeTraceability(tx,release.systemId,stories.map(member=>({...member,compositionCreatedAt:row.createdAt}))),traceabilityAsOf=(await tx.$queryRaw<{at:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS at`)[0].at.toISOString();
   return {revision:compositionSummary(row),stories,codeTraceability:Object.fromEntries(stories.map((member,index)=>[member.storyId,traces[index]])),traceabilityAsOf,pagination,isCurrent:current?.id===row.id,currentRevisionId:current?.id??null};
  },{isolationLevel:'RepeatableRead'});
 });
 app.get<{Params:{id:string}}>('/api/items/:id/release-participations',async request=>{
  const query=paging.parse(request.query);
  return h.db.$transaction(async tx=>{
   const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('INVALID_STORY','Consulte a participação no contexto de uma História.',409);
   const owner=(await h.ancestors(tx,story)).find(parent=>parent.kind==='system');if(!owner)throw new DomainError('INVALID_SYSTEM','Sistema da História não encontrado.',409);
   const contains=JSON.stringify([{storyId:story.id}]);
   const asOf=query.asOf??(await tx.$queryRaw<{asOf:Date}[]>`SELECT GREATEST(CURRENT_TIMESTAMP(3),max(c."createdAt")) AS "asOf" FROM "ReleaseCompositionRevision" c JOIN "Release" r ON r.id=c."releaseId" WHERE r."systemId"=${owner.id} AND c.stories @> ${contains}::jsonb`)[0].asOf.toISOString();
   const scope=Prisma.sql`FROM "ReleaseCompositionRevision" c JOIN "Release" r ON r.id=c."releaseId" WHERE r."systemId"=${owner.id} AND c.stories @> ${contains}::jsonb AND c."createdAt"<=${new Date(asOf)}`;
   const [{total}]=await tx.$queryRaw<{total:number}[]>`SELECT count(*)::integer total ${scope}`,pagination=pageInfo(query.page,total);
   const ids=await tx.$queryRaw<{id:string}[]>`SELECT c.id ${scope} ORDER BY c."createdAt" DESC,c.id DESC LIMIT 20 OFFSET ${(pagination.page-1)*20}`;
   const rows=await tx.releaseCompositionRevision.findMany({where:{id:{in:ids.map(row=>row.id)}},include:{release:{select:{id:true,key:true,name:true,compositionStatus:true}}}}),byId=new Map(rows.map(row=>[row.id,row]));
   const assignment=await tx.releaseStory.findUnique({where:{storyId:story.id},select:{releaseId:true}});
   const members=ids.map(({id})=>{const row=byId.get(id)!;return {...compositionMembers(row).find(member=>member.storyId===story.id)!,compositionCreatedAt:row.createdAt};}),traces=await compositionCodeTraceability(tx,owner.id,members),traceabilityAsOf=(await tx.$queryRaw<{at:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS at`)[0].at.toISOString();
   return {items:ids.map(({id},index)=>{const row=byId.get(id)!;return {...compositionSummary(row),release:row.release,story:compositionMembers(row).find(member=>member.storyId===story.id)!,codeTraceability:traces[index]};}),traceabilityAsOf,pagination,asOf,currentPlanningReleaseId:assignment?.releaseId??null,coverage:'Composições registradas a partir da adoção. Registro inicial observado não reconstrói alterações anteriores.'};
  },{isolationLevel:'RepeatableRead'});
 });
}
