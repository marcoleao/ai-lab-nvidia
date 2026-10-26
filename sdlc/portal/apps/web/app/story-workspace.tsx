'use client';

import Link from 'next/link';
import LifecyclePanel from './lifecycle-panel';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, ChevronRight, Clock3, ExternalLink, MessageSquare, ShieldCheck } from 'lucide-react';
import ExecutionDiscussion from './execution-discussion';
import MergeDiscussion from './merge-discussion';
import Assistant from './assistant';
import ConversationHistory from './conversation-history';
import './story-workspace.css';
import StorySpecification from './story-specification';
import TaskResults from './task-results';
import { Spinner, LoadingState, ErrorState, FilterPanel, Pagination, SortHeader, displayDate } from './experience-ui';

type Item = { id: string; key: string; name: string; kind: string; description: string; status: string; version: number; createdAt?: string; updatedAt?: string; data?: Record<string, unknown> };
type Finding = { severity: string; path: string; line: number; message: string };
type Attempt = { id: string; state: string; sourceType?: string; stage?: string; sha?: string | null; summary?: string | null; error?: string | null; findings?: Finding[]; evidence?: Record<string, unknown> | null; createdAt: string; updatedAt?: string; finishedAt?: string | null; heartbeatAt?: string | null; events?: Event[] };
type Event = { id: string; type?: string; title?: string; message?: string; createdAt?: string; timestamp?: string; activityId?: string; attemptId?: string };
type Activity = { id: string; kind: string; label: string; taskId: string | null; state: string; currentAttemptId?: string | null; attempts: Attempt[]; legacy?: boolean; links?: { taskId: string; scope: string; completion: string }[] };
type Task = Item & { activityKind?: string; operationalState?: string; processOwned?: boolean; managed?: boolean; activities?: Activity[] };
type Action = { id: string; kind?: string; label: string; enabled: boolean; reason?: string; path?: string; method?: string; body?: Record<string, unknown>; href?: string; confirmation?: { title: string; description: string; checkboxLabel?: string } };
type Run = { id: string; state: string; stage: string; createdAt?: string; commitSha?: string | null; branch?: string | null; mergeRequestUrl?: string | null; specification?: { requirements: string; architecture: string; testCases: { criterionIndex: number; description: string }[]; risks: string[] } | null; validationIssues?: { path: string; code: string; message: string }[]; discussionVersion?: number };
type Journey = {
  story: Item; current: { phase: string; label?: string; state: string; taskId?: string | null; activityId?: string | null; title: string; message?: string; updatedAt?: string };
  nextAction: Action | null; secondaryActions?: Action[]; tasks: Task[]; activities: Activity[]; events?: Event[];
  run?: Run | null; chat?: { mode: 'execution' | 'merge' | null; executionId?: string; enabled: boolean; reason?: string; guidance?: string; version?: number };
  permissions?: { canAct: boolean; canManageLifecycle?: boolean };
  signals?: { lastEventAt?: string | null; lastHeartbeatAt?: string | null; heartbeatStaleAfterMs?: number; provider?: string; stage?: string; waitingSince?: string; queuedAt?: string; startedAt?: string; queueReason?: string; legacy?: boolean };
  binding?: { activityId?: string; enabled?: boolean; expectedLinksVersion: string; tasks: { id: string; key: string; name: string; description: string; linked: boolean; scope?: string; completion?: string }[] };
};
type Pending = { key: string; persona: string; path: string; method: string; body?: Record<string, unknown>; label: string; targetLabel?: string };
type Props = { item: Item; persona: string; tab: string; headerTargetId: string; onRefresh: () => void; onEdit: () => void; onCreate: () => void; canPlan: boolean; administration: ReactNode; components: ReactNode; history: ReactNode; releases?: (choosing: boolean, onChoose: () => void) => ReactNode; formContent?: ReactNode; formActions?: (blocked: boolean) => ReactNode; formTitle?: string; manualActions?: ReactNode; planningContext?: ReactNode };

const PHASES = ['SPECIFICATION', 'APPROVED', 'CODING', 'CODE REVIEW', 'SECURITY SCAN', 'TESTING', 'UAT', 'PRODUCTION', 'COMPLETED', 'CANCELLED'];
const label = (value?: string | null) => value === 'todo' ? 'TO DO' : (value || '').replaceAll('_', ' ').toUpperCase();
const date = displayDate;
const operationLabel: Record<string, string> = { queued: 'Na fila', running: 'Em processamento', waiting_input: 'Aguardando sua orientação', waiting_approval: 'Aguardando aprovação', blocked: 'Impedimento', failed: 'Falha na atividade', succeeded: 'Resultado registrado', passed: 'Verificação aprovada', stale: 'Revisão desatualizada', cancelled: 'Cancelada', not_started: 'Aguardando início', waiting_human: 'Aguardando você', waiting_dependency: 'Aguardando próxima etapa' };
const activeState = (value?: string) => ['queued', 'running'].includes(value || '');
const safeUrl = (value?: string | null) => value && /^https?:\/\//i.test(value) ? value : null;
const badge = (state: string, processing = false) => <span className="sw-badge" data-state={state}>{processing && activeState(state) && <Spinner />}{state === 'failed' && <AlertCircle size={14} aria-hidden="true" />}{label(state)}</span>;

function useCollectionQuery(namespace: string, defaults: Record<string, string>) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const values = { ...defaults };
  for (const key of Object.keys(defaults)) values[key] = search.get(`${namespace}.${key}`) ?? defaults[key];
  const update = (changes: Record<string, string | number>) => {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) value === '' ? params.delete(`${namespace}.${key}`) : params.set(`${namespace}.${key}`, String(value));
    router.push(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  };
  return { values, update };
}

function useFilterDraft(key: string, applied: Record<string, string>) {
  const signature = JSON.stringify(applied), [draft, setDraft] = useState(applied);
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(key) || 'null'); setDraft(saved?.signature === signature ? saved.values : applied); }
    catch { setDraft(applied); }
  }, [key, signature]);
  const remember = (values: Record<string, string>, nextApplied = applied) => {
    setDraft(values);
    try { sessionStorage.setItem(key, JSON.stringify({ signature: JSON.stringify(nextApplied), values })); } catch {}
  };
  return { draft, remember };
}

