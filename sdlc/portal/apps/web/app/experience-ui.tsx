'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, LoaderCircle } from 'lucide-react';
import './experience-ui.css';

export function Spinner({ className = '' }: { className?: string }) {
  return <LoaderCircle className={`experience-spinner ${className}`} size={18} aria-hidden="true" />;
}

export function LoadingState({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div role="status" aria-busy="true" className={`experience-loading ${className}`}><Spinner /><span>{children}</span></div>;
}

export function ErrorState({ children, onRetry, className = '' }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return <div role="alert" className={`experience-error ${className}`}><AlertCircle size={20} aria-hidden="true" /><div>{children}{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</div></div>;
}

export function FilterPanel({ children, title = 'Filtros', id, className = '', reveal = 0, focusRef }: { children: ReactNode; title?: string; id?: string; className?: string; reveal?: number; focusRef?: RefObject<HTMLElement|null> }) {
  const generated = useId(), pathname = usePathname();
  const key = `sdlc-filters:${pathname}:${id || generated}`;
  const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(sessionStorage.getItem(key) === 'open'); } catch {} }, [key]);
  useEffect(() => { if (reveal > 0) setOpen(true); }, [reveal]);
  const focusedReveal = useRef(0);
  useEffect(() => { if (open && reveal > focusedReveal.current) { focusedReveal.current = reveal; focusRef?.current?.focus(); } }, [open, reveal, focusRef]);
  return <details id={id} className={`experience-filters ${className}`} open={open} onToggle={event => {
    const expanded = event.currentTarget.open;
    setOpen(expanded);
    try { sessionStorage.setItem(key, expanded ? 'open' : 'closed'); } catch {}
  }}><summary>{title}</summary>{children}</details>;
}

export function SortHeader<K extends string>({ column, label, sort, direction, onSort }: { column: K; label: string; sort: K | string; direction: 'asc' | 'desc'; onSort: (column: K) => void }) {
  const active = sort === column, next = active && direction === 'asc' ? 'decrescente' : 'crescente';
  const Icon = active ? direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
  return <th scope="col" aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : undefined}>
    <button type="button" className="experience-sort" aria-label={label} title={`Ordenar ${label} em ordem ${next}`} onClick={() => onSort(column)}>{label}<Icon size={15} aria-hidden="true" /></button>
  </th>;
}

export function Pagination({ page, total, pageSize = 20, onPageChange, label = 'Paginação', disabled = false }: { page: number; total: number; pageSize?: number; onPageChange: (page: number) => void; label?: string; disabled?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="experience-pagination" aria-label={label}>
    <button type="button" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
    <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total} resultados · Página ${page} de ${pages}` : '0 resultados'}</span>
    <button type="button" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>Próxima</button>
  </nav>;
}

export const displayDate = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Não registrado';
