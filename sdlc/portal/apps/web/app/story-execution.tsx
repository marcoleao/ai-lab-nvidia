'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react';
import ExecutionDiscussion from './execution-discussion';

type Props = { storyId: string; persona: string; version: number; status: string; onRefresh: () => void };
type Run = {
  id: string; state: 'queued' | 'running' | 'waiting_approval' | 'waiting_input' | 'succeeded' | 'failed' | 'cancelled';
  stage: string; error: string | null; branch: string | null; mergeRequestUrl: string | null;
  commitSha: string | null; createdAt: string; updatedAt: string;
  discussionVersion?: number;
  validationIssues?: { path: string; code: string; message: string }[];
  technicalRetryAvailable?: boolean;
  specification?: { requirements: string; architecture: string; testCases: { criterionIndex: number; description: string }[]; risks: string[] } | null;
};
type Result = { run: Run | null; configured: boolean };
type Attempt = { path: string; body: Record<string, unknown>; key: string; persona: string; action: string };
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, attempt?: Attempt): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: attempt ? 'POST' : 'GET', cache: 'no-store',
    headers: attempt ? { 'Content-Type': 'application/json', 'X-Persona': attempt.persona, 'Idempotency-Key': attempt.key } : {},
    ...(attempt ? { body: JSON.stringify(attempt.body) } : {}),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(typeof value.error === 'string' ? value.error : value.error?.message || value.message || `Falha ao consultar a execução (${response.status}).`, response.status);
  return value as T;
}
const stages = [ ['specification', 'Especificação'], ['gate', 'Aprovação G1'], ['context', 'Contexto'], ['generation', 'Código'], ['publishing', 'Merge Request'], ['completed', 'Concluído'] ];
const labels: Record<Run['state'], string> = { queued: 'QUEUED · aguardando processamento', running: 'RUNNING · execução em andamento', waiting_approval: 'WAITING APPROVAL · decisão humana necessária', waiting_input: 'WAITING INPUT · aguardando sua orientação', succeeded: 'SUCCEEDED · Merge Request criado', failed: 'FAILED · execução interrompida', cancelled: 'CANCELLED · execução cancelada' };
const pending = (run?: Run | null) => run?.state === 'queued' || run?.state === 'running';

export default function StoryExecution(props: Props) { return <ExecutionPanel key={props.storyId} {...props} />; }

