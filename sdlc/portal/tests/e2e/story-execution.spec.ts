import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {uiJourney,uiAction,openWorkPanel,mockTaskCollection} from './journey-fixtures';
test.beforeEach(async({page})=>mockTaskCollection(page,()=>[]));
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Story execution fixtures require the isolated test environment');

test('story execution prepares specification, requires G1, recovers uncertain requests and links the MR',async({page,request})=>{
 expect((await(await request.get('/api/health')).json()).databaseMode).toBe('test');
 const now=new Date().toISOString(),item={id:'execution-ui-only',kind:'story',key:'UI-ST1',name:'História exclusiva do teste de execução',description:'Fixture somente no navegador.',status:'specification',version:1,archived:false,parentId:'epic-ui-only',data:{acceptanceCriteria:['A pessoa consulta o resultado solicitado.']},createdAt:now,updatedAt:now};
 const specification={requirements:'Implementar a consulta descrita no critério de aceite.',architecture:'Usar o repositório selecionado e preservar os contratos existentes.',testCases:[{criterionIndex:0,description:'Consultar e conferir o resultado solicitado.'}],risks:['Conferir o contrato com o serviço externo.']};
 let run:any=null,preparationKey='',resumeKey='',preparationRequests=0,resumeRequests=0;
 const runPath='/api/executions/execution-run-ui';
 let view:any={current:{kind:'specification',state:'not_started',title:'A execução ainda não começou'},nextAction:uiAction('prepare','Preparar especificação','/api/items/execution-ui-only/execution',{expectedVersion:1})};
 await page.route(url=>url.pathname==='/api/items/execution-ui-only',r=>r.fulfill({json:{item,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
 await page.route('**/api/items/execution-ui-only/journey',r=>r.fulfill({json:uiJourney(item,run,view)}));
 await page.route(url=>url.pathname==='/api/items/execution-ui-only/specification',r=>r.fulfill({json:{story:{id:item.id,version:item.version},content:{requirements:{version:1,objective:'Disponibilizar a consulta solicitada.',behavior:'Receber uma entrada válida e apresentar o resultado.',functionalCriteria:item.data.acceptanceCriteria},technical:specification},revision:null,draft:null,readOnly:false,history:{items:[],page:1,pageSize:20,total:0,asOf:now}}}));
 await page.route('**/api/items/execution-ui-only/release',r=>r.fulfill({json:{story:{...item,projectId:'project-ui-only',projectName:'Projeto da fixture',epicId:'epic-ui-only',epicName:'Épico da fixture'},assignment:null,system:{id:'system-ui-only',name:'Sistema da fixture'},releases:[],truncated:false,totalChoices:0}}));
 await page.route('**/api/items/execution-ui-only/execution',async route=>{
  const req=route.request();if(req.method()==='GET')return route.fulfill({json:{run,configured:true}});
  expect(req.headers()['x-persona']).toBe('admin');expect(req.postDataJSON()).toEqual({expectedVersion:1});preparationRequests++;
  if(!preparationKey){preparationKey=req.headers()['idempotency-key'];expect(preparationKey).toBeTruthy();run={id:'execution-run-ui',state:'queued',stage:'specification',createdAt:now,updatedAt:now};view={current:{kind:'specification',state:'queued',title:'Solicitação recebida; aguardando processamento'}};return route.abort();}
  expect(req.headers()['idempotency-key']).toBe(preparationKey);run={...run,state:'waiting_approval',stage:'gate',specification};
  view={current:{kind:'specification',state:'waiting_approval',title:'Especificação pronta; G1 aguarda sua decisão'},nextAction:uiAction('approve','Aprovar G1 e gerar código',`${runPath}/approve`,{expectedVersion:item.version},{title:'Aprovar especificação G1',description:'Revise a especificação antes de gerar código.',checkboxLabel:'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.'})};return route.fulfill({json:{run}});
 });
 await page.route('**/api/executions/execution-run-ui/*',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;if(req.method()==='GET')return route.fulfill({json:{run,configured:true}});
  expect(req.headers()['x-persona']).toBe('admin');
  if(path.endsWith('/approve')){expect(req.postDataJSON()).toEqual({expectedVersion:item.version});item.status='coding';item.version++;run={...run,state:'failed',stage:'generation',error:'Falha transitória exclusiva da fixture.'};view={current:{kind:'coding',state:'failed',title:'A atividade encontrou um impedimento',message:run.error},nextAction:uiAction('retry','Retomar execução',`${runPath}/retry`),secondaryActions:[uiAction('cancel','Cancelar execução',`${runPath}/cancel`)]};return route.fulfill({json:{run}});}
  expect(path.endsWith('/retry')).toBe(true);expect(req.postDataJSON()).toEqual({});resumeRequests++;
  if(!resumeKey){resumeKey=req.headers()['idempotency-key'];return route.abort();}
  expect(req.headers()['idempotency-key']).toBe(resumeKey);item.status='code_review';item.version++;run={...run,state:'succeeded',stage:'completed',error:null,branch:'sdlc/ui-story-execution',commitSha:'c'.repeat(40),mergeRequestUrl:'http://127.0.0.1:3180/test-only/product/-/merge_requests/7'};view={current:{kind:'code_review',state:'not_started',title:'Code Review precisa ser iniciado'}};return route.fulfill({json:{run}});
 });
 await page.goto('/stories/execution-ui-only');await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
 const panel=await openWorkPanel(page);await expect(panel.getByRole('button',{name:'Preparar especificação',exact:true})).toBeDisabled();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');await panel.getByRole('button',{name:'Preparar especificação',exact:true}).click();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');await expect(panel.getByRole('button',{name:'Verificar a mesma solicitação'})).toBeDisabled();
 await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');await panel.getByRole('button',{name:'Verificar a mesma solicitação'}).click();expect(preparationRequests).toBe(2);
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Especificação',exact:true}).click();const currentSpecification=page.getByRole('region',{name:'Especificação da História',exact:true});await expect(currentSpecification).toBeVisible();await expect(currentSpecification.getByRole('region',{name:'Plano técnico consultado',exact:true}).getByText('Critério 1:',{exact:true})).toBeVisible();
 await openWorkPanel(page);
 await panel.getByRole('button',{name:'Revisar aprovação',exact:true}).click();await expect(panel.getByRole('button',{name:'Aprovar e enfileirar codificação',exact:true})).toBeDisabled();
 await expect(panel.getByRole('region',{name:'Confirmar decisão da etapa',exact:true})).toBeFocused();
 await expect(page.getByTestId('story-journey-header')).toBeVisible();mkdirSync(process.env.SCREENSHOT_DIR||'/output',{recursive:true});
 for(const width of[1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'/output'}/story-execution-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 await panel.getByRole('checkbox',{name:/Revisei a especificação/}).check();await panel.getByRole('button',{name:'Aprovar e enfileirar codificação',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Retomar execução',exact:true})).toBeEnabled();await panel.getByText('Alternativas e controle da atividade',{exact:true}).click();await expect(panel.getByRole('button',{name:'Cancelar execução',exact:true})).toBeEnabled();
 await panel.getByRole('button',{name:'Retomar execução',exact:true}).click();await panel.getByRole('button',{name:'Verificar a mesma solicitação'}).click();expect(resumeRequests).toBe(2);
 await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true}).click();await page.getByRole('navigation',{name:'Detalhes da execução',exact:true}).getByRole('button',{name:'Entrega de código e release',exact:true}).click();await expect(page.getByRole('link',{name:'Abrir Merge Request no GitLab',exact:true})).toHaveAttribute('href',run.mergeRequestUrl);await expect(page.getByText('sdlc/ui-story-execution',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Preparar nova execução'})).toHaveCount(0);
});

test('processing visibility preserves the confirmed execution during a lost update and recovers without resending',async({page,request})=>{
 expect((await(await request.get('/api/health')).json()).databaseMode).toBe('test');
 const now=new Date().toISOString(),item={id:'processing-ui-only',kind:'story',key:'UI-PR1',name:'Acompanhamento exclusivo do teste',description:'',status:'coding',version:3,archived:false,parentId:'epic-ui-only',data:{},createdAt:now,updatedAt:now},run={id:'processing-run-ui',state:'running',stage:'generation',createdAt:now,updatedAt:now};let disconnected=false,writes=0;
 await page.route(url=>url.pathname==='/api/items/processing-ui-only',r=>r.fulfill({json:{item,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
 await page.route('**/api/items/processing-ui-only/execution',r=>{if(r.request().method()!=='GET')writes++;return r.fulfill({json:{run,configured:true}});});
 await page.route('**/api/items/processing-ui-only/journey',r=>disconnected?r.fulfill({status:503,json:{error:{message:'Conexão temporariamente indisponível no teste.'}}}):r.fulfill({json:uiJourney(item,run,{current:{kind:'coding',state:'running',title:'Aguardando resposta do modelo'},signals:{lastHeartbeatAt:now,lastEventAt:now,provider:'local-llm',stage:'generation',heartbeatStaleAfterMs:45000},events:[{id:'generation',timestamp:now,message:'Proposta de código enviada ao modelo; aguardando resposta.'}]})}));
 await page.goto('/stories/processing-ui-only');const panel=await openWorkPanel(page),header=page.getByTestId('story-journey-header');await page.getByRole('navigation',{name:'Detalhes da execução',exact:true}).getByRole('button',{name:'Consultar sinais e evidências',exact:true}).click();
 const monitor=panel.getByTestId('processing-signals');await expect(header.getByRole('status')).toHaveText('Em processamento');await expect(monitor).toContainText('Confirmada em');await expect(monitor).toContainText('Último sinal');await expect(monitor).toContainText('Proposta de código enviada ao modelo');
 disconnected=true;await expect(page.getByText('A atualização da situação não chegou.',{exact:true})).toBeVisible({timeout:10000});await expect(header.getByRole('status')).toHaveText('Situação atual não confirmada');await expect(monitor).toContainText('A última consulta falhou');await expect(monitor).toContainText('Proposta de código enviada ao modelo');
 disconnected=false;await page.getByRole('alert').filter({hasText:'A atualização da situação não chegou.'}).getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByText('A atualização da situação não chegou.',{exact:true})).toHaveCount(0);await expect(header.getByRole('status')).toHaveText('Em processamento');await expect(monitor).toContainText('Confirmada em');expect(writes).toBe(0);
});
