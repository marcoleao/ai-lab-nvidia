/* Views de consulta da demonstração. Todos os dados permanecem no navegador. */
(function () {
  'use strict';

  const sections = [
    ['inventory', 'Inventário'], ['flow', 'Fluxo semanal'], ['rework', 'Retrabalho'],
    ['aging', 'Tempo em aberto'], ['dora', 'DORA'], ['releases', 'Releases'],
    ['merges', 'Merge Requests'], ['activities', 'Atividades'], ['assistant', 'Assistente'],
    ['stories', 'Histórias']
  ];
  const kinds = [
    ['system', 'Sistemas', 'systems'], ['project', 'Projetos', 'projects'],
    ['epic', 'Épicos', 'epics'], ['story', 'Histórias', 'stories'], ['task', 'Tarefas', 'tasks']
  ];
  const phases = ['Specification', 'Approved', 'Coding', 'Code Review', 'Security Scan',
    'Merge Request', 'Testing', 'UAT', 'Production', 'Completed'];
  const n = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  const upper = value => String(value || '').replace(/_/g, ' ').toUpperCase().replace(/^TODO$/, 'TO DO');
  const date = value => new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const isFinal = item => ['completed', 'done', 'cancelled', 'canceled', 'inactive'].includes(String(item.status).toLowerCase());
  const path = item => '/' + (kinds.find(kind => kind[0] === item.kind) || [null, null, 'systems'])[2] + '/' + item.id;

  function scoped(data, systemId) {
    if (!systemId) return data.items;
    const byId = new Map(data.items.map(item => [item.id, item]));
    return data.items.filter(item => {
      let current = item;
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        if (current.id === systemId) return true;
        visited.add(current.id);
        current = byId.get(current.parentId);
      }
      return false;
    });
  }

  function table(title, headings, rows, e) {
    return '<div class="table-wrap" tabindex="0" role="region" aria-label="' + e(title) + '"><table>' +
      '<caption class="sr-only">' + e(title) + '</caption><thead><tr>' + headings.map(text => '<th scope="col">' + e(text) + '</th>').join('') +
      '</tr></thead><tbody>' + (rows.length ? rows.map(row => '<tr>' + row.map((cell, index) =>
        index === 0 ? '<th scope="row">' + cell + '</th>' : '<td>' + cell + '</td>').join('') + '</tr>').join('') :
        '<tr><td colspan="' + headings.length + '">Nenhum registro neste recorte.</td></tr>') + '</tbody></table></div>';
  }

  function dashboard(ctx) {
    const { data, params, e, href, linkItem, badge } = ctx;
    const section = sections.some(row => row[0] === params.get('section')) ? params.get('section') : 'inventory';
    const systemId = params.get('system') || '';
    const systems = data.items.filter(item => item.kind === 'system');
    const selected = systems.find(item => item.id === systemId);
    const items = scoped(data, systemId);
    const ids = new Set(items.map(item => item.id));
    const active = items.filter(item => !item.archived);
    const releases = data.releases.filter(release => !systemId || release.systemId === systemId);
    const events = data.events.filter(event => !systemId || ids.has(event.itemId) || releases.some(release => release.id === event.itemId));
    const conversations = data.conversations.filter(message => !systemId || ids.has(message.itemId));
    const weeks = (data.stats && data.stats.weeks) || [];
    const noSeries = '<span class="metric-unavailable">Sem medição</span>';
    const countBy = (values, field) => {
      const result = new Map();
      values.forEach(item => result.set(item[field], (result.get(item[field]) || 0) + 1));
      return Array.from(result.entries());
    };
    let content = '';

    if (section === 'inventory') {
      content = '<section id="dashboard-inventory" aria-labelledby="inventory-title"><div class="dashboard-heading"><div><h2 id="inventory-title">Inventário por status</h2><p>Itens não arquivados. Situação do processo, ciclo dos agrupadores e arquivamento são informações independentes.</p></div></div><div class="dashboard-inventory">' +
        kinds.map(([kind, name]) => {
          const rows = active.filter(item => item.kind === kind);
          return '<article class="panel inventory-card"><h3>' + name + '</h3><div class="inventory-total"><strong>' + n(rows.length) + '</strong><span>Total</span></div><dl class="status-counts">' +
            countBy(rows, 'status').map(([status, total]) => '<div><dt>' + e(upper(status)) + '</dt><dd>' + n(total) + '</dd></div>').join('') +
            '</dl><p class="archived-count">Arquivados: ' + n(items.filter(item => item.kind === kind && item.archived).length) + '</p></article>';
        }).join('') + '</div><p class="hint">Percorra os itens em <a href="' + e(href('/systems')) + '">Sistemas</a>: Sistema → Projeto → Épico → História → Tarefa.</p></section>';
    }

    if (section === 'flow') {
      const metrics = [['Itens criados', 'created'], ['Histórias concluídas em produção', 'completed'], ['Implantações em produção', 'deploys']];
      content = '<section id="dashboard-flow" class="panel"><div class="dashboard-heading"><div><h2>Fluxo nas últimas 4 semanas</h2><p>Série histórica fictícia para apresentar volume e cadência. A semana atual é parcial.</p></div></div>' +
        table('Fluxo semanal simulado', ['Indicador'].concat(weeks.map(week => week.label)), metrics.map(([label, key]) =>
          [e(label)].concat(weeks.map(week => systemId ? noSeries : n(week[key] || 0)))), e) +
        '<p class="dashboard-explanation">' + (systemId ? 'Não há série histórica segregada por Sistema neste conjunto de demonstração. Os valores indisponíveis não são zero.' : 'A série histórica é um cenário fictício de quatro semanas; o inventário mostra a posição atual dos registros navegáveis.') + '</p></section>';
    }

    if (section === 'rework') {
      content = '<section id="dashboard-rework" class="panel"><h2>Retrabalho e ciclos de correção</h2><p class="hint">Ocorrências fictícias de nova interação, preservando os resultados anteriores.</p>' +
        table('Ciclos de correção por semana', ['Categoria'].concat(weeks.map(week => week.label)), [
          ['Correções após revisão de código'].concat(weeks.map(week => systemId ? noSeries : n(week.rework || 0))),
          ['Rejeições de candidata'].concat(weeks.map(() => noSeries))
        ], e) + '<p class="dashboard-explanation">Um novo ciclo não apaga a tentativa anterior. Rejeições de candidata não têm uma série histórica neste exemplo.</p></section>';
    }

    if (section === 'aging') {
      const now = new Date(data.asOf).getTime();
      const bands = ['Menos de 7 dias', '7 a menos de 15 dias', '15 a menos de 30 dias', '30 dias ou mais'];
      const counts = kinds.map(([kind, name]) => {
        const values = active.filter(item => item.kind === kind && !isFinal(item));
        const buckets = [0, 0, 0, 0];
        values.forEach(item => {
          const days = Math.max(0, (now - new Date(item.createdAt).getTime()) / 86400000);
          buckets[days < 7 ? 0 : days < 15 ? 1 : days < 30 ? 2 : 3]++;
        });
        return [name].concat(buckets.map(n), [n(values.length)]);
      });
      content = '<section id="dashboard-aging" class="panel"><h2>Tempo em aberto</h2><p class="hint">Idade dos itens ainda abertos na data de referência da demonstração. Um mês corresponde a 30 dias.</p>' +
        table('Itens abertos por faixa de idade', ['Itens abertos'].concat(bands, ['Total']), counts, e) +
        '<p class="dashboard-explanation">Calculado a partir das datas dos registros simulados. Itens concluídos, cancelados, inativos e arquivados ficam fora desta consulta.</p></section>';
    }

    if (section === 'dora') {
      const metrics = [
        ['deploymentFrequency', 'Frequência de implantação', 'deploys/semana', 'Quantidade de implantações confirmadas em produção, por semana.'],
        ['leadTime', 'Tempo de entrega da mudança', 'h', 'Tempo entre o commit e sua entrada confirmada em produção.'],
        ['changeFailureRate', 'Taxa de falha de mudança', '%', 'Proporção de implantações que exigiram correção ou recuperação.'],
        ['recoveryTime', 'Tempo de recuperação', 'h', 'Duração até restaurar o serviço após falha de uma implantação.'],
        ['reliability', 'Confiabilidade', '%', 'Disponibilidade observada na janela fictícia. Sem meta de SLO definida.']
      ];
      content = '<section id="dashboard-dora"><div class="dashboard-heading"><div><h2>Performance de entrega · DORA</h2><p>Valores ilustrativos, sem coleta real ou metas de desempenho.</p></div></div><div class="dora-grid">' +
        metrics.map(([key, label, unit, description]) => {
          const value = data.stats && data.stats.dora && data.stats.dora[key];
          const available = !systemId && typeof value === 'number';
          return '<article class="panel dora-card"><h3>' + label + '</h3><p class="dora-value' + (available ? '' : ' unavailable') + '">' +
            (available ? n(value) + (unit === '%' ? '%' : ' ' + unit) : 'Sem medição') + '</p><p>' + description + '</p><small>' +
            (available ? 'Cenário sintético · últimas 4 semanas' : 'Sem série para o recorte selecionado.') + '</small></article>';
        }).join('') + '</div></section>';
    }

    if (section === 'releases') {
      content = '<section id="dashboard-releases" class="panel"><div class="dashboard-heading"><div><h2>Releases por ambiente</h2><p>Ambiente do fluxo e estado da composição são dimensões separadas.</p></div><a href="' + e(href('/releases', systemId ? { system: systemId } : {})) + '">Consultar releases →</a></div>' +
        table('Releases por ambiente e situação', ['Ambiente', 'Releases', 'Prontas para demonstrar', 'Com impedimento'], ['DEV', 'QA', 'HML', 'PROD'].map(environment => {
          const rows = releases.filter(release => release.environment === environment);
          return [e(environment), n(rows.length), n(rows.filter(release => release.scenario === 'ready').length), n(rows.filter(release => ['blocked', 'failed', 'unknown'].includes(release.scenario)).length)];
        }), e) + '<div class="actions">' + countBy(releases, 'status').map(([status, total]) => badge(status) + '<span>' + n(total) + ' releases</span>').join('') + '</div><p class="dashboard-explanation">Uma release registrada em um ambiente não significa implantação validada. Consulte as evidências e os gates no detalhe.</p></section>';
    }

    if (section === 'merges') {
      const tasks = active.filter(item => item.kind === 'task' && /merge/i.test(item.name));
      content = '<section id="dashboard-merges" class="panel"><h2>Merge Requests</h2><p class="hint">Visão das tarefas de integração do exemplo. Um merge não conclui a História e não confirma implantação.</p>' +
        table('Integração de código', ['Situação da tarefa', 'Quantidade'], countBy(tasks, 'status').map(([status, total]) => [badge(status), n(total)]), e) +
        '<p class="dashboard-explanation">A fonte desta demonstração são as tarefas de Merge de Código. Não há consulta a um GitLab real nem medição de duração dos MRs.</p></section>';
    }

    if (section === 'activities') {
      const ordered = events.slice().sort((a, b) => b.at.localeCompare(a.at));
      const pages = Math.max(1, Math.ceil(ordered.length / 20));
      const page = Math.min(pages, Math.max(1, Number(params.get('eventPage')) || 1));
      const start = (page - 1) * 20;
      const pageHref = value => href('/', { section: 'activities', eventPage: value, ...(systemId ? { system: systemId } : {}) });
      content = '<section id="dashboard-activities" class="panel"><h2>Atividades do processo</h2><p class="hint">' + n(ordered.length) + ' eventos sintéticos neste recorte. A autoria e o resultado pertencem a cada evento.</p>' +
        table('Atividades registradas', ['Quando', 'Item', 'Ação', 'Resultado', 'Autoria'], ordered.slice(start, start + 20).map(event => {
          const item = data.items.find(value => value.id === event.itemId);
          const release = data.releases.find(value => value.id === event.itemId);
          return [e(date(event.at)), item ? linkItem(item) : release ? '<a href="' + e(href('/releases/' + release.id)) + '">' + e(release.key) + '</a>' : e(event.itemId), e(event.action), badge(event.outcome), e(event.actor)];
        }), e) + '<nav class="experience-pagination" aria-label="Páginas das atividades"><span>' +
        (ordered.length ? n(start + 1) + '–' + n(Math.min(start + 20, ordered.length)) : '0') + ' de ' + n(ordered.length) + ' eventos · Página ' + n(page) + ' de ' + n(pages) + '</span>' +
        (page > 1 ? '<a class="button" href="' + e(pageHref(page - 1)) + '">Anterior</a>' : '<span class="hint">Anterior</span>') +
        (page < pages ? '<a class="button" href="' + e(pageHref(page + 1)) + '">Próxima</a>' : '<span class="hint">Próxima</span>') + '</nav></section>';
    }

    if (section === 'assistant') {
      const contexts = new Set(conversations.map(message => message.itemId));
      const human = conversations.filter(message => /human|humano|product.owner|usuário|user/i.test(message.role || '')).length;
      content = '<section id="dashboard-assistant" class="panel"><div class="dashboard-heading"><div><h2>Atuação do Assistente</h2><p>Volume das conversas de exemplo, sem chamadas a modelos.</p></div><a href="' + e(href('/assistant', systemId ? { context: systemId } : {})) + '">Consultar Assistente →</a></div><div class="demo-kpi-grid">' +
        [['Mensagens de exemplo', conversations.length], ['Contextos com conversa', contexts.size], ['Mensagens humanas', human]].map(([label, value]) =>
          '<article class="demo-stat"><strong>' + n(value) + '</strong><span>' + label + '</span></article>').join('') +
        '</div><p class="dashboard-explanation">Duração de inferência, tokens e falhas do modelo: sem medição. Ler uma mensagem não inicia agente e não aprova uma proposta.</p></section>';
    }

    if (section === 'stories') {
      const stories = active.filter(item => item.kind === 'story');
      content = '<section id="dashboard-stories" class="panel"><h2>Histórias ao longo do ciclo</h2><p class="hint">A fase atual permanece independente da tentativa histórica consultada.</p>' +
        table('Histórias por fase do ciclo', ['Fase', 'Histórias'], phases.map((phase, index) => [e(phase.toUpperCase()), n(stories.filter(story => story.phase === index && !['cancelled', 'canceled'].includes(String(story.status).toLowerCase())).length)]), e) +
        '<p class="dashboard-explanation"><strong>' + n(stories.filter(story => story.devApproved).length) + ' Histórias com Desenvolvimento Finalizado.</strong> Esse aceite é independente da conclusão, que depende da entrada da revisão em produção.</p></section>';
    }

    return '<div class="dashboard"><div class="page-heading"><div><p class="eyebrow">PERFORMANCE DO SDLC</p><h1>Visão geral</h1><p>Do planejamento à entrega: volume, fluxo e qualidade do processo.</p></div></div>' +
      '<section class="panel dashboard-filters" aria-label="Consulta de indicadores"><details><summary>Filtrar indicadores</summary><p class="hint">Escolha um Sistema para consultar o inventário e os registros de seu contexto.</p><form data-form="dashboard-filters" aria-label="Filtros dos indicadores"><label>Sistema<select name="system"><option value="">Todos os Sistemas</option>' +
      systems.map(system => '<option value="' + e(system.id) + '"' + (system.id === systemId ? ' selected' : '') + '>' + e(system.name) + '</option>').join('') +
      '</select></label><div class="actions"><button class="primary" type="submit">Aplicar</button><a class="button" href="' + e(href('/', { section })) + '">Limpar</a></div></form></details><p class="dashboard-filter-scope"><strong>Recorte aplicado:</strong> ' +
      e(selected ? 'Sistema: ' + selected.name : systemId ? 'Sistema não encontrado' : 'Todos os Sistemas') + ' · Dados simulados</p></section>' +
      '<nav class="dashboard-sections dashboard-subjects" aria-label="Seções dos indicadores">' + sections.map(([key, title]) => '<a href="' + e(href('/', { section: key, ...(systemId ? { system: systemId } : {}) })) + '"' + (key === section ? ' aria-current="page"' : '') + '>' + title + '</a>').join('') +
      '</nav><p class="dashboard-updated">Referência fictícia: <time datetime="' + e(data.asOf) + '">' + e(date(data.asOf)) + '</time> · America/Sao_Paulo</p>' + content +
      '<details class="panel dashboard-notes"><summary>Como interpretar estes indicadores</summary><ul><li>Todos os dados são fictícios e pertencem somente a esta demonstração.</li><li>O inventário usa todos os registros navegáveis do recorte; arquivados são contados separadamente.</li><li>As séries semanais e DORA são exemplos históricos globais, sem série por Sistema.</li><li>Ausência de medição não equivale a zero. Não há metas de SLO definidas.</li><li>Desenvolvimento Finalizado, validação em QA, homologação e implantação em produção são marcos independentes.</li></ul></details></div>';
  }

  function assistant(ctx) {
    const { data, params, e, href, linkItem, badge } = ctx;
    const typeNames = { system: 'Sistema', project: 'Projeto', epic: 'Épico', story: 'História', task: 'Tarefa' };
    const byId = new Map(data.items.map(item => [item.id, item]));
    const allContexts = data.items.filter(item => !item.archived && ['system', 'project'].includes(item.kind));
    const requested = byId.get(params.get('context'));
    const preferred = requested && requested.kind !== 'task' ? requested : byId.get('aurora') || allContexts[0];
    const selectedId = preferred ? preferred.id : '';
    const aliases = { specification: 'proposal', gates: 'history' };
    const requestedTopic = aliases[params.get('topic')] || params.get('topic');
    const topic = ['business', 'proposal', 'history'].includes(requestedTopic) ? requestedTopic : 'business';
    const sessions = (data.conversationSessions || []).filter(session => session.itemId === selectedId)
      .slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    const session = sessions.find(row => row.id === params.get('session')) || sessions[0];
    const sessionIndex = session ? sessions.findIndex(row => row.id === session.id) : -1;
    const messages = data.conversations.filter(message => message.itemId === selectedId && (!session || message.sessionId === session.id))
      .slice().sort((a, b) => a.at.localeCompare(b.at) || String(a.id).localeCompare(String(b.id)));
    const proposalMessage = messages.filter(message => message.proposal).slice(-1)[0];
    const proposal = proposalMessage && proposalMessage.proposal;
    const ancestors = [];
    let current = preferred && byId.get(preferred.parentId);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      ancestors.unshift(current); seen.add(current.id); current = byId.get(current.parentId);
    }
    const base = { context: selectedId, ...(session ? { session: session.id } : {}) };
    const chatHref = values => href('/assistant', { ...base, topic: 'business', ...values });
    const query = (params.get('contextQuery') || '').trim();
    const contexts = allContexts.filter(item => !query || (item.key + ' ' + item.name).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
      .sort((a, b) => ({ system: 0, project: 1 }[a.kind] - { system: 0, project: 1 }[b.kind]) || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
    const contextPages = Math.max(1, Math.ceil(contexts.length / 20));
    const contextPage = Math.min(contextPages, Math.max(1, Math.floor(Number(params.get('contextPage')) || 1)));
    const contextStart = (contextPage - 1) * 20;
    const contextPageHref = value => href('/assistant', { ...base, topic, contextQuery: query, contextPage: value });
    const createdItems = session ? (session.createdItemIds || []).map(id => byId.get(id)).filter(Boolean) : [];
    const summary = '<section class="panel demo-assistant-context"><div class="demo-assistant-context-line"><div><p class="eyebrow">CONTEXTO DO TRABALHO</p>' +
      (preferred ? '<h2>' + e(typeNames[preferred.kind] + ' · ' + preferred.name) + '</h2><p class="hint">' +
        (ancestors.length ? ancestors.map(item => linkItem(item)).join(' → ') + ' → ' : '') + e(preferred.key) + '</p>' : '<h2>Selecione um contexto</h2>') +
      '</div>' + (preferred ? badge(preferred.status) : '') + '</div><details class="demo-assistant-context-picker"' +
      (params.has('contextQuery') || params.has('contextPage') ? ' open' : '') + '><summary>Consultar outro Sistema ou Projeto</summary>' +
      '<form data-form="collection" class="demo-assistant-context-search"><label>Buscar por chave ou nome<input type="search" name="contextQuery" value="' + e(query) + '" placeholder="Ex.: Aurora, catálogo, atendimento"></label><input type="hidden" name="contextPage" value="1"><div class="actions"><button type="submit">Buscar contextos</button>' +
      (query ? '<a href="' + e(href('/assistant', { ...base, topic })) + '">Limpar busca</a>' : '') + '</div></form><p class="hint">' + n(contexts.length) + ' contextos' + (query ? ' para “' + e(query) + '”' : '') + ' · 20 por página</p>' +
      '<ul class="demo-reference-list">' + contexts.slice(contextStart, contextStart + 20).map(item => '<li><span class="hint">' + e(typeNames[item.kind]) + '</span> <a href="' + e(href('/assistant', { context: item.id, topic })) + '"' + (item.id === selectedId ? ' aria-current="page"' : '') + '>' + e(item.key + ' · ' + item.name) + '</a></li>').join('') +
      (contexts.length ? '' : '<li>Nenhum contexto encontrado. Ajuste a busca.</li>') + '</ul><nav class="experience-pagination" aria-label="Páginas dos contextos do Assistente"><span>' + (contexts.length ? (contextStart + 1) + '–' + Math.min(contextStart + 20, contexts.length) + ' de ' + contexts.length + ' · ' : '0 resultados · ') + 'Página ' + n(contextPage) + ' de ' + n(contextPages) + '</span><div class="actions">' +
      (contextPage > 1 ? '<a class="button" href="' + e(contextPageHref(contextPage - 1)) + '">Anterior</a>' : '<button type="button" disabled>Anterior</button>') +
      (contextPage < contextPages ? '<a class="button" href="' + e(contextPageHref(contextPage + 1)) + '">Próxima</a>' : '<button type="button" disabled>Próxima</button>') + '</div></nav></details></section>';
    const subjectTabs = '<nav class="context-tabs" aria-label="Assuntos do Assistente">' + [['business', 'Conversa'], ['proposal', 'Proposta'], ['history', 'Histórico']].map(([key, title]) =>
      '<a href="' + e(href('/assistant', { ...base, topic: key })) + '"' + (topic === key ? ' aria-current="page"' : '') + '>' + title + '</a>').join('') + '</nav>';
    const sessionHeader = session ? '<header class="demo-session-header"><div><p class="eyebrow">CONVERSA ' + (sessionIndex + 1) + ' DE ' + sessions.length + '</p><h2>' + e(session.title) + '</h2><p>' + e(session.summary) + '</p><small>' + e(date(session.startedAt)) + ' · ' + (session.status === 'waiting' ? 'Aguardando esclarecimento' : 'Conversa concluída') + '</small></div><div class="demo-session-navigation">' +
      (sessionIndex > 0 ? '<a href="' + e(chatHref({ session: sessions[sessionIndex - 1].id })) + '">← Conversa anterior</a>' : '') +
      (sessionIndex + 1 < sessions.length ? '<a href="' + e(chatHref({ session: sessions[sessionIndex + 1].id })) + '">Próxima conversa →</a>' : '') + '</div></header>' : '<header class="demo-session-header"><h2>Conversa do contexto</h2></header>';
    const created = createdItems.length ? '<section class="panel demo-session-created"><div class="section-heading"><h2>Criado a partir desta conversa</h2><span class="count">' + createdItems.length + '</span></div><p class="hint">Itens registrados após revisão e aplicação da proposta.</p><ul class="demo-reference-list">' + createdItems.map(item =>
      '<li><span class="badge">' + e(typeNames[item.kind]) + '</span> ' + linkItem(item, item.key + ' · ' + item.name) + '</li>').join('') + '</ul></section>' : '';
    let content = '';
    if (topic === 'business') {
      const transcript = ctx.renderConversation ? ctx.renderConversation({ itemId: selectedId, sessionId: session && session.id, pageParam: 'assistantPage', selectedMessage: params.get('message') || undefined }) :
        '<div class="demo-chat">' + messages.map(message => '<article class="demo-message"><strong>' + e(message.author) + '</strong><time class="hint" datetime="' + e(message.at) + '">' + e(date(message.at)) + '</time><p class="description">' + e(message.text) + '</p></article>').join('') + '</div>';
      content = '<section class="panel demo-assistant-conversation">' + sessionHeader + (messages.length ? transcript : '<div class="empty"><h3>Nenhuma conversa registrada</h3><p>Consulte outro contexto para acompanhar a entrevista e seu planejamento.</p></div>') + '</section>' + created;
    } else if (topic === 'proposal') {
      content = '<section class="panel demo-proposal-summary">' + sessionHeader + (proposal ? '<div class="demo-proposal-header"><p class="eyebrow">PROPOSTA REVISADA</p><h3>' + e(proposal.title) + '</h3><p>' + e(proposal.summary) + '</p><p>' + badge(proposal.status === 'applied' ? 'APLICADA' : 'REVISADA') + ' <span class="hint">' +
        (proposal.status === 'applied' ? 'Aplicação registrada após revisão humana' : 'Proposta em revisão; itens abaixo não representam aplicação') + '</span></p></div><div class="demo-proposal-grid">' + (proposal.items || []).map(snapshot => {
          const item = byId.get(snapshot.id);
          return '<article class="demo-proposal-item"><span class="badge">' + e(typeNames[snapshot.kind] || snapshot.kind) + '</span><h3>' + (item ? linkItem(item, snapshot.name || item.name) : e(snapshot.name)) + '</h3><p>' + e(snapshot.description || item && item.description || '') + '</p>' + (item ? '<small>' + e(item.key) + '</small>' : '') + '</article>';
        }).join('') + '</div><p><a href="' + e(chatHref({ message: proposalMessage.id })) + '">Ler a conversa que originou esta proposta →</a></p>' :
        '<div class="empty"><h3>Esta conversa não registra uma proposta de criação</h3><p>As perguntas, respostas e decisões de continuidade permanecem disponíveis na conversa.</p><a href="' + e(chatHref({})) + '">Ler conversa</a></div>') + '</section>' + created;
    } else {
      const history = sessions.slice().reverse();
      const pages = Math.max(1, Math.ceil(history.length / 20));
      const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get('sessionPage')) || 1)));
      const start = (page - 1) * 20;
      const pageHref = value => href('/assistant', { context: selectedId, topic: 'history', sessionPage: value });
      content = '<section class="panel demo-session-history"><h2>Histórico de conversas</h2><p class="hint">' + sessions.length + ' conversas deste contexto · Mais recentes primeiro</p><ol class="demo-session-list">' + history.slice(start, start + 20).map(row => {
        const count = data.conversations.filter(message => message.sessionId === row.id).length;
        return '<li><article><div class="section-heading"><h3><a href="' + e(chatHref({ session: row.id })) + '">' + e(row.title) + '</a></h3><span class="badge">' + (row.status === 'waiting' ? 'EM ABERTO' : 'CONCLUÍDA') + '</span></div><p>' + e(row.summary) + '</p><p class="hint">' + e(date(row.startedAt)) + ' · ' + count + ' mensagens</p><p class="demo-session-outcome">' + e(row.outcome) + '</p><div class="actions"><a class="button" href="' + e(chatHref({ session: row.id })) + '">Ler conversa</a>' +
          ((row.createdItemIds || []).length ? '<a href="' + e(href('/assistant', { context: selectedId, session: row.id, topic: 'proposal' })) + '">Consultar proposta e itens</a>' : '') + '</div></article></li>';
      }).join('') + '</ol>' + (history.length ? '' : '<div class="empty"><h3>Nenhuma conversa registrada</h3><p>Consulte outro contexto para acessar as entrevistas anteriores.</p></div>') + '<nav class="experience-pagination" aria-label="Páginas do histórico do Assistente"><span>' + (history.length ? (start + 1) + '–' + Math.min(start + 20, history.length) + ' de ' + history.length + ' · ' : '0 resultados · ') + 'Página ' + page + ' de ' + pages + '</span><div class="actions">' +
        (page > 1 ? '<a class="button" href="' + e(pageHref(page - 1)) + '">Anterior</a>' : '<button type="button" disabled>Anterior</button>') +
        (page < pages ? '<a class="button" href="' + e(pageHref(page + 1)) + '">Próxima</a>' : '<button type="button" disabled>Próxima</button>') + '</div></nav></section>';
    }
    return '<div class="analyst-workspace demo-assistant-workspace"><div class="page-heading"><div><p class="eyebrow">ENTREVISTA E ESPECIFICAÇÃO</p><h1>Assistente</h1><p>Da conversa de negócio aos itens do planejamento.</p></div></div>' + summary + subjectTabs + content + '</div>';
  }

  function integrations(ctx) {
    const { e, badge } = ctx;
    const checks = [
      ['GitLab · repositório e branches', 'ready', 'Exemplo disponível: repositório único do Sistema, branches protegidas e referências de commits.'],
      ['Modelo local · planejamento e conversa', 'ready', 'Exemplo disponível: especialidades e conversas contextualizadas. Nenhuma inferência é executada.'],
      ['Registro de artefatos', 'ready', 'Exemplo disponível: candidata identificada por versão, manifesto e digest imutável.'],
      ['Destino DEV · Aurora', 'ready', 'Exemplo disponível: versão de trabalho publicada e evidências DEV consultáveis.'],
      ['Destino QA · Logística', 'failed', 'Cenário de falha: verificação de saúde não aprovada. A falha não concede autorização para HML.'],
      ['Destino HML · Atendimento', 'pending', 'Cenário pendente: destino aguardando preparação. A referência do ambiente não confirma um runtime disponível.']
    ];
    return '<div class="page-heading"><div><h1>Integrações</h1><p>Disponibilidade das ferramentas e destinos conectados ao processo.</p></div></div><section class="panel" aria-labelledby="integration-readiness-title"><h2 id="integration-readiness-title">Prontidão das integrações</h2><p>O planejamento pode começar localmente. A execução depende das integrações correspondentes.</p><ul class="check-list">' +
      checks.map(([label, status, description]) => '<li><div><strong>' + e(label) + '</strong><p>' + e(description) + '</p></div>' + badge(status) + '</li>').join('') +
      '</ul><p class="dashboard-explanation">Estados fictícios de disponibilidade. Esta página não consulta redes, credenciais, serviços ou ambientes reais.</p></section>';
  }

  function help(ctx) {
    const { data, e, href, linkItem } = ctx;
    const release = data.releases.find(item => item.id === 'aurora-demo') || data.releases.find(item => item.environment === 'DEV' && item.scenario === 'ready');
    const story = release && data.items.find(item => release.storyIds.includes(item.id));
    const system = release && data.items.find(item => item.id === release.systemId);
    const ancestors = [];
    let current = story;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      ancestors.unshift(current);
      seen.add(current.id);
      current = data.items.find(item => item.id === current.parentId);
    }
    const task = story && data.items.find(item => item.parentId === story.id && item.kind === 'task');
    return '<div class="page-heading"><div><p class="eyebrow">HELP · GUIA DO SDLC</p><h1>Navegação e conceitos</h1><p>Roteiro de apresentação com registros fictícios e exemplos locais de promoção.</p></div></div>' +
      '<section class="panel"><h2>Roteiro para a demonstração</h2><ol class="demo-help-route"><li><a href="' + e(href('/')) + '">Visão geral</a>: apresente o inventário, fluxo, tempo em aberto e indicadores de entrega.</li><li><a href="' + e(href('/assistant', system ? { context: system.id } : {})) + '">Assistente</a>: consulte uma conversa e explique o vínculo com o contexto de negócio.</li><li>Percorra a hierarquia: ' +
      ancestors.map(item => linkItem(item)).join(' → ') + (task ? ' → ' + linkItem(task) : '') + '.</li><li>Na História, visite Execução, Especificação e Auditoria. Mostre a distinção entre evidência, decisão e resultado.</li><li>' +
      (release ? '<a href="' + e(href('/releases/' + release.id)) + '">' + e(release.key + ' · ' + release.name) + '</a>' : '<a href="' + e(href('/releases')) + '">Releases</a>') +
      ': demonstre DEV → QA → HML → PROD pelos botões locais. Consulte o mesmo digest da candidata ao longo do percurso.</li><li>Volte a <a href="' + e(href('/releases')) + '">Releases</a> para comparar exemplos de bloqueio, falha, resultado incerto e cancelamento.</li></ol></section>' +
      '<section class="panel"><h2>Do macro para o micro</h2>' + table('Hierarquia do trabalho', ['Conceito', 'Responsabilidade'], [
        ['Sistema', 'Produto contínuo, repositório e ambientes próprios.'],
        ['Projeto', 'Objetivo temporário dentro de um Sistema.'],
        ['Épico', 'Agrupamento de Histórias que representam uma capacidade.'],
        ['História', 'Resultado de negócio com especificação, critérios e ciclo de execução.'],
        ['Tarefa', 'Etapa de execução: codificação, revisão, segurança, merge e testes.'],
        ['Release', 'Composição de revisões de Histórias do mesmo Sistema, gerida na central Releases.']
      ], e) + '</section>' +
      '<section class="panel"><h2>Evidência e decisão em cada etapa</h2><ul class="check-list"><li><div><strong>G1 · aprovação da especificação</strong><p>Autoriza o desenvolvimento de uma revisão da especificação. Não aprova código, teste ou implantação.</p></div></li><li><div><strong>Desenvolvimento Finalizado · DEV</strong><p>Aceite da revisão entregue em DEV. Todas as Histórias da composição precisam de aceite válido para a passagem a QA.</p></div></li><li><div><strong>Candidata imutável · QA</strong><p>Fixa composição, revisão e pacote para testes. Falha exige correção e nova candidata, com QA completo.</p></div></li><li><div><strong>Homologação · HML</strong><p>Confere o mesmo pacote validado em QA. A decisão humana de homologação é independente da validação técnica.</p></div></li><li><div><strong>Entrega em produção · PROD</strong><p>Promove o mesmo artefato, sem rebuild. A História só é concluída quando sua revisão entra de forma confirmada em produção.</p></div></li></ul><p class="hint">No portal real, o código de ambiente de produção é PRD. A demonstração usa o rótulo PROD solicitado para o evento.</p></section>' +
      '<section class="panel"><h2>Como explorar os estados</h2><p>Filtros ficam recolhidos acima da coleção; o recorte aplicado e a quantidade continuam visíveis. Use os cabeçalhos para ordenar e o rodapé para paginar. Abrir um detalhe e voltar recupera a consulta pela URL.</p><p>Situação atual, gate e histórico são independentes. Consultar um evento antigo não regride o item nem aprova uma decisão. Pausa, cancelamento e arquivamento também têm significados próprios.</p><p>Dados, mensagens, evidências, resultados e indicadores são sintéticos. Os exemplos de promoção são um roteiro de apresentação e não comprovam capacidades implantadas no portal real.</p><p><a href="' + e(href('/systems')) + '">Iniciar pelos Sistemas →</a></p><div class="actions"><button type="button" data-action="reset">Reiniciar demonstração</button></div></section>';
  }

  window.DemoViews = { dashboard, assistant, integrations, help };
}());
