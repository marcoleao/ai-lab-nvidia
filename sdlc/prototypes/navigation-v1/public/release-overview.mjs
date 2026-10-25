import {collection, collectionState, queryLink} from './queries.mjs';
import {releaseStages} from './release-data.mjs';

// Consulta local da simulação. A etapa do processo e o ambiente atual são distintos.
export function releaseOverview({entities, state, planner, system, header, disclaimer, environmentMap, lineageExample, esc, href, routeFor, save, render}) {
  const $ = selector => document.querySelector(selector);
  const pageSize = 20;
  const stages = [
    {id: 'draft', label: 'Em composição', status: 'DRAFT', description: 'Abertas para escolher Histórias', caption: 'Planejar a entrega'},
    {id: 'qa', label: 'QA', status: 'QA', description: 'Verificações e autorização G2', caption: 'Validar o pacote'},
    {id: 'hml', label: 'Homologação', status: 'UAT', description: 'Aceite do negócio e autorização G3', caption: 'Homologar a entrega'},
    {id: 'production', label: 'Produção', status: 'PRODUCTION', description: 'Pacotes promovidos para produção', caption: 'Consultar a entrega'},
  ];

  const group = item => item.stage === 'draft' ? 'draft'
    : ['qa_checks', 'qa_passed', 'qa_approved'].includes(item.stage) ? 'qa'
      : ['hml_pending', 'hml_passed', 'production_approved'].includes(item.stage) ? 'hml'
        : item.stage === 'production' ? 'production'
          : item.stage === 'rejected' ? 'rejected' : '';
  const timestamp = item => typeof item.createdAt === 'string' && item.createdAt.trim() && Number.isFinite(Date.parse(item.createdAt)) ? Date.parse(item.createdAt) : null;
  const dateLabel = item => timestamp(item) === null ? 'Data não registrada' : new Intl.DateTimeFormat('pt-BR', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo'}).format(new Date(timestamp(item)));
  const stageLabel = id => stages.find(item => item.id === id)?.label || (id === 'rejected' ? 'Rejeitadas' : id === 'closed' ? 'Pacotes fechados' : 'Todas as releases');
  const badge = (label, tone = 'neutral') => `<span class="badge ${tone}">${esc(label)}</span>`;
  function missing() {
    return header('RELEASES', 'Sistema não disponível', 'Escolha um Sistema disponível na central de Releases.') + '<a class="button secondary" href="#/releases">Voltar às Releases</a>';
  }
  function process(item) {
    const currentGroup = group(item), current = currentGroup === 'rejected' ? 2 : stages.findIndex(entry => entry.id === currentGroup);
    const labels = ['Composição', 'QA', 'HML', 'PRD'];
    return `<ol class="release-overview-mini-process" aria-label="Etapa: ${esc(stageLabel(currentGroup))}">${labels.map((label, index) => `<li class="${index < current ? 'passed' : index === current ? currentGroup === 'rejected' ? 'rejected' : 'current' : ''}" ${index === current ? 'aria-current="step"' : ''}><span aria-hidden="true">${index < current ? '✓' : index === current && currentGroup === 'rejected' ? '!' : index + 1}</span><small>${label}</small></li>`).join('')}</ol>`;
  }
  function card(item) {
    const draft = item.stage === 'draft', status = draft ? {label: 'DRAFT', tone: 'info'} : releaseStages[item.stage] || {label: String(item.stage).toUpperCase().replaceAll('_', ' '), tone: 'neutral'};
    const members = draft ? planner.members(item) : item.stories ?? [];
    const environment = state().environments?.[item.systemId] ?? {};
    const production = item.stage === 'production' ? environment.prd === item.id ? 'current' : 'history' : '';
    const location = production ? badge(production === 'current' ? 'Atual em PRD' : 'Histórico de produção', production === 'current' ? 'success' : 'neutral')
      : item.stage === 'rejected' && environment.hml === item.id ? badge('Presente em HML · bloqueada', 'danger') : '';
    return `<div class="release-query-summary ${item.stage==='rejected'?'rejected':''}"><a data-testid="release-overview-card" data-release-id="${esc(item.id)}" data-created-at="${esc(item.createdAt||'')}" ${production?`data-release-production="${production}"`:''} href="${draft?href(item,'composition'):href(item)}"><strong>${esc(item.label)} · ${esc(item.name)} →</strong></a><small>${draft?'Composição editável':esc(item.version||'Versão não registrada')} · ${members.length} ${members.length===1?'História':'Histórias'}${draft?' planejadas':''}</small>${location?`<span>${location}</span>`:''}${draft&&!members.length?'<small>Vazia · pode ser composta depois</small>':''}<details><summary>Visualizar jornada</summary>${process(item)}<a href="${draft?href(item,'composition'):href(item)}">${draft?'Compor release':'Acompanhar release'} →</a></details></div>`;
  }
  const queryId = 'releases';
  function page(sysId) {
    if (sysId && !system(sysId)) return missing();
    const sys=system(sysId),active=collectionState(queryId,{stage:'',sort:'createdAt',dir:'desc'});
    const rows=[...(state().plannedDrafts??[]).filter(item=>item.stage==='draft'),...(state().items??[]).filter(item=>item.stage!=='integration')].filter(item=>system(item.systemId)&&(!sys||item.systemId===sys.id));
    const term=String(active.q||'').trim().toLocaleLowerCase('pt-BR');
    const countRows=rows.filter(item=>!term||`${item.label||''} ${item.name||''} ${item.version||''} ${system(item.systemId)?.name||''}`.toLocaleLowerCase('pt-BR').includes(term));
    const count=stage=>countRows.filter(item=>group(item)===stage).length;
    const systems=entities.filter(item=>item.kind==='system'&&!item.archived);
    const stagesHTML=`<section class="card release-overview-stages" aria-labelledby="release-overview-stages-title"><div class="section-heading"><div><p class="eyebrow">DO PLANEJAMENTO À PRODUÇÃO</p><h2 id="release-overview-stages-title">Onde estão as releases?</h2><p>Os totais consideram o Sistema e a busca aplicada. A etapa da release e o pacote atual do ambiente são informações distintas. Os cartões aplicam a etapa imediatamente.</p></div></div><div class="release-overview-stage-grid">${stages.map((stage,index)=>`<button type="button" class="release-overview-stage" data-release-overview-stage="${stage.id}" aria-pressed="${active.stage===stage.id}"><span class="release-overview-stage-top"><span class="release-overview-stage-number" aria-hidden="true">${index+1}</span><span class="release-overview-stage-label">${stage.label}</span></span><strong>${count(stage.id)}</strong><span class="release-overview-stage-description">${stage.description}</span><span class="release-overview-stage-action">Consultar →</span></button>`).join('')}</div><div class="release-overview-shortcuts"><button type="button" data-release-overview-stage="" aria-pressed="${!active.stage}">Todas <strong>${countRows.length}</strong></button><button type="button" class="release-overview-rejected" data-release-overview-stage="rejected" aria-pressed="${active.stage==='rejected'}">Rejeitadas / bloqueadas <strong>${count('rejected')}</strong></button><span>Uma release rejeitada permanece consultável e não avança para produção.</span></div></section>`;
    const scope=sys?`<section class="card"><p><strong>Sistema fixo:</strong> ${esc(sys.name)}</p><p>Limpar filtros preserva este Sistema.</p><a class="direction-link" href="${routeFor(sys)}">Consultar Sistema →</a> · <a href="#/releases">Consultar todos os Sistemas</a></section>`:`<section class="card"><p><strong>Escopo aplicado:</strong> Todos os Sistemas</p><details id="releases-system-disclosure" class="query-filter-disclosure" ${state().systemScopeFiltersOpen?'open':''}><summary>Filtrar por Sistema</summary><form id="releases-system-scope" class="release-filters"><label for="hub-system-filter">Consultar releases de um Sistema<select id="hub-system-filter"><option value="">Todos os Sistemas</option>${systems.map(item=>`<option value="${esc(item.id)}" ${state().systemScopeDraft===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><button type="submit" class="button secondary">Aplicar Sistema</button></form></details></section>`;
    const list=collection({id:queryId,title:stageLabel(active.stage),description:'Coleção simulada, filtrada e ordenada integralmente antes da paginação. 20 releases por página. Horários de Brasília.',rows,pageSize,defaults:{stage:'',sort:'createdAt',dir:'desc'},filters:[{key:'q',label:'Buscar nome, identificador, versão ou Sistema',type:'search'},{key:'stage',label:'Etapa da release',type:'select',options:[{value:'',label:'Todas as releases'},...stages.map(stage=>({value:stage.id,label:stage.label})),{value:'rejected',label:'Rejeitadas / bloqueadas'},{value:'closed',label:'Pacotes fechados'}]}],matches:(item,query)=>!query.stage||(query.stage==='closed'?item.stage!=='draft':group(item)===query.stage),empty:'Nenhuma release neste recorte.',columns:[
      {key:'name',label:'Release e jornada',value:item=>`${item.label||''} ${item.name||''} ${item.version||''}`,render:card},
      {key:'system',label:'Sistema',value:item=>system(item.systemId)?.name||''},
      {key:'stage',label:'Etapa',value:item=>stageLabel(group(item))},
      {key:'createdAt',label:'Criação',value:item=>timestamp(item)??-Number.MAX_VALUE,render:item=>esc(dateLabel(item))},
    ]});
    return header('RELEASES · CENTRAL DE ENTREGAS',sys?`Releases de ${sys.name}`:'Releases','Planeje a composição e consulte a jornada de cada release. Dados e operações deste protótipo são simulados.')+disclaimer()+`<div class="release-hub-overview">${stagesHTML}${scope}${list}<p class="release-overview-order-help">A ordem inicial considera a criação da release. Registros sem data aparecem ao final. “Atual em PRD” identifica o pacote apontado pelo ambiente; os demais preservam o histórico de produção.</p>${sys?environmentMap(sys.id):''}${sys?.id==='system-atendimento'?lineageExample():''}</div>`;
  }
  function mount(route) {
    if(route.section!=='releases')return;
    document.querySelectorAll('[data-release-overview-stage]').forEach(node=>node.addEventListener('click',()=>{location.hash=queryLink(queryId,{stage:node.dataset.releaseOverviewStage,page:1});}));
    document.getElementById('releases-system-disclosure')?.addEventListener('toggle',event=>{state().systemScopeFiltersOpen=event.target.open;save();});
    document.getElementById('hub-system-filter')?.addEventListener('change',event=>{state().systemScopeDraft=event.target.value;save();});
    document.getElementById('releases-system-scope')?.addEventListener('submit',event=>{
      event.preventDefault();const selected=document.getElementById('hub-system-filter').value;
      const query=queryLink(queryId,{page:1}).split('?')[1];
      location.hash=`#/releases${selected?'/'+encodeURIComponent(selected):''}${query?'?'+query:''}`;
    });
  }
  return {page,mount};
}
