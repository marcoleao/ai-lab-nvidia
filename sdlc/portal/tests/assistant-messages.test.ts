import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {Item} from '../packages/db/generated/client.ts';

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw new Error('Assistant message tests require the disposable portal_test database');

describe.skipIf(!url)('Assistant message cursors in an isolated database',()=>{
 const db=database(url!),runtime=createApp({db,demoMode:true});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 async function fixture(){
  const prefix='assistant-messages-'+randomUUID();
  const system=await db.item.create({data:{key:prefix,name:'Sistema isolado',kind:'system',status:'active'}});
  const project=await db.item.create({data:{key:prefix+'-P',name:'Projeto isolado',kind:'project',status:'active',projectLifecycle:'active',parentId:system.id,parentKind:'system'}});
  const epic=await db.item.create({data:{key:prefix+'-E',name:'Épico isolado',kind:'epic',status:'active',parentId:project.id,parentKind:'project'}});
  const story=await db.item.create({data:{key:prefix+'-S',name:'História isolada',kind:'story',status:'specification',parentId:epic.id,parentKind:'epic'}});
  const task=await db.item.create({data:{key:prefix+'-T',name:'Tarefa isolada',kind:'task',status:'todo',parentId:story.id,parentKind:'story'}});
  return {system,project,epic,story,task};
 }
 async function append(sessionId:string,sequences:number[],source='local'){
  await db.chatTurn.createMany({data:sequences.map(sequence=>({sessionId,sequence,kind:sequence%3===0?'plan':'chat',status:sequence%13===0?'failed':'succeeded',input:source+' pergunta '+sequence,output:source+' resposta '+sequence,error:sequence%13===0?'Falha registrada na própria rodada.':null,actorId:'private-actor-id',actorName:'Autoria pública',model:'isolated-model',contextSnapshot:{controlledSource:'Do not expose this snapshot.'},createdAt:new Date('2026-10-25T15:00:00Z')}))});
 }
 async function session(item:Item,count=0,source='local'){
  const created=await db.chatSession.create({data:{contextId:item.id,nextTurn:count+1}});
  if(count)await append(created.id,Array.from({length:count},(_,index)=>index+1),source);
  return created;
 }
 async function get(contextId:string,query=''){
  const response=await runtime.app.inject(`/api/assistant/messages?contextId=${contextId}${query}`);
  expect(response.statusCode,response.body).toBe(200);return response.json();
 }
 const sequences=(result:any)=>result.turns.map((turn:any)=>turn.sequence) as number[];
 const range=(first:number,last:number)=>Array.from({length:last-first+1},(_,index)=>first+index);
 async function snapshot(){
  return {items:await db.item.findMany({select:{id:true,version:true,status:true,archived:true},orderBy:{id:'asc'}}),sessions:await db.chatSession.findMany({orderBy:{id:'asc'}}),turns:await db.chatTurn.count(),proposals:await db.planProposal.count(),events:await db.historyEvent.count(),requests:await db.requestKey.count()};
 }

 test('an empty conversation is a read and resolves the real scope without creating a session',async()=>{
  const f=await fixture(),before=await snapshot(),result=await get(f.task.id);
  expect(result).toEqual({contextId:f.story.id,turns:[],page:{pageSize:20,total:0,hasOlder:false,hasNewer:false,firstSequence:null,lastSequence:null,latestSequence:null},readOnly:false,readOnlyReason:null});
  expect(await snapshot()).toEqual(before);
 });
 test('more than 60 messages remain reachable without duplicates while new messages arrive, and forward catch-up does not skip batches over 20',async()=>{
  const f=await fixture(),source=await session(f.project,65);
  const latest=await get(f.project.id);
  expect(sequences(latest)).toEqual(range(46,65));
  expect(latest.page).toEqual({pageSize:20,total:65,hasOlder:true,hasNewer:false,firstSequence:46,lastSequence:65,latestSequence:65});
  const previous=await get(f.project.id,'&before=46');expect(sequences(previous)).toEqual(range(26,45));
  await append(source.id,range(66,88));
  const older=await get(f.project.id,'&before=26'),oldest=await get(f.project.id,'&before=6');
  expect(sequences(older)).toEqual(range(6,25));expect(sequences(oldest)).toEqual(range(1,5));
  expect(older.page).toMatchObject({total:88,hasOlder:true,hasNewer:true,latestSequence:88});
  expect(oldest.page).toMatchObject({total:88,hasOlder:false,hasNewer:true,firstSequence:1,lastSequence:5});
  const original=[...sequences(oldest),...sequences(older),...sequences(previous),...sequences(latest)];
  expect(original).toEqual(range(1,65));expect(new Set(original).size).toBe(65);
  const firstCatchup=await get(f.project.id,'&after=65');
  expect(sequences(firstCatchup)).toEqual(range(66,85));expect(firstCatchup.page).toMatchObject({hasOlder:true,hasNewer:true,latestSequence:88});
  await append(source.id,range(89,113));
  const secondCatchup=await get(f.project.id,'&after=85'),thirdCatchup=await get(f.project.id,'&after=105');
  expect(sequences(secondCatchup)).toEqual(range(86,105));expect(secondCatchup.page).toMatchObject({total:113,hasNewer:true,latestSequence:113});
  expect(sequences(thirdCatchup)).toEqual(range(106,113));expect(thirdCatchup.page).toMatchObject({hasNewer:false,latestSequence:113});
  const complete=[...original,...sequences(firstCatchup),...sequences(secondCatchup),...sequences(thirdCatchup)];
  expect(complete).toEqual(range(1,113));expect(new Set(complete).size).toBe(113);
 });
 test('sequence boundaries and high-water marks use real sequences rather than assuming an unbroken count',async()=>{
  const f=await fixture(),source=await session(f.project);await append(source.id,[1,5,9,21]);
  expect((await get(f.project.id)).page).toMatchObject({total:4,firstSequence:1,lastSequence:21,latestSequence:21,hasOlder:false,hasNewer:false});
  const beforeStart=await get(f.project.id,'&before=1'),afterEnd=await get(f.project.id,'&after=21');
  expect(beforeStart.turns).toEqual([]);expect(beforeStart.page).toMatchObject({total:4,firstSequence:null,lastSequence:null,hasOlder:false,hasNewer:true,latestSequence:21});
  expect(afterEnd.turns).toEqual([]);expect(afterEnd.page).toMatchObject({total:4,firstSequence:null,lastSequence:null,hasOlder:true,hasNewer:false,latestSequence:21});
  const afterGap=await get(f.project.id,'&after=6'),beforeGap=await get(f.project.id,'&before=9');
  expect(sequences(afterGap)).toEqual([9,21]);expect(afterGap.page).toMatchObject({hasOlder:true,hasNewer:false});
  expect(sequences(beforeGap)).toEqual([1,5]);expect(beforeGap.page).toMatchObject({hasOlder:false,hasNewer:true});
  expect(sequences(await get(f.project.id,'&after=0'))).toEqual([1,5,9,21]);
 });
 test('Task and Epic resolve their own Story or Project session and preserve hierarchy read-only reasons without granting commands',async()=>{
  const f=await fixture();await session(f.system,1,'Sistema');await session(f.project,2,'Projeto');await session(f.story,3,'História');
  const task=await get(f.task.id),epic=await get(f.epic.id),system=await get(f.system.id);
  expect(task.contextId).toBe(f.story.id);expect(task.turns.every((turn:any)=>turn.input.startsWith('História'))).toBe(true);
  expect(epic.contextId).toBe(f.project.id);expect(epic.turns.every((turn:any)=>turn.input.startsWith('Projeto'))).toBe(true);
  expect(system.turns.every((turn:any)=>turn.input.startsWith('Sistema'))).toBe(true);
  expect(task).not.toHaveProperty('capabilities');
  await db.item.update({where:{id:f.project.id},data:{projectLifecycle:'inactive'}});
  const inactive=await get(f.task.id);expect(inactive.readOnly).toBe(true);expect(inactive.readOnlyReason).toContain('Reative');
  await db.item.update({where:{id:f.project.id},data:{projectLifecycle:'active'}});
  await db.item.update({where:{id:f.task.id},data:{archived:true}});
  expect((await runtime.app.inject(`/api/assistant/messages?contextId=${f.task.id}`)).statusCode).toBe(404);
  const archived=await get(f.task.id,'&includeArchived=true');
  expect(archived).toMatchObject({contextId:f.story.id,readOnly:true,readOnlyReason:'Itens arquivados são somente leitura.'});
  expect((await get(f.story.id)).readOnly).toBe(false);
 });
 test('the safe message projection and legacy sequence additions remain reads without exposing execution internals',async()=>{
  const f=await fixture();await session(f.project,22);
  const before=await snapshot(),result=await get(f.project.id),legacy=await runtime.app.inject(`/api/assistant?contextId=${f.project.id}&page=2`);
  const expectedFields=['id','sequence','kind','input','output','status','model','error','actorName','createdAt','updatedAt'].sort();
  expect(result.turns).toHaveLength(20);
  for(const turn of result.turns)expect(Object.keys(turn).sort()).toEqual(expectedFields);
  expect(JSON.stringify(result)).not.toContain('controlledSource');expect(JSON.stringify(result)).not.toContain('private-actor-id');
  expect(legacy.statusCode,legacy.body).toBe(200);expect(legacy.json().latestTurn.sequence).toBe(22);expect(legacy.json().turns.map((turn:any)=>turn.sequence)).toEqual([1,2]);
  const persisted=await db.chatTurn.findUniqueOrThrow({where:{id:result.turns.at(-1).id}});
  expect(result.turns.at(-1).updatedAt).toBe(persisted.updatedAt.toISOString());expect(legacy.json().latestTurn.updatedAt).toBe(persisted.updatedAt.toISOString());
  expect(await snapshot()).toEqual(before);
  const updatedAt=new Date(persisted.updatedAt.getTime()+1000);
  await db.chatTurn.update({where:{id:persisted.id},data:{status:'cancelled',output:null,updatedAt}});
  const revised=await get(f.project.id),current=await runtime.app.inject(`/api/assistant?contextId=${f.project.id}`);
  expect(revised.turns.at(-1)).toMatchObject({id:persisted.id,status:'cancelled',createdAt:persisted.createdAt.toISOString(),updatedAt:updatedAt.toISOString()});
  expect(current.json().latestTurn.updatedAt).toBe(revised.turns.at(-1).updatedAt);
 });
 test('total, message window and high-water mark share one snapshot when another connection inserts during the request',async()=>{
  const f=await fixture(),source=await session(f.project,65);let inserted=false;
  const intercepted=new Proxy(db,{get(target,property){
   if(property==='$transaction')return (callback:any,options:any)=>target.$transaction(async tx=>{
    const sessions=new Proxy(tx.chatSession,{get(delegate,method){
     if(method==='findUnique')return async(args:any)=>{const result=await delegate.findUnique(args);if(!inserted){inserted=true;await append(source.id,[66]);}return result;};
     return Reflect.get(delegate,method);
    }});
    return callback(new Proxy(tx,{get(transaction,member){return member==='chatSession'?sessions:Reflect.get(transaction,member);}}));
   },options);
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
  const concurrent=createApp({db:intercepted,demoMode:true});
  try{
   const response=await concurrent.app.inject(`/api/assistant/messages?contextId=${f.project.id}`);
   expect(response.statusCode,response.body).toBe(200);expect(inserted).toBe(true);
   expect(response.json().page).toMatchObject({total:65,latestSequence:65,lastSequence:65,hasNewer:false});
   expect(sequences(response.json())).toEqual(range(46,65));
   expect((await get(f.project.id)).page).toMatchObject({total:66,latestSequence:66});
  }finally{await concurrent.app.close();}
 });
 test('invalid or ambiguous cursor inputs are rejected before executing a query command',async()=>{
  const f=await fixture(),before=await snapshot();
  for(const query of ['&before=1&after=0','&before=0','&before=-1','&before=1.5','&after=-1','&after=','&after=NaN','&after=2147483648','&after=9007199254740992','&before=2&before=3','&includeArchived=yes','&page=2','&unrecognized=true']){
   const response=await runtime.app.inject(`/api/assistant/messages?contextId=${f.project.id}${query}`);
   expect(response.statusCode,query+' '+response.body).toBe(422);
  }
  expect((await runtime.app.inject('/api/assistant/messages?after=0')).statusCode).toBe(422);
  expect((await runtime.app.inject('/api/assistant/messages?contextId=missing-context')).statusCode).toBe(404);
  expect(await snapshot()).toEqual(before);
 });
});
