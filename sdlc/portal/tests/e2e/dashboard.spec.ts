import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {DashboardData} from '../../apps/web/app/dashboard';

const fixture:DashboardData={
 generatedAt:'2026-10-22T15:00:00Z',timezone:'America/Sao_Paulo',
 filters:{},filterOptions:{users:[{id:'admin',name:'Administrador'},{id:'qa',name:'Qualidade'}],systems:[{id:'system-a',name:'Sistema A'},{id:'system-b',name:'Sistema B'}],projects:[{id:'project-a',name:'Projeto A',systemId:'system-a'},{id:'project-b',name:'Projeto B',systemId:'system-b'}]},
 inventory:[
  {kind:'system',total:2,archivedTotal:1,statuses:[{status:'active',count:2}]},
  {kind:'project',total:4,archivedTotal:0,statuses:[{status:'awaiting_approval',count:1},{status:'approved',count:3}],lifecycle:[{status:'planned',count:1},{status:'active',count:2},{status:'completed',count:1}]},
  {kind:'epic',total:6,archivedTotal:0,statuses:[{status:'todo',count:1},{status:'approved',count:1},{status:'doing',count:2},{status:'done',count:2}]},
  {kind:'story',total:12,archivedTotal:0,statuses:[{status:'specification',count:4},{status:'coding',count:3},{status:'code_review',count:2},{status:'completed',count:3}]},
  {kind:'task',total:18,archivedTotal:0,statuses:[{status:'todo',count:6},{status:'doing',count:5},{status:'done',count:7}]}
 ],
 weeks:[0,1,2,3].map(index=>({start:['2026-09-28','2026-10-05','2026-10-12','2026-10-19'][index]+'T03:00:00Z',end:['2026-10-05','2026-10-12','2026-10-19','2026-10-26'][index]+'T03:00:00Z',label:`Semana ${index+1}`,partial:index===3,metrics:[{key:'approvals',label:'Aprovações',value:index,unit:'count'},{key:'loops',label:'Loops',value:index+1,unit:'count'},{key:'rework',label:'Retrabalho e ciclos de correção',value:index+2,unit:'count'}]})),
 aging:['project','epic','story'].map(kind=>({kind:kind as 'project'|'epic'|'story',total:6,buckets:[{key:'under7',label:'Menos de 7 dias',count:3},{key:'7to15',label:'7 a menos de 15 dias',count:1},{key:'15to30',label:'15 a menos de 30 dias',count:2},{key:'30plus',label:'30 dias ou mais',count:0}]})),
 dora:[{key:'deployment_frequency',label:'Frequência de implantação',value:null,unit:'deploys/dia',description:'Implantações bem-sucedidas em produção por dia.',samples:0,unavailableReason:'Integração de implantação em produção ainda não fornece evidências.'}],
 notes:['Eventos refletem os dados disponíveis. Um Merge Request não é uma implantação.']
};
fixture.rework={categories:[
 {key:'technicalValidation',label:'Correções técnicas de patch',description:'Patches rejeitados por formato ou política técnica.',available:true,total:6,weeks:fixture.weeks.map((week,index)=>({start:week.start,value:index}))},
 {key:'additionalClarification',label:'Esclarecimentos adicionais',description:'Novas mensagens humanas para esclarecer impedimentos.',available:true,total:4,weeks:fixture.weeks.map(week=>({start:week.start,value:1}))},
 {key:'testCorrection',label:'Correções após testes',description:'Falhas de testes que exigem nova implementação.',available:false,total:null,unavailableReason:'Integração de testes pendente.',weeks:fixture.weeks.map(week=>({start:week.start,value:null}))}
]};
fixture.dora[0].weeks=fixture.weeks.map(week=>({start:week.start,value:null,samples:0}));

