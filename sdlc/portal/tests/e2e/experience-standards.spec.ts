import {test, expect, type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const stamp='2026-10-24T15:00:00.000Z';
const item=(index:number)=>({id:`ux-system-${index}`,key:`UX${index}`,name:`Produto ${String(index).padStart(2,'0')}`,kind:'system',status:'active',description:'Dados interceptados, exclusivos do teste.',parentId:null,archived:false,version:1,data:{},createdAt:stamp,updatedAt:stamp});
async function setup(page:Page){
 const systems=Array.from({length:40},(_,index)=>item(index));
 const archive={...item(41),id:'ux-archived',name:'Acervo de consulta',archived:true};
 const inactive={...item(40),status:'inactive'};let fail=false,hold:Promise<void>|null=null;
 const events=Array.from({length:125},(_,index)=>({id:`event-${index+1}`,itemId:systems[0].id,actorId:'ana',actorName:'Ana',actorType:'human',action:index===0?'EXECUTION_FAILED':'ITEM_CREATED',message:`Ocorrência registrada ${index+1}`,timestamp:new Date(Date.parse(stamp)-index*1000).toISOString(),result:null,payload:{correlationId:`correlation-${index+1}`}}));
 const errors:string[]=[],writes:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method()))writes.push(request.url());});
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;
  const send=(json:unknown,status=200)=>route.fulfill({json,status});
  if(path==='/api/personas')return send({personas:[{id:'admin',name:'Admin',role:'admin'},{id:'ana',name:'Ana',role:'product_owner'}]});
  if(path==='/api/items')return send({items:[...systems,inactive,archive]});
  if(path==='/api/collections/items'){
   if(hold)await hold;if(fail)return send({error:'Consulta temporariamente indisponível.'},503);
   let rows=url.searchParams.get('kind')==='system'?[...systems,...(url.searchParams.get('includeInactive')==='true'?[inactive,archive]:[])]:[];
   const q=url.searchParams.get('q')||'';rows=rows.filter(row=>`${row.key} ${row.name}`.toLowerCase().includes(q.toLowerCase()));
   if(url.searchParams.get('sort')==='name')rows.sort((a,b)=>a.name.localeCompare(b.name)*(url.searchParams.get('direction')==='desc'?-1:1));
   const total=rows.length,page=Math.min(Math.max(1,Number(url.searchParams.get('page'))||1),Math.max(1,Math.ceil(total/20)));
   return send({items:rows.slice((page-1)*20,page*20),total,page,pageSize:20,totalPages:Math.max(1,Math.ceil(total/20)),extraCount:2});
  }
  if(path.endsWith('/history')){
   if(url.searchParams.get('from')==='invalid')return send({error:'Período de consulta inválido.'},422);
   const q=url.searchParams.get('q')||'';let rows=events.filter(row=>JSON.stringify(row).includes(q));if(url.searchParams.get('direction')==='asc')rows=[...rows].reverse();
   const total=rows.length,page=Math.min(Math.max(1,Number(url.searchParams.get('page'))||1),Math.max(1,Math.ceil(total/20)));
   return send({events:rows.slice((page-1)*20,page*20),total,page,pageSize:20,totalPages:Math.max(1,Math.ceil(total/20)),asOf:stamp,actors:[{id:'ana',name:'Ana',type:'human'}],types:['ITEM_CREATED','EXECUTION_FAILED'],results:[]});
  }
  if(/^\/api\/items\//.test(path))return send({item:path.includes('ux-archived')?archive:systems[0],ancestors:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]});
  return send({});
 });
 return {errors,writes,setFail:(value:boolean)=>{fail=value;},setHold:(value:Promise<void>|null)=>{hold=value;}};
}
const list=(page:Page)=>page.getByTestId('children-list');
async function openFilters(page:Page){const panel=list(page).locator('details');if(!await panel.evaluate(node=>(node as HTMLDetailsElement).open))await panel.locator('summary').click();return panel;}

