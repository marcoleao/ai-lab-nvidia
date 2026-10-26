import {randomUUID} from 'node:crypto';
import {afterAll,describe,test,expect} from 'vitest';
import {requirementsSchema,assertFormalPlan} from '../apps/api/src/requirements.ts';
import {parsePlan} from '../apps/api/src/plans.ts';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {dashboard} from '../apps/api/src/metrics.ts';
export const requirements={version:1 as const,objective:'Consultar solicitações para acompanhar seu atendimento.',behavior:'Ao informar o código de uma solicitação autorizada, apresentar a situação atual.',actors:['Pessoa solicitante'],inputs:[{name:'Identificador',type:'texto',description:'Código informado pela pessoa solicitante.',required:true,validation:'Obrigatório, até 30 caracteres.'}],outputs:[{name:'Situação',type:'texto',description:'Situação atual e data da última atualização.'}],businessRules:['Exibir somente solicitações autorizadas para o usuário.'],functionalCriteria:['Ao informar um código válido, mostrar a situação correspondente.'],technicalCriteria:['Rejeitar códigos inválidos sem consultar a integração.'],dependencies:[{description:'Contrato do serviço de atendimento',kind:'external' as const,status:'confirmed' as const,impact:'informative' as const}],exceptions:['Código inexistente informa ausência de resultado.'],nonFunctional:['Permitir uso completo por teclado.'],assumptions:[],outOfScope:['Alteração do atendimento.'],openQuestions:[] as string[]};
const plan=()=>({summary:'Consulta de atendimento confirmada.',epics:[{title:'Consulta de atendimento',description:'Disponibilizar consulta das solicitações autorizadas.',stories:[{title:'Consultar situação',description:'Permitir que a pessoa consulte sua solicitação com um código e receba a situação atual.',acceptanceCriteria:requirements.functionalCriteria,requirements:structuredClone(requirements),repositoryIds:[],tasks:[{title:'Implementar consulta',description:'Validar a entrada e retornar o resultado, comprovando os cenários de aceite.',repositoryIds:[]}]}]}]});
test('planning preserves structured fields and consistent criteria without requiring every draft topic to be complete',()=>{
 expect(requirementsSchema.parse(requirements)).toEqual(requirements);expect(parsePlan(JSON.stringify(plan()),[],true).epics).toHaveLength(1);
 const incomplete=plan();incomplete.epics[0].stories[0].requirements.openQuestions=['Qual detalhe complementar será confirmado depois?'];expect(()=>assertFormalPlan(incomplete)).not.toThrow();
 const mismatch=plan();mismatch.epics[0].stories[0].acceptanceCriteria=['Outra decisão'];expect(()=>assertFormalPlan(mismatch)).toThrow();
 const legacy=plan() as any;delete legacy.epics[0].stories[0].requirements;expect(()=>parsePlan(JSON.stringify(legacy),[],false)).not.toThrow();expect(()=>parsePlan(JSON.stringify(legacy),[],true)).not.toThrow();
});
describe.skipIf(!process.env.TEST_DATABASE_URL)('requirements interview persistence',()=>{
 const db=database(process.env.TEST_DATABASE_URL!);let answer:unknown;let sent:{role:string;content:string}[]=[];
 const runtime=createApp({db,demoMode:true,llm:{model:'requirements-test',models:async()=>[],complete:async(messages)=>{sent=messages;return {model:'requirements-test',content:JSON.stringify(answer)};}}});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 async function fixture(){const system=await db.item.create({data:{kind:'system',key:randomUUID(),name:'Isolated system',status:'active'}}),project=await db.item.create({data:{kind:'project',parentId:system.id,parentKind:'system',key:randomUUID(),name:'Isolated project',status:'active',projectLifecycle:'active'}});
  const read=async()=>(await runtime.app.inject(`/api/assistant?contextId=${project.id}`)).json();
  const post=(path:string,body:unknown,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:'/api/assistant/'+path,headers:{'x-persona':persona,'idempotency-key':key},payload:body});
  answer={reply:'Vamos confirmar quais dados serão consultados?',brief:{summary:'Consultar situação de atendimento.',confirmedFacts:['Somente solicitações autorizadas.'],openQuestions:['Qual o código de consulta?']}};
  expect((await post('turns',{contextId:project.id,message:'Quero consultar atendimento.',expectedVersion:0,requirementsMode:true})).statusCode).toBe(200);await runtime.processChatJobs();return {project,read,post};
 }
 test('accumulated facts survive across turns and creation preserves full specification exactly once',async()=>{
  const f=await fixture();let state=await f.read();expect(state.brief.confirmedFacts).toEqual(['Somente solicitações autorizadas.']);expect(state.requirementsMode).toBe(true);
  answer={reply:'Confirma os requisitos apresentados?',brief:{summary:'Consulta por código.',confirmedFacts:['Somente solicitações autorizadas.','Código de até 30 caracteres.'],openQuestions:[]}};
  await f.post('turns',{contextId:f.project.id,message:'Código de até 30 caracteres.',expectedVersion:state.session.version,requirementsMode:true});await runtime.processChatJobs();expect(sent.some(m=>m.content.includes('Resumo acumulado')&&m.content.includes('Somente solicitações autorizadas.'))).toBe(true);
  state=await f.read();answer=plan();const body={contextId:f.project.id,projectId:f.project.id,expectedVersion:state.session.version,confirmed:true,requirementsMode:true},key=randomUUID();
  const first=await f.post('complete',body,key);expect(first.statusCode,first.body).toBe(200);await runtime.processChatJobs();expect((await f.post('complete',body,key)).json()).toEqual(first.json());
  const proposal=await db.planProposal.findUniqueOrThrow({where:{turnId:first.json().turn.id}});expect(proposal.status).toBe('applied');
  const items=await db.item.findMany({where:{id:{in:proposal.appliedItemIds as string[]}}});expect(items).toHaveLength(9);const story=items.find(i=>i.kind==='story')!;expect(story.status).toBe('specification');expect((story.data as any).requirements).toEqual(requirements);expect((await f.read()).turns.at(-1).output).toContain('Criados no Projeto');expect(sent.some(m=>m.content.includes('Código de até 30 caracteres.'))).toBe(true);
  const tasks=items.filter(item=>item.kind==='task');expect(tasks).toHaveLength(7);expect(tasks.filter(task=>(task.data as any).creationOrigin==='pipeline')).toHaveLength(6);expect(new Set(tasks.filter(task=>(task.data as any).pipelineStage).map(task=>(task.data as any).pipelineStage)).size).toBe(6);
  expect(await db.storySpecificationRevision.count({where:{storyId:story.id,number:1,source:'agent'}})).toBe(1);
  expect((await dashboard(db,new Date(),{projectId:f.project.id,userId:'admin'})).assistant.total).toMatchObject({started:1,completed:1,items:{epic:1,story:1,task:1}});
  expect((await dashboard(db,new Date(),{projectId:f.project.id,userId:'ana'})).assistant.total).toMatchObject({started:0,completed:0});
 });
 test('unconfirmed interview and inconsistent generated criteria create no items and preserve the conversation',async()=>{
  const f=await fixture();let state=await f.read();expect((await f.post('complete',{contextId:f.project.id,projectId:f.project.id,expectedVersion:state.session.version,confirmed:true,requirementsMode:true})).statusCode).toBe(409);answer={reply:'Requisitos confirmados.',brief:{summary:'Consulta por código.',confirmedFacts:['Somente solicitações autorizadas.'],openQuestions:[]}};await f.post('turns',{contextId:f.project.id,message:'Confirmo o encaminhamento.',expectedVersion:state.session.version,requirementsMode:true});await runtime.processChatJobs();state=await f.read();answer=plan();(answer as ReturnType<typeof plan>).epics[0].stories[0].acceptanceCriteria=['Outro critério divergente da especificação.'];
  const before=await db.item.count();await f.post('complete',{contextId:f.project.id,projectId:f.project.id,expectedVersion:state.session.version,confirmed:true,requirementsMode:true});await runtime.processChatJobs();expect(await db.item.count()).toBe(before);const result=await f.read();expect(result.turns.at(-1).status).toBe('failed');expect(result.turns.at(-1).error).toContain('critérios');expect(result.brief).toBeTruthy();
 });
});
