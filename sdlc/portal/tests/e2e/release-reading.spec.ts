import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {uiJourney,mockTaskCollection,mockPersonas} from './journey-fixtures';

async function fixture(page:Page,compositionStatus:string){
 const now='2026-10-27T12:00:00Z',system={id:'reading-system',kind:'system',key:'READNG',name:'Sistema da leitura',status:'active',version:1,archived:false},story={id:'reading-story',kind:'story',key:'READ-1',name:'História da leitura',status:'coding',version:3,description:'Fixture isolada',archived:false,parentId:'epic',data:{},createdAt:now,updatedAt:now};
 const release={id:'reading-release',key:'REL-READ',name:'Release da leitura',systemId:system.id,system,compositionStatus,flowEnvironment:'DEV',version:2,storyCount:1,createdAt:now,updatedAt:now};
 const assignment={releaseId:release.id,releaseName:release.name,releaseVersion:2,storyVersion:3,compositionStatus,flowEnvironment:'DEV'};
 const state={writes:[] as string[],failDetail:false,failStory:false};
 await mockPersonas(page);await mockTaskCollection(page,()=>[]);
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;if(req.method()!=='GET'){state.writes.push(req.method()+' '+path);return route.abort();}
  if(path==='/api/personas'||path==='/api/collections/items')return route.fallback();
  if(path==='/api/systems/'+system.id+'/environments')return route.fulfill({json:{system,environments:['DEV','QA','HML','PRD'].map(code=>({code}))}});
  if(path.endsWith('/history'))return route.fulfill({json:{events:[],total:0,page:1,pageSize:20,totalPages:1,asOf:now}});
  if(path==='/api/releases'){
   const matches=!url.searchParams.get('compositionStatus')||url.searchParams.get('compositionStatus')===compositionStatus;
   return route.fulfill({json:{releases:matches?[release]:[],systems:[system],counts:{OPEN:0,CLOSED:0,CANCELED:0,[compositionStatus]:1,total:1},pagination:{page:1,pageSize:20,total:matches?1:0,totalPages:1}}});
  }
  if(path==='/api/releases/'+release.id){if(state.failDetail)return route.fulfill({status:503,json:{error:{message:'Consulta da release indisponível no ensaio.'}}});return route.fulfill({json:{release,stories:[{...story,plannedVersion:3,currentVersion:3,pendingReasons:[]}],history:[]}});}
  if(path==='/api/items/'+story.id+'/release'){if(state.failStory)return route.fulfill({status:503,json:{error:{message:'Consulta da associação indisponível no ensaio.'}}});return route.fulfill({json:{story,assignment,releases:compositionStatus==='OPEN'?[release]:[],system,truncated:false,totalChoices:compositionStatus==='OPEN'?1:0}});}
  if(path==='/api/items/'+story.id+'/journey')return route.fulfill({json:uiJourney(story,null,{current:{phase:'CODING',state:'not_started',title:'Leitura da História'}})});
  if(path==='/api/items/'+story.id)return route.fulfill({json:{item:story,ancestors:[system],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}});
  return route.fulfill({json:{}});
 });return state;
}
const situation=(page:Page)=>page.getByTestId('release-situation').filter({visible:true});
async function check(page:Page,compositionStatus:string){
 const view=situation(page);await expect(view).toHaveCount(1);
 await expect(view.locator('dt')).toHaveText(['Estado da release','Candidata e artefatos','Ambiente do fluxo','Implantação','Validação']);
 await expect(view).toContainText('Sem evidência de implantação disponível');await expect(view).toContainText('Sem evidência de validação disponível');
 await expect(view).toContainText(({OPEN:'OPEN · Aberta',CLOSED:'CLOSED · Fechada',CANCELED:'CANCELED · Cancelada'} as Record<string,string>)[compositionStatus]);await expect(view).toContainText('DEV ·');await expect(view).not.toContainText('Legado');
 await expect(page.locator('.real-release-path')).toHaveCount(0);await expect(page.getByText('Pacote fechado',{exact:true})).toHaveCount(0);
}
for(const compositionStatus of ['OPEN','CLOSED','CANCELED'])test(`RA-01 ${compositionStatus} keeps independent dimensions through Release and Story navigation without writes`,async({page})=>{
 const state=await fixture(page,compositionStatus);await page.goto(`/releases?system=reading-system&compositionStatus=${compositionStatus}&sort=compositionStatus&direction=asc`);await check(page,compositionStatus);
 await expect(page).toHaveURL(url=>url.searchParams.get('compositionStatus')===compositionStatus&&url.searchParams.get('sort')==='compositionStatus');
 await page.getByTestId('release-card').click();await check(page,compositionStatus);await page.reload();await check(page,compositionStatus);
 await page.locator('#release-stories').getByRole('link').click();await expect(page).toHaveURL(url=>url.pathname==='/stories/reading-story');await check(page,compositionStatus);
 await page.getByRole('link',{name:/Consultar Release da leitura/}).click();await check(page,compositionStatus);expect(state.writes).toEqual([]);
});
test('RA-01 mobile composition refresh failure preserves the last confirmed reading and never replaces it with a successful result',async({page})=>{
 const state=await fixture(page,'CLOSED');await page.setViewportSize({width:390,height:844});await page.goto('/releases/reading-release');await check(page,'CLOSED');
 state.failDetail=true;await page.getByRole('button',{name:'Atualizar consulta',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Consulta da release indisponível'})).toBeVisible();await expect(situation(page)).toContainText('A situação atual não foi confirmada');await check(page,'CLOSED');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const folder=process.env.SCREENSHOT_DIR||'test-results/screenshots';mkdirSync(folder,{recursive:true});await page.screenshot({path:`${folder}/release-composition-mobile-error.png`,fullPage:true});
 state.failDetail=false;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Consulta da release indisponível'})).toHaveCount(0);await check(page,'CLOSED');expect(state.writes).toEqual([]);
 await page.screenshot({path:`${folder}/release-composition-mobile.png`,fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${folder}/release-composition-desktop.png`,fullPage:true});
});


test('unknown release state and destination stay unconfirmed, without OPEN or DEV fallback',async({page})=>{
 const state=await fixture(page,'unknown');await page.goto('/releases/reading-release');
 const view=situation(page);await expect(view).toContainText('Estado da release não confirmado');await expect(view).toContainText('Ambiente do fluxo não confirmado');await expect(view).not.toContainText('OPEN · Aberta');expect(state.writes).toEqual([]);
});
