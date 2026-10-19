'use strict';
// Operator acceptance only. This file is excluded from the installed VSIX.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {native,api,Lab}=require('../client');
const reportPath=path.resolve(__dirname,'../.state/chat-live-acceptance.json');
(async()=>{
  const read=async file=>JSON.parse(await native(['-d','agentic-sdlc','-u','root','--exec','cat',`/opt/agentic-sdlc/state/${file}`],null,null,20000));
  const keys=await read('access.json'),demo=await read('demo.json');
  const call=(route,method,body,key)=>api(keys.human.token,route,method,body,key);
  if(process.argv[2]==='verify-history'){
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    for(const item of report.conversations){const history=await call(`/v1/conversations/${item.id}`);if(history.turns.length!==item.turns||history.summary!==item.summary)throw Error('Conversation changed or missing after restart');}
    report.restart_persistence='passed';await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log('Persistent real-model conversations verified after restart.');return;
  }
  const lab=new Lab(path.resolve(__dirname,'..'));
  const report={status:'running',human_acceptance:'pending',conversations:[],cases:[]};
  for(const [domain,text,followup] of [
    ['videolocadora','Quero um software para organizar minha videolocadora de filmes em mídias físicas.','Hoje anotamos tudo em papel. Temos dois atendentes. Cada exemplar pode ser alugado por dois dias, sem reservas.'],
    ['automoveis','Quero um software para minha loja que vende automóveis de estoque próprio e consignados.',null]
  ]){
    const conversation=await call(`/v1/projects/${demo.project_id}/conversations`,'POST',{title:`Ensaio real do chat — ${domain}`},crypto.randomUUID());
    let history=await call(`/v1/conversations/${conversation.id}`);
    for(const message of [text,followup].filter(Boolean)){
      const turn=await call(`/v1/conversations/${conversation.id}/turns`,'POST',{text:message,expected_version:history.version},crypto.randomUUID());
      const lease=await call(`/v1/chat-turns/${turn.id}/claim`,'POST',undefined,crypto.randomUUID());
      const started=Date.now();
      try{
        const output=await lab.infer(lease.request,AbortSignal.timeout(180000));
        await call(`/v1/chat-turns/${turn.id}/complete`,'POST',{...output,lease_token:lease.lease_token,prompt_hash:lease.prompt_hash,duration_ms:Date.now()-started},crypto.randomUUID());
        report.cases.push({domain,model:output.model,digest:output.model_digest,duration_ms:Date.now()-started,prompt_hash:lease.prompt_hash,result:output.result});
      }catch(error){await call(`/v1/chat-turns/${turn.id}/fail`,'POST',{lease_token:lease.lease_token,code:'transport_error'},crypto.randomUUID()).catch(()=>{});throw error;}
      history=await call(`/v1/conversations/${conversation.id}`);
      if(history.turns.at(-1).state!=='completed')throw Error('Real response not persisted');
    }
    report.conversations.push({id:conversation.id,turns:history.turns.length,summary:history.summary});
    console.log(`Real chat accepted technically: ${domain}; ${history.turns.length} persisted turn(s).`);
    await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  }
  report.status='passed';report.completed_at=new Date().toISOString();await fs.writeFile(reportPath,JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
