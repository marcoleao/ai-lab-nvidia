import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {assistantContext} from './assistant-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Assistant fixtures require the isolated test environment');

test('assistant confirms uncertain delivery once, restores conversation, cancels and preserves keyboard access',async({page,request})=>{
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const context={id:'assistant-ui-only',kind:'system',key:'UI',name:'Contexto exclusivo do teste',description:'Fixture somente no navegador',status:'active',version:1,archived:false,parentId:null,data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const turns:{id:string;input:string;output:string|null;status:string;error:string|null;actorName:string;model:string|null;createdAt:string}[]=[];
  const receipts=new Map<string,unknown>();let version=0,interrupt=true;
  await assistantContext(page,context,[{id:'assistant-project',name:'Projeto do ensaio'}]);
  await page.route('**/api/assistant**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET')return route.fulfill({json:{context,session:turns.length?{id:'ui-session',version}:null,turns,configured:true,model:'isolated-ui-fixture'}});
    const key=req.headers()['idempotency-key'];
    if(receipts.has(key))return route.fulfill({json:receipts.get(key)});
    if(url.pathname.endsWith('/cancel')){turns.at(-1)!.status='cancelled';turns.at(-1)!.error='Rodada cancelada na fixture.';version++;const receipt={cancelled:true};receipts.set(key,receipt);return route.fulfill({json:receipt});}
    const body=req.postDataJSON();const turn={id:`turn-${turns.length+1}`,input:body.message,output:null,status:'queued',error:null,model:null,actorName:'Admin',createdAt:new Date().toISOString()};turns.push(turn);version++;
    const receipt={turn};receipts.set(key,receipt);
    if(interrupt){interrupt=false;return route.abort();}
    return route.fulfill({json:receipt});
  });
  await page.goto('/assistant?system=assistant-ui-only&project=assistant-project&scope=system');
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  const panel=page.getByRole('region',{name:'Entrevista e planejamento'});
  await expect(page.locator('.assistant-launcher')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Objetivo informado no teste isolado');
  await panel.getByRole('button',{name:'Enviar mensagem'}).click();
  await expect(panel.getByRole('button',{name:'Confirmar envio'})).toBeEnabled();
  await panel.getByRole('button',{name:'Confirmar envio'}).click();
  await expect(panel.getByText(/QUEUED · aguardando geração/)).toBeVisible();expect(turns).toHaveLength(1);
  turns[0].status='succeeded';turns[0].output='Resposta exclusiva do teste de interface.';turns[0].model='isolated-ui-fixture';version++;
  await expect(panel.getByText('Resposta exclusiva do teste de interface.',{exact:false})).toBeVisible();
  await page.keyboard.press('Escape');await expect(panel).toBeVisible();await page.reload();
  await expect(panel.getByText('Resposta exclusiva do teste de interface.',{exact:false})).toBeVisible();
  mkdirSync(process.env.SCREENSHOT_DIR||'test-results',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'test-results'}/live-assistant-${width}.png`});}
  await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Mensagem que será cancelada');await panel.getByRole('button',{name:'Enviar mensagem'}).click();
  await panel.getByRole('button',{name:'Cancelar geração'}).click();
  await panel.getByRole('button',{name:'Recuperar mensagem no rascunho'}).click();
  await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toHaveValue('Mensagem que será cancelada');
  await panel.getByRole('button',{name:/2 · Propostas e confirmação/}).click();
  await expect(panel.getByRole('button',{name:'Gerar proposta para revisão'})).toBeDisabled(); // System history is explicit; a reviewable proposal uses Project context.
  await panel.getByRole('button',{name:'1 · Entrevista',exact:true}).click();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
  await expect(panel.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
});
