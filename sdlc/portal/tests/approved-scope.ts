import type {Transaction} from '../packages/db/client.ts';
import type {AssistantHelpers} from '../apps/api/src/assistant.ts';
import type {Item,Prisma} from '../packages/db/generated/client.ts';
import {executionScope} from '../apps/api/src/execution.ts';

// Fixtures use the production scope calculation; incomplete snapshots cannot
// accidentally stand in for an approved plan when guards become stricter.
export async function approvedSnapshot(tx:Transaction,storyId:string,extra:Record<string,unknown>={}):Promise<Prisma.InputJsonValue>{
 const h={live:async(db:Transaction,id:string)=>db.item.findUniqueOrThrow({where:{id}}),ancestors:async(db:Transaction,item:Item)=>{
  const chain:Item[]=[];let id=item.parentId;
  while(id){const parent=await db.item.findUniqueOrThrow({where:{id}});chain.unshift(parent);id=parent.parentId;}
  return chain;
 },ensureNotArchived:async()=>{}} as unknown as AssistantHelpers;
 const scope=await executionScope(h,tx,storyId);
 return JSON.parse(JSON.stringify({scopeRevision:2,fingerprint:scope.fingerprint,...extra}));
}
