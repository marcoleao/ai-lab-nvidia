import {test,expect,type Page} from '@playwright/test';
import {assistantContext} from './assistant-fixtures';

const title='Como a execução percorre o SDLC';
const helpLabel='HELP — Guia do SDLC';
const htmlPath='/help/fluxo-execucao.html';
const article=(page:Page)=>page.locator('article.sdlc-help');
const helpLink=(page:Page)=>page.getByRole('navigation',{name:'Ajuda',exact:true}).getByRole('link',{name:helpLabel,exact:true});

async function offlineApis(page:Page){
  const reads:string[]=[],writes:string[]=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>{
    const request=route.request();
    (['GET','HEAD','OPTIONS'].includes(request.method())?reads:writes).push(request.method()+' '+new URL(request.url()).pathname);
    return route.fulfill({status:503,json:{error:{message:'API indisponível nesta validação isolada da ajuda.'}}});
  });
  return {reads,writes,errors};
}

for(const width of [1440,390])test(`HELP opens from the navigation footer while APIs are unavailable at ${width}px`,async({page})=>{
  const state=await offlineApis(page);await page.setViewportSize({width,height:width===390?844:1000});
  await page.goto('/systems');await expect(page.locator('.sidebar-bottom').getByRole('navigation',{name:'Ajuda',exact:true})).toBeVisible();
  await helpLink(page).click();await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading',{name:title,exact:true,level:1})).toBeVisible();
  await expect(helpLink(page)).toHaveAttribute('aria-current','page');
  await expect(article(page)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('The Portal HELP is independent of APIs and every local index link resolves to a unique accessible target',async({page})=>{
  const state=await offlineApis(page),externalRequests:string[]=[];
  page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)&&url.origin!==new URL(page.url()==='about:blank'?request.url():page.url()).origin)externalRequests.push(request.url());});
  await page.goto('/help');await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Índice da ajuda',exact:true})).toBeVisible();
  for(const id of ['mapa-geral','percurso','loops','botoes','limites','referencias'])await expect(article(page).locator(`[id="${id}"]`)).toHaveCount(1);
  const anchors=await article(page).evaluate(element=>{
    const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);
    const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
    const unresolved=[...element.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map(link=>link.getAttribute('href')!).filter(href=>{
      const id=decodeURIComponent(href.slice(1));
      return href.length<2||!document.getElementById(id);
    });
    return {duplicates,unresolved};
  });
  expect(anchors).toEqual({duplicates:[],unresolved:[]});
  await expect(page.locator('iframe,form,input,textarea,select,[contenteditable="true"]')).toHaveCount(0);
  await expect(article(page).locator('button,script')).toHaveCount(0);
  const loops=page.getByRole('navigation',{name:'Índice da ajuda',exact:true}).locator('a[href="#loops"]');
  await loops.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/#loops$/);
  await expect(article(page).locator('#loops')).toBeVisible();
  const dictionary=page.getByRole('region',{name:'Dicionário dos controles',exact:true});
  await expect(dictionary).toHaveAttribute('tabindex','0');await dictionary.focus();
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(dictionary).toBeFocused();
  expect(state.reads).toEqual([]);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);expect(externalRequests).toEqual([]);
});

test('The independent HELP HTML has a complete document and remains readable with JavaScript disabled',async({page,browser})=>{
  const state=await offlineApis(page);await page.goto('/help');
  const exportLink=page.getByRole('link',{name:'Abrir HTML independente',exact:true});
  await expect(exportLink).toHaveAttribute('href',htmlPath);
  const assetUrl=new URL(htmlPath,page.url()).href,response=await page.request.get(assetUrl);
  expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toMatch(/text\/html/i);
  const html=await response.text();expect(html).toMatch(/^\s*<!doctype html>/i);expect(html).toMatch(/<title>[^<]+<\/title>/i);
  expect(html).toContain(title);expect(html).not.toMatch(/<iframe\b/i);expect(html).not.toMatch(/<script\b[^>]*\bsrc=["']https?:\/\//i);
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:1000}});
  const staticPage=await context.newPage(),apiCalls:string[]=[];
  await context.route('**/api/**',route=>{apiCalls.push(route.request().url());return route.abort();});
  await staticPage.goto(assetUrl);await expect(staticPage.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect(staticPage.getByRole('navigation',{name:'Índice da ajuda',exact:true})).toBeVisible();
  await expect(article(staticPage)).toBeVisible();await expect(staticPage.locator('iframe,form')).toHaveCount(0);
  const body=staticPage.locator('body');
  await expect(body).toHaveCSS('padding-top','24px');await expect(body).toHaveCSS('margin-top','0px');
  await expect(body).toHaveCSS('font-family',/Segoe UI/);await expect(body).toHaveCSS('background-color','rgb(244, 246, 248)');
  await staticPage.emulateMedia({media:'print'});
  await expect(body).toHaveCSS('padding-top','0px');await expect(body).toHaveCSS('background-color','rgb(255, 255, 255)');
  const counter=await article(staticPage).locator('.help-map > li').first().evaluate(node=>{
    const style=getComputedStyle(node,'::before');return {color:style.color,borderColor:style.borderTopColor,borderStyle:style.borderTopStyle,borderWidth:style.borderTopWidth};
  });
  expect(counter).toEqual({color:'rgb(0, 0, 0)',borderColor:'rgb(0, 0, 0)',borderStyle:'solid',borderWidth:'1px'});
  expect(apiCalls).toEqual([]);await context.close();expect(state.reads).toEqual([]);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});

