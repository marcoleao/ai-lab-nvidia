import {expect,test} from 'vitest';
import {computeReleaseDashboard} from '../apps/api/src/release-metrics.ts';
const now=new Date('2026-10-28T15:00:00Z'),hour=3600000;
const windows=[{start:'2026-10-19T03:00:00Z',end:'2026-10-26T03:00:00Z',label:'Anterior',partial:false},{start:'2026-10-26T03:00:00Z',end:'2026-11-02T03:00:00Z',label:'Atual',partial:true}];
const items=[{id:'s',kind:'system',parentId:null,archived:false},{id:'a',kind:'system',parentId:null,archived:true},{id:'p',kind:'project',parentId:'s',archived:false},{id:'e',kind:'epic',parentId:'p',archived:false},{id:'h',kind:'story',parentId:'e',archived:false}];
const releases=[{id:'r',systemId:'s',compositionStatus:'OPEN',createdById:'ana',createdAt:new Date('2026-10-01Z'),stories:[{storyId:'h'}]},{id:'empty',systemId:'s',compositionStatus:'OPEN',createdById:'other',createdAt:new Date('2026-10-01Z'),stories:[]},{id:'archive',systemId:'a',compositionStatus:'CANCELED',createdById:'ana',createdAt:new Date('2026-10-01Z'),stories:[]}];
const row=(id:string,extra={})=>({id,releaseId:'r',state:'succeeded',reconcileOnly:false,createdAt:new Date('2026-10-26T03:00:00Z'),confirmedAt:new Date('2026-10-26T05:00:00Z'),...extra});
test('unique operations, week boundaries, confirmation window, and non-additive median use durable timestamps',()=>{
 const a=row('a'),source={items,releases,participation:[],preparations:[a,a,row('b',{createdAt:new Date('2026-10-25T23:00:00Z'),confirmedAt:new Date('2026-10-26T03:00:00Z')}),row('future',{createdAt:new Date(+now+hour),confirmedAt:new Date(+now+2*hour)}),row('old',{createdAt:new Date('2026-10-01Z'),confirmedAt:new Date('2026-10-20T03:00:00Z')})]};
 const m=computeReleaseDashboard(source,now,windows).branchPreparation;expect(m.requested).toBe(2);expect(m.weeks.map(w=>w.requested)).toEqual([1,1]);expect(m.confirmation).toEqual({samples:3,medianHours:4});expect(m.weeks[1].confirmation).toEqual({samples:2,medianHours:3});
});
test('unknown stock includes its reconciliation, excludes ordinary queue and archived systems; history remains',()=>{
 const preparations=[row('uncertain',{state:'unknown',confirmedAt:null}),row('recovering',{state:'running',reconcileOnly:true,confirmedAt:null}),row('queued',{state:'queued',confirmedAt:null}),row('blocked',{state:'blocked',confirmedAt:null}),row('archived-uncertain',{releaseId:'archive',state:'unknown',confirmedAt:null}),row('archived-done',{releaseId:'archive'})];
 const m=computeReleaseDashboard({items,releases,participation:[],preparations},now,windows).branchPreparation;expect(m.requested).toBe(6);expect(m.unknown).toBe(2);expect(m.confirmation).toEqual({samples:1,medianHours:2});
});
test('same System/Project/participation intersection as Release metrics, not actor-only or global counts',()=>{
 const source={items,releases,participation:[],preparations:[row('a'),row('b',{releaseId:'empty'})]};expect(computeReleaseDashboard(source,now,windows,{projectId:'p'}).branchPreparation.requested).toBe(1);expect(computeReleaseDashboard(source,now,windows,{userId:'ana'}).branchPreparation.requested).toBe(1);expect(computeReleaseDashboard(source,now,windows,{systemId:'a'}).branchPreparation.requested).toBe(0);
});
test('zero requests is observed absence; no confirmations remains null rather than zero duration',()=>{const m=computeReleaseDashboard({items,releases,participation:[]},now,windows).branchPreparation;expect(m.requested).toBe(0);expect(m.unknown).toBe(0);expect(m.confirmation).toEqual({samples:0,medianHours:null});expect(m.weeks.every(w=>w.confirmation.medianHours===null)).toBe(true);});
