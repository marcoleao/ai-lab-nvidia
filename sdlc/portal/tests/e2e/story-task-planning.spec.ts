import {test, expect, type Page} from '@playwright/test';

async function setup(page: Page, kind = 'story', managed = false) {
  const stamp = '2026-10-24T15:00:00.000Z';
  const base = {key:'PLAN', name:'Planejamento de teste', description:'Somente dados interceptados.', version:1, archived:false, parentId:null, data:{}, createdAt:stamp, updatedAt:stamp};
  const system = {...base,id:'system',kind:'system',status:'active'}, project = {...base,id:'project',kind:'project',status:'approved',projectLifecycle:'active'}, epic = {...base,id:'epic',kind:'epic',status:'doing'};
  const repository = {id:'system-repository',systemId:system.id,key:'system',name:'Repositório automático do Sistema',runtime:'node',gitlabProjectId:1,gitlabPath:'lab/system/system',gitlabUrl:'http://gitlab/lab/system/system',state:'ready',message:null,version:1};
  const story = {...base,id:'story',kind:'story',status:'code_review'};
  let task = {...base,id:'task',kind:'task',status:'todo', managed, processOwned:managed};
  const writes: {path:string;body:any}[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request=route.request(),path=new URL(request.url()).pathname;
    const send=(json:unknown)=>route.fulfill({json});
    if(path==='/api/personas')return send({personas:[{id:'admin',name:'Admin',role:'admin'},{id:'qa',name:'QA',role:'qa_lead'}]});
    if(request.method()==='POST'){
      const body=request.postDataJSON();writes.push({path,body});task={...task,status:body.status,version:task.version+1,data:body.result?{taskResult:{summary:body.result,evidence:body.evidence}}:task.data};return send({item:task});
    }
    if(path.endsWith('/journey'))return send({story,current:{phase:'CODE REVIEW',kind:'code_review',state:'not_started',taskId:null,title:'Revisar o código'},tasks:[task],activities:[],events:[],run:null,nextAction:null,secondaryActions:[],permissions:{canAct:true},chat:{mode:null,enabled:false},signals:{},repositoryName:repository.name});
    if(path.endsWith('/history'))return send({events:[],page:1,pageSize:20,total:0,totalPages:1,asOf:stamp,actors:[],types:[],results:[]});
    if(path.endsWith('/release'))return send({story:{...story,projectId:project.id,projectName:project.name,epicId:epic.id,epicName:epic.name},assignment:null,system:{id:system.id,name:system.name},releases:[],truncated:false,totalChoices:0});
    if(path.endsWith('/specification'))return send({story:{id:story.id,version:story.version},content:{requirements:{objective:'Consultar o planejamento registrado.',behavior:'Apresentar o escopo e os critérios confirmados.',functionalCriteria:['O planejamento mostra o escopo confirmado.']},technical:null},revision:null,draft:null,readOnly:false,history:{items:[],page:1,pageSize:20,total:0,asOf:stamp}});
    if(path.endsWith('/results'))return send({results:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},asOf:stamp,readOnly:false,coverage:{source:'TaskResultRevision',legacyResultAvailable:false}});
    if(path==='/api/collections/items')return send({items:[],page:1,pageSize:20,total:0,totalPages:1,extraCount:0});
    if(path.startsWith('/api/items/'))return send({item:kind==='story'?story:task,ancestors:[system,project,epic,...(kind==='task'?[story]:[])],children:[],repositories:[repository],availableRepositories:[repository],environments:[],history:[]});
    return send({items:[]});
  });
  await page.goto(`/${kind==='story'?'stories':'tasks'}/${kind}?tab=planning`);
  const card=kind==='story'?page.getByTestId('story-process'):page.getByRole('region',{name:'Ciclo da Tarefa',exact:true});
  await expect(card).toBeVisible();
  await expect(page.getByRole('navigation',{name:kind==='story'?'Seções de História':'Seções de Tarefa'}).getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');
  return {card,writes,errors,readTask:()=>task};
}

async function expectInheritedRepository(page:Page){
  const repository=page.getByRole('region',{name:'Repositório do Sistema',exact:true});
  await expect(repository).toBeVisible();
  await expect(repository).toContainText('Repositório automático do Sistema');
  await expect(repository.getByRole('button',{name:/Criar|Vincular|Selecionar/})).toHaveCount(0);
  await expect(repository.getByRole('combobox')).toHaveCount(0);
  await expect(repository.getByRole('checkbox')).toHaveCount(0);
  await expect(repository.getByRole('link',{name:/GitLab/})).toHaveCount(0);
  await expect(repository.locator('a[href="http://gitlab/lab/system/system"]')).toHaveCount(0);
  const destination=await repository.getByRole('link',{name:/^Consultar repositório no Sistema/}).getAttribute('href');
  expect(destination).toBeTruthy();
  const systemUrl=new URL(destination!,'http://portal.test');
  expect(systemUrl.pathname).toBe('/systems/system');
  expect(systemUrl.searchParams.get('tab')).toBe('components');
}

