'use client';

import {useId, useState} from 'react';
import LifecyclePanel from './lifecycle-panel';

export default function EpicLifecycle({value, version, enabled, projectClosed = false, onChange}: {value: string; version: number; enabled: boolean; projectClosed?: boolean; onChange: (body: {status: string; expectedVersion: number; comment?: string}) => Promise<unknown>}) {
  const [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const helpId = useId(), reopening = value === 'done';
  const next = value === 'todo' || reopening ? 'doing' : value === 'doing' ? 'done' : null;
  async function change() {
    if (!enabled || projectClosed || busy || !next || reopening && comment.trim().length < 10) return;
    setBusy(true); setError('');
    try { await onChange({status: next, expectedVersion: version, ...(reopening ? {comment} : {})}); setComment(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível alterar o ciclo do Épico.'); }
    finally { setBusy(false); }
  }
  return <LifecyclePanel title="Ciclo do Épico" description="O Épico organiza Histórias de um mesmo objetivo. Seu trabalho inicia em TO DO e avança por DOING e DONE." value={value} stages={['todo', 'doing', 'done']} busy={busy} error={error}>
    {projectClosed && <p className="hint">Reabra o Projeto em sua aba Execução antes de alterar este Épico.</p>}
    {reopening && <label className="lifecycle-comment">Justificativa para reabrir<textarea value={comment} onChange={event => setComment(event.target.value)} minLength={10} maxLength={2000} disabled={!enabled || projectClosed || busy} aria-describedby={helpId} /><small id={helpId}>Mínimo de 10 caracteres para retomar a execução do Épico.</small></label>}
    {next && <div className="actions"><button type="button" disabled={!enabled || projectClosed || busy || reopening && comment.trim().length < 10} onClick={() => void change()}>{reopening ? 'Reabrir como DOING' : next === 'doing' ? 'Iniciar · DOING' : 'Concluir · DONE'}</button></div>}
    {next && !enabled && <p className="hint">Para alterar o ciclo, selecione uma persona Administrador, Product Owner ou Arquiteto.</p>}
    {value === 'doing' && <p className="hint">A conclusão requer pelo menos uma História e todas as Histórias não arquivadas em COMPLETED.</p>}
  </LifecyclePanel>;
}
