import {test,expect,type Page} from '@playwright/test';
import {assistantContext,assistantMessagePage} from './assistant-fixtures';
import {mockPersonas} from './journey-fixtures';
import {mkdirSync} from 'node:fs';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Chat scenarios require isolated portal_test');
const now='2026-10-26T09:00:00.000Z';
const turn=(sequence:number)=>({id:`chat-${sequence}`,sequence,kind:'chat',input:`Pergunta ${sequence}: consultar uma solicitação.`,output:`Resposta ${sequence}: confira o protocolo, a situação e as regras de acesso.\n\nA especificação continua sujeita à revisão humana.`,status:'succeeded',actorName:'Ana',model:'isolated',error:null,createdAt:now,updatedAt:now});
async function fixture(page:Page,options:{hold?:boolean;count?:number}={}){
 const system={id:'chat-system',kind:'system',key:'CHATUI',name:'Sistema de Serviços',status:'active',archived:false,version:1,parentId:null};
 const project={id:'chat-project',kind:'project',key:'PROJET',name:'Projeto Atendimento',status:'active',projectLifecycle:'active',version:1,parentId:system.id,archived:false};
 await mockPersonas(page);await assistantContext(page,system,[project]);
 const state={turns:Array.from({length:options.count??65},(_,i)=>turn(i+1)),version:1,writes:[] as string[],queries:[] as URL[],failOlder:false,hold:options.hold??false,release:()=>{},readOnly:false,brief:null as null|{summary:string;confirmedFacts:string[];openQuestions:string[]}};
 await page.route('**/api/assistant**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'){state.writes.push(url.pathname);return route.fulfill({status:400,json:{error:{message:'Este cenário é somente de consulta.'}}});}
  if(url.pathname==='/api/assistant/messages'){
   state.queries.push(url);if(state.failOlder&&url.searchParams.has('before'))return route.fulfill({status:503,json:{error:{message:'A consulta anterior falhou neste ensaio.'}}});
   const result={contextId:project.id,...assistantMessagePage(structuredClone(state.turns),url.searchParams)};
   if(state.hold){state.hold=false;await new Promise<void>(resolve=>{state.release=resolve;});}
   return route.fulfill({json:result});
  }
  const latest=state.turns.at(-1)||null,active=state.turns.find(turn=>['queued','running','paused'].includes(turn.status))||null;
  return route.fulfill({json:{context:project,session:{id:'chat-session',version:state.version},turns:state.turns.slice(-20),latestTurn:latest,activeTurn:active,proposals:[],currentProposal:null,configured:true,model:'isolated',readOnly:state.readOnly,hasSuccessfulInterview:true,brief:state.brief,availableRepositories:[],capabilities:{canMessage:!state.readOnly&&!active,canGeneratePlan:!state.readOnly&&!active,canComplete:!state.readOnly&&!active,canApplyPlan:!state.readOnly,canEditPlan:!state.readOnly,canCancelTurn:!state.readOnly},turnsPage:{page:1,pageSize:20,total:state.turns.length,totalPages:Math.ceil(state.turns.length/20),hasMore:state.turns.length>20},proposalsPage:{page:1,pageSize:20,total:0,totalPages:1,hasMore:false}}});
 });
 await page.goto('/assistant?system=chat-system&project=chat-project');
 await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
 const panel=page.getByRole('region',{name:'Entrevista e planejamento'}),scroll=panel.locator('.assistant-chat-scroll');
 if(!options.hold)await expect(panel.locator('[data-chat-turn]')).toHaveCount(Math.min(20,state.turns.length));
 return {state,panel,scroll};
}
const refresh=async(page:Page)=>{const select=page.getByRole('combobox',{name:/Persona/});await select.selectOption(await select.inputValue()==='admin'?'bruno':'admin');};

test('chat keeps its composer anchored in desktop, mobile and reduced keyboard space',async({page})=>{
 const {panel,scroll,state}=await fixture(page);mkdirSync('test-results/screenshots',{recursive:true});
 for(const [width,height] of [[1440,1000],[390,844],[390,500],[780,844]]){
  await page.setViewportSize({width,height});await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);const input=panel.getByRole('textbox',{name:'Sua mensagem',exact:true}),send=panel.getByRole('button',{name:'Enviar mensagem',exact:true});await input.focus();
  await expect(async()=>{const box=await input.boundingBox(),button=await send.boundingBox();expect(box!.y).toBeGreaterThan(0);expect(button!.y+button!.height).toBeLessThanOrEqual(height+1);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);}).toPass({timeout:4000});
  expect(await input.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+15,r.y+15)===el;})).toBe(true);
  await page.screenshot({path:`test-results/screenshots/assistant-chat-${width}-${height}.png`});
 }
 expect(state.writes).toHaveLength(0);
});

