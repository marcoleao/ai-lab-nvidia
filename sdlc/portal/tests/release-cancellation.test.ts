import {randomUUID,createHash} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';

const url=process.env.TEST_RELEASE_CANCELLATION_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test required');
describe.skipIf(!url)('audited release cancellation',()=>{
 const db=database(url!),runtime=createApp({db,demoMode:true});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 const write=(path:string,body:unknown,persona='elisa',key=randomUUID(),method:'POST'|'PUT'='POST')=>runtime.app.inject({method,url:'/api'+path,headers:{'x-persona':persona,'idempotency-key':key},payload:body});
 async function item(kind:string,parentId?:string){const key=randomUUID().replaceAll('-','').slice(0,6).split('').map(c=>String.fromCharCode(65+parseInt(c,16))).join('');const r=await write('/items',{kind,name:'Isolated cancellation '+kind,description:'Controlled cancellation fixture',...(['system','project'].includes(kind)?{key}:{}),...(parentId?{parentId}:{})},'admin');expect(r.statusCode,r.body).toBe(200);const result=r.json().item;if(kind==='story')result.referenceToken=(await runtime.app.inject('/api/items/'+result.id+'/release')).json().story.referenceToken;return result;}
 async function fixture(){
  const system=await item('system'),project=await item('project',system.id),epic=await item('epic',project.id),story=await item('story',epic.id),task=await item('task',story.id);
  const created=await write('/releases',{systemId:system.id,name:'Release cancellation fixture'});expect(created.statusCode,created.body).toBe(200);const release=created.json().release;
  const composed=await write('/releases/'+release.id+'/stories',{expectedVersion:release.version,stories:[{id:story.id,expectedVersion:story.version,expectedReferenceToken:story.referenceToken,expectedReleaseId:null,expectedReleaseVersion:null}]},'elisa',randomUUID(),'PUT');expect(composed.statusCode,composed.body).toBe(200);
  return {system,story,task,release:composed.json().release};
 }
 const reason='Prioridade alterada para outra entrega planejada.';
 const cancel=(value:{id:string;version:number},extra={},persona='elisa',key=randomUUID())=>write('/releases/'+value.id+'/cancel',{expectedVersion:value.version,confirmed:true,reason,...extra},persona,key);
 test('requires confirmation, a valid reason, optimistic version and a release manager',async()=>{
  const f=await fixture();for(const persona of ['ana','bruno','carla','diego',''])expect((await cancel(f.release,{},persona)).statusCode).toBe(403);
  for(const extra of [{confirmed:false},{reason:'curto'},{reason:'😀😀😀😀😀'},{reason:'x'.repeat(501)},{expectedVersion:0},{flowEnvironment:'QA'}])expect((await cancel(f.release,extra)).statusCode).toBe(422);
  expect((await cancel({...f.release,version:f.release.version-1})).statusCode).toBe(409);
  expect((await db.release.findUniqueOrThrow({where:{id:f.release.id}})).compositionStatus).toBe('OPEN');expect(await db.historyEvent.count({where:{action:'RELEASE_CANCELLED',subjectId:f.release.id}})).toBe(0);
 });
 test.each(['OPEN','CLOSED'] as const)('cancels %s and preserves exact composition, Stories, Tasks and environment facts',async state=>{
  const f=await fixture();if(state==='CLOSED')await db.release.update({where:{id:f.release.id},data:{compositionStatus:'CLOSED'}});
  const before={story:await db.item.findUniqueOrThrow({where:{id:f.story.id}}),task:await db.item.findUniqueOrThrow({where:{id:f.task.id}}),members:await db.releaseStory.findMany({where:{releaseId:f.release.id}}),env:await db.environment.findMany({where:{repository:{systemId:f.system.id}},orderBy:{id:'asc'}})};
  const r=await cancel(f.release);expect(r.statusCode,r.body).toBe(200);const data=r.json();expect(data.release).toMatchObject({compositionStatus:'CANCELED',flowEnvironment:'DEV',version:f.release.version+1,cancellationReason:reason,canceledById:'elisa',canceledByName:'Elisa'});expect(data.release.canceledAt).toBeTruthy();expect(data.changed).toBe(true);
  expect(await db.item.findUniqueOrThrow({where:{id:f.story.id}})).toEqual(before.story);expect(await db.item.findUniqueOrThrow({where:{id:f.task.id}})).toEqual(before.task);expect(await db.releaseStory.findMany({where:{releaseId:f.release.id}})).toEqual(before.members);expect(await db.environment.findMany({where:{repository:{systemId:f.system.id}},orderBy:{id:'asc'}})).toEqual(before.env);
  const event=await db.historyEvent.findFirstOrThrow({where:{action:'RELEASE_CANCELLED',subjectId:f.release.id}});expect(event).toMatchObject({outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',operationId:f.release.id});expect(event.audit).toMatchObject({initiator:{id:'elisa'},executor:{id:'elisa'},target:{id:f.release.id,type:'release'}});expect(JSON.stringify(event)).not.toContain(reason);expect(JSON.stringify(event.audit)).toContain(createHash('sha256').update(reason).digest('hex'));
  const listing=(await runtime.app.inject('/api/releases?systemId='+f.system.id)).json();expect(listing.counts).toMatchObject({OPEN:0,CANCELED:1,total:1});expect(listing.environmentCounts).toMatchObject({DEV:1,total:1});
 });
 test.each(['QA','HML','PRD'])('cancellation at %s retains its flow, environment version and completed Stories',async flow=>{
  const f=await fixture(),release=await db.release.create({data:{systemId:f.system.id,key:randomUUID(),name:'Closed historical fixture',compositionStatus:'CLOSED',flowEnvironment:flow,createdById:'admin',createdByName:'Admin'}});
  await db.item.update({where:{id:f.story.id},data:{status:'completed'}});const story=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),environment=await db.environment.findFirstOrThrow({where:{code:flow,repository:{systemId:f.system.id}}});
  const installed=await db.environment.update({where:{id:environment.id},data:{liveStatus:'deployed',currentVersion:'isolated-installed-version',currentPackageDigest:'isolated-immutable-digest'}});
  const r=await cancel(release);expect(r.statusCode,r.body).toBe(200);expect(r.json().release).toMatchObject({compositionStatus:'CANCELED',flowEnvironment:flow});expect(await db.environment.findUniqueOrThrow({where:{id:environment.id}})).toEqual(installed);expect(await db.item.findUniqueOrThrow({where:{id:f.story.id}})).toEqual(story);
 });
 test('same-key concurrent retries and replay return one original decision; another request is NO_CHANGE',async()=>{
  const f=await fixture(),key=randomUUID(),responses=await Promise.all([cancel(f.release,{},'elisa',key),cancel(f.release,{},'elisa',key)]);for(const r of responses)expect(r.statusCode,r.body).toBe(200);expect(responses[1].json()).toEqual(responses[0].json());expect((await cancel(f.release,{},'elisa',key)).json()).toEqual(responses[0].json());
  const original=await db.release.findUniqueOrThrow({where:{id:f.release.id}}),noop=await cancel(original,{reason:'Outra justificativa não substitui a decisão original.'},'admin');expect(noop.statusCode,noop.body).toBe(200);expect(noop.json().changed).toBe(false);expect(await db.release.findUniqueOrThrow({where:{id:f.release.id}})).toEqual(original);
  expect(await db.historyEvent.count({where:{action:'RELEASE_CANCELLED',subjectId:f.release.id,outcome:'SUCCEEDED'}})).toBe(1);expect(await db.historyEvent.count({where:{action:'RELEASE_CANCELLED',subjectId:f.release.id,outcome:'NO_CHANGE'}})).toBe(1);expect((await cancel(f.release,{reason:'Different content using the same command key.'},'elisa',key)).statusCode).toBe(409);
 });
 test('audit failure rolls back cancellation and command key; the same request can retry',async()=>{
  const f=await fixture(),key=randomUUID(),before=await db.release.findUniqueOrThrow({where:{id:f.release.id}});
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_cancel_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RELEASE_CANCELLED' THEN RAISE EXCEPTION 'isolated audit failure'; END IF;RETURN NEW;END $$`);await db.$executeRawUnsafe('CREATE TRIGGER reject_cancel_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_cancel_fixture()');
  try{expect((await cancel(f.release,{},'elisa',key)).statusCode).toBe(500);expect(await db.release.findUniqueOrThrow({where:{id:f.release.id}})).toEqual(before);}finally{await db.$executeRawUnsafe('DROP TRIGGER reject_cancel_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_cancel_fixture()');}
  expect((await cancel(f.release,{},'elisa',key)).statusCode).toBe(200);expect((await cancel(f.release,{},'elisa',key)).statusCode).toBe(200);expect(await db.historyEvent.count({where:{subjectId:f.release.id,action:'RELEASE_CANCELLED'}})).toBe(1);
 });
 test('composition saving and cancellation serialize; neither can overwrite the other revision',async()=>{
  const f=await fixture(),results=await Promise.all([cancel(f.release),write('/releases/'+f.release.id+'/stories',{expectedVersion:f.release.version,stories:[]},'elisa',randomUUID(),'PUT')]);expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
  const current=await db.release.findUniqueOrThrow({where:{id:f.release.id}});if(results[0].statusCode===200){expect(current.compositionStatus).toBe('CANCELED');expect(await db.releaseStory.count({where:{releaseId:f.release.id}})).toBe(1);}else{expect(current.compositionStatus).toBe('OPEN');expect(current.canceledAt).toBeNull();expect(await db.releaseStory.count({where:{releaseId:f.release.id}})).toBe(0);}
 });
 test('terminal cancellation metadata cannot be changed and retained legacy decisions remain unknown',async()=>{
  const f=await fixture();expect((await cancel(f.release)).statusCode).toBe(200);
  for(const data of [{compositionStatus:'OPEN' as const},{compositionStatus:'CLOSED' as const},{cancellationReason:'An overwrite must not be permitted.'},{canceledAt:null},{canceledById:'other'}])await expect(db.release.update({where:{id:f.release.id},data})).rejects.toThrow();
  expect((await write('/releases/'+f.release.id+'/stories',{expectedVersion:f.release.version+1,stories:[]},'elisa',randomUUID(),'PUT')).statusCode).toBe(409);
  const old=await db.release.create({data:{systemId:f.system.id,key:randomUUID(),name:'Retained legacy cancellation',compositionStatus:'CANCELED',flowEnvironment:null,createdById:'admin',createdByName:'Admin'}});const r=await cancel(old);expect(r.statusCode,r.body).toBe(200);expect(r.json().release).toMatchObject({canceledAt:null,canceledById:null,cancellationReason:null,flowEnvironment:null,compositionStatus:'CANCELED'});expect(r.json().changed).toBe(false);
 });
});
