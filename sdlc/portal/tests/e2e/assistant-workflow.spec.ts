import {test,expect,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {assistantContext,assistantMessagePage} from './assistant-fixtures';
import {mockPersonas} from './journey-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Assistant workflow requires isolated portal_test');
const date='2026-10-25T15:00:00Z';
const turn=(id:string,status='succeeded')=>({id,kind:'chat',input:`Pergunta ${id}`,output:status==='succeeded'?`Resposta ${id}`:null,status,error:null,actorName:'Ana',createdAt:date,model:'isolated'});
async function fixture(page:Page){
 const system={id:'workflow-system',kind:'system',key:'SYS',name:'Sistema do ensaio',status:'active',version:1,archived:false,parentId:null};
 const projects=[{id:'workflow-project',name:'Projeto do ensaio',status:'active',projectLifecycle:'active'},{id:'workflow-other',name:'Outro Projeto',status:'active',projectLifecycle:'active'}];
 await mockPersonas(page);await assistantContext(page,system,projects);
 const latest={...turn('latest'),sequence:2};
 const state={writes:[] as any[],readonly:false,paused:false,abort:false,invalid:false,session:1,latest,history:{...turn('previous'),sequence:1},queries:[] as URL[]};
 const receipts=new Map<string,any>();
 await page.route('**/api/assistant**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='GET'){
   if(url.pathname==='/api/assistant/messages')return route.fulfill({json:{contextId:url.searchParams.get('contextId'),...assistantMessagePage([state.history,state.latest],url.searchParams)}});
   state.queries.push(url);const contextId=url.searchParams.get('contextId')!,project=projects.find(p=>p.id===contextId)||projects[0],pageNo=Number(url.searchParams.get('page'))||1;
   return route.fulfill({json:{context:{...project,id:contextId,kind:'project',version:state.session,status:state.readonly?'inactive':'active',projectLifecycle:state.readonly?'inactive':'active'},session:{id:'workflow-session',version:state.session},turns:pageNo===1?[state.latest]:[state.history],latestTurn:state.latest,activeTurn:state.paused?{...turn('paused','paused')}:null,currentProposal:null,proposals:[],configured:true,model:'isolated',hasSuccessfulInterview:true,readOnly:state.readonly,readOnlyReason:state.readonly?'O Projeto está INACTIVE.':null,blockedBy:state.readonly?{id:project.id,kind:'project',name:project.name,status:'inactive'}:null,capabilities:{canMessage:!state.readonly&&!state.paused,canGeneratePlan:!state.readonly&&!state.paused,canComplete:!state.readonly&&!state.paused,canEditPlan:!state.readonly,canApplyPlan:!state.readonly,canCancelTurn:!state.readonly},brief:{summary:'Resumo registrado da necessidade.',confirmedFacts:[],openQuestions:[]},turnsPage:{page:pageNo,pageSize:20,total:45,totalPages:3,hasMore:pageNo<3},proposalsPage:{page:1,pageSize:20,total:0,totalPages:1,hasMore:false}}});
  }
  const write={path:url.pathname,key:req.headers()['idempotency-key'],persona:req.headers()['x-persona'],body:req.postDataJSON()};state.writes.push(write);
  if(receipts.has(write.key))return route.fulfill({json:receipts.get(write.key)});
  const result={turn:{...turn(`created-${state.writes.length}`,'queued'),input:write.body.message}};receipts.set(write.key,result);state.session++;
  if(state.abort){state.abort=false;return route.abort();}
  if(state.invalid){state.invalid=false;return route.fulfill({json:{}});}
  return route.fulfill({json:result});
 });
 await page.goto('/assistant?system=workflow-system&project=workflow-project');await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');
 const panel=page.getByRole('region',{name:'Entrevista e planejamento'});await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toBeEnabled();
 return {state,panel};
}