test('Story execution preserves actual phase, contextual decisions and detail access without status writes',async({page})=>{
  const {card,writes,errors}=await setup(page);
  await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
  await expect(card.getByRole('heading',{name:'Revisar o código',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Ciclo da História',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Abrir Assistente neste contexto'})).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:/Projeto:/})).toHaveAttribute('href',/^\/projects\/project(?:\?|$)/);
  await page.getByRole('navigation',{name:'Detalhes da execução'}).getByRole('button',{name:'Consultar sinais e evidências',exact:true}).click();
  await expect(page).toHaveURL(/process=processing/);
  await expect(card.getByRole('heading',{name:'Sinais e evidências da execução',exact:true})).toBeVisible();
  await card.getByRole('button',{name:/Voltar à etapa atual/}).click();
  await expect(page).toHaveURL(/process=action/);
  await expect(page.getByTestId('story-process')).toBeVisible();
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await page.reload();await expect(card).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('Manual Task planning uses the central process for transitions and justified reopening',async({page})=>{
  const {card,writes,errors,readTask}=await setup(page,'task');
  await expect(card.locator('li')).toHaveText(['TO DO','DOING','DONE','CANCELLED']);
  await expect(card.locator('[aria-current=step]')).toHaveText('TO DO');
  await expect(card.getByRole('button')).toBeDisabled();await page.getByRole('combobox').first().selectOption('admin');
  await card.getByRole('button',{name:'Gerenciar status da Tarefa'}).click();
  const panel=page.getByTestId('story-process');await expect(panel).toBeVisible();
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  await panel.getByRole('button',{name:'DOING',exact:true}).click();await expect(card.locator('[aria-current=step]')).toHaveText('DOING');
  const done=panel.getByRole('button',{name:'DONE',exact:true});await expect(done).toBeDisabled();
  await panel.getByRole('textbox',{name:/^Resultado do trabalho/}).fill('Contrato de consulta implementado e conferido.');
  await panel.getByRole('textbox',{name:/^Evidências ou referências/}).fill('http://gitlab/test/-/merge_requests/9');
  await done.click();await expect(card.locator('[aria-current=step]')).toHaveText('DONE');
  expect(readTask().data).toEqual({taskResult:{summary:'Contrato de consulta implementado e conferido.',evidence:['http://gitlab/test/-/merge_requests/9']}});
  const reopen=panel.getByRole('button',{name:/^Reabrir.*DOING$/});await expect(reopen).toBeDisabled();
  await panel.getByRole('textbox',{name:'Justificativa para reabrir'}).fill('Nova evidência requer reabertura.');await reopen.click();
  await expect(card.locator('[aria-current=step]')).toHaveText('DOING');
  expect(writes.map(write=>write.body)).toEqual([{status:'doing',expectedVersion:1},{status:'done',expectedVersion:2,result:'Contrato de consulta implementado e conferido.',evidence:['http://gitlab/test/-/merge_requests/9']},{status:'doing',expectedVersion:3,comment:'Nova evidência requer reabertura.'}]);
  expect(writes.every(write=>write.path==='/api/items/task/status')).toBe(true);expect(errors).toEqual([]);
});

test('Managed Task planning keeps status controlled by process and exposes no manual status action',async({page})=>{
  const {card,writes,errors}=await setup(page,'task',true);
  await page.getByRole('combobox').first().selectOption('admin');
  await expect(card).toContainText('não pode ser alterado manualmente');
  await expect(card.getByRole('button',{name:'Gerenciar status da Tarefa'})).toHaveCount(0);
  const panel=page.getByTestId('story-process');
  await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'Planejamento',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'Status da Tarefa planejada'})).toHaveCount(0);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});

