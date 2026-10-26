import Fastify, { type FastifyRequest } from 'fastify';
import {createHash,randomUUID} from 'node:crypto';
import {z, ZodError} from 'zod';
import {createItemSchema,editItemSchema,versionSchema,statusSchema,kinds,parentKinds,statuses,statusLabels,personas,type Persona,type ItemKind,type IntegrationCheck} from '@sdlc/shared';
import type {Database,Transaction} from '../../../packages/db/client.ts';
import type {Prisma,Item} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import type {GitProvider} from './gitlab.ts';
import type {LLMProvider} from './llm.ts';
import {registerAssistant} from './assistant.ts';
import {registerConversations} from './conversations.ts';
import {registerExecution} from './execution.ts';
import {registerMetrics} from './metrics.ts';
import {registerReleases} from './releases.ts';
import {registerMerge} from './merge.ts';
import type {MergeProvider} from './merge-provider.ts';
import {registerQuality} from './quality.ts';
import {registerJourney} from './journey.ts';
import {registerCollections,safeHistoryEvent} from './collections.ts';
import {recordAudit,withAuditContext,type AuditOptions} from './audit.ts';
import {ensureHierarchyWritable,hierarchyState,itemLifecycle,isTerminalItem,descendantItems,assertNoRunningDescendants,pauseHierarchyWork,resumeHierarchyWork} from './lifecycle-policy.ts';
import {registerStoryLifecycle} from './story-lifecycle.ts';
import {registerStorySpecifications} from './story-specifications.ts';
import {ensurePipelineTasks,isPipelineTask} from './pipeline-tasks.ts';

