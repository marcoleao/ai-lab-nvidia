import {afterAll,afterEach,describe,expect,test,vi} from 'vitest';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import pg from 'pg';
import {database} from '../packages/db/client.ts';import {createApp} from '../apps/api/src/app.ts';import {approvedSnapshot} from './approved-scope';import {repositoryFixture} from './repository-fixture';
const url=process.env.TEST_MERGE_REFERENCE_DATABASE_URL;
describe.skipIf(!url)('immutable merge integration references',()=>{
 const db=database(url!),source='a'.repeat(40),mergeSha='b'.repeat(40),squash='c'.repeat(40),head='d'.repeat(40);
 const provider={inspect:vi.fn(),merge:vi.fn()},runtime=createApp({db,demoMode:true,merge:provider});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});afterEach(async()=>{await db.mergeOperation.updateMany({where:{state:{notIn:['succeeded','cancelled']}},data:{state:'cancelled',leaseId:null,leaseUntil:null}});provider.inspect.mockReset();provider.merge.mockReset();});
 async function fixture(options:{mergeCommitSha?:string|null;squashCommitSha?:string|null;legacy?:boolean}={}){
  const create=async(kind:any,parentId?:string,parentKind?:any)=>db.item.create({data:{kind,parentId,parentKind,key:randomUUID(),name:'Isolated reference '+kind,status:kind==='story'?'coding':'active',...(kind==='project'?{projectLifecycle:'active'}:{}),data:kind==='story'?{acceptanceCriteria:['Preserve isolated result.']}:{} }});
  const system=await create('system'),project=await create('project',system.id,'system'),epic=await create('epic',project.id,'project'),story=await create('story',epic.id,'epic');
  const repo=await repositoryFixture(db,{data:{systemId:system.id,key:randomUUID(),name:'Reference repo',runtime:'node',state:'ready',gitlabProjectId:1000+await db.repository.count()}});
  const snapshot=await db.$transaction(tx=>approvedSnapshot(tx,story.id,{codeContext:{sha:head,targetBranch:'main',files:[]}}));
  const run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repo.id,storyVersion:story.version,state:'succeeded',stage:'completed',commitSha:source,branch:'sdlc/source',mergeRequestUrl:'http://gitlab.invalid/ref/-/merge_requests/1',actorId:'admin',actorName:'Admin',snapshot}});
  const op=await db.mergeOperation.create({data:{storyId:story.id,executionId:run.id,projectId:repo.gitlabProjectId!,iid:1,sha:source,sourceBranch:run.branch!,targetBranch:'main',checkedAt:new Date(0)}});
  const integration={projectId:op.projectId,iid:1,sourceBranch:op.sourceBranch,targetBranch:op.targetBranch,sourceSha:source,mergeCommitSha:options.mergeCommitSha===undefined?mergeSha:options.mergeCommitSha,squashCommitSha:options.squashCommitSha??null,mergedAt:'2026-10-28T20:00:00.000Z'};
  const observation={state:'merged',sha:source,targetSha:head,url:run.mergeRequestUrl,mergedBy:'human-reviewer',mergedAt:integration.mergedAt,blocks:[],...(!options.legacy?{integration}:{})};provider.inspect.mockResolvedValue(observation);
  return {system,story,repo,run,op,integration,observation};
 }
 test('empty rollback succeeds and reapply restores constraints without manufacturing references',async()=>{
  // Test this historical layer independently from the later build/approval FKs.
  if(new URL(url!).pathname!=='/portal_test')throw Error('Rollback fixture requires portal_test');
  const schema='merge_ref_'+randomUUID().replaceAll('-',''),c=new pg.Client({connectionString:url});await c.connect();
  try{
   await c.query(`CREATE SCHEMA "${schema}"`);await c.query(`SET search_path TO "${schema}",public`);
   for(const table of ['MergeOperation','StoryExecution','Item','Repository'])await c.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
   const migration=readFileSync(new URL('../prisma/migrations/202610280005_merge_integration_reference/migration.sql',import.meta.url),'utf8'),rollback=readFileSync(new URL('../prisma/migrations/202610280005_merge_integration_reference/rollback.sql',import.meta.url),'utf8');
   await c.query(migration);await c.query(rollback);expect((await c.query('SELECT to_regclass($1) AS relation',[schema+'."MergeIntegrationReference"'])).rows[0].relation).toBeNull();
   await c.query(migration);expect((await c.query('SELECT count(*)::int AS count FROM "MergeIntegrationReference"')).rows[0].count).toBe(0);
   expect((await c.query('SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal',[schema+'."MergeIntegrationReference"'])).rows[0].count).toBe(3);
  }finally{await c.query('ROLLBACK');await c.query('SET search_path TO public');await c.query(`DROP SCHEMA "${schema}" CASCADE`);await c.end();}expect(await db.mergeIntegrationReference.count()).toBe(0);
 });
 test.each([{mergeCommitSha:mergeSha,squashCommitSha:null,expected:mergeSha},{mergeCommitSha:mergeSha,squashCommitSha:squash,expected:mergeSha},{mergeCommitSha:null,squashCommitSha:squash,expected:squash}])('records exact merge/squash output without substituting source or current HEAD: %j',async values=>{
  const f=await fixture(values);await runtime.processMergeJobs();const row=await db.mergeIntegrationReference.findUniqueOrThrow({where:{operationId:f.op.id}});
  expect(row).toMatchObject({sourceSha:source,integrationSha:values.expected,mergeCommitSha:values.mergeCommitSha,squashCommitSha:values.squashCommitSha,repositoryId:f.repo.id,executionId:f.run.id,policyVersion:'gitlab-merge-reference-v1'});expect(row.integrationSha).not.toBe(head);expect(provider.merge).not.toHaveBeenCalled();
  const event=await db.historyEvent.findFirstOrThrow({where:{itemId:f.story.id,action:'MERGE_COMPLETED'}});expect(event.payload).toMatchObject({integrationReferenceId:row.id,sourceSha:source,integrationSha:values.expected});expect(event.actorId).toBe('agent:merge');expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).not.toBe('completed');
 });
 test('missing merge and squash commits remain partial while the merge stays confirmed',async()=>{
  const f=await fixture({mergeCommitSha:null});await runtime.processMergeJobs();expect(await db.mergeIntegrationReference.findUniqueOrThrow({where:{operationId:f.op.id}})).toMatchObject({integrationSha:null,sourceSha:source});
  const view=(await runtime.app.inject('/api/executions/'+f.run.id+'/merge')).json();expect(view.operation.state).toBe('succeeded');expect(view.integrationReference.state).toBe('partial');
 });
 test('legacy provider and GET do not invent or backfill a reference',async()=>{
  const f=await fixture({legacy:true});await runtime.processMergeJobs();const before=await db.historyEvent.count();const r=(await runtime.app.inject('/api/executions/'+f.run.id+'/merge')).json();expect(r.integrationReference).toEqual({state:'not_captured',operationId:f.op.id,executionId:f.run.id,projectId:f.op.projectId,iid:f.op.iid,sourceBranch:f.op.sourceBranch,targetBranch:f.op.targetBranch,sourceSha:source});expect(await db.mergeIntegrationReference.count({where:{operationId:f.op.id}})).toBe(0);expect(await db.historyEvent.count()).toBe(before);
 });
 test('a mismatched observed destination cannot be recorded or confirm local success',async()=>{
  const f=await fixture();provider.inspect.mockResolvedValue({...f.observation,integration:{...f.integration,targetBranch:'other'}});await expect(runtime.processMergeJobs()).rejects.toThrow();expect(await db.mergeIntegrationReference.count({where:{operationId:f.op.id}})).toBe(0);expect((await db.mergeOperation.findUniqueOrThrow({where:{id:f.op.id}})).state).toBe('tracking');
 });
 test('audit failure rolls back reference and completion; lease recovery records once by reads',async()=>{
  const f=await fixture();await db.$executeRawUnsafe(`CREATE FUNCTION reject_ref_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='MERGE_COMPLETED' THEN RAISE EXCEPTION 'isolated reference audit failure'; END IF; RETURN NEW; END; $$`);await db.$executeRawUnsafe('CREATE TRIGGER reject_ref_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_ref_fixture()');
  try{await expect(runtime.processMergeJobs()).rejects.toThrow();expect(await db.mergeIntegrationReference.count({where:{operationId:f.op.id}})).toBe(0);}finally{await db.$executeRawUnsafe('DROP TRIGGER reject_ref_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_ref_fixture()');}
  await db.mergeOperation.update({where:{id:f.op.id},data:{leaseUntil:new Date(0),checkedAt:new Date(0)}});await runtime.processMergeJobs();await runtime.processMergeJobs();expect(await db.mergeIntegrationReference.count({where:{operationId:f.op.id}})).toBe(1);expect(await db.historyEvent.count({where:{itemId:f.story.id,action:'MERGE_COMPLETED'}})).toBe(1);expect(provider.merge).not.toHaveBeenCalled();
 });
 test('reference remains tied to its old attempt after another execution and current merge change',async()=>{
  const f=await fixture();await runtime.processMergeJobs();const row=await db.mergeIntegrationReference.findUniqueOrThrow({where:{operationId:f.op.id}});
  const task=await db.item.create({data:{parentId:f.story.id,parentKind:'story',kind:'task',key:randomUUID(),name:'Old integration',status:'done'}}),activity=await db.workActivity.create({data:{storyId:f.story.id,repositoryId:f.repo.id,kind:'merge',scopeKey:randomUUID(),taskId:task.id}}),attempt=await db.workAttempt.create({data:{activityId:activity.id,sourceType:'merge',sourceId:f.op.id,sourceKey:randomUUID(),state:'succeeded',actorId:'admin',actorName:'Admin'}});await db.workActivity.update({where:{id:activity.id},data:{currentAttemptId:attempt.id}});
  await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repo.id,storyVersion:1,state:'waiting_approval',stage:'gate',snapshot:{},actorId:'admin',actorName:'Admin',createdAt:new Date(Date.now()+1000)}});
  const view=(await runtime.app.inject('/api/items/'+task.id+'/journey')).json();expect(view.merge).toBeNull();expect(view.activities.find((v:any)=>v.id===activity.id).attempts[0].integrationReference).toMatchObject({id:row.id,integrationSha:mergeSha,executionId:f.run.id});expect(await db.mergeIntegrationReference.findUniqueOrThrow({where:{id:row.id}})).toEqual(row);
  const failed=await db.workAttempt.create({data:{activityId:activity.id,sourceType:'merge',sourceId:f.op.id,sourceKey:randomUUID(),state:'failed',actorId:'admin',actorName:'Admin'}});const failedView=(await runtime.app.inject('/api/items/'+task.id+'/journey')).json();expect(failedView.activities.find((v:any)=>v.id===activity.id).attempts.find((v:any)=>v.id===failed.id)).not.toHaveProperty('integrationReference');
 });
 test('runtime and owner cannot rewrite evidence; populated rollback refuses to discard it',async()=>{
  const f=await fixture();await runtime.processMergeJobs();const row=await db.mergeIntegrationReference.findUniqueOrThrow({where:{operationId:f.op.id}});
  await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');expect(await tx.mergeIntegrationReference.count()).toBeGreaterThan(0);});
  for(const sql of ['UPDATE "MergeIntegrationReference" SET "integrationSha"=NULL','DELETE FROM "MergeIntegrationReference"','TRUNCATE "MergeIntegrationReference"'])await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');await tx.$executeRawUnsafe(sql);})).rejects.toThrow();
  await expect(db.mergeIntegrationReference.update({where:{id:row.id},data:{integrationSha:source}})).rejects.toThrow();
  const c=new pg.Client({connectionString:url});await c.connect();try{await expect(c.query(readFileSync(new URL('../prisma/migrations/202610280005_merge_integration_reference/rollback.sql',import.meta.url),'utf8'))).rejects.toThrow('Preserve recorded');await c.query('ROLLBACK');}finally{await c.end();}
 });
});
