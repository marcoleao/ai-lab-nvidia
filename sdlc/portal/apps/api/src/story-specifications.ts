import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Item,Prisma} from '../../../packages/db/generated/client.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {requirementsDraftSchema,requirementsReadiness,pendingBlockingDependencies} from './requirements.ts';
import {specificationSchema} from './code-schema.ts';
import {currentAttempt,finishAttempt} from './work-activities.ts';
import {currentAuditContext} from './audit.ts';
import {currentSpecificationReadiness} from './planning-dependencies.ts';

const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value));
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const technicalDraftSchema=specificationSchema.extend({requirements:z.string().trim().max(3000).default(''),architecture:z.string().trim().max(3000).default(''),testCases:z.array(z.object({criterionIndex:z.number().int().min(0),description:z.string().trim().max(500)}).strict()).max(12).default([]),risks:z.array(z.string().trim().max(300)).max(10).default([])});
export const storySpecificationContentSchema=z.object({requirements:requirementsDraftSchema,technical:technicalDraftSchema.nullable().default(null)}).strict();
export type StorySpecificationContent=z.infer<typeof storySpecificationContentSchema>;

/** Sorting object keys prevents transport field order from manufacturing a revision. */
export function canonicalSpecification(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonicalSpecification).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>JSON.stringify(key)+':'+canonicalSpecification(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
export const specificationDigest=(value:unknown)=>createHash('sha256').update(canonicalSpecification(value)).digest('hex');

/** A projection of observed legacy fields; this function never persists a revision. */
export function specificationContentFromStory(story:Pick<Item,'data'|'description'>):StorySpecificationContent{
 const data=object(story.data),requirements=object(data.requirements);
 const functionalCriteria=Array.isArray(requirements.functionalCriteria)?requirements.functionalCriteria:Array.isArray(data.acceptanceCriteria)?data.acceptanceCriteria:[];
 return storySpecificationContentSchema.parse({requirements:{...requirements,objective:requirements.objective??story.description,behavior:requirements.behavior||story.description,functionalCriteria},technical:data.technicalPlan??null});
}
export function technicalPlanReadiness(content:StorySpecificationContent){
 const parsed=specificationSchema.safeParse(content.technical),criteria=content.requirements.functionalCriteria;
 const complete=parsed.success&&parsed.data.testCases.every(test=>test.criterionIndex<criteria.length)&&criteria.every((_,index)=>parsed.data.testCases.some(test=>test.criterionIndex===index));
 return {ready:!!complete,missing:complete?[]:['Complete o plano técnico, a arquitetura e os casos de teste de todos os critérios de aceite.']};
}
export function specificationReadiness(content:StorySpecificationContent){
 const business=requirementsReadiness(content.requirements),technical=technicalPlanReadiness(content),blocking=pendingBlockingDependencies(content.requirements);
 return {canPrepare:business.ready,canApprove:business.ready&&technical.ready&&!blocking.length,business,technical,blockingDependencies:blocking,missing:[...business.missing,...technical.missing,...(blocking.length?['Resolva as dependências impeditivas pendentes antes de aprovar G1 e codificar.']:[])]};
}
export function requireSpecificationBusiness(content:StorySpecificationContent){
 const readiness=requirementsReadiness(content.requirements);
 if(!readiness.ready)throw new DomainError('REQUIREMENTS_INCOMPLETE',readiness.missing.join(' '),409);
}
export function requireCodingDependencies(content:StorySpecificationContent){
 if(pendingBlockingDependencies(content.requirements).length)throw new DomainError('BLOCKING_DEPENDENCIES','Resolva as dependências impeditivas pendentes antes de aprovar G1 ou iniciar a codificação.',409);
}

type Person={id:string;name:string};
/** Called only by commands/workers, in their transaction; never by a GET. */
export async function initializeStorySpecification(tx:Transaction,h:Pick<AssistantHelpers,'event'>,story:Item,person:Person,raw:unknown,source='human',options:{author?:Person;initiator?:Person;executor?:Person&{type?:string}}={}){
 const content=storySpecificationContentSchema.parse(raw),previous=await tx.storySpecificationRevision.findFirst({where:{storyId:story.id},orderBy:{number:'desc'}});
 const actor=options.author??(source==='agent'?{id:'agent:specification',name:'Agente de especificação'}:person);
 const executor=options.executor??(source==='agent'?{id:'agent:specification',name:'Agente de especificação',type:'agent'}:{...person,type:'human'});
 if(previous&&canonicalSpecification(previous.content)===canonicalSpecification(content)){
  const comparison={revisionId:previous.id,revisionNumber:previous.number,status:story.status,version:story.version};
  await h.event(tx,story,executor,source==='agent'?'STORY_SPECIFICATION_AGENT_PREPARED':'STORY_SPECIFICATION_APPLIED','Conteúdo já corresponde à especificação vigente; nenhuma nova revisão criada.',{revisionId:previous.id,revisionNumber:previous.number,source,initial:false},executor.type??'human',{outcome:'NO_CHANGE',phase:'COMPLETED',before:comparison,after:comparison,executor,initiator:{...(options.initiator??person),type:'human'},operationId:currentAuditContext()?.operationId??`specification-no-change:${randomUUID()}`,subject:{type:'story_specification_revision',id:previous.id,version:previous.number}});
  return {story,revision:previous,changed:false};
 }
 const revision=await tx.storySpecificationRevision.create({data:{storyId:story.id,number:(previous?.number??0)+1,content:json(content),actorId:actor.id,actorName:actor.name,source}});
 const old=object(story.data),changed=await tx.item.update({where:{id:story.id},data:{data:json({...old,requirements:content.requirements,acceptanceCriteria:content.requirements.functionalCriteria,technicalPlan:content.technical,specificationRevisionId:revision.id,specificationRevisionNumber:revision.number}),...(source==='human'&&['approved','coding'].includes(story.status)?{status:'specification'}:{}),version:{increment:1}}});
 await h.event(tx,changed,executor,source==='agent'?'STORY_SPECIFICATION_AGENT_PREPARED':'STORY_SPECIFICATION_APPLIED','Revisão da especificação registrada; aprovação G1 permanece uma decisão explícita.',{revisionId:revision.id,revisionNumber:revision.number,source,initial:!previous,changedSections:previous?(['requirements','technical'] as const).filter(key=>canonicalSpecification(object(previous.content)[key])!==canonicalSpecification(content[key])):['requirements',...(content.technical?['technical']:[])]},executor.type??'human',{before:{revisionId:previous?.id??null,revisionNumber:previous?.number??0,status:story.status,version:story.version},after:{revisionId:revision.id,revisionNumber:revision.number,status:changed.status,version:changed.version},executor,initiator:{...(options.initiator??person),type:'human'},operationId:revision.id,subject:{type:'story_specification_revision',id:revision.id,version:revision.number}});
 return {story:changed,revision,changed:true};
}

export function registerStorySpecifications(app:FastifyInstance,h:AssistantHelpers){
 const expected=z.number().int().nonnegative();
 app.get<{Params:{id:string}}>('/api/items/:id/specification',async request=>{
  const query=z.object({page:z.coerce.number().int().positive().default(1),asOf:z.string().datetime({offset:true}).optional()}).strict().parse(request.query);
  return h.db.$transaction(async tx=>{
   const story=await tx.item.findUnique({where:{id:request.params.id}});if(!story||story.kind!=='story')throw new DomainError('STORY_REQUIRED','Selecione uma História.',404);
   const revision=await tx.storySpecificationRevision.findFirst({where:{storyId:story.id},orderBy:{number:'desc'}}),draft=await tx.storySpecificationDraft.findUnique({where:{storyId:story.id}});
   const [clock]=await tx.$queryRaw<{asOf:Date}[]>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
   const asOf=query.asOf??clock.asOf.toISOString(),historyWhere={storyId:story.id,createdAt:{lte:new Date(asOf)}};
   const total=await tx.storySpecificationRevision.count({where:historyWhere}),totalPages=Math.max(1,Math.ceil(total/20)),page=Math.min(query.page,totalPages);
   const revisions=await tx.storySpecificationRevision.findMany({where:historyWhere,orderBy:[{number:'desc'},{id:'desc'}],skip:(page-1)*20,take:20,select:{id:true,number:true,actorId:true,actorName:true,source:true,createdAt:true}});
   let content:StorySpecificationContent;
   try{content=revision?storySpecificationContentSchema.parse(revision.content):specificationContentFromStory(story);}catch{content=storySpecificationContentSchema.parse({requirements:{},technical:null});}
   let writable=true,reason:string|undefined;
   try{await h.ensureNotArchived(tx,story);}catch(error){if(!(error instanceof DomainError))throw error;writable=false;reason=error.message;}
   let authorized=false;try{const person=h.actor(request);h.canPlan(person);authorized=true;}catch(error){if(!(error instanceof DomainError))throw error;}
   return {story:{id:story.id,version:story.version},storyId:story.id,expectedVersion:story.version,content,revision,draft,readOnly:!writable||!authorized,canApply:writable&&authorized,readiness:await currentSpecificationReadiness(tx,story,content),draftStale:!!draft&&draft.baseRevision!==(revision?.number??0),revisions,history:{items:revisions,page,pageSize:20,total,asOf},pagination:{page,pageSize:20,total,totalPages,asOf},capabilities:{canEdit:writable&&authorized,canApply:writable&&authorized},reason:reason??(!authorized?'Selecione PO, Arquiteto ou Admin para editar.':undefined),coverage:revision?'versioned':'legacy_observed_fields'};
  },{isolationLevel:'RepeatableRead'});
 });
 app.get<{Params:{id:string;revisionId:string}}>('/api/items/:id/specification/revisions/:revisionId',async request=>h.db.$transaction(async tx=>{
  const story=await tx.item.findUnique({where:{id:request.params.id}});if(!story||story.kind!=='story')throw new DomainError('STORY_REQUIRED','Selecione uma História.',404);
  const key=request.params.revisionId,revision=await tx.storySpecificationRevision.findFirst({where:{storyId:story.id,...(/^\d+$/.test(key)?{number:Number(key)}:{id:key})}});if(!revision)throw new DomainError('SPECIFICATION_REVISION_NOT_FOUND','Revisão não encontrada para esta História.',404);
  return {revision,readOnly:true};
 }));
 app.put<{Params:{id:string}}>('/api/items/:id/specification/draft',async request=>{
  const body=z.object({expectedDraftVersion:expected,baseRevision:expected.optional(),content:storySpecificationContentSchema}).strict().parse(request.body);
  return h.mutate(request,async(tx,person)=>{
   const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Selecione uma História.',409);await h.ensureNotArchived(tx,story);
   const old=await tx.storySpecificationDraft.findUnique({where:{storyId:story.id}}),revision=await tx.storySpecificationRevision.findFirst({where:{storyId:story.id},orderBy:{number:'desc'}});
   if((old?.version??0)!==body.expectedDraftVersion)throw new DomainError('SPECIFICATION_DRAFT_CONFLICT','O rascunho foi alterado. Consulte a versão atual sem descartar sua edição.',409);
   const baseRevision=body.baseRevision??old?.baseRevision??revision?.number??0;
   if(baseRevision!==(revision?.number??0))throw new DomainError('SPECIFICATION_BASE_CHANGED','A especificação vigente mudou. Revise a versão atual antes de salvar outro rascunho.',409);
   if(old&&old.baseRevision===baseRevision&&canonicalSpecification(old.content)===canonicalSpecification(body.content)){
    const comparison={draftVersion:old.version,baseRevision:old.baseRevision};
    await h.event(tx,story,person,'STORY_SPECIFICATION_DRAFT_SAVED','O rascunho já contém este conteúdo; nenhuma alteração confirmada.',{draftVersion:old.version,baseRevision:old.baseRevision},'human',{outcome:'NO_CHANGE',phase:'COMPLETED',before:comparison,after:comparison,operationId:currentAuditContext()?.operationId??`specification-draft-no-change:${randomUUID()}`});
    return {draft:old,changed:false};
   }
   const draft=await tx.storySpecificationDraft.upsert({where:{storyId:story.id},create:{storyId:story.id,baseRevision,version:1,content:json(body.content),actorId:person.id,actorName:person.name,source:'human'},update:{baseRevision,version:{increment:1},content:json(body.content),actorId:person.id,actorName:person.name,source:'human'}});
   await h.event(tx,story,person,'STORY_SPECIFICATION_DRAFT_SAVED','Rascunho da especificação salvo; a revisão em execução permanece preservada.',{draftVersion:draft.version,baseRevision},'human',{before:old?{draftVersion:old.version,baseRevision:old.baseRevision}:null,after:{draftVersion:draft.version,baseRevision},operationId:`specification-draft:${story.id}:${draft.version}`});
   return {draft,changed:true,readiness:await currentSpecificationReadiness(tx,story,body.content)};
  });
 });
 app.post<{Params:{id:string}}>('/api/items/:id/specification/apply',async request=>{
  const body=z.object({expectedDraftVersion:z.number().int().positive(),expectedVersion:z.number().int().positive(),confirmed:z.literal(true)}).strict().parse(request.body);
  return h.mutate(request,async(tx,person)=>{
   const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Selecione uma História.',409);await h.ensureNotArchived(tx,story);
   if(story.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A História mudou. Consulte o estado atual antes de aplicar.',409);
   const draft=await tx.storySpecificationDraft.findUnique({where:{storyId:story.id}}),latest=await tx.storySpecificationRevision.findFirst({where:{storyId:story.id},orderBy:{number:'desc'}});
   if(!draft||draft.version!==body.expectedDraftVersion||draft.baseRevision!==(latest?.number??0))throw new DomainError('SPECIFICATION_DRAFT_CONFLICT','O rascunho ou sua revisão base mudou. Revise antes de aplicar.',409);
   const content=storySpecificationContentSchema.parse(draft.content);requireSpecificationBusiness(content);
   const contentChanged=!latest||canonicalSpecification(latest.content)!==canonicalSpecification(content);
   if(contentChanged&&(await tx.storyExecution.count({where:{storyId:story.id,state:{in:['queued','running','waiting_input','paused','cancel_pending']}}})||await tx.qualityCheck.count({where:{storyId:story.id,state:{in:['queued','running']}}})||await tx.mergeOperation.count({where:{storyId:story.id,state:{in:['queued','running']}}})))throw new DomainError('SPECIFICATION_EXECUTION_ACTIVE','O rascunho foi preservado. Encerre ou interrompa explicitamente a tentativa atual antes de aplicar outro conteúdo à execução.',409);
   const result=await initializeStorySpecification(tx,h,story,person,content,'human');
   if(result.changed){
    // A gate awaiting its first approval has no executor in flight. Editing it
    // supersedes that proposal explicitly, without pretending code was cancelled.
    const gates=await tx.storyExecution.findMany({where:{storyId:story.id,state:'waiting_approval',stage:'gate'}});
    for(const gate of gates){
     await tx.storyExecution.update({where:{id:gate.id},data:{state:'cancelled',error:'Proposta G1 substituída por uma revisão explícita da especificação.',leaseId:null,leaseUntil:null}});
     const work=await currentAttempt(tx,'execution',gate.id,'specification');if(work)await finishAttempt(tx,h,work.sourceKey,{state:'superseded',summary:'Proposta G1 substituída por revisão da especificação; nova submissão necessária.'});
     await h.event(tx,result.story,person,'EXECUTION_SPECIFICATION_SUPERSEDED','Proposta aguardando G1 substituída; o conteúdo anterior permanece consultável.',{runId:gate.id,revisionId:result.revision.id},'human',{before:{state:gate.state},after:{state:'cancelled'},operationId:gate.id,subject:{type:'execution',id:gate.id}});
    }
   }
   // Keep the draft rather than deleting someone else's edit on a replay. Only
   // advancing its base changes its optimistic version, with its own comparison.
   if(draft.baseRevision!==result.revision.number){
    const aligned=await tx.storySpecificationDraft.update({where:{storyId:story.id},data:{baseRevision:result.revision.number,version:{increment:1}}});
    await h.event(tx,result.story,person,'STORY_SPECIFICATION_DRAFT_SAVED','Rascunho alinhado à revisão explicitamente aplicada.',{draftVersion:aligned.version,baseRevision:aligned.baseRevision},'human',{before:{draftVersion:draft.version,baseRevision:draft.baseRevision},after:{draftVersion:aligned.version,baseRevision:aligned.baseRevision},operationId:result.revision.id});
   }
   return {revision:result.revision,content,changed:result.changed,requiresG1:result.changed,expectedVersion:result.story.version};
  });
 });
}