function TaskCollection({ storyId, rows, currentTaskId, currentState, refresh }: { storyId: string; rows: Task[]; currentTaskId?: string | null; currentState: string; refresh: number }) {
  const pathname = usePathname(), search = useSearchParams();
  const { values, update } = useCollectionQuery('tasks', { q: '', filter: 'all', status: '', sort: 'createdAt', direction: 'desc', page: '1' });
  const applied = { q: values.q, filter: values.filter, status: values.status };
  const { draft, remember } = useFilterDraft(`sdlc-tasks-query:${storyId}`, applied);
  const [result, setResult] = useState<{ items: Task[]; total: number; page: number; pageSize: number; request: string; revision: string } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const ids = values.filter === 'attention' ? currentTaskId || 'none' : values.filter === 'blocked' ? rows.filter(task => ['blocked', 'failed', 'waiting_input'].includes(task.operationalState || '')).map(task => task.id).join(',') || 'none' : '';
  const status = values.filter === 'doing' ? 'doing' : values.status;
  const params = new URLSearchParams({ kind: 'task', parentId: storyId, q: values.q, sort: values.sort, direction: values.direction, page: values.page });
  if (status) params.set('status', status);
  if (ids) params.set('ids', ids);
  const request = params.toString(), revision = rows.map(task => `${task.id}:${task.version}:${task.status}`).join('|');
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setError('');
    void fetch(`/api/collections/items?${request}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw Error(value.error?.message || value.message || 'Não foi possível consultar as Tarefas.');
      if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.page) || value.pageSize !== 20) throw Error('A resposta da consulta de Tarefas está incompleta. Atualize a consulta.');
      if (active) setResult({ ...value, request, revision });
    }).catch(failure => { if (active && failure.name !== 'AbortError') setError(failure instanceof Error ? failure.message : 'A consulta de Tarefas não chegou.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request, storyId, refresh, retry]);
  const quick = (filter: string) => { const status = filter === 'doing' ? 'doing' : ''; remember({ ...draft, filter, status }, { ...applied, filter, status }); update({ filter, status, page: 1 }); };
  const titles: Record<string, string> = { all: 'Todas', attention: 'Exige atenção agora', doing: 'Em andamento', blocked: 'Impedidas' };
  const confirmedQuery = new URLSearchParams(result?.request || request);
  const confirmedSort = confirmedQuery.get('sort') || 'createdAt', confirmedDirection = confirmedQuery.get('direction') === 'asc' ? 'asc' : 'desc';
  const sort = (column: string) => update({ sort: column, direction: values.sort === column && values.direction === 'asc' ? 'desc' : 'asc', page: 1 });
  return <section className="sw-collection" aria-label="Consulta de Tarefas">
    <FilterPanel title="Filtrar Tarefas" id={`task-filters-${storyId}`}>
      <div className="sw-filters" aria-label="Atalhos de Tarefas">{Object.entries(titles).map(([value, title]) => <button type="button" key={value} aria-pressed={values.filter === value} onClick={() => quick(value)}>{title}</button>)}<p className="hint">Os atalhos aplicam a situação imediatamente. A busca pendente é preservada.</p></div>
      <form onSubmit={event => { event.preventDefault(); update({ ...draft, page: 1 }); }}>
        <div className="sw-query-fields"><label>Buscar Tarefa<input type="search" value={draft.q} onChange={event => remember({ ...draft, q: event.target.value })} placeholder="Nome ou chave" /></label><label>Status da Tarefa<select value={draft.status} onChange={event => remember({ ...draft, status: event.target.value, filter: draft.filter === 'doing' ? 'all' : draft.filter })}><option value="">Todos os status</option>{['todo', 'doing', 'done', 'cancelled'].map(status => <option value={status} key={status}>{label(status)}</option>)}</select></label></div>
        <div className="actions"><button type="submit">Aplicar filtros</button><button type="button" onClick={() => { remember({ q: '', filter: 'all', status: '' }, { q: '', filter: 'all', status: '' }); update({ q: '', filter: 'all', status: '', page: 1 }); }}>Limpar filtros</button></div>{JSON.stringify(draft) !== JSON.stringify(applied) && <p className="hint" role="status">Filtros alterados. Use Aplicar filtros.</p>}
      </form>
    </FilterPanel>
    <p className="sw-query-scope"><strong>Recorte aplicado:</strong> Tarefas desta História · {titles[values.filter] || values.filter}{values.q && ` · Busca: ${values.q}`}{values.status && ` · Status: ${label(values.status)}`} · {result ? result.request === request ? `${result.total} resultados` : 'Aguardando confirmação deste recorte; o resultado anterior está identificado abaixo.' : 'Total ainda não confirmado'}</p>
    {result && result.request !== request && <p className="hint" role="status">Resultado anterior confirmado: {result.total} Tarefas. Aguarde a consulta do novo recorte.</p>}{result && result.revision !== revision && !loading && <p className="hint" role="status">Há atualizações nas Tarefas. A ordem e a página consultadas foram preservadas. <button type="button" onClick={() => setRetry(value => value + 1)}>Atualizar lista de Tarefas</button></p>}
    <p className="experience-sort-hint">Clique no nome da coluna para ordenar; clique novamente para inverter a direção.</p>
    {loading && <LoadingState>{result ? 'Atualizando Tarefas. O último resultado confirmado permanece visível.' : 'Consultando Tarefas da História…'}</LoadingState>}{error && <ErrorState onRetry={() => setRetry(value => value + 1)}>{error}{result && <p>O último resultado confirmado foi preservado; ele pode pertencer ao recorte anterior.</p>}</ErrorState>}
    <Pagination page={result?.page || Number(values.page)} total={result?.total || 0} pageSize={20} onPageChange={page => update({ page })} label="Paginação das Tarefas" disabled={loading} />
    <div className="table-wrap" role="region" aria-label="Resultados de Tarefas" tabIndex={0} data-testid="journey-task-list"><table><caption className="sr-only">Tarefas desta História · {result?.total ?? 'Quantidade não confirmada'} resultados</caption><thead><tr><SortHeader column="name" label="Nome" sort={confirmedSort} direction={confirmedDirection} onSort={sort} /><SortHeader column="status" label="Status" sort={confirmedSort} direction={confirmedDirection} onSort={sort} /><SortHeader column="createdAt" label="Criado em" sort={confirmedSort} direction={confirmedDirection} onSort={sort} /><SortHeader column="updatedAt" label="Atualizado" sort={confirmedSort} direction={confirmedDirection} onSort={sort} /></tr></thead><tbody>{result?.items.map(item => {
      const metadata = rows.find(row => row.id === item.id), task = { ...item, processOwned: metadata?.processOwned };
      const target = `/tasks/${task.id}${search.size ? `?${new URLSearchParams({ returnTo: `${pathname}?${search}` })}` : ''}`;
      return <tr key={task.id}><td><Link className="item-link" href={target}><small>{task.key}</small>{task.name}<ArrowRight size={16} /></Link><small>{task.processOwned ? 'Atividade do processo' : 'Trabalho planejado'}</small>{task.id === currentTaskId && <p className="sw-current-task">Atividade atual · {operationLabel[currentState] || label(currentState)}</p>}</td><td>{badge(task.status)}</td><td>{displayDate(task.createdAt)}</td><td>{displayDate(task.updatedAt)}</td></tr>;
    })}</tbody></table></div>
    {!loading && !error && result?.total === 0 && <p className="sw-empty">Nenhuma Tarefa neste recorte. Ajuste ou limpe os filtros; consultar não altera o planejamento.</p>}
    <Pagination page={result?.page || Number(values.page)} total={result?.total || 0} pageSize={20} onPageChange={page => update({ page })} label="Paginação das Tarefas ao final" disabled={loading} />
  </section>;
}

function AttemptCollection({ taskId, attempts, processingAllowed }: { taskId: string; attempts: (Attempt & { activity: Activity })[]; processingAllowed: boolean }) {
  const { values, update } = useCollectionQuery('attempts', { q: '', state: '', sort: 'createdAt', direction: 'desc', page: '1' });
  const search = useSearchParams(), applied = { q: values.q, state: values.state }, { draft, remember } = useFilterDraft(`sdlc-attempts-query:${taskId}`, applied);
  const selected = attempts.filter(attempt => (!values.state || attempt.state === values.state) && (!values.q || `${attempt.id} ${attempt.activity.label} ${attempt.sha || ''} ${attempt.summary || ''}`.toLocaleLowerCase('pt-BR').includes(values.q.toLocaleLowerCase('pt-BR'))));
  selected.sort((a, b) => (values.sort === 'state' ? a.state.localeCompare(b.state) : a.createdAt.localeCompare(b.createdAt)) * (values.direction === 'asc' ? 1 : -1) || a.id.localeCompare(b.id));
  const page = Math.min(Math.max(1, Number(values.page) || 1), Math.max(1, Math.ceil(selected.length / 20))), shown = selected.slice((page - 1) * 20, page * 20);
  const href = (id: string) => { const params = new URLSearchParams(search.toString()); params.set('tab', 'evidence'); params.set('attempt', id); return `/tasks/${taskId}?${params}`; };
  return <section className="sw-collection" aria-label="Consulta de tentativas">
    <FilterPanel title="Filtrar tentativas" id={`attempt-filters-${taskId}`}><form onSubmit={event => { event.preventDefault(); update({ ...draft, page: 1 }); }}><div className="sw-query-fields"><label>Buscar tentativa, resumo ou commit<input type="search" value={draft.q} onChange={event => remember({ ...draft, q: event.target.value })} /></label><label>Resultado da tentativa<select value={draft.state} onChange={event => remember({ ...draft, state: event.target.value })}><option value="">Todos os resultados</option>{[...new Set(attempts.map(attempt => attempt.state))].sort().map(state => <option key={state} value={state}>{label(state)}</option>)}</select></label></div><div className="actions"><button type="submit">Aplicar filtros</button><button type="button" onClick={() => { remember({ q: '', state: '' }, { q: '', state: '' }); update({ q: '', state: '', page: 1 }); }}>Limpar filtros</button></div>{JSON.stringify(draft) !== JSON.stringify(applied) && <p className="hint" role="status">Filtros alterados. Use Aplicar filtros.</p>}</form></FilterPanel>
    <p className="sw-query-scope"><strong>Recorte aplicado:</strong> Tentativas vinculadas a esta Tarefa{values.q && ` · Busca: ${values.q}`}{values.state && ` · Resultado: ${label(values.state)}`} · {selected.length} resultados</p><p className="hint">A situação e os gates atuais são independentes desta consulta. Nesta versão, os registros de tentativas vinculadas são carregados pela jornada e paginados nesta tela. O detalhamento de relatórios de qualidade considera até 200 verificações mais recentes; a ausência de achados antigos nesta consulta não comprova aprovação. A trilha de auditoria paginada fica na aba Auditoria.</p>
    <div className="sw-query-order"><label>Ordenar por<select value={values.sort} onChange={event => update({ sort: event.target.value, page: 1 })}><option value="createdAt">Solicitação</option><option value="state">Resultado</option></select></label><button type="button" aria-label="Alterar direção das tentativas" onClick={() => update({ direction: values.direction === 'asc' ? 'desc' : 'asc', page: 1 })}>{values.direction === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'}</button></div>
    <Pagination page={page} total={selected.length} onPageChange={page => update({ page })} label="Paginação das tentativas" />{shown.length ? <ol className="sw-attempts">{shown.map(attempt => <li key={attempt.id}><Link href={href(attempt.id)} scroll={false}><strong>{attempt.activity.label || label(attempt.activity.kind)} · tentativa {attempts.length - attempts.findIndex(value => value.id === attempt.id)}</strong>{badge(attempt.state, processingAllowed && attempt.id === attempt.activity.currentAttemptId)}<span>{date(attempt.createdAt)} · America/Sao_Paulo{attempt.sha ? ` · ${attempt.sha.slice(0, 12)}` : ''}</span></Link></li>)}</ol> : <p className="sw-empty">Nenhuma tentativa neste recorte. Ajuste ou limpe os filtros.</p>}<Pagination page={page} total={selected.length} onPageChange={page => update({ page })} label="Paginação das tentativas ao final" />
  </section>;
}

export default function StoryWorkspace(props: Props) { return <Workspace key={props.item.id} {...props} />; }

function Workspace({ item, persona, tab, headerTargetId, onRefresh, onEdit, onCreate, canPlan, administration, components, history, releases, formContent, formActions, formTitle, manualActions, planningContext }: Props) {
  const router = useRouter(), search = useSearchParams();
  const [data, setData] = useState<Journey | null>(null), [loadError, setLoadError] = useState(''), [lastChecked, setLastChecked] = useState('');
  const [refresh, setRefresh] = useState(0), [interactionTab, setInteractionTab] = useState('action');
  const [busy, setBusy] = useState(false), [discussionBusy, setDiscussionBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Pending | null>(null), [confirmation, setConfirmation] = useState<Action | null>(null), [confirmed, setConfirmed] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [bindingOpen, setBindingOpen] = useState(false), [links, setLinks] = useState<Record<string, { scope: string; completion: string }>>({});
  const [bindingDraftBase, setBindingDraftBase] = useState<{ expectedVersion: number; expectedLinksVersion: string } | null>(null);
  const callback = useRef(onRefresh); callback.current = onRefresh;
  const panel = useRef<HTMLElement>(null), header = useRef<HTMLElement>(null), observed = useRef('');
  const focusRequest = useRef<'process' | 'release' | 'delivery' | null>(null);
  const stored = `sdlc-journey:${item.id}`;
  const isTask = item.kind === 'task', selectedAttemptId = search.get('attempt');
  const story = data?.story;
  const selectedTask = isTask ? data?.tasks.find(task => task.id === item.id) : null;
  const activities = data?.activities || [];
  const selectedActivities = isTask ? activities.filter(activity => activity.taskId === item.id || activity.links?.some(link => link.taskId === item.id)) : [];
  const controlledTask = Boolean(selectedTask?.managed || selectedTask?.processOwned || selectedActivities.some(activity => activity.links?.some(link => link.taskId === item.id && link.completion === 'publish_code')));
  const manualTask = Boolean(selectedTask && selectedTask.managed === false && !controlledTask);
  const attempts = selectedActivities.flatMap(activity => activity.attempts.map(attempt => ({ ...attempt, activity }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedActivity = selectedActivities.find(activity => activity.id === data?.current.activityId) || selectedActivities.find(activity => activity.taskId === item.id) || selectedActivities[0];
  const defaultAttempt = selectedActivity?.currentAttemptId ? attempts.find(attempt => attempt.id === selectedActivity.currentAttemptId && attempt.sourceType !== 'merge_discussion') : attempts.find(attempt => attempt.activity.id === selectedActivity?.id && attempt.sourceType !== 'merge_discussion');
  const selectedAttempt = selectedAttemptId ? attempts.find(attempt => attempt.id === selectedAttemptId) : defaultAttempt;
  const historical = Boolean(selectedAttemptId && (selectedAttemptId !== defaultAttempt?.id || selectedAttempt?.sourceType === 'merge_discussion'));
  const sharedCurrentActivity = Boolean(isTask && data?.current.activityId && selectedActivities.some(activity => activity.id === data.current.activityId));
  const offCurrent = isTask && Boolean(data && data.current.taskId !== item.id && !sharedCurrentActivity);
  const currentContext = !historical && !offCurrent;
  const status = data?.current.state || 'unknown';
  const heartbeatStale = Boolean(activeState(status) && data?.signals?.lastHeartbeatAt && data.signals.heartbeatStaleAfterMs && Date.now() - new Date(data.signals.lastHeartbeatAt).getTime() > data.signals.heartbeatStaleAfterMs);
  const processing = activeState(status) && !heartbeatStale && !loadError;
  const planningAllowed = canPlan && data?.permissions?.canAct !== false;
  const currentTask = data?.tasks.find(task => task.id === data.current.taskId);
  const previousWork = activities.filter(activity => !activity.taskId && activity.legacy);
  const defaultTab = isTask ? 'overview' : 'tasks';
  const requestedTab = tab || defaultTab;
  const normalizedTab = isTask
    ? requestedTab === 'blockers' || ['delivery', 'releases'].includes(requestedTab) ? 'planning' : ['components', 'manage'].includes(requestedTab) ? 'more' : requestedTab
    : requestedTab === 'overview' ? 'tasks' : ['blockers', 'delivery', 'releases'].includes(requestedTab) ? 'planning' : ['activity', 'manage'].includes(requestedTab) ? 'more' : ['tasks', 'planning', 'specification', 'conversations', 'components', 'more'].includes(requestedTab) ? requestedTab : 'tasks';
  const tabs = isTask ? [['overview', 'Resumo'], ['planning', 'Execução'], ['evidence', 'Evidências'], ['attempts', 'Tentativas'], ['conversations', 'Conversas'], ['activity', 'Auditoria'], ['more', 'Mais']] : [['tasks', 'Tarefas'], ['planning', 'Execução'], ['specification', 'Especificação'], ['conversations', 'Conversas'], ['components', 'Componentes'], ['more', 'Mais']];
  const href = (target: string) => {
    const params = new URLSearchParams(search.toString());
    params.delete('interact');
    const view = params.get('process');
    if (target === 'planning' ? !['action', 'conversation', 'processing', 'administration', ...(isTask ? ['release'] : ['release', 'delivery'])].includes(view || '') : isTask && target === 'delivery' ? view !== 'release' : true) params.delete('process');
    if (target === defaultTab) params.delete('tab'); else params.set('tab', target);
    return `/${isTask ? 'tasks' : 'stories'}/${item.id}${params.size ? `?${params}` : ''}`;
  };
  const returnTo = search.get('returnTo'), storyHref = returnTo && story && (returnTo === `/stories/${story.id}` || returnTo.startsWith(`/stories/${story.id}?`)) ? returnTo : `/stories/${story?.id || ''}`;

  function reload() { setRefresh(value => value + 1); callback.current(); }
  function remember(value: Pending | null) { setPending(value); try { if (value) sessionStorage.setItem(stored, JSON.stringify(value)); else sessionStorage.removeItem(stored); } catch {} }
  function reveal(view = 'action', replace = false) {
    setInteractionTab(view);
    focusRequest.current = !isTask && view === 'release' ? 'release' : !isTask && view === 'delivery' ? 'delivery' : 'process';
    const target = 'planning';
    const params = new URLSearchParams(search.toString());params.delete('interact');params.set('tab', target);params.set('process', view);
    const base = `/${isTask ? 'tasks' : 'stories'}/${item.id}`;
    const destination = `${base}?${params}`;
    if (destination !== `${base}?${search}`) router[replace ? 'replace' : 'push'](destination, { scroll: false });
    setTimeout(focusCentral, 0);
  }
  function focusCentral() {
    if (!focusRequest.current) return;
    const target = focusRequest.current === 'release' ? document.getElementById(`story-release-${item.id}`) : focusRequest.current === 'delivery' ? document.getElementById(`story-delivery-${item.id}`) : panel.current;
    if (!target || target.hidden || !target.getClientRects().length) return;
    target.focus({ preventScroll: true });target.scrollIntoView({ block: 'start', behavior: 'auto' });focusRequest.current = null;
  }
  function continueCurrent() {
    if (currentTask && (!isTask || currentTask.id !== item.id || historical)) router.push(`/tasks/${currentTask.id}?tab=planning&process=action`, { scroll: false });
    else if (isTask && !currentTask && story) router.push(`/stories/${story.id}?tab=planning&process=action`, { scroll: false });
    else reveal();
  }

  useEffect(() => { setHeaderTarget(document.getElementById(headerTargetId)); }, [headerTargetId]);
  useEffect(() => { try { const value = sessionStorage.getItem(stored); if (value) setPending(JSON.parse(value)); } catch {} }, [stored]);
  useEffect(() => {
    if (!isTask && tab === 'overview') {
      const inheritedView = search.get('interact') || search.get('process');
      if (inheritedView && ['action', 'conversation', 'processing', 'administration', 'release', 'delivery'].includes(inheritedView)) {
        reveal(inheritedView, true);
        return;
      }
      const params = new URLSearchParams(search.toString()); params.delete('tab'); params.delete('process'); params.delete('interact');
      router.replace(`/stories/${item.id}${params.size ? `?${params}` : ''}`, { scroll: false });
      return;
    }
    if (!isTask && tab === 'delivery') {
      const view = search.get('process') || search.get('interact');
      reveal(view && ['action', 'conversation', 'processing', 'administration', 'release', 'delivery'].includes(view) ? view : 'delivery', true);
      return;
    }
    if (tab === 'blockers' || tab === 'releases' || search.get('interact')) {
      const requested = tab === 'blockers' ? 'conversation' : tab === 'releases' ? 'release' : search.get('interact') || 'action';
      reveal(['action', 'conversation', 'processing', 'administration', 'release', ...(!isTask ? ['delivery'] : [])].includes(requested) ? requested : 'action', !isTask);
    } else {
      const view = search.get('process') || 'action';
      if (normalizedTab === 'planning') setInteractionTab(['action', 'conversation', 'processing', 'administration', ...(isTask ? ['release'] : ['release', 'delivery'])].includes(view) ? view : 'action');
    }
  }, [tab, search, isTask]);
  useEffect(() => { if (!formContent) focusCentral(); }, [normalizedTab, interactionTab, formContent, isTask]);

  useEffect(() => { setConfirmation(null); setConfirmed(false); }, [persona, data?.nextAction?.id, data?.run?.commitSha]);
  useEffect(() => {
    if (!header.current) return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--story-header-height', `${(header.current?.closest('.workflow-bar')?.getBoundingClientRect().height || 160) + 14}px`));
    observer.observe(header.current);
    return () => observer.disconnect();
  }, [headerTarget]);
  useEffect(() => {
    const cycle = header.current?.querySelector<HTMLOListElement>('.sw-cycle');
    if (!cycle) return;
    const keepPhaseVisible = () => {
      const active = cycle.querySelector<HTMLElement>('[aria-current="step"]');
      if (active) cycle.scrollLeft = Math.max(0, active.offsetLeft - (cycle.clientWidth - active.clientWidth) / 2);
    };
    const observer = new ResizeObserver(keepPhaseVisible);
    observer.observe(cycle); keepPhaseVisible();
    return () => observer.disconnect();
  }, [data?.current.phase, headerTarget, Boolean(formContent), isTask]);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(item.id)}/journey`, { cache: 'no-store', headers: persona ? { 'X-Persona': persona } : {} });
        const result = await response.json();
        if (!response.ok) throw Error(result.error?.message || result.message || 'A situação da História não pôde ser consultada.');
        if (alive) {
          setData(result); setLoadError(''); setLastChecked(new Date().toISOString());
          const identity = JSON.stringify([result.current, result.tasks?.map((task: Task) => [task.id, task.status]), result.run?.commitSha]);
          if (observed.current && observed.current !== identity) callback.current();
          observed.current = identity;
        }
      } catch (failure) { if (alive) setLoadError(failure instanceof Error ? failure.message : 'A consulta não chegou.'); }
      finally { if (alive) timer = setTimeout(load, 2500); }
    }
    void load(); return () => { alive = false; clearTimeout(timer); };
  }, [item.id, persona, refresh]);

  async function send(action: Action, repeat?: Pending) {
    if (busy || discussionBusy || !persona || !canPlan || !repeat && ((!planningAllowed && action.id !== 'reopen_story') || !currentContext || !action.enabled) || pending && pending.persona !== persona) return;
    if (!repeat && action.confirmation && confirmation?.id !== action.id) { setConfirmation(action); setConfirmed(false); return; }
    if (!repeat && action.confirmation?.checkboxLabel && !confirmed) return;
    if (!repeat && action.href && !action.path) { router.push(action.href); return; }
    if (!repeat && !action.path) { if (action.id.includes('spec')) router.push(href('specification')); else if (action.id.includes('bind') || action.id.includes('link')) setBindingOpen(true); return; }
    const current = repeat || { key: crypto.randomUUID(), persona, path: action.path!, method: action.method || 'POST', body: action.body, label: action.label, targetLabel: `${data?.current.label || 'Atividade'} · ${item.name}` };
    remember(current); setBusy(true); setError(''); setNotice('');
    try {
      if (!/^\/api\//.test(current.path)) throw Error('O comando não possui um destino válido no SDLC. Atualize o contexto.');
      const response = await fetch(current.path, { method: current.method, headers: { 'Content-Type': 'application/json', 'X-Persona': current.persona, 'Idempotency-Key': current.key }, ...(current.body ? { body: JSON.stringify(current.body) } : {}) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status < 500) remember(null); throw Error(result.error?.message || result.message || `A operação não foi confirmada (${response.status}).`); }
      remember(null); setConfirmation(null); setConfirmed(false); setBindingOpen(false); setNotice('Solicitação confirmada. A situação será atualizada com o resultado observado.');
      if (current.path.endsWith('/work-links')) { setBindingDraftBase(null); setLinks({}); }
      reload();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'A confirmação não chegou. Consulte a mesma solicitação antes de enviar outra.'); }
    finally { setBusy(false); }
  }

  function taskRows(rows: Task[]) { return <TaskCollection storyId={story?.id || item.id} rows={rows} currentTaskId={data?.current.taskId} currentState={status} refresh={refresh} />; }

  function signals() {
    const heartbeat = data?.signals?.lastHeartbeatAt;
    const stale = Boolean(activeState(status) && heartbeat && data?.signals?.heartbeatStaleAfterMs && Date.now() - new Date(heartbeat).getTime() > data.signals.heartbeatStaleAfterMs);
    const lastEvent = data?.events?.at(-1);
    return <dl className="sw-signals" data-testid="processing-signals"><div data-tone={loadError ? 'danger' : 'success'}><dt>Consulta da tela</dt><dd>{loadError ? 'A última consulta falhou. O estado atual precisa ser confirmado.' : lastChecked ? `Confirmada em ${date(lastChecked)}.` : 'Aguardando a primeira consulta.'}</dd></div><div data-tone={stale ? 'warning' : heartbeat ? 'success' : 'neutral'}><dt>Presença do executor</dt><dd>{heartbeat ? `${stale ? 'Sem confirmação recente. Último sinal' : 'Último sinal'}: ${date(heartbeat)}. O sinal não comprova progresso interno do modelo.` : activeState(status) ? 'Nenhum heartbeat confirmado ainda. O silêncio não comprova travamento.' : 'Nenhuma operação ativa aguardando confirmação do executor.'}</dd></div><div><dt>Atividade da ferramenta</dt><dd>{data?.signals?.queueReason || lastEvent?.message || lastEvent?.title || (status === 'queued' ? 'A solicitação está na fila; nenhuma execução foi confirmada.' : 'Consulte os eventos e resultados registrados na atividade.')}</dd>{data?.signals?.provider && <dd>Ferramenta: {data.signals.provider} · {data.signals.stage || 'etapa ainda não informada'}</dd>}{data?.signals?.lastEventAt && <dd>{date(data.signals.lastEventAt)}</dd>}</div></dl>;
  }

  function attemptResult(attempt?: Attempt) {
    return !attempt ? <p className="sw-empty">Nenhuma tentativa ou evidência registrada nesta Tarefa.</p> : <><div className="sw-result-heading">{badge(attempt.state, processing && currentContext && attempt.id === defaultAttempt?.id)}{attempt.sha && <code>Commit {attempt.sha.slice(0, 12)}</code>}</div>{attempt.summary && <p className={`description${attempt.state === 'failed' ? ' sw-failure-text' : ''}`}>{attempt.summary}</p>}{attempt.error && <ErrorState>{attempt.error}</ErrorState>}<dl className="sw-metadata"><div><dt>Solicitação · America/Sao_Paulo</dt><dd>{date(attempt.createdAt)}</dd></div><div><dt>Último registro · America/Sao_Paulo</dt><dd>{date(attempt.finishedAt || attempt.updatedAt)}</dd></div></dl>{Boolean(attempt.findings?.length) && <section aria-label="Achados desta tentativa"><h3>Achados ({attempt.findings!.length})</h3><ul className="sw-findings">{attempt.findings!.map((finding, index) => <li key={index}><strong>{finding.severity}</strong> · <code>{finding.path}:{finding.line}</code><p>{finding.message}</p></li>)}</ul></section>}{attempt.evidence && <details className="sw-evidence"><summary>Evidências técnicas registradas</summary><dl className="sw-metadata">{Object.entries(attempt.evidence).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}{Boolean(attempt.events?.length) && <details className="sw-evidence"><summary>Eventos desta tentativa</summary>{eventList(attempt.events!)}</details>}</>;
  }

  function eventList(rows: Event[]) { return <ol className="sw-events">{rows.map((event, index) => <li key={event.id || index}><time>{date(event.createdAt || event.timestamp)}</time><span>{event.message || event.title || label(event.type)}</span></li>)}</ol>; }

  function previousActivities() {
    return previousWork.length ? <section className="panel sw-legacy" id="previous-work"><h2>Atividades anteriores ao vínculo de Tarefas</h2><p className="hint">Resultados registrados antes desta evolução. A consulta preserva as evidências; não cria Tarefas nem atribui conclusões ao planejamento.</p><p className="hint">Cobertura legada parcial: a jornada consulta até 200 verificações anteriores e 100 ocorrências associadas. Estes resultados não representam todo o histórico. A consulta paginada na aba Auditoria acessa a trilha de auditoria registrada.</p>{previousWork.map(activity => <details key={activity.id} className="sw-evidence"><summary>{activity.label} · {operationLabel[activity.state] || label(activity.state)} · {activity.attempts.length} tentativa(s)</summary>{activity.attempts.map((attempt, index) => <section key={attempt.id} className="sw-previous-attempt"><h3>Tentativa {activity.attempts.length - index}</h3>{attemptResult(attempt)}</section>)}</details>)}</section> : null;
  }

  const phase = label(data?.current.phase || (isTask ? '' : item.status)), phaseIndex = PHASES.indexOf(phase);
  const entryLabel = !currentContext ? 'Ir à atividade atual' : data?.nextAction?.id === 'approve' ? 'Revisar aprovação G1' : activeState(status) ? `Acompanhar ${data?.current.label || 'atividade'}` : data?.current.label ? `Abrir ${data.current.label}` : 'Abrir próximo passo';
  const headerContent = <section className="sw-header" ref={header} aria-label="Situação da História" data-testid="story-journey-header">
    {formContent ? <div className="workflow-context sw-form-header"><div><strong>{formTitle || 'Dados do planejamento'}</strong><p>Preencha os dados abaixo e confirme aqui na faixa superior.</p>{pending && <p className="hint">Há uma solicitação pendente. Cancele este formulário para verificar a mesma solicitação.</p>}</div><div className="sw-form-actions">{formActions?.(!planningAllowed || busy || discussionBusy || Boolean(pending))}</div></div> : <>
      <div className="sw-header-line"><div><strong data-testid="story-phase">{phase || 'CONSULTANDO FASE'}</strong><span className={`sw-operation${status === 'failed' ? ' sw-failure-text' : ''}`} role="status">{(!data && !loadError || processing) && <Spinner />}{status === 'failed' && <AlertCircle size={15} aria-hidden="true" />}{loadError ? 'Situação atual não confirmada' : heartbeatStale ? 'Sem confirmação recente do executor' : operationLabel[status] || label(status)}</span><p>{data?.current.title || 'Consultando a situação da História…'}</p></div>
        <div className="actions sw-story-actions"><button type="button" disabled={!data} onClick={pending || currentContext ? () => reveal('action') : continueCurrent}>{pending ? 'Verificar solicitação pendente' : !currentContext ? 'Ir à atividade atual' : isTask ? entryLabel : 'Consultar próxima ação'}</button><button type="button" data-testid="edit-item" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onEdit}>Editar</button>{!isTask && <button type="button" className="primary" data-testid="create-item" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onCreate}>Criar tarefa</button>}</div>
      </div>
      {pending && <p className="sw-alert" role="status">Há uma solicitação sem confirmação. Use Verificar solicitação pendente antes de iniciar outra operação.</p>}
      <ol className="sw-cycle" aria-label="Ciclo da História">{PHASES.map((value, index) => <li key={value} aria-current={value === phase ? 'step' : undefined} data-state={value === phase ? 'current' : index < phaseIndex ? 'previous' : 'future'}><span className="sw-step-dot">{index + 1}</span><span>{value}</span></li>)}</ol>
      {isTask && <p className="sw-consulting">Consulta: {item.name}{historical ? ' · tentativa anterior, somente leitura' : offCurrent ? ' · atividade diferente da pendência atual' : ''}</p>}
    </>}
  </section>;


  const allowedAction = Boolean(currentContext && canPlan && persona && data?.permissions?.canAct !== false && !busy && !discussionBusy && !pending);
  const actionButton = (action: Action, primary = false) => <button key={action.id} type="button" className={primary ? 'primary' : ''} disabled={!(action.id === 'reopen_story' ? canPlan && !busy && !discussionBusy && !pending : allowedAction) || !action.enabled || confirmation?.id === action.id && Boolean(action.confirmation?.checkboxLabel) && !confirmed} onClick={() => void send(action)}>{busy && <Spinner />}{busy ? 'Enviando…' : action.label}</button>;

  return <div className="sw-workspace" data-testid="story-workspace">
    {headerTarget ? createPortal(headerContent, headerTarget) : headerContent}
    <div className="sw-page-heading"><p className="eyebrow">{isTask ? 'TAREFA' : 'HISTÓRIA'} · {item.key}</p><h1>{item.name}</h1>{isTask && <p><Link href={storyHref}>← Voltar à História{story ? `: ${story.name}` : ''}</Link></p>}</div>
    <nav className="context-tabs sw-tabs" aria-label={`Seções de ${isTask ? 'Tarefa' : 'História'}`}>{tabs.map(([value, title]) => <Link key={value} href={href(value)} scroll={false} aria-current={normalizedTab === value ? 'page' : undefined}>{title}{value === 'tasks' && <span className="count">{data?.tasks.length || 0}</span>}</Link>)}</nav>
    <div className="sw-layout"><div className="sw-content">{formContent && <fieldset className="sw-central-form" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)}>{formContent}</fieldset>}
      {loadError && <ErrorState onRetry={reload}><strong>A atualização da situação não chegou.</strong><p>{loadError} O último estado confirmado permanece visível. Isso não confirma falha da execução.</p></ErrorState>}
      {!data && !loadError && <LoadingState className="panel">Carregando a jornada da História…</LoadingState>}
      {data && normalizedTab === 'planning' && <>
        {planningContext}
        <LifecyclePanel title={isTask ? 'Ciclo da Tarefa' : 'Ciclo da História'} description={isTask ? 'A Tarefa registra o trabalho planejado ou uma atividade do processo. Sua conclusão depende da regra e da evidência vinculadas.' : 'A História percorre as etapas de especificação, aprovação, implementação e validação. As etapas avançam pelas operações e gates do processo.'} value={isTask ? selectedTask?.status || item.status : data.story.status} stages={isTask ? ['todo', 'doing', 'done', 'cancelled'] : PHASES.map(phase => phase.toLowerCase().replaceAll(' ', '_'))}>
          {!isTask && <><p className="hint">Aprovações e execução estão na seção Processo e decisões desta aba. As etapas do ciclo não permitem alterar o status manualmente nem dispensar gates. Testes, homologação e deploy dependem das próximas integrações.</p><div className="actions"><button type="button" disabled={Boolean(pending) || busy || discussionBusy} onClick={currentContext ? () => reveal('action') : continueCurrent}>Consultar próxima ação da História</button></div></>}
          {isTask && selectedTask && <>
            <p className="hint">{controlledTask ? 'Esta Tarefa é controlada pelo processo ou pela publicação de código. O status acompanha as operações e evidências; não pode ser alterado manualmente.' : manualTask ? 'Altere o status na seção Processo e decisões desta aba. Reabrir uma Tarefa DONE exige justificativa com pelo menos 10 caracteres.' : 'O controle de status desta Tarefa ainda não foi confirmado. Atualize a consulta antes de alterá-la.'}</p>
            <div className="actions"><button type="button" disabled={Boolean(pending) || busy || discussionBusy || !controlledTask && (!manualTask || !planningAllowed) || historical} onClick={controlledTask ? continueCurrent : () => reveal('administration')}>{controlledTask ? 'Acompanhar atividade do processo' : 'Gerenciar status da Tarefa'}</button></div>
          </>}
          {isTask && !selectedTask && <p className="hint">O vínculo desta Tarefa não foi confirmado na jornada. Atualize a consulta antes de alterar seu status.</p>}
        </LifecyclePanel>
      </>}
      {data && isTask && normalizedTab === 'overview' && <section className="panel"><div className="sw-section-heading"><h2>Trabalho desta Tarefa</h2>{badge(item.status)}</div><p className="description">{item.description || 'Nenhuma descrição registrada.'}</p><p className="sw-task-origin">{selectedTask?.processOwned ? 'Atividade vinculada ao processo. O andamento é atualizado pelas operações e suas evidências.' : 'Trabalho planejado. A conclusão automática exige vínculo explícito de escopo e critério.'}</p>{attemptResult(selectedAttempt)}</section>}
      {data && !isTask && normalizedTab === 'tasks' && <section className="panel"><div className="sw-section-heading"><h2>Tarefas da História</h2></div>{taskRows(data.tasks)}</section>}
      {data && !isTask && normalizedTab === 'tasks' && previousActivities()}
      {isTask && normalizedTab === 'evidence' && <section className="panel"><h2>Evidências e resultado</h2>{historical && <p className="sw-alert">Tentativa anterior em consulta. O resultado pertence à revisão indicada abaixo.</p>}{attemptResult(selectedAttempt)}<TaskResults taskId={item.id} persona={persona} revision={item.version}/></section>}
      {isTask && normalizedTab === 'attempts' && <section className="panel"><h2>Tentativas desta Tarefa</h2><p className="hint">Cada tentativa conserva a revisão analisada e seu resultado. Consultar histórico não autoriza executar comandos sobre uma revisão anterior.</p>{data && <AttemptCollection taskId={item.id} attempts={attempts} processingAllowed={processing && currentContext} />}</section>}
      {!isTask && <div hidden={normalizedTab !== 'specification'}><StorySpecification storyId={item.id} persona={persona} version={item.version} canEdit={planningAllowed && !busy && !formContent && !pending} onRefresh={reload}/></div>}
      {!isTask && normalizedTab === 'specification' && data?.run?.specification && <details className="panel" aria-label="Plano técnico registrado na execução"><summary>Consultar plano técnico registrado na execução</summary><p className="hint">A especificação vigente está apresentada acima. Esta consulta preserva o plano técnico usado pela execução identificada abaixo, que pode ter utilizado uma revisão anterior.</p><dl className="sw-metadata"><div><dt>Execução</dt><dd><code>{data.run.id}</code></dd></div><div><dt>Situação registrada</dt><dd>{operationLabel[data.run.state] || label(data.run.state)}</dd></div>{data.run.createdAt && <div><dt>Solicitada em · America/Sao_Paulo</dt><dd>{date(data.run.createdAt)}</dd></div>}{data.run.commitSha && <div><dt>Commit publicado</dt><dd><code>{data.run.commitSha}</code></dd></div>}</dl><h3>Requisitos técnicos da execução</h3><p className="description">{data.run.specification.requirements}</p><h3>Arquitetura registrada</h3><p className="description">{data.run.specification.architecture}</p><h3>Casos de teste registrados</h3><ol>{data.run.specification.testCases.map((test, index) => <li key={index}><strong>Critério {test.criterionIndex + 1}:</strong> {test.description}</li>)}</ol>{Boolean(data.run.specification.risks.length) && <><h3>Riscos registrados</h3><ul>{data.run.specification.risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul></>}</details>}
      {isTask && normalizedTab === 'activity' && history}
      {normalizedTab === 'conversations' && <ConversationHistory itemId={item.id} persona={persona} canPlan={canPlan} revision={refresh} />}
      {!isTask && normalizedTab === 'components' && components}
      {normalizedTab === 'more' && <><section className="panel"><h2>Mais informações</h2><nav className="sw-more-tabs" aria-label="Informações complementares">{(isTask ? [['components', 'Componentes'], ['manage', 'Configurações']] : [['activity', 'Auditoria'], ['manage', 'Configuração']]).map(([value, title]) => <Link key={value} href={href(value)} aria-current={(tab === value || tab === 'more' && value === (isTask ? 'components' : 'activity')) ? 'page' : undefined} scroll={false}>{title}</Link>)}</nav></section>{tab === 'manage' ? administration : isTask ? components : history}</>}
    </div>
    <section ref={panel} tabIndex={-1} className="panel sw-process-panel" aria-label={`Processo e decisões da ${isTask ? 'Tarefa' : 'História'}`} hidden={Boolean(formContent) || normalizedTab !== 'planning' || !isTask && ['delivery', 'release'].includes(interactionTab)} data-testid="story-process"><div className="sw-interaction-heading"><div><p className="eyebrow">PROCESSO DA {isTask ? 'TAREFA' : 'HISTÓRIA'}</p><h2>Processo e decisões</h2><p className="sw-current-inline"><strong>{phase}</strong> · {operationLabel[status] || label(status)}</p></div></div>
      <p className="sw-interaction-context">{isTask ? `Tarefa: ${item.name}` : `História: ${item.name}`}</p>
      {sharedCurrentActivity && currentTask?.id !== item.id && <p className="sw-alert">Esta Tarefa está explicitamente vinculada à atividade <strong>{currentTask?.name || data?.current.label}</strong>. As decisões abaixo atuam nessa atividade compartilhada e na revisão atual.</p>}
      {!currentContext && <div className="sw-alert"><strong>{historical ? 'Tentativa anterior, somente leitura.' : 'Esta Tarefa não é a atividade pendente da História.'}</strong><p>As ações do processo pertencem ao contexto atual.</p><button type="button" onClick={continueCurrent}>Ir à atividade atual</button></div>}
      <div className="sw-interaction-tabs" role="group" aria-label="Conteúdo do processo">{[['action', 'Próxima ação'], ['conversation', 'Conversa'], ['processing', 'Processamento'], ['administration', isTask ? 'Planejamento' : 'Vínculos']].map(([value, title]) => <button type="button" key={value} aria-pressed={interactionTab === value} disabled={Boolean(pending)} onClick={() => reveal(value)}>{value === 'conversation' && <MessageSquare size={14} />}{value === 'processing' && <Clock3 size={14} />}{title}</button>)}</div>
      {error && <ErrorState>{error}</ErrorState>}{busy && <LoadingState>Enviando a solicitação. Aguarde a confirmação antes de repetir.</LoadingState>}{notice && <p role="status" className="alert success">{notice}</p>}
      {pending && <div className="sw-alert" data-testid="pending-command"><strong>A confirmação da solicitação está pendente.</strong><p>Pedido: {pending.label}.<br />Contexto original: {pending.targetLabel || item.name}.</p><p>Consulte o mesmo pedido antes de iniciar outra operação.{pending.persona !== persona && ` Selecione a persona original (${pending.persona}).`}</p><button type="button" className="primary" disabled={busy || discussionBusy || pending.persona !== persona || !canPlan} onClick={() => void send({ id: 'reconcile', label: pending.label, enabled: true }, pending)}>{busy ? 'Consultando…' : 'Verificar a mesma solicitação'}</button></div>}
      {interactionTab === 'action' && <><p className="sw-summary"><strong>{data?.current.title || 'Consultando…'}</strong><span>{data?.current.message}</span></p>{currentContext && <>
        {pending ? null : confirmation ? <section className="sw-confirmation"><ShieldCheck size={22} /><h3>{confirmation.confirmation?.title}</h3><p>{confirmation.confirmation?.description}</p>{confirmation.confirmation?.checkboxLabel && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!allowedAction} />{confirmation.confirmation.checkboxLabel}</label>}<div className="actions">{actionButton({ ...confirmation, label: `Confirmar: ${confirmation.label}` }, true)}<button type="button" disabled={busy} onClick={() => { setConfirmation(null); setConfirmed(false); }}>Voltar</button></div></section> : data?.nextAction ? <><div className="sw-action-primary">{actionButton(data.nextAction, true)}</div>{!data.nextAction.enabled && data.nextAction.reason && <p className="hint">{data.nextAction.reason}</p>}</> : <p className="hint">{activeState(status) ? 'A solicitação está em processamento. Acompanhe os sinais e eventos; não é necessário reenviar.' : 'Nenhuma ação executável disponível nesta etapa.'}</p>}
        {!pending && !confirmation && Boolean(data?.secondaryActions?.length) && <details className="sw-alternatives"><summary>Alternativas e controle da atividade</summary><div className="actions">{data!.secondaryActions!.map(action => <div key={action.id}>{actionButton(action)}{!action.enabled && action.reason && <p className="hint">{action.reason}</p>}</div>)}</div></details>}
        {safeUrl(data?.run?.mergeRequestUrl) && <a className="sw-external" href={data!.run!.mergeRequestUrl!} target="_blank" rel="noreferrer">Abrir no GitLab <ExternalLink size={14} /></a>}
        {!isTask && (currentTask ? <p><Link href={`/tasks/${currentTask.id}`}>Consultar resultado e evidências da atividade</Link></p> : previousWork.length > 0 ? <p><Link href={`${href('tasks')}#previous-work`}>Consultar resultados anteriores ao vínculo de Tarefas</Link></p> : null)}
        {!persona && <p className="sw-alert">Selecione uma persona no topo para atuar. A consulta permanece disponível.</p>}{persona && !canPlan && <p className="hint">A persona selecionada possui acesso de consulta a estas operações.</p>}
      </>}{activeState(status) && signals()}</>}
      <div hidden={interactionTab !== 'conversation'}>{interactionTab !== 'conversation' ? null : !currentContext ? <p className="hint">Esta consulta conserva as evidências e tentativas desta Tarefa. Para conversar sobre a pendência atual, use “Ir à atividade atual”.</p> : <>
        <label>Assunto da conversa<select value={search.get('conversation') === 'story' || !data?.chat?.mode ? 'story' : 'activity'} onChange={event => { const params = new URLSearchParams(search.toString()); params.set('conversation', event.target.value); params.set('tab', 'planning'); params.set('process', 'conversation'); router.push(`${isTask ? '/tasks' : '/stories'}/${item.id}?${params}`, { scroll: false }); }}><option value="story">História · requisitos, critérios e evidências</option>{data?.chat?.mode && <option value="activity">Atividade atual · {data.chat.mode === 'merge' ? 'decisão de merge' : 'decisão de execução'}</option>}</select></label>
        <p className="hint">A conversa da História acompanha sua entrega. Decisões de execução e merge preservam seus agentes, registros e confirmações. <Link href={href('conversations')}>Consultar conversas e referências</Link></p>
        {search.get('conversation') === 'story' || !data?.chat?.mode ? story && <Assistant embedded contextKey={story.id} contextId={story.id} contextLabel={story.name} persona={persona} canPlan={planningAllowed && !busy && !pending} assistantMode="delivery" /> : data?.chat?.executionId && data.chat.mode === 'execution' ? <ExecutionDiscussion executionId={data.chat.executionId} persona={persona} running={processing && data.run?.stage === 'discussion'} active={Boolean(data.chat.enabled && currentContext)} disabled={busy || Boolean(pending)} readOnly={!currentContext} title="Conversa sobre esta atividade" guidance={data.chat.guidance} onRefresh={reload} onBusyChange={setDiscussionBusy} /> : data?.chat?.executionId && data.chat.mode === 'merge' ? <MergeDiscussion executionId={data.chat.executionId} persona={persona} blocked={['blocked', 'failed'].includes(status)} guidance={data.chat.guidance || data.current.message || 'A conversa esclarece o impedimento; alterações e merge exigem confirmação.'} readOnly={!currentContext} /> : <p className="hint">{data?.chat?.reason || 'Não há conversa de decisão disponível nesta atividade. Consulte a próxima ação e as evidências.'}</p>}
      </>}</div>
      {interactionTab === 'processing' && <><h3>Processamento observado</h3>{signals()}<h3>Eventos registrados</h3>{data?.events?.length ? eventList(data.events) : <p className="hint">Nenhum evento operacional registrado ainda.</p>}</>}
      {isTask && interactionTab === 'release' && <><div id="release-workflow-actions" />{releases?.(true, () => reveal('release'))}</>}
      {interactionTab === 'administration' && <><p className="hint">Alterações de planejamento são separadas das decisões de execução.</p>{isTask && <div className="actions"><button type="button" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onEdit}>Editar Tarefa</button></div>}{manualTask && !historical && <fieldset className="sw-planning-fields" disabled={!planningAllowed || Boolean(pending) || busy || discussionBusy}>{manualActions}</fieldset>}{!isTask && data?.binding && <details className="sw-binding" open={bindingOpen} onToggle={event => { setBindingOpen(event.currentTarget.open); if (event.currentTarget.open && !bindingDraftBase && data.binding?.expectedLinksVersion) setBindingDraftBase({ expectedVersion: story!.version, expectedLinksVersion: data.binding.expectedLinksVersion }); }}><summary>Vincular Tarefas à codificação</summary><p>Escolha explicitamente o escopo atendido e a condição de conclusão. Uma publicação não conclui todo o planejamento.</p>{bindingDraftBase && bindingDraftBase.expectedLinksVersion !== data.binding.expectedLinksVersion && <div className="sw-alert"><strong>Os vínculos mudaram durante sua edição.</strong><p>Seu rascunho foi preservado. Revise os vínculos atuais antes de salvar.</p><button type="button" onClick={() => { setBindingDraftBase({ expectedVersion: story!.version, expectedLinksVersion: data.binding!.expectedLinksVersion }); setNotice('Referência atualizada. Seu rascunho foi preservado; confira o escopo e a condição de conclusão antes de salvar.'); }}>Revisar vínculos atualizados</button></div>}{data.binding.tasks.map(task => <div className="sw-binding-task" key={task.id}><label><input type="checkbox" checked={Boolean(links[task.id]?.completion) || task.linked && !(task.id in links)} onChange={event => setLinks(previous => { const next = { ...previous }; if (event.target.checked) next[task.id] = { scope: task.scope || task.description, completion: task.completion || 'manual_evidence' }; else next[task.id] = { scope: '', completion: '' }; return next; })} />{task.name}</label>{(Boolean(links[task.id]?.completion) || task.linked && !(task.id in links)) && <><label>Escopo atendido<textarea rows={2} value={links[task.id]?.scope ?? task.scope ?? task.description} onChange={event => setLinks(previous => ({ ...previous, [task.id]: { scope: event.target.value, completion: previous[task.id]?.completion || task.completion || 'manual_evidence' } }))} /></label><label>Condição de conclusão<select value={links[task.id]?.completion ?? task.completion ?? 'manual_evidence'} onChange={event => setLinks(previous => ({ ...previous, [task.id]: { scope: previous[task.id]?.scope || task.scope || task.description, completion: event.target.value } }))}><option value="manual_evidence">Exige evidência ou conclusão manual</option><option value="publish_code">Publicação do código deste escopo</option></select></label></>}</div>)}<button type="button" disabled={!allowedAction || !story || data.binding?.enabled === false || !bindingDraftBase || bindingDraftBase.expectedLinksVersion !== data.binding.expectedLinksVersion} onClick={() => void send({ id: 'bind_tasks', label: 'Salvar vínculos de escopo', enabled: true, path: `/api/items/${story!.id}/work-links`, body: { expectedVersion: bindingDraftBase!.expectedVersion, expectedLinksVersion: bindingDraftBase!.expectedLinksVersion, links: data.binding!.tasks.flatMap(task => { const chosen = links[task.id]; if (chosen) return chosen.completion ? [{ taskId: task.id, scope: chosen.scope, completion: chosen.completion }] : []; return task.linked ? [{ taskId: task.id, scope: task.scope || task.description, completion: task.completion || 'manual_evidence' }] : []; }) } })}>Salvar vínculos</button></details>}</>}
    </section>
      {!formContent && !isTask && normalizedTab === 'planning' && <section id={`story-delivery-${item.id}`} tabIndex={-1} aria-label="Entrega de código e release"><h2>Entrega de código e release</h2><p className="hint">Consulte a revisão publicada, o Merge Request e a associação de release desta História.</p><section className="panel"><h2>Entrega de código</h2>{data?.run?.branch && <p>Branch: <code>{data.run.branch}</code></p>}{data?.run?.commitSha && <p>Commit: <code>{data.run.commitSha}</code></p>}{safeUrl(data?.run?.mergeRequestUrl) ? <p><a href={data!.run!.mergeRequestUrl!} target="_blank" rel="noreferrer">Abrir Merge Request no GitLab <ExternalLink size={14} /></a></p> : <p className="hint">O Merge Request aparecerá após a publicação confirmada no GitLab.</p>}<p className="hint">A integração de código não conclui a História. Testes, homologação e produção continuam dependendo das evidências da entrega.</p></section><section className="panel"><h2>Release planejada</h2><p>A História pode ser associada a uma release já existente. A criação e a composição das releases continuam no menu Releases.</p><div id={`story-release-${item.id}`} tabIndex={-1} className="sw-release-planning">{interactionTab === 'release' && <div id="release-workflow-actions" />}{releases?.(interactionTab === 'release', () => reveal('release'))}</div></section>{['delivery', 'release'].includes(interactionTab) && <div className="actions"><button type="button" onClick={() => reveal('action')}>Voltar ao processo da História</button></div>}</section>}
    </div>
  </div>;
}








