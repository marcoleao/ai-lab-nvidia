import {request} from 'node:http';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {codeSchema,blockerSchema} from './code-schema.ts';
import {DomainError} from './errors.ts';

export type CodingInput={attempt:string;expectedSha:string;files:{path:string;content:string}[];prompt:string;allowDependencies:boolean;testContext?:{objective:string;behavior:string;criteria:string[];testCases:{criterionIndex:number;description:string}[]}};
const evidenceSchema=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),expectedSha:z.string().regex(/^[a-f0-9]{40}$/),policy:z.literal('qwen-code-node24-v1'),imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),model:z.string().min(1).max(128),browser:z.object({imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),scope:z.literal('react-entry-v1'),passed:z.literal(true)}).optional()});
export type CodingEvidence=z.infer<typeof evidenceSchema>;
const stageSchema=z.enum(['diagnosis','implementation','test_planning','ui_validation','targeted_repair','final_check']);
export type CodingStage=z.infer<typeof stageSchema>;
export const codingFailureCodes=['CODING_EXECUTOR_FAILED','CODING_EXECUTOR_UNKNOWN','CODING_EXECUTOR_TIMEOUT','CODING_EXECUTOR_UNAVAILABLE'] as const;
export function technicalCodingFailure(snapshot:unknown){
 if(!snapshot||typeof snapshot!=='object')return null;
 const marker=(snapshot as {codingFailure?:{code?:unknown;publication?:unknown}}).codingFailure;
 if(!marker||!codingFailureCodes.includes(marker.code as typeof codingFailureCodes[number]))return null;
 // Preserve the original known-failure marker. Unconfirmed generation needs
 // explicit evidence that the publisher was never entered; never infer it.
 if(marker.publication!==undefined&&marker.publication!=='not_started')return null;
 return marker.code==='CODING_EXECUTOR_FAILED'||marker.publication==='not_started'?marker.code as typeof codingFailureCodes[number]:null;
}
export interface CodingProvider {health?():Promise<{ready:boolean;model:string}>;generate(input:CodingInput,onProgress?:(stage:CodingStage)=>Promise<void>):Promise<{content:string;evidence:CodingEvidence}>}
const receipt=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),expectedSha:z.string().optional(),state:z.enum(['absent','queued','running','succeeded','failed','unknown','waiting_input']),patch:codeSchema.optional(),blocker:blockerSchema.optional(),validation:z.object({valid:z.boolean()}).passthrough().optional(),error:z.string().optional()}).passthrough();
export class LocalCodingProvider implements CodingProvider {
 constructor(private socketPath:string,private pause:(milliseconds:number)=>Promise<unknown>=delay){}
 private call(path:string,body?:unknown):Promise<unknown>{const payload=body===undefined?undefined:JSON.stringify(body);return new Promise((resolve,reject)=>{
  const fail=()=>new DomainError('CODING_EXECUTOR_UNAVAILABLE','O executor de codificação não confirmou o resultado. Nenhum código foi publicado. Confira a atividade antes de solicitar outra tentativa.',503);
  const req=request({socketPath:this.socketPath,path,method:payload?'POST':'GET',headers:{'Content-Type':'application/json',...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})}},response=>{const chunks:Buffer[]=[];let bytes=0;response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>180000)req.destroy(fail());else chunks.push(chunk);});response.on('error',()=>reject(fail()));response.on('end',()=>{if(response.statusCode!==200)return reject(fail());try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(fail());}});});req.setTimeout(8000,()=>req.destroy(fail()));req.on('error',()=>reject(fail()));req.end(payload);
 });}
 async health(){return z.object({ready:z.boolean(),model:z.string()}).parse(await this.call('/health'));}
 async generate(input:CodingInput,onProgress?:(stage:CodingStage)=>Promise<void>):Promise<{content:string;evidence:CodingEvidence}>{
  const {attempt,...scope}=input;const id=createHash('sha256').update(JSON.stringify({attempt,...scope})).digest('hex');const intent={id,...scope};const end=Date.now()+635000;let lastStage:CodingStage|undefined;
  let value=receipt.parse(await this.call('/jobs/'+id,intent));
  while(true){
   if(value.id!==id||value.expectedSha!==input.expectedSha)throw new DomainError('CODING_EXECUTOR_IDENTITY','A candidata não corresponde à revisão autorizada. Nenhuma publicação foi feita.',502);
   const stage=stageSchema.safeParse(value.stage);if(stage.success&&stage.data!==lastStage){lastStage=stage.data;await onProgress?.(stage.data);}
   if(value.state==='succeeded'){
    if(!value.patch||value.validation?.valid!==true)throw new DomainError('CODING_EXECUTOR_INVALID','A candidata não trouxe validação completa.',502);
    const reactEntry=input.files.some(file=>/^src\/(?:main|index)\.[jt]sx$/.test(file.path))||value.patch.files.some(file=>/^src\/(?:main|index)\.[jt]sx$/.test(file.path));
    let browser: CodingEvidence['browser'];
    if(reactEntry){const proof=z.object({browserImageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),browserChecks:z.array(z.object({applicable:z.boolean(),passed:z.boolean()})).min(1).max(3)}).safeParse(value);
     if(!proof.success||proof.data.browserChecks.at(-1)?.applicable!==true||proof.data.browserChecks.at(-1)?.passed!==true)throw new DomainError('CODING_EXECUTOR_INVALID','A candidata React não confirmou a abertura em navegador isolado.',502);
     browser={imageId:proof.data.browserImageId,scope:'react-entry-v1',passed:true};
    }
    return {content:JSON.stringify(value.patch),evidence:evidenceSchema.parse({...value,browser})};
   }
   if(value.state==='waiting_input'&&value.blocker)return {content:JSON.stringify({blocker:value.blocker}),evidence:evidenceSchema.parse(value)};
   if(value.state==='failed')throw new DomainError('CODING_EXECUTOR_FAILED','O agente não concluiu esta tentativa. Esta tentativa não publicou alterações. Retome a correção técnica com o mesmo escopo. Diagnóstico técnico: '+(value.error??'sem resultado').slice(0,1500),502);
   if(value.state==='unknown'||value.state==='absent')throw new DomainError('CODING_EXECUTOR_UNKNOWN','O resultado desta tentativa não foi confirmado. Nenhum código foi publicado. As evidências foram preservadas; revise antes de iniciar uma nova tentativa.',503);
   if(Date.now()>=end)throw new DomainError('CODING_EXECUTOR_TIMEOUT','O executor atingiu o prazo de acompanhamento. A candidata não foi publicada. As evidências ficam preservadas; uma nova tentativa exige sua retomada explícita.',504);
   await this.pause(1000);value=receipt.parse(await this.call('/jobs/'+id));
  }
 }
}
