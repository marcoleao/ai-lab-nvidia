'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ClipboardList, FolderTree, MessageSquare } from 'lucide-react';
import Assistant, { type Conversation } from './assistant';
import './assistant-workspace.css';
import { ErrorState, LoadingState, Pagination } from './experience-ui';

type Context = { id: string; key: string; name: string; kind: string; parentId: string | null; archived?: boolean; status?: string; projectLifecycle?: string };
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
  const selectedSystem = systemSelection?.id === systemId ? systemSelection : null, selectedProject = projectSelection?.id === projectId && projectSelection.parentId === systemId ? projectSelection : null;
  const context = systemConversation ? selectedSystem : selectedProject;
  useEffect(() => { setConversation(null); }, [context?.id]);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    next.delete('assistant.page'); next.delete('assistant.proposalsPage');
    if ('system' in values) { for (const key of [...next.keys()]) if (key.startsWith('context.project.')) next.delete(key); }
    router.push(`/assistant${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  return <div className="analyst-workspace" data-testid="assistant-workspace">
    <div className="page-heading"><div><p className="eyebrow">PLANEJAR ENTREGA</p><h1>Assistente</h1><p>Especifique uma funcionalidade com apoio de análise de sistemas e orientação técnica. Para codificar, revisar ou validar uma entrega, abra a História e use Processo e decisões.</p></div></div>
    <section className="panel analyst-context" aria-label="Contexto da entrevista"><div className="analyst-section-heading"><div><h2>Onde esta funcionalidade será criada?</h2><p>Escolha o Sistema e depois um de seus Projetos. Cada contexto preserva sua conversa e suas propostas. Busque e percorra as páginas para encontrar o destino.</p></div><FolderTree size={23} /></div><div className="analyst-selectors"><div className="analyst-selector"><ContextSelector kind="system" selectedId={systemId} onSelected={setSystemSelection} onChange={id => change({ system: id, project: '', scope: '' })} /><Link href="/systems?create=system">Criar novo Sistema</Link></div><div className="analyst-selector"><ContextSelector key={systemId} kind="project" parentId={selectedSystem?.id} selectedId={projectId} onSelected={setProjectSelection} onChange={id => change({ project: id })} />{selectedSystem && !selectedSystem.archived ? <Link href={`/systems/${selectedSystem.id}?create=project`}>Criar novo Projeto</Link> : <span className="analyst-create-disabled" aria-disabled="true">Criar novo Projeto</span>}</div></div>{selectedProject && <p className="analyst-destination">Destino do planejamento: <strong>{selectedSystem?.name} <ArrowRight size={13} /> {selectedProject.name}</strong><Link href={`/projects/${selectedProject.id}`}>Consultar Projeto ↗</Link><Link href={`/projects/${selectedProject.id}?tab=conversations`}>Conversas e referências ↗</Link></p>}{selectedSystem && <details className="analyst-previous-conversations"><summary>Entrevistas anteriores do Sistema</summary><p>A entrevista do Projeto é o contexto padrão para novas funcionalidades. Conversas anteriores do Sistema continuam disponíveis, sem transferir mensagens entre contextos.</p><label><input type="checkbox" checked={systemConversation} onChange={event => change({ scope: event.target.checked ? 'system' : '' })} />Consultar a conversa compartilhada do Sistema</label></details>}</section>
    <div className="analyst-layout"><div className="analyst-main">{context ? <Assistant embedded contextKey={context.id} contextId={context.id} contextLabel={context.name} persona={persona} canPlan={canPlan && Boolean(selectedProject)} targetProjectId={selectedProject?.id} targetProjectName={selectedProject?.name} onConversation={setConversation} /> : <section className="panel analyst-start"><div className="analyst-start-icon"><MessageSquare size={29} /></div><h2>Vamos entender sua necessidade</h2><p>Selecione o Sistema e o Projeto acima. Depois, conte o problema que deseja resolver, quem utilizará a funcionalidade e o resultado esperado.</p><ol><li><strong>Entrevista</strong><span>Contexto, regras, entradas, saídas e restrições.</span></li><li><strong>Proposta para revisão</strong><span>Requisitos e critérios funcionais e técnicos.</span></li><li><strong>Confirmação e criação</strong><span>Épicos, histórias e tarefas no Projeto escolhido.</span></li></ol><p className="hint">Nenhum exemplo ou planejamento é criado automaticamente ao escolher o contexto.</p></section>}</div><Coverage conversation={conversation?.context.id === context?.id ? conversation : null} /></div>
  </div>;
}

function ContextSelector({ kind, parentId, selectedId, onSelected, onChange }: { kind: 'system' | 'project'; parentId?: string; selectedId: string; onSelected: (item: Context | null) => void; onChange: (id: string) => void }) {
  const search = useSearchParams(), router = useRouter(), prefix = `context.${kind}`, title = kind === 'system' ? 'Sistema' : 'Projeto';
  const query = search.get(`${prefix}.q`) || '', page = Math.max(1, Number(search.get(`${prefix}.page`)) || 1);
  const [draft, setDraft] = useState(query), [selected, setSelected] = useState<Context | null>(null), [result, setResult] = useState<{ items: Context[]; total: number; page: number } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selectionError, setSelectionError] = useState(''), [retry, setRetry] = useState(0);
  const callback = useRef(onSelected); callback.current = onSelected;
  const enabled = kind === 'system' || Boolean(parentId);
  const navigate = (values: Record<string, string | number>) => { const params = new URLSearchParams(search.toString()); for (const [key, value] of Object.entries(values)) value === '' ? params.delete(`${prefix}.${key}`) : params.set(`${prefix}.${key}`, String(value)); router.push(`/assistant?${params}`, { scroll: false }); };
  useEffect(() => setDraft(query), [query]);
  useEffect(() => {
    setSelected(null); callback.current(null); setSelectionError('');
    if (!selectedId || !enabled) return;
    const controller = new AbortController();
    read<{ item: Context }>(`/items/${encodeURIComponent(selectedId)}?includeArchived=true`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.item?.kind !== kind || kind === 'project' && value.item.parentId !== parentId) throw Error(`${title} não pertence ao contexto selecionado.`);
      setSelected(value.item); callback.current(value.item);
    }).catch(failure => { if (!controller.signal.aborted) setSelectionError(failure.message); });
    return () => controller.abort();
  }, [selectedId, kind, parentId, enabled, retry]);
  useEffect(() => {
    if (!enabled) { setLoading(false); setResult(null); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    read<{ items: Context[]; total: number; page: number }>(`/collections/items?${new URLSearchParams({ kind, q: query, page: String(page), sort: 'name', direction: 'asc', ...(parentId ? { parentId } : {}) })}`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total)) throw Error(`A consulta de ${title} está incompleta.`);
      setResult(value);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, parentId, enabled, query, page, retry]);
  const options = selected && !result?.items.some(item => item.id === selected.id) ? [selected, ...(result?.items || [])] : result?.items || [];
  return <div className="analyst-context-lookup"><form onSubmit={event => { event.preventDefault(); navigate({ q: draft, page: 1 }); }}><label>Buscar {title}<input type="search" value={draft} disabled={!enabled} onChange={event => setDraft(event.target.value)} placeholder="Nome ou chave" /></label><button type="submit" disabled={!enabled}>Buscar</button></form><label>{title}<select value={selectedId && options.some(item => item.id === selectedId) ? selectedId : ''} disabled={!enabled || loading} onChange={event => onChange(event.target.value)}><option value="">{!enabled ? 'Selecione primeiro um Sistema' : loading ? `Consultando ${title}…` : `Selecione um ${title}`}</option>{options.map(item => <option key={item.id} value={item.id}>{item.key} · {item.name}{item.archived ? ' · ARCHIVED' : ''}</option>)}</select></label>
    {loading && <LoadingState>Consultando {kind === 'system' ? 'Sistemas' : 'Projetos do Sistema'}…</LoadingState>}{(error || selectionError) && <ErrorState onRetry={() => setRetry(value => value + 1)}>{selectionError || error}</ErrorState>}
    {enabled && result && <><p className="hint">{query ? `Busca aplicada: ${query}` : 'Ativos disponíveis'} · {result.total} resultados. {selected && !result.items.some(item => item.id === selected.id) && 'O contexto escolhido foi preservado fora desta página.'}</p><Pagination page={result.page} total={result.total} disabled={loading} onPageChange={page => navigate({ page })} label={`Paginação de ${kind === 'system' ? 'Sistemas' : 'Projetos'} do Assistente`} /></>}
  </div>;
}

function Coverage({ conversation }: { conversation: Conversation | null }) {
  const latest = conversation?.proposals?.[0];
  const stories = latest?.content.epics.flatMap(epic => epic.stories) || [];
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const narrow = matchMedia('(max-width: 1150px)');
    const update = () => setExpanded(!narrow.matches);
    update(); narrow.addEventListener('change', update);
    return () => narrow.removeEventListener('change', update);
  }, []);
  useEffect(() => setSelected(0), [latest?.id]);
  const story = stories[selected], requirements = story?.requirements;
  const groups: { label: string; value: string; present: boolean }[] = requirements ? [
    { label: 'Objetivo e usuários', value: `${requirements.actors.length} perfil(is) de usuário`, present: Boolean(requirements.objective && requirements.actors.length) },
    { label: 'Entradas de dados', value: requirements.inputs.length ? `${requirements.inputs.length} entrada(s) descrita(s)` : 'Sem entradas declaradas', present: true },
    { label: 'Saídas e resultados', value: `${requirements.outputs.length} saída(s) descrita(s)`, present: requirements.outputs.length > 0 },
    { label: 'Regras de negócio', value: `${requirements.businessRules.length} regra(s)`, present: requirements.businessRules.length > 0 },
    { label: 'Aceite funcional', value: `${requirements.functionalCriteria.length} critério(s)`, present: requirements.functionalCriteria.length > 0 },
    { label: 'Aceite técnico', value: `${requirements.technicalCriteria.length} critério(s)`, present: requirements.technicalCriteria.length > 0 },
    { label: 'Dependências', value: requirements.dependencies.length ? `${requirements.dependencies.length} registrada(s); ${requirements.dependencies.filter(item => item.status === 'pending').length} pendente(s)` : 'Sem dependências declaradas', present: true },
    { label: 'Exceções e restrições', value: `${requirements.exceptions.length} exceção(ões); ${requirements.nonFunctional.length} requisito(s) não funcional(is)`, present: requirements.exceptions.length + requirements.nonFunctional.length > 0 },
  ] : [];
  const brief = conversation?.brief;
  return <aside className="analyst-coverage" aria-label="Cobertura de requisitos"><div className="analyst-section-heading"><div><p className="eyebrow">O QUE ESTÁ REGISTRADO</p><h2>Cobertura da proposta</h2></div><ClipboardList size={22} /></div><button type="button" className="analyst-coverage-toggle" aria-expanded={expanded} aria-controls="assistant-coverage-fields" onClick={() => setExpanded(value => !value)}>Conferir campos e pendências{brief?.openQuestions.length ? ` (${brief.openQuestions.length})` : ''}<ChevronDown size={17} /></button><div id="assistant-coverage-fields" className="analyst-coverage-body" hidden={!expanded}>{!latest ? <><p>A cobertura aparece após a geração de uma proposta estruturada. A conversa, sozinha, não comprova que os requisitos estão completos.</p><ul className="analyst-coverage-pending">{['Descrição e objetivo', 'Usuários e regras de negócio', 'Entradas, saídas e validações', 'Critérios funcionais e técnicos', 'Dependências, exceções e limites'].map(name => <li key={name}><span>{name}</span><small>Ainda não especificado</small></li>)}</ul></> : <><p className="analyst-source">Proposta · revisão {latest.version} · {latest.status === 'applied' ? 'Aplicada' : 'Para revisão'}{latest.stale ? ' · contexto alterado' : ''}</p>{stories.length > 1 && <label>História na proposta<select value={selected} onChange={event => setSelected(Number(event.target.value))}>{stories.map((item, index) => <option key={index} value={index}>{item.title}</option>)}</select></label>}{story && <h3>{story.title}</h3>}{requirements ? <ul className="analyst-coverage-fields">{groups.map(group => <li key={group.label} data-recorded={group.present}><strong>{group.label}</strong><span>{group.present ? group.value : 'Ainda não especificado'}</span></li>)}</ul> : <p className="analyst-warning">Esta proposta anterior não possui o contrato estruturado de requisitos. O conteúdo continua disponível para revisão; não presumimos sua completude.</p>}{requirements?.openQuestions.length ? <div className="analyst-warning"><strong>Questões da proposta</strong><ul>{requirements.openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></div> : null}<p className="analyst-coverage-note">Presença de campos não significa completude, aprovação ou evidência de testes. Revise os detalhes e confirme a criação na proposta.</p></>}{brief && <details className="analyst-interview-brief" open={Boolean(brief.openQuestions.length)}><summary>Resumo e pendências da entrevista</summary>{brief.summary && <p>{brief.summary}</p>}{brief.confirmedFacts.length > 0 && <><h3>Fatos registrados pela assistente</h3><ul>{brief.confirmedFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></>}{brief.openQuestions.length > 0 ? <><h3>Pontos para esclarecer</h3><ul>{brief.openQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></> : <p>Nenhuma pergunta pendente registrada neste resumo. A revisão dos requisitos continua necessária.</p>}</details>}</div></aside>;
}

