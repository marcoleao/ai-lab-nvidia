import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const STORE = 'sdlc-navigation-prototype-v1';
const observations = new WeakMap();
const cards = page => page.getByTestId('release-overview-card');
const stage = (page, value) => page.locator(`[data-release-overview-stage="${value}"]`);
const pager = page => page.getByTestId('release-overview-pagination');
const summary = page => page.getByTestId('release-overview-page-summary');
const ids = page => cards(page).evaluateAll(nodes => nodes.map(node => node.dataset.releaseId));

async function capture(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, `${name}.png`), fullPage: true});
}

// O volume é somente uma fixture de teste no cache do navegador. Não aumenta
// os dados hardcoded do produto nem modifica os membros dos pacotes iniciais.
async function seedVolume(page) {
  await page.goto('/#/releases');
  await expect(cards(page)).not.toHaveCount(0);
  await page.evaluate(key => {
    const cache = JSON.parse(sessionStorage.getItem(key)), state = cache.releases;
    const source = state.items.find(item => item.id === 'release-r2');
    for (const [id, date] of [['release-stable', '2026-10-01T12:00:00.000Z'], ['release-r1', '2026-10-02T12:00:00.000Z'], ['release-r2', '2026-10-03T12:00:00.000Z']]) {
      state.items.find(item => item.id === id).createdAt = date;
    }
    state.plannedDrafts = [];
    state.assignments = {};
    for (let n = 1; n <= 40; n++) {
      const id = `test-volume-${String(n).padStart(2, '0')}`;
      const record = {id, systemId: 'system-atendimento', label: `LOTE-${n}`, name: `Lote ${String(n).padStart(2, '0')}`, createdAt: new Date(Date.UTC(2026, 9, n + 3, 12)).toISOString()};
      if (n % 2) state.plannedDrafts.push({...record, stage: 'draft', candidates: []});
      else state.items.push({...structuredClone(source), ...record, stage: 'qa_checks', parent: null});
    }
    // Inserção invertida força desempate estável por ID, entre draft e pacote.
    state.items.push({...structuredClone(source), id: 'test-tie-b', label: 'EMPATE-B', name: 'Mesmo instante B', createdAt: '2026-11-14T12:00:00.000Z', parent: null});
    state.plannedDrafts.push({id: 'test-tie-a', label: 'EMPATE-A', name: 'Mesmo instante A', systemId: 'system-atendimento', stage: 'draft', candidates: [], createdAt: '2026-11-14T12:00:00.000Z'});
    state.plannedDrafts.push({id: 'test-legacy-undated', label: 'LEGACY', name: 'Rascunho legado sem data', systemId: 'system-atendimento', stage: 'draft', candidates: []});
    state.hubFilters = {systemId: '', stage: '', search: '', page: 1};
    sessionStorage.setItem(key, JSON.stringify(cache));
  }, STORE);
  await page.reload();
  return ['test-tie-a', 'test-tie-b', ...Array.from({length: 40}, (_, index) => `test-volume-${String(40 - index).padStart(2, '0')}`), 'release-r2', 'release-r1', 'release-stable', 'test-legacy-undated'];
}

