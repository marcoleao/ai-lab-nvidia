'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { displayDate, ErrorState, FilterPanel, LoadingState, Pagination } from './experience-ui';
import type { Plan } from './assistant-plan';
import RequirementsDetails from './requirements-details';
import './conversation-history.css';

type Context = { id: string; kind: string; key: string; name: string; systemId?: string; projectId?: string; archived?: boolean; readOnly?: boolean };
type Message = {
  id: string; source: 'planning' | 'story' | 'execution' | 'merge'; sourceId: string;
  sourceType: 'chat_turn' | 'execution_message' | 'merge_turn'; sourceVersion?: number;
  input?: string | null; output?: string | null; role?: string | null; content?: string | null;
  state: string; actorName: string; createdAt: string; context: Context; error?: string | null;
  relation: 'direct' | 'descendant' | 'planning_origin' | 'linked';
  executionId?: string | null; storyVersion?: number | null; commitSha?: string | null; attemptId?: string | null;
  proposal?: { id: string; version: number; status: string } | null;
  references?: { sourceType: 'chat_turn' | 'plan_proposal'; sourceId: string; sourceVersion: number; storyId: string; storyVersion: number | null; linkedAt: string; relation?: 'planning_origin' | 'linked' }[];
};
type LinkSource = Message & { linkSourceType?: 'chat_turn' | 'plan_proposal'; linkSourceId?: string; linkSourceVersion?: number };
type Result = { context: Context; readOnly: boolean; messages: Message[]; total: number; page: number; pageSize: number; totalPages: number; asOf: string; coverage?: { description?: string } | string };
type Story = { id: string; key: string; name: string; version: number };
type Pending = { key: string; persona: string; story: Story; sourceType?: 'chat_turn' | 'plan_proposal'; sourceId: string; sourceVersion: number };
const sourceNames = { all: 'Todas as conversas', planning: 'Planejamento do Projeto / Sistema', story: 'Conversa da História', execution: 'Decisões de execução', merge: 'Conversa de merge' };
const relationNames = { direct: 'Deste contexto', descendant: 'Item descendente', planning_origin: 'Origem do planejamento', linked: 'Referência relacionada' };
const contextNames: Record<string, string> = { system: 'Sistema', project: 'Projeto', epic: 'Épico', story: 'História', task: 'Tarefa' };
const routes: Record<string, string> = { system: 'systems', project: 'projects', epic: 'epics', story: 'stories', task: 'tasks' };
const drafts = new Map<string, { source: string; scope: string; includeArchived: string }>();

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Não foi possível consultar as conversas.');
  return result as T;
}

