'use client';
import MergeIntegrationReference from './merge-integration-reference';
import useMergeReferenceRecovery from './merge-reference-recovery';
import type {MergeIntegrationReading} from '../../../packages/shared/src/merge-integration-reference';

import Link from 'next/link';
import CodeDestinationReviewPanel,{ConfirmedCodeDestination} from './code-destination-review';
import type {CodeDestination,CodeDestinationApproval} from '../../../packages/shared/src/code-destination';
import StoryLifecycleStatus from './story-lifecycle-status';
import type {StoryLifecycleReading} from '../../../packages/shared/src/story-lifecycle-reading';
import LifecyclePanel from './lifecycle-panel';
import StoryEnvironment from './story-environment';
import DevelopmentBuild from './development-build';
import DevelopmentDeployment from './development-deployment';
import DevelopmentTest from './development-test';
import DevelopmentApproval from './development-approval';
import {personas} from '@sdlc/shared';
import {storyDeliveryReading,deliveryEnvironment,type StoryDeliveryReading} from '../../../packages/shared/src/story-delivery';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, ChevronRight, Clock3, ExternalLink, MessageSquare, ShieldCheck } from 'lucide-react';
import ExecutionDiscussion from './execution-discussion';
import MergeDiscussion from './merge-discussion';
import MergeImpediment, {type MergeBlock} from './merge-impediment';
import Assistant from './assistant';
import ConversationHistory from './conversation-history';
import './story-workspace.css';
import StorySpecification from './story-specification';
import TaskResults from './task-results';
import { gatewayText, specificationGateway } from './gateway-language';
import { Spinner, LoadingState, ErrorState, FilterPanel, Pagination, SortHeader, displayDate } from './experience-ui';

type Item = { id: string; key: string; name: string; kind: string; description: string; status: string; version: number; createdAt?: string; updatedAt?: string; data?: Record<string, unknown> };
type Finding = { severity: string; path: string; line: number; message: string };
type Attempt = { recordedState?:string; integrationReference?:MergeIntegrationReading; id: string; state: string; sourceType?: string; stage?: string; sha?: string | null; summary?: string | null; error?: string | null; findings?: Finding[]; evidence?: Record<string, unknown> | null; createdAt: string; updatedAt?: string; finishedAt?: string | null; heartbeatAt?: string | null; events?: Event[] };
type Event = { id: string; type?: string; title?: string; message?: string; createdAt?: string; timestamp?: string; activityId?: string; attemptId?: string };
type Activity = { id: string; kind: string; label: string; taskId: string | null; state: string; currentAttemptId?: string | null; attempts: Attempt[]; legacy?: boolean; links?: { taskId: string; scope: string; completion: string }[] };
type Task = Item & { activityKind?: string; operationalState?: string; processOwned?: boolean; managed?: boolean; activities?: Activity[] };
type Action = { id: string; kind?: string; label: string; enabled: boolean; reason?: string; path?: string; method?: string; body?: Record<string, unknown>; href?: string; confirmation?: { title: string; description: string; checkboxLabel?: string } };
type Run = { destinationReviewRequired?:boolean;codeDestination?:CodeDestination|null; id: string; state: string; stage: string; error?: string | null; technicalRetryAvailable?: boolean; createdAt?: string; commitSha?: string | null; branch?: string | null; mergeRequestUrl?: string | null; specification?: { requirements: string; architecture: string; testCases: { criterionIndex: number; description: string }[]; risks: string[] } | null; validationIssues?: { path: string; code: string; message: string }[]; discussionVersion?: number };
type Journey = { historicalCloseReadings?:MergeIntegrationReading[];
  storyLifecycle?: StoryLifecycleReading; delivery?: StoryDeliveryReading; story: Item; current: { phase: string; label?: string; kind?: string; who?: string; state: string; taskId?: string | null; activityId?: string | null; title: string; message?: string; updatedAt?: string };
  nextAction: Action | null; secondaryActions?: Action[]; tasks: Task[]; activities: Activity[]; events?: Event[];
  merge?: {integrationReference?:MergeIntegrationReading;sha?:string;state:string;message?:string|null;blocks:MergeBlock[]}|null;
  preparation?: {eligible:boolean;preparation:{id:string;state:string;message?:string|null;sha:string}|null};
  run?: Run | null; chat?: { mode: 'execution' | 'merge' | null; executionId?: string; enabled: boolean; reason?: string; guidance?: string; version?: number };
  permissions?: { canAct: boolean; canManageLifecycle?: boolean };
  signals?: { lastEventAt?: string | null; lastHeartbeatAt?: string | null; heartbeatStaleAfterMs?: number; provider?: string; stage?: string; waitingSince?: string; queuedAt?: string; startedAt?: string; queueReason?: string; legacy?: boolean };
  binding?: { activityId?: string; enabled?: boolean; expectedLinksVersion: string; tasks: { id: string; key: string; name: string; description: string; linked: boolean; scope?: string; completion?: string }[] };
  repositoryName?: string | null;
};
type Pending = { key: string; persona: string; path: string; method: string; body?: Record<string, unknown>; label: string; targetLabel?: string };
type Props = { item: Item; persona: string; tab: string; headerTargetId: string; onRefresh: () => void; onEdit: () => void; onCreate: () => void; canPlan: boolean; administration: ReactNode; components: ReactNode; systemRepositoryHref?: string; history: ReactNode; releases?: (choosing: boolean, onChoose: () => void) => ReactNode; formContent?: ReactNode; formActions?: (blocked: boolean) => ReactNode; formTitle?: string; manualActions?: ReactNode; planningContext?: ReactNode };

const STORY_STATUSES = ['SPECIFICATION', 'APPROVED', 'CODING', 'CODE REVIEW', 'SECURITY SCAN', 'MERGE REQUEST', 'TESTING', 'UAT', 'PRODUCTION', 'COMPLETED', 'CANCELLED'];
const WORK_PHASES = ['SPECIFICATION', 'APPROVED', 'CODING', 'CODE REVIEW', 'SECURITY SCAN', 'MERGE REQUEST'];
const label = (value?: string | null) => value === 'todo' ? 'TO DO' : (value || '').replaceAll('_', ' ').toUpperCase();
const date = displayDate;
const operationLabel: Record<string, string> = { queued: 'Na fila', running: 'Em processamento', waiting_input: 'Aguardando sua orientação', waiting_approval: 'Aguardando aprovação', blocked: 'Impedimento', failed: 'Falha na atividade', succeeded: 'Resultado registrado', passed: 'Verificação aprovada', stale: 'Revisão desatualizada', cancelled: 'Cancelada', not_started: 'Aguardando início', waiting_human: 'Aguardando você', waiting_dependency: 'Aguardando próxima etapa' };
const activeState = (value?: string) => ['queued', 'running'].includes(value || '');
const safeUrl = (value?: string | null) => value && /^https?:\/\//i.test(value) ? value : null;
const COMMAND_RECEIPT_NOTICE = 'Solicitação recebida. Confira o resultado na situação atual da atividade.';
const badge = (state: string, processing = false) => <span className="sw-badge" data-state={state}>{processing && activeState(state) && <Spinner />}{state === 'failed' && <AlertCircle size={14} aria-hidden="true" />}{label(state)}</span>;

