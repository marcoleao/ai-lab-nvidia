import {z} from 'zod';import type {DeploymentIntent} from './deployment-provider.ts';import {LocalRuntimeProvider} from './runtime-provider.ts';
import type {DevCaseSummary,DevCaseResult} from '../../../packages/shared/src/development-test.ts';
export const devTestPolicy='dev-http-v1';
export type DevTestPlan={policyVersion:string;suiteDigest:string;scope:'technical'|'acceptance';cases:DevCaseSummary[];mutatesData:boolean};
export type DevTestIntent=Omit<DeploymentIntent,'kind'>&{kind:'test';deploymentId:string;suiteDigest:string;policyVersion:string};
export type DevTestProof={deploymentId:string;buildId:string;sourceSha:string;imageId:string;archiveDigest:string;suiteDigest:string;policyVersion:string;scope:'technical'|'acceptance';startedAt:string;finishedAt:string;cases:DevCaseResult[]};
export type DevTestResult={id:string;state:'queued'|'running'|'absent'|'unknown'|'failed'|'succeeded';proof?:DevTestProof;code?:string};
export interface DevelopmentTestProvider{health():Promise<{ready:boolean}>;plan(intent:DeploymentIntent):Promise<DevTestPlan>;start(intent:DevTestIntent):Promise<DevTestResult>;read(intent:DevTestIntent):Promise<DevTestResult>}
const digest=z.string().regex(/^[a-f0-9]{64}$/),indices=z.array(z.number().int().min(0).max(99)).max(20),caseId=z.string().regex(/^[A-Za-z0-9_-]{1,60}$/),name=z.string().min(1).max(160);
const summary=z.object({id:caseId,name,method:z.enum(['GET','HEAD','POST','PUT','PATCH','DELETE']),path:z.string().min(1).max(512),status:z.number().int().min(100).max(599),criterionIndices:indices}).strict();
const result=z.object({id:caseId,name,criterionIndices:indices,passed:z.boolean(),expectedStatus:z.number().int().min(100).max(599),actualStatus:z.number().int().min(100).max(599).nullable(),code:z.enum(['PASSED','HTTP_UNAVAILABLE','STATUS_MISMATCH','BODY_MISMATCH','RESPONSE_TOO_LARGE']),durationMs:z.number().int().nonnegative()}).strict();
export class LocalDevelopmentTestProvider implements DevelopmentTestProvider{
 constructor(private runtime:LocalRuntimeProvider){}
 async health(){const health=await this.runtime.health(),capability=z.object({tests:z.literal(true)}).strict().parse(await this.runtime.command('/test-capabilities'));return {ready:health.ready&&capability.tests};}
 async plan(intent:DeploymentIntent){return z.object({policyVersion:z.literal(devTestPolicy),suiteDigest:digest,scope:z.enum(['technical','acceptance']),cases:z.array(summary).min(1).max(20),mutatesData:z.boolean()}).strict().parse(await this.runtime.command('/test-context',intent));}
 private result(intent:DevTestIntent,value:unknown):DevTestResult{const proof=z.object({deploymentId:z.string(),buildId:z.string(),sourceSha:z.string(),imageId:z.string(),archiveDigest:digest,suiteDigest:digest,policyVersion:z.literal(devTestPolicy),scope:z.enum(['technical','acceptance']),startedAt:z.string().datetime({offset:true}),finishedAt:z.string().datetime({offset:true}),cases:z.array(result).min(1).max(20)}).strict(),seen=z.object({id:z.string(),state:z.enum(['queued','running','absent','unknown','failed','succeeded']),proof:proof.optional(),code:z.enum(['PROFILE_UNSUPPORTED','RUNTIME_UNAVAILABLE','TARGET_CONFLICT','ARTIFACT_UNAVAILABLE','DEPLOYMENT_CHANGED','EXECUTOR_INTERRUPTED','SUITE_UNAVAILABLE','SUITE_CHANGED']).optional()}).strict().parse(value);
  if(seen.id!==intent.id||seen.state==='succeeded'&&!seen.proof||seen.proof&&(['deploymentId','buildId','sourceSha','imageId','archiveDigest','suiteDigest','policyVersion'] as const).some(key=>seen.proof![key]!==intent[key]))throw Error('Test proof source differs');
  if(seen.proof&&(new Set(seen.proof.cases.map(v=>v.id)).size!==seen.proof.cases.length||seen.proof.cases.some(v=>v.passed!==(v.code==='PASSED'))||seen.state!==(seen.proof.cases.every(v=>v.passed)?'succeeded':'failed')))throw Error('Test result differs');return seen;
 }
 async start(intent:DevTestIntent){return this.result(intent,await this.runtime.command('/operations/'+encodeURIComponent(intent.id),intent));}
 async read(intent:DevTestIntent){return this.result(intent,await this.runtime.command('/operations/'+encodeURIComponent(intent.id)));}
}
