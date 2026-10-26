'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { materializedPlanCounts, pipelineStages, pipelineTasks, planLimits, type PipelineStage } from '../../../packages/shared/src/pipeline-plan';
import { statusLabels } from '../../../packages/shared/src/states';
import RequirementsDetails from './requirements-details';
import { ErrorState, LoadingState, Spinner } from './experience-ui';
import './assistant-plan.css';

export type PlanTask = { title: string; description: string; repositoryIds: string[]; pipelineStage?: PipelineStage };
export type Requirements = { version: 1; objective: string; behavior?: string; actors: string[]; inputs: { name: string; type: string; description: string; required: boolean; validation: string }[]; outputs: { name: string; type: string; description: string }[]; businessRules: string[]; functionalCriteria: string[]; technicalCriteria: string[]; dependencies: { description: string; kind: 'internal' | 'external' | 'decision'; status: 'confirmed' | 'pending'; impact?: 'blocking' | 'informative'; reference?: string }[]; exceptions: string[]; nonFunctional: string[]; assumptions: string[]; outOfScope: string[]; openQuestions: string[] };
export type PlanStory = Omit<PlanTask, 'pipelineStage'> & { acceptanceCriteria: string[]; requirements?: Requirements; tasks: PlanTask[] };
export type Plan = { summary: string; epics: { title: string; description: string; stories: PlanStory[] }[] };
export type CreationReceipt = { itemIds: string[]; items: { id: string; kind: string; key: string; name: string; status: string; parentId: string | null; archived?: boolean }[]; totals: { epics: number; stories: number; tasks: number; total: number }; coverage: { expected: number; available: number; complete: boolean } };
export type Proposal = { id: string; projectId?: string; project?: { id: string; key: string; name: string }; status: 'draft' | 'applied'; version: number; projectVersion: number; sessionVersion: number; stale?: boolean; content: Plan; appliedItemIds: string[]; creationReceipt?: CreationReceipt | null; createdAt: string };
export type Repository = { id: string; name: string; key: string };
type Attempt = { method: 'PATCH' | 'POST'; path: string; body: Record<string, unknown>; key: string; persona: string };
type Draft = { base: number; content: Plan; dirty: boolean; selected: [number, number] };
type Props = { proposal: Proposal; projectName: string; projectVersion: number; sessionVersion: number; repositories: Repository[]; persona: string; canEdit: boolean; canApply?: boolean; contextId?: string; projectId?: string; historical?: boolean; onPendingChange?: (pending: boolean) => void; onRefresh: () => void };
const listKeys = ['actors', 'businessRules', 'functionalCriteria', 'technicalCriteria', 'exceptions', 'nonFunctional', 'assumptions', 'outOfScope', 'openQuestions'] as const;
const maxStoredChars = 2_000_000;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const list = (value: unknown, max: number, length: number): value is string[] => Array.isArray(value) && value.length <= length && value.every(entry => text(entry, max));
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

// Empty fields are valid local edits. The restoration check validates shape and
// bounds; it does not mistake a draft for an API-approved proposal.
function validPlan(value: unknown): value is Plan {
  if (!record(value) || !text(value.summary, 2000) || !Array.isArray(value.epics) || !value.epics.length || value.epics.length > planLimits.maxEpics) return false;
  return value.epics.every(epic => record(epic) && text(epic.title, 120) && text(epic.description, 2000) && Array.isArray(epic.stories) && epic.stories.length > 0 && epic.stories.length <= planLimits.maxStoriesPerEpic && epic.stories.every(story => {
    if (!record(story) || !text(story.title, 120) || !text(story.description, 2000) || !list(story.repositoryIds, 200, 20) || !list(story.acceptanceCriteria, 500, 12) || !Array.isArray(story.tasks) || story.tasks.length > planLimits.maxTaskDetailsPerStory) return false;
    if (!story.tasks.every(task => record(task) && text(task.title, 120) && text(task.description, 2000) && list(task.repositoryIds, 200, 20) && (task.pipelineStage === undefined || pipelineStages.includes(task.pipelineStage as PipelineStage)))) return false;
    const stages = story.tasks.flatMap(task => task.pipelineStage ? [task.pipelineStage] : []);
    if (new Set(stages).size !== stages.length) return false;
    if (story.requirements === undefined) return true;
    const r = story.requirements;
    return record(r) && r.version === 1 && text(r.objective, 1000) && (r.behavior === undefined || text(r.behavior, 4000)) && listKeys.every(key => list(r[key], key === 'functionalCriteria' ? 500 : 7211, key === 'functionalCriteria' ? 12 : 7212)) &&
      Array.isArray(r.inputs) && r.inputs.length <= 12 && r.inputs.every(input => record(input) && ['name', 'type', 'description', 'validation'].every(key => text(input[key], 600)) && typeof input.required === 'boolean') &&
      Array.isArray(r.outputs) && r.outputs.length <= 12 && r.outputs.every(output => record(output) && ['name', 'type', 'description'].every(key => text(output[key], 600))) &&
      Array.isArray(r.dependencies) && r.dependencies.length <= 12 && r.dependencies.every(dependency => record(dependency) && text(dependency.description, 600) && ['internal', 'external', 'decision'].includes(String(dependency.kind)) && ['confirmed', 'pending'].includes(String(dependency.status)) && (dependency.impact === undefined || ['blocking', 'informative'].includes(String(dependency.impact))) && (dependency.reference === undefined || text(dependency.reference, 600)));
  }));
}
function validAttempt(value: unknown, proposalId: string): value is Attempt {
  if (!record(value) || !text(value.key, 200) || !/^[a-f\d-]{36}$/i.test(value.key) || !text(value.persona, 80) || !/^[a-z0-9_-]+$/.test(value.persona) || !record(value.body) || !positive(value.body.expectedVersion)) return false;
  return value.method === 'PATCH' && value.path === `/assistant/plans/${proposalId}` && Object.keys(value.body).length === 2 && validPlan(value.body.content) ||
    value.method === 'POST' && value.path === `/assistant/plans/${proposalId}/apply` && Object.keys(value.body).length === 4 && positive(value.body.expectedProjectVersion) && positive(value.body.expectedSessionVersion) && value.body.confirmed === true;
}
export type PendingProposalRequest = { proposalId: string; expectedVersion: number; persona: string; proposal: Proposal | null };
function pendingProposalSnapshot(value: unknown, proposalId: string, attempt: Attempt): Proposal | null {
  if (!record(value) || value.id !== proposalId || value.version !== attempt.body.expectedVersion || !positive(value.projectVersion) || !positive(value.sessionVersion) || !validPlan(value.content) || !text(value.createdAt, 100) || !Number.isFinite(Date.parse(value.createdAt))) return null;
  if (attempt.method === 'PATCH' && JSON.stringify(value.content) !== JSON.stringify(attempt.body.content)) return null;
  if (attempt.method === 'POST' && (value.projectVersion !== attempt.body.expectedProjectVersion || value.sessionVersion !== attempt.body.expectedSessionVersion)) return null;
  if (value.projectId !== undefined && (!text(value.projectId, 200) || !/^[a-z0-9_-]+$/i.test(value.projectId))) return null;
  const project = record(value.project) && text(value.project.id, 200) && text(value.project.key, 200) && text(value.project.name, 120) && (!value.projectId || value.project.id === value.projectId) ? { id: value.project.id, key: value.project.key, name: value.project.name } : undefined;
  // An unresolved request is never evidence of application. Its snapshot is
  // displayed as a draft until the original API receipt is recovered.
  return { id: proposalId, projectId: typeof value.projectId === 'string' ? value.projectId : project?.id, ...(project ? { project } : {}), version: Number(value.version), projectVersion: value.projectVersion, sessionVersion: value.sessionVersion, status: 'draft', content: structuredClone(value.content), appliedItemIds: [], creationReceipt: null, createdAt: value.createdAt };
}
/** Read only validated requests for this exact context, including proposals
 * that have disappeared from the latest proposal or the loaded history page. */
