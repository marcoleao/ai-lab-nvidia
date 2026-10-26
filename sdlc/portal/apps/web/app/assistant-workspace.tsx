'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, FolderTree, MessageSquare } from 'lucide-react';
import Assistant, { type Conversation } from './assistant';
import { type Proposal, type Requirements } from './assistant-plan';
import { displayDate, ErrorState, LoadingState, Pagination } from './experience-ui';
import './assistant-workspace.css';

type Context = {
  id: string; key: string; name: string; kind: string; parentId: string | null;
  archived?: boolean; status?: string; projectLifecycle?: string; lifecycle?: string;
  hierarchy?: { writable: boolean; reason?: string; code?: string; blockedBy?: string };
  readOnlyReason?: string | null;
  capabilities?: { canMutate: boolean; canChangeLifecycle: boolean };
};
type ContextDetail = { item: Context; hierarchy?: Context['hierarchy']; readOnlyReason?: string | null; capabilities?: Context['capabilities'] };
type ContextPage = { items: Context[]; total: number; page: number; pageSize?: number };
type ContextResult = ContextPage & { scope: string; appliedQuery: string };

function trackViewport(target: HTMLElement) {
  const viewport = window.visualViewport, properties = ['--assistant-app-height', '--assistant-visible-height', '--assistant-visible-top'];
  const previous = properties.map(property => target.style.getPropertyValue(property));
  const measure = () => {
    const height = viewport?.height || window.innerHeight, offset = viewport?.offsetTop || 0;
    [height + offset, height, offset].forEach((value, index) => target.style.setProperty(properties[index], `${Math.max(0, Math.floor(value))}px`));
  };
  measure(); viewport?.addEventListener('resize', measure); viewport?.addEventListener('scroll', measure); window.addEventListener('resize', measure);
  return () => {
    viewport?.removeEventListener('resize', measure); viewport?.removeEventListener('scroll', measure); window.removeEventListener('resize', measure);
    properties.forEach((property, index) => previous[index] ? target.style.setProperty(property, previous[index]) : target.style.removeProperty(property));
  };
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error?.message || data.message || 'Não foi possível consultar o contexto.');
  return data;
}

