import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {openWorkPanel} from './journey-fixtures';
import {systemKey} from './system-fixtures';
if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test'))throw new Error('Browser tests require the isolated portal_test database');

test.beforeEach(async({request})=>{
  expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
  const {items}=await (await request.get('/api/items?kind=system')).json();
  for(const item of items){
    const current=(await (await request.get(`/api/items/${item.id}`)).json()).item;
    const result=await request.delete(`/api/items/${item.id}`,{headers:{'X-Persona':'admin','Idempotency-Key':crypto.randomUUID()},data:{expectedVersion:current.version}});
    expect(result.ok()).toBe(true);
  }
});

test('user creates their own hierarchy, navigates context, approves planning and updates a task',async({page})=>{
  const screenshotDir=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(screenshotDir,{recursive:true});
  await page.goto('/systems');
  await expect(page.getByRole('heading',{name:/^(Sistemas|Seu SDLC começa com um Sistema)$/,level:1})).toBeVisible();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  async function create(name:string,key?:string){
    await page.getByTestId('create-item').click();
    const form=page.getByRole('form',{name:'Formulário do item'});
    await form.getByRole('textbox',{name:/Nome ou título/}).fill(name);
    if(key){const input=form.getByRole('textbox',{name:/Sigla|Chave/});await input.fill(key);await expect(input).toHaveValue(key.toUpperCase());}
    await form.getByRole('textbox',{name:'Descrição',exact:true}).fill('Criado pelo usuário no ensaio isolado de navegação.');
    const repository= form.getByRole('checkbox').first();
    if(await repository.count())await repository.check();
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
    await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('admin');
  }
  const systemSigla=systemKey();
  await create('Sistema do ensaio',systemSigla.toLowerCase());
  const persistedSystem=await (await page.request.get(`/api/items/${new URL(page.url()).pathname.split('/')[2]}`)).json();
  expect(persistedSystem.item.key).toBe(systemSigla);
  await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Componentes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Integração GitLab do Sistema',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Repositórios',exact:true})).toHaveCount(0);
  // Isolated setup for the subsequent Project scope; Systems no longer expose
  // repository management in their Components tab.
  const component=await page.request.post(`/api/systems/${persistedSystem.item.id}/repositories`,{headers:{'X-Persona':'admin','Idempotency-Key':crypto.randomUUID()},data:{name:'Componente do ensaio',key:'API',runtime:'node',mode:'create'}});
  expect(component.ok(),await component.text()).toBe(true);
  await page.reload();
  await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Ambientes',exact:true}).click();
  await expect(page.getByText('NOT DEPLOYED',{exact:true})).toHaveCount(3);
  await create('Projeto do ensaio','UX');
  await expect(page.locator('.page-heading .badge')).toContainText('AWAITING APPROVAL');
  await expect(page.getByText('NOT DEPLOYED',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Seções de Projeto'}).getByRole('link',{name:'Componentes',exact:true})).toHaveCount(0);
  const projectScope=await (await page.request.get(`/api/items/${new URL(page.url()).pathname.split('/')[2]}`)).json();
  expect(projectScope.item.projectLifecycle).toBe('active');
  expect(projectScope.repositories.some((repository:{name:string})=>repository.name==='Componente do ensaio')).toBe(true);
  await page.getByRole('button',{name:'Aprovar projeto',exact:true}).click();
  await expect(page.locator('.page-heading .badge')).toContainText('APPROVED');
  await create('Épico do ensaio');
  await expect(page.locator('.page-heading .badge')).toHaveText('TO DO');
  const epicUrl=page.url();
  await page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:'Projeto: Projeto do ensaio',exact:true}).click();
  const epicLink=page.getByTestId('children-list').getByRole('link',{name:/Épico do ensaio/});
  await expect(epicLink).toBeVisible();
  const epicBox=await epicLink.boundingBox();
  expect(epicBox!.y+epicBox!.height).toBeLessThanOrEqual(1000);
  await epicLink.click();
  await expect(page).toHaveURL(epicUrl);
  await expect(page.getByRole('button',{name:'Aprovar épico',exact:true})).toHaveCount(0);
  await create('História do ensaio');
  const storyUrl=page.url();
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true}).click();
  await expect(page.getByRole('list',{name:'Ciclo da História'})).toBeVisible();
  for(const status of ['CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION'])await expect(page.locator('.sw-cycle').getByText(status,{exact:true})).toBeVisible();
  await expect(page.getByTestId('story-journey-header').getByRole('status')).toHaveText('Aguardando início');
  await page.screenshot({path:join(screenshotDir,'story-desktop.png'),fullPage:true});
  await create('Tarefa do ensaio');
  await expect(page.getByRole('navigation',{name:'Localização'})).toContainText('História: História do ensaio');
  const taskPanel=await openWorkPanel(page);await taskPanel.getByRole('button',{name:'Planejamento',exact:true}).click();
  await taskPanel.getByRole('button',{name:'DOING',exact:true}).click();
  await page.getByRole('navigation',{name:'Seções de Tarefa'}).getByRole('link',{name:'Resumo',exact:true}).click();
  await expect(page.locator('.sw-section-heading .sw-badge')).toHaveText('DOING');
  await openWorkPanel(page);
  await taskPanel.getByRole('button',{name:'Planejamento',exact:true}).click();
  await expect(taskPanel.getByRole('button',{name:'Planejamento',exact:true})).toHaveAttribute('aria-pressed','true');
  await taskPanel.getByRole('button',{name:'DONE',exact:true}).click();
  await page.getByRole('navigation',{name:'Seções de Tarefa'}).getByRole('link',{name:'Resumo',exact:true}).click();
  await expect(page.locator('.sw-section-heading .sw-badge')).toHaveText('DONE');
  await page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:'História: História do ensaio'}).click();
  await expect(page).toHaveURL(storyUrl);
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:/^Tarefas/}).click();
  await expect(page.getByRole('link',{name:/Tarefa do ensaio/})).toBeVisible();
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Especificação',exact:true}).click();
  await page.setViewportSize({width:768,height:1000});
  const createTask=page.getByTestId('create-item');
  await expect(createTask).toHaveText('Criar tarefa');
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:join(screenshotDir,'story-tablet.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true}).click();
  for(const status of ['CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION','COMPLETED'])expect(await page.locator('.sw-cycle').getByText(status,{exact:true}).isVisible()).toBe(true);
  await page.reload();await expect(page.getByRole('heading',{name:'História do ensaio',exact:true})).toBeVisible();
  await createTask.focus();
  await expect(createTask).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('form',{name:'Formulário do item'})).toBeVisible();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Mais',exact:true}).click();
  await page.getByRole('navigation',{name:'Informações complementares'}).getByRole('link',{name:'Configuração',exact:true}).click();
  await page.getByRole('button',{name:'Arquivar história',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('context tabs preserve an editing draft and real persona permissions; confirmations stay beside the breadcrumb',async({page})=>{
  const system={id:'navigation-ui-only',kind:'system',key:'NAV',name:'Contexto de navegação isolado',description:'Contexto original',status:'active',version:1,archived:false,parentId:null,data:{gitlabState:'not_configured'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  let changes=0;
  await page.route(url=>url.pathname==='/api/items/navigation-ui-only',async route=>{
    if(route.request().method()==='PATCH'){
      changes++;
      expect(route.request().headers()['x-persona']).toBe('admin');
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      const body=route.request().postDataJSON();expect(body.expectedVersion).toBe(1);expect(body.name).toBe('Nome preservado entre abas');
      Object.assign(system,{name:body.name,description:body.description,version:2});
      return route.fulfill({json:{item:system}});
    }
    return route.fulfill({json:{item:system,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}});
  });
  await page.goto('/systems/navigation-ui-only');
  const actions=page.getByRole('region',{name:'Situação e próxima ação'});
  await expect(actions.getByText(/Nenhuma persona selecionada/)).toBeVisible();
  await expect(page.getByTestId('edit-item')).toBeDisabled();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  await page.getByTestId('edit-item').click();
  const form=page.getByRole('form',{name:'Formulário do item'});
  await form.getByRole('textbox',{name:/Nome ou título/}).fill('Nome preservado entre abas');
  await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Componentes',exact:true}).click();
  await expect(page).toHaveURL(/\?tab=components$/);
  await expect(form.getByRole('textbox',{name:/Nome ou título/})).toHaveValue('Nome preservado entre abas');
  await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
  await expect(form.getByRole('textbox',{name:/Nome ou título/})).toHaveValue('Nome preservado entre abas');
  await expect(actions.getByRole('button',{name:'Salvar',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  await page.goBack();
  await expect(page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:/^Projetos/})).toHaveAttribute('aria-current','page');
  await expect(form.getByRole('textbox',{name:/Nome ou título/})).toHaveValue('Nome preservado entre abas');
  await actions.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Nome preservado entre abas',exact:true})).toBeVisible();
  expect(changes).toBe(1);
  await expect(page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Sistemas',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Releases',exact:true})).not.toHaveAttribute('aria-current','page');
});
