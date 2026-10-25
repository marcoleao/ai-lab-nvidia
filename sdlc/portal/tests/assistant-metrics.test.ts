import {test,expect} from 'vitest';
import {summarizeInterviews} from '../apps/api/src/assistant-metrics.ts';
const windows=[{start:'2026-10-19T03:00:00Z',end:'2026-10-26T03:00:00Z',label:'19/10',partial:true}];
test('interviews count durable sessions, applied slices and measured confirmation duration',()=>{
 const createdAt=new Date('2026-10-20T12:00:00Z'),turn={id:'1',sessionId:'session',kind:'chat',status:'succeeded',createdAt,updatedAt:createdAt};
 const result=summarizeInterviews([turn,{...turn,id:'2'}],[{sessionId:'session',timestamp:new Date('2026-10-20T14:00:00Z'),kinds:['epic','story','task','task']}],[createdAt],windows);
 expect(result.total).toMatchObject({started:1,completed:1,timeToConfirmation:{value:2,samples:1},revisions:1,items:{epic:1,story:1,task:2},failures:0});
});
test('empty data reports no duration sample, rather than zero confirmation time',()=>{
 expect(summarizeInterviews([],[],[],windows).total.timeToConfirmation).toEqual({value:null,samples:0});
});
test('only the next turn after a failure counts as resumption, not every later message',()=>{
 const turns=['failed','succeeded','succeeded'].map((status,index)=>({id:String(index),sessionId:'s',kind:'chat',status,createdAt:new Date(`2026-10-20T1${index}:00:00Z`),updatedAt:new Date(`2026-10-20T1${index}:01:00Z`)}));
 expect(summarizeInterviews(turns,[],[],windows).total).toMatchObject({failures:1,resumptions:1});
});
