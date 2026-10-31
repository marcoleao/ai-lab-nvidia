import {test,expect,vi} from 'vitest';
import {planSchema} from '../apps/api/src/plan-schema.ts';
import {parsePlan,completePlan,PlanGenerationFailure} from '../apps/api/src/plans.ts';
import type {LLMProvider} from '../apps/api/src/llm.ts';
import {requirePlanningDependencies,currentSpecificationReadiness} from '../apps/api/src/planning-dependencies.ts';
import {storySpecificationContentSchema} from '../apps/api/src/story-specifications.ts';
import type {Transaction} from '../packages/db/client.ts';
import type {Item} from '../packages/db/generated/client.ts';
const story=(id:string,facts:number[],dependsOn:string[]=[])=>({title:'Capacidade '+id,description:'Uma capacidade completa e verificável.',acceptanceCriteria:['A operação confirma o resultado e preserva os dados.'],repositoryIds:[],tasks:[],deliverySlice:{id,outcome:'Resultado de usuário verificável',rationale:'Capacidade vertical pequena, preservando os outros comportamentos.',sourceFacts:facts,dependsOn}});
const plan=()=>({summary:'Incrementos preservando a entrevista.',planningFacts:['Cadastrar classificações.','Consultar catálogo.'],epics:[{title:'Catálogo',description:'Capacidades incrementais.',stories:[story('classifications',[0]),story('catalog',[1],['classifications'])]}]});
const draft=()=>{
 const {planningFacts,...value}=plan();
 return {...value,epics:value.epics.map(e=>({...e,stories:e.stories.map((s,i)=>({...s,deliverySlice:{outcome:s.deliverySlice.outcome,rationale:s.deliverySlice.rationale,dependsOn:i?[0]:[]}}))}))};
};
const binding=()=>({bindings:{'0':{'slice-1':true,'slice-2':false},'1':{'slice-1':false,'slice-2':true}}});
const mappingRow=(map:any,key:string)=>({bindings:{[key]:map.bindings[key]}});
const provider=(value:unknown,map:unknown=binding())=>{const complete=vi.fn(async(_messages:any,options:any)=>{const key=options.schema?.properties?.bindings?.required?.[0];return {model:'isolated',content:JSON.stringify(key===undefined?value:mappingRow(map,key))};});return {model:'isolated',models:async()=>[],complete};};
test('stable slice graph and all confirmed fact references survive plan parsing',()=>{const value=planSchema.parse(plan());value.epics[0].stories.reverse();expect(planSchema.parse(value).epics[0].stories[0].deliverySlice?.dependsOn).toEqual(['classifications']);});
test('duplicate IDs, missing dependencies, cycles and lost coverage are refused',()=>{for(const change of [(p:ReturnType<typeof plan>)=>p.epics[0].stories[1].deliverySlice.id='classifications',(p:ReturnType<typeof plan>)=>p.epics[0].stories[1].deliverySlice.dependsOn=['absent'],(p:ReturnType<typeof plan>)=>p.epics[0].stories[0].deliverySlice.dependsOn=['catalog'],(p:ReturnType<typeof plan>)=>p.epics[0].stories[1].deliverySlice.sourceFacts=[]]){const value=plan();change(value);expect(planSchema.safeParse(value).success).toBe(false);}});
test('source facts come from the captured interview and omissions cannot materialize',()=>{const value=plan();delete (value as {planningFacts?:string[]}).planningFacts;expect(parsePlan(JSON.stringify(value),[],false,['Cadastrar classificações.','Consultar catálogo.']).planningFacts).toHaveLength(2);expect(()=>parsePlan(JSON.stringify(value),[],false,['Cadastrar classificações.','Consultar catálogo.','Não omitir arquivamento.'])).toThrow(/preservar/);});

