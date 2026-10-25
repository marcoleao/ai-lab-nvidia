import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {Item,HistoryEvent} from '../packages/db/generated/client.ts';
import {recordAudit} from '../apps/api/src/audit.ts';
import {safeHistoryEvent} from '../apps/api/src/collections.ts';

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw new Error('Collection tests require an explicit disposable portal_test database');

describe('shared public projection for canonical and embedded history',()=>{
  const event:HistoryEvent={id:'isolated-history-projection',itemId:'isolated-item',ancestorIds:[],actorId:'admin',actorName:'Admin',actorType:'human',action:'ITEM_CREATED',message:'Item criado.',payload:{},timestamp:new Date('2026-10-24T15:00:00Z'),schemaVersion:1,auditEpochId:null,outcome:null,phase:null,decision:null,operationId:null,requestId:null,attemptId:null,causationEventId:null,subjectType:null,subjectId:null,occurredAt:null,audit:null,deduplicationKey:null,eventDigest:null};
  test('raw legacy history is reduced to selected scalar metadata and missing outcome remains missing',()=>{
    const source={...event,payload:{key:'ABCDEF',status:'active',gitlabUrl:'https://gitlab.example.test/sdlc/test?token=DO_NOT_EXPOSE',specification:{content:'DO_NOT_EXPOSE_SPEC'},before:{description:'DO_NOT_EXPOSE_DESCRIPTION'},token:'DO_NOT_EXPOSE_TOKEN'},extraSecret:'DO_NOT_EXPOSE_ROW'};
    const projected=safeHistoryEvent(source);
    expect(projected).toMatchObject({result:null,audit:null,payload:{key:'ABCDEF',status:'active'}});
    expect(projected.payload).toEqual({key:'ABCDEF',status:'active'});
    expect(JSON.stringify(projected)).not.toContain('DO_NOT_EXPOSE');
    expect(source.payload.specification).toEqual({content:'DO_NOT_EXPOSE_SPEC'});
  });
  test('raw rows and SQL-projected rows follow the same explicit result precedence',()=>{
    expect(safeHistoryEvent({...event,payload:{result:'',outcome:'passed',state:'failed'}}).result).toBeNull();
    expect(safeHistoryEvent({...event,payload:{outcome:'recorded',state:'failed'}}).result).toBe('recorded');
    expect(safeHistoryEvent({...event,payload:{state:'failed'}}).result).toBe('failed');
    expect(safeHistoryEvent({...event,schemaVersion:2,outcome:'ACCEPTED',payload:{result:'passed'}}).result).toBe('ACCEPTED');
  });
  test('release membership compatibility exposes only complete bounded references and planned versions',()=>{
    const projected=safeHistoryEvent({...event,action:'RELEASE_COMPOSITION_CHANGED',payload:{
      fromReleaseId:'release-a',toReleaseId:'release-b',
      before:[],after:[{storyId:'story-a',plannedStoryVersion:2,token:'DO_NOT_EXPOSE_TOKEN',specification:{content:'DO_NOT_EXPOSE_SPEC'},description:'DO_NOT_EXPOSE_DESCRIPTION'}],
    }});
    expect(projected.payload).toEqual({fromReleaseId:'release-a',toReleaseId:'release-b',before:[],after:[{storyId:'story-a',plannedStoryVersion:2}]});
    expect(JSON.stringify(projected)).not.toContain('DO_NOT_EXPOSE');
    for(const after of [
      [{storyId:'story-a',plannedStoryVersion:1},{storyId:'story-b',plannedStoryVersion:'DO_NOT_EXPOSE_INVALID'}],
      [{storyId:'story-a',plannedStoryVersion:0}],
      Array.from({length:5001},()=>({storyId:'story-a',plannedStoryVersion:1})),
    ])expect(safeHistoryEvent({...event,payload:{after}}).payload).not.toHaveProperty('after');
  });
});

