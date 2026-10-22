import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Item} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {planSchema,validatePlanScope,type Plan} from './plan-schema.ts';

export async function projectFingerprint(tx:Transaction,projectId:string){
  const tree=await tx.$queryRaw<{id:string;version:number;archived:boolean;status:string;parentId:string|null;projectLifecycle:string|null}[]>`WITH RECURSIVE tree AS (SELECT * FROM "Item" WHERE id=${projectId} UNION ALL SELECT i.* FROM "Item" i JOIN tree t ON i."parentId"=t.id) SELECT id,version,archived,status,"parentId","projectLifecycle" FROM tree ORDER BY id`;
  const links=await tx.itemRepository.findMany({where:{itemId:{in:tree.map(i=>i.id)}},orderBy:[{itemId:'asc'},{repositoryId:'asc'}],select:{itemId:true,repositoryId:true}});
  return createHash('sha256').update(JSON.stringify([tree,links])).digest('hex');
}
export async function proposalList(tx:Transaction,item:Item,sessionVersion:number){
  if(item.kind!=='project')return [];
  const proposals=await tx.planProposal.findMany({where:{projectId:item.id},orderBy:{createdAt:'desc'},take:10});
  const fingerprint=proposals.some(p=>p.status==='draft')?await projectFingerprint(tx,item.id):'';
  return proposals.map(p=>({...p,stale:p.status==='draft'&&(p.projectVersion!==item.version||p.sessionVersion!==sessionVersion||p.contextFingerprint!==fingerprint)}));
}
export const planInstructions='Gere somente um objeto JSON válido, sem markdown: {"summary":"...","epics":[{"title":"...","description":"...","stories":[{"title":"...","description":"...","acceptanceCriteria":["..."],"repositoryIds":[],"tasks":[{"title":"...","description":"...","repositoryIds":[]}]}]}]}. Use apenas objetivos e restrições informados pelo usuário; não invente domínio, demandas ou aprovações. Se faltarem informações, retorne {"error":"entrevista insuficiente"}. Respeite quantidades explicitamente solicitadas pelo usuário. Na ausência delas, proponha fatia pequena: 1 ou 2 épicos, até 2 histórias por épico, até 2 tarefas por história. Seja conciso: descrições de uma frase, resumo de até 300 caracteres, sem repetir o título na descrição. Preserve o escopo já combinado na entrevista. Limites: títulos 120 caracteres, descrições 1000, resumo 2000, critérios até 6 de 200 caracteres. Cada história e cada tarefa deve conter repositoryIds, mesmo vazio. Use somente IDs do contexto; tarefas usam subconjunto da história. Se não informado, use []. Não execute operações. Tudo será revisado antes de criar itens.';

export function parsePlan(output:string,allowedIds:string[]):Plan{
  let parsed:unknown;
  try{parsed=JSON.parse(output);}catch{throw new DomainError('PLAN_INVALID_RESPONSE','O modelo não retornou um plano JSON válido. Complete a entrevista ou solicite uma proposta menor.',502);}
  const result=planSchema.safeParse(parsed);
  if(!result.success||!validatePlanScope(result.data,allowedIds))throw new DomainError('PLAN_INVALID_RESPONSE','A proposta não atende ao formato ou escopo permitido. Revise a entrevista e solicite um plano menor.',502);
  return result.data;
}

