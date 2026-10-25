import {expect,test} from 'vitest';
import {recordAudit,safePublicAudit,safeStoredPayload} from '../apps/api/src/audit.ts';
import {safeHistoryEvent} from '../apps/api/src/collections.ts';
import type {Transaction} from '../packages/db/client.ts';

test('conversation references record their own effect and related Story without copying content or approving scope',async()=>{
  let saved:any;
  const tx={auditInstallation:{findUniqueOrThrow:async()=>({epochId:'conversation-test-epoch'})},item:{findUnique:async()=>null},historyEvent:{create:async({data}:any)=>{saved=data;return data;}}} as unknown as Transaction;
  const reference={linkId:'link-1',sourceType:'chat_turn',sourceId:'turn-1',sourceVersion:0,projectId:'project-1',storyId:'story-1',storyVersion:3};
  await recordAudit(tx,{id:'project-1',kind:'project',parentId:null,version:2},{id:'admin',name:'Admin'},'CONVERSATION_LINKED','Interação relacionada à História; escopo e aprovações preservados.',{
    ...reference,input:'PRIVATE_PROMPT',output:'PRIVATE_RESPONSE',requirements:{content:'PRIVATE_REQUIREMENTS'},
  },'human',{
    before:null,after:reference,targets:[{type:'story',id:'story-1',version:3}],
    evidence:[{type:'chat_turn',id:'turn-1',source:'ChatTurn'}],operationId:'link-command-1',
  });
  expect(saved).toMatchObject({itemId:'project-1',outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',operationId:'link-command-1'});
  const audit=safePublicAudit(saved.audit)!;
  expect(audit.targets).toContainEqual({type:'story',id:'story-1',version:3});
  expect(audit.evidence).toContainEqual({type:'chat_turn',id:'turn-1',source:'ChatTurn'});
  expect(audit.changes.find(change=>change.field==='sourceId')).toMatchObject({before:{kind:'absent'},after:{kind:'value',value:'turn-1'}});
  const projected=safeHistoryEvent({...saved,id:'event-1',timestamp:new Date(),result:saved.outcome});
  expect(projected.payload).toMatchObject({sourceId:'turn-1',sourceType:'chat_turn',sourceVersion:0,linkId:'link-1'});
  expect(JSON.stringify(saved)).not.toContain('PRIVATE_');
  expect(JSON.stringify(projected)).not.toContain('PRIVATE_');
});

test('recorded plan provenance remains safe metadata and does not expose specifications or model output',()=>{
  expect(safeStoredPayload({planProposalId:'proposal-1',planRevision:2,sourceTurnId:'turn-1',input:'PRIVATE',output:'PRIVATE',content:'PRIVATE',interviewBrief:{summary:'PRIVATE'}})).toEqual({planProposalId:'proposal-1',planRevision:2,sourceTurnId:'turn-1'});
});
