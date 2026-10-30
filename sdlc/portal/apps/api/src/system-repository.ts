import type {Transaction} from '../../../packages/db/client.ts';
import type {Item} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import {recordAudit,type AuditOptions} from './audit.ts';
import {registerEnvironmentReferences} from './environments.ts';

export async function requestSystemRepository(tx:Transaction,system:Item,person:{id:string;name:string;type?:'human'|'system'|'unknown'},automatic=false,audit:AuditOptions={}){
  if(system.kind!=='system')throw new DomainError('SYSTEM_REQUIRED','O repositório pertence ao Sistema.',409);
  if(await tx.repository.count({where:{systemId:system.id}}))throw new DomainError('SYSTEM_REPOSITORY_EXISTS','O Sistema já possui seu repositório. Projetos e Histórias utilizam esse mesmo destino.',409);
  const repository=await tx.repository.create({data:{systemId:system.id,name:system.name,key:'app',runtime:'generic',mode:'create'}});
  await registerEnvironmentReferences(tx,system,repository,person,undefined,true,audit);
  const executor=automatic?{id:'system:repository',name:'Cadastro do repositório do Sistema'}:person;
  await recordAudit(tx,system,executor,'REPOSITORY_REQUESTED','Criação do repositório único do Sistema solicitada; provisionamento pendente.',{repositoryId:repository.id},automatic?'system':'human',{
    ...audit,...(automatic?{initiator:{id:person.id,name:person.name,type:person.type??'human'}}:{}),
    subject:{type:'repository',id:repository.id,key:repository.key,name:repository.name,version:repository.version},before:null,
    after:{systemId:system.id,key:repository.key,name:repository.name,runtime:repository.runtime,state:repository.state,version:repository.version}
  });
  return repository;
}

/** Resolve ownership without materializing or changing descendant assignments. */
export async function repositorySystem(tx:Transaction,item:Pick<Item,'id'|'kind'|'parentId'>){
  let current=item;
  while(current.kind!=='system'){
    if(!current.parentId)throw new DomainError('SYSTEM_REQUIRED','O trabalho precisa pertencer a um Sistema.',409);
    current=await tx.item.findUniqueOrThrow({where:{id:current.parentId},select:{id:true,kind:true,parentId:true}});
  }
  return current;
}
export async function repositoriesOfSystem(tx:Transaction,item:Pick<Item,'id'|'kind'|'parentId'>){
  const system=await repositorySystem(tx,item);
  return tx.repository.findMany({where:{systemId:system.id},orderBy:{createdAt:'asc'}});
}
export async function inheritedRepository(tx:Transaction,item:Pick<Item,'id'|'kind'|'parentId'>){
  const repositories=await repositoriesOfSystem(tx,item);
  if(repositories.length>1)throw new DomainError('SYSTEM_REPOSITORY_CONFLICT','O Sistema possui múltiplos repositórios legados. Revise a propriedade antes de continuar; nenhum código foi alterado.',409);
  return repositories[0]??null;
}
