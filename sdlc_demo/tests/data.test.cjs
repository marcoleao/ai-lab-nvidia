const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, existsSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const root = join(__dirname,'..');
const context = {window:{}};
vm.runInNewContext(readFileSync(join(root,'assets/data.js'),'utf8'),context);
const data = context.window.SDLC_DEMO;
const byId = new Map(data.items.map(item => [item.id,item]));
const kinds = ['system','project','epic','story','task'];

test('data is deterministic, complete and confined to the demo',() => {
  const again = {window:{}};
  vm.runInNewContext(readFileSync(join(root,'assets/data.js'),'utf8'),again);
  assert.equal(JSON.stringify(data),JSON.stringify(again.window.SDLC_DEMO));
  assert.equal(byId.size,data.items.length);
  assert.equal(data.items.length,284);
  assert.equal(data.releases.length,14);
  for (const item of data.items) {
    assert.ok(kinds.includes(item.kind));
    if (item.kind === 'system') assert.equal(item.parentId,null);
    else assert.equal(byId.get(item.parentId)?.kind,kinds[kinds.indexOf(item.kind)-1],item.id);
    assert.ok(Number.isFinite(Date.parse(item.createdAt)),item.id);
    assert.ok(Date.parse(item.updatedAt) >= Date.parse(item.createdAt),item.id);
    assert.ok(Date.parse(item.updatedAt) <= Date.parse(data.asOf),item.id);
  }
});

test('all ten phases and separate cancellation/archive examples exist',() => {
  const stories = data.items.filter(item => item.kind === 'story');
  assert.equal(new Set(stories.filter(s => s.status !== 'cancelled').map(s => s.phase)).size,10);
  assert.ok(stories.some(s => s.status === 'cancelled'));
  assert.ok(stories.some(s => s.archived));
  assert.ok(stories.some(s => s.devApproved && s.status !== 'completed'));
  assert.equal(stories.length,36);
  assert.equal(data.items.filter(item => item.kind === 'task').length,216);
});

test('completed stories belong to a confirmed production candidate',() => {
  for (const story of data.items.filter(i => i.kind === 'story' && i.status === 'completed')) {
    assert.ok(story.devApproved,story.id);
    assert.ok(data.releases.some(r => r.environment === 'PROD' && r.scenario === 'done' && r.storyIds.includes(story.id)),story.id);
  }
  const uncertain = data.releases.find(r => r.scenario === 'unknown');
  assert.equal(uncertain.environment,'PROD');
  assert.ok(uncertain.storyIds.every(id => byId.get(id).status !== 'completed'));
});

test('releases reference stories of their own System and preserve revisions',() => {
  for (const release of data.releases) {
    assert.ok(['OPEN','CLOSED','CANCELED'].includes(release.status));
    assert.equal(byId.get(release.systemId)?.kind,'system');
    for (const id of release.storyIds) {
      let item = byId.get(id);
      assert.equal(item?.kind,'story',id);
      while (item.parentId) item = byId.get(item.parentId);
      assert.equal(item.id,release.systemId,release.id);
      assert.ok(release.storyRevisions[id] <= byId.get(id).revision);
    }
    if (release.environment !== 'DEV') {
      assert.ok(release.candidate);
      assert.match(release.digest,/^sha256:[a-f0-9]{64}$/);
    }
  }
  const previous = data.releases.find(r => r.id === 'aurora-qa-reprovada');
  const successor = data.releases.find(r => r.predecessor === previous.id);
  assert.notEqual(previous.digest,successor.digest);
  assert.equal(previous.storyRevisions['aurora-reembolso'],1);
  assert.equal(successor.storyRevisions['aurora-reembolso'],2);
});

test('main presentation starts eligible in DEV and historical events exceed one page',() => {
  const main = data.releases.find(r => r.id === 'aurora-demo');
  assert.equal(main.environment,'DEV');
  assert.equal(main.status,'OPEN');
  assert.equal(main.scenario,'ready');
  assert.ok(main.storyIds.length > 0);
  assert.ok(main.storyIds.every(id => byId.get(id).devApproved && byId.get(id).status !== 'completed'));
  assert.ok(data.events.filter(event => event.itemId === 'aurora-busca').length > 20);
  const ids = new Set([...byId.keys(),...data.releases.map(r => r.id)]);
  assert.equal(new Set(data.events.map(ev => ev.id)).size,data.events.length);
  assert.ok(data.events.every(ev => ids.has(ev.itemId) && ev.actor && ev.correlation));
});

