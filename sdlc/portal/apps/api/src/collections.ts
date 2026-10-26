import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {kinds,parentKinds,statuses} from '@sdlc/shared';
import type {Database,Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Item,type HistoryEvent} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import {safePublicAudit} from './audit.ts';

const pageSize=20;
const booleanQuery=z.enum(['true','false']).default('false');
const pageQuery=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1);
const directionQuery=z.enum(['asc','desc']);
const lifecycle=['planned','active','inactive','completed','cancelled'] as const;
const idsQuery=z.string().max(161000).refine(value=>value==='none'||(value.split(',').length<=1000&&value.split(',').every(id=>id.length>0&&id.length<=160)),'Informe até 1000 identificadores válidos.').optional();
const itemQuery=z.object({
  kind:z.enum(kinds),parentId:z.string().trim().min(1).max(160).optional(),
  projectId:z.string().trim().min(1).max(160).optional(),
  ids:idsQuery,
  q:z.string().trim().max(200).default(''),status:z.string().min(1).max(80).optional(),
  projectLifecycle:z.enum(lifecycle).optional(),includeInactive:booleanQuery,includeArchived:booleanQuery,
  sort:z.enum(['name','createdAt','updatedAt','status','projectLifecycle']).optional(),
  direction:directionQuery.optional(),page:pageQuery,
}).strict().superRefine((value,ctx)=>{
  const projectStories=value.kind==='story'&&Boolean(value.projectId)&&!value.parentId;
  if(Boolean(value.parentId)!==Boolean(parentKinds[value.kind])&&!projectStories)ctx.addIssue({code:'custom',path:['parentId'],message:'Informe o contexto pai correto para esta coleção.'});
  if(value.projectId&&(value.kind!=='story'||value.parentId))ctx.addIssue({code:'custom',path:['projectId'],message:'Use Projeto somente para consultar Histórias, sem informar outro pai.'});
  if(value.status&&!(statuses[value.kind] as readonly string[]).includes(value.status))ctx.addIssue({code:'custom',path:['status'],message:'Status não disponível para esta coleção.'});
  if(value.kind!=='project'&&(value.projectLifecycle||value.sort==='projectLifecycle'))ctx.addIssue({code:'custom',path:['projectLifecycle'],message:'Ciclo de execução é aplicável somente aos Projetos.'});
});
const instant=z.string().datetime({offset:true});
const historyFields={
  q:z.string().trim().max(200).default(''),actor:z.string().trim().min(1).max(160).optional(),
  type:z.string().trim().min(1).max(160).optional(),result:z.string().trim().min(1).max(160).optional(),
  phase:z.string().trim().min(1).max(80).optional(),decision:z.string().trim().min(1).max(80).optional(),
  initiator:z.string().trim().min(1).max(160).optional(),executor:z.string().trim().min(1).max(160).optional(),
  operation:z.string().trim().min(1).max(160).optional(),coverage:z.enum(['legacy','v2']).optional(),
  from:instant.optional(),to:instant.optional(),direction:directionQuery.default('desc'),page:pageQuery,
  includeArchived:booleanQuery,scope:z.enum(['self','descendants']).default('descendants'),asOf:instant.optional(),
};
const validHistoryPeriod=(value:{from?:string;to?:string},ctx:z.RefinementCtx)=>{
  if(value.from&&value.to&&new Date(value.from)>=new Date(value.to))ctx.addIssue({code:'custom',path:['to'],message:'O fim do período deve ser posterior ao início.'});
};
const historyQuery=z.object(historyFields).strict().superRefine(validHistoryPeriod);
const globalHistoryQuery=z.object({...historyFields,scope:z.literal('global').default('global')}).strict().superRefine(validHistoryPeriod);

const like=(value:string)=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
const and=(parts:Prisma.Sql[])=>Prisma.join(parts,' AND ');
const pagination=(requested:number,total:number)=>{
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  return {total,page:Math.min(requested,totalPages),pageSize,totalPages};
};

async function lineage(tx:Transaction,id:string,includeArchived:boolean){
  const chain:Item[]=[];let next:string|null=id;
  while(next){
    const item:Item|null=await tx.item.findUnique({where:{id:next}});
    if(!item||(!includeArchived&&item.archived))throw new DomainError('ITEM_NOT_FOUND','Item não encontrado ou arquivado.',404);
    chain.unshift(item);next=item.parentId;
  }
  return chain;
}

