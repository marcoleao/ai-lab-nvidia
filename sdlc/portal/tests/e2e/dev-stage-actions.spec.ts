import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fixture,storyId,stamp} from './story-dev-summary-fixtures';

const devUrl=`/stories/${storyId}?tab=planning&process=environment&environment=DEV`;
const stage=(page:Page,step:string)=>page.getByTestId(`dev-stage-${step}`);
const controller=(page:Page,step:string)=>page.getByTestId(`development-${step}`);
const stageSummary=(page:Page,step:string)=>stage(page,step).locator(':scope > summary');
const next=(page:Page)=>page.getByTestId('story-dev-summary').getByRole('link',{name:'Ver pendências de aceitação',exact:true});
async function open(page:Page,width:number,url=devUrl){await page.setViewportSize({width,height:width===390?844:1000});await page.goto(url);await expect(page.getByTestId('story-dev-summary').getByRole('heading',{name:'Versão disponível em DEV',exact:true})).toBeVisible();await expect(stage(page,'approval')).toBeVisible();}
async function secondary(page:Page,step:string){const summary=controller(page,step).getByText('Outras ações',{exact:true});if(!await summary.locator('..').evaluate(node=>(node as HTMLDetailsElement).open))await summary.click();}
function clean(state:Awaited<ReturnType<typeof fixture>>){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
async function capture(page:Page,name:string){if(!process.env.SCREENSHOT_DIR)return;mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await stage(page,'approval').scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${name}.png`,fullPage:false});}

for(const width of [1440,390]){
  test(`Guided DEV prioritizes the current acceptance issue and folds completed controls at ${width}px`,async({page})=>{
    const state=await fixture(page);await open(page,width);
    for(const [step,title] of [['build','Construção'],['deployment','Publicação em DEV'],['test','Testes em DEV']] as const){
      await expect(stage(page,step)).not.toHaveAttribute('open','');
      await expect(stageSummary(page,step)).toContainText(title);
      await expect(controller(page,step)).toBeHidden();
    }
    await expect(stage(page,'approval')).toHaveAttribute('open','');
    await expect(stageSummary(page,'approval')).toContainText('Desenvolvimento Finalizado');
    await expect(stageSummary(page,'build')).toContainText('Artefato confirmado');
    expect(await stageSummary(page,'build').ariaSnapshot()).toContain('Construção Artefato confirmado');
    await expect(stageSummary(page,'deployment')).toContainText('Aplicação disponível');
    await expect(stageSummary(page,'test')).toContainText('Verificações técnicas aprovadas; aceitação pendente');
    await expect(page.getByTestId('development-approval-pendencies')).toContainText('0 de 6 critérios');
    await expect(page.getByTestId('development-approval-pendencies')).toContainText('Os testes técnicos não comprovam os critérios da interface.');
    for(const label of ['Conferir versão para construir','Atualizar acompanhamento da construção','Conferir publicação DEV','Atualizar acompanhamento da publicação','Conferir testes DEV','Atualizar acompanhamento dos testes','Conferir condições de aprovação'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Atualizar consulta',exact:true})).toHaveCount(1);
    await expect(controller(page,'approval').getByRole('textbox')).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('checkbox')).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
    await expect(next(page)).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await capture(page,`dev-current-acceptance-${width}`);clean(state);
  });

  test(`Opening a completed DEV result is readonly and secondary construction has an honest blocked preview at ${width}px`,async({page})=>{
    const state=await fixture(page);state.buildContext.allowed=false;state.buildContext.blockers=['Esta revisão já tem artefato confirmado; outra construção está indisponível no ensaio.'];
    await open(page,width);const original=page.url();
    await stageSummary(page,'build').click();await expect(stage(page,'build')).toHaveAttribute('open','');
    await expect(controller(page,'build').getByText('Último artefato confirmado',{exact:true})).toBeVisible();
    await expect(controller(page,'build').getByRole('button',{name:'Solicitar outra construção',exact:true})).toHaveCount(0);
    await expect(controller(page,'build').getByRole('button',{name:'Atualizar consulta',exact:true})).toBeVisible();
    await expect(next(page)).toBeVisible();expect(page.url()).toBe(original);clean(state);
    await secondary(page,'build');await controller(page,'build').getByRole('button',{name:'Solicitar outra construção',exact:true}).click();
    const preview=page.getByTestId('development-build-confirmation');await expect(preview).toContainText(state.buildContext.blockers[0]);
    await expect(preview.getByRole('textbox')).toHaveCount(0);await expect(preview.getByRole('checkbox')).toHaveCount(0);
    await expect(preview.getByRole('button',{name:'Confirmar construção DEV',exact:true})).toHaveCount(0);
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();
    await expect(preview).toHaveCount(0);await expect(next(page)).toBeVisible();
    expect(state.reads).toContain(`/api/items/${storyId}/development-build/context`);clean(state);
  });

  test(`DEV deep links reopen the exact completed stage on reload and repeated same-URL navigation at ${width}px`,async({page})=>{
    const state=await fixture(page);await open(page,width,devUrl+'&devStep=build&tasks.q=preservar');
    const heading=controller(page,'build').getByRole('heading',{level:3});
    await expect(stage(page,'build')).toHaveAttribute('open','');await expect(heading).toBeFocused();await expect(next(page)).toBeVisible();
    await page.reload();await expect(heading).toBeFocused();await expect(page).toHaveURL(/tasks.q=preservar/);
    await stageSummary(page,'build').click();await expect(stage(page,'build')).not.toHaveAttribute('open','');
    await stageSummary(page,'approval').click();await expect(stage(page,'approval')).toHaveAttribute('open','');
    await secondary(page,'approval');await controller(page,'approval').getByRole('button',{name:'Conferir condições de aprovação',exact:true}).click();
    const preview=page.getByTestId('development-approval-confirmation');await expect(preview).toContainText('0 de 6 critérios');
    await expect(preview.getByRole('textbox')).toHaveCount(0);await expect(preview.getByRole('checkbox')).toHaveCount(0);
    await expect(preview.getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
    const sameUrl=page.url();await preview.getByRole('button',{name:'Consultar construção',exact:true}).click();
    await expect(page).toHaveURL(sameUrl);await expect(stage(page,'build')).toHaveAttribute('open','');await expect(heading).toBeFocused();
    clean(state);
  });

  test(`DEV review stays open until Back and preserves its draft and recoverable query error at ${width}px`,async({page})=>{
    const state=await fixture(page);state.journey.permissions.canAct=true;
    await open(page,width);await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');
    await stageSummary(page,'build').click();await secondary(page,'build');
    const trigger=controller(page,'build').getByRole('button',{name:'Solicitar outra construção',exact:true});
    await trigger.click();const preview=page.getByTestId('development-build-confirmation');
    const reason=preview.getByRole('textbox',{name:'Motivo da construção DEV',exact:true}),draft='Reconstruir somente após revisar a necessidade deste novo artefato.';
    await reason.fill(draft);await stageSummary(page,'build').click();
    await expect(stage(page,'build')).toHaveAttribute('open','');await expect(reason).toHaveValue(draft);
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();
    await expect(preview).toHaveCount(0);await stageSummary(page,'build').click();await expect(stage(page,'build')).not.toHaveAttribute('open','');
    await stageSummary(page,'build').click();await trigger.click();await expect(reason).toHaveValue(draft);
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();
    state.buildContextFailed=true;await trigger.click();await expect(controller(page,'build')).toContainText('Consulta da versão temporariamente indisponível.');
    await expect(stage(page,'build')).toHaveAttribute('open','');
    state.buildContextFailed=false;await trigger.click();await expect(reason).toHaveValue(draft);
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();clean(state);
  });
}

for(const status of ['queued','unknown','pending'] as const)test(`A newer local construction ${status} stays visible and preserves recovery across tabs`,async({page})=>{
  const state=await fixture(page);
  if(status==='pending')await page.addInitScript(({id})=>{sessionStorage.setItem(`sdlc-release-operation:development-build:${id}`,JSON.stringify({path:`/items/${id}/development-build`,method:'POST',body:{expectedStoryVersion:7,confirmed:true},persona:'ana',key:'isolated-original-request'}));},{id:storyId});
  else state.build.operation={...state.build.artifact!,id:'summary-new-build',number:3,version:1,state:status,artifact:null,finishedAt:null,dispatchStartedAt:status==='unknown'?stamp:null,message:status==='unknown'?'Resultado ainda não confirmado; preserve a mesma solicitação.':'Construção recebida; aguarde o resultado.'};
  await open(page,390);await expect(stage(page,'build')).toHaveAttribute('open','');
  if(status==='queued')await expect(controller(page,'build')).toContainText('Construção solicitada · na fila');
  if(status==='unknown')await expect(controller(page,'build').getByRole('button',{name:'Verificar resultado da construção',exact:true})).toBeVisible();
  if(status==='pending'){
    await expect(controller(page,'build')).toContainText('Solicitação aguardando confirmação');
    await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Auditoria',exact:true}).click();
    const recovery=page.getByTestId('development-build-recovery');await expect(recovery).toBeVisible();
    await recovery.getByRole('button',{name:'Voltar à construção DEV',exact:true}).click();
    await expect(stage(page,'build')).toHaveAttribute('open','');await expect(controller(page,'build')).toContainText('Solicitação aguardando confirmação');
  }
  clean(state);
});

test('DEV fixtures without the shared progress contract retain the legacy flat controls and labels',async({page})=>{
  const state=await fixture(page);delete (state.journey as {devProgress?:unknown}).devProgress;
  await page.setViewportSize({width:1440,height:1000});await page.goto(devUrl);
  for(const step of ['build','deployment','test','approval'])await expect(controller(page,step)).toBeVisible();
  for(const [step,label] of [['build','Conferir versão para construir'],['deployment','Conferir publicação DEV'],['test','Conferir testes DEV'],['approval','Revisar aprovação']] as const)await expect(controller(page,step).getByRole('button',{name:label,exact:true})).toBeVisible();
  clean(state);
});
