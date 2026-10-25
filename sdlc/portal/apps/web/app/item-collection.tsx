'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Item } from './portal';
import { displayDate, ErrorState, FilterPanel, LoadingState, Pagination, SortHeader } from './experience-ui';

type Kind = Item['kind'];
type Values = { q: string; status: string; lifecycle: string; include: string; sort: string; dir: 'asc' | 'desc'; page: number };
type Result = { items: Item[]; total: number; page: number; pageSize: number; totalPages: number; extraCount: number };
const titles = { system: 'Sistemas', project: 'Projetos', epic: 'Épicos', story: 'Histórias', task: 'Tarefas' };
const routes = { system: 'systems', project: 'projects', epic: 'epics', story: 'stories', task: 'tasks' };
const statuses = { system: ['active', 'inactive'], project: ['awaiting_approval', 'approved'], epic: ['todo', 'doing', 'done'], story: ['specification', 'approved', 'coding', 'code_review', 'security_scan', 'testing', 'uat', 'production', 'completed'], task: ['todo', 'doing', 'done'] };
const label = (value: string) => value === 'todo' ? 'TO DO' : value.replaceAll('_', ' ').toUpperCase();
const drafts = new Map<string, { signature: string; values: Values }>();
export function rememberCollection(path: string) { try { sessionStorage.setItem(`sdlc-return:${path}`, location.pathname + location.search); } catch {} }
export function rememberedCollection(path: string) { try { const value = sessionStorage.getItem(`sdlc-return:${path}`); return value && value.split('?')[0] === path ? value : path; } catch { return path; } }

