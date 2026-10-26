import {expect,test} from 'vitest';
import {computeStoryMetrics} from '../apps/api/src/story-metrics.ts';
const windows=[{start:'2026-10-19T03:00:00Z',end:'2026-10-26T03:00:00Z',label:'19/10',partial:true}],now=new Date('2026-10-25T15:00:00Z'),start=new Date('2026-10-20T15:00:00Z');
const createdAt=new Date('2026-10-22T15:00:00Z');
test('origins are fixed, a missing source stays unknown and pipeline tasks never become stories',()=>{
 const result=computeStoryMetrics([{id:'manual',createdAt,data:{creationOrigin:'manual'}},{id:'agent',createdAt,data:{creationOrigin:'assistant'}},{id:'legacy',createdAt,data:{}}],[],[],windows,now,start);
 expect(result.total.created).toEqual({manual:1,assistant:1,unknown:1});expect(result.total.partialCoverage).toBe(true);
});
test('first content and drafts are excluded while each applied revision counts once across its sections',()=>{
 const result=computeStoryMetrics([{id:'s',createdAt,data:{creationOrigin:'manual'}}],[{id:'r1',storyId:'s',number:1,source:'human',createdAt},{id:'r2',storyId:'s',number:2,source:'agent',createdAt},{id:'r3',storyId:'other',number:2,source:'human',createdAt}],[],windows,now,start);
 expect(result.total.revisions).toBe(1);expect(result.total.agentRevisions).toBe(1);expect(result.total.humanRevisions).toBe(0);
});
test('repeated cancel/reopen cycles count occurrences, distinct stories and deduplicate operation projections',()=>{
 const event=(id:string,action:string,operationId=id,itemId='s')=>({id,itemId,action,operationId,timestamp:createdAt});
 const result=computeStoryMetrics([{id:'s',createdAt,data:{creationOrigin:'manual'}}],[],[event('c1','STORY_CANCELLED'),event('r1','STORY_REOPENED'),event('c2','STORY_CANCELLED'),event('duplicate','STORY_CANCELLED','c2'),event('task','STORY_CANCELLED','c1','task')],windows,now,start);
 expect(result.total).toMatchObject({cancellations:2,cancelledStories:1,reopenings:1,reopenedStories:1});
});
test('a period entirely before instrumentation has no coverage rather than a fabricated zero',()=>{
 const result=computeStoryMetrics([],[],[],windows,now,new Date('2026-11-01T15:00:00Z'));
 expect(result.total.available).toBe(false);expect(result.total.cancellations).toBeNull();expect(result.total.revisions).toBeNull();
});