function ActivityMessage({message,run,part='summary'}:{message?:string|null;run?:Run|null;part?:'summary'|'details'}){
  if(!message)return null;
  const separateTechnicalError=run?.technicalRetryAvailable===true&&run.state==='failed'&&run.stage==='generation'&&Boolean(run.error)&&message!==run.error;
  const diagnostic=separateTechnicalError?run!.error!:message;
  const recordedError=message===run?.error&&['failed','waiting_input'].includes(run?.state||'');
  // Old validation issues may survive a later timeout. Attribute the current
  // failure only when its own recorded message identifies this terminal refusal.
  const validation=recordedError&&run?.stage==='generation'&&message.startsWith('Limite de duas correções técnicas atingido.');
  const candidateValidation=recordedError&&run?.stage==='generation'&&message.startsWith('A construção assistida não produziu uma candidata válida. Diagnóstico técnico: Candidata inválida:');
  const longError=recordedError&&(message.length>600||message.split('\n').length>5);
  if(!validation&&!candidateValidation&&!longError&&!separateTechnicalError)return part==='summary'?<p className="sw-flow-message">{message}</p>:null;
  const issues=validation&&Array.isArray(run?.validationIssues)?run.validationIssues:[];
  if(part==='summary')return <div className="sw-activity-message" data-testid="activity-message-summary">
    <p className="sw-flow-message">{separateTechnicalError?message:validation?'A proposta de correção gerada pelo agente não passou na validação técnica. O limite de correções automáticas desta tentativa foi atingido.':candidateValidation?'A construção assistida encontrou um impedimento técnico ao validar a candidata de código. Consulte o diagnóstico e use a próxima ação indicada abaixo.':'Não foi possível concluir esta etapa. Consulte o relato registrado para entender o impedimento e use a próxima ação disponível abaixo.'}</p>
    {issues.length>0&&<p className="hint">{issues.length} {issues.length===1?'apontamento técnico registrado':'apontamentos técnicos registrados'} para consulta.</p>}
  </div>;
  return <details key={`${run?.id}:${diagnostic}`} className="sw-technical-diagnostic" data-testid="activity-message-details">
      <summary>{validation||candidateValidation||separateTechnicalError?'Consultar diagnóstico técnico completo':'Consultar relato completo do impedimento'}</summary>
      <p className="hint">Relato integral registrado nesta etapa. Consultar os detalhes não retoma a execução nem altera suas decisões.</p>
      <pre tabIndex={0} aria-label="Relato integral da atividade">{diagnostic}</pre>
      {issues.length>0&&<><h3>Apontamentos registrados</h3><ol aria-label="Apontamentos da validação técnica">{issues.map((issue,index)=><li key={index}><code>{issue.path}</code> · <code>{issue.code}</code><p>{issue.message}</p></li>)}</ol></>}
    </details>;
}

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

