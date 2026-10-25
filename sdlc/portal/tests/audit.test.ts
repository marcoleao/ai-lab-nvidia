import {expect,test} from 'vitest';
import {auditChanges,recordAudit,safePublicAudit,safeStoredPayload,withAuditContext} from '../apps/api/src/audit.ts';
import {auditCatalog} from '../apps/api/src/audit-catalog.ts';
import type {Transaction} from '../packages/db/client.ts';

const item={id:'system-id',kind:'system',key:'SYSTEM',name:'Sistema',version:1,parentId:null,status:'active'};
const human={id:'admin',name:'Admin'};
function transaction(){
 const rows:any[]=[];
 return {rows,tx:{auditInstallation:{findUniqueOrThrow:async()=>({epochId:'isolated-test-epoch'})},item:{findUnique:async({where}:any)=>where.id==='parent'?{id:'parent',parentId:null}:null},historyEvent:{create:async({data}:any)=>{rows.push(data);return data;}}} as unknown as Transaction};
}
test('committed creation and provision have explicit facts, safe targets and honest identity',async()=>{
 const {rows,tx}=transaction();
 await withAuditContext({operationId:'command:one',requestId:'request-one',initiator:{...human,type:'human'},source:'portal-api'},()=>recordAudit(tx,item,human,'ITEM_CREATED','Sistema criado.',{}));
 expect(rows[0]).toMatchObject({schemaVersion:2,outcome:'SUCCEEDED',phase:'COMPLETED',operationId:'command:one',subjectType:'system'});
 expect(rows[0].auditEpochId).toBe('isolated-test-epoch');expect(rows[0].audit.auditEpochId).toBe(rows[0].auditEpochId);
 expect(rows[0].audit).toMatchObject({initiator:{id:'admin',authentication:'declared_demo'},executor:{id:'admin'},changeCoverage:'captured'});
 expect(rows[0].audit.changes.find((c:any)=>c.field==='status')).toEqual({field:'status',before:{kind:'absent'},after:{kind:'value',value:'active'}});
 await recordAudit(tx,item,{id:'integration:gitlab',name:'GitLab'},'GITLAB_PROVISIONED','Grupo confirmado.',{gitlabGroupId:42,gitlabUrl:'http://gitlab/group'},'system',{before:{gitlabState:'pending'},after:{gitlabState:'ready',gitlabGroupId:42}});
 expect(rows[1].outcome).toBe('SUCCEEDED');expect(rows[1].audit.initiator.authentication).toBe('unknown');
 expect(rows[1].audit.evidence[0]).toMatchObject({type:'gitlab_group',id:'42'});
});
test('catalog semantics distinguish accepted command, started fact and quality verdict',async()=>{
 const {rows,tx}=transaction();
 await recordAudit(tx,item,human,'QUALITY_CHECK_REQUESTED','Pedido aceito.',{});
 await recordAudit(tx,item,human,'ASSISTANT_TURN_STARTED','Tentativa iniciou.',{});
 await recordAudit(tx,item,human,'QUALITY_CHECK_COMPLETED','Análise concluída.',{result:'blocked'});
 await recordAudit(tx,item,human,'QUALITY_CHECK_FAILED','Análise incompleta.',{});
 expect(rows.map(r=>[r.outcome,r.phase,r.decision])).toEqual([['ACCEPTED','REQUESTED',null],['SUCCEEDED','STARTED',null],['SUCCEEDED','COMPLETED','REJECTED'],['FAILED','COMPLETED','NOT_EVALUATED']]);
 await expect(recordAudit(tx,item,human,'QUALITY_CHECK_COMPLETED','',{})).rejects.toThrow('RESULT_REQUIRED');
 await expect(recordAudit(tx,item,human,'QUALITY_CHECK_COMPLETED','',{result:'blocked'},'human',{decision:'APPROVED'})).rejects.toThrow('DECISION_CONFLICT');
});
test('unknown actions, impossible combinations and storage failure fail closed',async()=>{
 const {rows,tx}=transaction();
 await expect(recordAudit(tx,item,human,'INVENTED_SUCCESS','',{})).rejects.toThrow('ACTION_UNKNOWN');
 await expect(recordAudit(tx,item,human,'ITEM_CREATED','',{},'human',{outcome:'ACCEPTED',phase:'REQUESTED'})).rejects.toThrow('LOCAL_FACT');
 await expect(recordAudit(tx,item,human,'GITLAB_PROVISIONED','',{},'system',{outcome:'UNKNOWN'})).rejects.toThrow('OBSERVATION');
 expect(rows).toHaveLength(0);
 await expect(recordAudit(tx,item,human,'ITEM_UPDATED','',{})).rejects.toThrow('CHANGES_REQUIRED');
 const broken={...tx,historyEvent:{create:async()=>{throw new Error('storage unavailable');}}} as unknown as Transaction;
 await expect(recordAudit(broken,item,human,'ITEM_CREATED','',{})).rejects.toThrow('storage unavailable');
});
test('diffs distinguish absence, null and restricted text and never expose secrets',async()=>{
 const changes=auditChanges({name:null,description:'old confidential',repositoryIds:['repo-a']},{name:'New',description:'glpat-secret123456',repositoryIds:['repo-b']});
 expect(changes.find(c=>c.field==='name')).toMatchObject({before:{kind:'value',value:null},after:{kind:'value',value:'New'}});
 expect(changes.find(c=>c.field==='description')).toMatchObject({before:{kind:'restricted'},after:{kind:'restricted'}});
 expect(JSON.stringify(changes)).not.toContain('confidential');expect(JSON.stringify(changes)).not.toContain('glpat-');
 const {rows,tx}=transaction();
 await recordAudit(tx,item,human,'ITEM_UPDATED','Atualizado.',{token:'internal-legacy-payload'},'human',{before:{name:'Old'},after:{name:'New'},evidence:[{type:'gitlab',url:'https://user:password@example.com/path'},{type:'gitlab',url:'https://example.com/path?token=secret'}]});
 const view=safePublicAudit(rows[0].audit)!;
 expect(view.evidence[0].url).toBeUndefined();expect(view.evidence[1].url).toBe('https://example.com/path');
 expect(JSON.stringify(view)).not.toContain('internal-legacy-payload');expect(safePublicAudit({token:'secret'})).toBeNull();
 expect(JSON.stringify(rows[0].payload)).not.toContain('internal-legacy-payload');
 expect(safeStoredPayload({metricsVersion:1,result:'blocked',runId:'run',durationMs:20,severities:{HIGH:1},specification:{code:'secret'},content:'private',input:'private',comment:'private',secret:'secret',token:'secret'})).toEqual({metricsVersion:1,result:'blocked',runId:'run',durationMs:20,severities:{HIGH:1}});
});
test('async contexts remain separate and archived ancestor lineage is retained',async()=>{
 const {rows,tx}=transaction();
 await Promise.all(['a','b'].map(operationId=>withAuditContext({operationId},async()=>{await Promise.resolve();await recordAudit(tx,{...item,parentId:'parent'},human,'ITEM_UPDATED','',{},'human',{before:{name:'Old'},after:{name:'New'}});} )));
 expect(rows.map(r=>r.operationId).sort()).toEqual(['a','b']);expect(rows.every(r=>r.ancestorIds[0]==='parent')).toBe(true);
 expect(Object.keys(auditCatalog)).toContain('WORK_TASK_STATUS_CHANGED');
});
test('explicit deduplication accepts identical replay and refuses divergent facts',async()=>{
 const stored=new Map<string,string>();let inserts=0;
 const tx={auditInstallation:{findUniqueOrThrow:async()=>({epochId:'isolated-test-epoch'})},item:{findUnique:async()=>null},historyEvent:{findUnique:async({where}:any)=>({eventDigest:stored.get(where.deduplicationKey)})},$queryRaw:async(_query:unknown,...values:unknown[])=>{
  const key=values.at(-2) as string,digest=values.at(-1) as string;
  if(stored.has(key))return [];stored.set(key,digest);inserts++;return [{id:'event'}];
 }} as unknown as Transaction;
 const options={operationId:'provider-operation',deduplicationKey:'event:42',before:{version:1},after:{version:2}};
 await recordAudit(tx,item,human,'ITEM_UPDATED','Confirmed.',{version:2},'human',options);
 await recordAudit(tx,item,human,'ITEM_UPDATED','Confirmed.',{version:2},'human',{...options,requestId:'another-transport'});
 expect(inserts).toBe(1);
 await expect(recordAudit(tx,{...item,name:'Changed target'},human,'ITEM_UPDATED','Confirmed.',{version:3},'human',options)).rejects.toThrow('DEDUPLICATION_CONFLICT');
 await expect(recordAudit(tx,item,human,'ITEM_UPDATED','',{},'human',{before:{version:1},after:{version:2},deduplicationKey:'unscoped'})).rejects.toThrow('STABLE_OPERATION');
});