test('generation assigns identities and binds facts only through explicit booleans for existing story IDs',async()=>{
 const first=draft(),llm=provider(first),facts=['Manter classificações existentes.','Consultar catálogo com filtros.'];
 const result=await completePlan(llm,[{role:'system',content:'Planeje o escopo confirmado'},{role:'user',content:'Escopo confirmado'}],[],false,facts);
 expect(result.plan.planningFacts).toEqual(facts);expect(llm.complete).toHaveBeenCalledTimes(3);expect(result.plan.epics[0].stories.map(s=>s.acceptanceCriteria)).toEqual(first.epics[0].stories.map(s=>s.acceptanceCriteria));
 expect(result.plan.epics[0].stories.map(s=>s.deliverySlice)).toEqual([expect.objectContaining({id:'slice-1',sourceFacts:[0],dependsOn:[]}),expect.objectContaining({id:'slice-2',sourceFacts:[1],dependsOn:['slice-1']})]);
 const schema=llm.complete.mock.calls[0][1].schema,strict=schema.anyOf[0].properties.epics.items.properties.stories.items;expect(strict.required).toContain('deliverySlice');expect(strict.properties.tasks.maxItems).toBe(0);expect(schema.anyOf[0].properties).not.toHaveProperty('planningFacts');expect(strict.properties.deliverySlice.properties).not.toHaveProperty('id');expect(strict.properties.deliverySlice.properties).not.toHaveProperty('sourceFacts');
 const mapping=llm.complete.mock.calls[1][1].schema.properties.bindings;expect(mapping.required).toEqual(['0']);expect(mapping.properties['0'].required).toEqual(['slice-1','slice-2']);expect(mapping.properties['0'].properties['slice-1'].type).toBe('boolean');expect('sources' in result&&result.sources?.factMapping).toBe(JSON.stringify(binding()));
 expect(JSON.stringify(llm.complete.mock.calls[1][0])).toContain(facts[0]);expect(JSON.stringify(llm.complete.mock.calls[1][0])).not.toContain(facts[1]);expect(llm.complete.mock.calls[2][1].schema.properties.bindings.required).toEqual(['1']);expect(result.sources.factRows).toHaveLength(2);
});

test('false coverage and invented story identities remain refused; genuine interview decisions are not retried',async()=>{
 for(const map of [{bindings:{'0':{'slice-1':true,'slice-2':true},'1':{'slice-1':false,'slice-2':false}}},{bindings:{'0':{'ghost':true},'1':{'ghost':true}}}]){
  const incomplete=draft(),llm=provider(incomplete,map);
  try{await completePlan(llm,[],[],false,['Primeiro fato','Segundo fato']);throw Error('Expected refusal');}catch(error){expect(error).toMatchObject({code:'PLAN_SLICE_COVERAGE',candidate:JSON.stringify(incomplete)});const attempts=(error as PlanGenerationFailure).sources!.attempts!;expect(attempts).toHaveLength(2);expect(attempts.every(a=>a.draft===JSON.stringify(incomplete)&&a.factRows!.length>=1)).toBe(true);expect(attempts[0].factRows![0].content).toBe(JSON.stringify(mappingRow(map,'0')));}expect(llm.complete.mock.calls.length).toBeLessThanOrEqual(6);
 }
 const llm=provider({error:'É necessária uma decisão de escopo.'});await expect(completePlan(llm,[],[],false,['Fato'])).rejects.toMatchObject({code:'INTERVIEW_INCOMPLETE'});expect(llm.complete).toHaveBeenCalledTimes(1);
});

test('captured facts are validated instead of an empty or invented model-owned source',()=>{
 const value=plan();value.planningFacts=[];const result=parsePlan(JSON.stringify(value),[],false,['Fato real A','Fato real B']);expect(result.planningFacts).toEqual(['Fato real A','Fato real B']);expect(result.epics[0].stories[1].deliverySlice.sourceFacts).toEqual([1]);
});

test('per-fact work keeps the existing fact limit and shared deadline before calling another model',async()=>{
 const llm=provider(draft());await expect(completePlan(llm,[],[],false,Array.from({length:21},(_,i)=>'Fato '+i))).rejects.toMatchObject({code:'PLAN_SLICE_COVERAGE'});expect(llm.complete).not.toHaveBeenCalled();
 const timeout=vi.spyOn(AbortSignal,'timeout').mockReturnValue(AbortSignal.abort());
 try{await expect(completePlan(llm,[],[],false,['Fato'])).rejects.toMatchObject({code:'PLAN_INVALID_RESPONSE'});expect(llm.complete).not.toHaveBeenCalled();}finally{timeout.mockRestore();}
});

