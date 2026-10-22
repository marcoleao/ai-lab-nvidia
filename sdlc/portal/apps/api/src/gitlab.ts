import { runtimeFiles } from '@sdlc/templates';
import {createHash} from 'node:crypto';
import { DomainError } from './errors.ts';
import {validatePatch,type CodePatch} from './code-schema.ts';
export type CodeContext={sha:string;targetBranch:string;files:{path:string;content:string}[]};
export type PublishedCode={sha:string;url:string};

type Group = {id:number;full_path:string;description?:string;web_url?:string};
type Project = {id:number;name?:string;path_with_namespace:string;web_url:string;topics?:string[];empty_repo?:boolean;archived?:boolean};
export interface GitProvider {
  codeContext?(id:number):Promise<CodeContext>;
  publishCode?(id:number,runId:string,context:CodeContext,patch:CodePatch,title:string,permissions?:{dependencies:boolean}):Promise<PublishedCode>;
  health():Promise<boolean>;
  ensureGroup(path:string):Promise<Group>;
  ensureProject(group:Group,key:string,runtime:'node'|'python',name:string):Promise<Project>;
  inspectProject(id:number):Promise<Project>;
}
export class GitLabProvider implements GitProvider {
  async codeContext(id:number):Promise<CodeContext>{
    const project=await this.call<Project&{default_branch:string}>('GET',`projects/${id}`);
    if(!project||project.archived||!project.default_branch)throw new DomainError('REPOSITORY_NOT_READY','Repositório sem branch padrão disponível.',409);
    const branch=await this.call<{commit:{id:string}}>('GET',`projects/${id}/repository/branches/${encodeURIComponent(project.default_branch)}`);
    if(!branch)throw new Error('Branch ausente');
    const sha=branch.commit.id;
    const tree=await this.call<{path:string;type:string;mode:string}[]>('GET',`projects/${id}/repository/tree?ref=${sha}&recursive=true&per_page=100`);
    const more=await this.call<unknown[]>('GET',`projects/${id}/repository/tree?ref=${sha}&recursive=true&per_page=100&page=2`);
    if(more?.length)throw new DomainError('REPOSITORY_TOO_LARGE','Esta fatia aceita repositórios de até 100 entradas. Reduza o escopo antes de gerar.',409);
    const files:CodeContext['files']=[];let size=0;
    for(const entry of tree??[]){
      if(entry.type!=='blob'||entry.mode!=='100644'||(!/\.(ts|tsx|js|jsx|mjs|cjs|py|html|css|json|md)$/.test(entry.path)&&! /^(requirements\.txt|pyproject\.toml)$/.test(entry.path))||entry.path.split('/').some(p=>p.startsWith('.'))||/lock|node_modules|vendor|secret|credential/i.test(entry.path))continue;
      if(files.length>=16)throw new DomainError('REPOSITORY_TOO_LARGE','Mais de 16 arquivos de contexto; selecione uma história menor.',409);
      const file=await this.call<{content:string;encoding:string;size:number}>('GET',`projects/${id}/repository/files/${encodeURIComponent(entry.path)}?ref=${sha}`);
      if(!file||file.encoding!=='base64'||file.size>12000)throw new DomainError('FILE_TOO_LARGE','Arquivo do contexto excede o limite desta fatia.',409);
      const content=Buffer.from(file.content,'base64').toString('utf8');size+=content.length;
      if(size>18000)throw new DomainError('REPOSITORY_TOO_LARGE','Contexto do código excede 18000 caracteres.',409);
      files.push({path:entry.path,content});
    }
    return {sha,targetBranch:project.default_branch,files};
  }
  async publishCode(id:number,runId:string,context:CodeContext,input:CodePatch,title:string,permissions:{dependencies:boolean}={dependencies:false}):Promise<PublishedCode>{
    const patch=validatePatch(input,permissions);
    if(!/^[a-z0-9]{10,40}$/.test(runId)||!/^[a-f0-9]{40}$/.test(context.sha))throw new Error('Invalid execution reference');
    const branch=`sdlc/story-${runId}`,marker=`SDLC execution ${runId}`;
    let head=await this.call<{commit:{id:string;message:string}}>('GET',`projects/${id}/repository/branches/${encodeURIComponent(branch)}`,undefined,true);
    if(head&&!head.commit.message.includes(marker))throw new DomainError('BRANCH_COLLISION','Branch alterada externamente; revisão necessária.',409);
    let sha=head?.commit.id;
    if(!sha){
      const current=await this.call<{commit:{id:string}}>('GET',`projects/${id}/repository/branches/${encodeURIComponent(context.targetBranch)}`);
      if(current?.commit.id!==context.sha)throw new DomainError('BASE_CHANGED','A branch de destino mudou. Gere uma nova execução.',409);
      const commit=await this.call<{id:string}>('POST',`projects/${id}/repository/commits`,{branch,start_sha:context.sha,commit_message:`${marker} [skip ci]`,actions:patch.files.map(f=>({action:context.files.some(old=>old.path===f.path)?'update':'create',file_path:f.path,content:f.content}))});
      if(!commit)throw new Error('Commit ausente');sha=commit.id;
    }
    const existing=await this.call<{web_url:string;state:string;sha:string}[]>('GET',`projects/${id}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all`);
    if(existing?.length){if(existing.length!==1||existing[0].state!=='opened'||existing[0].sha!==sha)throw new DomainError('MR_CHANGED','Merge Request alterada externamente; revisão necessária.',409);return {sha,url:existing[0].web_url};}
    const mr=await this.call<{web_url:string}>('POST',`projects/${id}/merge_requests`,{source_branch:branch,target_branch:context.targetBranch,title:`Draft: ${title.slice(0,110)}`,description:`${marker}\n\n${patch.summary}\n\nCódigo gerado por IA. Testes automatizados, Code Review e Security Scan ainda não foram executados por este fluxo.`,remove_source_branch:false});
    if(!mr)throw new Error('MR ausente');return {sha,url:mr.web_url};
  }
  constructor(private base:string,private token:string,private root='sdlc') {
    const url = new URL(base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('Invalid GitLab URL');
    if(!/^[a-z][a-z0-9-]{1,40}$/.test(root)) throw new Error('Invalid GitLab root');
  }
  private async call<T>(method:string,path:string,body?:unknown,missing=false):Promise<T|null> {
    let response:Response;
    try {response=await fetch(`${this.base.replace(/\/$/,'')}/api/v4/${path}`,{method,redirect:'error',headers:{'PRIVATE-TOKEN':this.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});}
    catch {throw new DomainError('GITLAB_UNAVAILABLE','GitLab indisponível. O planejamento foi preservado.',503);}
    if(missing&&response.status===404) return null;
    if(!response.ok){
      const validation=await response.json().catch(()=>null);
      throw new DomainError('GITLAB_REQUEST_FAILED',`GitLab recusou a operação (HTTP ${response.status}). Verifique o acesso da integração.`,502,{method,path,status:response.status,validation});
    }
    return response.status===204 ? null : await response.json() as T;
  }
  async health(){await this.call('GET','version');return true;}
  async inspectProject(id:number):Promise<Project>{
    if(!Number.isSafeInteger(id)||id<1)throw new DomainError('INVALID_REPOSITORY','Informe um ID GitLab válido.');
    const project=await this.call<Project>('GET',`projects/${id}`);
    if(!project||project.archived)throw new DomainError('INVALID_REPOSITORY','Repositório indisponível ou arquivado.');
    return project;
  }
  async ensureGroup(path:string):Promise<Group> {
    if(!/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(path)||path.split('/')[0]!==this.root) throw new DomainError('INVALID_NAMESPACE','Namespace inválido.');
    const existing=await this.call<Group>('GET',`groups/${encodeURIComponent(path)}`,undefined,true);
    if(existing){if(!existing.description?.includes('[sdlc-managed]')) throw new DomainError('GITLAB_COLLISION','O grupo existente não pertence ao SDLC.',409);return existing;}
    const parts=path.split('/');
    const parent=parts.length===2 ? await this.ensureGroup(parts[0]) : undefined;
    const created=await this.call<Group>('POST','groups',{name:parts.at(-1),path:parts.at(-1),parent_id:parent?.id,visibility:'private',description:'Gerenciado pelo Portal SDLC [sdlc-managed]'});
    if(!created) throw new Error('Missing GitLab group');
    return created;
  }
  async ensureProject(group:Group,key:string,runtime:'node'|'python',name:string):Promise<Project> {
    if(!/^[a-z][a-z0-9-]{1,39}$/.test(key)) throw new DomainError('INVALID_PROJECT_KEY','Chave de repositório inválida.');
    const path=`${group.full_path}/${key}`;
    let project=await this.call<Project>('GET',`projects/${encodeURIComponent(path)}`,undefined,true);
    if(project&&!project.topics?.includes('sdlc-managed')) throw new DomainError('GITLAB_COLLISION','O repositório existente não pertence ao SDLC.',409);
    project ??= await this.call<Project>('POST','projects',{name:`${name} · ${key.toUpperCase()}`,path:key,namespace_id:group.id,visibility:'private',initialize_with_readme:false,auto_devops_enabled:false,topics:['sdlc-managed'],only_allow_merge_if_pipeline_succeeds:true});
    if(!project) throw new Error('Missing GitLab project');
    const contract=await this.call('GET',`projects/${project.id}/repository/files/${encodeURIComponent('.sdlc/contract.md')}?ref=main`,undefined,true);
    if(!contract){
      const tree=await this.call<unknown[]>('GET',`projects/${project.id}/repository/tree?ref=main`,undefined,true);
      if(tree?.length) throw new DomainError('GITLAB_COLLISION','Repositório gerenciado sem contrato de runtime; revisão administrativa necessária.',409);
      await this.call('POST',`projects/${project.id}/repository/commits`,{branch:'main',commit_message:'Inicializa contrato neutro de runtime',actions:Object.entries(runtimeFiles(runtime,name)).map(([file_path,content])=>({action:'create',file_path,content}))});
    }
    await this.call('PUT',`projects/${project.id}`,{default_branch:'main',auto_devops_enabled:false});
    const protection=`projects/${project.id}/protected_branches/main`;
    type Protection={push_access_levels:{id:number;access_level:number;user_id?:number;group_id?:number}[];allow_force_push:boolean};
    const current=await this.call<Protection>('GET',protection,undefined,true);
    const needsProtection=!current||current.allow_force_push||current.push_access_levels.some(level=>level.access_level!==0||level.user_id||level.group_id);
    if(current&&needsProtection){
      // CE ignores granular access-level updates in some releases. Recreate the
      // rule only for the exact untouched neutral bootstrap, never business code.
      const commits=await this.call<{id:string}[]>('GET',`projects/${project.id}/repository/commits?ref_name=main&per_page=2`);
      const tree=await this.call<{path:string;id:string;type:string}[]>('GET',`projects/${project.id}/repository/tree?ref=main&recursive=true&per_page=100`);
      const files=runtimeFiles(runtime,name);const blobs=tree?.filter(file=>file.type==='blob')??[];
      const neutral=commits?.length===1&&blobs.length===Object.keys(files).length&&blobs.every(file=>{
        const content=files[file.path];if(content===undefined)return false;
        return createHash(file.id.length===64?'sha256':'sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex')===file.id;
      });
      if(!neutral)throw new DomainError('BRANCH_PROTECTION_FAILED','Proteção existente requer revisão administrativa; o conteúdo foi preservado.',409,current);
      await this.call('DELETE',protection);
    }
    if(needsProtection)await this.call('POST',`projects/${project.id}/protected_branches`,{name:'main',push_access_level:0,merge_access_level:40,allow_force_push:false});
    const checked=await this.call<Protection>('GET',protection);
    if(!checked||checked.allow_force_push||checked.push_access_levels.some(level=>level.access_level!==0||level.user_id||level.group_id))throw new DomainError('BRANCH_PROTECTION_FAILED','Proteção da main não confirmada. O projeto não está pronto.',409,checked);
    return project;
  }
}
