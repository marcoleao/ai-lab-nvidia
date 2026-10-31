import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {assistantContext,assistantMessagePage} from './assistant-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Assistant fixtures require the isolated test environment');

test('assistant confirms uncertain delivery once, restores conversation, cancels and preserves keyboard access',async({page,request})=>{
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const context={id:'assistant-ui-only',kind:'system',key:'UI',name:'Contexto exclusivo do teste',description:'Fixture somente no navegador',status:'active',version:1,archived:false,parentId:null,data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const turns:{id:string;input:string;output:string|null;status:string;error:string|null;actorName:string;model:string|null;createdAt:string}[]=[];
  const receipts=new Map<string,unknown>(),signatures=new Map<string,unknown>();let version=0,interrupt=true;
  await assistantContext(page,context,[{id:'assistant-project',name:'Projeto do ensaio'}]);
  await page.route('**/api/assistant**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET'){
      if(url.pathname==='/api/assistant/messages')return route.fulfill({json:{contextId:context.id,...assistantMessagePage(turns,url.searchParams),readOnly:false,readOnlyReason:null}});
      const current=assistantMessagePage(turns).turns;
      return route.fulfill({json:{context,session:turns.length?{id:'ui-session',version}:null,turns:current,latestTurn:current.at(-1)??null,activeTurn:current.find(turn=>['queued','running','paused'].includes(turn.status))??null,currentProposal:null,hasSuccessfulInterview:turns.some(turn=>turn.status==='succeeded'),turnsPage:{page:1,pageSize:20,total:turns.length,totalPages:1,hasMore:false},configured:true,model:'isolated-ui-fixture'}});
    }
    const key=req.headers()['idempotency-key'];
    const signature={method:req.method(),path:url.pathname,persona:req.headers()['x-persona'],body:req.postDataJSON()};
    if(receipts.has(key)){expect(signature).toEqual(signatures.get(key));return route.fulfill({json:receipts.get(key)});}
    signatures.set(key,signature);
    if(url.pathname.endsWith('/cancel')){turns.at(-1)!.status='cancelled';turns.at(-1)!.error='Rodada cancelada na fixture.';version++;const receipt={cancelled:true};receipts.set(key,receipt);return route.fulfill({json:receipt});}
    const body=req.postDataJSON();const turn={id:`turn-${turns.length+1}`,sequence:turns.length+1,input:body.message,output:null,status:'queued',error:null,model:null,actorName:'Admin',createdAt:new Date().toISOString()};turns.push(turn);version++;
    const receipt={turn};receipts.set(key,receipt);
    if(interrupt){interrupt=false;return route.abort();}
    return route.fulfill({json:receipt});
  });
  await page.goto('/assistant?system=assistant-ui-only&project=assistant-project&scope=system');
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  const panel=page.getByRole('region',{name:'Entrevista e planejamento'});
  const conversation=panel.locator('#assistant-panel-conversation');
  await expect(page.locator('.assistant-launcher')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Objetivo informado no teste isolado');
  await panel.getByRole('button',{name:'Enviar mensagem'}).click();
  await expect(panel.getByRole('button',{name:'Confirmar envio'})).toBeEnabled();
  await panel.getByRole('button',{name:'Confirmar envio'}).click();
  await expect(panel.getByText(/QUEUED · aguardando geração/).first()).toBeVisible();expect(turns).toHaveLength(1);
  turns[0].status='succeeded';turns[0].output='Resposta exclusiva do teste de interface.';turns[0].model='isolated-ui-fixture';version++;
  await expect(conversation.getByText('Resposta exclusiva do teste de interface.',{exact:true})).toBeVisible();
  await expect(conversation.locator('[data-chat-turn="turn-1"]')).toHaveCount(1);
  await page.keyboard.press('Escape');await expect(panel).toBeVisible();await page.reload();
  await expect(conversation.getByText('Resposta exclusiva do teste de interface.',{exact:true})).toBeVisible();
  mkdirSync(process.env.SCREENSHOT_DIR||'test-results',{recursive:true});
  for(const [width,height] of [[1440,900],[390,900],[390,500]]){
    await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const control of [conversation.getByRole('button',{name:'Enviar mensagem',exact:true}),conversation.getByRole('textbox',{name:'Sua mensagem',exact:true})]){
      await expect.poll(async()=>{const rect=await control.boundingBox();return rect?rect.y:-1;}).toBeGreaterThanOrEqual(0);
      await expect.poll(async()=>{const rect=await control.boundingBox();return rect?rect.y+rect.height:Infinity;}).toBeLessThanOrEqual(height);
    }
    await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'test-results'}/live-assistant-${width}-${height}.png`});
  }
  await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Rascunho preservado ao revisar a proposta.');
  const scroll=panel.locator('.assistant-chat-scroll');await scroll.evaluate(node=>{node.scrollTop=0;});const position=await scroll.evaluate(node=>node.scrollTop);
  await panel.getByRole('button',{name:/^Proposta/}).click();await panel.getByRole('button',{name:'Conversa',exact:true}).click();
  await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toHaveValue('Rascunho preservado ao revisar a proposta.');
  await expect.poll(()=>scroll.evaluate(node=>node.scrollTop)).toBeCloseTo(position,0);
  await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Mensagem que será cancelada');await panel.getByRole('button',{name:'Enviar mensagem'}).click();
  await panel.getByRole('button',{name:'Cancelar geração'}).click();
  await panel.getByRole('button',{name:'Recuperar mensagem no rascunho'}).click();
  await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toHaveValue('Mensagem que será cancelada');
  await panel.getByRole('button',{name:/^Proposta/}).click();
  await expect(panel.getByRole('button',{name:'Gerar proposta para revisão'})).toBeDisabled(); // System history is explicit; a reviewable proposal uses Project context.
  await panel.getByRole('button',{name:'Conversa',exact:true}).click();
  const historyButton=panel.getByRole('button',{name:'Histórico de propostas',exact:true}),conversationButton=panel.getByRole('button',{name:'Conversa',exact:true});
  for(let navigation=0;navigation<3;navigation++){
    await historyButton.focus();await expect(historyButton).toBeFocused();await page.keyboard.press('Enter');
    await expect(panel.locator('#assistant-panel-history')).toBeVisible();await expect(historyButton).toHaveAttribute('aria-current','page');
    await conversationButton.focus();await expect(conversationButton).toBeFocused();await page.keyboard.press('Enter');
    await expect(conversation).toBeVisible();await expect(conversationButton).toBeHidden();await expect(page).toHaveURL(/assistant\.view=conversation/);
  }
  await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toHaveValue('Mensagem que será cancelada');
  await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
  await expect(panel.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
});
