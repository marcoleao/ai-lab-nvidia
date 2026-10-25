import {expect,type Page} from '@playwright/test';
export async function mockPersonas(page:Page){await page.route('**/api/personas',route=>route.fulfill({json:{personas:[{id:'admin',name:'Administrador',role:'admin'},{id:'ana',name:'Ana',role:'product_owner'},{id:'bruno',name:'Bruno',role:'architect'},{id:'carla',name:'Carla',role:'qa_lead'},{id:'diego',name:'Diego',role:'security_lead'},{id:'elisa',name:'Elisa',role:'release_manager'}]}}));}
// Explicit browser snapshots; workflow/gate rules remain covered by real API tests.
export function uiJourney(item:any,run:any,view:Record<string,any>){return {story:item,selectedItem:item,nextAction:null,secondaryActions:[],tasks:[],activities:[],events:[],run,signals:{lastEventAt:null,lastHeartbeatAt:null,heartbeatStaleAfterMs:45000},permissions:{canAct:true},chat:{mode:null,enabled:false},...view,current:{phase:item.status.replaceAll('_',' ').toUpperCase(),kind:'coding',state:'not_started',title:'Atividade de teste',...view.current}};}
export function uiAction(id:string,label:string,path:string,body:Record<string,unknown>={},confirmation?:{title:string;description:string;checkboxLabel:string}){return {id,label,enabled:true,path,method:'POST',body,...(confirmation?{confirmation}:{})};}
export async function openWorkPanel(page:Page){
  const process=page.getByTestId('story-process');
  const kind=new URL(page.url()).pathname.startsWith('/tasks/')?'Tarefa':'História';
  await expect(async()=>{
   if(!await process.isVisible()){
    await page.getByRole('navigation',{name:`Seções de ${kind}`}).getByRole('link',{name:'Execução',exact:true}).click({timeout:1000});
   }
   await expect(process).toBeVisible({timeout:1000});
  }).toPass({timeout:10000});
  await expect(page.getByTestId('story-interaction')).toHaveCount(0);
  return process;
}

// Browser-only collection responses. The SQL contract is exercised by the API suite.
export async function mockTaskCollection(page:Page,getTasks:()=>any[]){
 await page.route(url=>url.pathname==='/api/collections/items',async route=>{
  const query=new URL(route.request().url()).searchParams;if(query.get('kind')!=='task')return route.fallback();
  expect(route.request().method()).toBe('GET');const all=getTasks(),term=(query.get('q')||'').toLocaleLowerCase('pt-BR'),status=query.get('status'),ids=query.get('ids')?.split(',');
  // Match the real API: absence means all statuses; an explicit empty value is invalid.
  if(query.has('status')&&!['todo','doing','done'].includes(status!))return route.fulfill({status:422,json:{error:{code:'VALIDATION_FAILED',message:'Confira os campos informados.'}}});
  const filtered=all.filter(task=>(!task.parentId||task.parentId===query.get('parentId'))&&(!term||`${task.key} ${task.name}`.toLocaleLowerCase('pt-BR').includes(term))&&(!status||task.status===status)&&(!ids||ids.includes(task.id)));
  const sort=query.get('sort')||'createdAt',direction=query.get('direction')==='asc'?1:-1;
  filtered.sort((a,b)=>String(a[sort]||'').localeCompare(String(b[sort]||''),'pt-BR',{numeric:true})*direction||String(a.id).localeCompare(String(b.id)));
  const total=filtered.length,page=Math.min(Math.max(1,Number(query.get('page'))||1),Math.max(1,Math.ceil(total/20)));
  return route.fulfill({json:{items:filtered.slice((page-1)*20,page*20),total,page,pageSize:20,totalPages:Math.max(1,Math.ceil(total/20)),extraCount:0,query:Object.fromEntries(query)}});
 });
}
