'use strict';
// Private operator diagnostic. Never packaged in the extension; never publishes.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {native,api,Lab}=require('../../vscode/client');
(async()=>{
  const access=JSON.parse(await native(['-d','agentic-sdlc','-u','root','--exec','cat','/opt/agentic-sdlc/state/access.json'],null,null,20000));
  const id=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Turn UUID required');
  const post=(route,body)=>api(access.human.token,route,'POST',body,crypto.randomUUID());
  const lease=await post(`/v1/chat-turns/${id}/claim`),started=Date.now();
  try{
    const output=await new Lab(path.resolve(__dirname,'../../vscode')).infer(lease.request,AbortSignal.timeout(180000));
    await fs.writeFile(path.resolve(__dirname,'../.state/proposal-diagnostic.json'),JSON.stringify(output,null,2));
    const response=await fetch(`http://127.0.0.1:3100/v1/chat-turns/${id}/complete`,{method:'POST',headers:{Authorization:'Bearer '+access.human.token,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({...output,lease_token:lease.lease_token,prompt_hash:lease.prompt_hash,duration_ms:Date.now()-started})});
    if(!response.ok){const value=await response.json();console.log(JSON.stringify(Array.isArray(value.detail)?value.detail.map(item=>({loc:item.loc,type:item.type,msg:item.msg})):value.detail));throw Error('Model result rejected; private diagnostic saved locally.');}
    console.log('Existing proposal turn recovered and recorded; no backlog publication.');
  }catch(error){await post(`/v1/chat-turns/${id}/fail`,{lease_token:lease.lease_token,code:'invalid_response'}).catch(()=>{});throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
