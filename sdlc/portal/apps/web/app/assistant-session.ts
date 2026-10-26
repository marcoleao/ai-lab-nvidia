export type AssistantView='conversation'|'proposal'|'history';
type Common={key:string;persona:string};
export type AssistantAttempt=Common&(
 {kind:'message';message:string;expectedVersion:number;mode:'planning'|'delivery'}|
 {kind:'plan';expectedVersion:number}|
 {kind:'complete';expectedVersion:number;projectId:string}|
 {kind:'cancel';turnId:string}
);
export type AssistantSession={version:1;contextId:string;drafts:Record<string,string>;view:AssistantView;pending:AssistantAttempt|null};
export const emptyAssistantSession=(contextId:string):AssistantSession=>({version:1,contextId,drafts:{},view:'conversation',pending:null});
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const identity=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9_-]{1,80}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const number=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
export function assistantView(value:unknown):AssistantView|null{
 if(value==='interview'||value==='conversation')return 'conversation';
 if(value==='plans'||value==='proposal')return 'proposal';
 return value==='history'?'history':null;
}
function attempt(value:unknown,mode:'planning'|'delivery'):AssistantAttempt|null{
 const entry=object(value);
 if(typeof entry.key!=='string'||!/^[a-f\d-]{36}$/i.test(entry.key)||!identity(entry.persona))return null;
 const common={key:entry.key,persona:entry.persona};
 if(entry.kind==='message'&&typeof entry.message==='string'&&entry.message.trim()&&entry.message.length<=4000&&number(entry.expectedVersion))return {...common,kind:'message',message:entry.message,expectedVersion:Number(entry.expectedVersion),mode:entry.mode==='planning'||entry.mode==='delivery'?entry.mode:mode};
 if(entry.kind==='plan'&&number(entry.expectedVersion))return {...common,kind:'plan',expectedVersion:Number(entry.expectedVersion)};
 if(entry.kind==='complete'&&number(entry.expectedVersion)&&identity(entry.projectId))return {...common,kind:'complete',expectedVersion:Number(entry.expectedVersion),projectId:entry.projectId};
 if(entry.kind==='cancel'&&identity(entry.turnId))return {...common,kind:'cancel',turnId:entry.turnId};
 return null;
}
/** Restore only this context's constrained command, never a stored URL/method.
 * A lost acknowledgement must retain its original body, persona and identity. */
export function restoreAssistantSession(raw:string|null,contextId:string,persona:string,mode:'planning'|'delivery'):AssistantSession{
 const empty=emptyAssistantSession(contextId);
 if(!raw)return empty;
 try{
  const value=object(JSON.parse(raw));
  if(value.contextId!==undefined&&value.contextId!==contextId)return empty;
  if(value.version===1){
   if(value.contextId!==contextId)return empty;
   const drafts:Record<string,string>={};
   for(const [key,text] of Object.entries(object(value.drafts)))if((identity(key)||key==='')&&typeof text==='string'&&text.length<=4000)drafts[key]=text;
   return {...empty,drafts,view:assistantView(value.view)??'conversation',pending:attempt(value.pending,mode)};
  }
  if('version' in value)return empty;
  // Preserve requests made by the previously published client on first use.
  const legacyMessage=object(value.retry),legacyPlan=object(value.planRetry),legacyComplete=object(value.completionRetry);
  const pending=attempt({...legacyMessage,kind:'message',mode},mode)??attempt({...legacyPlan,kind:'plan'},mode)??attempt({...legacyComplete,kind:'complete'},mode);
  const owner=pending?.persona??persona;
  return {...empty,drafts:typeof value.draft==='string'&&value.draft.length<=4000?{[owner]:value.draft}:{},view:assistantView(value.view)??'conversation',pending};
 }catch{return empty;}
}
export function assistantAttemptRequest(contextId:string,value:AssistantAttempt){
 switch(value.kind){
  case 'message':return {path:'/assistant/turns',body:{contextId,message:value.message,expectedVersion:value.expectedVersion,...(value.mode==='delivery'?{assistantMode:'delivery'}:{requirementsMode:true})}};
  case 'plan':return {path:'/assistant/plans',body:{contextId,expectedVersion:value.expectedVersion,requirementsMode:true}};
  case 'complete':return {path:'/assistant/complete',body:{contextId,projectId:value.projectId,expectedVersion:value.expectedVersion,confirmed:true,requirementsMode:true}};
  case 'cancel':return {path:`/assistant/turns/${encodeURIComponent(value.turnId)}/cancel`,body:{}};
 }
}
