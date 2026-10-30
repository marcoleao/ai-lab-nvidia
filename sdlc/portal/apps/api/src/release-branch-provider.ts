import {DomainError} from './errors.ts';
import type {ReleaseBranchReference as Reference,BranchPreparationInspection as Inspection} from '../../../packages/shared/src/release-branch-preparation.ts';

export interface ReleaseBranchProvider {
 inspect(ref:Reference):Promise<Inspection>;
 prepare(ref:Reference,beforeWrite:()=>Promise<void>):Promise<Inspection>;
}

/** Uses the existing non-admin integration account. No arbitrary endpoint,
 * branch update, unprotect, delete, reset or force-push capability is exposed. */
export class GitLabReleaseBranchProvider implements ReleaseBranchProvider {
 constructor(private base:string,private token:string,private root='sdlc'){
  const url=new URL(base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid GitLab branch provider URL');
 }
 private async call(method:'GET'|'POST',path:string,body?:unknown,missing=false){
  let response:Response;
  try{response=await fetch(`${this.base.replace(/\/$/,'')}/api/v4/${path}`,{method,redirect:'error',headers:{'PRIVATE-TOKEN':this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});}catch{throw new DomainError('RELEASE_BRANCH_UNAVAILABLE','O GitLab não confirmou a consulta ou operação. Consulte o resultado da mesma preparação.',503);}
  if(missing&&response.status===404)return null;
  if(!response.ok)throw new DomainError('RELEASE_BRANCH_REFUSED',response.status===401||response.status===403?'A conta dedicada não tem acesso à preparação. Confira a integração GitLab.':'O GitLab recusou a preparação. Consulte a operação; nenhuma referência existente será sobrescrita.',409);
  try{return {body:await response.json(),headers:response.headers};}catch{throw new DomainError('RELEASE_BRANCH_UNAVAILABLE','A resposta do GitLab não pôde ser confirmada. Consulte a mesma operação.',503);}
 }
 private validate(ref:Reference){
  if(!Number.isSafeInteger(ref.projectId)||ref.projectId<1||!/^sdlc\/release-[a-zA-Z0-9_-]+$/.test(ref.branchName)||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref.baseSha)||!ref.defaultBranch||ref.defaultBranch===ref.branchName)throw new DomainError('RELEASE_BRANCH_SCOPE','Referência da release inválida.',409);
 }
 async inspect(ref:Reference):Promise<Inspection>{
  this.validate(ref);
  const user=(await this.call('GET','user'))!.body;
  // GitLab's GET /user uses UserWithAdmin only for an administrator;
  // UserPublic omits is_admin for normal accounts (verified on the LAB version).
  if(user.username!=='sdlc-agent-for-merge'||(user.is_admin!==undefined&&user.is_admin!==false)||user.state!=='active')throw new DomainError('RELEASE_BRANCH_IDENTITY','A preparação exige a conta ativa sdlc-agent-for-merge, sem administração global.',403);
  const project=(await this.call('GET',`projects/${ref.projectId}`))!.body;
  if(project.id!==ref.projectId||project.archived||!project.path_with_namespace?.startsWith(this.root+'/')||!project.topics?.includes('sdlc-managed')||project.default_branch!==ref.defaultBranch)throw new DomainError('RELEASE_BRANCH_SCOPE','Repositório ou branch padrão diferente do plano autorizado. Revise a decisão.',409);
  const access=Math.max(project.permissions?.project_access?.access_level??0,project.permissions?.group_access?.access_level??0);
  if(access!==40)throw new DomainError('RELEASE_BRANCH_ACCESS','A conta dedicada precisa de acesso Maintainer neste repositório, sem administração global. Confira a integração GitLab.',403);
  const commit=(await this.call('GET',`projects/${ref.projectId}/repository/commits/${ref.baseSha}`,undefined,true))?.body;
  if(commit?.id!==ref.baseSha)throw new DomainError('RELEASE_BRANCH_BASE','A base autorizada não foi encontrada neste repositório. Revise o plano.',409);
  const branch=(await this.call('GET',`projects/${ref.projectId}/repository/branches/${encodeURIComponent(ref.branchName)}`,undefined,true))?.body;
  if(branch&&(branch.name!==ref.branchName||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(branch.commit?.id)))throw new DomainError('RELEASE_BRANCH_UNAVAILABLE','A referência retornada pelo GitLab não pôde ser confirmada.',503);
  const rules:any[]=[];
  // Read the complete rule collection. Never call a remote next-page URL;
  // if the bounded safety limit is reached, fail rather than assume completeness.
  for(let page=1;;page++){
   if(page>100)throw new DomainError('RELEASE_BRANCH_PROTECTION_UNCONFIRMED','A coleção de proteções excedeu o limite de conferência. Preparação bloqueada.',409);
   const result=(await this.call('GET',`projects/${ref.projectId}/protected_branches?per_page=100&page=${page}`))!;
   if(!Array.isArray(result.body)||result.body.length>100)throw new DomainError('RELEASE_BRANCH_UNAVAILABLE','As proteções do GitLab não puderam ser confirmadas.',503);
   rules.push(...result.body);
   if(result.body.length<100&&!result.headers.get('x-next-page')&&!result.headers.get('link')?.includes('rel="next"'))break;
  }
  const matches=(pattern:string)=>new RegExp('^'+pattern.split('*').map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(ref.branchName);
  const applicable=rules.filter(rule=>typeof rule.name==='string'&&matches(rule.name));
  const level=(rows:any[],expected:number)=>Array.isArray(rows)&&rows.length>0&&rows.every(row=>row.access_level===expected&&!row.user_id&&!row.group_id&&!row.deploy_key_id);
  const safe=(rule:any)=>rule.allow_force_push===false&&level(rule.push_access_levels,0)&&level(rule.merge_access_levels,40);
  const blockers:string[]=[];
  if(branch&&branch.commit.id!==ref.baseSha)blockers.push('A branch já existe em outro commit. A preparação não sobrescreve, move ou remove referências.');
  if(applicable.some(rule=>!safe(rule)))blockers.push('Uma proteção aplicável permite acesso diferente do previsto. Revise a política da integração; a preparação não modifica regras existentes.');
  const protectionReady=applicable.length>0&&applicable.every(safe);
  if(branch&&(!protectionReady||branch.protected!==true))blockers.push('A branch existente não tem a proteção esperada confirmada. Não será adotada ou alterada automaticamente.');
  return {branchSha:branch?.commit.id??null,protectionReady,blockers,observedAt:new Date().toISOString()};
 }
 async prepare(ref:Reference,beforeWrite:()=>Promise<void>):Promise<Inspection>{
  let reading=await this.inspect(ref);
  if(reading.blockers.length)throw new DomainError('RELEASE_BRANCH_BLOCKED',reading.blockers.join(' '),409);
  if(reading.branchSha)return reading;
  // Protect the name before creating the reference, avoiding an unprotected
  // creation window. Existing rules are never patched or deleted.
  if(!reading.protectionReady){
   await beforeWrite();await this.call('POST',`projects/${ref.projectId}/protected_branches`,{name:ref.branchName,push_access_level:0,merge_access_level:40,allow_force_push:false});
   reading=await this.inspect(ref);
   if(reading.blockers.length||!reading.protectionReady)throw new DomainError('RELEASE_BRANCH_BLOCKED','Proteção não confirmada. Consulte a mesma preparação antes de continuar.',409);
  }
  if(!reading.branchSha){await beforeWrite();await this.call('POST',`projects/${ref.projectId}/repository/branches`,{branch:ref.branchName,ref:ref.baseSha});}
  return this.inspect(ref);
 }
}