export function readPendingProposalRequests(contextId: string): PendingProposalRequest[] {
  if (!contextId || typeof window === 'undefined') return [];
  const prefix = `sdlc-assistant-plan:v1:${encodeURIComponent(contextId)}:`, requests: PendingProposalRequest[] = [];
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix) || !key.endsWith(':pending')) continue;
      const raw = sessionStorage.getItem(key);
      if (!raw || raw.length > maxStoredChars) continue;
      let entry: unknown; try { entry = JSON.parse(raw); } catch { continue; }
      if (!record(entry) || entry.contextId !== contextId || !text(entry.proposalId, 200) || !/^[a-z0-9_-]+$/i.test(entry.proposalId) || key !== `${prefix}${encodeURIComponent(entry.proposalId)}:pending` || !validAttempt(entry.attempt, entry.proposalId)) continue;
      requests.push({ proposalId: entry.proposalId, expectedVersion: Number(entry.attempt.body.expectedVersion), persona: entry.attempt.persona, proposal: pendingProposalSnapshot(entry.proposal, entry.proposalId, entry.attempt) });
    }
  } catch { return requests; }
  return requests;
}
export function readPendingProposals(contextId: string): Proposal[] {
  return readPendingProposalRequests(contextId).flatMap(request => request.proposal ? [request.proposal] : []);
}
const emptyTask = (): PlanTask => ({ title: '', description: '', repositoryIds: [] });
const emptyStory = (): PlanStory => ({ ...emptyTask(), acceptanceCriteria: [''], tasks: [] });
const emptyRequirements = (story: PlanStory): Requirements => ({ version: 1, objective: story.title, behavior: story.description, actors: [], inputs: [], outputs: [], businessRules: [], functionalCriteria: [...story.acceptanceCriteria], technicalCriteria: [], dependencies: [], exceptions: [], nonFunctional: [], assumptions: [], outOfScope: [], openQuestions: [] });
function cleanPlan(content: Plan): Plan {
  const next = structuredClone(content);
  for (const epic of next.epics) for (const story of epic.stories) if (story.requirements) {
    for (const key of listKeys) if (key !== 'functionalCriteria') story.requirements[key] = story.requirements[key].map(value => value.trim()).filter(Boolean);
    story.requirements.functionalCriteria = [...story.acceptanceCriteria];
    for (const dependency of story.requirements.dependencies) if (!dependency.reference?.trim()) delete dependency.reference;
  }
  return next;
}
function planIssue(content: Plan): { message: string; selected?: [number, number] } | null {
  if (!validPlan(content)) return { message: 'Confira os campos e os limites da proposta antes de salvar.' };
  if (!content.summary.trim()) return { message: 'Informe o resumo do plano.' };
  if (materializedPlanCounts(content).total > planLimits.maxItems) return { message: `A proposta ultrapassa o limite de ${planLimits.maxItems} itens, incluindo as seis Tarefas de cada História.` };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > planLimits.maxBytes) return { message: 'A proposta ultrapassa 40 KB. Reduza o detalhamento ou divida o planejamento em propostas menores.' };
  for (let ei = 0; ei < content.epics.length; ei++) {
    const epic = content.epics[ei];
    if (!epic.title.trim()) return { message: `Informe o título do Épico ${ei + 1}.`, selected: [ei, 0] };
    for (let si = 0; si < epic.stories.length; si++) {
      const story = epic.stories[si], selected: [number, number] = [ei, si], prefix = `História ${ei + 1}.${si + 1}`;
      if (!story.title.trim()) return { message: `${prefix}: informe o título.`, selected };
      if (!story.acceptanceCriteria.length || story.acceptanceCriteria.some(value => !value.trim())) return { message: `${prefix}: preencha cada critério de aceite ou remova os critérios vazios.`, selected };
      if (story.tasks.some(task => !task.title.trim())) return { message: `${prefix}: informe o título das Tarefas adicionais e dos detalhamentos do pipeline.`, selected };
      if (story.requirements && story.requirements.objective.trim().length < 10) return { message: `${prefix}: descreva o objetivo com pelo menos 10 caracteres.`, selected };
      if (story.requirements) {
        const r = story.requirements;
        if (listKeys.some(key => r[key].length > 12 || r[key].some(value => value.length > (key === 'functionalCriteria' ? 500 : 600)))) return { message: `${prefix}: use até 12 itens em cada lista complementar, com no máximo 600 caracteres por item. Seu texto foi preservado.`, selected };
        if (r.inputs.some(input => [input.name, input.type, input.description, input.validation].some(value => !value.trim())) || r.outputs.some(output => [output.name, output.type, output.description].some(value => !value.trim())) || r.dependencies.some(dependency => !dependency.description.trim())) return { message: `${prefix}: complete os registros complementares adicionados ou remova os registros vazios.`, selected };
      }
    }
  }
  return null;
}