test('overview shows distinct dashboard, explicit unavailable measurements and accessible responsive sections',async({page})=>{
 const screenshotDir=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(screenshotDir,{recursive:true});
 let inventoryRequests=0;
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 await page.route('**/api/items?kind=system',route=>{inventoryRequests++;return route.fulfill({json:{items:[]}});});
 await page.route('**/api/metrics/dashboard',route=>route.fulfill({json:fixture}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Visão geral',exact:true})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Visão geral'})).toHaveAttribute('aria-current','page');
 const inventory=page.getByRole('article',{name:'Indicadores de Projetos'});
 await expect(inventory.locator('.inventory-total')).toHaveText('4Total');
 await expect(inventory).toContainText('AWAITING APPROVAL');
 await expect(page.getByTestId('create-item')).toHaveCount(0);
 expect(inventoryRequests).toBe(0);
 await expect(page.getByRole('table').first().getByText('PARCIAL')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Retrabalho e ciclos de correção',exact:true})).toBeVisible();
 await expect(page.getByRole('row',{name:/Correções técnicas de patch/})).toContainText('6');
 await expect(page.getByRole('row',{name:/Correções após testes/})).toContainText('Sem medição');
 await expect(page.getByText(/Esclarecimentos adicionais indicam mais interação/)).toBeVisible();
 await expect(page.getByText('SLOPs',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Performance de entrega · DORA'})).toBeVisible();
 await expect(page.locator('.dora-value')).toHaveText('Sem medição');
 await expect(page.getByRole('definition').filter({hasText:'—'})).toHaveCount(4);
 await expect(page.getByRole('table').nth(2).getByRole('row',{name:/Projetos/})).toContainText('6');
 await page.screenshot({path:join(screenshotDir,'dashboard-desktop.png'),fullPage:true});
 for(const width of [768,390]){
  await page.setViewportSize({width,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('navigation',{name:'Seções dos indicadores'}).getByRole('link',{name:'Tempo em aberto'}).click();
  await expect(page).toHaveURL(/#dashboard-aging$/);
  if(width===390){
   const table=page.getByRole('region',{name:'Tabela por faixa de idade',exact:true});
   await table.focus();await expect(table).toBeFocused();
   await expect(page.getByText('Deslize a tabela para consultar todas as faixas de idade.')).toBeVisible();
  }
  await page.screenshot({path:join(screenshotDir,`dashboard-${width}.png`),fullPage:true});
 }
 await page.getByRole('navigation',{name:'Principal'}).getByRole('link',{name:'Sistemas',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Seu SDLC começa com um Sistema'})).toBeVisible();
 await expect(page.getByTestId('create-item')).toBeVisible();
 expect(inventoryRequests).toBeGreaterThan(0);
});

test('dashboard failure is actionable and never replaced with invented zero values',async({page})=>{
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 let calls=0;
 await page.route('**/api/metrics/dashboard',route=>{calls++;return calls===1?route.fulfill({status:503,json:{error:{message:'Indicadores temporariamente indisponíveis.'}}}):route.fulfill({json:fixture});});
 await page.goto('/');
 await expect(page.locator('.dashboard [role=alert]')).toContainText('Indicadores temporariamente indisponíveis.');
 await expect(page.getByRole('article')).toHaveCount(0);
 await page.getByRole('button',{name:'Atualizar indicadores'}).click();
 await expect(page.getByRole('article',{name:'Indicadores de Sistemas'})).toBeVisible();
 await expect(page.locator('.dashboard [role=alert]')).toHaveCount(0);
});

test('dashboard filters combine scopes, preserve URL and recover from empty results',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 await page.route('**/api/metrics/dashboard*',route=>{
  const url=new URL(route.request().url());requests.push(url.search);
  const result=structuredClone(fixture);result.filters=Object.fromEntries(url.searchParams);
  if(url.searchParams.get('userId')==='qa')result.inventory.forEach(entity=>{entity.total=0;entity.archivedTotal=0;entity.statuses.forEach(row=>row.count=0);});
  return route.fulfill({json:result});
 });
 await page.goto('/');
 const form=page.getByRole('form',{name:'Filtros dos indicadores'});
 await expect(form.getByRole('combobox',{name:'Usuário',exact:true}).getByRole('option')).toHaveCount(3);
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toBeDisabled();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true}).getByRole('option')).toHaveCount(1);
 await form.getByRole('combobox',{name:'Usuário',exact:true}).selectOption('admin');
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-a');
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toBeEnabled();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true}).getByRole('option')).toHaveCount(2);
 await form.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('project-a');
 await expect(form.getByRole('combobox',{name:'Sistema',exact:true})).toHaveValue('system-a');
 await expect(page.getByText('Filtros alterados. Clique em Aplicar para atualizar os indicadores.')).toBeVisible();
 expect(requests).toHaveLength(1);
 await form.getByRole('button',{name:'Aplicar',exact:true}).click();
 await expect(page).toHaveURL(/userId=admin&systemId=system-a&projectId=project-a/);
 await expect(page.locator('.dashboard-filter-scope')).toContainText('Administrador');
 await expect(page.getByRole('article',{name:'Indicadores de Projetos'})).toBeVisible();
 expect(requests.at(-1)).toBe('?userId=admin&systemId=system-a&projectId=project-a');
 await page.reload();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('project-a');
 await expect(form.getByRole('combobox',{name:'Usuário',exact:true})).toHaveValue('admin');
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-b');
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('');
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true}).getByRole('option')).toHaveCount(2);
 await form.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('project-b');
 await form.getByRole('combobox',{name:'Usuário',exact:true}).selectOption('qa');
 await form.getByRole('button',{name:'Aplicar',exact:true}).click();
 await expect(page.getByText(/Nenhum item encontrado neste recorte/)).toBeVisible();
 await expect(page.getByRole('article',{name:'Indicadores de Projetos'}).locator('.inventory-total')).toHaveText('0Total');
 await expect(form.getByRole('combobox',{name:'Sistema',exact:true}).getByRole('option')).toHaveCount(3);
 await form.getByRole('button',{name:'Limpar',exact:true}).click();
 await expect(page).toHaveURL(/\/$/);
 await expect(page.getByRole('article',{name:'Indicadores de Projetos'}).locator('.inventory-total')).toHaveText('4Total');
 await expect(page.getByText(/Nenhum item encontrado neste recorte/)).toHaveCount(0);
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toBeDisabled();
 await page.goBack();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('project-b');
 await expect(page.getByText(/Nenhum item encontrado neste recorte/)).toBeVisible();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toBeEnabled();
 await page.goForward();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('');
 await expect(page.getByRole('article',{name:'Indicadores de Projetos'}).locator('.inventory-total')).toHaveText('4Total');
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-a');
 await form.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('project-a');
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('');
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toBeDisabled();
 await expect(form.getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('');
});

