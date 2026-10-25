'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Detail, Item } from './portal';
import RequirementsDetails from './requirements-details';
import ItemCollection from './item-collection';
import HistoryQuery from './history-collection';
import ConversationHistory from './conversation-history';
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
  const tabs = [
    { id: 'overview', title: childNames[item.kind] },
    ...(item.kind === 'story' ? [{ id: 'specification', title: 'Especificação' }] : []),
    ...(['system', 'story', 'task'].includes(item.kind) ? [{ id: 'components', title: 'Componentes' }] : []),
    ...(item.kind === 'system' ? [{ id: 'environments', title: 'Ambientes' }] : []),
    { id: 'activity', title: 'Auditoria' },
    { id: 'conversations', title: 'Conversas' },
  ];
  const tab = tabs.some(value => value.id === search.get('tab')) ? search.get('tab')! : 'overview';
  const tabHref = (tab: string) => { const params = new URLSearchParams(search.toString()); if (tab === 'overview') params.delete('tab'); else params.set('tab', tab); return `${pathname}${params.size ? `?${params}` : ''}`; };
  return <div className="archived-item">
    <div className="page-heading"><div><p className="eyebrow">{names[item.kind]} · {item.key}</p><h1>{item.name}</h1><p>Status registrado: <span className="badge">{label(item.status)}</span>{item.kind === 'project' && <> · Ciclo: <span className="badge">{label(item.projectLifecycle || 'planned')}</span></>}</p></div></div>
    <nav className="context-tabs" aria-label={`Seções de ${names[item.kind]}`}>{tabs.map(value => <Link key={value.id} href={tabHref(value.id)} scroll={false} aria-current={tab === value.id ? 'page' : undefined}>{value.title}</Link>)}</nav>
    {tab === 'overview' && <>
      <section className="panel"><h2>Contexto</h2><p className="description">{item.description || 'Nenhuma descrição registrada.'}</p><p className="archive-metadata"><span>Criado: {displayDate(item.createdAt)}</span><span>Atualizado: {displayDate(item.updatedAt)}</span></p></section>
      {item.kind !== 'task' && <ItemCollection kind={nextKind[item.kind]} parentId={item.id} parentName={item.name} archived />}
    </>}
    {tab === 'specification' && <><section className="panel"><h2>Escopo registrado da História</h2><p className="description">{item.description || 'Nenhuma descrição registrada.'}</p></section><RequirementsDetails value={item.data.requirements} /></>}
    {tab === 'components' && <section className="panel" aria-label="Repositórios"><div className="section-heading"><h2>{item.kind === 'system' ? 'Repositórios do Sistema' : 'Repositórios envolvidos'}</h2><span className="count">{repositories.length}</span></div><div className="repository-grid">{repositories.map(repository => <article className="repository-card" key={repository.id}><h3>{repository.name}</h3><p><small>{repository.key} · {repository.runtime}</small> <span className="badge">{label(repository.state)}</span></p>{repository.gitlabPath && <p className="repository-path">{repository.gitlabPath}</p>}{repository.message && <p className="hint">{repository.message}</p>}{external(repository.gitlabUrl) && <a href={repository.gitlabUrl!} target="_blank" rel="noreferrer">Abrir repositório no GitLab ↗</a>}</article>)}</div>{!repositories.length && <p className="hint">Nenhum repositório associado a este contexto.</p>}</section>}
    {tab === 'environments' && <section className="panel"><h2>Ambientes do Sistema</h2><div className="environment-grid">{environments.map(environment => <div className="environment" key={environment.id}><strong>{environment.repositoryName} · {environment.code}</strong><span className="badge">{label(environment.liveStatus)}</span><p>{environment.currentVersion ? `Versão ${environment.currentVersion}` : 'Nenhuma versão implantada.'}</p>{external(environment.url) && <a href={environment.url!} target="_blank" rel="noreferrer">Abrir ambiente ↗</a>}</div>)}</div>{!environments.length && <p className="hint">Nenhum ambiente registrado.</p>}</section>}
    {tab === 'activity' && <HistoryQuery itemId={item.id} />}
    {tab === 'conversations' && <ConversationHistory itemId={item.id} readOnly />}
  </div>;
}
