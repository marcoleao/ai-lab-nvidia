import {z} from 'zod';
import {DomainError} from './errors.ts';
import {request} from 'node:http';

type RelayRequest={method:'GET'|'POST';headers:Record<string,string>;body?:string;signal:AbortSignal;redirect:'error'};
// Native HTTP respects the single explicit AbortSignal deadline. Built-in fetch
// has an independent five-minute header deadline for non-streaming inference.
async function relayRequest(url:string,options:RelayRequest):Promise<Pick<Response,'ok'|'status'|'text'>>{
 return await new Promise((resolve,reject)=>{
  const body=options.body===undefined?undefined:Buffer.from(options.body);
  const req=request(url,{method:options.method,headers:{...options.headers,...(body?{'Content-Length':String(body.length)}:{})},signal:options.signal},response=>{
   const chunks:Buffer[]=[];let bytes=0;
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024){req.destroy(new DomainError('LLM_INVALID_RESPONSE','Resposta do modelo excedeu o limite.',502));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('aborted',()=>reject(new Error('Relay response interrupted')));
   response.on('end',()=>{const status=response.statusCode??502;resolve({ok:status>=200&&status<300,status,text:async()=>Buffer.concat(chunks).toString('utf8')});});
  });
  req.on('error',reject);req.end(body);
 });
}

export interface LLMProvider {
  model:string;
  models(signal?:AbortSignal):Promise<string[]>;
  complete(messages:{role:'system'|'user'|'assistant';content:string}[],options?:{signal?:AbortSignal;json?:boolean;maxTokens?:number;schema?:Record<string,unknown>}):Promise<{model:string;content:string}>;
}
export class LocalLLMProvider implements LLMProvider {
  constructor(private base:string,public model:string,private token:string,private timeoutMs=420000,private transport:typeof relayRequest=relayRequest){
    const url=new URL(base);
    // Local inference only: do not accept cloud endpoints or URL credentials.
    const host=url.hostname;
    if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash||!(/^(localhost|127\.0\.0\.1|10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(host)))throw new Error('Local LLM requires an internal HTTP endpoint');
    if(!model.trim()||!token.trim())throw new Error('Local LLM requires model and relay credential');
  }
  private async call(path:string,body:unknown|undefined,signal?:AbortSignal){
    try{
      const response=await this.transport(`${this.base.replace(/\/$/,'')}/v1/${path}`,{method:body===undefined?'GET':'POST',redirect:'error',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([AbortSignal.timeout(body===undefined?4000:this.timeoutMs),...(signal?[signal]:[])])});
      if(!response.ok)throw new DomainError('LLM_REQUEST_FAILED',`Modelo local recusou a solicitação (HTTP ${response.status}).`,502);
      const raw=await response.text();if(raw.length>2*1024*1024)throw new DomainError('LLM_INVALID_RESPONSE','Resposta do modelo excedeu o limite.',502);
      return JSON.parse(raw) as unknown;
    }catch(error){
      if(error instanceof DomainError)throw error;
      if(signal?.aborted)throw new DomainError('LLM_CANCELLED','Consulta ao modelo cancelada.',409);
      if(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name))throw new DomainError('LLM_TIMEOUT','O modelo local excedeu o tempo de resposta.',504);
      throw new DomainError('LLM_UNAVAILABLE','Não foi possível consultar o modelo local. Nenhuma resposta substituta foi gerada.',503);
    }
  }
  async models(signal?:AbortSignal){
    const parsed=z.object({data:z.array(z.object({id:z.string().min(1)})).max(200)}).safeParse(await this.call('models',undefined,signal));
    if(!parsed.success)throw new DomainError('LLM_INVALID_RESPONSE','Catálogo de modelos inválido.',502);
    return parsed.data.data.map(m=>m.id);
  }
  async complete(messages:{role:'system'|'user'|'assistant';content:string}[],options:{signal?:AbortSignal;json?:boolean;maxTokens?:number;schema?:Record<string,unknown>}={}){
    const input=z.array(z.object({role:z.enum(['system','user','assistant']),content:z.string().min(1).max(16000)})).min(1).max(20).parse(messages);
    const tokens=z.number().int().min(1).max(8192).parse(options.maxTokens??1024);
    const raw=await this.call('chat/completions',{model:this.model,messages:input,stream:false,reasoning_effort:'none',temperature:0.2,max_tokens:tokens,...(options.schema?{response_format:{type:'json_schema',json_schema:{name:'sdlc_plan',strict:true,schema:options.schema}}}:options.json?{response_format:{type:'json_object'}}:{})},options.signal);
    const parsed=z.object({model:z.string(),choices:z.array(z.object({finish_reason:z.string().nullable().optional(),message:z.object({content:z.string().trim().min(1)})})).min(1)}).safeParse(raw);
    if(parsed.success&&parsed.data.choices[0].finish_reason==='length')throw new DomainError('LLM_OUTPUT_LIMIT','O modelo atingiu o limite de geração. Nenhum item foi criado.',502);
    if(!parsed.success)throw new DomainError('LLM_INVALID_RESPONSE','Resposta vazia, inválida ou incompleta do modelo local.',502);
    if(parsed.data.model!==this.model)throw new DomainError('LLM_MODEL_MISMATCH','O serviço respondeu com outro modelo.',502);
    const content=parsed.data.choices[0].message.content;
    if(options.json){try{JSON.parse(content);}catch{throw new DomainError('LLM_INVALID_JSON','O modelo não retornou JSON válido.',502);}}
    return {model:parsed.data.model,content};
  }
}