for(const kind of ['story','task'])test(`${kind} preserves history query and current phase in its own audit navigation`,async({page})=>{
  const {writes,errors}=await setup(page,kind);
  await page.goto(`/${kind==='story'?'stories':'tasks'}/${kind}?tab=planning&history.q=consulta`);
  const navigation=page.getByRole('navigation',{name:kind==='story'?'Seções de História':'Seções de Tarefa'});
  if(kind==='story'){
    await expect(navigation.getByRole('link')).toHaveText([/^Tarefas/,'Execução','Especificação','Conversas','Auditoria','Configurações']);
    await expect(navigation.getByRole('link',{name:'Componentes',exact:true})).toHaveCount(0);
    await expect(navigation.getByRole('link',{name:'Mais',exact:true})).toHaveCount(0);
    await navigation.getByRole('link',{name:'Auditoria',exact:true}).click();
    await expect(page.getByRole('navigation',{name:'Informações complementares'})).toHaveCount(0);
  }else await navigation.getByRole('link',{name:'Auditoria',exact:true}).click();
  await expect(page).toHaveURL(/history.q=consulta/);
  const history=page.getByRole('region',{name:'Histórico e rastreabilidade',exact:true});
  await expect(history).toHaveCount(1);await expect(history).toBeVisible();
  await expect(navigation.getByRole('link',{name:'Auditoria',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
  await page.reload();await expect(history).toBeVisible();
  if(kind==='story'){
    await navigation.getByRole('link',{name:'Configurações',exact:true}).click();await expect(history).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Configuração da História',exact:true})).toBeVisible();
    await navigation.getByRole('link',{name:'Auditoria',exact:true}).click();
    await expect(page).toHaveURL(/tab=activity/);await expect(history).toHaveCount(1);
    await navigation.getByRole('link',{name:'Execução',exact:true}).click();await expect(history).toHaveCount(0);
    await page.getByRole('navigation',{name:'Detalhes da execução'}).getByRole('button',{name:'Repositório do Sistema',exact:true}).click();
    await expectInheritedRepository(page);
    await expect(navigation.getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');
    await expect(page).toHaveURL(/process=destination/);await expect(page).toHaveURL(/history.q=consulta/);
    await expect(page.getByRole('navigation',{name:'Informações complementares'})).toHaveCount(0);
    await page.goto('/stories/story?tab=activity&history.q=consulta');await expect(history).toHaveCount(1);
    await expect(navigation.getByRole('link',{name:'Auditoria',exact:true})).toHaveAttribute('aria-current','page');
  }else{
    await navigation.getByRole('link',{name:'Mais',exact:true}).click();await expect(history).toHaveCount(0);
    await expect(page.getByRole('navigation',{name:'Informações complementares'}).getByRole('link',{name:'Repositório do Sistema',exact:true})).toHaveAttribute('aria-current','page');
    await navigation.getByRole('link',{name:'Auditoria',exact:true}).click();await expect(history).toHaveCount(1);
  }
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});

test('Story uses six tabs, preserves filters and resolves former Summary, delivery and repository links',async({page})=>{
  const {writes,errors}=await setup(page);
  await page.goto('/stories/story?tasks.q=consulta');
  const navigation=page.getByRole('navigation',{name:'Seções de História'}), tasks=navigation.getByRole('link',{name:/^Tarefas/});
  await expect(navigation.getByRole('link').first()).toHaveText(/^Tarefas/);
  await expect(navigation.getByRole('link')).toHaveText([/^Tarefas/,'Execução','Especificação','Conversas','Auditoria','Configurações']);
  await expect(navigation.getByRole('link',{name:'Componentes',exact:true})).toHaveCount(0);
  await expect(navigation.getByRole('link',{name:'Resumo',exact:true})).toHaveCount(0);
  await expect(navigation.getByRole('link',{name:'Entregas',exact:true})).toHaveCount(0);
  await expect(tasks).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Tarefas da História',exact:true})).toBeVisible();
  await expect(page.getByTestId('story-phase')).toHaveText('CODE REVIEW');
  await navigation.getByRole('link',{name:'Especificação',exact:true}).click();await expect(page).toHaveURL(/tab=specification/);
  await expect(page.getByRole('heading',{name:'Especificação da História',exact:true})).toBeVisible();
  await tasks.click();await expect(page).toHaveURL(url=>!url.searchParams.has('tab'));await expect(page).toHaveURL(/tasks.q=consulta/);
  await page.reload();await expect(tasks).toHaveAttribute('aria-current','page');
  await page.goBack();await expect(navigation.getByRole('link',{name:'Especificação',exact:true})).toHaveAttribute('aria-current','page');
  await page.goto('/stories/story?tab=overview&tasks.q=consulta');await expect(tasks).toHaveAttribute('aria-current','page');await expect(page).toHaveURL(/tasks.q=consulta/);
  await page.goto('/stories/story?tab=overview&interact=administration&tasks.q=consulta');await expect(navigation.getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');await expect(page).toHaveURL(/process=administration/);await expect(page).toHaveURL(/tasks.q=consulta/);
  await page.goto('/stories/story?tab=delivery&tasks.q=consulta');await expect(navigation.getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('heading',{name:'Entrega de código',exact:true})).toBeVisible();
  await page.goto('/stories/story?tab=releases&tasks.q=consulta');await expect(navigation.getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('heading',{name:'Escolher uma release existente',exact:true})).toBeVisible();
  await page.goto('/stories/story?tab=components&tasks.q=consulta');await expect(navigation.getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');await expectInheritedRepository(page);await expect(page).toHaveURL(/process=destination/);await expect(page).toHaveURL(/tasks.q=consulta/);
  await page.goto('/stories/story?tab=tasks');await expect(tasks).toHaveAttribute('aria-current','page');
  await setup(page,'task');await page.goto('/tasks/task');await expect(page.getByRole('navigation',{name:'Seções de Tarefa'}).getByRole('link').first()).toHaveText('Resumo');
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});