test('older messages prepend without moving the reading anchor and all 65 remain accessible',async({page})=>{
 const {panel,scroll,state}=await fixture(page);await scroll.evaluate(el=>el.scrollTop=0);const anchor=panel.locator('[data-chat-turn="chat-46"]'),top=(await anchor.boundingBox())!.y;
 await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(40);await expect(page).toHaveURL(/assistant.before=46/);expect(Math.abs((await anchor.boundingBox())!.y-top)).toBeLessThan(4);
 for(const count of [60,65]){await scroll.evaluate(el=>el.scrollTop=0);await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(count);}
 await expect(panel.locator('.assistant-chat-coverage')).toContainText('65 de 65');expect(new Set(await panel.locator('[data-chat-turn]').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-chat-turn')))).size).toBe(65);expect(state.writes).toHaveLength(0);
});

test('a reloaded historical cursor exposes its real coverage, explicit continuation and current pause',async({page})=>{
 const {state,panel,scroll}=await fixture(page);await scroll.evaluate(el=>el.scrollTop=0);await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(page).toHaveURL(/assistant.before=46/);
 state.turns[64].status='paused';state.turns[64].output=null as any;state.turns[64].updatedAt='2026-10-26T09:01:00Z';await page.reload();await expect(panel.locator('[data-chat-turn]')).toHaveCount(20);expect(await panel.locator('[data-chat-turn]').first().getAttribute('data-chat-turn')).toBe('chat-26');await expect(panel.locator('.assistant-current-state')).toContainText('PAUSED');await expect(panel.getByRole('button',{name:'Enviar mensagem',exact:true})).toBeDisabled();
 await panel.getByRole('button',{name:'Carregar interações seguintes',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(40);await panel.getByRole('button',{name:'Proposta',exact:true}).click();await expect(panel.locator('.assistant-current-state')).toContainText('PAUSED');expect(state.writes).toHaveLength(0);
});

test('new interactions while reading older messages create a visible gap and catch up more than one page',async({page})=>{
 const {state,panel,scroll}=await fixture(page);await scroll.evaluate(el=>el.scrollTop=0);await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(40);await scroll.evaluate(el=>el.scrollTop=150);const before=await scroll.evaluate(el=>el.scrollTop);
 state.turns.push(...Array.from({length:45},(_,i)=>turn(66+i)));state.version++;
 await refresh(page);await expect(panel.locator('.assistant-chat-gap')).toBeVisible();expect(Math.abs((await scroll.evaluate(el=>el.scrollTop))-before)).toBeLessThan(4);
 for(const count of [60,80,85]){await panel.getByRole('button',{name:'Carregar interações seguintes',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(count);}
 await expect(panel.locator('.assistant-chat-gap')).toHaveCount(0);await expect(panel.locator('.assistant-chat-coverage')).toContainText('85 de 110');expect(await panel.locator('[data-chat-turn]').last().getAttribute('data-chat-turn')).toBe('chat-110');expect(state.writes).toHaveLength(0);
});

test('a failed older-page query retains the confirmed messages and retries only that query',async({page})=>{
 const {state,panel,scroll}=await fixture(page);state.failOlder=true;await scroll.evaluate(el=>el.scrollTop=0);await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('consulta anterior falhou');await expect(panel.locator('[data-chat-turn]')).toHaveCount(20);
 state.failOlder=false;await panel.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(40);expect(state.queries.filter(url=>url.searchParams.get('before')==='46')).toHaveLength(2);expect(state.writes).toHaveLength(0);
});

test('a delayed feed cannot overwrite a newer completed response observed in metadata',async({page})=>{
 const {state,panel}=await fixture(page,{hold:true,count:1});await expect.poll(()=>state.queries.length).toBe(1);state.turns[0].output='Resposta nova confirmada enquanto a consulta anterior ainda estava em voo.';state.turns[0].updatedAt='2026-10-26T10:00:00.000Z';state.version++;
 await refresh(page);await expect.poll(()=>page.getByRole('combobox',{name:/Persona/}).inputValue()).toBe('bruno');await page.waitForTimeout(150);state.release();await expect(panel.locator('.assistant-chat-content')).toContainText('Resposta nova confirmada');expect(state.writes).toHaveLength(0);
});

test('an invalid chat cursor is reported and can return to the newest messages',async({page})=>{
 const {panel,state}=await fixture(page);state.queries.length=0;
 await page.goto('/assistant?system=chat-system&project=chat-project&assistant.before=invalid');await expect(panel.getByRole('alert')).toContainText('cursor da conversa é inválido');expect(state.queries).toHaveLength(0);
 await panel.getByRole('button',{name:'Voltar às mais recentes',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(20);await expect(page).not.toHaveURL(/assistant.before/);expect(state.writes).toHaveLength(0);
});

test('an empty historical slice does not pretend the existing conversation has no messages',async({page})=>{
 const {panel,state}=await fixture(page);await page.goto('/assistant?system=chat-system&project=chat-project&assistant.before=1');await expect(panel.locator('.assistant-chat-coverage')).toContainText('0 de 65');await expect(panel.getByRole('heading',{name:'O que você quer construir?',exact:true})).toHaveCount(0);
 await expect(panel.getByText('Nenhuma interação nesta posição da conversa.',{exact:false})).toBeVisible();await panel.getByRole('button',{name:'Carregar interações seguintes',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(20);expect(await panel.locator('[data-chat-turn]').first().getAttribute('data-chat-turn')).toBe('chat-1');expect(state.writes).toHaveLength(0);
});

for(const width of [1440,390]){
 test(`current interview questions remain visible beside a historical chat without opening Summary at ${width}px`,async({page})=>{
  const {state,panel,scroll}=await fixture(page);await page.setViewportSize({width,height:1000});
  state.brief={summary:'Catálogo interno.',confirmedFacts:['Persistência local no navegador.'],openQuestions:['Quais filtros o catálogo deve combinar?','Onde informar o alcance da persistência local?']};state.version++;await refresh(page);
  const questions=panel.getByRole('region',{name:'Perguntas atuais da entrevista'});await expect(questions).toContainText('Quais filtros o catálogo deve combinar?');await expect(questions).toContainText('resumo atual, independentemente das mensagens consultadas');await expect(page.getByRole('dialog',{name:'Resumo da necessidade'})).not.toBeVisible();
  await panel.getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Rascunho preservado enquanto consulto as perguntas.');await questions.getByRole('button',{name:'Responder às perguntas',exact:true}).click();await expect(panel.getByRole('textbox',{name:'Sua mensagem',exact:true})).toBeFocused();await expect(panel.getByRole('textbox',{name:'Sua mensagem',exact:true})).toHaveValue('Rascunho preservado enquanto consulto as perguntas.');
  await scroll.evaluate(el=>el.scrollTop=0);await panel.getByRole('button',{name:'Carregar interações anteriores',exact:true}).click();await expect(panel.locator('[data-chat-turn]')).toHaveCount(40);await expect(questions).toContainText('Onde informar o alcance da persistência local?');await questions.scrollIntoViewIfNeeded();
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/dev-unblocking-questions-${width}.png`});}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(state.writes).toEqual([]);
 });
 test(`invalid assistant output stays qualified and collapsed while its message can be recovered at ${width}px`,async({page})=>{
  const {state,panel,scroll}=await fixture(page,{count:1});await page.setViewportSize({width,height:1000});state.turns[0].status='failed';state.turns[0].output='{"reply":"PRIVATE_INVALID_REPLY","brief":{"openQuestions":[]}}';state.turns[0].error='O modelo não consolidou a resposta no formato esperado.';state.turns[0].updatedAt='2026-10-30T14:00:00Z';state.version++;await refresh(page);
  await expect(panel).toContainText('A resposta desta rodada não foi validada');const details=panel.locator('.assistant-chat-content details');await expect(details).not.toHaveAttribute('open','');await expect(details.locator('pre')).not.toBeVisible();
  await details.getByText('Consultar resposta não validada',{exact:true}).click();await expect(details.locator('pre')).toContainText('PRIVATE_INVALID_REPLY');await details.getByText('Consultar resposta não validada',{exact:true}).click();await panel.getByRole('button',{name:'Recuperar mensagem no rascunho',exact:true}).click();await expect(panel.getByRole('textbox',{name:'Sua mensagem',exact:true})).toHaveValue(state.turns[0].input);await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/dev-unblocking-invalid-response-${width}.png`});}
  expect(state.writes).toEqual([]);
 });
}
