import {test,expect,type Page} from '@playwright/test';
import {fixture as devFixture,storyId,appUrl,stamp} from './story-dev-summary-fixtures';
import {storyDeliveryReading} from '../../packages/shared/src/story-delivery';

// All reads and commands are intercepted. These cases exercise navigation and
// the existing command identity, without contacting agents or operational data.
const hub=`/stories/${storyId}/execution`,gatePage=hub+'/actions/approve';
const observation=(page:Page)=>page.getByRole('region',{name:'Acompanhamento da execução',exact:true});
const actions=(page:Page)=>page.getByRole('region',{name:'O que você pode fazer agora',exact:true});
const back=(page:Page)=>page.getByRole('link',{name:'Voltar à Execução',exact:true});
const gateLink=(page:Page)=>actions(page).getByRole('link',{name:/Aprovar.*gerar código/});
const review=(page:Page)=>page.getByRole('button',{name:'Revisar aprovação',exact:true});
const confirm=(page:Page)=>page.getByRole('button',{name:'Aprovar e enfileirar codificação',exact:true});
type Command={path:string;method:string;body:unknown;persona:string;key:string};

async function publishedFixture(page:Page){
  const state=await devFixture(page),journey=state.journey as Record<string,any>;
  journey.merge={state:'succeeded',sha:journey.run.commitSha,blocks:[]};
  journey.delivery=storyDeliveryReading({status:journey.story.status,mergeConfirmed:true,devProgress:state.progress});
  return state;
}

async function gateFixture(page:Page){
  const state=await devFixture(page),journey=state.journey as Record<string,any>;
  delete journey.devProgress;
  Object.assign(journey.story,{status:'specification'});
  Object.assign(journey.current,{phase:'SPECIFICATION',kind:'specification',state:'waiting_approval',label:'Gateway de Especificação',title:'Especificação pronta; G1 aguarda sua decisão',message:'Revise os requisitos e o plano técnico antes de autorizar o código.',who:'Product Owner ou Arquiteto',taskId:null});
  Object.assign(journey.run,{state:'waiting_approval',stage:'gate',commitSha:null,destinationReviewRequired:false,specification:{requirements:'A pessoa altera a cor e a fonte da página.',architecture:'Interface React com controles nativos.',testCases:[{criterionIndex:0,description:'A cor cobre a página.'},{criterionIndex:1,description:'A fonte altera o texto.'}],risks:['Preservar o acesso por teclado.']}});
  journey.nextAction={id:'approve',kind:'approve',label:'Aprovar G1 e gerar código',enabled:true,path:'/api/executions/summary-run/approve',method:'POST',body:{expectedVersion:7},confirmation:{title:'Aprovar especificação G1',description:'Confira requisitos, arquitetura e casos de teste.',checkboxLabel:'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.'}};
  journey.secondaryActions=[];journey.permissions={canAct:true};
  journey.delivery=storyDeliveryReading({status:journey.story.status,mergeConfirmed:false});
  state.build.operation=null;state.build.artifact=null;state.tests.operation=null;state.tests.evidence=null;state.tests.current=false;
  await page.route(url=>url.pathname===`/api/items/${storyId}/development-deployment`,route=>route.fulfill({json:{storyId,configured:true,operation:null,deployment:null,preparation:null,asOf:stamp}}));
  const commands:Command[]=[],applied=new Set<string>(),control={loseAck:false,rejectNext:false};
  await page.route(url=>url.pathname==='/api/executions/summary-run/approve',async route=>{
    const request=route.request();if(request.method()!=='POST')return route.fallback();
    const command={path:new URL(request.url()).pathname,method:request.method(),body:request.postDataJSON(),persona:request.headers()['x-persona'],key:request.headers()['idempotency-key']};commands.push(command);
    if(control.rejectNext){control.rejectNext=false;journey.story.version++;journey.nextAction.body={expectedVersion:journey.story.version};return route.fulfill({status:409,json:{error:{code:'GATE_STALE',message:'A especificação mudou. Revise a versão atual antes de confirmar.'}}});}
    if(!applied.has(command.key)){
      applied.add(command.key);journey.story.status='approved';journey.story.version++;
      Object.assign(journey.current,{phase:'APPROVED',kind:'coding',state:'queued',label:'Codificação',title:'Codificação enfileirada; aguardando executor',message:'G1 aprovado; o mesmo fluxo já recebeu a codificação.'});
      Object.assign(journey.run,{state:'queued',stage:'context'});journey.nextAction=null;
    }
    if(control.loseAck){control.loseAck=false;return route.abort();}
    return route.fulfill({json:{approved:true}});
  });
  return Object.assign(state,{journey,commands,applied,control});
}

