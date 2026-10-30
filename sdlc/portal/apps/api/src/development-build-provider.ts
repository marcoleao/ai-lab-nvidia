import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {readExecutionContract} from './execution-contract-gitlab.ts';
import {fullSha,type ExecutionContractObservation} from '../../../packages/shared/src/execution-contract.ts';
import {DomainError} from './errors.ts';
import {developmentBuildDockerfile,developmentBuildPackages} from '../../../packages/shared/src/development-build.ts';
export const developmentBuildPolicy='node24-react-v1';
export type BuildSource={projectId:number;integrationSha:string;targetBranch:string};
export type BuildIntent={id:string;projectId:number;sourceSha:string;contractDigest:string;unitId:string;baseImageId:string;policyVersion:string;purpose?:'application_preparation'};
export type BuildInspection={sha:string;branch:string;contract:ExecutionContractObservation;executor:{ready:boolean;policyVersion:string;baseImageId:string|null;preparationVerification?:true};blockers:string[]};
export type BuildResult={id:string;state:'queued'|'running'|'failed'|'unknown'|'succeeded'|'absent';imageId?:string;archiveDigest?:string;size?:number;technicalTestPassed?:true;code?:string};
export interface DevelopmentBuildProvider {health?():Promise<BuildInspection['executor']>;inspect(source:BuildSource):Promise<BuildInspection>;start(intent:BuildIntent):Promise<BuildResult>;read(intent:BuildIntent):Promise<BuildResult>}
const image=z.string().regex(/^sha256:[a-f0-9]{64}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema=z.object({id:z.string(),state:z.enum(['queued','running','failed','unknown','succeeded','absent']),imageId:image.optional(),archiveDigest:digest.optional(),size:z.number().int().positive().max(536870912).optional(),technicalTestPassed:z.literal(true).optional(),code:z.enum(['SOURCE_UNAVAILABLE','SOURCE_UNSAFE','CONTRACT_CHANGED','PROFILE_UNSUPPORTED','BUILD_FAILED','BUILD_TIMEOUT','ARTIFACT_UNCONFIRMED','EXECUTOR_INTERRUPTED']).optional()}).strict().superRefine((v,c)=>{if(v.state==='succeeded'&&(!v.imageId||!v.archiveDigest||!v.size))c.addIssue({code:'custom',message:'Incomplete artifact proof'});});
export class GitLabDevelopmentBuildProvider implements DevelopmentBuildProvider {
 constructor(private config:{base:string;token:string;root:string;socketPath:string}){}
 private fail(){return new DomainError('DEVELOPMENT_BUILD_UNAVAILABLE','Não foi possível conferir a fonte ou o executor da construção. Nenhuma prontidão foi presumida.',503);}
 private async git(path:string,missing=false){let r:Response;try{r=await fetch(`${this.config.base.replace(/\/$/,'')}/api/v4/${path}`,{headers:{'PRIVATE-TOKEN':this.config.token},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw this.fail();}if(missing&&r.status===404)return null;if(!r.ok)throw this.fail();const bytes=await r.arrayBuffer();if(bytes.byteLength>262144)throw this.fail();try{return JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw this.fail();}}
 private executor(path:string,body?:BuildIntent):Promise<unknown>{const payload=body?JSON.stringify(body):undefined;return new Promise((resolve,reject)=>{const req=httpRequest({socketPath:this.config.socketPath,path,method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})},timeout:8000},response=>{const chunks:Buffer[]=[];let size=0;response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>65536){req.destroy();reject(this.fail());}else chunks.push(chunk);});response.on('end',()=>{if(response.statusCode!==200){reject(this.fail());return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(this.fail());}});});req.on('error',()=>reject(this.fail()));req.on('timeout',()=>{req.destroy();reject(this.fail());});req.end(payload);});}
 async inspect(source:BuildSource):Promise<BuildInspection>{
  if(!Number.isSafeInteger(source.projectId)||source.projectId<1||!fullSha.safeParse(source.integrationSha).success)throw this.fail();
  const branch=await this.git(`projects/${source.projectId}/repository/branches/${encodeURIComponent(source.targetBranch)}`),sha=fullSha.parse(branch?.commit?.id);
  if(branch.name!==source.targetBranch)throw this.fail();
  const contract=await readExecutionContract(this.config,source.projectId,sha),base=await this.git(`projects/${source.projectId}/repository/merge_base?refs[]=${source.integrationSha}&refs[]=${sha}`);
  if(base?.id!==source.integrationSha)throw new DomainError('DEVELOPMENT_BUILD_ANCESTRY','A fonte DEV não comprova a integração desta História. Revise o destino e a referência do merge.',409);
  let executor:BuildInspection['executor']={ready:false,policyVersion:developmentBuildPolicy,baseImageId:null};
  try{executor=await this.health();}catch{}
  const blockers:string[]=[];
  if(contract.branch!==source.targetBranch)blockers.push('Esta primeira capacidade exige o destino DEV na branch padrão do Sistema.');
  if(contract.state!=='valid'||!contract.digest)blockers.push('Prepare e integre um contrato de execução válido no Sistema antes de construir.');
  if(contract.units.length!==1||contract.units[0]?.runtime.kind!=='node'||contract.units[0]?.runtime.version!=='24'||contract.units[0]?.migrations.mode!=='none'||contract.units[0]?.health.kind!=='http')blockers.push('O primeiro executor aceita uma unidade HTTP Node 24 sem migração de dados.');
  if(contract.state==='valid'&&contract.units.length===1){const u=contract.units[0];
   if(u.path!=='.'||u.build.entrypoint!=='scripts/build.mjs'||u.test.entrypoint!=='scripts/test.mjs'||u.artifact.dockerfile!=='Dockerfile'||u.artifact.context!=='.'||u.health.kind!=='http'||u.health.path!=='/health'||u.health.port!==8080)blockers.push('Use o perfil inicial na raiz: scripts/build.mjs, scripts/test.mjs, Dockerfile controlado, server.mjs e HTTP /health na porta 8080.');
   else{const file=await this.git(`projects/${source.projectId}/repository/files/Dockerfile?ref=${sha}`);let recipe='';try{const content=Buffer.from(file.content,'base64');if(content.length>32768||createHash('sha256').update(content).digest('hex')!==file.content_sha256||file.file_path!=='Dockerfile'||file.commit_id!==sha)throw Error();recipe=content.toString('utf8').split(/\r?\n/).map(v=>v.trim()).filter(Boolean).join('\n');}catch{throw this.fail();}if(recipe!==developmentBuildDockerfile)blockers.push('O Dockerfile não corresponde ao perfil controlado Node 24/React. Revise a preparação técnica no Sistema.');}
   const manifest=await this.git(`projects/${source.projectId}/repository/files/package.json?ref=${sha}`,true);
   if(!manifest)blockers.push('Prepare package.json com as versões de dependências suportadas pelo perfil Node 24/React.');
   else{try{const bytes=Buffer.from(manifest.content,'base64');if(bytes.length>32768||manifest.commit_id!==sha||manifest.file_path!=='package.json'||createHash('sha256').update(bytes).digest('hex')!==manifest.content_sha256)throw Error();const parsed=JSON.parse(bytes.toString('utf8'));if(['dependencies','devDependencies'].some(field=>parsed[field]&&(typeof parsed[field]!=='object'||Array.isArray(parsed[field])||Object.entries(parsed[field]).some(([name,version])=>developmentBuildPackages[name as keyof typeof developmentBuildPackages]!==version))))blockers.push('O manifesto pede dependências fora das versões preparadas. O executor não instala pacotes nem executa scripts de instalação.');}catch{blockers.push('O manifesto de dependências não pôde ser validado neste perfil. Revise package.json no Sistema.');}}
  }
  if(contract.headChanged||contract.observedHeadSha!==sha)blockers.push('A base mudou durante a conferência. Consulte novamente.');
  if(!executor.ready)blockers.push('O executor Node 24/React ainda não confirmou sua imagem de ferramentas. Confira a configuração do laboratório.');
  return {sha,branch:source.targetBranch,contract,executor,blockers};
 }
 private validate(intent:BuildIntent,value:unknown){const result=resultSchema.parse(value);if(result.id!==intent.id)throw this.fail();return result;}
 async health():Promise<BuildInspection['executor']>{const value=z.object({ready:z.boolean(),policyVersion:z.literal(developmentBuildPolicy),baseImageId:image}).strict().parse(await this.executor('/health'));try{const capabilities=z.object({applicationPreparation:z.literal(true)}).strict().parse(await this.executor('/capabilities'));if(capabilities.applicationPreparation)return {...value,preparationVerification:true};}catch{}return value;}
 async start(intent:BuildIntent){return this.validate(intent,await this.executor('/builds/'+encodeURIComponent(intent.id),intent));}
 async read(intent:BuildIntent){return this.validate(intent,await this.executor('/builds/'+encodeURIComponent(intent.id)));}
}
