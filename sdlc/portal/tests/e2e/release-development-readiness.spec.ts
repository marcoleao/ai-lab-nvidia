import { expectFooterPagination } from './pagination-assertions';
import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import type {ReleaseDevelopmentReadiness as Reading,ReleaseDevelopmentStory as Story} from '../../packages/shared/src/release-development-readiness';
import {mockPersonas} from './journey-fixtures';

const stamp='2026-10-31T16:00:00.000Z',releaseId='readiness-release',system={id:'readiness-system',key:'READQA',name:'Sistema da conferência'};
const panel=(page:Page)=>page.getByRole('region',{name:'Conferência para QA',exact:true});
const row=(n:number,ready=true):Story=>({id:'story-'+n,key:'DEV-'+String(n).padStart(2,'0'),name:'História '+n,state:ready?'ready':'blocked',development:{state:ready?'valid':'not_recorded',label:ready?'Desenvolvimento Finalizado':'Sem aprovação registrada',matchesComposition:ready,approval:ready?{id:'approval-'+n,number:1,actorName:'Ana',createdAt:stamp}:null},references:{specificationId:'spec-'+n,executionId:'run-'+n,sourceSha:'a'.repeat(40),integrationReferenceId:'merge-'+n,integrationSha:'b'.repeat(40)},reasons:ready?[]:[{code:'DEVELOPMENT_NOT_RECORDED',state:'blocked',message:'Desenvolvimento Finalizado ainda não foi aprovado.',action:{label:'Revisar desenvolvimento da História',href:`/stories/story-${n}?tab=planning&process=environment&environment=DEV`}}]});
async function fixture(page:Page){
 const state={rows:Array.from({length:21},(_,n)=>row(n+1,n!==20)),digest:'a'.repeat(64),compositionId:'composition-1',detailCompositionId:'composition-1',readingVersion:3,detailVersion:3,readingStatus:'OPEN',detailStatus:'OPEN',partial:false,fail:false,failDetail:false,hold:false,releaseHeld:()=>{},held:false,writes:[] as string[],errors:[] as string[],queries:[] as string[]};
 const release=(id=releaseId)=>({id,key:id===releaseId?'REL-QA':'REL-OTHER',name:id===releaseId?'Conferência da release':'Outra release',systemId:system.id,system,compositionStatus:state.detailStatus,flowEnvironment:'DEV',version:state.detailVersion,storyCount:state.rows.length,createdAt:stamp,updatedAt:stamp});
 const summaryStory=(s:Story)=>({...s,status:'testing',version:3,plannedVersion:3,currentVersion:3,projectId:'readiness-project',projectName:'Projeto',epicId:'readiness-epic',epicName:'Épico',assignment:{releaseId,releaseName:'Conferência da release',releaseVersion:3,storyVersion:3},currentRevisionUnassigned:false,ready:false,pendingReasons:[],referenceToken:'1'.repeat(64)});
 const fresh={...summaryStory(row(22,false)),id:'new-story',key:'NOVO-1',name:'Nova História escolhida',assignment:null};
 const view=(id:string,url:URL):Reading=>{
  const filter=(url.searchParams.get('filter')||'issues') as Reading['query']['filter'],search=url.searchParams.get('search')||'',sort=(url.searchParams.get('sort')||'key') as 'key'|'name',direction=(url.searchParams.get('direction')||'asc') as 'asc'|'desc';
  const rows=state.rows.filter(v=>(filter==='all'||filter==='issues'&&v.state!=='ready'||filter===v.state)&&(!search||(v.key+' '+v.name).toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>(a[sort].localeCompare(b[sort])||a.id.localeCompare(b.id))*(direction==='asc'?1:-1));
  const totalPages=Math.max(1,Math.ceil(rows.length/20)),page=Math.min(Number(url.searchParams.get('page')||1),totalPages),blocked=state.rows.filter(v=>v.state==='blocked').length,unconfirmed=state.rows.filter(v=>v.state==='unconfirmed').length;
  return {policy:'release-development-readiness-v1',release:{...release(id),version:state.readingVersion,compositionStatus:state.readingStatus},composition:{id:state.compositionId,number:2,digest:'c'.repeat(64),storyCount:state.rows.length},evaluation:{digest:state.digest,asOf:stamp,complete:true},state:blocked?'blocked':unconfirmed?'unconfirmed':state.rows.length?'ready':'empty',summary:{total:state.rows.length,developmentApproved:state.rows.filter(v=>v.development.state==='valid').length,ready:state.rows.filter(v=>v.state==='ready').length,blocked,unconfirmed},reasons:[],coverage:'Fontes registradas. Não inventaria HEAD ou código extra, não fecha release e não prepara candidata QA.',qaPreparationAvailable:false,stories:rows.slice((page-1)*20,page*20),pagination:{page,pageSize:20,total:rows.length,totalPages},query:{page,filter,search,sort,direction}};
 };
 await mockPersonas(page);page.on('pageerror',error=>state.errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(req.method()!=='GET'){state.writes.push(req.method()+' '+path);return route.fulfill({status:405,json:{error:{message:'Somente consulta no cenário isolado.'}}});}
  if(path==='/api/personas')return route.fallback();
  if(path.endsWith('/development-readiness')){
   state.queries.push(url.search);const id=path.split('/')[3];
   if(state.fail)return route.fulfill({status:503,json:{error:{message:'Fonte temporariamente indisponível no ensaio.'}}});
   if(url.searchParams.has('expectedEvaluationDigest')&&url.searchParams.get('expectedEvaluationDigest')!==state.digest||url.searchParams.has('expectedCompositionId')&&url.searchParams.get('expectedCompositionId')!==state.compositionId)return route.fulfill({status:409,json:{error:{message:'A composição ou suas evidências mudaram. Atualize a conferência integral.'}}});
   const value=view(id,url);
   if(state.hold&&id===releaseId){state.held=true;await new Promise<void>(resolve=>{state.releaseHeld=resolve;});}
   try{return await route.fulfill({json:state.partial?{...value,summary:undefined}:value});}catch{return;}
  }
  if(/^\/api\/releases\/[^/]+$/.test(path)){
   if(state.failDetail)return route.fulfill({status:503,json:{error:{message:'Dados da release indisponíveis.'}}});
   return route.fulfill({json:{release:release(path.split('/')[3]),composition:{id:state.detailCompositionId,number:2},stories:state.rows.map(summaryStory),history:[],capabilities:{cancellationAvailable:false,developmentReadinessAvailable:true}}});
  }
  if(path.endsWith('/stories'))return route.fulfill({json:{release:release(),stories:[fresh],selectedItems:state.rows.map(summaryStory),selectedIds:state.rows.map(v=>v.id),projects:[{id:'readiness-project',name:'Projeto'}],epics:[{id:'readiness-epic',name:'Épico',projectId:'readiness-project'}],pagination:{page:1,pageSize:20,total:1,totalPages:1},truncated:false,total:1}});
  if(path.endsWith('/composition-revisions'))return route.fulfill({json:{items:[{id:'old-composition',releaseId,number:1,releaseRecordVersion:1,compositionStatus:'OPEN',source:'planned',storyCount:0,actorName:'Ana',createdAt:stamp,digest:'d'.repeat(64)}],pagination:{page:1,pageSize:20,total:1,totalPages:1},asOf:stamp,currentRevisionId:state.compositionId}});
  if(path.endsWith('/composition-revisions/old-composition'))return route.fulfill({json:{revision:{id:'old-composition',releaseId,number:1,releaseRecordVersion:1,compositionStatus:'OPEN',source:'planned',storyCount:0,actorName:'Ana',createdAt:stamp,digest:'d'.repeat(64)},stories:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},isCurrent:false}});
  if(path.endsWith('/history'))return route.fulfill({json:{events:[],page:1,pageSize:20,total:0,totalPages:1,asOf:stamp}});
  return route.fulfill({json:{}});
 });return state;
}
async function open(page:Page,width:number,query=''){
 await page.setViewportSize({width,height:1000});await page.goto(`/releases/${releaseId}?tab=composition&picker.project=readiness-project&history.q=keep-history${query?'&'+query:''}`);
 await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();
}
async function details(page:Page){const summary=panel(page).getByText(/^Consultar Histórias e impedimentos/);await summary.focus();await summary.press('Enter');}
function clean(state:Awaited<ReturnType<typeof fixture>>){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
async function capture(page:Page,name:string){const folder=process.env.SCREENSHOT_DIR||'/tmp';mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/${name}.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

for(const width of [1440,390]){
 test(`RA15 whole composition remains blocked outside page and filter at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);await details(page);const p=panel(page);
  await expect(p.getByRole('link',{name:'DEV-21 · História 21',exact:true})).toBeVisible();
  await p.getByRole('combobox',{name:'Histórias consultadas',exact:true}).selectOption('all');await p.getByRole('button',{name:'Aplicar filtros da conferência',exact:true}).click();
  await expect(p.getByText('Há impedimentos na composição',{exact:true})).toBeVisible();await expect(p.getByRole('link',{name:'DEV-21 · História 21',exact:true})).toHaveCount(0);
  await expectFooterPagination(p.locator('.experience-pagination'),p.locator('ol.release-composition-list'));
  await p.getByRole('navigation',{name:'Paginação de Histórias na conferência',exact:true}).getByRole('button',{name:'Próxima',exact:true}).click();await expect(p.getByRole('link',{name:'DEV-21 · História 21',exact:true})).toBeVisible();
  await p.getByRole('textbox',{name:'Buscar História na conferência',exact:true}).fill('DEV-01');await p.getByRole('button',{name:'Aplicar filtros da conferência',exact:true}).click();await expect(p.getByRole('link',{name:'DEV-01 · História 1',exact:true})).toBeVisible();await expect(p.getByText('Há impedimentos na composição',{exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('picker.project')).toBe('readiness-project');expect(new URL(page.url()).searchParams.get('history.q')).toBe('keep-history');await capture(page,`ra15-filter-${width}`);clean(state);
 });
 test(`RA15 all approved and empty never claim QA package or deployment at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);state.rows=state.rows.map((_,index)=>row(index+1));state.digest='b'.repeat(64);await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();
  await expect(panel(page).getByText('Requisitos de desenvolvimento atendidos',{exact:true})).toBeVisible();await expect(panel(page).getByRole('button',{name:/Preparar QA|Promover/})).toHaveCount(0);await expect(panel(page)).not.toContainText('Release pronta para QA');
  state.rows=[];state.digest='c'.repeat(64);await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page).getByText('Sem Histórias para conferir',{exact:true})).toBeVisible();await capture(page,`ra15-empty-${width}`);clean(state);
 });
 test(`RA15 failed refresh preserves dated evidence without current ready label at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);state.rows=state.rows.map((_,index)=>row(index+1));await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page).getByText('Requisitos de desenvolvimento atendidos',{exact:true})).toBeVisible();state.fail=true;
  await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page)).toContainText('Fonte temporariamente indisponível');await expect(panel(page).getByText('Situação atual não confirmada',{exact:true})).toBeVisible();await expect(panel(page)).toContainText('Última consulta preservada');await expect(panel(page).getByText('Requisitos de desenvolvimento atendidos',{exact:true})).not.toBeVisible();await capture(page,`ra15-stale-${width}`);clean(state);
 });
 test(`RA15 incomplete successful response preserves the prior reading without crashing at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);state.partial=true;await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page)).toContainText('A resposta da conferência está incompleta');await expect(panel(page).getByText('Situação atual não confirmada',{exact:true})).toBeVisible();await expect(panel(page)).toContainText('21 Histórias no conjunto');state.partial=false;await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();clean(state);
 });
 test(`RA15 new release state with the same composition requires page refresh at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);state.readingVersion=4;state.readingStatus='CANCELED';await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page)).toContainText('A release ou a composição consultada difere da página');await expect(panel(page).getByText('Situação atual não confirmada',{exact:true})).toBeVisible();state.detailVersion=4;state.detailStatus='CANCELED';await panel(page).getByRole('button',{name:'Atualizar dados da release',exact:true}).click();await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Escolher Histórias',exact:true})).toHaveCount(0);clean(state);
 });
 test(`RA15 changed evidence rejects anchored paging and refresh retains independent URL context at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width,'qaReadiness.filter=all');await expect(panel(page).getByRole('combobox',{name:'Histórias consultadas',exact:true})).toBeVisible();state.digest='b'.repeat(64);
  await panel(page).getByRole('navigation',{name:'Paginação de Histórias na conferência',exact:true}).getByRole('button',{name:'Próxima',exact:true}).click();await expect(panel(page)).toContainText('A composição ou suas evidências mudaram');await expect(panel(page).getByText('Situação atual não confirmada',{exact:true})).toBeVisible();
  await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('qaReadiness.page')).toBe('1');expect(new URL(page.url()).searchParams.get('picker.project')).toBe('readiness-project');clean(state);
 });
 test(`RA15 mismatch updates page context without treating history as the current gate at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width,'composition.revision=old-composition');await expect(page.getByRole('region',{name:'Revisão da composição consultada',exact:true})).toContainText('Revisão anterior preservada');await expect(panel(page)).toContainText('revisão 2');
  state.compositionId='composition-2';await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page)).toContainText('A release ou a composição consultada difere da página');await expect(panel(page).getByText('Situação atual não confirmada',{exact:true})).toBeVisible();
  state.detailCompositionId='composition-2';await panel(page).getByRole('button',{name:'Atualizar dados da release',exact:true}).click();await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('composition.revision')).toBe('old-composition');clean(state);
 });
 test(`RA15 late response from another release cannot replace its identity at ${width}px`,async({page})=>{
  const state=await fixture(page);state.hold=true;await page.setViewportSize({width,height:1000});await page.goto(`/releases/${releaseId}`);await expect.poll(()=>state.held).toBe(true);
  await page.goto('/releases/other-release');await expect(page.getByRole('heading',{name:'REL-OTHER · Outra release',exact:true})).toBeVisible();state.releaseHeld();await expect(panel(page).getByText('Há impedimentos na composição',{exact:true})).toBeVisible();await expect(panel(page)).not.toContainText('REL-QA');clean(state);
 });
 test(`RA15 query refresh preserves an unsaved composition selection at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);await page.getByRole('combobox',{name:/Persona/}).selectOption('elisa');await page.getByRole('link',{name:'Escolher Histórias',exact:true}).click();
  const choice=page.getByRole('checkbox',{name:/NOVO-1/});await choice.check();await expect(page.getByText('22 escolhidas, ainda não salvas',{exact:false})).toBeVisible();await page.getByRole('link',{name:'Voltar ao detalhe',exact:true}).click();
  await panel(page).getByRole('button',{name:'Atualizar conferência',exact:true}).click();await expect(panel(page)).toContainText('21 Histórias no conjunto');await page.getByRole('link',{name:'Escolher Histórias',exact:true}).click();await expect(choice).toBeChecked();await expect(page.getByText('22 escolhidas, ainda não salvas',{exact:false})).toBeVisible();clean(state);
 });
}