export default function ConversationHistory({ itemId, persona = '', canPlan = false, readOnly = false, revision = 0 }: { itemId: string; persona?: string; canPlan?: boolean; readOnly?: boolean; revision?: number }) {
  const pathname = usePathname(), search = useSearchParams(), router = useRouter();
  const field = (key: string, fallback = '') => search.get(`conversations.${key}`) || fallback;
  const source = field('source', 'all'), scope = field('scope', 'descendants'), direction = field('direction', 'desc'), page = Math.max(1, Number(field('page', '1')) || 1), selected = field('message');
  const includeArchived = readOnly ? 'true' : field('includeArchived', 'false');
  const signature = `${source}:${scope}:${includeArchived}`, draftKey = `${itemId}:${signature}`;
  const [draft, setDraft] = useState(() => drafts.get(draftKey) || { source, scope, includeArchived });
  const [snapshot, setSnapshot] = useState<{ result: Result; request: string; itemId: string } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [linking, setLinking] = useState<LinkSource | null>(null), [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [linkError, setLinkError] = useState(''), [notice, setNotice] = useState('');
  const asOf = useRef(''), previousItem = useRef(itemId), selectedNode = useRef<HTMLElement>(null);
  if (previousItem.current !== itemId) { asOf.current = ''; previousItem.current = itemId; }
  const storage = `sdlc-conversation-link:${itemId}`;
  const query = new URLSearchParams({ source, scope, direction, page: String(page), includeArchived, ...(field('asOf') || asOf.current ? { asOf: field('asOf') || asOf.current } : {}), ...(selected ? { messageId: selected } : {}) });
  const request = query.toString();
  useEffect(() => { setDraft(drafts.get(draftKey) || { source, scope, includeArchived }); }, [draftKey]);
  useEffect(() => { try { setPending(JSON.parse(sessionStorage.getItem(storage) || 'null')); } catch { setPending(null); } }, [storage]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    read<Result>(`/items/${encodeURIComponent(itemId)}/conversations?${request}`, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.messages) || !Number.isSafeInteger(result.total) || result.pageSize !== 20) throw Error('A resposta da consulta de conversas está incompleta.');
      asOf.current = result.asOf; setSnapshot({ result, request, itemId });
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [itemId, request, revision, retry]);
  useEffect(() => { if (selected && !loading) selectedNode.current?.focus({ preventScroll: true }); }, [selected, loading]);
  const known = snapshot?.itemId === itemId ? snapshot : null, data = known?.result, readonly = readOnly || Boolean(data?.readOnly);
  const navigate = (values: Record<string, string | number>) => {
    const params = new URLSearchParams(search.toString());
    for (const [name, value] of Object.entries(values)) value === '' ? params.delete(`conversations.${name}`) : params.set(`conversations.${name}`, String(value));
    if (asOf.current && !('asOf' in values)) params.set('conversations.asOf', asOf.current);
    router.push(`${pathname}?${params}`, { scroll: false });
  };
  const occurrence = (message: Message) => { const params = new URLSearchParams(search.toString()); params.set('conversations.message', message.id); params.set('conversations.page', '1'); if (asOf.current) params.set('conversations.asOf', asOf.current); return `${pathname}?${params}`; };
  const origin = (message: Message) => `/${routes[message.context.kind] || 'stories'}/${encodeURIComponent(message.context.id)}?${new URLSearchParams({ tab: 'conversations', 'conversations.scope': 'self', 'conversations.message': message.id, ...(message.context.archived ? { 'conversations.includeArchived': 'true' } : {}) })}`;
  const remember = (value: Pending | null) => { setPending(value); try { value ? sessionStorage.setItem(storage, JSON.stringify(value)) : sessionStorage.removeItem(storage); } catch {} };
  async function relate(attempt: Pending) {
    if (busy || readonly || !canPlan || !persona || attempt.persona !== persona) return;
    remember(attempt); setBusy(true); setLinkError(''); setNotice('');
    try {
      const response = await fetch(`/api/items/${encodeURIComponent(attempt.story.id)}/conversation-links`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Persona': attempt.persona, 'Idempotency-Key': attempt.key }, body: JSON.stringify({ sourceType: attempt.sourceType || 'chat_turn', sourceId: attempt.sourceId, sourceVersion: attempt.sourceVersion, expectedVersion: attempt.story.version, confirmed: true }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status < 500) remember(null); throw Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Não foi possível confirmar o vínculo.'); }
      remember(null); setLinking(null); setNotice(`Referência relacionada à História ${attempt.story.key} · ${attempt.story.name}. O escopo e as aprovações foram preservados.`); setRetry(value => value + 1); window.dispatchEvent(new Event('sdlc-plan-applied'));
    } catch (failure) { setLinkError(failure instanceof Error ? failure.message : 'A confirmação não chegou. Verifique a mesma solicitação.'); }
    finally { setBusy(false); }
  }
  return <section className="panel conversation-history" aria-label="Conversas e referências">
    <div className="section-heading"><h2>Conversas e referências</h2><button type="button" disabled={loading} onClick={() => { asOf.current = ''; navigate({ asOf: '', page: 1 }); setRetry(value => value + 1); }}>Atualizar conversas</button></div>
    <p className="hint">Escopo: {data ? `${contextNames[data.context.kind] || data.context.kind} ${data.context.key} · ${data.context.name}` : 'contexto deste item'}. As mensagens permanecem nas conversas de origem. Consultar referências não executa operações nem altera o escopo aprovado.</p>
    {readonly && <p className="conversation-readonly">Acervo / contexto encerrado · somente leitura.</p>}
    <FilterPanel title="Filtrar conversas" id={`conversations-${itemId}`}><form onSubmit={event => { event.preventDefault(); navigate({ ...draft, page: 1, message: '' }); }}>
      <div className="experience-filter-fields"><label>Origem da conversa<select value={draft.source} onChange={event => { const next = { ...draft, source: event.target.value }; setDraft(next); drafts.set(draftKey, next); }}>{Object.entries(sourceNames).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>Abrangência<select value={draft.scope} onChange={event => { const next = { ...draft, scope: event.target.value }; setDraft(next); drafts.set(draftKey, next); }}><option value="descendants">Este item e descendentes</option><option value="self">Somente este item e suas referências</option></select></label></div>
      {!readOnly && <label className="conversation-confirm"><input type="checkbox" checked={draft.includeArchived === 'true'} onChange={event => { const next = { ...draft, includeArchived: String(event.target.checked) }; setDraft(next); drafts.set(draftKey, next); }} />Incluir conversas de itens arquivados</label>}
      <div className="actions"><button type="submit">Aplicar filtros</button><button type="button" onClick={() => { setDraft({ source: 'all', scope: 'descendants', includeArchived: readOnly ? 'true' : 'false' }); drafts.delete(draftKey); navigate({ source: '', scope: '', includeArchived: '', page: 1, message: '' }); }}>Limpar filtros</button></div>{(draft.source !== source || draft.scope !== scope || draft.includeArchived !== includeArchived) && <p role="status" className="hint">Filtros alterados. Use Aplicar filtros.</p>}
    </form></FilterPanel>
    <p className="experience-scope"><strong>Recorte {known?.request === request ? 'aplicado' : 'solicitado'}:</strong> {sourceNames[source as keyof typeof sourceNames] || source} · {scope === 'self' ? 'Este item e referências' : 'Este item e descendentes'} · {includeArchived === 'true' ? 'Incluindo conversas arquivadas' : 'Itens não arquivados'} · {data && known?.request === request ? `${data.total} resultados` : 'Quantidade deste recorte ainda não confirmada'}{selected && <> · Ocorrência selecionada <button type="button" onClick={() => navigate({ message: '', page: 1 })}>Ver conversa completa</button></>}</p>
    <div className="conversation-order"><span>Ordenação: data da mensagem</span><button type="button" onClick={() => navigate({ direction: direction === 'asc' ? 'desc' : 'asc', page: 1 })}>{direction === 'asc' ? 'Mais antigas primeiro ↑' : 'Mais recentes primeiro ↓'}</button></div>
    {loading && <LoadingState>{data ? 'Atualizando conversas; o último resultado confirmado permanece visível.' : 'Consultando conversas e referências…'}</LoadingState>}{error && <ErrorState onRetry={() => setRetry(value => value + 1)}>{error}{data && <p>O último resultado confirmado foi preservado.</p>}</ErrorState>}{known && known.request !== request && <p role="status" className="hint">O resultado abaixo pertence à consulta anterior; aguarde a confirmação do recorte solicitado.</p>}
    {notice && <p className="conversation-notice" role="status">{notice}</p>}{linkError && <ErrorState>{linkError}</ErrorState>}
    {pending && <div className="conversation-link-pending"><strong>Confirmação de referência pendente</strong><p>História {pending.story.key} · {pending.story.name}. A mesma solicitação será consultada para evitar duplicação.{pending.persona !== persona && ` Selecione a persona original (${pending.persona}).`}</p><button type="button" disabled={busy || readonly || !canPlan || pending.persona !== persona} onClick={() => void relate(pending)}>Verificar vínculo da conversa</button></div>}
    <Pagination page={data?.page || page} total={data?.total || 0} disabled={loading} onPageChange={page => navigate({ page, message: '' })} label="Paginação das conversas" />
    <ol className="conversation-entries">{data?.messages.map(message => <li key={message.id}><article ref={selected === message.id ? selectedNode : undefined} tabIndex={-1} className={selected === message.id ? 'conversation-selected' : ''}>
      <header><strong>{sourceNames[message.source]}</strong><span className={`badge${message.state === 'failed' ? ' danger' : ''}`}>{message.state === 'failed' && <AlertCircle size={15} aria-hidden="true" />}{message.state.replaceAll('_', ' ').toUpperCase()}</span></header>
      <p className="conversation-context"><Link href={origin(message)}>{contextNames[message.context.kind] || message.context.kind} {message.context.key} · {message.context.name}</Link><span>{relationNames[message.relation]}</span>{message.context.archived && <span className="badge">ARCHIVED</span>}{message.context.readOnly && <span>Somente leitura na origem</span>}</p>
      <p className="hint">{message.actorName || (message.role === 'assistant' ? 'Assistente' : 'Autoria não registrada')} · <time dateTime={message.createdAt}>{displayDate(message.createdAt)}</time> · Brasília</p>
      {message.state === 'failed' && <ErrorState>{message.error || 'Detalhe da falha não registrado nesta fonte.'}</ErrorState>}
      {message.input != null && <div className="conversation-content"><strong>Mensagem</strong><p>{message.input}</p></div>}{message.output && <div className="conversation-content conversation-answer"><strong>Resposta registrada</strong><p>{message.output}</p></div>}{message.content != null && <div className="conversation-content"><strong>{message.role === 'assistant' ? 'Assistente' : 'Mensagem'}</strong><p>{message.content}</p></div>}
      {message.proposal && <div className="conversation-reference"><p><strong>Proposta registrada · revisão salva {message.proposal.version}</strong></p><PlanRevision proposalId={message.proposal.id} version={message.proposal.version} />{canPlan && !readonly && !message.context.readOnly && message.state === 'succeeded' && message.context.projectId && <button type="button" disabled={Boolean(pending) || busy} onClick={() => setLinking({ ...message, linkSourceType: 'plan_proposal', linkSourceId: message.proposal!.id, linkSourceVersion: message.proposal!.version })}>Relacionar revisão salva {message.proposal.version} a uma História</button>}</div>}
      <details className="conversation-trace"><summary>Rastreabilidade desta mensagem</summary><dl><dt>Fonte</dt><dd>{message.sourceType} · {message.sourceId}</dd>{message.executionId && <><dt>Execução</dt><dd>{message.executionId}</dd></>}{message.storyVersion != null && <><dt>Versão da História</dt><dd>{message.storyVersion}</dd></>}{message.commitSha && <><dt>Commit</dt><dd><code>{message.commitSha}</code></dd></>}{message.attemptId && <><dt>Tentativa</dt><dd>{message.attemptId}</dd></>}</dl>{message.references?.map((reference, index) => <div key={`${reference.sourceType}:${reference.sourceId}:${reference.storyId}:${index}`} className="conversation-reference"><p><Link href={`/stories/${encodeURIComponent(reference.storyId)}?tab=conversations`}>História relacionada</Link> · {reference.storyVersion == null ? 'Versão não capturada' : `versão observada ${reference.storyVersion}`} · {displayDate(reference.linkedAt)}</p>{reference.sourceType === 'plan_proposal' ? <><PlanRevision proposalId={reference.sourceId} version={reference.sourceVersion} />{canPlan && !readonly && !message.context.readOnly && message.state === 'succeeded' && message.context.projectId && <button type="button" disabled={Boolean(pending) || busy} onClick={() => setLinking({ ...message, linkSourceType: 'plan_proposal', linkSourceId: reference.sourceId, linkSourceVersion: reference.sourceVersion })}>Relacionar esta revisão a uma História</button>}</> : <p>Referência da mensagem original · {reference.sourceId}</p>}</div>)}</details>
      <div className="actions"><Link href={occurrence(message)} scroll={false}>Link para esta mensagem</Link><Link href={origin(message)}>Consultar na origem</Link>{['planning', 'story'].includes(message.source) && message.sourceType === 'chat_turn' && message.context.projectId && message.state === 'succeeded' && canPlan && !readonly && !message.context.readOnly && <button type="button" disabled={Boolean(pending) || busy} onClick={() => { setLinking(message); setLinkError(''); }}>Relacionar a uma História</button>}</div>
      {linking?.id === message.id && <StoryReference projectId={message.context.projectId!} sourceContextId={message.context.kind === 'story' ? message.context.id : undefined} disabled={busy || Boolean(pending) || readonly || Boolean(message.context.readOnly) || !canPlan} onCancel={() => setLinking(null)} onConfirm={story => void relate({ key: crypto.randomUUID(), persona, story, sourceType: linking.linkSourceType || 'chat_turn', sourceId: linking.linkSourceId || message.sourceId, sourceVersion: linking.linkSourceVersion ?? message.sourceVersion ?? 0 })} />}
    </article></li>)}</ol>
    {!loading && !error && data?.total === 0 && <p className="experience-empty">Nenhuma conversa neste recorte. Ajuste os filtros ou abra a conversa contextual para iniciar uma mensagem, se permitido.</p>}
    <Pagination page={data?.page || page} total={data?.total || 0} disabled={loading} onPageChange={page => navigate({ page, message: '' })} label="Paginação inferior das conversas" />
    {data?.coverage && <p className="hint">{typeof data.coverage === 'string' ? data.coverage : data.coverage.description}</p>}
  </section>;
}

