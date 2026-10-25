import type {Transaction} from '../../../packages/db/client.ts';

type Window={start:string;end:string;label:string;partial:boolean};
type Filters={userId?:string;systemId?:string;projectId?:string};
type Item={id:string;kind:string;parentId:string|null;archived?:boolean};
type Participation={itemId:string;actorId:string};
type Activity={id:string;storyId:string;taskId:string;createdAt:Date};
type Attempt={id:string;activityId:string;actorId:string;state:string;queuedAt:Date;startedAt:Date|null;finishedAt:Date|null};
type Event={id:string;attemptId:string;key:string;kind:string;category:string|null;timestamp:Date;payload:unknown};
type Link={activityId:string;taskId:string;createdAt:Date};
type BindingEvent={itemId:string;timestamp:Date;payload:unknown};
export type WorkMetricsSource={items:readonly Item[];participation:readonly Participation[];activities:readonly Activity[];attempts:readonly Attempt[];events:readonly Event[];links:readonly Link[];bindings?:readonly BindingEvent[]};
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n?n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2:null;};
const payload=(event:Event):Record<string,unknown>=>event.payload!==null&&typeof event.payload==='object'&&!Array.isArray(event.payload)?event.payload as Record<string,unknown>:{};
const validDuration=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const categoryLabels:Record<string,string>={integration_access:'Acesso da integração',provider_unavailable:'Provedor indisponível ou tempo limite',changed_scope:'Revisão ou escopo alterado',user_decision:'Decisão do usuário',execution_failure:'Falha de execução',authentication:'Autenticação da integração',authorization:'Permissão da integração',access:'Acesso da integração',credential:'Credencial da integração',integration:'Integração',timeout:'Tempo limite',infrastructure:'Infraestrutura',provider:'Provedor externo',validation:'Validação técnica',quality:'Achados de qualidade',code_review:'Code Review',security_scan:'Security Scan',specification:'Especificação',scope:'Decisão de escopo',dependency:'Dependência',unknown:'Categoria não informada'};

/** Durable operation sources only. A history projection on both Story and Task
 * must not multiply operations, durations or retries. No legacy backfill. */
