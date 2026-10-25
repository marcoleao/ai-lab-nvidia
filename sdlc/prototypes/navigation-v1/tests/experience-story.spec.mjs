import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const STORY='#/story/story-consulta';
const STORE='sdlc-story-workspace-prototype-v2-experience';
const primary=page=>page.getByTestId('process-primary');
const phase=page=>page.getByTestId('story-phase');
const table=page=>page.locator('[data-query-id="sw-tasks-story-consulta"]');
const observations=new WeakMap();
async function openFilters(scope){const details=scope.locator('[data-query-disclosure]');if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();}

async function open(page,tab='overview',persona='admin'){
  await page.goto(`/${STORY}/${tab}`);
  await page.getByTestId('story-workspace').waitFor();
  if(persona)await page.locator('#persona-select').selectOption(persona);
}
async function scenario(page,value){
  await page.getByTestId('simulation-controls').evaluate(element=>{element.open=true;});
  await page.getByTestId('simulator-select').selectOption(value);
}
async function capture(page,name,fullPage=false){
  const directory=process.env.SCREENSHOT_DIR||'/output/screenshots';
  await mkdir(directory,{recursive:true});
  await page.screenshot({path:path.join(directory,name+'.png'),fullPage});
}

test.beforeEach(async({page,baseURL})=>{
  const trace={errors:[],requests:[],sockets:[]};observations.set(page,trace);
  page.on('pageerror',error=>trace.errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).origin!==new URL(baseURL).origin||/\/api(?:\/|$)/.test(request.url())||request.method()!=='GET')trace.requests.push(request.url());});
  page.on('websocket',socket=>trace.sockets.push(socket.url()));
});
test.afterEach(async({page})=>{
  expect(observations.get(page)).toEqual({errors:[],requests:[],sockets:[]});
});

test('G1 depende de persona e confirmação; trocar persona exige confirmar novamente',async({page})=>{
  await open(page,'overview','');
  await expect(primary(page)).toBeDisabled();
  await page.locator('#persona-select').selectOption('bruno');
  await expect(primary(page)).toBeDisabled();
  await page.locator('#persona-select').selectOption('ana');
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await page.getByTestId('process-confirmation').check();
  await expect(primary(page)).toBeEnabled();
  await page.locator('#persona-select').selectOption('admin');
  await expect(page.getByTestId('process-confirmation')).not.toBeChecked();
  await expect(primary(page)).toBeDisabled();
  await page.getByTestId('process-confirmation').check();
  await primary(page).click();
  await expect(phase(page)).toHaveText('CODING');
  await expect(page.getByTestId('story-situation')).toContainText('QUEUED');
  await expect(page.getByTestId('interaction-panel')).toContainText('Aguardando recurso');
  await expect(page.getByTestId('interaction-panel')).toHaveCount(1);
  await expect(page.getByTestId('task-status-task-consulta')).toHaveText('TO DO');
});

test('45 Tarefas usam páginas de 20, filtros aplicados e consulta preservada entre abas e Voltar',async({page})=>{
  await open(page,'tasks');
  await expect(table(page).locator('tbody tr')).toHaveCount(20);
  await expect(table(page)).toContainText('45 resultados');
  await table(page).getByRole('button',{name:'Próxima',exact:true}).first().click();
  await expect(page).toHaveURL(/sw-tasks-story-consulta.page=2/);
  const first=await table(page).locator('tbody tr').first().getAttribute('data-query-row');
  await page.locator('.sw-tabs[aria-label="Seções da História"]').getByRole('link',{name:'Especificação',exact:true}).click();
  await page.locator('.sw-tabs[aria-label="Seções da História"]').getByRole('link',{name:'Tarefas',exact:true}).click();
  await expect(table(page)).toContainText('Página 2 de 3');
  await expect(table(page).locator('tbody tr').first()).toHaveAttribute('data-query-row',first);
  await openFilters(table(page));
  await table(page).getByLabel('Buscar Tarefa por chave, nome ou descrição',{exact:true}).fill('Validar cenário');
  await expect(table(page)).toContainText('Filtros alterados. Use Aplicar filtros.');
  await table(page).getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(table(page)).toContainText('42 resultados');
  await expect(table(page)).toContainText('Página 1 de 3');
  await page.goBack();
  await expect(table(page)).toContainText('Página 2 de 3');
  await page.getByRole('button',{name:'Exige atenção agora',exact:true}).click();
  await expect(table(page).locator('tbody tr')).toHaveCount(1);
  await expect(table(page)).toContainText('Definir situações e critérios de aceite');
  await expect(phase(page)).toHaveText('SPECIFICATION');
  await capture(page,'experience-story-filter-desktop');
});

