// Amostras determinísticas exclusivas da prévia. Nenhum registro vem do portal real.
import {entities as previousEntities} from './data.mjs';

const instant = n => new Date(Date.UTC(2026, 9, 24, 15) - n * 3600000).toISOString();
export const prototypeEntities = structuredClone(previousEntities);
for (let n=1;n<=44;n++) prototypeEntities.push({id:`system-unidade-${n}`,kind:'system',key:`UN${String(n).padStart(2,'0')}`,name:`Unidade de negócios ${String(n).padStart(2,'0')}`,description:'Produto fictício para explorar consultas com muitas ocorrências.',parentId:null,status:n%8===0?'inactive':'active',archived:n%19===0,department:['Operações','Comercial','Finanças'][n%3]});
for (let n=1;n<=46;n++) prototypeEntities.push({id:`project-iniciativa-${n}`,kind:'project',key:`AT-PR${String(n).padStart(2,'0')}`,name:`Melhoria do atendimento ${String(n).padStart(2,'0')}`,description:'Iniciativa simulada com aprovação e ciclo separados.',parentId:'system-atendimento',status:n%4===0?'awaiting_approval':'approved',lifecycle:n%11===0?'cancelled':n%9===0?'completed':n%3===0?'planned':'active',archived:n%17===0});
prototypeEntities.push(
  {id:'project-archived',kind:'project',key:'AT-ARQ',name:'Projeto arquivado para consulta',description:'Arquivo histórico simulado. O status de planejamento original foi preservado.',parentId:'system-atendimento',status:'awaiting_approval',lifecycle:'planned',archived:true},
  {id:'epic-archived',kind:'epic',key:'AT-ARQ-E1',name:'Escopo preservado no arquivo',description:'Consulta de descendentes arquivados.',parentId:'project-archived',status:'todo',archived:true},
  {id:'story-archived',kind:'story',key:'AT-ARQ-H1',name:'História arquivada com rastreabilidade',description:'As consultas não reativam os registros nem concedem aprovações.',parentId:'epic-archived',status:'specification',archived:true},
  {id:'task-archived',kind:'task',key:'AT-ARQ-T1',name:'Tarefa arquivada',description:'Trabalho histórico disponível para leitura.',parentId:'story-archived',status:'todo',archived:true}
);
for(let n=1;n<=42;n++) prototypeEntities.push({id:`task-exploracao-${n}`,kind:'task',key:`AT-T${n+10}`,name:`Validar cenário de atendimento ${String(n).padStart(2,'0')}`,description:'Trabalho planejado de exemplo, independente de aprovação de execução.',parentId:'story-consulta',status:['todo','doing','done'][n%3]});
prototypeEntities.forEach((item,index)=>{
  item.archived??=false;item.createdAt??=instant(index*3+1);item.updatedAt??=instant(index+1);item.version??=1;
  item.participants??=['admin',index%2?'ana':'bruno'];
  item.projectLifecycle=item.lifecycle||item.projectLifecycle;
  item.data??={};
});

const actors=[['Ana','human'],['Agente de implementação','agent'],['Security Scan','tool'],['Integração GitLab','integration'],['Bruno','human']];
const actions=[['PLANNING_APPROVED','Planejamento revisado e aprovado','APPROVED','SPECIFICATION'],['CODE_PUBLISHED','Revisão de código publicada para análise','COMPLETED','CODING'],['QUALITY_CHECK_FAILED','Revisão encontrou um achado e solicitou correção','BLOCKED','CODE REVIEW'],['QUALITY_CHECK_PASSED','Verificação da revisão concluída','PASSED','SECURITY SCAN'],['USER_MESSAGE','Orientação registrada pelo usuário','RECORDED','SPECIFICATION']];
export const simulationHistory=Array.from({length:185},(_,index)=>{
  const n=index+1,[actor,actorType]=actors[index%actors.length],[type,message,result,phase]=actions[index%actions.length];
  const item=prototypeEntities.find(value=>value.id===['story-consulta','story-anexos','story-resumo','project-atendimento','epic-consulta'][index%5]);
  return {id:`EVT-${String(n).padStart(3,'0')}`,timestamp:instant(index*4),actor,actorType,type,message:`${message}. Ocorrência fictícia ${n}.`,entityId:item.id,entityName:item.name,result,phase,revision:`r${index%4+1}`,correlationId:`sim-attempt-${Math.floor(index/5)+1}`,sha:(index%16).toString(16).repeat(40)};
});
simulationHistory.push({id:'EVT-ARCHIVE',timestamp:instant(1),actor:'Ana',actorType:'human',type:'ITEM_ARCHIVED',message:'Projeto arquivado; hierarquia e histórico preservados.',entityId:'project-archived',entityName:'Projeto arquivado para consulta',result:'ARCHIVED',phase:'SPECIFICATION',revision:'v1',correlationId:'sim-archive-1'});