export default function ItemCollection({ kind, parentId, parentName, archived = false, revision = 0, onCount }: { kind: Kind; parentId?: string; parentName?: string; archived?: boolean; revision?: number; onCount?: (total: number) => void }) {
  const pathname = usePathname(), router = useRouter(), search = useSearchParams();
  const namespace = 'list', get = (key: string, fallback = '') => search.get(`${namespace}.${key}`) ?? fallback;
  const state: Values = { q: get('q'), status: get('status'), lifecycle: get('lifecycle'), include: get('include', search.get(kind === 'project' ? 'projects' : 'systems') === 'all' ? 'true' : 'false'), sort: get('sort', kind === 'system' ? 'name' : 'createdAt'), dir: get('dir', kind === 'system' ? 'asc' : 'desc') === 'asc' ? 'asc' : 'desc', page: Math.max(1, Number(get('page', '1')) || 1) };
  const signature = JSON.stringify([state.q, state.status, state.lifecycle]);
  const draftKey = `${pathname}:${kind}:${parentId || 'root'}`;
  const [draft, setDraft] = useState<Values>(() => drafts.get(draftKey)?.signature === signature ? drafts.get(draftKey)!.values : state);
  const [snapshot, setSnapshot] = useState<{ result: Result; state: Values; context: string } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const countRef = useRef(onCount); countRef.current = onCount;
  const context = `${pathname}:${kind}:${parentId || ''}`;
  const query = new URLSearchParams({ kind, q: state.q, ...(state.status ? { status: state.status } : {}), ...(state.lifecycle ? { projectLifecycle: state.lifecycle } : {}), includeInactive: state.include, includeArchived: String(archived || state.include === 'true'), sort: state.sort, direction: state.dir, page: String(state.page), ...(parentId ? { parentId } : {}) });
  const queryString = query.toString();
  const navigate = (values: Partial<Values>) => { const next = new URLSearchParams(search.toString()); for (const [key, value] of Object.entries(values)) { if (value === '') next.delete(`${namespace}.${key}`); else next.set(`${namespace}.${key}`, String(value)); } router.push(`${pathname}?${next}`, { scroll: false }); };
  useEffect(() => { setDraft(drafts.get(draftKey)?.signature === signature ? drafts.get(draftKey)!.values : state); }, [draftKey, signature]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    fetch(`/api/collections/items?${queryString}`, { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Não foi possível consultar os itens.'); return result as Result; }).then(result => {
      if (controller.signal.aborted) return; setSnapshot({ result, state, context }); countRef.current?.(result.total);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryString, context, revision, retry]);
  const known = snapshot?.context === context ? snapshot : null, data = known?.result, applied = known?.state || state;
  const edit = (values: Partial<Values>) => { const updated = { ...draft, ...values }; setDraft(updated); drafts.set(draftKey, { signature, values: updated }); };
  const sort = (column: string) => navigate({ sort: column, dir: applied.sort === column && applied.dir === 'asc' ? 'desc' : 'asc', page: 1 });
  const pending = draft.q !== state.q || draft.status !== state.status || draft.lifecycle !== state.lifecycle;
  const scope = [applied.q && `Busca: ${applied.q}`, applied.status && `Status: ${label(applied.status)}`, applied.lifecycle && `Ciclo: ${label(applied.lifecycle)}`, archived ? 'Acervo somente leitura' : applied.include === 'true' ? 'Incluindo inativos e arquivados' : ['system', 'project'].includes(kind) ? 'Somente ativos' : 'Itens não arquivados'].filter(Boolean).join(' · ');
  return <section className="panel experience-collection" aria-label="Itens deste nível" data-testid="children-list">
    <div className="section-heading"><h2>{titles[kind]}</h2>{data && <span className="count">{data.total}</span>}</div>
    <p className="hint">{parentName ? `Escopo: ${titles[kind]} de ${parentName}.` : 'Escopo: Sistemas.'} A busca considera nome e chave. Horários de Brasília.</p>
    <FilterPanel id={`items-${kind}-filters`}><form aria-label={`Filtros de ${titles[kind]}`} onSubmit={event => { event.preventDefault(); drafts.delete(draftKey); navigate({ q: draft.q, status: draft.status, lifecycle: draft.lifecycle, page: 1 }); }}>
      <div className="experience-filter-fields"><label>Buscar por nome ou chave<input type="search" value={draft.q} onChange={event => edit({ q: event.target.value })} /></label><label>{kind === 'project' ? 'Aprovação' : 'Status'}<select value={draft.status} onChange={event => edit({ status: event.target.value })}><option value="">Todos os status</option>{statuses[kind].map(status => <option key={status} value={status}>{label(status)}</option>)}</select></label>{kind === 'project' && <label>Ciclo do Projeto<select value={draft.lifecycle} onChange={event => edit({ lifecycle: event.target.value })}><option value="">Todos os ciclos</option>{[...(archived || state.include === 'true' ? ['planned'] : []), 'active', 'completed', 'cancelled'].map(value => <option key={value} value={value}>{value === 'planned' ? 'PLANNED · legado arquivado' : label(value)}</option>)}</select></label>}</div>
      <div className="actions"><button className="primary" type="submit">Aplicar filtros</button><button type="button" onClick={() => { drafts.delete(draftKey); setDraft({ ...state, q: '', status: '', lifecycle: '' }); navigate({ q: '', status: '', lifecycle: '', include: 'false', page: 1 }); }}>Limpar filtros</button></div>{pending && <p className="experience-filter-draft" role="status">Filtros alterados. Use Aplicar filtros.</p>}
    </form>{!archived && <label className="item-list-filter"><input type="checkbox" checked={state.include === 'true'} onChange={event => navigate({ include: String(event.target.checked), page: 1 })} />{kind === 'system' ? 'Mostrar sistemas inativos' : kind === 'project' ? 'Mostrar projetos inativos' : 'Incluir itens arquivados'}<small>Aplicação imediata; não altera os registros.</small></label>}</FilterPanel>
    <p className="experience-scope list-filter-summary" role="status"><strong>Recorte {loading || error ? 'solicitado / último confirmado' : 'aplicado'}:</strong> {scope} · {data ? `${data.total} resultados` : 'Quantidade ainda não confirmada'}{data && ['system', 'project'].includes(kind) && <> · {data.extraCount ? `${data.extraCount} inativos ou arquivados disponíveis no escopo` : 'Não há inativos ou arquivados adicionais; a lista permanece igual ao incluir.'}</>}</p>
    {loading && <LoadingState>{data ? 'Atualizando consulta; o último resultado confirmado permanece abaixo.' : `Consultando ${titles[kind].toLowerCase()}…`}</LoadingState>}{error && <ErrorState onRetry={() => setRetry(value => value + 1)}>{error} {data && 'O último resultado confirmado foi preservado.'}</ErrorState>}
    <p className="experience-sort-hint">Clique no nome da coluna para ordenar; clique novamente para inverter a direção.</p>
    <Pagination page={data?.page || state.page} total={data?.total || 0} onPageChange={page => navigate({ page })} label={`Paginação de ${titles[kind]}`} disabled={loading} />
    <div className="table-wrap" role="region" aria-label={`Resultados de ${titles[kind]}`} tabIndex={0}><table><caption className="sr-only">{titles[kind]} · {data?.total ?? 'Quantidade não confirmada'} resultados</caption><thead><tr><SortHeader column="name" label="Nome" sort={applied.sort} direction={applied.dir} onSort={sort} /><SortHeader column="status" label={kind === 'project' ? 'Aprovação' : 'Status'} sort={applied.sort} direction={applied.dir} onSort={sort} />{kind === 'project' && <SortHeader column="projectLifecycle" label="Ciclo do Projeto" sort={applied.sort} direction={applied.dir} onSort={sort} />}<SortHeader column="createdAt" label="Criado em" sort={applied.sort} direction={applied.dir} onSort={sort} /><SortHeader column="updatedAt" label="Atualizado" sort={applied.sort} direction={applied.dir} onSort={sort} /></tr></thead><tbody>{data?.items.map(child => <tr key={child.id}><td><Link className="item-link" href={`/${routes[child.kind]}/${child.id}`} onClick={() => rememberCollection(pathname)}><small>{child.key}</small>{child.name}<ArrowRight size={16} /></Link>{child.archived && <span className="badge archive-badge">ARCHIVED</span>}</td><td><span className="badge">{label(child.status)}</span></td>{kind === 'project' && <td><span className="badge">{child.projectLifecycle ? label(child.projectLifecycle) : archived || child.archived ? 'Não registrado' : 'ACTIVE'}</span></td>}<td>{displayDate(child.createdAt)}</td><td>{displayDate(child.updatedAt)}</td></tr>)}</tbody></table></div>
    {!loading && !error && data?.total === 0 && <div className="experience-empty"><h3>Nenhum resultado neste recorte</h3><p>Ajuste os filtros ou use a ação Criar, se estiver disponível para este contexto.</p></div>}
    <Pagination page={data?.page || state.page} total={data?.total || 0} onPageChange={page => navigate({ page })} label={`Paginação inferior de ${titles[kind]}`} disabled={loading} />
  </section>;
}
