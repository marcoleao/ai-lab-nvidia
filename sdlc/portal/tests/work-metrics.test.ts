import {expect,test} from 'vitest';
import {computeWorkDashboard,type WorkMetricsSource} from '../apps/api/src/work-metrics.ts';
import {dashboardWeeks} from '../apps/api/src/metrics.ts';

const now=new Date('2026-10-23T15:00:00Z'),windows=dashboardWeeks(now),date=(value:string)=>new Date(value);
const item=(id:string,kind:string,parentId:string|null,archived=false)=>({id,kind,parentId,archived});
const items=[item('s','system',null),item('p','project','s'),item('e','epic','p'),item('h','story','e'),item('t','task','h'),item('planned','task','h'),item('unlinked','task','h'),item('s2','system',null),item('p2','project','s2'),item('e2','epic','p2'),item('h2','story','e2'),item('t2','task','h2')];
const activity={id:'a',storyId:'h',taskId:'t',createdAt:date('2026-10-19T09:00:00Z')};
const attempt={id:'run',activityId:'a',actorId:'alice',state:'failed',queuedAt:date('2026-10-19T10:00:00Z'),startedAt:date('2026-10-19T10:00:05Z'),finishedAt:date('2026-10-19T10:00:25Z')};
let sequence=0;
const event=(kind:string,timestamp:string,payload:unknown={},extra={})=>({id:`event-${++sequence}`,attemptId:'run',key:`${kind}-${sequence}`,kind,category:null,timestamp:date(timestamp),payload,...extra});
const source=(extra:Partial<WorkMetricsSource>={}):WorkMetricsSource=>({items,activities:[activity],attempts:[attempt],events:[],links:[],participation:[],...extra});

test('durations use durable boundaries and wait resolution, with four weeks and null absent samples',()=>{
 const result=computeWorkDashboard(source({events:[event('failed','2026-10-19T10:00:25Z',{processingMs:20000}),event('wait_resolved','2026-10-20T10:00:25Z',{durationMs:86400000,waitKind:'failed',category:'integration_access',resumedAfterFailure:true}),event('waiting_approval','2026-10-21T10:00:00Z'),event('wait_resolved','2026-10-22T10:00:00Z',{durationMs:86400000,waitKind:'waiting_approval'})]}),now,windows);
 expect(result.weeks).toHaveLength(4);
 expect(result.total.queue).toMatchObject({value:5,samples:1,unit:'seconds'});
 expect(result.total.processing).toMatchObject({value:20,samples:1});
 expect(result.total.humanWait).toMatchObject({value:86400,samples:1});
 expect(result.total.impedimentResolution).toMatchObject({value:86400,samples:1});
 expect(result.total.resumedAfterFailure).toBe(1);
 expect(result.impedimentCategories[0]).toMatchObject({key:'integration_access',label:'Acesso da integração',total:{value:86400,samples:1}});
 expect(result.weeks[0].queue).toMatchObject({value:null,samples:0});
});

test('human decision after finished generation never inflates processing duration',()=>{
 const result=computeWorkDashboard(source({attempts:[{...attempt,state:'succeeded',finishedAt:date('2026-10-23T10:00:00Z')}],events:[event('waiting_approval','2026-10-19T10:00:25Z',{processingMs:20000}),event('wait_resolved','2026-10-23T10:00:00Z',{durationMs:345575000,waitKind:'waiting_approval'}),event('succeeded','2026-10-23T10:00:00Z',{processingMs:345595000})]}),now,windows);
 expect(result.total.processing).toMatchObject({value:20,samples:1});
 expect(result.total.humanWait.value).toBe(345575);
});

