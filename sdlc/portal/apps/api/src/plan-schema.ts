import {z} from 'zod';
import {requirementsSchema} from './requirements.ts';
import {pipelineStages,planLimits,materializedPlanCounts} from '../../../packages/shared/src/pipeline-plan.ts';
const title=z.string().trim().min(1).max(120);
const description=z.string().trim().max(2000);
// Legacy assignment fields remain readable; execution inherits the System repo.
const repositories=z.array(z.string().min(1)).max(20).default([]);
const task=z.object({title,description,repositoryIds:repositories,pipelineStage:z.enum(pipelineStages).optional()}).strict();
const story=z.object({title,description,acceptanceCriteria:z.array(z.string().trim().min(1).max(500)).min(1).max(12),requirements:requirementsSchema.optional(),repositoryIds:repositories,tasks:z.array(task).max(planLimits.maxTaskDetailsPerStory).default([])}).strict().superRefine((story,ctx)=>{
 const stages=story.tasks.flatMap(task=>task.pipelineStage?[task.pipelineStage]:[]);
 if(new Set(stages).size!==stages.length)ctx.addIssue({code:'custom',message:'Cada etapa do pipeline pode ser detalhada apenas uma vez por História.'});
});
const epic=z.object({title,description,stories:z.array(story).min(1).max(planLimits.maxStoriesPerEpic)}).strict();
export const planSchema=z.object({summary:z.string().trim().min(1).max(2000),epics:z.array(epic).min(1).max(planLimits.maxEpics)}).strict().superRefine((plan,ctx)=>{
  if(materializedPlanCounts(plan).total>planLimits.maxItems)ctx.addIssue({code:'custom',message:'Limite de 30 itens por proposta.'});
  if(Buffer.byteLength(JSON.stringify(plan))>planLimits.maxBytes)ctx.addIssue({code:'custom',message:'Proposta excede o tamanho permitido.'});
});
export type Plan=z.infer<typeof planSchema>;
// Constrain decoding as well as validating the result after generation.
export const planOutputSchema={...z.toJSONSchema(z.union([planSchema,z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'} as Record<string,unknown>;
export function validatePlanScope(plan:Plan,allowed:string[]){
  for(const epic of plan.epics)for(const story of epic.stories){
    if(story.repositoryIds.some(id=>!allowed.includes(id)))return false;
    for(const task of story.tasks)if(task.repositoryIds.some(id=>!allowed.includes(id)))return false;
  }
  return true;
}