function ExecutionPanel({ storyId, persona, version, status, onRefresh }: Props) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const callback = useRef(onRefresh);
  callback.current = onRefresh;
  const observed = useRef('');
  const run = data?.run;
  const canTechnicalRetry = Boolean(run?.technicalRetryAvailable && ['failed', 'waiting_input'].includes(run.state));
  const canDiscuss = run && (run.state === 'waiting_input' || (run.state === 'failed' && ['specification', 'generation', 'discussion'].includes(run.stage)));
  const canAct = ['ana', 'bruno', 'admin'].includes(persona);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<Result>(`/items/${encodeURIComponent(storyId)}/execution`);
        if (!alive) return;
        setData(next);
        const identity = next.run ? `${next.run.id}:${next.run.state}:${next.run.stage}` : '';
        if (observed.current && observed.current !== identity) callback.current();
        observed.current = identity;
        timer = setTimeout(load, pending(next.run) ? 2000 : 5000);
      } catch (failure) {
        if (!alive) return;
        setError(failure instanceof Error ? failure.message : 'Não foi possível consultar a execução.');
        timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [storyId, refresh]);
  useEffect(() => { setConfirmed(false); }, [run?.id, run?.state, version, persona]);
  useEffect(() => { if (run?.state === 'waiting_input' || run?.stage === 'discussion') setDiscussionOpen(true); }, [run?.state, run?.stage]);

  async function send(action: string, path: string, body: Record<string, unknown>) {
    if (busy || !canAct || (retry && retry.persona !== persona)) return;
    const attempt = retry || { action, path, body, key: crypto.randomUUID(), persona };
    setBusy(true); setError('');
    try {
      await request(attempt.path, attempt);
      setRetry(null); setConfirmed(false); setRefresh(value => value + 1); callback.current();
    } catch (failure) {
      const uncertain = !(failure instanceof RequestError) || failure.status >= 500;
      setRetry(uncertain ? attempt : null);
      setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'}${uncertain ? ' A confirmação não chegou. Confirme a mesma solicitação para recuperar o resultado sem duplicar a execução.' : ''}`);
      setRefresh(value => value + 1);
      if (!uncertain) callback.current();
    } finally { setBusy(false); }
  }
  const index = stages.findIndex(([stage]) => stage === run?.stage);
  return <section className="panel" aria-label="Execução assistida da história" data-testid="story-execution">
    <div className="section-heading" style={{ flexWrap: 'wrap' }}><h2>Execução assistida</h2><span className={`badge ${run?.state === 'succeeded' ? 'positive' : ''}`}>{run ? run.state.replaceAll('_', ' ').toUpperCase() : 'NOT STARTED'}</span></div>
    <p className="hint">Da especificação ao Merge Request: revise a proposta no G1 e autorize a criação do código no repositório vinculado.</p>
    <ol className="process" aria-label="Etapas da execução">{stages.map(([stage, title], position) => <li key={stage} className={stage === run?.stage ? 'active' : ''} aria-current={stage === run?.stage ? 'step' : undefined}><span>{position < index || run?.state === 'succeeded' ? <Check size={17} aria-label="Concluído" /> : <span className="step-number">{position + 1}</span>}</span><strong>{title}</strong></li>)}</ol>
    {error && <p className="alert error" role="alert">{error}</p>}
    {!data && <p role="status">Consultando execução…</p>}
    {run && <p role="status">{labels[run.state]}</p>}
    {run?.error && <p className="alert error" role="alert">{run.error}</p>}
    {Boolean(run?.validationIssues?.length) && <div aria-label="Diagnóstico da validação" style={{ overflowWrap: 'anywhere', margin: '16px 0' }}>
      <h3>Diagnóstico da validação</h3>
      <ul>{run!.validationIssues!.map((issue, i) => <li key={`${issue.path}:${issue.code}:${i}`} style={{ marginBottom: 10 }}><code>{issue.path || 'Resposta gerada'}</code><p style={{ margin: '3px 0' }}>{issue.message}</p><small>{issue.code}</small></li>)}</ul>
      {run?.state === 'failed' && <p>A correção automática não concluiu a validação. Os impedimentos restantes estão registrados acima.</p>}
    </div>}
    {canTechnicalRetry && <div style={{ margin: '16px 0' }}>
      <p className="hint">A correção técnica preserva o escopo, suas escolhas e as autorizações já concedidas, incluindo o G1. Ela ajusta o código com base no diagnóstico da validação.</p>
      {!retry && <button className="primary" disabled={busy || discussionBusy || !canAct || !data?.configured} onClick={() => void send('correção técnica', `/executions/${run!.id}/retry`, {})}>{busy ? 'Enviando…' : 'Retomar correção técnica'}</button>}
    </div>}
    {canDiscuss && !discussionOpen && run.state !== 'waiting_input' && <button disabled={busy || Boolean(retry)} onClick={() => setDiscussionOpen(true)}>Conversar sobre impedimento</button>}
    {run && !canDiscuss && !discussionOpen && (run.discussionVersion || 0) > 0 && <button onClick={() => setDiscussionOpen(true)}>Consultar conversa sobre impedimento</button>}
    {run && (discussionOpen || run.state === 'waiting_input' || run.stage === 'discussion') && <ExecutionDiscussion key={run.id} executionId={run.id} persona={persona} running={pending(run)} active={Boolean(canDiscuss) || run.stage === 'discussion'} disabled={busy || Boolean(retry)} onRefresh={() => { setRefresh(value => value + 1); callback.current(); }} onBusyChange={setDiscussionBusy} />}
    {run?.specification && <div style={{ overflowWrap: 'anywhere' }}>
      <h3>Requisitos propostos</h3><p className="description">{run.specification.requirements}</p>
      <h3>Arquitetura proposta</h3><p className="description">{run.specification.architecture}</p>
      <h3>Casos de teste</h3><ol>{run.specification.testCases.map((test, i) => <li key={i}><strong>Critério {test.criterionIndex + 1}:</strong> {test.description}</li>)}</ol>
      {run.specification.risks.length > 0 && <><h3>Riscos identificados</h3><ul>{run.specification.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></>}
    </div>}
    {run?.state === 'waiting_approval' && <div className="decision">
      <ShieldCheck size={22} aria-hidden="true" /><div><strong>G1 · Aprovar especificação</strong><p>Confira os requisitos, a arquitetura e os casos de teste antes de autorizar a geração de código.</p></div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%' }}><input type="checkbox" checked={confirmed} disabled={!canAct || busy || discussionBusy || Boolean(retry)} onChange={event => setConfirmed(event.target.checked)} />Revisei a especificação e autorizo gerar o código e abrir o Merge Request.</label>
      <button className="primary" disabled={!canAct || !confirmed || busy || discussionBusy || Boolean(retry)} onClick={() => void send('aprovação G1', `/executions/${run.id}/approve`, { expectedVersion: version })}>Aprovar G1 e gerar código</button>
    </div>}
    {run?.branch && <p style={{ overflowWrap: 'anywhere' }}>Branch: <code>{run.branch}</code></p>}
    {run?.commitSha && <p style={{ overflowWrap: 'anywhere' }}>Commit: <code>{run.commitSha}</code></p>}
    {run?.mergeRequestUrl && /^https?:\/\//i.test(run.mergeRequestUrl) && <p><a href={run.mergeRequestUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>Abrir Merge Request no GitLab <ExternalLink size={14} aria-hidden="true" /></a></p>}
    <div className="actions" style={{ marginTop: 16 }}>
      {retry ? <button className="primary" disabled={busy || retry.persona !== persona || !canAct} onClick={() => void send(retry.action, retry.path, retry.body)}>{busy ? 'Confirmando…' : `Confirmar solicitação de ${retry.action}`}</button> : <>
        {data && (!run || run.state === 'cancelled') && <button className="primary" disabled={busy || !canAct || !data.configured || status !== 'specification'} onClick={() => void send('preparação', `/items/${storyId}/execution`, { expectedVersion: version })}>{busy ? 'Enviando…' : run ? 'Preparar nova execução' : 'Preparar execução'}</button>}
        {run?.state === 'failed' && !canTechnicalRetry && <button className="primary" disabled={busy || discussionBusy || !canAct || !data?.configured} onClick={() => void send('retomada', `/executions/${run.id}/retry`, {})}>{busy ? 'Enviando…' : 'Retomar execução'}</button>}
        {run && (pending(run) || run.state === 'waiting_approval' || run.state === 'waiting_input' || run.state === 'failed') && <button disabled={busy || discussionBusy || !canAct || (run.state === 'running' && run.stage === 'publishing')} onClick={() => void send('cancelamento', `/executions/${run.id}/cancel`, {})}>{busy ? 'Enviando…' : run.state === 'failed' ? 'Cancelar e voltar à especificação' : 'Cancelar execução'}</button>}
      </>}
    </div>
    {retry && retry.persona !== persona && <p className="hint">Selecione a mesma persona usada no envio para confirmar a solicitação.</p>}
    {!canAct && <p className="hint">Selecione Administrador, Product Owner ou Arquiteto para iniciar ou aprovar a execução.</p>}
    {data && !data.configured && <p className="hint">As integrações necessárias à execução ainda não estão disponíveis.</p>}
    {!run && <p className="hint">A preparação começa no status SPECIFICATION, com critérios de aceite e um repositório vinculado. O Projeto e o Épico precisam estar aprovados.</p>}
    {run?.state === 'failed' && <p className="hint">Retomar preserva os artefatos e verifica o que já foi publicado. Para revisar a história e preparar outra proposta, cancele esta execução.</p>}
    {run?.state === 'running' && run.stage === 'publishing' && <p className="hint">Aguarde a confirmação do GitLab antes de cancelar ou iniciar outra publicação.</p>}
    <p className="hint" style={{ marginBottom: 0, marginTop: 16 }}>A entrega desta execução é uma branch com código e um Merge Request. Code Review, Security Scan, testes, homologação e publicação continuam nas próximas etapas do ciclo da história.</p>
  </section>;
}
