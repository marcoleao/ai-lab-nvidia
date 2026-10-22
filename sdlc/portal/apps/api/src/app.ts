import Fastify, { type FastifyRequest } from 'fastify';
import {createHash} from 'node:crypto';
import {z, ZodError} from 'zod';
import {createItemSchema,editItemSchema,versionSchema,statusSchema,kinds,parentKinds,statuses,statusLabels,personas,type Persona,type ItemKind,type IntegrationCheck} from '@sdlc/shared';
import type {Database,Transaction} from '../../../packages/db/client.ts';
import type {Prisma,Item} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import type {GitProvider} from './gitlab.ts';
import type {LLMProvider} from './llm.ts';
import {registerAssistant} from './assistant.ts';
import {registerExecution} from './execution.ts';
import {registerMetrics} from './metrics.ts';

type Options={db:Database;demoMode:boolean;git?:GitProvider;llm?:LLMProvider;gitlabRoot?:string;origin?:string;logger?:boolean;registryUrl?:string;workerUrl?:string};
const labels:Record<ItemKind,string>={system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'};
const approvers=new Set(['product_owner','admin']);
const dataOf=(item:Item):Record<string,Prisma.JsonValue>=>item.data as Record<string,Prisma.JsonValue>;
const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function createApp(options:Options){
  if(!options.demoMode) throw new Error('This foundation requires explicit DEMO_MODE=true; legacy authentication is unchanged');
  const {db,git}=options;
  const app=Fastify({logger:options.logger??false,bodyLimit:64*1024});
  registerMetrics(app,db);
  const origin=options.origin??'http://localhost:3310';
  app.addHook('onRequest',async request=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.origin){
      const allowed=new URL(origin);const incoming=new URL(request.headers.origin);
      if(incoming.origin!==allowed.origin&&!(incoming.port===allowed.port&&['localhost','127.0.0.1'].includes(incoming.hostname)&&['localhost','127.0.0.1'].includes(allowed.hostname))) throw new DomainError('ORIGIN_DENIED','Origem não autorizada.',403);
    }
  });
  app.setErrorHandler((error,_request,reply)=>{
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
  async function live(tx:Transaction,id:string){const item=await tx.item.findUnique({where:{id}});if(!item||item.archived)throw new DomainError('ITEM_NOT_FOUND','Item não encontrado ou arquivado.',404);return item;}
  async function ancestors(tx:Transaction,item:Item){const chain:Item[]=[];let id=item.parentId;while(id){const parent=await live(tx,id);chain.unshift(parent);id=parent.parentId;}return chain;}
  async function event(tx:Transaction,item:Item,person:{id:string;name:string},action:string,message:string,payload:unknown,actorType='human'){
    await tx.historyEvent.create({data:{itemId:item.id,ancestorIds:(await ancestors(tx,item)).map(p=>p.id),actorId:person.id,actorName:person.name,actorType,action,message,payload:json(payload)}});
  }
  async function mutate(request:FastifyRequest,fn:(tx:Transaction,person:Persona)=>Promise<unknown>){
    const person=actor(request);canPlan(person);
    const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']);
    const id=createHash('sha256').update(`${person.id}:${key}`).digest('hex');
    const hash=createHash('sha256').update(JSON.stringify([request.method,request.url,request.body])).digest('hex');
    return db.$transaction(async tx=>{
      // Serializes the small planning workload and its counters/idempotency keys.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      const cached=await tx.requestKey.findUnique({where:{id}});
      if(cached){if(cached.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT','Solicitação já utilizada para outro conteúdo.',409);return cached.result;}
      const result=await fn(tx,person);
      await tx.requestKey.create({data:{id,requestHash:hash,result:json(result)}});
      return result;
    },{timeout:15000});
  }
  function checkVersion(item:Item,expected:number){if(item.version!==expected)throw new DomainError('VERSION_CONFLICT','Este item foi alterado. Atualize a página antes de tentar novamente.',409);}
  async function ensureNotArchived(tx:Transaction,item:Item){
    const chain=[...await ancestors(tx,item),item];
    if(chain.some(i=>i.kind==='project'&&['completed','cancelled'].includes(i.projectLifecycle??'')))throw new DomainError('PROJECT_CLOSED','Reabra o Projeto antes de alterar seu planejamento.',409);
  }
  async function repositoryScope(tx:Transaction,item:Item){
    const chain=[...await ancestors(tx,item),item];const system=chain.find(i=>i.kind==='system')!;
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
  app.get<{Querystring:{kind?:string;parentId?:string}}>('/api/items',async(request)=>{
    const {kind,parentId}=z.object({kind:z.enum(kinds).optional(),parentId:z.string().optional()}).parse(request.query);
    const items=await db.item.findMany({where:{archived:false,...(kind?{kind}:{}),...(parentId?{parentId}:{})},orderBy:{createdAt:'asc'},take:500});
    return {items};
  });
  app.get<{Params:{id:string}}>('/api/items/:id',async(request)=>db.$transaction(async tx=>{
    const item=await live(tx,request.params.id);const parents=await ancestors(tx,item);
    const scope=await repositoryScope(tx,item);
    return {item,ancestors:parents,children:await tx.item.findMany({where:{parentId:item.id,archived:false},orderBy:{createdAt:'asc'}}),repositories:scope.repositories,availableRepositories:scope.available,environments:item.kind==='system'?(await tx.environment.findMany({where:{repository:{systemId:item.id}},include:{repository:{select:{name:true}}}})).map(e=>({...e,repositoryName:e.repository.name})):[],history:await tx.historyEvent.findMany({where:{OR:[{itemId:item.id},{ancestorIds:{has:item.id}}]},orderBy:{timestamp:'desc'},take:100})};
  }));
  async function createItem(tx:Transaction,person:Persona,body:z.infer<typeof createItemSchema>,provenance:Record<string,string|number>={}){
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
      const item=await tx.item.create({data:{kind:body.kind,parentId:parent?.id,parentKind:parent?.kind,key,name:body.name,description:body.description,status:statuses[body.kind][0],projectLifecycle:body.kind==='project'?'planned':null,data:{...(body.kind==='project'?{code:body.key!}:body.kind==='system'?{code:body.key!,gitlabState:'pending'}:{}),...provenance}}});
      if(body.kind==='system')await tx.provisioningJob.create({data:{itemId:item.id}});
      if(body.repositoryIds)await setRepositories(tx,item,body.repositoryIds);
      await event(tx,item,person,'ITEM_CREATED',`${labels[item.kind]} criado por ${person.name}.`,{key:item.key,status:item.status,...provenance});
      return item;
  }
  app.post('/api/items',async request=>{
    const body=createItemSchema.parse(request.body);
    return mutate(request,async(tx,person)=>({item:await createItem(tx,person,body)}));
  });
  app.patch<{Params:{id:string}}>('/api/items/:id',async request=>{
    const body=editItemSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);await ensureNotArchived(tx,item);const changed=await tx.item.update({where:{id:item.id},data:{name:body.name,description:body.description,version:{increment:1}}});await event(tx,changed,person,'ITEM_UPDATED',`${labels[item.kind]} atualizado.`,{version:changed.version});return {item:changed};});
  });
  app.post<{Params:{id:string}}>('/api/items/:id/approve',async request=>{
    const body=versionSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      if(!approvers.has(person.role))throw new DomainError('ROLE_DENIED','A aprovação exige Product Owner ou Admin.',403);
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);await ensureNotArchived(tx,item);
      if(!((item.kind==='project'&&item.status==='awaiting_approval')||(item.kind==='epic'&&item.status==='todo')))throw new DomainError('INVALID_APPROVAL','Este item não está aguardando aprovação de planejamento.',409);
      if(item.kind==='epic'&&(await live(tx,item.parentId!)).status!=='approved')throw new DomainError('PROJECT_NOT_APPROVED','Aprove o projeto antes do épico.',409);
      const changed=await tx.item.update({where:{id:item.id},data:{status:'approved',version:{increment:1}}});
      await event(tx,changed,person,'PLANNING_APPROVED',`${labels[item.kind]} aprovado por ${person.name}. Isso não inicia o pipeline nem autoriza deploy.`,{});return {item:changed};
    });
  });
  app.patch<{Params:{id:string}}>('/api/items/:id/repositories',async request=>{
    const body=versionSchema.extend({repositoryIds:z.array(z.string().min(1)).max(100)}).strict().parse(request.body);
    return mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);await ensureNotArchived(tx,item);await setRepositories(tx,item,body.repositoryIds);const changed=await tx.item.update({where:{id:item.id},data:{version:{increment:1}}});await event(tx,changed,person,'REPOSITORIES_SELECTED','Escopo de repositórios atualizado.',{repositoryIds:body.repositoryIds});return {item:changed};});
  });
  app.post<{Params:{id:string}}>('/api/items/:id/lifecycle',async request=>{
    const body=versionSchema.extend({lifecycle:z.enum(['planned','active','completed','cancelled']),comment:z.string().trim().max(2000).optional()}).strict().parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);if(item.kind!=='project')throw new DomainError('INVALID_ITEM','Ciclo de vida pertence ao Projeto.');
      const from=item.projectLifecycle??'planned';const transitions:Record<string,string[]>={planned:['active','cancelled'],active:['completed','cancelled'],completed:['active'],cancelled:['planned']};
      if(!transitions[from]?.includes(body.lifecycle))throw new DomainError('INVALID_TRANSITION','Transição de ciclo de vida inválida.',409);
      if(body.lifecycle==='active'&&item.status!=='approved')throw new DomainError('PROJECT_NOT_APPROVED','Aprove o Projeto antes de iniciá-lo.',409);
      if(['completed','cancelled'].includes(from)&&(!body.comment||body.comment.length<10))throw new DomainError('REOPEN_REASON_REQUIRED','Justifique a reabertura com pelo menos 10 caracteres.');
      if(body.lifecycle==='completed'){const epics=await tx.item.findMany({where:{parentId:item.id,archived:false}});if(!epics.length||epics.some(e=>e.status!=='done'))throw new DomainError('UNFINISHED_EPICS','Conclua todos os Épicos antes de encerrar o Projeto.',409);}
      const changed=await tx.item.update({where:{id:item.id},data:{projectLifecycle:body.lifecycle,version:{increment:1}}});await event(tx,changed,person,'PROJECT_LIFECYCLE_CHANGED','Ciclo de vida do Projeto atualizado; repositórios e ambientes preservados.',{from,to:body.lifecycle,comment:body.comment??null});return {item:changed};
    });
  });
  app.post<{Params:{id:string}}>('/api/items/:id/status',async request=>{
    const body=statusSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);await ensureNotArchived(tx,item);
      if(!['task','epic'].includes(item.kind))throw new DomainError('PIPELINE_STATUS_ONLY','O status da história é controlado pelo pipeline. Aprovações de planejamento têm ação própria.',409);
      const transitions:Record<string,string[]>=item.kind==='task'?{todo:['doing'],doing:['done','todo'],done:['doing']}:{approved:['doing'],doing:['done'],done:['doing']};
      if(!transitions[item.status]?.includes(body.status))throw new DomainError('INVALID_TRANSITION','Transição de status não permitida.',409);
      if(item.kind==='epic'&&body.status==='done'){
        const children=await tx.item.findMany({where:{parentId:item.id,archived:false}});
        if(!children.length||children.some(c=>c.status!=='completed'))throw new DomainError('UNFINISHED_STORIES','Conclua todas as histórias antes de encerrar o épico.',409);
      }
      if(item.status==='done'&&(!body.comment||body.comment.length<10))throw new DomainError('REOPEN_REASON_REQUIRED','Justifique a reabertura com pelo menos 10 caracteres.');
      const changed=await tx.item.update({where:{id:item.id},data:{status:body.status,version:{increment:1}}});
      await event(tx,changed,person,'STATUS_CHANGED',`Status alterado de ${statusLabels[item.status]} para ${statusLabels[body.status]}.`,{from:item.status,to:body.status,comment:body.comment??null});return {item:changed};
    });
  });
  app.delete<{Params:{id:string}}>('/api/items/:id',async request=>{
    const body=versionSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);
      const queue=[item];
      for(let i=0;i<queue.length;i++)queue.push(...await tx.item.findMany({where:{parentId:queue[i].id,archived:false}}));
      // Children first so ancestor lookups remain available for audit events.
      for(const child of queue.reverse()){
        await event(tx,child,person,'ITEM_ARCHIVED',`${labels[child.kind]} arquivado.`,{});
        await tx.item.update({where:{id:child.id},data:{archived:true,version:{increment:1}}});
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
    const claimed=await db.provisioningJob.updateMany({where:{itemId,OR:[{state:{in:['pending','failed','not_configured']}},{state:'running',updatedAt:{lt:new Date(Date.now()-120000)}}]},data:{state:'running',attempts:{increment:1}}});
    if(!claimed.count)return;
    try{
      if(!git)throw new DomainError('GITLAB_NOT_CONFIGURED','GitLab não configurado. O planejamento está salvo.',503);
      let result:Record<string,Prisma.JsonValue>;
      if(job.item.kind==='system'){
        const group=await git.ensureGroup(`${options.gitlabRoot??'sdlc'}/${String(dataOf(job.item).code).toLowerCase()}`);
        result={gitlabGroupId:group.id,gitlabGroupPath:group.full_path,...(group.web_url?{gitlabUrl:group.web_url}:{})};
      }else{await db.provisioningJob.update({where:{itemId},data:{state:'cancelled'}});return;}
      await db.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
        const current=await tx.item.findUniqueOrThrow({where:{id:itemId}});
        if(current.archived){await tx.provisioningJob.update({where:{itemId},data:{state:'cancelled'}});return;}
        const changed=await tx.item.update({where:{id:itemId},data:{data:{...dataOf(current),...result,gitlabState:'ready',gitlabMessage:''}}});
        await tx.provisioningJob.update({where:{itemId},data:{state:'succeeded',message:''}});
        await event(tx,changed,{id:'integration:gitlab',name:'Integração GitLab'},'GITLAB_PROVISIONED','Recurso GitLab provisionado sem iniciar build ou deploy.',result,'system');
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
        await event(tx,current,{id:'integration:gitlab',name:'Integração GitLab'},'GITLAB_PROVISIONING_FAILED',message,{state},'system');
      });
    }
  }
  app.post<{Params:{id:string}}>('/api/items/:id/provision',async request=>{
    const body=versionSchema.parse(request.body);
    const result=await mutate(request,async(tx,person)=>{const item=await live(tx,request.params.id);checkVersion(item,body.expectedVersion);if(item.kind!=='system')throw new DomainError('INVALID_ITEM','Somente Sistemas provisionam grupos GitLab.');const job=await tx.provisioningJob.findUniqueOrThrow({where:{itemId:item.id}});if(job.state==='running'&&job.updatedAt>new Date(Date.now()-120000))throw new DomainError('PROVISIONING_RUNNING','O provisionamento já está em execução. Aguarde sua conclusão.',409);if(job.state==='succeeded')return {item};await tx.provisioningJob.update({where:{itemId:item.id},data:{state:'pending',attempts:0}});await event(tx,item,person,'GITLAB_RETRY_REQUESTED','Nova tentativa de provisionamento solicitada.',{});return {item};});
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
      const repository=await tx.repository.create({data:{systemId:system.id,name:body.name,key:body.key,runtime:body.runtime,mode:body.mode,...(remote?{gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace,gitlabUrl:remote.web_url,state:'ready'}:{})}});
      await tx.environment.createMany({data:['QA','HML','PRD'].map(code=>({repositoryId:repository.id,code}))});
      await event(tx,system,person,remote?'REPOSITORY_LINKED':'REPOSITORY_REQUESTED',remote?'Repositório existente vinculado ao Sistema sem alterar seu conteúdo.':'Criação de repositório do Sistema solicitada.',{repositoryId:repository.id,gitlabProjectId:remote?.id??null});return {repository};
    });
  });
  app.post<{Params:{id:string}}>('/api/repositories/:id/provision',async request=>{
    const body=versionSchema.parse(request.body);
    return mutate(request,async(tx,person)=>{
      const repository=await tx.repository.findUnique({where:{id:request.params.id}});if(!repository)throw new DomainError('REPOSITORY_NOT_FOUND','Repositório não encontrado.',404);
      const system=await live(tx,repository.systemId);if(repository.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','Atualize os dados antes de tentar novamente.',409);
      if(repository.state==='ready')return {repository};
      if(repository.state==='running'&&repository.updatedAt>new Date(Date.now()-120000))throw new DomainError('PROVISIONING_RUNNING','Provisionamento em execução.',409);
      const changed=await tx.repository.update({where:{id:repository.id},data:{state:'pending',attempts:0,version:{increment:1}}});await event(tx,system,person,'REPOSITORY_RETRY_REQUESTED','Nova tentativa de criação do repositório solicitada.',{repositoryId:repository.id});return {repository:changed};
    });
  });
  async function provisionRepository(id:string){
    const repository=await db.repository.findUnique({where:{id},include:{system:true}});if(!repository||repository.system.archived||repository.mode!=='create'||repository.state==='ready')return;
    const claimed=await db.repository.updateMany({where:{id,attempts:{lt:3},OR:[{state:{in:['pending','failed']}},{state:'running',updatedAt:{lt:new Date(Date.now()-120000)}}]},data:{state:'running',attempts:{increment:1}}});if(!claimed.count)return;
    try{
      if(!git)throw new DomainError('GITLAB_NOT_CONFIGURED','GitLab não configurado; cadastro do repositório preservado.',503);
      const group=await git.ensureGroup(`${options.gitlabRoot??'sdlc'}/${String(dataOf(repository.system).code).toLowerCase()}`);
      const remote=await git.ensureProject(group,repository.key,repository.runtime as 'node'|'python',repository.name);
      await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;const system=await tx.item.findUniqueOrThrow({where:{id:repository.systemId}});await tx.repository.update({where:{id},data:{gitlabProjectId:remote.id,gitlabPath:remote.path_with_namespace,gitlabUrl:remote.web_url,state:'ready',message:''}});await event(tx,system,{id:'integration:gitlab',name:'Integração GitLab'},'REPOSITORY_PROVISIONED','Repositório do Sistema provisionado sem build ou deploy.',{repositoryId:id,gitlabProjectId:remote.id},'system');});
    }catch(error){await db.$transaction(async tx=>{
      await tx.repository.update({where:{id},data:{state:git?'failed':'not_configured',message:error instanceof DomainError?error.message:'Falha na criação; tente novamente.'}});
      await event(tx,repository.system,{id:'integration:gitlab',name:'Integração GitLab'},'REPOSITORY_PROVISIONING_FAILED','Falha de provisionamento do repositório registrada.',{metricsVersion:1,repositoryId:id,errorCode:error instanceof DomainError?error.code:'PROVISIONING_ERROR'},'system');
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
    const checks=[gitCheck,llmCheck,...await Promise.all([healthCheck('registry','Repositório de artefatos',options.registryUrl,'/v2/'),healthCheck('executor','Executor e roteamento',options.workerUrl,'/health')])];
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
    if(await db.storyExecution.count({where:{state:{in:['running','cancelled']},leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma execução está utilizando o modelo local.',409);
    if(await db.chatTurn.count({where:{status:{in:['running','cancelled']},leaseUntil:{gt:new Date()}}}))throw new DomainError('LLM_BUSY','Uma conversa está utilizando o modelo local.',409);
    inferenceRunning=true;const controller=new AbortController();const cancel=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.on('close',cancel);
    const started=Date.now();
    try{const result=await options.llm.complete([{role:'user',content:'Responda apenas com a palavra PRONTO. /no_think'}],{maxTokens:128,signal:controller.signal});return {...result,elapsedMs:Date.now()-started,scope:'technical-inference-only'};}
    finally{inferenceRunning=false;reply.raw.off('close',cancel);}
  });
  let processing=false;
  async function processJobs(){if(processing)return;processing=true;try{const jobs=await db.provisioningJob.findMany({where:{state:{in:['pending','failed','running']},attempts:{lt:3}},orderBy:{updatedAt:'asc'},take:10});for(const job of jobs)await provision(job.itemId);const repositories=await db.repository.findMany({where:{state:{in:['pending','failed','running']},attempts:{lt:3},system:{archived:false}},orderBy:{updatedAt:'asc'},take:10});for(const repository of repositories)await provisionRepository(repository.id);}finally{processing=false;}}
  const assistantHelpers={db,llm:options.llm,actor,canPlan,mutate,live,ancestors,ensureNotArchived,event,createItem,isProbeRunning:()=>inferenceRunning};
  const {processChatJobs}=registerAssistant(app,assistantHelpers);
  const {processExecutionJobs}=registerExecution(app,assistantHelpers,git);
  return {app,processJobs,processChatJobs,processExecutionJobs};
}
