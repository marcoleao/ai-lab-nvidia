import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Plan browser fixtures require isolated test environment');

test('human edits and confirms a plan; uncertain acknowledgement never duplicates the operation',async({page,request})=>{
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const context={id:'plan-ui-only',kind:'project',key:'UI',name:'Projeto exclusivo do ensaio',description:'Fixture somente no navegador',status:'awaiting_approval',projectLifecycle:'planned',version:1,archived:false,parentId:'ui-system',data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  let proposal={id:'ui-proposal',turnId:'ui-turn',projectId:context.id,status:'draft',version:1,projectVersion:1,sessionVersion:3,stale:false,content:{summary:'Plano do teste de interface',epics:[{title:'Épico da fixture',description:'Escopo isolado',stories:[{title:'História da fixture',description:'Objetivo informado no teste',acceptanceCriteria:['Resultado verificável'],repositoryIds:[] as string[],tasks:[{title:'Tarefa da fixture',description:'Trabalho do teste',repositoryIds:[] as string[]}]}]}]},appliedItemIds:[] as string[],createdAt:new Date().toISOString()};
  let appliedCalls=0,interrupt=true;const receipts=new Map<string,unknown>();
  await page.route('**/api/items/plan-ui-only',r=>r.fulfill({json:{item:context,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route('**/api/assistant**',async route=>{
    const req=route.request();
    if(req.method()==='GET')return route.fulfill({json:{context,session:{id:'ui-session',version:3},turns:[{id:'ui-chat',kind:'chat',input:'Meu objetivo foi informado.',output:'Entrevista concluída na fixture.',status:'succeeded',error:null,model:'ui-only',actorName:'Admin',createdAt:context.createdAt}],proposals:[proposal],availableRepositories:[],configured:true,model:'ui-only'}});
    const key=req.headers()['idempotency-key'];if(receipts.has(key))return route.fulfill({json:receipts.get(key)});
    const body=req.postDataJSON();
    if(req.method()==='PATCH'){expect(body.expectedVersion).toBe(proposal.version);proposal={...proposal,content:body.content,version:proposal.version+1};const result={proposal};receipts.set(key,result);return route.fulfill({json:result});}
    expect(body).toEqual({expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true});
    appliedCalls++;proposal={...proposal,status:'applied',appliedItemIds:['ui-epic','ui-story','ui-task-1','ui-task-2']};context.version++;
    const result={proposal,itemIds:proposal.appliedItemIds};receipts.set(key,result);
    if(interrupt){interrupt=false;return route.abort();}return route.fulfill({json:result});
  });
  await page.goto('/projects/plan-ui-only');await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  await page.getByRole('button',{name:/Assistente IA IA LOCAL/}).click();
  const panel=page.getByRole('dialog',{name:'Assistente IA'}),review=panel.getByRole('region',{name:'Revisão do plano'});
  await review.getByRole('textbox',{name:'Título do épico',exact:true}).fill('Título revisado pelo humano');
  await expect(review.getByRole('button',{name:'Preparar aplicação do plano'})).toBeDisabled();
  await review.getByText('História 1:',{exact:false}).click();
  await review.getByRole('button',{name:'Adicionar tarefa',exact:true}).click();
  await review.getByText('Tarefa 2:',{exact:false}).click();
  await review.getByRole('textbox',{name:'Título da tarefa',exact:true}).last().fill('Nova tarefa definida pelo humano');
  await review.getByRole('button',{name:'Salvar revisão'}).click();
  await expect(review.getByRole('button',{name:'Preparar aplicação do plano'})).toBeEnabled();
  mkdirSync(process.env.SCREENSHOT_DIR||'test-results',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'test-results'}/plan-review-${width}.png`});}
  await review.getByRole('button',{name:'Preparar aplicação do plano'}).click();
  await expect(review.getByRole('button',{name:'Confirmar criação',exact:true})).toBeDisabled();
  await review.getByRole('button',{name:'Cancelar',exact:true}).click();expect(appliedCalls).toBe(0);
  await review.getByRole('button',{name:'Preparar aplicação do plano'}).click();
  await review.getByRole('checkbox',{name:/Revisei o plano/}).check();
  await review.getByRole('button',{name:'Confirmar criação',exact:true}).click();
  await review.getByRole('button',{name:'Confirmar operação pendente'}).click();
  await expect(review.getByRole('heading',{name:'Plano aplicado',exact:true})).toBeVisible();expect(appliedCalls).toBe(1);
  await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:/Assistente IA IA LOCAL/}).click();
  await expect(review.getByRole('heading',{name:'Plano aplicado',exact:true})).toBeVisible();
});
