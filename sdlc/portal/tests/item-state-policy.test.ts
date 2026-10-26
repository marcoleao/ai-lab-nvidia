import {randomUUID} from 'node:crypto';
import {afterAll,expect,test} from 'vitest';
import {database} from '../packages/db/client.ts';
import {normalizeItemStates} from '../apps/api/src/item-state-policy.ts';
import {safePublicAudit} from '../apps/api/src/audit.ts';

const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).pathname!=='/portal_test')throw Error('Disposable portal_test database required');
const db=database(url);
afterAll(()=>db.$disconnect());
async function fixture(){
  const key=randomUUID();
  const system=await db.item.create({data:{kind:'system',key:key+'S',name:'Sistema isolado',status:'active'}});
  const project=await db.item.create({data:{kind:'project',key:key+'P',name:'Projeto legado',parentId:system.id,parentKind:'system',status:'awaiting_approval',projectLifecycle:'planned'}});
  const epic=await db.item.create({data:{kind:'epic',key:key+'E',name:'Épico legado',parentId:project.id,parentKind:'project',status:'approved'}});
  const archived=await db.item.create({data:{kind:'project',key:key+'A',name:'Acervo registrado',parentId:system.id,parentKind:'system',status:'approved',projectLifecycle:'planned',archived:true}});
  return {project,epic,archived};
}

test('normalization records exact prior/new states, leaves the archive unchanged and is repeatable',async()=>{
  const f=await fixture(),operation='state-policy:'+randomUUID();
  expect(await normalizeItemStates(db,operation)).toMatchObject({changed:2});
  expect(await normalizeItemStates(db,operation)).toMatchObject({changed:0});
  expect(await db.item.findUnique({where:{id:f.project.id}})).toMatchObject({status:'active',projectLifecycle:'active',version:2});
  expect(await db.item.findUnique({where:{id:f.epic.id}})).toMatchObject({status:'active',version:2});
  expect(await db.item.findUnique({where:{id:f.archived.id}})).toMatchObject({projectLifecycle:'planned',archived:true,version:1});
  const events=await db.historyEvent.findMany({where:{operationId:operation}});
  expect(events).toHaveLength(2);
  for(const event of events){
    expect(event).toMatchObject({outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',actorType:'service',action:'ITEM_STATE_POLICY_CHANGED'});
    const audit=safePublicAudit(event.audit)!;
    expect(audit.initiator.type).toBe('unknown');expect(audit.source).toEqual({component:'item-state-policy',channel:'maintenance'});
    expect(audit.changes.some(change=>change.field==='version')).toBe(true);
  }
  const rollback='rollback:'+randomUUID();
  expect(await normalizeItemStates(db,rollback,operation)).toMatchObject({changed:2});
  expect(await normalizeItemStates(db,rollback,operation)).toMatchObject({changed:0});
  expect(await db.item.findUnique({where:{id:f.project.id}})).toMatchObject({status:'awaiting_approval',projectLifecycle:'planned',version:3});
  expect(await db.item.findUnique({where:{id:f.epic.id}})).toMatchObject({status:'approved',version:3});
  expect(await db.historyEvent.count({where:{operationId:operation}})).toBe(2);
  // Restore this isolated fixture to the current policy for the following test.
  await normalizeItemStates(db,'reapply:'+randomUUID());
});

test('a failed audit write rolls back every state change and a retry records each target once',async()=>{
  const f=await fixture(),operation='retry:'+randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION reject_state_policy_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ITEM_STATE_POLICY_CHANGED' THEN RAISE EXCEPTION 'isolated recorder failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_state_policy_test BEFORE INSERT ON "HistoryEvent" FOR EACH ROW EXECUTE FUNCTION reject_state_policy_test()`);
  try{
    await expect(normalizeItemStates(db,operation)).rejects.toThrow('isolated recorder failure');
    expect(await db.item.findUnique({where:{id:f.project.id}})).toMatchObject({projectLifecycle:'planned',version:1});
    expect(await db.item.findUnique({where:{id:f.epic.id}})).toMatchObject({status:'approved',version:1});
    expect(await db.historyEvent.count({where:{operationId:operation}})).toBe(0);
  }finally{
    await db.$executeRawUnsafe('DROP TRIGGER reject_state_policy_test ON "HistoryEvent"');
    await db.$executeRawUnsafe('DROP FUNCTION reject_state_policy_test()');
  }
  expect(await normalizeItemStates(db,operation)).toMatchObject({changed:2});
  expect(await normalizeItemStates(db,operation)).toMatchObject({changed:0});
  expect(await db.historyEvent.count({where:{operationId:operation}})).toBe(2);
  await db.item.update({where:{id:f.epic.id},data:{status:'inactive',version:{increment:1}}});
  await expect(normalizeItemStates(db,'unsafe-rollback:'+randomUUID(),operation)).rejects.toThrow('State changed after normalization');
  expect(await db.item.findUnique({where:{id:f.epic.id}})).toMatchObject({status:'inactive',version:3});
  expect(await db.item.findUnique({where:{id:f.project.id}})).toMatchObject({projectLifecycle:'active',version:2});
});