describe.skipIf(!url)('complete server collections and canonical history',()=>{
  const db=database(url!),{app}=createApp({db,demoMode:true});
  afterAll(async()=>{await app.close();await db.$disconnect();});
  const query=(values:Record<string,string|number|boolean>)=>new URLSearchParams(Object.entries(values).map(([key,value])=>[key,String(value)])).toString();
  async function fixture(){
    const id='collection-'+randomUUID();
    const system=await db.item.create({data:{id,key:id,name:id,kind:'system',status:'active'}});
    const project=await db.item.create({data:{key:id+'-P',name:'Project',kind:'project',parentId:system.id,parentKind:'system',status:'awaiting_approval',projectLifecycle:'active'}});
    const epic=await db.item.create({data:{key:id+'-E',name:'Epic',kind:'epic',parentId:project.id,parentKind:'project',status:'todo'}});
    const story=await db.item.create({data:{key:id+'-S',name:'Story',kind:'story',parentId:epic.id,parentKind:'epic',status:'specification'}});
    return {id,system,project,epic,story};
  }
  async function collection(values:Record<string,string|number|boolean>){
    const response=await app.inject('/api/collections/items?'+query(values));
    expect(response.statusCode,response.body).toBe(200);return response.json();
  }
  async function history(id:string,values:Record<string,string|number|boolean>={}){
    const response=await app.inject(`/api/items/${id}/history?`+query(values));
    expect(response.statusCode,response.body).toBe(200);return response.json();
  }

  test('a newly created Story returns an empty Task collection without an optional status filter',async()=>{
    const f=await fixture(),before=await db.historyEvent.count();
    const params={kind:'task',parentId:f.story.id,q:'',sort:'createdAt',direction:'desc',page:1};
    expect(await collection(params)).toMatchObject({items:[],total:0,page:1,pageSize:20,totalPages:1});
    expect(await collection({...params,status:'doing'})).toMatchObject({items:[],total:0});
    const invalid=await app.inject('/api/collections/items?'+query({...params,status:''}));
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.details).toEqual(expect.arrayContaining([expect.objectContaining({path:['status']})]));
    expect(await db.historyEvent.count()).toBe(before);
    expect(await db.item.count({where:{parentId:f.story.id}})).toBe(0);
  });

  test('all 525 children are reachable with global ordering, exact totals, stable ties and normalized pages',async()=>{
    const f=await fixture(),createdAt=new Date('2026-01-01T12:00:00Z');
    const rows=Array.from({length:525},(_,index)=>({id:`${f.id}-task-${String(index).padStart(3,'0')}`,key:`${f.id}-T${index}`,name:index<500?'Shared task':'Old searchable task',kind:'task' as const,parentId:f.story.id,parentKind:'story' as const,status:'todo',createdAt,updatedAt:createdAt}));
    await db.item.createMany({data:rows});
    const seen:string[]=[];
    for(let page=1;page<=27;page++){
      const response=await collection({kind:'task',parentId:f.story.id,sort:'createdAt',direction:'asc',page});
      expect(response).toMatchObject({total:525,page,pageSize:20,totalPages:27});seen.push(...response.items.map((item:Item)=>item.id));
    }
    expect(seen).toEqual(rows.map(row=>row.id));expect(new Set(seen).size).toBe(525);
    const filtered=await collection({kind:'task',parentId:f.story.id,q:'Old searchable',sort:'name',direction:'desc',page:999999});
    expect(filtered).toMatchObject({total:25,page:2,totalPages:2});expect(filtered.items).toHaveLength(5);
    const empty=await collection({kind:'task',parentId:f.story.id,q:'does-not-exist',page:2});
    expect(empty).toMatchObject({items:[],total:0,page:1,totalPages:1});
    const selected=await collection({kind:'task',parentId:f.story.id,ids:[rows[0].id,rows[520].id].join(',')});
    expect(selected.total).toBe(2);expect(new Set(selected.items.map((item:Item)=>item.id))).toEqual(new Set([rows[0].id,rows[520].id]));
    expect((await collection({kind:'task',parentId:f.story.id,ids:'none'})).total).toBe(0);
  });

  test('system defaults and extras preserve status and archive as separate dimensions',async()=>{
    const f=await fixture();
    await db.item.createMany({data:[
      {key:f.id+'-inactive',name:f.id+' inactive',kind:'system',status:'inactive'},
      {key:f.id+'-archived',name:f.id+' archived',kind:'system',status:'active',archived:true},
    ]});
    const active=await collection({kind:'system',q:f.id});
    expect(active.items.map((item:Item)=>item.id)).toEqual([f.system.id]);
    const expanded=await collection({kind:'system',q:f.id,includeInactive:true});
    expect(expanded.total).toBe(3);expect(expanded.extraCount).toBe(active.extraCount);
    expect((await collection({kind:'system',q:f.id+'-missing'})).extraCount).toBe(active.extraCount);
    const archived=await collection({kind:'system',q:f.id,includeArchived:true});
    expect(archived.items.map((item:Item)=>item.status)).toEqual(['active','active']);
    expect(expanded.items.find((item:Item)=>item.archived)).toMatchObject({status:'active',archived:true});
  });

  test('project lifecycle defaults are independent of approval and extras precede search/status filters',async()=>{
    const f=await fixture();
    await db.item.createMany({data:[
      {key:f.id+'-active',name:'Active approved',kind:'project',parentId:f.system.id,parentKind:'system',status:'approved',projectLifecycle:'active'},
      {key:f.id+'-completed',name:'Completed',kind:'project',parentId:f.system.id,parentKind:'system',status:'approved',projectLifecycle:'completed'},
      {key:f.id+'-cancelled',name:'Cancelled',kind:'project',parentId:f.system.id,parentKind:'system',status:'awaiting_approval',projectLifecycle:'cancelled'},
      {key:f.id+'-archived',name:'Archive legacy planned',kind:'project',parentId:f.system.id,parentKind:'system',status:'awaiting_approval',projectLifecycle:'planned',archived:true},
    ]});
    const initial=await collection({kind:'project',parentId:f.system.id});
    expect(initial).toMatchObject({total:2,extraCount:3});expect(new Set(initial.items.map((item:Item)=>item.status))).toEqual(new Set(['approved','awaiting_approval']));
    const refined=await collection({kind:'project',parentId:f.system.id,q:'Completed',includeInactive:true,status:'approved',projectLifecycle:'completed'});
    expect(refined).toMatchObject({total:1,extraCount:3});expect(refined.items[0].projectLifecycle).toBe('completed');
  });

  test('status sorting uses process order before paging rather than alphabetical status labels',async()=>{
    const f=await fixture();
    await db.item.createMany({data:['done','doing','todo'].map((status,index)=>({id:f.id+'-epic-'+index,key:f.id+'-epic-'+index,name:'Same title',kind:'epic',parentId:f.project.id,parentKind:'project',status}))});
    const sorted=await collection({kind:'epic',parentId:f.project.id,sort:'status',direction:'asc'});
    expect(sorted.items.map((item:Item)=>item.status)).toEqual(['todo','todo','doing','done']);
    expect((await collection({kind:'epic',parentId:f.project.id,sort:'status',direction:'desc'})).items.map((item:Item)=>item.status)).toEqual(['done','doing','todo','todo']);
    const literal=await collection({kind:'epic',parentId:f.project.id,q:'%'});expect(literal.total).toBe(0);
  });

  test('archived ancestor traversal is explicit and read only, retaining closed project children',async()=>{
    const f=await fixture();
    await db.item.update({where:{id:f.system.id},data:{archived:true}});
    await db.item.update({where:{id:f.project.id},data:{projectLifecycle:'completed'}});
    const before=await db.item.findMany({where:{id:{in:[f.system.id,f.project.id]}}});
    const historyBefore=await db.historyEvent.count();
    expect((await app.inject(`/api/collections/items?kind=project&parentId=${f.system.id}`)).statusCode).toBe(404);
    const archive=await collection({kind:'project',parentId:f.system.id,includeArchived:true});
    expect(archive.total).toBe(1);expect(archive.items[0]).toMatchObject({id:f.project.id,status:'awaiting_approval',projectLifecycle:'completed'});
    expect((await collection({kind:'epic',parentId:f.project.id,includeArchived:true})).items[0].id).toBe(f.epic.id);
    expect(await db.item.findMany({where:{id:{in:[f.system.id,f.project.id]}}})).toEqual(before);
    expect(await db.historyEvent.count()).toBe(historyBefore);
  });

  test('invalid or unsupported query parameters and hierarchy contexts are rejected',async()=>{
    const f=await fixture();
    for(const values of [
      {kind:'unknown'},{kind:'system',parentId:f.system.id},{kind:'task'},
      {kind:'system',page:0},{kind:'system',page:'bad'},{kind:'system',pageSize:200},
      {kind:'system',includeArchived:'yes'},{kind:'system',sort:'payload'},
      {kind:'system',status:'done'},{kind:'system',projectLifecycle:'active'},
    ])expect((await app.inject('/api/collections/items?'+query(values as Record<string,string|number>))).statusCode).toBe(422);
    expect((await app.inject(`/api/collections/items?kind=task&parentId=${f.system.id}`)).statusCode).toBe(400);
    expect((await app.inject('/api/collections/items?kind=task&parentId=missing')).statusCode).toBe(404);
    for(const values of [{direction:'sideways'},{from:'2026-01-01'},{from:'2026-02-01T00:00:00Z',to:'2026-01-01T00:00:00Z'},{page:0},{unknown:'ignored'}]){
      expect((await app.inject(`/api/items/${f.story.id}/history?`+query(values as Record<string,string|number>))).statusCode).toBe(422);
    }
  });

  test('history reaches older than 100, searches real correlations, preserves archive scope and omits raw payload',async()=>{
    const f=await fixture(),timestamp=new Date('2026-01-01T12:00:00Z');
    const rows=Array.from({length:125},(_,index)=>({id:`${f.id}-event-${String(index).padStart(3,'0')}`,itemId:f.story.id,ancestorIds:[f.system.id,f.project.id,f.epic.id],actorId:index<5?'agent:quality':'admin',actorName:index<5?'Quality':'Admin',actorType:index<5?'agent':'human',action:index<5?'QUALITY_CHECK_COMPLETED':'ITEM_UPDATED',message:index===0?'Ancient correlation evidence':'Recorded audit occurrence',payload:{runId:index===0?'old-run-reference':'run-reference',result:index<5?'failed':'passed',privatePrompt:'DO_NOT_EXPOSE_PROMPT',token:'DO_NOT_EXPOSE_SECRET',snapshot:{content:'DO_NOT_EXPOSE_SOURCE'}},timestamp}));
    await db.historyEvent.createMany({data:rows});
    const first=await history(f.system.id);
    expect(first).toMatchObject({total:125,page:1,pageSize:20,totalPages:7});expect(first.events[0].id).toBe(rows[124].id);
    const last=await history(f.system.id,{page:7,asOf:first.asOf});expect(last.events).toHaveLength(5);expect(last.events.at(-1).id).toBe(rows[0].id);
    expect((await history(f.system.id,{q:'old-run-reference'})).events.map((event:{id:string})=>event.id)).toEqual([rows[0].id]);
    expect((await history(f.system.id,{actor:'agent',type:'QUALITY_CHECK_COMPLETED',result:'failed'})).total).toBe(5);
    expect(first.actors).toContainEqual({id:'agent:quality',name:'Quality',type:'agent'});expect(first.types).toContain('ITEM_UPDATED');expect(first.results).toEqual(['failed','passed']);
    expect(JSON.stringify(first)).not.toContain('DO_NOT_EXPOSE');expect(first.events[0].payload).toEqual({runId:'run-reference',result:'passed'});
    expect((await history(f.system.id,{scope:'self'})).total).toBe(0);
    await db.item.update({where:{id:f.story.id},data:{archived:true}});
    expect((await history(f.system.id,{q:'Ancient'})).total).toBe(1);
    expect((await app.inject(`/api/items/${f.story.id}/history`)).statusCode).toBe(404);
    expect((await history(f.story.id,{includeArchived:true})).total).toBe(125);
  });

  test('history honors inclusive start/exclusive end, original lineage and explicit results only',async()=>{
    const f=await fixture();
    await db.historyEvent.createMany({data:[
      {id:f.id+'-before',itemId:f.system.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'EXECUTION_FAILED',message:'Before',payload:{},timestamp:new Date('2026-01-01T10:59:59Z')},
      {id:f.id+'-start',itemId:f.story.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'EXECUTION_FAILED',message:'Start',payload:{},timestamp:new Date('2026-01-01T11:00:00Z')},
      {id:f.id+'-end',itemId:f.system.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'EXECUTION_FAILED',message:'End',payload:{state:'failed'},timestamp:new Date('2026-01-01T12:00:00Z')},
      {id:f.id+'-original',itemId:'retained-original-reference',ancestorIds:[f.system.id],actorId:'admin',actorName:'Admin',action:'ITEM_UPDATED',message:'Original retained lineage',payload:{outcome:'recorded'},timestamp:new Date('2026-01-01T11:30:00Z')},
    ]});
    const period=await history(f.system.id,{from:'2026-01-01T11:00:00Z',to:'2026-01-01T12:00:00Z',direction:'asc'});
    expect(period.events.map((event:{id:string})=>event.id)).toEqual([f.id+'-start',f.id+'-original']);
    expect(period.events[0].result).toBeNull();expect(period.events[1].result).toBe('recorded');
    expect((await history(f.system.id,{result:'failed'})).events.map((event:{id:string})=>event.id)).toEqual([f.id+'-end']);
  });

  test('a history snapshot keeps old pages stable when a newer occurrence arrives',async()=>{
    const f=await fixture();
    await db.historyEvent.create({data:{id:f.id+'-old',itemId:f.story.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'ITEM_UPDATED',message:'Old occurrence',payload:{},timestamp:new Date('2026-01-01T11:00:00Z')}});
    const initial=await history(f.system.id);
    await db.historyEvent.create({data:{id:f.id+'-new',itemId:f.story.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'ITEM_UPDATED',message:'New occurrence',payload:{},timestamp:new Date(new Date(initial.asOf).getTime()+1000)}});
    const stable=await history(f.system.id,{asOf:initial.asOf});expect(stable.events).toEqual(initial.events);expect(stable.total).toBe(1);
    expect((await history(f.system.id,{asOf:new Date(new Date(initial.asOf).getTime()+2000).toISOString()})).total).toBe(2);
  });

  test('v2 projection separates outcome, phase and decision and retains safe identities, diffs and remote evidence',async()=>{
    const f=await fixture(),operation='operation-'+f.id;
    await db.$transaction(tx=>recordAudit(tx,f.story,{id:'review-worker',name:'Revisor'},'ITEM_UPDATED','Atualização confirmada.',
      {result:'blocked',gitlabGroupId:12,gitlabGroupPath:'sdlc/test',gitlabUrl:'https://gitlab.example.test/sdlc/test',privatePrompt:'DO_NOT_EXPOSE_PROMPT'},'agent',{
        outcome:'SUCCEEDED',phase:'COMPLETED',decision:'REJECTED',operationId:operation,requestId:'request-'+f.id,attemptId:'attempt-'+f.id,
        initiator:{id:'requester-'+f.id,name:'Pessoa solicitante',type:'human'},executor:{id:'review-worker',name:'Revisor',type:'agent'},
        before:{status:'todo',name:null,description:'DO_NOT_EXPOSE_BEFORE'},after:{status:'doing',name:'Novo nome',description:'DO_NOT_EXPOSE_AFTER'},
        evidence:[{type:'gitlab_group',id:'12',url:'https://gitlab.example.test/sdlc/test',source:'gitlab'}],
      }));
    const response=await history(f.system.id,{operation,result:'SUCCEEDED',phase:'COMPLETED',decision:'REJECTED',initiator:'requester-'+f.id,executor:'review-worker',coverage:'v2'});
    expect(response.total).toBe(1);
    const event=response.events[0];
    expect(event).toMatchObject({schemaVersion:2,result:'SUCCEEDED',phase:'COMPLETED',decision:'REJECTED',operationId:operation,subjectType:'story',subjectId:f.story.id});
    expect(event.audit.initiator).toMatchObject({id:'requester-'+f.id,authentication:'declared_demo'});
    expect(event.audit.executor).toMatchObject({id:'review-worker',type:'agent'});
    expect(event.audit.changes).toContainEqual({field:'status',before:{kind:'value',value:'todo'},after:{kind:'value',value:'doing'}});
    expect(event.audit.changes).toContainEqual({field:'name',before:{kind:'value',value:null},after:{kind:'value',value:'Novo nome'}});
    expect(event.audit.changes).toContainEqual({field:'description',before:{kind:'restricted'},after:{kind:'restricted'}});
    expect(event.audit.evidence).toContainEqual({type:'gitlab_group',id:'12',url:'https://gitlab.example.test/sdlc/test',source:'gitlab'});
    expect(event.payload).toMatchObject({gitlabGroupId:12,gitlabGroupPath:'sdlc/test',gitlabUrl:'https://gitlab.example.test/sdlc/test'});
    expect(JSON.stringify(response)).not.toContain('DO_NOT_EXPOSE');
    expect(response.phases).toContain('COMPLETED');expect(response.decisions).toContain('REJECTED');
    expect((await history(f.system.id,{q:operation})).total).toBe(1);
    expect((await history(f.system.id,{result:'blocked'})).total).toBe(0);
    expect((await history(f.system.id,{result:'__missing__'})).total).toBe(0);
    expect((await history(f.system.id,{coverage:'legacy'})).total).toBe(0);
  });

  test('missing-result filter does not invent legacy successes and selected GitLab metadata rejects unsafe links',async()=>{
    const f=await fixture(),common={itemId:f.system.id,ancestorIds:[],actorId:'integration:gitlab',actorName:'Integração GitLab',actorType:'system',message:'Ocorrência legada preservada.'};
    await db.historyEvent.createMany({data:[
      {...common,id:f.id+'-missing',action:'GITLAB_PROVISIONED',payload:{gitlabGroupId:12,gitlabGroupPath:'sdlc/test',gitlabUrl:'javascript:alert(1)',token:'DO_NOT_EXPOSE_SECRET'}},
      {...common,id:f.id+'-explicit',action:'ITEM_UPDATED',payload:{state:'failed'}},
      {...common,id:f.id+'-created',action:'ITEM_CREATED',payload:{key:'ABCDEF',status:'active'}},
    ]});
    const before=await db.historyEvent.count();
    const response=await history(f.system.id,{result:'__missing__',coverage:'legacy'});
    expect(response.total).toBe(2);
    expect(response.events.every((event:{result:unknown;schemaVersion:number;audit:unknown})=>event.result===null&&event.schemaVersion===1&&event.audit===null)).toBe(true);
    expect(response.events.find((event:{id:string})=>event.id===f.id+'-missing').payload).toEqual({gitlabGroupId:12,gitlabGroupPath:'sdlc/test'});
    expect(response.events.find((event:{id:string})=>event.id===f.id+'-created').payload).toEqual({key:'ABCDEF',status:'active'});
    expect(JSON.stringify(response)).not.toContain('DO_NOT_EXPOSE');
    expect((await history(f.system.id,{result:'failed'})).events[0]).toMatchObject({id:f.id+'-explicit',result:'failed',schemaVersion:1,audit:null});
    expect(await db.historyEvent.count()).toBe(before);
  });

  test('global audit requires declared admin or architect and reaches request targets without an Item',async()=>{
    const operation='global-rejection-'+randomUUID(),target='request:'+randomUUID();
    await db.$transaction(tx=>recordAudit(tx,{id:target,kind:'request'},{id:'admin',name:'Admin'},'COMMAND_REJECTED','Solicitação recusada sem criação de Item.',{errorCode:'INVALID_INPUT',privatePrompt:'DO_NOT_EXPOSE_GLOBAL'},'human',{
      operationId:operation,requestId:target,reasonCode:'INVALID_INPUT',subject:{type:'request',id:target},
    }));
    const path='/api/audit/events?'+query({operation,type:'COMMAND_REJECTED',result:'REJECTED',phase:'REQUESTED',coverage:'v2'});
    const before=await db.historyEvent.count();
    for(const persona of ['', 'ana', 'carla', 'diego', 'elisa', 'unknown']){
      const response=await app.inject({method:'GET',url:path,headers:persona?{'x-persona':persona}:{}});
      expect(response.statusCode,response.body).toBe(403);
      expect(response.json()).not.toHaveProperty('events');
    }
    for(const persona of ['admin','bruno']){
      const response=await app.inject({method:'GET',url:path,headers:{'x-persona':persona}});
      expect(response.statusCode,response.body).toBe(200);
      const data=response.json();
      expect(data).toMatchObject({total:1,page:1,pageSize:20,totalPages:1,query:{scope:'global'},coverage:{source:'HistoryEvent',scope:'global',includesArchived:true,access:'declared-demo-admin-or-architect'}});
      expect(data.events[0]).toMatchObject({action:'COMMAND_REJECTED',subjectType:'request',subjectId:target,result:'REJECTED',phase:'REQUESTED'});
      expect(data.events[0].audit.target).toMatchObject({type:'request',id:target});
      expect(JSON.stringify(data)).not.toContain('DO_NOT_EXPOSE');
      const paged=await app.inject({method:'GET',url:path+'&page=999&asOf='+encodeURIComponent(data.asOf),headers:{'x-persona':persona}});
      expect(paged.statusCode).toBe(200);expect(paged.json()).toMatchObject({page:1,total:1,asOf:data.asOf});
    }
    expect((await app.inject({method:'GET',url:path+'&scope=self',headers:{'x-persona':'admin'}})).statusCode).toBe(422);
    const explicitScope=await app.inject({method:'GET',url:path+'&scope=global',headers:{'x-persona':'admin'}});
    expect(explicitScope.statusCode,explicitScope.body).toBe(200);expect(explicitScope.json()).toMatchObject({total:1,query:{scope:'global'}});
    expect(await db.item.findUnique({where:{id:target}})).toBeNull();
    expect(await db.historyEvent.count()).toBe(before);
  });
});
