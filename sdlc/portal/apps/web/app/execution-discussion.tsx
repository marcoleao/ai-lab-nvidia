'use client';

import { useEffect, useRef, useState } from 'react';
import { LoadingState, ErrorState, displayDate } from './experience-ui';

type Discussion = {
  version: number;
  messages: { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; state?: string; error?: string | null }[];
  proposal: { ready: boolean; summary: string; requestedCapabilities: string[] } | null;
  allowDependencies: boolean;
};
type Props = { executionId: string; persona: string; running: boolean; active: boolean; disabled: boolean; onRefresh: () => void; onBusyChange: (value: boolean) => void; readOnly?: boolean; title?: string; guidance?: string };
type Attempt = { path: string; body: Record<string, unknown>; key: string; persona: string; kind: 'message' | 'prepare' | 'resolve' };
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function call<T>(path: string, attempt?: Attempt): Promise<T> {
  const response = await fetch(`/api${path}`, { method: attempt ? 'POST' : 'GET', cache: 'no-store',
    headers: attempt ? { 'Content-Type': 'application/json', 'X-Persona': attempt.persona, 'Idempotency-Key': attempt.key } : {},
    ...(attempt ? { body: JSON.stringify(attempt.body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `Não foi possível concluir a operação (${response.status}).`, response.status);
  return result as T;
}

export default function ExecutionDiscussion({ executionId, persona, running, active, disabled, onRefresh, onBusyChange, readOnly = false, title, guidance }: Props) {
  const [data, setData] = useState<Discussion | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [allowDependencies, setAllowDependencies] = useState(false);
  const storage = `sdlc-execution-discussion:${executionId}`;
  const draftLoaded = useRef(false);
  const callback = useRef(onRefresh); callback.current = onRefresh;
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
  const canAct = !readOnly && ['ana', 'bruno', 'admin'].includes(persona);
  const hasUserChoice = Boolean(data?.messages.some(message => message.role === 'user' && message.state === 'succeeded'));
  useEffect(() => { busyCallback.current(busy || Boolean(retry)); }, [busy, retry]);
  useEffect(() => () => busyCallback.current(false), []);
  useEffect(() => {
    try {
      setDraft(sessionStorage.getItem(`${storage}:draft`) || '');
      const saved = sessionStorage.getItem(`${storage}:pending`);
      if (saved) setRetry(JSON.parse(saved));
    } catch {}
    draftLoaded.current = true;
  }, [storage]);
  useEffect(() => { if (draftLoaded.current) try { sessionStorage.setItem(`${storage}:draft`, draft); } catch {} }, [storage, draft]);
  function remember(value: Attempt | null) {
    setRetry(value);
    try { if (value) sessionStorage.setItem(`${storage}:pending`, JSON.stringify(value)); else sessionStorage.removeItem(`${storage}:pending`); } catch {}
  }
  useEffect(() => { setAllowDependencies(data?.allowDependencies || false); }, [data?.version, data?.allowDependencies, persona]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await call<Discussion>(`/executions/${executionId}/discussion`);
        if (!alive) return;
        setData(next);
        setLoadError('');
      } catch (failure) {
        if (alive) setLoadError(failure instanceof Error ? failure.message : 'Não foi possível consultar a conversa.');
      }
      if (alive) timer = setTimeout(load, 2000);
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [executionId, running, refresh]);

  async function submit(kind: Attempt['kind']) {
    if (busy || disabled || !canAct || !data || (retry && retry.persona !== persona)) return;
    if (!retry && (!active || running || (kind === 'message' ? !draft.trim() : kind === 'prepare' ? !hasUserChoice : !data.proposal?.ready || (data.proposal.requestedCapabilities.includes('dependencies') && !allowDependencies)))) return;
    const attempt = retry || { kind, path: `/executions/${executionId}/${kind === 'resolve' ? 'resolve' : 'messages'}`,
      body: kind === 'message' ? { message: draft.trim(), expectedVersion: data.version } : kind === 'prepare' ? { expectedVersion: data.version, intent: 'prepare_decision' } : { expectedVersion: data.version, confirmed: true, allowDependencies },
      key: crypto.randomUUID(), persona,
    };
    remember(attempt);
    setBusy(true); setError('');
    try {
      await call(attempt.path, attempt);
      remember(null);
      if (attempt.kind === 'message') setDraft('');
      setRefresh(value => value + 1); callback.current();
    } catch (failure) {
      const uncertain = !(failure instanceof ApiError) || failure.status >= 500;
      remember(uncertain ? attempt : null);
      setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'}${uncertain ? ' A confirmação não chegou. Verifique a mesma solicitação sem reenviar uma nova mensagem ou decisão.' : ''}`);
      setRefresh(value => value + 1);
      if (!uncertain) callback.current();
    } finally { setBusy(false); }
  }
  const needsDependencies = data?.proposal?.requestedCapabilities.includes('dependencies');
  return <section aria-label="Conversa sobre impedimento" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, marginTop: 20, overflowWrap: 'anywhere' }}>
    <h3 style={{ marginTop: 0 }}>{title || 'Conversar sobre impedimento'}</h3>
    <p className="hint">{guidance || 'Explique o que precisa mudar ou pergunte pelas alternativas. A assistente usará esta conversa para propor uma decisão e revisar a especificação.'}</p>
    {error && <ErrorState>{error}</ErrorState>}
    {loadError && <ErrorState onRetry={() => setRefresh(value => value + 1)}>{loadError}<p>O último histórico confirmado permanece visível. Uma falha na consulta não informa o resultado da rodada.</p></ErrorState>}
    {!data && !loadError && <LoadingState>Carregando conversa…</LoadingState>}
    {busy && <LoadingState>Confirmando a solicitação enviada à assistente…</LoadingState>}
    {data && <div aria-label="Histórico do impedimento" role="log" aria-live="polite" aria-relevant="additions text">
      {!data.messages.length && <p className="hint">A conversa ficará registrada nesta execução.</p>}
      {data.messages.map(message => <article key={message.id} style={{ borderLeft: `3px solid ${message.role === 'assistant' ? 'var(--blue)' : 'var(--line)'}`, padding: '8px 12px', margin: '12px 0', background: message.role === 'assistant' ? '#f5f9fc' : '#f7f8fa' }}>
        <strong>{message.role === 'assistant' ? 'Assistente IA' : 'Você'}</strong><p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{message.content}</p>
        {message.state && (['queued', 'running'].includes(message.state) ? <LoadingState>{message.state.toUpperCase()} · aguardando o resultado registrado da rodada.</LoadingState> : message.state === 'failed' ? <ErrorState>FAILED · a rodada falhou; envie uma nova mensagem para continuar.</ErrorState> : <p className="hint">{message.state.toUpperCase()}</p>)}
        {message.error && <ErrorState>{message.error}</ErrorState>}
        <time className="hint" dateTime={message.createdAt}>{displayDate(message.createdAt)} · America/Sao_Paulo</time>
      </article>)}
    </div>}
    {running && <LoadingState>A assistente está analisando a conversa. Aguarde a resposta para continuar.</LoadingState>}
    {!active && !retry && <p className="hint">Conversa registrada. A execução segue a especificação revisada e as aprovações do ciclo da história.</p>}
    {!readOnly && <form aria-label="Mensagem sobre o impedimento" onSubmit={event => { event.preventDefault(); void submit('message'); }}>
      <label>Sua mensagem sobre o impedimento<textarea rows={4} maxLength={4000} value={draft} disabled={!active || !canAct || disabled || busy || Boolean(retry)} onChange={event => setDraft(event.target.value)} placeholder="Descreva sua preferência, dúvida ou restrição…" /></label>
      {!retry && <div className="actions"><button className={data?.proposal?.ready ? undefined : 'primary'} disabled={!active || !data || !canAct || disabled || busy || running || !draft.trim()}>Enviar para a assistente</button></div>}
    </form>}
    {!readOnly && active && <div style={{ marginTop: 18 }}>
      <p className="hint">A conversa esclarece suas escolhas. Quando quiser encerrar a discussão, peça um resumo para revisar. Esse pedido prepara a decisão; a implementação depende da sua confirmação e de um novo G1.</p>
      {!retry && <button disabled={!hasUserChoice || !canAct || disabled || busy || running} onClick={() => void submit('prepare')}>Preparar decisão para revisão</button>}
    </div>}
    {data?.proposal && <div className="decision" style={{ marginTop: 20 }}>
      <div><strong>{data.proposal.ready ? 'Decisão proposta' : 'Conversa em andamento'}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{data.proposal.summary}</p></div>
      {needsDependencies && !readOnly && <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', width: '100%' }}><input type="checkbox" checked={allowDependencies} disabled={!active || !canAct || disabled || busy || running || Boolean(retry)} onChange={event => setAllowDependencies(event.target.checked)} />Autorizo adicionar dependências ao projeto para implementar esta decisão.</label>}
      {needsDependencies && !allowDependencies && <p>Para seguir com essa proposta, autorize as dependências. Se preferir outra solução, continue a conversa e peça uma alternativa.</p>}
      {data.proposal.requestedCapabilities.filter(capability => capability !== 'dependencies').map(capability => <p key={capability}>Capacidade solicitada: {capability}</p>)}
      {data.proposal.ready && !readOnly && <><p style={{ width: '100%' }}>Ao confirmar, a assistente revisará a especificação. Você precisará revisar e aprovar um novo G1 antes de gerar código.</p><button className="primary" disabled={!active || !canAct || disabled || busy || running || Boolean(retry) || Boolean(needsDependencies && !allowDependencies)} onClick={() => void submit('resolve')}>Confirmar decisão e revisar especificação</button></>}
    </div>}
    {retry && !readOnly && <div className="actions" style={{ marginTop: 16 }}><button className="primary" disabled={busy || disabled || !canAct || retry.persona !== persona} onClick={() => void submit(retry.kind)}>{busy ? 'Verificando…' : retry.kind === 'message' ? 'Verificar envio da mensagem' : retry.kind === 'prepare' ? 'Verificar preparação da decisão' : 'Verificar confirmação da decisão'}</button></div>}
    {retry && retry.persona !== persona && <p className="hint">Volte à persona usada no envio para verificar a mesma solicitação.</p>}
    {!canAct && <p className="hint">Selecione Administrador, Product Owner ou Arquiteto para conversar e confirmar decisões.</p>}
  </section>;
}
