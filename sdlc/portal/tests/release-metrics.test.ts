import {expect,test,vi} from 'vitest';
import type {Transaction} from '../packages/db/client.ts';
import {computeReleaseDashboard,releaseDashboard} from '../apps/api/src/release-metrics.ts';

const now=new Date('2026-10-22T15:00:00Z');
const DAY=86400000;
const windows=Array.from({length:4},(_,index)=>{
  const start=new Date(Date.UTC(2026,8,28+index*7,3));
  return {start:start.toISOString(),end:new Date(+start+7*DAY).toISOString(),label:String(index+1),partial:index===3};
});
const items=[
  {id:'s1',kind:'system',parentId:null,archived:false},
  {id:'s2',kind:'system',parentId:null,archived:false},
  {id:'archived',kind:'system',parentId:null,archived:true},
  {id:'p1',kind:'project',parentId:'s1',archived:false},
  {id:'p2',kind:'project',parentId:'s1',archived:false},
  {id:'e1',kind:'epic',parentId:'p1',archived:false},
  {id:'e2',kind:'epic',parentId:'p2',archived:false},
  {id:'h1',kind:'story',parentId:'e1',archived:false},
  {id:'h2',kind:'story',parentId:'e1',archived:false},
  {id:'h3',kind:'story',parentId:'e2',archived:false},
];
const release=(id:string,ageDays=1,extra={})=>({id,systemId:'s1',compositionStatus:'OPEN',createdById:'other',createdAt:new Date(+now-ageDays*DAY),stories:[] as {storyId:string}[],...extra});
const event=(itemId:string,action:string,payload:unknown={})=>({itemId,action,payload});

test('release stock counts each stored release once, including empty drafts, without fabricating lifecycle evidence',()=>{
  const releases=[release('empty'),release('many',2,{stories:[{storyId:'h1'},{storyId:'h2'},{storyId:'h3'}]}),
    ...['CLOSED','CANCELED'].map(compositionStatus=>release(compositionStatus,3,{compositionStatus})),
    release('archived',4,{systemId:'archived'}),release('future',-1),
  ];
  const result=computeReleaseDashboard({items,releases,participation:[]},now,windows);
  expect(result.total).toBe(4);
  expect(result.stages.map(compositionStatus=>[compositionStatus.compositionStatus,compositionStatus.count])).toEqual([['OPEN',2],['CLOSED',1],['CANCELED',1]]);
  expect(result.stages.reduce((sum,compositionStatus)=>sum+compositionStatus.count,0)).toBe(result.total);
  expect(result.rework).toMatchObject({available:false,total:null});
  expect(result.rework.categories).toHaveLength(2);
  expect(result.rework.categories.every(category=>category.total===null&&category.weeks.every(week=>week.value===null))).toBe(true);
  expect(result.weeks.every(week=>week.compositionCompleted.value===null&&week.compositionCompleted.samples===0&&week.rejectionCycles.value===null)).toBe(true);
});

test('current composition age has exact age bands, a median and oldest age, and excludes closed or archived stock',()=>{
  const releases=[0,7,15,30].map((days,index)=>release(String(index),days));
  releases.push(release('closed',90,{compositionStatus:'CLOSED'}),release('hidden',100,{systemId:'archived'}));
  const result=computeReleaseDashboard({items,releases,participation:[]},now,windows);
  expect(result.composition).toMatchObject({samples:4,medianHours:11*24,oldestHours:30*24});
  expect(result.composition.buckets.map(bucket=>bucket.count)).toEqual([1,1,1,1]);
  expect(result.composition.definition).toContain('não duração de composições concluídas');
  const noDrafts=computeReleaseDashboard({items,releases:[release('only-production',5,{compositionStatus:'CLOSED'})],participation:[]},now,windows);
  expect(noDrafts.composition).toMatchObject({samples:0,medianHours:null,oldestHours:null});
  const justCreated=computeReleaseDashboard({items,releases:[release('new',0)],participation:[]},now,windows);
  expect(justCreated.composition).toMatchObject({samples:1,medianHours:0,oldestHours:0});
});

test('weekly creations preserve archived history and calendar boundaries and do not treat composition edits as rejections',()=>{
  const releases=[
    release('before',1,{createdAt:new Date(+new Date(windows[0].start)-1)}),
    release('start',1,{createdAt:new Date(windows[0].start)}),
    release('end',1,{createdAt:new Date(windows[0].end)}),
    release('archived',1,{systemId:'archived',createdAt:new Date(windows[2].start)}),
    release('now',0),release('future',1,{createdAt:new Date(+now+1)}),
  ];
  const participation=[event('s1','RELEASE_COMPOSITION_CHANGED',{releaseId:'now'}),event('h1','STORY_RELEASE_PLANNED',{releaseId:'now'})];
  const result=computeReleaseDashboard({items,releases,participation},now,windows);
  expect(result.weeks.map(week=>week.created)).toEqual([1,1,1,1]);
  expect(result.total).toBe(4);
  expect(result.rework.total).toBeNull();
  const archived=computeReleaseDashboard({items,releases,participation},now,windows,{systemId:'archived'});
  expect(archived.total).toBe(0);
  expect(archived.composition.samples).toBe(0);
  expect(archived.weeks.map(week=>week.created)).toEqual([0,0,1,0]);
});