test('queue includes all confirmed stage waits once and excludes occupied processing time',()=>{
 const stages=[event('stage_started','2026-10-19T10:00:05Z',{queueMs:5000}),event('stage_started','2026-10-19T10:02:00Z',{queueMs:15000})];
 const active=computeWorkDashboard(source({events:stages}),now,windows);expect(active.total.queue).toMatchObject({value:20,samples:1});
 const complete=computeWorkDashboard(source({events:[...stages,event('succeeded','2026-10-19T10:03:00Z',{queueMs:20000,processingMs:150000})]}),now,windows);
 expect(complete.total.queue).toMatchObject({value:20,samples:1});expect(complete.total.processing).toMatchObject({value:150,samples:1});
});

test('completed waits crossing weeks enter only the resolution week; open waits are not samples',()=>{
 const result=computeWorkDashboard(source({events:[event('blocked','2026-10-18T02:00:00Z'),event('wait_resolved','2026-10-19T03:00:00Z',{durationMs:90000000,waitKind:'blocked',category:'quality'}),event('waiting_input','2026-10-22T03:00:00Z')]}),now,windows);
 expect(result.weeks[2].impedimentResolution.samples).toBe(0);
 expect(result.weeks[3].impedimentResolution).toMatchObject({value:90000,samples:1});
 expect(result.total.humanWait.value).toBeNull();
 expect(result.total.resumedAfterFailure).toBe(0);
});

test('duplicate event projections and transport retries cannot multiply a measured operation',()=>{
 const finish=event('failed','2026-10-19T10:00:25Z',{processingMs:20000}),resolution=event('wait_resolved','2026-10-20T10:00:25Z',{durationMs:86400000,waitKind:'failed',resumedAfterFailure:true});
 const result=computeWorkDashboard(source({events:[finish,{...finish,id:'story-projection'},resolution,{...resolution,id:'task-projection'}]}),now,windows);
 expect(result.total.processing.samples).toBe(1);expect(result.total.resumedAfterFailure).toBe(1);expect(result.total.impedimentResolution.samples).toBe(1);
});

test('task stock, first links and reopen occurrences have distinct denominators and unique counts',()=>{
 const otherActivity={...activity,id:'another-activity'};
 const result=computeWorkDashboard(source({activities:[activity,otherActivity],links:[{activityId:'a',taskId:'planned',createdAt:date('2026-10-20T10:00:00Z')},{activityId:'another-activity',taskId:'planned',createdAt:date('2026-10-21T10:00:00Z')}],events:[event('reopened','2026-10-19T11:00:00Z',{taskIds:['t','planned','planned']}),event('reopened','2026-10-20T11:00:00Z',{taskIds:['t']})]}),now,windows,{systemId:'s'});
 expect(result.linkage).toMatchObject({linked:2,tasks:3});expect(result.linkage.rate).toBeCloseTo(200/3);
 expect(result.total.tasksLinked).toBe(2);expect(result.total.tasksReopened).toBe(2);expect(result.total.reopenOccurrences).toBe(3);
});

test('unlink and relink preserve first historical binding while stock follows only current links',()=>{
 const oldActivity={...activity,createdAt:date('2026-09-01T10:00:00Z')},bindings=[{itemId:'h',timestamp:date('2026-10-12T10:00:00Z'),payload:{activityId:'a',taskIds:['planned']}},{itemId:'h',timestamp:date('2026-10-19T10:00:00Z'),payload:{activityId:'a',taskIds:[]}},{itemId:'h',timestamp:date('2026-10-20T10:00:00Z'),payload:{activityId:'a',taskIds:['planned']}}];
 const unlinked=computeWorkDashboard(source({activities:[oldActivity],bindings:bindings.slice(0,2),links:[]}),now,windows,{systemId:'s'});
 expect(unlinked.linkage.linked).toBe(1);expect(unlinked.weeks[2].tasksLinked).toBe(1);expect(unlinked.weeks[3].tasksLinked).toBe(0);
 const relinked=computeWorkDashboard(source({activities:[oldActivity],bindings,links:[{activityId:'a',taskId:'planned',createdAt:date('2026-10-20T10:00:00Z')}]}),now,windows,{systemId:'s'});
 expect(relinked.linkage.linked).toBe(2);expect(relinked.weeks[2].tasksLinked).toBe(1);expect(relinked.weeks[3].tasksLinked).toBe(0);
});

