import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {personas,statusLabels} from '@sdlc/shared';
import type {AssistantHelpers} from './assistant.ts';
import type {GitProvider} from './gitlab.ts';
import type {MergeProvider} from './merge-provider.ts';
import {mergeReadiness,qualityPolicy} from './merge-readiness.ts';
import {DomainError} from './errors.ts';
import {ensureActivity,bindActivityTasks,listStoryActivities,workLinksVersion} from './work-activities.ts';
import {checkExecutionScope,executionScope} from './execution.ts';

const labels:Record<string,string>={specification:'Especificação e G1',coding:'Codificação',code_review:'Code Review',security_scan:'Security Scan',merge:'Integração do código'};
const upper=(value:string)=>statusLabels[value]||value.replaceAll('_',' ').toUpperCase();
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const publicItem=(item:any)=>({id:item.id,key:item.key,name:item.name,description:item.description,status:item.status,version:item.version,parentId:item.parentId,kind:item.kind});
type Action={id:string;kind:string;label:string;enabled:boolean;reason?:string;method?:string;path?:string;href?:string;body?:Record<string,unknown>;confirmation?:{title:string;description:string;checkboxLabel:string}};

export function registerJourney(app:FastifyInstance,h:AssistantHelpers,options:{git?:GitProvider;merge?:MergeProvider;scannerUrl?:string}){
 app.get<{Params:{id:string}}>('/api/items/:id/journey',async request=>h.db.$transaction(async tx=>{
  const selected=await h.live(tx,request.params.id),story=selected.kind==='task'?await h.live(tx,selected.parentId!):selected;
  if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Consulte uma História ou uma de suas Tarefas.',409);
  const parents=await h.ancestors(tx,story),tasks=await tx.item.findMany({where:{parentId:story.id,kind:'task',archived:false},orderBy:{createdAt:'asc'}});
  const run=await tx.storyExecution.findFirst({where:{storyId:story.id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  const checks=run?await tx.qualityCheck.findMany({where:{executionId:run.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100}):[];
  const historicalChecks=await tx.qualityCheck.findMany({where:{storyId:story.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:200});
  const merge=run?await tx.mergeOperation.findUnique({where:{executionId:run.id}}):null;
  const repository=run?await tx.repository.findUnique({where:{id:run.repositoryId}}):null;
  const links=await tx.itemRepository.findMany({where:{itemId:story.id},include:{repository:true}});
  const history=await tx.historyEvent.findMany({where:{OR:[{itemId:story.id},{ancestorIds:{has:story.id}}]},orderBy:{timestamp:'desc'},take:100});
  const work=await listStoryActivities(tx,story.id);
  const readiness=run?await mergeReadiness(tx,run,object(object(run.snapshot).codeContext).sha):{ready:false,phases:[]};
  const scope=run?await checkExecutionScope(h,tx,run):{current:true};
  const person=personas.find(p=>p.id===request.headers['x-persona']);
  const closed=parents.some(p=>p.kind==='project'&&['completed','cancelled'].includes(p.projectLifecycle||''));
  const canAct=!!person&&['admin','product_owner','architect'].includes(person.role)&&!closed;
  const permissionReason=closed?'Reabra o Projeto para continuar.':!person?'Selecione uma persona no topo para atuar.':'Esta persona possui acesso de consulta; selecione Administrador, Product Owner ou Arquiteto.';
  const configured={execution:!!h.llm&&!!options.git?.codeContext&&!!options.git?.publishCode,quality:!!h.llm&&!!options.git?.qualityContext&&!!options.scannerUrl,merge:!!options.merge};
  const normalizeEvent=(event:any)=>({id:event.id,timestamp:event.timestamp,kind:event.kind||event.action,stage:event.stage||null,message:event.message,provider:event.provider||null,category:event.category||null});
  const checkState=(check:any)=>run&&(check.executionId!==run.id||check.sha!==run.commitSha||check.baseSha!==object(object(run.snapshot).codeContext).sha||check.policyVersion!==qualityPolicy)?'stale':check.state;
  const attemptState=(attempt:any)=>{
   if(!attempt)return 'not_started';
   const check=historicalChecks.find(c=>attempt.sourceType==='quality'&&c.id===attempt.sourceId);
   if(check)return checkState(check)==='stale'?'stale':attempt.state;
   if(run&&attempt.sourceType==='execution'&&attempt.sourceId!==run.id)return 'stale';
   if(merge&&attempt.sourceType==='merge'&&attempt.sourceId!==merge.id)return 'stale';
   return attempt.state;
  };
  const activities:any[]=work.map((activity:any)=>({id:activity.id,kind:activity.kind,label:labels[activity.kind]||upper(activity.kind),taskId:activity.taskId,scopeKey:activity.scopeKey,currentAttemptId:activity.currentAttemptId,state:attemptState(activity.attempts.find((attempt:any)=>attempt.id===activity.currentAttemptId)),legacy:false,links:activity.taskLinks.map((link:any)=>({taskId:link.taskId,scope:link.scope,completion:link.completion})),attempts:[...activity.attempts].sort((a:any,b:any)=>Number(b.id===activity.currentAttemptId)-Number(a.id===activity.currentAttemptId)).map((attempt:any)=>{
   const check=historicalChecks.find(c=>attempt.sourceType==='quality'&&c.id===attempt.sourceId);
   return {id:attempt.id,sourceType:attempt.sourceType,sourceId:attempt.sourceId,state:attemptState(attempt),recordedState:attempt.state,stage:attempt.stage,sha:attempt.revision,summary:attempt.summary,error:check?.error||null,category:attempt.errorCategory,findings:check?.findings||[],evidence:check?.evidence||null,createdAt:attempt.queuedAt,updatedAt:attempt.heartbeatAt||attempt.finishedAt||attempt.startedAt||attempt.queuedAt,finishedAt:attempt.finishedAt,queuedAt:attempt.queuedAt,startedAt:attempt.startedAt,waitingSince:attempt.waitingSince,heartbeatAt:attempt.heartbeatAt,heartbeatStaleAfterMs:attempt.heartbeatStaleAfterMs,provider:attempt.provider,events:attempt.events.map(normalizeEvent),legacy:false};
  })}));
  // Old records remain consultable without manufacturing tasks or approvals on GET.
  if(run&&!work.some((activity:any)=>activity.attempts.some((attempt:any)=>attempt.sourceType==='execution'&&attempt.sourceId===run.id))){
   const kind=['specification','gate'].includes(run.stage)?'specification':'coding';
   activities.push({id:`legacy:execution:${run.id}`,kind,label:labels[kind],taskId:null,legacy:true,state:run.state,attempts:[{id:`legacy:execution:${run.id}`,state:run.state,stage:run.stage,sha:run.commitSha,summary:run.state==='succeeded'?'Publicação registrada antes do vínculo operacional de Tarefas.':run.error,error:run.error,findings:[],createdAt:run.createdAt,updatedAt:run.updatedAt,finishedAt:run.state==='succeeded'?run.updatedAt:null,heartbeatAt:null,legacy:true,events:history.filter(e=>object(e.payload).runId===run.id).reverse().map(normalizeEvent)}]});
  }
  for(const kind of ['code_review','security_scan']){
   const old=historicalChecks.filter(check=>check.kind===kind&&!work.some((activity:any)=>activity.attempts.some((attempt:any)=>attempt.sourceType==='quality'&&attempt.sourceId===check.id)));
   if(old.length)activities.push({id:`legacy:${kind}`,kind,label:labels[kind],taskId:null,legacy:true,state:checkState(old[0]),attempts:old.map(check=>({id:`legacy:quality:${check.id}`,state:checkState(check),recordedState:check.state,stage:kind,sha:check.sha,summary:check.summary,error:check.error,findings:check.findings,evidence:check.evidence,createdAt:check.createdAt,updatedAt:check.finishedAt||check.createdAt,finishedAt:check.finishedAt,heartbeatAt:null,legacy:true,events:history.filter(e=>object(e.payload).checkId===check.id).reverse().map(normalizeEvent)}))});
  }
  if(merge&&!activities.some(a=>a.kind==='merge'))activities.push({id:`legacy:merge:${merge.id}`,kind:'merge',label:labels.merge,taskId:null,state:merge.state,legacy:true,attempts:[{id:`legacy:merge:${merge.id}`,state:merge.state,stage:'merge',sha:merge.sha,summary:merge.message,error:null,findings:[],createdAt:merge.createdAt,updatedAt:merge.checkedAt,finishedAt:merge.finishedAt,heartbeatAt:null,legacy:true,events:[]} ]});
  let kind='specification',state=run?.state||'not_started',title='A execução ainda não começou',message='Confira o escopo, os critérios e o repositório antes de preparar a execução.',who='Pessoa responsável pela entrega';
  const actions:Action[]=[];
  const add=(id:string,label:string,path:string,body:Record<string,unknown>,available=true,reason?:string,confirmation?:Action['confirmation'])=>{
   const action={id,kind:id,label,path,method:'POST',body,enabled:canAct&&available,...(!canAct?{reason:permissionReason}:reason?{reason}:{}),...(confirmation?{confirmation}:{})};actions.push(action);return action;
  };
  const runPath=run?`/api/executions/${run.id}`:'';
  const retryTechnical=!!run&&run.stage==='generation'&&['failed','waiting_input'].includes(run.state)&&(!!object(run.snapshot).patchRepair||run.error==='Patch contém caminho não permitido ou duplicado.');
  const canDiscuss=!!run&&(run.state==='waiting_input'||run.state==='failed'&&['specification','generation','discussion'].includes(run.stage));
  if(!run){
   const missing=[];
   if(parents.filter(p=>['project','epic'].includes(p.kind)).some(p=>p.status!=='approved'))missing.push('Aprove o Projeto e o Épico.');
   if(!Array.isArray(object(story.data).acceptanceCriteria)||!object(story.data).acceptanceCriteria.length)missing.push('Defina os critérios de aceite estruturados.');
   if(links.length!==1||links[0].repository.state!=='ready')missing.push('Vincule exatamente um repositório pronto.');
   add('prepare','Preparar especificação',`/api/items/${story.id}/execution`,{expectedVersion:story.version},configured.execution&&!missing.length&&story.status==='specification',missing.join(' ')||(!configured.execution?'Configure o GitLab e o modelo local.':undefined));
  }else if(run.state==='cancelled'||!scope.current){
   kind=['specification','gate'].includes(run.stage)?'specification':'coding';state=run.state==='cancelled'?'cancelled':'stale';
   title=run.state==='cancelled'?'Execução cancelada; um novo ciclo exige outro G1':'O escopo mudou; as evidências anteriores permanecem no histórico';
   message=scope.reason||'Revise o escopo atual antes de solicitar outra especificação. O novo ciclo preserva os artefatos e Merge Requests anteriores.';
   if(['succeeded','cancelled'].includes(run.state)){
    let unavailable:string|undefined;
    try{await executionScope(h,tx,story.id);}catch(error){if(error instanceof DomainError)unavailable=error.message;else throw error;}
    const busy=checks.some(check=>['queued','running'].includes(check.state))||!!merge&&['queued','running'].includes(merge.state)||!!await tx.mergeDiscussionTurn.count({where:{operation:{storyId:story.id},state:{in:['queued','running']}}});
    if(busy)unavailable='Aguarde a atividade ou conversa em andamento antes de preparar outro ciclo.';
    if(['testing','uat','production','completed'].includes(story.status))unavailable='A História já avançou para testes ou entrega. Revise esse ciclo antes de iniciar outra codificação.';
    add('replan','Preparar nova especificação',`${runPath}/replan`,{expectedVersion:story.version,confirmed:true},configured.execution&&!unavailable,unavailable||(!configured.execution?'Configure o GitLab e o modelo local.':undefined),{title:'Iniciar outro ciclo de especificação',description:'O escopo atual será analisado novamente e exigirá novo G1. Execuções, evidências, branches e Merge Requests anteriores serão preservados.',checkboxLabel:'Confirmo outro ciclo de especificação e um novo G1 para o escopo atual.'});
   }else message+=' Cancele a execução vigente antes de preparar outro ciclo.';
  }else if(['queued','running'].includes(run.state)){
   kind=['specification','gate'].includes(run.stage)?'specification':'coding';who=run.stage==='publishing'?'GitLab':'Agente de implementação';
   title=run.state==='queued'?'Solicitação recebida; aguardando processamento':run.stage==='publishing'?'Publicando e reconciliando o Merge Request':run.stage==='context'?'Obtendo o contexto do repositório':run.stage==='discussion'?'Analisando a conversa sobre o impedimento':'Aguardando resposta do modelo';
   message='Acompanhe os eventos confirmados. Navegar ou recarregar a página não cancela a operação.';
  }else if(run.state==='waiting_approval'){
   title='Especificação pronta; G1 aguarda sua decisão';state='waiting_approval';
   message='Leia requisitos, arquitetura, riscos e casos de teste. A aprovação autoriza gerar código e abrir o Merge Request.';
   add('approve','Aprovar G1 e gerar código',`${runPath}/approve`,{expectedVersion:story.version},true,undefined,{title:'Aprovar especificação G1',description:message,checkboxLabel:'Revisei a especificação e autorizo gerar o código e abrir o Merge Request.'});
  }else if(run.state==='waiting_input'||run.state==='failed'){
   kind=['specification','gate'].includes(run.stage)?'specification':'coding';title=canDiscuss?'A atividade precisa da sua orientação':'A atividade encontrou um impedimento';message=run.error||'Consulte o diagnóstico e retome a mesma etapa.';
   if(canDiscuss&&!retryTechnical)actions.push({id:'respond_blocker',kind:'respond_blocker',label:object(run.discussionProposal).ready?'Revisar decisão proposta':'Responder impedimento',href:`/stories/${story.id}?interact=conversation`,enabled:canAct,...(!canAct?{reason:permissionReason}:{})});
   if(retryTechnical||run.state==='failed')add('retry',retryTechnical?'Retomar correção técnica':'Retomar execução',`${runPath}/retry`,{},configured.execution,!configured.execution?'As integrações de execução estão indisponíveis.':undefined);
  }else if(run.state==='succeeded'){
   if(merge?.state==='succeeded'){
    kind='merge';state='succeeded';title='Código integrado; testes e entrega continuam pendentes';message='O merge não conclui a História nem inicia deploy. O executor de testes e a promoção de candidatas permanecem nas próximas integrações.';
   }else{
    const active=checks.find(check=>['queued','running'].includes(check.state)&&check.sha===run.commitSha);
    const phase=active?.kind||readiness.phases.find(phase=>!phase.passed)?.kind;
    if(phase){
     kind=phase;const latest=checks.find(check=>check.kind===phase),current=latest?.sha===run.commitSha&&latest.baseSha===object(object(run.snapshot).codeContext).sha?latest:null;
     state=active?.state||(current?.state==='passed'?'stale':current?.state)||(latest?'stale':'not_started');
     title=state==='queued'?`${labels[kind]} recebido; aguardando executor`:state==='running'?`${labels[kind]} em andamento`:state==='blocked'?`${labels[kind]} encontrou achados; correção necessária`:state==='failed'?`${labels[kind]} não concluiu a análise`:state==='stale'?`Nova revisão exige ${labels[kind]}`:`${labels[kind]} precisa ser iniciado`;
     message=current?.error||current?.summary||(state==='stale'?'O resultado anterior permanece no histórico e não aprova o commit atual.':'A verificação precisa produzir evidências para a mesma revisão, base e política.');
     who=active?kind==='code_review'?'Agente de Code Review':'Scanner de segurança':'Pessoa responsável pela entrega';
     if(!active){
      if(current?.state==='blocked')add('correct','Solicitar correção à IA',`${runPath}/quality/correct`,{checkId:current.id,expectedVersion:story.version,expectedSha:run.commitSha},!!h.llm&&!!options.git?.publishCorrection,undefined,{title:'Autorizar correção dos achados',description:'O agente corrigirá o escopo autorizado e publicará nova revisão no mesmo MR. Code Review e Security Scan serão exigidos novamente.',checkboxLabel:'Autorizo corrigir os achados preservando o escopo aprovado.'});
      add(kind,latest?'Executar novamente '+labels[kind]:'Executar '+labels[kind],`${runPath}/quality`,{kind,expectedVersion:story.version,expectedSha:run.commitSha},configured.quality,!configured.quality?'Configure GitLab, modelo local e scanner.':undefined);
     }
    }else{
     kind='merge';state=merge?.state||'not_started';title=['queued','running'].includes(state)?'Merge solicitado; aguardando confirmação do GitLab':state==='blocked'?'Integração impedida; consulte o diagnóstico':state==='failed'?'Resultado da integração precisa ser reconciliado':'Verificações aprovadas; integração pendente';
     message=merge?.message||'Você pode integrar pelo GitLab ou solicitar ao assistente, mantendo as verificações e confirmações.';who=['queued','running'].includes(state)?'Assistente de merge':'Pessoa autorizada a integrar';
     if(!['queued','running'].includes(state))add('merge',state==='failed'?'Reconciliar resultado do merge':'Solicitar merge ao assistente',`${runPath}/merge`,{expectedVersion:story.version,expectedSha:run.commitSha},configured.merge,configured.merge?undefined:'A credencial exclusiva do agente de merge não está configurada.',{title:'Confirmar integração da revisão atual',description:`Integrar o commit ${run.commitSha} no destino do MR. Esta decisão não remove bloqueios, não conclui a História e não inicia implantação.`,checkboxLabel:'Confirmo a integração desta revisão aprovada.'});
    }
   }
  }
  if(run&&['queued','running','waiting_approval','waiting_input','failed'].includes(run.state)&&!(run.stage==='publishing'&&run.state==='running'))add('cancel','Cancelar execução',`${runPath}/cancel`,{},true,undefined,{title:'Cancelar execução',description:'Impede continuação e descarta saídas tardias. Não remove branches ou evidências existentes; chamadas em andamento podem levar tempo para terminar.',checkboxLabel:'Confirmo o cancelamento da execução.'});
  const currentActivity=activities.find(a=>a.kind===kind&&!a.legacy&&a.currentAttemptId)||activities.find(a=>a.kind===kind&&a.legacy)||activities.find(a=>a.kind===kind),attempt=currentActivity?.legacy?currentActivity?.attempts[0]:currentActivity?.attempts.find((attempt:any)=>attempt.id===currentActivity.currentAttemptId);
  const currentEvents=attempt?.events||[],latestEvent=currentEvents.at(-1);
  const workKinds=new Map<string,string>();for(const activity of activities){if(activity.taskId)workKinds.set(activity.taskId,activity.kind);for(const link of activity.links||[])workKinds.set(link.taskId,activity.kind);}
  const taskViews=tasks.map(task=>{const activity=activities.find(a=>a.taskId===task.id||(a.links||[]).some((link:any)=>link.taskId===task.id));return {...publicItem(task),activityId:activity?.id||null,activityKind:workKinds.get(task.id)||null,processOwned:!!object(task.data).workProcess,managed:!!object(task.data).workProcess||!!activity?.links?.some((link:any)=>link.taskId===task.id&&link.completion==='publish_code'),operationalState:activity?.state||null,attempts:activity?.attempts||[]};});
  const codingActivity=work.find((a:any)=>a.kind==='coding');
  const bindingTasks=tasks.filter(task=>!object(task.data).workProcess).map(task=>{const link=codingActivity?.taskLinks.find((link:any)=>link.taskId===task.id);return {id:task.id,key:task.key,name:task.name,description:task.description,linked:!!link,scope:link?.scope||'',completion:link?.completion||'manual_evidence'};});
  const executionConversation=!!run&&(canDiscuss||run.stage==='discussion'||run.discussionVersion>0&&['specification','coding'].includes(kind));
  const chatMode=executionConversation?'execution':run?.state==='succeeded'&&merge?'merge':null;
  const chatEnabled=canAct&&scope.current&&!!h.llm&&(chatMode==='execution'?!!(canDiscuss||run?.stage==='discussion'):chatMode==='merge');
  const primaryAction=actions.find(action=>action.id!=='cancel')||null;
  return {story:publicItem(story),selectedItem:publicItem(selected),current:{phase:upper(story.status),label:labels[kind],state,kind,taskId:currentActivity?.taskId||null,activityId:currentActivity?.id||null,title,message,who,updatedAt:latestEvent?.timestamp||attempt?.updatedAt||run?.updatedAt||story.updatedAt},nextAction:primaryAction,secondaryActions:actions.filter(action=>action!==primaryAction),tasks:taskViews,activities,run:run?{id:run.id,state:run.state,stage:run.stage,error:run.error,specification:run.specification,discussionVersion:run.discussionVersion,technicalRetryAvailable:retryTechnical,validationIssues:object(object(run.snapshot).patchRepair).issues||[],branch:run.branch,commitSha:run.commitSha,mergeRequestUrl:run.mergeRequestUrl,createdAt:run.createdAt,updatedAt:run.updatedAt}:null,merge:merge?{id:merge.id,state:merge.state,sha:merge.sha,message:merge.message,blocks:merge.blocks,origin:merge.origin,mergedBy:merge.mergedBy,finishedAt:merge.finishedAt}:null,readiness,permissions:{canAct},configured,chat:{mode:chatMode,executionId:run?.id||null,enabled:chatEnabled,reason:!canAct?permissionReason:!h.llm?'Configure o modelo local.':chatMode==='execution'&&!chatEnabled?'A conversa permanece no histórico; a execução segue as decisões e aprovações vigentes.':undefined,guidance:message,contextLabel:`${labels[kind]} · ${story.key}`},signals:{lastEventAt:latestEvent?.timestamp||null,lastHeartbeatAt:attempt?.heartbeatAt||null,heartbeatStaleAfterMs:attempt?.heartbeatStaleAfterMs||45000,provider:attempt?.provider||null,stage:attempt?.stage||run?.stage||null,waitingSince:attempt?.waitingSince||null,queuedAt:attempt?.queuedAt||null,startedAt:attempt?.startedAt||null,queueReason:state==='queued'?'Aguarda recurso de execução compartilhado.':null,legacy:!!attempt?.legacy},events:currentEvents,binding:{activityId:codingActivity?.id||null,expectedLinksVersion:workLinksVersion(codingActivity?.taskLinks||[]),tasks:bindingTasks,path:`/api/items/${story.id}/work-links`,enabled:canAct&&!work.some((a:any)=>a.kind==='coding'&&a.attempts.some((attempt:any)=>['queued','running'].includes(attempt.state))),expectedVersion:story.version},history:history.map(normalizeEvent),repositoryName:repository?.name||links[0]?.repository.name||null};
 }));
 app.post<{Params:{id:string}}>('/api/items/:id/work-links',async request=>{
  const body=z.object({expectedVersion:z.number().int().positive(),expectedLinksVersion:z.string().regex(/^[a-f0-9]{64}$/),links:z.array(z.object({taskId:z.string().min(1),scope:z.string().trim().min(1).max(1000),completion:z.enum(['publish_code','manual_evidence']).default('manual_evidence')})).max(100)}).strict().parse(request.body);
  return h.mutate(request,async(tx,person)=>{
   const story=await h.live(tx,request.params.id);if(story.kind!=='story')throw new DomainError('STORY_REQUIRED','Associe o trabalho no contexto de uma História.',409);await h.ensureNotArchived(tx,story);
   if(story.version!==body.expectedVersion)throw new DomainError('VERSION_CONFLICT','A História mudou. Atualize antes de associar Tarefas.',409);
   const links=await tx.itemRepository.findMany({where:{itemId:story.id}});if(links.length!==1)throw new DomainError('REPOSITORY_REQUIRED','Vincule um repositório à História antes de associar o trabalho.',409);
   const activity=await ensureActivity(tx,h,{storyId:story.id,repositoryId:links[0].repositoryId,kind:'coding',person});
   await bindActivityTasks(tx,h,{activityId:activity.id,taskIds:body.links,expectedLinksVersion:body.expectedLinksVersion,person});
   return {linked:true,activityId:activity.id};
  });
 });
}
