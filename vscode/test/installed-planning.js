'use strict';
// Operator acceptance with synthetic data only; excluded from the VSIX.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {native,api,Lab}=require('../client');
const original=Module._load;
Module._load=function(name,...args){if(name==='vscode')return {window:{showWarningMessage:async()=> 'Enviar para revisão'}};return original.call(this,name,...args);};
const {Chat}=require('../extension');Module._load=original;
(async()=>{
  const access=JSON.parse(await native(['-d','agentic-sdlc','-u','root','--exec','cat','/opt/agentic-sdlc/state/access.json'],null,null,20000));
  const call=async(route,method,body,key)=>{
    try{return await api(access.human.token,route,method,body,key);}catch(error){
      if(body&&key&&error.message.includes('422')){
        const response=await fetch('http://127.0.0.1:3100'+route,{method,redirect:'error',headers:{Authorization:'Bearer '+access.human.token,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
        const detail=(await response.json()).detail;
        if(Array.isArray(detail))throw Error(`${route}: ${JSON.stringify(detail.map(item=>({loc:item.loc,msg:item.msg})))}`);
      }
      throw Error(`${route}: ${error.message}`);
    }
  };
  const post=(route,body,key)=>call(route,'POST',body,key||crypto.randomUUID());
  let project,conversation;
  const resume=process.argv[2]==='publish-existing';
  if(resume){
    for(const candidate of (await call('/v1/projects')).filter(row=>row.name==='Aceitação sintética — entrevista e proposta 0.2')){
      for(const existing of await call(`/v1/projects/${candidate.id}/conversations`)){
        const history=await call(`/v1/conversations/${existing.id}`);
        if(history.turns.at(-1)?.result?.proposal?.length){project=candidate;conversation=existing;break;}
      }
      if(project)break;
    }
    if(!project)throw Error('No completed synthetic real proposal to resume');
  }else{
    project=await post('/v1/projects',{name:'Aceitação sintética — entrevista e proposta 0.2'});
    conversation=await post(`/v1/projects/${project.id}/conversations`,{title:'Videolocadora: encerrar entrevista e publicar rascunho'});
  }
  const lab=new Lab(path.resolve(__dirname,'..'));let results=[];
  if(!resume)for(const [text,intent] of [
    ['Tenho uma videolocadora com DVDs físicos, dois atendentes e controle em papel. Quero reduzir devoluções esquecidas. O primeiro incremento deve cadastrar exemplares, registrar retirada e devolução. Prazo de dois dias. Não teremos reservas, pagamentos ou multas neste incremento.','interview'],
    ['Já informei os usuários, prazo e escopo. Avance agora para outcomes, épicos e histórias, sem mais perguntas.','proposal']
  ]){
    const history=await call(`/v1/conversations/${conversation.id}`);
    const turn=await post(`/v1/conversations/${conversation.id}/turns`,{text,intent,expected_version:history.version});
    const lease=await post(`/v1/chat-turns/${turn.id}/claim`),started=Date.now();
    try{
      if(intent==='proposal'){
        const context=JSON.parse(lease.request.messages[1].content);
        if(!context.historico[0].resposta_humana.includes('Prazo de dois dias'))throw Error('Original answer missing from planning context');
      }
      const output=await lab.infer(lease.request,AbortSignal.timeout(180000));
      await fs.writeFile(path.resolve(__dirname,'../.state/chat-planning-last-output.json'),JSON.stringify({intent,...output},null,2));
      await post(`/v1/chat-turns/${turn.id}/complete`,{...output,lease_token:lease.lease_token,prompt_hash:lease.prompt_hash,duration_ms:Date.now()-started});
      results.push({intent,result:output.result,duration_ms:Date.now()-started});
      console.log(`Real ${intent} response persisted.`);
    }catch(error){await post(`/v1/chat-turns/${turn.id}/fail`,{lease_token:lease.lease_token,code:'invalid_response'}).catch(()=>{});throw error;}
  }
  const history=await call(`/v1/conversations/${conversation.id}`),latest=history.turns.at(-1);
  if(resume)results=history.turns.filter(turn=>turn.state==='completed').map(turn=>({result:turn.result,model:turn.model,model_digest:turn.model_digest}));
  if(latest.result.questions.length||!latest.result.proposal?.length)throw Error('Planning did not end interview');
  const chat=new Chat({extensionPath:path.resolve(__dirname,'..'),workspaceState:{get:()=>'',update:async()=>{}},secrets:{get:async()=>access.human.token}});
  chat.refresh=async()=>{};chat.state={actorId:latest.actor_id,history};chat.mutation=post;
  await chat.publishProposal();
  const first=await call(`/v1/projects/${project.id}/work-items`);
  await chat.publishProposal();
  const second=await call(`/v1/projects/${project.id}/work-items`);
  if(first.items.length!==latest.result.proposal.length||second.items.length!==first.items.length)throw Error('Publication count or duplicate failure');
  if(!second.items.every(item=>item.payload.description.includes(`chat-source:${latest.id}:${latest.result_hash}:`)))throw Error('Missing source trace');
  const report={status:'passed',human_acceptance:'pending',resumed_completed_real_turns:resume,project_id:project.id,conversation_id:conversation.id,results,published_items:second.items.map(item=>({id:item.id,kind:item.kind,parent_id:item.parent_id,source_issue:item.source_issue})),repeated_publication:'no_duplicates',completed_at:new Date().toISOString()};
  await fs.writeFile(path.resolve(__dirname,'../.state/chat-planning-acceptance.json'),JSON.stringify(report,null,2));
  console.log(`Real local planning passed: ${first.items.length} traced items published to Forgejo; repeated publication has no duplicates.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
