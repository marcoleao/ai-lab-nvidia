import {randomUUID} from 'node:crypto';
import type {Transaction} from '../../../packages/db/client.ts';
import type {Item,Repository,Environment} from '../../../packages/db/generated/client.ts';
import type {AssistantHelpers} from './assistant.ts';
import {environmentRuntimeProfile} from '../../../packages/shared/src/environment-runtime.ts';
import {targetConfiguration} from './runtime-provider.ts';
import {DomainError} from './errors.ts';

export async function requestEnvironmentTarget(tx:Transaction,h:AssistantHelpers,scope:{system:Item;repo:Repository;environment:Environment},source:{sourceSha:string;contractDigest:string;unitId:string},person:{id:string;name:string},reason:string,developmentDeploymentId?:string){
 const {system,repo,environment}=scope,configDigest=targetConfiguration({systemId:system.id,repositoryId:repo.id,environmentId:environment.id,unitId:source.unitId});
 const target=await tx.environmentTarget.findUnique({where:{environmentId:environment.id}});
 if(target){if(target.configDigest!==configDigest)throw new DomainError('ENVIRONMENT_TARGET_CHANGED','O destino preparado não corresponde à configuração desta publicação.',409);return {operation:null,target};}
 const existing=await tx.environmentOperation.findFirst({where:{environmentId:environment.id,state:{in:['queued','running','paused','unknown']}},orderBy:{number:'desc'}});
 if(existing){if(existing.configDigest!==configDigest)throw new DomainError('ENVIRONMENT_TARGET_BUSY','Há uma preparação de outra configuração pendente neste destino.',409);return {operation:existing,target:null};}
 const previous=await tx.environmentOperation.aggregate({where:{environmentId:environment.id},_max:{number:true}});
 const job=await tx.environmentOperation.create({data:{id:randomUUID(),systemId:system.id,environmentId:environment.id,repositoryId:repo.id,repositoryVersion:repo.version,projectId:repo.gitlabProjectId!,number:(previous._max.number??0)+1,kind:'prepare',...source,profile:environmentRuntimeProfile,configDigest,actorId:person.id,actorName:person.name,reason,message:'Preparação do destino DEV solicitada. Infraestrutura ainda não confirmada.'}});
 await h.event(tx,system,person,'ENVIRONMENT_TARGET_REQUESTED',job.message,{environmentOperationId:job.id,environmentId:environment.id,repositoryId:repo.id,sourceSha:job.sourceSha,contractContentDigest:job.contractDigest,runtimeProfile:job.profile,configDigest,...(developmentDeploymentId?{developmentDeploymentId}:{})},'human',{operationId:job.id,subject:{type:'environment_operation',id:job.id},initiator:{id:person.id,name:person.name,type:'human'},before:null,after:{state:'queued'}});
 return {operation:job,target:null};
}
