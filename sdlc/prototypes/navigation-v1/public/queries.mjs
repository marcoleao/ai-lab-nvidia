import {isFailure,failureIcon} from './feedback.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const catalogs=new Map(),drafts=new Map();
const filterOpen=new Map();
function disclosureOpen(id){const key=draftKey(id);if(filterOpen.has(key))return filterOpen.get(key);try{return sessionStorage.getItem(`sdlc-filter-disclosure:${key}`)==='open';}catch{return false;}}
let callbacks={},bound=false;
const currentHash=()=>typeof location==='undefined'?'#/':location.hash||'#/';
const route=()=>currentHash().split('?')[0];
const params=()=>new URLSearchParams(currentHash().split('?').slice(1).join('?'));
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):1;
const draftKey=id=>`${route()}::${id}`;

export function collectionState(id,defaults={}){
  const result={q:'',sort:'',dir:'asc',page:1,...defaults};
  for(const [key,value]of params())if(key.startsWith(`${id}.`))result[key.slice(id.length+1)]=value;
  result.page=positive(result.page);result.dir=result.dir==='desc'?'desc':'asc';
  return result;
}

export function queryLink(id,updates){
  const query=params();
  for(const [key,value]of Object.entries(updates)){
    if(value===undefined||value===null||value==='')query.delete(`${id}.${key}`);
    else query.set(`${id}.${key}`,String(value));
  }
  return `${route()}${query.size?'?'+query.toString():''}`;
}

function fieldValue(row,column){return column.value?column.value(row):row[column.key];}
const checked=value=>value===true||value==='true'||value==='1';
const dateLabel=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'Não registrado';
const compare=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});

