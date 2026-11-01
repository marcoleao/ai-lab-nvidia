import {z} from 'zod';
import type {DeploymentIntent} from './deployment-provider.ts';
import type {CodingTestContext} from './coding-provider.ts';
import type {LocalRuntimeProvider} from './runtime-provider.ts';
import type {AiTestCase} from '../../../packages/shared/src/development-ai-test.ts';
export const aiTestPolicy='dev-ai-browser-v1';
export function validateAiScope(raw:unknown):CodingTestContext{
 const value=z.object({contextVersion:z.literal(2),objective:z.string(),behavior:z.string(),criteria:z.array(z.string().min(1).max(500).refine(v=>v.trim().length>0)).min(1).max(12),testCases:z.array(z.object({criterionIndex:z.number().int().min(0),description:z.string().max(500)}).strict()),approved:z.object({name:z.unknown(),runtime:z.unknown(),requirements:z.record(z.string(),z.unknown()),technicalPlan:z.record(z.string(),z.unknown()),decisions:z.unknown(),tasks:z.unknown(),codeDestination:z.unknown(),scopeRevision:z.literal(3)}).strict()}).strict().parse(raw);
 const ascii=JSON.stringify(value).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(value.testCases.some(c=>c.criterionIndex>=value.criteria.length)||ascii.length+(ascii.match(/[:,]/g)?.length??0)>20000)throw Error('Approved AI scope exceeds native contract');return value;
}
export type AiTestIntent={id:string;policyVersion:string;deployment:DeploymentIntent;referenceDigest:string;context:CodingTestContext};
export type AiTestReceipt={id:string;state:'queued'|'running'|'succeeded'|'failed'|'inconclusive'|'unknown'|'stale';stage:string;cases:AiTestCase[];proof?:{policyVersion:string;referenceDigest:string;deploymentId:string;sourceSha:string;imageId:string;model:string;completeAcceptance:false}};
export interface AiTestProvider {health():Promise<{ready:boolean;policyVersion:string}>;start(intent:AiTestIntent):Promise<AiTestReceipt>;read(intent:AiTestIntent):Promise<AiTestReceipt>;evidence(intent:AiTestIntent,index:number,file:string):Promise<Buffer>}
const digest=z.string().regex(/^[a-f0-9]{64}$/),caseSchema=z.object({index:z.number().int().min(0).max(11),title:z.string().max(500),status:z.enum(['passed','failed','not_tested']),code:z.enum(['PASSED','ASSERTION_FAILED','CAPABILITY_UNSUPPORTED','NETWORK_POLICY','EXECUTOR_ERROR','BUDGET_EXHAUSTED','DEPLOYMENT_CHANGED','UNSTABLE','EXPECTATION_UNCONFIRMED']),steps:z.number().int().min(0).max(20),evidence:z.array(z.enum(['initial.png','final.png','report.json'])).max(3)}).strict();
const schema=z.object({id:z.string(),state:z.enum(['queued','running','succeeded','failed','inconclusive','unknown','stale']),stage:z.string().max(120),cases:z.array(caseSchema).max(12),proof:z.object({policyVersion:z.literal(aiTestPolicy),referenceDigest:digest,deploymentId:z.string(),sourceSha:z.string(),imageId:z.string(),model:z.string().max(128),completeAcceptance:z.literal(false)}).strict().optional()}).strict();
export function validateAiReceipt(intent:AiTestIntent,raw:unknown){
 const value=schema.parse(raw);if(value.id!==intent.id||new Set(value.cases.map(c=>c.index)).size!==value.cases.length||value.cases.some(c=>c.index>=intent.context.criteria.length||c.title!==intent.context.criteria[c.index]||(c.status==='passed')!==(c.code==='PASSED')||(c.status==='failed')!==(c.code==='ASSERTION_FAILED')||c.status!=='not_tested'&&!c.evidence.includes('report.json'))||value.proof&&(value.proof.referenceDigest!==intent.referenceDigest||value.proof.deploymentId!==intent.deployment.id||value.proof.sourceSha!==intent.deployment.sourceSha||value.proof.imageId!==intent.deployment.imageId))throw Error('AI test proof source differs');
 if(['succeeded','failed','inconclusive'].includes(value.state)&&(!value.proof||value.cases.length!==intent.context.criteria.length||value.state!==(value.cases.some(c=>c.status==='failed')?'failed':value.cases.some(c=>c.status==='not_tested')?'inconclusive':'succeeded')))throw Error('AI test coverage differs');return value;
}
export class LocalAiTestProvider implements AiTestProvider {
 constructor(private runtime:LocalRuntimeProvider){}
 async health(){return z.object({ready:z.boolean(),policyVersion:z.literal(aiTestPolicy)}).strict().parse(await this.runtime.command('/ai-test-capabilities'));}
 private checked(intent:AiTestIntent,raw:unknown){return validateAiReceipt(intent,raw);}
 async start(intent:AiTestIntent){return this.checked(intent,await this.runtime.command('/ai-tests/'+encodeURIComponent(intent.id),intent));}
 async read(intent:AiTestIntent){return this.checked(intent,await this.runtime.command('/ai-tests/'+encodeURIComponent(intent.id)));}
 async evidence(intent:AiTestIntent,index:number,file:string){const value=z.object({contentType:z.enum(['image/png','application/json']),sha256:digest,data:z.string().max(2800000)}).strict().parse(await this.runtime.command(`/ai-tests/${encodeURIComponent(intent.id)}/evidence/${index}/${file}`,undefined,3000000));const bytes=Buffer.from(value.data,'base64');const {createHash}=await import('node:crypto');if(bytes.length>2000000||(file==='report.json'?value.contentType!=='application/json':value.contentType!=='image/png'||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')||createHash('sha256').update(bytes).digest('hex')!==value.sha256)throw Error('Invalid AI test evidence');if(file==='report.json')JSON.parse(bytes.toString());return bytes;}
}
