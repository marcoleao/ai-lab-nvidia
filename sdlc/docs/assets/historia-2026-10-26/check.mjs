import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';

// Usa o Playwright já preparado. Não instala dependências nem usa a API do Portal.
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || new URL('../../../portal/package.json', import.meta.url));
const {chromium, expect} = require('@playwright/test');
const base = process.env.PROTOTYPE_URL || 'http://127.0.0.1:8080';
const output = process.env.PROTOTYPE_OUTPUT || '/evidence';
mkdirSync(output, {recursive:true});
const browser = await chromium.launch({args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [], requests = [], results = [], metrics = [];
let scenarioCount = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push({method:request.method(), url:request.url()}));
page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());

async function check(name, test) {
  await test(); results.push(name); console.log('PASS', name);
}
async function open(scenario='g1', query='') {
  await page.goto(`${base}/?scenario=${scenario}${query ? '&'+query : ''}`);
  await expect(page.locator('#scenario')).toHaveValue(scenario);
  await expect(page.locator('h1')).toBeVisible();
}
async function tab(name) {
  await page.getByRole('navigation', {name:'Assuntos da história',exact:true}).getByRole('link',{name,exact:name!=='Tarefas'}).click();
}
async function confirm() {
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('[data-confirm-required]')).toBeDisabled();
  await page.locator('#confirm-command').check();
  await page.locator('[data-confirm-required]').click();
}
async function currentCommand() {
  await page.locator('[data-action="primary"]').click();
  await expect(page).toHaveURL(/tab=planning/);
  await expect(page.locator('#dialog')).not.toBeVisible();
  await page.locator('[data-action="execute-current"]').click();
}
try {
  await check('Cinco abas; Tarefas é entrada e Componentes pertence ao Sistema', async () => {
    await open();
    const nav = page.getByRole('navigation',{name:'Assuntos da história',exact:true});
    expect(await nav.locator('a').allTextContents()).toEqual([expect.stringMatching(/^Tarefas/),'Execução','Especificação','Conversas','Mais']);
    await expect(nav.getByRole('link',{name:/Componentes/})).toHaveCount(0);
    await expect(nav.getByRole('link',{name:/Tarefas/})).toHaveAttribute('aria-current','page');
    await page.screenshot({path:output+'/tarefas-desktop.png',fullPage:true});
  });
  await check('Consulta percorre as 24 fixtures; detalhe e retorno conservam filtros e página', async () => {
    await page.locator('[data-action="toggle-filters"]').click();
    await page.locator('[name="tasks.q"]').fill('rascunho de filtro');
    await page.locator('[data-sort="name"]').click();
    await expect(page.locator('[name="tasks.q"]')).toHaveValue('rascunho de filtro');
    await page.getByRole('button',{name:'Próxima página de tarefas',exact:true}).click();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await page.locator('tbody a').first().click();
    await expect(page.locator('#main')).toContainText('Resultados e evidências');
    await page.getByRole('link',{name:'← Voltar às tarefas com o mesmo recorte'}).click();
    await expect(page).toHaveURL(/tasks.page=2/);
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await page.reload();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await page.goBack(); await expect(page.locator('#main')).toContainText('Resultados e evidências');
    await page.goForward(); await expect(page.locator('tbody tr')).toHaveCount(4);
  });
  await check('Filtro zero, coleção vazia, carregamento e erro são estados distintos', async () => {
    await open('g1'); await page.locator('[data-action="toggle-filters"]').click();
    await page.locator('[name="tasks.q"]').fill('nenhum resultado xyz');
    await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
    await expect(page.locator('#main')).toContainText('Nenhuma tarefa corresponde aos filtros');
    await page.locator('[data-action="clear-filters"]').last().click();
    await page.locator('#query-mode').selectOption('loading');
    await expect(page.locator('#main')).toContainText('Carregando tarefas');
    await expect(page.locator('#main')).not.toContainText('Nenhuma tarefa corresponde');
    await page.locator('#query-mode').selectOption('error');
    await expect(page.getByRole('alert')).toContainText('Não foi possível atualizar');
    await page.locator('[data-action="retry-query"]').click();
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await page.locator('#query-mode').selectOption('empty');
    await expect(page.locator('#main')).toContainText('lacuna de dados/legado');
  });
  await check('G1 exige confirmação explícita e já coloca a codificação na fila', async () => {
    await open('g1'); await currentCommand();
    await expect(page.locator('#dialog')).toContainText('Aprovar G1 também enfileira codificação');
    await confirm();
    await expect(page.locator('#scenario')).toHaveValue('queued');
    await expect(page.locator('.situation')).toContainText('aguardando recurso');
    await page.locator('#toast').evaluate(el=>el.hidden=true);
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
    await page.screenshot({path:output+'/execucao-desktop.png',fullPage:true});
  });
  await check('Identificação e rascunho sobrevivem à troca de abas; salvar não aprova G1', async () => {
    await open('g1'); await page.locator('[data-action="edit-story"]').click();
    await page.locator('#story-title').fill('Título em edição');
    await tab('Conversas'); await expect(page.locator('#story-title')).toHaveValue('Título em edição');
    await page.locator('[data-action="save-story"]').click();
    await expect(page.locator('h1')).toHaveText('Título em edição');
    await expect(page.locator('#scenario')).toHaveValue('g1');
    await tab('Especificação'); await page.locator('#objective').fill('Objetivo ainda em rascunho');
    await tab('Tarefas'); await expect(page.locator('#main')).toContainText('Rascunho de especificação preservado');
    await tab('Especificação'); await expect(page.locator('#objective')).toHaveValue('Objetivo ainda em rascunho');
    await page.locator('[data-action="save-draft"]').click();
    await expect(page.locator('#scenario')).toHaveValue('g1');
  });
  await check('Link antigo Componentes mantém o contexto e o retorno do Sistema', async () => {
    await open('g1','tab=components&tasks.q=Teste&attempt=1&returnTo=origem');
    await expect(page).toHaveURL(/tab=planning/);
    await expect(page.locator('#destination')).toContainText('link antigo de Componentes');
    await page.locator('#destination').getByRole('link',{name:'Gerenciar no Sistema ↗'}).click();
    await expect(page.locator('h1')).toHaveText('Cadastro');
    await page.getByRole('link',{name:'← Voltar à História CADAST-042'}).click();
    await expect(page).toHaveURL(/tasks.q=Teste/);
    await expect(page).toHaveURL(/attempt=1/);
    await expect(page).toHaveURL(/returnTo=origem/);
    await expect(page.locator('.situation')).toContainText('Especificação pronta');
  });
  await check('Correção invalida verificações e merge não conclui a História', async () => {
    await open('correction'); await currentCommand();
    await expect(page.locator('#dialog')).toContainText('novo SHA invalida');
    await confirm(); await expect(page.locator('#scenario')).toHaveValue('running');
    await open('merge'); await currentCommand();
    await expect(page.locator('#dialog')).toContainText('SHA 7c81a20');
    await expect(page.locator('#dialog')).toContainText('não conclui a História');
    await confirm(); await expect(page.locator('#scenario')).toHaveValue('merged');
    await expect(page.locator('.situation')).toContainText('a entrega ainda não está concluída');
    await expect(page.locator('#main')).toContainText('Teste e Teste Final');
  });
  await check('Decisão operacional exige novo G1 e conserva a revisão aprovada na fila', async () => {
    await open('blocked'); await currentCommand();
    await page.locator('[data-dialog-action="review-resume"]').click();
    await expect(page.locator('#dialog')).toContainText('exige novo G1');
    await confirm(); await expect(page.locator('#scenario')).toHaveValue('stale');
    await expect(page.locator('.heading-meta')).toContainText('Revisão vigente 4');
    await currentCommand(); await confirm();
    await expect(page.locator('#scenario')).toHaveValue('queued');
    await expect(page.locator('.heading-meta')).toContainText('Revisão vigente 4');
    await expect(page.locator('.context-strip')).toContainText('Aprovado · revisão 4');
  });
  await check('Cancelar rascunho preserva a ausência de publicação e não fabrica G1', async () => {
    await open('draft','tab=planning');
    await expect(page.locator('#main')).toContainText('Nenhum escopo aprovado recebido pelo agente');
    await page.locator('.terminal summary').click();
    await page.locator('[data-action="cancel-story"]').click();
    await page.locator('#reason').fill('Cancelada antes de preparar a execução');
    await confirm();
    await expect(page.locator('#scenario')).toHaveValue('cancelled');
    await expect(page.locator('#main')).not.toContainText('Publicação confirmada');
    await expect(page.locator('#main')).not.toContainText('G1 registrado');
    await tab('Tarefas');
    await expect(page.locator('tbody tr').first()).toContainText('CANCELLED');
    await expect(page.locator('tbody')).not.toContainText('DONE');
  });
  await check('Alvo e mensagem digitada são preservados; criar tarefa atualiza a contagem', async () => {
    await open('g1','tab=specification');
    await page.getByText('Destino de implementação e dependências',{exact:true}).click();
    await page.locator('#repository-scope').selectOption({index:1});
    const repository = await page.locator('#repository-scope').inputValue();
    await tab('Conversas'); await page.locator('#message').fill('Mensagem ainda não enviada');
    await tab('Tarefas'); await tab('Conversas');
    await expect(page.locator('#message')).toHaveValue('Mensagem ainda não enviada');
    await tab('Especificação');
    await expect(page.locator('#repository-scope')).toHaveValue(repository);
    await tab('Tarefas'); await page.locator('[data-action="new-task"]').click();
    await page.locator('#new-task-name').fill('Tarefa adicional isolada');
    await page.locator('[data-dialog-action="create-demo-task"]').click();
    await expect(page.getByRole('navigation',{name:'Assuntos da história',exact:true})).toContainText('25');
    await expect(page.locator('#main')).toContainText('19 adicionais');
  });
  await check('Solicitação sem confirmação preserva a intenção e não oferece nova aprovação', async () => {
    await open('uncertain'); await currentCommand();
    await expect(page.locator('#dialog')).toContainText('demo-g1-042');
    await expect(page.locator('#dialog')).toContainText('mesmo corpo, persona e chave');
    await expect(page.locator('[data-confirm-required]')).toHaveCount(0);
    await expect(page.locator('#scenario')).toHaveValue('uncertain');
  });
  await check('Reabrir exige justificativa; resultados permanecem e agentes não reiniciam', async () => {
    await open('cancelled'); await currentCommand();
    await page.locator('#confirm-command').check();
    await expect(page.locator('[data-confirm-required]')).toBeDisabled();
    await page.locator('#reason').fill('Retomar com os critérios revisados');
    await page.locator('[data-confirm-required]').click();
    await expect(page.locator('#scenario')).toHaveValue('reopened');
    await expect(page.locator('.situation')).toContainText('não reiniciou agentes');
    await tab('Tarefas');
    const extra = page.locator('tbody tr').filter({hasText:'Documentar regra de endereço'});
    await expect(extra).toContainText('CANCELLED');
  });
  await check('Acervo, inatividade, persona de consulta e tentativa histórica não liberam comandos', async () => {
    for (const scenario of ['archived','inactive','permission','completed']) {
      await open(scenario,'tab=planning');
      await expect(page.locator('[data-action="edit-story"]')).toHaveCount(0);
      if (scenario === 'permission') {
        await page.locator('[data-action="execute-current"]').click();
        await expect(page.locator('#dialog')).toContainText('persona atual não pode aprovar');
        await expect(page.locator('[data-confirm-required]')).toHaveCount(0);
        await page.keyboard.press('Escape');
      } else await expect(page.locator('[data-action="execute-current"]')).toHaveCount(0);
      await expect(page.locator('[data-action="interrupt"]')).toHaveCount(0);
    }
    await open('g1','tab=planning&attempt=1');
    await expect(page.locator('#main')).toContainText('tentativa 1 · anterior');
    await expect(page.locator('[data-action="execute-current"]')).toHaveCount(0);
    const historicalConditions = page.locator('[data-action="decision-details"]');
    if (await historicalConditions.count()) {
      await historicalConditions.click();
      await expect(page.locator('#dialog')).toBeVisible();
      await expect(page.locator('[data-confirm-required]')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-action="current-attempt"]').click();
    await expect(page).not.toHaveURL(/attempt=1/);
    await expect(page.locator('.situation')).toContainText('Especificação pronta');
  });
  await check('Todos os cenários podem ser consultados sem erros; conclusão legada não fabrica testes', async () => {
    await open();
    const scenarios = await page.locator('#scenario option').evaluateAll(options=>options.map(option=>option.value));
    scenarioCount = scenarios.length;
    for (const scenario of scenarios) {
      await open(scenario,'tab=planning');
      await expect(page.locator('#execution-title')).toBeVisible();
      await expect(page.locator('.situation')).toBeVisible();
    }
    await open('completed','tab=tasks');
    const test = page.locator('tbody tr').filter({has:page.getByRole('link',{name:'T02 Teste',exact:true})});
    await expect(test).not.toContainText('DONE');
  });
  await check('Teclado, diálogo e redução de movimento preservam a interação', async () => {
    await open('g1'); await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();
    await page.locator('[data-action="guide"]').click();
    await expect(page.locator('#dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#dialog')).not.toBeVisible();
    await page.emulateMedia({reducedMotion:'reduce'});
    await open('running','tab=planning');
    expect(await page.locator('.spinner').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('Menu móvel explicita cinco destinos e as cinco abas da História permanecem visíveis', async () => {
    await page.setViewportSize({width:390,height:844}); await open();
    await page.locator('[data-action="global-menu"]').click();
    const nav = page.getByRole('navigation',{name:'Destinos do Portal',exact:true});
    for (const name of ['Visão geral','Assistente','Sistemas · contexto atual','Releases','Integrações']) {
      await expect(nav.getByText(name,{exact:true})).toBeVisible();
    }
    await page.screenshot({path:output+'/menu-mobile.png'});
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-action="global-menu"]')).toBeFocused();
    const boxes = await page.getByRole('navigation',{name:'Assuntos da história',exact:true}).locator('a').evaluateAll(links=>links.map(link=>{const r=link.getBoundingClientRect();return {left:r.left,right:r.right};}));
    expect(boxes.every(box=>box.left>=0&&box.right<=390)).toBe(true);
  });
  await check('Desktop, celular e altura reduzida sem estouro horizontal; capturas da navegação', async () => {
    for (const [width,height] of [[1440,1000],[390,844],[390,500],[780,844]]) {
      await page.setViewportSize({width,height});
      await open('g1','tab=tasks');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.locator('[data-action="primary"]').scrollIntoViewIfNeeded();
      const box = await page.locator('[data-action="primary"]').boundingBox();
      expect(box.width).toBeLessThanOrEqual(width);
      metrics.push({width,height,actionWidth:Math.round(box.width),horizontalOverflow:false});
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:`${output}/tarefas-${width}-${height}.png`,fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    await open('blocked','tab=planning');
    await page.screenshot({path:output+'/impedimento-mobile.png',fullPage:true});
    await open('g1','view=system');
    await page.screenshot({path:output+'/sistema-mobile.png',fullPage:true});
  });
  await check('Zero chamadas à API, GitLab ou modelos; somente GET dos arquivos da prévia', async () => {
    expect(errors).toEqual([]);
    expect(requests.every(request=>request.method==='GET'&&request.url.startsWith(base+'/'))).toBe(true);
    expect(requests.every(request=>!new URL(request.url).pathname.startsWith('/api'))).toBe(true);
  });
  writeFileSync(output+'/report.json', JSON.stringify({passed:results.length,scenarioCount,results,metrics,errors,requests},null,2));
  console.log(JSON.stringify({passed:results.length,scenarioCount,errors,metrics}));
} catch (error) {
  await page.screenshot({path:output+'/failure.png',fullPage:true});
  writeFileSync(output+'/failure.json', JSON.stringify({passed:results.length,results,errors,error:String(error),url:page.url()},null,2));
  throw error;
} finally { await browser.close(); }