function PlanRequirements({ value: r, disabled, onChange }: { value: Requirements; disabled: boolean; onChange: (patch: Partial<Requirements>) => void }) {
  const listField = (label: string, key: Exclude<typeof listKeys[number], 'functionalCriteria'>) => <label>{label}<textarea rows={3} maxLength={7211} value={r[key].join('\n')} onChange={event => onChange({ [key]: event.target.value.split('\n') })} /><small>Um item por linha, até 12 itens de 600 caracteres.</small></label>;
  return <section className="plan-requirements" aria-label="Requisitos da História selecionada"><h4>Requisitos da História</h4><fieldset disabled={disabled} className="plan-requirements-fields">
    <label>Objetivo da funcionalidade<textarea minLength={10} maxLength={1000} rows={3} value={r.objective} onChange={event => onChange({ objective: event.target.value })} /></label>
    <label>Comportamento esperado<textarea maxLength={4000} rows={4} value={r.behavior || ''} onChange={event => onChange({ behavior: event.target.value })} /></label>
    <details><summary>Detalhamento complementar</summary><div className="plan-complement-fields">
      {listField('Usuários e atores', 'actors')}{listField('Regras de negócio', 'businessRules')}{listField('Critérios de aceite técnicos', 'technicalCriteria')}{listField('Exceções e tratamentos de erro', 'exceptions')}{listField('Requisitos não funcionais', 'nonFunctional')}{listField('Premissas', 'assumptions')}{listField('Fora de escopo', 'outOfScope')}{listField('Perguntas em aberto', 'openQuestions')}
      <h4>Entradas</h4>{r.inputs.map((input, index) => <fieldset key={index}><legend>Entrada {index + 1}</legend>
        {(['name', 'type', 'description', 'validation'] as const).map(field => <label key={field}>{({ name: 'Nome', type: 'Tipo', description: 'Descrição', validation: 'Validação' })[field]}<input maxLength={600} value={input[field]} onChange={event => onChange({ inputs: r.inputs.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row) })} /></label>)}
        <label className="plan-check"><input type="checkbox" checked={input.required} onChange={event => onChange({ inputs: r.inputs.map((row, i) => i === index ? { ...row, required: event.target.checked } : row) })} />Obrigatória</label><button type="button" onClick={() => onChange({ inputs: r.inputs.filter((_, i) => i !== index) })}>Remover entrada {index + 1}</button>
      </fieldset>)}<button type="button" disabled={r.inputs.length >= 12} onClick={() => onChange({ inputs: [...r.inputs, { name: '', type: '', description: '', validation: '', required: false }] })}>Adicionar entrada</button>
      <h4>Saídas</h4>{r.outputs.map((output, index) => <fieldset key={index}><legend>Saída {index + 1}</legend>
        {(['name', 'type', 'description'] as const).map(field => <label key={field}>{({ name: 'Nome', type: 'Tipo', description: 'Descrição' })[field]}<input maxLength={600} value={output[field]} onChange={event => onChange({ outputs: r.outputs.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row) })} /></label>)}
        <button type="button" onClick={() => onChange({ outputs: r.outputs.filter((_, i) => i !== index) })}>Remover saída {index + 1}</button>
      </fieldset>)}<button type="button" disabled={r.outputs.length >= 12} onClick={() => onChange({ outputs: [...r.outputs, { name: '', type: '', description: '' }] })}>Adicionar saída</button>
      <h4>Dependências</h4>{r.dependencies.map((dependency, index) => {
        const update = (patch: Partial<Requirements['dependencies'][number]>) => onChange({ dependencies: r.dependencies.map((row, i) => i === index ? { ...row, ...patch } : row) });
        return <fieldset key={index}><legend>Dependência {index + 1}</legend><label>Descrição<input maxLength={600} value={dependency.description} onChange={event => update({ description: event.target.value })} /></label>
          <label>Tipo<select value={dependency.kind} onChange={event => update({ kind: event.target.value as typeof dependency.kind })}><option value="internal">Interna</option><option value="external">Externa</option><option value="decision">Decisão</option></select></label>
          <label>Situação<select value={dependency.status} onChange={event => update({ status: event.target.value as typeof dependency.status })}><option value="pending">Pendente</option><option value="confirmed">Confirmada</option></select></label>
          <label>Efeito<select value={dependency.impact || 'informative'} onChange={event => update({ impact: event.target.value as 'blocking' | 'informative' })}><option value="blocking">Impeditiva para codificar</option><option value="informative">Informativa</option></select></label>
          <label>Referência<input maxLength={600} value={dependency.reference || ''} onChange={event => update({ reference: event.target.value })} /></label><button type="button" onClick={() => onChange({ dependencies: r.dependencies.filter((_, i) => i !== index) })}>Remover dependência {index + 1}</button>
        </fieldset>;
      })}<button type="button" disabled={r.dependencies.length >= 12} onClick={() => onChange({ dependencies: [...r.dependencies, { description: '', kind: 'external', status: 'pending', impact: 'informative' }] })}>Adicionar dependência</button>
    </div></details>
  </fieldset><p className="assistant-help">Os critérios funcionais ficam em Critérios de aceitação, abaixo. A revisão desta proposta não aprova G1.</p></section>;
}

