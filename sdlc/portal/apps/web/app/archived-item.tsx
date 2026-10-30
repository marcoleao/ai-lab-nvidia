'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Detail, Item } from './portal';
import RequirementsDetails from './requirements-details';
import ItemCollection from './item-collection';
import HistoryQuery from './history-collection';
import ConversationHistory from './conversation-history';
import Repositories from './repos';
import { displayDate } from './experience-ui';

const names = { system: 'Sistema', project: 'Projeto', epic: 'Épico', story: 'História', task: 'Tarefa' };
const routes = { system: 'systems', project: 'projects', epic: 'epics', story: 'stories', task: 'tasks' };
const childNames = { system: 'Projetos', project: 'Épicos', epic: 'Histórias', story: 'Tarefas', task: 'Resumo' };
const nextKind = { system: 'project', project: 'epic', epic: 'story', story: 'task' } as const;
const label = (value: string) => value === 'todo' ? 'TO DO' : value.replaceAll('_', ' ').toUpperCase();
const href = (item: Item) => `/${routes[item.kind]}/${item.id}`;
const external = (value: string | null) => Boolean(value && /^https?:\/\//.test(value));

export default function ArchivedItem({ detail }: { detail: Detail }) {
  const { item, children, repositories, environments, history } = detail;
  const pathname = usePathname(), search = useSearchParams();
  const system = item.kind === 'system' ? item : detail.ancestors.find(ancestor => ancestor.kind === 'system');
  const returnUrl = `${pathname}${search.size ? `?${search}` : ''}`;
  const systemHref = system ? `/systems/${system.id}?tab=components${item.kind === 'story' ? `&${new URLSearchParams({ returnTo: returnUrl })}` : ''}` : undefined;
  const tabs = [
    { id: 'overview', title: childNames[item.kind] },
    ...(item.kind === 'story' ? [{ id: 'planning', title: 'Execução' }] : []),
    ...(item.kind === 'story' ? [{ id: 'specification', title: 'Especificação' }] : []),
    ...(['system', 'task'].includes(item.kind) ? [{ id: 'components', title: 'Repositório do Sistema' }] : []),
    ...(item.kind === 'system' ? [{ id: 'environments', title: 'Ambientes' }] : []),
    { id: 'activity', title: 'Auditoria' },
    { id: 'conversations', title: 'Conversas' },
  ];
  const requested = item.kind === 'story' && ['components','delivery','releases'].includes(search.get('tab') || '') ? 'planning' : search.get('tab');
  const tab = tabs.some(value => value.id === requested) ? requested! : 'overview';
  const tabHref = (tab: string) => { const params = new URLSearchParams(search.toString()); if (tab === 'overview') params.delete('tab'); else params.set('tab', tab); return `${pathname}${params.size ? `?${params}` : ''}`; };
  return <div className="archived-item">
    <div className="page-heading"><div><p className="eyebrow">{names[item.kind]} · {item.key}</p><h1>{item.name}</h1><p>Status registrado: <span className="badge">{label(item.status)}</span>{item.kind === 'project' && <> · Ciclo: <span className="badge">{label(item.projectLifecycle || 'planned')}</span></>}</p></div></div>
    <nav className="context-tabs" aria-label={`Seções de ${names[item.kind]}`}>{tabs.map(value => <Link key={value.id} href={tabHref(value.id)} scroll={false} aria-current={tab === value.id ? 'page' : undefined}>{value.title}</Link>)}</nav>
    {tab === 'overview' && <>
      <section className="panel"><h2>Contexto</h2><p className="description">{item.description || 'Nenhuma descrição registrada.'}</p><p className="archive-metadata"><span>Criado: {displayDate(item.createdAt)}</span><span>Atualizado: {displayDate(item.updatedAt)}</span></p></section>
      {item.kind !== 'task' && <ItemCollection kind={nextKind[item.kind]} parentId={item.id} parentName={item.name} archived />}
    </>}
    {tab === 'specification' && <><section className="panel"><h2>Escopo registrado da História</h2><p className="description">{item.description || 'Nenhuma descrição registrada.'}</p></section><RequirementsDetails value={item.data.requirements} /></>}
    {tab === 'planning' && item.kind === 'story' && <><p className="hint">Consulta do acervo. O status registrado não comprova testes ou aprovações não capturados.</p><Repositories repositories={repositories} systemHref={systemHref} readOnly /></>}
    {tab === 'components' && <Repositories repositories={repositories} systemId={item.kind === 'system' ? item.id : undefined} systemHref={systemHref} readOnly />}
    {tab === 'environments' && <section className="panel"><h2>Ambientes do Sistema</h2><div className="environment-grid">{environments.map(environment => <div className="environment" key={environment.id}><strong>{environment.repositoryName} · {environment.code}</strong><span className="badge">{label(environment.liveStatus)}</span><p>{environment.currentVersion ? `Versão ${environment.currentVersion}` : 'Nenhuma versão implantada.'}</p>{external(environment.url) && <a href={environment.url!} target="_blank" rel="noreferrer">Abrir ambiente ↗</a>}</div>)}</div>{!environments.length && <p className="hint">Nenhum ambiente registrado.</p>}</section>}
    {tab === 'activity' && <HistoryQuery itemId={item.id} />}
    {tab === 'conversations' && <ConversationHistory itemId={item.id} readOnly />}
  </div>;
}