export function registerPlans(app:FastifyInstance,h:AssistantHelpers,context:(tx:Transaction,id:string)=>Promise<Item>){
  app.post('/api/assistant/complete',async request=>{
    const body=z.object({contextId:z.string().min(1),projectId:z.string().min(1),expectedVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!['admin','product_owner'].includes(person.role))throw new DomainError('ROLE_DENIED','Criar planejamento exige Admin ou Product Owner.',403);
      if(!h.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
      const source=await context(tx,body.contextId),project=await h.live(tx,body.projectId);
      if(project.kind!=='project'||(source.kind==='project'?source.id!==project.id:project.parentId!==source.id))throw new DomainError('PROJECT_SCOPE','Selecione um Projeto deste Sistema.',409);
      await h.ensureNotArchived(tx,source);await h.ensureNotArchived(tx,project);
      if(['completed','cancelled'].includes(project.projectLifecycle??''))throw new DomainError('PROJECT_CLOSED','Projeto encerrado.',409);
      const session=await tx.chatSession.findUnique({where:{contextId:source.id}});
      if(!session||session.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A conversa mudou; revise antes de concluir.',409);
      if(await tx.chatTurn.count({where:{sessionId:session.id,status:{in:['queued','running']}}}))throw new DomainError('CHAT_BUSY','Aguarde a geração pendente.',409);
      const latest=await tx.chatTurn.findFirst({where:{sessionId:session.id,status:'succeeded'},orderBy:{sequence:'desc'}});
      if(!latest)throw new DomainError('INTERVIEW_REQUIRED','Converse sobre o objetivo antes de concluir.',409);
      if(latest.kind==='plan'&&(latest.contextSnapshot as Record<string,unknown>)?.createItems)throw new DomainError('PLAN_ALREADY_APPLIED','A entrevista já criou itens. Continue a conversa antes de concluir novamente.',409);
      const repositories=await tx.repository.findMany({where:{links:{some:{itemId:project.id}}},select:{id:true,key:true,name:true},take:20});
      const snapshot={contextId:project.id,kind:'project',name:project.name,description:project.description.slice(0,1000),version:project.version,repositories,fingerprint:await projectFingerprint(tx,project.id),createItems:true};
      const turn=await tx.chatTurn.create({data:{sessionId:session.id,sequence:session.nextTurn,kind:'plan',input:`Concluir entrevista e criar épicos, histórias e tarefas no Projeto ${project.name}.`,actorId:person.id,actorName:person.name,contextSnapshot:snapshot}});
      await tx.chatSession.update({where:{id:session.id},data:{version:{increment:1},nextTurn:{increment:1}}});
      await h.event(tx,source,person,'ASSISTANT_COMPLETION_REQUESTED','Usuário concluiu a entrevista e solicitou criação pela assistente.',{turnId:turn.id,projectId:project.id});
      return {turn};
    });
  });
  app.post('/api/assistant/plans',async request=>{
    const body=z.object({contextId:z.string().min(1),expectedVersion:z.number().int().min(0)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!h.llm)throw new DomainError('LLM_NOT_CONFIGURED','Modelo local não configurado.',503);
      const item=await context(tx,body.contextId);if(item.kind!=='project')throw new DomainError('PROJECT_REQUIRED','Abra o Projeto de destino antes de gerar um plano.');await h.ensureNotArchived(tx,item);
      const session=await tx.chatSession.findUnique({where:{contextId:item.id}});
      if(!session||!await tx.chatTurn.count({where:{sessionId:session.id,status:'succeeded',kind:'chat'}}))throw new DomainError('INTERVIEW_REQUIRED','Converse com a assistente sobre seu objetivo antes de gerar o plano.',409);
      if(session.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A conversa foi atualizada; revise antes de gerar.',409);
      if(await tx.chatTurn.count({where:{sessionId:session.id,status:{in:['queued','running']}}}))throw new DomainError('CHAT_BUSY','Aguarde ou cancele a geração pendente.',409);
      const repositories=await tx.repository.findMany({where:{links:{some:{itemId:item.id}}},select:{id:true,key:true,name:true},take:20});
      const snapshot={contextId:item.id,kind:'project',name:item.name,description:item.description.slice(0,1000),version:item.version,repositories,fingerprint:await projectFingerprint(tx,item.id)};
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
      const allowed=await tx.itemRepository.findMany({where:{itemId:item.id}});
      if(!validatePlanScope(body.content,allowed.map(r=>r.repositoryId)))throw new DomainError('INVALID_REPOSITORY_SCOPE','Repositórios fora do escopo do Projeto ou da História.',409);
      const version=proposal.version+1;
      const changed=await tx.planProposal.update({where:{id:proposal.id},data:{content:body.content,version}});
      await tx.planRevision.create({data:{proposalId:proposal.id,version,content:body.content,source:'human',actorId:person.id,actorName:person.name}});
      await h.event(tx,item,person,'PLAN_REVISED','Nova revisão humana da proposta registrada.',{proposalId:proposal.id,version});return {proposal:changed};
    });
  });
  app.post<{Params:{id:string}}>('/api/assistant/plans/:id/apply',async request=>{
    const body=z.object({expectedVersion:z.number().int().positive(),expectedProjectVersion:z.number().int().positive(),expectedSessionVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
    return h.mutate(request,async(tx,person)=>{
      if(!['admin','product_owner'].includes(person.role))throw new DomainError('ROLE_DENIED','Aplicar plano exige Admin ou Product Owner.',403);
      const proposal=await tx.planProposal.findUnique({where:{id:request.params.id},include:{turn:{include:{session:true}}}});
      if(!proposal)throw new DomainError('PLAN_NOT_FOUND','Proposta não encontrada.',404);
      if(proposal.status==='applied')throw new DomainError('PLAN_ALREADY_APPLIED','Esta proposta já foi aplicada. Consulte os itens criados.',409);
      const item=await h.live(tx,proposal.projectId);await h.ensureNotArchived(tx,item);
      if(proposal.version!==body.expectedVersion||proposal.projectVersion!==body.expectedProjectVersion||proposal.sessionVersion!==body.expectedSessionVersion||item.version!==proposal.projectVersion||proposal.turn.session.version!==proposal.sessionVersion||await projectFingerprint(tx,item.id)!==proposal.contextFingerprint)throw new DomainError('PLAN_STALE','Proposta ou contexto alterado. Revise a conversa e gere uma nova proposta; nenhum item foi criado.',409);
      const plan=planSchema.parse(proposal.content);const allowed=await tx.itemRepository.findMany({where:{itemId:item.id}});
      if(!validatePlanScope(plan,allowed.map(r=>r.repositoryId)))throw new DomainError('INVALID_REPOSITORY_SCOPE','Repositórios fora do escopo.',409);
      const ids=await createPlanItems(tx,h,person,item.id,plan,proposal.id,proposal.version,proposal.turnId);
      const changed=await tx.planProposal.update({where:{id:proposal.id},data:{status:'applied',appliedItemIds:ids}});
      await tx.item.update({where:{id:item.id},data:{version:{increment:1}}});
      await h.event(tx,item,person,'PLAN_APPLIED','Plano revisado aplicado ao planejamento; sem aprovar ou iniciar execução.',{proposalId:proposal.id,revision:proposal.version,itemIds:ids});
      return {proposal:changed,itemIds:ids};
    });
  });
}

export async function createPlanItems(tx:Transaction,h:AssistantHelpers,person:Parameters<AssistantHelpers['canPlan']>[0],projectId:string,plan:Plan,proposalId:string,revision:number,turnId:string){
      const ids:string[]=[];const source={planProposalId:proposalId,planRevision:revision,sourceTurnId:turnId};
      for(const epic of plan.epics){
        const e=await h.createItem(tx,person,{kind:'epic',parentId:projectId,name:epic.title,description:epic.description},source);ids.push(e.id);
        for(const story of epic.stories){
          const description=story.description+'\n\nCritérios de aceite:\n'+story.acceptanceCriteria.map(c=>'• '+c).join('\n');
          const s=await h.createItem(tx,person,{kind:'story',parentId:e.id,name:story.title,description,repositoryIds:story.repositoryIds},source);ids.push(s.id);
          await tx.item.update({where:{id:s.id},data:{data:{...source,acceptanceCriteria:story.acceptanceCriteria}}});
          for(const task of story.tasks){const t=await h.createItem(tx,person,{kind:'task',parentId:s.id,name:task.title,description:task.description,repositoryIds:task.repositoryIds},source);ids.push(t.id);}
        }
      }

  return ids;
}
