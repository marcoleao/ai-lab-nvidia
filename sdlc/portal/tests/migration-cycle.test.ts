import {describe,expect,test,vi} from 'vitest';
import pg from 'pg';
import {cycleEmptyMigrations} from './migration-cycle.ts';

test('migration cycle refuses another database before any write',async()=>{
 const query=vi.fn(async()=>({rows:[{name:'acceptance'}]}));
 await expect(cycleEmptyMigrations({query} as unknown as pg.Client,'202611010003_ai_dev_tests')).rejects.toThrow('disposable portal_test');
 expect(query.mock.calls).toHaveLength(1);
});

const url=process.env.TEST_MIGRATION_CYCLE_DATABASE_URL;
describe.skipIf(!url)('atomic isolated migration cycle',()=>{
 test('failed reapplication restores the schema and grants, then retry succeeds',async()=>{
  const client=new pg.Client({connectionString:url});await client.connect();
  const reading=async()=>(await client.query(`SELECT to_regclass('"DevelopmentAiTest"')::text AS table_name,
   pg_get_functiondef('validate_ai_dev_source()'::regprocedure) AS validation,
   has_table_privilege('sdlc_portal_app','"DevelopmentAiTest"','INSERT') AS insert,
   has_table_privilege('sdlc_portal_app','"DevelopmentAiTest"','DELETE') AS delete`)).rows;
  try{
   const before=await reading(),query=client.query.bind(client);
   const failure=vi.spyOn(client,'query').mockImplementation(((sql:string)=>sql.includes('CREATE TABLE "DevelopmentAiTest"')?Promise.reject(Error('Isolated reapplication failure')):query(sql)) as typeof client.query);
   try{await expect(cycleEmptyMigrations(client,'202611010003_ai_dev_tests')).rejects.toThrow('Isolated reapplication failure');}
   finally{failure.mockRestore();}
   expect(await reading()).toEqual(before);
   await cycleEmptyMigrations(client,'202611010003_ai_dev_tests');expect(await reading()).toEqual(before);
  }finally{await client.end();}
 });
});
