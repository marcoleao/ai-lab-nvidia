import {afterEach,expect,test,vi} from 'vitest';
import type {Transaction} from '../packages/db/client.ts';
import {recordAudit} from '../apps/api/src/audit.ts';
import {invalidateActivities,startAttempt} from '../apps/api/src/work-activities.ts';

vi.mock('../apps/api/src/audit.ts',()=>({recordAudit:vi.fn(async()=>{})}));
afterEach(()=>vi.clearAllMocks());

test('automatic task start records the actual previous status, executor and requesting person',async()=>{
  const task={id:'task',kind:'task',parentId:'story',status:'todo',version:3};
  const attempt={id:'attempt',sourceType:'execution',sourceId:'run',activityId:'activity',actorId:'admin',actorName:'Admin',state:'queued',startedAt:null,queuedAt:new Date(),activity:{storyId:'story',currentAttemptId:'attempt',taskId:'task',taskLinks:[]}};
  const tx={
    workAttempt:{findUnique:vi.fn(async()=>attempt),update:vi.fn(async()=>({}))},
    item:{findUniqueOrThrow:vi.fn(async()=>({id:'story',kind:'story',status:'coding',parentId:null,archived:false,data:{}})),findMany:vi.fn(async()=>[task]),update:vi.fn(async()=>({...task,status:'doing',version:4}))},
    workEvent:{upsert:vi.fn(async()=>({})),findFirst:vi.fn(async()=>null)},
  } as unknown as Transaction;
  await startAttempt(tx,'source','lease','specification');
  expect(recordAudit).toHaveBeenCalledTimes(1);
  expect(vi.mocked(recordAudit).mock.calls[0]).toMatchObject({
    2:{id:'agent:work'},3:'WORK_TASK_STATUS_CHANGED',6:'agent',
    7:{before:{status:'todo',version:3},after:{status:'doing',version:4},initiator:{id:'admin',type:'human'},operationId:'run',attemptId:'attempt'},
  });
});

test('invalidating evidence records reopening as a new fact with the explicit initiator',async()=>{
  const task={id:'task',kind:'task',status:'done',version:8,parentId:'story'};
  const tx={
    workActivity:{findMany:vi.fn(async()=>[{id:'activity',taskId:'task',currentAttemptId:null}])},
    item:{findUniqueOrThrow:vi.fn(async()=>task),update:vi.fn(async()=>({...task,status:'todo',version:9}))},
  } as unknown as Transaction;
  await invalidateActivities(tx,{storyId:'story',repositoryId:'repo',kinds:['security_scan'],reason:'New revision',person:{id:'requester',name:'Requester'}});
  expect(recordAudit).toHaveBeenCalledTimes(1);
  expect(vi.mocked(recordAudit).mock.calls[0]).toMatchObject({
    3:'WORK_TASK_STATUS_CHANGED',
    7:{before:{status:'done',version:8},after:{status:'todo',version:9},reasonCode:'EVIDENCE_INVALIDATED',initiator:{id:'requester',type:'human'}},
  });
});

test('audit failure aborts the task transition transaction instead of being swallowed',async()=>{
  vi.mocked(recordAudit).mockRejectedValueOnce(new Error('AUDIT_UNAVAILABLE'));
  const task={id:'task',status:'done',version:1};
  const tx={workActivity:{findMany:vi.fn(async()=>[{id:'activity',taskId:'task',currentAttemptId:null}])},item:{findUniqueOrThrow:vi.fn(async()=>task),update:vi.fn(async()=>({...task,status:'todo',version:2}))}} as unknown as Transaction;
  await expect(invalidateActivities(tx,{storyId:'story',repositoryId:'repo',kinds:['coding'],reason:'New evidence required'})).rejects.toThrow('AUDIT_UNAVAILABLE');
});
