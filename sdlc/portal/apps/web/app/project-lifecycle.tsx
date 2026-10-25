'use client';
import { useId, useState } from 'react';
import LifecyclePanel from './lifecycle-panel';

export default function ProjectLifecycle({ value, version, enabled, onChange }: { value: string; version: number; enabled: boolean; onChange: (body: { lifecycle: string; expectedVersion: number; comment?: string }) => Promise<unknown> }) {
  const [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const stages = ['active', 'completed', 'cancelled'];
  const reopening = ['completed', 'cancelled'].includes(value), commentHelp = useId();
  const next = value === 'active' ? ['completed', 'cancelled'] : reopening ? ['active'] : [];
  async function change(lifecycle: string) {
    if (!enabled || busy || !next.includes(lifecycle) || reopening && comment.trim().length < 10) return;
    setBusy(true); setError('');
    try { await onChange({ lifecycle, expectedVersion: version, ...(reopening ? { comment } : {}) }); setComment(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível alterar o ciclo.'); }
    finally { setBusy(false); }
  }
  return <LifecyclePanel title="Ciclo do Projeto" description="O Projeto é uma iniciativa temporária. Sua aprovação de planejamento é independente do ciclo de execução." value={value} stages={stages} busy={busy} error={error}>
    {reopening && <label className="lifecycle-comment">Justificativa para reabrir<textarea minLength={10} maxLength={2000} disabled={!enabled || busy} aria-describedby={commentHelp} value={comment} onChange={event => setComment(event.target.value)} /><small id={commentHelp}>Mínimo de 10 caracteres para retomar o planejamento ou a execução.</small></label>}
    <div className="actions">{next.map(stage => <button type="button" key={stage} disabled={!enabled || busy || reopening && comment.trim().length < 10} onClick={() => void change(stage)}>{({ active: 'Reabrir como ACTIVE', completed: 'Concluir · COMPLETED', cancelled: 'Cancelar · CANCELLED' } as Record<string, string>)[stage]}</button>)}</div>
    {value === 'active' && <p className="hint">A conclusão requer pelo menos um Épico e todos os Épicos em DONE. Os repositórios e ambientes permanecem no Sistema.</p>}
  </LifecyclePanel>;
}
