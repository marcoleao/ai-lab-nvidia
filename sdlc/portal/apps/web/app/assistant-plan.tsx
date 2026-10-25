'use client';

import { useEffect, useState } from 'react';
import RequirementsDetails from './requirements-details';
import { ErrorState, LoadingState, Spinner } from './experience-ui';

export type PlanTask = { title: string; description: string; repositoryIds: string[] };
export type Requirements = { version: 1; objective: string; actors: string[]; inputs: { name: string; type: string; description: string; required: boolean; validation: string }[]; outputs: { name: string; type: string; description: string }[]; businessRules: string[]; functionalCriteria: string[]; technicalCriteria: string[]; dependencies: { description: string; kind: 'internal' | 'external' | 'decision'; status: 'confirmed' | 'pending'; reference?: string }[]; exceptions: string[]; nonFunctional: string[]; assumptions: string[]; outOfScope: string[]; openQuestions: string[] };
export type PlanStory = PlanTask & { acceptanceCriteria: string[]; requirements?: Requirements; tasks: PlanTask[] };
export type Plan = { summary: string; epics: { title: string; description: string; stories: PlanStory[] }[] };
export type Proposal = { id: string; status: 'draft' | 'applied'; version: number; projectVersion: number; sessionVersion: number; stale?: boolean; content: Plan; appliedItemIds: string[]; createdAt: string };
export type Repository = { id: string; name: string; key: string };
type Attempt = { method: 'PATCH' | 'POST'; path: string; body: unknown; key: string; persona: string };
type Props = { proposal: Proposal; projectName: string; projectVersion: number; sessionVersion: number; repositories: Repository[]; persona: string; canEdit: boolean; onRefresh: () => void };

