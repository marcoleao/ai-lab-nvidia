import {test, expect, type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {env} from 'node:process';
import {mockPersonas, mockTaskCollection, openWorkPanel, uiAction, uiJourney} from './journey-fixtures';
import type {Repository} from '../../apps/web/app/repos';

// All API calls are intercepted. These fixtures never reach a business database,
// GitLab, a scanner or a model; API/worker rules have their own integration tests.
const storyId = 'flow-story-only', runId = 'flow-run-only';
const storyUrl = `/stories/${storyId}`, approvePath = `/api/executions/${runId}/approve`;
const checkboxName = 'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.';
type Write = {path:string; method:string; body:any; persona:string; key:string};

async function fixture(page:Page) {
  const stamp = new Date().toISOString();
  const base = {description:'Conteúdo exclusivo da fixture do navegador.',version:7,archived:false,data:{},createdAt:stamp,updatedAt:stamp};
  const system = {...base,id:'flow-system',kind:'system',key:'FLOWWW',name:'Sistema da fixture de fluxo',status:'active',parentId:null,data:{gitlabState:'ready',gitlabUrl:'http://gitlab.invalid/lab/flow',gitlabGroupPath:'lab/flow'}};
  const project = {...base,id:'flow-project',kind:'project',key:'FLOWPR',name:'Projeto da fixture de fluxo',status:'active',projectLifecycle:'active',parentId:system.id};
  const epic = {...base,id:'flow-epic',kind:'epic',key:'FLOWEP',name:'Épico da fixture de fluxo',status:'active',parentId:project.id};
  const story = {...base,id:storyId,kind:'story',key:'FLOW-001',name:'Consultar endereço do cliente',status:'specification',parentId:epic.id};
  const tasks = ['Codificação','Teste','Revisão de Código','Revisão de Segurança','Teste Final','Merge de Código'].map((name,index)=>({...base,id:`flow-task-${index+1}`,kind:'task',key:`FLOW-T${index+1}`,name,status:'todo',parentId:story.id,managed:true,processOwned:true}));
  const repositories:Repository[] = [
    {id:'flow-repository',systemId:system.id,key:'app',name:system.name,runtime:'generic',gitlabProjectId:42,gitlabPath:'lab/flow/app',gitlabUrl:'http://gitlab.invalid/lab/flow/app',state:'ready',message:null,version:2},
  ];
  const technical = {requirements:'Conteúdo original G1 do plano, preservado como evidência.',architecture:'Reutilizar o serviço de cadastro.',testCases:[{criterionIndex:0,description:'Consultar o endereço pelo identificador válido.'}],risks:[]};
  const requirements = {version:1,objective:'Consultar o endereço cadastrado do cliente.',behavior:'Apresentar o endereço ou orientar o preenchimento manual.',actors:[],inputs:[],outputs:[],businessRules:[],functionalCriteria:['O identificador válido retorna o endereço cadastrado.'],technicalCriteria:[],dependencies:[],exceptions:[],nonFunctional:[],assumptions:[],outOfScope:[],openQuestions:[]};
  const state = {
    story, tasks, run:{id:runId,state:'waiting_approval',stage:'gate',createdAt:stamp,updatedAt:stamp,commitSha:null,specification:technical} as any,
    current:{kind:'specification',state:'waiting_approval',title:'Especificação pronta; G1 aguarda sua decisão',message:'Leia a especificação. Ao aprovar, a codificação entra na fila.',who:'Product Owner ou Arquiteto',updatedAt:stamp} as any,
    action:uiAction('approve','Aprovar G1 e gerar código',approvePath,{expectedVersion:7},{title:'Aprovar especificação G1',description:'Ao aprovar, a codificação entra na fila.',checkboxLabel:checkboxName}) as any,
    signals:{} as any, writes:[] as Write[], errors:[] as string[], unexpected:[] as string[], reads:0,
    systemRepositories:repositories, system, project, repositoryCreations:0,
    abortApprovalOnce:false, approvalEffects:0, appliedKeys:new Set<string>(),
  };
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.addInitScript(()=>sessionStorage.setItem('sdlc-persona','ana'));
  await page.route('**/api/**',async route=>{
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const send = (json:unknown)=>route.fulfill({json});
    if (!['GET','HEAD'].includes(method)) {
      const write = {path,method,body:request.postDataJSON(),persona:request.headers()['x-persona'],key:request.headers()['idempotency-key']};
      state.writes.push(write);
      if (path === approvePath && method === 'POST') {
        if (!state.appliedKeys.has(write.key)) {
          state.appliedKeys.add(write.key); state.approvalEffects++;
          state.story.status='approved'; state.story.version++;
          state.run={...state.run,state:'queued',stage:'context'};
          state.current={kind:'coding',state:'queued',title:'Codificação na fila',message:'A aprovação foi registrada; o início aguarda o executor.',who:'Executor de codificação',updatedAt:stamp};
          state.action=null;
        }
        if (state.abortApprovalOnce) {state.abortApprovalOnce=false;return route.abort();}
        return send({run:state.run});
      }
      if (path === `/api/systems/${system.id}/repositories` && method === 'POST') {
        expect(write.persona).toBe('ana');
        expect(system.status).toBe('active');
        expect(state.systemRepositories).toHaveLength(0);
        expect(write.body).toEqual({name:system.name,key:'app',runtime:'generic',mode:'create'});
        state.systemRepositories=[{...repositories[0],state:'queued',gitlabProjectId:null,gitlabPath:null,gitlabUrl:null,version:1}];
        state.repositoryCreations++;
        return send({repository:state.systemRepositories[0]});
      }
      state.unexpected.push(`${method} ${path}`);
      return route.fulfill({status:409,json:{error:{message:'Mutação fora do roteiro isolado.'}}});
    }
    if (path.endsWith('/journey')) {
      state.reads++;
      const allowed=['ana','bruno','admin'].includes(request.headers()['x-persona']);
      const action=state.action?{...state.action,enabled:allowed&&state.action.enabled,...(!allowed?{reason:'Esta persona possui acesso de consulta.'}:{})}:null;
      return send(uiJourney(state.story,state.run,{current:state.current,nextAction:action,tasks:state.tasks,activities:[],permissions:{canAct:allowed,canManageLifecycle:allowed},repositoryName:state.systemRepositories.length===1?state.systemRepositories[0].name:null,signals:state.signals,chat:{mode:null,enabled:false}}));
    }
    if (path.endsWith('/specification')) return send({story:{id:storyId,version:state.story.version},content:{requirements,technical},revision:{id:'flow-spec-revision',number:2,content:{requirements,technical},actorName:'Ana',source:'human',createdAt:stamp},draft:null,readOnly:false,history:{items:[],page:1,pageSize:20,total:0,asOf:stamp}});
    if (path.endsWith('/release')) return send({story:{...state.story,projectId:project.id,projectName:project.name,epicId:epic.id,epicName:epic.name},assignment:null,system:{id:system.id,name:system.name},releases:[],truncated:false,totalChoices:0});
    if (path.endsWith('/history')) return send({events:[],page:1,pageSize:20,total:0,totalPages:1,asOf:stamp,actors:[],types:[],results:[]});
    if (path.endsWith('/results')) return send({results:[],pagination:{page:1,pageSize:20,total:0,totalPages:1},asOf:stamp,readOnly:false,coverage:{source:'TaskResultRevision',legacyResultAvailable:false}});
    if (path === '/api/collections/items') return send({items:[],page:1,pageSize:20,total:0,totalPages:1,extraCount:0});
    const selected=[system,project,epic,state.story,...state.tasks].find(item=>path===`/api/items/${item.id}`);
    if (selected) {
      const isSystem=selected.id===system.id, isProject=selected.id===project.id,isEpic=selected.id===epic.id,isTask=selected.kind==='task';
      return send({item:selected,ancestors:isSystem?[]:isProject?[system]:isEpic?[system,project]:[system,project,epic,...(isTask?[state.story]:[])],children:isSystem?[project]:selected.id===storyId?state.tasks:[],repositories:state.systemRepositories,availableRepositories:state.systemRepositories,environments:[],history:[],hierarchy:{writable:system.status==='active'}});
    }
    return send({items:[]});
  });
  await mockPersonas(page);
  await mockTaskCollection(page,()=>state.tasks);
  return state;
}

const navigation=(page:Page)=>page.getByRole('navigation',{name:'Seções de História',exact:true});
const process=(page:Page)=>page.getByTestId('story-process');
const executionDetails=(page:Page)=>page.getByRole('navigation',{name:'Detalhes da execução',exact:true});
const review=(page:Page)=>process(page).getByRole('button',{name:'Revisar aprovação',exact:true});
const confirmation=(page:Page)=>process(page).getByRole('region',{name:'Confirmar decisão da etapa',exact:true});
const approve=(page:Page)=>process(page).getByRole('button',{name:'Aprovar e enfileirar codificação',exact:true});
const clean=(state:Awaited<ReturnType<typeof fixture>>)=>{expect(state.errors).toEqual([]);expect(state.unexpected).toEqual([]);};
function missingRepository(state:Awaited<ReturnType<typeof fixture>>) {
  state.run=null;state.story.status='specification';state.systemRepositories=[];
  state.current={phase:'SPECIFICATION',kind:'specification',state:'not_started',title:'A execução ainda não começou',message:'Confira o escopo, os critérios e o repositório.',who:'Pessoa responsável pela entrega'};
  state.action={...uiAction('prepare','Preparar especificação',`/api/items/${storyId}/execution`,{expectedVersion:7}),enabled:false,reason:'O Sistema ainda não possui repositório. Crie-o na página do Sistema.'};
}
async function capture(page:Page,name:string) {
  if (!env.SCREENSHOT_DIR) return;
  mkdirSync(env.SCREENSHOT_DIR,{recursive:true});
  // Focus is asserted before capture; present the complete Portal from its top.
  await page.evaluate(()=>{(document.activeElement as HTMLElement | null)?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:`${env.SCREENSHOT_DIR}/${name}.png`,fullPage:true});
}

test('História preserva shell, seis abas e entrada em Tarefas; Execução concentra a decisão',async({page})=>{
  const state=await fixture(page); await page.goto(storyUrl);
  await expect(page.locator('.sidebar .brand')).toContainText('Dell Technologies');
  await expect(page.getByRole('navigation',{name:'Principal',exact:true}).getByRole('link')).toHaveText(['Visão geral','Assistente','Sistemas','Releases','Integrações']);
  await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('ana');
  await expect(page.getByRole('navigation',{name:'Localização',exact:true})).toContainText(state.story.name);
  await expect(navigation(page).getByRole('link')).toHaveText([/^Tarefas/,'Execução','Especificação','Conversas','Auditoria','Configurações']);
  await expect(navigation(page).getByRole('link',{name:/^Tarefas/})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('heading',{name:'Tarefas da História',exact:true})).toBeVisible();
  await openWorkPanel(page);
  await expect(page.getByRole('region',{name:'Ciclo da História',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Abrir Assistente neste contexto'})).toHaveCount(0);
  await expect(process(page).getByRole('heading',{name:'Podemos começar a codificação?',exact:true})).toBeVisible();
  await expect(process(page).getByText('Gateway de Especificação',{exact:true})).toBeVisible();
  await capture(page,'story-flow-desktop');
  expect(state.writes).toEqual([]); clean(state);
});

test('Gateway usa confirmação inline com foco e preserva o comando, corpo e autoria originais',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=planning`);
  await expect(review(page)).toBeEnabled(); await review(page).focus(); await page.keyboard.press('Enter');
  await expect(confirmation(page)).toBeVisible(); await expect(confirmation(page)).toBeFocused();
  await capture(page,'story-flow-gateway-confirmation-desktop');
  await expect(page.locator('dialog:visible')).toHaveCount(0);
  await expect(approve(page)).toBeDisabled();
  await process(page).getByRole('button',{name:'Voltar',exact:true}).click();
  await expect(review(page)).toBeFocused(); expect(state.writes).toEqual([]);
  await review(page).click(); await process(page).getByRole('checkbox',{name:checkboxName,exact:true}).check();
  await approve(page).click();
  await expect(process(page)).toContainText('Na fila; o início do trabalho ainda não foi confirmado.');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({path:approvePath,method:'POST',body:{expectedVersion:7},persona:'ana'});
  expect(state.writes[0].key).toBeTruthy(); expect(state.approvalEffects).toBe(1); clean(state);
});

test('mudança de versão durante a confirmação exige revisar a decisão nova',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=planning`);
  await review(page).click(); await process(page).getByRole('checkbox',{name:checkboxName,exact:true}).check();
  state.story.version=8; state.action={...state.action,body:{expectedVersion:8}};
  await expect(confirmation(page)).toHaveCount(0,{timeout:10000});
  await expect(review(page)).toBeEnabled(); await expect(review(page)).toBeFocused();
  expect(state.writes).toEqual([]);
  await review(page).click(); await expect(process(page).getByRole('checkbox',{name:checkboxName,exact:true})).not.toBeChecked();
  await expect(approve(page)).toBeDisabled();
  await process(page).getByRole('checkbox',{name:checkboxName,exact:true}).check(); await approve(page).click();
  await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0].body).toEqual({expectedVersion:8}); clean(state);
});

