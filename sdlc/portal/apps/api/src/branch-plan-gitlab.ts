import {DomainError} from './errors.ts';
import type {BranchPlanQuery,BranchPlanObservation,ObservedBranch} from '../../../packages/shared/src/release-branch-plan.ts';

const shaPattern=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
/** Read-only adapter. Never follows a remote pagination URL or exposes raw GitLab errors/content. */
export async function readBranchPlan(config:{base:string;token:string;root:string},projectId:number,query:BranchPlanQuery):Promise<BranchPlanObservation>{
 const unavailable=()=>new DomainError('BRANCH_PLAN_UNAVAILABLE','Não foi possível consultar o GitLab. Tente atualizar a consulta; o planejamento permanece preservado.',503);
 async function get(path:string,missing=false){
  let response:Response;
  try{response=await fetch(`${config.base.replace(/\/$/,'')}/api/v4/${path}`,{method:'GET',redirect:'error',headers:{'PRIVATE-TOKEN':config.token},signal:AbortSignal.timeout(8000)});}catch{throw unavailable();}
  if(missing&&response.status===404)return null;
  if(!response.ok)throw new DomainError('BRANCH_PLAN_UNAVAILABLE',response.status===401||response.status===403?'A integração não tem acesso à consulta de branches. Verifique as permissões em Integrações.':'O GitLab não confirmou esta consulta. Tente atualizar o plano; nenhuma branch foi alterada.',503);
  try{return {body:await response.json(),headers:response.headers};}catch{throw unavailable();}
 }
 if(!Number.isSafeInteger(projectId)||projectId<1)throw new DomainError('INVALID_REPOSITORY','Repositório inválido.');
 const project=(await get(`projects/${projectId}`))!.body;
 if(project.id!==projectId||project.archived||!project.path_with_namespace?.startsWith(config.root+'/')||!project.topics?.includes('sdlc-managed'))throw new DomainError('BRANCH_PLAN_SCOPE_DENIED','O repositório não pertence ao escopo gerenciado deste Sistema.',403);
 async function branch(name:string):Promise<ObservedBranch|null>{
  const value=await get(`projects/${projectId}/repository/branches/${encodeURIComponent(name)}`,true);
  if(!value)return null;
  if(value.body.name!==name||!shaPattern.test(value.body.commit?.id))throw unavailable();
  return {name,sha:value.body.commit.id,protected:value.body.protected===true};
 }
 const defaultBranch=project.default_branch?await branch(project.default_branch):null,proposedBranch=await branch(query.branchName);
 if(query.targetBranch&&query.targetBranch!==defaultBranch?.name)throw new DomainError('BRANCH_PLAN_TARGET_CHANGED','A branch padrão mudou desde a consulta anterior. Atualize o plano para conferir o novo destino.',409);
 let baseCommit=null;
 if(query.baseSha){const value=await get(`projects/${projectId}/repository/commits/${query.baseSha}`,true);if(!value||value.body.id!==query.baseSha)throw new DomainError('BRANCH_PLAN_BASE_NOT_FOUND','O commit informado para análise não foi encontrado neste repositório. Revise o SHA completo.',409);baseCommit={sha:query.baseSha};}
 const params=new URLSearchParams({scope:'all',state:'merged',target_branch:defaultBranch?.name??'',per_page:'20',page:String(query.page),order_by:'created_at',sort:query.direction,created_before:query.asOf,...(query.search?{search:query.search,in:'title'}:{})});
 let result=defaultBranch?await get(`projects/${projectId}/merge_requests?${params}`):null,page=query.page;
 const remoteTotal=(headers?:Headers)=>{const value=headers?.get('x-total');return value&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;};
 const initialTotal=remoteTotal(result?.headers);
 if(initialTotal!==null&&page>Math.max(1,Math.ceil(initialTotal/20))){page=Math.max(1,Math.ceil(initialTotal/20));params.set('page',String(page));result=await get(`projects/${projectId}/merge_requests?${params}`);}
 if(result&&!Array.isArray(result.body))throw unavailable();
 const rows=result?.body??[];
 if(rows.length>20||rows.some((row:any)=>row.project_id!==projectId||row.target_project_id!==projectId||row.state!=='merged'||row.target_branch!==defaultBranch?.name||!Number.isSafeInteger(row.iid)||row.iid<1||!shaPattern.test(row.sha)))throw unavailable();
 const total=remoteTotal(result?.headers);
 const next=result?.headers.get('x-next-page');
 let hasNext=!!next||!!result?.headers.get('link')?.match(/rel="next"/);
 // Some GitLab installations omit pagination headers. Probe the next offset;
 // a full page alone is never presented as the end of the collection.
 if(result&&next===null&&!hasNext&&rows.length===20){params.set('page',String(page+1));const probe=await get(`projects/${projectId}/merge_requests?${params}`);if(!Array.isArray(probe?.body))throw unavailable();hasNext=probe.body.length>0;}
 return {defaultBranch,proposedBranch,baseCommit,integrations:rows.map((row:any)=>({iid:row.iid,sourceProjectId:Number.isSafeInteger(row.source_project_id)?row.source_project_id:null,title:String(row.title??'').slice(0,240),sourceBranch:String(row.source_branch),targetBranch:String(row.target_branch),sha:row.sha,mergeSha:shaPattern.test(row.merge_commit_sha)?row.merge_commit_sha:null,squashSha:shaPattern.test(row.squash_commit_sha)?row.squash_commit_sha:null,mergedAt:typeof row.merged_at==='string'&&Number.isFinite(Date.parse(row.merged_at))?row.merged_at:null,url:String(row.web_url)})),pagination:{page,pageSize:20,total,hasNext},observedAt:new Date().toISOString(),asOf:query.asOf,search:query.search,direction:query.direction};
}
