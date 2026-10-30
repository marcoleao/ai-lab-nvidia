import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {compositionMembers} from '../apps/api/src/release-compositions.ts';

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test required');
describe.skipIf(!url)('independent immutable Release compositions',()=>{
 const db=database(url!),runtime=createApp({db,demoMode:true});afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 const write=(path:string,payload:unknown,key=randomUUID(),method:'POST'|'PUT'='POST',persona='admin')=>runtime.app.inject({method,url:'/api'+path,headers:{'x-persona':persona,'idempotency-key':key},payload});
 async function create(kind:string,parentId?:string){const key=randomUUID().slice(0,6).split('').map(c=>String.fromCharCode(65+parseInt(c,16))).join('');const r=await write('/items',{kind,name:'Isolated composition '+kind,description:'Composition source fixture',...(['system','project'].includes(kind)?{key}:{}),...(parentId?{parentId}:{})});expect(r.statusCode,r.body).toBe(200);const result=r.json().item;if(kind==='story')result.referenceToken=(await runtime.app.inject('/api/items/'+result.id+'/release')).json().story.referenceToken;return result;}
 async function release(systemId:string){const r=await write('/releases',{systemId,name:'Isolated composition '+randomUUID()});expect(r.statusCode,r.body).toBe(200);return r.json().release;}
 async function fixture(){const system=await create('system'),project=await create('project',system.id),epic=await create('epic',project.id),story=await create('story',epic.id),a=await release(system.id),b=await release(system.id);return {system,epic,story,a,b};}
 test('collection cutoffs use the database clock even when the API clock is behind persisted revisions',async()=>{
  const f=await fixture();await attach(f.story.id,f.a.id);const row=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id},orderBy:{number:'desc'}}),future=new Date('2099-01-01T00:00:00Z');
  await db.releaseCompositionRevision.create({data:{...row,id:randomUUID(),number:row.number+1,createdAt:future}});const before=await db.historyEvent.count();
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
  try{const list=await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions?page=1`),participation=await runtime.app.inject(`/api/items/${f.story.id}/release-participations`);expect(list.statusCode,list.body).toBe(200);expect(list.json().pagination.total).toBe(3);expect(participation.statusCode,participation.body).toBe(200);expect(participation.json().pagination.total).toBe(2);expect(list.json().asOf).toBe(future.toISOString());const explicit=(await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions?asOf=2020-01-01T00:00:00Z`)).json();expect(explicit.pagination.total).toBe(0);expect(explicit.currentRevisionNumber).toBe(3);expect(await db.historyEvent.count()).toBe(before);}finally{vi.useRealTimers();}
 });
 const detail=(id:string)=>runtime.app.inject('/api/releases/'+id);
 async function attach(storyId:string,releaseId:string|null,key=randomUUID()){
  const r=await runtime.app.inject('/api/items/'+storyId+'/release'),view=r.json();expect(r.statusCode,r.body).toBe(200);const current=view.assignment,target=releaseId?(await detail(releaseId)).json().release:null;
  return write('/items/'+storyId+'/release',{expectedVersion:view.story.version,expectedReferenceToken:view.story.referenceToken,releaseId,expectedCurrentReleaseId:current?.releaseId??null,expectedCurrentReleaseVersion:current?.releaseVersion??null,...(target?{expectedReleaseVersion:target.version}:{})},key);
 }
 test('creation records one complete empty composition with actual authorship and audit reference',async()=>{
  const f=await fixture(),row=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id}});
  expect(row).toMatchObject({number:1,releaseRecordVersion:1,storyCount:0,stories:[],source:'planned',actorId:'admin'});
  const event=await db.historyEvent.findFirstOrThrow({where:{subjectId:f.a.id,action:'RELEASE_CREATED'}});
  expect(event.payload).toMatchObject({compositionRevisionId:row.id,compositionRevisionNumber:1,compositionDigest:row.digest});
  expect((await detail(f.a.id)).json().composition.id).toBe(row.id);
 });
 test('transfer and removal retain independent complete references without changing Story or inventing approval',async()=>{
  const f=await fixture(),spec=await db.storySpecificationRevision.create({data:{storyId:f.story.id,number:1,content:{private:'PRIVATE_SPECIFICATION'},source:'human',actorId:'admin',actorName:'Admin'}}),repo=await db.repository.findUniqueOrThrow({where:{systemId:f.system.id}});
  const run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:repo.id,storyVersion:f.story.version,state:'succeeded',stage:'completed',commitSha:'a'.repeat(40),snapshot:{private:'PRIVATE_PROMPT_OR_CODE'},actorId:'admin',actorName:'Admin'}});
  expect((await attach(f.story.id,f.a.id)).statusCode).toBe(200);const original=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id},orderBy:{number:'desc'}});
  expect(compositionMembers(original)[0]).toMatchObject({storyId:f.story.id,recordVersion:f.story.version,specification:{id:spec.id,number:1},execution:{id:run.id,sha:'a'.repeat(40)}});
  expect((await attach(f.story.id,f.b.id)).statusCode).toBe(200);expect((await detail(f.a.id)).json().stories).toEqual([]);expect((await detail(f.b.id)).json().stories.map((s:any)=>s.id)).toEqual([f.story.id]);
  expect(await db.releaseCompositionRevision.findUniqueOrThrow({where:{id:original.id}})).toEqual(original);
  const response=await runtime.app.inject('/api/items/'+f.story.id+'/release-participations');expect(response.statusCode,response.body).toBe(200);expect(response.json().items.map((r:any)=>r.releaseId).sort()).toEqual([f.a.id,f.b.id].sort());expect(response.body).not.toContain('PRIVATE_');
  expect((await attach(f.story.id,null)).statusCode).toBe(200);const removed=(await runtime.app.inject('/api/items/'+f.story.id+'/release-participations')).json();expect(removed.currentPlanningReleaseId).toBeNull();expect(removed.pagination.total).toBe(2);
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('specification');expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).version).toBe(f.story.version);
 });
 test('revision is independent of later code, specification, cancellation and selected history page',async()=>{
  const f=await fixture();await attach(f.story.id,f.a.id);const original=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id},orderBy:{number:'desc'}});
  await db.item.update({where:{id:f.story.id},data:{description:'A newer scope',version:{increment:1}}});await db.storySpecificationRevision.create({data:{storyId:f.story.id,number:2,content:{},source:'human',actorId:'admin',actorName:'Admin'}});
  const current=(await detail(f.a.id)).json().release;const cancel=await write('/releases/'+f.a.id+'/cancel',{expectedVersion:current.version,confirmed:true,reason:'Cancel only the retained planning record.'});expect(cancel.statusCode,cancel.body).toBe(200);
  const before={history:await db.historyEvent.count(),keys:await db.requestKey.count(),revisions:await db.releaseCompositionRevision.count()};
  const viewed=await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions/${original.id}?page=999`);expect(viewed.statusCode,viewed.body).toBe(200);expect(viewed.json().stories).toEqual(compositionMembers(original));expect(viewed.json().revision.compositionStatus).toBe('OPEN');
  expect((await detail(f.a.id)).json().release.compositionStatus).toBe('CANCELED');
  expect({history:await db.historyEvent.count(),keys:await db.requestKey.count(),revisions:await db.releaseCompositionRevision.count()}).toEqual(before);
  expect((await attach(f.story.id,f.b.id)).statusCode).toBe(409);expect(await db.releaseCompositionRevision.count()).toBe(before.revisions);
 });
 test('same idempotency key replays concurrent requests without another composition revision',async()=>{
  const f=await fixture(),key=randomUUID(),body={expectedVersion:f.story.version,expectedReferenceToken:f.story.referenceToken,releaseId:f.a.id,expectedCurrentReleaseId:null,expectedCurrentReleaseVersion:null,expectedReleaseVersion:1};
  const results=await Promise.all([write('/items/'+f.story.id+'/release',body,key),write('/items/'+f.story.id+'/release',body,key)]);expect(results.map(r=>r.statusCode)).toEqual([200,200]);expect(results[0].json()).toEqual(results[1].json());expect(await db.releaseCompositionRevision.count({where:{releaseId:f.a.id}})).toBe(2);
  const current=(await detail(f.a.id)).json().release;await attach(f.story.id,f.a.id);expect((await detail(f.a.id)).json().release.version).toBe(current.version);expect(await db.releaseCompositionRevision.count({where:{releaseId:f.a.id}})).toBe(2);
 });
 test('recorder failure rolls back revision, planning link, release version and request key; same request retries',async()=>{
  const f=await fixture(),key=randomUUID(),body={expectedVersion:f.story.version,expectedReferenceToken:f.story.referenceToken,releaseId:f.a.id,expectedCurrentReleaseId:null,expectedCurrentReleaseVersion:null,expectedReleaseVersion:1},before=await db.releaseCompositionRevision.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_composition_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RELEASE_COMPOSITION_CHANGED' THEN RAISE EXCEPTION 'audit rollback fixture'; END IF; RETURN NEW; END; $$`);await db.$executeRawUnsafe('CREATE TRIGGER reject_composition_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_composition_fixture()');
  try{const r=await write('/items/'+f.story.id+'/release',body,key);expect(r.statusCode).toBeGreaterThanOrEqual(500);expect(await db.releaseCompositionRevision.count()).toBe(before);expect(await db.releaseStory.findUnique({where:{storyId:f.story.id}})).toBeNull();expect((await detail(f.a.id)).json().release.version).toBe(1);}finally{await db.$executeRawUnsafe('DROP TRIGGER reject_composition_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_composition_fixture()');}
  expect((await write('/items/'+f.story.id+'/release',body,key)).statusCode).toBe(200);expect(await db.releaseCompositionRevision.count()).toBe(before+1);
 });
 test('list snapshots and Story participation pages are complete and preserve asOf while current composition advances',async()=>{
  const f=await fixture();for(let n=0;n<22;n++){expect((await attach(f.story.id,f.a.id)).statusCode).toBe(200);expect((await attach(f.story.id,null)).statusCode).toBe(200);}
  const history=(await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions`)).json(),participation=(await runtime.app.inject(`/api/items/${f.story.id}/release-participations`)).json();expect(history.pagination.total).toBe(45);expect(history.items).toHaveLength(20);expect(participation.pagination.total).toBe(22);
  expect((await runtime.app.inject(`/api/items/${f.story.id}/release-participations?page=2&asOf=${encodeURIComponent(participation.asOf)}`)).json().items).toHaveLength(2);
  await attach(f.story.id,f.a.id);const old=(await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions?page=3&asOf=${encodeURIComponent(history.asOf)}`)).json();expect(old.pagination.total).toBe(45);expect(old.items).toHaveLength(5);expect(old.currentRevisionNumber).toBe(46);
 });
 test('member pagination reads the full immutable set and refuses a revision belonging to another Release',async()=>{
  const f=await fixture(),stories=[f.story];for(let n=1;n<25;n++)stories.push(await create('story',f.epic.id));
  const r=await write('/releases/'+f.a.id+'/stories',{expectedVersion:1,stories:stories.map(story=>({id:story.id,expectedVersion:story.version,expectedReferenceToken:story.referenceToken,expectedReleaseId:null,expectedReleaseVersion:null}))},randomUUID(),'PUT');expect(r.statusCode,r.body).toBe(200);
  const row=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id},orderBy:{number:'desc'}}),page=(await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions/${row.id}?page=2`)).json();expect(page.pagination).toEqual({page:2,pageSize:20,total:25,totalPages:2});expect(page.stories).toHaveLength(5);
  expect((await runtime.app.inject(`/api/releases/${f.b.id}/composition-revisions/${row.id}`)).statusCode).toBe(404);
  expect((await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions?page=0`)).statusCode).toBe(422);
 });
 test('database retains revisions against update, delete and truncate, and runtime can read without mutation privileges',async()=>{
  const f=await fixture(),row=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id}});
  await expect(db.releaseCompositionRevision.update({where:{id:row.id},data:{actorName:'Rewrite'}})).rejects.toThrow();await expect(db.releaseCompositionRevision.delete({where:{id:row.id}})).rejects.toThrow();await expect(db.$executeRawUnsafe('TRUNCATE "ReleaseCompositionRevision"')).rejects.toThrow();
  await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');expect(await tx.releaseCompositionRevision.findUnique({where:{id:row.id}})).toMatchObject({id:row.id});});
  await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');await tx.releaseCompositionRevision.update({where:{id:row.id},data:{actorName:'Forbidden'}});})).rejects.toThrow();
  await expect(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');await tx.releaseCompositionRevision.create({data:{releaseId:f.a.id,number:2,releaseRecordVersion:1,compositionStatus:'OPEN',flowEnvironment:'DEV',source:'observed',storyCount:0,stories:[]}});})).rejects.toThrow();
 });
 test('two retained compositions can contain the same Story independently from the single active planning link',async()=>{
  const f=await fixture();await attach(f.story.id,f.a.id);const origin=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:f.a.id},orderBy:{number:'desc'}});await attach(f.story.id,f.b.id);
  // Immutable source, not active planning, owns historical composition identity.
  const viewed=(await runtime.app.inject(`/api/releases/${f.a.id}/composition-revisions/${origin.id}`)).json();expect(viewed.stories[0].storyId).toBe(f.story.id);expect((await detail(f.b.id)).json().stories[0].id).toBe(f.story.id);expect((await db.releaseStory.findUniqueOrThrow({where:{storyId:f.story.id}})).releaseId).toBe(f.b.id);
  const other=await fixture(),records=await db.releaseCompositionRevision.count(),target=await db.release.findUniqueOrThrow({where:{id:f.b.id}}),latest=await db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:target.id},orderBy:{number:'desc'}});
  await expect(db.releaseCompositionRevision.create({data:{releaseId:target.id,number:latest.number+1,releaseRecordVersion:target.version,compositionStatus:'OPEN',flowEnvironment:'DEV',source:'planned',actorId:'admin',actorName:'Admin',operationId:target.id,digest:'a'.repeat(64),storyCount:1,stories:[{storyId:other.story.id,recordVersion:1,specification:null,execution:null}]}})).rejects.toThrow();expect(await db.releaseCompositionRevision.count()).toBe(records);
 });
});
