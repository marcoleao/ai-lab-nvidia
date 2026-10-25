'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { ErrorState, LoadingState } from './experience-ui';

type Check = { id: string; label: string; status: string; message: string };

export default function Integrations() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/integrations/health').then(async response => {
      if (!response.ok) throw new Error('Não foi possível consultar a prontidão das integrações.');
      const result: { checks: Check[] } = await response.json();
      if (active) setChecks(result.checks);
    }).catch(() => {
      if (active) setError('Não foi possível consultar a prontidão das integrações. Tente atualizar os dados.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return <>
    <div className="page-heading"><div><h1>Integrações</h1><p>Consulte a disponibilidade das ferramentas conectadas ao SDLC.</p></div></div>
    <section className="panel" aria-labelledby="integration-readiness-title" aria-busy={loading}>
      <h2 id="integration-readiness-title">Prontidão das integrações</h2>
      <p>O planejamento pode começar localmente. A execução depende das integrações indicadas abaixo.</p>
      {loading && <LoadingState>Consultando integrações…</LoadingState>}
      {error && <ErrorState onRetry={() => setRevision(value => value + 1)}>{error}</ErrorState>}
      {checks.length ? <ul className="check-list">{checks.map(check => <li key={check.id}>
        {check.status === 'ready' ? <CheckCircle2 size={19} aria-hidden="true" /> : ['failed', 'error', 'timeout', 'unreachable'].includes(check.status) ? <AlertTriangle size={19} aria-hidden="true" className="experience-error-inline" /> : <Circle size={19} aria-hidden="true" />}
        <div><strong>{check.label}</strong><p>{check.message}</p></div>
        <span className={`badge${['failed', 'error', 'timeout', 'unreachable'].includes(check.status) ? ' danger' : ''}`}>{check.status.replaceAll('_', ' ').toUpperCase()}</span>
      </li>)}</ul> : !loading && !error && <p className="hint">Nenhuma integração disponível para consulta.</p>}
    </section>
  </>;
}
