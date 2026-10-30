import {afterAll,beforeAll,expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {runtimeFiles} from '@sdlc/templates';
import {requestSystemRepository} from '../apps/api/src/system-repository.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const target=process.env.TEST_DATABASE_URL;
if(!target||new URL(target).pathname!=='/portal_test')throw Error('Requires disposable portal_test');
const db=database(target);
let remoteCalls=0;
const git:GitProvider={health:async()=>true,ensureGroup:async()=>({id:10,full_path:'isolated/system'}),
  ensureProject:async(_group,key,runtime)=>{remoteCalls++;expect(key).toBe('app');expect(runtime).toBe('generic');return{id:100+remoteCalls,path_with_namespace:'isolated/system/app',web_url:'http://gitlab.invalid/system/app'};},
  inspectProject:async()=>{throw Error('No legacy link expected');},codeContext:async()=>({sha:'a'.repeat(40),targetBranch:'main',files:[]}),publishCode:async()=>{throw Error('Creating a System must never publish application code');}};
const {app,processJobs}=createApp({db,demoMode:true,git});
const post=(path:string,payload:unknown,key=randomUUID())=>app.inject({method:'POST',url:'/api'+path,headers:{'x-persona':'ana','idempotency-key':key},payload});
const systemBody=(key:string)=>({kind:'system',key,name:'Sistema exclusivo do teste de repositório único'});
beforeAll(()=>app.ready());afterAll(async()=>{await app.close();await db.$disconnect();});

test('System and its single neutral repository are created atomically and replayed exactly once',async()=>{
  const key=randomUUID(),body=systemBody('SINGLE');
  const [one,two]=await Promise.all([post('/items',body,key),post('/items',body,key)]);
  expect(one.statusCode,one.body).toBe(200);expect(two.json()).toEqual(one.json());
  const system=one.json().item,repositories=await db.repository.findMany({where:{systemId:system.id}});
  expect(repositories).toHaveLength(1);expect(repositories[0]).toMatchObject({key:'app',runtime:'generic',state:'pending',name:system.name});
  expect(await db.environment.count({where:{repositoryId:repositories[0].id}})).toBe(4);
  expect(remoteCalls).toBe(0);
  const event=await db.historyEvent.findFirstOrThrow({where:{itemId:system.id,action:'REPOSITORY_REQUESTED'}});
  expect(event).toMatchObject({actorId:'system:repository',actorType:'system',outcome:'ACCEPTED',phase:'REQUESTED'});
  expect(event.audit).toMatchObject({initiator:{id:'ana',type:'human'},executor:{id:'system:repository',type:'system'}});
  await processJobs();await processJobs();
  expect(remoteCalls).toBe(1);expect(await db.repository.findUnique({where:{id:repositories[0].id}})).toMatchObject({state:'ready',gitlabProjectId:101});
  const observed=await db.historyEvent.findFirstOrThrow({where:{action:'REPOSITORY_PROVISIONED',itemId:system.id}});
  expect(observed.audit).toMatchObject({initiator:{id:'ana',type:'human'}});
});

test('all descendants inherit the same repository without manual assignment or writes during GET',async()=>{
  const system=(await db.item.findFirstOrThrow({where:{key:'SINGLE'}}));
  const repository=await db.repository.findUniqueOrThrow({where:{systemId:system.id}});
  let parent=system.id;
  for(const kind of ['project','epic','story','task']){
    const response=await post('/items',{kind,parentId:parent,name:'Trabalho herdado '+kind,...(kind==='project'?{key:'INHERT'}:{})});
    expect(response.statusCode,response.body).toBe(200);parent=response.json().item.id;
    const before=await db.historyEvent.count(),detail=(await app.inject('/api/items/'+parent)).json();
    expect(detail.repositories.map((r:{id:string})=>r.id)).toEqual([repository.id]);expect(await db.historyEvent.count()).toBe(before);
    expect(await db.itemRepository.count({where:{itemId:parent}})).toBe(0);
    const selection=await app.inject({method:'PATCH',url:`/api/items/${parent}/repositories`,headers:{'x-persona':'ana','idempotency-key':randomUUID()},payload:{expectedVersion:detail.item.version,repositoryIds:[]}});
    expect(selection.statusCode).toBe(409);expect(selection.json().error.code).toBe('SYSTEM_REPOSITORY_INHERITED');
  }
});

test('second repository is refused by API and database even with different names',async()=>{
  const system=await db.item.findUniqueOrThrow({where:{key:'SINGLE'}}),before=await db.repository.count();
  const response=await post(`/systems/${system.id}/repositories`,{name:'Segundo',key:'second',runtime:'generic',mode:'create'});
  expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe('SYSTEM_REPOSITORY_EXISTS');expect(await db.repository.count()).toBe(before);
  await expect(db.repository.create({data:{systemId:system.id,key:'different',name:'Duplicado',runtime:'generic'}})).rejects.toMatchObject({code:'P2002'});
});

test('failed repository audit rolls back System, job, environments and repository; the same request can retry',async()=>{
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_repository_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='REPOSITORY_REQUESTED' THEN RAISE EXCEPTION 'isolated rollback'; END IF; RETURN NEW; END; $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_repository_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_repository_fixture()`);
  const key=randomUUID(),body=systemBody('ROLLBK');
  try{expect((await post('/items',body,key)).statusCode).toBe(500);expect(await db.item.count({where:{key:'ROLLBK'}})).toBe(0);}
  finally{await db.$executeRawUnsafe('DROP TRIGGER reject_repository_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_repository_fixture()');}
  const retry=await post('/items',body,key);expect(retry.statusCode,retry.body).toBe(200);
  const id=retry.json().item.id;expect(await db.repository.count({where:{systemId:id}})).toBe(1);expect(await db.provisioningJob.count({where:{itemId:id}})).toBe(1);
});

test('existing empty System can be adopted explicitly and rollback/retry preserves prior data',async()=>{
  const system=await db.item.create({data:{kind:'system',key:'OLDONE',name:'Sistema legado da fixture',status:'active',data:{code:'OLDONE'}}});
  await expect(db.$transaction(async tx=>{await requestSystemRepository(tx,system,{id:'unknown:initiator',name:'Não capturado',type:'unknown'},true);throw Error('rollback');})).rejects.toThrow('rollback');
  expect(await db.repository.count({where:{systemId:system.id}})).toBe(0);
  const adopted=await post(`/systems/${system.id}/repositories`,{name:system.name,key:'app',runtime:'generic',mode:'create'});
  expect(adopted.statusCode,adopted.body).toBe(200);expect(adopted.json().repository).toMatchObject({systemId:system.id,runtime:'generic'});
  expect(await db.item.findUnique({where:{id:system.id}})).toMatchObject({name:system.name,status:'active',version:1});
});

test('neutral System repository does not impose a runtime, folders, business application or deployment',()=>{
  const files=runtimeFiles('generic','Sistema\nseguro');
  expect(Object.keys(files).sort()).toEqual(['.gitignore','.sdlc/contract.md','README.md']);
  expect(files['README.md']).toContain('APIs, frontend, backend, batch e infraestrutura');
  expect(files['README.md']).not.toContain('Sistema\nseguro');expect(Object.keys(files).some(path=>/server|Dockerfile|smoke/.test(path))).toBe(false);
});

test('migration refuses ambiguous legacy repositories atomically and preserves every row',async()=>{
  const client=new pg.Client({connectionString:target});await client.connect();
  try{
    await client.query('CREATE SCHEMA repository_migration_fixture');await client.query('SET search_path TO repository_migration_fixture');
    await client.query(`CREATE TABLE "Repository" (id text PRIMARY KEY,"systemId" text NOT NULL,runtime text NOT NULL CONSTRAINT "Repository_runtime_check" CHECK(runtime IN ('node','python')))`);
    await client.query(`INSERT INTO "Repository" VALUES ('a','legacy','node'),('b','legacy','python')`);
    const sql=readFileSync('prisma/migrations/202610260001_system_repository/migration.sql','utf8');
    await expect(client.query(sql)).rejects.toThrow('SYSTEM_REPOSITORY_CONFLICT');await client.query('ROLLBACK');
    expect((await client.query('SELECT * FROM "Repository" ORDER BY id')).rows).toEqual([{id:'a',systemId:'legacy',runtime:'node'},{id:'b',systemId:'legacy',runtime:'python'}]);
    await client.query(`UPDATE "Repository" SET "systemId"='another' WHERE id='b'`);
    await client.query(sql);await client.query(`INSERT INTO "Repository" VALUES ('c','neutral','generic')`);
    await expect(client.query(`INSERT INTO "Repository" VALUES ('d','neutral','generic')`)).rejects.toMatchObject({code:'23505'});
  }finally{await client.query('SET search_path TO public');await client.query('DROP SCHEMA repository_migration_fixture CASCADE');await client.end();}
});
