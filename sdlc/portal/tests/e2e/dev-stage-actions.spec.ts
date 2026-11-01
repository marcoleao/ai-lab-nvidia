import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fixture,storyId,stamp} from './story-dev-summary-fixtures';

const executionUrl=`/stories/${storyId}/execution`;
const stepUrl=(step:string,query='')=>`${executionUrl}/dev/${step}${query}`;
const hub=(page:Page)=>page.getByTestId('story-execution-hub');
const stage=(page:Page,step:string)=>page.getByTestId(`dev-stage-${step}`);
const controller=(page:Page,step:string)=>page.getByTestId(`development-${step}`);
const stageSummary=(page:Page,step:string)=>stage(page,step).locator(':scope > summary');
const next=(page:Page)=>hub(page).getByRole('link',{name:'Ver pendências de aceitação',exact:true});
async function open(page:Page,width:number,url=executionUrl){await page.setViewportSize({width,height:width===390?844:1000});await page.goto(url);}
async function expectStep(page:Page,selected:string){
  await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/execution/dev/${selected}(?:\\?|$)`));
  await expect(page.getByTestId('story-environment-detail')).toBeVisible();
  await expect(page.getByTestId('story-dev-summary')).toHaveCount(0);
  for(const step of ['build','deployment','test','approval']){await expect(controller(page,step)).toHaveCount(1);if(step===selected){await expect(controller(page,step)).toBeVisible();await expect(stage(page,step)).toHaveAttribute('open','');await expect(stage(page,step)).toHaveAttribute('data-standalone','true');await expect(stageSummary(page,step)).toBeHidden();}else await expect(controller(page,step)).toBeHidden();}
}
// This fixture preserves an old acceptance-pendency link. Its destination now
// consults evidence and hands new decisions to the single Story approval page.
// Global approval commands and recovery are covered by development-manual-acceptance.spec.ts.
async function openBuildFromHub(page:Page){await next(page).click();await expectStep(page,'approval');await controller(page,'approval').getByRole('button',{name:'Consultar condições da aprovação',exact:true}).click();await page.getByTestId('development-approval-confirmation').getByRole('button',{name:'Consultar construção',exact:true}).click();await expectStep(page,'build');}
function clean(state:Awaited<ReturnType<typeof fixture>>){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
async function capture(page:Page,name:string){if(!process.env.SCREENSHOT_DIR)return;mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${name}.png`,fullPage:false});}

