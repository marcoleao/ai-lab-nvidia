import {z} from 'zod';
import type {TargetIntent,RuntimeResult} from './runtime-provider.ts';
import {LocalRuntimeProvider} from './runtime-provider.ts';
import type {DeploymentObservation} from '../../../packages/shared/src/development-deployment.ts';
export type DeploymentIntent=Omit<TargetIntent,'kind'>&{kind:'deploy';storyId:string;buildId:string;projectId:number;imageId:string;archiveDigest:string;artifactSize:number;expectedDeploymentId:string|null};
export type DeploymentProof={buildId:string;sourceSha:string;imageId:string;archiveDigest:string;configDigest:string;containerId:string;resourceId:string;url:string;healthAt:string};
export type DeploymentResult={id:string;state:RuntimeResult['state'];proof?:DeploymentProof;code?:string};
export interface DeploymentProvider {health():Promise<{ready:boolean}>;artifact(intent:DeploymentIntent):Promise<{available:boolean}>;start(intent:DeploymentIntent):Promise<DeploymentResult>;read(intent:DeploymentIntent):Promise<DeploymentResult>;observe(intent:DeploymentIntent):Promise<DeploymentObservation>}
const sha=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),digest=z.string().regex(/^[a-f0-9]{64}$/),image=z.string().regex(/^sha256:[a-f0-9]{64}$/),url=z.string().regex(/^http:\/\/localhost:[1-9][0-9]{3,4}$/).refine(v=>Number(v.split(':').at(-1))<65536),proof=z.object({buildId:z.string(),sourceSha:sha,imageId:image,archiveDigest:digest,configDigest:digest,containerId:digest,resourceId:digest,url,healthAt:z.string().datetime({offset:true})}).strict();
export class LocalDeploymentProvider implements DeploymentProvider{
 constructor(private runtime:LocalRuntimeProvider){}
 async health(){const healthy=await this.runtime.health(),capability=z.object({deployment:z.literal(true),tests:z.boolean().optional()}).strict().parse(await this.runtime.command('/capabilities'));return {ready:healthy.ready&&capability.deployment};}
 async artifact(intent:DeploymentIntent){return z.object({available:z.boolean()}).strict().parse(await this.runtime.command('/check-artifact',intent));}
 private result(intent:DeploymentIntent,value:unknown){const result=z.object({id:z.string(),state:z.enum(['queued','running','absent','unknown','failed','succeeded']),proof:proof.optional(),code:z.enum(['PROFILE_UNSUPPORTED','RUNTIME_UNAVAILABLE','TARGET_CONFLICT','ARTIFACT_UNAVAILABLE','HEALTH_FAILED','DEPLOYMENT_CHANGED','GATEWAY_UNAVAILABLE','EXECUTOR_INTERRUPTED']).optional()}).strict().parse(value);if(result.id!==intent.id||result.state==='succeeded'&&!result.proof)throw Error('Deployment proof missing');if(result.proof&&(['buildId','sourceSha','imageId','archiveDigest','configDigest'] as const).some(key=>result.proof![key]!==intent[key]))throw Error('Deployment source differs');return result;}
 async start(intent:DeploymentIntent){return this.result(intent,await this.runtime.command('/operations/'+encodeURIComponent(intent.id),intent));}
 async read(intent:DeploymentIntent){return this.result(intent,await this.runtime.command('/operations/'+encodeURIComponent(intent.id)));}
 async observe(intent:DeploymentIntent){return z.object({state:z.enum(['healthy','unavailable','changed','unconfirmed']),operationId:z.string().optional(),url:url.optional(),observedAt:z.string().datetime({offset:true})}).strict().parse(await this.runtime.command('/inspect-deployment',intent));}
}