export function computeWorkDashboard(source:WorkMetricsSource,now:Date,windows:readonly Window[],filters:Filters={}){
 const items=new Map(source.items.map(item=>[item.id,item]));
 const ancestors=(id:string)=>{const result:string[]=[],seen=new Set<string>();let item=items.get(id);while(item&&!seen.has(item.id)){seen.add(item.id);result.push(item.id);item=item.parentId?items.get(item.parentId):undefined;}return result;};
 const inHierarchy=(id:string)=>{const chain=ancestors(id);return (!filters.systemId||chain.includes(filters.systemId))&&(!filters.projectId||chain.includes(filters.projectId));};
 const participated=new Set(source.participation.filter(event=>event.actorId===filters.userId).map(event=>event.itemId));
 const linksByActivity=new Map<string,Set<string>>();
 for(const link of source.links){if(link.createdAt>now)continue;const linked=linksByActivity.get(link.activityId)??new Set<string>();linked.add(link.taskId);linksByActivity.set(link.activityId,linked);}
 const historicalLinks=new Map<string,Map<string,Date>>();
 for(const binding of source.bindings??[]){
  if(binding.timestamp>now)continue;
  const p=binding.payload&&typeof binding.payload==='object'&&!Array.isArray(binding.payload)?binding.payload as Record<string,unknown>:{};
  const activity=source.activities.find(activity=>activity.id===p.activityId&&activity.storyId===binding.itemId);
  if(!activity||!Array.isArray(p.taskIds))continue;const linked=historicalLinks.get(activity.id)??new Map<string,Date>();
  for(const id of p.taskIds)if(typeof id==='string'&&items.get(id)?.kind==='task'&&ancestors(id).includes(activity.storyId)){const previous=linked.get(id);if(!previous||binding.timestamp<previous)linked.set(id,binding.timestamp);}
  historicalLinks.set(activity.id,linked);
 }
 const activityScope=source.activities.filter(activity=>activity.createdAt<=now&&inHierarchy(activity.storyId)&&(!filters.userId||participated.has(activity.storyId)||participated.has(activity.taskId)||[...(linksByActivity.get(activity.id)??[]),...(historicalLinks.get(activity.id)?.keys()??[])].some(id=>participated.has(id))||source.attempts.some(attempt=>attempt.activityId===activity.id&&attempt.actorId===filters.userId&&attempt.queuedAt<=now)));
 const activities=new Map(activityScope.map(activity=>[activity.id,activity]));
 const attempts=source.attempts.filter(attempt=>activities.has(attempt.activityId)&&attempt.queuedAt<=now),attemptIds=new Set(attempts.map(attempt=>attempt.id));
 // The unique operation key, rather than an audit row ID, owns the observation.
 const eventKeys=new Set<string>();
 const events=source.events.filter(event=>{const key=`${event.attemptId}:${event.key}`;if(!attemptIds.has(event.attemptId)||event.timestamp>now||eventKeys.has(key))return false;eventKeys.add(key);return true;}).sort((a,b)=>a.timestamp.getTime()-b.timestamp.getTime()||a.id.localeCompare(b.id));
 const attemptsById=new Map(attempts.map(attempt=>[attempt.id,attempt]));
 const firstFinishes=new Map<string,{timestamp:Date;seconds:number;queueSeconds:number|null}>();
 for(const event of events){const p=payload(event);if(!firstFinishes.has(event.attemptId)&&['waiting_input','waiting_approval','blocked','failed','succeeded','cancelled','stale'].includes(event.kind)&&validDuration(p.processingMs))firstFinishes.set(event.attemptId,{timestamp:event.timestamp,seconds:p.processingMs/1000,queueSeconds:validDuration(p.queueMs)?p.queueMs/1000:null});}
 const observedQueues=attempts.flatMap(attempt=>{
  const finish=firstFinishes.get(attempt.id);if(finish?.queueSeconds!==null&&finish?.queueSeconds!==undefined)return [{timestamp:finish.timestamp,seconds:finish.queueSeconds}];
  const stages=events.filter(event=>event.attemptId===attempt.id&&event.kind==='stage_started'&&validDuration(payload(event).queueMs));
  if(stages.length)return [{timestamp:stages.at(-1)!.timestamp,seconds:stages.reduce((sum,event)=>sum+Number(payload(event).queueMs)/1000,0)}];
  return attempt.startedAt&&attempt.startedAt>=attempt.queuedAt?[{timestamp:attempt.startedAt,seconds:(attempt.startedAt.getTime()-attempt.queuedAt.getTime())/1000}]:[];
 });
 const resolutions=events.filter(event=>event.kind==='wait_resolved').flatMap(event=>{
  const p=payload(event);if(!validDuration(p.durationMs))return [];
  const previous=events.filter(candidate=>candidate.attemptId===event.attemptId&&candidate.timestamp<=event.timestamp&&['waiting_input','waiting_approval','blocked','failed'].includes(candidate.kind)).at(-1);
  const waitKind=typeof p.waitKind==='string'?p.waitKind:previous?.kind;
  return [{event,seconds:p.durationMs/1000,category:typeof p.category==='string'?p.category:event.category??previous?.category??'unknown',waitKind,resumedAfterFailure:p.resumedAfterFailure===true}];
 });
 const taskIdsFor=(event:Event)=>{
  const p=payload(event),attempt=attemptsById.get(event.attemptId),activity=attempt?activities.get(attempt.activityId):undefined;
  const explicit=Array.isArray(p.taskIds)?p.taskIds.filter((id):id is string=>typeof id==='string'):typeof p.taskId==='string'?[p.taskId]:[];
  const linked=new Set(activity?[activity.taskId,...(linksByActivity.get(activity.id)??[]),...(historicalLinks.get(activity.id)?.keys()??[])]:[]);
  return [...new Set(explicit.length?explicit:activity?[activity.taskId]:[])].filter(id=>linked.has(id)&&items.get(id)?.kind==='task'&&inHierarchy(id));
 };
 const taskScope=source.items.filter(item=>item.kind==='task'&&!item.archived&&inHierarchy(item.id)&&(!filters.userId||participated.has(item.id)||ancestors(item.id).some(id=>items.get(id)?.kind==='story'&&participated.has(id))||activityScope.some(activity=>activity.taskId===item.id||linksByActivity.get(activity.id)?.has(item.id))));
 const scopedTasks=new Set(taskScope.map(task=>task.id)),firstLinks=new Map<string,Date>(),firstObservedLinks=new Map<string,Date>();
 const observeLink=(taskId:string,date:Date)=>{if(!scopedTasks.has(taskId)||date>now)return;const previous=firstLinks.get(taskId);if(!previous||date<previous)firstLinks.set(taskId,date);};
 for(const activity of activityScope)observeLink(activity.taskId,activity.createdAt);
 for(const link of source.links)if(activities.has(link.activityId))observeLink(link.taskId,link.createdAt);
 const observeHistorical=(taskId:string,date:Date)=>{if(items.get(taskId)?.kind!=='task'||!inHierarchy(taskId)||date>now)return;const previous=firstObservedLinks.get(taskId);if(!previous||date<previous)firstObservedLinks.set(taskId,date);};
 for(const activity of activityScope){observeHistorical(activity.taskId,activity.createdAt);for(const [id,date]of historicalLinks.get(activity.id)??[])observeHistorical(id,date);}
 // Current links are a fallback for an association whose original audit record
 // predates this collector; deleting/recreating a link never erases its audit.
 for(const link of source.links)if(activities.has(link.activityId))observeHistorical(link.taskId,historicalLinks.get(link.activityId)?.get(link.taskId)??link.createdAt);
 const sample=(values:number[])=>({value:median(values),samples:values.length,unit:'seconds' as const,...(!values.length?{unavailableReason:'Nenhuma duração completa instrumentada neste período.'}:{})});
 const calculate=(start:Date,end:Date)=>{
  const inside=(date:Date)=>date>=start&&date<end&&date<=now;
  const queue=observedQueues.filter(observation=>inside(observation.timestamp)).map(observation=>observation.seconds);
  const processing=[...firstFinishes.values()].filter(finish=>inside(finish.timestamp)).map(finish=>finish.seconds);
  const ownResolutions=resolutions.filter(resolution=>inside(resolution.event.timestamp));
  const human=ownResolutions.filter(resolution=>['waiting_input','waiting_approval'].includes(resolution.waitKind??''));
  const impediments=ownResolutions.filter(resolution=>['blocked','failed'].includes(resolution.waitKind??''));
  const reopened=events.filter(event=>event.kind==='reopened'&&inside(event.timestamp));
  const reopenedIds=new Set(reopened.flatMap(taskIdsFor));
  return {queue:sample(queue),processing:sample(processing),humanWait:sample(human.map(resolution=>resolution.seconds)),impedimentResolution:sample(impediments.map(resolution=>resolution.seconds)),resumedAfterFailure:ownResolutions.filter(resolution=>resolution.resumedAfterFailure).length,tasksLinked:[...firstObservedLinks.values()].filter(inside).length,tasksReopened:reopenedIds.size,reopenOccurrences:reopened.reduce((sum,event)=>sum+taskIdsFor(event).length,0),resolvedImpediments:impediments.length};
 };
 const from=new Date(windows[0]?.start??now),until=new Date(now.getTime()+1);
 const categories=[...new Set(resolutions.filter(resolution=>['blocked','failed'].includes(resolution.waitKind??'')&&resolution.event.timestamp>=from).map(resolution=>resolution.category))].sort();
 const categorySample=(category:string,start:Date,end:Date)=>sample(resolutions.filter(resolution=>resolution.category===category&&['blocked','failed'].includes(resolution.waitKind??'')&&resolution.event.timestamp>=start&&resolution.event.timestamp<end&&resolution.event.timestamp<=now).map(resolution=>resolution.seconds));
 return {
  total:calculate(from,until),weeks:windows.map(window=>({...window,...calculate(new Date(window.start),new Date(window.end))})),
  linkage:{linked:firstLinks.size,tasks:scopedTasks.size,rate:scopedTasks.size?firstLinks.size/scopedTasks.size*100:null,unit:'percent' as const,unavailableReason:scopedTasks.size?undefined:'Nenhuma Tarefa ativa neste recorte.'},
  impedimentCategories:categories.map(category=>({key:category,label:categoryLabels[category]??category,total:categorySample(category,from,until),weeks:windows.map(window=>({start:window.start,...categorySample(category,new Date(window.start),new Date(window.end))}))})),
  observedAttempts:attempts.length,
  notes:[
   'Tempos são medianas em segundos. Cada duração exige início e fim observados; sem amostras aparece Sem medição. A semana atual é parcial.',
   'Fila soma intervalos encerrados ao iniciar cada etapa da tentativa; não inclui fila ainda aberta. Usa o total do primeiro término ou, enquanto ativa, a soma observada até o último início de etapa. A amostra ativa é parcial e pertence à semana desse último início; encerrada, à semana do término. Registros anteriores com só um início preservam a duração confirmada até esse início.',
   'Processamento soma somente etapas ocupadas até o primeiro término confirmado, incluindo espera pelo provedor e excluindo filas entre etapas e espera humana posterior; atribuído à semana do término.',
   'Espera humana mede somente ciclos waiting_input ou waiting_approval resolvidos. Resolução de impedimentos mede ciclos blocked ou failed resolvidos, separados pela categoria registrada; não comprova que o código ou a integração foram aprovados.',
   'Um ciclo de espera que atravessa semanas entra inteiro na semana de sua resolução. Esperas abertas não são durações concluídas e não entram na mediana.',
   'Retomadas após falhas contam a resolução explicitamente marcada resumedAfterFailure. Retentativas de transporte e consultas da tela não criam retomadas.',
   'Tarefas vinculadas: estoque atual de Tarefas não arquivadas com vínculo durável, dividido pelas Tarefas não arquivadas no recorte. A comparação semanal conta a primeira vinculação observada por Tarefa; vínculos repetidos não duplicam a Tarefa.',
   'Tarefas reabertas são distintas em cada período; ocorrências de reabertura contam cada evento e Tarefa. O total de Tarefas distintas pode ser menor que a soma das semanas.',
   'Participação inclui a História, sua Tarefa vinculada ou autoria da tentativa, sem incluir outras Histórias do Projeto. A mesma operação projetada no histórico da História e da Tarefa conta uma vez.',
   'Coleta iniciada nesta versão. Não há reconstrução de durações, conclusões ou vínculos históricos sem evidência. Atividades de Sistemas arquivados mantêm o histórico; o estoque de Tarefas exclui somente Tarefas arquivadas.',
  ],
 };
}

