'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, MessageSquare, Send, X } from 'lucide-react';
import './assistant.css';
import PlanReview, { type Proposal, type Repository } from './assistant-plan';

type Props = { contextKey: string; contextLabel: string; contextId: string | null; persona: string; canPlan: boolean };
type Turn = { id: string; kind?: 'chat' | 'plan'; input: string; output: string | null; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; model: string | null; error: string | null; actorName: string; createdAt: string };
type Conversation = { context: { id: string; kind: string; name: string; version: number }; session: { id: string; version: number } | null; turns: Turn[]; targetProjects?: {id:string;name:string}[]; proposals?: Proposal[]; availableRepositories?: Repository[]; configured: boolean; model: string | null };
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

function ConversationPanel({ contextLabel, contextId, persona, canPlan }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<Attempt | null>(null);
  const [planRetry, setPlanRetry] = useState<{ expectedVersion: number; key: string; persona: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [targetProject, setTargetProject] = useState('');
  const [completionRetry,setCompletionRetry] = useState<{expectedVersion:number;projectId:string;key:string;persona:string}|null>(null);
  const notified=useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const cancelKeys = useRef(new Map<string, string>());
  const active = data?.turns.find(pending);
  const latest = data?.turns.at(-1);

  useEffect(() => { if (open) { dialog.current?.showModal(); input.current?.focus(); } else if (dialog.current?.open) dialog.current.close(); }, [open]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: 'nearest' }); }, [open, latest?.id, latest?.status]);
  useEffect(() => {
    if (!contextId || (!open && !active)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await call<Conversation>(`/assistant?contextId=${encodeURIComponent(contextId!)}`);
        if (!alive) return;
        setData(result); setLoading(false);
        if (open || result.turns.some(pending)) timer = setTimeout(load, 2000);
      } catch (failure) {
        if (!alive) return;
        setLoading(false); setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a conversa.');
        if (open) timer = setTimeout(load, 5000);
      }
    }
    if (!data) setLoading(true);
    void load();
    return () => { alive = false; clearTimeout(timer); };
  // Polling is scoped to this context and remains active after closing only while work is pending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, open, Boolean(active), refresh]);

  useEffect(()=>{if(latest?.status==='succeeded'&&latest.output?.startsWith('Criados no Projeto ')&&notified.current!==latest.id){notified.current=latest.id;window.dispatchEvent(new Event('sdlc-plan-applied'));}},[latest?.id,latest?.status,latest?.output]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!contextId || !data || !canPlan || !persona || busy || planRetry || completionRetry || (active && !retry) || !draft.trim() || (!data.configured && !retry)) return;
    const attempt = retry || { message: draft.trim(), expectedVersion: data.session?.version || 0, key: crypto.randomUUID(), persona };
    if (attempt.persona !== persona) return;
    setBusy(true); setError('');
    try {
      await call('/assistant/turns', persona, { contextId, message: attempt.message, expectedVersion: attempt.expectedVersion }, attempt.key);
      setDraft(''); setRetry(null); setRefresh(value => value + 1);
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
    if (!contextId || !data || !canPlan || busy || !persona || (active && !planRetry)) return;
    const attempt = planRetry || { expectedVersion: data.session?.version || 0, key: crypto.randomUUID(), persona };
    if (attempt.persona !== persona) return;
    setBusy(true); setError('');
    try { await call('/assistant/plans', persona, { contextId, expectedVersion: attempt.expectedVersion }, attempt.key); setPlanRetry(null); setRefresh(value => value + 1); }
    catch (failure) { const uncertain = !(failure instanceof ApiError) || failure.status >= 500; setPlanRetry(uncertain ? attempt : null); setError(`${failure instanceof Error ? failure.message : 'Falha de conexão.'}${uncertain ? ' Confirme a geração com a mesma persona para recuperar a solicitação sem duplicá-la.' : ''}`); setRefresh(value => value + 1); }
    finally { setBusy(false); }
  }
  async function completeInterview(){
    if(!contextId||!data||busy||!['ana','admin'].includes(persona)||(active&&!completionRetry))return;
    const attempt=completionRetry||{expectedVersion:data.session?.version||0,projectId:data.context.kind==='project'?data.context.id:targetProject,key:crypto.randomUUID(),persona};
    if(!attempt.projectId||attempt.persona!==persona)return;
    setBusy(true);setError('');
    try{await call('/assistant/complete',persona,{contextId,projectId:attempt.projectId,expectedVersion:attempt.expectedVersion,confirmed:true},attempt.key);setCompletionRetry(null);setRefresh(value=>value+1);}
    catch(failure){const uncertain=!(failure instanceof ApiError)||failure.status>=500;setCompletionRetry(uncertain?attempt:null);setError(`${failure instanceof Error?failure.message:'Falha de conexão.'}${uncertain?' Use Verificar criação para recuperar a mesma solicitação sem duplicar itens.':''}`);setRefresh(value=>value+1);}
    finally{setBusy(false);}
  }
  const blocked = !contextId || !data || (!data.configured && !retry) || !canPlan || !persona || busy || Boolean(planRetry) || Boolean(completionRetry) || Boolean(active && !retry) || Boolean(retry && retry.persona !== persona);

  return <div className="assistant-root">
    <button ref={launcher} className="assistant-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><MessageSquare size={19} /> Assistente IA <span>IA LOCAL</span></button>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-title" aria-describedby="assistant-scope" onCancel={event => { event.preventDefault(); close(); }} onClose={() => setOpen(false)}>
      <header className="assistant-header"><div className="assistant-avatar"><Bot size={23} /></div><div><p className="assistant-eyebrow">ANÁLISE E PLANEJAMENTO · IA LOCAL</p><h2 id="assistant-title">Assistente IA</h2></div><button type="button" className="assistant-icon" aria-label="Fechar assistente" onClick={close}><X size={21} /></button></header>
      <div className="assistant-context" id="assistant-scope"><span>{contextId ? `Conversa do ${data?.context.kind === 'system' ? 'Sistema' : 'Projeto'} · compartilhada entre as personas` : 'Contexto da conversa'}</span><strong>{data?.context.name || contextLabel}</strong>{data?.model && <small>Modelo: {data.model}</small>}</div>
      <p className="assistant-disclosure"><strong>Converse → conclua a entrevista → acompanhe os itens.</strong> Ao concluir, a assistente cria épicos, histórias e tarefas no Projeto escolhido. A criação exige Admin ou Product Owner.</p>
      <div className="assistant-scroll">
        {!contextId ? <p className="assistant-intro">Abra um Sistema ou Projeto para iniciar uma conversa no contexto correto.</p> : <>
          {loading && <p role="status">Carregando conversa…</p>}
          {data && !data.configured && <p className="assistant-error">A IA local não está configurada. A conversa existente continua disponível para consulta.</p>}
          {data && !data.turns.length && <p className="assistant-intro">Conte o que deseja construir ou modificar. O analista fará perguntas para entender o objetivo, os usuários e as restrições.</p>}
          {data && <p className="assistant-intro">O histórico completo fica salvo; o painel mostra as últimas 50 interações. O modelo recebe um recorte recente da conversa.</p>}
          <div className="assistant-messages" role="log" aria-label="Conversa de planejamento" aria-live="polite" aria-relevant="additions text">
            {data?.turns.map(turn => <div key={turn.id} className="assistant-exchange">
              <p className="assistant-answer"><span>{turn.actorName} · <time dateTime={turn.createdAt}>{new Date(turn.createdAt).toLocaleString('pt-BR')}</time></span>{turn.input}</p>
              {turn.output && <p className="assistant-question"><span>Assistente IA{turn.model ? ` · ${turn.model}` : ''}</span>{turn.kind === 'plan' && !turn.output.startsWith('Criados no Projeto ') ? turn.status === 'succeeded' ? 'Plano estruturado gerado. Consulte a revisão abaixo.' : 'A geração não produziu uma proposta válida. Consulte a falha abaixo.' : turn.output}</p>}
              <div className={`assistant-turn-state ${turn.status}`}><span role={pending(turn) ? 'status' : undefined}>{states[turn.status]}</span>{pending(turn) && canPlan && <button type="button" disabled={busy} onClick={() => void cancel(turn)}>Cancelar geração</button>}</div>
              {turn.error && <p className="assistant-error">{turn.error}</p>}
              {turn.kind !== 'plan' && ['failed', 'cancelled'].includes(turn.status) && <button type="button" className="assistant-recover" disabled={busy || Boolean(active) || Boolean(retry) || !canPlan} onClick={() => { setDraft(turn.input); input.current?.focus(); }}>Recuperar mensagem no rascunho</button>}
            </div>)}
          </div>
          {data && <section className="assistant-plan-generation" aria-label="Concluir entrevista"><h3>Concluir entrevista</h3><p>A IA organizará esta conversa e criará épicos, histórias e tarefas. Status iniciais: TO DO / SPECIFICATION / TO DO.</p><label htmlFor="assistant-target">Projeto de destino</label>{data.context.kind==='system'?<select id="assistant-target" value={completionRetry?.projectId || targetProject} disabled={busy || Boolean(active) || Boolean(completionRetry)} onChange={event=>setTargetProject(event.target.value)}><option value="">Selecione um Projeto</option>{data.targetProjects?.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>:<p id="assistant-target"><strong>{data.context.name}</strong></p>}<button type="button" disabled={busy || !['ana','admin'].includes(persona) || !data.configured || Boolean(retry) || Boolean(planRetry) || Boolean(active && !completionRetry) || Boolean(completionRetry && completionRetry.persona!==persona) || !(data.context.kind==='project'?data.context.id:targetProject) || !data.turns.some(turn=>turn.kind!=='plan'&&turn.status==='succeeded')} onClick={()=>void completeInterview()}>{completionRetry?'Verificar criação':active?.kind==='plan'?'Organizando entrevista e criando itens…':'Concluir entrevista e criar itens'}</button><p className="assistant-help">A criação será registrada nesta conversa. Você pode fechar o painel enquanto aguarda. Para ajustar o escopo, continue a conversa antes de concluir.</p></section>}
          {data?.context.kind === 'project' && <section className="assistant-plan-generation" aria-label="Gerar plano estruturado"><h3>Da conversa para o planejamento</h3><p>Após a entrevista, gere uma proposta para revisar épicos, histórias e tarefas. Máximo de 30 itens por plano.</p><button type="button" disabled={busy || !canPlan || !persona || !data.configured || Boolean(retry) || Boolean(active && !planRetry) || Boolean(planRetry && planRetry.persona !== persona) || !data.turns.some(turn => turn.kind !== 'plan' && turn.status === 'succeeded')} onClick={() => void generatePlan()}>{planRetry ? 'Confirmar geração do plano' : active?.kind === 'plan' ? 'Gerando plano…' : 'Gerar nova proposta'}</button><p className="assistant-help">Cada proposta é preservada. A IA usa a conversa e os componentes selecionados no Projeto.</p></section>}
          {data?.proposals?.map(proposal => <PlanReview key={proposal.id} proposal={proposal} projectName={data.context.name} projectVersion={data.context.version} sessionVersion={data.session?.version || 0} repositories={data.availableRepositories || []} persona={persona} canEdit={canPlan && Boolean(persona)} onRefresh={() => setRefresh(value => value + 1)} />)}
        </>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="assistant-bottom">
        {contextId && <form className="assistant-compose" onSubmit={submit}>
          <label htmlFor="assistant-message">Sua mensagem</label>
          <textarea ref={input} id="assistant-message" maxLength={4000} rows={3} value={draft} readOnly={Boolean(retry)} disabled={!canPlan || !persona} onChange={event => setDraft(event.target.value)} placeholder="Descreva sua ideia ou responda ao analista…" aria-describedby="assistant-message-help" />
          <div><small>{draft.length}/4000</small><button type="submit" className="primary" disabled={blocked || !draft.trim()}><Send size={15} />{busy ? 'Enviando…' : retry ? 'Confirmar envio' : 'Enviar mensagem'}</button></div>
          <p id="assistant-message-help" className="assistant-help">{!canPlan || !persona ? 'Selecione Admin, Product Owner ou Arquiteto para conversar.' : retry ? 'O texto foi preservado. Confirme o envio com a mesma persona; isso não repete a geração.' : active ? 'Aguarde a resposta ou cancele a geração para enviar outra mensagem.' : 'A conversa é salva. Fechar o painel não cancela uma geração.'}</p>
        </form>}
      </div>
    </dialog>
  </div>;
}