export default function PlanReview(props: Props) {
  const scope = `sdlc-assistant-plan:v1:${encodeURIComponent(props.contextId || props.projectId || 'project')}:${encodeURIComponent(props.proposal.id)}`;
  return <PlanEditor key={`${scope}:${props.persona}`} {...props} storageScope={scope} />;
}

function PlanEditor({ proposal, projectName, projectVersion, sessionVersion, repositories, persona, canEdit, canApply = canEdit, contextId, projectId, historical = false, onPendingChange, onRefresh, storageScope }: Props & { storageScope: string }) {
  const [draft, setDraft] = useState<Draft>(() => ({ content: structuredClone(proposal.content), base: proposal.version, dirty: false, selected: [0, 0] }));
  const latestDraft = useRef(draft);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const [retry, setRetry] = useState<Attempt | null>(null), [confirm, setConfirm] = useState(false), [confirmed, setConfirmed] = useState(false), [discard, setDiscard] = useState(false);
  const [receipt, setReceipt] = useState<Proposal | null>(proposal.status === 'applied' ? proposal : null);
  const heading = useRef<HTMLHeadingElement>(null), commandInFlight = useRef(false);
  const pendingCallback = useRef(onPendingChange); pendingCallback.current = onPendingChange;
  const draftScope = `${storageScope}:persona:${encodeURIComponent(persona)}`, pendingKey = `${storageScope}:pending`;
  const applied = Boolean(receipt) || proposal.status === 'applied';
  const stale = proposal.stale === true || proposal.projectVersion !== projectVersion || proposal.sessionVersion !== sessionVersion;
  const conflict = draft.base !== proposal.version;
  const locked = !ready || !canEdit || !persona || historical || busy || Boolean(retry) || applied;
  const content = historical && !applied ? proposal.content : draft.content;
  const receiptProposal = receipt || proposal, counts = materializedPlanCounts(applied ? receiptProposal.content : content), remaining = planLimits.maxItems - counts.total;
  const ei = Math.min(draft.selected[0], content.epics.length - 1), epic = content.epics[ei];
  const si = Math.min(draft.selected[1], epic.stories.length - 1), story = epic.stories[si];

  function persist(next: Draft): boolean {
    try {
      sessionStorage.setItem(`${draftScope}:revision:${next.base}`, JSON.stringify({ schema: 1, proposalId: proposal.id, contextId: contextId || projectId || 'project', persona, ...next }));
      sessionStorage.setItem(`${draftScope}:active`, String(next.base));
      setStorageError(''); return true;
    } catch { setStorageError('O navegador não conseguiu guardar este rascunho. Mantenha esta página aberta ou baixe o rascunho antes de sair.'); return false; }
  }
  function commit(next: Draft) { latestDraft.current = next; setDraft(next); persist(next); }
  useEffect(() => {
    let restored = latestDraft.current;
    try {
      const revision = sessionStorage.getItem(`${draftScope}:active`);
      const raw = revision && /^[1-9]\d*$/.test(revision) ? sessionStorage.getItem(`${draftScope}:revision:${revision}`) : null;
      const saved = raw && raw.length <= maxStoredChars ? JSON.parse(raw) : null;
      if (record(saved) && saved.schema === 1 && saved.proposalId === proposal.id && saved.contextId === (contextId || projectId || 'project') && saved.persona === persona && positive(saved.base) && typeof saved.dirty === 'boolean' && validPlan(saved.content) && Array.isArray(saved.selected) && saved.selected.length === 2 && saved.selected.every(value => Number.isSafeInteger(value) && value >= 0)) {
        if (saved.dirty || saved.base === proposal.version) restored = { base: saved.base, content: saved.content, dirty: saved.dirty, selected: saved.selected as [number, number] };
      }
      // A pending command is shared across persona-specific drafts. Switching
      // persona cannot conceal an uncertain creation and enable a second one.
      const stored = sessionStorage.getItem(pendingKey), pending = stored && stored.length <= maxStoredChars ? JSON.parse(stored) : null;
      if (record(pending) && pending.proposalId === proposal.id && pending.contextId === (contextId || projectId || 'project') && validAttempt(pending.attempt, proposal.id)) setRetry(pending.attempt);
    } catch { setStorageError('Não foi possível recuperar o armazenamento desta sessão. Confira o conteúdo antes de continuar.'); }
    latestDraft.current = restored; setDraft(restored); setReady(true);
  // The keyed editor restores once. New server revisions cannot replace a dirty edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (proposal.status === 'applied') setReceipt(proposal);
    if (ready && !draft.dirty && !retry && !busy && proposal.version > draft.base) commit({ ...draft, content: structuredClone(proposal.content), base: proposal.version });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, ready, draft.dirty, draft.base, retry, busy]);
  useEffect(() => {
    if (!draft.dirty && !retry) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft.dirty, retry]);
  useEffect(() => { if (ready) pendingCallback.current?.(Boolean(retry)); }, [ready, retry]);
  function edit(change: (value: Plan) => void, selected?: [number, number]) {
    if (locked) return;
    const next = structuredClone(latestDraft.current.content); change(next);
    commit({ ...latestDraft.current, content: next, dirty: true, selected: selected || latestDraft.current.selected });
    setConfirm(false); setConfirmed(false); setDiscard(false);
    if (selected) requestAnimationFrame(() => heading.current?.focus());
  }
  function select(selected: [number, number]) {
    commit({ ...latestDraft.current, selected }); setConfirm(false); setConfirmed(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ proposalId: proposal.id, baseRevision: draft.base, persona, content: draft.content }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rascunho-proposta-${proposal.id}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  function remember(attempt: Attempt): boolean {
    try {
      let stored: unknown = null; try { stored = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { /* An invalid local record cannot replace this validated command. */ }
      const existing = record(stored) && record(stored.attempt) && stored.attempt.key === attempt.key ? pendingProposalSnapshot(stored.proposal, proposal.id, attempt) : null;
      const snapshot = existing || pendingProposalSnapshot({ ...proposal, projectId: proposal.projectId || projectId, version: attempt.body.expectedVersion, projectVersion: attempt.method === 'POST' ? attempt.body.expectedProjectVersion : proposal.projectVersion, sessionVersion: attempt.method === 'POST' ? attempt.body.expectedSessionVersion : proposal.sessionVersion, content: attempt.method === 'PATCH' ? attempt.body.content : proposal.content }, proposal.id, attempt);
      if (!snapshot) throw Error('Invalid proposal snapshot');
      sessionStorage.setItem(pendingKey, JSON.stringify({ proposalId: proposal.id, contextId: contextId || projectId || 'project', attempt, proposal: snapshot })); setRetry(attempt); return true;
    }
    catch { setError('Não foi possível preservar a solicitação. Libere o armazenamento desta sessão antes de enviar.'); return false; }
  }
  function clearAttempt(attempt: Attempt) {
    try { const stored = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); if (stored?.attempt?.key === attempt.key) sessionStorage.removeItem(pendingKey); } catch { /* A confirmed response remains confirmed. */ }
    setRetry(null);
  }
  async function execute(attempt: Attempt) {
    if (commandInFlight.current || attempt.persona !== persona || !validAttempt(attempt, proposal.id)) return;
    if (!remember(attempt)) return;
    commandInFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api${attempt.path}`, { method: attempt.method, headers: { 'Content-Type': 'application/json', 'X-Persona': attempt.persona, 'Idempotency-Key': attempt.key }, body: JSON.stringify(attempt.body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof result?.error === 'string' ? result.error : result?.error?.message || result?.message || `Falha (${response.status}).`;
        if (response.status >= 500) throw new Error(message);
        clearAttempt(attempt); setError(`${message}${response.status === 409 ? ' Seu rascunho local foi preservado. Confira a revisão vigente; a solicitação anterior não será reenviada com outra chave automaticamente.' : ''}`); onRefresh(); return;
      }
      if (!result?.proposal || !validPlan(result.proposal.content) || result.proposal.id !== proposal.id || !positive(result.proposal.version) || attempt.method === 'POST' && result.proposal.status !== 'applied') throw new Error('A resposta não confirmou a revisão esperada.');
      clearAttempt(attempt); setConfirm(false); setConfirmed(false);
      if (attempt.method === 'PATCH') commit({ ...latestDraft.current, content: result.proposal.content, base: result.proposal.version, dirty: false });
      else { setReceipt({ ...result.proposal, creationReceipt: result.proposal.creationReceipt || result.creationReceipt || null }); commit({ ...latestDraft.current, dirty: false }); window.dispatchEvent(new Event('sdlc-plan-applied')); }
      onRefresh();
    } catch (failure) { setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'} A confirmação não chegou. Confirme a mesma operação abaixo, sem duplicá-la.`); }
    finally { commandInFlight.current = false; setBusy(false); }
  }
  function save() {
    if (locked || !draft.dirty || conflict || stale) return;
    const next = cleanPlan(draft.content), issue = planIssue(next);
    if (issue) { setError(issue.message); if (issue.selected) select(issue.selected); return; }
    void execute({ method: 'PATCH', path: `/assistant/plans/${proposal.id}`, body: { expectedVersion: draft.base, content: next }, key: crypto.randomUUID(), persona });
  }
  function apply() {
    if (locked || !canApply || !confirmed || draft.dirty || stale || conflict) return;
    void execute({ method: 'POST', path: `/assistant/plans/${proposal.id}/apply`, body: { expectedVersion: draft.base, expectedProjectVersion: proposal.projectVersion, expectedSessionVersion: proposal.sessionVersion, confirmed: true }, key: crypto.randomUUID(), persona });
  }
  function fields(item: { title: string; description: string }, change: (value: Plan, field: 'title' | 'description', valueText: string) => void, label: string) {
    return <><label>{label}<input required maxLength={120} value={item.title} disabled={locked} onChange={event => edit(value => change(value, 'title', event.target.value))} /></label><label>Descrição<textarea maxLength={2000} rows={3} value={item.description} disabled={locked} onChange={event => edit(value => change(value, 'description', event.target.value))} /></label></>;
  }
  function choices(ids: string[], available: Repository[], change: (ids: string[]) => void, label: string) {
    return <fieldset className="plan-repositories" disabled={locked}><legend>{label}</legend>{available.length ? available.map(repo => <label key={repo.id}><input type="checkbox" checked={ids.includes(repo.id)} disabled={!ids.includes(repo.id) && ids.length >= 20} onChange={event => change(event.target.checked ? [...ids, repo.id] : ids.filter(id => id !== repo.id))} />{repo.name} <small>{repo.key}</small></label>) : <p>Nenhum componente disponível neste escopo.</p>}</fieldset>;
  }
  function taskFields(task: PlanTask, index: number) {
    return <div className="plan-fields">{fields(task, (value, field, valueText) => { value.epics[ei].stories[si].tasks[index][field] = valueText; }, 'Título da tarefa')}{choices(task.repositoryIds, repositories.filter(repo => story.repositoryIds.includes(repo.id)), ids => edit(value => { value.epics[ei].stories[si].tasks[index].repositoryIds = ids; }), 'Componentes da tarefa')}</div>;
  }
  const actualReceipt = receiptProposal.creationReceipt;
  return <section className="assistant-plan-review" aria-label="Revisão do plano" aria-busy={busy}>
    <div className="plan-review-heading"><h3>{applied ? 'Plano aplicado' : historical ? 'Consulta da proposta' : 'Revisar plano de implementação'}</h3><span>Revisão {applied ? receiptProposal.version : historical ? proposal.version : draft.base}</span></div>
    {busy && <LoadingState>Confirmando operação sobre a proposta…</LoadingState>}
    <p className="plan-destination">Destino: <strong>{projectName}</strong><br />{applied ? actualReceipt ? `${actualReceipt.totals.epics} épico(s) → ${actualReceipt.totals.stories} história(s) → ${actualReceipt.totals.tasks} tarefa(s)` : `${receiptProposal.appliedItemIds?.length || 0} IDs registrados · distribuição por tipo indisponível` : `${counts.epics} épico(s) → ${counts.stories} história(s) → ${counts.tasks} tarefa(s)`}</p>
    {applied ? <div className="plan-receipt" aria-label="Recibo do plano aplicado">
      <p role="status" className="assistant-review-ready">Criação confirmada pela API. Revisão aplicada: {receiptProposal.version}.</p>
      {actualReceipt ? <><p>{actualReceipt.totals.total} itens disponíveis nesta consulta de {actualReceipt.coverage.expected} IDs registrados na aplicação.{!actualReceipt.coverage.complete && ' O recibo é parcial: há itens registrados que não estão disponíveis nesta consulta.'}</p><p className="assistant-help">Os status abaixo são os status atuais dos itens consultados.</p><ul>{actualReceipt.items.filter(item => item.kind === 'story' || item.kind === 'epic').map(item => <li key={item.id}><Link href={`/${item.kind === 'story' ? 'stories' : 'epics'}/${encodeURIComponent(item.id)}`}>{item.key} · {item.name}</Link> · {statusLabels[item.status] || item.status}{item.archived && ' · Arquivado'}</li>)}</ul></> : <p>Este registro não possui um recibo detalhado disponível. {receiptProposal.appliedItemIds?.length || 0} IDs de itens foram registrados; consulte a hierarquia do Projeto para conferir os itens.</p>}
      {projectId && <p><Link href={`/projects/${encodeURIComponent(projectId)}`}>Abrir Projeto {projectName} →</Link></p>}
      {actualReceipt && actualReceipt.totals.tasks > 0 && <details><summary>Consultar Tarefas criadas · {actualReceipt.totals.tasks}</summary><ul>{actualReceipt.items.filter(item => item.kind === 'task').map(item => <li key={item.id}><Link href={`/tasks/${encodeURIComponent(item.id)}`}>{item.key} · {item.name}</Link> · {statusLabels[item.status] || item.status}{item.archived && ' · Arquivado'}</li>)}</ul></details>}
      <p className="assistant-help">A criação do plano não aprova G1 nem inicia codificação. Continue a revisão da especificação e o planejamento na própria História.</p>
      <details><summary>Consultar conteúdo da proposta aplicada</summary><p className="description">{receiptProposal.content.summary}</p><ol>{receiptProposal.content.epics.map((entry, index) => <li key={index}><strong>{entry.title}</strong><ul>{entry.stories.map((item, storyIndex) => <li key={storyIndex}>{item.title}<p>{item.description}</p><ul>{item.acceptanceCriteria.map((criterion, criterionIndex) => <li key={criterionIndex}>{criterion}</li>)}</ul>{item.requirements && <RequirementsDetails value={item.requirements} />}<h5>Detalhamento de Tarefas registrado na proposta</h5>{item.tasks.length ? <ul>{item.tasks.map((task, taskIndex) => <li key={taskIndex}><strong>{task.title}</strong>{task.pipelineStage && <span> · {pipelineTasks.find(definition => definition.stage === task.pipelineStage)?.name}</span>}<p className="description">{task.description}</p></li>)}</ul> : <p>Sem detalhamentos individuais registrados nesta proposta.</p>}</li>)}</ul></li>)}</ol></details>
      {draft.dirty && <div className="plan-local-draft"><p>Existe também um rascunho local anterior à aplicação. Ele foi preservado e não altera os itens criados.</p><button type="button" onClick={download}>Baixar rascunho local</button></div>}
    </div> : <>
      <p className="assistant-help">{counts.pipelineTasks} Tarefas padrão e {counts.additionalTasks} adicionais. {counts.total}/{planLimits.maxItems} itens · {Math.max(0, remaining)} disponíveis.</p>
      <p>Estados iniciais: Épicos <strong>ACTIVE</strong>, Histórias <strong>SPECIFICATION</strong> e Tarefas <strong>TO DO</strong>.</p>
      {historical && <p className="assistant-help">Proposta consultada no histórico, disponível somente para leitura. Seu rascunho local permanece preservado.</p>}
      {stale && <ErrorState>O Projeto ou a conversa mudou após esta proposta. Gere uma nova proposta a partir do contexto atual para criar os itens.</ErrorState>}
      {conflict && draft.dirty && <ErrorState>Existe uma revisão mais recente. Este rascunho local foi preservado e não pode sobrescrevê-la. Baixe o rascunho para comparar com a revisão vigente antes de descartar a edição local.</ErrorState>}
      <form noValidate onSubmit={event => { event.preventDefault(); save(); }}>
        <div className="plan-editor-actions"><button type="submit" className={draft.dirty ? 'primary' : ''} disabled={locked || !draft.dirty || conflict || stale}>Salvar revisão</button>{draft.dirty && <><button type="button" onClick={download}>Baixar rascunho local</button><button type="button" disabled={busy || Boolean(retry)} onClick={() => setDiscard(true)}>Descartar alterações locais</button></>}</div>
        {draft.dirty && <p className="assistant-help" role="status">Há alterações locais na revisão {draft.base}. Salve a revisão antes de criar os itens.</p>}
        {discard && <div className="plan-confirm" role="group" aria-label="Descartar rascunho local"><p>Descartar suas alterações locais e carregar a revisão {proposal.version} da API?</p><button type="button" disabled={busy || Boolean(retry)} onClick={() => { commit({ content: structuredClone(proposal.content), base: proposal.version, dirty: false, selected: [0, 0] }); setDiscard(false); setError(''); setConfirm(false); }}>Confirmar descarte do rascunho</button><button type="button" onClick={() => setDiscard(false)}>Manter rascunho</button></div>}
        <label>Resumo do plano<textarea maxLength={2000} rows={3} value={content.summary} disabled={locked} onChange={event => edit(value => { value.summary = event.target.value; })} /></label>
        <nav className="plan-story-picker" aria-label="Histórias da proposta"><h4>Visão do plano</h4><ol>{content.epics.map((entry, epicIndex) => <li key={epicIndex}><strong>Épico {epicIndex + 1}: {entry.title || 'Sem título'}</strong><ol>{entry.stories.map((item, storyIndex) => <li key={storyIndex}><button type="button" aria-pressed={ei === epicIndex && si === storyIndex} onClick={() => select([epicIndex, storyIndex])}>História {storyIndex + 1}: {item.title || 'Sem título'}<small>{pipelineStages.length} tarefas padrão + {item.tasks.filter(task => !task.pipelineStage).length} adicionais</small></button></li>)}</ol><button type="button" disabled={locked || entry.stories.length >= planLimits.maxStoriesPerEpic || remaining < 1 + pipelineStages.length} onClick={() => edit(value => { value.epics[epicIndex].stories.push(emptyStory()); }, [epicIndex, entry.stories.length])}>Adicionar história ao Épico {epicIndex + 1}</button></li>)}</ol><button type="button" disabled={locked || content.epics.length >= planLimits.maxEpics || remaining < 2 + pipelineStages.length} onClick={() => edit(value => { value.epics.push({ title: '', description: '', stories: [emptyStory()] }); }, [content.epics.length, 0])}>Adicionar épico</button><p className="assistant-help">Até {planLimits.maxEpics} Épicos e {planLimits.maxStoriesPerEpic} Histórias por Épico, dentro do limite total. Uma nova História ocupa 7 itens; um novo Épico com História ocupa 8.</p></nav>
        <section className="plan-story-editor" aria-label="História selecionada" key={`${ei}:${si}`}>
          <h4 ref={heading} tabIndex={-1}>{historical ? 'História' : 'Editando História'} {ei + 1}.{si + 1}: {story.title || 'Sem título'}</h4>
          <details className="plan-epic-editor"><summary>Detalhes do Épico {ei + 1}: {epic.title || 'Sem título'}</summary><div className="plan-fields">{fields(epic, (value, field, valueText) => { value.epics[ei][field] = valueText; }, 'Título do épico')}<button type="button" className="plan-remove" disabled={locked || content.epics.length <= 1} onClick={() => edit(value => { value.epics.splice(ei, 1); }, [0, 0])}>Remover épico {ei + 1} e seus itens</button></div></details>
          <div className="plan-fields">{fields(story, (value, field, valueText) => { value.epics[ei].stories[si][field] = valueText; }, 'Título da história')}
            {story.requirements ? <PlanRequirements value={story.requirements} disabled={locked} onChange={patch => edit(value => { const target = value.epics[ei].stories[si]; target.requirements = { ...target.requirements!, ...patch }; })} /> : <div className="plan-local-draft"><p>A descrição e os critérios desta proposta serão usados como base da especificação. Você pode detalhar os requisitos antes de criar os itens.</p><button type="button" disabled={locked} onClick={() => edit(value => { const target = value.epics[ei].stories[si]; target.requirements = emptyRequirements(target); })}>Adicionar especificação estruturada</button></div>}
            <fieldset className="plan-criteria" disabled={locked}><legend>Critérios de aceitação</legend>{story.acceptanceCriteria.map((criterion, index) => <div key={index}><label>Critério {index + 1}<input required maxLength={500} value={criterion} onChange={event => edit(value => { const target = value.epics[ei].stories[si]; target.acceptanceCriteria[index] = event.target.value; if (target.requirements) target.requirements.functionalCriteria = [...target.acceptanceCriteria]; })} /></label>{story.acceptanceCriteria.length > 1 && <button type="button" onClick={() => edit(value => { const target = value.epics[ei].stories[si]; target.acceptanceCriteria.splice(index, 1); if (target.requirements) target.requirements.functionalCriteria = [...target.acceptanceCriteria]; })}>Remover critério {index + 1}</button>}</div>)}<button type="button" disabled={story.acceptanceCriteria.length >= 12} onClick={() => edit(value => { const target = value.epics[ei].stories[si]; target.acceptanceCriteria.push(''); if (target.requirements) target.requirements.functionalCriteria = [...target.acceptanceCriteria]; })}>Adicionar critério</button></fieldset>
            {choices(story.repositoryIds, repositories, ids => edit(value => { const target = value.epics[ei].stories[si]; target.repositoryIds = ids; target.tasks.forEach(task => { task.repositoryIds = task.repositoryIds.filter(id => ids.includes(id)); }); }), 'Componentes da história')}
            <section className="plan-pipeline" aria-label="Tarefas padrão do pipeline"><h4>6 Tarefas padrão do pipeline</h4><p className="assistant-help">Estas etapas serão criadas para cada História. Detalhar uma etapa mantém a própria Tarefa, sem criar outra equivalente.</p><ol>{pipelineTasks.map(definition => { const index = story.tasks.findIndex(task => task.pipelineStage === definition.stage), task = story.tasks[index]; return <li key={definition.stage}><details><summary>{definition.name} <small>{task ? 'Detalhada nesta proposta' : 'Planejamento padrão'}</small></summary>{task ? <>{taskFields(task, index)}<button type="button" disabled={locked} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.splice(index, 1); })}>Restaurar planejamento padrão de {definition.name}</button></> : <><p>{definition.description}</p><button type="button" disabled={locked || story.tasks.length >= planLimits.maxTaskDetailsPerStory} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.push({ title: definition.name, description: definition.description, repositoryIds: [], pipelineStage: definition.stage }); })}>Detalhar {definition.name}</button></>}</details></li>; })}</ol></section>
            <section className="plan-extra-tasks" aria-label="Tarefas adicionais"><h4>Tarefas adicionais · {story.tasks.filter(task => !task.pipelineStage).length}</h4><p className="assistant-help">Trabalho específico além das seis etapas do pipeline.</p>{story.tasks.filter(task => !task.pipelineStage).length === 0 && <p>Nenhuma Tarefa adicional.</p>}<ol>{story.tasks.map((task, index) => task.pipelineStage ? null : <li key={index}><details open><summary>Tarefa adicional: {task.title || 'Sem título'}</summary>{taskFields(task, index)}<button type="button" className="plan-remove" disabled={locked} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.splice(index, 1); })}>Remover tarefa adicional {task.title || 'sem título'}</button></details></li>)}</ol><button type="button" disabled={locked || story.tasks.length >= planLimits.maxTaskDetailsPerStory || remaining < 1} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.push(emptyTask()); })}>Adicionar tarefa adicional</button><p className="assistant-help">{story.tasks.length}/{planLimits.maxTaskDetailsPerStory} detalhamentos nesta História, entre padrões detalhados e adicionais. Os padrões não detalhados continuam presentes.</p></section>
            <button type="button" className="plan-remove" disabled={locked || epic.stories.length <= 1} onClick={() => edit(value => { value.epics[ei].stories.splice(si, 1); }, [ei, 0])}>Remover história {si + 1} e suas tarefas</button>
          </div>
        </section>
      </form>
      {!canApply && !historical && <p className="assistant-help">A criação exige permissão de Admin, Product Owner ou Arquiteto e contexto disponível para alterações.</p>}
      <button type="button" className="primary" disabled={locked || !canApply || draft.dirty || stale || conflict} onClick={() => { setConfirm(true); setConfirmed(false); }}>Conferir criação dos itens</button>
      {confirm && <div className="plan-confirm" role="group" aria-label="Confirmar aplicação do plano"><strong>Criar no Projeto {projectName}?</strong><p>{counts.epics} épico(s), {counts.stories} história(s) e {counts.tasks} tarefa(s): {counts.pipelineTasks} padrão + {counts.additionalTasks} adicionais. A criação será registrada no histórico com sua persona.</p><p>Épicos ACTIVE · Histórias SPECIFICATION · Tarefas TO DO.</p><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisei o plano e confirmo a criação destes itens.</label><div><button type="button" className="primary" disabled={!confirmed || locked || stale || draft.dirty || conflict || !canApply} onClick={apply}>Confirmar criação</button><button type="button" disabled={busy || Boolean(retry)} onClick={() => setConfirm(false)}>Cancelar</button></div></div>}
    </>}
    {storageError && <ErrorState>{storageError}</ErrorState>}
    {error && <ErrorState>{error}</ErrorState>}
    {retry && <div className="plan-pending" role="status"><p>Há uma {retry.method === 'PATCH' ? 'revisão' : 'criação'} aguardando confirmação com a persona {retry.persona}. A solicitação original foi preservada.</p><button type="button" disabled={busy || retry.persona !== persona} onClick={() => void execute(retry)}>{busy && <Spinner />}Confirmar operação pendente</button>{retry.persona !== persona && <p className="assistant-help">Selecione a persona {retry.persona} para confirmar a mesma solicitação.</p>}</div>}
  </section>;
}