/** Shares the dashboard transaction, calendar and global filters. */
export async function workDashboard(tx:Transaction,now:Date,windows:readonly Window[],filters:Filters={},snapshot?:readonly Item[],participation?:readonly Participation[]){
 const items=snapshot??await tx.item.findMany({select:{id:true,kind:true,parentId:true,archived:true}});
 const humanEvents=participation??await tx.historyEvent.findMany({where:{actorType:'human',timestamp:{lte:now}},select:{itemId:true,actorId:true}});
 const activities=await tx.workActivity.findMany({where:{createdAt:{lte:now}},select:{id:true,storyId:true,taskId:true,createdAt:true}});
 const activityIds=activities.map(activity=>activity.id);
 const attempts=await tx.workAttempt.findMany({where:{activityId:{in:activityIds},queuedAt:{lte:now}},select:{id:true,activityId:true,actorId:true,state:true,queuedAt:true,startedAt:true,finishedAt:true}});
 const [events,links,bindings]=await Promise.all([
  tx.workEvent.findMany({where:{attemptId:{in:attempts.map(attempt=>attempt.id)},timestamp:{lte:now},kind:{in:['stage_started','waiting_input','waiting_approval','blocked','failed','succeeded','cancelled','stale','wait_resolved','reopened']}},select:{id:true,attemptId:true,key:true,kind:true,category:true,timestamp:true,payload:true},orderBy:[{timestamp:'asc'},{id:'asc'}]}),
  tx.workTaskLink.findMany({where:{activityId:{in:activityIds},createdAt:{lte:now}},select:{activityId:true,taskId:true,createdAt:true}}),
  tx.historyEvent.findMany({where:{action:'WORK_TASKS_BOUND',timestamp:{lte:now}},select:{itemId:true,timestamp:true,payload:true}}),
 ]);
 return computeWorkDashboard({items,participation:humanEvents,activities,attempts,events,links,bindings},now,windows,filters);
}
