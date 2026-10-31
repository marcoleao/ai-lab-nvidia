import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Transaction} from '../../../packages/db/client.ts';
import type {Release} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import type {ReleaseDevelopmentReadiness,ReleaseDevelopmentReason,ReleaseDevelopmentState,ReleaseDevelopmentStory} from '../../../packages/shared/src/release-development-readiness.ts';
import {currentComposition,compositionMembers,type CompositionStory} from './release-compositions.ts';
import {developmentApprovalViews} from './development-approval-reading.ts';
import {compositionCodeTraceability} from './composition-code-traceability.ts';
import {canonicalSpecification,storySpecificationContentSchema} from './story-specifications.ts';
import {DomainError} from './errors.ts';

const hash=(value:unknown)=>createHash('sha256').update(canonicalSpecification(value)).digest('hex');
const strength={ready:0,unconfirmed:1,blocked:2};
const worse=(a:ReleaseDevelopmentState,b:ReleaseDevelopmentState)=>strength[a]>=strength[b]?a:b;
const querySchema=z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),search:z.string().trim().max(200).default(''),filter:z.enum(['issues','all','ready','blocked','unconfirmed']).default('issues'),sort:z.enum(['key','name']).default('key'),direction:z.enum(['asc','desc']).default('asc'),expectedCompositionId:z.string().min(1).max(160).optional(),expectedEvaluationDigest:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
type Query=z.infer<typeof querySchema>;
const coverage='Conferência integral da composição salva e das fontes registradas de desenvolvimento. Não inventaria o código do HEAD, reversões, código extra, presença das dependências na base ou compatibilidade do pacote. Não fecha release, prepara candidata, aprova QA ou implanta software.';

/** Domain read shared by the GET and future commands. Never uses a UI page,
 * unsaved picker, status label, shared DEV occupant or historic composition. */
