'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bot, Send } from 'lucide-react';
import { ErrorState, LoadingState, Pagination, Spinner } from './experience-ui';
import './assistant.css';
import PlanReview, { type Proposal, type Repository } from './assistant-plan';

type Props = { contextKey: string; contextLabel: string; contextId: string | null; persona: string; canPlan: boolean; embedded?: boolean; targetProjectId?: string; targetProjectName?: string; onConversation?: (value: Conversation) => void; assistantMode?: 'planning' | 'delivery'; readOnly?: boolean };
type Turn = { id: string; kind?: 'chat' | 'plan'; input: string; output: string | null; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; model: string | null; error: string | null; actorName: string; createdAt: string };
type PageInfo = { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean };
export type Conversation = { context: { id: string; kind: string; name: string; version: number }; session: { id: string; version: number } | null; turns: Turn[]; targetProjects?: {id:string;name:string}[]; proposals?: Proposal[]; availableRepositories?: Repository[]; configured: boolean; model: string | null; requirementsMode?: boolean; assistantMode?: 'planning' | 'delivery'; readOnly?: boolean; activeTurn?: Turn | null; hasSuccessfulInterview?: boolean; turnsPage?: PageInfo; proposalsPage?: PageInfo; brief?: { summary: string; confirmedFacts: string[]; openQuestions: string[] } | null };
type Attempt = { message: string; expectedVersion: number; key: string; persona: string };
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function call<T>(path: string, persona = '', body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(persona ? { 'X-Persona': persona } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `Não foi possível concluir a operação (${response.status}).`, response.status);
  return result as T;
}
const states = { queued: 'QUEUED · aguardando geração', running: 'RUNNING · gerando resposta', succeeded: 'SUCCEEDED · resposta concluída', failed: 'FAILED · falha na geração', cancelled: 'CANCELLED · geração cancelada' };
const pending = (turn: Turn) => turn.status === 'queued' || turn.status === 'running';

export default function Assistant(props: Props) {
  return <ConversationPanel key={props.contextKey} {...props} />;
}

