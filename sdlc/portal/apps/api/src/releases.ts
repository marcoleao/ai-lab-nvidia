import {storyLifecycleViews} from './story-lifecycle-reading.ts';
import {planningReferences,requirePlanningReference} from './planning-references.ts';
import {planningReferenceReading,type PlanningReference} from '../../../packages/shared/src/planning-reference.ts';
import {registerReleaseCompositions,recordComposition,currentComposition,compositionMembers,compositionSummary,type CompositionStory} from './release-compositions.ts';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {AuditOptions} from './audit.ts';
import {safeHistoryEvent} from './collections.ts';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {statuses,type Persona} from '@sdlc/shared';
import {releaseReading,type ReleaseEnvironmentCounts} from '../../../packages/shared/src/release-reading.ts';
import {environmentCodes,type EnvironmentCode} from '../../../packages/shared/src/environments.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Item,type Release} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';

type Helpers=Pick<AssistantHelpers,'db'|'actor'|'live'|'ancestors'|'ensureNotArchived'|'event'>;
const stages=['OPEN','CLOSED','CANCELED'] as const;
const managers=new Set(['admin','release_manager']);
const planners=new Set(['admin','release_manager','product_owner','architect']);
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const expected=z.number().int().positive();
const selection=z.object({id:z.string().min(1),expectedVersion:expected,expectedReleaseId:z.string().min(1).nullable(),expectedReleaseVersion:expected.nullable(),expectedReferenceToken:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
const summaryInclude={compositionRevisions:{orderBy:{number:'desc'},take:1,select:{id:true,number:true,storyCount:true}},system:{select:{id:true,key:true,name:true}},_count:{select:{stories:true}}} as const;
const storyInclude={parent:{include:{parent:{include:{parent:true}}}},releasePlanning:{include:{release:{select:{id:true,key:true,name:true,version:true,compositionStatus:true,flowEnvironment:true}}}}} as const;
const direction=z.enum(['asc','desc']);
const pattern=(text:string)=>`%${text.replace(/[\\%_]/g,'\\$&')}%`;
type StoryRow=Prisma.ItemGetPayload<{include:typeof storyInclude}>;
type SummaryRow=Prisma.ReleaseGetPayload<{include:typeof summaryInclude}>;
const capabilities={canBuild:false,canPromote:false,qualityChecksAvailable:false,cancellationAvailable:true};

// All future gates/deployments must be backed by real executions and immutable
// manifests. Planning never supplies substitute evidence or advances a Story.
export function registerReleases(app:FastifyInstance,h:Helpers){
  registerReleaseCompositions(app,h);
  const reference=(row:{id:string;number:number;digest:string|null})=>({compositionRevisionId:row.id,compositionRevisionNumber:row.number,compositionDigest:row.digest});
  async function mutate(request:FastifyRequest,roles:Set<string>,fn:(tx:Transaction,person:Persona)=>Promise<unknown>){
    const person=h.actor(request);
    if(!roles.has(person.role))throw new DomainError('ROLE_DENIED','Esta persona pode consultar, mas não executar esta operação de Release.',403);
    const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']);
    const id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
    const hash=createHash('sha256').update(JSON.stringify([request.method,request.url,request.body])).digest('hex');
    return h.db.$transaction(async tx=>{
      // Shared with hierarchy mutations: a concurrent archive/edit cannot pass
      // the scope/version checks while a release association is being saved.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const cached=await tx.requestKey.findUnique({where:{id}});
      if(cached){if(cached.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT','Solicitação já utilizada para outro conteúdo.',409);return cached.result;}
      const result=await fn(tx,person);
      await tx.requestKey.create({data:{id,requestHash:hash,result:json(result)}});
      return result;
    },{timeout:15000});
  }
  async function system(tx:Transaction,id:string){
    const item=await h.live(tx,id);
    if(item.kind!=='system')throw new DomainError('INVALID_SYSTEM','Releases pertencem a um Sistema.');
    return item;
  }
  async function release(tx:Transaction,id:string){
    const result=await tx.release.findUnique({where:{id}});
    if(!result)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
    await system(tx,result.systemId);
    return result;
  }
  function editable(value:Release){
    if(value.compositionStatus!=='OPEN')throw new DomainError('RELEASE_IMMUTABLE','Somente releases OPEN permitem alterar a composição. Esta release está bloqueada para edição; fechamento e cópia terão suas próprias operações.',409);
  }
  function checkVersion(actual:number,wanted:number){
    if(actual!==wanted)throw new DomainError('VERSION_CONFLICT','Os dados foram alterados por outra operação. Atualize a página e revise a seleção antes de salvar.',409);
  }
  async function planningStory(tx:Transaction,id:string,systemId?:string){
    const item=await h.live(tx,id);
    if(item.kind!=='story')throw new DomainError('INVALID_STORY','Escolha uma História para planejar a Release.');
    const chain=await h.ancestors(tx,item);
    const owner=chain.find(parent=>parent.kind==='system');
    if(!owner||(systemId&&owner.id!==systemId))throw new DomainError('RELEASE_SYSTEM_MISMATCH','Escolha Histórias do mesmo Sistema da Release.',409);
    return {item,system:owner};
  }
  function summary(value:SummaryRow){
    const {_count,compositionRevisions,...result}=value;return {...result,currentComposition:compositionRevisions[0]?{id:compositionRevisions[0].id,number:compositionRevisions[0].number}:null,storyCount:compositionRevisions[0]?.storyCount??_count.stories,situation:releaseReading(value.compositionStatus,value.flowEnvironment)};
  }
  function storyView(value:StoryRow,currentReference:PlanningReference,activeReference:CompositionStory|null,compositionReference?:CompositionStory){
    const epic=value.parent,project=epic?.parent;
    const relation=value.releasePlanning;
    const activeReading=planningReferenceReading(currentReference,activeReference,!!relation),referenceReading=compositionReference?planningReferenceReading(currentReference,compositionReference,true):activeReading;
    const assignment=relation?{releaseId:relation.releaseId,releaseName:relation.release.name,releaseKey:relation.release.key,releaseVersion:relation.release.version,storyVersion:relation.plannedStoryVersion,referenceReading:activeReading,compositionStatus:relation.release.compositionStatus,flowEnvironment:relation.release.flowEnvironment,situation:releaseReading(relation.release.compositionStatus,relation.release.flowEnvironment)}:null;
    const review=!!relation&&referenceReading.state!=='current';
    const closed=['completed','cancelled'].includes(project?.projectLifecycle??'');
    const archived=value.archived||!!epic?.archived||!!project?.archived||!!project?.parent?.archived;
    const pendingReasons=[
      ...(archived?['História ou nível superior arquivado.']:[]),
      ...(closed?['Projeto encerrado. Reabra o Projeto para alterar o planejamento.']:[]),
      ...(review?[referenceReading.message]:[]),
      'A prontidão integral da composição e os controles da candidata QA continuam pendentes.'
    ];
    return {id:value.id,key:value.key,name:value.name,description:value.description,status:value.status,version:value.version,currentVersion:value.version,plannedVersion:compositionReference?.recordVersion??relation?.plannedStoryVersion??null,...(compositionReference?{compositionReference}:{}),
      projectId:project?.id??null,projectName:project?.name??'',epicId:epic?.id??null,epicName:epic?.name??'',assignment,
      referenceToken:currentReference.referenceToken,currentReference,planningReference:compositionReference??activeReference,referenceReading,planningReviewRequired:review,currentRevisionUnassigned:!relation,ready:false,canPlan:!closed&&!archived,pendingReasons};
  }
  async function storyViews(tx:Transaction,rows:StoryRow[],references?:ReadonlyMap<string,CompositionStory>){
    const facts=await planningReferences(tx,rows.map(row=>row.id)),releaseIds=[...new Set(rows.flatMap(row=>row.releasePlanning?[row.releasePlanning.releaseId]:[]))];
    const snapshots=releaseIds.length?await tx.$queryRaw<{releaseId:string;stories:unknown}[]>`SELECT DISTINCT ON ("releaseId") "releaseId",stories FROM "ReleaseCompositionRevision" WHERE "releaseId" IN (${Prisma.join(releaseIds)}) ORDER BY "releaseId",number DESC`:[];
    const lifecycle=await storyLifecycleViews(tx,rows);
    const active=new Map(snapshots.map(row=>[row.releaseId,new Map(compositionMembers({stories:row.stories}).map(member=>[member.storyId,member]))]));
    return rows.map(row=>({...storyView(row,facts.get(row.id)!,row.releasePlanning?active.get(row.releasePlanning.releaseId)?.get(row.id)??null:null,references?.get(row.id)),storyLifecycle:lifecycle.get(row.id)}));
  }
  async function record(tx:Transaction,value:Release,person:Persona,action:string,message:string,payload:Record<string,unknown>,options:AuditOptions={}){
    await h.event(tx,await system(tx,value.systemId),person,action,message,{releaseId:value.id,releaseKey:value.key,releaseVersion:value.version,...payload},'human',{operationId:value.id,subject:{type:'release',id:value.id,key:value.key,name:value.name,version:value.version},...options});
  }
  async function storyEvent(tx:Transaction,item:Item,person:Persona,payload:Record<string,unknown>){
    // Removing an already-archived Story from a draft is legitimate cleanup.
    // Read its retained lineage without treating that lineage as editable.
    await h.event(tx,item,person,'STORY_RELEASE_PLANNED','Associação de planejamento da Release atualizada; status e código da História preservados.',payload,'human',{...(Object.hasOwn(payload,'fromReleaseId')?{before:{releaseId:payload.fromReleaseId,...(Object.hasOwn(payload,'fromCompositionRevisionId')?{compositionRevisionId:payload.fromCompositionRevisionId}:{})}}:{}),after:{releaseId:payload.removed?null:payload.releaseId??payload.toReleaseId??null,...(Object.hasOwn(payload,'compositionRevisionId')?{compositionRevisionId:payload.compositionRevisionId}:{})},...(typeof payload.releaseId==='string'?{operationId:payload.releaseId}:{})});
  }
  async function detail(tx:Transaction,id:string){
    const value=await release(tx,id);
    const row=await tx.release.findUniqueOrThrow({where:{id},include:summaryInclude});
    const composition=await currentComposition(tx,id),references=composition?compositionMembers(composition):null;
    const members=await tx.item.findMany({where:references?{id:{in:references.map(row=>row.storyId)}}:{releasePlanning:{releaseId:id}},include:storyInclude,orderBy:[{createdAt:'asc'},{id:'asc'}]});
    const views=await storyViews(tx,members,references?new Map(references.map(ref=>[ref.storyId,ref])):undefined),byId=new Map(views.map(item=>[item.id,item]));
    const history=await tx.historyEvent.findMany({where:{itemId:value.systemId,payload:{path:['releaseId'],equals:id}},orderBy:[{timestamp:'desc'},{id:'desc'}],take:100});
    return {release:summary(row),composition:composition?compositionSummary(composition):null,stories:references?references.map(ref=>byId.get(ref.storyId)!):views,history:history.map(safeHistoryEvent),capabilities};
  }

  app.get('/api/releases',async request=>{
    const query=z.object({systemId:z.string().min(1).optional(),compositionStatus:z.enum([...stages,'ALL']).optional(),search:z.string().trim().max(200).default(''),page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),sort:z.enum(['createdAt','updatedAt','name','key','compositionStatus']).default('createdAt'),direction:direction.default('desc')}).strict().parse(request.query);
    return h.db.$transaction(async tx=>{
      if(query.systemId)await system(tx,query.systemId);
      const where:Prisma.ReleaseWhereInput={system:{archived:false},...(query.systemId?{systemId:query.systemId}:{}),...(query.search?{OR:[{name:{contains:query.search,mode:'insensitive'}},{key:{contains:query.search,mode:'insensitive'}},{system:{name:{contains:query.search,mode:'insensitive'}}}]}:{})};
      const groups=await tx.release.groupBy({by:['compositionStatus'],where,_count:true});
      const counts={OPEN:0,CLOSED:0,CANCELED:0,total:0};
      for(const group of groups){counts[group.compositionStatus]=group._count;counts.total+=group._count;}
      const filtered:Prisma.ReleaseWhereInput={...where,...(query.compositionStatus&&query.compositionStatus!=='ALL'?{compositionStatus:query.compositionStatus}:{})};
      const environmentGroups=await tx.release.groupBy({by:['flowEnvironment'],where:filtered,_count:true});
      const environmentCounts:ReleaseEnvironmentCounts={DEV:0,QA:0,HML:0,PRD:0,unconfirmed:0,total:0};
      for(const group of environmentGroups){
        if(environmentCodes.includes(group.flowEnvironment as EnvironmentCode))environmentCounts[group.flowEnvironment as EnvironmentCode]+=group._count;
        else environmentCounts.unconfirmed+=group._count;
        environmentCounts.total+=group._count;
      }
      const total=await tx.release.count({where:filtered});
      const totalPages=Math.max(1,Math.ceil(total/20));const page=Math.min(query.page,totalPages);
      const values=await tx.release.findMany({where:filtered,include:summaryInclude,orderBy:[{[query.sort]:query.direction},{id:query.direction}],skip:(page-1)*20,take:20});
      return {releases:values.map(summary),systems:await tx.item.findMany({where:{kind:'system',archived:false},select:{id:true,key:true,name:true},orderBy:[{name:'asc'},{id:'asc'}]}),counts,environmentCounts,pagination:{page,pageSize:20,total,totalPages},query:{...query,page},capabilities};
    },{isolationLevel:'RepeatableRead'});
  });
  app.post('/api/releases',async request=>{
    const body=z.object({systemId:z.string().min(1),name:z.string().trim().min(3).max(100)}).strict().parse(request.body);
    return mutate(request,managers,async(tx,person)=>{
      await h.ensureNotArchived(tx,await system(tx,body.systemId));
      const counter=await tx.counter.upsert({where:{scope:'release'},create:{scope:'release',value:1},update:{value:{increment:1}}});
      const created=await tx.release.create({data:{systemId:body.systemId,name:body.name,key:`REL-${counter.value}`,createdById:person.id,createdByName:person.name},include:summaryInclude});
      const composition=await recordComposition(tx,created,person);
      await record(tx,created,person,'RELEASE_CREATED','Release criada OPEN no fluxo DEV; sem pacote, aprovação ou implantação.',{...reference(composition),name:created.name,compositionStatus:'OPEN',flowEnvironment:created.flowEnvironment,storyCount:0},{before:null,after:{name:created.name,compositionStatus:created.compositionStatus,flowEnvironment:created.flowEnvironment,version:created.version}});
      return {release:{...summary(created),currentComposition:{id:composition.id,number:composition.number}}};
    });
  });
  app.post<{Params:{id:string}}>('/api/releases/:id/cancel',async request=>{
    const body=z.object({expectedVersion:expected,confirmed:z.literal(true),reason:z.string().trim().min(10).max(500).refine(value=>Array.from(value).length>=10,'Informe pelo menos 10 caracteres.')}).strict().parse(request.body);
    return mutate(request,managers,async(tx,person)=>{
      const value=await release(tx,request.params.id);checkVersion(value.version,body.expectedVersion);
      const before={compositionStatus:value.compositionStatus,flowEnvironment:value.flowEnvironment,version:value.version,canceledAt:value.canceledAt?.toISOString()??null,canceledById:value.canceledById,canceledByName:value.canceledByName,cancellationReasonDigest:value.cancellationReason?createHash('sha256').update(value.cancellationReason).digest('hex'):null};
      if(value.compositionStatus==='CANCELED'){
        await record(tx,value,person,'RELEASE_CANCELLED','Release já cancelada; decisão original preservada.',{compositionStatus:value.compositionStatus,flowEnvironment:value.flowEnvironment},{outcome:'NO_CHANGE',before,after:before,reasonCode:'ALREADY_CANCELED'});
        return {...await detail(tx,value.id),changed:false};
      }
      const changed=await tx.release.update({where:{id:value.id},data:{compositionStatus:'CANCELED',version:{increment:1},canceledAt:new Date(),canceledById:person.id,canceledByName:person.name,cancellationReason:body.reason}});
      const after={compositionStatus:changed.compositionStatus,flowEnvironment:changed.flowEnvironment,version:changed.version,canceledAt:changed.canceledAt!.toISOString(),canceledById:changed.canceledById,canceledByName:changed.canceledByName,cancellationReasonDigest:createHash('sha256').update(body.reason).digest('hex')};
      await record(tx,changed,person,'RELEASE_CANCELLED','Release cancelada; composição e Histórias preservadas, sem alteração de implantação.',{compositionStatus:changed.compositionStatus,flowEnvironment:changed.flowEnvironment,canceledAt:after.canceledAt,canceledById:person.id,canceledByName:person.name,cancellationReasonDigest:after.cancellationReasonDigest},{before,after,reasonCode:'MANAGER_CANCELLATION'});
      return {...await detail(tx,changed.id),changed:true};
    });
  });
  app.get<{Params:{id:string}}>('/api/releases/:id',async request=>h.db.$transaction(tx=>detail(tx,request.params.id),{isolationLevel:'RepeatableRead'}));
  app.get<{Params:{id:string}}>('/api/releases/:id/selection-context',async request=>{
    const query=z.object({ids:z.string().min(1).max(6000).transform(value=>value.split(',')).pipe(z.array(z.string().min(1).max(120)).min(1).max(50))}).strict().parse(request.query);
    return h.db.$transaction(async tx=>{
      const value=await release(tx,request.params.id),ids=[...new Set(query.ids)];
      const rows=await tx.item.findMany({where:{id:{in:ids},kind:'story',parent:{parent:{parentId:value.systemId}}},include:storyInclude});
      const found=new Set(rows.map(row=>row.id));
      return {items:await storyViews(tx,rows),missingIds:ids.filter(id=>!found.has(id)),release:summary(await tx.release.findUniqueOrThrow({where:{id:value.id},include:summaryInclude})),asOf:new Date().toISOString()};
    },{isolationLevel:'RepeatableRead'});
  });
  app.get<{Params:{id:string}}>('/api/releases/:id/stories',async request=>{
    const query=z.object({refine:z.literal('true').optional(),projectId:z.string().min(1).optional(),epicId:z.string().min(1).optional(),status:z.enum(statuses.story).optional(),association:z.enum(['all','unassigned','this','other']).default('all'),readiness:z.enum(['all','ready','pending']).default('all'),search:z.string().trim().max(200).default(''),q:z.string().trim().max(200).optional(),assignment:z.enum(['all','selected','unassigned','other']).optional(),ready:z.enum(['all','true','false']).optional(),reference:z.enum(['all','current','review']).default('all'),sort:z.enum(['createdAt','updatedAt','name','key','status']).default('createdAt'),direction:direction.default('desc'),page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1)}).strict().parse(request.query);
    return h.db.$transaction(async tx=>{
      const value=await release(tx,request.params.id);
      const projects=await tx.item.findMany({where:{kind:'project',parentId:value.systemId,archived:false},select:{id:true,name:true,key:true},orderBy:{name:'asc'}});
      const epics=await tx.item.findMany({where:{kind:'epic',parentId:{in:projects.map(p=>p.id)},archived:false},select:{id:true,name:true,key:true,parentId:true},orderBy:{name:'asc'}});
      if(query.projectId&&!projects.some(p=>p.id===query.projectId))throw new DomainError('INVALID_PROJECT','Escolha um Projeto deste Sistema.');
      if(query.epicId&&!epics.some(e=>e.id===query.epicId&&(!query.projectId||e.parentId===query.projectId)))throw new DomainError('INVALID_EPIC','Escolha um Épico do Projeto e Sistema selecionados.');
      const search=query.q??query.search,assignment=query.assignment??(query.association==='this'?'selected':query.association),ready=query.ready??(query.readiness==='ready'?'true':query.readiness==='pending'?'false':'all');
      const filters=[Prisma.sql`i.kind = 'story' AND i.archived = false AND e.archived = false AND p.archived = false AND p."parentId" = ${value.systemId}`];
      if(query.projectId)filters.push(Prisma.sql`p.id = ${query.projectId}`);
      if(query.epicId)filters.push(Prisma.sql`e.id = ${query.epicId}`);
      if(query.status)filters.push(Prisma.sql`i.status = ${query.status}`);
      if(search){const text=pattern(search);filters.push(Prisma.sql`(i.name ILIKE ${text} OR i.key ILIKE ${text} OR p.name ILIKE ${text} OR e.name ILIKE ${text})`);}
      if(assignment==='selected')filters.push(Prisma.sql`rs."releaseId" = ${value.id}`);
      if(assignment==='other')filters.push(Prisma.sql`rs."releaseId" <> ${value.id}`);
      if(assignment==='unassigned')filters.push(Prisma.sql`rs."storyId" IS NULL`);
      if(query.reference!=='all'){
        const matching=Prisma.sql`(cr.ref->>'contentPolicy'='story-planning-v2' AND cr.ref->>'referenceToken'=fresh.ref->>'referenceToken' AND (fresh.ref->'execution'='null'::jsonb OR fresh.ref->'execution'->>'sha' IS NOT NULL))`;
        filters.push(query.reference==='current'?Prisma.sql`rs."storyId" IS NOT NULL AND coalesce(${matching},false)`:Prisma.sql`rs."storyId" IS NOT NULL AND NOT coalesce(${matching},false)`);
      }
      // Readiness remains unavailable until the real package executors exist.
      if(ready==='true')filters.push(Prisma.sql`false`);
      const from=Prisma.sql`FROM "Item" i JOIN "Item" e ON e.id = i."parentId" JOIN "Item" p ON p.id = e."parentId" LEFT JOIN "ReleaseStory" rs ON rs."storyId" = i.id LEFT JOIN LATERAL(SELECT stories FROM "ReleaseCompositionRevision" WHERE "releaseId"=rs."releaseId" ORDER BY number DESC LIMIT 1) comp ON true LEFT JOIN LATERAL(SELECT v AS ref FROM jsonb_array_elements(comp.stories) v WHERE v->>'storyId'=i.id LIMIT 1) cr ON true LEFT JOIN LATERAL(SELECT sdlc_story_planning_reference(i.id) ref) fresh ON true WHERE ${Prisma.join(filters,' AND ')}`;
      const [{count:total}]=await tx.$queryRaw<{count:number}[]>`SELECT COUNT(*)::integer AS count ${from}`;
      const totalPages=Math.max(1,Math.ceil(total/20)),page=Math.min(query.page,totalPages),order=query.direction==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
      const statusOrder=Prisma.sql`CASE i.status ${Prisma.join(statuses.story.map((status,index)=>Prisma.sql`WHEN ${status} THEN ${index}`),' ')} ELSE ${statuses.story.length} END`;
      const columns={createdAt:Prisma.sql`i."createdAt"`,updatedAt:Prisma.sql`i."updatedAt"`,name:Prisma.sql`i.name`,key:Prisma.sql`i.key`,status:statusOrder};
      const ids=await tx.$queryRaw<{id:string}[]>`SELECT i.id ${from} ORDER BY ${columns[query.sort]} ${order},i.id ${order} LIMIT 20 OFFSET ${(page-1)*20}`;
      const rows=await tx.item.findMany({where:{id:{in:ids.map(row=>row.id)}},include:storyInclude});
      const byId=new Map(rows.map(row=>[row.id,row]));
      const stories=await storyViews(tx,ids.map(row=>byId.get(row.id)!));
      // The PUT replaces the whole composition. Members outside this result
      // page must retain their versions and explicit source association.
      const selectedItems=await storyViews(tx,await tx.item.findMany({where:{releasePlanning:{releaseId:value.id}},include:storyInclude,orderBy:[{name:'asc'},{id:'asc'}]}));
      const current=await tx.release.findUniqueOrThrow({where:{id:value.id},include:summaryInclude});
      return {stories,selectedItems,selectedIds:selectedItems.map(item=>item.id),release:summary(current),projects,epics:epics.map(epic=>({...epic,projectId:epic.parentId})),total,pagination:{page,pageSize:20,total,totalPages},truncated:false,query:{...query,q:search,assignment,ready,page},capabilities};
    },{isolationLevel:'RepeatableRead'});
  });

  // Replaces a complete draft composition. Source release versions are explicit
  // in every selected row: transfers cannot silently steal a concurrent choice.
  app.put<{Params:{id:string}}>('/api/releases/:id/stories',{bodyLimit:512*1024},async request=>{
    const body=z.object({expectedVersion:expected,stories:z.array(selection).max(500)}).strict().parse(request.body);
    return mutate(request,managers,async(tx,person)=>{
      const target=await release(tx,request.params.id);editable(target);await h.ensureNotArchived(tx,await system(tx,target.systemId));checkVersion(target.version,body.expectedVersion);
      if(new Set(body.stories.map(row=>row.id)).size!==body.stories.length)throw new DomainError('DUPLICATE_STORY','Cada História deve aparecer apenas uma vez.');
      const before=await tx.releaseStory.findMany({where:{releaseId:target.id},orderBy:{storyId:'asc'}});
      const sources=new Map<string,Release>();
      const facts=await planningReferences(tx,body.stories.map(row=>row.id)),priorComposition=await currentComposition(tx,target.id),priorReferences=new Map(priorComposition?compositionMembers(priorComposition).map(row=>[row.storyId,row]):[]);
      const expectedReferences=new Map(body.stories.map(row=>[row.id,{token:row.expectedReferenceToken,version:row.expectedVersion}]));
      for(const selected of body.stories){
        const {item}=await planningStory(tx,selected.id,target.systemId);await h.ensureNotArchived(tx,item);checkVersion(item.version,selected.expectedVersion);requirePlanningReference(facts.get(item.id)!,selected.expectedReferenceToken);
        const current=await tx.releaseStory.findUnique({where:{storyId:item.id}});
        if((current?.releaseId??null)!==selected.expectedReleaseId)throw new DomainError('RELEASE_ASSIGNMENT_CONFLICT','A associação desta História mudou. Atualize a lista e revise a seleção.',409);
        if(current){
          const source=sources.get(current.releaseId)??await release(tx,current.releaseId);editable(source);
          if(selected.expectedReleaseVersion===null)throw new DomainError('VERSION_CONFLICT','Atualize a versão da Release associada antes de salvar.',409);
          checkVersion(source.version,selected.expectedReleaseVersion);sources.set(source.id,source);
        }else if(selected.expectedReleaseVersion!==null)throw new DomainError('VERSION_CONFLICT','A associação desta História mudou. Atualize a lista.',409);
      }
      const selectedIds=body.stories.map(row=>row.id);
      const affectedSources=[...sources.values()].filter(source=>source.id!==target.id);
      const sourceMemberships=new Map<string,{storyId:string;plannedStoryVersion:number}[]>(),beforeCompositionIds=new Map<string,string|null>([[target.id,priorComposition?.id??null]]);
      for(const source of affectedSources){sourceMemberships.set(source.id,await tx.releaseStory.findMany({where:{releaseId:source.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}}));beforeCompositionIds.set(source.id,(await currentComposition(tx,source.id))?.id??null);}
      const referenceChanges=new Set(body.stories.filter(row=>row.expectedReleaseId!==target.id||priorReferences.get(row.id)?.referenceToken!==facts.get(row.id)!.referenceToken).map(row=>row.id));
      const after=body.stories.map(row=>({storyId:row.id,plannedStoryVersion:referenceChanges.has(row.id)?row.expectedVersion:priorReferences.get(row.id)!.recordVersion})).sort((a,b)=>a.storyId.localeCompare(b.storyId));
      const previous=before.map(row=>({storyId:row.storyId,plannedStoryVersion:row.plannedStoryVersion})).sort((a,b)=>a.storyId.localeCompare(b.storyId));
      if(JSON.stringify(previous)===JSON.stringify(after)&&!affectedSources.length&&!referenceChanges.size)return detail(tx,target.id);
      await tx.releaseStory.deleteMany({where:{releaseId:target.id,storyId:{notIn:selectedIds}}});
      for(const selected of after)await tx.releaseStory.upsert({where:{storyId:selected.storyId},create:{storyId:selected.storyId,releaseId:target.id,plannedStoryVersion:selected.plannedStoryVersion},update:{releaseId:target.id,plannedStoryVersion:selected.plannedStoryVersion}});
      for(const source of affectedSources){
        const transferred=body.stories.filter(row=>row.expectedReleaseId===source.id).map(row=>row.id);
        const updated=await tx.release.update({where:{id:source.id},data:{version:{increment:1}}});
        const priorMembers=sourceMemberships.get(source.id)!;
        const composition=await recordComposition(tx,updated,person);
        await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Histórias transferidas mediante seleção explícita para outra Release em OPEN.',{...reference(composition),transferredStoryIds:transferred,toReleaseId:target.id},{before:{version:source.version,stories:priorMembers},after:{version:updated.version,stories:priorMembers.filter(member=>!transferred.includes(member.storyId))}});
      }
      const updated=await tx.release.update({where:{id:target.id},data:{version:{increment:1}}});
      const composition=await recordComposition(tx,updated,person,selectedIds,expectedReferences);
      await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Composição planejada atualizada; sem aprovação de verificações ou implantação.',{...reference(composition),before:previous,after,fromReleaseIds:affectedSources.map(source=>source.id)},{before:{version:target.version,stories:previous},after:{version:updated.version,stories:after}});
      const changed=new Set([...previous,...after].filter(row=>previous.find(old=>old.storyId===row.storyId)?.plannedStoryVersion!==after.find(next=>next.storyId===row.storyId)?.plannedStoryVersion).map(row=>row.storyId));
      for(const id of referenceChanges)changed.add(id);
      for(const id of changed){
        const item=await tx.item.findUniqueOrThrow({where:{id}}),fromReleaseId=body.stories.find(row=>row.id===id)?.expectedReleaseId??(before.some(row=>row.storyId===id)?target.id:null);
        await storyEvent(tx,item,person,{releaseId:target.id,fromReleaseId,fromCompositionRevisionId:fromReleaseId?beforeCompositionIds.get(fromReleaseId)??null:null,compositionRevisionId:selectedIds.includes(id)?composition.id:null,releaseKey:target.key,releaseVersion:updated.version,plannedStoryVersion:after.find(row=>row.storyId===id)?.plannedStoryVersion??null,removed:!selectedIds.includes(id)});
      }
      return detail(tx,target.id);
    });
  });

  async function storyChoices(tx:Transaction,id:string){
    const scope=await planningStory(tx,id);
    const row=await tx.item.findUniqueOrThrow({where:{id},include:storyInclude});
    const [value]=await storyViews(tx,[row]);
    const choices=await tx.release.findMany({where:{systemId:scope.system.id,compositionStatus:'OPEN'},include:summaryInclude,orderBy:[{createdAt:'desc'},{id:'desc'}],take:1001});
    if(choices.length>1000)throw new DomainError('RELEASE_SCOPE_TOO_LARGE','Há mais de 1.000 rascunhos. Acesse Releases para refinar e administrar a composição.',422);
    return {story:value,assignment:value.assignment,releases:choices.map(summary),system:{id:scope.system.id,key:scope.system.key,name:scope.system.name},totalChoices:choices.length,truncated:false,capabilities};
  }
  app.get<{Params:{id:string}}>('/api/items/:id/release',async request=>h.db.$transaction(tx=>storyChoices(tx,request.params.id),{isolationLevel:'RepeatableRead'}));
  app.post<{Params:{id:string}}>('/api/items/:id/release',async request=>{
    const body=z.object({expectedVersion:expected,releaseId:z.string().min(1).nullable(),expectedCurrentReleaseId:z.string().min(1).nullable(),expectedCurrentReleaseVersion:expected.nullable(),expectedReleaseVersion:expected.optional(),expectedReferenceToken:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(request.body);
    return mutate(request,planners,async(tx,person)=>{
      const {item,system:owner}=await planningStory(tx,request.params.id);await h.ensureNotArchived(tx,item);checkVersion(item.version,body.expectedVersion);
      const current=await tx.releaseStory.findUnique({where:{storyId:item.id}});
      if((current?.releaseId??null)!==body.expectedCurrentReleaseId)throw new DomainError('RELEASE_ASSIGNMENT_CONFLICT','A associação mudou. Atualize a História e revise antes de salvar.',409);
      const source=current?await release(tx,current.releaseId):null;
      if(source){editable(source);if(body.expectedCurrentReleaseVersion===null)throw new DomainError('VERSION_CONFLICT','Atualize a Release associada.',409);checkVersion(source.version,body.expectedCurrentReleaseVersion);}
      else if(body.expectedCurrentReleaseVersion!==null)throw new DomainError('VERSION_CONFLICT','A associação mudou. Atualize a História.',409);
      const target=body.releaseId?await release(tx,body.releaseId):null;
      if(target){editable(target);if(target.systemId!==owner.id)throw new DomainError('RELEASE_SYSTEM_MISMATCH','Escolha uma Release do mesmo Sistema da História.',409);if(body.expectedReleaseVersion===undefined)throw new DomainError('VERSION_CONFLICT','Atualize a Release escolhida.',409);checkVersion(target.version,body.expectedReleaseVersion);}
      const facts=target?(await planningReferences(tx,[item.id])).get(item.id)!:null;
      if(facts)requirePlanningReference(facts,body.expectedReferenceToken);
      const oldComposition=source?await currentComposition(tx,source.id):null,oldReference=oldComposition?compositionMembers(oldComposition).find(row=>row.storyId===item.id):null;
      if((current?.releaseId??null)===body.releaseId&&(!current||oldReference?.referenceToken===facts?.referenceToken&&oldReference?.contentPolicy==='story-planning-v2'))return storyChoices(tx,item.id);
      let updatedCompositionId:string|null=null;
      const membershipBefore=new Map<string,{storyId:string;plannedStoryVersion:number}[]>();
      for(const value of [source,target].filter((entry):entry is Release=>!!entry))if(!membershipBefore.has(value.id))membershipBefore.set(value.id,await tx.releaseStory.findMany({where:{releaseId:value.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}}));
      if(target)await tx.releaseStory.upsert({where:{storyId:item.id},create:{storyId:item.id,releaseId:target.id,plannedStoryVersion:item.version},update:{releaseId:target.id,plannedStoryVersion:item.version}});
      else if(current)await tx.releaseStory.delete({where:{storyId:item.id}});
      for(const value of [source,...(target?.id!==source?.id?[target]:[])].filter((entry):entry is Release=>!!entry)){
        const updated=await tx.release.update({where:{id:value.id},data:{version:{increment:1}}});
        const members=await tx.releaseStory.findMany({where:{releaseId:value.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}});
        const composition=await recordComposition(tx,updated,person,target?.id===value.id?[item.id]:[],new Map([[item.id,{token:body.expectedReferenceToken,version:body.expectedVersion}]]));
        if(target?.id===value.id)updatedCompositionId=composition.id;
        await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Associação de História atualizada pelo seletor de Release existente.',{...reference(composition),storyId:item.id,storyVersion:item.version,fromReleaseId:source?.id??null,toReleaseId:target?.id??null},{before:{version:value.version,stories:membershipBefore.get(value.id)},after:{version:updated.version,stories:members}});
      }
      await h.event(tx,item,person,'STORY_RELEASE_PLANNED','Planejamento de Release atualizado sem alterar o status, aprovação ou código da História.',{releaseId:target?.id??null,fromReleaseId:source?.id??null,plannedStoryVersion:target?item.version:null,compositionRevisionId:updatedCompositionId},'human',{before:{releaseId:source?.id??null,compositionRevisionId:oldComposition?.id??null},after:{releaseId:target?.id??null,compositionRevisionId:updatedCompositionId}});
      return storyChoices(tx,item.id);
    });
  });
}
