'use strict';
const host=acquireVsCodeApi();
const $=id=>document.getElementById(id);
function send(type,data={}){host.postMessage({type,...data});}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function options(id,rows,selected){$(id).replaceChildren();for(const row of rows){const option=element('option',row.name||row.title);option.value=row.id;$(id).append(option);}if(rows.some(row=>row.id===selected))$(id).value=selected;}
const statuses={queued:'Sua solicitação está salva. Podemos continuar de onde paramos.',running:'Seu analista está preparando a resposta…',failed:'Não foi possível concluir esta resposta. Você pode tentar novamente ou interromper para continuar de outra forma.',cancelled:'Espera interrompida. Sua conversa foi preservada.'};
function renderTurn(turn,target){
  const human=element('article',undefined,'message human');human.append(element('h2','Você'),element('p',turn.user_text));target.append(human);
  const reply=turn.result;
  if(!reply){human.append(element('p',statuses[turn.state]||'Solicitação registrada.','state'));return;}
  const analyst=element('article',undefined,'message analyst');analyst.append(element('h2','Seu analista'),element('p',reply.reply));
  if(reply.questions.length){const questions=element('ol');for(const question of reply.questions)questions.append(element('li',question));analyst.append(questions);}
  if(reply.assumptions.length){analyst.append(element('h3','Pontos que precisam da sua confirmação'));const assumptions=element('ul');for(const assumption of reply.assumptions)assumptions.append(element('li',assumption));analyst.append(assumptions);}
  target.append(analyst);
  if(!reply.proposal)return;
  const card=element('section',undefined,'plan');card.append(element('h2','Seu plano para revisão'),element('p','Confira se este plano representa o que você precisa. Ele ainda não foi aprovado.','state'));
  const names=new Map(reply.proposal.map(item=>[item.ref,item.title]));
  for(const item of reply.proposal){
    const group=element('article',undefined,`plan-item ${item.kind}`);
    group.append(element('span',({outcome:'Resultado esperado',epic:'Frente de trabalho',story:'Entrega'})[item.kind],'eyebrow'),element('h3',item.title),element('p',item.description));
    if(item.parent_ref)group.append(element('small',`Parte de: ${names.get(item.parent_ref)||'plano'}`));
    if(item.measure)group.append(element('p',`Como medir: ${item.measure}`));
    if(item.criteria.length){group.append(element('strong','Como saber que está pronto'));const criteria=element('ul');for(const criterion of item.criteria)criteria.append(element('li',criterion));group.append(criteria);}
    card.append(group);
  }
  target.append(card);
}
window.addEventListener('message',event=>{
  const message=event.data;
  if(message.type==='accepted'){$('message').value='';return;}
  if(message.type!=='state')return;
  const state=message.value,busy=!!state.busy;
  $('workspace').hidden=!state.configured;$('welcome').hidden=!!state.configured;$('connect').disabled=busy;
  const rawNotice=state.notice||'';
  $('notice').textContent=busy?'Seu analista está trabalhando no seu pedido…':/HTTP|schema|lease|hash|Idempotency/i.test(rawNotice)?'Não foi possível concluir esta etapa. Sua conversa está salva. Consulte os detalhes de conexão se precisar de ajuda.':rawNotice;
  if(!state.configured)return;
  $('technical-notice').textContent=rawNotice;
  options('project',state.projects||[],state.project);options('conversation',state.conversations||[],state.conversation);
  const project=state.projects?.find(row=>row.id===state.project),writable=['manager','contributor'].includes(state.role);
  const turns=state.history?.turns||[],last=turns.at(-1),pending=last&&['queued','running','failed'].includes(last.state);
  const proposal=last?.result?.proposal,hasPlan=!!proposal?.length,publication=state.publication||{count:0,total:hasPlan?proposal.length:0};
  const sent=hasPlan&&publication.total>0&&publication.count===publication.total,partial=hasPlan&&publication.count>0&&!sent;
  const phase=sent?3:hasPlan?2:1;
  $('heading').textContent=project?.name||'Sua ideia começa aqui.';
  $('intro').textContent=project?'Um passo de cada vez, com suas decisões no centro.':'Conte o que precisa melhorar no seu negócio. Vamos construir um plano juntos.';
  for(let index=1;index<=3;index++){$(`step-${index}`).className=index===phase?'current':index<phase?'done':'';$(`step-${index}`).setAttribute('aria-current',index===phase?'step':'false');}
  $('phase-label').textContent=`PASSO ${phase} DE 3`;
  $('phase-title').textContent=!project?'Qual ideia você quer tirar do papel?':!state.history?'Vamos retomar sua ideia':busy?'Estamos trabalhando no seu pedido':pending?'Vamos continuar de onde paramos':sent?'Seu plano está pronto para sua decisão':partial?'Falta concluir o envio':hasPlan?'Este plano faz sentido para você?':turns.length?'Já podemos preparar seu plano':'Conte como funciona seu negócio';
  $('phase-description').textContent=!project?'Dê um nome à sua ideia. Depois, explique o problema em suas palavras.':!state.history?'Comece uma conversa para explicar o que deseja alcançar.':busy?'Aguarde a resposta ou interrompa a espera. Tudo o que você já contou continua salvo.':pending?'Use Tentar novamente para recuperar a resposta. Se preferir, interrompa a espera para seguir com outra mensagem.':sent?'Abra a página de revisão para conferir o plano e registrar sua decisão. Enviar o plano não aprova nem inicia a construção do software.':partial?`${publication.count} de ${publication.total} itens já foram enviados. Conclua o envio para revisar o conjunto, sem duplicar os itens anteriores.`:hasPlan?'Leia o resultado esperado e as entregas abaixo. Peça os ajustes que desejar ou envie o plano para revisão.':turns.length?'Responda apenas ao que for útil. Você pode pedir um plano inicial agora e revisar os detalhes depois.':'O que você faz hoje, o que precisa melhorar e quem usará a solução? Não é preciso escrever requisitos técnicos.';
  if(!project&&!state.canCreateProject)$('phase-description').textContent='Peça ao responsável pelo ambiente acesso a uma ideia para começar.';
  if(project&&!writable&&!sent)$('phase-description').textContent='Você pode consultar esta ideia. O responsável pelo plano pode conversar com o analista e encaminhar a revisão.';
  $('start-idea').hidden=!!project||!state.canCreateProject;$('start-idea').disabled=busy;
  $('start-conversation').hidden=!project||!!state.history||!writable;$('start-conversation').disabled=busy;
  $('propose').hidden=!state.history||!turns.length||hasPlan||!!pending||!writable||busy;
  $('publish-proposal').hidden=!hasPlan||sent||!writable||last.actor_id!==state.actorId;
  $('publish-proposal').disabled=busy||!!pending;$('publish-proposal').textContent=partial?'Concluir envio':'Enviar para revisão';
  $('portal').hidden=!sent;$('portal').disabled=busy;
  $('summary').textContent=state.history?.summary||'';$('understanding').hidden=!state.history?.summary;
  $('model').textContent=`Modelo local: ${state.history?.model||'qwen3:14b'}. Etapa de planejamento; nenhuma construção automática habilitada.`;
  $('messages').replaceChildren();$('earlier-messages').replaceChildren();
  for(const turn of turns.slice(0,-1))renderTurn(turn,$('earlier-messages'));
  if(last)renderTurn(last,$('messages'));
  $('earlier').hidden=turns.length<2;$('earlier-label').textContent=`Ver conversa anterior (${Math.max(0,turns.length-1)} mensagens suas)`;
  $('send-form').hidden=!state.history||sent||partial;$('sent-note').hidden=!sent&&!partial;
  $('sent-note').textContent=partial?'Conclua o envio em andamento antes de alterar este plano. Depois, faça os ajustes na página de revisão.':'Seu plano foi enviado. Faça a revisão e eventuais alterações na página de decisão.';
  $('message-label').textContent=hasPlan?'O que você gostaria de ajustar?':turns.length?'Converse com seu analista':'Conte sua ideia';
  $('message').placeholder=hasPlan?'Ex.: prefiro deixar o controle de pagamentos para depois…':'Hoje faço… e gostaria de melhorar…';
  $('message-help').textContent=hasPlan?'Explique o ajuste. O analista preparará uma nova versão para você revisar.':'Não precisa conhecer tecnologia. Explique o problema do seu jeito.';
  $('send').textContent=hasPlan?'Pedir ajuste':'Enviar';
  $('message').disabled=busy||!writable||!state.history||!!pending;$('send').disabled=$('message').disabled;
  $('retry').hidden=!pending||last.actor_id!==state.actorId||last.attempts>=3;$('retry').disabled=busy;
  $('cancel').hidden=!pending||!(last.actor_id===state.actorId||state.role==='manager');
  for(const id of ['project','conversation','new-project','new-conversation','refresh','change-access'])$(id).disabled=busy;
  $('new-project').hidden=!state.canCreateProject;$('new-conversation').disabled=busy||!writable||!state.project;
});
$('send-form').addEventListener('submit',event=>{event.preventDefault();if(!$('message').disabled&&$('message').value.trim())send('send',{text:$('message').value});});
for(const type of ['connect','refresh','portal','new-project','new-conversation','retry','cancel','propose','publish-proposal'])$(type).addEventListener('click',()=>send(type));
$('start-idea').addEventListener('click',()=>send('new-project'));
$('start-conversation').addEventListener('click',()=>send('new-conversation'));
$('change-access').addEventListener('click',()=>send('connect'));
$('project').addEventListener('change',()=>send('project',{id:$('project').value}));
$('conversation').addEventListener('change',()=>send('conversation',{id:$('conversation').value}));
send('ready');
