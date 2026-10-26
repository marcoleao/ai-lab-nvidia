import {test,expect} from '@playwright/test';
import {assistantContext,assistantMessagePage} from './assistant-fixtures';
import {pipelineTasks} from '../../packages/shared/src/pipeline-plan';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Completion fixtures require isolated tests');
test('System interview creates through assistant, keeps target on uncertain delivery and shows persistent receipt',async({page})=>{
  const context={id:'completion-ui-only',kind:'system',key:'UI',name:'Sistema do teste',description:'',status:'active',version:1,archived:false,parentId:null,data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const turns:any[]=[{id:'interview',kind:'chat',input:'Objetivo definido pelo usuário',output:'Entrevista concluída para o ensaio.',status:'succeeded',actorName:'Admin',createdAt:new Date().toISOString()}];
  let key='',requests=0,version=3,proposal:any=null;
  await assistantContext(page,context,[{id:'selected-project',name:'Projeto escolhido'}]);
  await page.route('**/api/assistant**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==='GET'){
      if(url.pathname==='/api/assistant/messages')return route.fulfill({json:{contextId:context.id,...assistantMessagePage(turns,url.searchParams),readOnly:false,readOnlyReason:null}});
      const current=assistantMessagePage(turns).turns;
      return route.fulfill({json:{context,session:{id:'session',version},turns:current,latestTurn:current.at(-1),activeTurn:current.find(turn=>['queued','running','paused'].includes(turn.status))??null,currentProposal:proposal,proposals:[],hasSuccessfulInterview:true,targetProjects:[{id:'selected-project',name:'Projeto escolhido'}],configured:true,model:'ui-fixture'}});
    }
    expect(new URL(req.url()).pathname).toBe('/api/assistant/complete');expect(req.postDataJSON()).toEqual({contextId:context.id,projectId:'selected-project',expectedVersion:3,confirmed:true,requirementsMode:true});
    requests++;
    if(!key){key=req.headers()['idempotency-key'];turns.push({id:'completion',kind:'plan',input:'Concluir entrevista e criar itens',output:null,status:'queued',actorName:'Admin',createdAt:new Date().toISOString()});version++;return route.abort();}
    expect(req.headers()['idempotency-key']).toBe(key);return route.fulfill({json:{turn:turns.at(-1)}});
  });
  await page.goto('/assistant?system=completion-ui-only&project=selected-project&scope=system');await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  const panel=page.getByRole('region',{name:'Entrevista e planejamento'});
  const conversation=panel.locator('#assistant-panel-conversation');
  await panel.getByRole('button',{name:/^Proposta/}).click();
  await panel.getByText('Outra forma de concluir: criar a partir da entrevista',{exact:true}).click();
  const button=panel.getByRole('button',{name:'Concluir entrevista e criar itens'});
  await expect(button).toBeDisabled();await panel.getByRole('checkbox',{name:/Confirmo os requisitos discutidos/}).check();await button.click();
  await expect(panel.getByRole('button',{name:'Verificar criação'})).toBeEnabled();await page.getByRole('button',{name:'Alterar contexto',exact:true}).click();await expect(page.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('selected-project');await page.getByRole('button',{name:'Concluir escolha',exact:true}).click();await panel.getByRole('button',{name:'Verificar criação'}).click();expect(requests).toBe(2);expect(turns).toHaveLength(2);
  turns[1].status='succeeded';turns[1].output='Criados no Projeto escolhido: 1 épico(s), 1 história(s) e 6 tarefa(s).';version++;
  const items=[{id:'completion-epic',kind:'epic',key:'EPIC-1',name:'Épico criado',status:'active',parentId:'selected-project',archived:false},{id:'completion-story',kind:'story',key:'STORY-1',name:'História criada',status:'specification',parentId:'completion-epic',archived:false},...pipelineTasks.map(task=>({id:'completion-'+task.stage,kind:'task',key:task.stage.toUpperCase(),name:task.name,status:'todo',parentId:'completion-story',archived:false}))];
  const itemIds=items.map(item=>item.id);
  proposal={id:'completion-proposal',projectId:'selected-project',status:'applied',version:1,projectVersion:1,sessionVersion:version,createdAt:new Date().toISOString(),appliedItemIds:itemIds,creationReceipt:{itemIds,items,totals:{epics:1,stories:1,tasks:6,total:8},coverage:{expected:8,available:8,complete:true}},content:{summary:'Planejamento criado a partir da entrevista do Sistema.',epics:[{title:'Épico criado',description:'Escopo confirmado.',stories:[{title:'História criada',description:'Resultado da entrevista.',acceptanceCriteria:['Resultado verificável.'],repositoryIds:[],tasks:[]}]}]}};
  await expect(panel.getByRole('heading',{name:'Plano aplicado',exact:true})).toBeVisible();
  await expect(panel.locator('.plan-receipt')).toContainText('8 itens disponíveis nesta consulta de 8 IDs');
  await expect(panel.getByRole('link',{name:'STORY-1 · História criada'})).toHaveAttribute('href','/stories/completion-story');
  await panel.getByRole('button',{name:'Conversa',exact:true}).click();
  await expect(conversation.getByText(/Criados no Projeto escolhido/)).toBeVisible();await page.reload();await expect(conversation.getByText(/Criados no Projeto escolhido/)).toBeVisible();
  await panel.getByRole('button',{name:/^Proposta/}).click();await expect(panel.locator('.plan-receipt')).toContainText('8 itens disponíveis nesta consulta de 8 IDs');
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
