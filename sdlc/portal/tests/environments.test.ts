import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {environmentCodes} from '../packages/shared/src/environments.ts';

const target=process.env.TEST_ENVIRONMENTS_DATABASE_URL;
if(target&&new URL(target).pathname!=='/portal_test')throw Error('Environment tests require isolated portal_test');
describe.skipIf(!target)('System environment references',()=>{
 const db=database(target!),{app}=createApp({db,demoMode:true});
 beforeAll(()=>app.ready());afterAll(async()=>{await app.close();await db.$disconnect();});
 const headers=(key=randomUUID(),persona='admin')=>({'x-persona':persona,'idempotency-key':key});
 const code=()=>randomUUID().replaceAll('-','').slice(0,6).split('').map(char=>String.fromCharCode(65+parseInt(char,16))).join('');
 async function legacy(){
  const system=await db.item.create({data:{kind:'system',key:code(),name:'Sistema legado isolado',status:'active'}});
  const repository=await db.repository.create({data:{systemId:system.id,key:'app',name:system.name,runtime:'generic',mode:'link',state:'ready'}});
  await db.environment.createMany({data:['QA','HML','PRD'].map(code=>({repositoryId:repository.id,code,...(code==='QA'?{liveStatus:'legacy_registered',currentVersion:'1.2.3',currentPackageDigest:'sha256:preserved',url:'https://qa.invalid/existing'}:{})}))});
  return {system,repository};
 }
 async function context(id:string){const response=await app.inject(`/api/systems/${id}/environments`);expect(response.statusCode,response.body).toBe(200);return response.json();}
 function body(value:Awaited<ReturnType<typeof legacy>>,codes:string[]=['DEV']){return {expectedVersion:value.system.version,expectedRepositoryId:value.repository.id,expectedRepositoryVersion:value.repository.version,codes};}
 async function register(value:Awaited<ReturnType<typeof legacy>>,codes:string[]=['DEV'],key=randomUUID(),persona='admin'){
  return app.inject({method:'POST',url:`/api/systems/${value.system.id}/environment-references`,headers:headers(key,persona),payload:body(value,codes)});
 }
 test('new System atomically registers four references with separate audit and no deployment',async()=>{
  const key=randomUUID(),payload={kind:'system',key:code(),name:'Sistema novo com referências'};
  const request=()=>app.inject({method:'POST',url:'/api/items',headers:headers(key,'ana'),payload});
  const first=await request();expect(first.statusCode,first.body).toBe(200);expect((await request()).json()).toEqual(first.json());
  const data=await context(first.json().item.id);
  expect(data.environments.map((row:{code:string})=>row.code)).toEqual(environmentCodes);expect(data.missingCodes).toEqual([]);
  expect(data.environments.every((row:{liveStatus:string;currentVersion:null;currentPackageDigest:null;url:null})=>row.liveStatus==='not_deployed'&&row.currentVersion===null&&row.currentPackageDigest===null&&row.url===null)).toBe(true);
  const events=await db.historyEvent.findMany({where:{itemId:data.system.id,action:'ENVIRONMENT_REFERENCES_REGISTERED'}});expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',actorId:'system:environments'});
  expect(events[0].audit).toMatchObject({initiator:{id:'ana',type:'human'},executor:{id:'system:environments',type:'system'},changeCoverage:'captured',changes:[{field:'environmentCodes',before:{kind:'value',value:[]},after:{kind:'value',value:environmentCodes}}]});
  expect(await db.release.count()).toBe(0);expect(await db.storyExecution.count()).toBe(0);
 });
 test('GET keeps legacy missing DEV and every row/history unchanged',async()=>{
  const value=await legacy(),before=await db.environment.findMany({where:{repositoryId:value.repository.id},orderBy:{id:'asc'}}),events=await db.historyEvent.count();
  for(let index=0;index<2;index++){const data=await context(value.system.id);expect(data.missingCodes).toEqual(['DEV']);expect(data.environments.map((row:{code:string})=>row.code)).toEqual(['QA','HML','PRD']);}
  await app.inject(`/api/items/${value.system.id}`);
  expect(await db.environment.findMany({where:{repositoryId:value.repository.id},orderBy:{id:'asc'}})).toEqual(before);expect(await db.historyEvent.count()).toBe(events);
 });
 test('recovery inserts only requested DEV, preserves all metadata and records safe before/after',async()=>{
  const value=await legacy(),other=await legacy(),before=await db.environment.findMany({where:{repositoryId:value.repository.id},orderBy:{id:'asc'}}),otherBefore=await db.environment.findMany({where:{repositoryId:other.repository.id},orderBy:{id:'asc'}});
  const response=await register(value);expect(response.statusCode,response.body).toBe(200);expect(response.json()).toMatchObject({outcome:'SUCCEEDED',createdCodes:['DEV'],missingCodes:[]});
  expect(await db.environment.findMany({where:{repositoryId:value.repository.id,code:{not:'DEV'}},orderBy:{id:'asc'}})).toEqual(before);
  expect(await db.environment.findMany({where:{repositoryId:other.repository.id},orderBy:{id:'asc'}})).toEqual(otherBefore);
  expect(await db.item.findUnique({where:{id:value.system.id}})).toEqual(value.system);expect(await db.repository.findUnique({where:{id:value.repository.id}})).toEqual(value.repository);
  const event=await db.historyEvent.findFirstOrThrow({where:{itemId:value.system.id,action:'ENVIRONMENT_REFERENCES_REGISTERED'}});
  expect(event).toMatchObject({actorId:'admin',outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',subjectType:'repository',subjectId:value.repository.id,operationId:expect.stringMatching(/^command:/),requestId:expect.any(String)});
  expect(event.audit).toMatchObject({changes:[{field:'environmentCodes',before:{kind:'value',value:['QA','HML','PRD']},after:{kind:'value',value:environmentCodes}}]});
  expect(JSON.stringify(event)).not.toContain('https://qa.invalid');expect(event.payload).toMatchObject({createdEnvironmentCodes:['DEV'],count:1});
 });
 test('concurrent/replayed requests do not duplicate references or the same command event',async()=>{
  const value=await legacy(),key=randomUUID();
  const [one,two]=await Promise.all([register(value,['DEV'],key),register(value,['DEV'],key)]);
  expect(one.statusCode,one.body).toBe(200);expect(two.json()).toEqual(one.json());
  expect((await register(value,['DEV'],key)).json()).toEqual(one.json());
  expect(await db.historyEvent.count({where:{itemId:value.system.id,action:'ENVIRONMENT_REFERENCES_REGISTERED'}})).toBe(1);
  const noChange=await register(value);expect(noChange.json()).toMatchObject({outcome:'NO_CHANGE',createdCodes:[]});expect(await db.environment.count({where:{repositoryId:value.repository.id}})).toBe(4);
  const last=await db.historyEvent.findFirstOrThrow({where:{itemId:value.system.id,action:'ENVIRONMENT_REFERENCES_REGISTERED'},orderBy:{timestamp:'desc'}});expect(last.outcome).toBe('NO_CHANGE');
  expect((await register(value,['QA'],key)).statusCode).toBe(409);
  const another=await legacy(),[a,b]=await Promise.all([register(another),register(another)]);expect([a.json().outcome,b.json().outcome].sort()).toEqual(['NO_CHANGE','SUCCEEDED']);
 });
 test('the reviewed code set never expands to other missing codes',async()=>{
  const value=await legacy();await db.environment.deleteMany({where:{repositoryId:value.repository.id,code:'HML'}});
  const response=await register(value,['DEV']);expect(response.statusCode,response.body).toBe(200);expect(response.json().missingCodes).toEqual(['HML']);
 });
 test('invalid codes, duplicates, wrong repository and stale revisions are refused atomically',async()=>{
  const value=await legacy(),foreign=await legacy();
  for(const codes of [[],['DEV','DEV'],['UAT']])expect((await register(value,codes)).statusCode).toBe(422);
  for(const patch of [{expectedVersion:99},{expectedRepositoryId:foreign.repository.id},{expectedRepositoryVersion:99},{extra:true}]){
   const response=await app.inject({method:'POST',url:`/api/systems/${value.system.id}/environment-references`,headers:headers(),payload:{...body(value),...patch}});expect([409,422]).toContain(response.statusCode);
  }
  expect((await context(value.system.id)).missingCodes).toEqual(['DEV']);
 });
 test('roles, inactive/archive state and missing repository block recovery while reads remain available',async()=>{
  const value=await legacy();
  for(const persona of ['carla','diego','elisa','missing'])expect((await register(value,['DEV'],randomUUID(),persona)).statusCode).toBe(403);
  await db.item.update({where:{id:value.system.id},data:{status:'inactive'}});expect((await register(value)).statusCode).toBe(409);expect((await context(value.system.id)).capabilities.canRegister).toBe(false);
  await db.item.update({where:{id:value.system.id},data:{archived:true}});expect((await register(value)).statusCode).toBe(404);expect((await context(value.system.id)).system.archived).toBe(true);
  const empty=await db.item.create({data:{kind:'system',key:code(),name:'Sem repositório',status:'active'}});
  const response=await app.inject({method:'POST',url:`/api/systems/${empty.id}/environment-references`,headers:headers(),payload:{...body(value),expectedVersion:1}});expect(response.json().error.code).toBe('SYSTEM_REPOSITORY_REQUIRED');expect((await context(empty.id)).repository).toBeNull();
 });
 test('audit failure rolls back references and request key; the original request retries safely',async()=>{
  const value=await legacy(),key=randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_environment_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ENVIRONMENT_REFERENCES_REGISTERED' THEN RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER reject_environment_audit_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_environment_audit_fixture()');
  try{expect((await register(value,['DEV'],key)).statusCode).toBe(500);expect(await db.environment.count({where:{repositoryId:value.repository.id,code:'DEV'}})).toBe(0);}
  finally{await db.$executeRawUnsafe('DROP TRIGGER reject_environment_audit_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_environment_audit_fixture()');}
  expect((await register(value,['DEV'],key)).statusCode).toBe(200);expect(await db.historyEvent.count({where:{itemId:value.system.id,action:'ENVIRONMENT_REFERENCES_REGISTERED'}})).toBe(1);
 });
 test('the restricted runtime can register DEV without changing audit protections',async()=>{
  const value=await legacy();await db.$executeRawUnsafe("ALTER ROLE sdlc_portal_app PASSWORD 'isolated-environment-test'");
  const url=new URL(target!);url.username='sdlc_portal_app';url.password='isolated-environment-test';
  const restricted=database(url.toString()),runtime=createApp({db:restricted,demoMode:true}).app;
  try{
   const permission=await restricted.$queryRaw<{canInsert:boolean;canChangeHistory:boolean}[]>`SELECT has_table_privilege(current_user,'"Environment"','INSERT') AS "canInsert",has_table_privilege(current_user,'"HistoryEvent"','UPDATE') AS "canChangeHistory"`;
   expect(permission[0]).toEqual({canInsert:true,canChangeHistory:false});
   const result=await runtime.inject({method:'POST',url:`/api/systems/${value.system.id}/environment-references`,headers:headers(),payload:body(value)});expect(result.statusCode,result.body).toBe(200);expect(result.json().createdCodes).toEqual(['DEV']);
  }finally{await runtime.close();await restricted.$disconnect();}
 });
 test('DEV constraint migration preserves legacy rows and does not backfill',async()=>{
  const client=new pg.Client({connectionString:target});await client.connect();
  try{
   await client.query('CREATE SCHEMA environment_migration_fixture');await client.query('SET search_path TO environment_migration_fixture');
   await client.query(`CREATE TABLE "Environment" (id text PRIMARY KEY,code text NOT NULL,current_version text,url text,CONSTRAINT "Environment_code_check" CHECK(code IN ('QA','HML','PRD')))`);
   await client.query(`INSERT INTO "Environment" VALUES ('legacy','QA','1.2.3','https://qa.invalid/preserved')`);const before=(await client.query('TABLE "Environment"')).rows;
   await client.query(readFileSync('prisma/migrations/202610270003_environment_dev/migration.sql','utf8'));expect((await client.query('TABLE "Environment"')).rows).toEqual(before);
   await client.query(`INSERT INTO "Environment" VALUES ('dev','DEV',null,null)`);await expect(client.query(`INSERT INTO "Environment" VALUES ('other','UAT',null,null)`)).rejects.toMatchObject({code:'23514'});
  }finally{await client.query('ROLLBACK');await client.query('SET search_path TO public');await client.query('DROP SCHEMA environment_migration_fixture CASCADE');await client.end();}
 });
});