test('tentativas paginadas não alteram o resultado atual; aprovação antiga é somente leitura',async({page})=>{
  await open(page);await scenario(page,'review-findings');
  await page.evaluate(key=>{
    const data=JSON.parse(sessionStorage.getItem(key)),state=data.stories['story-consulta'];
    state.revision=2;state.sequence=27;
    state.attempts=Array.from({length:27},(_,index)=>({id:`check-${index+1}`,taskId:'sw-review',revision:index<20?1:2,number:index+1,state:index===26?'BLOCKED':'PASSED',summary:index===26?'Achado na revisão atual; correção necessária.':`Verificação simulada ${index+1} aprovada.`,createdAt:new Date(Date.UTC(2026,9,20,10,index)).toISOString(),sha:`example-r${index<20?1:2}`,findings:[],events:[]}));
    sessionStorage.setItem(key,JSON.stringify(data));
  },STORE);
  await page.reload();
  await page.goto(`/${STORY}/task/sw-review/attempts`);
  const attempts=page.locator('[data-query-id="sw-attempts-story-consulta-sw-review"]');
  await expect(attempts.locator('tbody tr')).toHaveCount(20);
  await expect(page.getByTestId('attempt-detail')).toContainText('Achado na revisão atual');
  await openFilters(attempts);
  await attempts.getByRole('combobox',{name:'Revisão de código',exact:true}).selectOption('1');
  await attempts.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(attempts).toContainText('20 resultados');
  await expect(page.getByTestId('attempt-detail')).toContainText('Achado na revisão atual');
  await expect(primary(page)).toContainText('Preparar correção');
  await attempts.getByTestId('attempt-link-check-20').click();
  await expect(page.getByTestId('attempt-detail')).toHaveAttribute('data-history','true');
  await expect(page.getByTestId('interaction-panel')).toContainText('SOMENTE LEITURA');
  await expect(primary(page)).toHaveCount(0);
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await capture(page,'experience-task-historical-desktop');
  await page.getByTestId('return-current').click();
  await expect(primary(page)).toContainText('Preparar correção');
});

test('histórico pagina, filtra ator e abre ocorrência com retorno ao mesmo recorte',async({page})=>{
  await open(page);
  await page.evaluate(key=>{
    const data=JSON.parse(sessionStorage.getItem(key)),state=data.stories['story-consulta'];
    state.events=Array.from({length:45},(_,index)=>({id:`fixture-event-${index}`,timestamp:new Date(Date.UTC(2026,9,24,10,index)).toISOString(),actor:index%2?'Bruno':'Ana',actorType:'human',type:'DECISION_SIMULATED',title:`Decisão de exemplo ${index}`,result:'RECORDED',phase:'SPECIFICATION',revision:1,correlationId:`example-${index}`}));
    sessionStorage.setItem(key,JSON.stringify(data));
  },STORE);
  await page.reload();
  await page.goto(`/${STORY}/more`);
  const history=page.locator('[data-query-id="sw-history-story-consulta"]');
  await expect(history.locator('tbody tr')).toHaveCount(20);
  await openFilters(history);
  await history.getByRole('combobox',{name:'Ator',exact:true}).selectOption('Ana');
  await history.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(history).toContainText('23 resultados');
  await history.getByRole('button',{name:'Próxima',exact:true}).first().click();
  await expect(history.locator('tbody tr')).toHaveCount(3);
  const query=page.url();
  await history.locator('tbody tr').first().getByRole('link').first().click();
  await expect(page.getByRole('heading',{name:'O que aconteceu',exact:true})).toBeVisible();
  await expect(page.locator('#main-content')).toContainText('Ana');
  await page.getByRole('link',{name:'Voltar à consulta'}).click();
  await expect(page).toHaveURL(query);
  await expect(history).toContainText('Página 2 de 2');
});