function StoryReference({ projectId, sourceContextId, disabled, onCancel, onConfirm }: { projectId: string; sourceContextId?: string; disabled: boolean; onCancel: () => void; onConfirm: (story: Story) => void }) {
  const [draft, setDraft] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1), [result, setResult] = useState<{ items: Story[]; total: number; page: number } | null>(null), [selected, setSelected] = useState<Story | null>(null), [confirmed, setConfirmed] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    read<{ items: Story[]; total: number; page: number }>(`/collections/items?${new URLSearchParams({ kind: 'story', projectId, q: query, page: String(page), sort: 'name', direction: 'asc' })}`, controller.signal).then(value => { if (!controller.signal.aborted) { if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total)) throw Error('A consulta de Histórias está incompleta.'); setResult(value); } }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, query, page, retry]);
  return <section className="conversation-link-form" aria-label="Relacionar conversa a uma História"><h3>Relacionar a uma História existente</h3><p>A referência mantém a mensagem em seu contexto de origem. Relacionar não copia mensagens, não muda o escopo da História e não aprova G1.</p>
    <form onSubmit={event => { event.preventDefault(); setQuery(draft); setPage(1); }}><label>Buscar História deste Projeto<input type="search" value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled} /></label><button type="submit" disabled={disabled}>Buscar Histórias</button></form>
    {loading && <LoadingState>Consultando Histórias do Projeto…</LoadingState>}{error && <ErrorState onRetry={() => setRetry(value => value + 1)}>{error}</ErrorState>}
    <p className="hint">Recorte aplicado: Histórias ativas deste Projeto{query && ` · Busca: ${query}`} · {result ? `${result.total} resultados` : 'Quantidade não confirmada'}. A seleção é preservada ao buscar e paginar.</p>
    <fieldset disabled={disabled || loading}><legend>Escolha a História</legend>{result?.items.map(story => <label className="conversation-story-choice" key={story.id}><input type="radio" name={`story-reference-${projectId}`} checked={selected?.id === story.id} disabled={story.id === sourceContextId} onChange={() => { setSelected(story); setConfirmed(false); }} /><span>{story.key} · {story.name}{story.id === sourceContextId && ' · contexto de origem'}</span></label>)}</fieldset>
    <Pagination page={result?.page || page} total={result?.total || 0} onPageChange={setPage} disabled={loading || disabled} label="Paginação de Histórias para referência" />
    {selected && <p>História escolhida: <strong>{selected.key} · {selected.name}</strong></p>}
    <label className="conversation-confirm"><input type="checkbox" checked={confirmed} disabled={disabled || !selected} onChange={event => setConfirmed(event.target.checked)} />Confirmo relacionar somente esta referência à História escolhida.</label>
    <div className="actions"><button type="button" className="primary" disabled={disabled || !selected || !confirmed} onClick={() => selected && onConfirm(selected)}>Confirmar referência</button><button type="button" disabled={disabled} onClick={onCancel}>Cancelar</button></div>
  </section>;
}

