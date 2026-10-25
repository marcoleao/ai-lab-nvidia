import type {Database} from '../../../packages/db/client.ts';
import {recordAudit,safePublicAudit,withAuditContext} from './audit.ts';

const policyVersion='project-active-epic-three-states-v1';
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
        const field=envelope.target.type==='project'?'projectLifecycle':'status';
        const change=envelope.changes.find(value=>value.field===field),revision=envelope.changes.find(value=>value.field==='version');
        if(change?.before.kind!=='value'||change.after.kind!=='value'||revision?.after.kind!=='value'||typeof revision.after.value!=='number')throw Error('Incomplete state policy evidence');
        const item=await tx.item.findUniqueOrThrow({where:{id:event.itemId}});
        // A repeated rollback is a no-op. Newer business work must never be overwritten.
        if(await tx.historyEvent.count({where:{action:'ITEM_STATE_POLICY_CHANGED',causationEventId:event.id}}))continue;
        if(item.archived||item.version!==revision.after.value||item[field]!==change.after.value)throw Error('State changed after normalization; rollback requires review');
        const previous=change.before.value;
        if(previous!==null&&typeof previous!=='string')throw Error('Invalid prior state');
        const changed=await tx.item.update({where:{id:item.id,version:item.version},data:{...(field==='projectLifecycle'?{projectLifecycle:previous}:{status:String(previous)}),version:{increment:1}}});
        await recordAudit(tx,changed,executor,'ITEM_STATE_POLICY_CHANGED','Política de estados revertida; registros históricos preservados.',{policyVersion,origin:'rollback'},'service',{before:{[field]:item[field],version:item.version},after:{[field]:changed[field],version:changed.version},causationEventId:event.id});
        count++;
      }
    }else{
      const items=await tx.item.findMany({where:{archived:false,OR:[{kind:'project',OR:[{projectLifecycle:'planned'},{projectLifecycle:null}]},{kind:'epic',status:'approved'}]},orderBy:{id:'asc'}});
      for(const item of items){
        const field=item.kind==='project'?'projectLifecycle':'status',next=item.kind==='project'?'active':'todo';
        const changed=await tx.item.update({where:{id:item.id,version:item.version},data:{[field]:next,version:{increment:1}}});
        await recordAudit(tx,changed,executor,'ITEM_STATE_POLICY_CHANGED','Estado adequado à política de Projeto ACTIVE e Épico TO DO / DOING / DONE; nenhuma execução iniciada.',{policyVersion,from:item[field],to:next},'service',{before:{[field]:item[field],version:item.version},after:{[field]:changed[field],version:changed.version}});
        count++;
      }
    }
    return {changed:count,policyVersion};
  },{timeout:60000}));
}