export function collection({id,title,description='',rows,columns,filters=[],defaults={},matches=()=>true,empty='Nenhum resultado.',pageSize=20,filterExtras=''}){
  if(!filters.some(filter=>filter.type==='search'))filters=[{key:'q',label:'Buscar por nome ou chave',type:'search'},...filters];
  const initial={...Object.fromEntries(filters.map(filter=>[filter.key,filter.default??''])),sort:columns.find(column=>column.sortable!==false)?.key||'',dir:'asc',...defaults};
  const state=collectionState(id,initial),sortable=columns.filter(column=>column.sortable!==false);
  if(!sortable.some(column=>column.key===state.sort))state.sort=initial.sort;
  const stored=drafts.get(draftKey(id));
  const appliedSignature=JSON.stringify(filters.map(filter=>[filter.key,state[filter.key]]));
  const draft=stored?.signature===appliedSignature?stored.values:{...state};
  catalogs.set(id,{filters,defaults:initial,state,appliedSignature});
  const query=String(state.q||'').trim().toLocaleLowerCase('pt-BR');
  const selected=rows.filter(row=>(!query||columns.some(column=>String(fieldValue(row,column)??'').toLocaleLowerCase('pt-BR').includes(query)))&&matches(row,state));
  const sortColumn=columns.find(column=>column.key===state.sort);
  selected.sort((a,b)=>{
    const av=sortColumn?fieldValue(a,sortColumn):'',bv=sortColumn?fieldValue(b,sortColumn):'';
    const order=typeof av==='number'&&typeof bv==='number'?av-bv:compare.compare(String(av??''),String(bv??''));
    return (state.dir==='desc'?-order:order)||compare.compare(String(a.id),String(b.id));
  });
  const size=positive(pageSize),total=selected.length,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(state.page,pages),shown=selected.slice((page-1)*size,page*size);
  const active=filters.filter(filter=>String(state[filter.key]??'')!==String(initial[filter.key]??''));
  const control=filter=>{
    const key=`${id}-${filter.key}`,value=draft[filter.key]??'',base=`id="${esc(key)}" name="${esc(filter.key)}" data-query-field="${esc(filter.key)}"`;
    if(filter.type==='checkbox')return `<label class="query-check"><input ${base} type="checkbox" ${checked(value)?'checked':''}>${esc(filter.label)}<small>Aplicação imediata; não altera registros.</small></label>`;
    return `<label for="${esc(key)}">${esc(filter.label)}${filter.type==='select'?`<select ${base}>${(filter.options||[]).map(option=>`<option value="${esc(option.value)}" ${String(value)===String(option.value)?'selected':''}>${esc(option.label)}</option>`).join('')}</select>`:`<input ${base} type="${filter.type==='date'?'date':'search'}" value="${esc(value)}">`}</label>`;
  };
  const pager=()=>`<nav class="query-pagination" aria-label="Paginação de ${esc(title)}"><button type="button" data-query-action="page" data-page="${page-1}" ${page<=1?'disabled':''}>Anterior</button><span>${total?`${(page-1)*size+1}–${Math.min(page*size,total)} de ${total} resultados · Página ${page} de ${pages}`:'0 resultados'}</span><button type="button" data-query-action="page" data-page="${page+1}" ${page>=pages?'disabled':''}>Próxima</button></nav>`;
  const head=columns.map(column=>{
    const active=state.sort===column.key&&column.sortable!==false;
    const nextDirection=active&&state.dir==='asc'?'decrescente':'crescente';
    return `<th scope="col"${active?` aria-sort="${state.dir==='asc'?'ascending':'descending'}"`:''}>${column.sortable===false?esc(column.label):`<button type="button" data-query-action="sort" data-sort="${esc(column.key)}" aria-label="${esc(column.label)}" title="Ordenar ${esc(column.label)} em ordem ${nextDirection}">${esc(column.label)} <span class="query-sort-indicator" aria-hidden="true">${active?(state.dir==='asc'?'↑':'↓'):'↕'}</span></button>`}</th>`;
  }).join('');
  const sortHint=sortable.length?`<p class="query-sort-hint">Ordem: <strong>${esc(sortColumn?.label||'')}</strong> · ${state.dir==='asc'?'crescente':'decrescente'}. Clique no nome de uma coluna para ordenar; clique novamente para inverter.</p>`:'';
  return `<section class="card query-collection" data-query-id="${esc(id)}" aria-labelledby="${esc(id)}-title"><div class="query-heading"><h2 id="${esc(id)}-title">${esc(title)}</h2>${description?`<p>${esc(description)}</p>`:''}</div><details class="query-filter-disclosure" data-query-disclosure="${esc(draftKey(id))}" ${disclosureOpen(id)?'open':''}><summary>Filtros</summary>${filterExtras}<form class="query-form" aria-label="Filtros de ${esc(title)}"><div class="query-fields">${filters.filter(filter=>filter.type!=='checkbox').map(control).join('')}</div><div class="query-form-actions"><button class="button" type="submit">Aplicar filtros</button><button type="button" data-query-action="clear">Limpar filtros</button></div><p class="query-draft" role="status" ${JSON.stringify(filters.map(filter=>draft[filter.key]))===JSON.stringify(filters.map(filter=>state[filter.key]))?'hidden':''}>Filtros alterados. Use Aplicar filtros.</p></form>${filters.some(filter=>filter.type==='checkbox')?`<div class="query-quick">${filters.filter(filter=>filter.type==='checkbox').map(control).join('')}</div>`:''}</details><p class="query-scope"><strong>Recorte aplicado:</strong> ${active.length?active.map(filter=>`${esc(filter.label)}: ${esc(filter.type==='select'?filter.options?.find(option=>String(option.value)===String(state[filter.key]))?.label||state[filter.key]:filter.type==='checkbox'?(checked(state[filter.key])?'Sim':'Não'):state[filter.key])}`).join(' · '):'Padrão da consulta'} · ${total} resultados</p>${sortHint}${pager()}<p class="query-scroll-note">Em telas menores, deslize a tabela para consultar todos os campos.</p><div class="query-table-wrap" tabindex="0" role="region" aria-label="Resultados de ${esc(title)}"><table><caption class="query-sr">${esc(title)} · ${total} resultados filtrados</caption><thead><tr>${head}</tr></thead><tbody>${shown.map(row=>`<tr data-query-row="${esc(row.id)}">${columns.map(column=>`<td>${column.render?column.render(row):esc(fieldValue(row,column))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${shown.length?'':`<div class="query-empty" role="status"><h3>${esc(empty)}</h3><p>${active.length?'Ajuste ou limpe os filtros para consultar outros registros.':'Nenhum registro disponível neste contexto.'}</p></div>`}${pager()}</section>`;
}

export function bindCollections({render,announce=()=>{}}){
  callbacks={render,announce};if(bound)return;bound=true;
  let last=currentHash();
  const redraw=()=>{
    const active=document.activeElement,scope=active?.closest?.('[data-query-id]'),id=scope?.dataset.queryId;
    const field=active?.dataset.queryField,action=active?.dataset.queryAction,sortKey=active?.dataset.sort,sort=active?.dataset.querySort!==undefined,label=active?.textContent;
    callbacks.render();
    if(!id)return;
    const next=[...document.querySelectorAll('[data-query-id]')].find(node=>node.dataset.queryId===id);
    const target=next&&[...next.querySelectorAll('button,input,select')].find(node=>field?node.dataset.queryField===field:sort?node.matches('[data-query-sort]'):action?node.dataset.queryAction===action&&(action==='page'?node.textContent===label:action==='sort'?node.dataset.sort===sortKey:true):false);
    if(target&&!target.disabled)target.focus({preventScroll:true});
  };
  const navigate=(id,updates)=>{const next=queryLink(id,updates);if(next!==currentHash()){history.pushState(null,'',next);last=next;}redraw();callbacks.announce('Consulta atualizada. Confira o recorte e a quantidade de resultados.');};
  const remember=section=>{
    const id=section.dataset.queryId,config=catalogs.get(id);if(!config)return;
    const values={...config.state};section.querySelectorAll('[data-query-field]').forEach(input=>{values[input.dataset.queryField]=input.type==='checkbox'?(input.checked?'true':''):input.value;});
    drafts.set(draftKey(id),{signature:config.appliedSignature,values});
    const note=section.querySelector('.query-draft');if(note)note.hidden=JSON.stringify(config.filters.map(filter=>values[filter.key]))===JSON.stringify(config.filters.map(filter=>config.state[filter.key]));
    return values;
  };
  document.addEventListener('input',event=>{const section=event.target.closest?.('[data-query-id]');if(section&&event.target.matches('[data-query-field]'))remember(section);});
  document.addEventListener('submit',event=>{if(!event.target.matches('.query-form'))return;event.preventDefault();const section=event.target.closest('[data-query-id]'),id=section.dataset.queryId,config=catalogs.get(id),values=remember(section);drafts.delete(draftKey(id));navigate(id,{...Object.fromEntries(config.filters.filter(filter=>filter.type!=='checkbox').map(filter=>[filter.key,values[filter.key]])),page:1});});
  document.addEventListener('change',event=>{
    const section=event.target.closest?.('[data-query-id]');if(!section)return;const id=section.dataset.queryId;
    if(event.target.matches('[data-query-sort]'))navigate(id,{sort:event.target.value,page:1});
    else if(event.target.matches('[data-query-field]')){remember(section);if(event.target.type==='checkbox'){
      const saved=drafts.get(draftKey(id)),key=event.target.dataset.queryField,value=event.target.checked?'true':'';
      const config=catalogs.get(id),nextState={...config.state,[key]:value};
      if(saved)saved.signature=JSON.stringify(config.filters.map(filter=>[filter.key,nextState[filter.key]]));
      navigate(id,{[key]:value,page:1});
    }}
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-query-action]');if(!button||button.disabled)return;const section=button.closest('[data-query-id]');if(!section)return;const id=section.dataset.queryId,config=catalogs.get(id),state=config.state;
    if(button.dataset.queryAction==='page')navigate(id,{page:button.dataset.page});
    if(button.dataset.queryAction==='sort')navigate(id,{sort:button.dataset.sort,dir:state.sort===button.dataset.sort&&state.dir==='asc'?'desc':'asc',page:1});
    if(button.dataset.queryAction==='direction')navigate(id,{dir:state.dir==='asc'?'desc':'asc',page:1});
    if(button.dataset.queryAction==='clear'){drafts.delete(draftKey(id));navigate(id,{...config.defaults,page:1});}
  });
  const restore=()=>{if(last===currentHash())return;last=currentHash();callbacks.render();};
  window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);
  document.addEventListener('toggle',event=>{
    const details=event.target;if(!details.matches?.('[data-query-disclosure]'))return;
    const key=details.dataset.queryDisclosure;filterOpen.set(key,details.open);
    try{sessionStorage.setItem(`sdlc-filter-disclosure:${key}`,details.open?'open':'closed');}catch{/* Expansion remains available in memory. */}
  },true);
}