function Workspace({ item, persona, tab, headerTargetId, onRefresh, onEdit, onCreate, canPlan, administration, components, systemRepositoryHref, history, releases, formContent, formActions, formTitle, manualActions, planningContext }: Props) {
  const router = useRouter(), search = useSearchParams();
  const [data, setData] = useState<Journey | null>(null), [loadError, setLoadError] = useState(''), [lastChecked, setLastChecked] = useState('');
  const [refresh, setRefresh] = useState(0), [interactionTab, setInteractionTab] = useState('action');
  const [conversationVisited,setConversationVisited]=useState(false);
  useEffect(()=>{if(interactionTab==='conversation')setConversationVisited(true);},[interactionTab]);
  const [busy, setBusy] = useState(false), [discussionBusy, setDiscussionBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Pending | null>(null), [confirmation, setConfirmation] = useState<Action | null>(null), [confirmed, setConfirmed] = useState(false);
  const [destinationReview,setDestinationReview]=useState<CodeDestinationApproval|null>(null),[destinationRejected,setDestinationRejected]=useState(false);
  const receiveDestination=useCallback((value:CodeDestinationApproval|null)=>{setDestinationReview(value);setConfirmed(false);if(value)setDestinationRejected(false);},[]);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [bindingOpen, setBindingOpen] = useState(false), [links, setLinks] = useState<Record<string, { scope: string; completion: string }>>({});
  const [bindingDraftBase, setBindingDraftBase] = useState<{ expectedVersion: number; expectedLinksVersion: string } | null>(null);
  const callback = useRef(onRefresh); callback.current = onRefresh;
  const panel = useRef<HTMLElement>(null), header = useRef<HTMLElement>(null), observed = useRef('');
  const confirmationPanel = useRef<HTMLElement>(null), actionArea = useRef<HTMLDivElement>(null);
  const decisionFocus = useRef<'review' | 'action' | null>(null);
  const correctionFocus = useRef(false);
  const focusRequest = useRef<'process' | 'release' | 'delivery' | 'destination' | 'environment' | null>(null);
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
  const referenceRecovery=useMergeReferenceRecovery(data?.story.id,persona,data?.story.version??item.version,canPlan&&data?.permissions?.canAct!==false,reload,()=>{const active=document.querySelector<HTMLElement>(`nav[aria-label="Seções de ${isTask?'Tarefa':'História'}"] [aria-current="page"]`);active?.focus({preventScroll:true});active?.scrollIntoView({block:'nearest'});},[...(data?.historicalCloseReadings??[]),...(data?.activities.flatMap(a=>a.attempts.flatMap(v=>v.integrationReference?[v.integrationReference]:[]))??[]),...(data?.merge?.integrationReference?[data.merge.integrationReference]:[])]);
  const planningAllowed = canPlan && data?.permissions?.canAct !== false && !referenceRecovery.pending;
  const currentTask = data?.tasks.find(task => task.id === data.current.taskId);
  const previousWork = activities.filter(activity => !activity.taskId && activity.legacy);
  const defaultTab = isTask ? 'overview' : 'tasks';
  const requestedTab = tab || defaultTab;
  const environmentCode = deliveryEnvironment(search.get('environment'));
  const deliveryReading = data?.delivery || storyDeliveryReading({status:data?.story.status || item.status,mergeConfirmed:data?.current.kind==='merge'&&data?.merge?.state==='succeeded'&&data.merge.sha===data.run?.commitSha});
  const normalizedTab = isTask
    ? requestedTab === 'blockers' || ['delivery', 'releases'].includes(requestedTab) ? 'planning' : ['components', 'manage'].includes(requestedTab) ? 'more' : requestedTab
    : requestedTab === 'overview' ? 'tasks' : ['blockers', 'delivery', 'releases', 'components'].includes(requestedTab) ? 'planning' : requestedTab === 'more' ? 'activity' : ['tasks', 'planning', 'specification', 'conversations', 'activity', 'manage'].includes(requestedTab) ? requestedTab : 'tasks';
  const tabs = isTask ? [['overview', 'Resumo'], ['planning', 'Execução'], ['evidence', 'Evidências'], ['attempts', 'Tentativas'], ['conversations', 'Conversas'], ['activity', 'Auditoria'], ['more', 'Mais']] : [['tasks', 'Tarefas'], ['planning', 'Execução'], ['specification', 'Especificação'], ['conversations', 'Conversas'], ['activity', 'Auditoria'], ['manage', 'Configurações']];
  const href = (target: string) => {
    const params = new URLSearchParams(search.toString());
    params.delete('interact');
    const view = params.get('process');
    if (target === 'planning' ? !['action', 'conversation', 'processing', 'administration', 'environment', ...(isTask ? ['release'] : ['release', 'delivery', 'destination'])].includes(view || '') : isTask && target === 'delivery' ? view !== 'release' : true) params.delete('process');
    if (target !== 'planning') {params.delete('environment');params.delete('returnEnvironment');}
    if (target === defaultTab) params.delete('tab'); else params.set('tab', target);
    return `/${isTask ? 'tasks' : 'stories'}/${item.id}${params.size ? `?${params}` : ''}`;
  };
  const returnTo = search.get('returnTo'), storyHref = returnTo && story && (returnTo === `/stories/${story.id}` || returnTo.startsWith(`/stories/${story.id}?`)) ? returnTo : `/stories/${story?.id || ''}`;

  function deliveryStoryHref() { const [path,query]=storyHref.split('?');const params=new URLSearchParams(query);params.set('tab','planning');params.set('process','environment');params.set('environment',environmentCode);return `${path}?${params}`; }
  function reload() { setRefresh(value => value + 1); callback.current(); }
  function remember(value: Pending | null) { setPending(value); try { if (value) sessionStorage.setItem(stored, JSON.stringify(value)); else sessionStorage.removeItem(stored); } catch {} }
  function reveal(view = 'action', replace = false, destinationCode?: string) {
    setInteractionTab(view);
    focusRequest.current = view === 'environment' ? 'environment' : !isTask && ['release', 'delivery', 'destination'].includes(view) ? view as 'release' | 'delivery' | 'destination' : 'process';
    const target = 'planning';
    const params = new URLSearchParams(search.toString());params.delete('interact');params.set('tab', target);params.set('process', view);
    if(view==='environment'){params.set('environment',deliveryEnvironment(destinationCode || params.get('environment')));params.delete('returnEnvironment');setRefresh(value=>value+1);}
    else{if(view==='release'&&params.get('environment'))params.set('returnEnvironment',params.get('environment')!);else if(view!=='release')params.delete('returnEnvironment');params.delete('environment');}
    const base = `/${isTask ? 'tasks' : 'stories'}/${item.id}`;
    const destination = `${base}?${params}`;
    if (destination !== `${base}?${search}`) router[replace ? 'replace' : 'push'](destination, { scroll: false });
    else if (!replace) router.replace(destination, { scroll: false });
    setTimeout(focusCentral, 0);
  }
  function focusCentral() {
    if (!focusRequest.current) return;
    const target = focusRequest.current === 'environment' ? document.getElementById(`story-environment-${item.id}`) : focusRequest.current === 'release' ? document.getElementById(`story-release-${item.id}`) : focusRequest.current === 'delivery' ? document.getElementById(`story-delivery-${item.id}`) : focusRequest.current === 'destination' ? document.getElementById(`story-destination-${item.id}`) : panel.current;
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
    if (!isTask && tab === 'components') { reveal('destination', true); return; }
    if (!isTask && tab === 'overview') {
      const inheritedView = search.get('interact') || search.get('process');
      if (inheritedView && ['action', 'conversation', 'processing', 'administration', 'release', 'delivery', 'environment'].includes(inheritedView)) {
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
      if (normalizedTab === 'planning') setInteractionTab(['action', 'conversation', 'processing', 'administration', 'environment', ...(isTask ? ['release'] : ['release', 'delivery', 'destination'])].includes(view) ? view : 'action');
    }
  }, [tab, search, isTask]);
  useEffect(() => { if (!formContent) focusCentral(); }, [normalizedTab, interactionTab, formContent, isTask, search]);
  useEffect(()=>{if(!correctionFocus.current||formContent||normalizedTab!=='planning'||interactionTab!=='action')return;correctionFocus.current=false;const action=panel.current?.querySelector<HTMLButtonElement>('button[data-action="development_cycle"]');if(action){const details=action.closest('details');if(details)details.open=true;action.focus({preventScroll:true});action.scrollIntoView({block:'nearest'});}else panel.current?.focus();},[normalizedTab,interactionTab,formContent,data]);

  const decisionVersion = JSON.stringify([data?.story.version, data?.run?.id, data?.run?.commitSha, data?.nextAction?.id, data?.nextAction?.body, data?.nextAction?.enabled, data?.secondaryActions?.map(action=>[action.id,action.body,action.enabled]), data?.permissions?.canAct]);
  useEffect(() => {
    if (confirmation) {
      decisionFocus.current = 'action';
      setNotice('O contexto da decisão mudou. Revise a etapa atual antes de confirmar novamente.');
    }
    setConfirmation(null); setConfirmed(false);
  }, [persona, decisionVersion]);
  useEffect(() => {
    if (!decisionFocus.current || formContent || normalizedTab !== 'planning' || interactionTab !== 'action') return;
    const action = actionArea.current?.querySelector<HTMLButtonElement>('button');
    const target = decisionFocus.current === 'review' ? confirmationPanel.current : action && !action.disabled ? action : panel.current;
    if (!target?.getClientRects().length) return;
    target.focus({ preventScroll: true });
    if (decisionFocus.current === 'review') target.scrollIntoView({ block: 'nearest' });
    decisionFocus.current = null;
  }, [confirmation, formContent, normalizedTab, interactionTab]);
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
      const active = cycle.querySelector<HTMLElement>('[data-selected="true"]') || cycle.querySelector<HTMLElement>('[aria-current="step"]');
      if (active) cycle.scrollLeft = Math.max(0, active.offsetLeft - (cycle.clientWidth - active.clientWidth) / 2);
    };
    const observer = new ResizeObserver(keepPhaseVisible);
    observer.observe(cycle); keepPhaseVisible();
    return () => observer.disconnect();
  }, [data?.current.phase, data?.current.kind, headerTarget, Boolean(formContent), isTask, environmentCode, interactionTab, normalizedTab]);
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
    if (formContent || busy || discussionBusy || !persona || !canPlan || !repeat && referenceRecovery.pending || !repeat && (Boolean(loadError) || (!planningAllowed && action.id !== 'reopen_story') || !currentContext || !action.enabled) || pending && pending.persona !== persona) return;
    if (!repeat && action.confirmation && confirmation?.id !== action.id) { decisionFocus.current = 'review'; setConfirmation(action); setConfirmed(false); return; }
    if (!repeat && action.confirmation?.checkboxLabel && !confirmed) return;
    if(!repeat&&action.id==='approve'&&data?.run?.destinationReviewRequired&&!destinationReview)return;
    if (!repeat && action.href && !action.path) {
      const destination = new URL(action.href, window.location.origin);
      const ownPath = `/${isTask ? 'tasks' : 'stories'}/${item.id}`;
      if (destination.origin === window.location.origin && destination.pathname === ownPath) {
        const params = new URLSearchParams(search.toString());
        params.delete('interact'); params.delete('process');
        destination.searchParams.forEach((value, key) => params.set(key, value));
        router.push(`${ownPath}?${params}`, { scroll: false });
      } else router.push(action.href);
      return;
    }
    if (!repeat && !action.path) { if (action.id.includes('spec')) router.push(href('specification')); else if (action.id.includes('bind') || action.id.includes('link')) setBindingOpen(true); return; }
    const current = repeat || { key: crypto.randomUUID(), persona, path: action.path!, method: action.method || 'POST', body: action.id==='approve'&&destinationReview?{...action.body,codeDestination:destinationReview}:action.body, label: action.label, targetLabel: `${data?.current.label || 'Atividade'} · ${item.name}` };
    remember(current); setBusy(true); setError(''); setNotice('');
    try {
      if (!/^\/api\//.test(current.path)) throw Error('O comando não possui um destino válido no SDLC. Atualize o contexto.');
      const response = await fetch(current.path, { method: current.method, headers: { 'Content-Type': 'application/json', 'X-Persona': current.persona, 'Idempotency-Key': current.key }, ...(current.body ? { body: JSON.stringify(current.body) } : {}) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status < 500) remember(null);if(['GATE_DESTINATION_CHANGED','GATE_DESTINATION_REQUIRED'].includes(result.error?.code)){setDestinationRejected(true);setDestinationReview(null);setConfirmed(false);} throw Error(result.error?.message || result.message || `A operação não foi confirmada (${response.status}).`); }
      remember(null); setConfirmation(null); setConfirmed(false); setBindingOpen(false); setNotice(COMMAND_RECEIPT_NOTICE);
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
    return !attempt ? <p className="sw-empty">Nenhuma tentativa ou evidência registrada nesta Tarefa.</p> : <><div className="sw-result-heading">{badge(attempt.state, processing && currentContext && attempt.id === defaultAttempt?.id)}{attempt.sha && <code>Commit {attempt.sha.slice(0, 12)}</code>}</div>{attempt.integrationReference?.historicalReconciliation&&<p className={attempt.recordedState==='failed'?'sw-failure-text':undefined}>Resultado registrado nesta tentativa: <strong>{operationLabel[attempt.recordedState||attempt.state]||attempt.recordedState||attempt.state}</strong>. A observação posterior não altera esse resultado.</p>}{attempt.integrationReference&&referenceRecovery.activeOperationId!==attempt.integrationReference.operationId&&<MergeIntegrationReference value={referenceRecovery.read(attempt.integrationReference)} historical={historical||attempt.state==='stale'} onPendingChange={referenceRecovery.notify} onCaptured={referenceRecovery.remember} persona={persona} version={data?.story.version} canCapture={planningAllowed} disabled={busy||Boolean(pending)||discussionBusy||Boolean(formContent)} onRefresh={reload}/>} {attempt.summary && <p className={`description${attempt.state === 'failed' ? ' sw-failure-text' : ''}`}>{attempt.summary}</p>}{attempt.error && <ErrorState>{attempt.error}</ErrorState>}<dl className="sw-metadata"><div><dt>Solicitação · America/Sao_Paulo</dt><dd>{date(attempt.createdAt)}</dd></div><div><dt>Último registro · America/Sao_Paulo</dt><dd>{date(attempt.finishedAt || attempt.updatedAt)}</dd></div></dl>{Boolean(attempt.findings?.length) && <section aria-label="Achados desta tentativa"><h3>Achados ({attempt.findings!.length})</h3><ul className="sw-findings">{attempt.findings!.map((finding, index) => <li key={index}><strong>{finding.severity}</strong> · <code>{finding.path}:{finding.line}</code><p>{finding.message}</p></li>)}</ul></section>}{attempt.evidence && <details className="sw-evidence"><summary>Evidências técnicas registradas</summary><dl className="sw-metadata">{Object.entries(attempt.evidence).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}{Boolean(attempt.events?.length) && <details className="sw-evidence"><summary>Eventos desta tentativa</summary>{eventList(attempt.events!)}</details>}</>;
  }

  function eventList(rows: Event[]) { return <ol className="sw-events">{rows.map((event, index) => <li key={event.id || index}><time>{date(event.createdAt || event.timestamp)}</time><span>{event.message || event.title || label(event.type)}</span></li>)}</ol>; }

  function previousActivities() {
    return previousWork.length ? <section className="panel sw-legacy" id="previous-work"><h2>Atividades anteriores ao vínculo de Tarefas</h2><p className="hint">Resultados registrados antes desta evolução. A consulta preserva as evidências; não cria Tarefas nem atribui conclusões ao planejamento.</p><p className="hint">Cobertura legada parcial: a jornada consulta até 200 verificações anteriores e 100 ocorrências associadas. Estes resultados não representam todo o histórico. A consulta paginada na aba Auditoria acessa a trilha de auditoria registrada.</p>{previousWork.map(activity => <details key={activity.id} className="sw-evidence"><summary>{activity.label} · {operationLabel[activity.state] || label(activity.state)} · {activity.attempts.length} tentativa(s)</summary>{activity.attempts.map((attempt, index) => <section key={attempt.id} className="sw-previous-attempt"><h3>Tentativa {activity.attempts.length - index}</h3>{attemptResult(attempt)}</section>)}</details>)}</section> : null;
  }

  const storyPhase = label(data?.current.phase || (isTask ? '' : item.status));
  const phase = storyPhase, phaseIndex = WORK_PHASES.indexOf(phase);
  const headerOperationLabel = status === 'cancelled' ? story?.status === 'cancelled' ? 'História cancelada' : story && data?.run?.state === 'cancelled' ? 'Tentativa interrompida' : 'Atividade cancelada' : operationLabel[status] || label(status);
  const entryLabel = !currentContext ? 'Ir à atividade atual' : data?.nextAction?.id === 'approve' ? 'Revisar aprovação' : activeState(status) ? `Acompanhar ${gatewayText(data?.current.label) || 'atividade'}` : data?.current.label ? `Abrir ${gatewayText(data.current.label)}` : 'Abrir próximo passo';
  const headerContent = <section className="sw-header" ref={header} aria-label="Situação da História" data-testid="story-journey-header">
    {formContent ? <div className="workflow-context sw-form-header"><div><strong>{formTitle || 'Dados do planejamento'}</strong><p>Preencha os dados abaixo e confirme aqui na faixa superior.</p>{pending && <p className="hint">Há uma solicitação pendente. Cancele este formulário para verificar a mesma solicitação.</p>}</div><div className="sw-form-actions">{formActions?.(!planningAllowed || busy || discussionBusy || Boolean(pending))}</div></div> : <>
      <div className="sw-header-line"><div><strong data-testid="story-phase">{phase || 'CONSULTANDO FASE'}</strong><span className={`sw-operation${status === 'failed' ? ' sw-failure-text' : ''}`} role="status">{(!data && !loadError || processing) && <Spinner />}{status === 'failed' && <AlertCircle size={15} aria-hidden="true" />}{loadError ? 'Situação atual não confirmada' : heartbeatStale ? 'Sem confirmação recente do executor' : headerOperationLabel}</span>{isTask && <p>{gatewayText(data?.current.title) || 'Consultando a situação da História…'}</p>}</div>
        <div className="actions sw-story-actions">{(isTask || Boolean(pending) || normalizedTab !== 'planning') && <button type="button" disabled={!data} onClick={pending || currentContext ? () => reveal('action') : continueCurrent}>{pending ? 'Verificar solicitação pendente' : !currentContext ? 'Ir à atividade atual' : isTask ? entryLabel : 'Continuar em Execução'}</button>}<button type="button" data-testid="edit-item" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onEdit}>Editar</button>{!isTask && <button type="button" data-testid="create-item" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onCreate}>Criar tarefa</button>}</div>
      </div>
      {pending && <p className="sw-alert" role="status">Há uma solicitação sem confirmação. Use Verificar solicitação pendente antes de iniciar outra operação.</p>}
      <ol className="sw-cycle" aria-label="Ciclo da História">{WORK_PHASES.map((value,index)=><li key={value} aria-current={value===phase?'step':undefined} data-state={value===phase?'current':phaseIndex>=0&&index<phaseIndex?'previous':'future'}><span className="sw-step-dot">{index+1}</span><span>{value}</span></li>)}{deliveryReading.destinations.map((destination,index)=><li key={destination.code} className={`sw-destination sw-destination-${destination.code.toLowerCase()}`} data-state={destination.code==='DEV'&&deliveryReading.development.next?'next':'future'} data-selected={normalizedTab==='planning'&&interactionTab==='environment'&&environmentCode===destination.code?'true':undefined}><button type="button" aria-pressed={normalizedTab==='planning'&&interactionTab==='environment'&&environmentCode===destination.code} aria-label={`Consultar ${destination.label} · ${destination.code==='DEV'?'desenvolvimento da História, release opcional':'entrega da release, candidata imutável'}`} onClick={()=>reveal('environment',false,destination.code)}><span className="sw-step-dot">{WORK_PHASES.length+index+1}</span><span>{destination.label}</span><small>{destination.code==='DEV'?'História':'Release'}</small>{destination.code==='DEV'&&deliveryReading.development.next&&<small className="sw-next-label">Próximo</small>}</button></li>)}</ol>
      <p className="sw-delivery-scope">DEV: desenvolvimento da História, com release opcional. QA → HML → PROD: entrega da release com candidata imutável.</p>
      {isTask && <p className="sw-consulting">Consulta: {item.name}{historical ? ['not_captured','unconfirmed','resolved'].includes(selectedAttempt?.integrationReference?.state||'')?' · tentativa anterior, consulta e registro histórico disponíveis':' · tentativa anterior, somente leitura' : offCurrent ? ' · atividade diferente da pendência atual' : ''}</p>}
    </>}
  </section>;


  const allowedAction = Boolean(!referenceRecovery.pending && currentContext && !formContent && !loadError && canPlan && persona && data?.permissions?.canAct !== false && !busy && !discussionBusy && !pending);
  const mergeImpeded = data?.current.kind === 'merge' && ['blocked', 'failed'].includes(status);
  const currentMergeConfirmed = !loadError && data?.current.kind === 'merge' && data.current.state === 'succeeded' && data.merge?.state === 'succeeded' && Boolean(data.merge.sha) && data.merge.sha === data.run?.commitSha;
  const actionButton = (action: Action, primary = false) => <button key={action.id} data-action={action.id} type="button" className={primary ? 'primary' : ''} disabled={!(action.id === 'reopen_story' ? !referenceRecovery.pending && canPlan && !formContent && !loadError && !busy && !discussionBusy && !pending : allowedAction) || !action.enabled || action.id==='approve'&&confirmation?.id==='approve'&&Boolean(data?.run?.destinationReviewRequired)&&(!destinationReview||confirmation.body?.expectedVersion!==data?.story.version) || confirmation?.id === action.id && Boolean(action.confirmation?.checkboxLabel) && !confirmed} aria-describedby={primary && !action.enabled && action.reason ? `story-action-reason-${item.id}` : primary && mergeImpeded && currentContext ? `merge-impediment-${item.id}` : undefined} onClick={() => void send(action)}>{busy && <Spinner />}{busy ? 'Enviando…' : !isTask && action.id === 'approve' ? confirmation?.id === action.id ? 'Aprovar e enfileirar codificação' : 'Revisar aprovação' : action.id === 'merge' && status === 'blocked' && !confirmation ? 'Reavaliar e solicitar merge' : action.id === 'release_draft' && confirmation?.id === action.id ? 'Confirmar liberação' : action.id === 'development_cycle' && confirmation?.id === action.id ? 'Confirmar novo ciclo' : gatewayText(action.label)}</button>;
  const currentMessage = data?.current.message === data?.run?.error ? data?.current.message : gatewayText(data?.current.message);
  const repositoryBlocked = !isTask && data?.nextAction?.id === 'prepare' && !data.nextAction.enabled && data.permissions?.canAct && /repositório/i.test(data.nextAction.reason || '');
  const destinationContextChanged=Boolean(confirmation?.id==='approve'&&data?.run?.destinationReviewRequired&&confirmation.body?.expectedVersion!==data.story.version);
  const flowTitle = confirmation ? confirmation.id === 'approve' ? 'Autorizar a codificação?' : gatewayText(confirmation.confirmation?.title) : interactionTab === 'conversation' ? 'Esclarecimento desta etapa' : interactionTab === 'processing' ? 'Sinais e evidências da execução' : interactionTab === 'administration' ? 'Escopo das Tarefas' : status === 'waiting_approval' ? 'Podemos começar a codificação?' : gatewayText(data?.current.title) || 'Consultando a etapa atual…';

  const devConversationActive = !formContent && normalizedTab==='planning' && interactionTab==='conversation' && (search.get('conversation')==='story'||!data?.chat?.mode);
  return <div className={`sw-workspace${!isTask ? ' sw-story-workspace' : ''}`} data-testid="story-workspace">
    {headerTarget ? createPortal(headerContent, headerTarget) : headerContent}
    {referenceRecovery.feedback}
    <div className="sw-page-heading"><p className="eyebrow">{isTask ? 'TAREFA' : 'HISTÓRIA'} · {item.key}</p><h1>{item.name}</h1>{isTask && <p><Link href={storyHref}>← Voltar à História{story ? `: ${story.name}` : ''}</Link></p>}<StoryLifecycleStatus reading={data?.storyLifecycle} stale={Boolean(loadError)} historical={historical}/></div>
    <nav className="context-tabs sw-tabs" aria-label={`Seções de ${isTask ? 'Tarefa' : 'História'}`}>{tabs.map(([value, title]) => <Link key={value} href={href(value)} scroll={false} aria-current={normalizedTab === value ? 'page' : undefined}>{title}{value === 'tasks' && <span className="count">{data?.tasks.length || 0}</span>}</Link>)}</nav>
    <div className="sw-layout"><div className="sw-content">{formContent && <fieldset className="sw-central-form" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)}>{formContent}</fieldset>}
      {loadError && <ErrorState onRetry={reload}><strong>A atualização da situação não chegou.</strong><p>{loadError} O último estado confirmado permanece visível. Isso não confirma falha da execução.</p></ErrorState>}
      {!data && !loadError && <LoadingState className="panel">Carregando a jornada da História…</LoadingState>}
      {data && isTask && normalizedTab === 'planning' && <>
        {planningContext}
        <LifecyclePanel title={isTask ? 'Ciclo da Tarefa' : 'Ciclo da História'} description={isTask ? 'A Tarefa registra o trabalho planejado ou uma atividade do processo. Sua conclusão depende da regra e da evidência vinculadas.' : 'A História percorre as etapas de especificação, aprovação, implementação e validação. As etapas avançam pelas operações e gates do processo.'} value={isTask ? selectedTask?.status || item.status : data.story.status} stages={isTask ? ['todo', 'doing', 'done', 'cancelled'] : STORY_STATUSES.map(phase => phase.toLowerCase().replaceAll(' ', '_'))}>
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
      {!isTask && <div hidden={normalizedTab !== 'specification'}><p className="hint"><button type="button" className="text-button" onClick={() => reveal('destination')}>Revisar o destino da implementação</button></p><StorySpecification storyId={item.id} persona={persona} version={item.version} canEdit={planningAllowed && !busy && !formContent && !pending} onRefresh={reload}/></div>}
      {!isTask && normalizedTab === 'specification' && data?.run?.specification && <details className="panel" aria-label="Plano técnico registrado na execução"><summary>Consultar plano técnico registrado na execução</summary><p className="hint">A especificação vigente está apresentada acima. Esta consulta preserva o plano técnico usado pela execução identificada abaixo, que pode ter utilizado uma revisão anterior.</p><dl className="sw-metadata"><div><dt>Execução</dt><dd><code>{data.run.id}</code></dd></div><div><dt>Situação registrada</dt><dd>{operationLabel[data.run.state] || label(data.run.state)}</dd></div>{data.run.createdAt && <div><dt>Solicitada em · America/Sao_Paulo</dt><dd>{date(data.run.createdAt)}</dd></div>}{data.run.commitSha && <div><dt>Commit publicado</dt><dd><code>{data.run.commitSha}</code></dd></div>}</dl><h3>Requisitos técnicos da execução</h3><p className="description">{data.run.specification.requirements}</p><h3>Arquitetura registrada</h3><p className="description">{data.run.specification.architecture}</p><h3>Casos de teste registrados</h3><ol>{data.run.specification.testCases.map((test, index) => <li key={index}><strong>Critério {test.criterionIndex + 1}:</strong> {test.description}</li>)}</ol>{Boolean(data.run.specification.risks.length) && <><h3>Riscos registrados</h3><ul>{data.run.specification.risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul></>}</details>}
      {normalizedTab === 'activity' && history}
      {!isTask && normalizedTab === 'manage' && administration}
      {normalizedTab === 'conversations' && <ConversationHistory itemId={item.id} persona={persona} canPlan={canPlan} revision={refresh} />}
      {!isTask && <section id={`story-destination-${item.id}`} tabIndex={-1} hidden={Boolean(formContent) || normalizedTab !== 'planning' || interactionTab !== 'destination'} aria-label="Destino da implementação">
        {components}
        <button type="button" onClick={() => reveal('action')}>Voltar à etapa atual</button>
      </section>}
      {isTask && normalizedTab === 'more' && <><section className="panel"><h2>Mais informações</h2><nav className="sw-more-tabs" aria-label="Informações complementares">{[['components', 'Repositório do Sistema'], ['manage', 'Configurações']].map(([value, title]) => <Link key={value} href={href(value)} aria-current={(tab === value || tab === 'more' && value === 'components') ? 'page' : undefined} scroll={false}>{title}</Link>)}</nav></section>{tab === 'manage' ? administration : components}</>}
    </div>
    <section ref={panel} tabIndex={-1} className={`panel sw-process-panel${!isTask ? ' sw-story-flow' : ''}`} aria-label={`Processo e decisões da ${isTask ? 'Tarefa' : 'História'}`} hidden={Boolean(formContent) || normalizedTab !== 'planning' || interactionTab === 'environment' || !isTask && ['delivery', 'release', 'destination'].includes(interactionTab)} data-testid="story-process"><div className="sw-interaction-heading"><div><p className="eyebrow">{isTask ? 'PROCESSO DA TAREFA' : status === 'waiting_approval' ? specificationGateway : gatewayText(data?.current.label) || 'EXECUÇÃO DA HISTÓRIA'}</p><h2>{isTask ? 'Processo e decisões' : flowTitle}</h2>{isTask && <p className="sw-current-inline"><strong>{phase}</strong> · {operationLabel[status] || label(status)}</p>}</div>{!isTask && data?.current.who && <span className="sw-flow-owner">{data.current.who}</span>}</div>
      {isTask && <p className="sw-interaction-context">Tarefa: {item.name}</p>}
      {sharedCurrentActivity && currentTask?.id !== item.id && <p className="sw-alert">Esta Tarefa está explicitamente vinculada à atividade <strong>{currentTask?.name || data?.current.label}</strong>. As decisões abaixo atuam nessa atividade compartilhada e na revisão atual.</p>}
      {!currentContext && <div className="sw-alert"><strong>{historical ? ['not_captured','unconfirmed','resolved'].includes(selectedAttempt?.integrationReference?.state||'')?'Tentativa anterior. Você pode verificar e registrar uma observação histórica desta integração.':'Tentativa anterior, somente leitura.' : 'Esta Tarefa não é a atividade pendente da História.'}</strong><p>As ações do processo pertencem ao contexto atual.</p><button type="button" onClick={continueCurrent}>Ir à atividade atual</button></div>}
      {isTask && <div className="sw-interaction-tabs" role="group" aria-label="Conteúdo do processo">{[['action', 'Próxima ação'], ['conversation', 'Conversa'], ['processing', 'Processamento'], ['administration', 'Planejamento']].map(([value, title]) => <button type="button" key={value} aria-pressed={interactionTab === value} disabled={Boolean(pending)} onClick={() => reveal(value)}>{value === 'conversation' && <MessageSquare size={14} />}{value === 'processing' && <Clock3 size={14} />}{title}</button>)}</div>}
      {!isTask && interactionTab !== 'action' && <button type="button" className="text-button sw-back-to-flow" onClick={() => reveal('action')}>← Voltar à etapa atual</button>}
      {error && <ErrorState>{error}</ErrorState>}{busy && <LoadingState>Enviando a solicitação. Aguarde a confirmação antes de repetir.</LoadingState>}{notice && <p role="status" className={notice===COMMAND_RECEIPT_NOTICE?'sw-receipt-note':'alert success'} data-testid={notice===COMMAND_RECEIPT_NOTICE?'story-command-receipt':undefined}>{notice===COMMAND_RECEIPT_NOTICE&&!loadError&&status==='failed'?'Solicitação recebida. A tentativa atual encontrou um impedimento; confira o diagnóstico e a próxima ação abaixo.':notice}</p>}
      {data?.preparation?.preparation && currentContext && data.preparation.preparation.state !== 'failed' && (data.preparation.preparation.state==='succeeded'?<div data-testid="draft-release-record"><p className="hint" role="status">{currentMergeConfirmed?'Liberação de Draft registrada. A integração da revisão atual já foi confirmada.':'Liberação de Draft registrada. Acompanhe a integração pela situação atual da atividade.'}</p><details className="sw-alternatives"><summary>Consultar relato da liberação de Draft</summary><p className="hint">Mensagem registrada na etapa de liberação. Ela descreve aquele momento; a situação atual da integração permanece na atividade.</p><p>{data.preparation.preparation.message||'Liberação concluída conforme o registro desta operação.'}</p><p className="hint">Operação <code>{data.preparation.preparation.id}</code> · fonte da liberação <code>{data.preparation.preparation.sha}</code>.</p></details></div>:<p role="status" className="sw-alert">{data.preparation.preparation.message || (['queued','running'].includes(data.preparation.preparation.state) ? 'Liberação para integração em andamento.' : 'Consulte o resultado da liberação.')}</p>)}
      {data?.preparation?.preparation?.state === 'failed' && currentContext && <ErrorState><strong>Resultado da liberação precisa ser verificado</strong><p>{data.preparation.preparation.message}</p><p>{[data?.nextAction,...(data?.secondaryActions||[])].some(action=>action?.id==='release_draft'&&action.enabled)?'Use Verificar resultado da liberação. Essa consulta não envia outra liberação nem executa merge.':'A recuperação desta liberação não está disponível neste contexto. Consulte a operação na Auditoria; o novo ciclo permanece bloqueado até confirmar o resultado.'}</p></ErrorState>}
      {mergeImpeded && currentContext && data?.preparation?.preparation?.state !== 'failed' && <MergeImpediment id={`merge-impediment-${item.id}`} state={status} message={data?.current.message} blocks={data?.merge?.blocks} releaseAvailable={data?.preparation?.eligible} url={data?.run?.mergeRequestUrl} onDiscuss={!busy && !pending && !confirmation ? () => reveal('conversation') : undefined} />}
      {pending && <div className="sw-alert" data-testid="pending-command"><strong>A confirmação da solicitação está pendente.</strong><p>Pedido: {gatewayText(pending.label)}.<br />Contexto original: {pending.targetLabel || item.name}.</p><p>Consulte o mesmo pedido antes de iniciar outra operação.{pending.persona !== persona && ` Selecione a persona original (${pending.persona}).`}</p><button type="button" className="primary" disabled={busy || discussionBusy || pending.persona !== persona || !canPlan} onClick={() => void send({ id: 'reconcile', label: pending.label, enabled: true }, pending)}>{busy ? 'Consultando…' : 'Verificar a mesma solicitação'}</button></div>}
      {interactionTab === 'action' && <>{isTask ? <div className="sw-summary"><strong>{gatewayText(data?.current.title) || 'Consultando…'}</strong><ActivityMessage message={currentMessage} run={data?.run}/></div> : !confirmation && !pending && <>{!mergeImpeded && <ActivityMessage message={currentMessage} run={data?.run}/>}{status === 'waiting_approval' && data?.repositoryName && <p className="hint">Repositório do Sistema: <strong>{data.repositoryName}</strong>. <Link href={href('specification')} scroll={false}>Revisar especificação e plano técnico</Link></p>}</>}{currentContext && <>
        {confirmation ? <section hidden={Boolean(pending)} ref={confirmationPanel} tabIndex={-1} className="sw-confirmation" aria-label="Confirmar decisão da etapa">{isTask && <><ShieldCheck size={22} /><h3>{gatewayText(confirmation.confirmation?.title)}</h3></>}{!isTask && confirmation.id === 'approve' && <p className="sw-confirmation-reference"><strong>{item.name}</strong>{data?.repositoryName && <> · {data.repositoryName}</>}</p>}<p>{!isTask && confirmation.id === 'approve' ? 'Revise os requisitos e o plano técnico. Ao aprovar, a codificação entra na fila.' : gatewayText(confirmation.confirmation?.description)}</p>{confirmation.id==='approve'&&data?.run?.destinationReviewRequired&&<CodeDestinationReviewPanel executionId={data.run.id} version={data.story.version} disabled={busy||!!pending||destinationContextChanged} invalidated={destinationRejected||destinationContextChanged} onChange={receiveDestination}/>} {destinationContextChanged&&<p role="status" className="sw-alert">O contexto da História mudou. Use Voltar e revise novamente a aprovação.</p>} {confirmation.confirmation?.checkboxLabel && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!allowedAction||confirmation.id==='approve'&&Boolean(data?.run?.destinationReviewRequired)&&(!destinationReview||destinationContextChanged)} />{confirmation.id==='approve'&&data?.run?.destinationReviewRequired?'Revisei a especificação e o destino DEV acima; autorizo gerar código e propor integração nessa branch por Merge Request.':gatewayText(confirmation.confirmation.checkboxLabel)}</label>}<div className="actions">{actionButton({ ...confirmation, label: `Confirmar: ${confirmation.label}` }, true)}<button type="button" disabled={busy} onClick={() => { decisionFocus.current = 'action'; setConfirmation(null); setConfirmed(false); }}>Voltar</button></div></section> : pending ? null : data?.nextAction ? <><div ref={actionArea} className="sw-action-primary">{actionButton(data.nextAction, true)}</div>{!data.nextAction.enabled && data.nextAction.reason && <div className="sw-action-block"><p id={`story-action-reason-${item.id}`} className="hint">{gatewayText(data.nextAction.reason)}</p>{repositoryBlocked && systemRepositoryHref && <Link href={systemRepositoryHref}>Consultar repositório no Sistema →</Link>}</div>}</> : <p className="hint">{activeState(status) ? 'A solicitação está em processamento. Acompanhe os sinais e eventos; não é necessário reenviar.' : 'Nenhuma ação executável disponível nesta etapa.'}</p>}
        {!pending && !confirmation && Boolean(data?.secondaryActions?.length) && <details className="sw-alternatives"><summary>Alternativas e controle da atividade</summary><div className="actions">{data!.secondaryActions!.map(action => <div key={action.id}>{actionButton(action)}{!action.enabled && action.reason && <p className="hint">{action.reason}</p>}</div>)}</div></details>}
        {currentContext&&data?.merge?.state==='succeeded'&&data.merge.integrationReference&&referenceRecovery.activeOperationId!==data.merge.integrationReference.operationId&&<MergeIntegrationReference value={referenceRecovery.read(data.merge.integrationReference)} onPendingChange={referenceRecovery.notify} onCaptured={referenceRecovery.remember} persona={persona} version={data.story.version} canCapture={planningAllowed} disabled={busy||Boolean(pending)||discussionBusy||Boolean(formContent)} masked={Boolean(confirmation)} onRefresh={reload}/>} {currentContext&&!confirmation&&data?.run?.codeDestination&&<ConfirmedCodeDestination value={data.run.codeDestination}/>} {safeUrl(data?.run?.mergeRequestUrl) && <a className="sw-external" href={data!.run!.mergeRequestUrl!} target="_blank" rel="noreferrer">Abrir no GitLab <ExternalLink size={14} /></a>}
        {!isTask && (currentTask ? <p><Link href={`/tasks/${currentTask.id}`}>Consultar resultado e evidências da atividade</Link></p> : previousWork.length > 0 ? <p><Link href={`${href('tasks')}#previous-work`}>Consultar resultados anteriores ao vínculo de Tarefas</Link></p> : null)}
        {!persona && <p className="sw-alert">Selecione uma persona no topo para atuar. A consulta permanece disponível.</p>}{persona && !canPlan && <p className="hint">A persona selecionada possui acesso de consulta a estas operações.</p>}
      </>}{activeState(status) && (isTask ? signals() : <p className="sw-flow-signal" role="status">{processing && <Spinner />}{status === 'queued' ? 'Na fila; o início do trabalho ainda não foi confirmado.' : heartbeatStale ? `Sem confirmação recente. Último sinal: ${date(data?.signals?.lastHeartbeatAt)}.` : data?.signals?.lastHeartbeatAt ? `Última confirmação do executor: ${date(data.signals.lastHeartbeatAt)}.` : 'Ainda não há confirmação do executor. Consulte os sinais para acompanhar.'}</p>)}</>}
      {interactionTab==='action'&&!confirmation&&!pending&&!mergeImpeded&&<ActivityMessage message={currentMessage} run={data?.run} part="details"/>}
      <div hidden={interactionTab !== 'conversation'}>{!conversationVisited&&interactionTab !== 'conversation' ? null : !currentContext ? <p className="hint">Esta consulta conserva as evidências e tentativas desta Tarefa. Para conversar sobre a pendência atual, use “Ir à atividade atual”.</p> : <>
        <label>Assunto da conversa<select value={search.get('conversation') === 'story' || !data?.chat?.mode ? 'story' : 'activity'} onChange={event => { const params = new URLSearchParams(search.toString()); params.set('conversation', event.target.value); params.set('tab', 'planning'); params.set('process', 'conversation'); router.push(`${isTask ? '/tasks' : '/stories'}/${item.id}?${params}`, { scroll: false }); }}><option value="story">História · requisitos, critérios e evidências</option>{data?.chat?.mode && <option value="activity">Atividade atual · {data.chat.mode === 'merge' ? 'decisão de merge' : 'decisão de execução'}</option>}</select></label>
        <p className="hint">A conversa da História acompanha sua entrega. Decisões de execução e merge preservam seus agentes, registros e confirmações. <Link href={href('conversations')}>Consultar conversas e referências</Link></p>
        {search.get('conversation') === 'story' || !data?.chat?.mode ? story && <Assistant embedded contextKey={story.id} contextId={story.id} contextLabel={story.name} persona={persona} role={personas.find(person=>person.id===persona)?.role||''} readOnly={!currentContext} devActionsActive={devConversationActive} canPlan={planningAllowed && !busy && !pending} assistantMode="delivery" /> : data?.chat?.executionId && data.chat.mode === 'execution' ? <ExecutionDiscussion executionId={data.chat.executionId} persona={persona} running={processing && data.run?.stage === 'discussion'} active={Boolean(data.chat.enabled && currentContext)} disabled={busy || Boolean(pending)} readOnly={!currentContext} title="Conversa sobre esta atividade" guidance={data.chat.guidance} onRefresh={reload} onBusyChange={setDiscussionBusy} /> : data?.chat?.executionId && data.chat.mode === 'merge' ? <MergeDiscussion action={data.nextAction?.id === 'release_draft' && currentContext ? <button type="button" disabled={!allowedAction || !data.nextAction.enabled} onClick={() => { reveal('action'); void send(data.nextAction!); }}>Revisar liberação para integração</button> : data.nextAction?.id === 'correct' && currentContext ? <button type="button" disabled={!allowedAction || !data.nextAction.enabled} onClick={() => { reveal('action'); void send(data.nextAction!); }}>Revisar correção de código</button> : undefined} executionId={data.chat.executionId} persona={persona} blocked={['blocked', 'failed'].includes(status)} guidance={data.chat.guidance || data.current.message || 'A conversa esclarece o impedimento; alterações e merge exigem confirmação.'} readOnly={!currentContext} /> : <p className="hint">{data?.chat?.reason || 'Não há conversa de decisão disponível nesta atividade. Consulte a próxima ação e as evidências.'}</p>}
      </>}</div>
      {interactionTab === 'processing' && <><h3>Processamento observado</h3>{signals()}<h3>Eventos registrados</h3>{data?.events?.length ? eventList(data.events) : <p className="hint">Nenhum evento operacional registrado ainda.</p>}</>}
      {isTask && interactionTab === 'release' && <><div id="release-workflow-actions" />{releases?.(true, () => reveal('release'))}</>}
      {interactionTab === 'administration' && <><p className="hint">Alterações de planejamento são separadas das decisões de execução.</p>{isTask && <div className="actions"><button type="button" disabled={!planningAllowed || busy || discussionBusy || Boolean(pending)} onClick={onEdit}>Editar Tarefa</button></div>}{manualTask && !historical && <fieldset className="sw-planning-fields" disabled={!planningAllowed || Boolean(pending) || busy || discussionBusy}>{manualActions}</fieldset>}{!isTask && data?.binding && <details className="sw-binding" open={bindingOpen} onToggle={event => { setBindingOpen(event.currentTarget.open); if (event.currentTarget.open && !bindingDraftBase && data.binding?.expectedLinksVersion) setBindingDraftBase({ expectedVersion: story!.version, expectedLinksVersion: data.binding.expectedLinksVersion }); }}><summary>Vincular Tarefas à codificação</summary><p>Escolha explicitamente o escopo atendido e a condição de conclusão. Uma publicação não conclui todo o planejamento.</p>{bindingDraftBase && bindingDraftBase.expectedLinksVersion !== data.binding.expectedLinksVersion && <div className="sw-alert"><strong>Os vínculos mudaram durante sua edição.</strong><p>Seu rascunho foi preservado. Revise os vínculos atuais antes de salvar.</p><button type="button" onClick={() => { setBindingDraftBase({ expectedVersion: story!.version, expectedLinksVersion: data.binding!.expectedLinksVersion }); setNotice('Referência atualizada. Seu rascunho foi preservado; confira o escopo e a condição de conclusão antes de salvar.'); }}>Revisar vínculos atualizados</button></div>}{data.binding.tasks.map(task => <div className="sw-binding-task" key={task.id}><label><input type="checkbox" checked={Boolean(links[task.id]?.completion) || task.linked && !(task.id in links)} onChange={event => setLinks(previous => { const next = { ...previous }; if (event.target.checked) next[task.id] = { scope: task.scope || task.description, completion: task.completion || 'manual_evidence' }; else next[task.id] = { scope: '', completion: '' }; return next; })} />{task.name}</label>{(Boolean(links[task.id]?.completion) || task.linked && !(task.id in links)) && <><label>Escopo atendido<textarea rows={2} value={links[task.id]?.scope ?? task.scope ?? task.description} onChange={event => setLinks(previous => ({ ...previous, [task.id]: { scope: event.target.value, completion: previous[task.id]?.completion || task.completion || 'manual_evidence' } }))} /></label><label>Condição de conclusão<select value={links[task.id]?.completion ?? task.completion ?? 'manual_evidence'} onChange={event => setLinks(previous => ({ ...previous, [task.id]: { scope: previous[task.id]?.scope || task.scope || task.description, completion: event.target.value } }))}><option value="manual_evidence">Exige evidência ou conclusão manual</option><option value="publish_code">Publicação do código deste escopo</option></select></label></>}</div>)}<button type="button" disabled={!allowedAction || !story || data.binding?.enabled === false || !bindingDraftBase || bindingDraftBase.expectedLinksVersion !== data.binding.expectedLinksVersion} onClick={() => void send({ id: 'bind_tasks', label: 'Salvar vínculos de escopo', enabled: true, path: `/api/items/${story!.id}/work-links`, body: { expectedVersion: bindingDraftBase!.expectedVersion, expectedLinksVersion: bindingDraftBase!.expectedLinksVersion, links: data.binding!.tasks.flatMap(task => { const chosen = links[task.id]; if (chosen) return chosen.completion ? [{ taskId: task.id, scope: chosen.scope, completion: chosen.completion }] : []; return task.linked ? [{ taskId: task.id, scope: task.scope || task.description, completion: task.completion || 'manual_evidence' }] : []; }) } })}>Salvar vínculos</button></details>}</>}
    </section>
      <div id={`development-build-recovery-${item.id}`}/><div id={`development-deployment-recovery-${item.id}`}/><div id={`development-test-recovery-${item.id}`}/>
      <div id={'development-approval-recovery-'+item.id}/>
      <StoryEnvironment lifecycle={data?.storyLifecycle} id={item.id} code={environmentCode} delivery={deliveryReading} storyKey={story?.key||item.key} readOnly={!planningAllowed||!persona||!currentContext||busy||Boolean(pending)} stale={Boolean(loadError)||!data} active={!formContent&&normalizedTab==='planning'&&interactionTab==='environment'&&search.get('process')==='environment'} onChooseRelease={()=>reveal('release')} onBack={()=>reveal('action')} backLabel={isTask&&!currentContext?'Voltar à atividade consultada':undefined} storyHref={isTask?deliveryStoryHref():undefined} build={(story||!isTask)&&<DevelopmentBuild key={'build-'+(story?.id||item.id)} storyId={story?.id||item.id} storyVersion={story?.version||item.version} persona={persona} role={personas.find(person=>person.id===persona)?.role||''} readOnly={!planningAllowed||!currentContext||busy||Boolean(pending)} stale={Boolean(loadError)||!data} active={!formContent&&normalizedTab==='planning'&&interactionTab==='environment'&&search.get('process')==='environment'&&environmentCode==='DEV'} recoveryTargetId={`development-build-recovery-${item.id}`} onReturn={()=>reveal('environment',false,'DEV')} onRefresh={reload}/>} deployment={(story||!isTask)&&!devConversationActive&&<DevelopmentDeployment key={'deployment-'+(story?.id||item.id)} storyId={story?.id||item.id} storyVersion={story?.version||item.version} persona={persona} role={personas.find(person=>person.id===persona)?.role||''} readOnly={!planningAllowed||!currentContext||busy||Boolean(pending)} stale={Boolean(loadError)||!data} active={!formContent&&normalizedTab==='planning'&&interactionTab==='environment'&&search.get('process')==='environment'&&environmentCode==='DEV'} recoveryTargetId={`development-deployment-recovery-${item.id}`} onReturn={()=>reveal('environment',false,'DEV')} onRefresh={reload}/>} testPanel={(story||!isTask)&&<DevelopmentTest key={'tests-'+(story?.id||item.id)} storyId={story?.id||item.id} storyVersion={story?.version||item.version} persona={persona} role={personas.find(person=>person.id===persona)?.role||''} readOnly={!planningAllowed||!currentContext||busy||Boolean(pending)} stale={Boolean(loadError)||!data} active={!formContent&&normalizedTab==='planning'&&interactionTab==='environment'&&search.get('process')==='environment'&&environmentCode==='DEV'} recoveryTargetId={'development-test-recovery-'+item.id} onReturn={()=>reveal('environment',false,'DEV')} onRefresh={reload} onCorrection={()=>{correctionFocus.current=true;reveal('action');}}/>} approvalPanel={(story||!isTask)&&<DevelopmentApproval key={'approval-'+(story?.id||item.id)} storyId={story?.id||item.id} storyVersion={story?.version||item.version} persona={persona} role={personas.find(person=>person.id===persona)?.role||''} readOnly={!planningAllowed||!currentContext||busy||Boolean(pending)} stale={Boolean(loadError)||!data} active={!formContent&&normalizedTab==='planning'&&interactionTab==='environment'&&search.get('process')==='environment'&&environmentCode==='DEV'} recoveryTargetId={'development-approval-recovery-'+item.id} onReturn={()=>reveal('environment',false,'DEV')} onRefresh={reload} onEvidence={kind=>{if(kind==='merge'){reveal('action');return;}const name=kind==='build'?'development-build':kind==='deployment'?'development-deployment':'development-test';const card=document.querySelector<HTMLElement>('[data-testid='+name+']');card?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});card?.scrollIntoView({block:'start'});}}/>}/>
      {!isTask && <div hidden={Boolean(formContent)||normalizedTab !== 'planning'}>
        <nav className="sw-flow-details" aria-label="Detalhes da execução">
          <button type="button" className="text-button" onClick={() => reveal('processing')}>Consultar sinais e evidências</button>
          <button type="button" className="text-button" onClick={() => reveal('conversation')}>Conversar sobre esta etapa</button>
          <button type="button" className="text-button" onClick={() => reveal('administration')}>Escopo das Tarefas</button>
          <button type="button" className="text-button" onClick={() => reveal('destination')}>Repositório do Sistema</button>
          <button type="button" className="text-button" onClick={() => reveal('delivery')}>Entrega de código e release</button>
          <button type="button" className="text-button" onClick={() => reveal('release')}>Release planejada</button>
        </nav>
        <section id={`story-delivery-${item.id}`} tabIndex={-1} hidden={!['delivery', 'release'].includes(interactionTab)} aria-label="Entrega de código e release">
          <h2>Entrega de código e release</h2><p className="hint">Consulte a revisão publicada, o Merge Request e a associação de release desta História.</p>
          <section className="panel"><h2>Entrega de código</h2>{data?.run?.branch && <p>Branch: <code>{data.run.branch}</code></p>}{data?.run?.commitSha && <p>Commit: <code>{data.run.commitSha}</code></p>}{safeUrl(data?.run?.mergeRequestUrl) ? <p><a href={data!.run!.mergeRequestUrl!} target="_blank" rel="noreferrer">Abrir Merge Request no GitLab <ExternalLink size={14} /></a></p> : <p className="hint">O Merge Request aparecerá após a publicação confirmada no GitLab.</p>}<p className="hint">A integração de código não conclui a História. Consulte DEV para construir e publicar a revisão da História, com release opcional. QA, HML e PROD recebem a candidata imutável da release e dependem de suas próprias evidências. A promoção de candidatas continua nas próximas entregas.</p></section>
          <section className="panel"><h2>Release planejada</h2><p>A História pode ser associada a uma release já existente. A criação e a composição das releases continuam no menu Releases.</p><div id={`story-release-${item.id}`} tabIndex={-1} className="sw-release-planning">{interactionTab === 'release' && <div id="release-workflow-actions" />}{releases?.(interactionTab === 'release', () => reveal('release'))}</div></section>
          <div className="actions">{interactionTab==='release'&&search.get('returnEnvironment')&&<button type="button" onClick={()=>reveal('environment',false,search.get('returnEnvironment')!)}>Voltar à consulta de {search.get('returnEnvironment')==='PRD'?'PROD':search.get('returnEnvironment')}</button>}<button type="button" onClick={() => reveal('action')}>Voltar ao processo da História</button></div>
        </section>
      </div>}
    </div>
  </div>;
}








