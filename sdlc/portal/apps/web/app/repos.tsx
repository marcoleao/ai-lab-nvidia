'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ErrorState, Spinner } from './experience-ui';
import ExecutionContractView from './execution-contract';
import ApplicationPreparation from './application-preparation';

export type Repository = { id: string; systemId: string; key: string; name: string; runtime: string; gitlabProjectId: number | null; gitlabPath: string | null; gitlabUrl: string | null; state: string; message: string | null; version: number };
type Call = (path: string, body: unknown, method?: string) => Promise<unknown>;
const label = (value: string) => value.replaceAll('_', ' ').toUpperCase();

// Compatibility export for consumers outside the Portal. Current Portal forms
// inherit the System repository and do not offer repository selection.
export function RepositoryChoices({ repositories, value, onChange, disabled = false }: { repositories: Repository[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  return <fieldset className="repository-choices" disabled={disabled}><legend>Repositórios envolvidos</legend>{repositories.map(repo => <label key={repo.id}><input type="checkbox" checked={value.includes(repo.id)} onChange={event => onChange(event.target.checked ? [...value, repo.id] : value.filter(id => id !== repo.id))} /><span><strong>{repo.name}</strong></span></label>)}</fieldset>;
}

type Props = { repositories: Repository[]; systemId?: string; systemVersion?:number; systemName?: string; systemActive?: boolean; systemHref?: string; canPlan?: boolean; call?: Call; onChanged?: () => void; readOnly?: boolean; active?:boolean;persona?:string;role?:string };

export default function Repositories({ repositories, systemId, systemVersion=1, systemName, systemActive = false, systemHref, canPlan = false, call, onChanged, readOnly = false, active=true,persona='',role='' }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [applicationRevision,setApplicationRevision]=useState(0);
  const legacy = repositories.length > 1;
  const canManage = Boolean(systemId && systemActive && canPlan && !readOnly && !legacy && call);
  const canCreate = canManage && !repositories.length && Boolean(systemName);

  async function run(path: string, body: unknown) {
    if (!canManage || busy || !call) return;
    setBusy(true); setError(''); setNotice('');
    try { await call(path, body, 'POST'); setNotice('Solicitação registrada. O provisionamento será processado em segundo plano.'); onChanged?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível solicitar o provisionamento.'); }
    finally { setBusy(false); }
  }

  return <section className="panel" aria-label="Repositório do Sistema">
    <div className="section-heading"><h2>Repositório do Sistema</h2>{legacy && <span className="count">{repositories.length}</span>}</div>
    <p>{systemId ? 'O repositório é criado automaticamente com o Sistema. Projetos, Histórias e Tarefas utilizam esse mesmo repositório.' : 'Este trabalho utiliza o repositório herdado do Sistema. Não é necessário escolher ou associar repositórios.'}</p>
    <p className="hint">APIs, frontend, backend, batch e infraestrutura são organizados em pastas conforme a arquitetura.</p>
    {readOnly && <p className="hint">Consulta do acervo, sem ações de provisionamento.</p>}
    {legacy && <p className="alert" role="status">Este Sistema possui mais de um repositório legado e precisa de revisão. Todos continuam disponíveis para consulta; nenhum foi escolhido automaticamente.</p>}
    {error && <ErrorState>{error}</ErrorState>}{notice && <p className="alert success" role="status">{notice}</p>}
    <div className="repository-grid">{repositories.map(repo => <article className="repository-card" key={repo.id}>
      <h3>{repo.name}</h3><p><small>{repo.key}{repo.runtime !== 'generic' && <> · {repo.runtime}</>}</small> <span className="badge">{label(repo.state)}</span></p>
      {systemId && repo.gitlabPath && <p className="repository-path">{repo.gitlabPath}</p>}{repo.message && <p className="hint">{repo.message}</p>}
      {systemId && repo.gitlabUrl && /^https?:\/\//.test(repo.gitlabUrl) && <p><a href={repo.gitlabUrl} target="_blank" rel="noreferrer">Abrir repositório no GitLab ↗</a></p>}
      {canManage && ['failed', 'not_configured'].includes(repo.state) && <button type="button" disabled={busy} onClick={() => void run(`/repositories/${repo.id}/provision`, { expectedVersion: repo.version })}>{busy ? <><Spinner />Solicitando…</> : 'Tentar novamente'}</button>}
    </article>)}</div>
    {!repositories.length && <p className="hint">O Sistema ainda não possui repositório.{!systemId && ' A criação e o provisionamento são acompanhados na página do Sistema.'}</p>}
    {canCreate && <div className="actions"><button type="button" className="primary" disabled={busy} onClick={() => void run(`/systems/${systemId}/repositories`, { name: systemName, key: 'app', runtime: 'generic', mode: 'create' })}>{busy ? <><Spinner />Solicitando…</> : 'Criar repositório do Sistema'}</button></div>}
    {!systemId && systemHref && <p><Link href={systemHref}>Consultar repositório no Sistema →</Link></p>}
    {systemId&&!readOnly&&!legacy&&<><ApplicationPreparation systemId={systemId} systemVersion={systemVersion} active={active} persona={persona} role={role} blocked={!systemActive||!canPlan||busy} repositoryId={repositories[0]?.id} repositoryVersion={repositories[0]?.version} onRefresh={()=>{setApplicationRevision(value=>value+1);onChanged?.();}}/><ExecutionContractView systemId={systemId} active={active} persona={persona} role={role} blocked={!canPlan||busy} repositoryId={repositories[0]?.id} repositoryVersion={repositories[0]?.version} refreshToken={applicationRevision}/></>}
  </section>;
}