test('real hierarchy uses collapsed filters, server query paging and sortable headers with keyboard and preserved return',async({page})=>{
 const observed=await setup(page);await page.goto('/systems');await expect(list(page).locator('tbody tr')).toHaveCount(20);
 await expect(list(page).getByRole('searchbox')).not.toBeVisible();await expect(list(page).getByRole('combobox',{name:'Ordenar por'})).toHaveCount(0);
 await list(page).getByRole('button',{name:'Próxima',exact:true}).first().click();await expect(page).toHaveURL(/list.page=2/);
 const header=list(page).getByRole('button',{name:'Nome',exact:true});await header.click();await expect(list(page).locator('th[aria-sort=descending]')).toContainText('Nome');await expect(page).toHaveURL(/list.page=1/);await expect(list(page).locator('tbody tr').first()).toContainText('Produto 39');await expect(header).toBeFocused();await header.press('Enter');await expect(list(page).locator('th[aria-sort=ascending]')).toContainText('Nome');
 await openFilters(page);const input=list(page).getByRole('searchbox');await input.fill('Produto 03');await header.press('Space');await expect(input).toHaveValue('Produto 03');await expect(list(page).locator('tbody tr')).toHaveCount(20);await list(page).getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(list(page).locator('tbody tr')).toHaveCount(1);
 const previous=page.url();await list(page).getByRole('link').first().click();await page.getByRole('navigation',{name:'Localização'}).getByRole('link',{name:'Sistemas',exact:true}).click();await expect(page).toHaveURL(previous);await expect(list(page).locator('tbody tr')).toHaveCount(1);await page.reload();await expect(list(page).locator('tbody tr')).toHaveCount(1);expect(observed.errors).toEqual([]);expect(observed.writes).toEqual([]);
});

test('query loading is animated, failures preserve the confirmed rows and order and retry restores the requested query',async({page})=>{
 const observed=await setup(page);await page.goto('/systems');await expect(list(page).locator('tbody tr')).toHaveCount(20);
 let release!:()=>void;observed.setHold(new Promise<void>(resolve=>{release=resolve;}));await list(page).getByRole('button',{name:'Nome',exact:true}).click();const loading=list(page).locator('[aria-busy=true]');await expect(loading).toBeVisible();await expect(loading.locator('.experience-spinner')).toBeVisible();await expect(list(page).locator('th[aria-sort=ascending]')).toContainText('Nome');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(loading.locator('.experience-spinner')).toHaveCSS('animation-name','none');observed.setFail(true);observed.setHold(null);release();await expect(list(page).getByRole('alert')).toContainText('Consulta temporariamente indisponível');await expect(list(page).locator('tbody tr')).toHaveCount(20);await expect(list(page).locator('th[aria-sort=ascending]')).toContainText('Nome');await expect(list(page).getByRole('alert')).toHaveCSS('color','rgb(178, 61, 50)');observed.setFail(false);await list(page).getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(list(page).getByRole('alert')).toHaveCount(0);await expect(list(page).locator('th[aria-sort=descending]')).toContainText('Nome');expect(observed.errors).toEqual([]);expect(observed.writes).toEqual([]);
});

test('canonical history reaches an old correlation and invalid dates produce a recoverable alert without losing the page',async({page})=>{
 const observed=await setup(page);await page.goto('/systems/ux-system-0?tab=activity');const history=page.getByRole('region',{name:'Histórico e rastreabilidade',exact:true});await expect(history.locator('tbody tr')).toHaveCount(20);await expect(history.locator('.experience-error-inline')).toContainText('EXECUTION FAILED');await history.getByRole('button',{name:'Próxima',exact:true}).first().click();await expect(history.getByRole('navigation',{name:'Paginação do histórico',exact:true})).toContainText('21–40 de 125');await history.locator('summary').first().click();await history.getByRole('searchbox').fill('correlation-101');await history.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(history.locator('tbody tr')).toHaveCount(1);await history.locator('tbody summary').click();await expect(history).toContainText('event-101');await page.goto('/systems/ux-system-0?tab=activity&history.from=invalid');await expect(history.getByRole('alert')).toContainText('Período de consulta inválido');expect(observed.errors).toEqual([]);expect(observed.writes).toEqual([]);
});

test('archived consultation preserves its query across tabs and mobile tables remain within their scroll region',async({page})=>{
 const observed=await setup(page);await page.goto('/systems/ux-archived?list.q=guardado');await expect(page.getByRole('heading',{name:'Acervo de consulta'})).toBeVisible();await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Auditoria',exact:true}).click();await expect(page).toHaveURL(/list.q=guardado/);await page.getByRole('navigation',{name:'Seções de Sistema'}).getByRole('link',{name:'Projetos',exact:true}).click();await expect(page).toHaveURL(/list.q=guardado/);await expect(page.getByTestId('create-item')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.goto('/systems');await expect(list(page).locator('tbody tr')).toHaveCount(20);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const directory=process.env.SCREENSHOT_DIR||'test-results/screenshots';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/real-experience-systems-mobile.png`,fullPage:true});expect(observed.errors).toEqual([]);expect(observed.writes).toEqual([]);
});