test('shared constraints can reference several stories and visual order creates no implicit dependency',async()=>{
 const value=draft();value.epics[0].stories[1].deliverySlice.dependsOn=[];
 const llm=provider(value,{bindings:{'0':{'slice-1':true,'slice-2':true},'1':{'slice-1':true,'slice-2':false},'2':{'slice-1':false,'slice-2':true}}});const result=await completePlan(llm,[],[],false,['Preservar aplicação e dados existentes.','Classificações','Consulta']);
 expect(llm.complete).toHaveBeenCalledTimes(4);expect(result.plan.epics[0].stories.map(s=>s.deliverySlice?.sourceFacts)).toEqual([[0,1],[0,2]]);expect(result.plan.epics[0].stories.map(s=>s.deliverySlice?.dependsOn)).toEqual([[],[]]);
});

test('self and future prerequisites are refused instead of silently redirected',async()=>{
 for(const index of [0,1,20]){const value=draft();value.epics[0].stories[0].deliverySlice.dependsOn=[index];const llm=provider(value);await expect(completePlan(llm,[],[],false,['A','B'])).rejects.toMatchObject({code:'PLAN_INVALID_RESPONSE'});expect(llm.complete).toHaveBeenCalledTimes(2);}
});

test('an uncovered capability is redrafted by the model, never completed by fabricated references',async()=>{
 const full=draft(),partial={...full,epics:[{...full.epics[0],stories:[full.epics[0].stories[0]]}]},missing={bindings:{'0':{'slice-1':true},'1':{'slice-1':false}}};
 const complete=vi.fn().mockResolvedValueOnce({model:'isolated',content:JSON.stringify(partial)}).mockResolvedValueOnce({model:'isolated',content:JSON.stringify(mappingRow(missing,'0'))}).mockResolvedValueOnce({model:'isolated',content:JSON.stringify(mappingRow(missing,'1'))}).mockResolvedValueOnce({model:'isolated',content:JSON.stringify(full)}).mockResolvedValueOnce({model:'isolated',content:JSON.stringify(mappingRow(binding(),'0'))}).mockResolvedValueOnce({model:'isolated',content:JSON.stringify(mappingRow(binding(),'1'))});
 const result=await completePlan({model:'isolated',models:async()=>[],complete},[{role:'system',content:'Planeje o escopo completo'},{role:'user',content:'Classificações e consulta'}],[],false,['Classificações','Consulta']);
 expect(complete).toHaveBeenCalledTimes(6);expect(complete.mock.calls[3][0].at(-1).content).toContain('missingFactIndexes');expect(result.plan.epics[0].stories).toHaveLength(2);expect(result.plan.epics[0].stories.map(s=>s.acceptanceCriteria)).toEqual(full.epics[0].stories.map(s=>s.acceptanceCriteria));expect(result.sources.attempts).toMatchObject([{draft:JSON.stringify(partial),factMapping:JSON.stringify(missing)},{draft:JSON.stringify(full),factMapping:JSON.stringify(binding())}]);expect(complete.mock.calls[5][1].signal).toBe(complete.mock.calls[0][1].signal);
});

test('invalid JSON preserves the unvalidated candidate outside public error details',async()=>{
 const complete=vi.fn(async()=>({model:'isolated',content:'{invalid'}));try{await completePlan({model:'isolated',models:async()=>[],complete},[],[],false,['Fato']);throw Error('Expected refusal');}catch(error){expect(error).toBeInstanceOf(PlanGenerationFailure);expect((error as PlanGenerationFailure).candidate).toBe('{invalid');expect((error as PlanGenerationFailure).details??{}).not.toHaveProperty('candidate');}
});

