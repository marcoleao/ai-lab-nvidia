import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {AuditOptions} from './audit.ts';
import {safeHistoryEvent} from './collections.ts';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {statuses,type Persona} from '@sdlc/shared';
import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Item,type Release} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';

type Helpers=Pick<AssistantHelpers,'db'|'actor'|'live'|'ancestors'|'ensureNotArchived'|'event'>;
const stages=['DRAFT','QA','HML','PRODUCTION','REJECTED'] as const;
const managers=new Set(['admin','release_manager']);
const planners=new Set(['admin','release_manager','product_owner','architect']);
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const expected=z.number().int().positive();
const selection=z.object({id:z.string().min(1),expectedVersion:expected,expectedReleaseId:z.string().min(1).nullable(),expectedReleaseVersion:expected.nullable()}).strict();
const summaryInclude={system:{select:{id:true,key:true,name:true}},_count:{select:{stories:true}}} as const;
const storyInclude={parent:{include:{parent:{include:{parent:true}}}},releasePlanning:{include:{release:{select:{id:true,key:true,name:true,version:true,stage:true}}}}} as const;
const direction=z.enum(['asc','desc']);
const pattern=(text:string)=>`%${text.replace(/[\\%_]/g,'\\$&')}%`;
type StoryRow=Prisma.ItemGetPayload<{include:typeof storyInclude}>;
type SummaryRow=Prisma.ReleaseGetPayload<{include:typeof summaryInclude}>;
const capabilities={canBuild:false,canPromote:false,qualityChecksAvailable:false};