export default function AssistantWorkspace({ persona, canPlan }: { persona: string; canPlan: boolean }) {
  const router = useRouter(), params = useSearchParams();
  const systemId = params.get('system') || '', projectId = params.get('project') || '', systemConversation = params.get('scope') === 'system';
  const [systemSelection, setSystemSelection] = useState<Context | null>(null), [projectSelection, setProjectSelection] = useState<Context | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [proposalSelection, setProposalSelection] = useState<{ contextId: string; proposal: Proposal | null } | null>(null);
  const [editingContext, setEditingContext] = useState(false), [contextRefresh, setContextRefresh] = useState(0);
  const workspace = useRef<HTMLDivElement>(null), contextDialog = useRef<HTMLDialogElement>(null);
  const contextButton = useRef<HTMLButtonElement>(null), contextControls = useRef<HTMLDivElement>(null), closeOnSelection = useRef(false);
  const selectedSystem = systemSelection?.id === systemId ? systemSelection : null;
  const selectedProject = projectSelection?.id === projectId && projectSelection.parentId === systemId ? projectSelection : null;
  const context = systemConversation ? selectedSystem : selectedProject;
  const currentConversation = conversation && conversation.context.id === context?.id ? conversation : null;
  const selectedProposal = proposalSelection && proposalSelection.contextId === context?.id ? proposalSelection.proposal : null;
  const modalContext = Boolean(context) || editingContext;
  const onProposal = useCallback((proposal: Proposal | null) => {
    setProposalSelection({ contextId: context?.id || '', proposal });
  }, [context?.id]);
  useEffect(() => {
    if (context?.id && closeOnSelection.current) {
      closeOnSelection.current = false;
      setEditingContext(false);
      contextDialog.current?.close();
      requestAnimationFrame(() => contextButton.current?.focus());
    }
  }, [context?.id]);
  useEffect(() => {
    const dialog = contextDialog.current;
    if (!dialog) return;
    if (editingContext && !dialog.open) dialog.showModal();
    if (!editingContext && dialog.open) dialog.close();
    if (!editingContext) return;
    const stopViewport = trackViewport(dialog);
    const frame = requestAnimationFrame(() => contextControls.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus());
    return () => { cancelAnimationFrame(frame); stopViewport(); };
  }, [editingContext]);
  const chatSelected = Boolean(context);
  useEffect(() => {
    if (!chatSelected) return;
    const shell = workspace.current?.closest<HTMLElement>('.shell');
    if (!shell) return;
    const stopViewport = trackViewport(shell); window.scrollTo(0, 0);
    return stopViewport;
  }, [chatSelected]);

  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
    next.delete('assistant.page'); next.delete('assistant.proposalsPage'); next.delete('assistant.proposal');
    if ('system' in values) for (const key of [...next.keys()]) if (key.startsWith('context.project.')) next.delete(key);
    closeOnSelection.current = true;
    router.push(`/assistant${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function toggleContext() {
    setContextRefresh(value => value + 1);
    setEditingContext(true);
  }
  function closeContext() {
    contextDialog.current?.close();
    setEditingContext(false);
    requestAnimationFrame(() => {
      if (contextButton.current) contextButton.current.focus();
      else contextControls.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    });
  }

  const currentContext = currentConversation?.context;
  const contextLifecycle = currentContext?.lifecycle || currentContext?.projectLifecycle || currentContext?.status || context?.lifecycle || context?.projectLifecycle || context?.status;
  const contextReadOnly = currentConversation?.readOnly ?? Boolean(context?.archived || context?.hierarchy?.writable === false || context?.capabilities?.canMutate === false);
  const contextArchived = currentContext?.archived ?? context?.archived;
  const currentSystem = currentContext && currentContext.id === selectedSystem?.id ? currentContext : currentConversation?.blockedBy && currentConversation.blockedBy.id === selectedSystem?.id ? currentConversation.blockedBy : null;
  const currentSystemLifecycle = currentSystem?.lifecycle || currentSystem?.projectLifecycle || currentSystem?.status;
  const systemUnavailable = currentSystem ? currentSystem.archived || currentSystemLifecycle !== 'active' : selectedSystem?.archived || selectedSystem?.hierarchy?.writable === false || selectedSystem?.capabilities?.canMutate !== true;
  const canCreateProject = canPlan && Boolean(selectedSystem) && !systemUnavailable;
  const projectName = currentContext?.id === selectedProject?.id ? currentContext?.name : selectedProject?.name;

  const controls = <div id="assistant-context-controls" ref={contextControls}>
        <div className="analyst-selectors">
          <div className="analyst-selector"><ContextSelector kind="system" selectedId={systemId} refresh={contextRefresh} onSelected={setSystemSelection} onChange={id => change({ system: id, project: '', scope: '' })} />{canPlan && <Link href="/systems?create=system">Criar novo Sistema</Link>}</div>
          <div className="analyst-selector"><ContextSelector key={systemId} kind="project" parentId={selectedSystem?.id} selectedId={projectId} refresh={contextRefresh} onSelected={setProjectSelection} onChange={id => change({ project: id, scope: '' })} />{canCreateProject ? <Link href={`/systems/${selectedSystem!.id}?create=project`}>Criar novo Projeto</Link> : selectedSystem && canPlan ? <span className="analyst-create-disabled">Criação de Projeto indisponível neste Sistema. {selectedSystem.readOnlyReason || selectedSystem.hierarchy?.reason || 'Consulte o ciclo do Sistema.'}</span> : null}</div>
        </div>
        {selectedSystem && <details className="analyst-previous-conversations"><summary>Entrevistas anteriores do Sistema</summary><p>Conversas do Sistema continuam disponíveis em seu contexto de origem. Para planejar uma nova funcionalidade, escolha a conversa do Projeto.</p><label><input type="checkbox" checked={systemConversation} onChange={event => change({ scope: event.target.checked ? 'system' : '' })} />Consultar a conversa compartilhada do Sistema</label>{systemConversation && <p>A proposta desta conversa pode ter origem anterior à organização por Projeto. Confira o Projeto de destino antes de qualquer criação.</p>}</details>}
        <p className="analyst-context-catalog"><Link href="/systems">Consultar Sistemas e Projetos ↗</Link><span>O catálogo permite consultar contextos inativos ou encerrados.</span></p>
      </div>;

  return <div ref={workspace} className={`analyst-workspace${chatSelected ? ' assistant-chat-workspace' : ''}`} data-testid="assistant-workspace">
    {!context && !editingContext && <><div className="page-heading"><div><p className="eyebrow">PLANEJAR ENTREGA</p><h1>Assistente</h1><p>Planeje e revise Histórias para o Projeto.</p></div></div>
      <section className="panel analyst-context" aria-label="Contexto da entrevista"><div className="analyst-section-heading"><div><h2>Onde vamos planejar?</h2><p>Escolha um Sistema e um Projeto. Cada contexto preserva sua conversa e suas propostas.</p></div><FolderTree size={23} aria-hidden="true" /></div>{controls}</section></>}
    {context && <section className="analyst-context analyst-context-selected" aria-label="Contexto da entrevista"><div className="analyst-context-bar">
      <div className="analyst-context-location"><FolderTree size={18} aria-hidden="true" /><div>
        <nav aria-label="Destino do planejamento"><ol><li><Link title={currentContext?.id === selectedSystem?.id ? currentContext?.name : selectedSystem?.name} href={`/systems/${selectedSystem?.id}`}>{currentContext?.id === selectedSystem?.id ? currentContext?.name : selectedSystem?.name}</Link></li>{selectedProject && !systemConversation && <><li aria-hidden="true"><ChevronRight size={14} /></li><li><Link title={projectName} href={`/projects/${selectedProject.id}`}>{projectName}</Link></li></>}</ol></nav>
        <span className="analyst-context-caption" data-shared={systemConversation}>{systemConversation ? `Conversa compartilhada do Sistema · ${selectedProject ? `destino de criação: ${projectName}` : 'escolha um Projeto para criar itens'}` : 'Conversa e destino de criação neste Projeto'}</span>
      </div></div>
      <div className="analyst-context-actions"><span className="analyst-context-state" data-readonly={contextReadOnly}>{contextArchived ? 'ARCHIVED' : contextLifecycle?.toUpperCase() || 'Contexto selecionado'}{contextReadOnly && !contextArchived ? ' · somente consulta' : ''}</span><button ref={contextButton} type="button" className="text-button analyst-context-toggle" aria-label="Alterar contexto" aria-haspopup="dialog" aria-expanded={editingContext} aria-controls="assistant-context-dialog" onClick={toggleContext}><span>Alterar contexto</span><ChevronDown size={16} aria-hidden="true" /></button></div>
    </div></section>}
    {modalContext && <dialog ref={contextDialog} id="assistant-context-dialog" className="analyst-context-dialog" aria-labelledby="assistant-context-dialog-title" onCancel={event => { event.preventDefault(); closeContext(); }} onClose={() => setEditingContext(false)}>
      <div className="analyst-context-dialog-heading"><h2 id="assistant-context-dialog-title">Alterar contexto</h2><button type="button" onClick={closeContext}>Concluir escolha</button></div><p>Cada contexto preserva sua conversa, seus rascunhos e suas propostas.</p>{controls}
    </dialog>}
    <div className="analyst-main">{context ? <Assistant embedded contextKey={context.id} contextId={context.id} contextLabel={currentContext?.name || context.name} persona={persona} canPlan={canPlan && Boolean(selectedProject)} targetProjectId={selectedProject?.id} targetProjectName={projectName} onConversation={setConversation} onProposal={onProposal} proposalSummary={<Coverage proposal={selectedProposal} />} /> : <section className="panel analyst-start"><MessageSquare size={23} aria-hidden="true" /><div><h2>{selectedSystem ? 'Escolha o Projeto para começar' : 'Comece pelo contexto da entrega'}</h2><p>{selectedSystem ? 'Depois da escolha, conte o problema que deseja resolver e o resultado esperado. Você poderá revisar a proposta antes de criar os itens.' : 'A conversa fica vinculada ao Projeto selecionado. Escolher um contexto não cria itens nem inicia um agente.'}</p></div></section>}</div>
  </div>;
}

function ContextSelector({ kind, parentId, selectedId, refresh, onSelected, onChange }: { kind: 'system' | 'project'; parentId?: string; selectedId: string; refresh: number; onSelected: (item: Context | null) => void; onChange: (id: string) => void }) {
  const search = useSearchParams(), router = useRouter(), prefix = `context.${kind}`, title = kind === 'system' ? 'Sistema' : 'Projeto';
  const query = search.get(`${prefix}.q`) || '', page = Math.max(1, Number(search.get(`${prefix}.page`)) || 1);
  const [draft, setDraft] = useState(query), [selected, setSelected] = useState<Context | null>(null), [result, setResult] = useState<ContextResult | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [selectionError, setSelectionError] = useState(''), [retry, setRetry] = useState(0);
  const callback = useRef(onSelected), selectionKey = useRef(''); callback.current = onSelected;
  const enabled = kind === 'system' || Boolean(parentId);
  const lookupScope = `${kind}:${parentId || ''}`;
  const navigate = (values: Record<string, string | number>) => { const params = new URLSearchParams(search.toString()); for (const [key, value] of Object.entries(values)) value === '' ? params.delete(`${prefix}.${key}`) : params.set(`${prefix}.${key}`, String(value)); router.push(`/assistant?${params}`, { scroll: false }); };
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    const key = `${kind}:${parentId || ''}:${selectedId}`;
    if (key !== selectionKey.current) { setSelected(null); if (selectionKey.current) callback.current(null); selectionKey.current = key; }
    setSelectionError('');
    if (!selectedId || !enabled) return;
    const controller = new AbortController();
    read<ContextDetail>(`/items/${encodeURIComponent(selectedId)}?includeArchived=true`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.item?.kind !== kind || kind === 'project' && value.item.parentId !== parentId) throw Error(`${title} não pertence ao contexto selecionado.`);
      const item = { ...value.item, hierarchy: value.hierarchy, readOnlyReason: value.readOnlyReason, capabilities: value.capabilities };
      setSelected(item); callback.current(item);
    }).catch(failure => { if (!controller.signal.aborted) setSelectionError(failure.message); });
    return () => controller.abort();
  }, [selectedId, kind, parentId, enabled, refresh, retry]);
  useEffect(() => {
    if (!enabled) { setLoading(false); setResult(null); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    read<ContextPage>(`/collections/items?${new URLSearchParams({ kind, q: query, page: String(page), sort: 'name', direction: 'asc', ...(parentId ? { parentId } : {}) })}`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total)) throw Error(`A consulta de ${title} está incompleta.`);
      setResult({ ...value, scope: `${kind}:${parentId || ''}`, appliedQuery: query });
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, parentId, enabled, query, page, refresh, retry]);
  const scopedResult = result?.scope === lookupScope ? result : null;
  const options = selected && !scopedResult?.items.some(item => item.id === selected.id) ? [selected, ...(scopedResult?.items || [])] : scopedResult?.items || [];
  const size = scopedResult?.pageSize || 20;
  return <div className="analyst-context-lookup">
    <form onSubmit={event => { event.preventDefault(); navigate({ q: draft, page: 1 }); }}><label>Buscar {title}<input type="search" value={draft} disabled={!enabled} onChange={event => setDraft(event.target.value)} placeholder="Nome ou chave" /></label><button type="submit" disabled={!enabled}>Buscar</button></form>
    <label>{title}<select value={selectedId && options.some(item => item.id === selectedId) ? selectedId : ''} disabled={!enabled || loading} onChange={event => onChange(event.target.value)}><option value="">{!enabled ? 'Selecione primeiro um Sistema' : loading ? `Consultando ${title}…` : `Selecione um ${title}`}</option>{options.map(item => <option key={item.id} value={item.id}>{item.key} · {item.name}{item.archived ? ' · ARCHIVED' : ''}</option>)}</select></label>
    {loading && <LoadingState>Consultando {kind === 'system' ? 'Sistemas' : 'Projetos do Sistema'}…</LoadingState>}
    {(error || selectionError) && <ErrorState onRetry={() => setRetry(value => value + 1)}>{selectionError || error}</ErrorState>}
    {enabled && scopedResult && <><p className="hint">{scopedResult.appliedQuery ? `Busca aplicada: ${scopedResult.appliedQuery}` : 'Ativos disponíveis'} · {scopedResult.total} resultado(s). {selected && !scopedResult.items.some(item => item.id === selected.id) && 'O contexto escolhido foi preservado fora desta página.'}</p>
      {!loading && !error && scopedResult.total === 0 && <p className="analyst-context-empty">{scopedResult.appliedQuery ? <>Nenhum resultado nesta busca. <button type="button" className="text-button" onClick={() => navigate({ q: '', page: 1 })}>Limpar busca</button></> : `Nenhum ${title} ativo disponível${kind === 'project' ? ' neste Sistema' : ''}.`}</p>}
      {(scopedResult.total > size || scopedResult.page > 1) && <Pagination page={scopedResult.page} total={scopedResult.total} pageSize={size} disabled={loading} onPageChange={page => navigate({ page })} label={`Paginação de ${kind === 'system' ? 'Sistemas' : 'Projetos'} do Assistente`} />}
    </>}
  </div>;
}

function Coverage({ proposal }: { proposal: Proposal | null }) {
  const stories = proposal?.content.epics.flatMap(epic => epic.stories.map(story => ({ ...story, epicTitle: epic.title }))) || [];
  return <section className="analyst-coverage" aria-label="Resumo da especificação">
    <details><summary><ClipboardList size={18} aria-hidden="true" /><span><strong>Resumo da especificação</strong><small>{proposal ? `Revisão salva ${proposal.version} · ${stories.length} História(s)` : 'Disponível após gerar ou escolher uma proposta'}</small></span><ChevronDown size={17} aria-hidden="true" /></summary>
      <div className="analyst-coverage-body">{proposal ? <>
        <p className="analyst-source">Proposta · revisão {proposal.version} · {proposal.status === 'applied' ? 'Aplicada' : 'Para revisão'}{proposal.stale ? ' · contexto alterado' : ''} · criada em {displayDate(proposal.createdAt)} (America/Sao_Paulo)</p>
        <p className="analyst-coverage-note">Este resumo usa a revisão salva da proposta selecionada. Presença de campos não significa completude, aprovação de G1 ou evidência de testes. Edições locais aparecem aqui depois de salvas.</p>
        {stories.map((story, index) => <details className="analyst-coverage-story" key={`${proposal.id}:${index}`} open={stories.length === 1}><summary><span><small>{story.epicTitle}</small><strong>{story.title}</strong></span><ChevronDown size={16} aria-hidden="true" /></summary>{story.requirements ? <RequirementsCoverage requirements={story.requirements} /> : <p className="analyst-warning">Esta proposta anterior não possui o contrato estruturado de requisitos. Consulte seu conteúdo para revisar a especificação.</p>}</details>)}
      </> : <p>Gere uma proposta ou selecione uma existente para consultar seus requisitos. A conversa permanece disponível na aba Conversa.</p>}</div>
    </details>
  </section>;
}

function RequirementsCoverage({ requirements }: { requirements: Requirements }) {
  const functional = requirements.functionalCriteria || [], dependencies = requirements.dependencies || [];
  const essential = [
    { label: 'Objetivo', present: requirements.objective?.trim().length >= 10, value: 'Registrado com ao menos 10 caracteres' },
    { label: 'Comportamento esperado', present: Boolean(requirements.behavior?.trim()), value: 'Registrado' },
    { label: 'Critério funcional', present: functional.length > 0 && functional.every(value => value.trim()), value: `${functional.length} critério(s) registrado(s)` },
  ];
  const complementary = [
    ['Usuários', requirements.actors?.length || 0], ['Entradas', requirements.inputs?.length || 0], ['Saídas', requirements.outputs?.length || 0],
    ['Regras de negócio', requirements.businessRules?.length || 0], ['Critérios técnicos', requirements.technicalCriteria?.length || 0],
    ['Exceções', requirements.exceptions?.length || 0], ['Requisitos não funcionais', requirements.nonFunctional?.length || 0],
    ['Premissas', requirements.assumptions?.length || 0], ['Fora de escopo', requirements.outOfScope?.length || 0],
  ] as const;
  const blockingPending = dependencies.filter(dependency => dependency.status === 'pending' && dependency.impact === 'blocking');
  return <div className="analyst-requirements-coverage">
    <h3>Essencial da especificação</h3><dl className="analyst-coverage-fields">{essential.map(field => <div key={field.label} data-recorded={field.present}><dt>{field.label}</dt><dd>{field.present ? field.value : 'Precisa ser descrito na especificação'}</dd></div>)}</dl>
    <details className="analyst-complementary"><summary>Detalhamento complementar · {complementary.filter(([, count]) => count > 0).length} de {complementary.length} tópicos com informação</summary><p>Registre apenas o que se aplica à História. A ausência de um tópico complementar não é um impedimento genérico.</p><dl className="analyst-coverage-fields">{complementary.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count ? `${count} registro(s)` : 'Não informado'}</dd></div>)}</dl></details>
    <h3>Dependências</h3>{dependencies.length ? <><p>{blockingPending.length} impeditiva(s) pendente(s) para codificar · {dependencies.filter(dependency => dependency.impact !== 'blocking').length} informativa(s).</p><ul className="analyst-dependencies">{dependencies.map((dependency, index) => <li key={index}><strong>{dependency.description}</strong><span>{dependency.impact === 'blocking' ? 'Impeditiva para codificar' : 'Informativa'} · {dependency.status === 'pending' ? 'Pendente' : 'Confirmada'}</span></li>)}</ul><p>Dependências impeditivas pendentes são verificadas antes de codificar.</p></> : <p>Nenhuma dependência registrada.</p>}
    {requirements.openQuestions?.length > 0 && <div className="analyst-warning"><strong>Questões registradas nesta revisão</strong><ul>{requirements.openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
  </div>;
}
