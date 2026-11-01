import {expect,type Page} from '@playwright/test';
export async function mockPersonas(page:Page){await page.route('**/api/personas',route=>route.fulfill({json:{personas:[{id:'admin',name:'Administrador',role:'admin'},{id:'ana',name:'Ana',role:'product_owner'},{id:'bruno',name:'Bruno',role:'architect'},{id:'carla',name:'Carla',role:'qa_lead'},{id:'diego',name:'Diego',role:'security_lead'},{id:'elisa',name:'Elisa',role:'release_manager'}]}}));}
// Explicit browser snapshots; workflow/gate rules remain covered by real API tests.
export function uiJourney(item:any,run:any,view:Record<string,any>){return {story:item,selectedItem:item,nextAction:null,secondaryActions:[],tasks:[],activities:[],events:[],run,signals:{lastEventAt:null,lastHeartbeatAt:null,heartbeatStaleAfterMs:45000},permissions:{canAct:true},chat:{mode:null,enabled:false},...view,current:{phase:item.status.replaceAll('_',' ').toUpperCase(),kind:'coding',state:'not_started',title:'Atividade de teste',...view.current}};}
export function uiAction(id:string,label:string,path:string,body:Record<string,unknown>={},confirmation?:{title:string;description:string;checkboxLabel:string}){return {id,label,enabled:true,path,method:'POST',body,...(confirmation?{confirmation}:{})};}
type WorkView='action'|'conversation'|'processing'|'administration'|'destination'|'delivery'|'release'|'specification';
export async function openWorkPanel(page:Page,view:WorkView='action'){
  const process=page.getByTestId('story-process');
  const kind=new URL(page.url()).pathname.startsWith('/tasks/')?'Tarefa':'História';
  if(kind==='História'){
   const url=new URL(page.url()),id=url.pathname.split('/')[2],base=`/stories/${id}/execution`;
   const target=view==='destination'?page.getByRole('region',{name:'Destino da implementação',exact:true}):view==='delivery'||view==='release'?page.getByRole('region',{name:'Entrega de código e release',exact:true}):view==='specification'?page.getByRole('region',{name:'Especificação da História',exact:true}):process;
   const matches=()=>new URL(page.url()).pathname.startsWith(view==='action'?`${base}/actions/`:`${base}/${view}`);
   if(matches()&&await target.isVisible())return target;
   await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Execução',exact:true}).click();
   const actions=page.getByRole('region',{name:'O que você pode fazer agora',exact:true});
   await expect(actions).toBeVisible();
   await expect(actions).not.toContainText('Consultando as próximas ações…');
   if(view==='action'){
    const primary=actions.locator(`a.primary[href^="${base}/actions/"]:visible`);
    if(await primary.first().isVisible()){
     await primary.first().click();
    }else{
     // A blocked or absent action has no executable hub link. Resolve its real
     // current id through the supported GET redirect, without changing data.
     const query=new URLSearchParams(new URL(page.url()).search);
     query.set('tab','planning');query.set('process','action');
     await page.goto(`/stories/${id}?${query}`);
    }
   }else{
    const events=page.getByTestId('story-execution-hub').locator('.story-execution-events');
    if(await events.getAttribute('open')===null)await events.locator('summary').click();
    await events.getByRole('link',{name:'Consultar sinais e evidências →',exact:true}).click();
    if(view!=='processing'){
     const labels:Record<Exclude<WorkView,'action'|'processing'|'specification'>,string>={conversation:'Conversar sobre esta etapa',administration:'Escopo das Tarefas',destination:'Repositório do Sistema',delivery:'Entrega de código e release',release:'Release planejada'};
     if(view==='specification'){
      const query=new URLSearchParams(new URL(page.url()).search);
      await page.goto(`${base}/specification${query.size?'?'+query:''}`);
     }else await page.getByRole('navigation',{name:'Detalhes da execução',exact:true}).getByRole('button',{name:labels[view],exact:true}).click();
    }
   }
   await expect(page).toHaveURL(value=>view==='action'?value.pathname.startsWith(`${base}/actions/`):value.pathname===`${base}/${view}`);
   await expect(target).toBeVisible();
   await expect(page.getByTestId('story-interaction')).toHaveCount(0);
   return target;
  }
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
