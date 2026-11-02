/* Shared transcript and conversation history. All sources are local fixtures. */
(() => {
  'use strict';
  const names = {system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'};
  const kinds = {system:'systems',project:'projects',epic:'epics',story:'stories',task:'tasks'};
  const date = value => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
  const day = value => new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeZone:'America/Sao_Paulo'}).format(new Date(value));
  const lower = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function changed(ctx, patch) {
    const params = new URLSearchParams(ctx.params);
    for (const [key,value] of Object.entries(patch)) value === undefined || value === null || value === '' ? params.delete(key) : params.set(key,value);
    return ctx.href(ctx.path,params);
  }
  function paginate(ctx, rows, key, preferredPage) {
    const total = rows.length, pages = Math.max(1,Math.ceil(total/20));
    const requested = preferredPage || Number(ctx.params.get(key)) || 1;
    const page = Math.min(pages,Math.max(1,Math.floor(requested)));
    if ((ctx.params.has(key) || preferredPage) && ctx.params.get(key) !== String(page)) history.replaceState(null,'',changed(ctx,{[key]:page}));
    return {rows:rows.slice((page-1)*20,page*20),total,page,pages};
  }
  function pager(ctx, p, key, title) {
    return `<nav class="demo-pagination" aria-label="Paginação de ${ctx.e(title)}"><span>${p.total ? `${(p.page-1)*20+1}–${Math.min(p.page*20,p.total)} de ${p.total}` : '0'} ${ctx.e(title)} · Página ${p.page} de ${p.pages}</span><div class="actions">${p.page > 1 ? `<a class="button" href="${ctx.e(changed(ctx,{[key]:p.page-1,'conversations.message':null}))}">Anterior</a>` : '<button disabled>Anterior</button>'}<span aria-current="page">${p.page}</span>${p.page < p.pages ? `<a class="button" href="${ctx.e(changed(ctx,{[key]:p.page+1,'conversations.message':null}))}">Próxima</a>` : '<button disabled>Próxima</button>'}</div></nav>`;
  }
  function proposal(ctx, proposal) {
    if (!proposal) return '';
    const {e,data,linkItem} = ctx;
    return `<section class="demo-conversation-proposal" aria-label="Proposta registrada na conversa"><div class="section-heading"><strong>${e(proposal.title)}</strong><span class="badge ${proposal.status === 'applied' ? 'positive' : ''}">${proposal.status === 'applied' ? 'Aplicada' : 'Revisada'}</span></div><p>${e(proposal.summary)}</p><ul>${(proposal.items || []).map(ref => {const item = data.items.find(i => i.id === ref.id);return `<li><span class="demo-proposal-kind">${e(names[item?.kind || ref.kind] || 'Item')}</span><div>${item ? linkItem(item,item.key+' · '+item.name) : e(ref.name)}<p>${e(ref.description || item?.description || '')}</p></div></li>`;}).join('')}</ul></section>`;
  }
  function render(ctx, options) {
    const {data,e,linkItem} = ctx;
    const sessions = (data.conversationSessions || []).filter(s => s.itemId === options.itemId).sort((a,b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    const session = sessions.find(s => s.id === options.sessionId) || sessions[0];
    if (!session) return '<div class="empty"><h3>Nenhuma conversa registrada neste contexto</h3><p>Consulte o histórico do contexto de origem.</p></div>';
    const all = data.conversations.filter(m => m.sessionId === session.id).sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const selected = options.selectedMessage || ctx.params.get('conversations.message');
    const selectedIndex = selected ? all.findIndex(m => m.id === selected) : -1;
    const pageKey = options.pageParam || 'assistantPage';
    const p = paginate(ctx,all,pageKey,selectedIndex >= 0 && !ctx.params.has(pageKey) ? Math.floor(selectedIndex/20)+1 : null);
    let priorDay = '';
    const transcript = p.rows.map(message => {
      const currentDay = day(message.at), divider = currentDay !== priorDay ? `<p class="demo-conversation-day">${e(currentDay)}</p>` : '';
      priorDay = currentDay;
      const speaker = message.role === 'assistant' ? 'assistant' : message.role === 'system' || message.kind === 'milestone' ? 'system' : 'user';
      const related = (message.relatedItemIds || []).map(id => data.items.find(i => i.id === id)).filter(Boolean);
      const role = speaker === 'assistant' ? 'Assistente SDLC' : speaker === 'system' ? 'Registro do portal' : 'Product Owner';
      const initials = speaker === 'assistant' ? 'IA' : speaker === 'system' ? '✓' : message.author.split(' ').slice(0,2).map(s => s[0]).join('');
      return divider+`<article id="message-${e(message.id)}" class="demo-conversation-message${selected === message.id ? ' is-selected' : ''}" data-message-id="${e(message.id)}" data-speaker="${speaker}" tabindex="-1"><header><span class="demo-conversation-avatar" aria-hidden="true">${e(initials)}</span><div><strong>${e(message.author)}</strong><small>${e(role)}</small></div><time datetime="${e(message.at)}">${e(date(message.at))}</time></header><div class="demo-conversation-content"><p>${e(message.text)}</p>${proposal(ctx,message.proposal)}${related.length ? `<nav class="demo-conversation-references" aria-label="Itens referenciados nesta mensagem">${related.map(item => linkItem(item,item.key+' · '+item.name)).join('')}</nav>` : ''}</div></article>`;
    }).join('');
    return `<div class="demo-conversation" data-session-id="${e(session.id)}">${options.hideHeading ? '' : `<header class="demo-conversation-heading"><div><h2>${e(session.title)}</h2><p>${e(session.summary)}</p></div><span class="badge ${session.status === 'completed' ? 'positive' : 'warning'}">${session.status === 'completed' ? 'Conversa concluída' : 'Aguardando definição'}</span></header>`}<div class="demo-conversation-thread" aria-label="Mensagens da conversa">${transcript}</div>${pager(ctx,p,pageKey,'mensagens')}<p class="demo-conversation-outcome"><strong>Resultado desta conversa:</strong> ${e(session.outcome || 'Requisitos e próximos passos registrados.')}</p></div>`;
  }
  function historyView(ctx, item) {
    const {data,e,href,linkItem} = ctx, params = ctx.params;
    const byId = new Map(data.items.map(i => [i.id,i]));
    function belongs(record) { let p = record; while (p) {if (p.id === item.id) return true;p = byId.get(p.parentId);} return false; }
    function isArchived(record) { let p = record; while (p) {if (p.archived) return true;p = byId.get(p.parentId);} return false; }
    const self = params.get('conversations.scope') === 'self';
    const includeArchived = params.get('conversations.includeArchived') === 'true' || isArchived(item);
    const scoped = data.items.filter(i => (self ? i.id === item.id : belongs(i)) && (includeArchived || !isArchived(i)));
    const ids = new Set(scoped.map(i => i.id));
    const query = params.get('conversations.q') || '', source = params.get('conversations.source') || '';
    const allSessions = (data.conversationSessions || []).filter(s => ids.has(s.itemId) || (!self && (s.createdItemIds || []).some(id => ids.has(id))));
    const text = lower(query), direction = params.get('conversations.direction') === 'asc' ? 'asc' : 'desc';
    const allMessages = new Map();
    data.conversations.forEach(m => {if (!allMessages.has(m.sessionId)) allMessages.set(m.sessionId,[]);allMessages.get(m.sessionId).push(m);});
    const filtered = allSessions.filter(s => (!source || s.itemId === source) && (!text || lower(s.title+' '+s.summary+' '+s.outcome).includes(text) || (allMessages.get(s.id) || []).some(m => lower(m.text+' '+m.author+' '+(m.proposal?.summary || '')).includes(text)))).sort((a,b) => (a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))*(direction === 'asc' ? 1 : -1));
    const selectedId = params.get('conversations.session');
    if (selectedId) {
      const session = allSessions.find(s => s.id === selectedId);
      if (!session) return `<section class="panel"><h2>Conversa fora deste recorte</h2><p>A origem não pertence ao contexto ou está arquivada. Ajuste o escopo para consultá-la.</p><a href="${e(changed(ctx,{'conversations.session':null,'conversations.message':null,conversationPage:null}))}">Voltar ao histórico de conversas</a></section>`;
      const sourceItem = byId.get(session.itemId);
      return `<p class="demo-history-back"><a href="${e(changed(ctx,{'conversations.session':null,'conversations.message':null,conversationPage:null}))}">← Voltar ao histórico de conversas</a></p><section class="panel demo-history-transcript"><div class="demo-conversation-source"><span>Contexto original</span>${linkItem(sourceItem,names[sourceItem.kind]+' · '+sourceItem.name)}<a href="${e(href('/assistant',{context:session.itemId,session:session.id,topic:'business'}))}">Consultar no Assistente →</a></div>${render(ctx,{itemId:session.itemId,sessionId:session.id,pageParam:'conversationPage'})}</section>`;
    }
    const p = paginate(ctx,filtered,'conversations.page');
    const sourceItems = [...new Set(allSessions.map(s => s.itemId))].map(id => byId.get(id));
    const option = (value,label,current) => `<option value="${e(value)}" ${value === current ? 'selected' : ''}>${e(label)}</option>`;
    const key = ctx.filterKey();
    const clear = changed(ctx,{'conversations.q':null,'conversations.scope':null,'conversations.source':null,'conversations.includeArchived':null,'conversations.direction':null,'conversations.page':null});
    return `<section class="panel demo-filters"><details data-filter-key="${e(key)}"><summary>Filtrar conversas</summary><form data-form="collection" aria-label="Filtrar histórico de conversas"><label>Buscar em títulos, perguntas e respostas<input type="search" name="conversations.q" value="${e(query)}" placeholder="Ex.: busca sem resultados, prioridades"></label><label>Escopo<select name="conversations.scope">${option('descendants','Este contexto e descendentes',self ? 'self' : 'descendants')}${option('self','Somente este contexto',self ? 'self' : 'descendants')}</select></label><label>Origem<select name="conversations.source">${option('','Todos os contextos',source)}${sourceItems.map(i => option(i.id,names[i.kind]+' · '+i.name,source)).join('')}</select></label><label>Ordem das conversas<select name="conversations.direction">${option('desc','Mais recentes primeiro',direction)}${option('asc','Mais antigas primeiro',direction)}</select></label><label class="demo-checkbox"><input type="checkbox" name="conversations.includeArchived" value="true" ${includeArchived ? 'checked' : ''}> Incluir contextos arquivados</label><input type="hidden" name="conversations.page" value="1"><div class="actions"><button class="primary" type="submit">Aplicar filtros</button><a class="button" href="${e(clear)}">Limpar filtros</a></div><p class="filter-dirty hint" role="status" hidden>Filtros alterados. Use Aplicar filtros.</p></form></details><p class="list-filter-applied"><strong>Recorte aplicado:</strong> ${e(item.name)} · ${self ? 'somente este contexto' : 'inclui descendentes'}${source ? ' · origem: '+e(byId.get(source)?.name || source) : ''}${query ? ' · busca: '+e(query) : ''} · ${direction === 'asc' ? 'mais antigas primeiro' : 'mais recentes primeiro'} · ${filtered.length} conversas</p></section><section class="panel demo-conversation-history"><div class="section-heading"><h2>Histórico de conversas</h2><span class="count">${filtered.length}</span></div><p class="hint">Abra uma conversa para acompanhar as perguntas, respostas e propostas na ordem original. Cada registro identifica o contexto em que aconteceu.</p><div class="demo-session-list">${p.rows.map(session => {
      const sourceItem = byId.get(session.itemId), messages = allMessages.get(session.id) || [];
      const match = text ? messages.find(m => lower(m.text).includes(text)) : null;
      const link = changed(ctx,{'conversations.session':session.id,'conversations.message':match?.id || null,conversationPage:null});
      return `<article class="demo-session-card" data-session-id="${e(session.id)}"><header><span class="badge">${e(names[sourceItem.kind])}</span>${!ids.has(session.itemId) ? '<span class="badge">Origem do planejamento</span>' : ''}<time datetime="${e(session.startedAt)}">${e(date(session.startedAt))}</time><span class="badge ${session.status === 'completed' ? 'positive' : 'warning'}">${session.status === 'completed' ? 'Concluída' : 'Definição pendente'}</span></header><h3><a href="${e(link)}">${e(session.title)}</a></h3><p>${e(session.summary)}</p><p class="demo-session-source">${linkItem(sourceItem,sourceItem.key+' · '+sourceItem.name)} · ${messages.length} mensagens</p>${match ? `<blockquote>${e(match.text.length > 240 ? match.text.slice(0,240)+'…' : match.text)}</blockquote>` : ''}<p class="demo-session-outcome">${e(session.outcome)}</p><a class="demo-session-read" href="${e(link)}">Ler conversa ${ctx.icon('arrow')}</a></article>`;
    }).join('') || `<div class="empty"><h3>Nenhuma conversa neste recorte</h3><p>Ajuste a busca ou o contexto de origem.</p><a href="${e(clear)}">Limpar filtros</a></div>`}</div>${pager(ctx,p,'conversations.page','conversas')}</section>`;
  }
  window.DemoConversations = {render,history:historyView,proposal};
})();
