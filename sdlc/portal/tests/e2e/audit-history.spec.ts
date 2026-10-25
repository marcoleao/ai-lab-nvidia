import {test,expect,type Page} from '@playwright/test';

const stamp='2026-10-24T15:00:00.000Z';
const system={id:'audit-system',key:'AUDITA',name:'Sistema de aceite isolado',kind:'system',status:'active',description:'Fixture interceptada, sem persistência.',parentId:null,archived:false,version:1,data:{},createdAt:stamp,updatedAt:stamp};
const person={id:'ana',name:'Ana',type:'human',authentication:'declared_demo'};
const worker={id:'security-worker',name:'Scanner local',type:'service',authentication:'service'};
const envelope={schemaVersion:2,auditEpochId:'isolated-test-epoch',coverage:{version:2},target:{type:'system',id:system.id,key:system.key,name:system.name,version:2},targets:[],initiator:person,executor:worker,
  changes:[
    {field:'status',before:{kind:'value',value:'pending'},after:{kind:'value',value:'ready'}},
    {field:'name',before:{kind:'value',value:null},after:{kind:'value',value:'Nome registrado'}},
    {field:'description',before:{kind:'restricted'},after:{kind:'restricted'}},
    {field:'descriptionRevision',before:{kind:'absent'},after:{kind:'value',value:'restricted-revision-fixture'}},
    {field:'version',before:{kind:'not_observed'},after:{kind:'value',value:2}},
    {field:'gitlabGroupId',before:{kind:'absent'},after:{kind:'value',value:12}},
  ],changeCoverage:'captured',evidence:[{type:'gitlab_group',id:'12',url:'https://gitlab.example.test/sdlc/audita',revision:'abc123',source:'gitlab'}],reasonCode:'FINDINGS_PRESENT',source:{component:'quality-worker',channel:'worker'}};

async function setup(page:Page){
  const base={itemId:system.id,actorId:worker.id,actorName:worker.name,actorType:worker.type,message:'Ocorrência de teste interceptada.',timestamp:stamp,payload:{}};
  const events=[
    {...base,id:'audit-quality',schemaVersion:2,action:'QUALITY_CHECK_COMPLETED',result:'SUCCEEDED',phase:'COMPLETED',decision:'REJECTED',operationId:'operation-audit',requestId:'request-audit',attemptId:'attempt-audit',subjectType:'system',subjectId:system.id,occurredAt:'2026-10-24T14:59:00.000Z',audit:envelope},
    {...base,id:'audit-confirmation',schemaVersion:2,action:'GITLAB_PROVISIONED',result:'SUCCEEDED',phase:'OBSERVED',decision:null,operationId:'operation-audit',subjectType:'system',subjectId:system.id,audit:{...envelope,changes:[],changeCoverage:'not_applicable'}},
    {...base,id:'legacy-provisioned',schemaVersion:1,action:'GITLAB_PROVISIONED',result:null,payload:{gitlabGroupId:12,gitlabGroupPath:'sdlc/audita'}},
    {...base,id:'legacy-explicit',schemaVersion:1,action:'ITEM_UPDATED',result:'passed',payload:{state:'passed'}},
    ...Array.from({length:21},(_,index)=>({...base,id:`legacy-${index}`,schemaVersion:1,action:'ITEM_CREATED',result:null,payload:{key:'AUDITA',status:'active'}})),
  ];
  const writes:string[]=[],queries:URLSearchParams[]=[],errors:string[]=[];let fail=false;
  page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,params=url.searchParams;
    const send=(json:unknown,status=200)=>route.fulfill({json,status});
    if(path==='/api/personas')return send({personas:[{id:'admin',name:'Admin',role:'admin'}]});
    if(path==='/api/items')return send({items:[system]});
    if(path.endsWith('/history')){
      queries.push(new URLSearchParams(params));
      if(fail)return send({error:'Auditoria temporariamente indisponível.'},503);
      let rows=events.filter(event=>!params.get('q')||event.id.includes(params.get('q')!));
      if(params.get('result'))rows=rows.filter(event=>params.get('result')==='__missing__'?event.result===null:event.result===params.get('result'));
      if(params.get('operation'))rows=rows.filter(event=>'operationId' in event&&event.operationId===params.get('operation'));
      if(params.get('phase'))rows=rows.filter(event=>'phase' in event&&event.phase===params.get('phase'));
      if(params.get('decision'))rows=rows.filter(event=>'decision' in event&&event.decision===params.get('decision'));
      if(params.get('coverage'))rows=rows.filter(event=>event.schemaVersion===(params.get('coverage')==='v2'?2:1));
      if(params.get('direction')==='asc')rows=[...rows].reverse();
      const total=rows.length,page=Math.min(Math.max(1,Number(params.get('page'))||1),Math.max(1,Math.ceil(total/20)));
      return send({events:rows.slice((page-1)*20,page*20),total,page,pageSize:20,totalPages:Math.max(1,Math.ceil(total/20)),asOf:stamp,actors:[{id:worker.id,name:worker.name,type:worker.type}],types:['ITEM_CREATED','ITEM_UPDATED','GITLAB_PROVISIONED','QUALITY_CHECK_COMPLETED'],results:['SUCCEEDED','passed'],phases:['COMPLETED','OBSERVED'],decisions:['REJECTED'],coverage:{description:'Eventos v2 e legados desta fixture; não inclui outras fontes.'}});
    }
    if(path==='/api/collections/items')return send({items:[],total:0,page:1,pageSize:20,totalPages:1,extraCount:0});
    if(path.startsWith('/api/items/'))return send({item:system,ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]});
    return send({});
  });
  return {writes,queries,errors,setFail:(value:boolean)=>{fail=value;}};
}
const history=(page:Page)=>page.getByRole('region',{name:'Histórico e rastreabilidade',exact:true});