// All future gates/deployments must be backed by real executions and immutable
// manifests. Planning never supplies substitute evidence or advances a Story.
export function registerReleases(app:FastifyInstance,h:Helpers){
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
    if(value.stage!=='DRAFT')throw new DomainError('RELEASE_IMMUTABLE','Esta composição está fechada e não pode ser alterada. Crie outra candidata pelo processo de Releases.',409);
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
    const {_count,...result}=value;return {...result,storyCount:_count.stories};
  }
  function storyView(value:StoryRow){
    const epic=value.parent,project=epic?.parent;
    const relation=value.releasePlanning;
    const assignment=relation?{releaseId:relation.releaseId,releaseName:relation.release.name,releaseKey:relation.release.key,releaseVersion:relation.release.version,storyVersion:relation.plannedStoryVersion}:null;
    const stale=!!relation&&relation.plannedStoryVersion!==value.version;
    const closed=['completed','cancelled'].includes(project?.projectLifecycle??'');
    const archived=value.archived||!!epic?.archived||!!project?.archived||!!project?.parent?.archived;
    const pendingReasons=[
      ...(archived?['História ou nível superior arquivado.']:[]),
      ...(closed?['Projeto encerrado. Reabra o Projeto para alterar o planejamento.']:[]),
      ...(stale?['A revisão planejada difere da revisão atual. Revise e salve a associação novamente.']:[]),
      'Revisão de código, segurança e testes do pacote ainda não são executados por esta versão do SDLC.'
    ];
    return {id:value.id,key:value.key,name:value.name,description:value.description,status:value.status,version:value.version,currentVersion:value.version,plannedVersion:relation?.plannedStoryVersion??null,
      projectId:project?.id??null,projectName:project?.name??'',epicId:epic?.id??null,epicName:epic?.name??'',assignment,
      currentRevisionUnassigned:!relation||stale,ready:false,canPlan:!closed&&!archived,pendingReasons};
  }
  async function record(tx:Transaction,value:Release,person:Persona,action:string,message:string,payload:Record<string,unknown>,options:AuditOptions={}){
    await h.event(tx,await system(tx,value.systemId),person,action,message,{releaseId:value.id,releaseKey:value.key,releaseVersion:value.version,...payload},'human',{operationId:value.id,subject:{type:'release',id:value.id,key:value.key,name:value.name,version:value.version},...options});
  }
  async function storyEvent(tx:Transaction,item:Item,person:Persona,payload:Record<string,unknown>){
    // Removing an already-archived Story from a draft is legitimate cleanup.
    // Read its retained lineage without treating that lineage as editable.
    await h.event(tx,item,person,'STORY_RELEASE_PLANNED','Associação de planejamento da Release atualizada; status e código da História preservados.',payload,'human',{...(Object.hasOwn(payload,'fromReleaseId')?{before:{releaseId:payload.fromReleaseId}}:{}),after:{releaseId:payload.removed?null:payload.releaseId??payload.toReleaseId??null},...(typeof payload.releaseId==='string'?{operationId:payload.releaseId}:{})});
  }
  async function detail(tx:Transaction,id:string){
    const value=await release(tx,id);
    const row=await tx.release.findUniqueOrThrow({where:{id},include:summaryInclude});
    const members=await tx.item.findMany({where:{releasePlanning:{releaseId:id}},include:storyInclude,orderBy:[{createdAt:'asc'},{id:'asc'}]});
    const history=await tx.historyEvent.findMany({where:{itemId:value.systemId,payload:{path:['releaseId'],equals:id}},orderBy:[{timestamp:'desc'},{id:'desc'}],take:100});
    return {release:summary(row),stories:members.map(storyView),history:history.map(safeHistoryEvent),capabilities};
  }

  app.get('/api/releases',async request=>{
    const query=z.object({systemId:z.string().min(1).optional(),stage:z.enum([...stages,'ALL']).optional(),search:z.string().trim().max(200).default(''),page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),sort:z.enum(['createdAt','updatedAt','name','key','stage']).default('createdAt'),direction:direction.default('desc')}).strict().parse(request.query);
    return h.db.$transaction(async tx=>{
      if(query.systemId)await system(tx,query.systemId);
      const where:Prisma.ReleaseWhereInput={system:{archived:false},...(query.systemId?{systemId:query.systemId}:{}),...(query.search?{OR:[{name:{contains:query.search,mode:'insensitive'}},{key:{contains:query.search,mode:'insensitive'}},{system:{name:{contains:query.search,mode:'insensitive'}}}]}:{})};
      const groups=await tx.release.groupBy({by:['stage'],where,_count:true});
      const counts={DRAFT:0,QA:0,HML:0,PRODUCTION:0,REJECTED:0,total:0};
      for(const group of groups){counts[group.stage]=group._count;counts.total+=group._count;}
      const filtered:Prisma.ReleaseWhereInput={...where,...(query.stage&&query.stage!=='ALL'?{stage:query.stage}:{})};
      const total=await tx.release.count({where:filtered});
      const totalPages=Math.max(1,Math.ceil(total/20));const page=Math.min(query.page,totalPages);
      const values=await tx.release.findMany({where:filtered,include:summaryInclude,orderBy:[{[query.sort]:query.direction},{id:query.direction}],skip:(page-1)*20,take:20});
      return {releases:values.map(summary),systems:await tx.item.findMany({where:{kind:'system',archived:false},select:{id:true,key:true,name:true},orderBy:[{name:'asc'},{id:'asc'}]}),counts,pagination:{page,pageSize:20,total,totalPages},query:{...query,page},capabilities};
    },{isolationLevel:'RepeatableRead'});
  });
  app.post('/api/releases',async request=>{
    const body=z.object({systemId:z.string().min(1),name:z.string().trim().min(3).max(100)}).strict().parse(request.body);
    return mutate(request,managers,async(tx,person)=>{
      await h.ensureNotArchived(tx,await system(tx,body.systemId));
      const counter=await tx.counter.upsert({where:{scope:'release'},create:{scope:'release',value:1},update:{value:{increment:1}}});
      const created=await tx.release.create({data:{systemId:body.systemId,name:body.name,key:`REL-${counter.value}`,createdById:person.id,createdByName:person.name},include:summaryInclude});
      await record(tx,created,person,'RELEASE_CREATED','Release criada em DRAFT; composição vazia, sem pacote, aprovação ou implantação.',{name:created.name,stage:'DRAFT',storyCount:0},{before:null,after:{name:created.name,stage:created.stage,version:created.version}});
      return {release:summary(created)};
    });
  });
  app.get<{Params:{id:string}}>('/api/releases/:id',async request=>h.db.$transaction(tx=>detail(tx,request.params.id),{isolationLevel:'RepeatableRead'}));
  app.get<{Params:{id:string}}>('/api/releases/:id/stories',async request=>{
    const query=z.object({refine:z.literal('true').optional(),projectId:z.string().min(1).optional(),epicId:z.string().min(1).optional(),status:z.enum(statuses.story).optional(),association:z.enum(['all','unassigned','this','other']).default('all'),readiness:z.enum(['all','ready','pending']).default('all'),search:z.string().trim().max(200).default(''),q:z.string().trim().max(200).optional(),assignment:z.enum(['all','selected','unassigned','other']).optional(),ready:z.enum(['all','true','false']).optional(),sort:z.enum(['createdAt','updatedAt','name','key','status']).default('createdAt'),direction:direction.default('desc'),page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1)}).strict().parse(request.query);
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
      if(assignment==='unassigned')filters.push(Prisma.sql`(rs."storyId" IS NULL OR rs."plannedStoryVersion" <> i.version)`);
      // Readiness remains unavailable until the real package executors exist.
      if(ready==='true')filters.push(Prisma.sql`false`);
      const from=Prisma.sql`FROM "Item" i JOIN "Item" e ON e.id = i."parentId" JOIN "Item" p ON p.id = e."parentId" LEFT JOIN "ReleaseStory" rs ON rs."storyId" = i.id WHERE ${Prisma.join(filters,' AND ')}`;
      const [{count:total}]=await tx.$queryRaw<{count:number}[]>`SELECT COUNT(*)::integer AS count ${from}`;
      const totalPages=Math.max(1,Math.ceil(total/20)),page=Math.min(query.page,totalPages),order=query.direction==='asc'?Prisma.sql`ASC`:Prisma.sql`DESC`;
      const statusOrder=Prisma.sql`CASE i.status ${Prisma.join(statuses.story.map((status,index)=>Prisma.sql`WHEN ${status} THEN ${index}`),' ')} ELSE ${statuses.story.length} END`;
      const columns={createdAt:Prisma.sql`i."createdAt"`,updatedAt:Prisma.sql`i."updatedAt"`,name:Prisma.sql`i.name`,key:Prisma.sql`i.key`,status:statusOrder};
      const ids=await tx.$queryRaw<{id:string}[]>`SELECT i.id ${from} ORDER BY ${columns[query.sort]} ${order},i.id ${order} LIMIT 20 OFFSET ${(page-1)*20}`;
      const rows=await tx.item.findMany({where:{id:{in:ids.map(row=>row.id)}},include:storyInclude});
      const byId=new Map(rows.map(row=>[row.id,row]));
      const stories=ids.map(row=>storyView(byId.get(row.id)!));
      // The PUT replaces the whole composition. Members outside this result
      // page must retain their versions and explicit source association.
      const selectedItems=(await tx.item.findMany({where:{releasePlanning:{releaseId:value.id}},include:storyInclude,orderBy:[{name:'asc'},{id:'asc'}]})).map(storyView);
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
      for(const selected of body.stories){
        const {item}=await planningStory(tx,selected.id,target.systemId);await h.ensureNotArchived(tx,item);checkVersion(item.version,selected.expectedVersion);
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
      const sourceMemberships=new Map<string,{storyId:string;plannedStoryVersion:number}[]>();
      for(const source of affectedSources)sourceMemberships.set(source.id,await tx.releaseStory.findMany({where:{releaseId:source.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}}));
      const after=body.stories.map(row=>({storyId:row.id,plannedStoryVersion:row.expectedVersion})).sort((a,b)=>a.storyId.localeCompare(b.storyId));
      const previous=before.map(row=>({storyId:row.storyId,plannedStoryVersion:row.plannedStoryVersion}));
      if(JSON.stringify(previous)===JSON.stringify(after)&&!affectedSources.length)return detail(tx,target.id);
      await tx.releaseStory.deleteMany({where:{releaseId:target.id,storyId:{notIn:selectedIds}}});
      for(const selected of body.stories)await tx.releaseStory.upsert({where:{storyId:selected.id},create:{storyId:selected.id,releaseId:target.id,plannedStoryVersion:selected.expectedVersion},update:{releaseId:target.id,plannedStoryVersion:selected.expectedVersion}});
      for(const source of affectedSources){
        const transferred=body.stories.filter(row=>row.expectedReleaseId===source.id).map(row=>row.id);
        const updated=await tx.release.update({where:{id:source.id},data:{version:{increment:1}}});
        const priorMembers=sourceMemberships.get(source.id)!;
        await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Histórias transferidas mediante seleção explícita para outra Release em DRAFT.',{transferredStoryIds:transferred,toReleaseId:target.id},{before:{version:source.version,stories:priorMembers},after:{version:updated.version,stories:priorMembers.filter(member=>!transferred.includes(member.storyId))}});
      }
      const updated=await tx.release.update({where:{id:target.id},data:{version:{increment:1}}});
      await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Composição planejada atualizada; sem aprovação de verificações ou implantação.',{before:previous,after,fromReleaseIds:affectedSources.map(source=>source.id)},{before:{version:target.version,stories:previous},after:{version:updated.version,stories:after}});
      const changed=new Set([...previous,...after].filter(row=>previous.find(old=>old.storyId===row.storyId)?.plannedStoryVersion!==after.find(next=>next.storyId===row.storyId)?.plannedStoryVersion).map(row=>row.storyId));
      for(const selected of body.stories)if(selected.expectedReleaseId!==target.id)changed.add(selected.id);
      for(const id of changed){
        const item=await tx.item.findUniqueOrThrow({where:{id}});
        await storyEvent(tx,item,person,{releaseId:target.id,fromReleaseId:body.stories.find(row=>row.id===id)?.expectedReleaseId??(before.some(row=>row.storyId===id)?target.id:null),releaseKey:target.key,releaseVersion:updated.version,plannedStoryVersion:after.find(row=>row.storyId===id)?.plannedStoryVersion??null,removed:!selectedIds.includes(id)});
      }
      return detail(tx,target.id);
    });
  });

  async function storyChoices(tx:Transaction,id:string){
    const scope=await planningStory(tx,id);
    const row=await tx.item.findUniqueOrThrow({where:{id},include:storyInclude});
    const value=storyView(row);
    const choices=await tx.release.findMany({where:{systemId:scope.system.id,stage:'DRAFT'},include:summaryInclude,orderBy:[{createdAt:'desc'},{id:'desc'}],take:1001});
    if(choices.length>1000)throw new DomainError('RELEASE_SCOPE_TOO_LARGE','Há mais de 1.000 rascunhos. Acesse Releases para refinar e administrar a composição.',422);
    return {story:value,assignment:value.assignment,releases:choices.map(summary),system:{id:scope.system.id,key:scope.system.key,name:scope.system.name},totalChoices:choices.length,truncated:false,capabilities};
  }
  app.get<{Params:{id:string}}>('/api/items/:id/release',async request=>h.db.$transaction(tx=>storyChoices(tx,request.params.id),{isolationLevel:'RepeatableRead'}));
  app.post<{Params:{id:string}}>('/api/items/:id/release',async request=>{
    const body=z.object({expectedVersion:expected,releaseId:z.string().min(1).nullable(),expectedCurrentReleaseId:z.string().min(1).nullable(),expectedCurrentReleaseVersion:expected.nullable(),expectedReleaseVersion:expected.optional()}).strict().parse(request.body);
    return mutate(request,planners,async(tx,person)=>{
      const {item,system:owner}=await planningStory(tx,request.params.id);await h.ensureNotArchived(tx,item);checkVersion(item.version,body.expectedVersion);
      const current=await tx.releaseStory.findUnique({where:{storyId:item.id}});
      if((current?.releaseId??null)!==body.expectedCurrentReleaseId)throw new DomainError('RELEASE_ASSIGNMENT_CONFLICT','A associação mudou. Atualize a História e revise antes de salvar.',409);
      const source=current?await release(tx,current.releaseId):null;
      if(source){editable(source);if(body.expectedCurrentReleaseVersion===null)throw new DomainError('VERSION_CONFLICT','Atualize a Release associada.',409);checkVersion(source.version,body.expectedCurrentReleaseVersion);}
      else if(body.expectedCurrentReleaseVersion!==null)throw new DomainError('VERSION_CONFLICT','A associação mudou. Atualize a História.',409);
      const target=body.releaseId?await release(tx,body.releaseId):null;
      if(target){editable(target);if(target.systemId!==owner.id)throw new DomainError('RELEASE_SYSTEM_MISMATCH','Escolha uma Release do mesmo Sistema da História.',409);if(body.expectedReleaseVersion===undefined)throw new DomainError('VERSION_CONFLICT','Atualize a Release escolhida.',409);checkVersion(target.version,body.expectedReleaseVersion);}
      if((current?.releaseId??null)===body.releaseId&&(!current||current.plannedStoryVersion===item.version))return storyChoices(tx,item.id);
      const membershipBefore=new Map<string,{storyId:string;plannedStoryVersion:number}[]>();
      for(const value of [source,target].filter((entry):entry is Release=>!!entry))if(!membershipBefore.has(value.id))membershipBefore.set(value.id,await tx.releaseStory.findMany({where:{releaseId:value.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}}));
      if(target)await tx.releaseStory.upsert({where:{storyId:item.id},create:{storyId:item.id,releaseId:target.id,plannedStoryVersion:item.version},update:{releaseId:target.id,plannedStoryVersion:item.version}});
      else if(current)await tx.releaseStory.delete({where:{storyId:item.id}});
      for(const value of [source,...(target?.id!==source?.id?[target]:[])].filter((entry):entry is Release=>!!entry)){
        const updated=await tx.release.update({where:{id:value.id},data:{version:{increment:1}}});
        const members=await tx.releaseStory.findMany({where:{releaseId:value.id},orderBy:{storyId:'asc'},select:{storyId:true,plannedStoryVersion:true}});
        await record(tx,updated,person,'RELEASE_COMPOSITION_CHANGED','Associação de História atualizada pelo seletor de Release existente.',{storyId:item.id,storyVersion:item.version,fromReleaseId:source?.id??null,toReleaseId:target?.id??null},{before:{version:value.version,stories:membershipBefore.get(value.id)},after:{version:updated.version,stories:members}});
      }
      await h.event(tx,item,person,'STORY_RELEASE_PLANNED','Planejamento de Release atualizado sem alterar o status, aprovação ou código da História.',{releaseId:target?.id??null,fromReleaseId:source?.id??null,plannedStoryVersion:target?item.version:null},'human',{before:{releaseId:source?.id??null},after:{releaseId:target?.id??null}});
      return storyChoices(tx,item.id);
    });
  });
}