// The ordering belongs to the persisted domain, rather than its alphabetic labels.
function domainOrder(column:Prisma.Sql,values:readonly string[]){
  return Prisma.sql`CASE ${column} ${Prisma.join(values.map((value,index)=>Prisma.sql`WHEN ${value} THEN ${index}`),' ')} ELSE ${values.length} END`;
}

// Only fields explicitly recorded by the source are results. An action name or
// the current item state must never manufacture the outcome of an old event.
const eventResult=Prisma.sql`CASE
  WHEN h."schemaVersion" = 2 THEN h.outcome
  WHEN jsonb_typeof(h.payload->'result') = 'string' THEN NULLIF(h.payload->>'result','')
  WHEN jsonb_typeof(h.payload->'outcome') = 'string' THEN NULLIF(h.payload->>'outcome','')
  WHEN jsonb_typeof(h.payload->'state') = 'string' THEN NULLIF(h.payload->>'state','')
  ELSE NULL END`;
const correlationKeys=['correlationId','requestId','executionId','runId','activityId','attemptId','operationId','turnId','messageId','proposalId','checkId','releaseId','commitSha','sha','linkId','sourceId','planProposalId','sourceTurnId'] as const;
const detailKeys=[...correlationKeys,'sourceType','sourceVersion','planRevision','previousRunId','fromReleaseId','toReleaseId','releaseKey','gate','stage','kind','policyVersion','errorCode','revision','version','releaseVersion','plannedStoryVersion','expectedVersion','status','from','to','projectLifecycle','result','outcome','state','durationMs','key','repositoryId','gitlabProjectId','gitlabGroupId','gitlabGroupPath','gitlabPath','gitlabUrl'] as const;
function safeReleaseMembers(value:Prisma.JsonValue|undefined):Prisma.JsonValue[]|undefined{
  // Preserve the complete recorded membership, never a truncated/filtered list.
  // Only immutable story references and their planned revisions are public.
  if(!Array.isArray(value)||value.length>5000)return undefined;
  const members:Prisma.JsonValue[]=[];
  for(const entry of value){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return undefined;
    const {storyId,plannedStoryVersion}=entry;
    if(typeof storyId!=='string'||!/^[^\u0000-\u001f\u007f]{1,240}$/.test(storyId)||typeof plannedStoryVersion!=='number'||!Number.isSafeInteger(plannedStoryVersion)||plannedStoryVersion<1)return undefined;
    members.push({storyId,plannedStoryVersion});
  }
  return members;
}
export function safeHistoryEvent(value:HistoryEvent&{result?:string|null}){
  const payload:Record<string,Prisma.JsonValue>={};
  let result:string|null=value.schemaVersion===2?value.outcome:null;
  if(value.payload&&typeof value.payload==='object'&&!Array.isArray(value.payload)){
    const source=value.payload as Record<string,Prisma.JsonValue>;
    if(value.schemaVersion!==2){
      for(const key of ['result','outcome','state'])if(typeof source[key]==='string'){result=source[key]||null;break;}
    }
    for(const key of detailKeys){
      const field=source[key];
      if(key==='gitlabUrl'&&typeof field==='string'){
        try{const url=new URL(field);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)continue;}catch{continue;}
      }
      if((typeof field==='string'&&field.length<=240)||typeof field==='number'||typeof field==='boolean')payload[key]=field;
    }
    for(const key of ['before','after']){
      const members=safeReleaseMembers(source[key]);
      if(members!==undefined)payload[key]=members;
    }
  }
  // Do not spread database rows: a new persistence field must not silently become
  // public. Both versions expose selected metadata, never raw JSON or content.
  return {id:value.id,itemId:value.itemId,actorId:value.actorId,actorName:value.actorName,actorType:value.actorType,
    action:value.action,message:value.message,timestamp:value.timestamp,result,payload,
    schemaVersion:value.schemaVersion,auditEpochId:value.auditEpochId,phase:value.phase,decision:value.decision,
    operationId:value.operationId,requestId:value.requestId,attemptId:value.attemptId,causationEventId:value.causationEventId,
    subjectType:value.subjectType,subjectId:value.subjectId,occurredAt:value.occurredAt,
    audit:value.schemaVersion===2?safePublicAudit(value.audit):null};
}