test('editar mantém formulário e rascunho centrais, sem decisão concorrente ou escrita ao cancelar',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=planning`); await review(page).click();
  await page.getByTestId('edit-item').click();
  const form=page.getByRole('form',{name:'Formulário do item',exact:true});
  await expect(form).toBeVisible(); await expect(process(page)).toBeHidden();
  await expect(page.getByRole('button',{name:'Salvar',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toHaveCount(1);
  await form.getByRole('textbox',{name:/Nome ou título/}).fill('Rascunho de título preservado');
  await form.getByRole('textbox',{name:'Descrição',exact:true}).fill('Rascunho de descrição preservado.');
  await navigation(page).getByRole('link',{name:'Especificação',exact:true}).click();
  await expect(form.getByRole('textbox',{name:/Nome ou título/})).toHaveValue('Rascunho de título preservado');
  await expect(form.getByRole('textbox',{name:'Descrição',exact:true})).toHaveValue('Rascunho de descrição preservado.');
  await expect(process(page)).toBeHidden();
  await page.getByRole('button',{name:'Cancelar',exact:true}).click(); await openWorkPanel(page);
  if (!await confirmation(page).isVisible()) await review(page).click();
  await expect(confirmation(page)).toBeVisible(); expect(state.writes).toEqual([]); clean(state);
});

for (const currentState of ['queued','running']) test(`${currentState} mostra a situação observada sem botão fictício de continuar`,async({page})=>{
  const state=await fixture(page); state.story.status=currentState==='queued'?'approved':'coding';
  state.run={...state.run,state:currentState,stage:'generation'}; state.action=null;
  state.current={kind:'coding',state:currentState,title:currentState==='queued'?'Codificação na fila':'O agente está codificando',message:'Aguardando o resultado observado do executor.',who:'Executor de codificação'};
  state.signals={lastHeartbeatAt:currentState==='running'?new Date().toISOString():null,heartbeatStaleAfterMs:45000};
  await page.goto(`${storyUrl}?tab=planning`); await expect(process(page)).toBeVisible();
  await expect(process(page).locator('button.primary:visible')).toHaveCount(0);
  await expect(process(page).getByRole('button',{name:/Continuar|Iniciar codificação|Próxima etapa/i})).toHaveCount(0);
  await expect(process(page)).toContainText(currentState==='queued'?'o início do trabalho ainda não foi confirmado':'Última confirmação do executor');
  await executionDetails(page).getByRole('button',{name:'Consultar sinais e evidências',exact:true}).click();
  await expect(process(page).getByTestId('processing-signals')).toBeVisible();
  await process(page).getByRole('button',{name:'← Voltar à etapa atual',exact:true}).click();
  await expect(page).toHaveURL(/process=action/); expect(state.writes).toEqual([]); clean(state);
});

test('persona de consulta e tentativa histórica não liberam aprovação por caminhos secundários',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=planning`); await review(page).click();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
  await expect(confirmation(page)).toHaveCount(0); await expect(review(page)).toBeDisabled();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('ana'); await expect(review(page)).toBeEnabled();
  await page.goto(`${storyUrl}?tab=planning&attempt=old-attempt&tasks.q=endereço`);
  await expect(process(page)).toContainText('Tentativa anterior, somente leitura.');
  await expect(review(page)).toHaveCount(0); await expect(process(page).getByRole('checkbox',{name:checkboxName})).toHaveCount(0);
  await executionDetails(page).getByRole('button',{name:'Conversar sobre esta etapa',exact:true}).click();
  await expect(process(page)).toContainText('Para conversar sobre a pendência atual');
  await expect(process(page).getByRole('textbox')).toHaveCount(0);
  expect(state.writes).toEqual([]); clean(state);
});

