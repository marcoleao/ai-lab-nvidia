'use strict';
// Explicit operator recovery: records a draft only. Never publishes or approves.
const path=require('node:path'),crypto=require('node:crypto');
const {native,api,Lab}=require('../../vscode/client');
(async()=>{
  const [conversation,failed]=process.argv.slice(2);
  if(![conversation,failed].every(id=>/^[a-f0-9-]{36}$/.test(id||'')))throw Error('Conversation and failed turn IDs required');
  const access=JSON.parse(await native(['-d','agentic-sdlc','-u','root','--exec','cat','/opt/agentic-sdlc/state/access.json'],null,null,20000));
  const call=(route,method,body,key)=>api(access.human.token,route,method,body,key);
  const post=(route,body,key)=>call(route,'POST',body,key||crypto.randomUUID());
  let history=await call(`/v1/conversations/${conversation}`);
  const prior=history.turns.find(turn=>turn.id===failed);
  if(!prior||prior.state!=='failed')throw Error('Expected failed turn; refusing to alter another round');
  await post(`/v1/chat-turns/${failed}/cancel`);
  history=await call(`/v1/conversations/${conversation}`);
  const turn=await post(`/v1/conversations/${conversation}/turns`,{expected_version:history.version,intent:'proposal',text:'Gere a proposta agora com base nas respostas já registradas. Utilize o novo formato estruturado e explicite hipóteses sem inventar confirmações.'});
  const lease=await post(`/v1/chat-turns/${turn.id}/claim`),started=Date.now();
  try{
    if(lease.request.format.title!=='PlanningTree')throw Error('New planning format not installed');
    const output=await new Lab(path.resolve(__dirname,'../../vscode')).infer(lease.request,AbortSignal.timeout(180000));
    await post(`/v1/chat-turns/${turn.id}/complete`,{...output,lease_token:lease.lease_token,prompt_hash:lease.prompt_hash,duration_ms:Date.now()-started});
    history=await call(`/v1/conversations/${conversation}`);
    const result=history.turns.at(-1);
    if(result.id!==turn.id||!result.result?.proposal?.length)throw Error('Recovered draft not found in conversation');
    console.log(`Conversation recovered: ${result.result.proposal.length} draft items recorded. Nothing published or approved.`);
  }catch(error){await post(`/v1/chat-turns/${turn.id}/fail`,{lease_token:lease.lease_token,code:'invalid_response'}).catch(()=>{});throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
