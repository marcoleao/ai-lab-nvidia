import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {database} from '../../../packages/db/client.ts';
import {runtimeDatabaseUrl} from './credentials.ts';
import {createApp} from './app.ts';
import {withAuditContext} from './audit.ts';
import {registerEnvironmentReferences} from './environments.ts';
const planSchema=z.object({stories:z.array(z.object({id:z.string(),expectedVersion:z.number().int().positive(),executionId:z.string()})).max(100),systems:z.array(z.object({id:z.string(),expectedVersion:z.number().int().positive(),repositoryId:z.string()})).max(100)}).strict();
if(process.argv[2]!=='--apply'||!process.argv[3]||!process.env.SDLC_ADMIN_OPERATION_ID)throw Error('Use --apply <reviewed-plan.json> with SDLC_ADMIN_OPERATION_ID');
const plan=planSchema.parse(JSON.parse(readFileSync(process.argv[3],'utf8'))),db=database(runtimeDatabaseUrl()),runtime=createApp({db,demoMode:true});
try{
 const result=await withAuditContext({operationId:process.env.SDLC_ADMIN_OPERATION_ID,source:{component:'lab-domain-maintenance',channel:'administrative'}},async()=>{
  const phases=await runtime.reconcileStoryPhases(plan.stories);
  const environments=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;const results=[];
   for(const item of plan.systems){const system=await tx.item.findUniqueOrThrow({where:{id:item.id}}),repository=await tx.repository.findUniqueOrThrow({where:{id:item.repositoryId}});
    if(system.version!==item.expectedVersion||system.kind!=='system'||system.status!=='active'||system.archived||repository.systemId!==system.id)throw Error('System changed since the reviewed plan');
    results.push(await registerEnvironmentReferences(tx,system,repository,{id:'unknown:initiator',name:'Iniciador administrativo não capturado',type:'unknown'},['DEV'],true));
   }return results;
  });return {phases,environments};
 });console.log(JSON.stringify(result));
}finally{await runtime.app.close();await db.$disconnect();}
