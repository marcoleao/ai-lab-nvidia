import {repositoriesOfSystem} from './system-repository.ts';
import type {Persona} from '@sdlc/shared';
import type {Item,Prisma} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import type {AuditOptions} from './audit.ts';
import {DomainError} from './errors.ts';
import {createHash} from 'node:crypto';
import {recordAudit} from './audit.ts';
import {pipelineStages,pipelineTasks,type PipelineStage} from '../../../packages/shared/src/pipeline-plan.ts';
export {pipelineStages,pipelineTasks,type PipelineStage} from '../../../packages/shared/src/pipeline-plan.ts';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function pipelineStageOf(item:{kind?:string;data:unknown}):PipelineStage|null{
 const stage=record(item.data).pipelineStage;
 return (!item.kind||item.kind==='task')&&typeof stage==='string'&&pipelineStages.includes(stage as PipelineStage)?stage as PipelineStage:null;
}
export const isPipelineTask=(item:{kind?:string;data:unknown})=>pipelineStageOf(item)!==null;

/** Called only by an explicit creation/preparation transaction, never by GET.
 * The caller owns the same hierarchy/idempotency lock as Story creation. */
export async function ensurePipelineTasks(tx:Transaction,story:Item,person:{id:string;name:string},createTask:AssistantHelpers['createItem'],creationAudit:AuditOptions={}){
 if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','O planejamento do pipeline pertence a uma História.',409);
 const children=await tx.item.findMany({where:{parentId:story.id,kind:'task',archived:false},orderBy:[{createdAt:'asc'},{id:'asc'}]});
 const repositories=(await repositoriesOfSystem(tx,story)).map(repository=>({repositoryId:repository.id}));
 const activities=await tx.workActivity.findMany({where:{storyId:story.id,kind:{in:[...pipelineStages]},...(repositories.length===1?{repositoryId:repositories[0].repositoryId}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}]});
 const result:Item[]=[];
 for(const definition of pipelineTasks){
  const matches=children.filter(task=>pipelineStageOf(task)===definition.stage);
  if(matches.length>1)throw new DomainError('PIPELINE_TASK_CONFLICT','Existe mais de uma Tarefa para a mesma etapa do pipeline. Revise o planejamento antes de continuar.',409);
  const linkedIds=[...new Set(activities.filter(activity=>activity.kind===definition.stage&&activity.taskId).map(activity=>activity.taskId!))];
  const legacy=children.filter(task=>linkedIds.includes(task.id)&&!pipelineStageOf(task)&&!!record(task.data).workProcess);
  if(legacy.length>1||legacy.length&&matches.length||linkedIds.some(id=>matches.length&&id!==matches[0].id))throw new DomainError('PIPELINE_TASK_MIGRATION_REVIEW','Há Tarefas de execução anteriores que conflitam com o planejamento padrão. Preserve os registros e revise a associação antes de continuar.',409);
  if(matches[0]){result.push(matches[0]);continue;}
  if(legacy[0]){
   const task=legacy[0],activity=activities.find(activity=>activity.kind===definition.stage&&activity.taskId===task.id)!;
   const adopted=await tx.item.update({where:{id:task.id},data:{version:{increment:1},data:JSON.parse(JSON.stringify({...record(task.data),workProcess:true,pipelineStage:definition.stage,pipelineAdopted:{activityId:activity.id,repositoryId:activity.repositoryId}})) as Prisma.InputJsonValue}});
   await recordAudit(tx,adopted,{id:'system:pipeline',name:'Planejamento padrão do pipeline'},'PIPELINE_TASK_ADOPTED','Tarefa de execução existente associada à etapa padrão; identidade, conteúdo, resultados e tentativas preservados.',{pipelineStage:definition.stage,activityId:activity.id},'system',{...creationAudit,executor:{id:'system:pipeline',name:'Planejamento padrão do pipeline',type:'system'},initiator:{id:person.id,name:person.name,type:'human'},before:{pipelineStage:record(task.data).pipelineStage,version:task.version},after:{pipelineStage:definition.stage,version:adopted.version}});
   result.push(adopted);continue;
  }
  const created=await createTask(tx,person as Persona,{kind:'task',parentId:story.id,name:definition.name,description:definition.description},{creationOrigin:'pipeline',pipelineStage:definition.stage,workProcess:'true',workKind:definition.stage},{...creationAudit,executor:{id:'system:pipeline',name:'Planejamento padrão do pipeline',type:'system'},initiator:creationAudit.initiator??{...person,type:'human'}});
  const changed=await tx.item.update({where:{id:created.id},data:{data:JSON.parse(JSON.stringify({...record(created.data),workProcess:true,pipelineStage:definition.stage,creationOrigin:'pipeline'})) as Prisma.InputJsonValue}});
  result.push(changed);
 }
 return result;
}

async function captureDescription(tx:Transaction,item:Item){
 const id=`${item.id}:${item.version}`,digest=createHash('sha256').update(item.description).digest('hex');
 await tx.$executeRaw`INSERT INTO "ItemAuditRevision" (id,"itemId",version,description,digest) VALUES (${id},${item.id},${item.version},${item.description},${digest}) ON CONFLICT ("itemId",version) DO NOTHING`;
 const [saved]=await tx.$queryRaw<{digest:string}[]>`SELECT digest FROM "ItemAuditRevision" WHERE id=${id}`;
 if(!saved||saved.digest!==digest)throw new DomainError('AUDIT_REVISION_CONFLICT','O detalhamento diverge da revisão preservada da Tarefa.',409);
 return id;
}

/** A proposal describes the existing pipeline Task; it never substitutes its
 * stable stage identity or overwrites the description revision created earlier. */
export async function applyPipelineTaskPlan(tx:Transaction,h:AssistantHelpers,task:Item,person:Persona,plan:{title:string;description:string;repositoryIds:string[]},creationAudit:AuditOptions={}){
 if(!isPipelineTask(task))throw new DomainError('PIPELINE_TASK_REQUIRED','Selecione a Tarefa padrão correspondente à etapa.',409);
 const beforeLinks=await tx.itemRepository.findMany({where:{itemId:task.id},select:{repositoryId:true}});
 const previous=beforeLinks.map(link=>link.repositoryId).sort(),desired=previous;
 if(task.name===plan.title&&task.description===plan.description&&JSON.stringify(desired)===JSON.stringify(previous))return task;
 const beforeRevision=await captureDescription(tx,task);
 const changed=await tx.item.update({where:{id:task.id},data:{name:plan.title,description:plan.description,version:{increment:1}}});
 // Repository ownership is inherited; preserve legacy rows instead of turning
 // a plan edit into a destination change.
 const afterRevision=await captureDescription(tx,changed);
 const executor=creationAudit.executor??person;
 await h.event(tx,changed,executor,'ITEM_UPDATED','Planejamento aplicado à própria Tarefa do pipeline; identidade da etapa preservada.',{},creationAudit.executor?.type??'human',{...creationAudit,before:{name:task.name,descriptionRevision:beforeRevision,version:task.version,repositoryIds:previous},after:{name:changed.name,descriptionRevision:afterRevision,version:changed.version,repositoryIds:desired}});
 return changed;
}
