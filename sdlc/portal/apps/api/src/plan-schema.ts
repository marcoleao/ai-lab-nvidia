import {z} from 'zod';
const title=z.string().trim().min(1).max(120);
const description=z.string().trim().max(1000);
// Omitted assignment means no component selected, never an inferred repository.
const repositories=z.array(z.string().min(1)).max(20).default([]);
const task=z.object({title,description,repositoryIds:repositories}).strict();
const story=z.object({title,description,acceptanceCriteria:z.array(z.string().trim().min(1).max(200)).min(1).max(6),repositoryIds:repositories,tasks:z.array(task).min(1).max(4)}).strict();
const epic=z.object({title,description,stories:z.array(story).min(1).max(3)}).strict();
export const planSchema=z.object({summary:z.string().trim().min(1).max(2000),epics:z.array(epic).min(1).max(3)}).strict().superRefine((plan,ctx)=>{
  const count=plan.epics.reduce((sum,e)=>sum+1+e.stories.reduce((n,s)=>n+1+s.tasks.length,0),0);
  if(count>30)ctx.addIssue({code:'custom',message:'Limite de 30 itens por proposta.'});
  if(Buffer.byteLength(JSON.stringify(plan))>40000)ctx.addIssue({code:'custom',message:'Proposta excede o tamanho permitido.'});
});
export type Plan=z.infer<typeof planSchema>;
// Constrain decoding as well as validating the result after generation.
export const planOutputSchema={...z.toJSONSchema(z.union([planSchema,z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'} as Record<string,unknown>;
export function validatePlanScope(plan:Plan,allowed:string[]){
  for(const epic of plan.epics)for(const story of epic.stories){
    if(story.repositoryIds.some(id=>!allowed.includes(id)))return false;
    for(const task of story.tasks)if(task.repositoryIds.some(id=>!story.repositoryIds.includes(id)))return false;
  }
  return true;
}