test('one criteria list materializes the persisted requirement without changing model decisions',async()=>{
 const value=draft(),functional=['Aceite A com resultado verificável.','Aceite B com dados preservados.'];
 const story=value.epics[0].stories[0] as typeof value.epics[0]['stories'][0]&{requirements?:Record<string,unknown>};story.acceptanceCriteria=functional;story.requirements={version:1,objective:'Corrigir cadastro existente.',behavior:'Aplicar a correção pequena sem apagar dados.'};
 const llm=provider(value),result=await completePlan(llm,[],[],true,['Fato A','Fato B']);
 const saved=result.plan.epics[0].stories[0];expect(saved.acceptanceCriteria).toEqual(functional);expect(saved.requirements?.functionalCriteria).toEqual(functional);expect(saved.requirements?.behavior).toBe(story.requirements.behavior);expect(llm.complete).toHaveBeenCalledTimes(3);expect(llm.complete.mock.calls[0][1].schema.anyOf[0].properties.epics.items.properties.stories.items.properties.requirements.properties).not.toHaveProperty('functionalCriteria');
});
const technical={requirements:'Implementar o resultado aprovado.',architecture:'Usar os módulos existentes da aplicação.',testCases:[{criterionIndex:0,description:'Conferir a operação por interface.'}],risks:[]};
const content=()=>storySpecificationContentSchema.parse({requirements:{objective:'Consultar o catálogo com classificações.',behavior:'Mostrar os dados já cadastrados.',functionalCriteria:['Mostrar a classificação.'],dependencies:[{description:'Integrar classificação',kind:'internal',status:'pending',impact:'blocking',reference:'story:prior'}]},technical});
function fixture(){const current={id:'current',parentId:'epic-current'} as Item;const before={id:'prior',name:'Cadastrar classificações',kind:'story',status:'testing',archived:false,parent:{parentId:'project'},data:{developmentCycleId:'cycle-1'}};const run={id:'run',state:'succeeded',commitSha:'a'.repeat(40),snapshot:{developmentCycleId:'cycle-1'},repositoryId:'repository'};const merge={id:'merge',state:'succeeded',sha:run.commitSha,targetBranch:'main',projectId:1};const integration={integrationSha:'b'.repeat(40),executionId:'run',sourceSha:run.commitSha,repositoryId:'repository',targetBranch:'main',projectId:1};const tx={item:{findUnique:async({where}:{where:{id:string}})=>where.id==='epic-current'?{parentId:'project'}:before},storyExecution:{findFirst:async()=>run},mergeOperation:{findUnique:async()=>merge},mergeIntegrationReference:{findUnique:async()=>integration}} as unknown as Transaction;return {current,before,run,merge,integration,tx};}
test('pending linked dependency is resolved by current integration proof without rewriting specification',async()=>{const f=fixture(),source=content(),before=JSON.stringify(source);await expect(requirePlanningDependencies(f.tx,f.current,source,'main')).resolves.toBeUndefined();expect((await currentSpecificationReadiness(f.tx,f.current,source,'main')).canApprove).toBe(true);expect(JSON.stringify(source)).toBe(before);expect(source.requirements.dependencies[0].status).toBe('pending');});
test('absence, another project/branch, new cycle and unconfirmed merge block coding with next action',async()=>{for(const change of [(f:ReturnType<typeof fixture>)=>f.merge.state='tracking',(f:ReturnType<typeof fixture>)=>f.integration.integrationSha='',(f:ReturnType<typeof fixture>)=>f.before.parent.parentId='other-project',(f:ReturnType<typeof fixture>)=>f.before.data.developmentCycleId='cycle-2',(f:ReturnType<typeof fixture>)=>f.merge.targetBranch='other']){const f=fixture();change(f);await expect(requirePlanningDependencies(f.tx,f.current,content(),'main')).rejects.toMatchObject({code:'PLANNING_DEPENDENCY_PENDING'});expect((await currentSpecificationReadiness(f.tx,f.current,content(),'main')).canApprove).toBe(false);}});
test('manual confirmed label cannot bypass a linked prerequisite; informative link does not gate',async()=>{const f=fixture();f.merge.state='tracking';const source=content();source.requirements.dependencies[0].status='confirmed';await expect(requirePlanningDependencies(f.tx,f.current,source)).rejects.toMatchObject({code:'PLANNING_DEPENDENCY_PENDING'});source.requirements.dependencies[0].impact='informative';await expect(requirePlanningDependencies(f.tx,f.current,source)).resolves.toBeUndefined();});