for(const width of [1440,390]){
  test(`Guided DEV keeps two panels and offers global Story approval from an old acceptance pendency at ${width}px`,async({page})=>{
    const state=await fixture(page);await open(page,width);
    await expect(hub(page).locator(':scope > section')).toHaveCount(2);await expect(hub(page).getByRole('region',{name:'Acompanhamento da execução',exact:true})).toBeVisible();await expect(hub(page).getByRole('region',{name:'O que você pode fazer agora',exact:true})).toBeVisible();
    await expect(hub(page)).toContainText('Versão disponível em DEV');await expect(page.getByTestId('story-dev-summary')).toHaveCount(0);
    for(const step of ['build','deployment','test','approval'])await expect(controller(page,step)).toBeHidden();
    await expect(page.getByTestId('story-execution-operation-build')).toContainText('Artefato confirmado');
    await expect(page.getByTestId('story-execution-operation-deployment')).toContainText('Publicação confirmada');
    await expect(page.getByTestId('story-execution-operation-test')).toContainText('Verificações técnicas aprovadas');
    await expect(next(page)).toHaveAttribute('href',stepUrl('approval'));
    await next(page).click();await expectStep(page,'approval');
    await expect(page.getByTestId('development-approval-pendencies')).toContainText('Confira a situação da aprovação da História.');
    await expect(page.getByTestId('development-approval-pendencies')).toContainText('Os testes técnicos não comprovam os critérios da interface.');
    await expect(page.getByTestId('development-approval-pendencies')).toContainText('Use Aprovar História em DEV para registrar sua decisão sobre a História inteira, incluindo Desenvolvimento Finalizado.');
    await expect(controller(page,'approval').getByRole('button',{name:'Aprovar História em DEV',exact:true})).toBeVisible();
    for(const label of ['Conferir versão para construir','Atualizar acompanhamento da construção','Conferir publicação DEV','Atualizar acompanhamento da publicação','Conferir testes DEV','Atualizar acompanhamento dos testes','Conferir condições de aprovação'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Atualizar consulta',exact:true})).toHaveCount(1);
    await expect(controller(page,'approval').getByRole('textbox')).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('checkbox')).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('radio')).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('button',{name:'Confirmar aprovação da História em DEV',exact:true})).toHaveCount(0);
    await expect(controller(page,'approval').getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
    await expect(page.getByRole('link',{name:'Voltar à Execução',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await capture(page,`dev-current-acceptance-${width}`);clean(state);
  });

  test(`Completed DEV readings stay dated in the hub and construction has an honest blocked preview at ${width}px`,async({page})=>{
    const state=await fixture(page);state.buildContext.allowed=false;state.buildContext.blockers=['Esta revisão já tem artefato confirmado; outra construção está indisponível no ensaio.'];
    await open(page,width);const reading=page.getByTestId('story-execution-operation-build');await expect(reading).toContainText('Artefato confirmado');
    state.buildReadFailed=true;await hub(page).getByRole('button',{name:'Atualizar acompanhamento',exact:true}).click();await expect(reading).toContainText('Último resultado conhecido: Artefato confirmado');await expect(reading).toContainText('31/10/2026');await expect(hub(page)).toContainText('As últimas leituras recebidas permanecem identificadas nesta página');clean(state);
    state.buildReadFailed=false;await hub(page).getByRole('button',{name:'Atualizar acompanhamento',exact:true}).click();await expect(reading).not.toContainText('Último resultado conhecido');
    await openBuildFromHub(page);
    await expect(controller(page,'build').getByText('Último artefato confirmado',{exact:true})).toBeVisible();
    await expect(controller(page,'build').getByRole('button',{name:'Solicitar outra construção',exact:true})).toHaveCount(0);
    await expect(controller(page,'build').getByRole('button',{name:'Atualizar consulta',exact:true})).toBeVisible();
    clean(state);await controller(page,'build').getByRole('button',{name:'Revisar construção',exact:true}).click();
    const preview=page.getByTestId('development-build-confirmation');await expect(preview).toContainText(state.buildContext.blockers[0]);
    await expect(preview.getByRole('textbox')).toHaveCount(0);await expect(preview.getByRole('checkbox')).toHaveCount(0);
    await expect(preview.getByRole('button',{name:'Confirmar construção DEV',exact:true})).toHaveCount(0);
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();
    await expect(preview).toHaveCount(0);await expectStep(page,'build');
    expect(state.reads).toContain(`/api/items/${storyId}/development-build/context`);clean(state);
  });

  test(`DEV deep links reopen the exact stage on reload and reentry from another evidence page at ${width}px`,async({page})=>{
    const state=await fixture(page);await open(page,width,stepUrl('build','?tasks.q=preservar'));
    const heading=page.getByRole('heading',{name:'Construir versão DEV',level:1,exact:true});
    await expectStep(page,'build');await expect(heading).toBeFocused();
    await page.reload();await expect(heading).toBeFocused();await expect(page).toHaveURL(/tasks.q=preservar/);
    const original=page.url();await page.getByRole('link',{name:'Voltar à Execução',exact:true}).click();await expect(hub(page)).toBeVisible();await next(page).click();await expectStep(page,'approval');
    await controller(page,'approval').getByRole('button',{name:'Consultar condições da aprovação',exact:true}).click();
    const preview=page.getByTestId('development-approval-confirmation');await expect(preview).toBeFocused();await expect(preview).toContainText('Aprovação humana da História pendente.');
    await expect(preview.getByRole('button',{name:'Aprovar História em DEV',exact:true})).toBeVisible();
    await expect(preview.getByRole('textbox')).toHaveCount(0);await expect(preview.getByRole('checkbox')).toHaveCount(0);
    await expect(preview.getByRole('radio')).toHaveCount(0);
    await expect(preview.getByRole('button',{name:'Confirmar aprovação da História em DEV',exact:true})).toHaveCount(0);
    await expect(preview.getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
    await preview.getByRole('button',{name:'Consultar construção',exact:true}).click();
    await expect(page).toHaveURL(original);await expectStep(page,'build');await expect(heading).toBeFocused();
    clean(state);
  });

  test(`DEV review owns its page and preserves its draft across Back and recoverable query errors at ${width}px`,async({page})=>{
    const state=await fixture(page);state.journey.permissions.canAct=true;
    await open(page,width,stepUrl('build'));await expectStep(page,'build');await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');
    const trigger=controller(page,'build').getByRole('button',{name:'Revisar construção',exact:true});
    await trigger.click();const preview=page.getByTestId('development-build-confirmation');
    const reason=preview.getByRole('textbox',{name:'Motivo da construção DEV',exact:true}),draft='Reconstruir somente após revisar a necessidade deste novo artefato.';
    await reason.fill(draft);await expect(stageSummary(page,'build')).toBeHidden();
    await expect(stage(page,'build')).toHaveAttribute('open','');await expect(reason).toHaveValue(draft);await expect(preview.getByRole('checkbox')).not.toBeChecked();await expect(preview.getByRole('button',{name:'Confirmar construção DEV',exact:true})).toBeDisabled();
    await preview.getByRole('button',{name:'Voltar ao acompanhamento da construção',exact:true}).click();
    await expect(preview).toHaveCount(0);await expect(trigger).toBeFocused();await expect(stage(page,'build')).toHaveAttribute('open','');
    await page.getByRole('link',{name:'Voltar à Execução',exact:true}).click();await openBuildFromHub(page);await trigger.click();await expect(reason).toHaveValue(draft);
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
  await open(page,390);await expect(hub(page)).toBeVisible();await expect(controller(page,'build')).toBeHidden();
  if(status==='queued'){await expect(page.getByTestId('story-execution-operation-build')).toContainText('Na fila');await openBuildFromHub(page);await expect(controller(page,'build')).toContainText('Construção solicitada · na fila');}
  if(status==='unknown'){await expect(page.getByTestId('story-execution-operation-build')).toContainText('Resultado não confirmado');await hub(page).getByRole('link',{name:'Recuperar solicitação: Construir versão DEV',exact:true}).click();await expectStep(page,'build');await expect(controller(page,'build').getByRole('button',{name:'Verificar resultado da construção',exact:true})).toBeVisible();}
  if(status==='pending'){
    const recovery=hub(page).getByRole('link',{name:'Recuperar solicitação: Construir versão DEV',exact:true});await expect(recovery).toBeVisible();await expect(page.getByTestId('development-build-recovery')).not.toBeVisible();await recovery.click();await expectStep(page,'build');
    await expect(controller(page,'build')).toContainText('Solicitação aguardando confirmação');
    await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Auditoria',exact:true}).click();
    await expect(page.getByTestId('development-build-recovery')).not.toBeVisible();await page.getByTestId('story-dev-pending-navigation').getByRole('link',{name:'Ver solicitação DEV pendente',exact:true}).click();await recovery.click();
    await expectStep(page,'build');await expect(controller(page,'build')).toContainText('Solicitação aguardando confirmação');
    expect(await page.evaluate(id=>JSON.parse(sessionStorage.getItem(`sdlc-release-operation:development-build:${id}`)!).key,storyId)).toBe('isolated-original-request');
  }
  clean(state);
});

test('DEV fixtures without shared progress keep Story ownership and legacy Task controls',async({page})=>{
  const state=await fixture(page);delete (state.journey as {devProgress?:unknown}).devProgress;
  await page.setViewportSize({width:1440,height:1000});await page.goto(stepUrl('build'));await expectStep(page,'build');await expect(controller(page,'build').getByRole('button',{name:'Revisar construção',exact:true})).toBeVisible();
  await page.goto('/tasks/summary-merge-task?tab=planning&process=environment&environment=DEV');
  for(const step of ['build','deployment','test','approval'])await expect(controller(page,step)).toBeVisible();
  for(const [step,label] of [['build','Conferir versão para construir'],['deployment','Conferir publicação DEV'],['test','Conferir testes DEV'],['approval','Consultar condições da aprovação']] as const)await expect(controller(page,step).getByRole('button',{name:label,exact:true})).toBeVisible();
  clean(state);
});