async function seedStages(page) {
  await page.goto('/#/releases');
  await expect(cards(page)).not.toHaveCount(0);
  await page.evaluate(key => {
    const cache = JSON.parse(sessionStorage.getItem(key)), state = cache.releases;
    const source = state.items.find(item => item.id === 'release-r2');
    const extra = (id, stage, systemId = 'system-atendimento') => ({...structuredClone(source), id, label: id.toUpperCase(), name: `Selecionável ${id}`, systemId, stage, parent: null, createdAt: '2026-10-22T12:00:00.000Z'});
    state.items.push(extra('test-g2', 'qa_approved'), extra('test-hml', 'hml_pending'), extra('test-g3', 'production_approved'), extra('test-old-prd', 'production'), extra('test-current-prd', 'production'), extra('test-pedidos-qa', 'qa_checks', 'system-pedidos'));
    state.plannedDrafts = [
      {id: 'test-draft-a', systemId: 'system-atendimento', label: 'DRAFT-A', name: 'Selecionável rascunho A', stage: 'draft', candidates: [], createdAt: '2026-10-22T12:00:00.000Z'},
      {id: 'test-draft-b', systemId: 'system-atendimento', label: 'DRAFT-B', name: 'Selecionável rascunho B', stage: 'draft', candidates: [], createdAt: '2026-10-22T12:00:00.000Z'},
      {id: 'test-pedidos-draft', systemId: 'system-pedidos', label: 'DRAFT-P', name: 'Selecionável rascunho Pedidos', stage: 'draft', candidates: [], createdAt: '2026-10-22T12:00:00.000Z'},
    ];
    state.assignments = {};
    state.environments['system-atendimento'].prd = 'test-current-prd';
    state.hubFilters = {systemId: '', stage: '', search: '', page: 1};
    sessionStorage.setItem(key, JSON.stringify(cache));
  }, STORE);
  await page.reload();
}

test.beforeEach(async ({page, baseURL}) => {
  const observation = {requests: [], errors: []};
  observations.set(page, observation);
  page.on('pageerror', error => observation.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy|Refused to|Failed to load module script/i.test(message.text())) observation.errors.push(message.text());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || /\/api(?:\/|$)/.test(url.pathname)) observation.requests.push(request.url());
  });
});

test.afterEach(async ({page}) => {
  const observation = observations.get(page);
  expect(observation.requests, 'A consulta simulada não deve acessar APIs nem serviços externos').toEqual([]);
  expect(observation.errors, 'Consulta, filtros e paginação não devem gerar erros de JavaScript ou CSP').toEqual([]);
});

test('lista única pagina 46 rascunhos e pacotes de 20 em 20, por criação, com empate estável e legado no final', async ({page}) => {
  const expected = await seedVolume(page);
  await expect(cards(page)).toHaveCount(20);
  expect(await ids(page)).toEqual(expected.slice(0, 20));
  await expect(cards(page).first()).toHaveAttribute('data-created-at', '2026-11-14T12:00:00.000Z');
  await expect(summary(page)).toContainText('46');
  await expect(pager(page).getByRole('button', {name: 'Página anterior', exact: true})).toBeDisabled();
  await capture(page, 'release-overview-paginated-desktop');

  await pager(page).getByRole('button', {name: 'Próxima página', exact: true}).click();
  await expect(cards(page)).toHaveCount(20);
  expect(await ids(page)).toEqual(expected.slice(20, 40));
  await pager(page).getByRole('button', {name: 'Próxima página', exact: true}).click();
  await expect(cards(page)).toHaveCount(6);
  expect(await ids(page)).toEqual(expected.slice(40));
  const legacy = cards(page).filter({hasText: 'Rascunho legado sem data'});
  await expect(legacy).toHaveAttribute('data-created-at', '');
  await expect(legacy).toContainText(/data.*não.*registrada/i);
  await expect(pager(page).getByRole('button', {name: 'Próxima página', exact: true})).toBeDisabled();
  await page.reload();
  expect(await ids(page)).toEqual(expected.slice(40));
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).releases.plannedDrafts.find(item => item.id === 'test-legacy-undated').createdAt ?? null, STORE)).toBeNull();
});

