// Experiência isolada de navegação. Eventos, pareceres e conversas são fictícios.
// Não faz chamadas ao portal, GitLab, modelos ou outros serviços.
import {collection, collectionState, historyView, queryLink} from './queries.mjs';
import {spinner,failureIcon} from './feedback.mjs';

const STORE = 'sdlc-story-workspace-prototype-v2-experience';
const PHASES = ['SPECIFICATION','APPROVED','CODING','CODE REVIEW','SECURITY SCAN','TESTING','UAT','PRODUCTION','COMPLETED'];
const clone = value => JSON.parse(JSON.stringify(value));
const fallbackEsc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const TYPES = {spec:'Especificação',coding:'Codificação',manual:'Trabalho manual',review:'Code Review',scan:'Security Scan',merge:'Integração do código'};
const fixtureTimestamp = minute => new Date(Date.UTC(2026,9,24,13,20) + Number(minute || 0)*60000).toISOString();
const shortDate = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)) : 'Não registrado';
const normalizeRoute = route => Object.fromEntries(Object.entries(route || {}).map(([key,value])=>[key,typeof value === 'string' ? value.split('?')[0] : value]));
const CASES = {
  approval: {label:'G1 aguardando decisão',phase:'SPECIFICATION',task:'spec',status:'WAITING APPROVAL',title:'Especificação pronta; G1 aguarda sua decisão',who:'Responsável pela aprovação',detail:'Revise os critérios e confirme a autorização antes de iniciar o trabalho.',action:'approve',actionLabel:'Revisar aprovação G1'},
  approved: {label:'G1 aprovado; codificação não iniciada',phase:'APPROVED',task:'coding',status:'NOT STARTED',title:'Escopo aprovado; codificação ainda não começou',who:'Pessoa autorizada a executar',detail:'A aprovação está registrada. Iniciar coloca o trabalho na fila.',action:'start',actionLabel:'Iniciar codificação'},
  queued: {label:'Codificação na fila',phase:'CODING',task:'coding',status:'QUEUED',title:'Codificação recebida; aguardando executor',who:'Executor do SDLC',detail:'A Tarefa permanece TO DO até o início confirmado. Não reenvie a solicitação.',next:'running'},
  running: {label:'Codificação aguardando o modelo',phase:'CODING',task:'coding',status:'RUNNING',title:'Codificação em andamento; aguardando resposta do modelo',who:'Agente de implementação',detail:'O contexto foi enviado. Não há confirmação de progresso interno do modelo.',next:'published'},
  published: {label:'Código publicado; review pendente',phase:'CODING',task:'coding',status:'WAITING INPUT',title:'Proposta publicada; Code Review ainda não solicitado',who:'Pessoa responsável pela entrega',detail:'Publicação comprova somente a entrega de código do escopo vinculado. As outras Tarefas continuam com seus próprios critérios.',action:'review',actionLabel:'Iniciar Code Review'},
  'review-queued': {label:'Code Review na fila',phase:'CODE REVIEW',task:'review',status:'QUEUED',title:'Code Review solicitado; aguardando executor',who:'Executor de revisão',detail:'A Tarefa técnica foi criada ou reutilizada uma única vez. Ainda não começou.',next:'review-running'},
  'review-running': {label:'Code Review em processamento',phase:'CODE REVIEW',task:'review',status:'RUNNING',title:'Code Review em andamento; aguardando análise',who:'Agente de Code Review',detail:'O contexto da revisão atual foi obtido no GitLab e enviado ao modelo.',next:'review-findings'},
  'review-findings': {label:'Code Review com achado de credencial no código',phase:'CODE REVIEW',task:'review',status:'BLOCKED',title:'Code Review encontrou um problema no código',who:'Responsável pela correção',detail:'O parecer identificou uso de uma credencial fixa em configuração do produto. É um achado do código; o acesso da integração está funcionando.',action:'correct',actionLabel:'Preparar correção dos achados'},
  'correction-queued': {label:'Correção autorizada na fila',phase:'CODING',task:'coding',status:'QUEUED',title:'Correção autorizada; aguardando executor',who:'Agente de implementação',detail:'Apenas o trabalho afetado foi reaberto. Review anterior continua no histórico.',next:'correction-running'},
  'correction-running': {label:'Correção em processamento',phase:'CODING',task:'coding',status:'RUNNING',title:'Agente corrigindo o achado autorizado',who:'Agente de implementação',detail:'Escopo aprovado e achado vinculados à mesma Tarefa de código. Nenhuma aprovação de qualidade foi concedida.',next:'revision-published'},
  'revision-published': {label:'Correção publicada; nova revisão obrigatória',phase:'CODING',task:'coding',status:'WAITING INPUT',title:'Correção publicada; a nova revisão precisa de Code Review',who:'Pessoa responsável pela entrega',detail:'Pareceres anteriores pertencem à revisão 1. Review e Security Scan precisam comprovar a revisão 2.',action:'review',actionLabel:'Iniciar Code Review da nova revisão'},
  'review-passed': {label:'Code Review aprovado; scan pendente',phase:'CODE REVIEW',task:'review',status:'PASSED',title:'Code Review aprovado; Security Scan pendente',who:'Pessoa responsável pela entrega',detail:'O parecer vale somente para a revisão exibida. Nenhuma verificação de segurança foi dispensada.',action:'scan',actionLabel:'Executar Security Scan'},
  'scan-queued': {label:'Security Scan na fila',phase:'SECURITY SCAN',task:'scan',status:'QUEUED',title:'Security Scan solicitado; aguardando executor',who:'Executor de segurança',detail:'A Tarefa técnica foi criada ou reutilizada. Estar na fila não significa que a análise começou.',next:'scan-running'},
  'scan-running': {label:'Security Scan em processamento',phase:'SECURITY SCAN',task:'scan',status:'RUNNING',title:'Security Scan analisando o código',who:'Ferramenta de análise estática',detail:'A ferramenta recebeu os arquivos e a política. O resultado ainda não foi confirmado.',next:'scan-passed'},
  'scan-findings': {label:'Security Scan com vulnerabilidade',phase:'SECURITY SCAN',task:'scan',status:'BLOCKED',title:'Security Scan encontrou uma vulnerabilidade',who:'Responsável pela correção',detail:'Qualquer vulnerabilidade bloqueia a integração. A correção requer novo commit e novas verificações.',action:'correct',actionLabel:'Preparar correção da vulnerabilidade'},
  'scan-passed': {label:'Verificações aprovadas; merge pendente',phase:'SECURITY SCAN',task:'scan',status:'PASSED',title:'Revisão e segurança aprovadas; integração pendente',who:'Pessoa autorizada a integrar',detail:'As evidências pertencem à revisão atual. Escolha integração assistida ou consulte o MR no GitLab.',action:'merge',actionLabel:'Solicitar merge ao assistente'},
  'merge-queued': {label:'Merge solicitado na fila',phase:'SECURITY SCAN',task:'merge',status:'QUEUED',title:'Integração solicitada; aguardando executor',who:'Assistente de merge',detail:'A solicitação conserva a mesma revisão aprovada. A História ainda não chegou aos testes.',next:'merge-running'},
  'merge-running': {label:'Merge aguardando GitLab',phase:'SECURITY SCAN',task:'merge',status:'RUNNING',title:'GitLab recebeu a solicitação; aguardando confirmação',who:'GitLab',detail:'Um pedido aceito não comprova integração. A Tarefa será concluída após o merge observado.',next:'merged'},
  merged: {label:'Merge confirmado; testes ainda pendentes',phase:'TESTING',task:'merge',status:'WAITING DEPENDENCY',title:'Código integrado; testes e entrega continuam pendentes',who:'Responsável pela entrega',detail:'O merge foi observado neste cenário. O executor de testes reais não faz parte deste protótipo. A História não está concluída.',action:'delivery',actionLabel:'Consultar entrega e release'},
  'auth-error': {label:'Integração recusou a credencial · HTTP 401',phase:'CODE REVIEW',task:'review',status:'FAILED',title:'GitLab recusou a credencial da integração',who:'Administrador da integração',detail:'HTTP 401 ao obter o contexto. A análise não foi executada. Resolver o acesso não exige alterar o código do produto.',action:'access',actionLabel:'Resolver acesso da integração'},
  disconnected: {label:'A tela perdeu conexão; execução desconhecida',phase:'CODE REVIEW',task:'review',status:'STATUS UNAVAILABLE',title:'A tela perdeu a conexão; situação atual desconhecida',who:'Interface · consultar novamente',detail:'Último estado confirmado: Code Review aguardando resposta. Falha da consulta não comprova falha ou cancelamento da execução.',action:'reconnect',actionLabel:'Consultar a mesma operação novamente',next:'review-running'},
  'no-heartbeat': {label:'Executor sem confirmação recente',phase:'CODE REVIEW',task:'review',status:'SIGNAL STALE',title:'Sem confirmação recente do executor',who:'Responsável pela operação',detail:'A tela está conectada, mas o executor não confirmou presença no intervalo ilustrativo. O silêncio não comprova travamento do modelo.',action:'diagnose',actionLabel:'Consultar diagnóstico da operação',next:'review-running'},
};

