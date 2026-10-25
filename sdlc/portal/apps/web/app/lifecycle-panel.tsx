'use client';

import { useId, type ReactNode } from 'react';
import { ErrorState, LoadingState } from './experience-ui';

export default function LifecyclePanel({ title, description, value, stages, busy = false, error = '', children }: { title: string; description: string; value: string; stages: readonly string[]; busy?: boolean; error?: string; children: ReactNode }) {
  const headingId = useId();
  const label = (stage: string) => stage === 'todo' ? 'TO DO' : stage.replaceAll('_', ' ').toUpperCase();
  return <section className="panel lifecycle-panel" aria-labelledby={headingId}>
    <h2 id={headingId}>{title}</h2>
    <p>{description}</p>
    <p>Momento atual: <span className="badge">{label(value)}</span></p>
    <ol className="project-cycle" aria-label={title}>{stages.map(stage => <li key={stage} aria-current={value === stage ? 'step' : undefined} className={value === stage ? 'active' : ''}>{label(stage)}</li>)}</ol>
    {error && <ErrorState>{error}</ErrorState>}
    {busy && <LoadingState>Atualizando ciclo…</LoadingState>}
    {children}
  </section>;
}
