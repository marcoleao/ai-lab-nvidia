import {database} from '../packages/db/client.ts';
import {runtimeDatabaseUrl} from '../apps/api/src/credentials.ts';
import {normalizeItemStates} from '../apps/api/src/item-state-policy.ts';

if(process.argv[2]!=='--apply'||!process.env.SDLC_ADMIN_OPERATION_ID)throw Error('Explicit --apply and external administrative operation are required');
const db=database(runtimeDatabaseUrl());
try{console.log(JSON.stringify(await normalizeItemStates(db,process.env.SDLC_ADMIN_OPERATION_ID,process.env.SDLC_STATE_POLICY_ROLLBACK_OF)));}
finally{await db.$disconnect();}
