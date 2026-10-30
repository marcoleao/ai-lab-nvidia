import {DomainError} from './errors.ts';
import type {MergeIntegrationObservation,MergeClosureObservation,MergeOpenClosureObservation} from '../../../packages/shared/src/merge-integration-reference.ts';

export type MergeReference={projectId:number;iid:number;sourceBranch:string;targetBranch:string;sha:string;expectedTargetSha?:string};
export type MergeInspection={state:string;sha:string;targetSha?:string;draft?:boolean;url:string;mergedBy:string|null;mergedAt:string|null;blocks:{category:string;message:string}[];integration?:MergeIntegrationObservation;closure?:MergeClosureObservation;openForClosure?:MergeOpenClosureObservation};
export interface MergeProvider{inspect(reference:MergeReference):Promise<MergeInspection>;merge(reference:MergeReference):Promise<MergeInspection>;releaseDraft?(reference:MergeReference):Promise<MergeInspection>;closeHistorical?(reference:MergeReference&{remoteUpdatedAt:string}):Promise<MergeInspection>;}

/** Credential is exclusive to this adapter; no arbitrary API method is exposed. */
export class GitLabMergeProvider implements MergeProvider{
 constructor(private base:string,private token:string,private root='sdlc'){
  const url=new URL(base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid merge provider URL');
 }
 private async call(method:'GET'|'PUT',path:string,body?:unknown){
  let response:Response;
  try{response=await fetch(`${this.base.replace(/\/$/,'')}/api/v4/${path}`,{method,redirect:'error',headers:{'PRIVATE-TOKEN':this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});}
  catch{throw new DomainError('MERGE_UNAVAILABLE','A confirmação do GitLab não chegou. Consulte o resultado antes de tentar novamente.',503);}
  if(!response.ok)throw new DomainError(response.status===401||response.status===403?'MERGE_ACCESS_DENIED':'MERGE_REFUSED',`GitLab recusou a operação de merge (HTTP ${response.status}). Nenhuma proteção foi alterada.`,response.status===401||response.status===403?403:409);
  return response.json();
 }
 async inspect(ref:MergeReference):Promise<MergeInspection>{
  if(!Number.isSafeInteger(ref.projectId)||ref.projectId<1||!Number.isSafeInteger(ref.iid)||ref.iid<1||!/^[a-f0-9]{40,64}$/.test(ref.sha)||!ref.sourceBranch||!ref.targetBranch)throw new DomainError('MERGE_REFERENCE_INVALID','Referência do Merge Request inválida.',409);
  const user=await this.call('GET','user');
  if(user.username!=='sdlc-agent-for-merge'||user.is_admin||user.state!=='active')throw new DomainError('MERGE_IDENTITY_INVALID','A integração exige a conta ativa sdlc-agent-for-merge, sem administração global.',403);
  const project=await this.call('GET',`projects/${ref.projectId}`);
  if(project.archived||!project.path_with_namespace?.startsWith(this.root+'/')||!project.topics?.includes('sdlc-managed'))throw new DomainError('MERGE_SCOPE_DENIED','O repositório não pertence ao escopo gerenciado pelo SDLC.',403);
  const mr=await this.call('GET',`projects/${ref.projectId}/merge_requests/${ref.iid}?with_merge_status_recheck=true`);
  const target=await this.call('GET',`projects/${ref.projectId}/repository/branches/${encodeURIComponent(ref.targetBranch)}`);
  const blocks:MergeInspection['blocks']=[];
  if(mr.project_id!==ref.projectId||mr.source_project_id!==ref.projectId||mr.target_project_id!==ref.projectId||mr.source_branch!==ref.sourceBranch||mr.target_branch!==ref.targetBranch||mr.sha!==ref.sha)blocks.push({category:'changed',message:'O commit ou as branches do MR mudaram. Revise a entrega antes de solicitar outra integração.'});
  if(mr.state!=='merged'){
   if(ref.expectedTargetSha&&target.commit?.id!==ref.expectedTargetSha)blocks.push({category:'changed',message:'A base mudou após as verificações. CODE REVIEW e SECURITY SCAN precisam ser refeitos para a nova base.'});
   if(mr.state!=='opened')blocks.push({category:'closed',message:'O Merge Request não está aberto.'});
   if(mr.draft||mr.work_in_progress||/^(draft:|wip:)/i.test(mr.title||''))blocks.push({category:'draft',message:'O MR está em Draft. A revisão precisa liberá-lo no GitLab antes do merge.'});
   if(mr.has_conflicts)blocks.push({category:'conflict',message:'Há conflitos. A correção deve retornar ao fluxo de codificação; o agente de merge não altera arquivos.'});
   if(!mr.head_pipeline||mr.head_pipeline.sha!==ref.sha||mr.head_pipeline.status!=='success')blocks.push({category:'pipeline',message:'É necessário um pipeline aprovado para o mesmo commit. Ausência de pipeline não equivale a aprovação.'});
   if(mr.blocking_discussions_resolved===false)blocks.push({category:'discussion',message:'Há discussões obrigatórias pendentes no GitLab.'});
   if(mr.detailed_merge_status!=='mergeable')blocks.push({category:'checks',message:`O GitLab ainda não liberou a integração (${String(mr.detailed_merge_status||'unknown')}). Verifique as aprovações e verificações exigidas.`});
  }
  const safeSha=(v:unknown)=>typeof v==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v)?v:null;
  const mergedAt=typeof mr.merged_at==='string'&&Number.isFinite(Date.parse(mr.merged_at))?new Date(mr.merged_at).toISOString():null;
  const integration=mr.state==='merged'&&!blocks.length?{projectId:mr.project_id,iid:ref.iid,sourceBranch:mr.source_branch,targetBranch:mr.target_branch,sourceSha:mr.sha,mergeCommitSha:safeSha(mr.merge_commit_sha),squashCommitSha:safeSha(mr.squash_commit_sha),mergedAt}:undefined;
  // Absence/invalid metadata is not proof of absence: require explicit null/false.
  const closure:MergeClosureObservation|undefined=mr.state==='closed'&&!blocks.some(b=>b.category==='changed')&&mr.merge_commit_sha===null&&mr.squash_commit_sha===null&&mr.merged_at===null&&mr.merge_when_pipeline_succeeds===false&&mr.auto_merge_enabled!==true&&!mr.merge_after?{projectId:mr.project_id,iid:ref.iid,sourceBranch:mr.source_branch,targetBranch:mr.target_branch,sourceSha:mr.sha,state:'closed',mergeCommitSha:null,squashCommitSha:null,mergedAt:null,mergeScheduled:false}:undefined;
  const updatedAt=typeof mr.updated_at==='string'&&Number.isFinite(Date.parse(mr.updated_at))?new Date(mr.updated_at).toISOString():null;
  const openForClosure:MergeOpenClosureObservation|undefined=mr.state==='opened'&&ref.sourceBranch.startsWith('sdlc/')&&!blocks.some(b=>b.category==='changed')&&mr.merge_commit_sha===null&&mr.squash_commit_sha===null&&mr.merged_at===null&&mr.merge_when_pipeline_succeeds===false&&mr.auto_merge_enabled!==true&&!mr.merge_after&&updatedAt?{projectId:mr.project_id,iid:ref.iid,sourceBranch:mr.source_branch,targetBranch:mr.target_branch,sourceSha:mr.sha,state:'opened',mergeCommitSha:null,squashCommitSha:null,mergedAt:null,mergeScheduled:false,updatedAt}:undefined;
  return {state:mr.state,sha:mr.sha,targetSha:target.commit?.id,draft:Boolean(mr.draft||mr.work_in_progress||/^(draft:|wip:|\[draft\]|\(draft\))/i.test(mr.title||'')),url:mr.web_url,mergedBy:mr.merge_user?.username??mr.merged_by?.username??null,mergedAt,blocks,...(integration?{integration}:{}),...(closure?{closure}:{}),...(openForClosure?{openForClosure}:{})};
 }
 async closeHistorical(ref:MergeReference&{remoteUpdatedAt:string}){
  const before=await this.inspect(ref);
  if(before.state==='merged'||before.closure)return before;
  if(!before.openForClosure||before.openForClosure.updatedAt!==ref.remoteUpdatedAt)throw new DomainError('HISTORY_CLOSE_STALE','O MR ou sua revisão mudou desde a confirmação. Consulte novamente antes de fechar.',409);
  // The update endpoint has no SHA CAS. Inspect both sides and never claim atomicity.
  await this.call('PUT',`projects/${ref.projectId}/merge_requests/${ref.iid}`,{state_event:'close'});
  return this.inspect(ref);
 }
 async releaseDraft(ref:MergeReference){
  const before=await this.inspect(ref);
  if(before.state!=='opened'||before.sha!==ref.sha||before.blocks.some(b=>!['draft','checks'].includes(b.category))||ref.expectedTargetSha&&before.targetSha!==ref.expectedTargetSha)throw new DomainError('MERGE_PREPARATION_BLOCKED','As condições ou a revisão do MR mudaram. Consulte o diagnóstico antes de liberar.',409);
  if(!before.draft)return before;
  const mr=await this.call('GET',`projects/${ref.projectId}/merge_requests/${ref.iid}`);
  if(mr.state!=='opened'||mr.sha!==ref.sha||mr.source_branch!==ref.sourceBranch||mr.target_branch!==ref.targetBranch)throw new DomainError('MERGE_STALE','A revisão do MR mudou antes da liberação.',409);
  const title=String(mr.title||'').replace(/^(?:(?:draft:|wip:|\[draft\]|\(draft\))\s*)+/i,'').trim();
  if(!title||title===mr.title)throw new DomainError('MERGE_PREPARATION_BLOCKED','A marcação de rascunho não pode ser retirada com segurança nesta proposta.',409);
  // GitLab supports removing the Draft prefix through the MR update endpoint.
  // This endpoint has no SHA CAS: inspect again after writing; never infer approval.
  await this.call('PUT',`projects/${ref.projectId}/merge_requests/${ref.iid}`,{title});
  return this.inspect(ref);
 }
 async merge(ref:MergeReference){
  const before=await this.inspect(ref);
  if(before.blocks.length)return before;
  if(before.state==='merged')return before;
  // GitLab validates source SHA atomically and enforces its own protections.
  await this.call('PUT',`projects/${ref.projectId}/merge_requests/${ref.iid}/merge`,{sha:ref.sha,should_remove_source_branch:false});
  return this.inspect(ref);
 }
}
