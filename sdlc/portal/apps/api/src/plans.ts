import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Item,PlanProposal} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {assistantLineage,type AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {planSchema,validatePlanScope,type Plan} from './plan-schema.ts';
import {assertFormalPlan} from './requirements.ts';
import type {AuditOptions} from './audit.ts';
import {hierarchyBlock} from './lifecycle-policy.ts';
import {ensurePipelineTasks,applyPipelineTaskPlan,pipelineStageOf} from './pipeline-tasks.ts';
import {initializeStorySpecification} from './story-specifications.ts';
import {repositoriesOfSystem} from './system-repository.ts';

export async function projectFingerprint(tx:Transaction,projectId:string){
  const tree=await tx.$queryRaw<{id:string;version:number;archived:boolean;status:string;parentId:string|null;projectLifecycle:string|null}[]>`WITH RECURSIVE tree AS (SELECT * FROM "Item" WHERE id=${projectId} UNION ALL SELECT i.* FROM "Item" i JOIN tree t ON i."parentId"=t.id) SELECT id,version,archived,status,"parentId","projectLifecycle" FROM tree ORDER BY id`;
  const links=await tx.itemRepository.findMany({where:{itemId:{in:tree.map(i=>i.id)}},orderBy:[{itemId:'asc'},{repositoryId:'asc'}],select:{itemId:true,repositoryId:true}});
  const project=await tx.item.findUniqueOrThrow({where:{id:projectId}});
  const repository=await repositoriesOfSystem(tx,project);
  return createHash('sha256').update(JSON.stringify([tree,links,repository.map(r=>({id:r.id,version:r.version}))])).digest('hex');
}
export async function proposalList(tx:Transaction,item:Item,sessionVersion:number,page=1){
  if(item.kind!=='project')return [];
  const proposals=await tx.planProposal.findMany({where:{projectId:item.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,skip:(page-1)*20});
  return projectProposalProjection(tx,item,sessionVersion,proposals);
}

const appliedIds=(proposal:PlanProposal)=>proposal.status==='applied'&&Array.isArray(proposal.appliedItemIds)?[...new Set(proposal.appliedItemIds.filter((id):id is string=>typeof id==='string'&&id.length>0))]:[];
const projectReference=(item:Item)=>({id:item.id,key:item.key,name:item.name});
type PlanCreationReceipt={itemIds:string[];items:Pick<Item,'id'|'kind'|'key'|'name'|'status'|'parentId'|'archived'>[];totals:{epics:number;stories:number;tasks:number;total:number};coverage:{expected:number;available:number;complete:boolean}};
async function creationReceipts(tx:Transaction,proposals:PlanProposal[]){
  const ids=[...new Set(proposals.flatMap(appliedIds))];
  // The receipt is based on persisted item IDs, never on generated prose or a
  // reconstruction from the current tree. Limit its projection to safe labels.
  const found=ids.length?await tx.item.findMany({where:{id:{in:ids}},select:{id:true,kind:true,key:true,name:true,status:true,parentId:true,archived:true,parent:{select:{parentId:true,parent:{select:{parentId:true}}}}}}):[];
  const byId=new Map(found.map(item=>[item.id,item]));
  return new Map<string,PlanCreationReceipt|null>(proposals.map(proposal=>{
    const itemIds=appliedIds(proposal);
    if(!itemIds.length)return [proposal.id,null] as const;
    const items=itemIds.flatMap(id=>{
      const item=byId.get(id);
      if(!item)return [];
      const projectId=item.kind==='epic'?item.parentId:item.kind==='story'?item.parent?.parentId:item.kind==='task'?item.parent?.parent?.parentId:null;
      if(projectId!==proposal.projectId)return [];
      const {parent,...safe}=item;return [safe];
    });
    const totals={epics:items.filter(item=>item.kind==='epic').length,stories:items.filter(item=>item.kind==='story').length,tasks:items.filter(item=>item.kind==='task').length,total:items.length};
    return [proposal.id,{itemIds,items,totals,coverage:{expected:itemIds.length,available:items.length,complete:items.length===itemIds.length}}] as const;
  }));
}

export async function planCreationReceipt(tx:Transaction,proposal:PlanProposal){
  return (await creationReceipts(tx,[proposal])).get(proposal.id)??null;
}

export async function projectProposalProjection(tx:Transaction,item:Item,sessionVersion:number,proposals:PlanProposal[]){
  const fingerprint=proposals.some(p=>p.status==='draft')?await projectFingerprint(tx,item.id):'';
  const receipts=await creationReceipts(tx,proposals);
  return proposals.map(p=>({...p,project:projectReference(item),stale:p.status==='draft'&&(p.projectVersion!==item.version||p.sessionVersion!==sessionVersion||p.contextFingerprint!==fingerprint),creationReceipt:receipts.get(p.id)??null}));
}
export const planInstructions='Gere somente um objeto JSON válido, sem markdown: {"summary":"...","epics":[{"title":"...","description":"...","stories":[{"title":"...","description":"...","acceptanceCriteria":["..."],"repositoryIds":[],"tasks":[{"title":"...","description":"...","repositoryIds":[],"pipelineStage":"coding"}]}]}]}. Use apenas objetivos e restrições informados pelo usuário; não invente domínio, demandas ou aprovações. Se faltarem informações, retorne {"error":"entrevista insuficiente"}. Respeite quantidades explicitamente solicitadas pelo usuário. Na ausência delas, proponha uma fatia pequena de um épico e uma História. Seja conciso: descrições de uma frase, resumo de até 300 caracteres, sem repetir o título na descrição. Preserve o escopo já combinado na entrevista. Cada História recebe automaticamente seis Tarefas fixas: Codificação (coding), Teste (test), Revisão de Código (code_review), Revisão de Segurança (security_scan), Teste Final (final_test), Merge de Código (merge). Para detalhar uma dessas Tarefas, use pipelineStage com a etapa correspondente; não crie uma equivalente em paralelo e não repita a etapa. Tarefas adicionais de trabalho humano podem omitir pipelineStage; tasks pode ser vazio. A existência das Tarefas não inicia executores nem comprova testes/revisões. Limites: títulos 120 caracteres, descrições 1000, resumo 2000, critérios até 6 de 200 caracteres; no máximo 30 itens incluindo as seis Tarefas padrão de cada História. O Sistema possui um repositório único herdado por todos os Projetos, Histórias e Tarefas. A arquitetura define pastas de APIs, frontend, backend, batch e infraestrutura. repositoryIds é apenas compatibilidade: omita ou use []; não peça escolha de repositório nem crie componentes separados. Se houver IDs legados, use somente o repositório do Sistema informado no contexto. Não execute operações. Tudo será revisado antes de criar itens.';

export function parsePlan(output:string,allowedIds:string[],formal=false):Plan{
  let parsed:unknown;
  try{parsed=JSON.parse(output);}catch{throw new DomainError('PLAN_INVALID_RESPONSE','O modelo não retornou um plano JSON válido. Complete a entrevista ou solicite uma proposta menor.',502);}
  if(parsed&&typeof parsed==='object'&&'error' in parsed&&typeof parsed.error==='string')throw new DomainError('INTERVIEW_INCOMPLETE',parsed.error.slice(0,300)+' Continue a entrevista antes de criar os itens.',409);
  const result=planSchema.safeParse(parsed);
  if(!result.success||!validatePlanScope(result.data,allowedIds))throw new DomainError('PLAN_INVALID_RESPONSE','A proposta não atende ao formato ou escopo permitido. Revise a entrevista e solicite um plano menor.',502);
  if(formal){try{assertFormalPlan(result.data);}catch(error){throw new DomainError('REQUIREMENTS_INCOMPLETE',error instanceof Error?error.message:'Requisitos incompletos.',409);}}
  return result.data;
}

export function registerPlans(app:FastifyInstance,h:AssistantHelpers,context:(tx:Transaction,id:string)=>Promise<Item>){
  app.get<{Params:{id:string;version:string}}>('/api/assistant/plans/:id/revisions/:version',async request=>{
    const version=z.coerce.number().int().positive().parse(request.params.version);
    const {includeArchived}=z.object({includeArchived:z.enum(['true','false']).default('false')}).strict().parse(request.query);
    return h.db.$transaction(async tx=>{
      const proposal=await tx.planProposal.findUnique({where:{id:request.params.id}});
      if(!proposal)throw new DomainError('PLAN_NOT_FOUND','Proposta não encontrada.',404);
      const chain=await assistantLineage(tx,proposal.projectId,includeArchived==='true'),project=chain.at(-1)!;
      const revision=await tx.planRevision.findUnique({where:{proposalId_version:{proposalId:proposal.id,version}}});
      if(!revision)throw new DomainError('PLAN_REVISION_NOT_FOUND','Revisão da proposta não encontrada.',404);
      return {proposalId:proposal.id,version,revision,context:{id:project.id,kind:project.kind,key:project.key,name:project.name,systemId:chain.find(i=>i.kind==='system')?.id,projectId:project.id,archived:chain.some(i=>i.archived)},readOnly:!!hierarchyBlock(chain),coverage:'Conteúdo da revisão persistida na fonte de planejamento; não implica aplicação nem aprovação de G1.'};
    },{isolationLevel:'RepeatableRead'});
  });
  app.post('/api/assistant/complete',async request=>{
    const body=z.object({contextId:z.string().min(1),projectId:z.string().min(1),expectedVersion:z.number().int().positive(),confirmed:z.literal(true),requirementsMode:z.boolean().optional()}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!['admin','product_owner','architect'].includes(person.role))throw new DomainError('ROLE_DENIED','Criar planejamento exige Admin, Product Owner ou Arquiteto.',403);
      if(!h.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
      const source=await context(tx,body.contextId),project=await h.live(tx,body.projectId);
      if(source.kind==='story')throw new DomainError('PROJECT_REQUIRED','Criação de épicos, histórias e tarefas pertence ao planejamento do Projeto.',409);
      if(project.kind!=='project'||(source.kind==='project'?source.id!==project.id:project.parentId!==source.id))throw new DomainError('PROJECT_SCOPE','Selecione um Projeto deste Sistema.',409);
      await h.ensureNotArchived(tx,source);await h.ensureNotArchived(tx,project);
      const session=await tx.chatSession.findUnique({where:{contextId:source.id}});
      if(!session||session.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A conversa mudou; revise antes de concluir.',409);
      if(await tx.chatTurn.count({where:{sessionId:session.id,status:{in:['queued','running','paused']}}}))throw new DomainError('CHAT_BUSY','Aguarde, retome ou cancele a geração pendente.',409);
      const latest=await tx.chatTurn.findFirst({where:{sessionId:session.id,status:'succeeded',kind:{in:['chat','plan']}},orderBy:{sequence:'desc'}});
      if(!latest)throw new DomainError('INTERVIEW_REQUIRED','Converse sobre o objetivo antes de concluir.',409);
      const latestSnapshot=latest.contextSnapshot as Record<string,unknown>;
      const brief=latestSnapshot.interviewBrief as {openQuestions?:unknown[]}|undefined;
      if((body.requirementsMode||latestSnapshot.requirementsVersion===1)&&brief?.openQuestions?.length)throw new DomainError('INTERVIEW_INCOMPLETE','Ainda há perguntas em aberto na entrevista. Responda ou confirme seu encaminhamento com o assistente antes de criar os itens.',409);
      if(latest.kind==='plan'&&(latest.contextSnapshot as Record<string,unknown>)?.createItems)throw new DomainError('PLAN_ALREADY_APPLIED','A entrevista já criou itens. Continue a conversa antes de concluir novamente.',409);
      const repositories=await tx.repository.findMany({where:{links:{some:{itemId:project.id}}},select:{id:true,key:true,name:true},take:20});
      const snapshot={contextId:project.id,kind:'project',name:project.name,description:project.description.slice(0,1000),version:project.version,repositories,fingerprint:await projectFingerprint(tx,project.id),createItems:true,...(body.requirementsMode||(latest.contextSnapshot as Record<string,unknown>).requirementsVersion===1?{requirementsVersion:1}:{} )};
      const turn=await tx.chatTurn.create({data:{sessionId:session.id,sequence:session.nextTurn,kind:'plan',input:`Concluir entrevista e criar épicos, histórias e tarefas no Projeto ${project.name}.`,actorId:person.id,actorName:person.name,contextSnapshot:snapshot}});
      await tx.chatSession.update({where:{id:session.id},data:{version:{increment:1},nextTurn:{increment:1}}});
      await h.event(tx,source,person,'ASSISTANT_COMPLETION_REQUESTED','Usuário concluiu a entrevista e solicitou criação pela assistente.',{turnId:turn.id,projectId:project.id});
      return {turn};
    });
  });
  app.post('/api/assistant/plans',async request=>{
    const body=z.object({contextId:z.string().min(1),expectedVersion:z.number().int().min(0),requirementsMode:z.boolean().optional()}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!h.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
      const item=await context(tx,body.contextId);if(item.kind!=='project')throw new DomainError('PROJECT_REQUIRED','Abra o Projeto de destino antes de gerar um plano.',409);await h.ensureNotArchived(tx,item);
      const session=await tx.chatSession.findUnique({where:{contextId:item.id}});
      if(!session||!await tx.chatTurn.count({where:{sessionId:session.id,status:'succeeded',kind:'chat'}}))throw new DomainError('INTERVIEW_REQUIRED','Converse com a assistente sobre seu objetivo antes de gerar o plano.',409);
      if(session.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A conversa foi atualizada; revise antes de gerar.',409);
      if(await tx.chatTurn.count({where:{sessionId:session.id,status:{in:['queued','running','paused']}}}))throw new DomainError('CHAT_BUSY','Aguarde, retome ou cancele a geração pendente.',409);
      const repositories=await tx.repository.findMany({where:{links:{some:{itemId:item.id}}},select:{id:true,key:true,name:true},take:20});
      const latest=await tx.chatTurn.findFirst({where:{sessionId:session.id,status:'succeeded',kind:{in:['chat','plan']}},orderBy:{sequence:'desc'}});
      const snapshot={contextId:item.id,kind:'project',name:item.name,description:item.description.slice(0,1000),version:item.version,repositories,fingerprint:await projectFingerprint(tx,item.id),...(body.requirementsMode||(latest?.contextSnapshot as Record<string,unknown>)?.requirementsVersion===1?{requirementsVersion:1}:{} )};
      const turn=await tx.chatTurn.create({data:{sessionId:session.id,sequence:session.nextTurn,kind:'plan',input:'Gerar plano estruturado a partir desta entrevista para revisão humana.',actorId:person.id,actorName:person.name,contextSnapshot:snapshot},select:{id:true,input:true,output:true,status:true,model:true,error:true,actorName:true,createdAt:true,kind:true}});
      await tx.chatSession.update({where:{id:session.id},data:{version:{increment:1},nextTurn:{increment:1}}});
      await h.event(tx,item,person,'PLAN_GENERATION_REQUESTED','Geração de proposta solicitada; nenhum item criado.',{turnId:turn.id});return {turn};
    });
  });
  app.patch<{Params:{id:string}}>('/api/assistant/plans/:id',async request=>{
    const body=z.object({expectedVersion:z.number().int().positive(),content:planSchema}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      const proposal=await tx.planProposal.findUnique({where:{id:request.params.id}});if(!proposal)throw new DomainError('PLAN_NOT_FOUND','Proposta não encontrada.',404);
      const item=await h.live(tx,proposal.projectId);await h.ensureNotArchived(tx,item);
      if(proposal.status!=='draft'||proposal.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A proposta foi alterada ou aplicada. Atualize sem sobrescrever seu rascunho.',409);
      const allowed=await repositoriesOfSystem(tx,item);
      if(!validatePlanScope(body.content,allowed.map(r=>r.id)))throw new DomainError('INVALID_REPOSITORY_SCOPE','Repositórios fora do escopo do Projeto ou da História.',409);
      const version=proposal.version+1;
      const changed=await tx.planProposal.update({where:{id:proposal.id},data:{content:body.content,version}});
      await tx.planRevision.create({data:{proposalId:proposal.id,version,content:body.content,source:'human',actorId:person.id,actorName:person.name}});
      await h.event(tx,item,person,'PLAN_REVISED','Nova revisão humana da proposta registrada.',{proposalId:proposal.id,version},'human',{before:{version:proposal.version},after:{version},operationId:proposal.id,subject:{type:'plan_proposal',id:proposal.id}});return {proposal:{...changed,project:projectReference(item)}};
    });
  });
  app.post<{Params:{id:string}}>('/api/assistant/plans/:id/apply',async request=>{
    const body=z.object({expectedVersion:z.number().int().positive(),expectedProjectVersion:z.number().int().positive(),expectedSessionVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!['admin','product_owner','architect'].includes(person.role))throw new DomainError('ROLE_DENIED','Aplicar plano exige Admin, Product Owner ou Arquiteto.',403);
      const proposal=await tx.planProposal.findUnique({where:{id:request.params.id},include:{turn:{include:{session:true}}}});
      if(!proposal)throw new DomainError('PLAN_NOT_FOUND','Proposta não encontrada.',404);
      if(proposal.status==='applied')throw new DomainError('PLAN_ALREADY_APPLIED','Esta proposta já foi aplicada. Consulte os itens criados.',409);
      const item=await h.live(tx,proposal.projectId);await h.ensureNotArchived(tx,item);
      if(proposal.version!==body.expectedVersion||proposal.projectVersion!==body.expectedProjectVersion||proposal.sessionVersion!==body.expectedSessionVersion||item.version!==proposal.projectVersion||proposal.turn.session.version!==proposal.sessionVersion||await projectFingerprint(tx,item.id)!==proposal.contextFingerprint)throw new DomainError('PLAN_STALE','Proposta ou contexto alterado. Revise a conversa e gere uma nova proposta; nenhum item foi criado.',409);
      const plan=planSchema.parse(proposal.content);const allowed=await repositoriesOfSystem(tx,item);
      if((proposal.turn.contextSnapshot as Record<string,unknown>).requirementsVersion===1){try{assertFormalPlan(plan);}catch(error){throw new DomainError('REQUIREMENTS_INCOMPLETE',error instanceof Error?error.message:'Requisitos incompletos.',409);}}
      if(!validatePlanScope(plan,allowed.map(r=>r.id)))throw new DomainError('INVALID_REPOSITORY_SCOPE','Repositórios fora do escopo.',409);
      const ids=await createPlanItems(tx,h,person,item.id,plan,proposal.id,proposal.version,proposal.turnId);
      const changed=await tx.planProposal.update({where:{id:proposal.id},data:{status:'applied',appliedItemIds:ids}});
      await tx.item.update({where:{id:item.id},data:{version:{increment:1}}});
      await h.event(tx,item,person,'PLAN_APPLIED','Plano revisado aplicado ao planejamento; sem aprovar ou iniciar execução.',{proposalId:proposal.id,revision:proposal.version,itemIds:ids},'human',{...await planApplicationAudit(tx,ids,proposal.id,proposal.version,proposal.turnId),before:{version:proposal.version,state:proposal.status},after:{version:proposal.version,state:'applied'},operationId:proposal.id,subject:{type:'plan_proposal',id:proposal.id}});
      const creationReceipt=await planCreationReceipt(tx,changed);
      return {proposal:{...changed,project:projectReference(item),creationReceipt},itemIds:ids,creationReceipt};
    });
  });
}

export async function createPlanItems(tx:Transaction,h:AssistantHelpers,person:Parameters<AssistantHelpers['canPlan']>[0],projectId:string,plan:Plan,proposalId:string,revision:number,turnId:string,creationAudit?:AuditOptions){
      const ids:string[]=[];const source={planProposalId:proposalId,planRevision:revision,sourceTurnId:turnId,creationOrigin:'assistant'};
      const planRevision=await tx.planRevision.findUnique({where:{proposalId_version:{proposalId,version:revision}}});
      const specificationSource=planRevision?.source==='human'?'human':'agent';
      const specificationAuthor=planRevision?{id:planRevision.actorId,name:planRevision.actorName}:undefined;
      for(const epic of plan.epics){
        const e=await h.createItem(tx,person,{kind:'epic',parentId:projectId,name:epic.title,description:epic.description},source,creationAudit);ids.push(e.id);
        for(const story of epic.stories){
          const description=story.requirements?story.description:story.description+'\n\nCritérios de aceite:\n'+story.acceptanceCriteria.map(c=>'• '+c).join('\n');
          const s=await h.createItem(tx,person,{kind:'story',parentId:e.id,name:story.title,description,repositoryIds:story.repositoryIds},source,creationAudit);ids.push(s.id);
          const defaults=await ensurePipelineTasks(tx,s,person,h.createItem,creationAudit);ids.push(...defaults.map(task=>task.id));
          for(const task of story.tasks){
            if(task.pipelineStage){
              const planned=defaults.find(candidate=>pipelineStageOf(candidate)===task.pipelineStage)!;
              await applyPipelineTaskPlan(tx,h,planned,person,task,creationAudit);
            }else{
              const t=await h.createItem(tx,person,{kind:'task',parentId:s.id,name:task.title,description:task.description,repositoryIds:task.repositoryIds},source,creationAudit);ids.push(t.id);
            }
          }
          await initializeStorySpecification(tx,h,s,person,{requirements:{...(story.requirements??{}),objective:story.requirements?.objective||story.title,behavior:story.requirements?.behavior||story.description,functionalCriteria:story.acceptanceCriteria},technical:null},specificationSource,{author:specificationAuthor,initiator:person,executor:creationAudit?.executor??{...person,type:'human'}});
        }
      }

  return ids;
}

export async function planApplicationAudit(tx:Transaction,itemIds:string[],proposalId:string,revision:number,turnId:string):Promise<AuditOptions>{
  const stories=await tx.item.findMany({where:{id:{in:itemIds},kind:'story'},select:{id:true,key:true,name:true,version:true},orderBy:{id:'asc'}});
  return {targets:stories.map(story=>({type:'story',...story})),evidence:[{type:'plan_proposal',id:proposalId,revision:String(revision),source:'plan_proposal'},{type:'chat_turn',id:turnId,source:'chat_turn'}]};
}