test('The Assistant mobile menu offers HELP by keyboard while APIs are offline and closes its dialog on navigation',async({page})=>{
  const state=await offlineApis(page);
  const context=await assistantContext(page,{id:'help-system',name:'Sistema isolado da ajuda'},[{id:'help-project',name:'Projeto isolado da ajuda'}]);
  await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
  await page.route(url=>url.pathname==='/api/assistant',route=>route.fulfill({json:{context:context.projects[0],session:{id:'help-session',version:1},turns:[],latestTurn:null,activeTurn:null,hasSuccessfulInterview:false,proposals:[],currentProposal:null,turnsPage:{page:1,total:0,pageSize:20,totalPages:1},proposalsPage:{page:1,total:0,pageSize:20,totalPages:1},availableRepositories:[],configured:false,requirementsMode:true,brief:{summary:'',confirmedFacts:[],openQuestions:[]},hierarchy:{writable:true},readOnly:true,readOnlyReason:'Contexto de consulta isolado.',capabilities:{canMessage:false,canGeneratePlan:false,canComplete:false,canApplyPlan:false,canEditPlan:false,canCancelTurn:false}}}));
  await page.setViewportSize({width:390,height:844});await page.goto('/assistant?system=help-system&project=help-project');
  const trigger=page.getByRole('button',{name:'Abrir menu principal',exact:true});await expect(trigger).toBeVisible();
  // After entering the selected-chat layout, every later API read is offline.
  // The HELP menu and document must stay available without a business command.
  const offline=await offlineApis(page);await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Menu principal',exact:true});await expect(dialog).toBeVisible();
  const link=dialog.getByRole('navigation',{name:'Ajuda',exact:true}).getByRole('link',{name:helpLabel,exact:true});
  await link.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(dialog).toBeHidden();
  await expect(helpLink(page)).toHaveAttribute('aria-current','page');expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);expect(offline.writes).toEqual([]);expect(offline.errors).toEqual([]);
});

test('HELP separates implemented execution, command recovery and the current acceptance and release limitations',async({page})=>{
  const state=await offlineApis(page);await page.goto('/help');await expect(article(page)).toBeVisible();
  await expect(article(page).locator('#mapa-geral')).toContainText(/código no GitLab, não aplicação implantada em DEV/);
  const limits=article(page).locator('#limites');
  await expect(limits).toContainText(/perfil HTTP não prova selects, CSS, teclado/);
  await expect(limits).toContainText(/QA\/HML\/PROD/);
  await expect(limits).toContainText(/candidata imutável, execução\/promoções e conclusão por produção ainda não são operacionais/);
  await expect(limits).toContainText(/Este exemplo é histórico, não uma leitura do seu ambiente agora/);
  const controls=article(page).locator('#botoes');
  await expect(controls.getByRole('row').filter({hasText:'Consultar resultado / Atualizar consulta'})).toContainText('Não cria outra execução.');
  await expect(controls.getByRole('row').filter({hasText:'Verificar recebimento'})).toContainText('pode reapresentar o comando');
  await expect(controls.getByRole('row').filter({hasText:'Verificar resultado / Reconciliar'})).toContainText('Não é necessariamente só leitura.');
  await expect(article(page).locator('#l32')).toContainText('L32');
  await expect(article(page).locator('#l33')).toContainText('L33');
  expect(state.reads).toEqual([]);expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
});
