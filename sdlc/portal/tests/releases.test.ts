import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import type {WorkItem} from '@sdlc/shared';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';

// This suite owns a fresh disposable database. Do not share it with foundation:
// foundation deliberately asserts global emptiness and never deletes history.
const url=process.env.TEST_RELEASES_DATABASE_URL;
if(url&&!new URL(url).pathname.endsWith('/portal_test'))throw new Error('Release tests require an explicit disposable portal_test database');
describe.skipIf(!url)('persisted Release planning',()=>{
  const db=database(url!);
  const {app}=createApp({db,demoMode:true});
  type Draft={id:string;key:string;name:string;systemId:string;version:number;compositionStatus:string;storyCount:number};
  beforeAll(async()=>{await app.ready();});
  afterAll(async()=>{await app.close();await db.$disconnect();});
  async function write(path:string,payload:unknown,persona='admin',method:'POST'|'PUT'|'PATCH'|'DELETE'='POST',key=randomUUID()){
    return app.inject({method,url:`/api${path}`,headers:{'x-persona':persona,'idempotency-key':key},payload});
  }
  async function create(kind:string,parentId?:string){
    const suffix=randomUUID().replaceAll('-','').slice(0,6).split('').map(c=>String.fromCharCode(65+parseInt(c,16))).join('');
    const response=await write('/items',{kind,parentId,name:`Release test ${kind}`,description:'Disposable integration fixture',...(['system','project'].includes(kind)?{key:suffix}:{})});
    expect(response.statusCode,response.body).toBe(200);const item=response.json().item;if(kind==='story')item.referenceToken=(await app.inject(`/api/items/${item.id}/release`)).json().story.referenceToken;return item as WorkItem;
  }
  async function scope(){const system=await create('system');const project=await create('project',system.id);const epic=await create('epic',project.id);return {system,project,epic,story:await create('story',epic.id)};}
  async function draft(systemId:string,name='Release de integração',persona='elisa'){
    const response=await write('/releases',{systemId,name},persona);
    expect(response.statusCode,response.body).toBe(200);return response.json().release as Draft;
  }
  async function selected(id:string){
    const response=await app.inject(`/api/items/${id}/release`);expect(response.statusCode,response.body).toBe(200);
    const row=response.json().story;
    return {id:row.id,expectedVersion:row.version,expectedReferenceToken:row.referenceToken,expectedReleaseId:row.assignment?.releaseId??null,expectedReleaseVersion:row.assignment?.releaseVersion??null};
  }
  async function compose(value:Draft,ids:string[],persona='elisa'){
    return write(`/releases/${value.id}/stories`,{expectedVersion:value.version,stories:await Promise.all(ids.map(selected))},persona,'PUT');
  }
  async function attach(storyId:string,target:Draft|null,persona='ana'){
    const row=(await app.inject(`/api/items/${storyId}/release`)).json().story;
    return write(`/items/${storyId}/release`,{expectedVersion:row.version,expectedReferenceToken:row.referenceToken,releaseId:target?.id??null,expectedCurrentReleaseId:row.assignment?.releaseId??null,expectedCurrentReleaseVersion:row.assignment?.releaseVersion??null,...(target?{expectedReleaseVersion:target.version}:{})},persona);
  }

  test('empty reads do not seed Systems, Releases, candidate checks or history',async()=>{
    expect(await db.item.count()).toBe(0);expect(await db.release.count()).toBe(0);
    const response=await app.inject('/api/releases');expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({releases:[],systems:[],counts:{OPEN:0,CLOSED:0,CANCELED:0,total:0},pagination:{page:1,pageSize:20,total:0,totalPages:1},capabilities:{canBuild:false,canPromote:false,qualityChecksAvailable:false}});
    expect(await db.item.count()).toBe(0);expect(await db.historyEvent.count()).toBe(0);
  });
  test('creation permits an empty OPEN and separates release managers from Story planners',async()=>{
    const own=await scope();
    for(const person of ['ana','bruno','carla','diego'])expect((await write('/releases',{systemId:own.system.id,name:'Unauthorized'},person)).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/releases',headers:{'idempotency-key':randomUUID()},payload:{systemId:own.system.id,name:'No persona'}})).statusCode).toBe(403);
    const value=await draft(own.system.id);
    expect(value).toMatchObject({compositionStatus:'OPEN',flowEnvironment:'DEV',version:1,storyCount:0,createdByName:'Elisa'});
    const detail=(await app.inject(`/api/releases/${value.id}`)).json();
    expect(detail.stories).toEqual([]);expect(detail.history[0].action).toBe('RELEASE_CREATED');
    expect(detail.history[0].payload).toMatchObject({compositionStatus:'OPEN',flowEnvironment:'DEV'});
    const recorded=await db.historyEvent.findFirstOrThrow({where:{action:'RELEASE_CREATED',itemId:own.system.id}});expect(recorded.outcome).toBe('SUCCEEDED');expect(recorded.phase).toBe('COMPLETED');
    expect(recorded.audit).toMatchObject({initiator:{id:'elisa'},executor:{id:'elisa'}});
    expect((await compose(value,[own.story.id],'ana')).statusCode).toBe(403);
    const response=await attach(own.story.id,value,'ana');expect(response.statusCode,response.body).toBe(200);
    expect(response.json().assignment).toMatchObject({releaseId:value.id,storyVersion:own.story.version});
    expect((await db.item.findUniqueOrThrow({where:{id:own.story.id}})).status).toBe('specification');
    expect(await db.storyExecution.count()).toBe(0);expect(await db.environment.count()).toBe(4);
  });
  test('selection refresh reads exact IDs across pages without changing composition or history',async()=>{
    const own=await scope(),other=await scope(),value=await draft(own.system.id);
    const second=await create('story',own.epic.id);
    const before={events:await db.historyEvent.count(),keys:await db.requestKey.count()};
    const response=await app.inject(`/api/releases/${value.id}/selection-context?ids=${own.story.id},${second.id},${other.story.id},missing,${own.story.id}`);
    expect(response.statusCode,response.body).toBe(200);
    const body=response.json();
    expect(body.items.map((row:{id:string})=>row.id).sort()).toEqual([own.story.id,second.id].sort());
    expect(body.missingIds).toEqual([other.story.id,'missing']);
    expect(body.release).toMatchObject({id:value.id,version:1,storyCount:0});
    expect(body.asOf).toEqual(expect.any(String));
    expect(await db.historyEvent.count()).toBe(before.events);expect(await db.requestKey.count()).toBe(before.keys);
    expect(await db.releaseStory.count({where:{releaseId:value.id}})).toBe(0);
  });
  test('selection refresh bounds the requested set and rejects invalid or unknown scope',async()=>{
    const own=await scope(),value=await draft(own.system.id);
    for(const query of ['ids=','ids=a,,b',`ids=${Array.from({length:51},(_,index)=>`id-${index}`).join(',')}`,'ids=a&other=true'])
      expect((await app.inject(`/api/releases/${value.id}/selection-context?${query}`)).statusCode).toBe(422);
    expect((await app.inject('/api/releases/missing/selection-context?ids=a')).statusCode).toBe(404);
  });
  test('strict inputs reject compositionStatus changes, invalid scope, blank names and cross-origin writes',async()=>{
    const own=await scope();
    for(const payload of [{systemId:own.system.id,name:'   '},{systemId:own.system.id,name:'Valid name',compositionStatus:'CLOSED'},{systemId:own.system.id,name:'Invalid flow',flowEnvironment:'QA'},{systemId:own.project.id,name:'Wrong kind'}])expect([400,422]).toContain((await write('/releases',payload)).statusCode);
    const response=await app.inject({method:'POST',url:'/api/releases',headers:{'x-persona':'admin','idempotency-key':randomUUID(),origin:'https://untrusted.invalid'},payload:{systemId:own.system.id,name:'Cross origin'}});
    expect(response.statusCode).toBe(403);expect(await db.release.count({where:{systemId:own.system.id}})).toBe(0);
  });
  test('list uses stable newest-first pages of 20 and compositionStatus counts before filtering compositionStatus',async()=>{
    const own=await scope();const values:Draft[]=[];
    for(let n=0;n<23;n++)values.push(await draft(own.system.id,`Página ${String(n).padStart(2,'0')}`));
    const sameDate=new Date('2026-10-22T15:00:00Z');
    await db.release.updateMany({where:{systemId:own.system.id},data:{createdAt:sameDate}});
    const ordered=values.map(v=>v.id).sort().reverse();
    const first=(await app.inject(`/api/releases?systemId=${own.system.id}`)).json();
    const second=(await app.inject(`/api/releases?systemId=${own.system.id}&page=2`)).json();
    expect(first.releases.map((v:Draft)=>v.id)).toEqual(ordered.slice(0,20));expect(second.releases.map((v:Draft)=>v.id)).toEqual(ordered.slice(20));
    expect(first.pagination).toEqual({page:1,pageSize:20,total:23,totalPages:2});
    const qa=(await app.inject(`/api/releases?systemId=${own.system.id}&compositionStatus=CLOSED`)).json();
    expect(qa.releases).toEqual([]);expect(qa.counts).toMatchObject({OPEN:23,CLOSED:0,total:23});
    const searched=(await app.inject(`/api/releases?systemId=${own.system.id}&search=Página%2001`)).json();expect(searched.pagination.total).toBe(1);
    expect((await app.inject('/api/releases?page=0')).statusCode).toBe(422);
    expect((await app.inject(`/api/releases?systemId=${own.system.id}&compositionStatus=CANCELED`)).json().releases).toEqual([]);
  });
  test('environment totals cover the filtered collection across pages, unknown destinations and canceled releases',async()=>{
    const own=await scope(),other=await scope(),tag='Totals-'+randomUUID();
    const archived=await db.item.create({data:{kind:'system',key:randomUUID(),name:'Archived count fixture',status:'active',archived:true}});
    const row=(systemId:string,flowEnvironment:string|null,compositionStatus:'OPEN'|'CLOSED'|'CANCELED',name=tag)=>({systemId,key:randomUUID(),name,flowEnvironment,compositionStatus,createdById:'admin',createdByName:'Admin'});
    await db.release.createMany({data:[...Array.from({length:24},()=>row(own.system.id,'DEV','OPEN')),...Array.from({length:3},()=>row(own.system.id,'QA','CLOSED')),...Array.from({length:2},()=>row(own.system.id,'HML','CANCELED')),row(own.system.id,'PRD','CLOSED'),row(own.system.id,null,'CLOSED'),row(own.system.id,null,'CLOSED'),...Array.from({length:5},()=>row(other.system.id,'DEV','OPEN')),row(archived.id,'DEV','OPEN'),row(own.system.id,'DEV','OPEN','Excluded name')]});
    const before=await db.historyEvent.count(),path=`/api/releases?systemId=${own.system.id}&search=${encodeURIComponent(tag)}`;
    const first=(await app.inject(path)).json(),second=(await app.inject(path+'&page=2')).json();
    expect(first.releases).toHaveLength(20);expect(second.releases).toHaveLength(12);
    expect(first.environmentCounts).toEqual({DEV:24,QA:3,HML:2,PRD:1,unconfirmed:2,total:32});expect(second.environmentCounts).toEqual(first.environmentCounts);expect(first.pagination.total).toBe(first.environmentCounts.total);
    const closed=(await app.inject(path+'&compositionStatus=CLOSED')).json();expect(closed.environmentCounts).toEqual({DEV:0,QA:3,HML:0,PRD:1,unconfirmed:2,total:6});expect(closed.counts).toEqual({OPEN:24,CLOSED:6,CANCELED:2,total:32});
    const global=(await app.inject(`/api/releases?search=${encodeURIComponent(tag)}`)).json();expect(global.environmentCounts).toEqual({DEV:29,QA:3,HML:2,PRD:1,unconfirmed:2,total:37});
    expect((await app.inject(`/api/releases?systemId=${own.system.id}&search=not-found-${tag}`)).json().environmentCounts).toEqual({DEV:0,QA:0,HML:0,PRD:0,unconfirmed:0,total:0});
    expect(await db.historyEvent.count()).toBe(before);
  });
  test('creation idempotency survives simultaneous retries and distinguishes actors',async()=>{
    const own=await scope(),key=randomUUID();const payload={systemId:own.system.id,name:'Idempotente'};
    const [a,b]=await Promise.all([write('/releases',payload,'elisa','POST',key),write('/releases',payload,'elisa','POST',key)]);
    expect(a.statusCode).toBe(200);expect(a.json()).toEqual(b.json());
    expect((await write('/releases',{...payload,name:'Changed'},'elisa','POST',key)).statusCode).toBe(409);
    expect((await write('/releases',payload,'admin','POST',key)).statusCode).toBe(200);
    expect(await db.release.count({where:{systemId:own.system.id}})).toBe(2);
    expect(await db.historyEvent.count({where:{itemId:own.system.id,action:'RELEASE_CREATED'}})).toBe(2);
  });
  test('composition records exact current versions and preserves History, status and code',async()=>{
    const own=await scope();let value=await draft(own.system.id);
    const before=await db.item.findUniqueOrThrow({where:{id:own.story.id}});
    const response=await compose(value,[own.story.id]);expect(response.statusCode,response.body).toBe(200);value=response.json().release;
    expect(value.version).toBe(2);expect(value.storyCount).toBe(1);
    expect(response.json().stories[0]).toMatchObject({id:own.story.id,plannedVersion:before.version,currentVersion:before.version,ready:false,currentRevisionUnassigned:false});
    expect(await db.item.findUniqueOrThrow({where:{id:own.story.id}})).toEqual(before);
    expect(await db.storyExecution.count()).toBe(0);
    const history=response.json().history;expect(history[0].payload.after).toEqual([{storyId:own.story.id,plannedStoryVersion:before.version}]);
    const removed=await compose(value,[]);expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().stories).toEqual([]);
    expect(removed.json().history.map((row:{action:string})=>row.action)).toEqual(['RELEASE_COMPOSITION_CHANGED','RELEASE_COMPOSITION_CHANGED','RELEASE_CREATED']);
  });
  test('two users cannot overwrite a draft using the same version',async()=>{
    const own=await scope(),other=await create('story',own.epic.id);const value=await draft(own.system.id);
    const [a,b]=await Promise.all([compose(value,[own.story.id],'elisa'),compose(value,[other.id],'admin')]);
    expect([a.statusCode,b.statusCode].sort()).toEqual([200,409]);
    const detail=(await app.inject(`/api/releases/${value.id}`)).json();expect(detail.release.version).toBe(2);expect(detail.stories).toHaveLength(1);
    expect(await db.historyEvent.count({where:{itemId:own.system.id,action:'RELEASE_COMPOSITION_CHANGED'}})).toBe(1);
  });
  test('transfer requires explicit source identity and version and rolls back the whole selection',async()=>{
    const own=await scope();let source=await draft(own.system.id,'Origem'),target=await draft(own.system.id,'Destino');
    source=(await compose(source,[own.story.id])).json().release;
    const wanted=await selected(own.story.id);
    let response=await write(`/releases/${target.id}/stories`,{expectedVersion:target.version,stories:[{...wanted,expectedReleaseId:null,expectedReleaseVersion:null}]},'elisa','PUT');
    expect(response.statusCode).toBe(409);
    response=await write(`/releases/${target.id}/stories`,{expectedVersion:target.version,stories:[{...wanted,expectedReleaseVersion:1}]},'elisa','PUT');expect(response.statusCode).toBe(409);
    const foreign=await scope();
    response=await write(`/releases/${target.id}/stories`,{expectedVersion:target.version,stories:[wanted,await selected(foreign.story.id)]},'elisa','PUT');expect(response.statusCode).toBe(409);
    expect((await db.releaseStory.findUniqueOrThrow({where:{storyId:own.story.id}})).releaseId).toBe(source.id);
    expect((await db.release.findUniqueOrThrow({where:{id:target.id}})).version).toBe(1);
    response=await compose(target,[own.story.id]);expect(response.statusCode,response.body).toBe(200);target=response.json().release;
    expect((await db.release.findUniqueOrThrow({where:{id:source.id}})).version).toBe(source.version+1);
    expect((await db.releaseStory.findUniqueOrThrow({where:{storyId:own.story.id}})).releaseId).toBe(target.id);
    expect((await app.inject(`/api/releases/${source.id}`)).json().history[0].payload.toReleaseId).toBe(target.id);
  });
  test('Story associations choose existing same-System drafts and can be removed by a planner',async()=>{
    const own=await scope(),foreign=await scope();const local=await draft(own.system.id),outside=await draft(foreign.system.id);
    const choices=(await app.inject(`/api/items/${own.story.id}/release`)).json();expect(choices.releases.map((row:Draft)=>row.id)).toEqual([local.id]);
    expect((await attach(own.story.id,outside)).statusCode).toBe(409);
    expect((await attach(own.story.id,{...local,id:'__new__'})).statusCode).toBe(404);
    expect((await attach(own.story.id,local,'carla')).statusCode).toBe(403);
    const associated=await attach(own.story.id,local,'bruno');expect(associated.statusCode,associated.body).toBe(200);
    const removed=await attach(own.story.id,null,'ana');expect(removed.statusCode,removed.body).toBe(200);expect(removed.json().assignment).toBeNull();
    expect((await app.inject(`/api/items/${own.epic.id}/release`)).statusCode).toBe(400);
    expect((await db.release.findUniqueOrThrow({where:{id:local.id}})).version).toBe(3);
  });
  test('current revision is distinct from older planning and status never fabricates readiness',async()=>{
    const own=await scope();let value=await draft(own.system.id);value=(await compose(value,[own.story.id])).json().release;
    const edit=await write(`/items/${own.story.id}`,{expectedVersion:own.story.version,name:'Revisão atual',description:'Alteração solicitada'},'admin','PATCH');expect(edit.statusCode).toBe(200);
    let view=(await app.inject(`/api/items/${own.story.id}/release`)).json();
    expect(view.story).toMatchObject({currentVersion:2,plannedVersion:1,currentRevisionUnassigned:false,planningReviewRequired:true,referenceReading:{state:'outdated'},ready:false});
    expect(view.story.pendingReasons.some((reason:string)=>reason.includes('mudou'))).toBe(true);
    const catalog=(await app.inject(`/api/releases/${value.id}/stories?reference=review`)).json();expect(catalog.stories.map((row:{id:string})=>row.id)).toContain(own.story.id);
    expect((await app.inject(`/api/releases/${value.id}/stories?readiness=ready`)).json().stories).toEqual([]);
    const refreshed=await attach(own.story.id,value);expect(refreshed.statusCode,refreshed.body).toBe(200);view=refreshed.json();
    expect(view.story).toMatchObject({currentVersion:2,plannedVersion:2,currentRevisionUnassigned:false,ready:false});
    expect((await db.item.findUniqueOrThrow({where:{id:own.story.id}})).status).toBe('specification');
  });
  test('large catalog exposes every Story through exact server pages without a 5000-record cutoff',async()=>{
    const own=await scope(),value=await draft(own.system.id);
    await db.item.createMany({data:Array.from({length:5000},(_,index)=>({kind:'story' as const,key:`BIG-${randomUUID()}`,name:`História ${index}`,status:'specification',parentId:own.epic.id,parentKind:'epic' as const}))});
    const first=await app.inject(`/api/releases/${value.id}/stories`);
    expect(first.statusCode,first.body).toBe(200);expect(first.json()).toMatchObject({total:5001,truncated:false,pagination:{page:1,pageSize:20,total:5001,totalPages:251}});expect(first.json().stories).toHaveLength(20);
    const last=await app.inject(`/api/releases/${value.id}/stories?page=251`);
    expect(last.statusCode,last.body).toBe(200);expect(last.json().stories).toHaveLength(1);
    const broad=await app.inject(`/api/releases/${value.id}/stories?refine=true`);
    expect(broad.statusCode).toBe(200);expect(broad.json()).toMatchObject({truncated:false,total:5001});expect(broad.json().stories).toHaveLength(20);
    expect(broad.json().projects.map((row:{id:string})=>row.id)).toContain(own.project.id);
    const project=await create('project',own.system.id),epic=await create('epic',project.id),story=await create('story',epic.id);
    const refined=await app.inject(`/api/releases/${value.id}/stories?refine=true&projectId=${project.id}`);
    expect(refined.json().truncated).toBe(false);expect(refined.json().stories.map((row:{id:string})=>row.id)).toEqual([story.id]);
  });

  test('catalog filters and sorts the whole scope while retaining complete composition and source versions',async()=>{
    const own=await scope();let value=await draft(own.system.id);
    const prefix='PAGE-'+randomUUID();
    const rows=Array.from({length:45},(_,index)=>({id:`${prefix}-${String(index).padStart(2,'0')}`,kind:'story' as const,key:`${prefix}-K${index}`,name:`Paged Story ${String(index).padStart(2,'0')}`,status:index<25?'specification':'testing',parentId:own.epic.id,parentKind:'epic' as const,createdAt:new Date('2026-01-01T12:00:00Z')}));
    await db.item.createMany({data:rows});
    value=(await compose(value,[own.story.id,rows[44].id])).json().release;
    const first=(await app.inject(`/api/releases/${value.id}/stories?q=Paged&sort=name&direction=asc`)).json();
    const second=(await app.inject(`/api/releases/${value.id}/stories?q=Paged&sort=name&direction=asc&page=2`)).json();
    expect(first.stories.map((row:{id:string})=>row.id)).toEqual(rows.slice(0,20).map(row=>row.id));
    expect(second.stories.map((row:{id:string})=>row.id)).toEqual(rows.slice(20,40).map(row=>row.id));
    expect(first.pagination).toEqual({page:1,pageSize:20,total:45,totalPages:3});
    expect(new Set(first.selectedIds)).toEqual(new Set([own.story.id,rows[44].id]));
    expect(first.selectedItems).toHaveLength(2);expect(first.selectedItems.every((row:{assignment:{releaseId:string;releaseVersion:number};version:number})=>row.assignment.releaseId===value.id&&row.assignment.releaseVersion===value.version&&row.version===1)).toBe(true);
    const filtered=(await app.inject(`/api/releases/${value.id}/stories?q=Paged&status=testing&assignment=unassigned&ready=false&page=999`)).json();
    expect(filtered).toMatchObject({total:19,pagination:{page:1,total:19}});expect(filtered.selectedItems).toHaveLength(2);
    const eventsBefore=await db.historyEvent.count();
    const kept=await write(`/releases/${value.id}/stories`,{expectedVersion:value.version,stories:first.selectedItems.map((row:{id:string;version:number;assignment:{releaseId:string;releaseVersion:number}})=>({id:row.id,expectedVersion:row.version,expectedReferenceToken:row.referenceToken,expectedReleaseId:row.assignment.releaseId,expectedReleaseVersion:row.assignment.releaseVersion}))},'elisa','PUT');
    expect(kept.statusCode,kept.body).toBe(200);expect(kept.json().release.version).toBe(value.version);expect(kept.json().stories).toHaveLength(2);
    expect(await db.historyEvent.count()).toBe(eventsBefore);
    expect((await app.inject(`/api/releases/${value.id}/stories?sort=payload`)).statusCode).toBe(422);
    expect((await app.inject(`/api/releases/${value.id}/stories?status=todo`)).statusCode).toBe(422);
  });

  test('Release list sorting is global and validates the requested column and direction',async()=>{
    const own=await scope();
    const releases=[];
    for(let index=0;index<23;index++)releases.push(await draft(own.system.id,`Order ${String(22-index).padStart(2,'0')}`));
    const response=await app.inject(`/api/releases?systemId=${own.system.id}&sort=name&direction=asc&page=2`);
    expect(response.statusCode,response.body).toBe(200);expect(response.json().releases.map((row:Draft)=>row.name)).toEqual(['Order 20','Order 21','Order 22']);
    expect((await app.inject(`/api/releases?systemId=${own.system.id}&sort=payload`)).statusCode).toBe(422);
    expect((await app.inject(`/api/releases?systemId=${own.system.id}&direction=sideways`)).statusCode).toBe(422);
  });

  test('Release audit history reaches older than 100 and retains canonical release scope and correlations',async()=>{
    const own=await scope(),value=await draft(own.system.id),outside=await draft(own.system.id,'Other draft');
    const prefix=randomUUID(),timestamp=new Date('2026-01-01T12:00:00Z');
    await db.historyEvent.createMany({data:Array.from({length:125},(_,index)=>({id:`${prefix}-${String(index).padStart(3,'0')}`,itemId:own.system.id,ancestorIds:[],actorId:'admin',actorName:'Admin',actorType:'human',action:'RELEASE_COMPOSITION_CHANGED',message:index===0?'Old original Release audit':'Composition recorded',payload:{releaseId:value.id,runId:index===0?'old-release-correlation':'later-correlation',privatePrompt:'NEVER_EXPOSE_RAW'},timestamp}))});
    const first=await app.inject(`/api/releases/${value.id}/history`);
    expect(first.statusCode,first.body).toBe(200);expect(first.json().total).toBe(126);expect(first.json().events).toHaveLength(20);expect(JSON.stringify(first.json())).not.toContain('NEVER_EXPOSE_RAW');
    const oldest=await app.inject(`/api/releases/${value.id}/history?page=7&asOf=${encodeURIComponent(first.json().asOf)}`);
    expect(oldest.json().events.at(-1).id).toBe(`${prefix}-000`);
    const searched=await app.inject(`/api/releases/${value.id}/history?q=old-release-correlation`);
    expect(searched.json().total).toBe(1);expect(searched.json().events[0].message).toBe('Old original Release audit');
    expect((await app.inject(`/api/releases/${outside.id}/history?q=old-release-correlation`)).json().total).toBe(0);
  });

  test('catalog filters Project, Epic, status and association inside its own System',async()=>{
    const own=await scope(),other=await scope();const secondProject=await create('project',own.system.id),secondEpic=await create('epic',secondProject.id),secondStory=await create('story',secondEpic.id);
    let value=await draft(own.system.id);value=(await compose(value,[own.story.id])).json().release;
    const catalog=(await app.inject(`/api/releases/${value.id}/stories`)).json();expect(catalog.stories).toHaveLength(2);expect(catalog.projects).toHaveLength(2);
    expect((await app.inject(`/api/releases/${value.id}/stories?projectId=${secondProject.id}`)).json().stories[0].id).toBe(secondStory.id);
    expect((await app.inject(`/api/releases/${value.id}/stories?association=this`)).json().stories[0].id).toBe(own.story.id);
    expect((await app.inject(`/api/releases/${value.id}/stories?status=testing`)).json().stories).toEqual([]);
    expect((await app.inject(`/api/releases/${value.id}/stories?search=${encodeURIComponent(secondStory.key)}`)).json().stories).toHaveLength(1);
    expect((await app.inject(`/api/releases/${value.id}/stories?projectId=${other.project.id}`)).statusCode).toBe(400);
    expect((await app.inject(`/api/releases/${value.id}/stories?projectId=${own.project.id}&epicId=${secondEpic.id}`)).statusCode).toBe(400);
  });
  test('archive blocks adding descendants while removing archived draft members remains possible',async()=>{
    const own=await scope();let value=await draft(own.system.id);value=(await compose(value,[own.story.id])).json().release;
    expect((await write(`/items/${own.project.id}`,{expectedVersion:own.project.version},'admin','DELETE')).statusCode).toBe(409);
    const cancelled=await write(`/items/${own.story.id}/cancel`,{expectedVersion:own.story.version});expect(cancelled.statusCode,cancelled.body).toBe(200);
    const reason='Encerramento explícito da composição descartável.';
    const closedEpic=await write(`/items/${own.epic.id}/lifecycle`,{expectedVersion:own.epic.version,lifecycle:'cancelled',comment:reason});expect(closedEpic.statusCode,closedEpic.body).toBe(200);
    const closedProject=await write(`/items/${own.project.id}/lifecycle`,{expectedVersion:own.project.version,lifecycle:'cancelled',comment:reason});expect(closedProject.statusCode,closedProject.body).toBe(200);
    const response=await write(`/items/${own.project.id}`,{expectedVersion:closedProject.json().item.version},'admin','DELETE');expect(response.statusCode,response.body).toBe(200);
    expect((await compose(value,[])).statusCode).toBe(200);expect(await db.releaseStory.count({where:{releaseId:value.id}})).toBe(0);
    const fresh=await draft(own.system.id,'Outra composição');
    expect((await write(`/releases/${fresh.id}/stories`,{expectedVersion:fresh.version,stories:[{id:own.story.id,expectedVersion:own.story.version,expectedReferenceToken:own.story.referenceToken,expectedReleaseId:null,expectedReleaseVersion:null}]},'elisa','PUT')).statusCode).toBe(404);
    const current=await db.item.findUniqueOrThrow({where:{id:own.system.id}}),inactive=await write(`/items/${own.system.id}/status`,{expectedVersion:current.version,status:'inactive'});expect(inactive.statusCode,inactive.body).toBe(200);
    const archivedSystem=await write(`/items/${own.system.id}`,{expectedVersion:inactive.json().item.version,comment:reason},'admin','DELETE');expect(archivedSystem.statusCode,archivedSystem.body).toBe(200);
    expect((await app.inject(`/api/releases/${value.id}`)).statusCode).toBe(404);expect((await draftDenied(own.system.id)).statusCode).toBe(404);
    async function draftDenied(systemId:string){return write('/releases',{systemId,name:'Archived System'});}
  });
  test('PostgreSQL enforces kinds, same-System planning and closed-composition protection',async()=>{
    const own=await scope(),foreign=await scope();let value=await draft(own.system.id);value=(await compose(value,[own.story.id])).json().release;
    await expect(db.releaseStory.create({data:{storyId:foreign.story.id,releaseId:value.id,plannedStoryVersion:1}})).rejects.toThrow();
    await expect(db.releaseStory.create({data:{storyId:own.epic.id,releaseId:value.id,plannedStoryVersion:1}})).rejects.toThrow();
    // A direct database fixture represents a future closed state; no public API
    // may manufacture it or claim real checks/deployment from this test setup.
    await db.release.update({where:{id:value.id},data:{compositionStatus:'CLOSED'}});
    expect((await compose(value,[])).statusCode).toBe(409);
    await expect(db.releaseStory.delete({where:{storyId:own.story.id}})).rejects.toThrow();
    await expect(db.release.update({where:{id:value.id},data:{compositionStatus:'OPEN'}})).rejects.toThrow();
    await expect(db.release.update({where:{id:value.id},data:{systemId:foreign.system.id}})).rejects.toThrow();
    await expect(db.release.delete({where:{id:value.id}})).rejects.toThrow();
    expect((await write(`/releases/${value.id}/compositionStatus`,{compositionStatus:'CLOSED'})).statusCode).toBe(404);
    expect((await app.inject(`/api/releases/${value.id}`)).json().capabilities.canPromote).toBe(false);
  });
  test.each(['OPEN','CLOSED','CANCELED'] as const)('RA-01 reads %s consistently without writing or fabricating delivery evidence',async compositionStatus=>{
    const own=await scope(),value=await draft(own.system.id);expect((await compose(value,[own.story.id])).statusCode).toBe(200);
    if(compositionStatus!=='OPEN')await db.release.update({where:{id:value.id},data:{compositionStatus,...(compositionStatus==='CANCELED'?{canceledAt:new Date(),canceledById:'fixture',canceledByName:'Isolated fixture',cancellationReason:'Isolated retained cancellation.'}:{})}});
    const before=await db.release.findUniqueOrThrow({where:{id:value.id}}),membership=await db.releaseStory.findUniqueOrThrow({where:{storyId:own.story.id}}),history=await db.historyEvent.count({where:{itemId:own.system.id}});
    const detail=await app.inject(`/api/releases/${value.id}`),list=await app.inject(`/api/releases?systemId=${own.system.id}&compositionStatus=${compositionStatus}`),story=await app.inject(`/api/items/${own.story.id}/release`);
    for(const response of [detail,list,story])expect(response.statusCode,response.body).toBe(200);
    const reading=detail.json().release.situation;expect(reading.source).toBe('release_composition');expect(reading.composition.state).toBe(compositionStatus);
    expect(reading.environment.code).toBe('DEV');expect(reading.deployment.state).toBe('no_evidence');expect(reading.validation.state).toBe('no_evidence');
    expect(list.json().releases[0].situation).toEqual(reading);expect(story.json().assignment.situation).toEqual(reading);expect(story.json().assignment.compositionStatus).toBe(compositionStatus);
    expect(detail.json().capabilities).toMatchObject({canBuild:false,canPromote:false});
    expect(await db.release.findUniqueOrThrow({where:{id:value.id}})).toEqual(before);expect(await db.releaseStory.findUniqueOrThrow({where:{storyId:own.story.id}})).toEqual(membership);expect(await db.historyEvent.count({where:{itemId:own.system.id}})).toBe(history);
  });
  test('flow and terminal states cannot be changed through generic requests or database shortcuts',async()=>{
    const own=await scope(),value=await draft(own.system.id);
    expect((await app.inject(`/api/releases?compositionStatus=DRAFT`)).statusCode).toBe(422);
    await expect(db.release.update({where:{id:value.id},data:{flowEnvironment:'QA'}})).rejects.toThrow();
    await db.release.update({where:{id:value.id},data:{compositionStatus:'CLOSED'}});
    await expect(db.release.update({where:{id:value.id},data:{compositionStatus:'OPEN'}})).rejects.toThrow();
    expect((await compose(value,[own.story.id])).statusCode).toBe(409);
    await db.release.update({where:{id:value.id},data:{compositionStatus:'CANCELED',canceledAt:new Date(),canceledById:'fixture',canceledByName:'Isolated fixture',cancellationReason:'Isolated retained cancellation.'}});
    await expect(db.release.update({where:{id:value.id},data:{compositionStatus:'CLOSED'}})).rejects.toThrow();
    expect((await attach(own.story.id,value)).statusCode).toBe(409);
    expect((await db.item.findUniqueOrThrow({where:{id:own.story.id}})).status).toBe('specification');
  });
  test('release creation rolls back when audit fails and retries with the original key',async()=>{
    const own=await scope(),key=randomUUID(),payload={systemId:own.system.id,name:'Audited OPEN fixture'};
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_release_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='RELEASE_CREATED' THEN RAISE EXCEPTION 'audit fixture'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER reject_release_fixture BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_release_fixture()');
    try {expect((await write('/releases',payload,'elisa','POST',key)).statusCode).toBe(500);expect(await db.release.count({where:{systemId:own.system.id}})).toBe(0);}
    finally {await db.$executeRawUnsafe('DROP TRIGGER reject_release_fixture ON "HistoryEvent"');await db.$executeRawUnsafe('DROP FUNCTION reject_release_fixture()');}
    const retry=await write('/releases',payload,'elisa','POST',key),replay=await write('/releases',payload,'elisa','POST',key);
    expect(retry.statusCode,retry.body).toBe(200);expect(replay.json()).toEqual(retry.json());expect(await db.release.count({where:{systemId:own.system.id}})).toBe(1);
    expect(await db.historyEvent.count({where:{itemId:own.system.id,action:'RELEASE_CREATED'}})).toBe(1);
  });
  test('restart keeps planning, and audited release decisions remain append-only',async()=>{
    const own=await scope();const value=await draft(own.system.id);await compose(value,[own.story.id]);
    const restarted=createApp({db,demoMode:true});await restarted.app.ready();
    const response=await restarted.app.inject(`/api/releases/${value.id}`);expect(response.statusCode).toBe(200);expect(response.json().stories[0].id).toBe(own.story.id);await restarted.app.close();
    const event=await db.historyEvent.findFirstOrThrow({where:{itemId:own.system.id,action:'RELEASE_CREATED'}});
    await expect(db.historyEvent.update({where:{id:event.id},data:{message:'Overwrite'}})).rejects.toThrow();
    await expect(db.historyEvent.delete({where:{id:event.id}})).rejects.toThrow();
  });
});
