/* Portal SDLC — demonstration only. All changes remain in this browser tab. */
(() => {
  'use strict';
  const seed = window.SDLC_DEMO;
  const storageKey = 'sdlc-demo-v2';
  let data = JSON.parse(JSON.stringify(seed));
  let persona = seed.personas.find(p => p.role === 'release_manager')?.id || seed.personas[0].id;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.schemaVersion === seed.schemaVersion && saved?.asOf === seed.asOf && Array.isArray(saved.releases) && Array.isArray(saved.items)) data = saved;
    persona = sessionStorage.getItem(storageKey + '-persona') || persona;
  } catch (_) { /* file:// may disable session storage; memory remains usable. */ }
  const kinds = ['system', 'project', 'epic', 'story', 'task'];
  const names = {system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'};
  const plurals = {system:'Sistemas',project:'Projetos',epic:'Épicos',story:'Histórias',task:'Tarefas'};
  const routes = {system:'systems',project:'projects',epic:'epics',story:'stories',task:'tasks'};
  const phases = ['SPECIFICATION','APPROVED','CODING','CODE REVIEW','SECURITY SCAN','MERGE REQUEST','TESTING','UAT','PRODUCTION','COMPLETED'];
  const environments = ['DEV','QA','HML','PROD'];
  const scenarioLabels = {ready:'Pronta para a próxima etapa',blocked:'Avanço impedido',running:'Operação em andamento',failed:'Validação reprovada',unknown:'Resultado não confirmado',done:'Entrega confirmada',draft:'Composição em andamento',cancelled:'Release cancelada'};
  const orderDomain = ['active','inactive','specification','approved','coding','code_review','security_scan','merge_request','testing','uat','production','completed','todo','doing','done','cancelled','open','closed','canceled'];
  const app = document.getElementById('app');
  const dialog = document.getElementById('demo-dialog');
  const remembered = new Map(), scrolls = new Map(), filterDrafts = new Map(), expansions = new Map(), tabQueries = new Map();
  let currentHash = '', notice = '', returnFocus = null, pending = null, sortFocus = null;
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = v => String(v ?? 'Não registrado').replace(/_/g,' ').toUpperCase().replace(/^TODO$/,'TO DO');
  const date = v => v ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v)) : 'Não registrado';
  const paths = {home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',chat:'<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',tree:'<rect x="8" y="2" width="8" height="6" rx="1"/><path d="M12 8v5M4 17v-4h16v4"/><rect x="1" y="17" width="6" height="5" rx="1"/><rect x="9" y="17" width="6" height="5" rx="1"/><rect x="17" y="17" width="6" height="5" rx="1"/>',box:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M7 4l10 6"/>',plug:'<path d="M8 3v5m8-5v5M5 8h14v4a7 7 0 0 1-14 0zM12 19v3"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/>',arrow:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',alert:'<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>'};
  const icon = name => `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
  function href(path, params = {}) {
    const q = params instanceof URLSearchParams ? new URLSearchParams(params) : new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined && v !== null && v !== ''));
    return '#' + path + (q.size ? '?' + q : '');
  }
  function route() {
    const raw = location.hash.slice(1) || '/';
    const at = raw.indexOf('?');
    return {path:at < 0 ? raw : raw.slice(0,at),params:new URLSearchParams(at < 0 ? '' : raw.slice(at+1))};
  }
  function patch(changes) {
    const r = route();
    for (const [k,v] of Object.entries(changes)) v === '' || v === null || v === undefined ? r.params.delete(k) : r.params.set(k,v);
    return href(r.path,r.params);
  }
  const itemById = id => data.items.find(i => i.id === id);
  function ancestors(item) { const result = []; let p = itemById(item.parentId); while (p) { result.unshift(p); p = itemById(p.parentId); } return result; }
  function systemOf(item) { return item.kind === 'system' ? item : ancestors(item).find(i => i.kind === 'system'); }
  function archived(item) { return item.archived || ancestors(item).some(p => p.archived); }
  function linkItem(item, text) {
    return item ? `<a href="${e(href('/'+routes[item.kind]+'/'+item.id))}">${e(text || item.name)}</a>` : 'Não registrado';
  }
  function badge(value) {
    const s = String(value || '').toLowerCase();
    const cls = /^(done|completed|active|approved|passed|succeeded|released)$/.test(s) ? 'positive' : /fail|reject|cancel/.test(s) ? 'negative' : /block|pending|unknown|inactive/.test(s) ? 'warning' : '';
    return `<span class="badge ${cls}">${e(label(value))}</span>`;
  }
  function save() { try { sessionStorage.setItem(storageKey,JSON.stringify(data)); } catch (_) {} }
  function announce(message) { const node = document.getElementById('announcement'); node.textContent = ''; requestAnimationFrame(() => { node.textContent = message; }); }
  function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function title(eyebrow, name, description = '', extra = '') {
    return `<div class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1 id="page-title" tabindex="-1">${e(name)}</h1>${description ? `<p>${e(description)}</p>` : ''}</div>${extra}</div>`;
  }
  function queryKey(r = route()) {
    const tab = r.params.get('tab') || (/^\/stories\//.test(r.path) ? 'tasks' : /^\/releases\//.test(r.path) ? 'composition' : /^\/(systems|projects|epics|tasks)\//.test(r.path) ? 'overview' : '');
    return r.path+':'+tab;
  }
  function tabs(list, selected) {
    const r = route();
    tabQueries.set(r.path+':'+selected,new URLSearchParams(r.params));
    return `<nav class="context-tabs" aria-label="Seções deste registro">${list.map(([id,text]) => {
      const params = new URLSearchParams(tabQueries.get(r.path+':'+id) || '');
      params.set('tab',id);
      if (r.params.has('return')) params.set('return',r.params.get('return'));
      return `<a href="${e(href(r.path,params))}" ${id === selected ? 'aria-current="page"' : ''}>${e(text)}</a>`;
    }).join('')}</nav>`;
  }
  function empty(message = 'Ajuste os filtros para encontrar outros registros.') { return `<div class="empty">${icon('box')}<h3>Nenhum resultado neste recorte</h3><p>${e(message)}</p><a href="${e(patch({q:null,status:null,includeInactive:null,page:null,system:null,environment:null,scenario:null,actor:null,outcome:null,from:null,to:null}))}">Limpar filtros</a></div>`; }
  function pageOf(rows, param = 'page') {
    const raw = Number(route().params.get(param));
    const pages = Math.max(1,Math.ceil(rows.length/20)), page = Math.min(pages,Number.isFinite(raw) ? Math.max(1,Math.floor(raw)) : 1);
    const r = route();
    if (r.params.has(param) && r.params.get(param) !== String(page)) {
      r.params.set(param,String(page));
      history.replaceState(null,'',href(r.path,r.params));
    }
    return {rows:rows.slice((page-1)*20,page*20),page,pages,total:rows.length};
  }
  function pagination(p, name, param = 'page') {
    return `<nav class="demo-pagination" aria-label="Paginação de ${e(name)}"><span>${p.total ? `${(p.page-1)*20+1}–${Math.min(p.page*20,p.total)} de ${p.total} resultados` : '0 resultados'} · Página ${p.page} de ${p.pages}</span><div class="actions">${p.page > 1 ? `<a class="button" href="${e(patch({[param]:p.page-1}))}">Anterior</a>` : '<button disabled>Anterior</button>'}<span aria-current="page">${p.page}</span>${p.page < p.pages ? `<a class="button" href="${e(patch({[param]:p.page+1}))}">Próxima</a>` : '<button disabled>Próxima</button>'}</div></nav>`;
  }
  function sortRows(rows, defaults = ['createdAt','desc']) {
    const q = route().params, field = ['name','createdAt','updatedAt','status','at','actor','action','outcome'].includes(q.get('sort')) ? q.get('sort') : defaults[0];
    const direction = ['asc','desc'].includes(q.get('direction')) ? q.get('direction') : defaults[1];
    return [...rows].sort((a,b) => {
      const first = field === 'status' ? orderDomain.indexOf(String(a[field]).toLowerCase()) - orderDomain.indexOf(String(b[field]).toLowerCase()) : String(a[field] ?? '').localeCompare(String(b[field] ?? ''),'pt-BR',{numeric:true,sensitivity:'base'});
      return (first || a.id.localeCompare(b.id)) * (direction === 'asc' ? 1 : -1);
    });
  }
  function th(field, text, defaults = ['createdAt','desc']) {
    const p = route().params, active = (p.get('sort') || defaults[0]) === field, dir = p.get('direction') || defaults[1];
    return `<th scope="col" ${active ? `aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button class="sort-button" data-sort="${e(field)}" data-default="${defaults.join(',')}" aria-label="Ordenar por ${e(text)}, ${active && dir === 'asc' ? 'decrescente' : 'crescente'}">${e(text)} ${active ? dir === 'asc' ? '↑' : '↓' : '↕'}</button></th>`;
  }
  const option = (v,t,current) => `<option value="${e(v)}" ${v === current ? 'selected' : ''}>${e(t)}</option>`;
  function filters(content, name, scope, total, kind = 'collection') {
    const key = queryKey();
    return `<section class="panel demo-filters"><details data-filter-key="${e(key)}" ${expansions.get(key) ? 'open' : ''}><summary>Filtrar ${e(name)}</summary><form data-form="${kind}" aria-label="Filtrar ${e(name)}">${content}<div class="actions"><button class="primary" type="submit">Aplicar filtros</button><button type="button" data-action="clear-filters">Limpar filtros</button></div><p class="filter-dirty hint" role="status" hidden>Filtros alterados. Use Aplicar filtros.</p></form></details><p class="list-filter-applied"><strong>Recorte aplicado:</strong> ${e(scope)} · ${total} ${e(name.toLowerCase())}</p></section>`;
  }
  function field(name,text,value,type='search') { return `<label>${e(text)}<input name="${e(name)}" type="${type}" value="${e(value)}"></label>`; }
  function childrenTable(parent) {
    const q = route().params, kind = parent ? kinds[kinds.indexOf(parent.kind)+1] : 'system';
    if (!kind) return '';
    const all = data.items.filter(i => i.kind === kind && i.parentId === (parent?.id || null));
    const grouped = ['system','project','epic'].includes(kind), include = q.get('includeInactive') === 'true' || Boolean(parent && archived(parent));
    let rows = all.filter(i => !grouped || include || (!archived(i) && i.status.toLowerCase() === 'active'));
    if (!grouped && !include) rows = rows.filter(i => !archived(i));
    const search = (q.get('q') || '').toLocaleLowerCase('pt-BR');
    rows = rows.filter(i => (!search || `${i.key} ${i.name}`.toLocaleLowerCase('pt-BR').includes(search)) && (!q.get('status') || i.status === q.get('status')));
    const defaults = kind === 'system' ? ['name','asc'] : ['createdAt','desc'];
    const p = pageOf(sortRows(rows,defaults));
    const extra = all.filter(i => archived(i) || (grouped && i.status.toLowerCase() !== 'active')).length;
    let html = filters(`${field('q','Buscar por chave ou nome',q.get('q') || '')}<label>Status<select name="status">${option('','Todos os status',q.get('status'))}${[...new Set(all.map(i => i.status))].map(s => option(s,label(s),q.get('status'))).join('')}</select></label><label class="demo-checkbox"><input type="checkbox" name="includeInactive" value="true" ${include ? 'checked' : ''}> ${grouped ? 'Incluir inativos e arquivados' : 'Incluir arquivados'} (${extra} adicionais)</label>`,plurals[kind],`${parent ? names[parent.kind]+': '+parent.name : 'Todos os Sistemas'}; ${include ? 'incluindo inativos e arquivados' : grouped ? 'ativos, não arquivados' : 'não arquivados'}${search ? '; busca: '+q.get('q') : ''}${q.get('status') ? '; status: '+label(q.get('status')) : ''}`,rows.length);
    html += `<section class="panel"><div class="section-heading"><h2>${plurals[kind]}</h2><span class="count">${rows.length}</span></div><p class="hint">Clique no nome da coluna para ordenar. O nome do registro abre o próximo nível.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Tabela de ${plurals[kind]} com rolagem horizontal"><table><thead><tr>${th('name','Nome',defaults)}${th('status','Status',defaults)}${th('createdAt','Criado em',defaults)}${th('updatedAt','Atualizado',defaults)}</tr></thead><tbody>${p.rows.map(i => `<tr><td><a class="item-link" href="${e(href('/'+routes[i.kind]+'/'+i.id,{return:href(route().path,route().params)}))}"><span><small>${e(i.key)}</small><br>${e(i.name)}</span>${icon('arrow')}</a></td><td>${badge(i.status)}${archived(i) ? '<br>'+badge('ARCHIVED') : ''}${i.blocker ? '<br><small>Impedimento registrado</small>' : ''}</td><td><time>${date(i.createdAt)}</time></td><td><time>${date(i.updatedAt)}</time></td></tr>`).join('')}</tbody></table></div>${p.rows.length ? '' : empty()}${pagination(p,plurals[kind])}</section>`;
    return html;
  }
  function cycle(item) {
    const story = item.kind === 'story' ? item : ancestors(item).find(i => i.kind === 'story');
    if (!story) return '';
    return `<div class="demo-story-cycle"><p>Ciclo da História · ${e(story.key)} ${badge(story.status)}</p><ol class="demo-cycle" aria-label="Ciclo atual da História">${phases.map((p,n) => `<li ${n === story.phase ? 'aria-current="step"' : ''} class="${n < story.phase ? 'previous' : ''}"><span>${n+1}</span>${e(p)}</li>`).join('')}</ol></div>`;
  }
  function currentSituation(item) {
    if (archived(item)) return 'Registro arquivado. Consulta somente leitura; situação e evidências preservadas.';
    const stopped = [item,...ancestors(item)].find(i => ['inactive','cancelled'].includes(i.status.toLowerCase()));
    if (stopped) return `${names[stopped.kind]} ${label(stopped.status)}. O trabalho permanece suspenso; consultar não retoma agentes.`;
    if (item.blocker) return item.blocker;
    if (item.kind === 'story') return item.status === 'completed' ? 'História concluída após entrada confirmada em produção.' : item.devApproved ? 'Desenvolvimento Finalizado em DEV. A conclusão da História depende da entrega em produção.' : `Fase atual: ${phases[item.phase] || label(item.status)}. Consulte a execução e as evidências da revisão atual.`;
    return item.kind === 'task' ? `Tarefa ${label(item.status)}. Resultado técnico, aceite humano e gates são consultados separadamente.` : 'Consulte os itens deste contexto, a execução, as conversas e as evidências.';
  }
  function storyExecution(item) {
    const release = data.releases.find(r => r.storyIds.includes(item.id) && r.status !== 'CANCELED');
    const step = route().params.get('step');
    if (step) return `<p><a href="${e(patch({step:null}))}">← Voltar ao acompanhamento da História</a></p><section class="panel"><h2>${e(step)}</h2><p>${e(currentSituation(item))}</p><p>Revisão ${item.revision} · evidência fictícia vinculada à revisão atual.</p>${checks(item)}<p class="hint">Consulta ilustrativa. Nenhum agente, teste ou aprovação é executado nesta página.</p></section>`;
    const next = item.devApproved ? 'Acompanhar a release no próximo ambiente' : item.blocker ? 'Examinar o impedimento e a evidência registrada' : 'Consultar a etapa atual e os critérios de aceitação';
    return `<section class="panel"><h2>Acompanhamento da execução</h2><p>${e(currentSituation(item))}</p><div class="demo-facts"><div><span>Especificação · G1</span><strong>${item.phase > 0 ? 'Aprovada · revisão '+item.revision : 'Aguardando decisão humana'}</strong></div><div><span>Desenvolvimento Finalizado</span><strong>${item.devApproved ? 'Aprovado em DEV' : 'Ainda não aprovado'}</strong></div><div><span>Conclusão da História</span><strong>${item.status === 'completed' ? 'Produção confirmada' : 'Pendente de produção'}</strong></div></div>${item.blocker ? `<p class="alert warning">${icon('alert')} ${e(item.blocker)}</p>` : ''}<p><strong>Próximo passo:</strong> ${e(next)}</p>${release ? `<p>Release planejada: <a href="${e(href('/releases/'+release.id))}">${e(release.key)} · ${e(release.name)}</a> · revisão ${item.revision}</p>` : '<p class="hint">Nenhuma release planejada para esta revisão.</p>'}</section><section class="panel"><h2>Escolher uma ação ou etapa</h2><p class="hint">Os acessos abaixo consultam exemplos registrados do processo.</p><div class="demo-stage-grid">${['Especificação e G1','Codificação','Code Review','Security Scan','Merge Request','Build e implantação DEV','Teste em DEV','Aceitação humana em DEV','Teste em QA'].map((s,n) => `<a class="demo-stage" href="${e(patch({step:s}))}">${icon(n < (item.phase || 0) ? 'check' : 'clock')}<span>${e(s)}<small>${n < (item.phase || 0) ? 'Evidência disponível' : 'Consultar situação'}</small></span>${icon('arrow')}</a>`).join('')}</div><details class="integration"><summary>Onde será implementada</summary><p>Repositório único do Sistema: ${linkItem(systemOf(item))}. Ambientes e contratos pertencem ao Sistema.</p></details></section>`;
  }
  function checks(item) {
    const criteria = item.criteria || [{text:'A execução deve respeitar a especificação e a revisão aprovadas.',result:item.status === 'done' ? 'passed' : 'pending'}];
    return `<ul class="check-list">${criteria.map((c,n) => `<li>${icon(c.result === 'passed' ? 'check' : c.result === 'failed' ? 'alert' : 'clock')}<div><strong>CA-${String(n+1).padStart(2,'0')} · ${e(c.text)}</strong><p>${c.result === 'passed' ? 'Aprovado' : c.result === 'failed' ? 'Reprovado · ajuste necessário' : 'Não verificado'} · evidência simulada</p></div>${badge(c.result)}</li>`).join('')}</ul>`;
  }
  function execution(item) {
    if (item.kind === 'story') return storyExecution(item);
    if (item.kind === 'task') return `<section class="panel"><h2>Processo e decisões</h2><p>${e(currentSituation(item))}</p>${checks(item)}<p class="hint">Tentativa atual · 1. As evidências são exemplos de consulta, sem execução de agentes.</p></section>`;
    const descendants = data.items.filter(i => ancestors(i).some(p => p.id === item.id) && i.kind === 'story');
    return `<section class="panel"><h2>Execução com Assistente de I.A.</h2><p>${e(currentSituation(item))}</p><p>O assistente organiza requisitos; a execução utiliza agentes e controles independentes. A aprovação de especificação G1 pertence à História.</p><a href="${e(href('/assistant',{context:item.id}))}">Consultar conversa deste contexto ${icon('arrow')}</a></section><section class="panel"><h2>Ciclo de ${names[item.kind]}</h2><p>${badge(item.status)} · ${e(item.lifecycle || 'Ciclo corrente')}</p><div class="demo-facts"><div><span>Histórias neste contexto</span><strong>${descendants.length}</strong></div><div><span>Desenvolvimento Finalizado</span><strong>${descendants.filter(i => i.devApproved).length}</strong></div><div><span>Concluídas em produção</span><strong>${descendants.filter(i => i.status === 'completed').length}</strong></div></div><p class="hint">Pausa, encerramento do agrupador e arquivamento são independentes da situação de cada História.</p>${item.kind === 'system' ? `<p><a href="${e(href('/releases',{system:item.id}))}">Consultar releases deste Sistema</a></p>` : ''}</section>`;
  }
  function conversation(item) {
    const r = route();
    return window.DemoConversations.history({data,params:r.params,path:r.path,e,icon,href,linkItem,badge,filterKey:queryKey},item);
  }
  function audit(target, release = false) {
    const q = route().params, ids = release || q.get('scope') === 'self' ? [target.id] : [target.id,...data.items.filter(i => ancestors(i).some(a => a.id === target.id)).map(i => i.id)];
    const all = data.events.filter(ev => ids.includes(ev.itemId));
    const text = (q.get('q') || '').toLowerCase();
    const localDay = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
    const rows = sortRows(all.filter(ev => (!text || `${ev.action} ${ev.description} ${ev.id} ${ev.correlation}`.toLowerCase().includes(text)) && (!q.get('actor') || ev.actor === q.get('actor')) && (!q.get('outcome') || ev.outcome === q.get('outcome')) && (!q.get('from') || localDay(ev.at) >= q.get('from')) && (!q.get('to') || localDay(ev.at) <= q.get('to'))), ['at','desc']);
    const p = pageOf(rows,'auditPage');
    let html = filters(`${field('q','Buscar ação, descrição ou correlação',q.get('q') || '')}<label>Autor<select name="actor">${option('','Todos os autores',q.get('actor'))}${[...new Set(all.map(ev => ev.actor))].map(v => option(v,v,q.get('actor'))).join('')}</select></label><label>Resultado<select name="outcome">${option('','Todos os resultados',q.get('outcome'))}${[...new Set(all.map(ev => ev.outcome || ''))].map(v => option(v,v || 'Legado: não capturado',q.get('outcome'))).join('')}</select></label>${field('from','Desde',q.get('from') || '','date')}${field('to','Até (inclusive)',q.get('to') || '','date')}${release ? '' : `<label>Escopo<select name="scope">${option('descendants','Item e descendentes',q.get('scope') || 'descendants')}${option('self','Somente este item',q.get('scope'))}</select></label>`}`,'ocorrências',`${target.key}; ${release || q.get('scope') === 'self' ? 'somente este registro' : 'item e descendentes'}${text ? '; busca: '+q.get('q') : ''}${q.get('actor') ? '; autor: '+q.get('actor') : ''}${q.get('outcome') ? '; resultado: '+q.get('outcome') : ''}${q.get('from') ? '; desde: '+q.get('from') : ''}${q.get('to') ? '; até: '+q.get('to') : ''}`,rows.length,'audit');
    html += `<section class="panel"><h2>Auditoria · exemplos fictícios</h2><p class="hint">Fuso America/Sao_Paulo. A situação atual acima independe da página de histórico consultada.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Ocorrências de auditoria"><table><thead><tr>${th('at','Quando',['at','desc'])}${th('actor','Quem',['at','desc'])}${th('action','Ação e contexto',['at','desc'])}${th('outcome','Resultado',['at','desc'])}</tr></thead><tbody>${p.rows.map(ev => `<tr><td><time>${date(ev.at)}</time></td><td>${e(ev.actor)}</td><td><strong>${e(ev.action)}</strong><p>${e(ev.description)}</p><details><summary>Detalhes da ocorrência</summary><dl class="demo-details"><dt>Origem</dt><dd>Cenário de demonstração</dd><dt>Correlação</dt><dd>${e(ev.correlation || 'Não registrada')}</dd><dt>Fase</dt><dd>${e(ev.phase || 'Não capturada neste exemplo')}</dd><dt>Decisão</dt><dd>${e(ev.decision || 'Não capturada neste exemplo')}</dd><dt>Antes</dt><dd>${e(typeof ev.before === 'object' ? JSON.stringify(ev.before) : ev.before || 'Não registrado / não aplicável')}</dd><dt>Depois</dt><dd>${e(typeof ev.after === 'object' ? JSON.stringify(ev.after) : ev.after || 'Não registrado / não aplicável')}</dd><dt>Evento</dt><dd>${e(ev.id)}</dd></dl></details></td><td>${ev.outcome ? badge(ev.outcome) : 'Legado: resultado não capturado'}</td></tr>`).join('')}</tbody></table></div>${p.rows.length ? '' : empty()}${pagination(p,'auditoria','auditPage')}</section>`;
    return html;
  }
  function itemDetail(item) {
    const q = route().params;
    const tabList = item.kind === 'story' ? [['tasks','Tarefas'],['planning','Execução'],['specification','Especificação'],['conversations','Conversas'],['activity','Auditoria'],['manage','Configurações']] : item.kind === 'task' ? [['overview','Resumo'],['planning','Execução'],['evidence','Evidências'],['conversations','Conversas'],['activity','Auditoria'],['manage','Configurações']] : [['overview',plurals[kinds[kinds.indexOf(item.kind)+1]]],['planning','Execução'],['conversations','Conversas'],...(item.kind === 'system' ? [['components','Repositório do Sistema'],['environments','Ambientes']] : []),['activity','Auditoria'],['manage','Configurações']];
    let selected = q.get('tab') || tabList[0][0];
    if (item.kind === 'story' && selected === 'overview') selected = 'tasks';
    if (!tabList.some(t => t[0] === selected)) selected = tabList[0][0];
    let html = title(`${names[item.kind]} · ${item.key}`,item.name,item.description,`<div class="actions">${badge(item.status)}${archived(item) ? badge('ARCHIVED') : ''}</div>`) + tabs(tabList,selected);
    if (selected === 'tasks' || (selected === 'overview' && item.kind !== 'task')) html += childrenTable(item);
    else if (selected === 'planning') html += execution(item);
    else if (selected === 'activity') html += audit(item);
    else if (selected === 'conversations') html += conversation(item.kind === 'task' ? ancestors(item).find(p => p.kind === 'story') : item);
    else if (selected === 'specification') html += `<section class="panel"><h2>Especificação da História · revisão ${item.revision}</h2><p><strong>Como</strong> pessoa usuária do Sistema, <strong>quero</strong> ${e(item.name.toLowerCase())}, <strong>para</strong> realizar minha atividade com segurança e rastreabilidade.</p><h3>Regras e critérios de aceitação</h3>${checks(item)}<div class="decision"><div><strong>G1 · Aprovação da especificação</strong><p>${item.phase > 0 ? 'Especificação aprovada para esta revisão.' : 'Aguardando revisão e aprovação humana.'}</p></div>${badge(item.phase > 0 ? 'approved' : 'pending')}<small>G1 não substitui Code Review, Security Scan, aceite em DEV ou validação da release.</small></div></section>`;
    else if (selected === 'components') html += `<section class="panel"><h2>Repositório do Sistema</h2><p>Um repositório por Sistema, herdado por Projetos, Histórias e Tarefas.</p><dl class="demo-details"><dt>Integração</dt><dd>GitLab · exemplo simulado</dd><dt>Repositório</dt><dd><code>demonstracao/${e(item.id)}</code></dd><dt>Branch base</dt><dd>main</dd><dt>Contrato de execução</dt><dd>Aplicação web · build versionado, healthcheck e artefato imutável</dd></dl><p class="hint">Referências fictícias. Nenhum acesso a repositório externo.</p></section>`;
    else if (selected === 'environments') html += `<section class="panel"><h2>Ambientes do Sistema</h2><p class="hint">Referência cadastrada, destino preparado, implantação e validação são conceitos independentes.</p><div class="environment-grid">${environments.map(env => { const r = data.releases.find(r => r.systemId === item.id && r.environment === env && r.status !== 'CANCELED'); return `<article class="environment"><strong>${env}</strong>${badge(r ? r.scenario === 'failed' ? 'failed' : 'active' : 'pending')}<p>${r ? `<a href="${e(href('/releases/'+r.id))}">${e(r.key)}</a><br>${e(scenarioLabels[r.scenario])}` : 'Referência cadastrada · nenhuma implantação neste cenário'}</p></article>`; }).join('')}</div></section>`;
    else if (selected === 'manage') html += `<section class="panel"><h2>Configurações · consulta</h2><dl class="demo-details"><dt>Identificador</dt><dd>${e(item.key)}</dd><dt>Revisão</dt><dd>${item.revision}</dd><dt>Status</dt><dd>${e(label(item.status))}</dd><dt>Arquivado</dt><dd>${archived(item) ? 'Sim' : 'Não'}</dd><dt>Criado em</dt><dd>${date(item.createdAt)}</dd><dt>Atualizado em</dt><dd>${date(item.updatedAt)}</dd></dl><p class="hint">Cadastros e decisões são exemplos preparados para o evento. Esta demonstração permite simular apenas as promoções de releases.</p></section>`;
    else html += `<section class="panel"><h2>${selected === 'evidence' ? 'Evidências da execução' : 'Resumo da Tarefa'}</h2><p>${e(item.description)}</p><p>${e(currentSituation(item))}</p>${checks(item)}<details class="integration"><summary>Tentativa e rastreabilidade</summary><p>Revisão ${item.revision} · tentativa 1 · execução simulada · nenhum agente executado.</p></details></section>`;
    return html;
  }
  function releaseList() {
    const q = route().params, text = (q.get('q') || '').toLowerCase();
    const rows = data.releases.filter(r => (!q.get('system') || r.systemId === q.get('system')) && (!q.get('status') || r.status === q.get('status')) && (!q.get('environment') || r.environment === q.get('environment')) && (!q.get('scenario') || r.scenario === q.get('scenario')) && (!text || `${r.key} ${r.name}`.toLowerCase().includes(text)));
    const p = pageOf(sortRows(rows));
    const content = `${field('q','Buscar nome ou identificador',q.get('q') || '')}<label>Sistema<select name="system">${option('','Todos os Sistemas',q.get('system'))}${data.items.filter(i => i.kind === 'system').map(i => option(i.id,i.name,q.get('system'))).join('')}</select></label><label>Estado da release<select name="status">${['','OPEN','CLOSED','CANCELED'].map(s => option(s,s || 'Todos os estados',q.get('status'))).join('')}</select></label><label>Ambiente<select name="environment">${['',...environments].map(s => option(s,s || 'Todos os ambientes',q.get('environment'))).join('')}</select></label><label>Situação<select name="scenario">${option('','Todas as situações',q.get('scenario'))}${Object.entries(scenarioLabels).map(([v,t]) => option(v,t,q.get('scenario'))).join('')}</select></label>`;
    return title('Central de entregas','Releases','Composição planejada e evidências da entrega') + filters(content,'releases',`${q.get('system') ? itemById(q.get('system'))?.name || 'Sistema não encontrado' : 'Todos os Sistemas'}; ${q.get('status') || 'todos os estados'}; ${q.get('environment') || 'todos os ambientes'}${text ? '; busca: '+q.get('q') : ''}${q.get('scenario') ? '; situação: '+scenarioLabels[q.get('scenario')] : ''}`,rows.length) + `<section aria-label="Lista de releases"><div class="demo-card-order"><p>${rows.length} releases · 20 por página</p><label>Ordenar por <select data-release-sort>${option('createdAt','Criação',q.get('sort') || 'createdAt')}${option('name','Nome',q.get('sort'))}${option('status','Estado',q.get('sort'))}</select></label><button data-action="release-direction">${q.get('direction') === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'}</button></div><div class="demo-release-grid">${p.rows.map(r => `<a class="panel demo-release-card" href="${e(href('/releases/'+r.id,{return:href('/releases',q)}))}"><div class="section-heading"><strong>${e(r.key)}</strong>${badge(r.status)}</div><h2>${e(r.name)}</h2><p>${e(itemById(r.systemId)?.name)}</p><p>${r.storyIds.length} Histórias planejadas</p><p>${badge(r.environment)} · ${e(scenarioLabels[r.scenario])}</p><small>Criada em ${date(r.createdAt)}</small><span class="demo-card-link">Consultar release ${icon('arrow')}</span></a>`).join('')}</div>${p.rows.length ? '' : `<section class="panel">${empty()}</section>`}${pagination(p,'releases')}</section><section class="panel"><h2>Estado da release</h2><div class="demo-facts">${['OPEN','CLOSED','CANCELED'].map(s => `<a href="${e(patch({status:s,page:null}))}"><span>${s}</span><strong>${data.releases.filter(r => r.status === s && (!q.get('system') || r.systemId === q.get('system'))).length}</strong></a>`).join('')}</div><p class="hint">Estado da composição e ambiente são independentes. CLOSED não comprova implantação ou validação.</p></section>`;
  }
  function promotionReading(r) {
    const index = environments.indexOf(r.environment), next = environments[index+1];
    let reason = r.blocker || '';
    if (r.status === 'CANCELED') reason = 'Release cancelada. O cancelamento preserva as evidências e não remove código ou implantações.';
    else if (index === 3 && r.scenario === 'done') reason = 'Entrega em produção confirmada. Este fluxo já foi concluído.';
    else if (r.scenario !== 'ready') reason = reason || ({blocked:'Há pendências da composição ou dos gates.',running:'Operação em andamento. Aguarde a confirmação do resultado.',failed:'A validação foi reprovada. Uma correção exige candidata sucessora e novo QA.',unknown:'O resultado não foi confirmado. Consultar não repete a operação.',draft:'A composição ainda está sendo preparada.'}[r.scenario] || 'Próxima etapa indisponível neste cenário.');
    else if (!r.storyIds.length) reason = 'Inclua Histórias elegíveis na composição antes da promoção.';
    else if (index === 0 && r.storyIds.some(id => !itemById(id)?.devApproved)) reason = 'Todas as Histórias precisam de Desenvolvimento Finalizado válido em DEV.';
    else if (index > 0 && (!r.digest || !r.candidate)) reason = 'A candidata imutável não foi identificada neste cenário.';
    else if (r.storyIds.some(id => !itemById(id) || (r.storyRevisions?.[id] && r.storyRevisions[id] !== itemById(id).revision))) reason = 'A candidata referencia outra revisão. As evidências atuais não autorizam esta composição.';
    const role = data.personas.find(p => p.id === persona)?.role;
    if (!reason && !['admin','release_manager'].includes(role)) reason = 'Selecione a persona Release Manager ou Administrador para simular a promoção.';
    return {next,reason};
  }
  function releaseDetail(r) {
    const selected = route().params.get('tab') === 'activity' ? 'activity' : 'composition';
    let html = title(`Release · ${r.key}`,r.name,r.description,`<div class="actions">${badge(r.status)}${badge(r.environment)}</div>`) + tabs([['composition','Composição'],['activity','Auditoria']],selected);
    if (selected === 'activity') return html + audit(r,true);
    const p = promotionReading(r), current = environments.indexOf(r.environment);
    html += `<section class="panel"><h2>Situação atual da release</h2><p><strong>${e(scenarioLabels[r.scenario])}</strong> · ${e(r.environment)}</p><ol class="demo-environment-flow" aria-label="Ambientes da release">${environments.map((env,n) => `<li ${n === current ? 'aria-current="step"' : ''} class="${n < current ? 'previous' : ''}"><span>${n < current ? '✓' : n+1}</span><strong>${env}</strong><small>${n === current ? 'Ambiente atual' : n < current ? 'Etapa anterior' : 'Próximo ambiente'}</small></li>`).join('')}</ol><div class="demo-facts"><div><span>Composição</span><strong>${r.status === 'OPEN' ? 'Editável · OPEN' : r.status === 'CANCELED' ? 'Cancelada · CANCELED' : 'Congelada · CLOSED'}</strong></div><div><span>Candidata</span><strong>${e(r.candidate || 'Ainda não formada')}</strong></div><div><span>Histórias</span><strong>${r.storyIds.length}</strong></div></div>${r.digest ? `<details class="integration" open><summary>Artefato imutável</summary><p><code class="demo-digest">${e(r.digest)}</code></p><p class="hint">O mesmo digest acompanha QA → HML → PROD, sem reconstrução.</p></details>` : '<p class="hint">DEV → QA congela a composição e forma a candidata versionada.</p>'}${r.predecessor ? `<p>Candidata anterior preservada: <a href="${e(href('/releases/'+r.predecessor))}">${e(data.releases.find(x => x.id === r.predecessor)?.key || r.predecessor)}</a>. A sucessora exige QA completo e novos aceites.</p>` : ''}</section>`;
    html += `<section class="panel demo-promotion"><div class="section-heading"><h2>Promoção entre ambientes</h2><span class="badge">SIMULAÇÃO</span></div><p>Exemplo para apresentação. A confirmação atualiza apenas os dados desta demonstração, sem executar build, testes ou deploy.</p><ul class="check-list">${[{ok:r.storyIds.length > 0 && r.storyIds.every(id => itemById(id)?.devApproved && (!r.storyRevisions?.[id] || r.storyRevisions[id] === itemById(id).revision)),name:'Desenvolvimento Finalizado de todas as Histórias em DEV'},{ok:current > 0 && !!r.candidate,name:'Composição congelada e candidata imutável identificada'},{ok:current > 0 && ['ready','done'].includes(r.scenario),name:'Validação da candidata em QA'},{ok:current > 1 && ['ready','done'].includes(r.scenario),name:'Homologação da candidata em HML'}].map(c => `<li>${icon(c.ok ? 'check' : 'clock')}<div><strong>${e(c.name)}</strong><p>${c.ok ? 'Exemplo aprovado' : 'Pendente ou não aplicável à etapa atual'}</p></div></li>`).join('')}</ul>${p.reason ? `<p class="alert ${r.scenario === 'failed' ? 'error' : r.scenario === 'done' ? 'success' : 'warning'}">${icon(r.scenario === 'done' ? 'check' : 'alert')} ${e(p.reason)}</p>` : ''}<div class="actions">${p.next ? `<button class="primary" data-action="promote" data-id="${e(r.id)}" ${p.reason ? 'disabled aria-describedby="promotion-limits"' : ''}>${icon('box')} Promover ${e(r.environment)} → ${e(p.next)}</button>` : badge(r.scenario === 'done' ? 'Entrega concluída em PROD' : 'Produção ainda não confirmada')}<a href="${e(href('/releases',{system:r.systemId}))}">Consultar outros cenários</a></div><p class="hint" id="promotion-limits">${p.next ? p.next === 'QA' ? 'O aceite DEV habilita QA. A História permanece aberta até produção.' : 'Promove a mesma candidata e preserva a composição e o digest.' : r.scenario === 'done' ? 'A entrada confirmada em produção conclui as Histórias desta candidata.' : 'A História permanece aberta enquanto a entrada em produção não for confirmada.'}</p></section>`;
    const stories = r.storyIds.map(itemById).filter(Boolean);
    html += `<section class="panel"><h2>Histórias da composição</h2><p class="hint">Revisões fixadas na candidata; aprovação em DEV e conclusão em produção são marcos independentes. O status consultado é o atual da História.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Histórias da composição"><table><thead><tr><th scope="col">História</th><th scope="col">Revisão fixada / atual</th><th scope="col">Desenvolvimento Finalizado</th><th scope="col">Status atual</th></tr></thead><tbody>${stories.map(i => {const fixed = r.storyRevisions?.[i.id] || i.revision;return `<tr><td>${linkItem(i,i.key+' · '+i.name)}</td><td>${fixed} / ${i.revision}</td><td>${fixed !== i.revision ? 'Outra revisão · consultar evidência histórica' : badge(i.devApproved ? 'approved' : 'pending')}</td><td>${badge(i.status)}</td></tr>`;}).join('')}</tbody></table></div>${stories.length ? '' : '<p class="hint">Composição vazia. Uma release pode ser criada e composta em momentos diferentes.</p>'}<p>Sistema proprietário: ${linkItem(itemById(r.systemId))}</p></section>`;
    return html;
  }
  function breadcrumbs(r, item, release) {
    const parts = [{text:'Visão geral',url:href('/')}];
    if (item || r.path === '/systems') {
      parts.push({text:'Sistemas',url:remembered.get('/systems') || href('/systems')});
      if (item) [...ancestors(item),item].forEach(i => parts.push({text:names[i.kind]+': '+i.name,url:remembered.get('/'+routes[i.kind]+'/'+i.id) || href('/'+routes[i.kind]+'/'+i.id)}));
    } else if (r.path !== '/') {
      parts.push({text:r.path.startsWith('/releases') ? 'Releases' : r.path === '/assistant' ? 'Assistente' : r.path === '/help' ? 'HELP' : 'Integrações',url:remembered.get('/releases') || href(r.path.split('/').slice(0,2).join('/'))});
      if (release) parts.push({text:release.key+' · '+release.name,url:href('/releases/'+release.id)});
    }
    return `<nav class="breadcrumb" aria-label="Localização">${parts.map((p,n) => `<span>${n ? icon('arrow') : ''}${n === parts.length-1 ? `<span aria-current="page">${e(p.text)}</span>` : `<a href="${e(p.url)}">${e(p.text)}</a>`}</span>`).join('')}</nav>`;
  }
  function shell(r, body, item, release) {
    const selected = r.path.startsWith('/releases') ? '/releases' : r.path === '/assistant' || r.path === '/integrations' || r.path === '/help' ? r.path : r.path === '/' ? '/' : '/systems';
    const nav = [['/','home','Visão geral'],['/assistant','chat','Assistente'],['/systems','tree','Sistemas'],['/releases','box','Releases'],['/integrations','plug','Integrações']];
    const context = r.path === '/' ? 'Indicadores do processo' : selected === '/releases' ? 'Composição de releases' : selected === '/assistant' ? 'Entrevista e especificação' : selected === '/integrations' ? 'Disponibilidade das integrações' : selected === '/help' ? 'HELP · Guia do SDLC' : 'Planejamento e entrega';
    const back = r.params.get('return');
    return `<div class="shell navigation-shell"><a class="skip-link" href="#main" data-action="skip">Ir para o conteúdo</a><aside class="sidebar"><div class="brand">Dell Technologies<span>Portal SDLC</span></div><nav aria-label="Principal">${nav.map(([url,i,t]) => `<a href="${href(url)}" ${selected === url ? 'class="selected" aria-current="page"' : ''}>${icon(i)}${t}</a>`).join('')}</nav><div class="sidebar-bottom"><a href="#/help" ${selected === '/help' ? 'class="selected" aria-current="page"' : ''}>${icon('help')}HELP · Guia do SDLC</a><p class="sidebar-note">Da ideia à entrega.<br>Um processo, contexto completo.</p></div></aside><div class="workspace"><header class="topbar"><span>${e(context)}</span><label class="persona"><span>Modo demo local · Persona</span><select id="persona" aria-label="Persona da demonstração">${data.personas.map(p => option(p.id,p.name+' · '+p.role.replaceAll('_',' '),persona)).join('')}</select></label></header><main id="main"><section class="workflow-bar ${r.path === '/' ? 'dashboard-workflow' : ''}" aria-label="Situação e próxima ação">${breadcrumbs(r,item,release)}${notice ? `<p class="alert success" role="status">${e(notice)}</p>` : ''}${back && /^#\//.test(back) ? `<a class="demo-back" href="${e(back)}">← Voltar à lista consultada</a>` : ''}${item ? `<div class="workflow-context"><div><strong>${names[item.kind]} · ${e(label(item.status))}${archived(item) ? ' · ARCHIVED' : ''}</strong><p>${e(currentSituation(item))}</p></div>${item.kind === 'story' ? `<a class="button" href="${e(href('/stories/'+item.id,{tab:'planning'}))}">Consultar execução</a>` : ''}</div>${cycle(item)}` : release ? `<div class="workflow-context"><div><strong>${e(release.key)} · ${e(release.environment)} · ${e(scenarioLabels[release.scenario])}</strong><p>Composição, ambiente, validação e histórico são fatos independentes.</p></div></div>` : ''}</section>${body}</main><footer>Portal SDLC · Demonstração independente · Referência ${date(data.asOf)} · America/Sao_Paulo<br>Todos os sistemas, pessoas, resultados e indicadores deste projeto são fictícios.</footer></div></div>`;
  }
  function render() {
    if (currentHash) scrolls.set(currentHash,window.scrollY);
    const r = route();
    const id = r.path.split('/')[2], item = id && !r.path.startsWith('/releases') ? itemById(id) : null;
    const release = r.path.startsWith('/releases/') ? data.releases.find(x => x.id === id) : null;
    const ctx = {data,params:r.params,path:r.path,e,icon,href,linkItem,badge,filterKey:queryKey};
    ctx.renderConversation = options => window.DemoConversations.render(ctx,{...options,hideHeading:true});
    let body;
    if (r.path === '/') body = window.DemoViews.dashboard(ctx);
    else if (r.path === '/systems') body = title('Planejamento e entrega','Sistemas','Navegue do Sistema ao detalhe de cada Tarefa.') + childrenTable(null);
    else if (r.path === '/releases') body = releaseList();
    else if (release) body = releaseDetail(release);
    else if (item && r.path === '/'+routes[item.kind]+'/'+item.id) body = itemDetail(item);
    else if (r.path === '/assistant') body = window.DemoViews.assistant(ctx);
    else if (r.path === '/integrations') body = window.DemoViews.integrations(ctx);
    else if (r.path === '/help') body = window.DemoViews.help(ctx);
    else body = title('Navegação','Página não encontrada','Este endereço não pertence aos exemplos da demonstração.') + '<p><a href="#/systems">Voltar aos Sistemas</a></p>';
    const previous = currentHash;
    currentHash = location.hash || '#/';
    remembered.set(r.path,currentHash);
    app.innerHTML = shell(r,body,item,release);
    const heading = app.querySelector('main h1');
    if (heading) { heading.id = 'page-title'; heading.tabIndex = -1; }
    const track = app.querySelector('.demo-cycle'), activeStep = track?.querySelector('[aria-current="step"]');
    if (track && activeStep && matchMedia('(max-width:767px)').matches) track.scrollLeft = activeStep.offsetLeft - track.offsetLeft - (track.clientWidth-activeStep.offsetWidth)/2;
    document.title = `${item?.name || release?.name || (r.path === '/' ? 'Visão geral' : r.path === '/systems' ? 'Sistemas' : r.path === '/releases' ? 'Releases' : r.path === '/assistant' ? 'Assistente' : r.path === '/help' ? 'HELP' : 'Integrações')} · Portal SDLC Demo`;
    const key = queryKey(r);
    const draft = filterDrafts.get(key);
    if (draft) {
      app.querySelectorAll('form[data-form] input,form[data-form] select').forEach(el => { if (el.name in draft) el.type === 'checkbox' ? el.checked = draft[el.name] === 'true' : el.value = draft[el.name]; });
      const dirty = app.querySelector('.filter-dirty'); if (dirty) dirty.hidden = false;
    }
    app.querySelectorAll('details[data-filter-key]').forEach(el => {el.open = Boolean(expansions.get(el.dataset.filterKey));el.addEventListener('toggle',() => expansions.set(el.dataset.filterKey,el.open));});
    const changed = previous && previous !== currentHash;
    if (changed) requestAnimationFrame(() => { const focus = sortFocus ? app.querySelector(`[data-sort="${sortFocus}"]`) : document.getElementById('page-title'); sortFocus = null; focus?.focus({preventScroll:true}); window.scrollTo(0,scrolls.get(currentHash) || 0); });
    if (changed) announce('Página carregada: '+document.title);
    const selectedMessage = r.params.get('conversations.message') || r.params.get('message');
    if (selectedMessage) requestAnimationFrame(() => {
      const target = app.querySelector(`[data-message-id="${CSS.escape(selectedMessage)}"]`);
      if (target) {target.focus({preventScroll:true});target.scrollIntoView({block:'center'});}
    });
  }
  function showDialog(html) {
    returnFocus = document.activeElement;
    dialog.innerHTML = html;
    dialog.showModal();
    dialog.querySelector('[data-dialog-close]')?.focus();
  }
  function closeDialog() { dialog.close(); pending = null; if (returnFocus?.isConnected) returnFocus.focus(); }
  function requestPromotion(id) {
    const r = data.releases.find(x => x.id === id), reading = r && promotionReading(r);
    if (!r || reading.reason || !reading.next) return;
    pending = {id,environment:r.environment,next:reading.next};
    showDialog(`<h2 id="dialog-title">Simular promoção ${e(r.environment)} → ${e(reading.next)}</h2><p><strong>${e(r.key)} · ${e(r.name)}</strong></p><p>${reading.next === 'QA' ? 'A composição será congelada e uma candidata fictícia será formada. O exemplo de QA será apresentado como aprovado para permitir continuar o roteiro.' : 'A mesma candidata e o mesmo digest serão preservados. O exemplo de validação do destino será apresentado como aprovado.'}</p>${reading.next === 'PROD' ? '<p>A entrada fictícia em produção concluirá somente as Histórias desta composição.</p>' : ''}<p class="alert warning">Apenas simulação local. Nenhum serviço, agente ou ambiente real será acionado.</p><div class="actions"><button data-dialog-close>Cancelar</button><button class="primary" data-action="confirm-promotion">Confirmar simulação</button></div>`);
  }
  function confirmPromotion() {
    if (!pending) return;
    const {id,environment,next} = pending, r = data.releases.find(x => x.id === id);
    if (!r || r.environment !== environment || promotionReading(r).reason) return closeDialog();
    const before = {environment:r.environment,candidate:r.candidate,digest:r.digest,status:r.status};
    if (next === 'QA') {
      r.status = 'CLOSED'; r.candidate = r.version + '-rc.1';
      r.storyRevisions = Object.fromEntries(r.storyIds.map(id => [id,itemById(id).revision]));
      r.digest = 'sha256:' + Array.from(r.id + '-demonstracao').map(c => c.charCodeAt(0).toString(16)).join('').padEnd(64,'0').slice(0,64);
    }
    r.environment = next; r.scenario = next === 'PROD' ? 'done' : 'ready'; r.blocker = null;
    const now = new Date().toISOString(); r.updatedAt = now;
    const actor = data.personas.find(p => p.id === persona)?.name || 'Apresentador da demonstração';
    data.events.push({id:'demo-event-'+Date.now(),itemId:id,at:now,actor,action:`Promoção simulada ${environment} → ${next}`,outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',description:'Simulação local confirmada; nenhuma operação real executada.',before,after:{environment:r.environment,candidate:r.candidate,digest:r.digest,status:r.status},correlation:'demo-'+id+'-'+next});
    if (next === 'PROD') r.storyIds.forEach(storyId => {
      const s = itemById(storyId); if (!s) return;
      const previous = s.status; s.status = 'completed'; s.phase = 9; s.updatedAt = now;
      data.items.filter(t => t.parentId === storyId && t.kind === 'task').forEach(t => { t.status = 'done'; t.updatedAt = now; });
      data.events.push({id:'demo-story-'+storyId+'-'+Date.now(),itemId:storyId,at:now,actor,action:'História concluída na produção simulada',outcome:'SUCCEEDED',phase:'COMPLETED',decision:'NOT_APPLICABLE',description:'Revisão presente na candidata fictícia que entrou em PROD.',before:previous,after:'completed',correlation:'demo-'+id+'-PROD'});
    });
    notice = `Simulação concluída: ${r.key} em ${next}. ${next === 'PROD' ? 'Histórias desta composição concluídas.' : 'Validação fictícia aprovada para continuar a apresentação.'}`;
    save(); closeDialog(); render();
    document.getElementById('page-title')?.focus(); announce(notice);
  }
  document.addEventListener('click',event => {
    const target = event.target.closest('button,a'); if (!target) return;
    if (target.hasAttribute('data-dialog-close')) return closeDialog();
    const action = target.dataset.action;
    if (action === 'skip') { event.preventDefault(); const main = document.getElementById('main'); main.tabIndex = -1; main.focus(); return; }
    if (target.dataset.sort) {
      const q = route().params, [field,dir] = target.dataset.default.split(',');
      sortFocus = target.dataset.sort;
      navigate(patch({sort:target.dataset.sort,direction:(q.get('sort') || field) === target.dataset.sort && (q.get('direction') || dir) === 'asc' ? 'desc' : 'asc',page:null,auditPage:null}));
    }
    if (action === 'release-direction') navigate(patch({direction:route().params.get('direction') === 'asc' ? 'desc' : 'asc',page:null}));
    if (action === 'promote') requestPromotion(target.dataset.id);
    if (action === 'confirm-promotion') confirmPromotion();
    if (action === 'clear-filters') {
      const r = route(), tab = r.params.get('tab'), section = r.params.get('section');
      filterDrafts.delete(queryKey(r));
      navigate(href(r.path,{tab,section}));
    }
    if (action === 'reset') showDialog('<h2 id="dialog-title">Reiniciar demonstração?</h2><p>Restaura os cenários fictícios iniciais e retorna à Visão geral. Isso permite repetir as três promoções durante o evento.</p><div class="actions"><button data-dialog-close>Cancelar</button><button class="primary" data-action="confirm-reset">Reiniciar demonstração</button></div>');
    if (action === 'confirm-reset') {
      data = JSON.parse(JSON.stringify(seed)); notice = 'Demonstração reiniciada. Todos os cenários fictícios foram restaurados.';
      filterDrafts.clear(); remembered.clear(); scrolls.clear(); expansions.clear(); tabQueries.clear(); save(); closeDialog(); navigate('#/');
    }
  });
  document.addEventListener('submit',event => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    event.preventDefault();
    const r = route(), params = new URLSearchParams(r.params);
    const fields = new FormData(form), names = [...form.querySelectorAll('[name]')].map(el => el.name);
    for (const name of names) { const value = fields.get(name); value ? params.set(name,value) : params.delete(name); }
    params.delete('page'); params.delete('auditPage'); params.delete('conversationPage');
    if (form.querySelector('[name="contextQuery"]')) {params.delete('assistantPage');params.delete('sessionPage');}
    filterDrafts.delete(queryKey(r));
    navigate(href(r.path,params)); announce('Filtros aplicados.');
  });
  document.addEventListener('input',event => {
    const form = event.target.closest('form[data-form]'); if (!form) return;
    const r = route(), draft = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type="checkbox"]').forEach(el => {draft[el.name] = el.checked ? el.value : '';});
    filterDrafts.set(queryKey(r),draft);
    const dirty = form.querySelector('.filter-dirty'); if (dirty) dirty.hidden = false;
  });
  document.addEventListener('change',event => {
    if (event.target.id === 'persona') {
      persona = event.target.value; try {sessionStorage.setItem(storageKey+'-persona',persona);} catch (_) {} render();
    }
    if (event.target.hasAttribute('data-release-sort')) navigate(patch({sort:event.target.value,direction:'asc',page:null}));
  });
  dialog.addEventListener('cancel',event => {event.preventDefault();closeDialog();});
  window.addEventListener('hashchange',() => {notice = ''; if (dialog.open) closeDialog(); render();});
  window.DemoApp = {getData:() => data,navigate};
  render();
})();
