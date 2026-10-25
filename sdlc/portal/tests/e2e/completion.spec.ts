import {test,expect} from '@playwright/test';
import {assistantContext} from './assistant-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw Error('Completion fixtures require isolated tests');
test('System interview creates through assistant, keeps target on uncertain delivery and shows persistent receipt',async({page})=>{
  const context={id:'completion-ui-only',kind:'system',key:'UI',name:'Sistema do teste',description:'',status:'active',version:1,archived:false,parentId:null,data:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const turns:any[]=[{id:'interview',kind:'chat',input:'Objetivo definido pelo usuário',output:'Entrevista concluída para o ensaio.',status:'succeeded',actorName:'Admin',createdAt:new Date().toISOString()}];
  let key='',requests=0;
  await assistantContext(page,context,[{id:'selected-project',name:'Projeto escolhido'}]);
  await page.route('**/api/assistant**',async route=>{
    const req=route.request();
    if(req.method()==='GET')return route.fulfill({json:{context,session:{id:'session',version:3},turns,targetProjects:[{id:'selected-project',name:'Projeto escolhido'}],configured:true,model:'ui-fixture'}});
    expect(new URL(req.url()).pathname).toBe('/api/assistant/complete');expect(req.postDataJSON()).toEqual({contextId:context.id,projectId:'selected-project',expectedVersion:3,confirmed:true,requirementsMode:true});
    requests++;
    if(!key){key=req.headers()['idempotency-key'];turns.push({id:'completion',kind:'plan',input:'Concluir entrevista e criar itens',output:null,status:'queued',actorName:'Admin',createdAt:new Date().toISOString()});return route.abort();}
    expect(req.headers()['idempotency-key']).toBe(key);return route.fulfill({json:{turn:turns.at(-1)}});
  });
  await page.goto('/assistant?system=completion-ui-only&scope=system');await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  const panel=page.getByRole('region',{name:'Entrevista e planejamento'});
  await panel.getByRole('button',{name:/2 · Propostas e confirmação/}).click();
  await panel.getByLabel('Como deseja concluir?').selectOption('create');
  const button=panel.getByRole('button',{name:'Concluir entrevista e criar itens'});
  await expect(button).toBeDisabled();await page.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('selected-project');await panel.getByRole('checkbox',{name:/Confirmo os requisitos discutidos/}).check();await button.click();
  await expect(panel.getByRole('button',{name:'Verificar criação'})).toBeEnabled();await expect(page.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('selected-project');await panel.getByRole('button',{name:'Verificar criação'}).click();expect(requests).toBe(2);expect(turns).toHaveLength(2);
  turns[1].status='succeeded';turns[1].output='Criados no Projeto escolhido: 1 épico(s), 1 história(s) e 1 tarefa(s).';
  await panel.getByRole('button',{name:'1 · Entrevista',exact:true}).click();
  await expect(panel.getByText(/Criados no Projeto escolhido/)).toBeVisible();await page.reload();await expect(panel.getByText(/Criados no Projeto escolhido/)).toBeVisible();
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