export async function releaseDevelopmentReadiness(tx:Transaction,release:Release){
 const [composition,links,clock]=await Promise.all([
  currentComposition(tx,release.id),tx.releaseStory.findMany({where:{releaseId:release.id},select:{storyId:true}}),
  tx.$queryRaw<{asOf:Date}[]>`SELECT CURRENT_TIMESTAMP AS "asOf"`
 ]);
 const reviewHref=`/releases/${encodeURIComponent(release.id)}?tab=composition&view=planning`;
 const reason=(code:string,state:'blocked'|'unconfirmed',message:string,label='Revisar composição da release',href=reviewHref):ReleaseDevelopmentReason=>({code,state,message,action:{label,href}});
 const reasons:ReleaseDevelopmentReason[]=[];
 let members:CompositionStory[]=[];
 if(!composition)reasons.push(reason('COMPOSITION_NOT_RECORDED','unconfirmed','A composição vigente ainda não tem uma revisão registrada. Revise e salve o planejamento.'));
 else{
  try{members=compositionMembers(composition);}catch{reasons.push(reason('COMPOSITION_INVALID','unconfirmed','As referências da composição não puderam ser conferidas. Nenhuma História foi considerada atendida.'));}
  if(new Set(members.map(v=>v.storyId)).size!==members.length||composition.storyCount!==members.length||!composition.digest||hash(composition.stories)!==composition.digest)reasons.push(reason('COMPOSITION_INCOMPLETE','unconfirmed','Contagem, identidade ou integridade da revisão da composição não confirmada. Revise o planejamento.'));
  const ids=new Set(members.map(v=>v.storyId));
  if(links.length!==members.length||links.some(v=>!ids.has(v.storyId)))reasons.push(reason('COMPOSITION_ASSIGNMENT_DIVERGED','unconfirmed','As associações atuais divergem da revisão salva. Retirar apenas o vínculo não comprova retirada do código.'));
 }
 // Explicit limit rather than qualifying a truncated set. Normal composition
 // editing already limits a bulk selection to 500, but individual links can grow.
 if(members.length>2000)reasons.push(reason('EVALUATION_LIMIT','unconfirmed',`Esta conferência suporta até 2000 Histórias; a composição tem ${members.length}. O conjunto não foi avaliado.`));
 const complete=reasons.length===0;
 const rows:ReleaseDevelopmentStory[]=[];
 if(complete&&members.length){
  const items=await tx.item.findMany({where:{id:{in:members.map(v=>v.storyId)},kind:'story'},select:{id:true,key:true,name:true,status:true,parent:{select:{parent:{select:{parentId:true}}}}}});
  const byId=new Map(items.filter(v=>v.parent?.parent?.parentId===release.systemId).map(v=>[v.id,v]));
  const validMembers=members.filter(v=>byId.has(v.storyId));
  const [approvals,traces,specifications]=await Promise.all([
   developmentApprovalViews(tx,validMembers.map(v=>v.storyId)),
   compositionCodeTraceability(tx,release.systemId,validMembers.map(v=>({...v,compositionCreatedAt:composition!.createdAt}))),
   tx.storySpecificationRevision.findMany({where:{id:{in:validMembers.flatMap(v=>v.specification?[v.specification.id]:[])}},select:{id:true,storyId:true,content:true}})
  ]);
  const traceById=new Map(validMembers.map((v,index)=>[v.storyId,traces[index]]));
  const specById=new Map(specifications.map(v=>[v.id,v]));
  const edges=new Map<string,string[]>();
  for(const member of members){
   const item=byId.get(member.storyId),view=approvals.get(member.storyId),approval=view?.approval,trace=traceById.get(member.storyId);
   const matchesComposition=!!approval&&trace?.planning.state==='current'&&trace.state==='recorded'&&approval.specificationId===member.specification?.id&&approval.executionId===member.execution?.id&&approval.sourceSha===member.execution?.sha&&approval.integrationReferenceId===trace.integration?.referenceId&&approval.integrationSha===trace.integration?.integrationSha;
   const row:ReleaseDevelopmentStory={id:member.storyId,key:item?.key??member.storyKey,name:item?.name??member.storyName,state:'ready',development:{state:view?.validity.state??'unconfirmed',label:view?.validity.label??'Situação de desenvolvimento não confirmada',matchesComposition,approval:approval?{id:approval.id,number:approval.number,createdAt:approval.createdAt,actorName:approval.actorName}:null},references:{specificationId:member.specification?.id??null,executionId:member.execution?.id??null,sourceSha:member.execution?.sha??null,integrationReferenceId:trace?.integration?.referenceId??null,integrationSha:trace?.integration?.integrationSha??null},reasons:[]};
   const developmentHref=`/stories/${encodeURIComponent(member.storyId)}?tab=planning&process=environment&environment=DEV`;
   const add=(code:string,state:'blocked'|'unconfirmed',message:string,label='Revisar desenvolvimento da História',href=developmentHref)=>row.reasons.push(reason(code,state,message,label,href));
   if(!item)add('STORY_SCOPE_UNCONFIRMED','unconfirmed','A História registrada não está disponível no Sistema desta release. Nenhuma fonte de outro Sistema foi usada.','Revisar participação na release',reviewHref);
   else{
    if(item.status==='cancelled')add('STORY_CANCELLED','blocked','História cancelada não satisfaz Desenvolvimento Finalizado.','Revisar participação na release',reviewHref);
    if(view?.validity.state!=='valid'){
     const state=view?.validity.state==='unconfirmed'||!view?'unconfirmed':'blocked';
     add('DEVELOPMENT_'+(view?.validity.state??'unconfirmed').toUpperCase(),state,view?.validity.state==='not_recorded'?'Desenvolvimento Finalizado ainda não foi aprovado.':view?.validity.reasons.join(' ')||'A aprovação de desenvolvimento não está confirmada para a revisão atual.');
    }
    if(trace?.planning.state!=='current')add('PLANNING_REFERENCE_'+(trace?.planning.state??'unconfirmed').toUpperCase(),trace?.planning.state==='outdated'?'blocked':'unconfirmed',trace?.planning.message??'As referências de planejamento não foram confirmadas.','Revisar participação na release',reviewHref);
    if(trace?.state!=='recorded')add('CODE_TRACE_'+(trace?.state??'unavailable').toUpperCase(),trace?.state==='divergent'?'blocked':'unconfirmed',trace?.message??'A rastreabilidade do código planejado não está disponível.','Consultar integração',`/stories/${encodeURIComponent(member.storyId)}?tab=planning`);
    if(approval&&(approval.specificationId!==member.specification?.id||approval.executionId!==member.execution?.id||approval.sourceSha!==member.execution?.sha||trace?.integration&&(approval.integrationReferenceId!==trace.integration.referenceId||approval.integrationSha!==trace.integration.integrationSha)))add('APPROVAL_COMPOSITION_MISMATCH','blocked','A aprovação de desenvolvimento não corresponde à especificação, execução ou integração registrada nesta composição.','Revisar participação na release',reviewHref);
    const spec=member.specification?specById.get(member.specification.id):null;
    const parsed=spec?.storyId===member.storyId?storySpecificationContentSchema.safeParse(spec.content):null;
    if(!parsed?.success)add('DEPENDENCIES_UNCONFIRMED','unconfirmed','As dependências da especificação registrada não puderam ser conferidas.');
    else for(const dependency of parsed.data.requirements.dependencies){
     if(dependency.impact!=='blocking')continue;
     const internal=dependency.reference?.match(/^story:([a-zA-Z0-9_-]+)$/)?.[1];
     if(internal===member.storyId)add('DEPENDENCY_SELF','blocked','A especificação contém uma dependência bloqueante da própria História.');
     else if(internal&&members.some(v=>v.storyId===internal)){const list=edges.get(member.storyId)??[];list.push(internal);edges.set(member.storyId,list);}
     else if(dependency.status==='pending')add('DEPENDENCY_PENDING','blocked','Há uma dependência bloqueante pendente na especificação registrada.');
     else add('DEPENDENCY_BASE_UNCONFIRMED','unconfirmed','Uma dependência bloqueante não está comprovada nesta composição. A declaração de confirmação não comprova sua presença na base ou no pacote.','Revisar dependências da História',`/stories/${encodeURIComponent(member.storyId)}?tab=specification`);
    }
   }
   row.state=row.reasons.reduce((state,v)=>worse(state,v.state),'ready' as ReleaseDevelopmentState);rows.push(row);
  }
  const rowById=new Map(rows.map(v=>[v.id,v]));
  // Monotone propagation, including dependencies outside the visible page.
  for(let pass=0;pass<rows.length;pass++){
   let changed=false;
   for(const row of rows)for(const id of edges.get(row.id)??[]){const next=worse(row.state,rowById.get(id)!.state);if(next!==row.state){row.state=next;changed=true;}}
   if(!changed)break;
  }
  for(const row of rows)for(const id of [...new Set(edges.get(row.id)??[])]){
   const dependency=rowById.get(id)!;
   if(dependency.state!=='ready')row.reasons.push(reason('DEPENDENCY_STORY_NOT_READY',dependency.state,`A dependência ${dependency.key} não atende aos controles de desenvolvimento desta composição.`,`Revisar ${dependency.key}`,`/stories/${encodeURIComponent(id)}?tab=planning&process=environment&environment=DEV`));
  }
 }
 const total=composition?.storyCount??links.length;
 const summary={total,developmentApproved:rows.filter(v=>v.development.state==='valid'&&v.development.matchesComposition).length,ready:rows.filter(v=>v.state==='ready').length,blocked:rows.filter(v=>v.state==='blocked').length,unconfirmed:complete?rows.filter(v=>v.state==='unconfirmed').length:total};
 if(release.compositionStatus==='CANCELED')reasons.push(reason('RELEASE_CANCELED','blocked','A release foi cancelada. Esta leitura preserva as Histórias e não autoriza retomar ou promover a release.','Consultar release',`/releases/${encodeURIComponent(release.id)}`));
 const state:ReleaseDevelopmentReadiness['state']=reasons.some(v=>v.state==='blocked')||summary.blocked?'blocked':!complete||summary.unconfirmed?'unconfirmed':!total?'empty':'ready';
 const base={policy:'release-development-readiness-v1' as const,release:{id:release.id,key:release.key,version:release.version,systemId:release.systemId,compositionStatus:release.compositionStatus,flowEnvironment:release.flowEnvironment},composition:composition?{id:composition.id,number:composition.number,digest:composition.digest,storyCount:composition.storyCount}:null,state,summary,reasons,coverage,qaPreparationAvailable:false as const};
 return {...base,evaluation:{digest:hash({...base,rows}),asOf:clock[0].asOf.toISOString(),complete},stories:rows};
}