async function open(page:Page,url=hub,width=1440){await page.setViewportSize({width,height:width===390?844:1000});await page.goto(url);}
async function asOwner(page:Page,persona='ana'){await page.getByRole('combobox',{name:/Persona/}).selectOption(persona);}
async function assertRouteFocus(page:Page,label:string){
  const heading=page.locator('.sw-page-heading h1');
  let geometry:unknown;
  try{
    await expect(heading).toBeFocused();
    await expect.poll(async()=>{
      const metrics=await heading.evaluate(node=>{
        const title=node.getBoundingClientRect(),bar=document.querySelector('.workflow-bar')!.getBoundingClientRect();
        return {headingTop:title.top,headingBottom:title.bottom,workflowBottom:bar.bottom,viewportHeight:innerHeight,focused:document.activeElement===node};
      });
      geometry=metrics;
      return metrics.focused?metrics.headingTop-metrics.workflowBottom:Number.NEGATIVE_INFINITY;
    },{message:'O título da página deve receber foco e ficar abaixo da barra fixa.'}).toBeGreaterThanOrEqual(-1);
  }finally{
    await test.info().attach(label+'-route-focus.json',{body:JSON.stringify(geometry??{focused:false}),contentType:'application/json'});
  }
}
function clean(state:Awaited<ReturnType<typeof devFixture>>){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
async function readonlyHub(page:Page){
  await expect(observation(page)).toBeVisible();await expect(actions(page)).toBeVisible();
  for(const region of [observation(page),actions(page)])await expect(region.locator('form:visible,input:visible,textarea:visible,select:visible,[contenteditable="true"]:visible')).toHaveCount(0);
  await expect(actions(page).locator('button[data-action]:visible')).toHaveCount(0);
}

for(const width of [1440,390]){
  test(`Story execution hub separates current observation and contextual actions without decision forms at ${width}px`,async({page})=>{
    const state=await publishedFixture(page);await open(page,hub,width);await readonlyHub(page);
    await expect(observation(page)).toContainText('Versão disponível em DEV');
    await expect(observation(page).getByRole('link',{name:'Abrir aplicação em DEV ↗',exact:true})).toHaveAttribute('href',appUrl+'/');
    const pending=actions(page).getByRole('link',{name:'Ver pendências de aceitação',exact:true});
    await expect(pending).toHaveCount(1);await expect(pending).toHaveAttribute('href',new RegExp(`/stories/${storyId}/execution/dev/approval(?:\\?|$)`));
    await expect(page.getByRole('button',{name:/Confirmar|Aprovar e enfileirar/})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath('hub-'+width+'.png'),fullPage:true});clean(state);
  });

  test(`G1 uses its own URL and one explicit confirmation already queues code at ${width}px`,async({page})=>{
    const state=await gateFixture(page);await open(page,hub,width);await asOwner(page);await readonlyHub(page);
    await gateLink(page).click();await expect(page).toHaveURL(gatePage);
    await assertRouteFocus(page,'g1-'+width);
    await expect(page.getByRole('heading',{level:1})).toContainText(/Gateway de Especificação|G1/);
    await expect(back(page)).toHaveAttribute('href',hub);await expect(confirm(page)).toHaveCount(0);await expect(page.getByRole('checkbox')).toHaveCount(0);expect(state.commands).toEqual([]);
    await review(page).click();await expect(confirm(page)).toBeDisabled();expect(state.commands).toEqual([]);
    await page.screenshot({path:test.info().outputPath('g1-'+width+'.png'),fullPage:true});
    await page.getByRole('checkbox',{name:/Revisei a especificação/}).check();await confirm(page).click();
    await expect.poll(()=>state.commands.length).toBe(1);expect(state.commands[0]).toMatchObject({path:'/api/executions/summary-run/approve',method:'POST',body:{expectedVersion:7},persona:'ana'});expect(state.applied.size).toBe(1);
    await expect(page).toHaveURL(hub);
    await expect(observation(page)).toContainText('Codificação enfileirada');
    await expect(page.getByRole('button',{name:/^Iniciar codificação$|^Gerar código$/})).toHaveCount(0);clean(state);
  });

  test(`Action navigation preserves the hub query through Back and browser reload at ${width}px`,async({page})=>{
    const state=await gateFixture(page);await open(page,hub+'?tasks.q=preservar',width);await asOwner(page);
    await gateLink(page).click();await expect(page).toHaveURL(new RegExp(`/execution/actions/approve\\?tasks.q=preservar$`));
    await page.reload();await assertRouteFocus(page,'action-reload-'+width);await expect(back(page)).toBeVisible();await expect(confirm(page)).toHaveCount(0);expect(state.commands).toEqual([]);
    await back(page).click();await expect(page).toHaveURL(hub+'?tasks.q=preservar');await readonlyHub(page);
    await gateLink(page).click();await expect(page).toHaveURL(new RegExp(`/execution/actions/approve\\?tasks.q=preservar$`));
    await page.goBack();await expect(page).toHaveURL(hub+'?tasks.q=preservar');await readonlyHub(page);expect(state.commands).toEqual([]);clean(state);
  });
}

