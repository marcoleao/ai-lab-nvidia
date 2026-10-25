'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, ExternalLink, ShieldCheck } from 'lucide-react';
import ExecutionDiscussion from './execution-discussion';
import MergeControl from './merge-control';
import './execution-navigation.css';
import {Spinner,LoadingState,ErrorState,displayDate} from './experience-ui';

type ExecutionTab = 'overview' | 'specification' | 'blockers' | 'delivery';
type Props = { storyId: string; persona: string; version: number; status: string; onRefresh: () => void; tab?: ExecutionTab | 'hidden'; actionTargetId?: string; onTabChange?: (tab: ExecutionTab) => void };
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
const stages = [ ['specification', 'Especificação'], ['gate', 'Aprovação G1'], ['context', 'Contexto'], ['generation', 'Código'], ['publishing', 'Publicação no GitLab'], ['completed', 'Merge Request disponível'] ];
const labels: Record<Run['state'], string> = { queued: 'QUEUED · aguardando processamento', running: 'RUNNING · execução em andamento', waiting_approval: 'WAITING APPROVAL · decisão humana necessária', waiting_input: 'WAITING INPUT · aguardando sua orientação', succeeded: 'SUCCEEDED · Merge Request criado', failed: 'FAILED · execução interrompida', cancelled: 'CANCELLED · execução cancelada' };
const pending = (run?: Run | null) => run?.state === 'queued' || run?.state === 'running';
const activities: Record<string, string> = { specification: 'Preparando os requisitos, a arquitetura e os casos de teste para sua revisão.', gate: 'A especificação aguarda sua revisão e aprovação no G1.', context: 'Consultando o contexto do repositório vinculado.', generation: 'Gerando a proposta de código para o escopo aprovado.', publishing: 'Publicando a branch e verificando o Merge Request no GitLab.', discussion: 'Analisando a conversa sobre o impedimento.', completed: 'A proposta de código está disponível no Merge Request.' };

export default function StoryExecution(props: Props) { return <ExecutionPanel key={props.storyId} {...props} />; }

