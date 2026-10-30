import {createHash} from 'node:crypto';
import type {ContractPublicationReference} from '../../../packages/shared/src/contract-publication.ts';
import type {ContractIntegrationKind,ContractIntegrationObservation} from '../../../packages/shared/src/contract-integration.ts';
import {executionContractPath,fullSha} from '../../../packages/shared/src/execution-contract.ts';
import {GitLabContractPublicationProvider} from './contract-publication-provider.ts';
import {DomainError} from './errors.ts';

export interface ContractIntegrationProvider {
 inspectIntegration(ref:ContractPublicationReference):Promise<ContractIntegrationObservation>;
 apply(ref:ContractPublicationReference,kind:ContractIntegrationKind,expectedToken:string,beforeWrite:()=>Promise<void>):Promise<ContractIntegrationObservation>;
}
export const integrationToken=(v:ContractIntegrationObservation)=>createHash('sha256').update(JSON.stringify({...v,observedAt:undefined})).digest('hex');
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
/** Only the reviewed contract MR: release its Draft title OR merge its fixed SHA.
 * Project policy, pipelines, repository files and protections cannot be changed. */
export class GitLabContractIntegrationProvider extends GitLabContractPublicationProvider implements ContractIntegrationProvider {
 async inspectIntegration(ref:ContractPublicationReference):Promise<ContractIntegrationObservation>{
  const published=await this.inspect(ref);
  if(!published.iid||!published.commitSha||published.iid!==ref.knownIid||published.commitSha!==ref.knownCommitSha)throw new DomainError('CONTRACT_INTEGRATION_PROOF','Confirme primeiro o commit e o Merge Request deste envio.',409);
  const project=await this.scope(ref),mr=await this.call('GET',`projects/${ref.projectId}/merge_requests/${published.iid}?with_merge_status_recheck=true`);
  if(mr.project_id!==ref.projectId||mr.source_project_id!==ref.projectId||mr.target_project_id!==ref.projectId||mr.source_branch!==ref.branch||mr.target_branch!==ref.targetBranch||mr.sha!==ref.knownCommitSha||mr.iid!==published.iid||mr.state!==published.mrState||!mr.description?.split('\n').includes(this.marker(ref)))throw new DomainError('CONTRACT_INTEGRATION_PROOF','O MR mudou durante a consulta. Confira novamente a mesma operação.',409);
  const target=await this.call('GET',`projects/${ref.projectId}/repository/branches/${encodeURIComponent(ref.targetBranch)}`),targetSha=fullSha.parse(target.commit?.id);
  if(target.name!==ref.targetBranch)throw new DomainError('CONTRACT_INTEGRATION_PROOF','Branch padrão não confirmada.',409);
  if(typeof mr.updated_at!=='string'||!Number.isFinite(Date.parse(mr.updated_at))||typeof mr.draft!=='boolean')throw new DomainError('CONTRACT_INTEGRATION_PROOF','Metadados do MR incompletos; nenhuma autorização inferida.',409);
  const root=await this.tree(ref,targetSha);let currentDigest:string|null=null;
  if(this.directory(root.get('.sdlc'))){const tree=await this.tree(ref,targetSha,'.sdlc'),entry=tree.get(executionContractPath);if(entry?.type==='blob'&&entry.mode==='100644'){
   const file=await this.call('GET',`projects/${ref.projectId}/repository/files/${encodeURIComponent(executionContractPath)}?ref=${targetSha}`);
   if(file.blob_id!==entry.id||file.encoding!=='base64'||!Number.isSafeInteger(file.size)||file.size>32768)throw new DomainError('CONTRACT_INTEGRATION_PROOF','Fonte da branch padrão não confirmada.',409);
   currentDigest=digest(Buffer.from(file.content,'base64').toString('utf8'));
  }}
  const blocks:string[]=[];let integrationSha:string|null=null,mergedAt:string|null=null;
  if(mr.state==='merged'){
   integrationSha=fullSha.parse(mr.merge_commit_sha??mr.squash_commit_sha??published.commitSha);
   if(typeof mr.merged_at!=='string'||!Number.isFinite(Date.parse(mr.merged_at)))throw new DomainError('CONTRACT_INTEGRATION_PROOF','Instante da integração não confirmado.',409);
   mergedAt=new Date(mr.merged_at).toISOString();
   const commit=await this.call('GET',`projects/${ref.projectId}/repository/commits/${integrationSha}`);
   if(commit.id!==integrationSha||!Array.isArray(commit.parent_ids)||!(integrationSha===published.commitSha||commit.parent_ids.includes(ref.baseSha)))throw new DomainError('CONTRACT_INTEGRATION_PROOF','A integração não preservou a base autorizada.',409);
   const blob=await this.exclusiveContract(ref,integrationSha),file=await this.call('GET',`projects/${ref.projectId}/repository/files/${encodeURIComponent(executionContractPath)}?ref=${integrationSha}`);
   if(file.blob_id!==blob||file.encoding!=='base64'||file.size>32768||digest(Buffer.from(file.content,'base64').toString('utf8'))!==ref.contentDigest)throw new DomainError('CONTRACT_INTEGRATION_PROOF','Conteúdo integrado não corresponde ao contrato revisado.',409);
   const ancestry=await this.call('GET',`projects/${ref.projectId}/repository/merge_base?refs[]=${integrationSha}&refs[]=${targetSha}`);
   if(ancestry.id!==integrationSha)throw new DomainError('CONTRACT_INTEGRATION_PROOF','A integração não pertence à história atual da branch padrão.',409);
  }else{
   if(mr.state!=='opened')blocks.push('O Merge Request foi fechado; não há integração autorizada.');
   if(targetSha!==ref.baseSha)blocks.push('A base da branch padrão mudou. Encerre o acompanhamento anterior e revise outra proposta sobre a nova base.');
   if(mr.has_conflicts!==false)blocks.push('Conflitos ou ausência de confirmação de conflitos impedem a integração.');
   if(mr.blocking_discussions_resolved===false)blocks.push('Há discussões obrigatórias pendentes no GitLab.');
   if(mr.head_pipeline&&(mr.head_pipeline.sha!==published.commitSha||mr.head_pipeline.status!=='success')||project.only_allow_merge_if_pipeline_succeeds&&!mr.head_pipeline)blocks.push('A política GitLab exige um pipeline aprovado para o commit do contrato. Configure o executor previsto; nenhuma proteção será desativada.');
   if(mr.detailed_merge_status!=='mergeable')blocks.push(`O GitLab ainda não liberou a integração (${String(mr.detailed_merge_status||'não informado')}).`);
   if(mr.merge_when_pipeline_succeeds!==false||mr.auto_merge_enabled===true||mr.merge_after)blocks.push('Há agendamento de merge ou ausência de confirmação dessa condição. Verifique o resultado antes de nova decisão.');
  }
  return {mrState:mr.state,draft:mr.draft||mr.work_in_progress===true||/^(Draft:|WIP:)/i.test(mr.title||''),releaseBlocked:mr.state!=='opened'||targetSha!==ref.baseSha||mr.merge_when_pipeline_succeeds!==false||mr.auto_merge_enabled===true||!!mr.merge_after,sourceSha:published.commitSha,targetSha,integrationSha,mergedAt,remoteVersion:mr.updated_at,observedAt:new Date().toISOString(),blocks,source:{sha:targetSha,digest:currentDigest,matches:currentDigest===ref.contentDigest}};
 }
 async apply(ref:ContractPublicationReference,kind:ContractIntegrationKind,expectedToken:string,beforeWrite:()=>Promise<void>){
  const before=await this.inspectIntegration(ref);
  if(integrationToken(before)!==expectedToken||before.mrState!=='opened'||before.targetSha!==ref.baseSha||kind==='merge'&&(before.draft||before.blocks.length)||kind==='release_draft'&&(!before.draft||before.releaseBlocked))throw new DomainError('CONTRACT_INTEGRATION_CHANGED','O contexto ou as verificações mudaram. Confira novamente antes de autorizar.',409);
  const checked=await this.inspectIntegration(ref);if(integrationToken(checked)!==expectedToken)throw new DomainError('CONTRACT_INTEGRATION_CHANGED','O MR mudou antes da escrita; verifique o resultado da mesma operação.',409);
  await beforeWrite();
  if(kind==='release_draft'){
   // The update endpoint has no SHA CAS. No title supplied by callers is accepted.
   await this.call('PUT',`projects/${ref.projectId}/merge_requests/${ref.knownIid}`,{title:`Contrato de execução · ${ref.proposalId}`});
  }else await this.call('PUT',`projects/${ref.projectId}/merge_requests/${ref.knownIid}/merge`,{sha:ref.knownCommitSha,should_remove_source_branch:false,squash:false});
  return this.inspectIntegration(ref);
 }
}
