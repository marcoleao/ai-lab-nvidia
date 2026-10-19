'use strict';
const vscode=require('vscode');
const crypto=require('node:crypto');
const {api,Lab,ClientError}=require('./client');
const {html}=require('./view');
const SECRET='sdlc.local.human-access';
let instance;
function publicationFor(turn,items){
  const proposal=turn?.result?.proposal||[];
  return {total:proposal.length,count:proposal.filter(item=>items.some(row=>(row.payload?.description||'').split('\n').some(line=>line.trim()===`Origem da proposta: chat-source:${turn.id}:${turn.result_hash}:${item.ref}`))).length};
}

class Chat {
  constructor(context){this.context=context;this.lab=new Lab(context.extensionPath);this.state={configured:false,projects:[],conversations:[],project:context.workspaceState.get('sdlc.project',''),conversation:context.workspaceState.get('sdlc.conversation',''),notice:'Conecte seu ambiente para começar. Você só precisa fazer isso uma vez.'};this.active=null;this.serial=false;}
  async resolveWebviewView(view){
    this.view=view;
    view.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(this.context.extensionUri,'media')]};
    const asset=name=>view.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,'media',name));
    view.webview.html=html(view.webview.cspSource,asset('chat.css'),asset('chat.js'));
    view.webview.onDidReceiveMessage(message=>this.handle(message),null,this.context.subscriptions);
    view.onDidDispose(()=>{this.view=null;},null,this.context.subscriptions);
    view.onDidChangeVisibility(()=>{if(view.visible)this.handle({type:'refresh'});},null,this.context.subscriptions);
  }
  publish(){this.view?.webview.postMessage({type:'state',value:{...this.state,busy:!!this.active||this.serial}});}
  async request(route,method,body,key){const token=await this.context.secrets.get(SECRET);if(!token)throw new ClientError('Configure sua chave de acesso primeiro.','authentication');return api(token,route,method,body,key);}
  async mutation(route,body,key){return this.request(route,'POST',body,key||crypto.randomUUID());}
  async refresh(){
    const configured=!!await this.context.secrets.get(SECRET);
    this.state.configured=configured;if(!configured){this.publish();return;}
    const me=await this.request('/v1/me');if(me.kind!=='human')throw new ClientError('Use uma chave humana para a entrevista.','authentication');
    this.state.actorId=me.id;this.state.canCreateProject=me.can_create_project;
    this.state.projects=await this.request('/v1/projects');
    if(!this.state.projects.some(row=>row.id===this.state.project)){this.state.project=this.state.projects[0]?.id||'';this.state.conversation='';}
    this.state.role=this.state.projects.find(row=>row.id===this.state.project)?.role;
    this.state.conversations=this.state.project?await this.request(`/v1/projects/${this.state.project}/conversations`):[];
    if(!this.state.conversations.some(row=>row.id===this.state.conversation))this.state.conversation=this.state.conversations[0]?.id||'';
    this.state.history=this.state.conversation?await this.request(`/v1/conversations/${this.state.conversation}`):null;
    const latest=this.state.history?.turns?.at(-1);
    this.state.publication={count:0,total:latest?.result?.proposal?.length||0};
    if(latest?.result?.proposal){
      const backlog=await this.request(`/v1/projects/${this.state.project}/work-items`);
      this.state.publication=publicationFor(latest,backlog.items);
      if(this.state.publication.count<this.state.publication.total){
        const originals=await Promise.all(backlog.items.map(async item=>{
          if(item.version<=1)return item;
          const versions=await this.request(`/v1/projects/${this.state.project}/work-items/${item.id}/versions`);
          return {...item,payload:versions.find(version=>version.version===1)?.payload||item.payload};
        }));
        this.state.publication=publicationFor(latest,originals);
      }
    }
    await this.context.workspaceState.update('sdlc.project',this.state.project);await this.context.workspaceState.update('sdlc.conversation',this.state.conversation);
    this.publish();
  }
  async configure(){
    const value=await vscode.window.showInputBox({title:'Conectar ao meu ambiente',prompt:'Cole sua chave pessoal, fornecida pelo responsável pelo ambiente. Vamos guardá-la com segurança para seus próximos acessos.',password:true,ignoreFocusOut:true,validateInput:value=>value.trim().length>256?'A chave está maior que o esperado. Confira o que foi copiado.':undefined});
    if(!value)return;
    const token=value.trim(),identity=await api(token,'/v1/me');if(identity.kind!=='human')throw new ClientError('Esta interface requer uma chave humana.');
    await this.context.secrets.store(SECRET,token);this.state.notice='Conexão pronta. Comece uma ideia ou continue uma conversa.';await this.refresh();
  }
  async handle(message){
    if(!message||typeof message.type!=='string')return;
    if(message.type==='cancel'){await this.cancel();return;}
    if(this.serial||this.active)return;
    this.serial=true;this.publish();
    try{
      switch(message.type){
        case 'ready':case 'refresh':await this.refresh();break;
        case 'connect':await this.configure();break;
        case 'portal':await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:3100/?project=${encodeURIComponent(this.state.project)}#objects`));break;
        case 'project':if(this.state.projects.some(row=>row.id===message.id)){this.state.project=message.id;this.state.conversation='';await this.refresh();}break;
        case 'conversation':if(this.state.conversations.some(row=>row.id===message.id)){this.state.conversation=message.id;await this.refresh();}break;
        case 'new-project':{
          const name=await vscode.window.showInputBox({title:'Vamos começar sua ideia',prompt:'Como você quer chamar essa ideia? Ex.: Minha videolocadora.',validateInput:value=>value.trim().length<1||value.trim().length>120?'Escolha um nome com até 120 caracteres.':undefined});if(!name)break;
          const row=await this.mutation('/v1/projects',{name:name.trim()});this.state.project=row.id;this.state.conversation='';await this.refresh();await this.newConversation('Plano inicial');break;
        }
        case 'new-conversation':await this.newConversation();break;
        case 'send':if(typeof message.text==='string'&&message.text.trim()&&message.text.length<=2000&&this.state.history){if(this.state.publication?.count>0)throw new ClientError('Conclua o envio em andamento e faça os ajustes na página de revisão.');await this.start(message.text.trim(),this.state.history.turns.at(-1)?.result?.proposal?'proposal':'interview');}break;
        case 'propose':if(this.state.history)await this.start('Encerre as perguntas e gere agora a proposta do primeiro incremento com base nas minhas respostas. Declare hipóteses sem inventar confirmações.','proposal');break;
        case 'publish-proposal':await this.publishProposal();break;
        case 'retry':{const row=this.state.history?.turns?.at(-1);if(row&&['queued','running','failed'].includes(row.state))await this.run(row.id);break;}
        default:break;
      }
    }catch(error){this.state.notice=error.message;if(error.code==='authentication')this.state.configured=false;this.publish();}
    finally{this.serial=false;this.publish();}
  }
  async newConversation(initialTitle){
    if(!this.state.project)return;
    const title=initialTitle||await vscode.window.showInputBox({title:'Outra conversa sobre esta ideia',prompt:'Qual assunto você quer planejar?',value:'Novo plano',validateInput:value=>!value.trim()||value.trim().length>120?'Escolha um nome com até 120 caracteres.':undefined});if(!title)return;
    const row=await this.mutation(`/v1/projects/${this.state.project}/conversations`,{title:title.trim()});this.state.conversation=row.id;this.state.notice='Descreva o problema e o resultado que deseja alcançar.';await this.refresh();
  }
  async publishProposal(){
    await this.refresh();
    const turn=this.state.history?.turns?.at(-1),proposal=turn?.result?.proposal;
    if(turn?.state!=='completed'||!proposal?.length||turn.actor_id!==this.state.actorId)throw new ClientError('Selecione sua proposta concluída para publicar.');
    const confirmed=await vscode.window.showWarningMessage(`Enviar os ${proposal.length} itens deste plano para revisão? Eles serão acrescentados ao planejamento da sua ideia. Isso ainda não aprova o plano nem inicia a construção do software. Se o envio for interrompido, você poderá continuar sem duplicar os itens.`,{modal:true},'Enviar para revisão');
    if(confirmed!=='Enviar para revisão')return;
    const parents=Object.create(null);let count=0;
    try{
      for(const item of proposal){
        const marker=`chat-source:${turn.id}:${turn.result_hash}:${item.ref}`;
        const result=await this.mutation(`/v1/projects/${turn.project_id}/work-items`,{kind:item.kind,parent_id:item.parent_ref?parents[item.parent_ref]:null,title:item.title,description:`${item.description}\n\nOrigem da proposta: ${marker}`,measure:item.measure,criteria:item.criteria},`chat:${turn.id}:${item.ref}`);
        parents[item.ref]=result.id;count++;
      }
      this.state.notice='Plano enviado. O próximo passo é revisar e registrar sua decisão.';
      await this.refresh();
    }catch(error){throw new ClientError(`O envio não foi concluído. Use Concluir envio ou Enviar para revisão para continuar sem duplicar itens. ${error.message}`);}
  }
  async start(text,intent='interview'){
    // Keep retry identifiers and a hash, never message text, in workspace state.
    const signature=crypto.createHash('sha256').update(JSON.stringify([this.state.conversation,this.state.history.version,text,intent])).digest('hex');
    const pending=this.context.workspaceState.get('sdlc.pending');const key=pending?.signature===signature?pending.key:crypto.randomUUID();
    await this.context.workspaceState.update('sdlc.pending',{signature,key});
    const row=await this.mutation(`/v1/conversations/${this.state.conversation}/turns`,{text,intent,expected_version:this.state.history.version},key);
    await this.context.workspaceState.update('sdlc.pending',undefined);this.view?.webview.postMessage({type:'accepted'});
    await this.refresh();await this.run(row.id);
  }
  async run(turnId){
    let lease,timer;
    this.active={turnId,abort:new AbortController(),cancelled:false};this.state.notice='Preparando sua solicitação…';this.publish();
    const started=Date.now();
    try{
      lease=await this.mutation(`/v1/chat-turns/${turnId}/claim`);
      timer=setTimeout(()=>this.active?.abort.abort(new ClientError('O modelo excedeu o prazo total de 180 segundos.','timeout')),180000);
      await this.refresh();this.state.notice='Seu analista está preparando a resposta. Você pode interromper a espera.';this.publish();
      if(this.active.cancelled)return;
      const output=await this.lab.infer(lease.request,this.active.abort.signal);
      if(this.active.cancelled)return;
      await this.mutation(`/v1/chat-turns/${turnId}/complete`,{...output,lease_token:lease.lease_token,prompt_hash:lease.prompt_hash,duration_ms:Math.min(210000,Date.now()-started)});
      this.state.notice=output.result.proposal||output.result.outcome?'Seu plano está pronto para revisão. Você pode pedir ajustes ou enviar para a próxima etapa.':'Seu analista respondeu. Continue a conversa ou peça seu plano inicial.';
    }catch(error){
      if(lease&&!this.active?.cancelled){const code=['timeout','model_unavailable','invalid_response','client_closed'].includes(error.code)?error.code:'transport_error';await this.mutation(`/v1/chat-turns/${turnId}/fail`,{lease_token:lease.lease_token,code}).catch(()=>{});}
      this.state.notice=error.message;
    }finally{clearTimeout(timer);this.active=null;await this.refresh().catch(error=>{this.state.notice=error.message;});this.publish();}
  }
  async cancel(){
    const turnId=this.active?.turnId||this.state.history?.turns?.at(-1)?.id;if(!turnId)return;
    try{
      // Persist cancellation first: late results cannot be accepted.
      await this.mutation(`/v1/chat-turns/${turnId}/cancel`);
      if(this.active){this.active.cancelled=true;this.active.abort.abort();}
      this.state.notice='Espera interrompida. Sua conversa está salva. Podemos precisar aguardar até três minutos e meio antes de uma nova tentativa.';await this.refresh();
    }catch(error){this.state.notice=error.message;this.publish();}
  }
}
function activate(context){
  instance=new Chat(context);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('sdlc.chat',instance,{webviewOptions:{retainContextWhenHidden:true}}));
  context.subscriptions.push(vscode.commands.registerCommand('sdlc.chat.open',()=>vscode.commands.executeCommand('sdlc.chat.focus')));
  context.subscriptions.push(vscode.commands.registerCommand('sdlc.chat.configure',()=>instance.handle({type:'connect'})));
  context.subscriptions.push(vscode.commands.registerCommand('sdlc.chat.forget',async()=>{if(instance.active)await instance.cancel();await context.secrets.delete(SECRET);instance.state={configured:false,projects:[],conversations:[],notice:'Chave removida deste VS Code. O histórico permanece no SDLC.'};instance.publish();}));
}
function deactivate(){instance?.active?.abort.abort();}
module.exports={activate,deactivate,Chat,publicationFor};