test('filtros cruzam Sistema e busca, preservam totais das etapas, reiniciam página e recuperam página fora do intervalo', async ({page}) => {
  await seedVolume(page);
  await pager(page).getByRole('button', {name: 'Próxima página', exact: true}).click();
  await stage(page, 'draft').click();
  await expect(stage(page, 'draft')).toHaveAttribute('aria-pressed', 'true');
  await expect(stage(page, 'draft')).toBeFocused();
  await expect(cards(page)).toHaveCount(20);
  expect((await ids(page))[0]).toBe('test-tie-a');
  await expect(pager(page).getByRole('button', {name: 'Página anterior', exact: true})).toBeDisabled();
  await expect(stage(page, 'qa')).toContainText('22');
  await stage(page, '').click();
  await page.locator('#hub-release-search').pressSequentially('Lote 40');
  await expect(page.locator('#hub-release-search')).toBeFocused();
  await expect(cards(page)).toHaveCount(1);
  expect(await ids(page)).toEqual(['test-volume-40']);
  await expect(stage(page, 'draft')).toContainText('0');
  await expect(stage(page, 'qa')).toContainText('1');
  await stage(page, 'draft').click();
  await expect(cards(page)).toHaveCount(0);
  await expect(stage(page, 'qa')).toContainText('1');
  await stage(page, 'qa').click();
  await expect(cards(page)).toHaveCount(1);
  await page.locator('#hub-release-search').fill('Nenhum resultado possível');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByTestId('release-overview-list')).toContainText(/nenhuma release/i);
  await page.locator('#hub-release-search').fill('');
  await stage(page, '').click();
  await page.locator('#hub-system-filter').selectOption('system-pedidos');
  await expect(cards(page)).toHaveCount(0);
  await expect(stage(page, 'draft')).toContainText('0');
  await page.locator('[data-release-overview-clear]').first().click();
  await expect(page.locator('#hub-system-filter')).toHaveValue('');
  await expect(page).toHaveURL(/#\/releases$/);
  await expect(cards(page)).toHaveCount(20);
  await pager(page).getByRole('button', {name: 'Próxima página', exact: true}).click();
  await pager(page).getByRole('button', {name: 'Próxima página', exact: true}).click();
  await page.evaluate(key => {
    const cache = JSON.parse(sessionStorage.getItem(key));
    cache.releases.plannedDrafts = [];
    cache.releases.items = cache.releases.items.filter(item => !item.id.startsWith('test-'));
    sessionStorage.setItem(key, JSON.stringify(cache));
  }, STORE);
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await expect(pager(page).getByRole('button', {name: 'Página anterior', exact: true})).toBeDisabled();
});

test('etapas refletem implantação: G2 fica em QA, G3 fica em HML, rejeição separada e PRD distingue atual do histórico', async ({page}) => {
  await seedStages(page);
  await expect(cards(page)).toHaveCount(12);
  await expect(stage(page, 'draft')).toContainText('3');
  await expect(stage(page, 'qa')).toContainText('3');
  await expect(stage(page, 'hml')).toContainText('2');
  await expect(stage(page, 'production')).toContainText('3');
  expect(await ids(page)).not.toContain('release-integration');
  await page.locator('#hub-system-filter').selectOption('system-atendimento');
  await stage(page, 'qa').click();
  expect(new Set(await ids(page))).toEqual(new Set(['release-r2', 'test-g2']));
  await stage(page, 'hml').click();
  expect(new Set(await ids(page))).toEqual(new Set(['test-hml', 'test-g3']));
  await stage(page, 'production').click();
  expect(new Set(await ids(page))).toEqual(new Set(['release-stable', 'test-old-prd', 'test-current-prd']));
  await expect(cards(page).filter({hasText: 'Selecionável test-current-prd'})).toHaveAttribute('data-release-production', 'current');
  await expect(cards(page).filter({hasText: 'Selecionável test-current-prd'})).toContainText('Atual em PRD');
  await expect(cards(page).filter({hasText: 'Selecionável test-old-prd'})).toHaveAttribute('data-release-production', 'history');
  await expect(cards(page).filter({hasText: 'Selecionável test-old-prd'})).toContainText('Histórico de produção');
  await stage(page, 'rejected').click();
  expect(await ids(page)).toEqual(['release-r1']);
  await expect(cards(page)).toContainText(/HML.*bloqueada/i);
  await page.locator('#hub-system-filter').selectOption('system-pedidos');
  await expect(stage(page, 'draft')).toContainText('1');
  await expect(stage(page, 'qa')).toContainText('1');
  await expect(stage(page, 'hml')).toContainText('0');
  await expect(stage(page, 'production')).toContainText('0');
  await stage(page, '').click();
  expect(new Set(await ids(page))).toEqual(new Set(['test-pedidos-draft', 'test-pedidos-qa']));
});

