import {describe,expect,test} from 'vitest';
import {assistantAttemptRequest,assistantView,emptyAssistantSession,restoreAssistantSession,type AssistantAttempt} from '../apps/web/app/assistant-session.ts';

const contextId='project_original',key='a24e28bd-3fd9-4c6d-a28d-54af7b6f1979';
const serialize=(pending:AssistantAttempt|null,extra:Record<string,unknown>={})=>JSON.stringify({...emptyAssistantSession(contextId),drafts:{ana:'Próxima pergunta ainda não enviada.'},pending,...extra});
const attempts:{name:string;pending:AssistantAttempt;request:{path:string;body:Record<string,unknown>}}[]=[
 {name:'planning message',pending:{kind:'message',key,persona:'ana',message:'  Confirmar o comportamento combinado?\nPreservar este texto.  ',expectedVersion:7,mode:'planning'},request:{path:'/assistant/turns',body:{contextId,message:'  Confirmar o comportamento combinado?\nPreservar este texto.  ',expectedVersion:7,requirementsMode:true}}},
 {name:'delivery message',pending:{kind:'message',key,persona:'ana',message:'Detalhar somente esta História.',expectedVersion:9,mode:'delivery'},request:{path:'/assistant/turns',body:{contextId,message:'Detalhar somente esta História.',expectedVersion:9,assistantMode:'delivery'}}},
 {name:'plan generation',pending:{kind:'plan',key,persona:'ana',expectedVersion:11},request:{path:'/assistant/plans',body:{contextId,expectedVersion:11,requirementsMode:true}}},
 {name:'direct completion',pending:{kind:'complete',key,persona:'ana',expectedVersion:13,projectId:'target_project'},request:{path:'/assistant/complete',body:{contextId,projectId:'target_project',expectedVersion:13,confirmed:true,requirementsMode:true}}},
 {name:'turn cancellation',pending:{kind:'cancel',key,persona:'ana',turnId:'turn_original'},request:{path:'/assistant/turns/turn_original/cancel',body:{}}},
];

describe('Assistant requests with an uncertain acknowledgement',()=>{
 test.each(attempts)('$name is restored with its original body, key and persona after reload under another persona',({pending,request})=>{
  // The server may already have accepted this exact command. A reload and a
  // persona change must permit repeating its identity, rather than a new intent.
  const restored=restoreAssistantSession(serialize(pending),contextId,'bruno','planning');
  expect(restored.pending).toEqual(pending);
  expect(assistantAttemptRequest(contextId,restored.pending!)).toEqual(request);
  expect(restored.pending!.key).toBe(key);expect(restored.pending!.persona).toBe('ana');
  const restoredAgain=restoreAssistantSession(JSON.stringify(restored),contextId,'admin','delivery');
  expect(restoredAgain.pending).toEqual(pending);
  expect(assistantAttemptRequest(contextId,restoredAgain.pending!)).toEqual(request);
  expect(restoredAgain.drafts.ana).toBe('Próxima pergunta ainda não enviada.');
 });

 test('the two persona drafts survive independent restores without reassigning an uncertain request',()=>{
  const raw=serialize(attempts[0].pending,{drafts:{ana:'Pergunta da Ana.',bruno:'Detalhamento do Bruno.'},view:'proposal'});
  const ana=restoreAssistantSession(raw,contextId,'ana','planning'),bruno=restoreAssistantSession(JSON.stringify(ana),contextId,'bruno','planning');
  expect(bruno.drafts).toEqual({ana:'Pergunta da Ana.',bruno:'Detalhamento do Bruno.'});
  expect(bruno.pending?.persona).toBe('ana');expect(bruno.view).toBe('proposal');
  bruno.drafts.bruno='Nova pergunta do Bruno.';
  expect(restoreAssistantSession(JSON.stringify(bruno),contextId,'ana','planning').drafts).toEqual({ana:'Pergunta da Ana.',bruno:'Nova pergunta do Bruno.'});
 });
});