type Options={db:Database;demoMode:boolean;git?:GitProvider;merge?:MergeProvider;llm?:LLMProvider;gitlabRoot?:string;origin?:string;logger?:boolean;registryUrl?:string;workerUrl?:string;scannerUrl?:string};
const labels:Record<ItemKind,string>={system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'};
const dataOf=(item:Item):Record<string,Prisma.JsonValue>=>item.data as Record<string,Prisma.JsonValue>;
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const archiveQuery=z.object({includeArchived:z.enum(['true','false']).optional()});

export function createApp(options:Options){
  if(!options.demoMode) throw new Error('This foundation requires explicit DEMO_MODE=true; legacy authentication is unchanged');
  const {db,git}=options;
  const app=Fastify({logger:options.logger??false,bodyLimit:64*1024,genReqId:()=>randomUUID()});
  registerMetrics(app,db);
  registerCollections(app,db,request=>{const person=actor(request);if(!['admin','architect'].includes(person.role))throw new DomainError('ROLE_DENIED','A consulta global de auditoria exige Admin ou Arquiteto.',403);});
  const origin=options.origin??'http://localhost:3310';
  app.addHook('onRequest',async request=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.origin){
      const allowed=new URL(origin);const incoming=new URL(request.headers.origin);
      if(incoming.origin!==allowed.origin&&!(incoming.port===allowed.port&&['localhost','127.0.0.1'].includes(incoming.hostname)&&['localhost','127.0.0.1'].includes(allowed.hostname))) throw new DomainError('ORIGIN_DENIED','Origem não autorizada.',403);
    }
  });
  app.setErrorHandler(async(error,request,reply)=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)||request.routeOptions.url?.includes('/revisions/')){
      const persona=personas.find(p=>p.id===request.headers['x-persona']);
      const reason=error instanceof DomainError?error.code:error instanceof ZodError?'VALIDATION_FAILED':(error as {code?:string}).code==='P2002'?'KEY_CONFLICT':'REQUEST_FAILED';
      const rejected=error instanceof ZodError||(error instanceof DomainError&&error.status<500)||reason==='KEY_CONFLICT';
      try{
        await db.$transaction(async tx=>{
          const itemId=(request.params as {id?:string}|undefined)?.id;
          const item=itemId&&request.routeOptions.url?.startsWith('/api/items/')?await tx.item.findUnique({where:{id:itemId}}):null;
          const subject=item??{id:request.id,kind:'request',name:request.routeOptions.url??'HTTP request',parentId:null};
          await recordAudit(tx,subject,persona??{id:'anonymous',name:'Identidade não autenticada'},rejected?'COMMAND_REJECTED':'COMMAND_FAILED',rejected?'Solicitação recusada; nenhuma alteração confirmada.':'Solicitação não concluída; consulte o resultado da operação antes de repetir.',{requestId:request.id},persona?'human':'anonymous',{outcome:rejected?'REJECTED':'FAILED',requestId:request.id,operationId:`request:${request.id}`,reasonCode:reason,initiator:{id:persona?.id??'anonymous',name:persona?.name??'Identidade não autenticada',type:persona?'human':'anonymous',authentication:persona?'declared_demo':'unauthenticated'}});
        });
      }catch(auditError){app.log.error({requestId:request.id,code:'AUDIT_WRITE_FAILED'},'Audit persistence unavailable; request was not confirmed');}
    }
    if(error instanceof DomainError) return reply.code(error.status).send({error:{code:error.code,message:error.message}});
    if(error instanceof ZodError) return reply.code(422).send({error:{code:'VALIDATION_FAILED',message:'Confira os campos informados.',details:error.issues.map(i=>({path:i.path,message:i.message}))}});
    const code=(error as {code?:string}).code;
    if(code==='P2002') return reply.code(409).send({error:{code:'KEY_CONFLICT',message:'Esta chave já está em uso. Escolha outra.'}});
    if(code==='FST_ERR_CTP_INVALID_JSON_BODY'||code==='FST_ERR_CTP_EMPTY_JSON_BODY') return reply.code(400).send({error:{code:'INVALID_JSON',message:'JSON inválido.'}});
    app.log.error({code:code??'UNKNOWN'},'Request failed');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',message:'Não foi possível concluir. Tente novamente com a mesma solicitação.'}});
  });
  function actor(request:FastifyRequest):Persona {
    const persona=personas.find(p=>p.id===request.headers['x-persona']);
    if(!persona) throw new DomainError('PERSONA_REQUIRED','Selecione uma persona válida.',403);
    return persona;
  }
  function canPlan(person:Persona){if(!['admin','product_owner','architect'].includes(person.role)) throw new DomainError('ROLE_DENIED','Esta persona pode consultar, mas não alterar o planejamento.',403);}
  async function live(tx:Transaction,id:string,includeArchived=false){const item=await tx.item.findUnique({where:{id}});if(!item||(!includeArchived&&item.archived))throw new DomainError('ITEM_NOT_FOUND','Item não encontrado ou arquivado.',404);return item;}
  async function ancestors(tx:Transaction,item:Item,includeArchived=false){const chain:Item[]=[];let id=item.parentId;while(id){const parent=await live(tx,id,includeArchived);chain.unshift(parent);id=parent.parentId;}return chain;}
  const event=recordAudit;
  async function mutate(request:FastifyRequest,fn:(tx:Transaction,person:Persona)=>Promise<unknown>){
    const person=actor(request);canPlan(person);
    const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']);
    const id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
    const hash=createHash('sha256').update(JSON.stringify([request.method,request.url,request.body])).digest('hex');
    return withAuditContext({operationId:`command:${id}`,requestId:request.id,initiator:{id:person.id,name:person.name,type:'human',authentication:'declared_demo'},source:'portal-api'},()=>db.$transaction(async tx=>{
      // Serializes the small planning workload and its counters/idempotency keys.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const cached=await tx.requestKey.findUnique({where:{id}});
      if(cached){if(cached.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT','Solicitação já utilizada para outro conteúdo.',409);return cached.result;}
      const result=await fn(tx,person);
      await tx.requestKey.create({data:{id,requestHash:hash,result:json(result)}});
      return result;
    },{timeout:15000}));
  }
  function checkVersion(item:Item,expected:number){if(item.version!==expected)throw new DomainError('VERSION_CONFLICT','Este item foi alterado. Atualize a página antes de tentar novamente.',409);}
  async function descriptionRevision(tx:Transaction,item:Item){
    const id=`${item.id}:${item.version}`,digest=createHash('sha256').update(item.description).digest('hex');
    await tx.$executeRaw`INSERT INTO "ItemAuditRevision" (id,"itemId",version,description,digest) VALUES (${id},${item.id},${item.version},${item.description},${digest}) ON CONFLICT ("itemId",version) DO NOTHING`;
    const [saved]=await tx.$queryRaw<{digest:string}[]>`SELECT digest FROM "ItemAuditRevision" WHERE id=${id}`;
    if(!saved||saved.digest!==digest)throw new DomainError('AUDIT_REVISION_CONFLICT','A revisão de auditoria diverge do conteúdo registrado.',409);
    return id;
  }
  function protectProcessTask(item:Item){if(item.kind==='task'&&(dataOf(item).workProcess||isPipelineTask(item)))throw new DomainError('PROCESS_TASK_CONTROLLED','Esta Tarefa é controlada pelo pipeline. Use a etapa correspondente; alteração manual não substitui suas evidências.',409);}
  async function ensureNotArchived(tx:Transaction,item:Item){await ensureHierarchyWritable(tx,item);}
  async function repositoryScope(tx:Transaction,item:Item,includeArchived=false){
    const chain=[...await ancestors(tx,item,includeArchived),item];const system=chain.find(i=>i.kind==='system')!;
    const project=chain.find(i=>i.kind==='project');const story=chain.find(i=>i.kind==='story');
    const source=item.kind==='task'?story:['story','epic'].includes(item.kind)?project:undefined;
    const available=await tx.repository.findMany({where:{systemId:system.id,...(source?{links:{some:{itemId:source.id}}}:{})},orderBy:{createdAt:'asc'}});
    const repositories=item.kind==='system'?available:await tx.repository.findMany({where:{links:{some:{itemId:item.id}}},orderBy:{createdAt:'asc'}});
    return {system,available,repositories};
  }
  async function setRepositories(tx:Transaction,item:Item,ids:string[]){
    if(!['project','story','task'].includes(item.kind))throw new DomainError('INVALID_ITEM','Selecione repositórios em Projetos, Histórias ou Tarefas.');
    const {available}=await repositoryScope(tx,item);const selected=[...new Set(ids)];
    if(selected.some(id=>!available.some(r=>r.id===id)))throw new DomainError('INVALID_REPOSITORY_SCOPE','Escolha repositórios do Sistema e do escopo de trabalho superior.',409);
    // Do not orphan explicit assignments already made in descendants.
    const descendants=await tx.historyEvent.findMany({where:{ancestorIds:{has:item.id}},select:{itemId:true},distinct:['itemId']});
    const children=await tx.itemRepository.findMany({where:{itemId:{in:descendants.map(d=>d.itemId)},item:{archived:false}}});
    if(children.some(link=>!selected.includes(link.repositoryId)))throw new DomainError('REPOSITORY_IN_USE','Revise os vínculos das Histórias e Tarefas antes de retirar um repositório do escopo.',409);
    await tx.itemRepository.deleteMany({where:{itemId:item.id}});
    if(selected.length)await tx.itemRepository.createMany({data:selected.map(repositoryId=>({itemId:item.id,repositoryId}))});
  }

  app.get('/api/health',async()=>{const rows=await db.$queryRaw<{name:string}[]>`SELECT current_database() AS name`;return {status:'ready',scope:'portal-foundation',demoMode:true,databaseMode:rows[0].name==='portal_test'?'test':'preview'};});
  app.get('/api/personas',async()=>({personas}));
  app.get('/api/statuses',async()=>statuses);
  app.get<{Params:{id:string;revisionId:string}}>('/api/items/:id/revisions/:revisionId',async request=>{
    canPlan(actor(request));
    const item=await live(db,request.params.id,true);
    const [revision]=await db.$queryRaw<{id:string;itemId:string;version:number;description:string;digest:string;recordedAt:Date}[]>`SELECT * FROM "ItemAuditRevision" WHERE id=${request.params.revisionId} AND "itemId"=${request.params.id}`;
    if(!revision)throw new DomainError('AUDIT_REVISION_NOT_FOUND','Revisão não encontrada.',404);
    const person=actor(request);
    await db.$transaction(tx=>recordAudit(tx,item,person,'AUDIT_REVISION_READ','Consulta autorizada a uma revisão restrita de descrição.',{revision:revision.id},'human',{requestId:request.id,operationId:`request:${request.id}`,reasonCode:'RESTRICTED_REVISION_ACCESS'}));
    return {revision,access:'declared-demo-persona'};
  });
  app.get<{Querystring:{kind?:string;parentId?:string;includeArchived?:string}}>('/api/items',async(request)=>{
    const {kind,parentId,includeArchived}=archiveQuery.extend({kind:z.enum(kinds).optional(),parentId:z.string().optional()}).parse(request.query);
    const items=await db.item.findMany({where:{...(includeArchived==='true'?{}:{archived:false}),...(kind?{kind}:{}),...(parentId?{parentId}:{})},orderBy:{createdAt:'asc'},take:500});
    return {items};
  });
  app.get<{Params:{id:string};Querystring:{includeArchived?:string}}>('/api/items/:id',async(request)=>db.$transaction(async tx=>{
    const includeArchived=archiveQuery.parse(request.query).includeArchived==='true';
    const item=await live(tx,request.params.id,includeArchived);const parents=await ancestors(tx,item,includeArchived);
    const scope=await repositoryScope(tx,item,includeArchived);
    const history=await tx.historyEvent.findMany({where:{OR:[{itemId:item.id},{ancestorIds:{has:item.id}}]},orderBy:{timestamp:'desc'},take:100});
    const hierarchy=await hierarchyState(tx,item),parentState=await hierarchyState(tx,item,false);
    return {item,ancestors:parents,hierarchy,readOnlyReason:hierarchy.reason??null,capabilities:{canMutate:!item.archived&&hierarchy.writable,canChangeLifecycle:!item.archived&&parentState.writable},children:await tx.item.findMany({where:{parentId:item.id,...(includeArchived?{}:{archived:false})},orderBy:{createdAt:'asc'}}),repositories:scope.repositories,availableRepositories:scope.available,environments:item.kind==='system'?(await tx.environment.findMany({where:{repository:{systemId:item.id}},include:{repository:{select:{name:true}}}})).map(e=>({...e,repositoryName:e.repository.name})):[],history:history.map(safeHistoryEvent)};
  }));
  app.get<{Params:{id:string};Querystring:{page?:string;asOf?:string}}>('/api/items/:id/results',async request=>{
    actor(request);
    const query=z.object({page:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),asOf:z.string().datetime({offset:true}).optional()}).strict().parse(request.query);
    return db.$transaction(async tx=>{
      const item=await live(tx,request.params.id,true);await ancestors(tx,item,true);
      if(item.kind!=='task')throw new DomainError('TASK_REQUIRED','Resultados individuais pertencem à Tarefa.',409);
      const asOf=query.asOf??(await tx.$queryRaw<{asOf:Date}[]>`SELECT CURRENT_TIMESTAMP(3) AS "asOf"`)[0].asOf.toISOString();
      const where={taskId:item.id,createdAt:{lte:new Date(asOf)}};
      const total=await tx.taskResultRevision.count({where}),totalPages=Math.max(1,Math.ceil(total/20)),page=Math.min(query.page,totalPages);
      return {results:await tx.taskResultRevision.findMany({where,orderBy:[{version:'desc'},{id:'desc'}],skip:(page-1)*20,take:20}),pagination:{page,pageSize:20,total,totalPages},asOf,query:{page,asOf},readOnly:!(await hierarchyState(tx,item)).writable,coverage:{source:'TaskResultRevision',legacyResultAvailable:!!dataOf(item).taskResult&&!(dataOf(item).taskResult as Record<string,unknown>).resultId}};
    },{isolationLevel:'RepeatableRead'});
  });
  async function createItem(tx:Transaction,person:Persona,body:z.infer<typeof createItemSchema>,provenance:Record<string,string|number>={},creationAudit:AuditOptions={}){
      const expectedParent=parentKinds[body.kind];
      if(Boolean(body.parentId)!==Boolean(expectedParent))throw new DomainError('INVALID_PARENT','Escolha o nível correto para criar este item.');
      const parent=body.parentId?await live(tx,body.parentId):null;
      if(parent&&parent.kind!==expectedParent)throw new DomainError('INVALID_PARENT','O tipo do item pai não corresponde à hierarquia.');
      if(parent)await ensureNotArchived(tx,parent);
      if(['system','project'].includes(body.kind)&&!body.key)throw new DomainError('KEY_REQUIRED','Informe a chave.');
      const chain=parent?[...(await ancestors(tx,parent)),parent]:[];
      const project=chain.find(p=>p.kind==='project');
      let key=body.key??'';
      if(body.kind==='project')key=`${parent!.key}-${body.key}`;
      if(!['system','project'].includes(body.kind)){
        const scope=body.kind==='story'?project!.id:parent!.id;
        const number=await tx.counter.upsert({where:{scope:`${body.kind}:${scope}`},create:{scope:`${body.kind}:${scope}`,value:1},update:{value:{increment:1}}});
        const prefix=body.kind==='story'?project!.key:parent!.key;
        key=`${prefix}-${body.kind==='epic'?'E':body.kind==='task'?'T':''}${number.value}`;
      }
      const item=await tx.item.create({data:{kind:body.kind,parentId:parent?.id,parentKind:parent?.kind,key,name:body.name,description:body.description,status:statuses[body.kind][0],projectLifecycle:body.kind==='project'?'active':null,data:{...(body.kind==='project'?{code:body.key!}:body.kind==='system'?{code:body.key!,gitlabState:'pending'}:{}),...provenance,...(body.kind==='story'?{creationOrigin:provenance.planProposalId?'assistant':'manual'}:{})}}});
      if(body.kind==='system')await tx.provisioningJob.create({data:{itemId:item.id}});
      if(body.repositoryIds)await setRepositories(tx,item,body.repositoryIds);
      const revision=await descriptionRevision(tx,item);
      const executor=creationAudit.executor??person;
      await event(tx,item,executor,'ITEM_CREATED',`${labels[item.kind]} criado por ${executor.name}.`,{key:item.key,status:item.status,...provenance},creationAudit.executor?.type??'human',{...creationAudit,before:null,after:{key:item.key,name:item.name,status:item.status,version:item.version,archived:item.archived,parentId:item.parentId,projectLifecycle:item.projectLifecycle,repositoryIds:body.repositoryIds??[],descriptionRevision:revision}});
      if(item.kind==='story')await ensurePipelineTasks(tx,item,person,createItem,creationAudit);
      return item;
  }
  app.post('/api/items',async request=>{
    const body=createItemSchema.parse(request.body);
    return mutate(request,async(tx,person)=>({item:await createItem(tx,person,body)}));
  });
  app.patch<{Params:{id:string}}>('/api/items/:id',async request=>{
    const body=editItemSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);
      if(dataOf(item).workProcess&&!isPipelineTask(item))protectProcessTask(item);
      await ensureNotArchived(tx,item);
      if(item.kind==='task'&&body.description!==item.description&&(dataOf(item).pipelineStage==='coding'||await tx.workTaskLink.count({where:{taskId:item.id}}))&&await tx.storyExecution.count({where:{storyId:item.parentId!,state:{in:['queued','running','paused','waiting_input','cancel_pending']}}}))throw new DomainError('TASK_SCOPE_BUSY','Encerre ou interrompa a tentativa antes de aplicar uma mudança no escopo da Tarefa. Um novo conteúdo exigirá novo G1.',409);
      const previousRevision=await descriptionRevision(tx,item),changed=await tx.item.update({where:{id:item.id},data:{name:body.name,description:body.description,version:{increment:1}}}),nextRevision=await descriptionRevision(tx,changed);
      await event(tx,changed,person,'ITEM_UPDATED',`${labels[item.kind]} atualizado.`,{version:changed.version},'human',{before:{name:item.name,descriptionRevision:previousRevision,version:item.version},after:{name:changed.name,descriptionRevision:nextRevision,version:changed.version}});return {item:changed};
    });
  });
  app.post<{Params:{id:string}}>('/api/items/:id/approve',async request=>{
    versionSchema.parse(request.body);
    return mutate(request,async()=>{throw new DomainError('PLANNING_APPROVAL_REMOVED','Projeto e Épico são agrupadores e não exigem aprovação própria. Use o G1 da História para autorizar a codificação.',409);});
  });
  app.patch<{Params:{id:string}}>('/api/items/:id/repositories',async request=>{
    const body=versionSchema.extend({repositoryIds:z.array(z.string().min(1)).max(100)}).strict().parse(request.body);
    return mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);if(!isPipelineTask(item))protectProcessTask(item);await ensureNotArchived(tx,item);if((item.kind==='story'||item.kind==='task')&&await tx.storyExecution.count({where:{storyId:item.kind==='story'?item.id:item.parentId!,state:{in:['queued','running','paused','waiting_input','cancel_pending']}}}))throw new DomainError('EXECUTION_SCOPE_BUSY','Encerre ou interrompa a tentativa antes de alterar o componente da codificação.',409);const previous=await tx.itemRepository.findMany({where:{itemId:item.id},select:{repositoryId:true}});await setRepositories(tx,item,body.repositoryIds);const changed=await tx.item.update({where:{id:item.id},data:{version:{increment:1}}});await event(tx,changed,person,'REPOSITORIES_SELECTED','Escopo de repositórios atualizado.',{repositoryIds:body.repositoryIds},'human',{before:{repositoryIds:previous.map(link=>link.repositoryId).sort(),version:item.version},after:{repositoryIds:[...new Set(body.repositoryIds)].sort(),version:changed.version}});return {item:changed};});
  });
  async function changeGroupLifecycle(tx:Transaction,person:Persona,item:Item,to:string,comment?:string){
    if(!['system','project','epic'].includes(item.kind))throw new DomainError('INVALID_ITEM','O ciclo de agrupador pertence ao Sistema, Projeto ou Épico.',409);
    await ensureHierarchyWritable(tx,item,{includeSelf:false});
    const from=itemLifecycle(item),transitions:Record<string,string[]>=item.kind==='system'?{active:['inactive'],inactive:['active']}:{active:['inactive','completed','cancelled'],inactive:['active'],completed:['active'],cancelled:['active']};
    if(!transitions[from]?.includes(to))throw new DomainError('INVALID_TRANSITION','Transição de ciclo de vida inválida. Reative o agrupador antes de encerrar.',409);
    if(['completed','cancelled'].includes(from)&&(!comment||comment.length<10))throw new DomainError('REOPEN_REASON_REQUIRED','Justifique a reabertura com pelo menos 10 caracteres.',422);
    if(to!=='active')await assertNoRunningDescendants(tx,item);
    if(['completed','cancelled'].includes(to)){
      const children=(await descendantItems(tx,item)).filter(child=>child.id!==item.id);
      if(children.some(child=>!isTerminalItem(child)))throw new DomainError('UNFINISHED_CHILDREN','Conclua ou cancele todos os descendentes antes de encerrar o agrupador. Arquivar não finaliza trabalho aberto.',409);
      const directChildren=children.filter(child=>child.parentId===item.id);
      if((to==='cancelled'||!directChildren.length||directChildren.every(child=>itemLifecycle(child)==='cancelled'))&&(!comment||comment.length<10))throw new DomainError('CLOSURE_REASON_REQUIRED','Justifique o encerramento com pelo menos 10 caracteres.',422);
    }
    if(to!=='active')await pauseHierarchyWork(tx,item,person);
    const changed=await tx.item.update({where:{id:item.id},data:{status:to,...(item.kind==='project'?{projectLifecycle:to}:{}),version:{increment:1}}});
    await event(tx,changed,person,item.kind==='project'?'PROJECT_LIFECYCLE_CHANGED':'STATUS_CHANGED','Ciclo do agrupador atualizado; estados dos descendentes e aprovações de conteúdo preservados.',{from,to},'human',{before:{status:item.status,projectLifecycle:item.projectLifecycle,version:item.version},after:{status:changed.status,projectLifecycle:changed.projectLifecycle,version:changed.version}});
    return {item:changed};
  }
  app.post<{Params:{id:string}}>('/api/items/:id/lifecycle',async request=>{
    const body=versionSchema.extend({lifecycle:z.enum(['active','inactive','completed','cancelled']),comment:z.string().trim().max(2000).optional()}).strict().parse(request.body);
    return mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);return changeGroupLifecycle(tx,person,item,body.lifecycle,body.comment);});
  });
  app.post<{Params:{id:string}}>('/api/items/:id/resume-work',async request=>{
    const body=versionSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);return {resumed:await resumeHierarchyWork(tx,item,person)};});
  });
  app.post<{Params:{id:string}}>('/api/items/:id/status',async request=>{
    const body=statusSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);
      if(['system','project','epic'].includes(item.kind))return changeGroupLifecycle(tx,person,item,body.status,body.comment);
      await ensureNotArchived(tx,item);
      protectProcessTask(item);
      if(item.kind==='task'&&await tx.workTaskLink.count({where:{taskId:item.id,completion:'publish_code'}}))throw new DomainError('PROCESS_TASK_CONTROLLED','Esta Tarefa está vinculada à publicação de código. Altere o vínculo da atividade para exigir evidência manual antes de mudar seu status.',409);
      if(item.kind!=='task')throw new DomainError('PIPELINE_STATUS_ONLY','O status da História é controlado pelas ações de execução, cancelamento e reabertura.',409);
      const transitions:Record<string,string[]>={todo:['doing','cancelled'],doing:['done','todo','cancelled'],done:['doing'],cancelled:['todo']};
      if(!transitions[item.status]?.includes(body.status))throw new DomainError('INVALID_TRANSITION','Transição de status não permitida.',409);
      if(['done','cancelled'].includes(item.status)&&(!body.comment||body.comment.length<10))throw new DomainError('REOPEN_REASON_REQUIRED','Justifique a reabertura com pelo menos 10 caracteres.');
      if(body.status==='done'&&!body.result?.trim())throw new DomainError('TASK_RESULT_REQUIRED','Registre o que foi feito e o resultado obtido para concluir a Tarefa.',422);
      const result=body.status==='done'?await tx.taskResultRevision.create({data:{taskId:item.id,version:item.version+1,summary:body.result!,evidence:body.evidence??[],actorId:person.id,actorName:person.name}}):null;
      const changed=await tx.item.update({where:{id:item.id},data:{status:body.status,version:{increment:1},...(result?{data:json({...dataOf(item),taskResult:{resultId:result.id,summary:result.summary,evidence:result.evidence,revision:result.version,actorId:person.id,actorName:person.name,recordedAt:result.createdAt.toISOString()}})}:{})}});
      if(result)await event(tx,changed,person,'TASK_RESULT_RECORDED','Resultado da Tarefa adicional registrado em sua fonte controlada.',{taskId:item.id,revision:changed.version},'human',{before:{revision:(dataOf(item).taskResult as Record<string,unknown>|undefined)?.revision??null},after:{revision:changed.version},evidence:[{type:'task_result_revision',id:result.id,revision:String(result.version),source:'TaskResultRevision'}]});
      await event(tx,changed,person,'STATUS_CHANGED',`Status alterado de ${statusLabels[item.status]} para ${statusLabels[body.status]}.`,{from:item.status,to:body.status,comment:body.comment??null},'human',{before:{status:item.status,version:item.version},after:{status:changed.status,version:changed.version}});return {item:changed};
    });
  });
  app.delete<{Params:{id:string}}>('/api/items/:id',async request=>{
    const body=versionSchema.extend({comment:z.string().trim().max(2000).optional()}).strict().parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);
      protectProcessTask(item);
      const tree=await descendantItems(tx,item);
      if(item.kind==='system'){
        if(item.status!=='inactive')throw new DomainError('SYSTEM_ARCHIVE_REQUIRES_INACTIVE','Inative o Sistema antes de arquivá-lo.',409);
        if(!body.comment||body.comment.length<10)throw new DomainError('ARCHIVE_REASON_REQUIRED','Justifique o arquivamento do Sistema com pelo menos 10 caracteres.',422);
      }else{
        await ensureHierarchyWritable(tx,item,{includeSelf:false});
        if(!isTerminalItem(item))throw new DomainError('ARCHIVE_REQUIRES_FINALIZED','Conclua ou cancele o item antes de arquivá-lo. Inatividade é uma pausa.',409);
      }
      if(tree.some(child=>child.id!==item.id&&!isTerminalItem(child)))throw new DomainError('UNFINISHED_CHILDREN','Há descendentes abertos. Finalize-os antes de arquivar.',409);
      await assertNoRunningDescendants(tx,item);
      const queue=tree.filter(child=>!child.archived);
      // Children first so ancestor lookups remain available for audit events.
      for(const child of queue.reverse()){
        const changed=await tx.item.update({where:{id:child.id},data:{archived:true,version:{increment:1}}});
        await event(tx,changed,person,'ITEM_ARCHIVED',`${labels[child.kind]} arquivado.`,{},'human',{before:{archived:child.archived,version:child.version},after:{archived:true,version:changed.version}});
        await tx.provisioningJob.updateMany({where:{itemId:child.id},data:{state:'cancelled'}});
      }
      return {archived:true,count:queue.length};
    });
  });

  async function provision(itemId:string,manual=false){
    // HTTP effects deliberately occur outside database transactions. Jobs survive
    // a restart; GitLab markers make retries safe after a lost response.
    const job=await db.provisioningJob.findUnique({where:{itemId},include:{item:{include:{parent:true}}}});
    if(!job||job.item.archived||job.state==='succeeded'||job.state==='cancelled')return;
    if(!manual&&job.attempts>=3)return;
    const audit=await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const current=await tx.item.findUniqueOrThrow({where:{id:itemId}});
      if(!(await hierarchyState(tx,current)).writable)return null;
      const claimed=await tx.provisioningJob.updateMany({where:{itemId,OR:[{state:{in:['pending','failed','not_configured']}},{state:'running',updatedAt:{lt:new Date(Date.now()-120000)}}]},data:{state:'running',attempts:{increment:1}}});
      if(!claimed.count)return null;
      const request=await tx.historyEvent.findFirst({where:{itemId,action:{in:['ITEM_CREATED','GITLAB_RETRY_REQUESTED']}},orderBy:[{timestamp:'desc'},{id:'desc'}]});
      const context:AuditOptions={operationId:`gitlab-group:${itemId}`,attemptId:randomUUID(),...(request?{causationEventId:request.id,initiator:{id:request.actorId,name:request.actorName,type:request.actorType,authentication:request.actorType==='human'?'declared_demo':'service'}}:{})};
      await event(tx,job.item,{id:'integration:gitlab',name:'Integração GitLab'},'GITLAB_PROVISIONING_STARTED','Tentativa de provisionamento iniciada; efeito remoto ainda não confirmado.',{},'system',{...context,before:{state:job.state},after:{state:'running'}});
      return context;
    });
    if(!audit)return;
    let remoteInvoked=false;
    try{
      if(!git)throw new DomainError('GITLAB_NOT_CONFIGURED','GitLab não configurado. O planejamento está salvo.',503);
      let result:Record<string,Prisma.JsonValue>;
      if(job.item.kind==='system'){
        remoteInvoked=true;
        const group=await git.ensureGroup(`${options.gitlabRoot??'sdlc'}/${String(dataOf(job.item).code).toLowerCase()}`);
        result={gitlabGroupId:group.id,gitlabGroupPath:group.full_path,...(group.web_url?{gitlabUrl:group.web_url}:{})};
      }else{await db.provisioningJob.update({where:{itemId},data:{state:'cancelled'}});return;}
      await db.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
        const current=await tx.item.findUniqueOrThrow({where:{id:itemId}});
        if(current.archived){await tx.provisioningJob.update({where:{itemId},data:{state:'cancelled'}});await event(tx,current,{id:'integration:gitlab',name:'Integração GitLab'},'GITLAB_EFFECT_OBSERVED','Recurso remoto observado após arquivamento; o Sistema permanece arquivado.',result,'system',{...audit,outcome:'SUCCEEDED',phase:'OBSERVED'});return;}
        const changed=await tx.item.update({where:{id:itemId},data:{data:{...dataOf(current),...result,gitlabState:'ready',gitlabMessage:''}}});
        await tx.provisioningJob.update({where:{itemId},data:{state:'succeeded',message:''}});
        await event(tx,changed,{id:'integration:gitlab',name:'Integração GitLab'},'GITLAB_PROVISIONED','Recurso GitLab confirmado sem iniciar build ou deploy.',result,'system',{...audit,before:{gitlabState:dataOf(current).gitlabState},after:{gitlabState:'ready',...result}});
      });
    }catch(error){
      const message=error instanceof DomainError?error.message:'Falha na integração. O planejamento está salvo; tente novamente.';
      await db.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
        const current=await tx.item.findUniqueOrThrow({where:{id:itemId}});
        if(current.archived){await tx.provisioningJob.update({where:{itemId},data:{state:'cancelled'}});return;}
        const state=git?'failed':'not_configured';
        await tx.item.update({where:{id:itemId},data:{data:{...dataOf(current),gitlabState:state,gitlabMessage:message}}});
        await tx.provisioningJob.update({where:{itemId},data:{state,message}});
        await event(tx,current,{id:'integration:gitlab',name:'Integração GitLab'},remoteInvoked?'GITLAB_PROVISIONING_UNCONFIRMED':'GITLAB_PROVISIONING_FAILED',message,{state},'system',{...audit,outcome:remoteInvoked?'UNKNOWN':'DEFERRED',phase:remoteInvoked?'OBSERVED':'WAITING',reasonCode:error instanceof DomainError?error.code:'PERSISTENCE_OR_PROVIDER_ERROR',before:{gitlabState:dataOf(current).gitlabState},after:{gitlabState:state}});
      });
    }
  }
  app.post<{Params:{id:string}}>('/api/items/:id/provision',async request=>{
    const body=versionSchema.parse(request.body);
    const result=await mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);await ensureNotArchived(tx,item);if(item.kind!=='system')throw new DomainError('INVALID_ITEM','Somente Sistemas provisionam grupos GitLab.');const job=await tx.provisioningJob.findUniqueOrThrow({where:{itemId:item.id}});if(job.state==='running'&&job.updatedAt>new Date(Date.now()-120000))throw new DomainError('PROVISIONING_RUNNING','O provisionamento já está em execução. Aguarde sua conclusão.',409);if(job.state==='succeeded')return {item};await tx.provisioningJob.update({where:{itemId:item.id},data:{state:'pending',attempts:0}});await event(tx,item,person,'GITLAB_RETRY_REQUESTED','Nova tentativa de provisionamento solicitada.',{});return {item};});
    await provision(request.params.id,true);return result;
  });
  const repositorySchema=z.object({name:z.string().trim().min(1).max(120),key:z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,39}$/),runtime:z.enum(['node','python']),mode:z.enum(['create','link']),gitlabProjectId:z.number().int().positive().optional()}).strict();
  app.post<{Params:{id:string}}>('/api/systems/:id/repositories',async request=>{
    const body=repositorySchema.parse(request.body);canPlan(actor(request));
    if(body.mode==='create'&&body.gitlabProjectId)throw new DomainError('INVALID_REPOSITORY','Novo repositório não recebe ID remoto.');
    if(body.mode==='link'&&!body.gitlabProjectId)throw new DomainError('INVALID_REPOSITORY','Informe o ID do projeto no GitLab.');
    if(body.mode==='link'&&!git)throw new DomainError('GITLAB_NOT_CONFIGURED','Configure GitLab antes de vincular repositórios existentes.',503);
    const remote=body.mode==='link'?await git!.inspectProject(body.gitlabProjectId!):undefined;
    return mutate(request,async(tx,person)=>{
      const system=await live(tx,request.params.id);if(system.kind!=='system')throw new DomainError('INVALID_ITEM','Repositórios pertencem ao Sistema.');
      await ensureNotArchived(tx,system);
      const repository=await tx.repository.create({data:{systemId:system.id,name:body.name,key:body.key,runtime:body.runtime,mode:body.mode,...(remote?{gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace,gitlabUrl:remote.web_url,state:'ready'}:{})}});
      await tx.environment.createMany({data:['QA','HML','PRD'].map(code=>({repositoryId:repository.id,code}))});
      await event(tx,system,person,remote?'REPOSITORY_LINKED':'REPOSITORY_REQUESTED',remote?'Repositório existente vinculado ao Sistema sem alterar seu conteúdo.':'Criação de repositório do Sistema solicitada.',{repositoryId:repository.id,gitlabProjectId:remote?.id??null},'human',{subject:{type:'repository',id:repository.id,key:repository.key,name:repository.name,version:repository.version},before:null,after:{key:repository.key,name:repository.name,state:repository.state,gitlabProjectId:repository.gitlabProjectId,gitlabPath:repository.gitlabPath,version:repository.version}});return {repository};
    });
  });
  app.post<{Params:{id:string}}>('/api/repositories/:id/provision',async request=>{
    const body=versionSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const repository=await tx.repository.findUnique({where:{id:request.params.id}});if(!repository)throw new DomainError('REPOSITORY_NOT_FOUND','Repositório não encontrado.',404);
      const system=await live(tx,repository.systemId);if(repository.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','Atualize os dados antes de tentar novamente.',409);
      await ensureNotArchived(tx,system);
      if(repository.state==='ready')return {repository};
      if(repository.state==='running'&&repository.updatedAt>new Date(Date.now()-120000))throw new DomainError('PROVISIONING_RUNNING','Provisionamento em execução.',409);
      const changed=await tx.repository.update({where:{id:repository.id},data:{state:'pending',attempts:0,version:{increment:1}}});await event(tx,system,person,'REPOSITORY_RETRY_REQUESTED','Nova tentativa de criação do repositório solicitada.',{repositoryId:repository.id});return {repository:changed};
    });
  });
  async function provisionRepository(id:string){
    const repository=await db.repository.findUnique({where:{id},include:{system:true}});if(!repository||repository.system.archived||repository.mode!=='create'||repository.state==='ready')return;
    const audit=await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const current=await tx.item.findUniqueOrThrow({where:{id:repository.systemId}});
      if(!(await hierarchyState(tx,current)).writable)return null;
      const claimed=await tx.repository.updateMany({where:{id,attempts:{lt:3},OR:[{state:{in:['pending','failed']}},{state:'running',updatedAt:{lt:new Date(Date.now()-120000)}}]},data:{state:'running',attempts:{increment:1}}});if(!claimed.count)return null;
      const requests=await tx.historyEvent.findMany({where:{itemId:repository.systemId,action:{in:['REPOSITORY_REQUESTED','REPOSITORY_RETRY_REQUESTED']}},orderBy:[{timestamp:'desc'},{id:'desc'}]});
      const request=requests.find(row=>(row.payload as Record<string,unknown>).repositoryId===id);
      const context:AuditOptions={operationId:`gitlab-repository:${id}`,attemptId:randomUUID(),subject:{type:'repository',id,key:repository.key,name:repository.name,version:repository.version},...(request?{causationEventId:request.id,initiator:{id:request.actorId,name:request.actorName,type:request.actorType,authentication:request.actorType==='human'?'declared_demo':'service'}}:{})};
      await event(tx,repository.system,{id:'integration:gitlab',name:'Integração GitLab'},'REPOSITORY_PROVISIONING_STARTED','Tentativa de provisionamento iniciada; recurso remoto ainda não confirmado.',{repositoryId:id},'system',{...context,before:{state:repository.state},after:{state:'running'}});
      return context;
    });if(!audit)return;
    let remoteInvoked=false;
    try{
      if(!git)throw new DomainError('GITLAB_NOT_CONFIGURED','GitLab não configurado; cadastro do repositório preservado.',503);
      remoteInvoked=true;
      const group=await git.ensureGroup(`${options.gitlabRoot??'sdlc'}/${String(dataOf(repository.system).code).toLowerCase()}`);
      const remote=await git.ensureProject(group,repository.key,repository.runtime as 'node'|'python',repository.name);
      await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;const system=await tx.item.findUniqueOrThrow({where:{id:repository.systemId}});if(system.archived){await event(tx,system,{id:'integration:gitlab',name:'Integração GitLab'},'REPOSITORY_EFFECT_OBSERVED','Recurso remoto confirmado após arquivamento; planejamento permanece arquivado.',{repositoryId:id,gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace},'system',{...audit,outcome:'SUCCEEDED',phase:'OBSERVED'});return;}await tx.repository.update({where:{id},data:{gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace,gitlabUrl:remote.web_url,state:'ready',message:''}});await event(tx,system,{id:'integration:gitlab',name:'Integração GitLab'},'REPOSITORY_PROVISIONED','Repositório do Sistema confirmado sem build ou deploy.',{repositoryId:id,gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace,gitlabUrl:remote.web_url},'system',{...audit,before:{state:repository.state,gitlabProjectId:repository.gitlabProjectId},after:{state:'ready',gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace}});});
    }catch(error){await db.$transaction(async tx=>{
      await tx.repository.update({where:{id},data:{state:git?'failed':'not_configured',message:error instanceof DomainError?error.message:'Falha na criação; tente novamente.'}});
      await event(tx,repository.system,{id:'integration:gitlab',name:'Integração GitLab'},remoteInvoked?'REPOSITORY_PROVISIONING_UNCONFIRMED':'REPOSITORY_PROVISIONING_FAILED','Tentativa de provisionamento não concluída; estado do provedor deve ser confirmado antes de repetir efeitos.',{metricsVersion:1,repositoryId:id,errorCode:error instanceof DomainError?error.code:'PROVISIONING_ERROR'},'system',{...audit,outcome:remoteInvoked?'UNKNOWN':'DEFERRED',phase:remoteInvoked?'OBSERVED':'WAITING',reasonCode:error instanceof DomainError?error.code:'PROVISIONING_ERROR',before:{state:repository.state},after:{state:git?'failed':'not_configured'}});
    });}
  }
  async function healthCheck(id:string,label:string,url:string|undefined,path:string):Promise<IntegrationCheck>{
    if(!url)return {id,label,status:'not_configured',message:'Conexão ainda não configurada.'};
    try{const response=await fetch(new URL(path,url),{redirect:'error',signal:AbortSignal.timeout(2500)});return {id,label,status:response.ok?'ready':'unavailable',message:response.ok?'Conexão disponível.':`Resposta HTTP ${response.status}.`};}
    catch{return {id,label,status:'unavailable',message:'Não foi possível conectar ao serviço.'};}
  }
  app.get('/api/integrations/health',async()=>{
    let gitCheck:IntegrationCheck={id:'gitlab',label:'GitLab',status:'not_configured',message:'Planejamento disponível; repositórios aguardam configuração.'};
    if(git){try{await git.health();gitCheck={id:'gitlab',label:'GitLab',status:'ready',message:'Conexão autenticada disponível.'};}catch{gitCheck={id:'gitlab',label:'GitLab',status:'unavailable',message:'Conexão GitLab indisponível.'};}}
    let llmCheck:IntegrationCheck={id:'llm',label:'Modelos locais',status:'not_configured',message:'Conexão ainda não configurada.'};
    if(options.llm){try{const models=await options.llm.models();const found=models.includes(options.llm.model);llmCheck={id:'llm',label:'Modelos locais',status:found?'ready':'unavailable',message:found?`Modelo local disponível: ${options.llm.model}. Catálogo validado; não executa inferência neste check.`:`Modelo configurado ausente: ${options.llm.model}.`};}catch{llmCheck={id:'llm',label:'Modelos locais',status:'unavailable',message:'Não foi possível validar o catálogo de modelos locais.'};}}
    const checks=[gitCheck,llmCheck,...await Promise.all([healthCheck('registry','Repositório de artefatos',options.registryUrl,'/v2/'),healthCheck('executor','Executor e roteamento',options.workerUrl,'/health'),healthCheck('security','Scanner de segurança',options.scannerUrl,'/health')])];
    return {checks,ready:checks.every(c=>c.status==='ready')};
  });
  app.get('/api/integrations/models',async()=>{
    if(!options.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
    return {models:await options.llm.models(),selectedModel:options.llm.model};
  });
  let inferenceRunning=false;
  app.post('/api/integrations/llm/probe',async(request,reply)=>{
    const person=actor(request);if(!['admin','architect'].includes(person.role))throw new DomainError('ROLE_DENIED','Validação de inferência exige Admin ou Arquiteto.',403);
    z.object({}).strict().parse(request.body);
    if(!options.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
    if(inferenceRunning)throw new DomainError('LLM_BUSY','Uma validação já está em execução.',409);
    if(await db.qualityCheck.count({where:{state:'running',leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma verificação está utilizando o modelo local.',409);
    if(await db.mergeDiscussionTurn.count({where:{state:'running',leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma conversa de merge está utilizando o modelo local.',409);
    if(await db.storyExecution.count({where:{state:{in:['running','cancelled']},leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma execução está utilizando o modelo local.',409);
    if(await db.chatTurn.count({where:{status:{in:['running','cancelled']},leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma conversa está utilizando o modelo local.',409);
    inferenceRunning=true;const controller=new AbortController();const cancel=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.on('close',cancel);
    const started=Date.now();
    const target={id:'integration:local-llm',kind:'integration',name:'Modelos locais'};
    const auditOptions:AuditOptions={operationId:`probe:${request.id}`,requestId:request.id,initiator:{id:person.id,name:person.name,type:'human',authentication:'declared_demo'}};
    try{
      await db.$transaction(tx=>event(tx,target,person,'INTEGRATION_PROBE_REQUESTED','Validação técnica de inferência solicitada; nenhum item de negócio criado.',{},'human',auditOptions));
      const result=await options.llm.complete([{role:'user',content:'Responda apenas com a palavra PRONTO. /no_think'}],{maxTokens:128,signal:controller.signal});
      await db.$transaction(tx=>event(tx,target,{id:'integration:local-llm',name:'Inferência local'},'INTEGRATION_PROBE_COMPLETED','Resposta técnica do modelo recebida; conteúdo não incluído na auditoria.',{model:result.model,durationMs:Date.now()-started},'system',auditOptions));
      return {...result,elapsedMs:Date.now()-started,scope:'technical-inference-only'};
    }catch(error){
      await db.$transaction(tx=>event(tx,target,{id:'integration:local-llm',name:'Inferência local'},'INTEGRATION_PROBE_FAILED','Validação técnica não concluída.',{durationMs:Date.now()-started},'system',{...auditOptions,reasonCode:controller.signal.aborted?'CANCELLED':'INFERENCE_ERROR'}));
      throw error;
    }
    finally{inferenceRunning=false;reply.raw.off('close',cancel);}
  });
  let processing=false;
  async function processJobs(){if(processing)return;processing=true;try{const jobs=await db.provisioningJob.findMany({where:{state:{in:['pending','failed','running']},attempts:{lt:3}},orderBy:{updatedAt:'asc'},take:10});for(const job of jobs)await provision(job.itemId);const repositories=await db.repository.findMany({where:{state:{in:['pending','failed','running']},attempts:{lt:3},system:{archived:false}},orderBy:{updatedAt:'asc'},take:10});for(const repository of repositories)await provisionRepository(repository.id);}finally{processing=false;}}
  const assistantHelpers={db,llm:options.llm,actor,canPlan,mutate,live,ancestors,ensureNotArchived,event,createItem,isProbeRunning:()=>inferenceRunning};
  registerStoryLifecycle(app,assistantHelpers);
  registerStorySpecifications(app,assistantHelpers);
  registerReleases(app,assistantHelpers);
  registerConversations(app,assistantHelpers);
  const {processChatJobs}=registerAssistant(app,assistantHelpers);
  const {processExecutionJobs}=registerExecution(app,assistantHelpers,git);
  const {processMergeJobs,processMergeDiscussionJobs}=registerMerge(app,assistantHelpers,options.merge);
  const {processQualityJobs}=registerQuality(app,assistantHelpers,git,options.scannerUrl);
  registerJourney(app,assistantHelpers,{git,merge:options.merge,scannerUrl:options.scannerUrl});
  return {app,processJobs,processChatJobs,processExecutionJobs,processMergeJobs,processMergeDiscussionJobs,processQualityJobs};
}