test('rascunho vazio e candidata recebem datas reais distintas e avanço de etapa preserva criação', async ({page}) => {
  const started = Date.now();
  await page.goto('/#/release-create');
  await page.locator('#release-create-system').selectOption('system-atendimento');
  await page.locator('#release-create-name').fill('Entrega com data de criação');
  await page.getByTestId('create-release').click();
  const draftId = new URL(page.url()).hash.split('/')[2];
  const draftDate = await page.evaluate(({key, id}) => JSON.parse(sessionStorage.getItem(key)).releases.plannedDrafts.find(item => item.id === id).createdAt, {key: STORE, id: draftId});
  expect(Date.parse(draftDate)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(draftDate)).toBeLessThanOrEqual(Date.now());
  await page.goto('/#/releases');
  await expect(cards(page).filter({hasText: 'Entrega com data de criação'})).toHaveAttribute('data-created-at', draftDate);
  await page.goto('/#/story/story-release-h11/releases');
  await page.locator('#story-release-select').selectOption(draftId);
  await page.getByTestId('save-story-release').click();
  await page.getByTestId('planned-release-link').click();
  await page.locator('[data-story-release-prepare]').click();
  await page.locator('[data-release-action="create-candidate"]').click();
  await expect(page).toHaveURL(/#\/release\/release-candidate-\d+\/overview$/);
  const candidateId = new URL(page.url()).hash.split('/')[2];
  const candidateDate = await page.evaluate(({key, id}) => JSON.parse(sessionStorage.getItem(key)).releases.items.find(item => item.id === id).createdAt, {key: STORE, id: candidateId});
  expect(Date.parse(candidateDate)).toBeGreaterThan(Date.parse(draftDate));
  expect(Date.parse(candidateDate)).toBeLessThanOrEqual(Date.now());
  await page.locator('[data-release-action="run-checks"]').click();
  const preserved = await page.evaluate(({key, draftId, candidateId}) => {
    const state = JSON.parse(sessionStorage.getItem(key)).releases;
    return {draft: state.plannedDrafts.find(item => item.id === draftId).createdAt, candidate: state.items.find(item => item.id === candidateId).createdAt};
  }, {key: STORE, draftId, candidateId});
  expect(preserved).toEqual({draft: draftDate, candidate: candidateDate});
  await page.goto('/#/releases');
  await expect(cards(page).first()).toHaveAttribute('data-release-id', candidateId);
  await expect(cards(page).first()).toHaveAttribute('data-created-at', candidateDate);
});

test('visão de etapas e paginação funcionam no celular sem overflow e com busca por teclado', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await seedVolume(page);
  await expect(stage(page, 'draft')).toBeVisible();
  await expect(stage(page, 'qa')).toBeVisible();
  await expect(stage(page, 'hml')).toBeVisible();
  await expect(stage(page, 'production')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'release-overview-mobile');
  if(process.env.SCREENSHOT_DIR){
    await stage(page, 'qa').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, 'release-overview-stages-mobile-viewport.png')});
  }
  const topPager=page.getByTestId('release-overview-pagination-top');
  await expect(topPager).toBeVisible();
  await topPager.getByRole('button', {name: 'Próxima página', exact: true}).click();
  await expect(cards(page)).toHaveCount(20);
  await expect(topPager).toContainText('Página 2 de 3');
  if(process.env.SCREENSHOT_DIR){
    await topPager.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, 'release-overview-list-mobile-viewport.png')});
  }
  await stage(page, 'draft').click();
  await expect(pager(page).getByRole('button', {name: 'Página anterior', exact: true})).toBeDisabled();
  await stage(page, '').click();
  await page.locator('#hub-release-search').focus();
  await page.locator('#hub-release-search').pressSequentially('Lote 40');
  await expect(page.locator('#hub-release-search')).toBeFocused();
  await expect(page.locator('#hub-release-search')).toHaveValue('Lote 40');
  await expect(cards(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await cards(page).first().click();
  await expect(page).toHaveURL(/#\/release\/test-volume-40\/overview$/);
  await expect(page.locator('[data-global-nav="releases"]')).toHaveAttribute('aria-current', 'page');
});