export function PlanRevision({ proposalId, version }: { proposalId: string; version: number }) {
  const [open, setOpen] = useState(false), [data, setData] = useState<{ revision: { content: Plan; actorName: string; source: string; createdAt: string }; context: Context } | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError('');
    read<NonNullable<typeof data>>(`/assistant/plans/${encodeURIComponent(proposalId)}/revisions/${version}?includeArchived=true`, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, proposalId, version, retry]);
  return <div className="conversation-plan-revision"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Recolher' : 'Consultar'} revisão {version} do plano</button>{open && <section aria-label={`Revisão ${version} do plano`}><p className="hint">Conteúdo da revisão registrada, independente da resposta original do modelo. Consulta somente leitura.</p>{loading && <LoadingState>Consultando a revisão registrada…</LoadingState>}{error && <ErrorState onRetry={() => setRetry(value => value + 1)}>{error}</ErrorState>}{data && <><p>{data.context.name} · {data.revision.actorName} · {displayDate(data.revision.createdAt)}</p><p className="description">{data.revision.content.summary}</p>{data.revision.content.epics.map((epic, epicIndex) => <div key={epicIndex}><h4>Épico: {epic.title}</h4><p>{epic.description}</p>{epic.stories.map((story, storyIndex) => <details key={storyIndex}><summary>História: {story.title}</summary><p className="description">{story.description}</p><h4>Critérios de aceite registrados</h4><ul>{story.acceptanceCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>{story.requirements && <RequirementsDetails value={story.requirements} />}<h4>Tarefas</h4><ul>{story.tasks.map((task, index) => <li key={index}><strong>{task.title}</strong><p>{task.description}</p></li>)}</ul></details>)}</div>)}</>}</section>}</div>;
}