test('audit separates execution outcome and domain decision, displays typed changes and safe provenance',async({page})=>{
  const observed=await setup(page);await page.goto('/systems/audit-system?tab=activity');
  const region=history(page),row=region.locator('[data-audit-event="audit-quality"]');
  await expect(row).toBeVisible();await expect(region.getByRole('searchbox')).not.toBeVisible();
  await expect(row.getByText('Concluída',{exact:true})).toBeVisible();await expect(row.locator('.audit-decision')).toContainText('Reprovado');await expect(row.locator('.audit-phase')).toContainText('Conclusão');
  await expect(row.locator('.badge.danger')).toHaveCount(0);await expect(row).toContainText('Ana');await expect(row).toContainText('Scanner local');await expect(row).toContainText('Persona declarada no LAB');await expect(row).toContainText(system.name);
  await row.getByText('Detalhes da ocorrência',{exact:true}).click();
  const diff=row.getByRole('table',{name:'Valores anteriores e novos registrados'});
  await expect(diff).toContainText('pending');await expect(diff).toContainText('ready');await expect(diff).toContainText('Valor nulo');await expect(diff).toContainText('Não existia');await expect(diff).toContainText('Não observado');await expect(diff.getByText('Valor restrito')).toHaveCount(2);
  await expect(row.getByRole('link',{name:'Consultar evidência (nova aba)'})).toHaveAttribute('href','https://gitlab.example.test/sdlc/audita');await expect(row).toContainText('request-audit');await expect(row).toContainText('attempt-audit');
  await expect(row).toContainText('Revisão restrita: restricted-revision-fixture');await expect(row.getByRole('button',{name:'Copiar ID da revisão'})).toBeVisible();await expect(row.getByRole('link',{name:/restricted-revision-fixture/})).toHaveCount(0);
  await expect(region.locator('[data-audit-event="legacy-provisioned"]')).toContainText('Recurso GitLab provisionado');await expect(region.locator('[data-audit-event="legacy-provisioned"]')).toContainText('Legado: resultado não capturado');
  await expect(region.locator('[data-audit-event="legacy-explicit"]')).toContainText('passed');await expect(region.locator('[data-audit-event="legacy-explicit"]')).not.toContainText('resultado não capturado');
  await row.getByRole('link',{name:'Consultar ocorrências desta operação'}).click();await expect(page).toHaveURL(/history.operation=operation-audit/);await expect(region.locator('[data-audit-event]')).toHaveCount(2);await page.reload();await expect(region.locator('[data-audit-event]')).toHaveCount(2);
  expect(observed.writes).toEqual([]);expect(observed.errors).toEqual([]);
});

test('missing-result query is explicit, pages on server, preserves URL and recovers query errors',async({page})=>{
  const observed=await setup(page);await page.goto('/systems/audit-system?tab=activity');const region=history(page);
  await expect(region.locator('[data-audit-event]')).toHaveCount(20);
  await region.getByRole('button',{name:'Próxima',exact:true}).first().click();await expect(page).toHaveURL(/history.page=2/);await expect(region.locator('[data-audit-event]')).toHaveCount(5);
  await region.locator('.experience-filters>summary').click();await region.getByRole('combobox',{name:'Resultado',exact:true}).selectOption('__missing__');await region.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page).toHaveURL(/history.result=__missing__/);await expect(page).toHaveURL(/history.page=1/);await expect(region.locator('[data-audit-event]')).toHaveCount(20);await expect(region.locator('.experience-scope')).toContainText('22 resultados');await expect(region.locator('.experience-scope')).toContainText('Sem resultado explícito');
  expect(observed.queries.at(-1)?.get('result')).toBe('__missing__');expect(observed.queries.at(-1)?.get('asOf')).toBe(stamp);
  await page.reload();await expect(region.locator('.experience-scope')).toContainText('22 resultados');
  observed.setFail(true);await region.getByRole('button',{name:'Quando',exact:true}).click();await expect(region.getByRole('alert')).toContainText('Auditoria temporariamente indisponível');await expect(region.locator('[data-audit-event]')).toHaveCount(20);
  observed.setFail(false);await region.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(region.getByRole('alert')).toHaveCount(0);await expect(region.locator('th[aria-sort=ascending]')).toContainText('Quando');
  expect(observed.writes).toEqual([]);expect(observed.errors).toEqual([]);
});

test('mobile audit keeps the target, action and outcome visible and keyboard opens details without page overflow',async({page})=>{
  const observed=await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/systems/audit-system?tab=activity');
  const region=history(page),row=region.locator('[data-audit-event="audit-quality"]');await expect(row).toBeVisible();await expect(row.getByText('Concluída',{exact:true})).toBeVisible();await expect(row).toContainText(system.name);
  const summary=row.getByText('Detalhes da ocorrência',{exact:true});await summary.focus();await summary.press('Enter');await expect(row.getByRole('heading',{name:'Alterações registradas'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(observed.writes).toEqual([]);expect(observed.errors).toEqual([]);
});
