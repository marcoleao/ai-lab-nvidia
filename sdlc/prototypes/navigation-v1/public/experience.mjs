import {prototypeEntities,simulationHistory,prototypeRepositories,prototypeCoverage} from './experience-data.mjs';
import {collection,collectionState,historyView,bindCollections} from './queries.mjs';
import {management} from './management.mjs';
import {releases} from './releases.mjs';
import {integrateReleaseCatalog,initialReleases,demoDigest} from './release-data.mjs';
import {storyWorkspace} from './story-workspace.mjs';
import {createWorkspacePages} from './workspace-pages.mjs';
import {spinner,failureIcon,isFailure} from './feedback.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const STORE='sdlc-experience-prototype-v2';
const names={system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'};
const plurals={system:'Sistemas',project:'Projetos',epic:'Épicos',story:'Histórias',task:'Tarefas'};
const next={system:'project',project:'epic',epic:'story',story:'task'};
const label=value=>value==='todo'?'TO DO':String(value||'').replaceAll('_',' ').toUpperCase();
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'Não registrado';
const badge=(value,tone='neutral')=>`<span class="badge ${isFailure(value)?'danger':tone}">${isFailure(value)?failureIcon():''}${esc(label(value))}</span>`;
const entities=structuredClone(prototypeEntities);
let memory;try{memory=JSON.parse(sessionStorage.getItem(STORE)||'{}');}catch{memory={};}
memory.stories??={};memory.returnQueries??={};memory.queryPreview??={};memory.history??=[];memory.repositories??=structuredClone(prototypeRepositories);memory.repositoryLinks??={};
if(Array.isArray(memory.entityRecords))entities.splice(0,entities.length,...memory.entityRecords);
integrateReleaseCatalog(entities);
entities.forEach((item,index)=>{item.createdAt??=new Date(Date.UTC(2026,9,23)-index*3600000).toISOString();item.updatedAt??=item.createdAt;item.archived??=false;item.version??=1;item.participants??=['admin','ana'];});
const seed=structuredClone(entities);
const save=()=>{try{memory.entityRecords=structuredClone(entities);sessionStorage.setItem(STORE,JSON.stringify(memory));}catch{}};
let persona=memory.persona||'',previousPath='',previousHash='';
const canPlan=()=>['admin','ana','bruno'].includes(persona);
const canApprove=()=>['admin','ana'].includes(persona);
const canRelease=()=>['admin','ana','bruno','elisa'].includes(persona);
const byId=id=>entities.find(item=>item.id===id);
const chain=item=>{const result=[];let current=item;while(current){result.unshift(current);current=byId(current.parentId);}return result;};
const readonly=item=>Boolean(item&&chain(item).some(value=>value.archived));
const routeFor=(item,tab='overview')=>item?`#/${item.kind}/${item.id}/${tab}`:'#/systems';
const parseRoute=()=>{const [path,query='']=(location.hash.slice(1)||'/overview').split('?');const parts=path.split('/').filter(Boolean).map(value=>decodeURIComponent(value));return {section:parts[0]||'overview',id:parts[1],tab:parts[2]||'overview',taskId:parts[2]==='task'?parts[3]:undefined,taskTab:parts[4]||'overview',attemptId:parts[5],query:new URLSearchParams(query),path};};
const announce=message=>{$('#live-announcement').textContent=message;};
const header=(eyebrow,title,text)=>`<header class="page-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(title)}</h1><p class="page-description">${esc(text)}</p></div></header>`;
const notice=message=>`<p class="notice" role="status">${esc(message)}</p>`;
function feedback(message){memory.notice=message;save();const target=$('#prototype-feedback');if(target){target.textContent=message;target.hidden=false;}announce(message);}
function appendEvent(item,type,message,result='RECORDED'){
  memory.history.push({id:`LOCAL-${crypto.randomUUID()}`,timestamp:new Date().toISOString(),actor:persona==='ana'?'Ana':persona==='bruno'?'Bruno':'Admin',actorType:'human',type,message,entityId:item.id,entityName:item.name,result,revision:`v${item.version||1}`,correlationId:'local-prototype'});save();
}
function tabs(item,entries,current){
  const query=location.hash.split('?')[1]||'';
  return `<nav class="tab-nav" aria-label="Seções de ${names[item.kind]}">${entries.map(([key,title])=>`<a href="${routeFor(item,key)}${query?'?'+query:''}" ${key===current?'aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
}
function seedReleases(){
  memory.releases??=initialReleases();
  if(memory.releases.experienceSeed)return;
  const stages=['qa_checks','hml_pending','production','qa_passed','rejected'];
  for(let n=1;n<=31;n++)memory.releases.items.push({id:`release-example-${n}`,systemId:n%5===0?'system-pedidos':'system-atendimento',label:`R${String(n+10).padStart(2,'0')}`,name:`Entrega planejada ${String(n).padStart(2,'0')}`,version:`1.${n}.0`,digest:demoDigest(n+300),stage:stages[n%stages.length],scenario:'ten',stories:[],base:'release-stable',parent:null,createdAt:new Date(Date.UTC(2026,9,24)-n*86400000).toISOString(),history:[{time:'24/10/2026 · simulação',title:'Composição de exemplo registrada',description:'Pacote fictício para explorar listas com muitas releases.'}]});
  memory.releases.experienceSeed=true;save();
}
seedReleases();

function scopedHistory(item){return [...simulationHistory,...memory.history].filter(event=>!item||event.entityId===item.id||chain(byId(event.entityId)).some(parent=>parent.id===item.id));}
function allEvents(){return [...simulationHistory,...memory.history,...entities.filter(item=>item.kind==='story'&&!item.archived).flatMap(item=>storyWork.history?.(item)||[])];}
function queryRows(parent){
  const rows=entities.filter(item=>parent?item.parentId===parent.id:item.kind==='system');
  const kind=parent?next[parent.kind]:'system',id=parent?`children-${parent.id}`:'systems';
  if(!kind)return '';
  const fixedArchive=readonly(parent),defaultSort=kind==='system'?'name':'createdAt';
  const statuses={system:['active','inactive'],project:['awaiting_approval','approved'],epic:['todo','approved','doing','done'],story:['specification','approved','coding','code_review','security_scan','testing','uat','production','completed'],task:['todo','doing','done']}[kind];
  const filters=[{key:'q',type:'search',label:'Buscar por nome ou chave'},{key:'status',type:'select',label:kind==='project'?'Aprovação':'Status',options:[{value:'',label:'Todos os status'},...statuses.map(value=>({value,label:label(value)}))]}];
  if(kind==='project')filters.push({key:'lifecycle',type:'select',label:'Ciclo do Projeto',options:[{value:'',label:'Todos os ciclos'},...['planned','active','completed','cancelled'].map(value=>({value,label:label(value)}))]});
  if(!fixedArchive)filters.push({key:'include',type:'checkbox',label:kind==='system'?'Mostrar sistemas inativos e arquivados':kind==='project'?'Mostrar projetos inativos e arquivados':'Incluir itens arquivados',default:'0'});
  const inactive=row=>row.archived||kind==='system'&&row.status==='inactive'||kind==='project'&&['completed','cancelled'].includes(row.lifecycle||row.projectLifecycle);
  const columns=[
    {key:'name',label:'Nome e chave',value:row=>`${row.name} ${row.key}`,render:row=>`<a class="item-link" href="${routeFor(row)}"><small>${esc(row.key)}</small><strong>${esc(row.name)}</strong><span aria-hidden="true">→</span></a>${row.archived?badge('ARCHIVED'):''}`},
    {key:'status',label:kind==='project'?'Aprovação':'Status',value:row=>row.kind==='story'&&!row.archived?storyWork.status(row).status:row.status,render:row=>badge(row.kind==='story'&&!row.archived?storyWork.status(row).status:row.status)},
    ...(kind==='project'?[{key:'lifecycle',label:'Ciclo do Projeto',value:row=>row.lifecycle||row.projectLifecycle||'planned',render:row=>badge(row.lifecycle||row.projectLifecycle||'planned')}]:[]),
    {key:'createdAt',label:'Criado em',value:row=>row.createdAt,render:row=>date(row.createdAt)},
    {key:'updatedAt',label:'Atualizado',value:row=>row.updatedAt,render:row=>date(row.updatedAt)}
  ];
  const state=collectionState(id,{include:'0'}),extraCount=rows.filter(inactive).length;
  const info=!fixedArchive&&['system','project'].includes(kind)?`<p class="query-scope-message" role="status">Escopo: ${kind==='system'?'Sistemas':`Projetos de ${esc(parent.name)}`}. ${extraCount?`${extraCount} inativos ou arquivados disponíveis.`:`Não há ${kind==='system'?'Sistemas INACTIVE':'Projetos concluídos ou cancelados'} nem arquivados para acrescentar.`}${state.include==='1'&&extraCount===0?' O filtro está aplicado; a lista permanece igual.':''}</p>`:'';
  const preview=memory.queryPreview[parseRoute().path]||'ready';
  if(preview==='loading')return info+`<section class="card query-state" role="status" aria-busy="true"><h2 class="ui-busy">${spinner()}Consultando registros…</h2><p>Carregamento simulado. Nenhuma requisição foi enviada.</p><button class="button secondary" data-root-action="restore-query">Concluir carregamento simulado</button></section>`;
  if(preview==='failure')return info+`<section class="card query-state ui-error" role="alert"><h2>${failureIcon()}Não foi possível consultar os registros</h2><p>O recorte e a ordenação foram preservados.</p><button class="button primary" data-root-action="restore-query">Tentar novamente · simulação</button></section>`;
  const limited=preview==='empty'?[]:preview==='partial'?rows.slice(0,30):rows;
  return info+(preview==='partial'?'<p class="notice warning" role="status">Amostra parcial simulada. As contagens abaixo se referem apenas à amostra. <button class="button quiet small" data-root-action="restore-query">Consultar conjunto completo</button></p>':'')+collection({id,title:plurals[kind],description:fixedArchive?'Acervo somente leitura, incluindo os descendentes arquivados.':`Consulte ${plurals[kind].toLowerCase()} neste contexto. Datas no horário de Brasília.`,rows:limited,columns,filters,defaults:{sort:defaultSort,dir:kind==='system'?'asc':'desc',include:fixedArchive?'1':'0'},matches:(row,state)=>{
    if(!fixedArchive&&!['1','true'].includes(state.include)&&inactive(row))return false;
    const status=row.kind==='story'&&!row.archived?storyWork.status(row).status:row.status;
    return (!state.status||status===state.status)&&(!state.lifecycle||(row.lifecycle||row.projectLifecycle||'planned')===state.lifecycle);
  },empty:preview==='empty'?'Nenhum registro cadastrado neste exemplo de vazio.':'Nenhum registro corresponde aos critérios aplicados.'});
}

function repositoryPage(item){
  const system=chain(item).find(value=>value.kind==='system'),all=memory.repositories.filter(repo=>repo.systemId===system?.id);
  const selected=memory.repositoryLinks[item.id]||all.slice(0,item.kind==='system'?all.length:1).map(repo=>repo.id);
  const rows=all.filter(repo=>item.kind==='system'||selected.includes(repo.id));
  return `<section class="card"><div class="section-heading"><div><h2>${item.kind==='system'?'Repositórios do Sistema':'Repositórios envolvidos'}</h2><p>Código e ambientes pertencem ao Sistema e são compartilhados entre Projetos.</p></div></div><div class="repository-grid">${rows.map(repo=>`<article class="repository-card"><h3>${esc(repo.name)}</h3><p>${badge(repo.state)} <small>${esc(repo.runtime)}</small></p><p><code>${esc(repo.path)}</code></p><a href="#/evidence/repository?repo=${repo.id}">Consultar repositório simulado →</a>${!readonly(item)&&repo.state!=='READY'?'<button class="button secondary small" data-root-action="retry-repo">Tentar provisionar · simulação</button>':''}</article>`).join('')||'<p>Nenhum repositório associado.</p>'}</div>${readonly(item)?'':`<details class="prototype-inline-form"><summary>Gerenciar componentes · simulação</summary><form data-root-form="repository" data-item-id="${item.id}" class="prototype-form"><label>Nome<input name="name" required maxlength="120"></label><label>Chave<input name="key" required maxlength="12"></label><label>Operação<select name="mode"><option value="create">Criar repositório</option><option value="link">Vincular existente</option></select></label><label>Runtime<select name="runtime"><option>Node.js</option><option>Python</option></select></label><p>O cadastro altera somente os dados fictícios desta aba.</p><button class="button primary" ${canPlan()?'':'disabled'}>Confirmar componente simulado</button></form><form data-root-form="repository-links" data-item-id="${item.id}"><fieldset><legend>Escopo de componentes deste trabalho</legend>${all.map(repo=>`<label class="checkline"><input type="checkbox" name="repository" value="${repo.id}" ${selected.includes(repo.id)?'checked':''}>${esc(repo.name)}</label>`).join('')}</fieldset><button class="button secondary" ${canPlan()?'':'disabled'}>Salvar associação simulada</button></form></details>`}</section>`;
}
function environmentsPage(item){return `<section class="card"><h2>Ambientes do Sistema</h2><p>Versão e situação por componente, com dados fictícios.</p><div class="environment-grid">${['QA','HML','PRD'].map((env,index)=>`<article class="environment"><strong>${env==='HML'?'HML · Homologação':env==='PRD'?'PRD · Produção':'QA · Testes'}</strong>${badge(index===0?'READY':'NOT DEPLOYED')}<p>${index===0?'Portal de atendimento · 1.4.0-rc.2':'Nenhuma implantação no exemplo deste componente.'}</p><a href="#/releases/${item.id}">Consultar releases relacionadas →</a></article>`).join('')}</div></section>`;}
function planningPage(item){const system=chain(item).find(value=>value.kind==='system');return `<section class="card"><h2>Planejamento com a assistente</h2><p>A entrevista e as propostas ficam no menu Assistente, com o Sistema e o Projeto de destino visíveis.</p><a class="button secondary" href="#/assistant?system=${system.id}${item.kind==='project'?`&project=${item.id}`:''}">Abrir Assistente neste contexto →</a></section>${item.kind==='project'?`<section class="card"><h2>Ciclo do Projeto</h2><p>Aprovação: ${badge(item.status)} · Ciclo: ${badge(item.lifecycle||item.projectLifecycle||'planned')}</p><ol class="project-cycle">${['planned','active','completed','cancelled'].map(value=>`<li ${value===(item.lifecycle||item.projectLifecycle)?'aria-current="step"':''}>${label(value)}</li>`).join('')}</ol><p>Concluir preserva os repositórios do Sistema. Reabertura exige justificativa.</p>${readonly(item)?'':`<a class="button secondary" href="#/manage/state/${item.id}">Alterar ciclo do Projeto · simulação</a>`}</section>`:''}`;}
function settingsPage(item){return `<section class="card"><h2>Configurações de ${names[item.kind]}</h2>${readonly(item)?'<p>Registro arquivado. Consulta somente leitura.</p>':`<p>Editar, aprovar e criar estão na área de interação superior.</p>${item.kind==='system'?`<h3>Situação do Sistema</h3><p>${badge(item.status)} · Mudança reversível, independente de arquivamento.</p>`:''}<details><summary>Arquivamento</summary><p>Arquivar preserva os registros e seus descendentes para consulta histórica.</p><a class="button secondary" href="#/manage/archive/${item.id}">Revisar arquivamento</a></details>`}</section>`;}
function entityPage(item,tab){
  const entries=[['overview',next[item.kind]?plurals[next[item.kind]]:'Resumo'],...(['system','project'].includes(item.kind)?[['planning','Planejamento']]:[]),...(['system','project','task'].includes(item.kind)?[['components','Componentes']]:[]),...(item.kind==='system'?[['environments','Ambientes']]:[]),['activity','Atividade'],['manage','Configurações']];
  if(!entries.some(value=>value[0]===tab))tab='overview';
  const body=tab==='activity'?historyView({id:`history-${item.id}`,events:scopedHistory(item)}):tab==='components'?repositoryPage(item):tab==='environments'?environmentsPage(item):tab==='planning'?readonly(item)?'<section class="card"><h2>Planejamento preservado</h2><p>O acervo mantém a descrição e os registros históricos.</p></section>':planningPage(item):tab==='manage'?settingsPage(item):queryRows(item)+`<section class="card context-summary"><h2>Contexto</h2><p>${esc(item.description)}</p>${item.kind==='project'?`<p>Aprovação ${badge(item.status)} · Ciclo ${badge(item.lifecycle||item.projectLifecycle||'planned')}</p>`:''}</section>`;
  return header(`${names[item.kind]} · ${item.key}`,item.name,item.description)+`<div class="entity-status">${badge(item.status)}${item.archived?badge('ARCHIVED'):''}${item.kind==='project'?badge(item.lifecycle||item.projectLifecycle||'planned'):''}</div>`+tabs(item,entries,tab)+body;
}
function rootWorkflow(item,route){
  const bar=$('#workflow-actions');bar.hidden=false;
  if(item&&readonly(item)){bar.innerHTML='<p class="archive-notice" role="status">'+badge('ARCHIVED')+' Registro arquivado. Consulta somente leitura; status e histórico preservados.</p>';return;}
  const title=item?`${names[item.kind]} · ${label(item.status)}`:'Sistemas';
  const actions=[];
  if(item&&['project','epic'].includes(item.kind)&&['awaiting_approval','todo'].includes(item.status))actions.push(`<a class="button primary" data-plan-command="approve" href="#/manage/approve/${item.id}">Aprovar ${names[item.kind].toLowerCase()}</a>`);
  if(item?.kind==='system'&&route.tab==='manage')actions.push(`<button class="button secondary" data-root-action="toggle-system" data-item-id="${item.id}" ${canPlan()?'':'disabled'}>${item.status==='active'?'Inativar · INACTIVE':'Reativar · ACTIVE'}</button>`);
  if(item)actions.push(`<a class="button secondary" data-plan-command="edit" href="#/manage/edit/${item.id}">Editar</a>`);
  if(!item||next[item.kind])actions.push(`<a class="button ${actions.some(value=>value.includes('primary'))?'secondary':'primary'}" data-plan-command="create" href="#/manage/create/${item?.id||'root'}">Criar ${item?names[next[item.kind]].toLowerCase():'Sistema'}</a>`);
  bar.innerHTML=`<div class="workflow-copy"><strong>${esc(title)}</strong><p>${item?'Aprofunde pela lista ou pelas abas deste contexto.':'Escolha um Sistema para consultar seus Projetos e entregas.'}</p></div><div class="workflow-controls">${actions.join('')}</div>`;
}
function eventPage(route){const event=allEvents().find(value=>value.id===route.id);if(!event)return header('RASTREABILIDADE','Ocorrência indisponível','O evento não está presente neste cenário simulado.');const raw=route.query.get('returnTo'),back=raw?.startsWith('#/')?raw:'#/system/system-atendimento/activity';return header('HISTÓRICO · SIMULAÇÃO',event.message||event.title,'Uma ocorrência preservada, com contexto e correlação.')+`<p><a class="button secondary" href="${esc(back)}">← Voltar à consulta</a></p><section class="card"><h2>O que aconteceu</h2><dl class="evidence-grid"><div><dt>Quando</dt><dd>${date(event.timestamp)}</dd></div><div><dt>Quem</dt><dd>${esc(event.actor||'Não registrado')} · ${esc(event.actorType||'Não registrado')}</dd></div><div><dt>Resultado</dt><dd>${badge(event.result||'RECORDED')}</dd></div><div><dt>Entidade</dt><dd>${byId(event.entityId)?`<a href="${routeFor(byId(event.entityId))}">${esc(event.entityName)}</a>`:esc(event.entityName||'Não registrado')}</dd></div></dl><p>${esc(event.message)}</p><details><summary>Detalhes técnicos da ocorrência</summary><dl><dt>ID</dt><dd><code>${esc(event.id)}</code></dd><dt>Correlação</dt><dd><code>${esc(event.correlationId||'Não registrado')}</code></dd><dt>Revisão</dt><dd>${esc(event.revision||'Não registrada')}</dd><dt>Commit</dt><dd><code>${esc(event.sha||'Não registrado')}</code></dd></dl></details></section>`;}
function coveragePage(){return header('REFERÊNCIA DA REVISÃO','Cobertura e preservação','Origem no portal real, apresentação na nova prévia e limites da simulação.')+notice('Este protótipo demonstra a experiência proposta. Não comprova execução real de agentes, verificações ou deploys.')+collection({id:'coverage',title:'Mapa das funcionalidades',rows:prototypeCoverage,columns:[{key:'area',label:'Área'},{key:'name',label:'Capacidade',render:row=>`<a href="${row.href}">${esc(row.name)} →</a>`},{key:'source',label:'Referência no produto',render:row=>`<code>${esc(row.source)}</code>`},{key:'coverage',label:'Representação'}],defaults:{sort:'area',dir:'asc'}});}
function guidePage(){return header('ROTEIRO DA REVISÃO','Explore a próxima experiência','O portal real é a referência; os novos comportamentos usam dados fictícios.')+`<section class="card"><h2>Roteiro sugerido</h2><ol><li>Selecione uma persona no topo para explorar ações locais.</li><li>Em Sistemas, pesquise, ordene, navegue para a página 2 e volte ao mesmo recorte.</li><li>Abra Atendimento ao Cliente, inclua Projetos inativos e consulte o acervo.</li><li>Na aba Atividade, encontre EVT-101, filtre por ator e consulte a correlação.</li><li>Use o Assistente para revisar uma proposta e confirmar a criação simulada.</li><li>Na História, acompanhe G1 → codificação → revisão → scan e consulte Tarefas e tentativas.</li><li>Em Releases, crie DRAFT vazio, escolha Histórias e consulte composição/ramificações. Mudanças em HML exigem outra candidata.</li><li>Compare os nove assuntos do dashboard e a página Integrações.</li></ol><p><a href="#/coverage">Consultar o mapa de preservação →</a></p></section>`;}
function evidencePage(route){return header('EVIDÊNCIA SIMULADA','Consulta de evidência','Este endereço permanece dentro do protótipo.')+`<section class="card"><h2>${route.id==='repository'?'Repositório de exemplo':'Proposta de código e controles'}</h2><p>GitLab, credenciais, arquivos de aplicação, pipelines e pacotes reais não são acessados por esta prévia.</p><p>Revise a identidade da ocorrência e a revisão vinculada no histórico.</p><a class="button secondary" href="#/story/story-consulta/delivery">Voltar à entrega da História</a></section>`;}

let contextObserver;
function render(moveFocus=true){
  const route=parseRoute(),path=route.path,changed=previousPath!==path;
  if(previousHash&&changed)memory.returnQueries[previousPath]=previousHash;
  previousPath=path;previousHash=location.hash;
  const item=byId(route.id),story=route.section==='story'?item:route.section==='task'?byId(item?.parentId):null;
  const workspaceRoute=route.section==='task'&&story?{...route,section:'story',id:story.id,tab:'task',taskId:item.id,taskTab:route.tab}:route;
  const workStory=story?.kind==='story'&&!readonly(story)?story:null;
  document.body.classList.toggle('sw-page',Boolean(workStory));$('.context-bar').classList.toggle('sw-context',Boolean(workStory));
  const selectedTask=workStory&&workspaceRoute.taskId?storyWork.task(workStory,workspaceRoute.taskId):null;
  const displayItem=selectedTask?{...selectedTask,kind:'task',key:selectedTask.key||'TAREFA',parentId:workStory.id}:item;
  const releaseRoute=releaseExplorer.isRoute(route),system=chain(displayItem).find(value=>value.kind==='system');
  const global=releaseRoute?'releases':['overview','assistant','integrations'].includes(route.section)?route.section:'systems';
  document.querySelectorAll('[data-global-nav]').forEach(link=>{const active=link.dataset.globalNav===global;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  $('#local-nav').innerHTML=displayItem?`<p class="nav-section-label">NESTE CONTEXTO</p>${chain(displayItem).filter(value=>['system','project'].includes(value.kind)).map(value=>`<a href="${routeFor(value)}">${esc(value.name)}</a>`).join('')}<p class="context-name">Você está em ${names[displayItem.kind]}</p>${system?`<a href="#/releases/${system.id}">Releases relacionadas →</a>`:''}`:'';
  $('#breadcrumbs').innerHTML=['overview','assistant','integrations'].includes(route.section)?`<span aria-current="page">${{overview:'Visão geral',assistant:'Assistente',integrations:'Integrações'}[route.section]}</span>`:`<a href="${esc(memory.returnQueries['/systems']||'#/systems')}">Sistemas</a>${displayItem?chain(displayItem).map(value=>`<span aria-hidden="true">›</span>${value.id===displayItem.id?`<span aria-current="page">${names[value.kind]}: ${esc(value.name)}</span>`:`<a href="${esc(memory.returnQueries[`/${value.kind}/${value.id}/overview`]||routeFor(value))}">${names[value.kind]}: ${esc(value.name)}</a>`}`).join(''):''}`;
  $('#workflow-actions').innerHTML='';$('#workflow-actions').hidden=true;
  $('#persona-warning').hidden=Boolean(persona)||readonly(displayItem)||['overview','integrations','coverage','guide'].includes(route.section);
  $('#prototype-feedback').textContent=memory.notice||'';$('#prototype-feedback').hidden=!memory.notice;
  $('#scenario-toolbar').hidden=!(route.section==='systems'||displayItem&&!workStory&&!readonly(displayItem)&&route.tab==='overview');
  $('#query-scenario').value=memory.queryPreview[path]||'ready';
  let html;
  if(route.section==='overview')html=workspace.dashboard(route);
  else if(route.section==='assistant')html=workspace.assistant(route);
  else if(route.section==='integrations')html=workspace.integrations(route);
  else if(route.section==='systems'){html=header('SEU ESPAÇO DE ENTREGA','Sistemas','Do macro ao micro: Sistema → Projeto → Épico → História → Tarefa.')+queryRows(null);rootWorkflow(null,route);}
  else if(route.section==='manage')html=manager.page();
  else if(route.section==='event')html=eventPage(route);
  else if(route.section==='coverage')html=coveragePage();
  else if(route.section==='guide')html=guidePage();
  else if(route.section==='evidence')html=evidencePage(route);
  else if(releaseRoute)html=releaseExplorer.page(route);
  else if(workStory)html=storyWork.render(workStory,workspaceRoute);
  else if(item&&item.kind===route.section){html=entityPage(item,route.tab);rootWorkflow(item,route);}
  else html=header('NAVEGAÇÃO','Item indisponível nesta prévia','Use o menu Sistemas para retomar a consulta.')+'<a class="button secondary" href="#/systems">Voltar a Sistemas</a>';
  $('#main-content').innerHTML=html;
  if(route.section==='manage'){
    manager.enhance(null);
    const formActions=$('#management-form .form-actions');
    if(formActions){formActions.querySelectorAll('button').forEach(button=>{button.setAttribute('form','management-form');button.type='submit';});$('#workflow-actions').append(formActions);$('#workflow-actions').hidden=false;}
  }
  if(workStory){$('#workflow-actions').innerHTML=storyWork.header(workStory,workspaceRoute);$('#workflow-actions').hidden=false;storyWork.mount(workStory,workspaceRoute);}
  if(releaseRoute||workStory)releaseExplorer.mount(item,route);
  document.querySelectorAll('[data-release-action]').forEach(button=>{if(!canRelease()&&!['inspect-story','close-inspector','view-history'].includes(button.dataset.releaseAction))button.disabled=true;});
  document.querySelectorAll('[form="release-create-form"],[form="release-planning-form"],[form="story-release-form"]').forEach(button=>{if(!canRelease())button.disabled=true;});
  workspace.mount(route);
  document.querySelectorAll('[data-plan-command]').forEach(link=>{const permitted=link.dataset.planCommand==='approve'?canApprove():canPlan();if(!permitted)link.setAttribute('aria-disabled','true');});
  contextObserver?.disconnect();const context=$('.context-bar');const size=()=>document.body.style.setProperty('--sw-sticky-offset',`${Math.ceil(context.getBoundingClientRect().height)+14}px`);size();contextObserver=new ResizeObserver(size);contextObserver.observe(context);
  document.body.dataset.view=route.section;document.title=`${displayItem?.name||{overview:'Visão geral',assistant:'Assistente',releases:'Releases',integrations:'Integrações'}[global]||'Sistemas'} · Nova experiência SDLC · Protótipo`;
  save();if(moveFocus&&changed){$('#main-content h1')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}

document.addEventListener('click',event=>{
  const releaseAction=event.target.closest('[data-release-action]');
  if(releaseAction&&!canRelease()&&!['inspect-story','close-inspector','view-history'].includes(releaseAction.dataset.releaseAction)){event.preventDefault();event.stopImmediatePropagation();feedback('Selecione uma persona de planejamento ou operações para alterar releases na simulação.');return;}
  if(event.target.closest('[aria-disabled="true"]')){event.preventDefault();event.stopImmediatePropagation();feedback('Selecione uma persona autorizada para executar esta ação na simulação.');return;}
  const action=event.target.closest('[data-root-action]');if(!action)return;
  if(action.dataset.rootAction==='restore-query'){memory.queryPreview[parseRoute().path]='ready';save();render(false);announce('Consulta simulada recuperada; filtros preservados.');}
  if(action.dataset.rootAction==='toggle-system'&&canPlan()){const item=byId(action.dataset.itemId);item.status=item.status==='active'?'inactive':'active';item.version++;appendEvent(item,'STATUS_CHANGED',`Sistema alterado para ${label(item.status)} na simulação.`);render(false);feedback('Situação atualizada somente na simulação.');}
  if(action.dataset.rootAction==='retry-repo')feedback('Nova consulta de integração simulada; nenhum serviço foi acionado.');
},true);
document.addEventListener('submit',event=>{
  if(event.target.id==='management-form'){
    const mode=event.target.dataset.mode,allowed=mode==='approve'?canApprove():canPlan();
    if(!allowed){event.preventDefault();event.stopImmediatePropagation();feedback('Esta persona pode consultar. Selecione uma persona de planejamento para confirmar.');}
    const target=byId(parseRoute().tab);
    if(target&&(readonly(target)||mode==='create'&&chain(target).some(value=>value.kind==='project'&&['completed','cancelled'].includes(value.lifecycle)))){event.preventDefault();event.stopImmediatePropagation();feedback('Este contexto está arquivado ou encerrado. Reabra o Projeto antes de incluir trabalho.');}
    return;
  }
  if(['release-create-form','release-planning-form','story-release-form'].includes(event.target.id)&&!canRelease()){event.preventDefault();event.stopImmediatePropagation();feedback('Selecione uma persona de planejamento ou operações para confirmar.');return;}
  if(!event.target.dataset.rootForm)return;event.preventDefault();if(!canPlan())return feedback('Selecione uma persona de planejamento.');
  const item=byId(event.target.dataset.itemId);if(readonly(item))return;const form=new FormData(event.target);
  if(event.target.dataset.rootForm==='repository'){
    const system=chain(item).find(value=>value.kind==='system');const repo={id:`repo-${crypto.randomUUID()}`,systemId:system.id,name:String(form.get('name')),key:String(form.get('key')),runtime:String(form.get('runtime')),state:form.get('mode')==='link'?'READY':'PENDING',path:`sdlc/exemplo/${String(form.get('key')).toLowerCase()}`};memory.repositories.push(repo);appendEvent(item,'REPOSITORY_LINKED','Componente cadastrado na memória da simulação.');
  }else memory.repositoryLinks[item.id]=form.getAll('repository');
  save();render(false);feedback('Componentes atualizados somente nesta aba da simulação.');
},true);
$('#persona-select').value=persona;
$('#persona-select').addEventListener('change',event=>{persona=event.target.value;memory.persona=persona;save();render(false);announce('Persona simulada alterada.');});
$('#query-scenario').addEventListener('change',event=>{memory.queryPreview[parseRoute().path]=event.target.value;save();render(false);announce('Estado de consulta simulado selecionado.');});
$('#reset-demo').addEventListener('click',()=>{
  entities.splice(0,entities.length,...structuredClone(seed));storyWork.reset();workspace.reset();memory={stories:{},persona,returnQueries:{},queryPreview:{},history:[],repositories:structuredClone(prototypeRepositories),repositoryLinks:{}};seedReleases();save();render(false);feedback('A exploração foi reiniciada. Dados do portal real não foram acessados.');
});
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main-content').focus();});
const manager=management({entities,getMemory:()=>memory,save,render,esc,routeFor});
const releaseExplorer=releases({entities,getMemory:()=>memory,save,render,esc,routeFor});
const storyWork=storyWorkspace({entities,esc,storyTasks:story=>entities.filter(item=>item.parentId===story.id&&item.kind==='task'&&!item.archived),render:()=>render(false),routeFor,releasePanel:item=>releaseExplorer.storyPanel(item),persona:()=>persona});
const workspace=createWorkspacePages({entities,esc,routeFor,getMemory:()=>memory,save,render,announce,persona:()=>persona});
bindCollections({render:()=>render(true),announce});
if(!location.hash)location.hash='/overview';else render();
