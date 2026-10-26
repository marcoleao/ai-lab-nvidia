import type {Database} from '../../../packages/db/client.ts';
import {recordAudit,safePublicAudit,withAuditContext} from './audit.ts';

const policyVersion='groupers-lifecycle-story-g1-v2';
const executor={id:'maintenance:item-state-policy',name:'Atualização da política de estados',type:'service'};

// Explicit maintenance only: no startup side effects, no rewriting historical events.
export async function normalizeItemStates(db:Database,operationId:string,rollbackOf?:string){
  if(!operationId)throw Error('Administrative operation correlation is required');
  return withAuditContext({operationId,source:{component:'item-state-policy',channel:'maintenance'}},()=>db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741852963)`;
    let count=0;
    if(rollbackOf){
      const events=await tx.historyEvent.findMany({where:{action:'ITEM_STATE_POLICY_CHANGED',operationId:rollbackOf},orderBy:{id:'asc'}});
      for(const event of events){
        const envelope=safePublicAudit(event.audit);
        if(!envelope||envelope.source.component!=='item-state-policy')throw Error('Invalid state policy evidence');
        const changes=envelope.changes.filter(value=>['projectLifecycle','status'].includes(value.field)),revision=envelope.changes.find(value=>value.field==='version');
        if(!changes.length||changes.some(change=>change.before.kind!=='value'||change.after.kind!=='value')||revision?.after.kind!=='value'||typeof revision.after.value!=='number')throw Error('Incomplete state policy evidence');
        const item=await tx.item.findUniqueOrThrow({where:{id:event.itemId}});
        // A repeated rollback is a no-op. Newer business work must never be overwritten.
        if(await tx.historyEvent.count({where:{action:'ITEM_STATE_POLICY_CHANGED',causationEventId:event.id}}))continue;
        const previous:Record<string,string|null>={},before:Record<string,unknown>={version:item.version};
        for(const change of changes){
          if(change.before.kind!=='value'||change.after.kind!=='value')throw Error('Incomplete state policy evidence');
          const field=change.field as 'status'|'projectLifecycle';
          if(item[field]!==change.after.value)throw Error('State changed after normalization; rollback requires review');
          if(change.before.value!==null&&typeof change.before.value!=='string')throw Error('Invalid prior state');
          previous[field]=change.before.value;before[field]=item[field];
        }
        if(item.archived||item.version!==revision.after.value)throw Error('State changed after normalization; rollback requires review');
        const changed=await tx.item.update({where:{id:item.id,version:item.version},data:{...(Object.hasOwn(previous,'projectLifecycle')?{projectLifecycle:previous.projectLifecycle}:{}),...(Object.hasOwn(previous,'status')?{status:previous.status!}:{}),version:{increment:1}}});
        await recordAudit(tx,changed,executor,'ITEM_STATE_POLICY_CHANGED','Política de estados revertida; registros históricos preservados.',{policyVersion,origin:'rollback'},'service',{before,after:{...previous,version:changed.version},causationEventId:event.id});
        count++;
      }
    }else{
      const items=await tx.item.findMany({where:{archived:false,kind:{in:['project','epic']}},orderBy:{id:'asc'}});
      for(const item of items){
        const next=item.kind==='project'?(!item.projectLifecycle||item.projectLifecycle==='planned'?'active':item.projectLifecycle):item.status==='done'?'completed':['todo','doing','approved'].includes(item.status)?'active':item.status;
        if(!['active','inactive','completed','cancelled'].includes(next))throw Error('Unsupported grouping lifecycle; explicit review required');
        if(item.status===next&&(item.kind!=='project'||item.projectLifecycle===next))continue;
        const changed=await tx.item.update({where:{id:item.id,version:item.version},data:{status:next,...(item.kind==='project'?{projectLifecycle:next}:{}),version:{increment:1}}});
        await recordAudit(tx,changed,executor,'ITEM_STATE_POLICY_CHANGED','Estado adequado ao ciclo dos agrupadores; nenhuma execução iniciada ou aprovação de História criada.',{policyVersion,from:item.status,to:next},'service',{before:{status:item.status,projectLifecycle:item.projectLifecycle,version:item.version},after:{status:changed.status,projectLifecycle:changed.projectLifecycle,version:changed.version}});
        count++;
      }
    }
    return {changed:count,policyVersion};
  },{timeout:60000}));
}