export default function PlanReview({ proposal, projectName, projectVersion, sessionVersion, repositories, persona, canEdit, onRefresh }: Props) {
  const [content, setContent] = useState<Plan>(() => structuredClone(proposal.content));
  const [base, setBase] = useState(proposal.version);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [applied, setApplied] = useState(proposal.status === 'applied');
  const stale = proposal.stale === true || proposal.projectVersion !== projectVersion || proposal.sessionVersion !== sessionVersion;
  const canApply = ['admin', 'ana'].includes(persona);
  const conflict = base !== proposal.version;
  const locked = !canEdit || busy || Boolean(retry) || applied;
  useEffect(() => {
    if (proposal.status === 'applied') setApplied(true);
    if (!dirty && !retry && proposal.version > base) { setContent(structuredClone(proposal.content)); setBase(proposal.version); }
  }, [proposal, dirty, retry, base]);
  const receiptContent = applied ? proposal.content : content;
  const counts = { epics: receiptContent.epics.length, stories: receiptContent.epics.reduce((n, e) => n + e.stories.length, 0), tasks: receiptContent.epics.reduce((n, e) => n + e.stories.reduce((s, story) => s + story.tasks.length, 0), 0) };
  const total = counts.epics + counts.stories + counts.tasks;
  const emptyTask = (): PlanTask => ({ title: '', description: '', repositoryIds: [] });
  const emptyStory = (): PlanStory => ({ ...emptyTask(), acceptanceCriteria: [''], tasks: [emptyTask()] });
  function edit(change: (value: Plan) => void) { const next = structuredClone(content); change(next); setContent(next); setDirty(true); setConfirm(false); setConfirmed(false); }
  async function execute(attempt: Attempt) {
    if (attempt.persona !== persona) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api${attempt.path}`, { method: attempt.method, headers: { 'Content-Type': 'application/json', 'X-Persona': persona, 'Idempotency-Key': attempt.key }, body: JSON.stringify(attempt.body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : result.error?.message || result.message || `Falha (${response.status}).`;
        if (response.status >= 500) throw new Error(message);
        setRetry(null); setError(`${message}${response.status === 409 ? ' Seu rascunho foi preservado. Recarregue o contexto e gere uma nova proposta se o plano estiver desatualizado.' : ''}`); onRefresh(); return;
      }
      setRetry(null); setConfirm(false); setConfirmed(false);
      if (attempt.method === 'PATCH') { setDirty(false); if (result.proposal) { setBase(result.proposal.version); setContent(result.proposal.content); } }
      else { setApplied(true); window.dispatchEvent(new Event('sdlc-plan-applied')); }
      onRefresh();
    } catch (failure) { setRetry(attempt); setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'} A confirmação não chegou. Confirme a mesma operação abaixo, sem duplicá-la.`); }
    finally { setBusy(false); }
  }
  function save() { void execute({ method: 'PATCH', path: `/assistant/plans/${proposal.id}`, body: { expectedVersion: base, content }, key: crypto.randomUUID(), persona }); }
  function apply() { void execute({ method: 'POST', path: `/assistant/plans/${proposal.id}/apply`, body: { expectedVersion: base, expectedProjectVersion: proposal.projectVersion, expectedSessionVersion: proposal.sessionVersion, confirmed: true }, key: crypto.randomUUID(), persona }); }
  function fields(item: { title: string; description: string }, change: (value: Plan, field: 'title' | 'description', text: string) => void, label: string) {
    return <><label>{label}<input required maxLength={120} value={item.title} disabled={locked} onChange={event => edit(value => change(value, 'title', event.target.value))} /></label><label>Descrição<textarea maxLength={2000} rows={3} value={item.description} disabled={locked} onChange={event => edit(value => change(value, 'description', event.target.value))} /></label></>;
  }
  function choices(ids: string[], available: Repository[], change: (ids: string[]) => void, label: string) {
    return <fieldset className="plan-repositories" disabled={locked}><legend>{label}</legend>{available.length ? available.map(repo => <label key={repo.id}><input type="checkbox" checked={ids.includes(repo.id)} onChange={event => change(event.target.checked ? [...ids, repo.id] : ids.filter(id => id !== repo.id))} />{repo.name} <small>{repo.key}</small></label>) : <p>Nenhum componente disponível neste escopo.</p>}</fieldset>;
  }
  return <section className="assistant-plan-review" aria-label="Revisão do plano">
    <h3>{applied ? 'Plano aplicado' : 'Revisar plano de implementação'}</h3>
    {busy && <LoadingState>Confirmando operação sobre a proposta…</LoadingState>}
    <p className="plan-destination">Destino: <strong>{projectName}</strong><br />{counts.epics} épico(s) → {counts.stories} história(s) → {counts.tasks} tarefa(s)</p>
    {applied ? <p role="status" className="assistant-review-ready">Os itens foram criados. Consulte a hierarquia do Projeto. Nenhuma aprovação, execução ou implantação foi iniciada.</p> : <>
      <p>Revise a árvore e os critérios antes de aplicar. Os itens serão criados em TO DO / SPECIFICATION / TO DO.</p>
      {stale && <ErrorState>O Projeto ou a conversa mudou após esta proposta. Gere um novo plano a partir do contexto atual para aplicar.</ErrorState>}
      {conflict && dirty && <ErrorState>Existe uma revisão mais recente. Este rascunho local foi preservado e não pode sobrescrevê-la.</ErrorState>}
      <form onInvalidCapture={event => { let section = (event.target as HTMLElement).closest('details'); while (section) { section.open = true; section = section.parentElement?.closest('details') || null; } }} onSubmit={event => { event.preventDefault(); save(); }}>
        <label>Resumo do plano<textarea maxLength={2000} rows={3} value={content.summary} disabled={locked} onChange={event => edit(value => { value.summary = event.target.value; })} /></label>
        <ol className="plan-tree">{content.epics.map((epic, ei) => <li key={ei}><details open={ei === 0}><summary>Épico {ei + 1}: {epic.title}</summary><div className="plan-fields">
          {fields(epic, (value, field, text) => { value.epics[ei][field] = text; }, 'Título do épico')}
          <button type="button" className="plan-remove" disabled={locked || content.epics.length <= 1} onClick={() => edit(value => { value.epics.splice(ei, 1); })}>Remover épico {ei + 1} e seus itens</button>
          <ol>{epic.stories.map((story, si) => <li key={si}><details><summary>História {si + 1}: {story.title}</summary><div className="plan-fields">
            {fields(story, (value, field, text) => { value.epics[ei].stories[si][field] = text; }, 'Título da história')}
            {story.requirements && <details className="plan-requirements"><summary>Requisitos funcionais e técnicos desta História</summary><RequirementsDetails value={story.requirements} /><label>Objetivo da funcionalidade<textarea minLength={10} maxLength={1000} rows={3} value={story.requirements.objective} disabled={locked} onChange={event => edit(value => { value.epics[ei].stories[si].requirements!.objective = event.target.value; })} /></label><label>Critérios de aceite técnicos · um por linha<textarea rows={4} value={story.requirements.technicalCriteria.join('\n')} disabled={locked} onChange={event => edit(value => { value.epics[ei].stories[si].requirements!.technicalCriteria = event.target.value.split('\n'); })} /></label><p className="assistant-help">Revise entradas, saídas, regras e dependências. Para redefinir esses pontos, continue a entrevista e gere uma nova proposta a partir das decisões atualizadas.</p></details>}
            <button type="button" className="plan-remove" disabled={locked || epic.stories.length <= 1} onClick={() => edit(value => { value.epics[ei].stories.splice(si, 1); })}>Remover história {si + 1} e suas tarefas</button>
            <fieldset className="plan-criteria" disabled={locked}><legend>Critérios de aceitação</legend>{story.acceptanceCriteria.map((criterion, ci) => <div key={ci}><label>Critério {ci + 1}<input required maxLength={500} value={criterion} onChange={event => edit(value => { const story = value.epics[ei].stories[si]; story.acceptanceCriteria[ci] = event.target.value; if (story.requirements) story.requirements.functionalCriteria = [...story.acceptanceCriteria]; })} /></label>{story.acceptanceCriteria.length > 1 && <button type="button" onClick={() => edit(value => { const story = value.epics[ei].stories[si]; story.acceptanceCriteria.splice(ci, 1); if (story.requirements) story.requirements.functionalCriteria = [...story.acceptanceCriteria]; })}>Remover critério {ci + 1}</button>}</div>)}{story.acceptanceCriteria.length < 12 && <button type="button" onClick={() => edit(value => { const story = value.epics[ei].stories[si]; story.acceptanceCriteria.push(''); if (story.requirements) story.requirements.functionalCriteria = [...story.acceptanceCriteria]; })}>Adicionar critério</button>}</fieldset>
            {choices(story.repositoryIds, repositories, ids => edit(value => { const target = value.epics[ei].stories[si]; target.repositoryIds = ids; target.tasks.forEach(task => { task.repositoryIds = task.repositoryIds.filter(id => ids.includes(id)); }); }), 'Componentes da história')}
            <ol>{story.tasks.map((task, ti) => <li key={ti}><details><summary>Tarefa {ti + 1}: {task.title}</summary><div className="plan-fields">
              {fields(task, (value, field, text) => { value.epics[ei].stories[si].tasks[ti][field] = text; }, 'Título da tarefa')}
              <button type="button" className="plan-remove" disabled={locked || story.tasks.length <= 1} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.splice(ti, 1); })}>Remover tarefa {ti + 1}</button>
              {choices(task.repositoryIds, repositories.filter(repo => story.repositoryIds.includes(repo.id)), ids => edit(value => { value.epics[ei].stories[si].tasks[ti].repositoryIds = ids; }), 'Componentes da tarefa')}
            </div></details></li>)}</ol>
            <button type="button" disabled={locked || story.tasks.length >= 4 || total >= 30} onClick={() => edit(value => { value.epics[ei].stories[si].tasks.push(emptyTask()); })}>Adicionar tarefa</button>
          </div></details></li>)}</ol>
          <button type="button" disabled={locked || epic.stories.length >= 3 || total + 2 > 30} onClick={() => edit(value => { value.epics[ei].stories.push(emptyStory()); })}>Adicionar história</button>
        </div></details></li>)}</ol>
        <button type="button" disabled={locked || content.epics.length >= 3 || total + 3 > 30} onClick={() => edit(value => { value.epics.push({ title: '', description: '', stories: [emptyStory()] }); })}>Adicionar épico</button>
        <p className="assistant-help">{total}/30 itens. Cada épico contém ao menos uma história; cada história, ao menos uma tarefa.</p>
        <button type="submit" disabled={locked || !dirty || conflict || stale}>Salvar revisão</button>
      </form>
      {dirty && <p className="assistant-help">Há alterações locais. Salve a revisão antes de aplicar.</p>}
      {!canApply && <p className="assistant-help">Admin ou Product Owner deve confirmar a criação dos itens.</p>}
      <button type="button" className="primary" disabled={locked || !canApply || dirty || stale || conflict} onClick={() => { setConfirm(true); setConfirmed(false); }}>Preparar aplicação do plano</button>
      {confirm && <div className="plan-confirm" role="group" aria-label="Confirmar aplicação do plano"><strong>Criar no Projeto {projectName}?</strong><p>{counts.epics} épico(s), {counts.stories} história(s) e {counts.tasks} tarefa(s). A criação será registrada no histórico com sua persona.</p><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Revisei o plano e confirmo a criação destes itens.</label><div><button type="button" className="primary" disabled={!confirmed || locked || stale || dirty || conflict || !canApply} onClick={apply}>Confirmar criação</button><button type="button" disabled={busy || Boolean(retry)} onClick={() => setConfirm(false)}>Cancelar</button></div></div>}
    </>}
    {error && <ErrorState>{error}</ErrorState>}
    {retry && <button type="button" disabled={busy || retry.persona !== persona} onClick={() => void execute(retry)}>{busy && <Spinner />}Confirmar operação pendente</button>}
    {retry && retry.persona !== persona && <p className="assistant-help">Selecione a mesma persona da operação pendente para confirmá-la.</p>}
  </section>;
}
