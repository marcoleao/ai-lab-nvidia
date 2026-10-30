import {createHash} from 'node:crypto';
import {executionContractPath,executionContractLimits,fullSha,validateExecutionContract,contractFilePaths,unitPath,type ExecutionContractObservation} from '../../../packages/shared/src/execution-contract.ts';
import {DomainError} from './errors.ts';

/** Fixed read-only GitLab capability. Paths come only from a validated contract;
 * references and files are inspected as data, never as commands or prompts. */
export async function readExecutionContract(config:{base:string;token:string;root:string},projectId:number,requestedSha?:string):Promise<ExecutionContractObservation>{
 if(!Number.isSafeInteger(projectId)||projectId<1||requestedSha&&!fullSha.safeParse(requestedSha).success)throw new DomainError('CONTRACT_INVALID_REFERENCE','Informe o commit completo desta revisão.',422);
 const started=Date.now();let requests=0;
 const fail=(message='O GitLab não confirmou a consulta do contrato. Tente consultar novamente; nenhuma aplicação foi alterada.')=>new DomainError('EXECUTION_CONTRACT_UNAVAILABLE',message,503);
 async function get(path:string,missing=false){
  if(++requests>executionContractLimits.requests||Date.now()-started>=executionContractLimits.durationMs)throw fail('A consulta excedeu o limite de leitura do contrato. Não foi possível conferir todas as referências; nenhuma cobertura parcial foi aprovada.');
  let response:Response;try{response=await fetch(`${config.base.replace(/\/$/,'')}/api/v4/${path}`,{method:'GET',redirect:'error',headers:{'PRIVATE-TOKEN':config.token},signal:AbortSignal.timeout(Math.max(1,Math.min(8000,executionContractLimits.durationMs-(Date.now()-started))))});}catch{throw fail();}
  if(missing&&response.status===404)return null;
  if(!response.ok)throw fail(response.status===401||response.status===403?'A integração não confirmou acesso ao contrato. Consulte a configuração em Integrações e tente novamente.':undefined);
  // Bound the response before parsing, including chunked/incorrect Content-Length.
  const reader=response.body?.getReader();if(!reader)throw fail();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw fail('A resposta excede o limite desta consulta. A leitura ficou incompleta.');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(error){if(error instanceof DomainError)throw error;throw fail();}
 }
 const project=await get(`projects/${projectId}`);
 if(project?.id!==projectId||project.archived||typeof project.path_with_namespace!=='string'||!project.path_with_namespace.startsWith(config.root+'/')||!Array.isArray(project.topics)||!project.topics.includes('sdlc-managed'))throw new DomainError('EXECUTION_CONTRACT_SCOPE','O repositório não pertence ao escopo gerenciado deste Sistema.',403);
 if(typeof project.default_branch!=='string'||!project.default_branch.length||project.default_branch.length>255)throw fail('O GitLab não confirmou a branch padrão. O contrato ainda não pôde ser consultado.');
 const branch=String(project.default_branch);
 async function head(){const value=await get(`projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`);if(value?.name!==branch||!fullSha.safeParse(value.commit?.id).success)throw fail();return value.commit.id as string;}
 const initialHead=await head(),sha=requestedSha??initialHead;
 if(requestedSha){const commit=await get(`projects/${projectId}/repository/commits/${sha}`,true);if(!commit||commit.id!==sha)throw new DomainError('EXECUTION_CONTRACT_COMMIT_NOT_FOUND','O commit solicitado não foi confirmado neste repositório. Revise o SHA completo.',409);}
 type Entry={id:string;path:string;type:string;mode:string};
 const directories=new Map<string,Promise<Entry[]|null>>();
 async function directory(path:string):Promise<Entry[]|null>{
  if(directories.has(path))return directories.get(path)!;
  const promise=(async()=>{
   if(path!=='.'){const slash=path.lastIndexOf('/'),parent=slash<0?'.':path.slice(0,slash),entries=await directory(parent),entry=entries?.find(v=>v.path===path);if(!entry)return null;if(entry.type!=='tree'||entry.mode!=='040000')return null;}
   const rows:Entry[]=[];
   for(let page=1;page<=10;page++){
    const query=new URLSearchParams({ref:sha,per_page:'100',page:String(page),...(path!=='.'?{path}:{})}),body=await get(`projects/${projectId}/repository/tree?${query}`,true);
    // The root or a directory already proven by its parent must exist at this
    // immutable commit. A 404 here is an unconfirmed read, not a missing file.
    if(body===null)throw fail('A árvore do repositório não foi confirmada neste commit. Não é possível concluir que o contrato está ausente.');
    if(!Array.isArray(body)||body.length>100||body.some(v=>!v||typeof v.path!=='string'||!fullSha.safeParse(v.id).success||typeof v.type!=='string'||typeof v.mode!=='string'))throw fail();
    rows.push(...body);if(body.length<100)return rows;
   }
   throw fail('Há mais de 1.000 entradas em uma pasta consultada. O limite impede confirmar todas as referências; a consulta não é apresentada como completa.');
  })();directories.set(path,promise);return promise;
 }
 async function file(path:string){const slash=path.lastIndexOf('/'),entries=await directory(slash<0?'.':path.slice(0,slash)),entry=entries?.find(v=>v.path===path);return !entry?{path,state:'missing' as const}:entry.type==='blob'&&['100644','100755'].includes(entry.mode)?{path,state:'present' as const,blobId:entry.id}:{path,state:'unsupported' as const};}
 const contractFile=await file(executionContractPath);
 const base={projectId,branch,sha,mode:requestedSha?'commit' as const:'branch' as const,path:executionContractPath as typeof executionContractPath,digest:null as string|null,blobId:null as string|null,schemaVersion:null as number|null,units:[],issues:[],files:[]};
 let result:Omit<ExecutionContractObservation,'observedHeadSha'|'headChanged'|'observedAt'>;
 if(contractFile.state==='missing')result={...base,state:'missing',message:'Contrato de execução não encontrado neste commit. O contrato descritivo e o cadastro do repositório não substituem o formato versionado.'};
 else if(contractFile.state==='unsupported')result={...base,state:'invalid',message:'O contrato precisa ser um arquivo regular. Links e arquivos especiais não são aceitos.',issues:[{path:executionContractPath,message:'Arquivo fora da cobertura desta leitura.'}]};
 else{
  const body=await get(`projects/${projectId}/repository/files/${encodeURIComponent(executionContractPath)}?ref=${sha}`);
  if(body?.file_path!==executionContractPath||body.ref!==sha||body.commit_id!==sha||body.blob_id!==contractFile.blobId||body.encoding!=='base64'||!Number.isSafeInteger(body.size)||body.size<0)throw fail();
  if(body.size>executionContractLimits.bytes||typeof body.content!=='string'||body.content.length>45000)result={...base,state:'invalid',message:'O contrato excede o limite de 32 KiB desta versão. Nenhuma leitura truncada foi validada.'};
  else{
   if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.content))throw fail();
   const bytes=Buffer.from(body.content,'base64'),digest=createHash('sha256').update(bytes).digest('hex');if(digest!==body.content_sha256)throw fail();
   let parsed:unknown;try{if(bytes.length>executionContractLimits.bytes)throw Error();parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{parsed=undefined;}
   const checked=validateExecutionContract(parsed),files:ExecutionContractObservation['files']=[];const issues=[...checked.issues];
   if(checked.state==='valid'){
    for(const path of contractFilePaths(checked.units)){const value=await file(path);files.push({path:value.path,state:value.state});}
    for(const unit of checked.units){const path=unitPath(unit.path,unit.artifact.context);if(!await directory(path))issues.push({path:`units.${unit.id}.artifact.context`,message:'Pasta de contexto não encontrada como diretório regular neste commit.'});}
    for(const value of files)if(value.state!=='present')issues.push({path:value.path,message:value.state==='missing'?'Entrada declarada não encontrada neste commit.':'Links e arquivos especiais não são aceitos como entradas de execução.'});
   }
   result={...base,state:checked.state==='valid'&&issues.length?'invalid':checked.state,message:checked.state==='unsupported'?'Versão do contrato não suportada. Esta leitura reconhece schemaVersion 1.':checked.state==='valid'&&!issues.length?'Estrutura e entradas declaradas conferidas neste commit. Execução e ferramentas ainda não foram autorizadas ou avaliadas.':'Contrato incompleto ou inválido. Revise os pontos encontrados antes das próximas etapas.',digest,blobId:contractFile.blobId!,schemaVersion:checked.schemaVersion,units:checked.units,files,issues:issues.slice(0,20)};
   if(issues.length>20)result.issues.push({path:'contrato',message:'Há outros pontos além dos 20 apresentados. A estrutura não foi aprovada parcialmente.'});
  }
 }
 const observedHeadSha=await head(),afterProject=await get(`projects/${projectId}`);
 if(afterProject?.id!==projectId||afterProject.archived||afterProject.default_branch!==branch||afterProject.path_with_namespace!==project.path_with_namespace||!Array.isArray(afterProject.topics)||!afterProject.topics.includes('sdlc-managed'))throw new DomainError('EXECUTION_CONTRACT_CONTEXT_CHANGED','O contexto remoto mudou durante a leitura. Consulte novamente; nenhum contrato foi confirmado para o novo destino.',409);
 return {...result,observedHeadSha,headChanged:observedHeadSha!==initialHead,observedAt:new Date().toISOString()};
}
