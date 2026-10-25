import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

const STORY='#/story/story-consulta';
const header=page=>page.getByTestId('story-situation');
const panel=page=>page.getByTestId('interaction-panel');
const observations=new WeakMap();

async function scenario(page,value){
  await page.getByTestId('simulation-controls').evaluate(element=>{element.open=true;});
  await page.getByTestId('simulator-select').selectOption(value);
}
async function capture(page,name){
  const directory=process.env.SCREENSHOT_DIR||'/output/screenshots';
  await mkdir(directory,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(directory,name+'.png')});
}

test.beforeEach(async({page,baseURL})=>{
  const observed={errors:[],requests:[],sockets:[]};observations.set(page,observed);
  page.on('pageerror',error=>observed.errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).origin!==new URL(baseURL).origin||/\/api(?:\/|$)/.test(request.url())||request.method()!=='GET')observed.requests.push(request.url());});
  page.on('websocket',socket=>observed.sockets.push(socket.url()));
  await page.goto(`/${STORY}/overview`);await page.getByTestId('story-workspace').waitFor();
  await page.locator('#persona-select').selectOption('admin');
});
test.afterEach(async({page})=>{expect(observations.get(page)).toEqual({errors:[],requests:[],sockets:[]});});

test('fila e processamento têm indicador animado decorativo e espera textual identificável',async({page})=>{
  for(const value of ['queued','running','review-queued','review-running','scan-queued','scan-running','merge-queued','merge-running','correction-queued','correction-running']){
    await scenario(page,value);
    await expect(header(page).locator('.ui-spinner')).toHaveCount(1);
    await expect(header(page).locator('.ui-spinner')).toHaveAttribute('aria-hidden','true');
    await expect(panel(page).getByRole('status').filter({has:page.locator('.ui-spinner')})).toHaveCount(1);
    expect(await header(page).locator('.ui-spinner').evaluate(element=>getComputedStyle(element).animationName)).toBe('ui-spin');
    await page.getByTestId('current-activity-link').click();
    const signals=page.getByTestId('processing-signals');
    await expect(signals.locator('.ui-spinner')).toHaveCount(value.includes('queued')?1:2);
    await expect(signals).toContainText('Consulta da tela');
    await expect(signals).toContainText(value.includes('queued')?'Nenhuma chamada ao modelo':'resposta ainda não observada');
    await expect(panel(page)).not.toContainText(/\d+\s*%/);
  }
  await capture(page,'experience-feedback-story-running-desktop');
});

test('aprovação, decisão humana, bloqueio e estado desconhecido não simulam processamento',async({page})=>{
  for(const value of ['approval','approved','published','review-findings','scan-findings','review-passed','scan-passed','auth-error','disconnected','no-heartbeat','merged']){
    await scenario(page,value);
    await expect(header(page).locator('.ui-spinner')).toHaveCount(0);
    await expect(panel(page).locator('.ui-spinner')).toHaveCount(0);
    await page.getByTestId('current-activity-link').click();
    await expect(page.getByTestId('processing-signals').locator('.ui-spinner')).toHaveCount(0);
  }
  await scenario(page,'review-findings');
  await expect(header(page).locator('.sw-badge')).toHaveAttribute('data-tone','warning');
  await expect(header(page).locator('.ui-error')).toHaveCount(0);
  await scenario(page,'no-heartbeat');
  await expect(header(page).locator('.sw-badge')).toHaveAttribute('data-tone','warning');
});

test('falha de autenticação e tentativa anterior FAILED continuam vermelhas com ícone',async({page})=>{
  await scenario(page,'auth-error');
  const failedBadge=header(page).locator('.sw-badge.ui-error');
  await expect(failedBadge).toHaveText('!FAILED');
  await expect(failedBadge.locator('.ui-failure-icon')).toBeVisible();
  const red=await failedBadge.evaluate(element=>getComputedStyle(element).color.match(/\d+/g).map(Number));
  expect(red[0]).toBeGreaterThan(red[1]);expect(red[0]).toBeGreaterThan(red[2]);
  await expect(page.getByTestId('integration-guidance')).toHaveClass(/ui-error/);
  await page.getByTestId('current-activity-link').click();
  await page.locator('.sw-tabs[aria-label="Seções da Tarefa"]').getByRole('link',{name:'Tentativas e evidências',exact:true}).click();
  const attempt=page.locator('[data-query-id^="sw-attempts-"] tbody a').first(),oldRoute=await attempt.getAttribute('href');
  await expect(page.getByTestId('attempt-detail')).toHaveClass(/ui-error/);
  await page.getByTestId('process-primary').click();
  await page.getByTestId('process-confirmation').check();
  await page.getByTestId('process-primary').click();
  await page.goto('/'+oldRoute);
  await expect(page.getByTestId('attempt-detail')).toHaveAttribute('data-history','true');
  await expect(page.getByTestId('attempt-detail')).toHaveClass(/ui-error/);
  await expect(page.getByTestId('process-primary')).toHaveCount(0);
  await expect(page.locator('[data-query-id^="sw-attempts-"] .sw-badge.ui-error')).toContainText('FAILED');
  await expect(page.locator('[data-query-id^="sw-attempts-"] .sw-badge.ui-error .ui-spinner')).toHaveCount(0);
  await capture(page,'experience-feedback-story-failed-history-desktop');
});

test('falha da consulta é vermelha e conserva estado de execução desconhecido',async({page})=>{
  await scenario(page,'disconnected');await page.getByTestId('current-activity-link').click();
  const queryFailure=page.getByTestId('processing-signals').locator('.sw-signal.ui-error');
  await expect(queryFailure).toContainText('Consulta da tela');
  await expect(queryFailure.locator('.ui-failure-icon')).toBeVisible();
  await expect(queryFailure).toContainText('Falhou');
  await expect(header(page)).toContainText('STATUS UNAVAILABLE');
  await expect(page.getByTestId('processing-signals')).toContainText('Estado atual desconhecido');
  await expect(page.getByTestId('processing-signals').locator('.ui-spinner')).toHaveCount(0);
  await capture(page,'experience-feedback-story-query-failed-desktop');
});

test('indicador cabe em 390px e respeita preferência por movimento reduzido',async({page})=>{
  await page.setViewportSize({width:390,height:844});await scenario(page,'review-running');
  await expect(header(page).locator('.ui-spinner')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page,'experience-feedback-story-running-mobile');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await header(page).locator('.ui-spinner').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
  await expect(header(page)).toContainText('RUNNING');
});