export const prototypeRepositories=[
  {id:'repo-web',systemId:'system-atendimento',name:'Portal de atendimento',key:'WEB',runtime:'Node.js',state:'READY',path:'sdlc/atendimento/portal'},
  {id:'repo-api',systemId:'system-atendimento',name:'Serviço de solicitações',key:'API',runtime:'Python',state:'READY',path:'sdlc/atendimento/api'},
  {id:'repo-orders',systemId:'system-pedidos',name:'Serviço de pedidos',key:'ORDERS',runtime:'Node.js',state:'NOT CONFIGURED',path:'sdlc/pedidos/api'}
];

export const prototypeCoverage=[
  ['Navegação','Cinco menus e contexto hierárquico','portal.tsx','#/systems','Representado'],
  ['Consultas','Filtros, ordenação, paginação e retorno','PADROES_DE_EXPERIENCIA.md','#/systems','Proposta de evolução'],
  ['Sistemas','Criação, edição, status e arquivamento','portal.tsx + app.ts','#/system/system-atendimento/overview','Simulação local'],
  ['Projetos','Aprovação, ciclo e reabertura','project-lifecycle.tsx','#/project/project-atendimento/planning','Simulação local'],
  ['Acervo','Consulta de itens e descendentes arquivados','archived-item.tsx','#/project/project-archived/overview','Representado'],
  ['Histórico','Eventos antigos, filtros e correlação','portal.tsx + app.ts','#/system/system-atendimento/activity','Proposta de evolução'],
  ['Dashboard','Nove assuntos e comparação de quatro semanas','dashboard.tsx','#/overview','Dados fictícios'],
  ['Assistente','Entrevista, proposta, cobertura e confirmação','assistant-workspace.tsx','#/assistant','Resposta fixa'],
  ['História','Fase permanente e próxima ação contextual','story-workspace.tsx','#/story/story-consulta/overview','Simulação local'],
  ['Tarefa','Evidências, tentativas e trabalho manual','story-workspace.tsx','#/story/story-consulta/tasks','Simulação local'],
  ['Qualidade','Code Review e Security Scan antes do merge','quality-control.tsx','#/story/story-consulta/overview','Simulação local'],
  ['Merge','Revisão humana ou assistente com confirmação','merge-control.tsx','#/story/story-consulta/delivery','Sem GitLab real'],
  ['Releases','DRAFT vazio e composição de Histórias','releases.tsx','#/releases','Simulação local'],
  ['Release na História','Selecionar uma release existente','releases.tsx','#/story/story-consulta/releases','Simulação local'],
  ['Promoção','Ramificações e pacote imutável QA/HML/PRD','releases-promocao-2026-10-22.md','#/release/release-r2/branches','Futuro simulado'],
  ['Integrações','Prontidão, mensagens e nova consulta','integrations.tsx','#/integrations','Sem sondagem real'],
  ['Componentes','Criar, vincular e consultar repositórios','repos.tsx','#/system/system-atendimento/components','Simulação local'],
  ['Ambientes','Ambientes do Sistema e versão por componente','portal.tsx','#/system/system-atendimento/environments','Valores fictícios']
].map((row,index)=>({id:`coverage-${index}`,area:row[0],name:row[1],source:row[2],href:row[3],coverage:row[4]}));
