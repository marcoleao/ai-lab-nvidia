import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {assistantContext,assistantMessagePage} from './assistant-fixtures';
import {pipelineTasks} from '../../packages/shared/src/pipeline-plan';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Plan browser fixtures require isolated test environment');

test('human edits and confirms a plan; uncertain acknowledgement never duplicates the operation',async({page,request})=>{
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const context={id:'plan-ui-only',kind:'project',key:'UI',name:'Projeto exclusivo do ensaio',description:'Fixture somente no navegador',status:'active',projectLifecycle:'active',version:1,archived:false,parentId:'ui-system',data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  let proposal={id:'ui-proposal',turnId:'ui-turn',projectId:context.id,status:'draft',version:1,projectVersion:1,sessionVersion:3,stale:false,content:{summary:'Plano do teste de interface',epics:[{title:'Épico da fixture',description:'Escopo isolado',stories:[{title:'História da fixture',description:'Objetivo informado no teste',acceptanceCriteria:['Resultado verificável'],repositoryIds:[] as string[],tasks:[{title:'Tarefa da fixture',description:'Trabalho do teste',repositoryIds:[] as string[]}]}]}]},appliedItemIds:[] as string[],creationReceipt:null as any,createdAt:new Date().toISOString()};
  let appliedCalls=0,interrupt=true;const receipts=new Map<string,unknown>(),signatures=new Map<string,unknown>();
  const turns=[{id:'ui-chat',sequence:1,kind:'chat',input:'Meu objetivo foi informado.',output:'Entrevista concluída na fixture.',status:'succeeded',error:null,model:'ui-only',actorName:'Admin',createdAt:context.createdAt}];
  await assistantContext(page,{id:'ui-system',name:'Sistema do ensaio'},[context]);
  await page.route(url=>url.pathname==='/api/items/plan-ui-only',r=>r.fulfill({json:{item:context,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route('**/api/assistant**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET'){
      if(url.pathname==='/api/assistant/messages')return route.fulfill({json:{contextId:context.id,...assistantMessagePage(turns,url.searchParams),readOnly:false,readOnlyReason:null}});
      return route.fulfill({json:{context,session:{id:'ui-session',version:3},turns,latestTurn:turns.at(-1),proposals:[proposal],currentProposal:proposal,activeTurn:null,hasSuccessfulInterview:true,availableRepositories:[],configured:true,model:'ui-only'}});
    }
    const key=req.headers()['idempotency-key'],signature={method:req.method(),path:url.pathname,persona:req.headers()['x-persona'],body:req.postDataJSON()};if(receipts.has(key)){expect(signature).toEqual(signatures.get(key));return route.fulfill({json:receipts.get(key)});}signatures.set(key,signature);
    const body=req.postDataJSON();
    if(req.method()==='PATCH'){expect(body.expectedVersion).toBe(proposal.version);proposal={...proposal,content:body.content,version:proposal.version+1};const result={proposal};receipts.set(key,result);return route.fulfill({json:result});}
    expect(body).toEqual({expectedVersion:proposal.version,expectedProjectVersion:proposal.projectVersion,expectedSessionVersion:proposal.sessionVersion,confirmed:true});
    const items:any[]=[];
    const add=(id:string,kind:string,name:string,parentId:string)=>items.push({id,kind,name,parentId,key:id.toUpperCase(),status:kind==='epic'?'active':kind==='story'?'specification':'todo',archived:false});
    add('ui-epic','epic',proposal.content.epics[0].title,context.id);add('ui-story','story',proposal.content.epics[0].stories[0].title,'ui-epic');
    pipelineTasks.forEach(task=>add('ui-'+task.stage,'task',task.name,'ui-story'));
    proposal.content.epics[0].stories[0].tasks.forEach((task,index)=>add('ui-extra-'+index,'task',task.title,'ui-story'));
    const creationReceipt={itemIds:items.map(item=>item.id),items,totals:{epics:1,stories:1,tasks:items.length-2,total:items.length},coverage:{expected:items.length,available:items.length,complete:true}};
    appliedCalls++;proposal={...proposal,status:'applied',appliedItemIds:creationReceipt.itemIds,creationReceipt};context.version++;
    const result={proposal,itemIds:proposal.appliedItemIds,creationReceipt};receipts.set(key,result);
    if(interrupt){interrupt=false;return route.abort();}return route.fulfill({json:result});
  });
  await page.goto('/assistant?system=ui-system&project=plan-ui-only');await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  const panel=page.getByRole('region',{name:'Entrevista e planejamento'});
  await panel.getByRole('button',{name:/^Proposta/}).click();
  const review=panel.getByRole('region',{name:'Revisão do plano'});
  await review.getByText('Detalhes do Épico 1:',{exact:false}).click();
  await review.getByRole('textbox',{name:'Título do épico',exact:true}).fill('Título revisado pelo humano');
  await expect(review.getByRole('button',{name:'Conferir criação dos itens'})).toBeDisabled();
  await review.getByRole('button',{name:/^História 1:/}).click();
  await review.getByRole('button',{name:'Adicionar tarefa adicional',exact:true}).click();
  await review.getByRole('textbox',{name:'Título da tarefa',exact:true}).last().fill('Nova tarefa definida pelo humano');
  await review.getByRole('button',{name:'Salvar revisão'}).click();
  await expect(review.getByRole('button',{name:'Conferir criação dos itens'})).toBeEnabled();
  mkdirSync(process.env.SCREENSHOT_DIR||'test-results',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${process.env.SCREENSHOT_DIR||'test-results'}/plan-review-${width}.png`});}
  await review.getByRole('button',{name:'Conferir criação dos itens'}).click();
  await expect(review.getByRole('button',{name:'Confirmar criação',exact:true})).toBeDisabled();
  await review.getByRole('button',{name:'Cancelar',exact:true}).click();expect(appliedCalls).toBe(0);
  await review.getByRole('button',{name:'Conferir criação dos itens'}).click();
  await review.getByRole('checkbox',{name:/Revisei o plano/}).check();
  await review.getByRole('button',{name:'Confirmar criação',exact:true}).click();
  await review.getByRole('button',{name:'Confirmar operação pendente'}).click();
  await expect(review.getByRole('heading',{name:'Plano aplicado',exact:true})).toBeVisible();expect(appliedCalls).toBe(1);
  await expect(review.locator('.plan-receipt')).toContainText('10 itens disponíveis nesta consulta de 10 IDs');
  await page.reload();
  await expect(review.getByRole('heading',{name:'Plano aplicado',exact:true})).toBeVisible();
});
