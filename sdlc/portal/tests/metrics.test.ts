import {expect,test} from 'vitest';
import {dashboard,dashboardWeeks} from '../apps/api/src/metrics.ts';
import type {Database} from '../packages/db/client.ts';

test('calendar weeks honor São Paulo Monday boundary and month rollover',()=>{
  expect(dashboardWeeks(new Date('2026-11-02T02:59:59Z'))[3].start).toBe('2026-10-26T03:00:00.000Z');
  expect(dashboardWeeks(new Date('2026-11-02T03:00:00Z'))[3].start).toBe('2026-11-02T03:00:00.000Z');
});
test('inventory, aging boundaries and weekly events keep distinct meanings without fabricated DORA',async()=>{
  const now=new Date('2026-10-22T15:00:00Z');
  const item=(kind:string,status:string,days:number,extra={})=>({kind,status,createdAt:new Date(+now-days*86400000),archived:false,projectLifecycle:null,...extra});
  const items=[...['project','epic','story'].flatMap(kind=>[0,7,15,30].map(days=>item(kind,kind==='project'?'approved':'doing',days))),item('story','completed',40),item('project','approved',40,{projectLifecycle:'completed'}),item('epic','done',40),item('task','todo',1,{archived:true})].map((i,n)=>({...i,id:String(n),name:String(n),parentId:null}));
  const events=[
    {action:'GATE_APPROVED',timestamp:new Date('2026-10-19T02:59:59Z'),payload:{}},
    {action:'PLANNING_APPROVED',timestamp:new Date('2026-10-19T03:00:00Z'),payload:{}},
    {action:'EXECUTION_RETRIED',timestamp:now,payload:{}},
    {action:'CODE_PUBLISHED',timestamp:now,payload:{runId:'run'}},
    {action:'EXECUTION_FAILED',timestamp:now,payload:{durationMs:3000}},
  ];
  const discussion=[{id:'old',timestamp:new Date('2026-09-01T12:00:00Z'),payload:{runId:'run'}},{id:'new',timestamp:now,payload:{runId:'run'}}];
  const tx={item:{findMany:async()=>items},historyEvent:{findMany:async(args:any)=>args.where.actorType?[]:args.where.action?discussion:events},storyExecution:{findMany:async()=>[{id:'run',createdAt:new Date(+now-7200000)}]}};
  const db={$transaction:async(fn:Function)=>fn(tx)} as unknown as Database;
  const result=await dashboard(db,now);
  for(const a of result.aging){expect(a.total).toBe(4);expect(a.buckets.map(b=>b.count)).toEqual([1,1,1,1]);}
  expect(result.inventory.find(i=>i.kind==='project')?.total).toBe(5);
  expect(result.inventory.find(i=>i.kind==='task')).toMatchObject({total:0,archivedTotal:1});
  for(const row of result.inventory)expect(row.statuses.reduce((sum,s)=>sum+s.count,0)).toBe(row.total);
  const metric=(week:number,key:string)=>result.weeks[week].metrics.find(m=>m.key===key)?.value;
  expect(metric(2,'approvals')).toBe(1);expect(metric(3,'approvals')).toBe(1);
  expect(metric(3,'loops')).toBe(1);expect(metric(3,'timeToMR')).toBe(2);expect(metric(3,'failures')).toBe(1);
  expect(metric(3,'stageDuration')).toBe(3);expect(metric(0,'timeToMR')).toBeNull();
  expect(result.rework.categories.find(c=>c.key==='additionalClarification')?.weeks[3].value).toBe(1);
  expect(metric(3,'rework')).toBe(2);expect(result.rework.categories.find(c=>c.key==='testCorrection')?.total).toBeNull();
  expect(result.dora).toHaveLength(5);expect(result.dora.every(m=>m.value===null&&m.weeks.every(w=>w.value===null))).toBe(true);
});
