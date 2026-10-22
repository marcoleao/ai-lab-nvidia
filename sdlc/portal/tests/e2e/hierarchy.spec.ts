import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
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
  await expect(page.getByRole('heading',{name:'Seu SDLC começa com um Sistema'})).toBeVisible();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('admin');
  async function create(name:string,key?:string){
    await page.getByTestId('create-item').click();
    const form=page.getByRole('form',{name:'Formulário do item'});
    await form.getByRole('textbox',{name:/Nome ou título/}).fill(name);
    if(key)await form.getByRole('textbox',{name:/Chave/}).fill(key);
    await form.getByRole('textbox',{name:'Descrição',exact:true}).fill('Criado pelo usuário no ensaio isolado de navegação.');
    const repository= form.getByRole('checkbox').first();
    if(await repository.count())await repository.check();
    await form.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
    await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('admin');
  }
  await create('Sistema do ensaio',`F${Date.now().toString(36).toUpperCase().slice(-7)}`);
  const repositories=page.getByRole('region',{name:'Repositórios',exact:true});
  await repositories.getByRole('button',{name:'Criar repositório',exact:true}).click();
  await repositories.getByRole('textbox',{name:'Nome',exact:true}).fill('Componente do ensaio');
  await repositories.getByRole('textbox',{name:/Chave/}).fill('API');
  await repositories.getByRole('button',{name:'Criar repositório',exact:true}).click();
  await expect(repositories.getByRole('heading',{name:'Componente do ensaio',exact:true})).toBeVisible();
  await expect(page.getByText('NOT DEPLOYED',{exact:true})).toHaveCount(3);
  await create('Projeto do ensaio','UX');
  await expect(page.locator('.page-heading .badge')).toContainText('AWAITING APPROVAL');
  await expect(page.getByText('NOT DEPLOYED',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Repositórios',exact:true})).toContainText('Componente do ensaio');
  await page.getByRole('button',{name:'Aprovar projeto',exact:true}).click();
  await expect(page.locator('.page-heading .badge')).toContainText('APPROVED');
  await create('Épico do ensaio');
  const epicUrl=page.url();
  await page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:'Projeto: Projeto do ensaio',exact:true}).click();
  const epicLink=page.getByTestId('children-list').getByRole('link',{name:/Épico do ensaio/});
  await expect(epicLink).toBeVisible();
  const epicBox=await epicLink.boundingBox();
  expect(epicBox!.y+epicBox!.height).toBeLessThanOrEqual(1000);
  await epicLink.click();
  await expect(page).toHaveURL(epicUrl);
  await page.getByRole('button',{name:'Aprovar épico',exact:true}).click();
  await create('História do ensaio');
  const storyUrl=page.url();
  await expect(page.getByRole('heading',{name:'Ciclo da História'})).toBeVisible();
  for(const status of ['CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION'])await expect(page.locator('.process').getByText(status,{exact:true})).toBeVisible();
  await expect(page.getByText('NOT STARTED',{exact:true})).toBeVisible();
  await page.screenshot({path:join(screenshotDir,'story-desktop.png'),fullPage:true});
  await create('Tarefa do ensaio');
  await expect(page.getByRole('navigation',{name:'Localização'})).toContainText('História: História do ensaio');
  await page.getByRole('button',{name:'DOING',exact:true}).click();
  await page.getByRole('button',{name:'DONE',exact:true}).click();
  await expect(page.locator('.page-heading .badge')).toHaveText('DONE');
  await page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:'História: História do ensaio'}).click();
  await expect(page).toHaveURL(storyUrl);
  await expect(page.getByRole('link',{name:/Tarefa do ensaio/})).toBeVisible();
  await page.setViewportSize({width:768,height:1000});
  await expect(page.getByTestId('create-item')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:join(screenshotDir,'story-tablet.png'),fullPage:true});
  for(const status of ['CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION','COMPLETED'])expect(await page.locator('.process').getByText(status,{exact:true}).isVisible()).toBe(true);
  await page.reload();await expect(page.getByRole('heading',{name:'História do ensaio',exact:true})).toBeVisible();
  await page.getByTestId('create-item').focus();
  await expect(page.getByTestId('create-item')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('form',{name:'Formulário do item'})).toBeVisible();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByText('Arquivamento',{exact:true}).click();
  await page.getByRole('button',{name:'Arquivar história',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
