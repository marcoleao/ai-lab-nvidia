import {z} from 'zod';
import {personas} from '@sdlc/shared';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import type {Prisma} from '../../../packages/db/generated/client.ts';
import type {ManualAcceptanceContext} from '../../../packages/shared/src/development-manual-acceptance.ts';
import type {AssistantHelpers} from './assistant.ts';
import type {DeploymentProvider} from './deployment-provider.ts';
import {loadDevelopmentApprovalFacts,developmentApprovalChecks,manualAcceptanceCurrent,recordDevelopmentApproval} from './development-approvals.ts';
import {manualAcceptancePolicy,manualAcceptanceProjection} from './development-manual-acceptance-reading.ts';
import {deploymentIntent} from './development-deployments.ts';
import {hierarchyBlock} from './lifecycle-policy.ts';
import {auditFingerprint} from './audit.ts';
import {DomainError} from './errors.ts';

const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function safeUrl(value:string|undefined|null){try{const url=new URL(value!);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.toString():null;}catch{return null;}}

export function registerDevelopmentManualAcceptance(app:FastifyInstance,h:AssistantHelpers,provider?:DeploymentProvider){
 const base='/api/items/:id/development-manual-acceptance';
 type Params={id:string;recordId:string};
 async function load(tx:Transaction,id:string){
  const facts=await loadDevelopmentApprovalFacts(tx,h,id);
  const tasks=await tx.item.findMany({where:{parentId:id,kind:'task',archived:false,data:{path:['pipelineStage'],equals:'test'}}});
  const active=facts.deployment?await tx.developmentDeployment.findFirst({where:{environmentId:facts.deployment.environmentId,state:'succeeded'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true}}):null;
  return {...facts,tasks,active};
 }
 type Facts=Awaited<ReturnType<typeof load>>;
 const signature=(v:Facts)=>auditFingerprint({reference:v.reference.referenceDigest,storyVersion:v.story.version,chain:v.chain.map(i=>[i.id,i.version,i.status,i.archived]),checks:developmentApprovalChecks(v),manual:v.manual?.id,manualInvalidated:v.manualInvalidated,test:v.test?[v.test.id,v.test.version,v.test.result]:null,tasks:v.tasks.map(t=>[t.id,t.version,t.status]),active:v.active?.id,approval:[v.reading.approval?.id,v.reading.validity.state],busy:v.busy});
 async function context(id:string,persona:string){
  const before=await h.db.$transaction(tx=>load(tx,id),{isolationLevel:'RepeatableRead'});
  const blockers=developmentApprovalChecks(before).filter(check=>check.id!=='acceptance'&&!check.passed).map(check=>check.detail);
  const blocked=hierarchyBlock(before.chain);if(blocked)blockers.push(blocked.reason);
  if(before.busy)blockers.push('Há trabalho pendente. Conclua ou confira o mesmo pedido antes de aprovar a História em DEV.');
  if(before.story.status==='cancelled'||before.story.status==='completed')blockers.push('Esta História está encerrada. Consulte a evidência preservada.');
  if(before.tasks.length!==1)blockers.push('É necessária uma única Tarefa Teste em DEV no planejamento da História.');
  if(before.test?.result==='failed')blockers.push('Há testes automatizados reprovados. Confira e resolva essa reprovação antes de aprovar a História.');
  if(before.active?.id!==before.deployment?.id)blockers.push('Outra versão está no DEV compartilhado. Confira a publicação desta História antes de registrar.');
  const person=personas.find(value=>value.id===persona);
  if(!person||!['admin','product_owner','architect'].includes(person.role))blockers.push('Use Product Owner, Arquiteto ou Admin para aprovar a História em DEV em DEV.');
  let url:string|null=null;
  if(!provider)blockers.push('A observação da implantação DEV não está configurada.');
  else if(!blockers.length&&before.deployment){
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const observation=await Promise.race([provider.observe(deploymentIntent(before.deployment)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Observation deadline')),1500);})]);
    const at=Date.parse(observation.observedAt),now=Date.now();
    if(observation.state!=='healthy'||observation.operationId!==before.deployment.id||!Number.isFinite(at)||at<now-30000||at>now+5000)blockers.push('A versão desta História não foi confirmada como ativa e saudável em DEV. Confira a publicação antes de registrar.');
    else url=safeUrl(observation.url||(before.deployment.proof as Record<string,unknown>|null)?.url as string|undefined);
   }catch{blockers.push('Não foi possível conferir a versão ativa em DEV. Atualize a consulta; nenhuma aprovação foi registrada.');}
   finally{if(timer)clearTimeout(timer);}
  }
  const v=await h.db.$transaction(tx=>load(tx,id),{isolationLevel:'RepeatableRead'});
  if(signature(v)!==signature(before))throw new DomainError('MANUAL_ACCEPTANCE_CHANGED','A revisão ou a implantação mudou durante a consulta. Confira novamente; seu rascunho deve ser preservado.',409);
  const result:ManualAcceptanceContext={referenceDigest:v.reference.referenceDigest,storyId:id,storyVersion:v.story.version,taskId:v.tasks[0]?.id??null,record:v.manual?manualAcceptanceProjection(v.manual):null,current:manualAcceptanceCurrent(v),criteria:v.criteria,specificationNumber:v.reference.specificationNumber,deploymentId:v.deployment?.id??null,buildId:v.build?.id??null,sourceSha:v.build?.sourceSha??null,url,allowed:!blockers.length,blockers,checks:developmentApprovalChecks(v).filter(check=>check.id!=='acceptance'),development:{storyId:id,approval:v.reading.approval,validity:v.reading.validity,approvalAvailable:true,asOf:new Date().toISOString()},token:auditFingerprint({signature:signature(v),persona,policy:manualAcceptancePolicy}),asOf:new Date().toISOString()};
  return {v,result};
 }
 app.get<{Params:Params}>(base,async request=>h.db.$transaction(async tx=>{
  const v=await load(tx,request.params.id);return {storyId:v.story.id,record:v.manual?manualAcceptanceProjection(v.manual):null,current:manualAcceptanceCurrent(v),criterionCount:v.criteria.length,development:{storyId:v.story.id,approval:v.reading.approval,validity:v.reading.validity,approvalAvailable:true,asOf:new Date().toISOString()},asOf:new Date().toISOString()};
 }));
 app.get<{Params:Params}>(base+'/context',async request=>(await context(request.params.id,String(request.headers['x-persona']??''))).result);
 app.get<{Params:Params}>(base+'/:recordId',async request=>h.db.$transaction(async tx=>{
  await h.live(tx,request.params.id,true);const record=await tx.developmentManualAcceptance.findUnique({where:{id:request.params.recordId}});
  if(!record||record.storyId!==request.params.id)throw new DomainError('MANUAL_ACCEPTANCE_NOT_FOUND','Registro manual não encontrado nesta História.',404);
  return {record:manualAcceptanceProjection(record)};
 }));
 app.post<{Params:Params}>(base,async (request:FastifyRequest<{Params:Params}>)=>{

  // Idempotent replay must survive a replaced shared DEV. The transactional
  // recorder/mutation still validates actor, key and body on replay.
  const person=h.actor(request);h.canPlan(person);
  const key=z.string().min(8).max(120).parse(request.headers['idempotency-key']);
  const {createHash}=await import('node:crypto');const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  const old=await h.db.requestKey.findUnique({where:{id:hash(`${person.id}:${key}`)}});
  if(old){if(old.requestHash!==hash(JSON.stringify([request.method,request.url,request.body])))throw new DomainError('IDEMPOTENCY_CONFLICT','A chave pertence a outro registro.',409);return old.result;}
  const body=z.object({expectedStoryVersion:z.number().int().positive(),expectedRecordId:z.string().nullable(),contextToken:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approved','rejected']),notes:z.string().trim().max(2000).default(''),confirmed:z.literal(true)}).strict().parse(request.body);
  const checked=await context(request.params.id,person.id);
  return h.mutate(request,async(tx,actor)=>{
   const v=await load(tx,request.params.id);await h.ensureNotArchived(tx,v.story);
   if(!checked.result.allowed||signature(v)!==signature(checked.v)||body.expectedStoryVersion!==v.story.version||body.expectedRecordId!==(v.manual?.id??null)||body.contextToken!==checked.result.token)throw new DomainError('MANUAL_ACCEPTANCE_CHANGED',checked.result.blockers.join(' ')||'Confira a revisão e a implantação novamente antes de registrar. Seu rascunho foi preservado.',409);
   if(body.decision==='approved'&&v.reading.validity.state==='valid')throw new DomainError('STORY_ALREADY_APPROVED','Esta versão já está aprovada em DEV. Consulte a aprovação preservada.',409);
   const task=v.tasks[0],result=body.decision==='approved'?'passed':'failed';
   const record=await tx.developmentManualAcceptance.create({data:{storyId:v.story.id,taskId:task.id,number:(v.manual?.number??0)+1,scope:'story',policyVersion:manualAcceptancePolicy,referenceDigest:v.reference.referenceDigest,specificationId:v.reference.specificationId!,executionId:v.run!.id,buildId:v.build!.id,deploymentId:v.deployment!.id,sourceSha:v.build!.sourceSha,imageId:v.build!.imageId!,archiveDigest:v.build!.archiveDigest!,criteria:json(v.criteria),results:json([]),result,actorId:actor.id,actorName:actor.name,notes:body.notes}});
   const data=task.data as Record<string,unknown>,status=result==='passed'?'done':'doing';
   const saved=await tx.item.update({where:{id:task.id},data:{status,version:{increment:1},data:json({...data,manualAcceptanceId:record.id,manualAcceptanceResult:result})}});
   const correlation={operationId:record.id,subject:{type:'manual_dev_acceptance',id:record.id},initiator:{...actor,type:'human'}};
   await h.event(tx,saved,actor,'MANUAL_DEV_ACCEPTANCE_TASK_UPDATED','Tarefa Teste em DEV atualizada pelo registro humano; História e demais Tarefas preservadas.',{manualAcceptanceId:record.id,taskId:task.id},'human',{...correlation,before:{status:task.status,version:task.version,manualAcceptanceId:data.manualAcceptanceId??null},after:{status:saved.status,version:saved.version,manualAcceptanceId:record.id}});
   await h.event(tx,v.story,actor,result==='passed'?'MANUAL_DEV_STORY_APPROVED':'MANUAL_DEV_STORY_REJECTED',result==='passed'?'História aprovada pelo humano para a versão conferida em DEV.':'Humano solicitou ajustes na História para a versão conferida em DEV.',{manualAcceptanceId:record.id,developmentBuildId:record.buildId,developmentDeploymentId:record.deploymentId,taskId:task.id,policyVersion:manualAcceptancePolicy},'human',{...correlation,before:{manualAcceptanceId:v.manual?.id??null},after:{manualAcceptanceId:record.id},decision:result==='passed'?'APPROVED':result==='failed'?'REJECTED':'NOT_EVALUATED',evidence:[{type:'manual_dev_acceptance',id:record.id,revision:record.referenceDigest,source:'DevelopmentManualAcceptance'}]});
   const approval=result==='passed'?await recordDevelopmentApproval(tx,h,await loadDevelopmentApprovalFacts(tx,h,v.story.id),actor,body.notes||'Aprovação humana da História em DEV.',record.id):null;
   return {receiptType:result==='passed'?'human_story_approved':'human_story_rejected',record:manualAcceptanceProjection(record),approval};
  });
 });
}
