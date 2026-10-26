import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {DashboardData} from '../../apps/web/app/dashboard';
import type {ReleaseMetricsData} from '../../apps/web/app/release-metrics';
import {systemKey} from './system-fixtures';

const weeks=[0,1,2,3].map(index=>({start:['2026-09-28','2026-10-05','2026-10-12','2026-10-19'][index]+'T03:00:00Z',end:['2026-10-05','2026-10-12','2026-10-19','2026-10-26'][index]+'T03:00:00Z',label:`Semana ${index+1}`,partial:index===3,metrics:[]}));
const completedReason='O encerramento da composição ainda não fornece eventos de conclusão.';
const reworkReason='Os fluxos de rejeição em QA e homologação ainda não estão integrados.';
const releaseMetrics:ReleaseMetricsData={
 total:6,stages:[{stage:'DRAFT',label:'Em composição',count:3},{stage:'QA',label:'QA',count:1},{stage:'HML',label:'Homologação',count:1},{stage:'PRODUCTION',label:'Produção',count:1},{stage:'REJECTED',label:'Rejeitadas',count:0}],
 composition:{samples:3,medianHours:48,oldestHours:192,buckets:[{key:'under7',label:'Menos de 7 dias',count:2},{key:'7to15',label:'7 a menos de 15 dias',count:1},{key:'15to30',label:'15 a menos de 30 dias',count:0},{key:'30plus',label:'30 dias ou mais',count:0}],definition:'Idade atual desde a criação das releases ainda em DRAFT.'},
 weeks:weeks.map((week,index)=>({...week,created:index,compositionCompleted:{value:null,samples:0,unavailableReason:completedReason},rejectionCycles:{value:null,unavailableReason:reworkReason}})),
 rework:{available:false,total:null,unavailableReason:reworkReason,categories:[{key:'qaRejection',label:'Ciclos após rejeição em QA',total:null,weeks:weeks.map(week=>({start:week.start,value:null})),unavailableReason:reworkReason},{key:'hmlRejection',label:'Ciclos após rejeição em homologação',total:null,weeks:weeks.map(week=>({start:week.start,value:null})),unavailableReason:reworkReason}]},
 notes:['O filtro por Projeto considera Histórias na composição atual da release.','Contagens por etapa refletem o estado persistido; as integrações de QA e homologação ainda não estão disponíveis.']
};
function fixture():DashboardData{return {
 generatedAt:'2026-10-22T15:00:00Z',timezone:'America/Sao_Paulo',filters:{},filterOptions:{users:[{id:'qa',name:'Qualidade'}],systems:[{id:'system-a',name:'Sistema A'}],projects:[{id:'project-a',name:'Projeto A',systemId:'system-a'}]},
 inventory:[{kind:'system',total:1,archivedTotal:0,statuses:[{status:'active',count:1}]}],weeks,aging:[],dora:[],releaseMetrics:structuredClone(releaseMetrics)
};}
function snapshot(name:string){const directory=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(directory,{recursive:true});return join(directory,name);}