function ExecutionPanel({ storyId, persona, version, status, onRefresh, tab, actionTargetId, onTabChange }: Props) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const [mergeFinished,setMergeFinished]=useState(false);
  const [mergeState,setMergeState]=useState('');
  const [qualityState,setQualityState]=useState('');
  const [connectionError, setConnectionError] = useState('');
  const [lastChecked, setLastChecked] = useState('');
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);
  const callback = useRef(onRefresh);
  callback.current = onRefresh;
  const observed = useRef('');
  const run = data?.run;
  useEffect(()=>{setMergeFinished(false);setMergeState('');setQualityState('');},[run?.id]);
  const mergeRequestUrl = run?.mergeRequestUrl && /^https?:\/\//i.test(run.mergeRequestUrl) ? run.mergeRequestUrl : null;
  const canTechnicalRetry = Boolean(run?.technicalRetryAvailable && ['failed', 'waiting_input'].includes(run.state));
  const canDiscuss = run && (run.state === 'waiting_input' || (run.state === 'failed' && ['specification', 'generation', 'discussion'].includes(run.stage)));
  const canAct = ['ana', 'bruno', 'admin'].includes(persona);
  useEffect(() => { setActionTarget(actionTargetId ? document.getElementById(actionTargetId) : null); }, [actionTargetId, storyId]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await request<Result>(`/items/${encodeURIComponent(storyId)}/execution`);
        if (!alive) return;
        setData(next);
        setConnectionError('');
        setLastChecked(new Date().toISOString());
        const identity = next.run ? `${next.run.id}:${next.run.state}:${next.run.stage}` : '';
        if (observed.current && observed.current !== identity) callback.current();
        observed.current = identity;
        timer = setTimeout(load, pending(next.run) ? 2000 : 5000);
      } catch (failure) {
        if (!alive) return;
        setConnectionError(failure instanceof Error ? failure.message : 'Não foi possível consultar a execução.');
        timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [storyId, refresh]);
  useEffect(() => { setConfirmed(false); }, [run?.id, run?.state, version, persona]);
  useEffect(() => {
    if (run?.state === 'waiting_input' || run?.stage === 'discussion' || (tab === 'blockers' && (canDiscuss || (run?.discussionVersion || 0) > 0))) setDiscussionOpen(true);
  }, [run?.state, run?.stage, run?.discussionVersion, canDiscuss, tab]);

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
  const show = (section: ExecutionTab) => tab === undefined || tab === section;
  const openTab = (next: ExecutionTab) => { if (next === 'blockers') setDiscussionOpen(true); onTabChange?.(next); };
  const currentTitle = !data ? connectionError ? 'Estado da execução indisponível' : 'Consultando execução…' : !run ? 'A execução ainda não começou' : run.state === 'waiting_approval' ? 'Revise a especificação para continuar' : run.state === 'waiting_input' ? canTechnicalRetry ? 'Uma correção técnica precisa ser retomada' : 'A assistente precisa da sua orientação' : run.state === 'failed' ? 'A execução encontrou um impedimento' : run.state === 'succeeded' ? mergeFinished ? 'MERGED · Código integrado no GitLab' : 'Merge Request disponível para revisão' : run.state === 'cancelled' ? 'Execução cancelada' : run.state === 'queued' ? 'Solicitação na fila de processamento' : activities[run.stage] || 'Execução em andamento';
  const nextAction = retry ? 'Confirme a mesma solicitação para recuperar o resultado.' : !data ? 'Aguarde a consulta do serviço antes de iniciar qualquer operação.' : !run || run.state === 'cancelled' ? 'Prepare a execução quando o escopo e os critérios de aceite estiverem definidos.' : run.state === 'waiting_approval' ? 'Leia a especificação na aba Especificação. A autorização G1 fica nesta faixa.' : canTechnicalRetry ? 'Retome a correção técnica. As escolhas e autorizações anteriores serão preservadas.' : canDiscuss ? 'Abra Impedimentos para conversar, preparar uma decisão e revisar a especificação.' : run.state === 'succeeded' ? mergeFinished ? 'O código foi integrado. Acompanhe as verificações e a entrega da História; merge não inicia deploy nem conclui o trabalho.' : 'Consulte a entrega e revise a proposta no GitLab. A História ainda não foi concluída.' : pending(run) ? 'Acompanhe a etapa confirmada pelo serviço. Não é necessário reenviar o pedido.' : 'Retome a execução ou cancele para revisar o escopo.';
  const phaseState=qualityState.split(':')[1]||'';
  const phaseLabel=qualityState.startsWith('code_review:')?'CODE REVIEW':qualityState.startsWith('security_scan:')?'SECURITY SCAN':'';
  const phaseDescriptions:Record<string,string>={not_started:'aguardando execução',queued:'na fila',running:'em análise',blocked:'correção necessária',failed:'verificação falhou',stale:'verificação precisa ser refeita'};
  const qualityTitle=run?.state==='succeeded'&&!mergeFinished&&phaseLabel?`${phaseLabel} · ${phaseDescriptions[phaseState]||phaseState}`:'';
  const workflow = <section className={`execution-workflow execution-state-${run?.state || 'none'} merge-state-${mergeState || 'none'} quality-pending-${!!qualityTitle}`} aria-label="Ações da execução da história" data-testid="execution-workflow">
    <div className="execution-situation"><div><span className="execution-eyebrow">Situação atual</span><h2 role="status">{qualityTitle || (mergeState==='blocked'?'Merge impedido · converse com a assistente':mergeState==='failed'?'Resultado do merge precisa ser verificado':['queued','running'].includes(mergeState)?'Merge solicitado · consultando condições no GitLab':currentTitle)}</h2></div><span className={`badge ${run?.state === 'succeeded' && !qualityTitle && (!mergeState||['tracking','succeeded'].includes(mergeState)) ? 'positive' : ''}`}>{qualityTitle?phaseState.replaceAll('_',' ').toUpperCase():mergeState&&mergeState!=='tracking'?mergeState.toUpperCase():run ? run.state.replaceAll('_', ' ').toUpperCase() : data ? 'NOT STARTED' : connectionError ? 'UNKNOWN' : 'LOADING'}</span></div>
    <p className="execution-next"><strong>Próximo passo:</strong> {qualityTitle?'Execute a próxima verificação na faixa abaixo. Havendo achados, consulte o resultado, converse com a assistente e solicite a correção à IA.':mergeState==='blocked'?'Veja o diagnóstico e continue a conversa abaixo. Depois de resolver o impedimento, reavalie as condições e confirme uma nova tentativa.':mergeState==='failed'?'Consulte o resultado antes de tentar novamente. A conversa abaixo pode esclarecer o impedimento.':['queued','running'].includes(mergeState)?'Aguarde a confirmação do GitLab. Não é necessário reenviar a solicitação.':nextAction}</p>
    {error && <ErrorState>{error}</ErrorState>}
    {run?.error && <ErrorState>{run.error}</ErrorState>}
    {connectionError && <ErrorState onRetry={() => setRefresh(value => value + 1)}><strong>A atualização da tela não chegou.</strong><p>{connectionError}</p><p>{data ? 'O último estado confirmado continua visível.' : 'Ainda não foi possível consultar o estado desta execução.'} Uma falha de conexão não confirma uma falha da execução.</p></ErrorState>}
    {!data&&!connectionError&&<LoadingState>Consultando execução…</LoadingState>}{busy&&<LoadingState>Confirmando solicitação…</LoadingState>}{!connectionError&&(pending(run)||['queued','running'].includes(phaseState)||['queued','running'].includes(mergeState))&&<LoadingState>{qualityTitle||(['queued','running'].includes(mergeState)?'Aguardando confirmação da operação no GitLab.':currentTitle)}</LoadingState>}
    {run?.state === 'waiting_approval' && <div className="decision execution-gate">
      <ShieldCheck size={22} aria-hidden="true" /><div><strong>G1 · Aprovar especificação</strong><p>Confira os requisitos, a arquitetura e os casos de teste antes de autorizar a geração de código.</p></div>
      <label className="execution-confirmation"><input type="checkbox" checked={confirmed} disabled={!canAct || busy || discussionBusy || Boolean(retry)} onChange={event => setConfirmed(event.target.checked)} />Revisei a especificação e autorizo gerar o código e abrir o Merge Request.</label>
      <button className="primary" disabled={!canAct || !confirmed || busy || discussionBusy || Boolean(retry)} onClick={() => void send('aprovação G1', `/executions/${run.id}/approve`, { expectedVersion: version })}>Aprovar G1 e gerar código</button>
    </div>}
    <div className="actions execution-actions">
      {onTabChange && run?.specification && tab !== 'specification' && <button type="button" onClick={() => openTab('specification')}>Revisar especificação</button>}
      {canDiscuss && (!discussionOpen || tab !== 'blockers') && <button type="button" disabled={busy || Boolean(retry)} onClick={() => openTab('blockers')}>Conversar sobre impedimento</button>}
      {run && !canDiscuss && (run.discussionVersion || 0) > 0 && (!discussionOpen || tab !== 'blockers') && <button type="button" onClick={() => openTab('blockers')}>Consultar conversa sobre impedimento</button>}
      {onTabChange && run?.mergeRequestUrl && tab !== 'delivery' && <button type="button" onClick={() => openTab('delivery')}>Consultar entrega</button>}
      {retry ? <button className="primary" disabled={busy || retry.persona !== persona || !canAct} onClick={() => void send(retry.action, retry.path, retry.body)}>{busy ? 'Confirmando…' : `Confirmar solicitação de ${retry.action}`}</button> : <>
        {data && (!run || run.state === 'cancelled') && <button className="primary" disabled={busy || !canAct || !data.configured || status !== 'specification'} onClick={() => void send('preparação', `/items/${storyId}/execution`, { expectedVersion: version })}>{busy ? 'Enviando…' : run ? 'Preparar nova execução' : 'Preparar execução'}</button>}
        {canTechnicalRetry && <button className="primary" disabled={busy || discussionBusy || !canAct || !data?.configured} onClick={() => void send('correção técnica', `/executions/${run!.id}/retry`, {})}>{busy ? 'Enviando…' : 'Retomar correção técnica'}</button>}
        {run?.state === 'failed' && !canTechnicalRetry && <button className="primary" disabled={busy || discussionBusy || !canAct || !data?.configured} onClick={() => void send('retomada', `/executions/${run.id}/retry`, {})}>{busy ? 'Enviando…' : 'Retomar execução'}</button>}
        {run && (pending(run) || run.state === 'waiting_approval' || run.state === 'waiting_input' || run.state === 'failed') && <button disabled={busy || discussionBusy || !canAct || (run.state === 'running' && run.stage === 'publishing')} onClick={() => void send('cancelamento', `/executions/${run.id}/cancel`, {})}>{busy ? 'Enviando…' : run.state === 'failed' ? 'Cancelar e voltar à especificação' : 'Cancelar execução'}</button>}
      </>}
    </div>
    {retry && retry.persona !== persona && <p className="hint">Selecione a mesma persona usada no envio para confirmar a solicitação.</p>}
    {run?.state==='succeeded'&&mergeRequestUrl&&run.commitSha&&<MergeControl key={run.id} executionId={run.id} sha={run.commitSha} version={version} persona={persona} url={mergeRequestUrl} onMerged={()=>setMergeFinished(true)} onState={setMergeState} onQuality={setQualityState} onRefresh={()=>{setRefresh(n=>n+1);callback.current();}}/>}
    {!canAct && <p className="hint">Selecione Administrador, Product Owner ou Arquiteto para iniciar ou aprovar a execução.</p>}
    {data && !data.configured && <p className="hint">As integrações necessárias à execução ainda não estão disponíveis.</p>}
    {run?.state === 'running' && run.stage === 'publishing' && <p className="hint">Aguarde a confirmação do GitLab antes de cancelar ou iniciar outra publicação.</p>}
  </section>;
  return <>
    {actionTarget ? createPortal(workflow, actionTarget) : workflow}
    <section className="panel execution-details" hidden={tab === 'hidden'} aria-label="Execução assistida da história" data-testid="story-execution">
      <div hidden={!show('overview')}>
        <h2>Execução assistida</h2><p className="hint">Da especificação ao Merge Request: acompanhe a etapa real e consulte os detalhes nas abas da História.</p>
        <ol className="process" aria-label="Etapas da execução">{stages.map(([stage, title], position) => <li key={stage} className={stage === run?.stage ? 'active' : ''} aria-current={stage === run?.stage ? 'step' : undefined}><span>{position < index || run?.state === 'succeeded' ? <Check size={17} aria-label="Concluído" /> : <span className="step-number">{position + 1}</span>}</span><strong>{title}</strong></li>)}</ol>
        {run && <p>{labels[run.state]}</p>}
        <div className="execution-monitor" aria-label="Acompanhamento do processamento">{!connectionError&&pending(run)?<Spinner />:<Clock3 size={19} aria-hidden="true"/>}<div><strong>{connectionError ? 'Atualização indisponível' : lastChecked ? 'Consulta automática ativa' : 'Aguardando primeira consulta'}</strong>{run && <p>Etapa informada: {run.stage === 'discussion' ? 'Conversa sobre impedimento' : stages.find(([stage]) => stage === run.stage)?.[1] || run.stage}.</p>}{run && pending(run) && <p>{activities[run.stage] || 'Aguardando a próxima atualização da execução.'} O serviço informa mudanças de etapa; o andamento interno do modelo não está disponível.</p>}{lastChecked && <p>Última consulta bem-sucedida: <time dateTime={lastChecked}>{displayDate(lastChecked)} · America/Sao_Paulo</time>.</p>}{run?.updatedAt && <p>Última alteração registrada: <time dateTime={run.updatedAt}>{displayDate(run.updatedAt)} · America/Sao_Paulo</time>.</p>}</div></div>
        {!run && <p className="hint">A preparação começa no status SPECIFICATION, com critérios de aceite e um repositório vinculado. O Projeto e o Épico precisam estar aprovados.</p>}
        {run?.state === 'failed' && <p className="hint">Retomar preserva os artefatos e verifica o que já foi publicado. Para revisar a história e preparar outra proposta, cancele esta execução.</p>}
      </div>
      <div hidden={!show('specification')} aria-label="Especificação proposta">
        {run?.specification ? <><h2>Especificação para revisão</h2><h3>Requisitos propostos</h3><p className="description">{run.specification.requirements}</p><h3>Arquitetura proposta</h3><p className="description">{run.specification.architecture}</p><h3>Casos de teste</h3><ol>{run.specification.testCases.map((test, i) => <li key={i}><strong>Critério {test.criterionIndex + 1}:</strong> {test.description}</li>)}</ol>{run.specification.risks.length > 0 && <><h3>Riscos identificados</h3><ul>{run.specification.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul></>}</> : <><h2>Especificação</h2><p className="hint">A proposta ficará disponível quando a assistente concluir a preparação.</p></>}
      </div>
      <div hidden={!show('blockers')}>
        <h2>Impedimentos e decisões</h2>
        {Boolean(run?.validationIssues?.length) && <div aria-label="Diagnóstico da validação" className="execution-diagnostics"><h3>Diagnóstico da validação</h3><ul>{run!.validationIssues!.map((issue, i) => <li key={`${issue.path}:${issue.code}:${i}`}><code>{issue.path || 'Resposta gerada'}</code><p>{issue.message}</p><small>{issue.code}</small></li>)}</ul>{run?.state === 'failed' && <p>A correção automática não concluiu a validação. Os impedimentos restantes estão registrados acima.</p>}</div>}
        {canTechnicalRetry && <p className="hint">A correção técnica preserva o escopo, suas escolhas e as autorizações já concedidas, incluindo o G1. Ela ajusta o código com base no diagnóstico da validação. Use Retomar correção técnica na faixa superior.</p>}
        {run && (discussionOpen || run.state === 'waiting_input' || run.stage === 'discussion') ? <ExecutionDiscussion key={run.id} executionId={run.id} persona={persona} running={pending(run)} active={Boolean(canDiscuss) || run.stage === 'discussion'} disabled={busy || Boolean(retry)} onRefresh={() => { setRefresh(value => value + 1); callback.current(); }} onBusyChange={setDiscussionBusy} /> : <p className="hint">{canDiscuss ? 'Use Conversar sobre impedimento na faixa superior para abrir a conversa desta execução.' : 'Nenhuma conversa sobre impedimento disponível nesta execução.'}</p>}
      </div>
      <div hidden={!show('delivery')}>
        <h2>Entrega para revisão</h2>
        {run?.branch && <p>Branch: <code>{run.branch}</code></p>}
        {run?.commitSha && <p>Commit: <code>{run.commitSha}</code></p>}
        {run?.mergeRequestUrl && /^https?:\/\//i.test(run.mergeRequestUrl) ? <p><a href={run.mergeRequestUrl} target="_blank" rel="noreferrer">Abrir Merge Request no GitLab <ExternalLink size={14} aria-hidden="true" /></a></p> : <p className="hint">A branch e o Merge Request aparecerão aqui depois da publicação confirmada no GitLab.</p>}
        <p className="execution-boundary">A entrega da codificação é uma branch com código e um Merge Request. Execute Code Review e Security Scan na faixa de ações; ambos precisam aprovar o mesmo commit antes do merge. Testes, homologação e publicação permanecem nas próximas integrações.</p>
      </div>
    </section>
  </>;
}
