/** Browser-safe planning metadata. Import this module directly from the web;
 * the package entry point also exports server-side validation dependencies. */
export const pipelineStages=['coding','test','code_review','security_scan','final_test','merge'] as const;
export type PipelineStage=typeof pipelineStages[number];
export const pipelineTasks:ReadonlyArray<{stage:PipelineStage;name:string;description:string}>=[
 {stage:'coding',name:'Codificação',description:'Implementar o escopo aprovado no G1 e publicar o código com commit, branch e Merge Request em rascunho. Registrar resultado e evidências nesta Tarefa.'},
 {stage:'test',name:'Teste',description:'Registrar o planejamento, as tentativas, o resultado e as evidências dos testes desta etapa. O executor desta etapa será definido na revisão posterior à codificação.'},
 {stage:'code_review',name:'Revisão de Código',description:'Registrar a revisão de código, seus achados e a evidência aplicável à revisão analisada.'},
 {stage:'security_scan',name:'Revisão de Segurança',description:'Registrar a análise de segurança, seus achados e a evidência aplicável à revisão analisada.'},
 {stage:'final_test',name:'Teste Final',description:'Registrar o planejamento, as tentativas, o resultado e as evidências do teste final. O executor desta etapa será definido na revisão posterior à codificação.'},
 {stage:'merge',name:'Merge de Código',description:'Registrar as tentativas e a confirmação da integração do código no GitLab. Integração não conclui a História nem promove uma release.'},
];
export const planLimits={maxEpics:3,maxStoriesPerEpic:3,maxTaskDetailsPerStory:12,maxItems:30,maxBytes:40000} as const;

type CountablePlan={epics:readonly {stories:readonly {tasks?:readonly {pipelineStage?:PipelineStage}[]}[]}[]};
/** Standard stage details update the six fixed Tasks; only untagged Tasks add
 * another item. This matches materialization, including stories with tasks:[]. */
export function materializedPlanCounts(plan:CountablePlan){
 const epics=plan.epics.length;
 let stories=0,additionalTasks=0;
 for(const epic of plan.epics)for(const story of epic.stories){
  stories++;
  additionalTasks+=(story.tasks??[]).filter(task=>!task.pipelineStage).length;
 }
 const standardTasks=stories*pipelineStages.length,tasks=standardTasks+additionalTasks;
 return {epics,stories,tasks,pipelineTasks:standardTasks,additionalTasks,total:epics+stories+tasks};
}
