'use client';

import Link from 'next/link';
import AssistantWorkspace from './assistant-workspace';
import Dashboard from './dashboard';
import Integrations from './integrations';
import ArchivedItem from './archived-item';
import StoryExecution from './story-execution';
import StoryWorkspace from './story-workspace';
import Releases from './releases';
import Repositories, { Repository, RepositoryChoices } from './repos';
import ProjectLifecycle from './project-lifecycle';
import SystemLifecycle from './system-lifecycle';
import EpicLifecycle from './epic-lifecycle';
import PlanningAssistant from './planning-assistant';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, Box, ChevronRight, Circle, FolderTree, Home, MessageSquare, Plug, Plus, ShieldCheck } from 'lucide-react';
import './navigation.css';
import ItemCollection, { rememberedCollection } from './item-collection';
import HistoryQuery from './history-collection';
import ConversationHistory from './conversation-history';
import { LoadingState, ErrorState, Spinner } from './experience-ui';

type Kind = 'system' | 'project' | 'epic' | 'story' | 'task';
export type Item = { id: string; kind: Kind; key: string; name: string; description: string; status: string; projectLifecycle?: string; version: number; archived: boolean; parentId: string | null; data: Record<string, unknown>; createdAt: string; updatedAt: string };
type Persona = { id: string; name: string; role: string };
export type Detail = { item: Item; ancestors: Item[]; children: Item[]; repositories: Repository[]; availableRepositories: Repository[]; environments: { id: string; repositoryId: string; repositoryName: string; code: string; liveStatus: string; currentVersion: string | null; url: string | null }[]; history: Record<string, unknown>[] };
type Tab = { id: string; title: string };
const kinds: Kind[] = ['system', 'project', 'epic', 'story', 'task'];
const names: Record<Kind, string> = { system: 'Sistema', project: 'Projeto', epic: 'Épico', story: 'História', task: 'Tarefa' };
const plurals: Record<Kind, string> = { system: 'Sistemas', project: 'Projetos', epic: 'Épicos', story: 'Histórias', task: 'Tarefas' };
const routes: Record<Kind, string> = { system: 'systems', project: 'projects', epic: 'epics', story: 'stories', task: 'tasks' };
const storyStatuses = ['specification', 'approved', 'coding', 'code_review', 'security_scan', 'testing', 'uat', 'production', 'completed'];
const label = (value: string) => value === 'todo' ? 'TO DO' : value.replaceAll('_', ' ').toUpperCase();
const eventLabel = (value: string) => ({ ITEM_CREATED: 'Item criado', ITEM_UPDATED: 'Item atualizado', STATUS_CHANGED: 'Status alterado', ITEM_ARCHIVED: 'Item arquivado', ITEM_APPROVED: 'Planejamento aprovado' } as Record<string, string>)[value] || value.replaceAll('_', ' ');
const href = (item: Item) => `/${routes[item.kind]}/${item.id}`;
const detailPath = (id: string) => `/items/${encodeURIComponent(id)}?includeArchived=true`;
const attempts = new Map<string, string>();
const roleLabel = (role: string) => ({ admin: 'Administrador', product_owner: 'Product Owner', architect: 'Arquiteto', qa_lead: 'QA Lead', security_lead: 'Security Lead', release_manager: 'Release Manager' } as Record<string, string>)[role] || role;