export function historyView({id,events,title='Histórico e rastreabilidade'}){
  const options=key=>[{value:'',label:'Todos'},...[...new Set(events.map(event=>event[key]).filter(Boolean))].sort(compare.compare).map(value=>({value,label:value}))];
  const eventLink=event=>{const query=params();query.set('returnTo',currentHash());return `#/event/${encodeURIComponent(event.id)}?${query}`;};
  return collection({id,title,description:'Ocorrências registradas · horários de Brasília (America/Sao_Paulo). Consulta não executa operações.',rows:events,defaults:{sort:'timestamp',dir:'desc'},filters:[{key:'q',label:'Buscar mensagem ou identificador',type:'search'},{key:'actor',label:'Ator',type:'select',options:options('actor')},{key:'type',label:'Tipo',type:'select',options:options('type')},{key:'result',label:'Resultado',type:'select',options:options('result')},{key:'from',label:'De',type:'date'},{key:'to',label:'Até (inclusive)',type:'date'}],matches:(event,state)=>['actor','type','result'].every(key=>!state[key]||event[key]===state[key])&&(!state.from||new Date(event.timestamp)>=new Date(`${state.from}T00:00:00-03:00`))&&(!state.to||new Date(event.timestamp)<new Date(new Date(`${state.to}T00:00:00-03:00`).getTime()+86400000)),empty:'Nenhuma ocorrência neste recorte.',columns:[
    {key:'timestamp',label:'Quando',render:event=>`<time datetime="${esc(event.timestamp)}">${esc(dateLabel(event.timestamp))}</time>`},
    {key:'actor',label:'Quem',render:event=>`${esc(event.actor||'Não registrado')}<small class="query-secondary">${esc(event.actorType||'Tipo não registrado')}</small>`},
    {key:'type',label:'Ação',render:event=>`<a href="${esc(eventLink(event))}">${esc(event.message||event.type||'Ocorrência registrada')}</a><small class="query-secondary">${esc(event.type||'Tipo não registrado')}</small>`,value:event=>`${event.message||''} ${event.type||''} ${event.id}`},
    {key:'entityName',label:'Contexto',render:event=>`${esc(event.entityName||event.entityId||'Não registrado')}<small class="query-secondary">${esc(event.phase||'Etapa não registrada')}</small>`,value:event=>`${event.entityName||''} ${event.entityId||''}`},
    {key:'result',label:'Resultado',render:event=>`<span class="badge${isFailure(event.result)?' danger':''}">${isFailure(event.result)?failureIcon():''}${esc(event.result||'Não registrado')}</span>`},
    {key:'technical',label:'Rastreabilidade',sortable:false,value:event=>`${event.correlationId||''} ${event.revision||''} ${event.sha||''}`,render:event=>`<details class="query-technical"><summary>Detalhes da ocorrência</summary><dl>${[['Evento',event.id],['Revisão',event.revision],['Correlação',event.correlationId],['Commit',event.sha]].map(([key,value])=>`<dt>${esc(key)}</dt><dd>${esc(value||'Não registrado')}</dd>`).join('')}</dl><a href="${esc(eventLink(event))}">Abrir ocorrência</a></details>`},
  ]});
}