test('Gateway permanece no shell e acessível por teclado em celular e altura reduzida',async({page})=>{
  const state=await fixture(page);
  for (const height of [844,500]) {
    await page.setViewportSize({width:390,height});
    await page.goto(`${storyUrl}?tab=planning`);
    await expect(page.locator('.sidebar .brand')).toBeVisible();
    await expect(navigation(page).getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');
    await review(page).focus(); await page.keyboard.press('Enter');
    await expect(confirmation(page)).toBeFocused();
    const check=process(page).getByRole('checkbox',{name:checkboxName,exact:true});
    await check.scrollIntoViewIfNeeded(); await check.focus();
    expect(await check.evaluate(element=>{const box=element.getBoundingClientRect();return document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)===element;})).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await capture(page,`story-flow-gateway-confirmation-390-${height}`);
  }
  expect(state.writes).toEqual([]); clean(state);
});

test('Componentes legado consulta o repositório herdado sem escolhas e conserva filtros e retorno pelo Sistema',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=components&tasks.q=endereço&tasks.direction=asc`);
  await expect(page).toHaveURL(/tab=planning/); await expect(page).toHaveURL(/process=destination/);
  await expect(page).toHaveURL(/tasks.q=endere%C3%A7o/);
  const destination=page.getByRole('region',{name:'Destino da implementação',exact:true});
  await expect(destination).toBeVisible();
  const inherited=destination.getByRole('region',{name:'Repositório do Sistema',exact:true});
  await expect(inherited.getByRole('heading',{name:state.system.name,exact:true})).toBeVisible();
  await expect(inherited).toContainText('repositório herdado do Sistema');
  await expect(destination.locator('a[href^="http"]')).toHaveCount(0);
  await expect(inherited).not.toContainText('lab/flow/app');
  await expect(destination.getByRole('checkbox')).toHaveCount(0);
  await expect(destination.getByRole('combobox')).toHaveCount(0);
  await expect(destination.getByRole('button',{name:/Selecionar|Salvar seleção|Criar repositório/})).toHaveCount(0);
  await expect(page).toHaveURL(/tasks.direction=asc/);
  const consult=destination.getByRole('link',{name:'Consultar repositório no Sistema →',exact:true});
  const destinationUrl=new URL(page.url());
  const target=new URL(await consult.getAttribute('href')||'',page.url());
  expect(target.pathname).toBe('/systems/flow-system');expect(target.searchParams.get('tab')).toBe('components');
  expect(target.searchParams.get('returnTo')).toBe(destinationUrl.pathname+destinationUrl.search);
  await consult.click();
  await expect(page.getByRole('heading',{name:'Integração GitLab do Sistema',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Repositório do Sistema',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Abrir repositório no GitLab ↗',exact:true})).toHaveAttribute('href','http://gitlab.invalid/lab/flow/app');
  await expect(page.getByRole('button',{name:'Criar repositório do Sistema',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'← Voltar ao destino da História',exact:true}).click();
  await expect(destination).toBeVisible();await expect(page).toHaveURL(destinationUrl.href);
  await destination.getByRole('button',{name:'Voltar à etapa atual',exact:true}).click();
  await expect(review(page)).toBeEnabled();await expect(page).toHaveURL(/tasks.q=endere%C3%A7o/);
  expect(state.writes).toEqual([]);
  clean(state);
});

test('mais de um repositório legado permanece consultável sem escolha automática ou mutação',async({page})=>{
  const state=await fixture(page);
  state.systemRepositories.push({...state.systemRepositories[0],id:'flow-repository-legacy',name:'Repositório legado preservado',key:'legacy',gitlabProjectId:43,gitlabPath:'lab/flow/legacy',gitlabUrl:'http://gitlab.invalid/lab/flow/legacy'});
  state.action=null;state.current={...state.current,state:'blocked',title:'Repositórios legados precisam de revisão'};
  await page.goto(`${storyUrl}?tab=planning&process=destination`);
  const destination=page.getByRole('region',{name:'Destino da implementação',exact:true});
  await expect(destination.getByRole('article')).toHaveCount(2);
  await expect(destination.getByRole('heading',{name:state.system.name,exact:true})).toBeVisible();
  await expect(destination.getByRole('heading',{name:'Repositório legado preservado',exact:true})).toBeVisible();
  await expect(destination.getByRole('status')).toContainText('nenhum foi escolhido automaticamente');
  await expect(destination.getByRole('checkbox')).toHaveCount(0);
  await expect(destination.getByRole('button',{name:/Selecionar|Salvar seleção|Criar repositório/})).toHaveCount(0);
  await destination.getByRole('link',{name:'Consultar repositório no Sistema →',exact:true}).click();
  const repositories=page.getByRole('region',{name:'Repositório do Sistema',exact:true});
  await expect(repositories.getByRole('article')).toHaveCount(2);
  await expect(repositories.getByRole('status')).toContainText('mais de um repositório legado');
  await expect(repositories.getByRole('link',{name:'Abrir repositório no GitLab ↗',exact:true})).toHaveCount(2);
  await expect(repositories.getByRole('button')).toHaveCount(0);
  expect(state.writes).toEqual([]);clean(state);
});

test('pedido incerto permite consultar o repositório herdado e retornar antes de reconciliar a intenção original',async({page})=>{
  const state=await fixture(page); state.abortApprovalOnce=true; await page.goto(`${storyUrl}?tab=planning`);
  await review(page).click(); await process(page).getByRole('checkbox',{name:checkboxName,exact:true}).check(); await approve(page).click();
  await expect(process(page).getByTestId('pending-command')).toBeVisible();
  await executionDetails(page).getByRole('button',{name:'Repositório do Sistema',exact:true}).click();
  const destination=page.getByRole('region',{name:'Destino da implementação',exact:true});
  await expect(destination).toBeVisible();
  await expect(destination.getByRole('heading',{name:state.system.name,exact:true})).toBeVisible();
  await expect(destination.getByRole('checkbox')).toHaveCount(0);
  await expect(destination.getByRole('button',{name:/Selecionar|Salvar seleção|Criar repositório/})).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  await destination.getByRole('button',{name:'Voltar à etapa atual',exact:true}).click();
  await expect(process(page).getByTestId('pending-command')).toBeVisible();
  await process(page).getByRole('button',{name:'Verificar a mesma solicitação',exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(2);
  expect(state.writes[1]).toEqual(state.writes[0]); expect(state.approvalEffects).toBe(1); clean(state);
});

test('confirmação incerta reconcilia a mesma intenção após recarga sem repetir o efeito',async({page})=>{
  const state=await fixture(page); state.abortApprovalOnce=true; await page.goto(`${storyUrl}?tab=planning`);
  await review(page).click(); await process(page).getByRole('checkbox',{name:checkboxName,exact:true}).check(); await approve(page).click();
  await expect(process(page).getByTestId('pending-command')).toBeVisible();
  await expect(page.getByTestId('edit-item')).toBeDisabled();
  await page.reload(); await expect(process(page).getByTestId('pending-command')).toBeVisible();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('bruno');
  await expect(process(page).getByRole('button',{name:'Verificar a mesma solicitação',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');
  await process(page).getByRole('button',{name:'Verificar a mesma solicitação',exact:true}).click();
  await expect(process(page).getByTestId('pending-command')).toHaveCount(0);
  expect(state.writes).toHaveLength(2); expect(state.writes[1]).toEqual(state.writes[0]);
  expect(state.writes[0].body).toEqual({expectedVersion:7}); expect(state.approvalEffects).toBe(1); clean(state);
});

test('nome Gateway não reescreve conteúdo de plano registrado pelo agente',async({page})=>{
  const state=await fixture(page); await page.goto(`${storyUrl}?tab=specification`);
  await expect(page.getByText('Conteúdo original G1 do plano, preservado como evidência.',{exact:true}).first()).toBeVisible();
  expect(state.writes).toEqual([]); clean(state);
});

test('acervo conserva o estado registrado e o destino em consulta sem ações operacionais',async({page})=>{
  const state=await fixture(page); state.story.archived=true; state.story.status='cancelled';
  await page.goto(`${storyUrl}?tab=components&history.q=consulta`);
  await expect(page.getByRole('heading',{name:'Repositório do Sistema',exact:true})).toBeVisible();
  await expect(page.locator('.archived-item .page-heading .badge')).toHaveText('CANCELLED');
  await expect(navigation(page).getByRole('link',{name:'Componentes',exact:true})).toHaveCount(0);
  await expect(navigation(page).getByRole('link',{name:'Execução',exact:true})).toHaveAttribute('aria-current','page');
  const consult=page.getByRole('link',{name:'Consultar repositório no Sistema →',exact:true});
  const target=new URL(await consult.getAttribute('href')||'',page.url());
  expect(target.pathname).toBe('/systems/flow-system');expect(target.searchParams.get('tab')).toBe('components');
  expect(target.searchParams.get('returnTo')).toBe(`${storyUrl}?tab=components&history.q=consulta`);
  await expect(page.getByRole('button',{name:'Revisar aprovação',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Selecionar repositórios',exact:true})).toHaveCount(0);
  await expect(page).toHaveURL(/history.q=consulta/); expect(state.writes).toEqual([]); clean(state);
});

test('pendência de repositório conserva a razão do backend e leva ao Sistema com retorno ao recorte da História',async({page})=>{
  const state=await fixture(page);missingRepository(state);
  await page.goto(`${storyUrl}?tab=planning&tasks.q=cliente`);
  const prepare=process(page).getByRole('button',{name:'Preparar especificação',exact:true});await expect(prepare).toBeDisabled();
  await expect(prepare).toHaveAccessibleDescription('O Sistema ainda não possui repositório. Crie-o na página do Sistema.');
  await expect(process(page)).not.toContainText('acesso de consulta');
  await expect(process(page).getByRole('button',{name:'Configurar destino da implementação',exact:true})).toHaveCount(0);
  await capture(page,'preparacao-bloqueada-destino');
  await process(page).getByRole('link',{name:'Consultar repositório no Sistema →',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Repositório do Sistema',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Criar repositório do Sistema',exact:true})).toBeEnabled();
  await page.getByRole('link',{name:'← Voltar ao destino da História',exact:true}).click();
  const destination=page.getByRole('region',{name:'Destino da implementação',exact:true});
  await expect(destination).toBeVisible();await expect(destination).toContainText('O Sistema ainda não possui repositório.');
  await expect(destination.getByRole('button',{name:/Selecionar|Criar repositório/})).toHaveCount(0);
  await expect(destination.getByRole('link',{name:/Selecionar repositórios do Projeto/})).toHaveCount(0);
  await expect(page).toHaveURL(/tasks.q=cliente/);
  await destination.getByRole('button',{name:'Voltar à etapa atual',exact:true}).click();
  await expect(prepare).toBeDisabled();expect(state.writes).toEqual([]);clean(state);
});

test('Projeto e Tarefa consultam o mesmo repositório do Sistema sem escopo ou seleção próprios',async({page})=>{
  const state=await fixture(page);
  for (const url of ['/projects/flow-project?tab=manage','/tasks/flow-task-1?tab=components']) {
    await page.goto(url);
    const inherited=page.getByRole('region',{name:'Repositório do Sistema',exact:true});
    await expect(inherited).toBeVisible();
    await expect(inherited.getByRole('heading',{name:state.system.name,exact:true})).toBeVisible();
    await expect(inherited).toContainText('repositório herdado do Sistema');
    await expect(inherited.locator('a[href^="http"]')).toHaveCount(0);
    await expect(inherited.getByRole('checkbox')).toHaveCount(0);
    await expect(inherited.getByRole('combobox')).toHaveCount(0);
    await expect(inherited.getByRole('button')).toHaveCount(0);
    await expect(inherited.getByRole('link',{name:'Consultar repositório no Sistema →',exact:true})).toHaveAttribute('href','/systems/flow-system?tab=components');
  }
  expect(state.writes).toEqual([]);clean(state);
});

test('Ana solicita a criação única e neutra no Sistema ativo; consulta e inatividade não permitem criar',async({page})=>{
  const state=await fixture(page);missingRepository(state);await page.goto('/systems/flow-system?tab=components');
  const repository=page.getByRole('region',{name:'Repositório do Sistema',exact:true});
  const create=repository.getByRole('button',{name:'Criar repositório do Sistema',exact:true});
  await expect(create).toBeEnabled();
  await expect(repository.getByRole('combobox')).toHaveCount(0);
  await expect(repository.getByRole('textbox')).toHaveCount(0);
  await expect(repository.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('combobox',{name:/Persona/}).selectOption('carla');
  await expect(create).toHaveCount(0);expect(state.writes).toEqual([]);
  await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');await expect(create).toBeEnabled();
  state.system.status='inactive';await page.reload();await expect(create).toHaveCount(0);
  expect(state.writes).toEqual([]);
  state.system.status='active';await page.reload();await expect(create).toBeEnabled();
  await create.click();
  await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({method:'POST',path:'/api/systems/flow-system/repositories',persona:'ana',body:{name:state.system.name,key:'app',runtime:'generic',mode:'create'}});
  await expect(repository.getByRole('article')).toHaveCount(1);
  await expect(repository.getByRole('heading',{name:state.system.name,exact:true})).toBeVisible();
  await expect(repository).toContainText('QUEUED');
  await expect(create).toHaveCount(0);expect(state.repositoryCreations).toBe(1);
  await page.reload();await expect(repository.getByRole('article')).toHaveCount(1);await expect(create).toHaveCount(0);
  expect(state.writes).toHaveLength(1);clean(state);
});