export function storyWorkspace(options) {
  const {entities,render:rerender,releasePanel=()=>'',persona=()=> 'admin'} = options;
  const esc = options.esc || fallbackEsc;
  let headerObserver;
  let memory;
  try {memory = JSON.parse(sessionStorage.getItem(STORE) || '{}');} catch {memory = {};}
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) memory = {};
  memory.stories ??= {};
  const save = () => {try {sessionStorage.setItem(STORE, JSON.stringify(memory));} catch { /* Storage is optional in this isolated prototype. */ }};
  const byId = id => entities.find(item => item.id === id);
  const withQuery = path => {const query=String(location.hash || '').split('?').slice(1).join('?');return `${path}${query?'?'+query:''}`;};
  const url = (story,tab='overview') => withQuery(`#/story/${encodeURIComponent(story.id)}/${tab}`);
  const taskUrl = (story,task,tab='overview',attempt) => withQuery(`#/story/${encodeURIComponent(story.id)}/task/${encodeURIComponent(typeof task === 'string' ? task : task.id)}/${tab}${attempt ? '/'+encodeURIComponent(attempt) : ''}`);
  const taskCollectionId = story => `sw-tasks-${story.id}`;
  const canPlan = () => ['admin','ana','bruno'].includes(persona());
  const canAct = action => action === 'approve' ? ['admin','ana'].includes(persona()) : canPlan();
  const actor = () => ({actor:({admin:'Administrador',ana:'Ana',bruno:'Bruno',carla:'Carla',diego:'Diego',elisa:'Elisa'})[persona()] || null,actorType:'human',type:'Decisão simulada'});
  const badge = (text,tone='neutral',{busy=false}={}) => {const failed=['FAILED','STATUS UNAVAILABLE'].includes(text);return `<span class="sw-badge${failed?' ui-error':''}" data-tone="${failed?'danger':tone}">${busy?spinner():failed?failureIcon():''}${esc(text)}</span>`;};
  const announce = text => {const region=document.querySelector('#live-announcement');if(region)region.textContent=text;};
  const stateCase = state => CASES[state.scenario] || CASES.approval;
  function baseTasks(story) {
    const original = entities.filter(item => item.kind === 'task' && item.parentId === story.id && !item.archived);
    const specified = original.find(item => item.id === 'task-criterios');
    const coding = original.find(item => ['task-consulta','task-protocolo','task-filtros','task-resumo'].includes(item.id)) || original.find(item => item.id !== specified?.id && item.id !== 'task-acessibilidade');
    const rows = original.map(item => ({id:item.id,name:item.name,description:item.description,type:item.id===specified?.id?'spec':item.id===coding?.id?'coding':'manual',status:item.status==='todo'?'TO DO':String(item.status || 'TO DO').replaceAll('_',' ').toUpperCase(),origin:'Planejada',evidence:item.status==='done'?'Registro fictício de planejamento já disponível no exemplo original. Não constitui evidência de testes ou produção.':null}));
    if (!rows.some(item => item.type === 'spec')) rows.unshift({id:'sw-spec',name:'Preparar e aprovar especificação',description:'Definir objetivo, critérios e limites do trabalho; registrar decisão G1.',type:'spec',status:'TO DO',origin:'Processo'});
    if (!rows.some(item => item.type === 'coding')) rows.push({id:'sw-coding',name:'Implementar o escopo aprovado',description:'Gerar e publicar somente o trabalho explicitamente vinculado ao escopo aprovado.',type:'coding',status:'TO DO',origin:'Processo'});
    return rows;
  }
  function ensureTask(state,type) {
    let task=state.tasks.find(item=>item.type===type);
    if (!task) {task={id:`sw-${type}`,type,name:TYPES[type],description:{review:'Revisar o código da revisão atual e registrar um parecer verificável.',scan:'Analisar a revisão atual com a política de bloqueio por qualquer vulnerabilidade.',merge:'Integrar exatamente a revisão aprovada e confirmar o resultado no GitLab.'}[type] || TYPES[type],status:'TO DO',origin:'Processo',evidence:null};state.tasks.push(task);}
    return task;
  }
  const activeTask = state => ensureTask(state,stateCase(state).task);
  const currentAttempt = (state,task=activeTask(state)) => state.attempts.filter(item=>item.taskId===task.id && item.revision===state.revision).at(-1);
  function record(state,task,status,summary,extra={}) {
    let attempt = state.attempts.find(item=>item.taskId===task.id && item.revision===state.revision && ['QUEUED','RUNNING'].includes(item.state));
    if (!attempt) {attempt={id:`attempt-${++state.sequence}`,taskId:task.id,revision:state.revision,number:state.attempts.filter(item=>item.taskId===task.id).length+1,state:status,summary,createdAt:fixtureTimestamp(state.sequence),sha:`example-r${state.revision}`,events:[],findings:[]};state.attempts.push(attempt);}
    attempt.state=status;attempt.summary=summary;Object.assign(attempt,extra);
    if (attempt.events.at(-1)?.title!==summary) attempt.events.push({id:`${attempt.id}-event-${attempt.events.length+1}`,timestamp:fixtureTimestamp(state.sequence+attempt.events.length),time:`10:${String(20+state.sequence).padStart(2,'0')}:00`,title:summary,result:status,phase:stateCase(state).phase,revision:state.revision,sha:attempt.sha});
    return attempt;
  }
  function addEvent(state,title,extra={}) {if(state.events.at(-1)?.title!==title)state.events.push({id:`event-${state.events.length+1}`,timestamp:fixtureTimestamp(state.events.length),time:`10:${String(20+state.events.length).padStart(2,'0')}:00`,title,phase:stateCase(state).phase,result:stateCase(state).status,revision:state.revision,...extra});}
  function transition(state,key,{fixture=false}={}) {
    if(!CASES[key])return;
    if (state.scenario===key && !fixture)return;
    const previous=state.scenario;
    state.scenario=key;state.pending=null;state.confirmed=false;state.notice='';
    const c=stateCase(state),spec=ensureTask(state,'spec'),code=ensureTask(state,'coding');
    spec.status='DONE';spec.evidence='Documento de escopo fictício e critérios disponíveis; a decisão G1 é registrada separadamente.';
    if(key==='approval'){spec.status='DOING';spec.evidence='Documento fictício preparado; aprovação G1 ainda pendente. A condição de conclusão desta Tarefa ainda não foi atendida.';code.status='TO DO';return;}
    state.g1=true;
    if(key==='approved'){code.status='TO DO';addEvent(state,'G1 confirmado para o escopo fictício v1.');return;}
    if(['queued','correction-queued'].includes(key)){code.status='TO DO';code.evidence=null;record(state,code,'QUEUED','Pedido recebido; aguardando recurso de execução.');}
    else if(['running','correction-running'].includes(key)){code.status='DOING';record(state,code,'RUNNING','Contexto enviado ao modelo; aguardando resposta.');}
    else if(['published','revision-published'].includes(key)) {
      if(key==='revision-published'){
        state.revision+=1;
        const correction=state.attempts.filter(item=>item.taskId===code.id && ['QUEUED','RUNNING'].includes(item.state)).at(-1);
        if(correction)correction.revision=state.revision;
      }
      code.status='DONE';code.evidence=`Revisão ${state.revision}: publicação fictícia confirmada para o escopo desta Tarefa. Testes, revisão e segurança são trabalhos separados.`;
      record(state,code,'SUCCEEDED',`Publicação da revisão ${state.revision} confirmada.`,{evidence:code.evidence});
      for(const type of ['review','scan']){const task=state.tasks.find(item=>item.type===type);if(task){task.status='TO DO';task.evidence=null;}}
    } else {
      code.status='DONE';code.evidence??=`Publicação fictícia da revisão ${state.revision}, vinculada ao escopo da Tarefa.`;
      const review=ensureTask(state,'review');
      if(['review-queued','review-running','review-findings','auth-error','disconnected','no-heartbeat'].includes(key)) {
        review.status=key==='review-queued'?'TO DO':'DOING';review.evidence=null;
        const mode=key==='review-queued'?'QUEUED':key==='review-findings'?'BLOCKED':key==='auth-error'?'FAILED':'RUNNING';
        const findings=key==='review-findings'?[{category:'Credencial no código',severity:'HIGH',file:'src/config-example.js',line:8,summary:'A configuração do exemplo usa uma credencial fixa. Obter o valor por configuração segura e impedir exposição na resposta.'}]:[];
        record(state,review,mode,key==='auth-error'?'HTTP 401 ao obter contexto: análise não executada.':key==='review-findings'?'Parecer concluído com um achado; correção necessária.':key==='review-queued'?'Revisão solicitada; aguardando executor.':'Contexto obtido no GitLab; aguardando resposta do modelo.',{findings,category:key==='auth-error'?'INTEGRATION_AUTH':findings.length?'CODE_FINDING':null});
      } else {
        review.status='DONE';review.evidence=`Code Review aprovado para a revisão ${state.revision}.`;
        if(!currentAttempt(state,review) || currentAttempt(state,review).state!=='PASSED')record(state,review,'PASSED','Parecer aprovado; nenhum achado na revisão atual.',{findings:[],evidence:review.evidence});
        if(key!=='review-passed') {
          const scan=ensureTask(state,'scan');
          scan.status=key==='scan-queued'?'TO DO':['scan-running','scan-findings'].includes(key)?'DOING':'DONE';
          const mode=key==='scan-queued'?'QUEUED':key==='scan-running'?'RUNNING':key==='scan-findings'?'BLOCKED':'PASSED';
          const findings=key==='scan-findings'?[{category:'Vulnerabilidade',severity:'MEDIUM',file:'src/query-example.js',line:14,summary:'Entrada não validada alcança a consulta no exemplo fictício. A política bloqueia qualquer vulnerabilidade.'}]:[];
          scan.evidence=mode==='PASSED'?`Análise estática completa e sem vulnerabilidades para a revisão ${state.revision}; política ilustrativa zero achados.`:null;
          if(!currentAttempt(state,scan) || currentAttempt(state,scan).state!==mode)record(state,scan,mode,mode==='PASSED'?'Security Scan completo e aprovado.':mode==='BLOCKED'?'Vulnerabilidade encontrada; integração bloqueada.':mode==='QUEUED'?'Scan solicitado; aguardando executor.':'Arquivos e regras entregues ao scanner; aguardando resultado.',{findings,evidence:scan.evidence});
          if(['merge-queued','merge-running','merged'].includes(key)){
            const merge=ensureTask(state,'merge');merge.status=key==='merge-queued'?'TO DO':key==='merged'?'DONE':'DOING';
            merge.evidence=key==='merged'?`Merge fictício confirmado para a revisão ${state.revision}. Nenhum teste ou deploy comprovado.`:null;
            record(state,merge,key==='merged'?'SUCCEEDED':key==='merge-queued'?'QUEUED':'RUNNING',key==='merged'?'Merge observado no GitLab.':key==='merge-queued'?'Pedido de integração recebido.':'Pedido enviado ao GitLab; aguardando confirmação.',{evidence:merge.evidence});
          }
        }
      }
    }
    if(key==='correction-queued'){for(const type of ['review','scan']){const task=state.tasks.find(item=>item.type===type);if(task){task.status='TO DO';task.evidence=null;}}}
    if(previous!==key)addEvent(state,c.title);
  }
  function fixture(story,key) {
    const state={storyId:story.id,scenario:null,revision:1,g1:false,tasks:baseTasks(story),attempts:[],events:[],sequence:0,drafts:{},messages:{},filter:'all',pending:null,confirmed:false,notice:''};
    if(['correction-queued','correction-running','revision-published'].includes(key))transition(state,'review-findings');
    transition(state,key,{fixture:true});
    if(key==='approval')addEvent(state,'Especificação preparada; aprovação G1 ainda não registrada.');
    return state;
  }
  function get(story) {
    let state=memory.stories[story.id];
    if(!state || !Array.isArray(state.tasks) || !Array.isArray(state.attempts)){
      const initial={approval:'approval',queued:'queued',running:'running',impediment:'approval',failed:'auth-error',mr:'published',releaseReady:'merged'}[story.initialScenario] || 'approval';
      memory.stories[story.id]=state=fixture(story,initial);save();
    }
    // Manual creation/editing still belongs to the existing prototype manager.
    // Reconcile its local items without overwriting process-owned task states.
    for(const planned of baseTasks(story)){
      const existing=state.tasks.find(item=>item.id===planned.id);
      if(!existing)state.tasks.push(planned);
      else if(planned.origin==='Planejada'){
        existing.name=planned.name;existing.description=planned.description;
        if(existing.type==='manual')existing.status=planned.status;
      }
    }
    for(const planned of state.tasks){
      const source=byId(planned.id);
      if(source){planned.archived=!!source.archived;planned.name=source.name;planned.description=source.description;}
      if(planned.status==='TODO')planned.status='TO DO';
    }
    if(state.confirmed && state.confirmedBy!==persona()){state.confirmed=false;save();}
    return state;
  }
  const task = (story,id) => get(story).tasks.find(item=>item.id===id);
  const status = story => {const state=get(story),c=stateCase(state);return {phase:c.phase,status:c.phase.toLowerCase().replaceAll(' ','_'),title:c.title,operational:c.status,scenario:state.scenario};};
  function context(story,route={}) {
    route=normalizeRoute(route);
    const state=get(story),current=activeTask(state),selected=route.taskId?state.tasks.find(item=>item.id===route.taskId):null;
    const attempt=route.attemptId?state.attempts.find(item=>item.id===route.attemptId && item.taskId===selected?.id):null;
    const latest=selected?currentAttempt(state,selected):null;
    const historical=!!route.attemptId && (!attempt || attempt.revision!==state.revision || attempt.id!==latest?.id);
    return {state,current,selected,attempt,historical,c:stateCase(state)};
  }
  function header(story,route={}) {
    route=normalizeRoute(route);
    const {state,current,c,selected,historical}=context(story,route),index=PHASES.indexOf(c.phase),busy=['QUEUED','RUNNING'].includes(c.status),failed=['FAILED','STATUS UNAVAILABLE'].includes(c.status),signal=busy?'info':failed?'danger':['BLOCKED','SIGNAL STALE','WAITING APPROVAL','WAITING INPUT'].includes(c.status)?'warning':'success';
    return `<section class="sw-header" data-testid="story-situation" aria-label="Situação atual da História">
      <div class="sw-heading"><span><strong>${esc(story.key)} · História</strong> <span data-testid="story-phase">${esc(c.phase)}</span> · revisão ${state.revision}</span>${badge(c.status,signal,{busy})}<button class="button quiet small sw-secondary" data-sw-action="focus-interaction" data-testid="open-interaction">${['QUEUED','RUNNING'].includes(c.status)?'Acompanhar':'Abrir'} ${esc(TYPES[c.task])} ↓</button></div>
      <div class="sw-current${failed?' ui-error':''}"><strong>${failed?failureIcon():''}${esc(c.title)}</strong><span>Quem age: ${esc(c.who)}</span><a class="sw-link" data-testid="current-activity-link" href="${taskUrl(story,current)}">Atividade atual: ${esc(current.name)} →</a></div>
      <ol class="sw-cycle" aria-label="Ciclo da História">${PHASES.map((phase,i)=>`<li data-state="${i===index?'current':i<index?'done':'future'}" ${i===index?'aria-current="step"':''}><span class="sw-step-dot">${i+1}</span><span>${phase}</span></li>`).join('')}</ol>
      ${selected?`<p class="sw-viewing">Consulta: <strong>${esc(selected.name)}</strong>${historical?' · histórico, somente leitura':''}</p>`:''}
      <span class="sr-only">Dados e eventos simulados. O ciclo não comprova execução real.</span>
    </section>`;
  }
  function taskRows(story,state,{compact=false}={}) {
    const current=activeTask(state),c=stateCase(state),id=taskCollectionId(story),scope=collectionState(id,{scope:'all'}).scope;
    const rows=state.tasks.filter(item=>!item.archived||item.id===current.id).map((item,index)=>({...item,key:byId(item.id)?.key || `${story.key}-T${index+1}`,createdAt:byId(item.id)?.createdAt || fixtureTimestamp(index),operational:item.id===current.id?c.status:item.status==='DONE'?'SUCCEEDED':'NOT STARTED'}));
    if(compact){
      const shown=rows.slice(0,5);
      return `<div class="sw-task-list" data-testid="task-list">${shown.map(item=>`<article class="sw-task-card" data-status="${item.status}" data-testid="task-row-${esc(item.id)}"><div class="sw-section-head"><div><span class="sw-task-meta">${esc(item.origin)} · ${esc(TYPES[item.type])}</span><h3><a class="sw-link" href="${taskUrl(story,item)}">${esc(item.name)}</a></h3></div><span data-testid="task-status-${esc(item.id)}">${badge(item.status,item.status==='DONE'?'success':item.status==='DOING'?'info':'neutral')}</span></div><p>${esc(item.description)}</p>${item.id===current.id?`<p class="sw-task-meta">Atividade atual · ${esc(c.status)}</p>`:''}</article>`).join('')}</div><p class="sw-list-summary">${shown.length} de ${rows.length} Tarefas no resumo. <a class="sw-link" href="${url(story,'tasks')}">Buscar, filtrar e consultar todas as Tarefas →</a></p>`;
    }
    const shortcuts=`<div class="sw-filters" aria-label="Atalhos de consulta das Tarefas">${[['all','Todas'],['attention','Exige atenção agora'],['doing','Em andamento'],['blocked','Impedidas']].map(([value,title])=>`<button type="button" class="sw-secondary button secondary" data-sw-action="filter" data-value="${value}" aria-pressed="${scope===value}">${title}</button>`).join('')}<small>Atalhos aplicam imediatamente; não iniciam atividades.</small></div>`;
    const table=collection({
      id,title:'Tarefas da História',description:`Escopo fixo: ${story.name}. Busca por chave, nome e descrição. Tarefas manuais e do processo permanecem distintas; 20 registros por página.`,filterExtras:shortcuts,
      rows,pageSize:20,defaults:{sort:'createdAt',dir:'desc',scope:'all'},
      filters:[
        {key:'q',label:'Buscar Tarefa por chave, nome ou descrição',type:'search'},
        {key:'scope',label:'Situação da atividade',type:'select',default:'all',options:[{value:'all',label:'Todas'},{value:'attention',label:'Exige atenção agora'},{value:'doing',label:'Em andamento'},{value:'blocked',label:'Impedidas'}]},
        {key:'status',label:'Status da Tarefa',type:'select',options:[{value:'',label:'Todos'},{value:'TO DO',label:'TO DO'},{value:'DOING',label:'DOING'},{value:'DONE',label:'DONE'}]},
        {key:'origin',label:'Origem do trabalho',type:'select',options:[{value:'',label:'Todas'},{value:'Planejada',label:'Planejada'},{value:'Processo',label:'Processo'}]},
        {key:'type',label:'Tipo de atividade',type:'select',options:[{value:'',label:'Todos'},...Object.entries(TYPES).map(([value,label])=>({value,label}))]},
        {key:'from',label:'Criada de · simulação',type:'date'},{key:'to',label:'Criada até · inclusive',type:'date'},
      ],
      matches:(item,query)=>(!query.status||item.status===query.status)&&(!query.origin||item.origin===query.origin)&&(!query.type||item.type===query.type)&&(!query.from||new Date(item.createdAt)>=new Date(`${query.from}T00:00:00-03:00`))&&(!query.to||new Date(item.createdAt)<new Date(new Date(`${query.to}T00:00:00-03:00`).getTime()+86400000))&&(query.scope==='all'||query.scope==='attention'&&item.id===current.id||query.scope==='doing'&&item.status==='DOING'||query.scope==='blocked'&&item.id===current.id&&['FAILED','BLOCKED','SIGNAL STALE','STATUS UNAVAILABLE'].includes(c.status)),
      empty:'Nenhuma Tarefa neste recorte.',
      columns:[
        {key:'name',label:'Tarefa',value:item=>`${item.name} ${item.key} ${item.description}`,render:item=>`<div class="sw-query-task" data-testid="task-row-${esc(item.id)}"><small>${esc(item.key)}</small><a class="sw-link" href="${taskUrl(story,item)}">${esc(item.name)}</a><p>${esc(item.description)}</p>${item.id===current.id?'<strong class="sw-current-query">Atividade atual da História</strong>':''}</div>`},
        {key:'status',label:'Status',value:item=>['TO DO','DOING','DONE'].indexOf(item.status),render:item=>`<span data-testid="task-status-${esc(item.id)}">${badge(item.status,item.status==='DONE'?'success':item.status==='DOING'?'info':'neutral')}</span>`},
        {key:'origin',label:'Origem',render:item=>`${esc(item.origin)}<small class="query-secondary">${esc(TYPES[item.type])}</small>`},
        {key:'operational',label:'Condição operacional',render:item=>badge(item.operational,['FAILED','BLOCKED'].includes(item.operational)?'warning':'neutral')},
        {key:'createdAt',label:'Criação simulada',render:item=>`<time datetime="${esc(item.createdAt)}">${esc(shortDate(item.createdAt))}</time>`},
      ]
    });
    return `<div class="sw-task-query" data-testid="task-list">${table}</div>`;
  }
  function signals(state) {
    const status=stateCase(state).status,stale=state.scenario==='no-heartbeat',offline=state.scenario==='disconnected',running=status==='RUNNING',queued=status==='QUEUED';
    const executorText=offline?'Estado atual desconhecido; última confirmação às 10:32:00.':stale?'Sem confirmação recente. Último heartbeat às 10:30:00; limite ilustrativo de 60 s.':running?'Heartbeat confirmado às 10:34:55.':queued?'Operação na fila; início do executor ainda não confirmado.':'Sem operação ativa aguardando heartbeat.';
    const toolText=offline?'Último evento conhecido às 10:32:45: solicitação enviada. O estado atual está indisponível.':stale?'Último evento às 10:32:45: solicitação enviada. Não há confirmação recente de processamento.':running?'Último evento às 10:32:45: solicitação enviada; resposta ainda não observada. Não comprova progresso interno.':queued?'Nenhuma chamada ao modelo ou ferramenta começou.':'Resultado ou pendência registrado na tentativa; consulte as evidências.';
    return `<section class="sw-panel" data-testid="processing-signals"><h3>Sinais observáveis · exemplo fixo</h3><p>São confirmações diferentes. Horários fictícios; nenhum progresso automático.</p><dl class="sw-signals"><div class="sw-signal${offline?' ui-error':''}" data-state="${offline?'error':'live'}"><dt>${offline?failureIcon():''}Consulta da tela</dt><dd>${offline?'Falhou às 10:35:00. Último estado conhecido às 10:32:00.':'Consulta confirmada às 10:35:00.'}</dd></div><div class="sw-signal${running||queued?' sw-signal--busy':''}" data-state="${stale?'stale':offline||queued?'waiting':'live'}"><dt>${running||queued?spinner():''}Presença do executor</dt><dd>${executorText}</dd></div><div class="sw-signal${running?' sw-signal--busy':''}" data-state="waiting"><dt>${running?spinner():''}Atividade da ferramenta</dt><dd>${toolText}</dd></div></dl></section>`;
  }
  const taskEvents = (story,state,task) => history(story).filter(event=>event.entityId===task.id);
  function historyRows(story,rows,{task=null,attempt=null,source='story'}={}) {
    return rows.map((row,index)=>({
      id:`sw:${story.id}:${source}:${row.id || index+1}`,timestamp:row.timestamp || null,
      actor:row.actor || null,actorType:row.actorType || null,type:row.type || null,
      entityId:row.entityId || task?.id || story.id,entityName:row.entityName || task?.name || story.name,
      message:row.title || row.message || 'Ocorrência simulada registrada',result:row.result || null,
      phase:row.phase || null,revision:row.revision || attempt?.revision || null,
      correlationId:row.correlationId || (attempt?`simulated:${story.id}:${attempt.id}`:null),sha:row.sha || attempt?.sha || null,
    }));
  }
  function history(story) {
    const state=get(story);
    return [...historyRows(story,state.events),...state.attempts.flatMap(attempt=>historyRows(story,attempt.events,{task:state.tasks.find(item=>item.id===attempt.taskId),attempt,source:attempt.id}))];
  }
  function attemptContent(story,state,selected,route) {
    const rows=state.attempts.filter(attempt=>attempt.taskId===selected.id),chosen=route.attemptId?rows.find(item=>item.id===route.attemptId):currentAttempt(state,selected)||rows.at(-1);
    const id=`sw-attempts-${story.id}-${selected.id}`,states=[...new Set(rows.map(item=>item.state))],revisions=[...new Set(rows.map(item=>String(item.revision)))];
    const table=collection({
      id,title:'Tentativas e evidências',description:`Escopo fixo: ${selected.name}. Busca em resumo, identificador e commit. Ocorrências mais recentes primeiro; 20 por página. Consultar não repete a operação.`,
      rows,pageSize:20,defaults:{sort:'number',dir:'desc'},
      filters:[{key:'q',label:'Buscar resumo, tentativa ou commit',type:'search'},{key:'state',label:'Resultado da tentativa',type:'select',options:[{value:'',label:'Todos'},...states.map(value=>({value,label:value}))]},{key:'revision',label:'Revisão de código',type:'select',options:[{value:'',label:'Todas'},...revisions.map(value=>({value,label:`Revisão ${value}`}))]},{key:'from',label:'De · data simulada',type:'date'},{key:'to',label:'Até · data simulada inclusiva',type:'date'}],
      matches:(item,query)=>(!query.state||item.state===query.state)&&(!query.revision||String(item.revision)===query.revision)&&(!query.from||item.createdAt&&new Date(item.createdAt)>=new Date(`${query.from}T00:00:00-03:00`))&&(!query.to||item.createdAt&&new Date(item.createdAt)<new Date(new Date(`${query.to}T00:00:00-03:00`).getTime()+86400000)),
      empty:'Nenhuma tentativa neste recorte.',
      columns:[
        {key:'number',label:'Tentativa',value:item=>item.number,render:item=>`<a class="sw-link" data-testid="attempt-link-${esc(item.id)}" href="${taskUrl(story,selected,'attempts',item.id)}" ${chosen?.id===item.id?'aria-current="page"':''}>Tentativa ${item.number} · revisão ${item.revision} · ${esc(item.state)}${item.revision!==state.revision?' · histórica':''}</a>`},
        {key:'state',label:'Resultado',render:item=>badge(item.state,['FAILED','BLOCKED'].includes(item.state)?'warning':['SUCCEEDED','PASSED'].includes(item.state)?'success':'info')},
        {key:'revision',label:'Revisão',render:item=>`Revisão ${item.revision}<small class="query-secondary">${item.revision===state.revision?'Revisão atual':'Resultado anterior, somente leitura'}</small>`},
        {key:'summary',label:'Resumo',value:item=>`${item.summary} ${item.id} ${item.sha || ''}`,render:item=>`${esc(item.summary)}<small class="query-secondary">${esc(item.sha || 'Commit não registrado')}</small>`},
        {key:'createdAt',label:'Quando · simulação',render:item=>esc(shortDate(item.createdAt))},
      ]
    });
    const detail=chosen?`<section class="sw-panel sw-evidence${chosen.state==='FAILED'?' ui-error':''}" data-testid="attempt-detail" data-history="${chosen.revision!==state.revision || chosen.id!==currentAttempt(state,selected)?.id}"><p class="eyebrow">${chosen.revision===state.revision && chosen.id===currentAttempt(state,selected)?.id?'TENTATIVA ATUAL':'CONSULTA HISTÓRICA · SOMENTE LEITURA'}</p><h2>${chosen.state==='FAILED'?failureIcon():''}Tentativa ${chosen.number} · revisão ${chosen.revision}</h2><p>${esc(chosen.summary)}</p><p class="sw-task-meta">O resultado selecionado e a fase atual da História independem dos filtros e da página da consulta abaixo.</p>${chosen.evidence?`<p>${esc(chosen.evidence)}</p>`:''}${chosen.category==='INTEGRATION_AUTH'?`<p class="sw-alert ui-error">${failureIcon()}Falha de acesso à integração. Nenhum parecer sobre o código foi produzido nesta tentativa.</p>`:''}${findings(chosen.findings)}</section>`:'<section class="sw-panel"><p>Nenhuma tentativa selecionada. O estado corrente permanece na faixa superior.</p></section>';
    return `${detail}<div class="sw-attempt-list">${table}</div>${chosen?historyView({id:`sw-events-${story.id}-${chosen.id}`,title:'Eventos da tentativa · simulados',events:historyRows(story,chosen.events,{task:selected,attempt:chosen,source:chosen.id})}):''}`;
  }
  function findings(rows=[]) {return rows.length?`<div class="sw-findings" data-testid="quality-findings">${rows.map(row=>`<article class="sw-evidence"><h3>${esc(row.category)} ${badge(row.severity,'warning')}</h3><p>${esc(row.summary)}</p><details><summary>Referência técnica fictícia</summary><p><code>${esc(row.file)}:${row.line}</code> · apenas um exemplo; nenhum segredo real é exibido.</p></details></article>`).join('')}</div>`:'';}
  function taskContent(story,ctx,route) {
    const {state,selected}=ctx;
    if(!selected)return '<section class="sw-panel"><h2>Tarefa não encontrada neste cenário</h2><p>Uma Tarefa técnica aparece quando o processo correspondente é solicitado. Consulte a lista para escolher uma Tarefa existente.</p></section>';
    const attempt=currentAttempt(state,selected),tab=route.taskTab || 'overview';
    const taskHistory=historyView({id:`sw-history-${story.id}-${selected.id}`,title:'Histórico da Tarefa · simulado',events:taskEvents(story,state,selected)});
    return `<a class="sw-link" href="${url(story,'tasks')}">← Voltar às Tarefas da História</a><nav class="sw-tabs" aria-label="Seções da Tarefa"><a href="${taskUrl(story,selected)}" ${tab==='overview'?'aria-current="page"':''}>Trabalho e resultado</a><a href="${taskUrl(story,selected,'attempts')}" ${tab==='attempts'?'aria-current="page"':''}>Tentativas e evidências</a><a href="${taskUrl(story,selected,'history')}" ${tab==='history'?'aria-current="page"':''}>Histórico</a></nav>${tab==='history'?taskHistory:tab==='attempts'?attemptContent(story,state,selected,route):`<section class="sw-panel"><div class="sw-section-head"><div><p class="eyebrow">${esc(selected.origin)} · ${esc(TYPES[selected.type])}</p><h2>${esc(selected.name)}</h2></div>${badge(selected.status,selected.status==='DONE'?'success':'info')}</div><p>${esc(selected.description)}</p><h3>Condição de conclusão</h3><p>${esc({coding:'Publicação confirmada do trabalho explicitamente associado, com as evidências previstas para seu escopo. Não conclui outras Tarefas.',spec:'Objetivo, critérios e limites especificados; autorização G1 registrada em decisão própria.',review:'Parecer aprovado para a revisão atual, com análise completa e sem achados.',scan:'Análise completa para a revisão atual, com política de bloqueio por qualquer vulnerabilidade.',merge:'Merge da revisão aprovada observado no GitLab.',manual:'Evidência manual de execução do trabalho planejado. A publicação de código não comprova esta conclusão.'}[selected.type])}</p><h3>Resultado atual</h3><p>${esc(selected.evidence || attempt?.summary || 'Nenhuma evidência de conclusão foi associada a esta Tarefa.')}</p>${findings(attempt?.findings)}<a class="sw-link" href="${taskUrl(story,selected,'attempts')}">Consultar tentativas e evidências →</a></section>${selected.id===ctx.current.id?signals(state):''}`}`;
  }
  function content(story,ctx,route) {
    const {state,current,c}=ctx;
    if(route.taskId)return taskContent(story,ctx,route)+(ctx.selected?.origin==='Planejada'?`<section class="sw-panel"><h2>Administração da Tarefa planejada</h2><p>Editar o planejamento não substitui revisão, segurança ou evidência de integração.</p><div class="sw-admin-links"><a class="sw-link" href="#/manage/edit/${esc(ctx.selected.id)}">Editar Tarefa planejada</a>${ctx.selected.type==='manual'?`<a class="sw-link" href="#/manage/state/${esc(ctx.selected.id)}">Alterar status da Tarefa manual</a>`:''}<a class="sw-link" href="#/manage/archive/${esc(ctx.selected.id)}">Arquivar Tarefa planejada</a></div></section>`:'');
    if(route.tab==='tasks')return `<section class="sw-panel"><div class="sw-section-head"><div><h2>Mapa do trabalho</h2><p>Tarefas planejadas e do processo, com seus próprios critérios. Abrir uma Tarefa não inicia uma execução.</p></div><a class="sw-link" href="#/manage/create/${esc(story.id)}">Criar Tarefa planejada →</a></div></section>${taskRows(story,state)}`;
    if(route.tab==='specification')return `<section class="sw-panel"><p class="eyebrow">ESCOPO FICTÍCIO V1 · REVISÃO OPERACIONAL ${state.revision}</p><h2>Especificação e critérios de aceite</h2><p>${esc(story.description)}</p><h3>Critérios verificáveis</h3><ul><li>Apresentar a situação da solicitação e sua última atualização.</li><li>Explicar se o cliente precisa realizar alguma ação.</li><li>Tratar ausência de resultado e permitir navegação por teclado.</li></ul><h3>Autorização G1</h3><p>${state.g1?'Aprovação simulada registrada para o escopo v1. Atualizar uma Tarefa operacional não altera o escopo aprovado.':'Aprovação ainda pendente. A decisão acontece somente na área única de interação.'}</p><p>Uma nova revisão de código exige repetir os controles aplicáveis. Mudar o objetivo ou os critérios exige rever o escopo e as decisões afetadas.</p><details><summary>Arquitetura e limites do exemplo</summary><p>Interface e serviço de consulta; nenhum recurso real é criado. Testes de release, homologação e produção conservam seus fluxos próprios.</p></details></section>`;
    if(route.tab==='releases')return `<p class="sw-alert">Associações e pacotes abaixo pertencem ao catálogo fictício de releases já existente. A revisão ${state.revision} desta encenação de execução é independente: avançar aqui não aprova nem altera a revisão de um pacote fechado.</p>`+releasePanel(story);
    if(route.tab==='delivery')return `<section class="sw-panel"><h2>Entrega de código · revisão ${state.revision}</h2><p>${state.scenario==='merged'?'Código integrado no cenário. A História ainda precisa de testes, homologação e entrega.':'Proposta de código e controles associados à revisão atual. Nenhum deploy é disparado a partir daqui.'}</p><div class="sw-meta"><span>Commit fictício: <code>example-r${state.revision}</code></span><span>MR fictício: #42</span></div><p>Code Review: ${esc(state.tasks.find(item=>item.type==='review')?.status || 'Não solicitado')} · Security Scan: ${esc(state.tasks.find(item=>item.type==='scan')?.status || 'Não solicitado')}</p><p>Os relatórios e as conversas permanecem nas respectivas Tarefas.</p><a class="sw-link" href="${url(story,'releases')}">Escolher uma release existente e consultar participações →</a><details><summary>GitLab · referência externa ilustrativa</summary><p>Endereço fictício do MR, sem link operacional: <code>gitlab.exemplo/sistema/consulta/-/merge_requests/42</code>. O portal real oferece o acesso direto ao MR no GitLab. Neste protótipo, a referência permanece ilustrativa.</p></details></section><section class="sw-panel"><h2>Pacotes e ambientes</h2><p>A composição, QA, homologação e produção continuam no menu Releases. Promoção usa a mesma candidata aprovada; alterar conteúdo exige uma nova candidata e repetir os controles.</p><a class="sw-link" href="#/releases">Abrir gestão de Releases →</a></section>`;
    if(route.tab==='more')return historyView({id:`sw-history-${story.id}`,title:'Histórico da História · simulado',events:history(story)})+`<section class="sw-panel"><h2>Administração e navegação</h2><p>Consultas e administração ficam separadas da próxima ação operacional.</p><div class="sw-admin-links"><a class="sw-link" href="#/manage/edit/${esc(story.id)}">Editar História</a><a class="sw-link" href="#/manage/create/${esc(story.id)}">Criar Tarefa planejada</a><a class="sw-link" href="#/manage/prerequisites/${esc(story.id)}">Consultar pré-requisitos e permissões</a><a class="sw-link" href="#/manage/archive/${esc(story.id)}">Arquivar História</a><a class="sw-link" href="#/assistant">Abrir Assistente de planejamento</a></div><p>A entrevista e a criação de planos ficam no menu Assistente, com seleção de Sistema e Projeto. A conversa da atividade permanece nesta área contextual.</p></section>`;
    return `<section class="sw-panel"><p class="eyebrow">RESUMO DA ENTREGA</p><h2>O que esta História entrega</h2><p>${esc(story.description)}</p><div class="sw-meta"><span><strong>${state.tasks.filter(item=>item.status==='DONE').length}/${state.tasks.length}</strong> Tarefas concluídas</span><span>Escopo v1 · revisão de código ${state.revision}</span></div><p><strong>Pendência:</strong> ${esc(c.detail)}</p><a class="sw-link" href="${taskUrl(story,current)}">Consultar a atividade atual: ${esc(current.name)} →</a></section><section class="sw-panel"><h2>Do plano ao trabalho</h2><p>Use as Tarefas para consultar resultados e tentativas. A fase atual e quem deve agir permanecem no topo.</p>${taskRows(story,state,{compact:true})}</section>`;
  }
  function interaction(story,ctx,route) {
    const {state,current,selected,historical,c}=ctx,target=selected || current,busy=['QUEUED','RUNNING'].includes(c.status),failed=['FAILED','STATUS UNAVAILABLE'].includes(c.status);
    const key=`${target.id}:r${state.revision}`,messages=state.messages[key] || [],draft=state.drafts[key] || '',allowed=canAct(state.pending || c.action),canConverse=canPlan();
    const readOnly=historical || !!route.taskId && (!selected || selected.id!==current.id);
    if(readOnly)return `<aside class="sw-interaction sw-panel" data-testid="interaction-panel" aria-label="Área única de interação"><p class="eyebrow">${historical?'CONSULTA HISTÓRICA — SOMENTE LEITURA':'CONSULTA DE OUTRA TAREFA'}</p><h2>${esc(target.name)}</h2><p>${historical?'Esta tentativa não pode receber aprovação, correção ou novo envio. Seu parecer pertence à revisão e à tentativa indicadas.':'Você está consultando uma Tarefa diferente da atividade prioritária. Nenhum comando será encaminhado silenciosamente para outra Tarefa.'}</p><p>Atividade atual da História: <strong>${esc(current.name)}</strong> · revisão ${state.revision}.</p><a class="sw-link" data-testid="return-current" href="${taskUrl(story,current)}">Abrir a atividade atual para interagir →</a></aside>`;
    if(route.tab==='releases')return `<aside class="sw-interaction sw-panel" data-testid="interaction-panel" aria-label="Área única de interação"><p class="eyebrow">PLANEJAMENTO DA ENTREGA</p><h2>Associação a release existente</h2><p>Salvar altera somente o planejamento. Não fecha pacotes, aprova controles nem executa implantação.</p><button class="button primary sw-primary" type="submit" form="story-release-form" data-testid="process-primary" ${!canPlan()?'disabled':''}>Salvar planejamento</button><a class="sw-link" href="#/releases">Gerenciar releases →</a></aside>`;
    const pending=state.pending,confirmation={approve:{title:'Confirmar aprovação G1',description:'Autorizo a codificação do escopo fictício v1. A solicitação entrará na fila; não representa código já produzido.',label:'Confirmo o escopo e autorizo a codificação',button:'Aprovar G1 e iniciar codificação'},correct:{title:'Confirmar correção do achado',description:'Reabrir somente o trabalho de código afetado. A nova revisão deverá passar novamente por Code Review e Security Scan. Nenhuma vulnerabilidade será ignorada.',label:'Autorizo a correção dentro do escopo aprovado',button:'Autorizar correção e colocar na fila'},merge:{title:'Confirmar integração da revisão atual',description:`Revisão ${state.revision}, Code Review e Security Scan aprovados. A solicitação não executa testes nem implantação.`,label:'Confirmo a integração desta revisão aprovada',button:'Confirmar solicitação de merge'},access:{title:'Resolver a autenticação da integração',description:'Um administrador deve restabelecer a credencial na configuração segura da integração. Não cole token, senha ou segredo nesta conversa. Este controle apenas simula a confirmação do administrador.',label:'Simular confirmação: administrador restabeleceu o acesso',button:'Consultar acesso e retomar o review'}}[pending];
    return `<aside class="sw-interaction sw-panel" data-testid="interaction-panel" aria-label="Área única de interação"><p class="eyebrow">ÁREA ÚNICA DE INTERAÇÃO</p><h2>${confirmation?confirmation.title:'Próximo passo'}</h2><p class="sw-task-meta" data-testid="interaction-context">Contexto: ${esc(target.name)} · revisão ${state.revision}</p>${state.notice?`<p class="sw-alert" role="status">${esc(state.notice)}</p>`:''}<p class="${failed?'ui-error sw-error-message':''}" ${failed?'role="status"':''}>${failed?failureIcon():''}${esc(confirmation?.description || c.detail)}</p>${!allowed?`<p class="sw-alert">${persona()?'A persona selecionada não tem permissão para esta ação. G1 exige Administrador ou Ana; as demais operações exigem perfil de planejamento.':'Selecione uma persona autorizada no topo para agir.'} Consulta e evidências continuam disponíveis.</p>`:''}${confirmation?`<label class="sw-confirmation"><input type="checkbox" data-testid="process-confirmation" data-sw-confirm ${state.confirmed?'checked':''} ${!allowed?'disabled':''}> ${esc(confirmation.label)}</label><button class="button primary sw-primary" data-testid="process-primary" data-sw-action="confirm" ${!state.confirmed || !allowed?'disabled':''}>${esc(confirmation.button)}</button><button class="button secondary sw-secondary" data-sw-action="cancel-decision">Voltar sem confirmar</button>`:c.action?`<button class="button primary sw-primary" data-testid="process-primary" data-sw-action="primary" ${!allowed?'disabled':''}>${esc(c.actionLabel)}</button>`:`<p class="sw-alert sw-wait" data-tone="info" data-testid="process-wait" role="status">${busy?spinner():''}<span>${c.status==='QUEUED'?'Aguardando recurso. Não é necessário reenviar.':'Aguardando resultado confirmado. Navegar não interrompe a operação.'}</span></p><a class="sw-link" href="${taskUrl(story,current)}">Consultar atividade e sinais →</a>`}${state.diagnosis?`<details open class="sw-diagnostic"><summary>Diagnóstico da operação · simulado</summary><p>A consulta da tela respondeu; o último heartbeat do executor foi às 10:30. Não foi confirmado timeout da ferramenta. A próxima ação real seria consultar a operação e reconciliar o mesmo pedido, sem criar outro.</p></details>`:''}${['review-findings','scan-findings'].includes(state.scenario)?'<p class="sw-alert" data-testid="finding-guidance">Achado no produto: prepare uma correção, revise o efeito e confirme. Não informe nenhum segredo na conversa.</p>':''}${state.scenario==='auth-error'?`<p class="sw-alert ui-error" data-testid="integration-guidance">${failureIcon()}Falha de integração: não encaminhar para o agente alterar código do produto. A análise ainda não foi realizada.</p>`:''}<details class="sw-chat" ${state.chatOpen?'open':''}><summary>Conversar sobre esta atividade</summary><p>Respostas fixas para validar a navegação. Conversar não aprova nem inicia trabalho.</p>${messages.map(message=>`<div class="sw-message" data-role="${message.role}"><strong>${message.role==='user'?'Você · simulação':'Assistente · resposta simulada'}</strong><p>${esc(message.text)}</p></div>`).join('')}<form data-sw-chat-form><label class="sw-field" for="sw-message">Mensagem para ${esc(target.name)}<textarea id="sw-message" data-testid="interaction-message" rows="3" maxlength="1200" ${!canConverse?'disabled':''} placeholder="Pergunte sobre a atividade; não informe segredos">${esc(draft)}</textarea></label><button class="button secondary sw-secondary" data-testid="conversation-send" ${!canConverse?'disabled':''}>Enviar mensagem simulada</button></form></details><p class="sw-task-meta">Último evento: ${esc(state.events.at(-1)?.title || c.title)} · horário fictício.</p></aside>`;
  }
  function explorer(story,state) {
    const alternate={'review-running':['review-passed','Simular resultado aprovado do Code Review'],'scan-running':['scan-findings','Simular vulnerabilidade encontrada no Scan']}[state.scenario];
    return `<details class="sw-explorer" data-testid="simulation-controls">
      <summary>Explorar cenários e eventos simulados</summary>
      <p>Controles de validação do protótipo. Carregar um cenário reinicia somente a simulação desta História. Nenhuma IA ou integração real é executada.</p>
      <label class="sw-field" for="sw-simulator">Cenário <select id="sw-simulator" data-testid="simulator-select">${Object.entries(CASES).map(([key,c])=>`<option value="${key}" ${state.scenario===key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>
      ${stateCase(state).next?`<button class="button secondary sw-secondary" data-testid="simulator-next" data-sw-action="simulate-next">Simular próximo evento confirmado</button><p>Próximo cenário: ${esc(CASES[stateCase(state).next].label)}. Só avança ao clicar.</p>`:'<p>Nenhum evento automático pendente. Use a área de interação para decisões ou escolha outro cenário acima.</p>'}
      ${alternate?`<button class="button secondary sw-secondary" data-testid="simulator-alternative" data-sw-action="simulate-outcome" data-value="${alternate[0]}">${alternate[1]}</button><p>Este resultado alternativo preserva as Tarefas e tentativas desta jornada.</p>`:''}
      <button class="button secondary sw-secondary" data-sw-action="restart-story">Reiniciar apenas esta História simulada</button>
    </details>`;
  }
  function render(story,route={}) {
    route=normalizeRoute(route);
    const ctx=context(story,route),active=route.taskId?'tasks':route.tab || 'overview';
    return `<div class="sw-workspace" data-testid="story-workspace"><header class="sw-page-heading"><p class="eyebrow">${route.taskId?'TAREFA DENTRO DA HISTÓRIA':'HISTÓRIA · VISÃO MACRO'}</p><h1 tabindex="-1">${esc(ctx.selected?.name || story.name)}</h1><p>${route.taskId?'Consulte trabalho, resultados e tentativas sem perder a fase atual da História.':'Objetivo e mapa do trabalho. Detalhes operacionais ficam nas Tarefas.'}</p></header><nav class="sw-tabs" aria-label="Seções da História">${[['overview','Resumo'],['tasks','Tarefas'],['specification','Especificação'],['delivery','Entregas'],['more','Histórico']].map(([id,label])=>`<a href="${url(story,id)}" ${active===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="sw-layout"><div class="sw-content">${content(story,ctx,route)}</div>${interaction(story,ctx,route)}</div>${explorer(story,ctx.state)}<p class="sw-simulation-note">Protótipo independente: dados, sinais, decisões e resultados simulados. Nenhum dado ou projeto real é alterado.</p></div>`;
  }
  function mount(story,route={}) {
    route=normalizeRoute(route);
    const {state,current,selected,c}=context(story,route),target=selected || current,key=`${target.id}:r${state.revision}`;
    headerObserver?.disconnect();
    const stickyHeader=document.querySelector('.context-bar.sw-context');
    const measureHeader=()=>{if(stickyHeader)document.body.style.setProperty('--sw-sticky-offset',`${Math.ceil(stickyHeader.getBoundingClientRect().height)+12}px`);};
    measureHeader();
    if(stickyHeader && typeof ResizeObserver!=='undefined'){headerObserver=new ResizeObserver(measureHeader);headerObserver.observe(stickyHeader);}
    const cycle=document.querySelector('.sw-cycle'),step=cycle?.querySelector('[aria-current="step"]');
    if(cycle && step)cycle.scrollLeft=Math.max(0,step.offsetLeft-cycle.offsetLeft-(cycle.clientWidth-step.clientWidth)/2);
    const repaint=message=>{save();rerender();if(message)announce(message);};
    document.querySelectorAll('[data-sw-action]').forEach(element=>element.addEventListener('click',()=>{
      const action=element.dataset.swAction;
      if(action==='focus-interaction'){const panel=document.querySelector('[data-testid="interaction-panel"]');if(panel){panel.setAttribute('tabindex','-1');panel.focus({preventScroll:true});panel.scrollIntoView({block:'start',behavior:'instant'});}return;}
      if(action==='filter'){location.hash=queryLink(taskCollectionId(story),{scope:element.dataset.value,page:1});return;}
      if(action==='simulate-outcome'){const expected={'review-running':'review-passed','scan-running':'scan-findings'}[state.scenario];if(expected===element.dataset.value){transition(state,expected);repaint('Resultado alternativo simulado explicitamente; histórico preservado.');}return;}
      if(action==='simulate-next'){if(c.next){transition(state,c.next);repaint('Evento simulado carregado explicitamente.');}return;}
      if(action==='restart-story'){memory.stories[story.id]=fixture(story,'approval');repaint('Apenas esta História simulada foi reiniciada.');return;}
      if(action==='cancel-decision'){state.pending=null;state.confirmed=false;repaint();return;}
      if(action==='primary'){
        if(!canAct(c.action) || route.taskId && (!selected || selected.id!==current.id) || context(story,route).historical)return;
        if(['approve','correct','merge','access'].includes(c.action)){state.pending=c.action;state.confirmed=false;repaint('Confira o efeito e confirme na mesma área de interação.');}
        else if(c.action==='start'){transition(state,'queued');repaint('Solicitação simulada na fila. A Tarefa permanece TO DO até o início.');}
        else if(c.action==='review'){transition(state,'review-queued');repaint('Tarefa de Code Review criada ou reutilizada. Solicitação simulada na fila.');}
        else if(c.action==='scan'){transition(state,'scan-queued');repaint('Tarefa de Security Scan criada ou reutilizada. Solicitação simulada na fila.');}
        else if(c.action==='delivery'){location.hash=url(story,'delivery');}
        else if(c.action==='reconnect'){transition(state,'review-running');repaint('Consulta simulada restabelecida; nenhuma nova tentativa criada.');}
        else if(c.action==='diagnose'){state.diagnosis=!state.diagnosis;repaint();}
      }
      if(action==='confirm' && state.confirmed && canAct(state.pending) && !context(story,route).historical && (!route.taskId || selected?.id===current.id)){
        const pending=state.pending;
        if(pending==='approve')transition(state,'queued');
        else if(pending==='correct')transition(state,'correction-queued');
        else if(pending==='merge')transition(state,'merge-queued');
        else if(pending==='access')transition(state,'review-queued');
        addEvent(state,'Decisão humana confirmada no protótipo.',{...actor(),entityId:target.id,entityName:target.name,result:'CONFIRMED'});
        repaint('Decisão simulada confirmada. Veja a nova situação e a Tarefa vinculada.');
      }
    }));
    document.querySelector('[data-sw-confirm]')?.addEventListener('change',event=>{state.confirmed=event.target.checked;state.confirmedBy=persona();save();const button=document.querySelector('[data-testid="process-primary"]');if(button)button.disabled=!state.confirmed || !canAct(state.pending);});
    document.querySelector('[data-testid="simulator-select"]')?.addEventListener('change',event=>{memory.stories[story.id]=fixture(story,event.target.value);save();if(route.taskId)location.hash=url(story,'tasks');else repaint('Cenário fictício carregado. Nenhum processo real iniciado.');});
    document.querySelector('[data-testid="interaction-message"]')?.addEventListener('input',event=>{state.drafts[key]=event.target.value;save();});
    document.querySelector('.sw-chat')?.addEventListener('toggle',event=>{state.chatOpen=event.target.open;save();});
    document.querySelector('[data-sw-chat-form]')?.addEventListener('submit',event=>{
      event.preventDefault();if(!canPlan() || context(story,route).historical || route.taskId && (!selected || selected.id!==current.id))return;const input=document.querySelector('[data-testid="interaction-message"]'),text=input?.value.trim();if(!text)return;
      const reply=state.scenario==='auth-error'?'Este exemplo representa HTTP 401 da integração. Um administrador deve resolver o acesso na configuração segura; não cole credenciais e não altere o produto para contornar esse erro. A retomada depende da confirmação explícita acima.':['review-findings','scan-findings'].includes(state.scenario)?'Neste cenário fixo, o achado está no código do produto. A correção só será solicitada após preparar e confirmar a decisão acima. Novo commit exige repetir review e scan.':'Esta resposta é fixa e trata apenas da atividade indicada. A conversa preserva o contexto e não executa comandos. Continue pela próxima ação ou acompanhe os eventos observáveis.';
      state.messages[key]??=[];state.messages[key].push({role:'user',text},{role:'assistant',text:reply});state.drafts[key]='';state.chatOpen=true;repaint('Resposta simulada disponível; nenhuma operação foi autorizada pela conversa.');
    });
  }
  function reset(){memory={stories:{}};save();}
  return {render,header,mount,status,task,taskLabel:(story,id)=>task(story,id)?.name,history,reset};
}
