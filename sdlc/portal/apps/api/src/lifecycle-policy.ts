import type {Transaction} from '../../../packages/db/client.ts';
import type {Item} from '../../../packages/db/generated/client.ts';
import {DomainError} from './errors.ts';
import {recordAudit,currentAuditContext} from './audit.ts';
import {randomUUID} from 'node:crypto';

const groups=new Set(['system','project','epic']);
export function itemLifecycle(item:Pick<Item,'kind'|'status'|'projectLifecycle'>):string{
  if(item.kind==='project')return item.projectLifecycle==='planned'||!item.projectLifecycle?'active':item.projectLifecycle;
  if(item.kind==='epic')return item.status==='done'?'completed':['todo','doing','approved'].includes(item.status)?'active':item.status;
  return item.status;
}
export function isTerminalItem(item:Pick<Item,'kind'|'status'|'projectLifecycle'>){
  return item.kind==='task'?['done','cancelled'].includes(item.status):item.kind!=='system'&&['completed','cancelled'].includes(itemLifecycle(item));
}
export async function hierarchyItems(tx:Transaction,item:Item){
  const chain:Item[]=[item],seen=new Set([item.id]);let id=item.parentId;
  while(id){if(seen.has(id))throw new DomainError('INVALID_HIERARCHY','A hierarquia contém uma referência circular.',409);seen.add(id);const parent=await tx.item.findUnique({where:{id}});if(!parent)throw new DomainError('ITEM_NOT_FOUND','Um nível superior não está disponível.',404);chain.unshift(parent);id=parent.parentId;}
  return chain;
}
export function hierarchyBlock(chain:readonly Item[],includeSelf=true){
  for(const item of includeSelf?chain:chain.slice(0,-1)){
    if(item.archived)return {code:'ITEM_ARCHIVED',reason:'Itens arquivados são somente leitura.',itemId:item.id};
    const state=itemLifecycle(item);
    if(groups.has(item.kind)&&state!=='active')return {code:state==='inactive'?'HIERARCHY_INACTIVE':'HIERARCHY_CLOSED',reason:state==='inactive'?'Reative o nível superior ou o agrupador antes de continuar.':'Reabra o agrupador antes de alterar seu conteúdo.',itemId:item.id};
    if(item.kind==='story'&&isTerminalItem(item))return {code:'STORY_FINISHED',reason:'Reabra a História antes de alterar ou iniciar trabalho.',itemId:item.id};
    if(item.kind==='story'&&(item.data as Record<string,unknown>).cancellationRequested)return {code:'STORY_CANCELLATION_PENDING',reason:'Aguarde a confirmação do cancelamento da História.',itemId:item.id};
  }
  return null;
}
export async function hierarchyState(tx:Transaction,item:Item,includeSelf=true){
  const chain=await hierarchyItems(tx,item),block=hierarchyBlock(chain,includeSelf);return {writable:!block,...(block?{reason:block.reason,code:block.code,blockedBy:block.itemId}:{})};
}
export async function ensureHierarchyWritable(tx:Transaction,item:Item,options:{includeSelf?:boolean}={}){
  const state=await hierarchyState(tx,item,options.includeSelf!==false);if(!state.writable)throw new DomainError(state.code!,state.reason!,409);
}
/** Complete tree, including the archive: hiding an open legacy child must not permit closure. */
export async function descendantItems(tx:Transaction,item:Item){
  const result:Item[]=[item],seen=new Set([item.id]);
  for(let offset=0;offset<result.length;){const ids=result.slice(offset).map(i=>i.id);offset=result.length;const children=await tx.item.findMany({where:{parentId:{in:ids}},orderBy:{id:'asc'}});for(const child of children){if(seen.has(child.id))throw new DomainError('INVALID_HIERARCHY','A hierarquia contém uma referência circular.',409);seen.add(child.id);result.push(child);}}
  return result;
}
export async function assertNoRunningDescendants(tx:Transaction,item:Item){
  const tree=await descendantItems(tx,item),ids=tree.map(i=>i.id),storyIds=tree.filter(i=>i.kind==='story').map(i=>i.id),now=new Date();
  const counts=await Promise.all([
    tx.storyExecution.count({where:{storyId:{in:storyIds},OR:[{state:{in:['running','cancel_pending']}},{state:'cancelled',leaseUntil:{gt:now}}]}}),
    tx.chatTurn.count({where:{session:{contextId:{in:ids}},OR:[{status:'running'},{status:'cancelled',leaseUntil:{gt:now}}]}}),
    tx.qualityCheck.count({where:{storyId:{in:storyIds},state:'running'}}),
    tx.mergeOperation.count({where:{storyId:{in:storyIds},state:'running'}}),
    tx.mergeDiscussionTurn.count({where:{operation:{storyId:{in:storyIds}},state:'running'}}),
    tx.workAttempt.count({where:{activity:{storyId:{in:storyIds}},state:'running'}}),
    tx.provisioningJob.count({where:{itemId:{in:ids},state:'running'}}),
    tx.repository.count({where:{systemId:{in:ids},state:'running'}}),
  ]);
  if(counts.some(Boolean))throw new DomainError('HIERARCHY_WORK_RUNNING','Conclua ou interrompa explicitamente as operações em andamento antes de inativar ou encerrar.',409);
  return tree;
}
/** Exact bounded aggregates describe the selected scope without copying job
 * bodies or claiming that repository PENDING/FAILED was a QUEUED execution. */