test('HTML assets are present, local and have no network runtime dependency',() => {
  const html = readFileSync(join(root,'index.html'),'utf8');
  assert.match(html,/connect-src 'none'/);
  const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(refs.length >= 8);
  for (const ref of refs) assert.ok(existsSync(join(root,ref)),ref);
  for (const file of ['app.js','views.js','data.js','conversations.js']) {
    const text = readFileSync(join(root,'assets',file),'utf8');
    assert.doesNotMatch(text,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,file);
    new vm.Script(text,{filename:file});
  }
});

test('conversation sessions own uniquely identified messages and preserve their time span',() => {
  assert.equal(data.schemaVersion,2);
  const sessions = new Map(data.conversationSessions.map(session => [session.id,session]));
  assert.equal(sessions.size,data.conversationSessions.length,'session IDs must be unique');
  assert.equal(new Set(data.conversations.map(message => message.id)).size,data.conversations.length,'message IDs must be unique');
  for (const session of sessions.values()) {
    assert.ok(byId.has(session.itemId),session.id);
    assert.ok(session.title && session.summary && session.status,session.id);
    assert.ok(Date.parse(session.startedAt) <= Date.parse(session.updatedAt),session.id);
    for (const id of session.createdItemIds || []) assert.ok(byId.has(id),session.id+' -> '+id);
  }
  for (const message of data.conversations) {
    const session = sessions.get(message.sessionId);
    assert.ok(session,'orphan message '+message.id);
    assert.equal(message.itemId,session.itemId,message.id);
    assert.ok(['user','assistant','system'].includes(message.role),message.id);
    assert.ok(['message','milestone'].includes(message.kind),message.id);
    assert.ok(message.author && message.text,message.id);
    assert.ok(Date.parse(message.at) >= Date.parse(session.startedAt),message.id);
    assert.ok(Date.parse(message.at) <= Date.parse(session.updatedAt),message.id);
    assert.ok(Date.parse(message.at) <= Date.parse(data.asOf),message.id);
  }
});

test('every business context has a human and assistant conversation and long sessions remain complete',() => {
  const contexts = data.items.filter(item => ['system','project','epic','story'].includes(item.kind));
  assert.equal(contexts.length,68);
  for (const item of contexts) {
    const messages = data.conversations.filter(message => message.itemId === item.id);
    assert.ok(messages.some(message => message.role === 'user'),item.id+' has no user message');
    assert.ok(messages.some(message => message.role === 'assistant'),item.id+' has no assistant response');
  }
  const planning = data.conversations.filter(message => message.sessionId === 'aurora-catalogo-planejamento');
  assert.ok(planning.length > 20,'planning needs more than one page');
  for (const id of ['aurora-origem','aurora-catalogo-planejamento','aurora-busca-especificacao','aurora-busca-aceite']) {
    assert.ok(data.conversationSessions.some(session => session.id === id),id);
  }
});

test('conversation proposals reference existing items and entity creation respects its parent',() => {
  const proposals = data.conversations.filter(message => message.proposal);
  assert.ok(proposals.length > 0);
  for (const message of data.conversations) {
    for (const id of message.relatedItemIds || []) assert.ok(byId.has(id),message.id+' -> '+id);
    if (message.proposal) {
      assert.ok(message.proposal.title && message.proposal.summary && message.proposal.status,message.id);
      assert.ok(message.proposal.items.length > 0,message.id);
      for (const proposed of message.proposal.items) {
        const item = byId.get(proposed.id);
        assert.ok(item,message.id+' -> '+proposed.id);
        assert.equal(proposed.kind,item.kind,proposed.id);
        assert.equal(proposed.name,item.name,proposed.id);
        assert.ok(proposed.description,proposed.id);
      }
    }
  }
  for (const item of data.items.filter(item => item.parentId)) {
    const parent = byId.get(item.parentId);
    assert.ok(Date.parse(parent.createdAt) <= Date.parse(item.createdAt),parent.id+' created after '+item.id);
  }
});
