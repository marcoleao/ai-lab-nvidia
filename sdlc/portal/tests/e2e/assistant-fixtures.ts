import type { Page } from '@playwright/test';

export type AssistantFixtureTurn = { id: string; sequence?: number };
export type AssistantMessagesPage = { pageSize: 20; total: number; hasOlder: boolean; hasNewer: boolean; firstSequence: number | null; lastSequence: number | null; latestSequence: number | null };

/** In-memory counterpart of the read-only chat collection. Keep source order
 * stable when omitting explicit sequence values; reads never mutate a fixture. */
export function assistantMessagePage<T extends AssistantFixtureTurn>(turns: readonly T[], query = new URLSearchParams()): { turns: (T & { sequence: number })[]; page: AssistantMessagesPage } {
  const rows = turns.map((turn, index) => ({ ...turn, sequence: turn.sequence ?? index + 1 })).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  if (rows.some(turn => !Number.isSafeInteger(turn.sequence) || turn.sequence < 1) || new Set(rows.map(turn => turn.sequence)).size !== rows.length) throw Error('Assistant message fixtures require unique positive sequences');
  const before = query.has('before') ? Number(query.get('before')) : null, after = query.has('after') ? Number(query.get('after')) : null;
  if (before !== null && (!Number.isSafeInteger(before) || before < 1) || after !== null && (!Number.isSafeInteger(after) || after < 0) || before !== null && after !== null) throw Error('Invalid assistant message cursor');
  const candidates = rows.filter(turn => before !== null ? turn.sequence < before : after !== null ? turn.sequence > after : true);
  const selected = after !== null ? candidates.slice(0, 20) : candidates.slice(-20);
  const firstSequence = selected[0]?.sequence ?? null, lastSequence = selected.at(-1)?.sequence ?? null;
  const hasOlder = rows.some(turn => firstSequence !== null ? turn.sequence < firstSequence : before !== null ? turn.sequence < before : after !== null ? turn.sequence <= after : false);
  const hasNewer = rows.some(turn => lastSequence !== null ? turn.sequence > lastSequence : after !== null ? turn.sequence > after : before !== null ? turn.sequence >= before : false);
  return { turns: selected, page: { pageSize: 20, total: rows.length, hasOlder, hasNewer, firstSequence, lastSequence, latestSequence: rows.at(-1)?.sequence ?? null } };
}

export async function assistantContext(page: Page, system: any, projects: any[]) {
  const sys = { kind: 'system', key: 'SYS', status: 'active', archived: false, version: 1, parentId: null, description: '', data: {}, ...system };
  const children = projects.map(project => ({ kind: 'project', key: 'PRJ', status: 'active', projectLifecycle: 'active', archived: false, version: 1, parentId: sys.id, description: '', data: {}, ...project }));
  await page.route(url => url.pathname === '/api/items' && url.searchParams.get('kind') === 'system', route => route.fulfill({ json: { items: [sys] } }));
  await page.route(url => url.pathname === '/api/collections/items' && ['system', 'project'].includes(url.searchParams.get('kind') || ''), route => {
    const query = new URL(route.request().url()).searchParams, kind = query.get('kind'), term = (query.get('q') || '').toLocaleLowerCase('pt-BR');
    const items = (kind === 'system' ? [sys] : children.filter(item => item.parentId === query.get('parentId'))).filter(item => !item.archived && !['completed', 'cancelled'].includes(item.projectLifecycle || '') && (!term || `${item.key} ${item.name}`.toLocaleLowerCase('pt-BR').includes(term)));
    const total = items.length, page = Math.min(Math.max(1, Number(query.get('page')) || 1), Math.max(1, Math.ceil(total / 20)));
    return route.fulfill({ json: { items: items.slice((page - 1) * 20, page * 20), total, page, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)), extraCount: 0 } });
  });
  await page.route(url => url.pathname === `/api/items/${sys.id}`, route => route.fulfill({ json: { item: sys, children, ancestors: [], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  for (const child of children) await page.route(url => url.pathname === `/api/items/${child.id}`, route => route.fulfill({ json: { item: child, children: [], ancestors: [sys], repositories: [], availableRepositories: [], environments: [], history: [] } }));
  return { system: sys, projects: children };
}