test('compact selected context keeps the composer reachable, one scroll and drafts through views, personas and contexts',async({page})=>{
 const {state,panel}=await fixture(page);const textarea=panel.getByRole('textbox',{name:'Sua mensagem'});
 const measurements:any[]=[];mkdirSync('test-results',{recursive:true});
 for(const [width,height] of [[1440,1000],[390,844],[780,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  const rect=await textarea.boundingBox();expect(rect!.y).toBeLessThan(height-60);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  measurements.push({width,height,composerY:rect!.y,contextHeight:await page.locator('.analyst-context-selected').evaluate(el=>el.getBoundingClientRect().height)});
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);await expect(panel.locator('.assistant-chat-scroll')).toBeVisible();
  await page.screenshot({path:`test-results/assistant-workflow-${width}.png`,fullPage:true});
 }
 writeFileSync('test-results/assistant-workflow-measurements.json',JSON.stringify(measurements,null,2));
 await textarea.fill('Rascunho do Arquiteto');await panel.getByRole('button',{name:'Proposta',exact:true}).focus();await page.keyboard.press('Enter');await expect(panel.locator('#assistant-panel-proposal')).toBeVisible();
 await panel.getByRole('button',{name:'Histórico de propostas',exact:true}).click();await expect(page).toHaveURL(/assistant.source=proposals/);await page.reload();await expect(panel.getByRole('region',{name:'Histórico de propostas',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Conversa',exact:true}).click();await expect(textarea).toHaveValue('Rascunho do Arquiteto');
 await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');await expect(textarea).toHaveValue('');await textarea.fill('Rascunho da PO');await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');await expect(textarea).toHaveValue('Rascunho do Arquiteto');
 await page.getByRole('button',{name:'Alterar contexto',exact:true}).click();await page.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('workflow-other');await expect(textarea).toHaveValue('');
 await page.getByRole('button',{name:'Alterar contexto',exact:true}).click();await page.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('workflow-project');await expect(textarea).toHaveValue('Rascunho do Arquiteto');expect(state.writes).toHaveLength(0);
});

test('paused current activity and latest interaction remain independent from historical pages without automatic requeue',async({page})=>{
 const {state,panel}=await fixture(page);state.paused=true;
 await page.goto('/assistant?system=workflow-system&project=workflow-project&assistant.view=history&assistant.page=2');
 await expect(panel.getByText(/PAUSED · aguardando retomada explícita/).first()).toBeVisible();await expect(panel.getByRole('link',{name:'Abrir Execução para retomar →'})).toHaveAttribute('href','/projects/workflow-project?tab=planning');
 await expect(panel.getByText('Pergunta previous',{exact:false})).toBeVisible();await expect(panel.getByRole('button',{name:'Enviar mensagem',exact:true})).toBeDisabled();expect(state.writes).toHaveLength(0);
 await panel.getByRole('button',{name:'Proposta',exact:true}).click();await expect(panel.getByRole('button',{name:'Gerar proposta para revisão',exact:true})).toBeDisabled();expect(state.writes).toHaveLength(0);
});

for(const failure of ['network','incomplete'] as const)test(`an uncertain ${failure} response survives reload, persona and inactivity and replays exactly once`,async({page})=>{
 const {state,panel}=await fixture(page);state.abort=failure==='network';state.invalid=failure==='incomplete';
 await panel.getByRole('textbox',{name:'Sua mensagem'}).fill('Mensagem a reconciliar');await panel.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(panel.getByRole('button',{name:'Confirmar envio',exact:true})).toBeEnabled();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');await expect(panel.getByRole('button',{name:'Confirmar envio',exact:true})).toBeDisabled();state.readonly=true;await page.reload();await expect(panel.getByText(/Projeto está INACTIVE/).first()).toBeVisible();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');await panel.getByRole('button',{name:'Confirmar envio',exact:true}).click();await expect(panel.getByRole('button',{name:'Confirmar envio',exact:true})).toHaveCount(0);
 expect(state.writes).toHaveLength(2);expect(state.writes[1]).toEqual(state.writes[0]);expect(state.writes[0].body).toMatchObject({expectedVersion:1,message:'Mensagem a reconciliar',requirementsMode:true});
 await expect(panel.getByRole('textbox',{name:'Sua mensagem'})).toHaveValue('');await expect(panel.getByRole('button',{name:'Enviar mensagem',exact:true})).toBeDisabled();
});
