import { test, expect } from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {uiJourney,uiAction,openWorkPanel,mockTaskCollection} from './journey-fixtures';
test.beforeEach(async({page})=>mockTaskCollection(page,()=>[]));

if (!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')) throw Error('Validation retry fixtures require the isolated test environment');

test('legacy validation failure resumes technical correction without repeating user choices or G1', async ({ page, request }) => {
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const now = new Date().toISOString();
  const item = { id: 'validation-retry-ui', kind: 'story', key: 'UI-VR1', name: 'Correção técnica exclusiva do teste', description: '', status: 'coding', version: 7, archived: false, parentId: 'ui-epic', data: { acceptanceCriteria: ['Preservar o comportamento escolhido.'] }, createdAt: now, updatedAt: now };
  const specification = { requirements: 'Manter a escolha confirmada pelo usuário.', architecture: 'Usar a abordagem aprovada no G1.', testCases: [{ criterionIndex: 0, description: 'Conferir o comportamento já aprovado.' }], risks: [] };
  const discussion = { version: 4, messages: [{ id: 'chosen-option', role: 'user', content: 'Mantenha a alternativa que escolhi e as autorizações existentes.', state: 'succeeded', createdAt: now }], proposal: null, allowDependencies: true };
  let run: any = { id: 'validation-run-ui', state: 'waiting_input', stage: 'generation', error: 'Patch contém caminho não permitido ou duplicado.', technicalRetryAvailable: true, validationIssues: [{ path: 'src/application.config.ts', code: 'PATCH_CONTAINS_PATH', message: 'Caminho rejeitado pela validação anterior.' }], discussionVersion: 4, specification, branch: null, commitSha: null, mergeRequestUrl: null, createdAt: now, updatedAt: now };
  const writes: string[] = [];
  let key = '';
  await page.route(url => url.pathname === '/api/items/validation-retry-ui', route => route.fulfill({ json: { item, ancestors: [], children: [], repositories: [], availableRepositories: [],environments: [], history: [] } }));
  await page.route('**/api/items/validation-retry-ui/execution', route => route.fulfill({ json: { run, configured: true } }));
  await page.route('**/api/items/validation-retry-ui/journey',route=>route.fulfill({json:uiJourney(item,run,{current:{kind:'coding',state:run.state,title:run.state==='queued'?'Solicitação recebida; aguardando processamento':'Correção técnica necessária',message:run.error},nextAction:run.state==='waiting_input'?uiAction('retry','Retomar correção técnica','/api/executions/validation-run-ui/retry'):null,chat:{mode:'execution',executionId:run.id,enabled:run.state==='waiting_input',guidance:'O diagnóstico da validação foi preservado; retome a correção técnica sem repetir suas decisões.'},events:run.validationIssues.map((issue:any,index:number)=>({id:'validation-'+index,timestamp:now,message:`${issue.path}: ${issue.message}`}))})}));
  await page.route('**/api/executions/validation-run-ui/*', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'GET' && path.endsWith('/discussion')) return route.fulfill({ json: discussion });
    writes.push(path);
    expect(path).toBe('/api/executions/validation-run-ui/retry');
    expect(req.method()).toBe('POST');
    expect(req.headers()['x-persona']).toBe('admin');
    expect(req.postDataJSON()).toEqual({});
    if (!key) {
      key = req.headers()['idempotency-key']; expect(key).toBeTruthy();
      run = { ...run, state: 'queued', stage: 'generation', error: null, technicalRetryAvailable: false, validationIssues: [] };
      return route.abort();
    }
    expect(req.headers()['idempotency-key']).toBe(key);
    return route.fulfill({ json: { run } });
  });
  await page.goto('/stories/validation-retry-ui');
  const panel=await openWorkPanel(page);
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('carla');
  await expect(panel.getByRole('button', { name: 'Retomar correção técnica' })).toBeDisabled();
  await page.getByRole('navigation',{name:'Detalhes da execução'}).getByRole('button',{name:'Consultar sinais e evidências',exact:true}).click();
  await expect(panel.locator('.sw-events').getByText(/src.application.config.ts: Caminho rejeitado/)).toBeVisible();
  await page.getByRole('combobox', { name: /Persona/ }).selectOption('admin');
  await panel.getByRole('button',{name:'← Voltar à etapa atual',exact:true}).click();
  await panel.getByRole('button', { name: 'Retomar correção técnica' }).click();
  await expect(page.getByTestId('story-journey-header')).toContainText('Na fila',{timeout:10000});
  await panel.getByRole('button', { name: 'Verificar a mesma solicitação' }).click();
  expect(writes).toEqual(['/api/executions/validation-run-ui/retry', '/api/executions/validation-run-ui/retry']);
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Especificação',exact:true}).click();
  await page.getByText('Consultar plano técnico registrado na execução',{exact:true}).click();
  await expect(page.getByText('Manter a escolha confirmada pelo usuário.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Aprovar G1 e gerar código' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Verificar a mesma solicitação' })).toHaveCount(0);
  expect(item.version).toBe(7);
  expect(discussion.allowDependencies).toBe(true);
  expect(discussion.version).toBe(4);
  expect(discussion.messages).toHaveLength(1);
});

for(const width of [1440,390])test(`quality repair exhaustion replaces retry with the diagnostic conversation without resending correction at ${width}px`,async({page})=>{
 const now='2026-10-30T16:00:00.000Z',id='quality-diagnosis-ui',runId='quality-diagnosis-run';
 const item={id,kind:'story',key:'UI-DIAG1',name:'Diagnóstico da correção pela interface',description:'Catálogo de joias com escopo preservado.',status:'coding',version:7,archived:false,parentId:'ui-epic',data:{acceptanceCriteria:['Preservar a validação do catálogo.']},createdAt:now,updatedAt:now};
 const state={needsDiagnosis:false,writes:[] as string[]};
 const run=()=>({id:runId,state:'waiting_input',stage:'generation',error:state.needsDiagnosis?'As tentativas de correção não resolveram a validação. Revise o diagnóstico e a estratégia antes de outra execução.':'A validação técnica precisa de correção.',technicalRetryAvailable:!state.needsDiagnosis,discussionVersion:4,specification:{requirements:'Preservar a validação do catálogo.',architecture:'Manter a solução aprovada.',testCases:[{criterionIndex:0,description:'Conferir validação aprovada.'}],risks:[]},validationIssues:[{path:'src/App.jsx',code:'PATCH_CHECK_FAILED',message:'A correção exige outra estratégia.'}],branch:null,commitSha:null,mergeRequestUrl:null,createdAt:now,updatedAt:now});
 await page.route(url=>url.pathname===`/api/items/${id}`,route=>route.fulfill({json:{item,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
 await page.route(`**/api/items/${id}/execution`,route=>route.fulfill({json:{run:run(),configured:true}}));
 await page.route(`**/api/items/${id}/journey`,route=>route.fulfill({json:uiJourney(item,run(),{current:{kind:'coding',state:'waiting_input',title:state.needsDiagnosis?'Revise o diagnóstico antes de outra correção':'Correção técnica necessária',message:run().error},nextAction:state.needsDiagnosis?{id:'respond_blocker',kind:'respond_blocker',label:'Responder impedimento',href:`/stories/${id}?interact=conversation`,enabled:true}:uiAction('retry','Retomar correção técnica',`/api/executions/${runId}/retry`),chat:{mode:'execution',executionId:runId,enabled:true,guidance:'Revise o diagnóstico e prepare uma decisão para a nova especificação; outro Gateway de Especificação será necessário.'}})}));
 await page.route(`**/api/executions/${runId}/*`,route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()==='GET'&&path.endsWith('/discussion'))return route.fulfill({json:{version:4,messages:[{id:'recorded-diagnosis',role:'assistant',content:'Três correções foram registradas sem resolver a validação. O diagnóstico anterior permanece preservado.',state:'succeeded',createdAt:now}],proposal:null,allowDependencies:false}});state.writes.push(req.method()+' '+path);return route.fulfill({status:409,json:{error:{message:'Este cenário consulta o diagnóstico; nenhuma execução deve ser reenviada.'}}});});
 await page.setViewportSize({width,height:1000});await page.goto(`/stories/${id}?tab=planning&process=action&tasks.q=preservar`);await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');const panel=await openWorkPanel(page);
 await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toBeEnabled();state.needsDiagnosis=true;
 const respond=panel.getByRole('button',{name:'Responder impedimento',exact:true});await expect(respond).toBeVisible({timeout:10000});await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toHaveCount(0);await expect(panel).toContainText('Revise o diagnóstico e a estratégia');
 if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/quality-diagnosis-next-action-${width}.png`,fullPage:true});}
 await respond.click();const conversation=page.getByRole('region',{name:'Conversa sobre impedimento',exact:true});await expect(conversation).toBeVisible();await expect(conversation).toContainText('Três correções foram registradas');await expect(conversation).toContainText('novo Gateway de Especificação');await expect(page).toHaveURL(/process=conversation/);expect(new URL(page.url()).searchParams.get('tasks.q')).toBe('preservar');expect(state.writes).toEqual([]);
 await panel.getByRole('button',{name:'← Voltar à etapa atual',exact:true}).click();await expect(respond).toBeVisible();await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);expect(item.version).toBe(7);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const width of [1440,390])test(`technical failure summary keeps complete details collapsed and does not attribute stale validation issues at ${width}px`,async({page})=>{
 const now='2026-10-30T17:00:00.000Z',id='technical-summary-ui',taskId='technical-summary-task',runId='technical-summary-run';
 const story={id,kind:'story',key:'UI-TECH1',name:'Correção técnica com relato extenso',description:'Critérios do catálogo preservados.',status:'coding',version:7,archived:false,parentId:'ui-epic',data:{acceptanceCriteria:['Preservar o catálogo aprovado.']},createdAt:now,updatedAt:now};
 const task={...story,id:taskId,kind:'task',key:'UI-TECH1-T1',name:'Codificação com diagnóstico preservado',status:'doing',version:3,parentId:id,data:{workProcess:true,pipelineStage:'coding'},activityKind:'coding',processOwned:true,managed:true,operationalState:'failed'};
 const issues=Array.from({length:27},(_,index)=>({path:'src/App.jsx',code:'SYNTAX_ERROR',message:`Linha ${67+index}: erro de sintaxe ${index+1}; preservar evidência ${index+1}.`}));
 const original='Limite de duas correções técnicas atingido. '+issues.map(issue=>`${issue.path}: ${issue.message}`).join('; ');
 const state={error:original as string|null,runState:'failed',writes:[] as string[]};
 const run=()=>({id:runId,state:state.runState,stage:'generation',error:state.error,technicalRetryAvailable:state.runState==='failed',validationIssues:issues,discussionVersion:4,specification:null,branch:null,commitSha:null,mergeRequestUrl:null,createdAt:now,updatedAt:now});
 await mockTaskCollection(page,()=>[task]);
 for(const selected of [story,task]){
  await page.route(url=>url.pathname===`/api/items/${selected.id}`,route=>route.fulfill({json:{item:selected,ancestors:selected.kind==='task'?[story]:[],children:selected.kind==='story'?[task]:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route(`**/api/items/${selected.id}/execution`,route=>route.fulfill({json:{run:run(),configured:true}}));
  await page.route(`**/api/items/${selected.id}/journey`,route=>route.fulfill({json:uiJourney(story,run(),{selectedItem:selected,tasks:[task],current:{kind:'coding',state:state.runState,title:'A atividade precisa da sua orientação',message:state.error||'Solicitação recebida; aguardando processamento.',taskId},nextAction:state.runState==='failed'?uiAction('retry','Retomar correção técnica',`/api/executions/${runId}/retry`):null,chat:{mode:'execution',executionId:runId,enabled:state.runState==='failed',guidance:state.error||''}})}));
 }
 await page.route(`**/api/executions/${runId}/*`,route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()==='GET'&&path.endsWith('/discussion'))return route.fulfill({json:{version:4,messages:[],proposal:null,allowDependencies:false}});state.writes.push(req.method()+' '+path);expect(req.method()).toBe('POST');expect(path).toBe(`/api/executions/${runId}/retry`);state.runState='queued';state.error=null;return route.fulfill({json:{run:run()}});});
 await page.setViewportSize({width,height:1000});await page.goto(`/stories/${id}?tab=planning&process=action`);await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');let panel=await openWorkPanel(page);
 for(const surface of ['story','task']){
  if(surface==='task'){await page.goto(`/tasks/${taskId}?tab=planning&process=action`);panel=await openWorkPanel(page);}
  const summary=panel.getByTestId('activity-message-summary'),details=panel.getByTestId('activity-message-details'),button=panel.getByRole('button',{name:'Retomar correção técnica',exact:true});
  await expect(summary).toContainText('A proposta de correção gerada pelo agente não passou na validação técnica');await expect(summary).toContainText('27 apontamentos técnicos registrados');await expect(details).not.toHaveAttribute('open','');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).not.toBeVisible();await expect(button).toBeEnabled();
  expect(await button.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="activity-message-details"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await details.getByText('Consultar diagnóstico técnico completo',{exact:true}).focus();await page.keyboard.press('Enter');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).toHaveText(original);await expect(details.getByRole('list',{name:'Apontamentos da validação técnica'}).getByRole('listitem')).toHaveCount(27);await expect(details).toContainText(issues[26].message);await details.getByText('Consultar diagnóstico técnico completo',{exact:true}).click();await expect(details.getByLabel('Relato integral da atividade',{exact:true})).not.toBeVisible();expect(state.writes).toEqual([]);
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/technical-summary-${surface}-${width}.png`,fullPage:true});}
 }
 // The old 27 validation issues remain in the API snapshot, but the current
 // timeout is a different failure and must not be described as validation.
 state.error='O executor não respondeu no prazo. '+Array.from({length:50},(_,index)=>`Registro de transporte ${index+1}.`).join(' ');
 let summary=panel.getByTestId('activity-message-summary'),details=panel.getByTestId('activity-message-details');await expect(summary).toContainText('Não foi possível concluir esta etapa');await expect(summary).not.toContainText('27 apontamentos');await expect(summary).not.toContainText('não passou na validação');await details.getByText('Consultar relato completo do impedimento',{exact:true}).click();await expect(details.getByLabel('Relato integral da atividade',{exact:true})).toHaveText(state.error);await expect(details.getByRole('list',{name:'Apontamentos da validação técnica'})).toHaveCount(0);expect(state.writes).toEqual([]);
 state.error='A integração está indisponível; confira a conexão configurada.';await expect(panel).toContainText(state.error);await expect(panel.getByTestId('activity-message-summary')).toHaveCount(0);await expect(panel.getByTestId('activity-message-details')).toHaveCount(0);await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toBeEnabled();expect(state.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.getByRole('button',{name:'Retomar correção técnica',exact:true}).click();const receipt=panel.getByTestId('story-command-receipt');await expect(receipt).toContainText('Solicitação recebida. Confira o resultado na situação atual');await expect(receipt).not.toHaveClass(/success/);await expect(page.getByTestId('story-journey-header')).toContainText('Na fila');state.runState='failed';state.error=original;await expect(receipt).toContainText('A tentativa atual encontrou um impedimento',{timeout:10000});await expect(receipt).not.toHaveClass(/success/);await expect(panel).not.toContainText('A situação será atualizada com o resultado observado');await expect(panel.getByTestId('activity-message-summary')).toContainText('27 apontamentos técnicos registrados');await expect(panel.getByTestId('activity-message-details')).not.toHaveAttribute('open','');expect(state.writes).toEqual([`POST /api/executions/${runId}/retry`]);
});

for(const width of [1440,390])test(`assisted candidate validation keeps short escaped diagnostics behind the projected technical retry at ${width}px`,async({page})=>{
 const now='2026-10-30T21:00:00.000Z',id='assisted-candidate-ui',taskId='assisted-candidate-task',runId='assisted-candidate-run';
 const story={id,kind:'story',key:'UI-CAND1',name:'Construção assistida com diagnóstico técnico',description:'Escopo aprovado preservado.',status:'coding',version:7,archived:false,parentId:'ui-epic',data:{acceptanceCriteria:['Preservar o comportamento aprovado.']},createdAt:now,updatedAt:now};
 const task={...story,id:taskId,kind:'task',key:'UI-CAND1-T1',name:'Codificação da candidata assistida',status:'doing',version:3,parentId:id,data:{workProcess:true,pipelineStage:'coding'},activityKind:'coding',processOwned:true,managed:true,operationalState:'failed'};
 const issues=[{path:'scripts/build.mjs',message:'Top-level await is currently not supported with the "cjs" output format'},{path:'scripts/test.mjs',message:'Top-level await is currently not supported with the "cjs" output format'}];
 const original='A construção assistida não produziu uma candidata válida. Diagnóstico técnico: Candidata inválida: '+JSON.stringify(issues);expect(original.length).toBeLessThan(600);
 const state={error:original,stage:'generation',writes:[] as string[]};
 const run=()=>({id:runId,state:'failed',stage:state.stage,error:state.error,technicalRetryAvailable:true,validationIssues:[{path:'src/previous.jsx',code:'SYNTAX_ERROR',message:'Apontamento de uma tentativa anterior.'}],discussionVersion:4,specification:null,branch:null,commitSha:null,mergeRequestUrl:null,createdAt:now,updatedAt:now});
 await mockTaskCollection(page,()=>[task]);
 for(const selected of [story,task]){
  await page.route(url=>url.pathname===`/api/items/${selected.id}`,route=>route.fulfill({json:{item:selected,ancestors:selected.kind==='task'?[story]:[],children:selected.kind==='story'?[task]:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route(`**/api/items/${selected.id}/execution`,route=>route.fulfill({json:{run:run(),configured:true}}));
  await page.route(`**/api/items/${selected.id}/journey`,route=>route.fulfill({json:uiJourney(story,run(),{selectedItem:selected,tasks:[task],current:{kind:'coding',state:'failed',title:'A atividade precisa da sua orientação',message:state.error,taskId},nextAction:uiAction('retry','Retomar correção técnica',`/api/executions/${runId}/retry`),chat:{mode:'execution',executionId:runId,enabled:true,guidance:state.error}})}));
 }
 await page.route(`**/api/executions/${runId}/*`,route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()==='GET'&&path.endsWith('/discussion'))return route.fulfill({json:{version:4,messages:[],proposal:null,allowDependencies:false}});state.writes.push(req.method()+' '+path);return route.fulfill({status:409,json:{error:{message:'Consultar o diagnóstico não pode retomar a execução.'}}});});
 await page.setViewportSize({width,height:1000});await page.goto(`/stories/${id}?tab=planning&process=action`);await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');let panel=await openWorkPanel(page);
 for(const surface of ['story','task']){
  if(surface==='task'){await page.goto(`/tasks/${taskId}?tab=planning&process=action`);panel=await openWorkPanel(page);}
  const summary=panel.getByTestId('activity-message-summary'),details=panel.getByTestId('activity-message-details'),button=panel.getByRole('button',{name:'Retomar correção técnica',exact:true});
  await expect(summary).toContainText('A construção assistida encontrou um impedimento técnico ao validar a candidata de código');await expect(summary).not.toContainText('Top-level await');await expect(summary).not.toContainText('Limite de correções');await expect(details).not.toHaveAttribute('open','');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).not.toBeVisible();await expect(button).toBeEnabled();expect(await button.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="activity-message-details"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/assisted-candidate-${surface}-${width}.png`,fullPage:true});}
  await details.getByText('Consultar diagnóstico técnico completo',{exact:true}).focus();await page.keyboard.press('Enter');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).toHaveText(original);await expect(details).toContainText('scripts/test.mjs');await expect(details.getByRole('list',{name:'Apontamentos da validação técnica'})).toHaveCount(0);await expect(details).not.toContainText('src/previous.jsx');await details.getByText('Consultar diagnóstico técnico completo',{exact:true}).click();expect(state.writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 state.error='A ferramenta não respondeu: '+JSON.stringify({path:'scripts/build.mjs',message:'Falha de transporte sem classificação técnica conhecida.'});await expect(panel).toContainText(state.error);await expect(panel.getByTestId('activity-message-summary')).toHaveCount(0);await expect(panel.getByTestId('activity-message-details')).toHaveCount(0);
 state.error=original;state.stage='publishing';await expect(panel).toContainText(original);await expect(panel.getByTestId('activity-message-summary')).toHaveCount(0);state.stage='generation';await expect(panel.getByTestId('activity-message-summary')).toContainText('A construção assistida encontrou um impedimento técnico');await expect(panel.getByTestId('activity-message-details')).not.toHaveAttribute('open','');expect(state.writes).toEqual([]);expect(story.version).toBe(7);
});

for(const width of [1440,390])test(`Qwen executor limit keeps technical retry primary, preserves its CLI receipt and leaves business blockers separate at ${width}px`,async({page})=>{
 const now='2026-10-30T22:00:00.000Z',id='qwen-limit-ui',taskId='qwen-limit-task',runId='qwen-limit-run';
 const story={id,kind:'story',key:'UI-QL1',name:'Retomada técnica do executor Qwen',description:'Escopo confirmado preservado.',status:'coding',version:7,archived:false,parentId:'ui-epic',data:{acceptanceCriteria:['Preservar o comportamento confirmado.']},createdAt:now,updatedAt:now};
 const task={...story,id:taskId,kind:'task',key:'UI-QL1-T1',name:'Codificação interrompida por limite técnico',status:'doing',version:3,parentId:id,data:{workProcess:true,pipelineStage:'coding'},activityKind:'coding',processOwned:true,managed:true,operationalState:'failed'};
 const projectedSummary='O agente não concluiu esta tentativa. Esta tentativa não publicou alterações. Retome a correção técnica com o mesmo escopo.';
 const cliError='O executor Qwen não concluiu a construção assistida. Diagnóstico técnico: Maximum number of agent turns (30) exceeded. Candidate validation was not completed. [CODING_EXECUTOR_FAILED]';
 const businessQuestion='Qual regra de negócio deve ser usada para ordenar os resultados?';
 const state={phase:'technical' as 'technical'|'queued'|'business',writes:[] as {path:string;key:string;persona:string;body:unknown}[]};
 const run=()=>({id:runId,state:state.phase==='technical'?'failed':state.phase==='business'?'waiting_input':'queued',stage:'generation',error:state.phase==='technical'?cliError:state.phase==='business'?businessQuestion:null,technicalRetryAvailable:state.phase==='technical',validationIssues:[{path:'src/previous.jsx',code:'SYNTAX_ERROR',message:'Apontamento histórico de outra tentativa.'}],discussionVersion:4,specification:{requirements:'Preservar o comportamento confirmado.',architecture:'Manter a solução aprovada.',testCases:[{criterionIndex:0,description:'Conferir o comportamento aprovado.'}],risks:[]},branch:null,commitSha:null,mergeRequestUrl:null,createdAt:now,updatedAt:now});
 await mockTaskCollection(page,()=>[task]);
 for(const selected of [story,task]){
  await page.route(url=>url.pathname===`/api/items/${selected.id}`,route=>route.fulfill({json:{item:selected,ancestors:selected.kind==='task'?[story]:[],children:selected.kind==='story'?[task]:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route(`**/api/items/${selected.id}/execution`,route=>route.fulfill({json:{run:run(),configured:true}}));
  await page.route(`**/api/items/${selected.id}/journey`,route=>route.fulfill({json:uiJourney(story,run(),{selectedItem:selected,tasks:[task],current:{kind:'coding',state:run().state,title:state.phase==='technical'?'O agente precisa retomar a implementação':state.phase==='business'?'A atividade precisa da sua orientação':'Solicitação recebida; aguardando processamento',message:state.phase==='technical'?projectedSummary:state.phase==='business'?businessQuestion:'Na fila; aguardando processamento.',taskId},nextAction:state.phase==='technical'?uiAction('retry','Retomar correção técnica',`/api/executions/${runId}/retry`):state.phase==='business'?{id:'respond_blocker',kind:'respond_blocker',label:'Responder impedimento',href:`/stories/${id}?interact=conversation`,enabled:true}:null,chat:{mode:'execution',executionId:runId,enabled:state.phase!=='queued',guidance:state.phase==='business'?businessQuestion:projectedSummary}})}));
 }
 await page.route(`**/api/executions/${runId}/*`,route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()==='GET'&&path.endsWith('/discussion'))return route.fulfill({json:{version:4,messages:[],proposal:null,allowDependencies:false}});expect(req.method()).toBe('POST');expect(path).toBe(`/api/executions/${runId}/retry`);state.writes.push({path,key:req.headers()['idempotency-key'],persona:req.headers()['x-persona'],body:req.postDataJSON()});state.phase='queued';return state.writes.length===1?route.abort():route.fulfill({json:{run:run()}});});
 await page.setViewportSize({width,height:1000});await page.goto(`/stories/${id}?tab=planning&process=action`);await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');let panel=await openWorkPanel(page);
 for(const surface of ['story','task']){
  if(surface==='task'){await page.goto(`/tasks/${taskId}?tab=planning&process=action`);panel=await openWorkPanel(page);}
  const summary=panel.getByTestId('activity-message-summary'),details=panel.getByTestId('activity-message-details'),retry=panel.getByRole('button',{name:'Retomar correção técnica',exact:true});await expect(summary).toHaveText(projectedSummary);await expect(summary).not.toContainText('Maximum number');await expect(retry).toBeEnabled();await expect(retry).toHaveClass(/primary/);await expect(panel.getByRole('button',{name:'Responder impedimento',exact:true})).toHaveCount(0);await expect(details).not.toHaveAttribute('open','');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).not.toBeVisible();expect(await retry.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('[data-testid="activity-message-details"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  if(process.env.SCREENSHOT_DIR){mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/qwen-limit-${surface}-${width}.png`,fullPage:true});}
  await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details.getByLabel('Relato integral da atividade',{exact:true})).toHaveText(cliError);await expect(details.getByRole('list',{name:'Apontamentos da validação técnica'})).toHaveCount(0);await expect(details).not.toContainText('src/previous.jsx');await details.locator('summary').click();expect(state.writes).toEqual([]);
 }
 await panel.getByRole('button',{name:'Retomar correção técnica',exact:true}).click();await expect(panel.getByRole('button',{name:'Verificar a mesma solicitação',exact:true})).toBeEnabled();await expect(page.getByTestId('story-journey-header')).toContainText('Na fila',{timeout:10000});await panel.getByRole('button',{name:'Verificar a mesma solicitação',exact:true}).click();await expect(panel.getByRole('button',{name:'Verificar a mesma solicitação',exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(2);expect(state.writes[0].key).toBeTruthy();expect(state.writes[1]).toEqual(state.writes[0]);expect(state.writes[0]).toMatchObject({path:`/api/executions/${runId}/retry`,persona:'ana',body:{}});
 state.phase='business';const respond=panel.getByRole('button',{name:'Responder impedimento',exact:true});await expect(respond).toBeVisible({timeout:10000});await expect(respond).toHaveClass(/primary/);await expect(panel).toContainText(businessQuestion);await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toHaveCount(0);await expect(panel.getByTestId('activity-message-details')).toHaveCount(0);state.phase='technical';await expect(panel.getByRole('button',{name:'Retomar correção técnica',exact:true})).toBeVisible({timeout:10000});await expect(panel.getByTestId('activity-message-summary')).toHaveText(projectedSummary);await expect(panel.getByTestId('activity-message-details')).not.toHaveAttribute('open','');expect(state.writes).toHaveLength(2);expect(story.version).toBe(7);expect(task.version).toBe(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
