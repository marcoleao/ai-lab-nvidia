import type { Page } from '@playwright/test';

export async function assistantContext(page: Page, system: any, projects: any[]) {
  const sys = { kind: 'system', key: 'SYS', status: 'active', archived: false, version: 1, parentId: null, description: '', data: {}, ...system };
  const children = projects.map(project => ({ kind: 'project', key: 'PRJ', status: 'awaiting_approval', projectLifecycle: 'planned', archived: false, version: 1, parentId: sys.id, description: '', data: {}, ...project }));
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
