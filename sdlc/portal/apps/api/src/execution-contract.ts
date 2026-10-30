import {z} from 'zod';import type {FastifyInstance} from 'fastify';
import type {AssistantHelpers} from './assistant.ts';import type {GitProvider} from './gitlab.ts';
import {fullSha,type ExecutionContractReading} from '../../../packages/shared/src/execution-contract.ts';
import {DomainError} from './errors.ts';
export function registerExecutionContract(app:FastifyInstance,h:Pick<AssistantHelpers,'db'|'live'>,git?:GitProvider){
 async function context(id:string){return h.db.$transaction(async tx=>{const item=await h.live(tx,id);if(item.kind!=='system')throw new DomainError('SYSTEM_REQUIRED','Consulte o contrato no Sistema proprietário do repositório.',409);const repository=await tx.repository.findUnique({where:{systemId:item.id},select:{id:true,name:true,version:true,state:true,gitlabProjectId:true}});return {system:{id:item.id,key:item.key,name:item.name,version:item.version},repository:repository?{id:repository.id,name:repository.name,version:repository.version,state:repository.state,projectId:repository.gitlabProjectId}:null};},{isolationLevel:'RepeatableRead'});}
 app.get<{Params:{id:string}}>('/api/systems/:id/execution-contract',async request=>{
  const query=z.object({sha:fullSha.optional()}).strict().parse(request.query),before=await context(request.params.id);
  const result=(observation:ExecutionContractReading['observation'],unavailableReason:string|null):ExecutionContractReading=>({...before,observation,unavailableReason,asOf:new Date().toISOString(),executionAvailable:false,tooling:'not_evaluated'});
  if(!before.repository)return result(null,'O Sistema ainda não tem repositório. O contrato poderá ser consultado após o cadastro e provisionamento.');
  if(before.repository.state!=='ready'||!before.repository.projectId)return result(null,'O repositório ainda não tem provisionamento confirmado. Acompanhe o quadro Repositório do Sistema.');
  if(!git?.executionContract)return result(null,'A consulta do contrato não está configurada nesta integração. Nenhuma prontidão foi inferida pelo runtime cadastrado.');
  const observation=await git.executionContract(before.repository.projectId,query.sha),after=await context(request.params.id);
  if(JSON.stringify(before)!==JSON.stringify(after))throw new DomainError('EXECUTION_CONTRACT_CONTEXT_CHANGED','O Sistema ou repositório mudou durante a leitura. Consulte novamente para conferir o contexto atual.',409);
  if(observation.projectId!==before.repository.projectId||query.sha&&observation.sha!==query.sha)throw new DomainError('EXECUTION_CONTRACT_SCOPE','O resultado não corresponde ao repositório e commit solicitados.',409);
  return result(observation,null);
 });
}
