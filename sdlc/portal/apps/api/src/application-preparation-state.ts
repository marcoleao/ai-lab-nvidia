import type {Transaction} from '../../../packages/db/client.ts';
export async function pendingApplicationPreparation(tx:Transaction,systemId:string){return !!await tx.applicationPreparation.findFirst({where:{systemId,parentId:null,resolvedAt:null,OR:[{state:{in:['queued','running','paused','partial','unknown']}},{mrState:'opened'}]},select:{id:true}});}