async function hierarchyWorkStates(tx:Transaction,ids:string[],storyIds:string[]){
 const groups=await Promise.all([
  tx.storyExecution.groupBy({by:['state'],where:{storyId:{in:storyIds}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'story_execution',state:row.state,count:row._count._all}))),
  tx.chatTurn.groupBy({by:['status'],where:{session:{contextId:{in:ids}}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'chat_turn',state:row.status,count:row._count._all}))),
  tx.qualityCheck.groupBy({by:['state'],where:{storyId:{in:storyIds}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'quality_check',state:row.state,count:row._count._all}))),
  tx.mergeOperation.groupBy({by:['state'],where:{storyId:{in:storyIds}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'merge_operation',state:row.state,count:row._count._all}))),
  tx.mergeDiscussionTurn.groupBy({by:['state'],where:{operation:{storyId:{in:storyIds}}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'merge_discussion',state:row.state,count:row._count._all}))),
  tx.workAttempt.groupBy({by:['state'],where:{activity:{storyId:{in:storyIds}}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'work_attempt',state:row.state,count:row._count._all}))),
  tx.provisioningJob.groupBy({by:['state'],where:{itemId:{in:ids}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'provisioning_job',state:row.state,count:row._count._all}))),
  tx.repository.groupBy({by:['state'],where:{systemId:{in:ids}},_count:{_all:true}}).then(rows=>rows.map(row=>({kind:'repository',state:row.state,count:row._count._all}))),
 ]);
 return groups.flat().sort((a,b)=>a.kind.localeCompare(b.kind)||a.state.localeCompare(b.state));
}
export async function pauseHierarchyWork(tx:Transaction,item:Item,person:{id:string;name:string}){
  const tree=await descendantItems(tx,item),ids=tree.map(i=>i.id),storyIds=tree.filter(i=>i.kind==='story').map(i=>i.id);
  const before=await hierarchyWorkStates(tx,ids,storyIds);
  const attempts=await tx.workAttempt.findMany({where:{activity:{storyId:{in:storyIds}},state:'queued'},select:{id:true,stage:true}});
  const operationId=currentAuditContext()?.operationId??`hierarchy-pause:${randomUUID()}`;
  const changed=await Promise.all([
    tx.storyExecution.updateMany({where:{storyId:{in:storyIds},state:'queued'},data:{state:'paused'}}),
    tx.chatTurn.updateMany({where:{session:{contextId:{in:ids}},status:'queued'},data:{status:'paused'}}),
    tx.qualityCheck.updateMany({where:{storyId:{in:storyIds},state:'queued'},data:{state:'paused'}}),
    tx.mergeOperation.updateMany({where:{storyId:{in:storyIds},state:'queued'},data:{state:'paused'}}),
    tx.mergeDiscussionTurn.updateMany({where:{operation:{storyId:{in:storyIds}},state:'queued'},data:{state:'paused'}}),
    tx.workAttempt.updateMany({where:{activity:{storyId:{in:storyIds}},state:'queued'},data:{state:'paused'}}),
    tx.provisioningJob.updateMany({where:{itemId:{in:ids},state:{in:['pending','failed','not_configured']}},data:{state:'paused'}}),
    tx.repository.updateMany({where:{systemId:{in:ids},state:{in:['pending','failed','not_configured']}},data:{state:'paused'}}),
  ]);
  for(const attempt of attempts)await tx.workEvent.upsert({where:{attemptId_key:{attemptId:attempt.id,key:`hierarchy-paused:${operationId}`}},create:{attemptId:attempt.id,key:`hierarchy-paused:${operationId}`,kind:'paused',stage:attempt.stage,message:'Tentativa em fila pausada pela inatividade da hierarquia.',payload:{operationId,scopeItemId:item.id,actorId:person.id,actorName:person.name,from:'queued',to:'paused'}},update:{}});
  if(changed.some(c=>c.count))await recordAudit(tx,item,person,'HIERARCHY_WORK_PAUSED','Trabalhos pendentes pausados; reativar o agrupador não os inicia.',{scope:'all_descendants'},'human',{before:{state:before},after:{state:await hierarchyWorkStates(tx,ids,storyIds)}});
  return changed.reduce((sum,c)=>sum+c.count,0);
}
export async function resumeHierarchyWork(tx:Transaction,item:Item,person:{id:string;name:string}){
  await ensureHierarchyWritable(tx,item);const tree=await descendantItems(tx,item),eligible:Item[]=[];
  for(const child of tree)if((await hierarchyState(tx,child)).writable)eligible.push(child);
  const ids=eligible.map(i=>i.id),storyIds=eligible.filter(i=>i.kind==='story').map(i=>i.id);
  const before=await hierarchyWorkStates(tx,ids,storyIds);
  const attempts=await tx.workAttempt.findMany({where:{activity:{storyId:{in:storyIds}},state:'paused'},select:{id:true,stage:true}});
  const operationId=currentAuditContext()?.operationId??`hierarchy-resume:${randomUUID()}`;
  const changed=await Promise.all([
    tx.storyExecution.updateMany({where:{storyId:{in:storyIds},state:'paused'},data:{state:'queued'}}),
    tx.chatTurn.updateMany({where:{session:{contextId:{in:ids}},status:'paused'},data:{status:'queued'}}),
    tx.qualityCheck.updateMany({where:{storyId:{in:storyIds},state:'paused'},data:{state:'queued'}}),
    tx.mergeOperation.updateMany({where:{storyId:{in:storyIds},state:'paused'},data:{state:'queued'}}),
    tx.mergeDiscussionTurn.updateMany({where:{operation:{storyId:{in:storyIds}},state:'paused'},data:{state:'queued'}}),
    tx.workAttempt.updateMany({where:{activity:{storyId:{in:storyIds}},state:'paused'},data:{state:'queued'}}),
    tx.provisioningJob.updateMany({where:{itemId:{in:ids},state:'paused'},data:{state:'pending'}}),
    tx.repository.updateMany({where:{systemId:{in:ids},state:'paused'},data:{state:'pending'}}),
  ]);
  for(const attempt of attempts)await tx.workEvent.upsert({where:{attemptId_key:{attemptId:attempt.id,key:`hierarchy-resumed:${operationId}`}},create:{attemptId:attempt.id,key:`hierarchy-resumed:${operationId}`,kind:'resumed',stage:attempt.stage,message:'Retomada explícita da tentativa anteriormente pausada.',payload:{operationId,scopeItemId:item.id,actorId:person.id,actorName:person.name,from:'paused',to:'queued'}},update:{}});
  const count=changed.reduce((sum,c)=>sum+c.count,0);
  await recordAudit(tx,item,person,'HIERARCHY_WORK_RESUMED',count?'Retomada explícita dos trabalhos pausados no contexto ativo.':'Pedido de retomada confirmado sem trabalhos pausados no contexto ativo.',{scope:'eligible_active_descendants'},'human',{before:{state:before},after:{state:await hierarchyWorkStates(tx,ids,storyIds)},...(!count?{outcome:'NO_CHANGE',phase:'COMPLETED'}:{})});
  return count;
}