function ArchiveDialog({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby="archive-title" onCancel={onCancel} className="panel modal">{children}</dialog>;
}

async function request<T>(path: string, persona: string, body?: unknown, method = 'GET', idempotencyKey?: string): Promise<T> {
  const fingerprint = JSON.stringify([method, path, persona, body]);
  const mutation = method !== 'GET';
  const key = mutation ? (idempotencyKey || attempts.get(fingerprint) || crypto.randomUUID()) : '';
  if (mutation) attempts.set(fingerprint, key);
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(mutation && persona ? { 'X-Persona': persona } : {}), ...(mutation ? { 'Idempotency-Key': key } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `Não foi possível concluir a operação (${response.status}).`);
  if (mutation) attempts.delete(fingerprint);
  return result;
}

export default function Portal() {
  return <Suspense fallback={<main><LoadingState>Carregando navegação…</LoadingState></main>}><PortalContent /></Suspense>;
}

function PortalContent() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const releaseRoute = /^\/releases(?:\/|$)/.test(pathname);
  const assistantRoute = pathname === '/assistant';
  const integrationsRoute = pathname === '/integrations';
  const id = releaseRoute || assistantRoute || integrationsRoute ? undefined : pathname.split('/')[2];
  const overview = pathname === '/';
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [persona, setPersona] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<'create' | 'edit' | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [childTotal, setChildTotal] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '', key: '', repositoryIds: [] as string[] });
  const createKey = useRef('');
  const editVersion = useRef(0);
  const preserveForm = useRef(false);
  const loadedContext = useRef('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reopenComment, setReopenComment] = useState('');
  const item = detail?.item;
  const archivedContext = Boolean(item?.archived || detail?.ancestors.some(ancestor => ancestor.archived));
  const journeyView = !archivedContext && (item?.kind === 'story' || item?.kind === 'task' || /^\/(stories|tasks)\/[^/]+/.test(pathname));
  const childKind: Kind | undefined = item ? kinds[kinds.indexOf(item.kind) + 1] : 'system';
  const role = personas.find(p => p.id === persona)?.role.toLowerCase();
  const canApprove = role === 'admin' || role === 'product_owner';
  const canPlan = !archivedContext && ['admin', 'product_owner', 'architect'].includes(role || '');
  const assistantContext = item ? (['system', 'project'].includes(item.kind) ? item : detail?.ancestors.find(ancestor => ancestor.kind === 'project') || null) : null;
  const system = item?.kind === 'system' ? item : detail?.ancestors.find(a => a.kind === 'system');
  const project = item?.kind === 'project' ? item : detail?.ancestors.find(a => a.kind === 'project');
  const epicProjectClosed = item?.kind === 'epic' && ['completed', 'cancelled'].includes(project?.projectLifecycle || '');
  const tabs: Tab[] = !item ? [] : item.kind === 'story' ? [
    { id: 'overview', title: 'Acompanhamento' }, { id: 'specification', title: 'Especificação' }, { id: 'blockers', title: 'Impedimentos' },
    { id: 'delivery', title: 'Entrega de código' }, { id: 'tasks', title: 'Tarefas' }, { id: 'components', title: 'Componentes' },
    { id: 'activity', title: 'Auditoria' }, { id: 'releases', title: 'Releases' }, { id: 'manage', title: 'Configurações' },
  ] : [
    { id: 'overview', title: childKind ? plurals[childKind] : 'Acompanhamento' },
    ...(['system', 'project', 'epic'].includes(item.kind) ? [{ id: 'planning', title: 'Execução' }] : []),
    ...(['system', 'project', 'epic'].includes(item.kind) ? [{ id: 'conversations', title: 'Conversas' }] : []),
    ...(['system', 'task'].includes(item.kind) ? [{ id: 'components', title: 'Componentes' }] : []),
    ...(item.kind === 'system' ? [{ id: 'environments', title: 'Ambientes' }] : []),
    { id: 'activity', title: 'Auditoria' }, { id: 'manage', title: 'Configurações' },
  ];
  const selectedTab = tabs.some(tab => tab.id === search.get('tab')) ? search.get('tab')! : 'overview';
  const tabHref = (tab: string) => { const params = new URLSearchParams(search.toString()); if (tab === 'overview') params.delete('tab'); else params.set('tab', tab); return `${pathname}${params.size ? `?${params}` : ''}`; };
  const showChildren = !item || selectedTab === 'overview' && item.kind !== 'story' || item?.kind === 'story' && selectedTab === 'tasks';
  const children = item ? detail?.children || [] : items;
  const projectList = item?.kind === 'system';
  const systemList = pathname === '/systems' && !id;
  const showInactiveProjects = search.get('projects') === 'all';
  const showInactiveSystems = search.get('systems') === 'all';
  const showingInactive = projectList ? showInactiveProjects : showInactiveSystems;
  const inactiveCount = projectList ? children.filter(child => child.archived || ['completed', 'cancelled'].includes(child.projectLifecycle || 'active')).length : systemList ? children.filter(child => child.archived || child.status === 'inactive').length : 0;
  const visible = projectList && !showInactiveProjects ? children.filter(child => !child.archived && !['completed', 'cancelled'].includes(child.projectLifecycle || 'active')) : systemList && !showInactiveSystems ? children.filter(child => !child.archived && child.status === 'active') : projectList || systemList ? children : children.filter(child => !child.archived);
  const planningApproval = item?.kind === 'project' && item.status === 'awaiting_approval';

  useEffect(() => {
    request<{ personas: Persona[] }>('/personas', '').then(result => {
      setPersonas(result.personas);
      const stored = sessionStorage.getItem('sdlc-persona');
      if (stored && result.personas.some(p => p.id === stored)) setPersona(stored);
      else sessionStorage.removeItem('sdlc-persona');
    }).catch(failure => setError(failure.message));
  }, []);

  useEffect(() => {
    let active = true;
    const keepForm = preserveForm.current;
    const contextChanged = loadedContext.current !== pathname;
    loadedContext.current = pathname;
    setError('');
    // A refresh of this item must keep its workspace, conversation and drafts mounted.
    // Clear the previous item only when navigation changes the actual context.
    if (contextChanged) { setChildTotal(null); setLoading(true); setDetail(null); if (!keepForm) setForm(null); }
    preserveForm.current = false;
    if (contextChanged) setArchiveOpen(false);
    const load = overview || releaseRoute || assistantRoute || integrationsRoute ? Promise.resolve() : id ? request<Detail>(detailPath(id), '').then(result => {
      if (!active) return;
      setDetail(result);
      if (keepForm) { editVersion.current = result.item.version; setNotice('Dados atualizados; seu rascunho foi preservado. Revise o contexto mais recente antes de salvar novamente.'); }
    }) : request<{ items: Item[] }>('/items?kind=system&includeArchived=true', '').then(result => { if (active) setItems(result.items); });
    load.catch(failure => { if (active) setError(contextChanged ? failure.message : `${failure.message} O último contexto confirmado e seus rascunhos foram preservados.`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Read-only detail does not depend on the acting persona. Keep confirmations mounted when changing roles.
  }, [id, pathname, revision, overview, releaseRoute, assistantRoute, integrationsRoute]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || busy) return;
      request<Detail>(detailPath(id), '').then(next => { if (active) setDetail(next); }).catch(() => {});
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [id, busy]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (id) void request<Detail>(detailPath(id), '').then(next => { if (active) setDetail(next); }).catch(() => { if (active) setError('A atualização do contexto não chegou. Consulte os dados novamente; o último estado confirmado foi preservado.'); });
    };
    window.addEventListener('sdlc-plan-applied', refresh);
    return () => { active = false; window.removeEventListener('sdlc-plan-applied', refresh); };
  }, [id]);

  useEffect(() => { document.querySelector('.context-tabs [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selectedTab]);

  const begin = (mode: 'create' | 'edit') => {
    if (archivedContext) return;
    createKey.current = crypto.randomUUID();
    editVersion.current = item?.version || 0;
    setDraft({ name: mode === 'edit' ? item?.name || '' : '', description: mode === 'edit' ? item?.description || '' : '', key: '', repositoryIds: [] });
    setForm(mode); setError(''); setNotice('');
  };

  const creationRequest = search.get('create');
  useEffect(() => {
    if (loading || busy || error || archivedContext) return;
    const systemRequest = pathname === '/systems' && !id && creationRequest === 'system';
    const projectRequest = pathname === `/systems/${id}` && item?.id === id && item?.kind === 'system' && creationRequest === 'project';
    if (!systemRequest && !projectRequest) return;
    begin('create');
    const query = new URLSearchParams(search.toString()); query.delete('create');
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
    // Consume the navigation intent once; polling must not reset an editing draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationRequest, loading, busy, error, archivedContext, pathname, id, item?.id, item?.kind, router]);

  async function mutate(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); setRevision(value => value + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!persona || !canPlan) { setError('Selecione uma persona Administrador, Product Owner ou Arquiteto para salvar alterações. Seu rascunho foi preservado.'); return; }
    setBusy(true); setError('');
    try {
      if (form === 'edit' && item) {
        await request(`/items/${item.id}`, persona, { name: draft.name, description: draft.description, expectedVersion: editVersion.current }, 'PATCH');
        setForm(null); setRevision(value => value + 1); setNotice('Alterações salvas.');
      } else if (childKind) {
        const result = await request<{ item: Item }>('/items', persona, {
          kind: childKind, ...(item ? { parentId: item.id } : {}), name: draft.name, description: draft.description,
          ...(['system', 'project'].includes(childKind) ? { key: draft.key } : {}),
          ...(['project', 'story', 'task'].includes(childKind) ? { repositoryIds: draft.repositoryIds } : {}),
        }, 'POST', createKey.current);
        window.location.assign(href(result.item));
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  const statusHint = !item ? 'Escolha um Sistema para explorar seus Projetos.' : planningApproval ? 'Aguardando aprovação do planejamento.'
    : item.kind === 'system' && item.status === 'inactive' ? 'Sistema inativo. Consulte seus Projetos ou reative-o em Execução.'
    : item.kind === 'system' ? 'Escolha um Projeto para consultar seu planejamento e suas entregas.'
    : item.kind === 'project' ? 'Explore os Épicos ou consulte o ciclo do Projeto em Execução.'
    : item.kind === 'epic' ? 'Escolha uma História para acompanhar sua execução e próxima ação.'
    : item.kind === 'task' ? 'Atualize esta Tarefa pelas ações disponíveis ao lado.' : 'Acompanhe a situação da execução e sua próxima ação.';

  return <div className="shell navigation-shell">
    <a className="skip-link" href="#main">Ir para o conteúdo</a>
    <aside className="sidebar">
      <div className="brand">Dell Technologies<span>Portal SDLC</span></div>
      <nav aria-label="Principal">
        <Link href="/" className={overview ? 'selected' : ''} aria-current={overview ? 'page' : undefined}><Home size={19} />Visão geral</Link>
        <Link href="/assistant" className={assistantRoute ? 'selected' : ''} aria-current={assistantRoute ? 'page' : undefined}><MessageSquare size={19} />Assistente</Link>
        <Link href="/systems" className={!overview && !releaseRoute && !assistantRoute && !integrationsRoute ? 'selected' : ''} aria-current={!overview && !releaseRoute && !assistantRoute && !integrationsRoute ? 'page' : undefined}><FolderTree size={19} />Sistemas</Link>
        <Link href="/releases" className={releaseRoute ? 'selected' : ''} aria-current={releaseRoute ? 'page' : undefined}><Box size={19} />Releases</Link>
        <Link href="/integrations" className={integrationsRoute ? 'selected' : ''} aria-current={integrationsRoute ? 'page' : undefined}><Plug size={19} />Integrações</Link>
      </nav>
      <p className="sidebar-note">Da ideia à entrega.<br />Um processo, contexto completo.</p>
    </aside>
    <div className="workspace">
      <header className="topbar"><span>{overview ? 'Indicadores do processo' : assistantRoute ? 'Entrevista e especificação' : releaseRoute ? 'Composição de releases' : integrationsRoute ? 'Disponibilidade das integrações' : 'Planejamento e entrega'}</span><label className="persona">Modo demo local · Persona<select value={persona} onChange={event => { setPersona(event.target.value); sessionStorage.setItem('sdlc-persona', event.target.value); }}><option value="">Selecione para atuar</option>{personas.map(p => <option key={p.id} value={p.id}>{p.name} · {roleLabel(p.role)}</option>)}</select></label></header>
      <main id="main">
        <section className={`workflow-bar${journeyView ? ' story-journey-bar' : ''}${overview ? ' dashboard-workflow' : ''}`} aria-label="Situação e próxima ação">
          <nav className="breadcrumb" aria-label="Localização">
            {overview ? <span aria-current="page">Visão geral</span> : assistantRoute ? <span aria-current="page">Assistente</span> : releaseRoute ? <Link href="/releases">Releases</Link> : integrationsRoute ? <span aria-current="page">Integrações</span> : <Link href={item ? rememberedCollection('/systems') : '/systems'}>Sistemas</Link>}
            {releaseRoute && <span id="release-breadcrumb-context" />}
            {detail?.ancestors.map(ancestor => <span key={ancestor.id}><ChevronRight size={13} aria-hidden="true" /><Link href={rememberedCollection(href(ancestor))}>{names[ancestor.kind]}: {ancestor.name}</Link></span>)}
            {item && <span aria-current="page"><ChevronRight size={13} aria-hidden="true" />{names[item.kind]}: {item.name}</span>}
          </nav>
          {error && <ErrorState onRetry={() => { preserveForm.current = true; setRevision(value => value + 1); }}>{error} Seu rascunho permanece disponível.</ErrorState>}
          {notice && <p role="status" className="alert success">{notice}<button className="text-button" aria-label="Dispensar confirmação" onClick={() => setNotice('')}>Fechar</button></p>}
          {busy && <LoadingState>Processando solicitação…</LoadingState>}
          {archivedContext && <p className="archive-notice" role="status"><span className="badge">ARCHIVED</span>Registro arquivado. Consulta somente leitura; status e dados preservados.</p>}
          {!overview && !integrationsRoute && !archivedContext && !persona && <p className="persona-required" role="status"><ShieldCheck size={17} />Nenhuma persona selecionada. Você pode consultar; selecione uma persona no topo para atuar.</p>}
          {!journeyView && !archivedContext && !overview && !releaseRoute && !assistantRoute && !integrationsRoute && !loading && <div className="workflow-context">
            <div><strong>{form ? form === 'edit' ? `Editar ${names[item!.kind]}` : `Criar ${names[childKind!]}` : item ? `${names[item.kind]} · ${label(item.status)}` : 'Sistemas'} </strong><p>{form ? 'Preencha os dados abaixo e confirme aqui na faixa superior.' : statusHint}</p></div>
            <div className="actions">
              {form ? <><button type="submit" form="item-form" className="primary" disabled={busy || !canPlan}>{busy ? <><Spinner />Salvando…</> : 'Salvar'}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>Cancelar</button></> : <>
                {planningApproval && item && <button className="primary" disabled={!canApprove || busy} onClick={() => void mutate(() => request(`/items/${item.id}/approve`, persona, { expectedVersion: item.version }, 'POST'), 'Planejamento aprovado.')}><ShieldCheck size={17} />Aprovar {names[item.kind].toLowerCase()}</button>}
                {item?.kind === 'system' && selectedTab === 'manage' && <button disabled={!canPlan || busy} onClick={() => void mutate(() => request(`/items/${item.id}/status`, persona, { status: item.status === 'active' ? 'inactive' : 'active', expectedVersion: item.version }, 'POST'), item.status === 'active' ? 'Sistema inativado.' : 'Sistema reativado.')}>{item.status === 'active' ? 'Inativar sistema · INACTIVE' : 'Reativar sistema · ACTIVE'}</button>}
                {item?.kind === 'task' && (item.status === 'todo' ? ['doing'] : item.status === 'doing' ? ['todo', 'done'] : []).map(status => <button key={status} className={status === 'done' ? 'primary' : ''} disabled={!canPlan || busy} onClick={() => void mutate(() => request(`/items/${item.id}/status`, persona, { status, expectedVersion: item.version }, 'POST'), 'Status da tarefa atualizado.')}>{label(status)}</button>)}
                {item?.kind === 'task' && item.status === 'done' && <button type="submit" form="task-reopen" disabled={!canPlan || busy || reopenComment.trim().length < 10}>Reabrir como DOING</button>}
                {item && <button data-testid="edit-item" disabled={!canPlan || busy} onClick={() => begin('edit')}>Editar</button>}
                {childKind && <button data-testid="create-item" className="primary" disabled={!canPlan || busy} onClick={() => begin('create')}><Plus size={17} />{!item && !items.length ? 'Criar primeiro Sistema' : `Criar ${names[childKind].toLowerCase()}`}</button>}
              </>}
            </div>
          </div>}
          {!archivedContext && planningApproval && !form && !canApprove && <p className="workflow-hint">Aprovação requer persona Product Owner ou Administrador.</p>}
          {journeyView && <div id="story-journey-header" />}
          {!journeyView && item?.kind === 'story' && <><div id="story-workflow-actions" hidden={Boolean(form) || selectedTab === 'releases'} /><div id="release-workflow-actions" hidden={Boolean(form) || selectedTab !== 'releases'} /></>}
          {releaseRoute && <div id="release-workflow-actions" />}
        </section>

        {overview ? <Dashboard /> : assistantRoute ? <AssistantWorkspace persona={persona} canPlan={canPlan} /> : releaseRoute ? <Releases persona={persona} role={role} /> : integrationsRoute ? <Integrations /> : loading ? <LoadingState className="panel">Carregando planejamento…</LoadingState> : id && !item ? <section className="panel"><h1>Item indisponível</h1><p>Não foi possível carregar este item. Verifique a mensagem acima ou retorne aos Sistemas.</p><Link href="/systems">Voltar para Sistemas</Link></section> : archivedContext && detail ? <ArchivedItem detail={detail} /> : <>
          {journeyView && item && <StoryWorkspace item={item} persona={persona} canPlan={canPlan} tab={search.get('tab') || ''} headerTargetId="story-journey-header" onRefresh={() => window.dispatchEvent(new Event('sdlc-plan-applied'))} onEdit={() => begin('edit')} onCreate={() => begin('create')}
            planningContext={system && project ? <PlanningAssistant systemId={system.id} projectId={project.id} contextName={project.name} withinProject /> : <p className="hint">Consulte o Projeto de origem para planejar com a assistente.</p>}
            formTitle={form ? form === 'edit' ? `Editar ${names[item.kind].toLowerCase()}` : `Criar ${names[childKind!].toLowerCase()}` : undefined}
            formContent={form ? <section className="panel form-panel"><h2>{form === 'edit' ? `Editar ${names[item!.kind].toLowerCase()}` : `Criar ${names[childKind!].toLowerCase()}`}</h2>{item && form === 'create' && <p className="hint">Em {names[item.kind].toLowerCase()}: <strong>{item.name}</strong></p>}<form id="item-form" aria-label="Formulário do item" onSubmit={save}><label>Nome ou título <span>(obrigatório)</span><input autoFocus required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>{form === 'create' && ['system', 'project'].includes(childKind!) && <label>{childKind === 'system' ? 'Sigla' : 'Chave'} <span>(obrigatório)</span><input required minLength={childKind === 'system' ? 6 : 2} maxLength={childKind === 'system' ? 6 : 12} pattern={childKind === 'system' ? '[A-Z]{6}' : '[A-Z][A-Z0-9]{1,11}'} title={childKind === 'system' ? 'Informe exatamente 6 letras de A a Z.' : 'De 2 a 12 caracteres: comece com letra maiúscula e use apenas letras maiúsculas e números.'} value={draft.key} onChange={event => setDraft({ ...draft, key: childKind === 'system' ? event.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase() : event.target.value })} /><small>{childKind === 'system' ? 'Use exatamente 6 letras de A a Z. Minúsculas são convertidas para maiúsculas.' : 'De 2 a 12 letras maiúsculas ou números; comece com uma letra.'}</small></label>}<label>Descrição<textarea rows={4} maxLength={4000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>{form === 'create' && ['project', 'story', 'task'].includes(childKind!) && <RepositoryChoices repositories={(childKind === 'task' || childKind === 'project' ? detail?.repositories : detail?.availableRepositories) || []} value={draft.repositoryIds} onChange={repositoryIds => setDraft({ ...draft, repositoryIds })} />}<p className="hint form-save-note">Salvar e Cancelar estão na faixa superior, junto à localização.</p></form></section> : undefined}
            formActions={form ? blocked => <div className="actions"><button type="submit" form="item-form" className="primary" disabled={busy || !canPlan || blocked}>{busy ? <><Spinner />Salvando…</> : 'Salvar'}</button><button type="button" disabled={busy} onClick={() => setForm(null)}>Cancelar</button></div> : undefined}
            components={<Repositories key={item.id} itemId={item.id} repositories={detail?.repositories || []} available={detail?.availableRepositories || []} version={item.version} canPlan={canPlan && !busy} call={(path, body, method) => request(path, persona, body, method)} onChanged={() => setRevision(value => value + 1)} />}
            history={<HistoryQuery itemId={item.id} revision={revision} />}
            administration={<section className="panel"><h2>{item.kind === 'story' ? 'Configuração da História' : `Configurações de ${names[item.kind]}`}</h2><p>{item.kind === 'story' ? 'Use Editar na faixa superior para alterar o planejamento.' : 'Use Editar na faixa superior para alterar o planejamento.'}</p><button disabled={!canPlan || busy} onClick={() => setArchiveOpen(true)}>Arquivar {names[item.kind].toLowerCase()}</button></section>}
            manualActions={item.kind === 'task' ? <section><h3>Status da Tarefa planejada</h3><div className="actions">{(item.status === 'todo' ? ['doing'] : item.status === 'doing' ? ['todo', 'done'] : []).map(status => <button key={status} disabled={!canPlan || busy} onClick={() => void mutate(() => request(`/items/${item.id}/status`, persona, { status, expectedVersion: item.version }, 'POST'), 'Status da tarefa atualizado.')}>{label(status)}</button>)}</div>{item.status === 'done' && <form onSubmit={event => { event.preventDefault(); void mutate(() => request(`/items/${item.id}/status`, persona, { status: 'doing', expectedVersion: item.version, comment: reopenComment }, 'POST'), 'Tarefa reaberta.'); }}><label>Justificativa para reabrir<textarea minLength={10} required value={reopenComment} onChange={event => setReopenComment(event.target.value)} /></label><button disabled={!canPlan || busy || reopenComment.trim().length < 10}>Reabrir como DOING</button></form>}</section> : undefined}
            releases={item.kind === 'story' ? (choosing, onChoose) => <Releases persona={persona} role={role} storyId={item.id} systemId={system?.id} choosing={choosing} onChoose={onChoose} onChanged={() => window.dispatchEvent(new Event('sdlc-plan-applied'))} /> : undefined}
          />}
          {!journeyView && <>
          <div className="page-heading"><div><p className="eyebrow">{item ? `${names[item.kind]} · ${item.key}` : 'SEU ESPAÇO DE ENTREGA'}</p><h1>{item?.name || (items.length ? 'Sistemas' : 'Seu SDLC começa com um Sistema')}</h1>{item?.kind === 'system' && <p>Produto contínuo · repositórios e ambientes compartilhados entre Projetos.</p>}{item?.kind === 'project' && <p>Iniciativa temporária · utiliza repositórios do Sistema.</p>}{item ? <span className={`badge ${['approved', 'done', 'completed'].includes(item.status) ? 'positive' : ''}`}>{item.kind === 'project' ? 'Aprovação · ' : ''}{label(item.status)}</span> : <p>Do macro ao micro: Sistema → Projeto → Épico → História → Tarefa.</p>}</div></div>
          {item && <nav className="context-tabs" aria-label={`Seções de ${names[item.kind]}`}>{tabs.map(tab => <Link key={tab.id} href={tabHref(tab.id)} scroll={false} aria-current={selectedTab === tab.id ? 'page' : undefined}>{tab.title}{(tab.id === 'overview' && item.kind !== 'story' || tab.id === 'tasks') && childKind && childTotal !== null ? <span className="count">{childTotal}</span> : null}</Link>)}</nav>}

          {form && <section className="panel form-panel"><h2>{form === 'edit' ? `Editar ${names[item!.kind].toLowerCase()}` : `Criar ${names[childKind!].toLowerCase()}`}</h2>{item && form === 'create' && <p className="hint">Em {names[item.kind].toLowerCase()}: <strong>{item.name}</strong></p>}<form id="item-form" aria-label="Formulário do item" onSubmit={save}><label>Nome ou título <span>(obrigatório)</span><input autoFocus required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>{form === 'create' && ['system', 'project'].includes(childKind!) && <label>{childKind === 'system' ? 'Sigla' : 'Chave'} <span>(obrigatório)</span><input required minLength={childKind === 'system' ? 6 : 2} maxLength={childKind === 'system' ? 6 : 12} pattern={childKind === 'system' ? '[A-Z]{6}' : '[A-Z][A-Z0-9]{1,11}'} title={childKind === 'system' ? 'Informe exatamente 6 letras de A a Z.' : 'De 2 a 12 caracteres: comece com letra maiúscula e use apenas letras maiúsculas e números.'} value={draft.key} onChange={event => setDraft({ ...draft, key: childKind === 'system' ? event.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase() : event.target.value })} /><small>{childKind === 'system' ? 'Use exatamente 6 letras de A a Z. Minúsculas são convertidas para maiúsculas.' : 'De 2 a 12 letras maiúsculas ou números; comece com uma letra.'}</small></label>}<label>Descrição<textarea rows={4} maxLength={4000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>{form === 'create' && ['project', 'story', 'task'].includes(childKind!) && <RepositoryChoices repositories={(childKind === 'task' || childKind === 'project' ? detail?.repositories : detail?.availableRepositories) || []} value={draft.repositoryIds} onChange={repositoryIds => setDraft({ ...draft, repositoryIds })} />}<p className="hint form-save-note">Salvar e Cancelar estão na faixa superior, junto à localização.</p></form></section>}

          {item?.kind === 'project' && <p className="project-lifecycle-summary">Ciclo do Projeto <span className="badge">{label(item.projectLifecycle || 'active')}</span> <Link href={tabHref('planning')}>Consultar ciclo na aba Execução</Link></p>}
          {item?.kind === 'story' && <>
            <section className="panel" hidden={selectedTab !== 'specification'}><h2>Escopo registrado da História</h2><p className="description">{item.description || 'Nenhuma descrição adicionada. Use Editar para registrar o contexto da História.'}</p></section>
            <section className="panel story-cycle" hidden={selectedTab !== 'overview'}><div className="section-heading"><h2>Ciclo da História</h2><span className="badge">{label(item.status)}</span></div><p>Veja a etapa atual e consulte os detalhes pelas abas. Os próximos estágios só avançam quando executados e aprovados.</p><ol className="process" aria-label="Ciclo da História">{storyStatuses.map((status, index) => <li key={status} aria-current={item.status === status ? 'step' : undefined} className={item.status === status ? 'active' : ''}><span>{item.status === status ? <Circle size={17} /> : <span className="step-number">{index + 1}</span>}</span><strong>{label(status)}</strong></li>)}</ol><div className="gate-legend"><ShieldCheck size={17} /><span>Especificação, G1, codificação, Code Review e Security Scan estão disponíveis neste fluxo. A integração exige as duas verificações aprovadas para o mesmo commit. Testes, homologação e deploy dependem das próximas integrações.</span></div></section>
            <StoryExecution storyId={item.id} persona={persona} version={item.version} status={item.status} tab={['overview', 'specification', 'blockers', 'delivery'].includes(selectedTab) ? selectedTab as 'overview' | 'specification' | 'blockers' | 'delivery' : 'hidden'} actionTargetId="story-workflow-actions" onTabChange={tab => router.push(tabHref(tab), { scroll: false })} onRefresh={() => window.dispatchEvent(new Event('sdlc-plan-applied'))} />
          </>}

          {childKind && showChildren && <ItemCollection kind={childKind} parentId={item?.id} parentName={item?.name} revision={revision} onCount={setChildTotal} />}

          {item && ['system', 'project', 'epic'].includes(item.kind) && <div hidden={selectedTab !== 'planning'}>
            <PlanningAssistant systemId={system?.id || item.id} projectId={project?.id} contextName={assistantContext?.name} withinProject={item.kind === 'epic'} />
            {item.kind === 'system' ? <SystemLifecycle key={item.id} value={item.status} version={item.version} enabled={canPlan && !busy} onChange={async body => { const result = await request<{ item: Item }>(`/items/${item.id}/status`, persona, body, 'POST'); setDetail(current => current?.item.id === item.id ? { ...current, item: result.item } : current); setRevision(value => value + 1); }} /> : item.kind === 'epic' ? <EpicLifecycle projectClosed={epicProjectClosed} key={item.id} value={item.status} version={item.version} enabled={canPlan && !busy} onChange={async body => { const result = await request<{item: Item}>(`/items/${item.id}/status`, persona, body, 'POST'); setDetail(current => current?.item.id === item.id ? {...current, item: result.item} : current); setRevision(value => value + 1); }} /> : <ProjectLifecycle value={item.projectLifecycle || 'active'} version={item.version} enabled={canPlan && !busy} onChange={async body => { await request(`/items/${item.id}/lifecycle`, persona, body, 'POST'); setRevision(value => value + 1); }} />}
          </div>}

          {item && ['system', 'story', 'task'].includes(item.kind) && <div hidden={selectedTab !== 'components'}>{item.kind !== 'system' && <Repositories key={item.id} itemId={item.id} repositories={detail?.repositories || []} available={detail?.availableRepositories || []} version={item.version} canPlan={canPlan && !busy} call={(path, body, method) => request(path, persona, body, method)} onChanged={() => setRevision(value => value + 1)} />}{item.kind === 'system' && <section className="panel"><h2>Integração GitLab do Sistema</h2><p><span className="badge">{label(String(item.data.gitlabState || 'not_configured'))}</span></p><p>{String(item.data.gitlabMessage || 'O provisionamento será processado em segundo plano após a criação solicitada por você.')}</p>{typeof item.data.gitlabUrl === 'string' && /^https?:\/\//.test(item.data.gitlabUrl) && <p><a href={item.data.gitlabUrl} target="_blank" rel="noreferrer">Abrir grupo no GitLab ↗</a></p>}{typeof item.data.gitlabGroupPath === 'string' && <p>Caminho: {String(item.data.gitlabGroupPath)}</p>}{['failed', 'not_configured'].includes(String(item.data.gitlabState)) && <button disabled={!canPlan || busy} onClick={() => void mutate(() => request(`/items/${item.id}/provision`, persona, { expectedVersion: item.version }, 'POST'), 'Nova tentativa de provisionamento solicitada.')}>Tentar provisionar novamente</button>}</section>}</div>}

          {item?.kind === 'system' && <section hidden={selectedTab !== 'environments'} className="panel"><h2>Ambientes do Sistema</h2><p>Cada repositório mantém seus ambientes ao longo dos diferentes Projetos. Cadastrar um repositório não executa deploy.</p><div className="environment-grid">{detail?.environments.map(environment => <div className="environment" key={environment.id}><strong>{environment.repositoryName} · {environment.code}</strong><span className="badge">{label(environment.liveStatus)}</span><p>{environment.currentVersion ? `Versão ${environment.currentVersion}` : 'Nenhuma versão implantada.'}</p>{environment.url && /^https?:\/\//.test(environment.url) && <a href={environment.url} target="_blank" rel="noreferrer">Abrir ambiente ↗</a>}</div>)}</div>{!detail?.environments.length && <p className="hint">Nenhum ambiente registrado.</p>}</section>}

          {item && selectedTab === 'activity' && <HistoryQuery itemId={item.id} revision={revision} />}
          {item && selectedTab === 'conversations' && <ConversationHistory itemId={item.id} persona={persona} canPlan={canPlan} revision={revision} />}

          {item && <section className="panel" hidden={selectedTab !== 'manage'}><h2>Configurações de {names[item.kind]}</h2><p>Use Editar na faixa superior para alterar o nome e a descrição.</p>{item.kind === 'system' && <><h3>Status do Sistema · {label(item.status)}</h3><p>Use {item.status === 'active' ? 'Inativar sistema' : 'Reativar sistema'} na faixa superior. A mudança é reversível e preserva os Projetos, repositórios, ambientes e histórico.</p></>}<details className="integration"><summary>Arquivamento</summary><p>Arquivar retira este item e seus descendentes do planejamento ativo. Repositórios GitLab serão preservados.</p><button disabled={!canPlan || busy} onClick={() => setArchiveOpen(true)}>Arquivar {names[item.kind].toLowerCase()}</button></details></section>}


          {item?.kind === 'task' && item.status === 'done' && <section className="panel" hidden={selectedTab !== 'overview'}><h2>Reabrir Tarefa</h2><form id="task-reopen" onSubmit={event => { event.preventDefault(); void mutate(() => request(`/items/${item.id}/status`, persona, { status: 'doing', expectedVersion: item.version, comment: reopenComment }, 'POST'), 'Tarefa reaberta.'); }}><label>Justificativa para reabrir<textarea minLength={10} required value={reopenComment} onChange={event => setReopenComment(event.target.value)} /></label><p className="hint">Após informar a justificativa, confirme “Reabrir como DOING” na faixa superior.</p></form></section>}

          {item && selectedTab === 'overview' && <section className="panel context-summary"><h2>Contexto</h2><p className="description">{item.description || 'Nenhuma descrição adicionada.'}</p>{detail?.ancestors.length ? <Link className="parent-link" href={href(detail.ancestors[detail.ancestors.length - 1])}>← Voltar para {detail.ancestors[detail.ancestors.length - 1].name}</Link> : null}{system && item.kind !== 'task' && <p><Link href={`/releases?system=${system.id}`}>Consultar releases do Sistema <ArrowRight size={14} /></Link></p>}</section>}
          {item?.kind === 'story' && <div hidden={selectedTab !== 'releases'}><Releases persona={persona} role={role} storyId={item.id} systemId={system?.id} onChanged={() => window.dispatchEvent(new Event('sdlc-plan-applied'))} /></div>}

          </>}
          {archiveOpen && item && <ArchiveDialog onCancel={() => setArchiveOpen(false)}><h2 id="archive-title">Arquivar {item.name}?</h2><p>Este item e todos os seus descendentes serão arquivados. Nenhum repositório GitLab será excluído.</p><div className="actions"><button autoFocus disabled={busy} onClick={() => setArchiveOpen(false)}>Cancelar</button><button disabled={busy} onClick={() => void mutate(async () => { await request(`/items/${item.id}`, persona, { expectedVersion: item.version }, 'DELETE'); window.location.assign(detail?.ancestors.length ? href(detail.ancestors[detail.ancestors.length - 1]) : '/systems'); }, 'Item arquivado.')}>Confirmar arquivamento</button></div></ArchiveDialog>}
          {!canPlan && <p className="hint permission-note">Para planejar, selecione uma persona Administrador, Product Owner ou Arquiteto. Os demais papéis têm acesso de leitura nesta entrega.</p>}
        </>}
      </main>
      <footer>Portal SDLC · Planejamento criado por você</footer>
    </div>
  </div>;
}