export function registerReleaseDevelopmentReadiness(app:FastifyInstance,h:Pick<AssistantHelpers,'db'|'live'>){
 app.get<{Params:{id:string}}>('/api/releases/:id/development-readiness',async request=>{
  const query=querySchema.parse(request.query);
  return h.db.$transaction(async tx=>{
   const release=await tx.release.findUnique({where:{id:request.params.id}});
   if(!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
   await h.live(tx,release.systemId);
   const reading=await releaseDevelopmentReadiness(tx,release);
   if(query.expectedCompositionId&&query.expectedCompositionId!==reading.composition?.id||query.expectedEvaluationDigest&&query.expectedEvaluationDigest!==reading.evaluation.digest)throw new DomainError('RELEASE_READINESS_CHANGED','A composição ou suas evidências mudaram. Atualize a conferência integral antes de continuar a consulta.',409);
   const normalize=(v:string)=>v.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('pt-BR');
   const search=normalize(query.search),collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
   const stories=reading.stories.filter(v=>(query.filter==='all'||query.filter==='issues'&&v.state!=='ready'||query.filter===v.state)&&(!search||normalize(v.key+' '+v.name).includes(search))).sort((a,b)=>(collator.compare(a[query.sort],b[query.sort])||(a.id<b.id?-1:a.id>b.id?1:0))*(query.direction==='asc'?1:-1));
   const totalPages=Math.max(1,Math.ceil(stories.length/20)),page=Math.min(query.page,totalPages);
   return {...reading,stories:stories.slice((page-1)*20,page*20),pagination:{page,pageSize:20,total:stories.length,totalPages},query:{page,search:query.search,filter:query.filter,sort:query.sort,direction:query.direction}} satisfies ReleaseDevelopmentReadiness;
  },{isolationLevel:'RepeatableRead',timeout:15000});
 });
}
