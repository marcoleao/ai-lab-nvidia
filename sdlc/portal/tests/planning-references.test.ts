import {randomUUID,createHash} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {planningReferences} from '../apps/api/src/planning-references.ts';

const url=process.env.TEST_DATABASE_URL;if(url&&new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test required');
describe.skipIf(!url)('planning reference identity and reviewed command context',()=>{
 const db=database(url!),runtime=createApp({db,demoMode:true});afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 const write=(path:string,payload:unknown,key=randomUUID(),method:'POST'|'PUT'='POST')=>runtime.app.inject({method,url:'/api'+path,headers:{'x-persona':'admin','idempotency-key':key},payload});
 async function item(kind:string,parentId?:string){const key=randomUUID().slice(0,6).split('').map(c=>String.fromCharCode(65+parseInt(c,16))).join('');const r=await write('/items',{kind,name:'Reference fixture '+kind,description:'Current business scope',...(['system','project'].includes(kind)?{key}:{}),...(parentId?{parentId}:{})});expect(r.statusCode,r.body).toBe(200);return r.json().item;}
 async function fixture(){const system=await item('system'),project=await item('project',system.id),epic=await item('epic',project.id),story=await item('story',epic.id),response=await write('/releases',{systemId:system.id,name:'Planning references fixture'});expect(response.statusCode,response.body).toBe(200);return {system,epic,story,release:response.json().release};}
 async function view(id:string){const r=await runtime.app.inject('/api/items/'+id+'/release');expect(r.statusCode,r.body).toBe(200);return r.json();}
 async function body(storyId:string,releaseId:string){const v=await view(storyId),r=(await runtime.app.inject('/api/releases/'+releaseId)).json().release;return {expectedVersion:v.story.version,expectedReferenceToken:v.story.referenceToken,releaseId,expectedCurrentReleaseId:v.assignment?.releaseId??null,expectedCurrentReleaseVersion:v.assignment?.releaseVersion??null,expectedReleaseVersion:r.version};}
 const attach=async(f:any)=>write('/items/'+f.story.id+'/release',await body(f.story.id,f.release.id));
 const latest=(id:string)=>db.releaseCompositionRevision.findFirstOrThrow({where:{releaseId:id},orderBy:{number:'desc'}});
 test('the restricted runtime computes the same content token and normalizes object key order',async()=>{
  const f=await fixture();await db.item.update({where:{id:f.story.id},data:{data:{requirements:{objective:'A',behavior:'B'},administrativeFlag:1}}});const first=(await view(f.story.id)).story.referenceToken;
  await db.item.update({where:{id:f.story.id},data:{status:'coding',version:{increment:1},data:{administrativeFlag:2,requirements:{behavior:'B',objective:'A'}}}});
  const second=(await view(f.story.id)).story.referenceToken;expect(second).toBe(first);
  await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE sdlc_portal_app');expect((await planningReferences(tx,[f.story.id])).get(f.story.id)?.referenceToken).toBe(first);});
 });
 async function execution(f:any,sha:string|null,offset=0){const repo=await db.repository.findUniqueOrThrow({where:{systemId:f.system.id}});return db.storyExecution.create({data:{storyId:f.story.id,repositoryId:repo.id,storyVersion:f.story.version,state:'succeeded',stage:'completed',commitSha:sha,snapshot:{private:'PRIVATE_CONTEXT'},actorId:'admin',actorName:'Admin',createdAt:new Date(new Date(f.story.createdAt).getTime()+1+offset)}});}
 test('phase and record version do not invalidate planning or create another composition on save',async()=>{
  const f=await fixture();expect((await attach(f)).statusCode).toBe(200);const before=await latest(f.release.id),token=(await view(f.story.id)).story.referenceToken;
  await db.item.update({where:{id:f.story.id},data:{status:'testing',version:{increment:1},data:{administrativeFlag:'unrelated'}}});const v=await view(f.story.id);
  expect(v.story).toMatchObject({referenceToken:token,referenceReading:{state:'current',approval:'unconfirmed'},ready:false,currentRevisionUnassigned:false});expect(v.story.currentVersion).not.toBe(v.story.plannedVersion);
  expect((await attach(f)).statusCode).toBe(200);expect(await latest(f.release.id)).toEqual(before);
  const catalog=(await runtime.app.inject(`/api/releases/${f.release.id}/stories?reference=current`)).json();expect(catalog.total).toBe(1);
  const row=catalog.stories[0],r=catalog.release;const saved=await write('/releases/'+r.id+'/stories',{expectedVersion:r.version,stories:[{id:row.id,expectedVersion:row.version,expectedReferenceToken:row.referenceToken,expectedReleaseId:r.id,expectedReleaseVersion:r.version}]},randomUUID(),'PUT');expect(saved.statusCode,saved.body).toBe(200);expect(await latest(r.id)).toEqual(before);
  expect((await runtime.app.inject(`/api/releases/${r.id}/stories?association=unassigned`)).json().total).toBe(0);
 });
 test('content change without record-version change requires the new reviewed token and preserves old revisions',async()=>{
  const f=await fixture();await attach(f);const before=await latest(f.release.id),oldBody=await body(f.story.id,f.release.id);
  await db.item.update({where:{id:f.story.id},data:{description:'A changed business requirement'}});const v=await view(f.story.id);expect(v.story.referenceReading.state).toBe('outdated');expect(v.story.referenceToken).not.toBe(oldBody.expectedReferenceToken);
  const rejected=await write('/items/'+f.story.id+'/release',oldBody);expect(rejected.statusCode).toBe(409);expect(rejected.json().error.code).toBe('PLANNING_REFERENCE_CHANGED');expect(await latest(f.release.id)).toEqual(before);
  expect((await attach(f)).statusCode).toBe(200);const after=await latest(f.release.id);expect(after.id).not.toBe(before.id);expect((await view(f.story.id)).story.referenceReading.state).toBe('current');expect(await db.releaseCompositionRevision.findUnique({where:{id:before.id}})).toEqual(before);
  const event=await db.historyEvent.findFirstOrThrow({where:{itemId:f.story.id,action:'STORY_RELEASE_PLANNED'},orderBy:{timestamp:'desc'}});expect((event.audit as any).changes).toContainEqual({field:'compositionRevisionId',before:{kind:'value',value:before.id},after:{kind:'value',value:after.id}});
 });
 test('a new specification requires review even if the administrative version is unchanged',async()=>{
  const f=await fixture();await attach(f);const old=await body(f.story.id,f.release.id);await db.storySpecificationRevision.create({data:{storyId:f.story.id,number:99,content:{private:'PRIVATE_SPECIFICATION'},source:'human',actorId:'admin',actorName:'Admin'}});
  const v=await view(f.story.id);expect(v.story.referenceReading.state).toBe('outdated');expect(JSON.stringify(v)).not.toContain('PRIVATE_SPECIFICATION');expect((await write('/items/'+f.story.id+'/release',old)).statusCode).toBe(409);await attach(f);expect((await view(f.story.id)).story.referenceReading.state).toBe('current');
 });
 test('composition editor records the changed reference before and after on the Story audit as well as the Release',async()=>{
  const f=await fixture();await attach(f);const before=await latest(f.release.id);await db.item.update({where:{id:f.story.id},data:{description:'A code-independent planning change'}});const v=await view(f.story.id),r=(await runtime.app.inject('/api/releases/'+f.release.id)).json().release;
  const response=await write('/releases/'+r.id+'/stories',{expectedVersion:r.version,stories:[{id:f.story.id,expectedVersion:v.story.version,expectedReferenceToken:v.story.referenceToken,expectedReleaseId:r.id,expectedReleaseVersion:r.version}]},randomUUID(),'PUT');expect(response.statusCode,response.body).toBe(200);const after=await latest(r.id),event=await db.historyEvent.findFirstOrThrow({where:{itemId:f.story.id,action:'STORY_RELEASE_PLANNED'},orderBy:{timestamp:'desc'}});expect((event.audit as any).changes).toContainEqual({field:'compositionRevisionId',before:{kind:'value',value:before.id},after:{kind:'value',value:after.id}});expect(event.payload).toMatchObject({fromCompositionRevisionId:before.id,compositionRevisionId:after.id});
 });
 test('same published SHA in a new execution preserves identity; a different SHA requires explicit refresh',async()=>{
  const f=await fixture(),first=await execution(f,'a'.repeat(40));await attach(f);const original=await latest(f.release.id),old=await body(f.story.id,f.release.id),second=await execution(f,'a'.repeat(40),1000);
  const same=await view(f.story.id);expect(same.story.referenceReading.state).toBe('current');expect(same.story.referenceToken).toBe(old.expectedReferenceToken);await attach(f);expect(await latest(f.release.id)).toEqual(original);expect((same.story.planningReference.execution as any).id).toBe(first.id);
  await db.storyExecution.update({where:{id:second.id},data:{commitSha:'b'.repeat(40)}});expect((await view(f.story.id)).story.referenceReading.state).toBe('outdated');expect((await write('/items/'+f.story.id+'/release',old)).statusCode).toBe(409);await attach(f);expect((await view(f.story.id)).story.planningReference.execution.sha).toBe('b'.repeat(40));
 });
 test('a latest execution without a published SHA is unconfirmed and never borrows older code',async()=>{
  const f=await fixture();await execution(f,'a'.repeat(40));await attach(f);await execution(f,null,1000);const v=await view(f.story.id);expect(v.story.referenceReading.state).toBe('unconfirmed');expect(v.story.currentReference.execution.sha).toBeNull();expect(v.story.ready).toBe(false);
  await attach(f);const saved=await latest(f.release.id);expect((await view(f.story.id)).story.referenceReading.message).toContain('não tem código publicado');await attach(f);expect(await latest(f.release.id)).toEqual(saved);
  expect((await runtime.app.inject(`/api/releases/${f.release.id}/stories?reference=review`)).json().total).toBe(1);
 });
 test('older comparison policy stays unconfirmed until an explicit save; immutable history is not rewritten',async()=>{
  const f=await fixture();await attach(f);const prior=await latest(f.release.id),entries=(prior.stories as any[]).map(({referenceToken,contentPolicy,...entry})=>entry),old=await db.releaseCompositionRevision.create({data:{releaseId:f.release.id,number:prior.number+1,releaseRecordVersion:prior.releaseRecordVersion,compositionStatus:'OPEN',flowEnvironment:'DEV',source:'planned',storyCount:1,stories:entries,digest:'a'.repeat(64),actorId:'admin',actorName:'Admin',operationId:f.release.id}});
  expect((await view(f.story.id)).story.referenceReading.state).toBe('unconfirmed');await attach(f);expect((await view(f.story.id)).story.referenceReading.state).toBe('current');expect(await db.releaseCompositionRevision.findUnique({where:{id:old.id}})).toEqual(old);
 });
 test('whole-scope filters separate absent association from changed/unconfirmed planning beyond the first page',async()=>{
  const f=await fixture(),ids=Array.from({length:45},()=>randomUUID());await db.item.createMany({data:ids.map((id,index)=>({id,kind:'story',parentId:f.epic.id,parentKind:'epic',key:'REF-'+id,name:'Reference '+index,status:'coding',description:'Same scope',data:{}}))});
  const context=(await runtime.app.inject(`/api/releases/${f.release.id}/selection-context?ids=${ids.slice(0,30).join(',')}`)).json(),rows=context.items;
  const save=await write('/releases/'+f.release.id+'/stories',{expectedVersion:1,stories:rows.map((row:any)=>({id:row.id,expectedVersion:row.version,expectedReferenceToken:row.referenceToken,expectedReleaseId:null,expectedReleaseVersion:null}))},randomUUID(),'PUT');expect(save.statusCode,save.body).toBe(200);
  await db.item.updateMany({where:{id:{in:ids.slice(0,22)}},data:{description:'Changed content'}});await db.item.updateMany({where:{id:{in:ids.slice(22,30)}},data:{status:'testing',version:{increment:1}}});
  const unassigned=(await runtime.app.inject(`/api/releases/${f.release.id}/stories?association=unassigned`)).json(),review=(await runtime.app.inject(`/api/releases/${f.release.id}/stories?reference=review&page=2`)).json(),current=(await runtime.app.inject(`/api/releases/${f.release.id}/stories?reference=current&status=testing`)).json();expect(unassigned.total).toBe(16);expect(unassigned.stories.every((row:any)=>!row.assignment)).toBe(true);expect(review.total).toBe(22);expect(review.stories).toHaveLength(2);expect(review.stories.every((row:any)=>row.referenceReading.state==='outdated')).toBe(true);expect(current.total).toBe(8);
 });
 test('a change between initial validation and snapshot capture rolls back the command and can retry',async()=>{
  const f=await fixture(),run=await execution(f,'a'.repeat(40)),payload=await body(f.story.id,f.release.id),key=randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION change_reference_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.release.id}' THEN UPDATE "StoryExecution" SET "commitSha"='${'b'.repeat(40)}' WHERE id='${run.id}'; END IF; RETURN NEW; END; $$`);await db.$executeRawUnsafe('CREATE TRIGGER change_reference_fixture BEFORE UPDATE ON "Release" FOR EACH ROW EXECUTE FUNCTION change_reference_fixture()');
  try{const r=await write('/items/'+f.story.id+'/release',payload,key);expect(r.statusCode,r.body).toBe(409);expect(r.json().error.code).toBe('PLANNING_REFERENCE_CHANGED');expect(await db.releaseStory.findUnique({where:{storyId:f.story.id}})).toBeNull();expect((await latest(f.release.id)).number).toBe(1);}finally{await db.$executeRawUnsafe('DROP TRIGGER change_reference_fixture ON "Release"');await db.$executeRawUnsafe('DROP FUNCTION change_reference_fixture()');}
  expect((await write('/items/'+f.story.id+'/release',payload,key)).statusCode).toBe(200);
 });
 test('a previously confirmed request without a token can replay, while a new request must include reviewed context',async()=>{
  const f=await fixture(),payload=await body(f.story.id,f.release.id),key=randomUUID();delete (payload as any).expectedReferenceToken;const path='/api/items/'+f.story.id+'/release',id=createHash('sha256').update('admin:'+key).digest('hex'),requestHash=createHash('sha256').update(JSON.stringify(['POST',path,payload])).digest('hex');await db.requestKey.create({data:{id,requestHash,result:{previouslyConfirmed:true}}});
  const replay=await write('/items/'+f.story.id+'/release',payload,key);expect(replay.statusCode,replay.body).toBe(200);expect(replay.json()).toEqual({previouslyConfirmed:true});const fresh=await write('/items/'+f.story.id+'/release',payload);expect(fresh.statusCode).toBe(409);expect(fresh.json().error.code).toBe('PLANNING_REFERENCE_REQUIRED');
 });
});
