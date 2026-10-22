import type {FastifyInstance} from 'fastify';
import type {Database} from '../../../packages/db/client.ts';
import {kinds,statuses,personas} from '@sdlc/shared';
import {z} from 'zod';
import {DomainError} from './errors.ts';

const filtersSchema=z.object({userId:z.string().trim().min(1).max(120).optional(),systemId:z.string().trim().min(1).max(120).optional(),projectId:z.string().trim().min(1).max(120).optional()}).strict();
export type DashboardFilters=z.infer<typeof filtersSchema>;

const DAY=86400000;
const zone='America/Sao_Paulo';
export function dashboardWeeks(now:Date){
  // São Paulo has UTC-03 throughout the supported measurement period.
  const local=new Date(now.getTime()-3*3600000);
  const monday=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-((local.getUTCDay()+6)%7))+3*3600000;
  return Array.from({length:4},(_,i)=>{
    const start=new Date(monday-(3-i)*7*DAY),end=new Date(start.getTime()+7*DAY);
    return {start:start.toISOString(),end:end.toISOString(),label:new Intl.DateTimeFormat('pt-BR',{timeZone:zone,day:'2-digit',month:'2-digit'}).format(start),partial:i===3};
  });
}
const median=(values:number[])=>{if(!values.length)return null;values.sort((a,b)=>a-b);const n=values.length;return n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;};
export async function dashboard(db:Database,now=new Date(),filters:DashboardFilters={}){
  const windows=dashboardWeeks(now);
  return db.$transaction(async tx=>{
    const allItems=await tx.item.findMany({select:{id:true,name:true,parentId:true,kind:true,status:true,projectLifecycle:true,archived:true,createdAt:true}});
    const humanEvents=await tx.historyEvent.findMany({where:{actorType:'human'},select:{itemId:true,actorId:true,actorName:true}});
    const users=new Map(humanEvents.map(e=>[e.actorId,{id:e.actorId,name:e.actorName}]));
    for(const p of personas)users.set(p.id,{id:p.id,name:p.name});
    const byId=new Map(allItems.map(i=>[i.id,i]));
    const ancestors=(id:string)=>{const ids:string[]=[];const seen=new Set<string>();let next=byId.get(id);while(next&&!seen.has(next.id)){seen.add(next.id);ids.push(next.id);next=next.parentId?byId.get(next.parentId):undefined;}return ids;};
    const system=filters.systemId?byId.get(filters.systemId):undefined,project=filters.projectId?byId.get(filters.projectId):undefined;
    if(filters.systemId&&system?.kind!=='system')throw new DomainError('INVALID_DASHBOARD_FILTER','Sistema selecionado não encontrado.');
    if(filters.projectId&&project?.kind!=='project')throw new DomainError('INVALID_DASHBOARD_FILTER','Projeto selecionado não encontrado.');
    if(system&&project&&project.parentId!==system.id)throw new DomainError('INVALID_DASHBOARD_FILTER','O Projeto não pertence ao Sistema selecionado.');
    if(filters.userId&&!users.has(filters.userId))throw new DomainError('INVALID_DASHBOARD_FILTER','Usuário selecionado não encontrado.');
    const participants=new Set(humanEvents.filter(e=>e.actorId===filters.userId).map(e=>e.itemId));
    const scopeIds=allItems.filter(i=>{
      const chain=ancestors(i.id);
      return(!system||chain.includes(system.id))&&(!project||chain.includes(project.id))&&(!filters.userId||participants.has(i.id));
    }).map(i=>i.id);
    // Ancestors supply inventory context, never widen the process-event scope.
    const inventoryIds=new Set(scopeIds.flatMap(ancestors));
    const items=allItems.filter(i=>inventoryIds.has(i.id));
    const events=await tx.historyEvent.findMany({where:{itemId:{in:scopeIds},timestamp:{gte:new Date(windows[0].start),lte:now}},select:{action:true,timestamp:true,payload:true}});
    const runs=await tx.storyExecution.findMany({where:{storyId:{in:scopeIds}},select:{id:true,createdAt:true}});
    // Full sequence is needed: a first message before the window must not turn
    // the next clarification inside the window into another first message.
    const discussionEvents=await tx.historyEvent.findMany({where:{itemId:{in:scopeIds},action:'EXECUTION_DISCUSSION_SENT',timestamp:{lte:now}},select:{id:true,timestamp:true,payload:true},orderBy:[{timestamp:'asc'},{id:'asc'}]});
    const seen=new Set<string>(),additional=new Set<string>();
    for(const e of discussionEvents){const runId=String((e.payload as Record<string,unknown>).runId);if(seen.has(runId))additional.add(e.id);seen.add(runId);}
    const reworkCategories=[
      {key:'technicalValidation',label:'Validação técnica do código',description:'Patches recusados pelo validador; cada recusa exige correção.',action:'PATCH_VALIDATION_REJECTED'},
      {key:'executionRetry',label:'Retomadas de execução',description:'Pedidos explícitos de retomada, inclusive falhas de infraestrutura ou publicação.',action:'EXECUTION_RETRIED'},
      {key:'specificationRevision',label:'Revisões de especificação',description:'Decisões confirmadas sobre impedimentos que reiniciam a especificação e exigem novo G1.',action:'EXECUTION_DECISION_CONFIRMED'},
      {key:'additionalClarification',label:'Esclarecimentos adicionais',description:'Mensagens humanas sobre impedimentos após a primeira de cada execução. Sinaliza esforço adicional, não comprova falha de especificação.',action:'additional'},
      {key:'testCorrection',label:'Correções solicitadas por testes',description:'Ciclos de teste reprovado e solicitação de correção.',action:null},
      {key:'reviewCorrection',label:'Correções solicitadas por revisão',description:'Ciclos de revisão reprovada e solicitação de correção.',action:null},
    ].map(c=>{
      const values=windows.map(w=>({start:w.start,value:c.action===null?null:c.action==='additional'?discussionEvents.filter(e=>additional.has(e.id)&&e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end)).length:events.filter(e=>e.action===c.action&&e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end)).length}));
      return {key:c.key,label:c.label,description:c.description,available:c.action!==null,unavailableReason:c.action===null?'Etapa de testes/revisão e seus eventos ainda não integrados.':undefined,weeks:values,total:c.action===null?null:values.reduce((sum,v)=>sum+(v.value??0),0)};
    });
    const active=items.filter(i=>!i.archived);
    const inventory=kinds.map(kind=>{
      const own=active.filter(i=>i.kind===kind);
      const group=(values:string[])=>[...new Set(values)].map(status=>({status,count:own.filter(i=>i.status===status).length}));
      return {kind,total:own.length,archivedTotal:items.filter(i=>i.kind===kind&&i.archived).length,statuses:group([...statuses[kind],...own.map(i=>i.status)]),...(kind==='project'?{lifecycle:['planned','active','completed','cancelled'].map(status=>({status,count:own.filter(i=>(i.projectLifecycle??'planned')===status).length}))}:{})};
    });
    const ageBands=[{key:'under7',label:'Menos de 7 dias',min:0,max:7},{key:'7to15',label:'7 a menos de 15 dias',min:7,max:15},{key:'15to30',label:'15 a menos de 30 dias',min:15,max:30},{key:'30plus',label:'30 dias ou mais',min:30,max:Infinity}];
    const aging=['project','epic','story'].map(kind=>{
      const open=active.filter(i=>i.kind===kind&&(kind==='project'?!['completed','cancelled'].includes(i.projectLifecycle??'planned'):!['done','completed'].includes(i.status)));
      return {kind,total:open.length,buckets:ageBands.map(b=>({key:b.key,label:b.label,count:open.filter(i=>{const days=Math.max(0,(now.getTime()-i.createdAt.getTime())/DAY);return days>=b.min&&days<b.max;}).length}))};
    });
    const runStarts=new Map(runs.map(r=>[r.id,r.createdAt.getTime()]));
    const weeks=windows.map(w=>{
      const own=events.filter(e=>e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end));
      const count=(actions:string[])=>own.filter(e=>actions.includes(e.action)).length;
      const publicationTimes=own.filter(e=>e.action==='CODE_PUBLISHED').flatMap(e=>{const p=e.payload as Record<string,unknown>;const start=runStarts.get(String(p.runId));return start===undefined?[]:[Math.max(0,e.timestamp.getTime()-start)/3600000];});
      const metrics=[
        {key:'approvals',label:'Aprovações de planejamento e gates',value:count(['PLANNING_APPROVED','GATE_APPROVED']),unit:'count'},
        {key:'loops',label:'Loops de retrabalho e retomadas',value:count(['EXECUTION_RETRIED','PATCH_VALIDATION_REJECTED','EXECUTION_DECISION_CONFIRMED']),unit:'count'},
        {key:'executions',label:'Execuções solicitadas',value:count(['EXECUTION_REQUESTED']),unit:'count'},
        {key:'failures',label:'Falhas registradas',value:count(['EXECUTION_FAILED','EXECUTION_LEASE_EXPIRED','ASSISTANT_TURN_FAILED','GITLAB_PROVISIONING_FAILED','REPOSITORY_PROVISIONING_FAILED']),unit:'count'},
        {key:'discussionMessages',label:'Mensagens humanas sobre impedimentos',value:count(['EXECUTION_DISCUSSION_SENT']),unit:'count'},
        {key:'mergeRequests',label:'Merge Requests publicados',value:count(['CODE_PUBLISHED']),unit:'count'},
        {key:'completedItems',label:'Conclusões de itens',value:own.filter(e=>{const p=e.payload as Record<string,unknown>;return(e.action==='STATUS_CHANGED'&&['done','completed'].includes(String(p.to)))||(e.action==='PROJECT_LIFECYCLE_CHANGED'&&p.to==='completed');}).length,unit:'count'},
        {key:'timeToMR',label:'Tempo mediano até Merge Request',value:median(publicationTimes),unit:'hours',unavailableReason:publicationTimes.length?undefined:'Sem publicações correlacionadas nesta semana.'},
        {key:'stageDuration',label:'Duração mediana de etapas processadas',value:median(own.flatMap(e=>{const p=e.payload as Record<string,unknown>;return typeof p.durationMs==='number'?[p.durationMs/1000]:[];})),unit:'seconds',unavailableReason:'Disponível somente para etapas com duração instrumentada nesta versão.'},
        {key:'rework',label:'Retrabalho e ciclos de correção observados',value:reworkCategories.reduce((sum,c)=>sum+(c.weeks.find(v=>v.start===w.start)?.value??0),0),unit:'count'},
      ];
      return {...w,metrics};
    });
    const dora=[
      {key:'deploymentFrequency',label:'Deployment frequency',unit:'deployments/week',description:'Implantações bem-sucedidas em produção por semana.'},
      {key:'changeLeadTime',label:'Change lead time',unit:'hours',description:'Tempo do commit até a disponibilização em produção; mediana por mudança.'},
      {key:'failedDeploymentRecoveryTime',label:'Failed deployment recovery time',unit:'hours',description:'Tempo entre falha de implantação e recuperação do serviço; mediana.'},
      {key:'changeFailRate',label:'Change fail rate',unit:'percent',description:'Percentual de implantações que causam degradação e exigem remediação.'},
      {key:'deploymentReworkRate',label:'Deployment rework rate',unit:'percent',description:'Percentual de implantações não planejadas realizadas em resposta a incidente de produção.'},
    ].map(m=>({...m,value:null,samples:0,weeks:windows.map(w=>({start:w.start,value:null,samples:0})),unavailableReason:'Coleta de deploys e incidentes de produção ainda não integrada; Merge Request não é deploy.'}));
    return {generatedAt:now.toISOString(),timezone:zone,filters,filterOptions:{users:[...users.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),systems:allItems.filter(i=>i.kind==='system').map(i=>({id:i.id,name:i.name+(i.archived?' (arquivado)':'')})),projects:allItems.filter(i=>i.kind==='project').map(i=>({id:i.id,name:i.name+(i.archived?' (arquivado)':''),systemId:i.parentId!}))},inventory,weeks,aging,dora,rework:{categories:reworkCategories},notes:[
      'Filtros combinados por interseção. Usuário significa participação humana registrada no histórico do item, em qualquer data; inclui resultados dos agentes nesses itens. Não equivale a responsável ou proprietário.',
      'Sistema e Projeto delimitam o trabalho e seus descendentes. Ancestrais aparecem nos totais como contexto; seus outros eventos e descendentes não entram no recorte. Opções incluem arquivados para consulta histórica.',
      'Estoque atual: itens não arquivados, com arquivados informados separadamente. Aprovação e ciclo de vida do Projeto são dimensões distintas.',
      'Quatro semanas de calendário, de segunda a segunda, em São Paulo; a semana atual está parcial. Eventos usam intervalos [início, fim).',
      'Loops contam ocorrências de retomada explícita, rejeição técnica de patch e decisão que reinicia especificação; uma execução pode contribuir várias vezes.',
      'Retrabalho soma ocorrências das categorias com coleta disponível, incluindo esclarecimentos adicionais; não representa quantidade única de rotinas que falharam na primeira tentativa. Testes e revisão ainda não integrados não contribuem com zeros fictícios.',
      'Falhas históricas refletem somente eventos preservados. Instrumentação de falhas de execução e duração de etapas ampliada nesta versão; ausência de registro antigo não prova ausência de falha.',
      'Idade conta desde criação, inclusive tempo de aprovação, em dias corridos de 24h. Um mês equivale a 30 dias. Projetos concluídos/cancelados, épicos DONE e histórias COMPLETED são fechados.',
      'Tempo até MR inclui esperas e conversas da execução, não equivale ao Change lead time DORA. Sem amostras resulta em indisponível, não zero.',
    ]};
  },{isolationLevel:'RepeatableRead'});
}
export function registerMetrics(app:FastifyInstance,db:Database){app.get('/api/metrics/dashboard',async request=>dashboard(db,new Date(),filtersSchema.parse(request.query)));}