test('A lost G1 acknowledgement preserves its original request across hub, reload, changed state and persona',async({page})=>{
  const state=await gateFixture(page);state.control.loseAck=true;await open(page,gatePage,390);await asOwner(page);
  await review(page).click();await page.getByRole('checkbox',{name:/Revisei a especificação/}).check();await confirm(page).click();
  await expect(page.getByText('A confirmação da solicitação está pendente.',{exact:true})).toBeVisible();expect(state.commands).toHaveLength(1);expect(state.applied.size).toBe(1);
  await back(page).click();await expect(page).toHaveURL(hub);await readonlyHub(page);expect(state.commands).toHaveLength(1);
  await actions(page).getByRole('link',{name:'Verificar solicitação pendente',exact:true}).click();await expect(page).toHaveURL(hub+'/actions/pending');
  await expect(page.getByRole('button',{name:'Verificar a mesma solicitação',exact:true})).toBeVisible();expect(state.commands).toHaveLength(1);
  await back(page).click();await expect(page).toHaveURL(hub);
  await page.goto(gatePage);await page.reload();await asOwner(page,'bruno');
  const verify=page.getByRole('button',{name:'Verificar a mesma solicitação',exact:true});await expect(verify).toBeDisabled();expect(state.commands).toHaveLength(1);
  await asOwner(page);await verify.click();await expect.poll(()=>state.commands.length).toBe(2);expect(state.commands[1]).toEqual(state.commands[0]);expect(state.applied.size).toBe(1);
  await expect(page).toHaveURL(hub);await expect(observation(page)).toContainText('Codificação enfileirada');clean(state);
});

test('A rejected G1 review does not reuse its old version or keep a checked approval',async({page})=>{
  const state=await gateFixture(page);state.control.rejectNext=true;await open(page,gatePage);await asOwner(page);
  await review(page).click();await page.getByRole('checkbox',{name:/Revisei a especificação/}).check();const reads=state.journeyReads;await confirm(page).click();
  await expect(page.getByText('A especificação mudou. Revise a versão atual antes de confirmar.',{exact:true})).toBeVisible();
  await expect.poll(()=>state.journeyReads).toBeGreaterThan(reads);expect(state.commands).toHaveLength(1);expect(state.applied.size).toBe(0);
  await review(page).click();await expect(page.getByRole('checkbox',{name:/Revisei a especificação/})).not.toBeChecked();await expect(confirm(page)).toBeDisabled();
  await back(page).click();await readonlyHub(page);expect(state.commands).toHaveLength(1);clean(state);
});