export function registerCollections(app:FastifyInstance,db:Database,authorizeGlobal?:(request:FastifyRequest)=>unknown|Promise<unknown>){
  app.get('/api/collections/items',async request=>{
    const query=itemQuery.parse(request.query);
    return db.$transaction(async tx=>{
      const includeArchived=query.includeArchived==='true'||query.includeInactive==='true';
      const parentContext=query.parentId??query.projectId;
      const parents=parentContext?await lineage(tx,parentContext,includeArchived):[];
      if(query.parentId&&parents.at(-1)?.kind!==parentKinds[query.kind])throw new DomainError('INVALID_PARENT','O tipo do item pai não corresponde à coleção.');
      if(query.projectId&&parents.at(-1)?.kind!=='project')throw new DomainError('INVALID_PROJECT','Selecione um Projeto para consultar suas Histórias.');
      const archiveContext=parents.some(item=>item.archived);
      const scope=[Prisma.sql`i.kind = CAST(${query.kind} AS "ItemKind")`,...(query.parentId?[Prisma.sql`i."parentId" = ${query.parentId}`]:[])];
      if(query.projectId)scope.push(Prisma.sql`EXISTS (SELECT 1 FROM "Item" epic WHERE epic.id=i."parentId" AND epic.kind='epic' AND epic."parentId"=${query.projectId} ${includeArchived?Prisma.sql``:Prisma.sql`AND epic.archived=false`})`);
      const defaultVisibility=query.kind==='system'?Prisma.sql`i.archived = false AND i.status = 'active'`
        :query.kind==='project'?Prisma.sql`i.archived = false AND i."projectLifecycle" = 'active'`
        :query.kind==='epic'?Prisma.sql`i.archived = false AND i.status IN ('active','todo','doing','approved')`
        :Prisma.sql`i.archived = false`;
      const [{count:extraCount}]=await tx.$queryRaw<{count:number}[]>`SELECT COUNT(*)::integer AS count FROM "Item" i WHERE ${and(scope)} AND NOT (${defaultVisibility})`;
      const filters=[...scope];
      if(query.ids)filters.push(query.ids==='none'?Prisma.sql`false`:Prisma.sql`i.id IN (${Prisma.join(query.ids.split(','))})`);
      if(!includeArchived)filters.push(Prisma.sql`i.archived = false`);
      if(query.includeInactive!=='true'&&!archiveContext){
        if(query.kind==='system')filters.push(Prisma.sql`i.status = 'active'`);
        if(query.kind==='project')filters.push(Prisma.sql`i."projectLifecycle" = 'active'`);
        if(query.kind==='epic')filters.push(Prisma.sql`i.status IN ('active','todo','doing','approved')`);
      }
      if(query.q){const pattern=like(query.q);filters.push(Prisma.sql`(i.name ILIKE ${pattern} OR i.key ILIKE ${pattern})`);}
      if(query.status){
        if(query.kind==='epic'&&query.status==='active')filters.push(Prisma.sql`i.status IN ('active','todo','doing','approved')`);
        else if(query.kind==='epic'&&query.status==='completed')filters.push(Prisma.sql`i.status IN ('completed','done')`);
        else if(query.kind==='project')filters.push(Prisma.sql`i."projectLifecycle" = ${query.status}`);
        else filters.push(Prisma.sql`i.status = ${query.status}`);
      }
      if(query.projectLifecycle)filters.push(Prisma.sql`i."projectLifecycle" = ${query.projectLifecycle}`);
      const [{count:total}]=await tx.$queryRaw<{count:number}[]>`SELECT COUNT(*)::integer AS count FROM "Item" i WHERE ${and(filters)}`;
      const meta=pagination(query.page,total),sort=query.sort??(query.kind==='system'?'name':'createdAt');
      const direction=query.direction??(sort==='createdAt'||sort==='updatedAt'?'desc':'asc');
      const stateColumn=query.kind==='project'?Prisma.sql`i."projectLifecycle"`:query.kind==='epic'?Prisma.sql`CASE WHEN i.status IN ('todo','doing','approved') THEN 'active' WHEN i.status='done' THEN 'completed' ELSE i.status END`:Prisma.sql`i.status`;
      const columns={name:Prisma.sql`i.name`,createdAt:Prisma.sql`i."createdAt"`,updatedAt:Prisma.sql`i."updatedAt"`,status:domainOrder(stateColumn,statuses[query.kind]),projectLifecycle:domainOrder(Prisma.sql`i."projectLifecycle"`,lifecycle)};
      const order=direction==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
      const items=await tx.$queryRaw<Item[]>`SELECT i.* FROM "Item" i WHERE ${and(filters)} ORDER BY ${columns[sort]} ${order}, i.id ${order} LIMIT ${pageSize} OFFSET ${(meta.page-1)*pageSize}`;
      return {items,...meta,extraCount,query:{...query,sort,direction,page:meta.page,includeArchived,includeInactive:query.includeInactive==='true'||archiveContext}};
    },{isolationLevel:'RepeatableRead'});
  });

  for(const target of ['items','releases','audit'] as const)app.get<{Params:{id:string}}>(target==='audit'?'/api/audit/events':`/api/${target}/:id/history`,async request=>{
    const global=target==='audit';
    if(global){
      if(!authorizeGlobal)throw new DomainError('AUDIT_ACCESS_DENIED','A consulta global de auditoria exige persona Administrador ou Arquiteto declarada no modo demo.',403);
      await authorizeGlobal(request);
    }
    const query=global?globalHistoryQuery.parse(request.query):historyQuery.parse(request.query);
    return db.$transaction(async tx=>{
      const release=target==='releases'?await tx.release.findUnique({where:{id:request.params.id}}):null;
      if(target==='releases'&&!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
      const contextId=release?.systemId??request.params.id;
      if(!global)await lineage(tx,contextId,query.includeArchived==='true');
      // Share the ledger's clock and millisecond precision, so an application
      // clock offset cannot hide an already committed occurrence.
      const asOf=query.asOf??(await tx.$queryRaw<{asOf:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS "asOf"`)[0].asOf.toISOString();
      // Real descendants also cover old canonical events whose ancestorIds were
      // not recorded. The retained event lineage preserves their original scope.
      const descendants=global?Prisma.sql``:Prisma.sql`WITH RECURSIVE descendants AS (
        SELECT id FROM "Item" WHERE id = ${contextId}
        UNION ALL SELECT child.id FROM "Item" child JOIN descendants parent ON child."parentId" = parent.id
      )`;
      // A shared operation is stored once. Related targets extend its query
      // scope without cloning events or changing any legacy occurrence.
      const related=Prisma.sql`h."schemaVersion"=2 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(h.audit->'targets')='array' THEN h.audit->'targets' ELSE '[]'::jsonb END) target
        WHERE target->>'type' IN ('system','project','epic','story','task')
          AND ${query.scope==='self'?Prisma.sql`target->>'id'=${contextId}`:Prisma.sql`target->>'id' IN (SELECT id FROM descendants)`}
      )`;
      const scope=global?Prisma.sql`true`:release?Prisma.sql`h."itemId" = ${release.systemId} AND h.payload->>'releaseId' = ${release.id}`:query.scope==='self'?Prisma.sql`(h."itemId" = ${contextId} OR (${related}))`:Prisma.sql`(h."itemId" IN (SELECT id FROM descendants) OR ${contextId} = ANY(h."ancestorIds") OR (${related}))`;
      const base=[scope,Prisma.sql`h.timestamp <= ${new Date(asOf)}`],filters=[...base];
      if(query.q){
        const pattern=like(query.q);
        filters.push(Prisma.sql`(${Prisma.join([Prisma.sql`h.message ILIKE ${pattern}`,Prisma.sql`h.id ILIKE ${pattern}`,Prisma.sql`h."itemId" ILIKE ${pattern}`,Prisma.sql`h."subjectId" ILIKE ${pattern}`,Prisma.sql`h."operationId" ILIKE ${pattern}`,Prisma.sql`h."requestId" ILIKE ${pattern}`,Prisma.sql`h."attemptId" ILIKE ${pattern}`,...correlationKeys.map(key=>Prisma.sql`h.payload->>${key} ILIKE ${pattern}`)],' OR ')})`);
      }
      if(query.actor)filters.push(Prisma.sql`(h."actorId" = ${query.actor} OR h."actorType" = ${query.actor})`);
      if(query.type)filters.push(Prisma.sql`h.action = ${query.type}`);
      if(query.result)filters.push(query.result==='__missing__'?Prisma.sql`${eventResult} IS NULL`:Prisma.sql`${eventResult} = ${query.result}`);
      if(query.phase)filters.push(Prisma.sql`h.phase = ${query.phase}`);
      if(query.decision)filters.push(Prisma.sql`h.decision = ${query.decision}`);
      if(query.initiator)filters.push(Prisma.sql`h.audit->'initiator'->>'id' = ${query.initiator}`);
      if(query.executor)filters.push(Prisma.sql`h.audit->'executor'->>'id' = ${query.executor}`);
      if(query.operation)filters.push(Prisma.sql`h."operationId" = ${query.operation}`);
      if(query.coverage)filters.push(Prisma.sql`h."schemaVersion" = ${query.coverage==='v2'?2:1}`);
      if(query.from)filters.push(Prisma.sql`h.timestamp >= ${new Date(query.from)}`);
      if(query.to)filters.push(Prisma.sql`h.timestamp < ${new Date(query.to)}`);
      const [{count:total}]=await tx.$queryRaw<{count:number}[]>`${descendants} SELECT COUNT(*)::integer AS count FROM "HistoryEvent" h WHERE ${and(filters)}`;
      const meta=pagination(query.page,total),order=query.direction==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
      const events=await tx.$queryRaw<(HistoryEvent&{result:string|null})[]>`${descendants} SELECT h.*, ${eventResult} AS result FROM "HistoryEvent" h WHERE ${and(filters)} ORDER BY h.timestamp ${order}, h.id ${order} LIMIT ${pageSize} OFFSET ${(meta.page-1)*pageSize}`;
      const actors=await tx.$queryRaw<{id:string;name:string;type:string}[]>`${descendants} SELECT DISTINCT h."actorId" AS id,h."actorName" AS name,h."actorType" AS type FROM "HistoryEvent" h WHERE ${and(base)} ORDER BY name,id,type`;
      const types=await tx.$queryRaw<{value:string}[]>`${descendants} SELECT DISTINCT h.action AS value FROM "HistoryEvent" h WHERE ${and(base)} ORDER BY value`;
      const results=await tx.$queryRaw<{value:string}[]>`${descendants} SELECT DISTINCT ${eventResult} AS value FROM "HistoryEvent" h WHERE ${and(base)} AND ${eventResult} IS NOT NULL ORDER BY value`;
      const phases=await tx.$queryRaw<{value:string}[]>`${descendants} SELECT DISTINCT h.phase AS value FROM "HistoryEvent" h WHERE ${and(base)} AND h.phase IS NOT NULL ORDER BY value`;
      const decisions=await tx.$queryRaw<{value:string}[]>`${descendants} SELECT DISTINCT h.decision AS value FROM "HistoryEvent" h WHERE ${and(base)} AND h.decision IS NOT NULL ORDER BY value`;
      return {events:events.map(safeHistoryEvent),...meta,actors,types:types.map(row=>row.value),results:results.map(row=>row.value),phases:phases.map(row=>row.value),decisions:decisions.map(row=>row.value),asOf,query:{...query,page:meta.page,asOf},coverage:{source:'HistoryEvent',scope:global?'global':release?'release':query.scope,includesArchived:true,...(global?{access:'declared-demo-admin-or-architect'}:{}),description:global?'Auditoria global registrada em HistoryEvent, incluindo recusas sem Item, alvos administrativos e itens arquivados. Acesso por persona declarada no LAB; não comprova identidade pessoal autenticada. Eventos v2 e legados são identificados; conversas e fontes externas não observadas permanecem fora desta cobertura.':'Eventos de auditoria registrados do item e do escopo escolhido. Eventos v2 e legados são identificados; conversas e sinais operacionais mantêm suas fontes próprias.'}};
    },{isolationLevel:'RepeatableRead'});
  });
}