test('task participant follows the linked story operation without exposing sibling projects or stories',()=>{
 const secondActivity={id:'a2',storyId:'h2',taskId:'t2',createdAt:activity.createdAt},secondAttempt={...attempt,id:'run2',activityId:'a2',actorId:'bob'};
 const base=source({activities:[activity,secondActivity],attempts:[{...attempt,actorId:'agent'},secondAttempt],links:[{activityId:'a',taskId:'planned',createdAt:activity.createdAt}],participation:[{itemId:'planned',actorId:'carla'}],events:[event('failed','2026-10-19T10:00:25Z',{processingMs:20000}),event('failed','2026-10-19T10:00:25Z',{processingMs:80000},{attemptId:'run2'})]});
 const own=computeWorkDashboard(base,now,windows,{userId:'carla'});
 expect(own.observedAttempts).toBe(1);expect(own.total.processing.value).toBe(20);expect(own.linkage).toMatchObject({linked:2,tasks:2});
 expect(computeWorkDashboard(base,now,windows,{userId:'carla',systemId:'s2'}).observedAttempts).toBe(0);
 expect(computeWorkDashboard(base,now,windows,{projectId:'p2'}).total.processing.value).toBe(80);
});

test('attempt authorship supplies participation even when no task audit projection exists yet',()=>{
 const result=computeWorkDashboard(source(),now,windows,{userId:'alice',projectId:'p'});
 expect(result.observedAttempts).toBe(1);expect(result.total.queue.value).toBe(5);
 expect(computeWorkDashboard(source(),now,windows,{userId:'unknown'}).observedAttempts).toBe(0);
});

test('empty sources yield absent duration/rate instead of fabricated zeros or legacy timings',()=>{
 const result=computeWorkDashboard(source({items:[],activities:[],attempts:[]}),now,windows);
 expect(result.linkage.rate).toBeNull();expect(result.total.queue.value).toBeNull();expect(result.total.processing.value).toBeNull();expect(result.total.humanWait.value).toBeNull();expect(result.total.resumedAfterFailure).toBe(0);expect(result.impedimentCategories).toEqual([]);
 // A row timestamp alone is not the observed terminal processing event.
 expect(computeWorkDashboard(source(),now,windows).total.processing.value).toBeNull();
});

test('future observations, invalid durations and unknown task references never enter aggregates',()=>{
 const result=computeWorkDashboard(source({attempts:[{...attempt,startedAt:date('2026-10-24T10:00:00Z')}],links:[{activityId:'a',taskId:'unlinked',createdAt:date('2026-10-24T00:00:00Z')}],events:[event('failed','2026-10-24T00:00:00Z',{processingMs:20000}),event('wait_resolved','2026-10-23T10:00:00Z',{durationMs:-1,waitKind:'failed'}),event('wait_resolved','2026-10-23T11:00:00Z',{durationMs:'bad',waitKind:'failed'}),event('reopened','2026-10-23T11:00:00Z',{taskIds:['missing','h','t2','unlinked']})]}),now,windows,{systemId:'s'});
 expect(result.total.queue.samples).toBe(0);expect(result.total.processing.samples).toBe(0);expect(result.total.impedimentResolution.samples).toBe(0);expect(result.total.tasksReopened).toBe(0);expect(result.linkage.linked).toBe(1);
});

test('totals use distinct reopened tasks across weeks instead of summing distinct weekly counts',()=>{
 const result=computeWorkDashboard(source({events:[event('reopened','2026-10-12T10:00:00Z',{taskIds:['t']}),event('reopened','2026-10-20T10:00:00Z',{taskIds:['t']})]}),now,windows);
 expect(result.weeks[2].tasksReopened).toBe(1);expect(result.weeks[3].tasksReopened).toBe(1);expect(result.total.tasksReopened).toBe(1);expect(result.total.reopenOccurrences).toBe(2);
});