test('Hub observation updates automatically and distinguishes a failed reading from a new execution result',async({page})=>{
  const state=await gateFixture(page);await open(page);await expect(observation(page)).toContainText('Especificação pronta');
  const reads=state.journeyReads;state.journey.current.title='Especificação revisada; aguardando decisão';
  await expect(observation(page)).toContainText('Especificação revisada; aguardando decisão');expect(state.journeyReads).toBeGreaterThan(reads);
  state.disconnected=true;await expect(observation(page)).toContainText(/não confirmada|não chegou|última leitura/i);
  await readonlyHub(page);expect(state.commands).toEqual([]);
  state.disconnected=false;await expect(observation(page)).toContainText('Especificação revisada; aguardando decisão');clean(state);
});

test('Legacy Story execution links resolve to the new readonly hub and preserve the collection query',async({page})=>{
  const state=await gateFixture(page);await open(page,`/stories/${storyId}?tab=planning&tasks.q=preservar`,390);
  await expect(page).toHaveURL(hub+'?tasks.q=preservar');await readonlyHub(page);expect(state.commands).toEqual([]);clean(state);
});

test('The DEV action page shows only its target, keeps historical selection separate and returns to the hub',async({page})=>{
  const state=await publishedFixture(page);await open(page,hub+'?attempt=previous-attempt',390);await readonlyHub(page);
  await actions(page).getByRole('link',{name:'Ver pendências de aceitação',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/execution/dev/approval\\?attempt=previous-attempt$`));
  await expect(page.getByTestId('development-approval')).toBeVisible();await expect(page.getByTestId('development-approval-pendencies')).toContainText('Confira a situação da aprovação da História.');
  for(const id of ['build','deployment','test'])await expect(page.getByTestId('development-'+id)).toBeHidden();
  await expect(page.getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByTestId('development-approval')).toBeVisible();await back(page).click();
  await expect(page).toHaveURL(hub+'?attempt=previous-attempt');await expect(observation(page)).toContainText('Versão disponível em DEV');clean(state);
});

test('Opening the QA consultation does not offer a promotion that is not implemented',async({page})=>{
  const state=await publishedFixture(page);delete (state.journey as {delivery?:unknown}).delivery;
  await open(page,hub+'/environments/QA',390);
  await expect(page.getByRole('heading',{level:1})).toContainText('QA');
  await expect(page.getByText('A promoção e a implantação de candidatas ainda não estão disponíveis no portal.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Confirmar promoção|Publicar em QA|Implantar em QA/})).toHaveCount(0);
  await back(page).click();await readonlyHub(page);await expect(actions(page).getByRole('link',{name:'Ver pendências de aceitação',exact:true})).toHaveAttribute('href',hub+'/dev/approval');clean(state);
});

test('Same-Story action navigation preserves the construction draft and persona in memory when browser storage is unavailable',async({page})=>{
  await page.addInitScript(()=>{
    for(const method of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,method,{configurable:true,value(){throw new DOMException('Storage is unavailable in this isolated test.','SecurityError');}});
  });
  const state=await publishedFixture(page);state.journey.permissions.canAct=true;
  await open(page,hub+'/dev/build',390);await asOwner(page);
  const build=page.getByTestId('development-build'),preview=page.getByTestId('development-build-confirmation');
  async function inspect(){
    const other=build.getByText('Outras ações',{exact:true});
    if(await other.isVisible()&&!await other.locator('..').evaluate(node=>(node as HTMLDetailsElement).open))await other.click();
    await build.getByRole('button',{name:'Revisar construção',exact:true}).click();
  }
  await expect(build).toBeVisible();await inspect();
  const reason=preview.getByRole('textbox',{name:'Motivo da construção DEV',exact:true}),draft='Revisar a necessidade de outra construção sem perder este motivo.';
  await reason.fill(draft);await back(page).click();await expect(page).toHaveURL(hub);await readonlyHub(page);
  await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('ana');
  await page.goBack();await expect(page).toHaveURL(hub+'/dev/build');await expect(build).toBeVisible();
  if(!await reason.isVisible())await inspect();
  await expect(reason).toHaveValue(draft);await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('ana');
  await expect(preview.getByRole('button',{name:'Confirmar construção DEV',exact:true})).toBeDisabled();clean(state);
});

test('An invalid DEV action route returns 404 without rendering the Story hub or querying its business data',async({page})=>{
  const state=await publishedFixture(page),response=await page.goto(hub+'/dev/invalido');
  expect(response?.status()).toBe(404);await expect(page.getByRole('heading',{name:'404',exact:true})).toBeVisible();
  await expect(page.getByTestId('story-workspace')).toHaveCount(0);await expect(observation(page)).toHaveCount(0);await expect(actions(page)).toHaveCount(0);
  expect(state.reads).toEqual([]);clean(state);
});

test('An already approved development opens its DEV consultation directly instead of looping through the hub',async({page})=>{
  const state=await publishedFixture(page),journey=state.journey as Record<string,any>,artifact=state.build.artifact!,testEvidence=state.tests.evidence!;
  Object.assign(testEvidence,{suiteScope:'acceptance',caseCount:6,cases:Array.from({length:6},(_,index)=>({id:'accepted-case-'+index,name:'Critério HTTP '+(index+1),criterionIndices:[index],passed:true,expectedStatus:200,actualStatus:200,code:'PASSED',durationMs:10}))});
  Object.assign(state.progress,{state:'approved',title:'Desenvolvimento Finalizado para esta revisão',message:'A aprovação de desenvolvimento está válida. A História permanece aberta até a entrega em produção.',nextAction:null,acceptance:{scope:'acceptance',covered:6,total:6,httpOnly:true}});
  state.progress.checks.forEach(check=>{check.passed=true;});
  const approval={id:'summary-development-approval',storyId,number:1,policyVersion:'development-approval-v1',actorId:'ana',actorName:'Ana',reason:'Aceitação registrada para a revisão e o artefato conferidos.',createdAt:stamp,specificationId:'summary-specification',executionId:'summary-run',sourceSha:journey.run.commitSha,integrationReferenceId:'summary-integration',integrationSha:journey.run.commitSha,buildId:artifact.id,buildSourceSha:artifact.sourceSha,imageId:artifact.artifact!.imageId,archiveDigest:artifact.artifact!.archiveDigest,deploymentId:'summary-deployment',testId:testEvidence.id,suiteDigest:testEvidence.suiteDigest,reviewId:'summary-review',securityId:'summary-security'};
  state.approval.approval=approval;state.approval.validity={state:'valid',label:'Desenvolvimento Finalizado · revisão aprovada',reasons:[]};
  journey.storyLifecycle.development={...state.approval.validity,approvalAvailable:true,approval};
  journey.delivery=storyDeliveryReading({status:journey.story.status,mergeConfirmed:true,devProgress:state.progress});
  journey.nextAction={id:'prepare_dev',kind:'prepare_dev',label:'Consultar DEV',enabled:true,href:`/stories/${storyId}?tab=planning&process=environment&environment=DEV`};
  await open(page,hub,390);await readonlyHub(page);
  const consult=actions(page).getByRole('link',{name:'Consultar DEV',exact:true});
  await expect(consult).toHaveAttribute('href',hub+'/dev/approval');await consult.click();await expect(page).toHaveURL(hub+'/dev/approval');
  await expect(page.getByTestId('development-approval')).toContainText('Desenvolvimento Finalizado · revisão aprovada');
  await expect(page.getByRole('button',{name:'Confirmar Desenvolvimento Finalizado',exact:true})).toHaveCount(0);
  await back(page).click();await expect(page).toHaveURL(hub);await readonlyHub(page);clean(state);
});
