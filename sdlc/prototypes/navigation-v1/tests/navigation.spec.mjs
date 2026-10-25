import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const requests = new WeakMap();
const errors = new WeakMap();
const current = page => page.getByTestId('current-situation');
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const story = '#/story/story-consulta/overview';

async function capture(page, name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, {recursive: true});
  await page.screenshot({path: path.join(process.env.SCREENSHOT_DIR, name + '.png'), fullPage: true});
}

test.beforeEach(async ({page, baseURL}) => {
  const unexpected = [];
  requests.set(page, unexpected);
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || /\/api(?:\/|$)/.test(url.pathname)) unexpected.push(request.url());
  });
});

test.afterEach(async ({page}) => {
  expect(requests.get(page), 'O protótipo só pode carregar arquivos estáticos locais, sem API ou provedores externos').toEqual([]);
  expect(errors.get(page), 'As jornadas não devem gerar erros de JavaScript').toEqual([]);
});

test('aprofundamento Sistema → Projeto → Épico → História → Tarefa preserva localização e retorno', async ({page}) => {
  await page.goto('/#/systems');
  await expect(page.locator('.prototype-badge')).toContainText('Protótipo · dados simulados');
  const main = page.locator('#main-content');
  const breadcrumbs = page.locator('#breadcrumbs');
  const systemLink = main.locator('a[href="#/system/system-atendimento"]').first();
  await expect(systemLink).toBeVisible();
  const systemName = 'Atendimento ao Cliente';
  await systemLink.click();
  await expect(page).toHaveURL(/#\/system\//);
  await expect(breadcrumbs).toContainText(systemName);
  await main.locator('a[href="#/project/project-atendimento"]').first().click();
  await expect(page).toHaveURL(/#\/project\//);
  await expect(breadcrumbs).toContainText(systemName);
  await capture(page, 'project-desktop');
  await main.locator('a[href="#/epic/epic-consulta"]').first().click();
  await expect(page).toHaveURL(/#\/epic\//);
  await main.locator('a[href^="#/story/"]').first().click();
  await expect(page).toHaveURL(/#\/story\//);
  await expect(current(page)).toHaveCount(1);
  await expect(breadcrumbs).toContainText(systemName);
  await capture(page, 'story-desktop');
  await page.locator('.tab-nav a[href$="/tasks"]').click();
  await main.locator('a[href^="#/task/"]').first().click();
  await expect(page).toHaveURL(/#\/task\//);
  await expect(breadcrumbs.locator('a[href^="#/story/"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.reload();
  await expect(page.locator('.tab-nav a[aria-current="page"]')).toHaveAttribute('href', /\/tasks$/);
});

test('aprovação explícita leva a fila, processamento observável e proposta de código sem declarar entrega concluída', async ({page}) => {
  await page.goto('/' + story);
  await page.locator('#scenario-select').selectOption('approval');
  await action(page, 'review-spec').click();
  await expect(page).toHaveURL(/\/specification$/);
  await expect(action(page, 'approve-spec')).toBeDisabled();
  await page.locator('#approve-check').check();
  await action(page, 'approve-spec').click();
  await expect(current(page)).toContainText(/fila/i);
  await expect(current(page)).not.toContainText(/aprova[çc][aã]o necess[aá]ria/i);
  await action(page, 'advance-simulation').click();
  await expect(current(page)).toContainText(/aguardando.*modelo|resposta do modelo/i);
  await expect(current(page)).not.toContainText(/\d+\s*%/);
  await capture(page, 'running-desktop');
  await action(page, 'advance-simulation').click();
  await expect(current(page)).toContainText(/Merge Request|proposta de c[oó]digo/i);
  await expect(current(page)).not.toContainText(/COMPLETED|implanta[çc][aã]o conclu[ií]da/i);
  await action(page, 'view-delivery').click();
  await expect(page).toHaveURL(/\/delivery$/);
  await expect(page.locator('#main-content')).toContainText(/n[aã]o implementad|indispon[ií]ve[il]|ainda n[aã]o/i);
  await capture(page, 'delivery-desktop');
});

test('impedimento mantém contexto, recebe resposta simulada e exige confirmação da decisão antes da nova aprovação', async ({page}) => {
  await page.goto('/' + story);
  await page.locator('#scenario-select').selectOption('impediment');
  await action(page, 'respond').click();
  await expect(page).toHaveURL(/\/conversation$/);
  await expect(page.locator('#main-content')).toContainText(/impedimento/i);
  await page.locator('#message-input').fill('Aceitar PDF e imagens de até 10 MB por anexo. Preserve os requisitos de acessibilidade.');
  await page.locator('#conversation-form').getByRole('button', {name: /Enviar orienta[çc][aã]o simulada/i}).click();
  await expect(page.locator('#main-content')).toContainText('Preserve os requisitos de acessibilidade.');
  await action(page, 'prepare-decision').click();
  await expect(page).toHaveURL(/\/decision$/);
  await expect(action(page, 'confirm-decision')).toBeDisabled();
  await page.locator('#decision-check').check();
  await action(page, 'confirm-decision').click();
  await expect(current(page)).toContainText(/aprova[çc][aã]o|revis[aã]o.*G1|especifica[çc][aã]o/i);
  await expect(current(page)).not.toContainText(/aguardando resposta do modelo/i);
  await expect(page.locator('#approve-check')).not.toBeChecked();
  await capture(page, 'regate-desktop');
});

test('falha preserva os artefatos, informa recuperação e deixa o erro anterior no histórico', async ({page}) => {
  await page.goto('/' + story);
  await page.locator('#scenario-select').selectOption('failed');
  await expect(current(page)).toContainText(/falh|n[aã]o foi poss[ií]vel/i);
  await expect(current(page)).toContainText(/preservad/i);
  await capture(page, 'failed-desktop');
  await action(page, 'retry').click();
  await expect(current(page)).toContainText(/corre[çc][aã]o|corrigindo/i);
  await action(page, 'advance-simulation').click();
  await expect(current(page)).toContainText(/Merge Request|proposta de c[oó]digo/i);
  await expect(action(page, 'retry')).toHaveCount(0);
  await page.locator('.tab-nav a[href$="/activity"]').click();
  await expect(page.locator('#main-content')).toContainText(/falh|recusad|corre[çc][aã]o/i);
});

test('falha de comunicação não apresenta execução como fracassada e limpar simulação não muda o produto real', async ({page}) => {
  await page.goto('/' + story);
  await page.locator('#scenario-select').selectOption('communication');
  await expect(current(page)).toContainText(/atualiza|comunica|consulta/i);
  await expect(current(page)).toContainText(/[uú]ltim/i);
  await expect(action(page, 'retry')).toHaveCount(0);
  await expect(page.locator('.prototype-badge')).toContainText('Protótipo · dados simulados');
});

test('todos os cenários mantêm uma situação atual única e identificam a simulação', async ({page}) => {
  await page.goto('/' + story);
  for (const scenario of ['approval', 'queued', 'running', 'impediment', 'failed', 'mr', 'communication', 'correcting', 'decisionReview', 'regate', 'cancelled']) {
    await page.locator('#scenario-select').selectOption(scenario);
    await expect(current(page), scenario).toHaveCount(1);
    await expect(current(page), scenario).toBeVisible();
    await expect(page.locator('.prototype-badge'), scenario).toContainText('Protótipo · dados simulados');
  }
});

test('navegação por teclado e celular não escondem situação ou causam rolagem horizontal', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/' + story);
  await page.locator('#scenario-select').selectOption('impediment');
  await expect(current(page)).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.locator('.tab-nav a[href$="/specification"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/specification$/);
  await expect(page.locator('#main-content h1')).toBeFocused();
  await capture(page, 'story-mobile');
});

test('identidade visual mantém cores, fonte e marca do produto original',async({page})=>{
  await page.goto('/'+story);
  const identity=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return {blue:s.getPropertyValue('--blue').trim(),navy:s.getPropertyValue('--navy').trim(),ink:s.getPropertyValue('--ink').trim(),font:s.fontFamily};});
  expect(identity).toMatchObject({blue:'#0076ce',navy:'#012169',ink:'#202b3a'});
  expect(identity.font).toContain('Segoe UI');
  await expect(page.locator('.brand')).toContainText('Dell Technologies');
  await expect(page.locator('.brand')).toContainText('Portal SDLC');
  expect(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(1, 33, 105)');
  await capture(page,'identity-desktop');
});

test('cobertura deixa explícitas omissões e preservação do dashboard existente',async({page})=>{
  await page.goto('/#/coverage');
  const main=page.locator('#main-content');
  await expect(main.getByRole('heading',{name:'Cobertura funcional',exact:true})).toBeVisible();
  await expect(main).toContainText('não é uma especificação para substituir o portal');
  await expect(main.locator('[data-feature-id]')).toHaveCount(40);
  await expect(main.locator('[data-feature-id="FUNC10"]')).toContainText('Ainda não representada');
  await expect(main.locator('[data-feature-id="FUNC35"]')).toContainText('Contrato a preservar');
  await expect(main.locator('[data-feature-id="FUNC40"]')).toContainText('Backlog não implementado');
  await page.goto('/#/overview');
  await expect(main.getByRole('heading',{name:'O dashboard atual será mantido'})).toBeVisible();
  await expect(main).toContainText('Filtros combinados');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await capture(page,'identity-mobile');
});

test('criar, editar e arquivar hierarquia afeta apenas os registros simulados',async({page})=>{
  await page.goto('/#/systems');
  await page.getByRole('link',{name:'Criar sistema',exact:true}).click();
  await page.getByLabel('Nome ou título').fill('Sistema da revisão');
  await page.getByLabel('Chave',{exact:true}).fill('REVISAO');
  await page.getByRole('button',{name:'Criar · simulação',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sistema da revisão',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Criar projeto',exact:true}).click();
  await page.getByLabel('Nome ou título').fill('Projeto da revisão');
  await page.getByLabel('Chave',{exact:true}).fill('PROJREV');
  await page.getByRole('button',{name:'Criar · simulação',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Projeto da revisão',exact:true})).toBeVisible();
  await page.locator('.manage-menu summary').click();
  await page.getByRole('link',{name:'Editar dados',exact:true}).click();
  await page.getByLabel('Nome ou título').fill('Projeto revisado');
  await page.getByRole('button',{name:'Salvar alterações · simulação',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Projeto revisado',exact:true})).toBeVisible();
  await page.locator('#breadcrumbs').getByRole('link',{name:'Sistema da revisão',exact:true}).click();
  await page.locator('.manage-menu summary').click();
  await page.getByRole('link',{name:'Arquivar',exact:true}).click();
  await expect(page.locator('.archive-preview')).toContainText('Projeto revisado');
  await expect(page.locator('.archive-preview')).toContainText('repositórios e ambientes serão preservados');
  await page.locator('#management-form input[type=checkbox]').check();
  await page.getByRole('button',{name:'Confirmar arquivamento · simulação',exact:true}).click();
  await expect(page).toHaveURL(/#\/systems$/);
  await expect(page.locator('.entity-list')).not.toContainText('Sistema da revisão');
});

test('aprovação de Projeto e ciclo preservam decisões separadas e reabertura justificada',async({page})=>{
  await page.goto('/#/project/project-triagem');
  await page.getByRole('link',{name:'Revisar aprovação',exact:true}).click();
  await expect(page.locator('.approval-summary')).toContainText('não inicia a execução');
  await page.locator('#management-form input[type=checkbox]').check();
  await page.getByRole('button',{name:'Confirmar aprovação · simulação',exact:true}).click();
  await page.goto('/#/manage/state/project-triagem');
  await page.getByLabel('Próxima situação').selectOption('active');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await expect(page.locator('.project-context')).toContainText('ACTIVE');
  await page.goto('/#/manage/state/project-triagem');
  await page.getByLabel('Próxima situação').selectOption('completed');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await expect(page.locator('#management-error')).toContainText('pelo menos um Épico');
  await page.getByLabel('Próxima situação').selectOption('cancelled');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await page.goto('/#/manage/state/project-triagem');
  await page.getByLabel('Justificativa para reabrir').fill('Retomar a avaliação do planejamento.');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await expect(page.locator('.project-context')).toContainText('PLANNED');
});

test('tarefa concluída pode ser reaberta com justificativa na simulação',async({page})=>{
  await page.goto('/#/manage/state/task-criterios');
  await page.getByLabel('Justificativa para reabrir').fill('Revisar critérios depois da avaliação.');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await expect(page.locator('.page-header')).toContainText('DOING');
  await page.reload();
  await expect(page.locator('.page-header')).toContainText('DOING');
  await page.locator('#reset-demo').click();
  await expect(page.locator('.page-header')).toContainText('DONE');
});

test('novo Épico exige Projeto aprovado e nova História não inicia execução',async({page})=>{
  await page.goto('/#/manage/create/project-triagem');
  await page.getByLabel('Nome ou título').fill('Épico manual de revisão');
  await page.getByRole('button',{name:'Criar · simulação',exact:true}).click();
  const epicURL=page.url();
  await page.getByRole('link',{name:'Revisar aprovação',exact:true}).click();
  await expect(page.getByRole('button',{name:'Confirmar aprovação · simulação',exact:true})).toBeDisabled();
  await page.goto('/#/manage/approve/project-triagem');
  await page.locator('#management-form input[type=checkbox]').check();
  await page.getByRole('button',{name:'Confirmar aprovação · simulação',exact:true}).click();
  await page.goto(epicURL);
  await page.getByRole('link',{name:'Revisar aprovação',exact:true}).click();
  await page.locator('#management-form input[type=checkbox]').check();
  await page.getByRole('button',{name:'Confirmar aprovação · simulação',exact:true}).click();
  await page.getByRole('link',{name:'Criar história',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await capture(page,'manual-form-mobile');
  await page.getByLabel('Nome ou título').fill('História de revisão manual');
  await page.getByRole('button',{name:'Criar · simulação',exact:true}).click();
  await expect(current(page)).toContainText('NOT STARTED');
  await expect(current(page)).toContainText('Criar um item não inicia código.');
  await page.locator('.tab-nav').getByRole('link',{name:'Especificação',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Especificação ainda não preparada'})).toBeVisible();
});

test('G1 permanece junto ao breadcrumb durante leitura em desktop e celular',async({page})=>{
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:844});
    await page.goto('/#/story/story-consulta/specification');
    await page.reload();
    const bar=page.getByRole('region',{name:'Ações da etapa'});
    const approve=bar.locator('[data-action="approve-spec"]');
    await expect(approve).toHaveCount(1);
    await expect(approve).toBeDisabled();
    await expect(page.locator('#main-content [data-action="approve-spec"]')).toHaveCount(0);
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect(approve).toBeInViewport();
    const position=await approve.boundingBox();expect(position.y).toBeGreaterThanOrEqual(0);expect(position.y+position.height).toBeLessThanOrEqual(844);
    await bar.locator('#approve-check').check();
    await expect(approve).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await capture(page,`g1-top-actions-${width}`);
  }
});
