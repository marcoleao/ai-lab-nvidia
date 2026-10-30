import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AssistantHelpers} from './assistant.ts';
import {DomainError} from './errors.ts';
import {auditFingerprint} from './audit.ts';
import {descendantItems,hierarchyItems,hierarchyBlock,itemLifecycle,isTerminalItem,groupTransitions,closureReasonRequired,hierarchyRunningCounts,hierarchyWorkStates,eligibleHierarchyItems} from './lifecycle-policy.ts';
import type {EpicExecutionReading} from '../../../packages/shared/src/epic-execution.ts';

export function registerEpicExecution(app:FastifyInstance,h:Pick<AssistantHelpers,'db'|'live'>){
 app.get<{Params:{id:string}}>('/api/items/:id/epic-execution',async request=>{
  z.object({}).strict().parse(request.query);
  return h.db.$transaction(async tx=>{
  const item=await h.live(tx,request.params.id);if(item.kind!=='epic')throw new DomainError('INVALID_EPIC','Esta consulta pertence a um Épico.',400);
  const tree=await descendantItems(tx,item),chain=await hierarchyItems(tx,item),descendants=tree.filter(row=>row.id!==item.id),stories=descendants.filter(row=>row.kind==='story');
  const parentBlock=hierarchyBlock(chain,false),resumeBlock=hierarchyBlock(chain),lifecycle=itemLifecycle(item),open=descendants.filter(row=>!isTerminalItem(row));
  const scopeReason=(block:ReturnType<typeof hierarchyBlock>)=>{if(!block)return null;const parent=chain.find(row=>row.id===block.itemId);return `${parent?.name??'Agrupador'}: ${block.reason}`;};
  const eligible=await eligibleHierarchyItems(tx,item,tree),allStates=await hierarchyWorkStates(tx,tree.map(row=>row.id),stories.map(row=>row.id)),eligibleStates=eligible.length===tree.length?allStates:await hierarchyWorkStates(tx,eligible.map(row=>row.id),eligible.filter(row=>row.kind==='story').map(row=>row.id));
  const paused=(states:typeof allStates)=>states.filter(row=>row.state==='paused').reduce((total,row)=>total+row.count,0),running=(await hierarchyRunningCounts(tx,tree)).reduce((total,value)=>total+value,0);
  const direct=descendants.filter(row=>row.parentId===item.id);
  const actions=groupTransitions(item.kind,lifecycle).map(target=>({target,label:target==='active'?(lifecycle==='inactive'?'Reativar':'Reabrir'):({inactive:'Inativar',completed:'Concluir',cancelled:'Cancelar'} as Record<string,string>)[target],reasonRequired:['completed','cancelled'].includes(lifecycle)||closureReasonRequired(target,direct),blockers:[...(parentBlock?[scopeReason(parentBlock)!]:[]),...(target!=='active'&&running?['Há operações em andamento. Conclua ou interrompa essas operações antes de alterar o ciclo.']:[]),...(['completed','cancelled'].includes(target)&&open.length?[`Há ${open.length} descendentes abertos. Conclua ou cancele esses itens antes de encerrar o Épico; arquivamento não finaliza trabalho.`]:[])]}));
  const resume={paused:paused(allStates),eligible:paused(eligibleStates),blockers:[...(resumeBlock?[scopeReason(resumeBlock)!]:[]),...(!paused(eligibleStates)?['Nenhum trabalho pausado elegível na consulta.']:[])]};
  const facts={item:{id:item.id,name:item.name,version:item.version,recordedStatus:item.status,lifecycle},stories:{total:stories.length,open:stories.filter(row=>!isTerminalItem(row)).length,archived:stories.filter(row=>row.archived).length},openDescendants:open.length,archivedOpenDescendants:open.filter(row=>row.archived).length,running,actions,resume,includesArchived:true as const};
  const response:EpicExecutionReading={...facts,asOf:new Date().toISOString(),contextToken:auditFingerprint(facts)};return response;
 },{isolationLevel:'RepeatableRead',timeout:15000});});
}