describe('migration from the previously published Assistant session',()=>{
 test.each([
  {field:'retry',pending:attempts[0].pending},
  {field:'planRetry',pending:attempts[2].pending},
  {field:'completionRetry',pending:attempts[3].pending},
 ])('$field keeps its original command and assigns the legacy draft to its original persona',({field,pending})=>{
  const {kind,...legacy}=pending;
  const restored=restoreAssistantSession(JSON.stringify({draft:'Texto anterior ao recarregamento.',view:'plans',[field]:legacy}),contextId,'bruno','planning');
  expect(restored).toMatchObject({version:1,contextId,view:'proposal',drafts:{ana:'Texto anterior ao recarregamento.'},pending});
  expect(restored.drafts.bruno).toBeUndefined();
  expect(assistantAttemptRequest(contextId,restored.pending!)).toEqual(assistantAttemptRequest(contextId,pending));
  expect(restoreAssistantSession(JSON.stringify(restored),contextId,'admin','planning')).toEqual(restored);
 });
 test('a legacy draft without a pending command belongs to the current persona and old view aliases remain navigable',()=>{
  const restored=restoreAssistantSession(JSON.stringify({draft:'Pergunta sem envio pendente.',view:'interview'}),contextId,'bruno','planning');
  expect(restored).toEqual({...emptyAssistantSession(contextId),drafts:{bruno:'Pergunta sem envio pendente.'}});
  expect(assistantView('plans')).toBe('proposal');expect(assistantView('history')).toBe('history');expect(assistantView('unknown')).toBeNull();
 });
});

describe('restored storage is constrained to its context and supported commands',()=>{
 test('a foreign context never imports its draft or pending command, including a falsely legacy-shaped entry',()=>{
  for(const raw of [
   serialize(attempts[0].pending,{contextId:'another_project'}),
   JSON.stringify({contextId:'another_project',draft:'Foreign draft',retry:attempts[0].pending}),
  ])expect(restoreAssistantSession(raw,contextId,'admin','planning')).toEqual(emptyAssistantSession(contextId));
 });
 test('unsupported or malformed versioned envelopes are not interpreted as the old unversioned format',()=>{
  for(const version of [2,'1',null]){
   const raw=JSON.stringify({version,contextId,draft:'Not a published legacy entry',retry:attempts[0].pending});
   expect(restoreAssistantSession(raw,contextId,'admin','planning')).toEqual(emptyAssistantSession(contextId));
  }
  for(const raw of [null,'{broken','null','[]','42','"text"'])expect(restoreAssistantSession(raw,contextId,'admin','planning')).toEqual(emptyAssistantSession(contextId));
 });
 test.each([
  {kind:'message',message:' ',expectedVersion:1},
  {kind:'message',message:'x'.repeat(4001),expectedVersion:1},
  {kind:'message',message:['Unexpected array'],expectedVersion:1},
  {kind:'message',message:'Question',expectedVersion:-1},
  {kind:'message',message:'Question',expectedVersion:1.5},
  {kind:'message',message:'Question',expectedVersion:Number.MAX_SAFE_INTEGER+1},
  {kind:'message',message:'Question',expectedVersion:'1'},
  {kind:'plan',expectedVersion:2,key:'new-key-without-command-identity'},
  {kind:'plan',expectedVersion:2,persona:'__proto__'},
  {kind:'complete',expectedVersion:2,projectId:'../../another-context'},
  {kind:'complete',expectedVersion:2,projectId:'https://outside.invalid/project'},
  {kind:'cancel',turnId:'turn/cancel?contextId=foreign'},
  {kind:'cancel',turnId:'../turn'},
  {kind:'cancel',turnId:'constructor'},
  {kind:'arbitrary-command',path:'/items',body:{kind:'story'}},
 ])('rejects an unsafe or invalid pending shape %# while preserving the valid draft',invalid=>{
  const raw=serialize(null,{pending:{key,persona:'ana',...invalid}});
  const restored=restoreAssistantSession(raw,contextId,'bruno','planning');
  expect(restored.pending).toBeNull();expect(restored.drafts.ana).toBe('Próxima pergunta ainda não enviada.');
 });
 test('stored URL, method and body cannot redirect a valid cancellation or replace its payload',()=>{
  const raw=serialize(attempts[4].pending,{pending:{...attempts[4].pending,path:'https://outside.invalid/delete',url:'/items/foreign',method:'DELETE',body:{confirmed:true,contextId:'foreign'}}});
  const restored=restoreAssistantSession(raw,contextId,'admin','planning');
  expect(restored.pending).toEqual(attempts[4].pending);
  expect(assistantAttemptRequest(contextId,restored.pending!)).toEqual({path:'/assistant/turns/turn_original/cancel',body:{}});
 });
 test('untrusted draft keys, draft values and view names cannot corrupt the draft dictionary or navigation',()=>{
  const raw='{"version":1,"contextId":"'+contextId+'","view":"https://outside.invalid/","drafts":{"ana":"Texto válido","bruno":42,"__proto__":"malicious","constructor":"malicious","prototype":"malicious","https://outside.invalid":"malicious","large":"'+('x'.repeat(4001))+'"},"pending":null}';
  const restored=restoreAssistantSession(raw,contextId,'ana','planning');
  expect(restored.drafts).toEqual({ana:'Texto válido'});expect(restored.view).toBe('conversation');
  expect(Object.getPrototypeOf(restored.drafts)).toBe(Object.prototype);
 });
});
