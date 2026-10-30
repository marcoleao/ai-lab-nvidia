import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {uiJourney,uiAction,openWorkPanel,mockTaskCollection,mockPersonas} from './journey-fixtures';

test('quality phases precede merge, expose findings and require an explicit AI correction',async({page})=>{
 await mockPersonas(page);
 const now=new Date().toISOString(),sha='a'.repeat(40),base='b'.repeat(40);
 const item={id:'quality-ui',kind:'story',name:'Verificações antes da integração',key:'QUALITY-UI',status:'coding',version:1,description:'Somente teste isolado',archived:false,parentId:null,data:{},createdAt:now,updatedAt:now};
 const run={id:'quality-run-ui',state:'succeeded',stage:'completed',error:null,branch:'sdlc/story-ui',commitSha:sha,mergeRequestUrl:'http://gitlab/service/-/merge_requests/1',createdAt:now,updatedAt:now};
 const review={...item,id:'review-ui-task',kind:'task',parentId:item.id,name:'Realizar Code Review',key:'CR-UI',status:'todo'},scan={...item,id:'scan-ui-task',kind:'task',parentId:item.id,name:'Executar Security Scan',key:'SS-UI',status:'todo'};
 await mockTaskCollection(page,()=>[review,scan]);
 const checks:any[]=[];let merged=0,corrections=0,complete=false;
 let view:any={current:{kind:'code_review',state:'not_started',title:'Code Review precisa ser iniciado',taskId:review.id},nextAction:uiAction('code_review','Executar Code Review','/api/executions/quality-run-ui/quality',{kind:'code_review',expectedVersion:1,expectedSha:sha})};
 const activity=(kind:string,task:any)=>({id:kind,kind,label:kind==='code_review'?'Code Review':'Security Scan',taskId:task.id,state:checks.find(c=>c.kind===kind)?.state||'not_started',attempts:checks.filter(c=>c.kind===kind).map(c=>({...c,sha,createdAt:now,events:[]}))});
 for(const selected of[item,review,scan]){
  await page.route(url=>url.pathname===`/api/items/${selected.id}`,r=>r.fulfill({json:{item:selected,ancestors:selected.kind==='task'?[item]:[],children:[],repositories:[],availableRepositories:[],environments:[],history:[]}}));
  await page.route(`**/api/items/${selected.id}/journey`,r=>{
   if(complete&&checks[0]?.state==='queued'){
    const c=checks[0];c.state=c.kind==='code_review'?'passed':'blocked';c.summary=c.kind==='code_review'?'Revisão concluída sem achados.':'Um achado LOW impede o avanço.';c.findings=c.kind==='security_scan'?[{path:'app.js',line:1,severity:'LOW',message:'Remover configuração insegura.'}]:[];c.evidence={engine:c.kind==='security_scan'?'semgrep':'local-llm',version:'1.181.0',scope:'SAST e segredos'};c.finishedAt=now;complete=false;
    if(c.kind==='code_review'){review.status='done';view={current:{kind:'security_scan',state:'not_started',title:'Security Scan precisa ser iniciado',taskId:scan.id},nextAction:uiAction('security_scan','Executar Security Scan','/api/executions/quality-run-ui/quality',{kind:'security_scan',expectedVersion:item.version,expectedSha:sha})};}
    else view={current:{kind:'security_scan',state:'blocked',title:'Security Scan encontrou achados; correção necessária',message:c.summary,taskId:scan.id},nextAction:uiAction('correct','Solicitar correção à IA','/api/executions/quality-run-ui/quality/correct',{checkId:c.id,expectedVersion:item.version,expectedSha:sha},{title:'Autorizar correção dos achados',description:'Nova revisão exige Code Review e Security Scan novamente.',checkboxLabel:'Autorizo corrigir os achados preservando o escopo aprovado.'})};
   }
   return r.fulfill({json:uiJourney(item,run,{...view,tasks:[{...review,managed:true},{...scan,managed:true}],activities:[activity('code_review',review),activity('security_scan',scan)]})});
  });
 }
 await page.route('**/api/items/quality-ui/execution',r=>r.fulfill({json:{run,configured:true}}));
 await page.route('**/api/executions/quality-run-ui/merge',r=>{if(r.request().method()==='POST')merged++;return r.fulfill({json:{operation:null,configured:true}});});
 await page.route('**/api/executions/quality-run-ui/quality',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{checks,configured:true}});
  const body=r.request().postDataJSON();expect(body.expectedSha).toBe(sha);expect(body.expectedVersion).toBe(item.version);expect(r.request().headers()['x-persona']).toBe('admin');item.version++;item.status=body.kind;
  checks.unshift({id:'check-'+checks.length,kind:body.kind,state:'queued',sha,baseSha:base,summary:null,error:null,findings:[],evidence:null,createdAt:now,finishedAt:null});
  view={current:{kind:body.kind,state:'queued',title:'Verificação recebida; aguardando executor',taskId:body.kind==='code_review'?review.id:scan.id}};return r.fulfill({json:{checkId:checks[0].id}});
 });
 await page.route('**/api/executions/quality-run-ui/quality/correct',r=>{corrections++;expect(r.request().postDataJSON()).toMatchObject({expectedSha:sha,checkId:checks[0].id});return r.fulfill({json:{queued:true}});});
 await page.goto('/stories/quality-ui');await page.locator('.persona select').selectOption('admin');const panel=await openWorkPanel(page);
 await expect(panel).toContainText('Code Review precisa ser iniciado');await expect(page.getByRole('button',{name:'Solicitar merge ao assistente',exact:true})).toHaveCount(0);expect(merged).toBe(0);
 await panel.getByRole('button',{name:'Executar Code Review',exact:true}).click();await expect(page.getByTestId('story-journey-header')).toContainText('Na fila');complete=true;
 await expect(panel.getByRole('button',{name:'Executar Security Scan',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Solicitar merge ao assistente',exact:true})).toHaveCount(0);
 await panel.getByRole('button',{name:'Executar Security Scan',exact:true}).click();complete=true;await expect(panel).toContainText('Um achado LOW impede');
 await page.goto(`/tasks/${scan.id}`);await expect(page.getByRole('region',{name:'Achados desta tentativa'})).toContainText('app.js:1');await expect(page.getByRole('region',{name:'Achados desta tentativa'})).toContainText('Remover configuração insegura');
 const taskPanel=await openWorkPanel(page);await taskPanel.getByRole('button',{name:'Solicitar correção à IA',exact:true}).click();expect(corrections).toBe(0);await taskPanel.getByRole('checkbox',{name:/Autorizo corrigir os achados/}).check();await taskPanel.getByRole('button',{name:'Confirmar: Solicitar correção à IA',exact:true}).click();expect(corrections).toBe(1);expect(merged).toBe(0);
 const directory=process.env.SCREENSHOT_DIR??'test-results/screenshots';mkdirSync(directory,{recursive:true});await page.screenshot({path:`${directory}/quality-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${directory}/quality-mobile.png`,fullPage:true});
});

test('quality metrics provide weekly results, severity and correction cycles inside the compact dashboard',async({page})=>{
 await page.goto('/#dashboard-merges');await page.getByRole('button',{name:'Code Review e Security Scan',exact:true}).click();
 await expect(page.getByRole('region',{name:'Métricas de CODE REVIEW',exact:true})).toBeVisible();await expect(page.getByRole('row',{name:/Achados · LOW/})).toBeVisible();await page.getByRole('button',{name:'SECURITY SCAN',exact:true}).click();await expect(page.getByRole('region',{name:'Métricas de SECURITY SCAN',exact:true})).toBeVisible();await expect(page.getByRole('row',{name:/Ciclos de correção solicitados/})).toBeVisible();
});