test('Project filtering uses current Story lineage, excludes empty drafts, and counts a cross-Project release once',()=>{
  const releases=[release('empty'),release('shared',1,{stories:[{storyId:'h1'},{storyId:'h2'},{storyId:'h3'}]}),release('p2-only',1,{stories:[{storyId:'h3'}]}),release('elsewhere',1,{systemId:'s2'})];
  const source={items,releases,participation:[]};
  expect(computeReleaseDashboard(source,now,windows,{projectId:'p1'}).total).toBe(1);
  expect(computeReleaseDashboard(source,now,windows,{projectId:'p2'}).total).toBe(2);
  expect(computeReleaseDashboard(source,now,windows,{systemId:'s1',projectId:'p1'}).composition.samples).toBe(1);
  expect(computeReleaseDashboard(source,now,windows,{systemId:'s2',projectId:'p1'}).total).toBe(0);
  expect(computeReleaseDashboard(source,now,windows,{systemId:'s2'}).total).toBe(1);
});

test('user participation follows authorship, correlated release actions and current Story actions without widening to a System',()=>{
  const releases=[release('author',1,{createdById:'user'}),release('direct'),release('story-action',1,{stories:[{storyId:'h1'}]}),release('target'),release('source'),release('untouched'),release('wrong-system',1,{systemId:'s2'})];
  const participation=[
    event('s1','RELEASE_COMPOSITION_CHANGED',{releaseId:'direct'}),
    event('h1','GATE_APPROVED'),
    event('h2','STORY_RELEASE_PLANNED',{releaseId:'target',fromReleaseId:'source'}),
    event('s1','ITEM_UPDATED',{releaseId:'untouched'}),
    event('p1','PLANNING_APPROVED'),
    event('s1','RELEASE_COMPOSITION_CHANGED',{releaseId:'wrong-system'}),
    event('s1','RELEASE_COMPOSITION_CHANGED',null),
  ];
  const source={items,releases,participation};
  const result=computeReleaseDashboard(source,now,windows,{userId:'user'});
  expect(result.total).toBe(5);
  expect(result.weeks[3].created).toBe(5);
  expect(computeReleaseDashboard(source,now,windows,{userId:'user',projectId:'p1'}).total).toBe(1);
  expect(computeReleaseDashboard(source,now,windows,{userId:'user',systemId:'s2'}).total).toBe(0);
});

test('query helper reuses the repeatable-read hierarchy snapshot and restricts participation to human actions by the selected user',async()=>{
  const queryRelease=vi.fn(async()=>[release('mine',1,{createdById:'user'})]);
  const queryItem=vi.fn(async()=>items);
  const queryHistory=vi.fn(async()=>[]);
  const tx={release:{findMany:queryRelease},item:{findMany:queryItem},historyEvent:{findMany:queryHistory},releaseBranchPreparation:{findMany:vi.fn(async()=>[])}} as unknown as Transaction;
  const result=await releaseDashboard(tx,now,windows,{userId:'user',systemId:'s1'},items);
  expect(result.total).toBe(1);
  expect(queryItem).not.toHaveBeenCalled();
  expect(queryRelease).toHaveBeenCalledWith(expect.objectContaining({where:{createdAt:{lte:now},systemId:'s1'}}));
  expect(queryHistory).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({actorId:'user',actorType:'human',timestamp:{lte:now}})}));
  const historyArgs=queryHistory.mock.calls[0][0] as unknown as {where:{OR:unknown[]}};
  expect(historyArgs.where.OR).toEqual([{itemId:{in:['h1','h2','h3']}},{itemId:{in:['s1']},action:{startsWith:'RELEASE_'}}]);
});

test('an empty release query still returns meaningful zero inventory and unavailable durations without requesting participation',async()=>{
  const queryHistory=vi.fn(async()=>[]);
  const tx={release:{findMany:vi.fn(async()=>[])},item:{findMany:vi.fn(async()=>items)},historyEvent:{findMany:queryHistory},releaseBranchPreparation:{findMany:vi.fn(async()=>[])}} as unknown as Transaction;
  const result=await releaseDashboard(tx,now,windows,{userId:'user'});
  expect(result.total).toBe(0);
  expect(result.weeks.map(week=>week.created)).toEqual([0,0,0,0]);
  expect(result.composition.medianHours).toBeNull();
  expect(result.rework.total).toBeNull();
  expect(queryHistory).not.toHaveBeenCalled();
});