function ConversationPanel({ contextLabel, contextId, persona, canPlan: permission, targetProjectId, targetProjectName, onConversation, assistantMode = 'planning', readOnly = false }: Props) {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const page = Math.max(1, Number(search.get('assistant.page')) || 1), proposalsPage = Math.max(1, Number(search.get('assistant.proposalsPage')) || 1);
  const open = true;
  const [data, setData] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [planRetry, setPlanRetry] = useState<{ expectedVersion: number; key: string; persona: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [targetProject, setTargetProject] = useState('');
  const [completionRetry,setCompletionRetry] = useState<{expectedVersion:number;projectId:string;key:string;persona:string}|null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [view, setView] = useState('interview');
  const [creationMode, setCreationMode] = useState('review');
  const storage = `sdlc-assistant-workspace:${contextId || 'none'}`;
  const restored = useRef(false);
  const callback = useRef(onConversation); callback.current = onConversation;
  const notified=useRef('');
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null), follow = useRef(true);
  const cancelKeys = useRef(new Map<string, string>());
  const active = data?.activeTurn === undefined ? data?.turns?.find(pending) : data.activeTurn;
  const latest = data?.turns?.at(-1);
  const delivery = assistantMode === 'delivery' || data?.assistantMode === 'delivery';
  const canPlan = permission && !readOnly && !data?.readOnly;
  const hasSuccessfulInterview = data?.hasSuccessfulInterview ?? Boolean(data?.turns?.some(turn => turn.kind !== 'plan' && turn.status === 'succeeded'));
  const navigate = (key: string, value: number) => { const params = new URLSearchParams(search.toString()); params.set(`assistant.${key}`, String(value)); router.push(`${pathname}?${params}`, { scroll: false }); };

  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storage) || '{}'); setDraft(saved.draft || ''); setRetry(saved.retry || null); setPlanRetry(saved.planRetry || null); setCompletionRetry(saved.completionRetry || null); setView(saved.view || 'interview'); setCreationMode(saved.creationMode || 'review'); } catch {}
    restored.current = true;
  }, [storage]);
  useEffect(() => { if (restored.current) try { sessionStorage.setItem(storage, JSON.stringify({ draft, retry, planRetry, completionRetry, view, creationMode })); } catch {} }, [storage, draft, retry, planRetry, completionRetry, view, creationMode]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [latest?.id, latest?.status]);
  useEffect(() => { setConfirmed(false); }, [persona, targetProjectId, data?.session?.version]);
  useEffect(() => {
    if (!contextId || (!open && !active)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await call<Conversation>(`/assistant?${new URLSearchParams({ contextId: contextId!, page: String(page), proposalsPage: String(proposalsPage), includeArchived: 'true' })}`);
        if (!alive) return;
        if (!result.context || !Array.isArray(result.turns)) throw new ApiError('A resposta da consulta de conversa está incompleta. Tente atualizar novamente.', 502);
        setData(result); setLoading(false); setConnectionError(''); callback.current?.(result);
        if (open || result.turns.some(pending)) timer = setTimeout(load, 2000);
      } catch (failure) {
        if (!alive) return;
        setLoading(false); setConnectionError(failure instanceof Error ? failure.message : 'Não foi possível carregar a conversa.');
        if (open) timer = setTimeout(load, 5000);
      }
    }
    setLoading(true);
    void load();
    return () => { alive = false; clearTimeout(timer); };
  // Polling is scoped to this context and remains active after closing only while work is pending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, open, Boolean(active), refresh, page, proposalsPage]);

  useEffect(()=>{if(page===1&&latest?.status==='succeeded'&&latest.output?.startsWith('Criados no Projeto ')&&notified.current!==latest.id){notified.current=latest.id;setView('interview');window.dispatchEvent(new Event('sdlc-plan-applied'));}},[latest?.id,latest?.status,latest?.output,page]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!contextId || !data || !canPlan || !persona || busy || planRetry || completionRetry || (active && !retry) || !draft.trim() || (!data.configured && !retry)) return;
    const attempt = retry || { message: draft.trim(), expectedVersion: data.session?.version || 0, key: crypto.randomUUID(), persona };
    if (attempt.persona !== persona) return;
    setRetry(attempt); setBusy(true); setError(''); follow.current = true;
    try {
      await call('/assistant/turns', persona, { contextId, message: attempt.message, expectedVersion: attempt.expectedVersion, ...(delivery ? { assistantMode: 'delivery' } : { requirementsMode: true }) }, attempt.key);
      setDraft(''); setRetry(null); setRefresh(value => value + 1);
      if (page !== 1) navigate('page', 1);
    } catch (failure) {
      const uncertain = !(failure instanceof ApiError) || failure.status >= 500;
      setRetry(uncertain ? attempt : null);
      setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'}${uncertain ? ' A confirmação não chegou. Use Confirmar envio para consultar a mesma solicitação sem duplicá-la.' : ''}`);
      setRefresh(value => value + 1);
    } finally { setBusy(false); }
  }
  async function cancel(turn: Turn) {
    if (busy || !canPlan || !persona) return;
    const key = cancelKeys.current.get(turn.id) || crypto.randomUUID(); cancelKeys.current.set(turn.id, key);
    setBusy(true); setError('');
    try { await call(`/assistant/turns/${turn.id}/cancel`, persona, {}, key); cancelKeys.current.delete(turn.id); setRefresh(value => value + 1); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível cancelar.'); }
    finally { setBusy(false); }
  }
  async function generatePlan() {
    if (delivery || !contextId || !data || !canPlan || busy || !persona || retry || completionRetry || (active && !planRetry) || !planRetry && Boolean(data.brief?.openQuestions.length)) return;
    const attempt = planRetry || { expectedVersion: data.session?.version || 0, key: crypto.randomUUID(), persona };
    if (attempt.persona !== persona) return;
    setPlanRetry(attempt); setBusy(true); setError('');
    try { await call('/assistant/plans', persona, { contextId, expectedVersion: attempt.expectedVersion, requirementsMode: true }, attempt.key); setPlanRetry(null); setView('plans'); setRefresh(value => value + 1); }
    catch (failure) { const uncertain = !(failure instanceof ApiError) || failure.status >= 500; setPlanRetry(uncertain ? attempt : null); setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'}${uncertain ? ' Confirme a geração com a mesma persona para recuperar a solicitação sem duplicá-la.' : ''}`); setRefresh(value => value + 1); }
    finally { setBusy(false); }
  }
  async function completeInterview(){
    if(delivery||!canPlan||!contextId||!data||busy||!['ana','admin'].includes(persona)||retry||planRetry||(active&&!completionRetry)||(!completionRetry&&(!confirmed||Boolean(data.brief?.openQuestions.length))))return;
    const attempt=completionRetry||{expectedVersion:data.session?.version||0,projectId:data.context.kind==='project'?data.context.id:targetProjectId||targetProject,key:crypto.randomUUID(),persona};
    if(!attempt.projectId||attempt.persona!==persona)return;
    setCompletionRetry(attempt);setBusy(true);setError('');
    try{await call('/assistant/complete',persona,{contextId,projectId:attempt.projectId,expectedVersion:attempt.expectedVersion,confirmed:true,requirementsMode:true},attempt.key);setCompletionRetry(null);setConfirmed(false);setRefresh(value=>value+1);}
    catch(failure){const uncertain=!(failure instanceof ApiError)||failure.status>=500;setCompletionRetry(uncertain?attempt:null);setError(`${failure instanceof Error?failure.message:'Falha de conexão.'}${uncertain?' Use Verificar criação para recuperar a mesma solicitação sem duplicar itens.':''}`);setRefresh(value=>value+1);}
    finally{setBusy(false);}
  }
  const blocked = !contextId || !data || (!data.configured && !retry) || !canPlan || !persona || busy || Boolean(planRetry) || Boolean(completionRetry) || Boolean(active && !retry) || Boolean(retry && retry.persona !== persona);

  return <section className="assistant-root assistant-embedded" aria-label={delivery ? 'Conversa contextual da História' : 'Entrevista e planejamento'}>
      <header className="assistant-header"><div className="assistant-avatar"><Bot size={23} /></div><div><p className="assistant-eyebrow">Assistente de Engenharia de Software · {delivery ? 'Execução da História' : 'Planejamento'}</p><h2 id="assistant-title">{delivery ? 'Conversar sobre esta História' : 'Da necessidade ao plano de implementação'}</h2><p>{delivery ? 'Esclareça critérios, evidências e próximos passos desta História. As operações continuam nos controles do processo.' : 'Conte sua necessidade em linguagem de negócio. A assistente ajudará a detalhar as regras, os dados e os critérios.'}</p></div></header>
      <div className="assistant-context" id="assistant-scope"><span>{contextId ? `Conversa ${delivery ? 'da História' : data?.context.kind === 'system' ? 'do Sistema' : 'do Projeto'} · compartilhada entre as personas` : 'Contexto da conversa'}</span><strong>{data?.context.name || contextLabel}</strong>{data?.model && <small>Modelo: {data.model}</small>}</div>
      {!delivery && <nav className="assistant-view-tabs" aria-label="Etapas da entrevista"><button type="button" aria-pressed={view === 'interview'} onClick={() => setView('interview')}>1 · Entrevista</button><button type="button" aria-pressed={view === 'plans'} onClick={() => setView('plans')}>2 · Propostas e confirmação <span>{data?.proposalsPage?.total ?? data?.proposals?.length ?? 0}</span></button></nav>}
      <p className="assistant-disclosure">{delivery ? <><strong>Esta conversa pertence à História.</strong> Ela não altera o planejamento do Projeto, não aprova G1, não inicia código e não autoriza merge ou release. Mudanças de escopo exigem revisão explícita.</> : <><strong>Converse → revise os requisitos → confirme a criação.</strong> Mensagens não aprovam nem criam itens. Administrador ou Product Owner confirma a criação no Projeto escolhido.</>}</p>
      {(readOnly || data?.readOnly) && <p className="assistant-disclosure"><strong>Somente leitura.</strong> O contexto está arquivado ou encerrado; as mensagens registradas continuam disponíveis.</p>}
      {connectionError && <ErrorState onRetry={() => setRefresh(value => value + 1)}><strong>A atualização da conversa não chegou.</strong><p>{connectionError} O último histórico confirmado e seu rascunho foram preservados.</p></ErrorState>}
      {error && <ErrorState>{error}</ErrorState>}
      {busy && <LoadingState>Confirmando solicitação…</LoadingState>}
      <div ref={scroll} className="assistant-scroll" onScroll={event => { const area = event.currentTarget; follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 90; }}>
        {!contextId ? <p className="assistant-intro">Abra um Sistema ou Projeto para iniciar uma conversa no contexto correto.</p> : <>
          {loading && <LoadingState>Carregando conversa…</LoadingState>}
          {data && !data.configured && <ErrorState>A IA local não está configurada. A conversa existente continua disponível para consulta.</ErrorState>}
          {data && !data.turns.length && <p className="assistant-intro">{delivery ? 'Pergunte sobre o trabalho desta História, seus critérios e as evidências necessárias.' : 'Conte o que deseja construir ou modificar. O analista fará perguntas para entender o objetivo, os usuários e as restrições.'}</p>}
          {data && <p className="assistant-intro">{data.turnsPage ? `Consulta paginada · ${data.turnsPage.total} interações registradas. Página 1 contém as mais recentes; as mensagens de cada página seguem a ordem da conversa.` : 'As mensagens exibidas pertencem a este contexto.'} O contexto recebido pelo modelo é independente da página consultada.</p>}
          {active && !data?.turns.some(turn => turn.id === active.id) && <div className="assistant-turn-state"><LoadingState>{states[active.status]} · atividade atual, fora da página consultada.</LoadingState>{canPlan && <button type="button" disabled={busy} onClick={() => void cancel(active)}>Cancelar geração atual</button>}</div>}
          {(delivery || view === 'interview') && data?.turnsPage && <Pagination page={data.turnsPage.page} total={data.turnsPage.total} onPageChange={page => navigate('page', page)} disabled={loading} label="Paginação da conversa contextual" />}
          <div hidden={!delivery && view !== 'interview'} className="assistant-messages" role="log" aria-label={delivery ? 'Conversa da História' : 'Conversa de planejamento'} aria-live="polite" aria-relevant="additions text">
            {data?.turns.map(turn => <div key={turn.id} className="assistant-exchange">
              <p className="assistant-answer"><span>{turn.actorName} · <time dateTime={turn.createdAt}>{new Date(turn.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília</time></span>{turn.input}</p>
              {turn.output && <p className="assistant-question"><span>Assistente IA{turn.model ? ` · ${turn.model}` : ''}</span>{turn.kind === 'plan' && !turn.output.startsWith('Criados no Projeto ') ? turn.status === 'succeeded' ? 'Proposta estruturada gerada. Consulte Propostas e confirmação.' : 'A geração não produziu uma proposta válida. Consulte a falha abaixo.' : turn.output}</p>}
              <div className={`assistant-turn-state ${turn.status}`}><span role={pending(turn) ? 'status' : undefined}>{pending(turn) && <Spinner />}{turn.status === 'failed' && <AlertTriangle size={16} aria-hidden="true" />}{states[turn.status]}</span>{pending(turn) && canPlan && <button type="button" disabled={busy} onClick={() => void cancel(turn)}>Cancelar geração</button>}</div>
              {turn.error && <p className="assistant-error"><AlertTriangle size={16} aria-hidden="true" /> {turn.error}</p>}
              {turn.kind !== 'plan' && ['failed', 'cancelled'].includes(turn.status) && <button type="button" className="assistant-recover" disabled={busy || Boolean(active) || Boolean(retry) || !canPlan} onClick={() => { setDraft(turn.input); input.current?.focus(); }}>Recuperar mensagem no rascunho</button>}
            </div>)}
          </div>
          {(delivery || view === 'interview') && data?.turnsPage && <Pagination page={data.turnsPage.page} total={data.turnsPage.total} onPageChange={page => navigate('page', page)} disabled={loading} label="Paginação inferior da conversa contextual" />}
          {!delivery && data && hasSuccessfulInterview && view === 'interview' && <div className="assistant-review-entry"><button type="button" onClick={() => setView('plans')}>Revisar e concluir entrevista →</button><span>{data.brief?.openQuestions.length ? `${data.brief.openQuestions.length} pergunta(s) registrada(s) para esclarecer.` : 'Confira a proposta e escolha como concluir.'}</span></div>}
          {!delivery && data && hasSuccessfulInterview && <section className="assistant-plan-generation" hidden={view !== 'plans'} aria-label="Concluir entrevista">
            <h3>Próximo passo do planejamento</h3><p>Projeto de destino: <strong>{data.context.kind === 'project' ? data.context.name : targetProjectName || 'Selecione o Projeto acima'}</strong></p>
            {Boolean(data.brief?.openQuestions.length) && <p className="assistant-error">Existem perguntas registradas para esclarecer. Responda à assistente antes de concluir a entrevista ou gerar a proposta.</p>}
            <label htmlFor="assistant-creation-mode">Como deseja concluir?</label><select id="assistant-creation-mode" value={creationMode} disabled={busy || Boolean(active) || Boolean(retry) || Boolean(planRetry) || Boolean(completionRetry)} onChange={event => { setCreationMode(event.target.value); setConfirmed(false); }}><option value="review">Gerar uma proposta e revisar os requisitos</option><option value="create">Concluir entrevista e criar os itens</option></select>
            {creationMode === 'review' ? <><p>A proposta organiza épicos, histórias e tarefas. Revise os requisitos funcionais e técnicos antes de confirmar a criação.</p><button type="button" className="primary" disabled={busy || !canPlan || !persona || !data.configured || Boolean(retry) || Boolean(completionRetry) || Boolean(active && !planRetry) || Boolean(planRetry && planRetry.persona !== persona) || data.context.kind !== 'project' || !planRetry && Boolean(data.brief?.openQuestions.length) || !hasSuccessfulInterview} onClick={() => void generatePlan()}>{planRetry ? 'Confirmar geração do plano' : active?.kind === 'plan' ? 'Gerando proposta…' : 'Gerar proposta para revisão'}</button>{data.context.kind === 'system' && <p className="assistant-help">Para uma proposta revisável, use a entrevista do Projeto. A conversa do Sistema permanece disponível para consulta e conclusão no Projeto escolhido.</p>}</> : <>
              <p>A assistente organizará esta conversa e criará épicos, histórias e tarefas em TO DO / SPECIFICATION / TO DO. Isso não aprova planejamento, código ou implantação.</p>
              <label className="assistant-confirm-creation"><input type="checkbox" checked={confirmed} disabled={busy || Boolean(active) || Boolean(retry) || Boolean(planRetry) || Boolean(completionRetry) || !['ana','admin'].includes(persona)} onChange={event => setConfirmed(event.target.checked)} />Confirmo os requisitos discutidos e autorizo a criação dos itens no Projeto escolhido.</label>
              <button type="button" className="primary" disabled={busy || !canPlan || !['ana','admin'].includes(persona) || !data.configured || Boolean(retry) || Boolean(planRetry) || Boolean(active && !completionRetry) || Boolean(completionRetry && completionRetry.persona !== persona) || !(data.context.kind === 'project' ? data.context.id : targetProjectId || targetProject) || !hasSuccessfulInterview || !completionRetry && (!confirmed || Boolean(data.brief?.openQuestions.length))} onClick={() => void completeInterview()}>{completionRetry ? 'Verificar criação' : active?.kind === 'plan' ? 'Organizando entrevista e criando itens…' : 'Concluir entrevista e criar itens'}</button>
            </>}
            <p className="assistant-help">A operação fica registrada nesta conversa. Para ajustar o escopo, continue a entrevista antes de concluir.</p>
          </section>}
          {!delivery && <div hidden={view !== 'plans'}>{data?.proposalsPage && <Pagination page={data.proposalsPage.page} total={data.proposalsPage.total} onPageChange={page => navigate('proposalsPage', page)} disabled={loading} label="Paginação das propostas" />}{!data?.proposals?.length && <p className="assistant-intro">Nenhuma proposta estruturada disponível neste contexto. Continue a entrevista e solicite uma proposta para revisar os requisitos.</p>}{data?.proposals?.map(proposal => <PlanReview key={proposal.id} proposal={proposal} projectName={data.context.name} projectVersion={data.context.version} sessionVersion={data.session?.version || 0} repositories={data.availableRepositories || []} persona={persona} canEdit={canPlan && Boolean(persona) && !retry && !completionRetry && !planRetry} onRefresh={() => setRefresh(value => value + 1)} />)}{data?.proposalsPage && <Pagination page={data.proposalsPage.page} total={data.proposalsPage.total} onPageChange={page => navigate('proposalsPage', page)} disabled={loading} label="Paginação inferior das propostas" />}</div>}
        </>}
        <div ref={bottom} />
      </div>
      <div className="assistant-bottom" hidden={!delivery && view !== 'interview' || readOnly || Boolean(data?.readOnly)}>
        {contextId && <form className="assistant-compose" onSubmit={submit}>
          <label htmlFor="assistant-message">Sua mensagem</label>
          <textarea ref={input} id="assistant-message" maxLength={4000} rows={3} value={draft} readOnly={Boolean(retry)} disabled={!canPlan || !persona} onChange={event => setDraft(event.target.value)} placeholder={delivery ? 'Pergunte sobre esta História, os critérios ou as evidências…' : 'Descreva sua ideia ou responda ao analista…'} aria-describedby="assistant-message-help" />
          <div><small>{draft.length}/4000</small><button type="submit" className="primary" disabled={blocked || !draft.trim()}>{busy ? <Spinner /> : <Send size={15} />}{busy ? 'Enviando…' : retry ? 'Confirmar envio' : 'Enviar mensagem'}</button></div>
          <p id="assistant-message-help" className="assistant-help">{!canPlan || !persona ? 'Selecione Admin, Product Owner ou Arquiteto para conversar.' : retry ? 'O texto e a chave foram preservados. Confirme o envio com a mesma persona, sem duplicar o pedido.' : active ? 'Aguarde a resposta ou cancele a geração para enviar outra mensagem.' : delivery ? 'A mensagem fica nesta História. Aprovações e operações exigem os controles explícitos do processo.' : 'A conversa e o rascunho são preservados ao navegar. Uma resposta em texto não confirma a criação de itens.'}</p>
        </form>}
      </div>
  </section>;
}
