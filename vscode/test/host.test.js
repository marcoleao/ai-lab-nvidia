'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const original=Module._load;
const fakeVscode={window:{showWarningMessage:async()=>undefined}};
Module._load=function(name,...args){if(name==='vscode')return fakeVscode;return original.call(this,name,...args);};
const {Chat,publicationFor}=require('../extension');Module._load=original;

test('late model response after cancellation never reaches completion API',async()=>{
  const state=new Map();const context={extensionPath:__dirname,workspaceState:{get:(key,fallback)=>state.get(key)||fallback,update:async(key,value)=>state.set(key,value)},secrets:{get:async()=> 'synthetic-test-key'}};
  const chat=new Chat(context),calls=[];
  chat.refresh=async()=>{};
  chat.mutation=async path=>{calls.push(path);return {lease_token:'synthetic',request:{},prompt_hash:'a'.repeat(64)};};
  let provide,started;
  const waiting=new Promise(resolve=>{started=resolve;});
  chat.lab.infer=()=>{started();return new Promise(resolve=>{provide=resolve;});};
  const running=chat.run('turn');await waiting;await chat.cancel();
  provide({result:{reply:'late'},model:'qwen3:14b',model_digest:'a'.repeat(64)});await running;
  assert(calls.some(path=>path.endsWith('/cancel')));
  assert(!calls.some(path=>path.endsWith('/complete')));
  assert.equal(chat.active,null);
});

test('publishing requires explicit confirmation and retries retain parent IDs and item keys',async()=>{
  const context={extensionPath:__dirname,workspaceState:{get:()=>'',update:async()=>{}},secrets:{get:async()=> 'synthetic'}};
  const chat=new Chat(context);
  chat.refresh=async()=>{};
  const item=(ref,kind,parent_ref)=>({ref,kind,parent_ref,title:ref,description:'Proposta sintética',measure:kind==='outcome'?'Meta proposta':'',criteria:kind==='story'?['Critério observável']:[]});
  chat.state={actorId:'human',history:{turns:[{id:'turn',project_id:'project',actor_id:'human',state:'completed',result_hash:'a'.repeat(64),result:{proposal:[item('o','outcome',null),item('e','epic','o'),item('s','story','e')]}}]}};
  const committed=new Map(),calls=[];let loseResponse=true;
  chat.mutation=async(path,body,key)=>{
    assert(path.endsWith('/work-items'));calls.push({body,key});
    if(!committed.has(key))committed.set(key,{id:`id-${committed.size}`});
    if(loseResponse){loseResponse=false;throw Error('Lost response after commit');}
    return committed.get(key);
  };
  await chat.publishProposal();assert.equal(calls.length,0);
  fakeVscode.window.showWarningMessage=async()=> 'Enviar para revisão';
  await assert.rejects(chat.publishProposal(),/continuar/);
  await chat.publishProposal();
  assert.equal(committed.size,3);
  assert.equal(calls[0].key,calls[1].key);
  assert.equal(calls[2].body.parent_id,'id-0');
  assert.equal(calls[3].body.parent_id,'id-1');
  assert(calls.every(call=>call.body.description.includes('chat-source:turn:')));
});

test('publication progress uses exact source markers, survives reload and never confuses ref prefixes',()=>{
  const turn={id:'turn',result_hash:'hash',result:{proposal:[{ref:'s1'},{ref:'s10'}]}};
  const items=[{payload:{description:'Proposta\n\nOrigem da proposta: chat-source:turn:hash:s10'}}];
  assert.deepEqual(publicationFor(turn,items),{total:2,count:1});
  items.push({payload:{description:'Proposta\n\nOrigem da proposta: chat-source:turn:hash:s1'}});
  assert.deepEqual(publicationFor(turn,items),{total:2,count:2});
  assert.deepEqual(publicationFor({...turn,result_hash:'changed'},items),{total:2,count:0});
});

test('a requested draft adjustment generates a revised proposal directly without publication',async()=>{
  const chat=new Chat({extensionPath:__dirname,workspaceState:{get:()=>'',update:async()=>{}},secrets:{get:async()=> 'synthetic'}});
  chat.state={history:{turns:[{result:{proposal:[{}]}}]}};
  const calls=[];chat.start=async(text,intent)=>calls.push({text,intent});
  await chat.handle({type:'send',text:'Deixe pagamentos para depois.'});
  assert.deepEqual(calls,[{text:'Deixe pagamentos para depois.',intent:'proposal'}]);
});

test('editing a sent item does not lose submission progress after reopening the conversation',async()=>{
  const chat=new Chat({extensionPath:__dirname,workspaceState:{get:()=>'',update:async()=>{}},secrets:{get:async()=> 'synthetic'}});
  chat.state.project='project';chat.state.conversation='chat';
  const turn={id:'turn',result_hash:'hash',result:{proposal:[{ref:'o1'}]}};
  const responses={
    '/v1/me':{id:'human',kind:'human',can_create_project:true},
    '/v1/projects':[{id:'project',name:'Ideia',role:'manager'}],
    '/v1/projects/project/conversations':[{id:'chat',title:'Plano'}],
    '/v1/conversations/chat':{turns:[turn]},
    '/v1/projects/project/work-items':{items:[{id:'item',version:2,payload:{description:'Descrição revisada pelo responsável.'}}]},
    '/v1/projects/project/work-items/item/versions':[{version:1,payload:{description:'Origem da proposta: chat-source:turn:hash:o1'}}]
  };
  chat.request=async route=>{assert(route in responses);return responses[route];};
  await chat.refresh();assert.deepEqual(chat.state.publication,{total:1,count:1});
});

test('a partially submitted plan cannot silently become another batch of draft items',async()=>{
  const chat=new Chat({extensionPath:__dirname,workspaceState:{get:()=>'',update:async()=>{}},secrets:{get:async()=> 'synthetic'}});
  chat.state={history:{turns:[{result:{proposal:[{}]}}]},publication:{count:1,total:3}};
  chat.start=async()=>assert.fail('Must not generate another plan during partial submission');
  await chat.handle({type:'send',text:'Mude este plano.'});
  assert.match(chat.state.notice,/Conclua o envio/);
});
