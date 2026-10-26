import type {Transaction} from '../../../packages/db/client.ts';
type Window={start:string;end:string;label:string;partial:boolean};
type Story={id:string;createdAt:Date;data:unknown};
type Revision={id:string;storyId:string;number:number;source:string;createdAt:Date};
type Event={id:string;itemId:string;action:string;timestamp:Date;operationId:string|null};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function computeStoryMetrics(stories:readonly Story[],revisions:readonly Revision[],events:readonly Event[],windows:readonly Window[],now:Date,startedAt:Date){
 const ids=new Set(stories.map(story=>story.id)),seen=new Set<string>();
 const transitions=events.filter(event=>{const key=event.operationId?`${event.itemId}:${event.action}:${event.operationId}`:event.id;if(!ids.has(event.itemId)||seen.has(key)||event.timestamp>now||event.timestamp<startedAt)return false;seen.add(key);return true;});
 const row=(start:Date,end:Date)=>{
  const available=end>startedAt&&start<=now,inside=(date:Date)=>date>=start&&date<end&&date<=now;
  const creations=stories.filter(story=>inside(story.createdAt));
  const cancelled=transitions.filter(event=>event.action==='STORY_CANCELLED'&&inside(event.timestamp));
  const reopened=transitions.filter(event=>event.action==='STORY_REOPENED'&&inside(event.timestamp));
  const applied=revisions.filter(revision=>ids.has(revision.storyId)&&revision.number>1&&inside(revision.createdAt)&&revision.createdAt>=startedAt);
  return {available,partialCoverage:available&&start<startedAt,created:{manual:creations.filter(story=>object(story.data).creationOrigin==='manual').length,assistant:creations.filter(story=>object(story.data).creationOrigin==='assistant').length,unknown:creations.filter(story=>!['manual','assistant'].includes(String(object(story.data).creationOrigin))).length},revisions:available?applied.length:null,humanRevisions:available?applied.filter(revision=>revision.source==='human').length:null,agentRevisions:available?applied.filter(revision=>revision.source==='agent').length:null,cancellations:available?cancelled.length:null,cancelledStories:available?new Set(cancelled.map(event=>event.itemId)).size:null,reopenings:available?reopened.length:null,reopenedStories:available?new Set(reopened.map(event=>event.itemId)).size:null};
 };
 return {coverageStartedAt:startedAt.toISOString(),total:row(new Date(windows[0].start),new Date(now.getTime()+1)),weeks:windows.map(window=>({...window,...row(new Date(window.start),new Date(window.end))})),notes:['Criação conta cada História uma vez, na data de criação; origem Manual/Assistente é fixa. Legado sem procedência comprovada aparece como origem não registrada.','Revisões contam aplicações após a primeira versão, uma por revisão confirmada. Rascunhos, replays e alterações recusadas não contam. A revisão pode alterar requisitos e plano técnico na mesma operação.','Cancelamentos e reaberturas contam somente transições efetivas de Histórias; pedidos pendentes, Tarefas em cascata, interrupções de tentativa e pausas de agrupadores são medidas diferentes.','Ocorrências e Histórias distintas são apresentadas separadamente; reabrir ou arquivar não apaga as ocorrências anteriores.','Os novos eventos são observados desde a instalação desta política. Períodos anteriores sem cobertura não são convertidos em zero. As janelas e os filtros seguem a Visão geral existente; nenhuma meta numérica foi criada.']};
}
export async function storyMetrics(tx:Transaction,now:Date,windows:readonly Window[],scopeIds:string[]){
 const stories=await tx.item.findMany({where:{id:{in:scopeIds},kind:'story'},select:{id:true,createdAt:true,data:true}}),ids=stories.map(story=>story.id);
 const [revisions,events,installation]=await Promise.all([tx.storySpecificationRevision.findMany({where:{storyId:{in:ids},createdAt:{lte:now}},select:{id:true,storyId:true,number:true,source:true,createdAt:true}}),tx.historyEvent.findMany({where:{itemId:{in:ids},action:{in:['STORY_CANCELLED','STORY_REOPENED']},timestamp:{lte:now}},select:{id:true,itemId:true,action:true,timestamp:true,operationId:true}}),tx.flowPolicyInstallation.findUniqueOrThrow({where:{id:1}})]);
 return computeStoryMetrics(stories,revisions,events,windows,now,installation.startedAt);
}
