import type {Transaction} from '../../../packages/db/client.ts';
import type {Item,Repository} from '../../../packages/db/generated/client.ts';
import {environmentCodes,orderEnvironments,type EnvironmentCode} from '../../../packages/shared/src/environments.ts';
import {recordAudit,type AuditOptions} from './audit.ts';
import {DomainError} from './errors.ts';

type Person={id:string;name:string;type?:'human'|'system'|'unknown'};
export async function environmentContext(tx:Transaction,system:Item){
  if(system.kind!=='system')throw new DomainError('SYSTEM_REQUIRED','Os ambientes pertencem a um Sistema.',409);
  const repository=await tx.repository.findUnique({where:{systemId:system.id},select:{id:true,key:true,name:true,version:true,state:true}});
  const environments=repository?orderEnvironments(await tx.environment.findMany({where:{repositoryId:repository.id}})):[];
  const missingCodes=environmentCodes.filter(code=>!environments.some(row=>row.code===code));
  return {system:{id:system.id,key:system.key,name:system.name,version:system.version,status:system.status,archived:system.archived},repository,environments,missingCodes,
    capabilities:{canRegister:!system.archived&&system.status==='active'&&!!repository},asOf:new Date().toISOString()};
}

// The caller owns the transaction/command lock. Only explicitly requested
// missing codes are inserted; existing state, versions, URLs and IDs stay intact.
export async function registerEnvironmentReferences(tx:Transaction,system:Item,repository:Pick<Repository,'id'|'systemId'|'key'|'name'|'version'>,person:Person,codes:readonly EnvironmentCode[]=environmentCodes,automatic=false,audit:AuditOptions={}){
  if(system.kind!=='system'||repository.systemId!==system.id)throw new DomainError('ENVIRONMENT_SYSTEM_MISMATCH','O repositório dos ambientes mudou. Atualize a consulta e revise o cadastro.',409);
  const before=orderEnvironments(await tx.environment.findMany({where:{repositoryId:repository.id}}));
  const createdCodes=codes.filter(code=>!before.some(row=>row.code===code));
  for(const code of createdCodes)await tx.environment.create({data:{repositoryId:repository.id,code}});
  const after=orderEnvironments(await tx.environment.findMany({where:{repositoryId:repository.id}}));
  const executor=automatic?{id:'system:environments',name:'Cadastro das referências de ambiente'}:person;
  await recordAudit(tx,system,executor,'ENVIRONMENT_REFERENCES_REGISTERED',createdCodes.length?'Referências de ambiente cadastradas; sem provisionamento de infraestrutura ou implantação.':'As referências de ambiente solicitadas já estavam cadastradas; dados existentes preservados.',{repositoryId:repository.id,createdEnvironmentCodes:createdCodes,count:createdCodes.length},automatic?'system':'human',{
    ...audit,outcome:createdCodes.length?'SUCCEEDED':'NO_CHANGE',phase:'COMPLETED',decision:'NOT_APPLICABLE',
    ...(automatic?{initiator:{id:person.id,name:person.name,type:person.type??'human'}}:{}),
    subject:{type:'repository',id:repository.id,key:repository.key,name:repository.name,version:repository.version},
    before:{repositoryId:repository.id,environmentCodes:before.map(row=>row.code)},after:{repositoryId:repository.id,environmentCodes:after.map(row=>row.code)}
  });
  return {createdCodes,outcome:createdCodes.length?'SUCCEEDED':'NO_CHANGE'} as const;
}