test('changing filter aborts stale requests and hides the prior scope while loading',async({page})=>{
 let releaseSlow=()=>{};let finishSlow=()=>{};let startSlow=()=>{};
 const slowGate=new Promise<void>(resolve=>{releaseSlow=resolve;});const slowFinished=new Promise<void>(resolve=>{finishSlow=resolve;});const slowStarted=new Promise<void>(resolve=>{startSlow=resolve;});
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 await page.route('**/api/metrics/dashboard*',async route=>{
  const selected=new URL(route.request().url()).searchParams.get('systemId');
  const result=structuredClone(fixture);
  if(selected==='system-a'){startSlow();await slowGate;result.inventory[0].total=99;try{await route.fulfill({json:result});}catch{}finally{finishSlow();}return;}
  if(selected==='system-b')result.inventory[0].total=8;
  await route.fulfill({json:result});
 });
 await page.goto('/');
 const form=page.getByRole('form',{name:'Filtros dos indicadores'});
 await expect(page.getByRole('article',{name:'Indicadores de Sistemas'})).toBeVisible();
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-a');
 await form.getByRole('button',{name:'Aplicar',exact:true}).click();
 await slowStarted;
 await expect(page.getByRole('article')).toHaveCount(0);
 await expect(page.getByText('Carregando indicadores…',{exact:true})).toBeVisible();
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-b');
 await form.getByRole('button',{name:'Aplicar',exact:true}).click();
 await expect(page.getByRole('article',{name:'Indicadores de Sistemas'}).locator('.inventory-total')).toHaveText('8Total');
 releaseSlow();await slowFinished;
 await expect(page.getByRole('article',{name:'Indicadores de Sistemas'}).locator('.inventory-total')).toHaveText('8Total');
 await expect(page.locator('.dashboard-filter-scope')).toContainText('Sistema B');
});
