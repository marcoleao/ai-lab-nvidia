import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';

// Validação isolada da revisão 2. Não usa a API ou o banco do Portal.
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || new URL('../../../portal/package.json', import.meta.url));
const {chromium, expect} = require('@playwright/test');
const base = process.env.PROTOTYPE_URL || 'http://127.0.0.1:8080';
const output = process.env.PROTOTYPE_OUTPUT || '/evidence/v2';
mkdirSync(output,{recursive:true});
const browser = await chromium.launch({args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const results=[], errors=[], requests=[], metrics=[];
const scenarios=['draft','generating','g1','dependency','queued','running','staleSignal','blocked','failed','cancelPending','published','reviewing','security','scanning','correction','merge','merged','stale','reopened','cancelled','archived','inactive','permission','conflict','completed','interrupted','uncertain'];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
const stage=()=>page.locator('#flow-stage');
async function check(name,run){await run();results.push(name);console.log('PASS',name);}
async function open(scenario='g1',query=''){
  await page.goto(`${base}/?scenario=${scenario}${query?'&'+query:''}`);
  await expect(page.locator('h1')).toBeVisible();
}
async function flow(scenario='g1',query=''){await open(scenario,'view=flow'+(query?'&'+query:''));await expect(stage()).toBeVisible();}
async function confirmInline(){
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const check=stage().locator('#confirm-command');
  if(await check.count()){
    await expect(stage().locator('[data-confirm-required]')).toBeDisabled();
    await check.check();
  }
  await stage().locator('[data-confirm-required]').click();
}
async function simulateAgent(){
  await page.locator('[data-action="flow-explore"]').click();
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('[data-action="flow-simulate"]').click();
  await expect(stage()).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}
try{
  await check('Entrada abre condução isolada, sem abas, tabela, sidebar ou trilho',async()=>{
    await open();await expect(stage()).toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.getByRole('navigation',{name:'Assuntos da história',exact:true})).toHaveCount(0);
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.locator('.journey')).toHaveCount(0);
    await expect(page.locator('#flow-action')).toBeVisible();
    await expect(page.locator('#flow-details')).toBeVisible();
    await page.screenshot({path:output+'/fluxo-g1-desktop.png',fullPage:true});
  });
  await check('G1 e confirmação ficam na mesma área; aprovação entra na fila sem abrir abas',async()=>{
    await page.locator('#flow-action').click();
    await expect(stage()).toContainText('codificação');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.screenshot({path:output+'/confirmacao-g1-desktop.png',fullPage:true});
    await confirmInline();
    await expect(page).toHaveURL(/scenario=queued/);
    await expect(stage()).toBeVisible();
    await expect(stage()).toContainText(/fila|aguardando/i);
    await expect(page.locator('.local-nav')).toHaveCount(0);
  });
  await check('Fila, processamento e ausência de sinal não mostram Continuar artificial',async()=>{
    for(const scenario of ['queued','running','generating','reviewing','scanning','staleSignal']){
      await flow(scenario);
      await expect(stage().locator('button.primary')).toHaveCount(0);
      await expect(stage().getByRole('button',{name:/continuar|próxima etapa/i})).toHaveCount(0);
    }
    await flow('running');await page.screenshot({path:output+'/fluxo-agente-desktop.png',fullPage:true});
  });
  await check('Percurso G1, agentes, revisão, segurança e merge usa a mesma área de condução',async()=>{
    await flow();await page.locator('#flow-action').click();await confirmInline();
    await simulateAgent();await expect(page).toHaveURL(/scenario=running/);
    await simulateAgent();await expect(page).toHaveURL(/scenario=published/);
    await page.locator('#flow-action').click();await confirmInline();
    await expect(page).toHaveURL(/scenario=reviewing/);
    await simulateAgent();await expect(page).toHaveURL(/scenario=security/);
    await page.locator('#flow-action').click();await confirmInline();
    await simulateAgent();await expect(page).toHaveURL(/scenario=merge/);
    await page.locator('#flow-action').click();await confirmInline();
    await expect(page).toHaveURL(/scenario=merged/);
    await expect(stage()).toBeVisible();await expect(stage()).toContainText(/pendente/i);
    await page.locator('#flow-details').click();
    await page.getByRole('navigation',{name:'Assuntos da história',exact:true}).getByRole('link',{name:/Tarefas/}).click();
    for(const [id,name] of [['T01','Codificação'],['T03','Revisão de Código'],['T04','Revisão de Segurança'],['T06','Merge de Código']]){
      await expect(page.locator('tbody tr').filter({has:page.getByRole('link',{name:id+' '+name,exact:true})})).toContainText('DONE');
    }
    for(const [id,name] of [['T02','Teste'],['T05','Teste Final']]){
      await expect(page.locator('tbody tr').filter({has:page.getByRole('link',{name:id+' '+name,exact:true})})).not.toContainText('DONE');
    }
  });
  await check('Confirmação pode consultar detalhes e retornar sem outra etapa ou modal',async()=>{
    await flow();await page.locator('#flow-action').click();
    await page.locator('#flow-details').click();await expect(page.locator('#flow-back')).toBeVisible();
    await page.locator('#flow-back').click();
    await expect(stage().locator('[data-confirm-required]')).toBeVisible();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
  await check('Impedimento preserva esclarecimento nos detalhes e exige novo G1',async()=>{
    await flow('blocked');await page.locator('#flow-blocker').fill('Permitir preenchimento manual com aviso claro.');
    await page.locator('#flow-details').click();await page.locator('#flow-back').click();
    await expect(page.locator('#flow-blocker')).toHaveValue('Permitir preenchimento manual com aviso claro.');
    await page.locator('#flow-action').click();
    await expect(stage()).toContainText(/novo G1/i);
    await confirmInline();await expect(page).toHaveURL(/scenario=stale/);
    await expect(stage()).toContainText(/4/);
    await page.screenshot({path:output+'/fluxo-reaprovacao-desktop.png',fullPage:true});
  });
  await check('Preparação rápida exige objetivo preenchido e não aprova G1 ao salvar',async()=>{
    await flow('draft');await page.locator('#flow-action').click();
    await expect(page.locator('#flow-objective')).toHaveValue('');
    await page.locator('[data-action="flow-review-plan"]').click();
    await expect(page.locator('#flow-objective')).toBeFocused();
    await page.locator('#flow-objective').fill('Consultar o endereço cadastrado do cliente.');
    await page.locator('[data-action="flow-review-plan"]').click();
    await expect(page.locator('#flow-technical')).toBeVisible();
    await page.locator('[data-action="flow-prepare-g1"]').click();
    await confirmInline();await expect(page).toHaveURL(/scenario=g1/);
    await expect(stage()).toContainText(/autoriza|codificação/i);
    await expect(page).not.toHaveURL(/scenario=queued/);
  });
  await check('Conflito de revisão conserva rascunho e exige conciliação antes do G1',async()=>{
    await flow('conflict');await page.locator('#flow-action').click();
    await page.locator('#flow-objective').fill('Rascunho que precisa ser conciliado.');
    await page.locator('[data-action="flow-review-plan"]').click();
    await page.locator('[data-action="flow-prepare-g1"]').click();
    await expect(stage()).toContainText('Concilie a versão');
    await expect(stage().locator('[data-confirm-required]')).toHaveCount(0);
    await stage().locator('[data-dialog-action="open-spec"]').click();
    await expect(page.locator('#spec-title')).toBeVisible();
    await expect(page.locator('#objective')).toHaveValue('Rascunho que precisa ser conciliado.');
    await expect(page).toHaveURL(/scenario=conflict/);
  });
  await check('Confirmação do cancelamento cancela o trabalho aberto após reconciliação',async()=>{
    await open('running','tab=manage');
    await page.getByText('Cancelamento e reabertura',{exact:true}).click();await page.locator('[data-action="cancel-story"]').click();
    await page.locator('#reason').fill('Interromper esta entrega com justificativa.');
    await page.locator('#confirm-command').check();await page.locator('[data-confirm-required]').click();
    await expect(page).toHaveURL(/scenario=cancelPending/);
    await page.locator('#flow-back').click();await simulateAgent();
    await expect(page).toHaveURL(/scenario=cancelled/);
    await page.locator('#flow-details').click();
    await page.getByRole('navigation',{name:'Assuntos da história',exact:true}).getByRole('link',{name:/Tarefas/}).click();
    await expect(page.locator('tbody')).not.toContainText('DOING');
    await expect(page.locator('tbody')).not.toContainText('TO DO');
    await expect(page.locator('tbody tr').first()).toContainText('CANCELLED');
  });
  await check('Detalhes são opcionais; filtros, rascunho e retorno preservam o ponto da condução',async()=>{
    await flow();await page.locator('#flow-details').click();
    await expect(page.locator('#flow-back')).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Assuntos da história',exact:true})).toBeVisible();
    await page.locator('[data-action="toggle-filters"]').click();
    await page.locator('[name="tasks.q"]').fill('rascunho da busca');
    await page.locator('#flow-back').click();await expect(stage()).toBeVisible();
    await page.locator('#flow-details').click();
    await expect(page.locator('[name="tasks.q"]')).toHaveValue('rascunho da busca');
    await page.locator('#flow-back').click();
    await expect(page).toHaveURL(/scenario=g1/);
    await expect(page.locator('#flow-action')).toBeVisible();
  });
  await check('Detalhes conservam paginação, consulta vazia, erro e acesso ao Sistema',async()=>{
    await open('g1','tab=tasks');
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await page.getByRole('button',{name:'Próxima página de tarefas',exact:true}).click();
    await expect(page.locator('tbody tr')).toHaveCount(4);
    await page.locator('tbody a').first().click();
    await expect(page.locator('#main')).toContainText('Resultados e evidências');
    await page.getByRole('link',{name:'← Voltar às tarefas com o mesmo recorte'}).click();
    await expect(page).toHaveURL(/tasks.page=2/);
    await page.reload();await expect(page.locator('tbody tr')).toHaveCount(4);
    await open('g1','tab=tasks&tasks.q=nenhum-resultado-xyz');
    await expect(page.locator('#main')).toContainText('Nenhuma tarefa corresponde aos filtros');
    await open('g1','tab=tasks&query=error');
    await expect(page.getByRole('alert')).toContainText('Não foi possível atualizar');
    await page.locator('[data-action="retry-query"]').click();
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await open('g1','tab=components&tasks.q=Teste&returnTo=origem');
    await expect(page.locator('#destination')).toContainText('link antigo de Componentes');
    await page.locator('#destination').getByRole('link',{name:'Gerenciar no Sistema ↗'}).click();
    await expect(page.locator('h1')).toHaveText('Cadastro');
    await page.getByRole('link',{name:'← Voltar à História CADAST-042'}).click();
    await expect(page).toHaveURL(/tasks.q=Teste/);
    await expect(page).toHaveURL(/returnTo=origem/);
  });
  await check('Revisão, segurança e merge confirmam inline e permanecem na condução',async()=>{
    for(const [scenario,target] of [['published','reviewing'],['security','scanning'],['merge','merged']]){
      await flow(scenario);await page.locator('#flow-action').click();
      await confirmInline();await expect(page).toHaveURL(new RegExp('scenario='+target));
      await expect(stage()).toBeVisible();
    }
    await expect(stage()).not.toContainText('História concluída');
  });
  await check('Os 27 estados abrem na mesma superfície sem inferir conclusão de testes',async()=>{
    for(const scenario of scenarios){await flow(scenario);await expect(stage()).toBeVisible();await expect(page.locator('.local-nav')).toHaveCount(0);}
    await open('completed','tab=tasks');
    const test=page.locator('tbody tr').filter({has:page.getByRole('link',{name:'T02 Teste',exact:true})});
    await expect(test).not.toContainText('DONE');
  });
  await check('Consulta de tentativa antiga e persona de consulta não oferecem aprovação',async()=>{
    await open('g1','tab=planning&attempt=1');
    await expect(page.locator('[data-action="execute-current"]')).toHaveCount(0);
    const conditions=page.locator('[data-action="decision-details"]');
    if(await conditions.count()){
      await conditions.click();await expect(page.locator('[data-confirm-required]')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    for(const scenario of ['permission','archived','inactive','uncertain']){
      await flow(scenario);await expect(stage().locator('[data-confirm-required]')).toHaveCount(0);
    }
  });
  await check('Teclado e redução de movimento funcionam na condução',async()=>{
    await flow();await page.locator('#flow-action').focus();await page.keyboard.press('Enter');
    await expect(stage().locator('[data-confirm-required]')).toBeVisible();
    await page.emulateMedia({reducedMotion:'reduce'});
    await flow('running');
    const spinners=stage().locator('.spinner');
    if(await spinners.count())expect(await spinners.first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('A decisão principal cabe no primeiro viewport móvel, com detalhes por escolha',async()=>{
    for(const [width,height] of [[1440,1000],[390,844],[390,500],[780,844]]){
      await page.setViewportSize({width,height});await flow();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const action=await page.locator('#flow-action').boundingBox();
      if(height>=844)expect(action.y+action.height).toBeLessThanOrEqual(height);
      metrics.push({width,height,actionTop:Math.round(action.y),actionBottom:Math.round(action.y+action.height),horizontalOverflow:false});
      await page.screenshot({path:`${output}/fluxo-${width}-${height}.png`,fullPage:true});
      if(height>=844){
        await page.locator('#flow-action').click();
        const confirmation=await stage().locator('[data-confirm-required]').boundingBox();
        expect(confirmation.y+confirmation.height).toBeLessThanOrEqual(height);
        await page.screenshot({path:`${output}/confirmacao-${width}-${height}.png`,fullPage:true});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await flow('blocked');await page.screenshot({path:output+'/fluxo-impedimento-mobile.png',fullPage:true});
  });
  await check('Nenhuma API, modelo ou integração é acionado pela prévia',async()=>{
    expect(errors).toEqual([]);
    expect(requests.every(request=>request.method==='GET'&&request.url.startsWith(base+'/')&&!new URL(request.url).pathname.startsWith('/api'))).toBe(true);
  });
  writeFileSync(output+'/report.json',JSON.stringify({revision:2,passed:results.length,scenarioCount:scenarios.length,results,metrics,errors,requests},null,2));
  console.log(JSON.stringify({passed:results.length,scenarioCount:scenarios.length,errors,metrics}));
}catch(error){
  await page.screenshot({path:output+'/failure.png',fullPage:true});
  writeFileSync(output+'/failure.json',JSON.stringify({passed:results.length,results,error:String(error),errors,url:page.url()},null,2));
  throw error;
}finally{await browser.close();}
