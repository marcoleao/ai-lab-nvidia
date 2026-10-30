import {z} from 'zod';
import {recordingReading,registerBranchPlanDecisions} from './branch-plan-decisions.ts';
import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';
import type {GitProvider} from './gitlab.ts';
import {DomainError} from './errors.ts';
import {currentComposition,compositionMembers} from './release-compositions.ts';
import type {ReleaseBranchPlan} from '../../../packages/shared/src/release-branch-plan.ts';

export function registerReleaseBranchPlan(app:FastifyInstance,h:Pick<AssistantHelpers,'db'|'live'|'actor'|'ensureNotArchived'|'event'>,git?:GitProvider){
 const querySchema=z.object({baseSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).optional(),scenario:z.enum(['undecided','initial','production']).default('undecided'),targetBranch:z.string().min(1).max(255).optional(),direction:z.enum(['asc','desc']).default('desc'),page:z.coerce.number().int().min(1).max(100000).default(1),search:z.string().trim().max(200).default(''),asOf:z.iso.datetime().optional()}).strict();
 async function inspect(id:string,query:z.infer<typeof querySchema>):Promise<ReleaseBranchPlan>{
  if(query.asOf&&Date.parse(query.asOf)>Date.now()+60000)throw new DomainError('INVALID_QUERY','O instante da consulta não pode estar no futuro.',422);
  const context=await h.db.$transaction(async tx=>{
   const release=await tx.release.findUnique({where:{id:id}});if(!release)throw new DomainError('RELEASE_NOT_FOUND','Release não encontrada.',404);
   const system=await h.live(tx,release.systemId);
   const repository=await tx.repository.findUnique({where:{systemId:release.systemId}}),composition=await currentComposition(tx,release.id);
   const decision=await tx.releaseBranchPlanDecision.findFirst({where:{releaseId:release.id},orderBy:{number:'desc'}});
   return {release,repository,composition,system,decision};
  },{isolationLevel:'RepeatableRead'});
  const {release,repository,composition}=context;
  if(!repository||repository.state!=='ready'||!repository.gitlabProjectId)throw new DomainError('REPOSITORY_NOT_READY','O repositório do Sistema ainda não está pronto. Consulte Repositório do Sistema para resolver a pendência.',409);
  if(!git?.releaseBranchPlan)throw new DomainError('BRANCH_PLAN_NOT_AVAILABLE','Consulta de branches indisponível nesta instalação. Verifique a integração GitLab.',503);
  const branchName=`sdlc/release-${release.id}`,observed=await git.releaseBranchPlan(repository.gitlabProjectId,{branchName,baseSha:query.baseSha,page:query.page,search:query.search,direction:query.direction,targetBranch:query.targetBranch,asOf:query.asOf??new Date().toISOString()});
  const runs=observed.integrations.length?await h.db.storyExecution.findMany({where:{repositoryId:repository.id,branch:{in:observed.integrations.map(row=>row.sourceBranch)},commitSha:{in:observed.integrations.map(row=>row.sha)}},select:{storyId:true,branch:true,commitSha:true}}):[];
  const stories=await h.db.item.findMany({where:{id:{in:runs.map(row=>row.storyId)},kind:'story',parent:{parent:{parentId:release.systemId}}},select:{id:true,key:true,name:true}}),byId=new Map(stories.map(row=>[row.id,row])),members=new Map((composition?compositionMembers(composition):[]).map(row=>[row.storyId,row]));
  // Network observation is not a distributed snapshot. Refuse to label an old
  // composition/repository binding as current if it changed during the GET.
  const still=await h.db.$transaction(async tx=>{const system=await h.live(tx,release.systemId);return {system,release:await tx.release.findUnique({where:{id:release.id}}),repository:await tx.repository.findUnique({where:{id:repository.id}}),composition:await currentComposition(tx,release.id),decision:await tx.releaseBranchPlanDecision.findFirst({where:{releaseId:release.id},orderBy:{number:'desc'}})};},{isolationLevel:'RepeatableRead'});
  if(still.system.status!==context.system.status||still.decision?.id!==context.decision?.id||still.release?.version!==release.version||still.composition?.id!==composition?.id||still.repository?.version!==repository.version||still.repository?.gitlabProjectId!==repository.gitlabProjectId)throw new DomainError('BRANCH_PLAN_CONTEXT_CHANGED','A release ou o repositório mudou durante a consulta. Atualize o plano para conferir o contexto atual.',409);
  const recording=recordingReading({...context,repository},observed,query.scenario);
  const recorded=recording.currentState==='current'&&recording.current?.baseSha===observed.baseCommit?.sha&&query.scenario==='initial';
  const response:ReleaseBranchPlan={release:{id:release.id,key:release.key,version:release.version,compositionRevisionId:composition?.id??null,compositionNumber:composition?.number??null},repository:{id:repository.id,name:repository.name,path:repository.gitlabPath,version:repository.version,gitlabProjectId:repository.gitlabProjectId},observed,proposal:{branchName,baseSha:observed.baseCommit?.sha??null,scenario:query.scenario,approval:recorded?'recorded':'pending',canCreate:false},recording,integrations:observed.integrations.map(row=>({...row,stories:[...new Set(runs.filter(run=>row.sourceProjectId===repository.gitlabProjectId&&run.branch===row.sourceBranch&&run.commitSha===row.sha).map(run=>run.storyId))].flatMap(id=>{const story=byId.get(id);return story?[{...story,inComposition:members.has(id),matchesPlannedCode:members.get(id)?.execution?.sha===row.sha}]:[];})})),decisions:[{id:'DE-01',message:recorded?'Política de branches registrada para esta composição; a execução no GitLab continua separada.':'Definir o papel da branch principal, isolamento das Histórias, propagação de correções e releases simultâneas.'},{id:'DE-02',message:recorded?'Base inicial declarada registrada para este contexto; origem em produção não confirmada.':query.scenario==='initial'?'Primeira release: a base inicial ainda precisa de decisão explícita. O SHA consultado não foi autorizado como base.':'Nenhuma versão em produção foi confirmada pelas fontes desta consulta. A origem da base precisa ser definida e comprovada.'}],coverage:'MRs marcados como merged pelo GitLab para a branch padrão, criados até o recorte informado. Ligações com Histórias exigem repositório, branch e SHA da execução iguais. Histórico de merge não comprova código presente no HEAD, inventário completo, dependências ou adoção. Commits diretos e reversões não são inventariados. Paginação remota não é snapshot imutável; alterações e exclusões podem mudar as páginas.'};
  return response;
 }
 app.get<{Params:{id:string}}>('/api/releases/:id/branch-plan',request=>inspect(request.params.id,querySchema.parse(request.query)));
 registerBranchPlanDecisions(app,h,(id,baseSha)=>inspect(id,querySchema.parse({baseSha,scenario:'initial'})));
}

