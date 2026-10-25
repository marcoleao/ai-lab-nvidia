import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test} from 'vitest';
import {database,type Transaction} from '../packages/db/client.ts';
import {recordAudit,withAuditContext} from '../apps/api/src/audit.ts';

const url=process.env.TEST_DATABASE_URL;
if(url&&new URL(url).pathname!=='/portal_test')throw new Error('Audit database tests require a disposable portal_test database');
describe.skipIf(!url)('audit contract in PostgreSQL',()=>{
 const db=url?database(url):null!;
 afterAll(async()=>{await db?.$disconnect();});
 async function rollback(fn:(tx:Transaction)=>Promise<void>){
  const marker=new Error('intentional isolated audit test rollback');
  try{await db.$transaction(async tx=>{await fn(tx);throw marker;});}catch(error){if(error!==marker)throw error;}
 }
 async function fixture(tx:Transaction){return tx.item.create({data:{kind:'system',key:randomUUID(),name:'Isolated audit fixture',status:'active'}});}
 test('dedup insert is atomic, stable on replay and diverging facts abort',async()=>{
  await rollback(async tx=>{
   const item=await fixture(tx);const options={operationId:'isolated:'+randomUUID(),deduplicationKey:'provider-completion',before:{version:1},after:{version:2}};
   await recordAudit(tx,item,{id:'admin',name:'Admin'},'ITEM_UPDATED','Changed.',{version:2},'human',options);
   await recordAudit(tx,item,{id:'admin',name:'Admin'},'ITEM_UPDATED','Changed.',{version:2},'human',options);
   expect(await tx.historyEvent.count({where:{itemId:item.id}})).toBe(1);
   await expect(recordAudit(tx,item,{id:'admin',name:'Admin'},'ITEM_UPDATED','Changed.',{version:3},'human',options)).rejects.toThrow('DEDUPLICATION_CONFLICT');
  });
 });
 test('legacy facts remain unmodified while incomplete v2 insert is refused',async()=>{
  await rollback(async tx=>{
   const item=await fixture(tx);
   const old=await tx.historyEvent.create({data:{itemId:item.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'ITEM_CREATED',message:'Legacy',payload:{}}});
   expect(old.schemaVersion).toBe(1);expect(old.outcome).toBeNull();
   await expect(tx.historyEvent.create({data:{itemId:item.id,ancestorIds:[],actorId:'admin',actorName:'Admin',action:'ITEM_CREATED',message:'Incomplete',payload:{},schemaVersion:2}})).rejects.toThrow();
  });
 });
 test('sealed envelope cannot be modified or deleted',async()=>{
  await rollback(async tx=>{
   const item=await fixture(tx);
   await withAuditContext({operationId:'test:'+randomUUID()},()=>recordAudit(tx,item,{id:'admin',name:'Admin'},'ITEM_CREATED','Created.',{}));
   const event=await tx.historyEvent.findFirstOrThrow({where:{itemId:item.id}});
   expect(event.audit).toMatchObject({schemaVersion:2,changeCoverage:'captured'});
   await expect(tx.historyEvent.update({where:{id:event.id},data:{audit:{forged:true}}})).rejects.toThrow('append-only');
  });
 });
});
