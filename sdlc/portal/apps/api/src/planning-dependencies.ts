import type {Transaction} from '../../../packages/db/client.ts';
import type {Item} from '../../../packages/db/generated/client.ts';
import type {StorySpecificationContent} from './story-specifications.ts';
import {DomainError} from './errors.ts';
import {requireCodingDependencies,specificationReadiness} from './story-specifications.ts';
import {executionCycleCurrent} from './development-cycle.ts';

/** Query current integration proof; never rewrite a confirmed specification
 * or infer readiness from visual order, textual status or a history page. */
export async function requirePlanningDependencies(tx:Transaction,story:Item,content:StorySpecificationContent,targetBranch?:string){
 const dependencies=content.requirements.dependencies??[];const linked=dependencies.filter(d=>d.impact==='blocking'&&/^story:[a-zA-Z0-9_-]+$/.test(d.reference??''));
 requireCodingDependencies({...content,requirements:{...content.requirements,dependencies:dependencies.filter(d=>!linked.includes(d))}});
 if(!linked.length)return;
 const parent=await tx.item.findUnique({where:{id:story.parentId!},select:{parentId:true}});
 for(const dependency of linked){
  const id=dependency.reference!.slice(6),before=await tx.item.findUnique({where:{id},include:{parent:{select:{parentId:true}}}});
  const label=before?.name??'História referenciada';
  const blocked=()=>new DomainError('PLANNING_DEPENDENCY_PENDING',`Integre primeiro “${label}” no destino DEV. Abra essa História e conclua sua revisão, segurança e Merge Request; depois retome esta História.`,409,{prerequisiteId:id});
  if(id===story.id||!before||before.kind!=='story'||before.archived||before.status==='canceled'||!parent?.parentId||before.parent?.parentId!==parent.parentId)throw blocked();
  const run=await tx.storyExecution.findFirst({where:{storyId:id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if(!run||run.state!=='succeeded'||!executionCycleCurrent(run.snapshot,before.data)||!run.commitSha)throw blocked();
  const merge=await tx.mergeOperation.findUnique({where:{executionId:run.id}});
  if(!merge||merge.state!=='succeeded'||merge.sha!==run.commitSha||targetBranch&&merge.targetBranch!==targetBranch)throw blocked();
  const integration=await tx.mergeIntegrationReference.findUnique({where:{operationId:merge.id}});
  if(!integration?.integrationSha||integration.executionId!==run.id||integration.sourceSha!==run.commitSha||integration.repositoryId!==run.repositoryId||integration.targetBranch!==merge.targetBranch||integration.projectId!==merge.projectId)throw blocked();
 }
}
export async function currentSpecificationReadiness(tx:Transaction,story:Item,content:StorySpecificationContent,targetBranch?:string){
 const linked=content.requirements.dependencies.filter(d=>d.impact==='blocking'&&/^story:[a-zA-Z0-9_-]+$/.test(d.reference??''));
 if(!linked.length)return specificationReadiness(content);
 const result=specificationReadiness({...content,requirements:{...content.requirements,dependencies:content.requirements.dependencies.filter(d=>!linked.includes(d))}});
 try{await requirePlanningDependencies(tx,story,content,targetBranch);}catch(error){if(!(error instanceof DomainError))throw error;result.canApprove=false;if(error.code==='PLANNING_DEPENDENCY_PENDING'){const id=(error.details as {prerequisiteId?:string})?.prerequisiteId;result.blockingDependencies.push(...linked.filter(d=>d.reference==='story:'+id));}result.missing.push(error.message);}
 return result;
}
