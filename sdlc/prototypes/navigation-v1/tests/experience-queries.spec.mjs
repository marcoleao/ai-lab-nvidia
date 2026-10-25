import {test,expect} from '@playwright/test';
const group=(page,id)=>page.locator(`[data-query-id="${id}"]`);
const systems=page=>group(page,'systems');
async function openFilters(scope){const details=scope.locator('[data-query-disclosure]');if(!await details.evaluate(node=>node.open))await details.locator(':scope > summary').click();}
test('global search, sorting, page and inactive scope survive drill down and reload',async({page})=>{
  await page.goto('/#/systems');const list=systems(page);
  await openFilters(list);
  await expect(list.locator('tbody tr')).toHaveCount(20);await expect(list.locator('.query-scope')).toContainText('39 resultados');
  await list.getByRole('checkbox',{name:/Mostrar sistemas inativos/}).check();await expect(list.locator('.query-scope')).toContainText('46 resultados');
  await list.getByRole('button',{name:'Próxima',exact:true}).first().click();await expect(list.locator('.query-pagination').first()).toContainText('Página 2 de 3');
  const recorte=page.url();await list.locator('tbody a').first().click();await page.locator('#breadcrumbs').getByRole('link',{name:'Sistemas',exact:true}).click();await expect(page).toHaveURL(recorte);
  await page.reload();await expect(list.getByRole('checkbox',{name:/Mostrar sistemas inativos/})).toBeChecked();
  await list.getByRole('searchbox',{name:'Buscar por nome ou chave'}).fill('Unidade de negócios 44');await expect(list.locator('tbody tr')).toHaveCount(20);
  await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(1);await expect(list.locator('tbody')).toContainText('Unidade de negócios 44');await expect(list.locator('.query-pagination').first()).toContainText('Página 1 de 1');
  await list.getByRole('button',{name:'Limpar filtros',exact:true}).click();await expect(list.locator('.query-scope')).toContainText('39 resultados');await list.locator('thead').getByRole('button',{name:'Nome e chave',exact:true}).click();await expect(list.locator('tbody tr').first()).toContainText('Unidade de negócios 44');
});
test('a quick filter and sorting preserve unapplied search without applying it',async({page})=>{
  await page.goto('/#/systems');const list=systems(page);const search=list.getByRole('searchbox',{name:'Buscar por nome ou chave'});
  await openFilters(list);
  await search.fill('Texto ainda não aplicado');await list.getByRole('checkbox',{name:/Mostrar sistemas inativos/}).check();await expect(search).toHaveValue('Texto ainda não aplicado');await expect(list.locator('.query-scope')).toContainText('46 resultados');
  await list.locator('thead').getByRole('button',{name:'Nome e chave',exact:true}).click();await expect(search).toHaveValue('Texto ainda não aplicado');await expect(list.locator('tbody tr')).toHaveCount(20);
  await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(list.locator('.query-empty')).toBeVisible();await expect(list.locator('.query-scope')).toContainText('0 resultados');
});
test('archived and closed projects join the query while approval remains independent',async({page})=>{
  await page.goto('/#/system/system-atendimento/overview');const list=group(page,'children-system-atendimento');
  await openFilters(list);
  await list.getByRole('searchbox',{name:'Buscar por nome ou chave'}).fill('Projeto arquivado');await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(0);
  await list.getByRole('checkbox',{name:/Mostrar projetos inativos/}).check();await expect(list.locator('tbody tr')).toHaveCount(1);await expect(list.locator('tbody')).toContainText('ARCHIVED');await expect(list.locator('tbody')).toContainText('AWAITING APPROVAL');
});
test('old events are searchable globally and retain the history query on the occurrence link',async({page})=>{
  await page.goto('/#/system/system-atendimento/activity');const list=group(page,'history-system-atendimento');
  await openFilters(list);
  await expect(list.locator('tbody tr')).toHaveCount(20);await list.getByRole('searchbox',{name:'Buscar mensagem ou identificador'}).fill('EVT-101');await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(1);const recorte=page.url();
  await list.locator('tbody td:nth-child(3) a').click();await expect(page.getByRole('heading',{name:'O que aconteceu',exact:true})).toBeVisible();await page.getByText('Detalhes técnicos da ocorrência',{exact:true}).click();await expect(page.locator('#main-content')).toContainText('EVT-101');
  await page.getByRole('link',{name:'← Voltar à consulta',exact:true}).click();await expect(page).toHaveURL(recorte);await expect(list.locator('tbody tr')).toHaveCount(1);
});
test('query states recover the applied scope and do not fabricate an empty successful result on failure',async({page})=>{
  await page.goto('/#/systems');const list=systems(page);await openFilters(list);await list.getByRole('searchbox',{name:'Buscar por nome ou chave'}).fill('Atendimento');await list.getByRole('button',{name:'Aplicar filtros',exact:true}).click();const applied=page.url();
  await page.getByLabel('Explorar estado da consulta').selectOption('failure');await expect(page.getByRole('heading',{name:'Não foi possível consultar os registros'})).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button',{name:'Tentar novamente · simulação',exact:true}).click();await expect(page).toHaveURL(applied);await expect(list.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Explorar estado da consulta').selectOption('partial');await expect(page.locator('#main-content')).toContainText('Amostra parcial simulada');await page.getByRole('button',{name:'Consultar conjunto completo',exact:true}).click();await expect(list.locator('tbody tr')).toHaveCount(1);
});
test('desktop and mobile keep tables within scroll regions and all five navigation items accessible',async({page})=>{
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto('/#/systems');await expect(systems(page).locator('tbody tr')).toHaveCount(20);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[data-global-nav]')).toHaveCount(5);}
});