test('release dashboard separates observed quantities and open age from unmeasured outcomes on desktop and mobile',async({page})=>{
 let requests=0;
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 await page.route('**/api/metrics/dashboard*',route=>{requests++;return route.fulfill({json:fixture()});});
 await page.goto('/?userId=qa&systemId=system-a&projectId=project-a#dashboard-releases');
 const releases=page.getByTestId('release-metrics');
 await expect(releases).toBeVisible();
 await expect(page.locator('.dashboard-filters > details')).not.toHaveAttribute('open','');
 await expect(page.locator('.dashboard-filter-scope')).toBeVisible();
 await expect(releases.getByTestId('release-metrics-total')).toHaveText('6');
 await expect(releases.getByTestId('release-metric-stage-DRAFT').locator('strong')).toHaveText('3');
 await expect(releases.getByTestId('release-metric-stage-REJECTED').locator('strong')).toHaveText('0');
 await expect(releases.getByRole('link',{name:'Etapas atuais',exact:true})).toHaveAttribute('aria-current','page');
 await expect(releases.getByTestId('release-composition-median')).toHaveCount(0);
 await expect(releases.getByRole('table')).toHaveCount(0);
 await releases.screenshot({path:snapshot('release-metrics-desktop.png')});
 await releases.getByRole('link',{name:'Tempo em composição',exact:true}).focus();
 await page.keyboard.press('Enter');
 await expect(releases.getByRole('link',{name:'Tempo em composição',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page).toHaveURL(/releaseView=composition#dashboard-releases$/);
 await expect(releases.getByTestId('release-metrics-total')).toHaveCount(0);
 await expect(releases.getByTestId('release-composition-median')).toHaveText('48 h');
 await expect(releases.getByTestId('release-composition-oldest')).toHaveText('192 h');
 await expect(releases.getByRole('heading',{name:'Idade das releases em composição',exact:true})).toBeVisible();
 await releases.getByRole('link',{name:'Comparação semanal',exact:true}).click();
 await expect(releases.getByRole('link',{name:'Comparação semanal',exact:true})).toHaveAttribute('aria-current','page');
 await expect(releases.getByTestId('release-composition-median')).toHaveCount(0);
 const table=releases.getByRole('table');
 await expect(table.getByRole('row',{name:/Releases criadas/}).getByRole('cell')).toHaveText(['0','1','2','3','6']);
 await expect(table.getByRole('row',{name:/Mediana da composição concluída/})).toContainText('Sem medição');
 await expect(table.getByRole('row',{name:/Ciclos após rejeição em QA/}).getByRole('cell')).toHaveText(Array(5).fill('Sem medição'));
 await expect(table.getByRole('row',{name:/Ciclos após rejeição em homologação/}).getByRole('cell')).toHaveText(Array(5).fill('Sem medição'));
 await expect(releases.getByText(completedReason,{exact:false})).toBeVisible();
 await expect(releases.getByText(reworkReason,{exact:false})).toBeVisible();
 await expect(table.getByText('PARCIAL',{exact:true})).toHaveCount(1);
 await expect(releases.getByText(/Ajustar uma composição em DRAFT não é contado como retrabalho/)).toBeVisible();
 await expect(page).toHaveURL(/userId=qa&systemId=system-a&projectId=project-a&releaseView=weekly#dashboard-releases$/);
 await expect(releases.getByText(releaseMetrics.notes[0],{exact:true})).not.toBeVisible();
 await releases.getByText('Como interpretar os indicadores de releases',{exact:true}).click();
 await expect(releases.getByText(releaseMetrics.notes[0],{exact:true})).toBeVisible();
 await releases.getByText('Como interpretar os indicadores de releases',{exact:true}).click();
 await page.goBack();
 await expect(releases.getByTestId('release-composition-median')).toHaveText('48 h');
 await page.goForward();await expect(table).toBeVisible();
 expect(requests).toBe(1);
 await page.reload();await expect(table).toBeVisible();expect(requests).toBe(2);
 await page.locator('.dashboard-filters > details > summary').click();
 await expect(page.getByRole('form',{name:'Filtros dos indicadores'}).getByRole('combobox',{name:'Projeto',exact:true})).toHaveValue('project-a');
 await page.setViewportSize({width:390,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const region=releases.getByRole('region',{name:'Indicadores de releases por semana',exact:true});
 await region.focus();await expect(region).toBeFocused();
 await expect(releases.getByText('Deslize a tabela para comparar todas as semanas e o total.',{exact:true})).toBeVisible();
 expect(await region.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
 await releases.screenshot({path:snapshot('release-metrics-mobile.png')});
 for(const label of ['Etapas atuais','Tempo em composição','Comparação semanal']){
  await releases.getByRole('link',{name:label,exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(requests).toBe(2);
});

test('release indicators inherit combined dashboard filters and hide the old scope while a new scope loads',async({page})=>{
 const requests:string[]=[];let resolveResponse=()=>{};let confirmStarted=()=>{};
 const gate=new Promise<void>(resolve=>{resolveResponse=resolve;});
 const started=new Promise<void>(resolve=>{confirmStarted=resolve;});
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 await page.route('**/api/metrics/dashboard*',async route=>{
  const query=new URL(route.request().url()).search;requests.push(query);const result=fixture();
  if(query){confirmStarted();await gate;const metrics=result.releaseMetrics!;metrics.total=0;metrics.stages.forEach(stage=>stage.count=0);metrics.composition.samples=0;metrics.composition.medianHours=null;metrics.composition.oldestHours=null;metrics.composition.buckets.forEach(bucket=>bucket.count=0);metrics.weeks.forEach(week=>week.created=0);}
  await route.fulfill({json:result});
 });
 await page.goto('/#dashboard-releases');
 await page.locator('.dashboard-filters > details > summary').click();
 const releases=page.getByTestId('release-metrics');
 await expect(releases.getByTestId('release-metrics-total')).toHaveText('6');
 const form=page.getByRole('form',{name:'Filtros dos indicadores'});
 await form.getByRole('combobox',{name:'Usuário',exact:true}).selectOption('qa');
 await form.getByRole('combobox',{name:'Sistema',exact:true}).selectOption('system-a');
 await form.getByRole('combobox',{name:'Projeto',exact:true}).selectOption('project-a');
 await form.getByRole('button',{name:'Aplicar',exact:true}).click();await started;
 await expect(releases).toHaveCount(0);
 await expect(page.getByText('Carregando indicadores…',{exact:true})).toBeVisible();
 resolveResponse();
 await expect(releases.getByTestId('release-metrics-total')).toHaveText('0');
 expect(requests).toEqual(['','?userId=qa&systemId=system-a&projectId=project-a']);
 await releases.getByRole('link',{name:'Tempo em composição',exact:true}).click();
 await expect(releases.getByTestId('release-composition-median')).toHaveText('Sem amostras');
 await expect(releases.getByTestId('release-composition-oldest')).toHaveText('Sem amostras');
 await expect(releases.getByText('Nenhuma release em DRAFT neste recorte.',{exact:true})).toBeVisible();
 await releases.getByRole('link',{name:'Comparação semanal',exact:true}).click();
 await expect(releases.getByRole('table').getByRole('row',{name:/Releases criadas/}).getByRole('cell')).toHaveText(['0','0','0','0','0']);
 await expect(releases.getByRole('table').getByRole('row',{name:/Ciclos após rejeição em QA/}).getByRole('cell')).toHaveText(Array(5).fill('Sem medição'));
 await expect(page.locator('.dashboard-filter-scope')).toContainText('Qualidade');
 await expect(page.locator('.dashboard-filter-scope')).toContainText('Projeto A');
});

test('a dashboard response without release measurements states the limitation without invented totals',async({page})=>{
 await page.route('**/api/personas',route=>route.fulfill({json:{personas:[]}}));
 await page.route('**/api/integrations/health',route=>route.fulfill({json:{checks:[]}}));
 const result=fixture();delete result.releaseMetrics;
 await page.route('**/api/metrics/dashboard*',route=>route.fulfill({json:result}));
 await page.goto('/#dashboard-releases');
 const section=page.getByRole('region',{name:'Releases · composição e entrega',exact:true});
 await expect(section.getByRole('status')).toHaveText('Sem medição de releases nesta consulta. Use Atualizar para consultar novamente.');
 await expect(section.getByRole('table')).toHaveCount(0);
 await expect(section.getByTestId('release-metrics-total')).toHaveCount(0);
});

test('persisted releases feed the dashboard with empty drafts and actual Project and participation scopes',async({page,request})=>{
 expect(process.env.TEST_DATABASE_URL?.endsWith('/portal_test'),'This test requires the isolated portal_test database').toBe(true);
 expect((await (await request.get('/api/health')).json()).databaseMode).toBe('test');
 const headers=(persona='admin')=>({'X-Persona':persona,'Idempotency-Key':crypto.randomUUID()});
 const create=async(kind:string,parentId?:string)=>{
  const response=await request.post('/api/items',{headers:headers(),data:{kind,name:`${kind} de métricas de releases`,description:'Criado somente no banco isolado para testar os indicadores persistidos.',...(parentId?{parentId}:{}),...(kind==='system'?{key:systemKey()}:kind==='project'?{key:systemKey()}:{})}});
  expect(response.ok(),await response.text()).toBe(true);return (await response.json()).item;
 };
 const system=await create('system');
 try{
  const project=await create('project',system.id),epic=await create('epic',project.id),story=await create('story',epic.id);
  const createDraft=async(name:string)=>{
   const response=await request.post('/api/releases',{headers:headers('elisa'),data:{systemId:system.id,name}});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).release;
  };
  await createDraft('DRAFT vazio contado no Sistema');
  const planned=await createDraft('DRAFT com História do Projeto');
  const compose=await request.put(`/api/releases/${planned.id}/stories`,{headers:headers('elisa'),data:{expectedVersion:planned.version,stories:[{id:story.id,expectedVersion:story.version,expectedReleaseId:null,expectedReleaseVersion:null}]}});expect(compose.ok(),await compose.text()).toBe(true);
  const metrics=async(query:string)=>{const response=await request.get(`/api/metrics/dashboard?${query}`);expect(response.ok(),await response.text()).toBe(true);return (await response.json()).releaseMetrics as ReleaseMetricsData;};
  const all=await metrics(`systemId=${system.id}`);
  expect(all.total).toBe(2);expect(all.stages.find(row=>row.stage==='DRAFT')?.count).toBe(2);expect(all.composition.samples).toBe(2);expect(all.composition.medianHours).toBeGreaterThanOrEqual(0);expect(all.composition.oldestHours).toBeGreaterThanOrEqual(all.composition.medianHours!);expect(all.rework.total).toBeNull();expect(all.weeks.every(week=>week.compositionCompleted.value===null&&week.rejectionCycles.value===null)).toBe(true);expect(all.weeks.reduce((sum,week)=>sum+week.created,0)).toBe(2);
  expect((await metrics(`systemId=${system.id}&projectId=${project.id}`)).total).toBe(1);
  expect((await metrics(`systemId=${system.id}&userId=elisa`)).total).toBe(2);
  expect((await metrics(`systemId=${system.id}&userId=bruno`)).total).toBe(0);
  await page.goto(`/?systemId=${system.id}#dashboard-releases`);
  await page.locator('.dashboard-filters > details > summary').click();
  const releases=page.getByTestId('release-metrics'),form=page.getByRole('form',{name:'Filtros dos indicadores'});
  await expect(releases.getByTestId('release-metrics-total')).toHaveText('2');
  await form.getByRole('combobox',{name:'Usuário',exact:true}).selectOption('elisa');
  await form.getByRole('combobox',{name:'Projeto',exact:true}).selectOption(project.id);
  await form.getByRole('button',{name:'Aplicar',exact:true}).click();
  await expect(releases.getByTestId('release-metrics-total')).toHaveText('1');
  await form.getByRole('combobox',{name:'Usuário',exact:true}).selectOption('bruno');
  await form.getByRole('button',{name:'Aplicar',exact:true}).click();
  await expect(releases.getByTestId('release-metrics-total')).toHaveText('0');
  await releases.getByRole('link',{name:'Tempo em composição',exact:true}).click();
  await expect(releases.getByTestId('release-composition-median')).toHaveText('Sem amostras');
 }finally{
  const current=await (await request.get(`/api/items/${system.id}`)).json();
  const archived=await request.delete(`/api/items/${system.id}`,{headers:headers(),data:{expectedVersion:current.item.version}});expect(archived.ok(),await archived.text()).toBe(true);
 }
});
