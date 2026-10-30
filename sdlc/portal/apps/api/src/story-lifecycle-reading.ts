import {developmentApprovalViews} from './development-approval-reading.ts';
import type {Transaction} from '../../../packages/db/client.ts';
import {Prisma,type Item} from '../../../packages/db/generated/client.ts';
import {storyLifecycleReading,type StoryLifecycleReading} from '../../../packages/shared/src/story-lifecycle-reading.ts';

type Row={storyId:string;specificationId:string|null;specificationNumber:number|null;executionId:string|null;sha:string|null;executionVersion:number|null;executionState:string|null;executionStage:string|null};

// Bounded batch metadata queries for a page; no per-Story history scan. Revision
// payloads, prompts and generated code stay in their controlled sources.
export async function storyLifecycleViews(tx:Transaction,items:readonly Pick<Item,'id'|'kind'|'status'|'version'>[],context?:{executionId:string|null;current:boolean}){
 const stories=items.filter(item=>item.kind==='story'),views=new Map<string,StoryLifecycleReading>();
 if(!stories.length)return views;
 const rows=await tx.$queryRaw<Row[]>`SELECT i.id AS "storyId",s.id AS "specificationId",s.number AS "specificationNumber",e.id AS "executionId",e."commitSha" AS sha,e."storyVersion" AS "executionVersion",e.state AS "executionState",e.stage AS "executionStage"
 FROM "Item" i
 LEFT JOIN LATERAL (SELECT id,number FROM "StorySpecificationRevision" WHERE "storyId"=i.id ORDER BY number DESC LIMIT 1) s ON true
 LEFT JOIN LATERAL (SELECT id,"commitSha","storyVersion",state,stage FROM "StoryExecution" WHERE "storyId"=i.id ORDER BY "createdAt" DESC,id DESC LIMIT 1) e ON true
 WHERE i.kind='story' AND i.id IN (${Prisma.join(stories.map(story=>story.id))})`;
 const approvals=await developmentApprovalViews(tx,stories.map(story=>story.id));
 for(const row of rows){
  const story=stories.find(story=>story.id===row.storyId)!;
  views.set(story.id,storyLifecycleReading({id:story.id,status:story.status,version:story.version,developmentApproval:{storyId:story.id,approval:approvals.get(story.id)?.approval??null,validity:approvals.get(story.id)!.validity,approvalAvailable:true,asOf:new Date().toISOString()},revision:{specification:row.specificationId?{id:row.specificationId,number:row.specificationNumber!}:null,execution:row.executionId?{id:row.executionId,sha:row.sha,storyRecordVersion:row.executionVersion!,state:row.executionState!,stage:row.executionStage!}:null},executionContext:row.executionId&&context?(context.executionId===row.executionId&&context.current?'current':'outdated'):'not_checked'}));
 }
 return views;
}
