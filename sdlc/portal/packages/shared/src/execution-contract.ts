import {z} from 'zod';
export const executionContractPath='.sdlc/execution.json';
export const executionContractLimits={bytes:32768,units:8,files:48,requests:128,durationMs:20000} as const;
export const fullSha=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const safeContractPath=(value:string)=>value.length<=180&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)&&value.split('/').length<=8&&!value.split('/').some(part=>['.','..','.git','.ssh','.aws'].includes(part)||/^\.env(?:\.|$)/.test(part));
const safePath=safeContractPath;
const file=z.string().refine(safePath),directory=z.string().refine(value=>value==='.'||safePath(value));
const entrypoint=z.object({entrypoint:file}).strict();
const unit=z.object({
 id:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),path:directory,
 runtime:z.object({kind:z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),version:z.string().regex(/^\d+(?:\.\d+){0,2}$/)}).strict(),
 build:entrypoint,test:entrypoint,
 artifact:z.object({dockerfile:file,context:directory}).strict(),
 health:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('http'),path:z.string().regex(/^\/[A-Za-z0-9/_-]{0,179}$/),port:z.number().int().min(1).max(65535),status:z.literal(200)}).strict(),
  z.object({kind:z.literal('process'),exitCode:z.literal(0)}).strict()
 ]),
 migrations:z.discriminatedUnion('mode',[
  z.object({mode:z.literal('none')}).strict(),
  z.object({mode:z.literal('scripts'),apply:file,rollback:file}).strict()
 ])
}).strict();
export const executionContractSchema=z.object({schemaVersion:z.literal(1),units:z.array(unit).min(1).max(executionContractLimits.units)}).strict().superRefine((value,context)=>{if(new Set(value.units.map(v=>v.id)).size!==value.units.length)context.addIssue({code:'custom',path:['units'],message:'Duplicate unit identifiers'});});
export type ExecutionContract=z.infer<typeof executionContractSchema>;
export type ExecutionContractIssue={path:string;message:string};
export type ExecutionContractObservation={
 projectId:number;branch:string;sha:string;mode:'branch'|'commit';observedHeadSha:string;headChanged:boolean;observedAt:string;
 state:'valid'|'invalid'|'missing'|'unsupported';message:string;path:typeof executionContractPath;digest:string|null;blobId:string|null;schemaVersion:number|null;
 units:ExecutionContract['units'];issues:ExecutionContractIssue[];files:{path:string;state:'present'|'missing'|'unsupported'}[];
};
export type ExecutionContractReading={
 system:{id:string;key:string;name:string;version:number};repository:{id:string;name:string;version:number;state:string;projectId:number|null}|null;
 observation:ExecutionContractObservation|null;unavailableReason:string|null;asOf:string;executionAvailable:false;tooling:'not_evaluated';
};
const knownFields=new Set(['schemaVersion','units','id','path','runtime','kind','version','build','test','entrypoint','artifact','dockerfile','context','health','port','status','exitCode','migrations','mode','apply','rollback']);
export function validateExecutionContract(value:unknown){
 const version=(value as {schemaVersion?:unknown}|null)?.schemaVersion;
 if(typeof version==='number'&&Number.isSafeInteger(version)&&version>0&&version!==1)return {state:'unsupported' as const,schemaVersion:version,units:[],issues:[{path:'schemaVersion',message:'Versão do contrato não suportada por esta leitura. A versão reconhecida é 1.'}]};
 const parsed=executionContractSchema.safeParse(value);
 if(parsed.success)return {state:'valid' as const,schemaVersion:1,units:parsed.data.units,issues:[]};
 return {state:'invalid' as const,schemaVersion:version===1?1:null,units:[],issues:[...parsed.error.issues.slice(0,20).map(issue=>({path:issue.path.filter(part=>typeof part==='number'||knownFields.has(String(part))).map(String).join('.')||'contrato',message:issue.code==='unrecognized_keys'?'Há campos fora do formato v1. Revise o contrato.':'Campo ausente ou inválido no formato v1. Revise a definição.'})),...(parsed.error.issues.length>20?[{path:'contrato',message:'Há outros pontos além dos 20 apresentados. Nenhuma cobertura parcial foi aprovada.'}]:[])]};
}
export const unitPath=(base:string,path:string)=>[base==='.'?'':base,path==='.'?'':path].filter(Boolean).join('/')||'.';
export function contractFilePaths(units:ExecutionContract['units']){return [...new Set(units.flatMap(u=>[u.build.entrypoint,u.test.entrypoint,u.artifact.dockerfile,...(u.migrations.mode==='scripts'?[u.migrations.apply,u.migrations.rollback]:[])].map(path=>unitPath(u.path,path))))];}
