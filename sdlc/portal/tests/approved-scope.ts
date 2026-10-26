import type {Transaction} from '../packages/db/client.ts';
import type {AssistantHelpers} from '../apps/api/src/assistant.ts';
import type {Item,Prisma} from '../packages/db/generated/client.ts';
import {executionScope,executionSnapshot} from '../apps/api/src/execution.ts';

// Fixtures use the production scope calculation; incomplete snapshots cannot
// accidentally stand in for an approved plan when guards become stricter.
export async function approvedSnapshot(tx:Transaction,storyId:string,extra:Record<string,unknown>={},scopeRevision:2|3=2):Promise<Prisma.InputJsonValue>{
 const h={live:async(db:Transaction,id:string)=>db.item.findUniqueOrThrow({where:{id}}),ancestors:async(db:Transaction,item:Item)=>{
  const chain:Item[]=[];let id=item.parentId;
  while(id){const parent=await db.item.findUniqueOrThrow({where:{id}});chain.unshift(parent);id=parent.parentId;}
  return chain;
 },ensureNotArchived:async()=>{}} as unknown as AssistantHelpers;
 // These provider-regression fixtures intentionally exercise preserved v2
 // approvals. New end-to-end specification tests cover the complete v3 source.
 const scope=await executionScope(h,tx,storyId,{scopeRevision});
 return JSON.parse(JSON.stringify({...(scopeRevision===3?executionSnapshot(scope):{scopeRevision:2,fingerprint:scope.fingerprint}),...extra}));
}
