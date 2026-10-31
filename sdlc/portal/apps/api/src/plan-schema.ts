import {z} from 'zod';
import {requirementsSchema} from './requirements.ts';
import {pipelineStages,planLimits,materializedPlanCounts} from '../../../packages/shared/src/pipeline-plan.ts';
const title=z.string().trim().min(1).max(120);
const description=z.string().trim().max(2000);
// Legacy assignment fields remain readable; execution inherits the System repo.
const repositories=z.array(z.string().min(1)).max(20).default([]);
const task=z.object({title,description,repositoryIds:repositories,pipelineStage:z.enum(pipelineStages).optional()}).strict();
const sliceId=z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100);
export const deliverySliceSchema=z.object({id:sliceId,outcome:z.string().trim().min(1).max(600),rationale:z.string().trim().min(1).max(600),dependsOn:z.array(sliceId).max(12),sourceFacts:z.array(z.number().int().min(0).max(19)).max(20)}).strict();
const story=z.object({title,description,acceptanceCriteria:z.array(z.string().trim().min(1).max(500)).min(1).max(12),requirements:requirementsSchema.optional(),deliverySlice:deliverySliceSchema.optional(),repositoryIds:repositories,tasks:z.array(task).max(planLimits.maxTaskDetailsPerStory).default([])}).strict().superRefine((story,ctx)=>{
 const stages=story.tasks.flatMap(task=>task.pipelineStage?[task.pipelineStage]:[]);
 if((story.requirements?.dependencies.length??0)+(story.deliverySlice?.dependsOn.length??0)>12)ctx.addIssue({code:'custom',message:'Use até 12 dependências por História, incluindo os pré-requisitos do recorte.'});
 if(new Set(stages).size!==stages.length)ctx.addIssue({code:'custom',message:'Cada etapa do pipeline pode ser detalhada apenas uma vez por História.'});
});
const epic=z.object({title,description,stories:z.array(story).min(1).max(planLimits.maxStoriesPerEpic)}).strict();
export const planSchema=z.object({summary:z.string().trim().min(1).max(2000),planningFacts:z.array(z.string().trim().min(1).max(300)).max(20).optional(),epics:z.array(epic).min(1).max(planLimits.maxEpics)}).strict().superRefine((plan,ctx)=>{
  if(materializedPlanCounts(plan).total>planLimits.maxItems)ctx.addIssue({code:'custom',message:'Limite de 30 itens por proposta.'});
  if(Buffer.byteLength(JSON.stringify(plan))>planLimits.maxBytes)ctx.addIssue({code:'custom',message:'Proposta excede o tamanho permitido.'});
  for(const message of planSliceIssues(plan))ctx.addIssue({code:'custom',message});
});
/** Graph validation is independent of visual order. Mapping attests coverage
 * references, never semantic correctness of the model's interpretation. */
export function planSliceIssues(plan:{planningFacts?:string[];epics:{stories:{deliverySlice?:z.infer<typeof deliverySliceSchema>}[]}[]}){
 const stories=plan.epics.flatMap(e=>e.stories),slices=stories.flatMap(s=>s.deliverySlice?[s.deliverySlice]:[]),byId=new Map(slices.map(s=>[s.id,s])),issues:string[]=[];
 if(byId.size!==slices.length)issues.push('Identificadores dos recortes devem ser únicos.');
 for(const slice of slices){if(new Set(slice.dependsOn).size!==slice.dependsOn.length||new Set(slice.sourceFacts).size!==slice.sourceFacts.length)issues.push('Referências repetidas no recorte.');if(slice.dependsOn.some(id=>id===slice.id||!byId.has(id)))issues.push('Pré-requisito ausente ou apontando para a própria História.');}
 const active=new Set<string>(),done=new Set<string>();const visit=(id:string):boolean=>{if(active.has(id))return false;if(done.has(id))return true;active.add(id);for(const parent of byId.get(id)?.dependsOn??[])if(byId.has(parent)&&!visit(parent))return false;active.delete(id);done.add(id);return true;};
 if(slices.some(s=>!visit(s.id)))issues.push('Os pré-requisitos formam um ciclo.');
 if(plan.planningFacts){if(slices.length!==stories.length)issues.push('Revise o recorte de cada História da proposta.');const coverage=new Set(slices.flatMap(s=>s.sourceFacts));if([...coverage].some(i=>i>=plan.planningFacts!.length))issues.push('O recorte referencia um fato que não pertence à entrevista.');if(plan.planningFacts.some((_,i)=>!coverage.has(i)))issues.push('Há fatos confirmados sem História correspondente; preserve todo o escopo ou revise a entrevista.');}
 return issues;
}
export type Plan=z.infer<typeof planSchema>;
// Constrain decoding as well as validating the result after generation.
export const planOutputSchema={...z.toJSONSchema(z.union([planSchema,z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'} as Record<string,unknown>;
/** The first draft contains business choices, not server-owned identities. */
export function planGenerationDraftSchema(factCount=20){
 const slice=z.object({outcome:deliverySliceSchema.shape.outcome,rationale:deliverySliceSchema.shape.rationale,dependsOn:z.array(z.number().int().min(0).max(planLimits.maxItems-1)).max(12)}).strict();
 const generatedStory=z.object({...story.shape,requirements:requirementsSchema.omit({functionalCriteria:true}).optional(),deliverySlice:slice,tasks:z.array(task).max(0).default([])}).strict();
 const generatedEpic=epic.extend({stories:z.array(generatedStory).min(1).max(planLimits.maxStoriesPerEpic)});
 // The model does not own the captured source. Do not offer planningFacts as
 // an optional output field that constrained decoders may fill with [].
 return z.object({summary:planSchema.shape.summary,epics:z.array(generatedEpic).min(1).max(planLimits.maxEpics)}).strict();
}
export function planGenerationOutputSchema(factCount=0){
 if(!factCount)return planOutputSchema;
 return {...z.toJSONSchema(z.union([planGenerationDraftSchema(factCount),z.object({error:z.string().min(1).max(300)}).strict()])),type:'object'} as Record<string,unknown>;
}
export function validatePlanScope(plan:Plan,allowed:string[]){
  for(const epic of plan.epics)for(const story of epic.stories){
    if(story.repositoryIds.some(id=>!allowed.includes(id)))return false;
    for(const task of story.tasks)if(task.repositoryIds.some(id=>!allowed.includes(id)))return false;
  }
  return true;
}