test('Tarefa manual mantém consulta histórica e administração separadas do comando do processo',async({page})=>{
  await open(page);await scenario(page,'review-findings');
  await page.goto(`/${STORY}/task/task-acessibilidade/overview`);
  await expect(page.getByTestId('interaction-panel')).toContainText('CONSULTA DE OUTRA TAREFA');
  await expect(primary(page)).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Editar Tarefa planejada',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Alterar status da Tarefa manual',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Histórico',exact:true}).last().click();
  await expect(page.locator('[data-query-id="sw-history-story-consulta-task-acessibilidade"]')).toContainText('Nenhuma ocorrência');
  await expect(phase(page)).toHaveText('CODE REVIEW');
});

test('CRUD manual atualiza o mapa de Tarefas sem reiniciar a atividade do processo',async({page})=>{
  await open(page);await scenario(page,'review-findings');
  await page.goto(`/${STORY}/task/task-acessibilidade/overview`);
  await page.getByRole('link',{name:'Alterar status da Tarefa manual',exact:true}).click();
  await page.getByLabel('Próxima situação',{exact:true}).selectOption('doing');
  await page.getByRole('button',{name:'Confirmar situação · simulação',exact:true}).click();
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await expect(page.locator('.sw-content .sw-section-head .sw-badge')).toHaveText('DOING');
  await page.getByRole('link',{name:'Editar Tarefa planejada',exact:true}).click();
  await page.getByLabel('Nome ou título',{exact:true}).fill('Verificação manual atualizada no protótipo');
  await page.getByRole('button',{name:'Salvar alterações · simulação',exact:true}).click();
  await expect(page.locator('.sw-page-heading h1')).toHaveText('Verificação manual atualizada no protótipo');
  await page.reload();
  await expect(page.locator('.sw-content .sw-section-head .sw-badge')).toHaveText('DOING');
  await page.goto(`/${STORY}/tasks`);
  await expect(page.getByTestId('task-row-task-acessibilidade')).toContainText('Verificação manual atualizada no protótipo');
  await expect(page.getByTestId('task-status-task-acessibilidade')).toHaveText('DOING');
  await page.getByRole('link',{name:/^Criar Tarefa planejada/}).click();
  await page.getByLabel('Nome ou título',{exact:true}).fill('Nova Tarefa manual criada na revisão');
  await page.getByLabel('Descrição',{exact:true}).fill('Evidência manual independente da atividade de Code Review.');
  await page.getByRole('button',{name:'Criar · simulação',exact:true}).click();
  await expect(page.locator('.sw-page-heading h1')).toHaveText('Nova Tarefa manual criada na revisão');
  await expect(phase(page)).toHaveText('CODE REVIEW');
  await page.goto(`/${STORY}/tasks`);
  await expect(table(page)).toContainText('47 resultados');
  await expect(table(page)).toContainText('Nova Tarefa manual criada na revisão');
});

test('390px mantém fase e próxima ação acessíveis antes da lista, sem overflow horizontal',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page,'tasks');
  const interaction=page.getByTestId('interaction-panel'),tasks=table(page);
  expect((await interaction.boundingBox()).y).toBeLessThan((await tasks.boundingBox()).y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page,'experience-story-tasks-mobile-top');
  await page.evaluate(()=>window.scrollTo(0,1800));
  const situation=await page.getByTestId('story-situation').boundingBox();
  expect(situation.y).toBeGreaterThanOrEqual(0);expect(situation.y).toBeLessThan(180);
  await page.getByTestId('open-interaction').click();
  await expect(primary(page)).toBeInViewport();
  await primary(page).click();
  await expect(page.getByTestId('process-confirmation')).toBeVisible();
  await capture(page,'experience-story-g1-mobile');
  await scenario(page,'review-findings');
  await page.getByTestId('current-activity-link').click();
  await capture(page,'experience-task-review-mobile');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
