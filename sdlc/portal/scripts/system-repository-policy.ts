/** Explicit maintenance only. GETs and startup never backfill business records. */
import {readFileSync} from 'node:fs';
import {database} from '../packages/db/client.ts';
import {runtimeDatabaseUrl} from '../apps/api/src/credentials.ts';
import {requestSystemRepository} from '../apps/api/src/system-repository.ts';
import {withAuditContext} from '../apps/api/src/audit.ts';
import {ensureHierarchyWritable} from '../apps/api/src/lifecycle-policy.ts';
const db=database(runtimeDatabaseUrl());
try{
  if(process.argv[2]==='--plan'){
    const systems=await db.item.findMany({where:{kind:'system',archived:false,status:'active',repositories:{none:{}}},select:{id:true,version:true}});
    console.log(JSON.stringify({policy:'one-repository-per-system-v1',systems}));
  }else if(process.argv[2]==='--apply'&&process.argv[3]&&process.env.SDLC_ADMIN_OPERATION_ID){
    const plan=JSON.parse(readFileSync(process.argv[3],'utf8'));
    if(plan.policy!=='one-repository-per-system-v1'||!Array.isArray(plan.systems))throw Error('Invalid repository policy plan');
    let created=0,unchanged=0;
    await withAuditContext({operationId:process.env.SDLC_ADMIN_OPERATION_ID,source:{component:'system-repository-maintenance',channel:'administrative'}},()=>db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
      for(const expected of plan.systems){
        const system=await tx.item.findUniqueOrThrow({where:{id:expected.id}});
        if(system.kind!=='system'||system.version!==expected.version)throw Error('System changed since review; no records were backfilled');
        await ensureHierarchyWritable(tx,system);
        if(await tx.repository.count({where:{systemId:system.id}})){unchanged++;continue;}
        await requestSystemRepository(tx,system,{id:'unknown:initiator',name:'Iniciador não capturado',type:'unknown'},true);
        created++;
      }
    },{timeout:30000}));
    console.log(JSON.stringify({policy:plan.policy,created,unchanged}));
  }else throw Error('Use --plan or --apply <reviewed-plan.json> with SDLC_ADMIN_OPERATION_ID');
}finally{await db.$disconnect();}
