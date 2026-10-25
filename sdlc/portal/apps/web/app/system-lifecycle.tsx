'use client';

import { useState } from 'react';
import LifecyclePanel from './lifecycle-panel';

export default function SystemLifecycle({ value, version, enabled, onChange }: { value: string; version: number; enabled: boolean; onChange: (body: { status: string; expectedVersion: number }) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const next = value === 'active' ? 'inactive' : value === 'inactive' ? 'active' : null;
  async function change() {
    if (!enabled || busy || !next) return;
    setBusy(true); setError(''); setNotice('');
    try { await onChange({ status: next, expectedVersion: version }); setNotice(next === 'inactive' ? 'Sistema inativado.' : 'Sistema reativado.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível alterar o ciclo do Sistema.'); }
    finally { setBusy(false); }
  }
  return <LifecyclePanel title="Ciclo do Sistema" description="O Sistema é um produto contínuo. A ativação e a inativação são reversíveis e preservam Projetos, repositórios, ambientes e histórico." value={value} stages={['active', 'inactive']} busy={busy} error={error}>
    <div className="actions"><button type="button" disabled={!enabled || busy || !next} onClick={() => void change()}>{value === 'active' ? 'Inativar · INACTIVE' : 'Reativar · ACTIVE'}</button></div>
    {!enabled && <p className="hint">Para alterar o ciclo, selecione uma persona Administrador, Product Owner ou Arquiteto.</p>}
    <p className="hint">Inativação e arquivamento são operações separadas. A aprovação e o ciclo dos Projetos permanecem independentes.</p>
    {notice && <p className="alert success" role="status">{notice}</p>}
  </LifecyclePanel>;
}
