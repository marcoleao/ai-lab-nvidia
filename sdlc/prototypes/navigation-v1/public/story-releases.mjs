import {releaseStories, releaseStages} from './release-data.mjs';
import {scenarios} from './data.mjs';
import {collectionState,queryLink} from './queries.mjs';

// Planejamento local: associar uma História não fecha pacotes nem aprova verificações.
export function storyReleases({entities, state, getMemory, save, render, esc, routeFor, prepare}) {
  const byId = id => entities.find(item => item.id === id);
  const lineage = item => {const result=[]; for(let current=item;current;current=byId(current.parentId)) result.unshift(current); return result;};
  const systemFor = item => lineage(item).find(parent => parent.kind === 'system');
  const init = () => {const value=state(); value.plannedDrafts??=[];value.assignments??={};value.nextPlannedId??=1;return value;};
  const drafts = () => init().plannedDrafts;
  const find = id => drafts().find(draft => draft.id === id);
  const link = draft => `#/release/${draft.id}/composition`;
  const badge = (label,tone='neutral') => `<span class="badge ${tone}">${esc(label)}</span>`;
  const catalog = story => releaseStories('sixty').find(item=>item.entityId===story.id);
  const revision = story => catalog(story)?.currentRevision ?? story.currentRevision ?? 1;
  const planned = story => {const assignment=init().assignments[story.id];const draft=assignment&&find(assignment.draftId);return draft&&draft.stage==='draft'&&draft.systemId===systemFor(story)?.id?{...assignment,draft}:null;};
  const closed = story => init().items.filter(item=>item.stage!=='integration'&&item.systemId===systemFor(story)?.id).flatMap(item=>item.stories.filter(member=>member.entityId===story.id).map(member=>({release:item,member})));
  function currentStory(story) {
    const entry=catalog(story), path=lineage(story), rev=revision(story), scenario=getMemory()?.stories?.[story.id]?.scenario??story.initialScenario;
    const ready=scenario?scenario==='releaseReady':entry?.currentReady===true;
    return {...entry,id:entry?.id??story.id,entityId:story.id,key:story.key,name:story.name,revision:rev,currentRevision:rev,
      ready,currentReady:ready,status:scenarios[scenario]?.businessStatus??String(story.status??'specification').replaceAll('_',' ').toUpperCase(),
      reason:ready?'Revisão, segurança e testes individuais aprovados para a revisão atual.':scenario&&scenario!==story.initialScenario?scenarios[scenario]?.title??'Verificações pendentes para a revisão atual.':entry?.currentReason??'A revisão atual ainda precisa concluir revisão, segurança e testes. Planejar não libera implantação.',
      project:path.find(item=>item.kind==='project')?.name??'Projeto',projectId:path.find(item=>item.kind==='project')?.id??'',epic:path.find(item=>item.kind==='epic')?.name??'Épico',epicId:path.find(item=>item.kind==='epic')?.id??'',
      component:entry?.component??'Repositório a definir',dependencies:entry?.dependencies??[],commit:entry?.currentCommit??`pending-r${rev}`,branch:entry?.branch??`story/${story.key.toLowerCase()}`};
  }
  const members = draft => entities.filter(story=>story.kind==='story'&&!lineage(story).some(item=>item.archived)&&planned(story)?.draft.id===draft.id).map(story=>({...currentStory(story),plannedRevision:planned(story).revision}));
  function history(story) {
    const rows=closed(story), sys=systemFor(story), environments=init().environments[sys?.id]??{};
    return `<section class="card" data-testid="story-release-history"><p class="eyebrow">COMPOSIÇÕES PRESERVADAS</p><h2>Participações em releases fechadas</h2><p>São registros de revisões exatas. Alterar o planejamento acima nunca modifica estes pacotes.</p>${rows.length?`<div class="story-release-history">${rows.map(({release:r,member})=>`<a href="${link(r)}"><span><strong>${esc(r.label)} · ${esc(r.name)}</strong><small>${esc(story.key)} · revisão ${member.revision}${member.revision!==revision(story)?` · diferente da revisão atual ${revision(story)}`:' · revisão atual'}</small></span><span>${badge(releaseStages[r.stage]?.label??r.stage)}${Object.entries(environments).filter(([key,id])=>key!=='integration'&&id===r.id).map(([key])=>badge(key==='hml'?'HML':key.toUpperCase(),'info')).join('')}</span><span aria-hidden="true">→</span></a>`).join('')}</div>`:'<p>Esta História ainda não integra nenhuma composição fechada.</p>'}</section>`;
  }
  function storyPanel(story) {
    const sys=systemFor(story), assigned=planned(story), options=drafts().filter(draft=>draft.stage==='draft'&&draft.systemId===sys?.id);
    return `<div data-testid="story-releases"><section class="card story-release-planning"><p class="eyebrow">PLANEJAMENTO DA ENTREGA · REVISÃO ${revision(story)}</p><h2>Escolher uma release existente</h2><p>Associe a revisão atual a um rascunho deste Sistema. Criação, composição, validação e promoções ficam no menu principal Releases.</p><div class="story-release-journey"><a href="${routeFor(story)}"><strong>${esc(story.key)}</strong><small>História · revisão atual ${revision(story)}</small></a><span aria-hidden="true">→</span><div><strong>${assigned?esc(assigned.draft.name):'Sem release planejada'}</strong><small>${assigned?'DRAFT · associação de planejamento':'Escolha um rascunho existente abaixo'}</small></div><span aria-hidden="true">→</span><a href="#/releases/${sys?.id}"><strong>Releases</strong><small>Composição → QA → HML → PRD</small></a></div>${state().planningNotice?.storyId===story.id?`<p class="story-release-notice" role="status">${esc(state().planningNotice.text)}</p>`:''}<form id="story-release-form" data-story-id="${esc(story.id)}"><div class="story-release-fields"><div><label for="story-release-select">Release planejada neste Sistema</label><select id="story-release-select"><option value="">Sem release planejada</option>${options.map(draft=>`<option value="${draft.id}" ${assigned?.draft.id===draft.id?'selected':''}>${esc(draft.label)} · ${esc(draft.name)} · DRAFT</option>`).join('')}</select><small>Somente rascunhos existentes de ${esc(sys?.name??'seu Sistema')}. Releases fechadas aparecem no histórico.</small></div></div>${!options.length?'<p class="release-help">Nenhuma release em rascunho disponível neste Sistema. Acesse Gerenciar releases para criar uma e depois selecione-a aqui.</p>':''}<p id="story-release-error" class="release-dependency-text" role="alert"></p></form>${assigned?`<a class="direction-link" data-testid="planned-release-link" href="${link(assigned.draft)}">Consultar ${esc(assigned.draft.label)} · ${esc(assigned.draft.name)} no menu Releases →</a>`:''}<a class="direction-link story-release-continue" data-testid="manage-system-releases" href="#/releases/${sys?.id}">Gerenciar releases de ${esc(sys?.name)} →</a><a class="direction-link story-release-continue" href="#/story/${story.id}/overview">Continuar História ${esc(story.key)} · especificação e execução →</a><p class="release-help">Salvar altera somente a associação de planejamento da revisão atual. Status, G1, pacotes fechados e aprovações permanecem preservados.</p></section>${history(story)}<p class="release-simulation">Simulação local com as mesmas Histórias da hierarquia. As operações desta página são simuladas e não executam ferramentas, verificações ou implantação.</p></div>`;
  }
  function storySummary(story) {
    const assigned=planned(story), historical=closed(story);
    return `<a class="story-release-summary" href="#/story/${story.id}/releases" title="Consultar e planejar releases desta História">${assigned?`Planejada: ${esc(assigned.draft.name)} · DRAFT`:historical.length?`${historical.length} composição(ões) histórica(s) · planejar revisão ${revision(story)}`:'Definir release planejada'} <span aria-hidden="true">→</span></a>`;
  }
  function scopePanel(item) {
    const sys=systemFor(item), stories=entities.filter(story=>story.kind==='story'&&!story.archived&&lineage(story).some(parent=>parent.id===item.id)), ids=new Set(stories.map(story=>story.id));
    const plans=drafts().filter(draft=>draft.systemId===sys?.id).map(draft=>({draft,count:members(draft).filter(story=>ids.has(story.entityId)).length})).filter(row=>row.count);
    const snapshots=init().items.filter(r=>r.stage!=='integration'&&r.systemId===sys?.id).map(release=>({release,count:release.stories.filter(story=>ids.has(story.entityId)).length})).filter(row=>row.count);
    return `<section class="card scope-release-panel"><div class="section-heading"><div><p class="eyebrow">DO PLANEJAMENTO AOS AMBIENTES</p><h2>Releases relacionadas</h2><p>As Histórias mantêm sua hierarquia. A release reúne revisões de um ou mais Projetos deste Sistema.</p></div></div><div class="scope-release-links">${plans.map(({draft,count})=>`<a href="${link(draft)}"><strong>${esc(draft.label)} · ${esc(draft.name)}</strong><small>${count} História(s) deste ${item.kind==='epic'?'Épico':'Projeto'} · DRAFT</small></a>`).join('')}${snapshots.map(({release:r,count})=>`<a href="${link(r)}"><strong>${esc(r.label)}</strong><small>${count} revisão(ões) deste ${item.kind==='epic'?'Épico':'Projeto'} · composição fechada</small></a>`).join('')}</div>${!plans.length&&!snapshots.length?'<p>Nenhuma release associada às Histórias deste contexto. Abra uma História para planejar sua entrega.</p>':''}<a class="direction-link" href="#/releases/${sys?.id}">Ver releases e ambientes do Sistema →</a></section>`;
  }
  const systems = () => entities.filter(item=>item.kind==='system'&&!item.archived);
  const inScope = (story,sysId) => story.kind==='story'&&systemFor(story)?.id===sysId&&!lineage(story).some(item=>item.archived);
  function createPage(defaultSystemId) {
    const sys=systems().find(item=>item.id===defaultSystemId);
    return `<header class="page-header"><div><p class="eyebrow">RELEASES · NOVO PLANEJAMENTO</p><h1 tabindex="-1">Criar release</h1><p>Defina o Sistema e o nome. Não é necessário escolher nenhuma História para criar o rascunho.</p></div></header><section class="card release-create-card"><form id="release-create-form"><div class="release-form-field"><label for="release-create-system">Sistema</label><select id="release-create-system" required><option value="">Selecione um Sistema</option>${systems().map(item=>`<option value="${item.id}" ${sys?.id===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select><small>Uma release reúne somente Histórias do mesmo Sistema.</small></div><div class="release-form-field"><label for="release-create-name">Nome da release</label><input id="release-create-name" required minlength="3" maxlength="100" autocomplete="off" placeholder="Ex.: Atendimento · próxima entrega"><small>Entre 3 e 100 caracteres.</small></div><p id="release-create-error" class="release-dependency-text" role="alert"></p></form><div class="release-picker-empty-draft" data-testid="empty-release-allowed"><strong>Histórias são opcionais neste momento</strong><p>Uma pessoa pode criar a release e outra escolher as Histórias depois, em Releases → Escolher Histórias ou associando uma release existente na própria História. Criar o rascunho não inicia testes nem implantação.</p></div><p class="release-help">A criação gera apenas um rascunho DRAFT vazio. Ainda não existe pacote, implantação ou aprovação. Tudo é simulado nesta sessão; colaboração entre pessoas não é executada neste protótipo.</p></section>`;
  }
  const createPrimary = () => ({title:'Criar release em rascunho',text:'Somente Sistema e nome são necessários. As Histórias podem ser escolhidas depois.',html:'<button class="button primary" type="submit" form="release-create-form" data-testid="create-release">Criar release</button><a class="button secondary" href="#/releases">Cancelar</a>'});
  const emptyPlanFilters = () => ({view:'all',project:'',epic:'',status:'',readiness:'all',association:'all'});
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function planContext(draft) {
    const memory=init();memory.planEdits??={};memory.planSearch??={};memory.planFilters??={};
    memory.planEdits[draft.id]??=members(draft).map(story=>story.entityId);
    memory.planFilters[draft.id]={...emptyPlanFilters(),...memory.planFilters[draft.id]};
    const filters=collectionState('picker',{...emptyPlanFilters(),sort:'key',dir:'asc'}),query=filters.q||'',selected=memory.planEdits[draft.id];
    const stories=entities.filter(story=>inScope(story,draft.systemId)).map(entity=>{
      const story=currentStory(entity),assignment=planned(entity),snapshots=closed(entity).filter(({member})=>member.revision===story.revision);
      const currentAssignment=assignment?.revision===story.revision?assignment:null;
      return {...story,assignment,currentAssignment,snapshots,unassigned:!currentAssignment&&!snapshots.length};
    });
    const views={
      'ready-unassigned':{label:'Prontas e sem release',test:story=>story.ready&&story.unassigned},
      unassigned:{label:'Sem release',test:story=>story.unassigned},
      pending:{label:'Pendentes',test:story=>!story.ready},
      selected:{label:'Selecionadas',test:story=>selected.includes(story.entityId)},
      all:{label:'Todas',test:()=>true},
    };
    if(!views[filters.view])filters.view='all';
    const projects=[...new Map(stories.map(story=>[story.projectId,{id:story.projectId,name:story.project}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if(filters.project&&!projects.some(project=>project.id===filters.project)){filters.project='';filters.epic='';}
    const epics=[...new Map(stories.filter(story=>story.projectId===filters.project).map(story=>[story.epicId,{id:story.epicId,name:story.epic}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    if(!filters.project||filters.epic&&!epics.some(epic=>epic.id===filters.epic))filters.epic='';
    const associationMatches=story=>filters.association==='all'||filters.association==='unassigned'&&story.unassigned||filters.association==='this-draft'&&story.currentAssignment?.draft.id===draft.id||filters.association==='other-draft'&&story.currentAssignment&&story.currentAssignment.draft.id!==draft.id||filters.association==='closed-current'&&story.snapshots.length;
    const filtered=stories.filter(story=>views[filters.view].test(story)&&(!filters.project||story.projectId===filters.project)&&(!filters.epic||story.epicId===filters.epic)&&(!filters.status||story.status===filters.status)&&(filters.readiness==='all'||story.ready===(filters.readiness==='approved'))&&associationMatches(story)&&(!query.trim()||normalize(`${story.key} ${story.name} ${story.project} ${story.epic}`).includes(normalize(query.trim()))));
    const sort=['key','name','project','status'].includes(filters.sort)?filters.sort:'key';
    const statusOrder=['SPECIFICATION','APPROVED','CODING','CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION','COMPLETED'];
    filtered.sort((a,b)=>(filters.dir==='desc'?-1:1)*(sort==='status'?statusOrder.indexOf(a.status)-statusOrder.indexOf(b.status):String(a[sort]||'').localeCompare(String(b[sort]||''),'pt-BR',{numeric:true,sensitivity:'base'}))||a.entityId.localeCompare(b.entityId));
    const pages=Math.max(1,Math.ceil(filtered.length/20)),page=Math.min(filters.page,pages),shown=filtered.slice((page-1)*20,page*20);
    const persisted=members(draft),savedIds=persisted.map(story=>story.entityId),dirty=selected.length!==savedIds.length||selected.some(id=>!byId(id)||!savedIds.includes(id)||planned(byId(id))?.revision!==revision(byId(id)));
    const transfers=stories.filter(story=>selected.includes(story.entityId)&&story.assignment&&story.assignment.draft.id!==draft.id);
    return {filters,query,selected,stories,shown,filtered,page,pages,projects,epics,views,persisted,dirty,transfers,hiddenSelected:selected.filter(id=>!shown.some(story=>story.entityId===id)).length};
  }
  function planningPage(draft) {
    const {filters,query,selected,stories,shown,filtered,page,pages,projects,epics,views,persisted,dirty,transfers,hiddenSelected}=planContext(draft),sys=byId(draft.systemId);
    const pager=()=>`<nav class="query-pagination" aria-label="Paginação de Histórias para planejamento"><a class="button secondary" ${page<=1?'aria-disabled="true" tabindex="-1"':`href="${esc(queryLink('picker',{page:page-1}))}"`}>Anterior</a><span>${filtered.length?`${(page-1)*20+1}–${Math.min(page*20,filtered.length)} de ${filtered.length} Histórias · Página ${page} de ${pages}`:'0 resultados'}</span><a class="button secondary" ${page>=pages?'aria-disabled="true" tabindex="-1"':`href="${esc(queryLink('picker',{page:page+1}))}"`}>Próxima</a></nav>`;
    const signature=JSON.stringify([query,...Object.keys(emptyPlanFilters()).map(key=>filters[key])]);
    const pending=init().planFilterDrafts?.[draft.id];
    const formFilters=pending?.signature===signature?pending.values:filters,formQuery=formFilters.q||'';
    const formEpics=[...new Map(stories.filter(story=>story.projectId===formFilters.project).map(story=>[story.epicId,{id:story.epicId,name:story.epic}])).values()];
    const options=(items,current,empty)=>`<option value="">${empty}</option>${items.map(item=>`<option value="${esc(item.id)}" ${current===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}`;
    const choice=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
    const statuses=['SPECIFICATION','APPROVED','CODING','CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION','COMPLETED'];
    const selectedVisible=shown.filter(story=>selected.includes(story.entityId)).length;
    const activeFacets=[filters.project&&projects.find(item=>item.id===filters.project)?.name,filters.epic&&epics.find(item=>item.id===filters.epic)?.name,filters.status,filters.readiness!=='all'&&(filters.readiness==='approved'?'Verificações aprovadas':'Verificações pendentes'),filters.association!=='all'&&({'unassigned':'Sem release','this-draft':'Neste rascunho','other-draft':'Outro rascunho','closed-current':'Em pacote fechado'})[filters.association]].filter(Boolean);
    const refinementsOpen=init().planRefinementOpen?.[draft.id]??false;
    const filtersOpen=init().planFiltersDisclosure?.[draft.id]??false;
    return `<header class="page-header"><div><p class="eyebrow">RELEASES · COMPOSIÇÃO PLANEJADA</p><h1 tabindex="-1">${esc(draft.label)} · Escolher Histórias</h1><p>${esc(draft.name)} · ${esc(sys?.name)}. Encontre as Histórias e salve a seleção quando estiver pronta.</p></div>${badge('DRAFT','info')}</header>
      <section class="card release-story-picker" data-testid="release-story-picker">
        <div class="release-picker-summary"><div><strong data-testid="planning-selected-count">${selected.length}</strong><span>selecionada(s) nesta edição</span></div><div><strong>${persisted.length}</strong><span>História(s) já salva(s) no rascunho</span></div><p>Você pode salvar este rascunho vazio e escolher as Histórias depois. Planejar Histórias pendentes não aprova suas verificações.</p></div>
        <p class="release-picker-dirty" data-testid="planning-dirty-notice" role="status" ${dirty?'':'hidden'}>Seleção alterada, ainda não salva. Use <strong>Salvar composição</strong> na faixa superior.</p>
        <details id="release-plan-filters-disclosure" class="query-filter-disclosure" ${filtersOpen?'open':''}><summary>Filtrar Histórias</summary>
        <div class="release-picker-shortcuts" aria-label="Atalhos para encontrar Histórias"><span>Comece por uma lista</span><div>${Object.entries(views).map(([key,view])=>`<button type="button" id="release-plan-view-${key}" class="release-picker-view" data-plan-view="${key}" aria-pressed="${filters.view===key}"><span>${view.label}</span><strong>${stories.filter(view.test).length}</strong></button>`).join('')}</div><details class="release-picker-help"><summary>O que significa “Sem release”?</summary><p>Considera a revisão atual: sem planejamento em rascunho e sem participação dessa revisão em pacote fechado. Uma revisão anterior no histórico não bloqueia a atual. As contagens dos atalhos consideram todo o Sistema.</p></details></div>
        <form id="release-plan-filter" class="release-picker-filters" aria-label="Filtrar Histórias para a release">
          <div class="release-picker-search"><label for="release-plan-search">Buscar História, Projeto ou Épico</label><input id="release-plan-search" type="search" value="${esc(formQuery)}" placeholder="Digite o código ou parte do nome" autocomplete="off"></div>
          <details id="release-plan-refinements" class="release-picker-refinements" ${refinementsOpen?'open':''}><summary>Refinar filtros (${activeFacets.length})</summary><div class="release-picker-facet-grid">
            <div><label for="release-plan-project">Projeto</label><select id="release-plan-project" data-plan-filter="project">${options(projects,formFilters.project,'Todos os Projetos')}</select></div>
            <div><label for="release-plan-epic">Épico</label><select id="release-plan-epic" data-plan-filter="epic" ${!formFilters.project?'disabled':''}>${options(formEpics,formFilters.epic,formFilters.project?'Todos os Épicos deste Projeto':'Escolha um Projeto primeiro')}</select></div>
            <div><label for="release-plan-status">Status da História</label><select id="release-plan-status" data-plan-filter="status"><option value="">Todos os status</option>${statuses.map(status=>choice(status,status,formFilters.status)).join('')}</select></div>
            <div><label for="release-plan-readiness">Verificações da revisão atual</label><select id="release-plan-readiness" data-plan-filter="readiness">${choice('all','Todas as verificações',formFilters.readiness)}${choice('approved','Revisão, segurança e testes aprovados',formFilters.readiness)}${choice('pending','Com verificações pendentes',formFilters.readiness)}</select></div>
            <div><label for="release-plan-association">Associação da revisão atual</label><select id="release-plan-association" data-plan-filter="association">${choice('all','Todas as associações',formFilters.association)}${choice('unassigned','Sem release',formFilters.association)}${choice('this-draft','Planejada neste rascunho',formFilters.association)}${choice('other-draft','Planejada em outro rascunho',formFilters.association)}${choice('closed-current','Já incluída em pacote fechado',formFilters.association)}</select></div>
            <div class="release-picker-filter-footer"><p>Use Aplicar filtros para confirmar estes campos. Os atalhos acima aplicam somente a lista escolhida imediatamente. Status TESTING não comprova verificações aprovadas.</p></div>
          </div></details>
          <div class="query-form-actions"><button type="button" id="release-plan-reset" class="button secondary" data-plan-reset>Limpar filtros</button><button class="button primary" type="submit">Aplicar filtros</button></div><p class="query-draft" id="release-plan-filter-draft" role="status" ${pending?.signature===signature?'':'hidden'}>Filtros alterados. Use Aplicar filtros.</p>
        </form></details>
        <div class="release-picker-active-filters" data-testid="planning-active-filters"><p><strong>Recorte aplicado:</strong> ${esc(views[filters.view].label)} · ${activeFacets.length?esc(activeFacets.join(' · ')):'Todos os Projetos, status e associações.'}${query?` · Busca: ${esc(query)}`:''} · ${filtered.length} Histórias</p></div>
        <div class="query-order"><label>Ordenar por<select id="release-plan-sort">${[['key','Chave'],['name','Nome'],['project','Projeto'],['status','Status']].map(([key,title])=>`<option value="${key}" ${filters.sort===key?'selected':''}>${title}</option>`).join('')}</select></label><button type="button" class="button secondary" data-plan-direction>${filters.dir==='desc'?'Decrescente ↓':'Crescente ↑'}</button></div>${pager()}
        <form id="release-planning-form" data-draft-id="${draft.id}">
          <div class="release-picker-result" role="status" aria-live="polite"><strong><span data-testid="planning-visible-count">${filtered.length}</span> de ${stories.length} Histórias nos filtros · ${shown.length} nesta página</strong><span>${selectedVisible} selecionada(s) nesta página · <strong data-testid="planning-hidden-selected-count">${hiddenSelected}</strong> selecionada(s) fora desta página ou dos filtros</span></div>
          <div class="release-bulk-actions release-picker-bulk"><label class="release-picker-master"><input type="checkbox" id="release-plan-visible" ${shown.length&&selectedVisible===shown.length?'checked':''} ${!shown.length?'disabled':''}><span>Selecionar esta página</span></label><button type="button" class="button secondary" data-plan-select="all" ${!shown.length?'disabled':''}>Selecionar visíveis</button><button type="button" class="button secondary" data-plan-select="none" ${!selectedVisible?'disabled':''}>Retirar visíveis</button><button type="button" class="button secondary" data-plan-select="clear" ${!selected.length?'disabled':''}>Limpar seleção inteira</button><small>Ações sobre visíveis atingem somente esta página; outras seleções permanecem.</small></div>
          ${transfers.length?`<p class="release-picker-transfer" data-testid="planning-transfer-warning" role="status"><strong>${transfers.length} História(s) serão transferidas de outro rascunho ao salvar.</strong> ${esc([...new Set(transfers.map(story=>`${story.assignment.draft.label} · ${story.assignment.draft.name}`))].join('; '))}. Os pacotes fechados permanecem intactos.</p>`:''}
          <div class="release-selection-list release-planning-list" role="region" tabindex="0" aria-label="Histórias do Sistema para planejamento">${shown.map(story=>{
            const assignment=story.currentAssignment;
            const association=assignment?`${assignment.draft.id===draft.id?'Neste rascunho':'Outro rascunho'}: ${assignment.draft.label} · ${assignment.draft.name} · r${assignment.revision}`:story.snapshots.length?`Revisão atual em ${story.snapshots.map(({release:r})=>r.label).join(', ')} · r${story.revision}`:'Sem release para a revisão atual';
            return `<label class="release-selection-row release-picker-row" data-testid="release-planning-row"><input type="checkbox" id="release-plan-story-${story.entityId}" data-plan-story="${story.entityId}" ${selected.includes(story.entityId)?'checked':''}><span class="release-story-label"><strong>${esc(story.key)} · ${esc(story.name)}</strong><small>${esc(story.project)} → ${esc(story.epic)} · revisão ${story.revision}</small><span class="release-picker-badges"><span class="release-picker-workflow">Status ${badge(story.status,'neutral')}</span><span class="release-picker-checks">Verificações ${badge(story.ready?'ELIGIBLE':'PENDING',story.ready?'success':'warning')}<small>${story.ready?'Aprovadas':'Pendentes'}</small></span></span><small class="release-picker-association ${assignment&&assignment.draft.id!==draft.id?'release-dependency-text':''}">${esc(association)}${assignment&&assignment.draft.id!==draft.id?'. Selecionar transfere o planejamento ao salvar.':''}</small>${story.assignment&&!assignment?`<small>Planejamento antigo: ${esc(story.assignment.draft.label)} · r${story.assignment.revision}. Ao salvar, será associada a revisão atual.</small>`:''}${story.snapshots.length?'<small>Pacote fechado preservado. Esta seleção planeja outra composição; não altera nem aprova o pacote existente.</small>':''}<small>${esc(story.reason)}</small></span></label>`;
          }).join('')||`<div class="release-picker-empty" data-testid="planning-empty-results"><h2>Nenhuma História corresponde a esta combinação</h2><p>Revise os filtros ou escolha outra lista. As ${selected.length} Histórias selecionadas continuam preservadas.</p><button class="button secondary" type="button" data-plan-reset>Limpar filtros e ver todas</button></div>`}</div>
          ${pager()}<p id="release-planning-error" class="release-dependency-text" role="alert"></p>
        </form>
      </section>`;
  }
  const planningPrimary = draft => ({title:'Salvar composição planejada',text:'Inclua ou retire Histórias neste rascunho. Nenhuma candidata ou aprovação será modificada.',html:`<button class="button primary" type="submit" form="release-planning-form" data-testid="save-release-composition">Salvar composição</button><a class="button secondary" data-plan-cancel="${draft.id}" href="${link(draft)}">Cancelar</a>`});
  function draftPage(draft) {
    const stories=members(draft), eligible=stories.filter(story=>story.ready&&story.plannedRevision===story.revision), sys=byId(draft.systemId);
    const candidates=(draft.candidates??[]).map(id=>state().items.find(item=>item.id===id)).filter(Boolean);
    const candidatePanel=candidates.length?`<section class="card"><p class="eyebrow">CONTINUIDADE DESTA ENTREGA</p><h2>Candidatas fechadas a partir deste planejamento</h2><p>Revisões incluídas saíram do planejamento pendente. Abra o pacote para acompanhar QA, aprovações e ambientes.</p><div class="scope-release-links">${candidates.map(r=>`<a data-testid="planned-candidate-link" href="${link(r)}"><strong>${esc(r.label)} · ${r.stories.length} História(s)</strong><small>${esc(releaseStages[r.stage]?.label??r.stage)} · composição imutável</small></a>`).join('')}</div></section>`:'';
    const pending=stories.filter(story=>!story.ready||story.plannedRevision!==story.revision);
    const pendingPanel=pending.length?`<section class="card"><h2>Continuar o trabalho pendente</h2><p>Abra a História para retomar sua especificação, conversa ou execução. O planejamento permanece neste rascunho.</p><div class="scope-release-links">${pending.map(story=>`<a href="#/story/${story.entityId}/overview"><strong>Continuar História ${esc(story.key)}</strong><small>${esc(story.name)} · revisão atual ${story.revision}</small></a>`).join('')}</div></section>`:'';
    return `<header class="page-header"><div><p class="eyebrow">RELEASE DO SISTEMA · PLANEJAMENTO</p><h1 tabindex="-1">${esc(draft.label)} · ${esc(draft.name)}</h1><p>Rascunho de ${esc(sys?.name)}. As Histórias abaixo são as mesmas que você consulta em seus Projetos e Épicos.</p></div>${badge('DRAFT','info')}</header><section class="release-summary info" data-testid="release-plan-summary" data-stage="draft"><div><h2>Planejada, ainda sem pacote fechado</h2><p>${stories.length} História(s) planejada(s) · ${eligible.length} revisão(ões) com verificações individuais aprovadas · ${stories.length-eligible.length} pendente(s).</p><p>Nenhuma implantação ou aprovação foi criada. A seleção precisa ser revisada antes de fechar a candidata.</p></div></section><section class="card"><p class="eyebrow">COMPOSIÇÃO PLANEJADA · EDITÁVEL EM RELEASES</p><h2>Histórias desta release</h2><div class="story-release-members">${stories.map(story=>`<a href="#/story/${story.entityId}/releases" data-testid="planned-story-row"><span><strong>${esc(story.key)} · ${esc(story.name)}</strong><small>${esc(story.project)} → ${esc(story.epic)} · revisão planejada ${story.plannedRevision}</small><small>${story.plannedRevision!==story.revision?`Revisão atual ${story.revision}: confirme novamente o planejamento.`:esc(story.reason)}</small></span>${badge(story.ready&&story.plannedRevision===story.revision?'ELIGIBLE':'PENDING',story.ready&&story.plannedRevision===story.revision?'success':'warning')}<span aria-hidden="true">→</span></a>`).join('')||'<div class="release-picker-empty-draft" data-testid="empty-release-draft"><strong>Rascunho vazio: válido para planejar a entrega</strong><p>Nenhuma História planejada. A release pode ser criada agora e receber Histórias depois, por quem cuida da composição. Use Escolher Histórias na faixa superior. Sem Histórias elegíveis, não é possível fechar uma candidata nem iniciar implantação.</p></div>'}</div><p class="release-help">Planejamento → revisão da seleção e dependências → pacote fechado → todos os controles de QA → G2 → nova homologação → G3 → produção sem reconstrução.</p></section>${pendingPanel}${candidatePanel}<section class="card release-rule-card"><h2>A composição fechada será outra identidade</h2><p>O rascunho organiza trabalho ainda em especificação ou codificação. Fechar uma candidata exige retirar pendências e resolver dependências; nenhuma marcação de planejamento aprova a revisão atual.</p><a href="#/system/${draft.systemId}/overview" class="direction-link">Consultar Projetos de ${esc(sys?.name)} →</a></section>`;
  }
  function draftPrimary(draft) {
    const stories=members(draft), eligible=stories.filter(story=>story.ready&&story.plannedRevision===story.revision);
    return {title:'Revisar composição planejada',text:`${eligible.length} revisão(ões) elegível(is) de ${stories.length} planejadas. Pendências não serão incluídas silenciosamente.`,html:`<button class="button primary" data-story-release-prepare="${draft.id}" ${!eligible.length?'disabled':''}>Revisar seleção elegível</button><a class="button secondary" data-testid="manage-release-composition" href="#/release/${draft.id}/planning">Escolher Histórias</a>`};
  }
  const storyPrimary = () => ({title:'Planejar a entrega desta História',text:'Salvar altera somente a associação de planejamento da revisão atual. Pacotes fechados permanecem intactos.',html:'<button class="button primary" type="submit" form="story-release-form" data-testid="save-story-release">Salvar planejamento</button>'});
  function mount(story,route) {
    document.querySelectorAll('[data-story-release-prepare]').forEach(button=>button.addEventListener('click',()=>prepare(find(button.dataset.storyReleasePrepare))));
    document.querySelector('#release-create-form')?.addEventListener('submit',event=>{
      event.preventDefault();const selectedSystem=document.querySelector('#release-create-system'),name=document.querySelector('#release-create-name'),error=document.querySelector('#release-create-error');
      const sys=systems().find(item=>item.id===selectedSystem.value),title=name.value.trim();
      if(!sys){error.textContent='Selecione um Sistema disponível.';selectedSystem.focus();return;}
      if(title.length<3||title.length>100){error.textContent='Informe um nome entre 3 e 100 caracteres.';name.focus();return;}
      const n=init().nextPlannedId++,draft={id:`release-draft-${n}`,createdAt:new Date().toISOString(),systemId:sys.id,label:`DRAFT ${n}`,name:title,stage:'draft'};
      drafts().push(draft);save();location.hash=link(draft);
    });
    const editing=route.section==='release'&&route.tab==='planning'&&find(route.id);
    if(editing){
      const selected=()=>init().planEdits[editing.id];
      const refresh=()=>{
        const active=document.activeElement,activeId=active?.id,cursor=active?.selectionStart,end=active?.selectionEnd,position={x:window.scrollX,y:window.scrollY},listTop=document.querySelector('.release-planning-list')?.scrollTop??0;
        const refinements=document.querySelector('#release-plan-refinements');init().planRefinementOpen??={};if(refinements)init().planRefinementOpen[editing.id]=refinements.open;
        const disclosure=document.querySelector('#release-plan-filters-disclosure');init().planFiltersDisclosure??={};if(disclosure)init().planFiltersDisclosure[editing.id]=disclosure.open;
        save();render(false);
        const focused=activeId?document.getElementById(activeId):null;focused?.focus({preventScroll:true});
        if(focused&&typeof cursor==='number'&&typeof focused.setSelectionRange==='function')focused.setSelectionRange(cursor,end??cursor);
        const list=document.querySelector('.release-planning-list');if(list)list.scrollTop=listTop;
        window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
      };
      const visibleInputs=()=>[...document.querySelectorAll('[data-plan-story]')];
      const setVisible=adding=>{
        const visible=visibleInputs().map(input=>input.dataset.planStory),retained=selected().filter(id=>!visible.includes(id));
        init().planEdits[editing.id]=adding?[...retained,...visible]:retained;refresh();
      };
      const master=document.querySelector('#release-plan-visible'),visible=visibleInputs(),checked=visible.filter(input=>input.checked).length;
      if(master){master.indeterminate=checked>0&&checked<visible.length;master.setAttribute('aria-checked',master.indeterminate?'mixed':String(master.checked));master.addEventListener('change',()=>setVisible(master.checked));}
      document.querySelector('#release-plan-refinements')?.addEventListener('toggle',event=>{init().planRefinementOpen??={};init().planRefinementOpen[editing.id]=event.target.open;save();});
      document.querySelector('#release-plan-filters-disclosure')?.addEventListener('toggle',event=>{init().planFiltersDisclosure??={};init().planFiltersDisclosure[editing.id]=event.target.open;save();});
      document.querySelectorAll('[data-plan-story]').forEach(input=>input.addEventListener('change',()=>{init().planEdits[editing.id]=selected().filter(id=>id!==input.dataset.planStory);if(input.checked)selected().push(input.dataset.planStory);refresh();}));
      document.querySelectorAll('[data-plan-select]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.planSelect==='clear'){init().planEdits[editing.id]=[];refresh();}else setVisible(button.dataset.planSelect==='all');}));
      const rememberFilters=()=>{
        const context=planContext(editing),values={...context.filters,q:document.querySelector('#release-plan-search').value};
        document.querySelectorAll('[data-plan-filter]').forEach(select=>values[select.dataset.planFilter]=select.value);
        init().planFilterDrafts??={};init().planFilterDrafts[editing.id]={signature:JSON.stringify([context.query,...Object.keys(emptyPlanFilters()).map(key=>context.filters[key])]),values};
        document.querySelector('#release-plan-filter-draft').hidden=false;save();return values;
      };
      document.querySelectorAll('[data-plan-view]').forEach(button=>button.addEventListener('click',()=>{location.hash=queryLink('picker',{view:button.dataset.planView,page:1});}));
      document.querySelectorAll('[data-plan-reset]').forEach(button=>button.addEventListener('click',()=>{delete init().planFilterDrafts?.[editing.id];save();const next=queryLink('picker',{...emptyPlanFilters(),q:'',page:1});if(location.hash===next)refresh();else location.hash=next;}));
      document.querySelectorAll('[data-plan-filter]').forEach(select=>select.addEventListener('change',()=>{
        if(select.dataset.planFilter==='project'){
          const epic=document.querySelector('#release-plan-epic'),context=planContext(editing),options=[...new Map(context.stories.filter(story=>story.projectId===select.value).map(story=>[story.epicId,story.epic])).entries()];
          epic.disabled=!select.value;epic.innerHTML=`<option value="">${select.value?'Todos os Épicos deste Projeto':'Escolha um Projeto primeiro'}</option>${options.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}`;
        }
        rememberFilters();
      }));
      document.querySelector('#release-plan-search')?.addEventListener('input',rememberFilters);
      document.querySelector('#release-plan-filter')?.addEventListener('submit',event=>{event.preventDefault();const values=rememberFilters();delete init().planFilterDrafts[editing.id];save();const next=queryLink('picker',{...values,page:1});if(location.hash===next)refresh();else location.hash=next;});
      document.querySelector('#release-plan-sort')?.addEventListener('change',event=>{location.hash=queryLink('picker',{sort:event.target.value,page:1});});
      document.querySelector('[data-plan-direction]')?.addEventListener('click',()=>{const current=collectionState('picker');location.hash=queryLink('picker',{dir:current.dir==='desc'?'asc':'desc',page:1});});
      document.querySelector('#release-planning-form')?.addEventListener('submit',event=>{
        event.preventDefault();const ids=selected(),scope=entities.filter(item=>inScope(item,editing.systemId));
        if(ids.some(id=>!scope.some(item=>item.id===id))){document.querySelector('#release-planning-error').textContent='A seleção contém Histórias indisponíveis ou de outro Sistema. Reabra a composição.';return;}
        for(const [storyId,assignment]of Object.entries(init().assignments))if(assignment.draftId===editing.id&&!ids.includes(storyId))delete init().assignments[storyId];
        for(const id of ids)init().assignments[id]={draftId:editing.id,revision:revision(byId(id))};
        delete init().planEdits[editing.id];state().notice=`Composição de ${editing.label} salva. Pacotes fechados e aprovações preservados.`;save();location.hash=link(editing);
      });
      document.querySelector('[data-plan-cancel]')?.addEventListener('click',()=>{delete init().planEdits[editing.id];save();});
    }
    if(story?.kind!=='story'||route.tab!=='releases')return;
    const bar=document.querySelector('#workflow-actions'),config=storyPrimary(story);bar.hidden=false;bar.innerHTML=`<div class="workflow-copy"><strong class="workflow-heading">${esc(config.title)}</strong><p>${esc(config.text)}</p></div><div class="workflow-controls">${config.html}</div>`;
    const select=document.querySelector('#story-release-select');
    select?.addEventListener('change',()=>{document.querySelector('#story-release-error').textContent='';});
    document.querySelector('#story-release-form')?.addEventListener('submit',event=>{
      event.preventDefault();const sys=systemFor(story);if(!sys)return;const chosen=find(select.value);
      if(select.value&&(!chosen||chosen.stage!=='draft'||chosen.systemId!==sys.id)){document.querySelector('#story-release-error').textContent='Escolha uma release existente em rascunho deste Sistema. Crie e gerencie releases no menu Releases.';select.focus();return;}
      if(chosen)init().assignments[story.id]={draftId:chosen.id,revision:revision(story)};else delete init().assignments[story.id];
      state().planningNotice={storyId:story.id,text:chosen?`Planejamento salvo: ${story.key} · revisão ${revision(story)} → ${chosen.label} · ${chosen.name}. Pacotes fechados e aprovações preservados.`:'Associação de planejamento removida. Composições fechadas preservadas.'};save();render(false);
    });
  }
  return {storyPanel,storySummary,scopePanel,storyPrimary,mount,find,draftPage,draftPrimary,members,currentStory,createPage,createPrimary,planningPage,planningPrimary};
}
