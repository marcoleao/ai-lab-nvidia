import type {Transaction} from '../../../packages/db/client.ts';

type Filters={userId?:string;systemId?:string;projectId?:string};
type Window={start:string;end:string;label:string;partial:boolean};
type HierarchyItem={id:string;kind:string;parentId:string|null;archived:boolean};
type ReleaseRow={id:string;systemId:string;compositionStatus:string;createdById:string;createdAt:Date;stories:readonly {storyId:string}[]};
type ParticipationEvent={itemId:string;action:string;payload:unknown};
type PreparationRow={id:string;releaseId:string;state:string;reconcileOnly:boolean;createdAt:Date;confirmedAt:Date|null};
type Source={items:readonly HierarchyItem[];releases:readonly ReleaseRow[];participation:readonly ParticipationEvent[];preparations?:readonly PreparationRow[]};

const HOUR=3600000;
const stageDefinitions=[{compositionStatus:'OPEN',label:'OPEN · Aberta'},{compositionStatus:'CLOSED',label:'CLOSED · Fechada'},{compositionStatus:'CANCELED',label:'CANCELED · Cancelada'}] as const;
const bands=[
  {key:'under7',label:'Menos de 7 dias',min:0,max:7},
  {key:'7to15',label:'7 a menos de 15 dias',min:7,max:15},
  {key:'15to30',label:'15 a menos de 30 dias',min:15,max:30},
  {key:'30plus',label:'30 dias ou mais',min:30,max:Infinity},
] as const;
const completedUnavailable='O fechamento de composições e seus eventos de duração ainda não estão integrados.';
const reworkUnavailable='A rejeição de candidatas em QA/HML e a criação de cópia como outra release ainda não estão integradas.';
const median=(values:number[])=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
const payload=(event:ParticipationEvent):Record<string,unknown>=>event.payload!==null&&typeof event.payload==='object'&&!Array.isArray(event.payload)?event.payload as Record<string,unknown>:{};

/**
 * Current inventory and elapsed age are stock measurements, not historical
 * throughput or finished composition durations. Creation has a durable source
 * independent of audit transport/retry: exactly one Release.createdAt per row.
 */
export function computeReleaseDashboard(source:Source,now:Date,windows:readonly Window[],filters:Filters={}){
  const items=new Map(source.items.map(item=>[item.id,item]));
  const lineage=(id:string)=>{
    const result:HierarchyItem[]=[],seen=new Set<string>();let item=items.get(id);
    while(item&&!seen.has(item.id)){result.push(item);seen.add(item.id);item=item.parentId?items.get(item.parentId):undefined;}
    return result;
  };
  const storySystem=(id:string)=>lineage(id).find(item=>item.kind==='system')?.id;
  const participatedStories=new Set(source.participation.filter(event=>items.get(event.itemId)?.kind==='story').map(event=>event.itemId));
  const referencedBySystem=new Map<string,Set<string>>();
  for(const event of source.participation){
    const ownItem=items.get(event.itemId),value=payload(event);
    // A System action participates only in its explicitly correlated release.
    // It must never expand the filter to every release of that System.
    const systemId=ownItem?.kind==='system'?ownItem.id:ownItem?.kind==='story'&&event.action==='STORY_RELEASE_PLANNED'?storySystem(ownItem.id):undefined;
    if(!systemId||!(event.action.startsWith('RELEASE_')||event.action==='STORY_RELEASE_PLANNED'))continue;
    const references=referencedBySystem.get(systemId)??new Set<string>();
    for(const key of ['releaseId','fromReleaseId','toReleaseId'])if(typeof value[key]==='string')references.add(value[key] as string);
    referencedBySystem.set(systemId,references);
  }
  const scoped=source.releases.filter(release=>{
    const system=items.get(release.systemId);
    if(system?.kind!=='system'||release.createdAt>now)return false;
    if(filters.systemId&&release.systemId!==filters.systemId)return false;
    // Project scope follows current membership, so an empty draft has no Project.
    if(filters.projectId&&!release.stories.some(story=>lineage(story.storyId).some(item=>item.id===filters.projectId&&item.kind==='project')))return false;
    if(filters.userId&&release.createdById!==filters.userId&&!referencedBySystem.get(release.systemId)?.has(release.id)&&!release.stories.some(story=>participatedStories.has(story.storyId)))return false;
    return true;
  });
  // Archiving removes current stock, never erases historical throughput.
  const releases=scoped.filter(release=>!items.get(release.systemId)?.archived);
  const ages=releases.filter(release=>release.compositionStatus==='OPEN').map(release=>Math.max(0,(now.getTime()-release.createdAt.getTime())/HOUR));
  const scopedIds=new Set(scoped.map(row=>row.id)),currentIds=new Set(releases.map(row=>row.id));
  const preparations=[...new Map((source.preparations??[]).filter(row=>scopedIds.has(row.releaseId)&&row.createdAt<=now).map(row=>[row.id,row])).values()];
  const confirmed=preparations.filter(row=>row.state==='succeeded'&&row.confirmedAt&&row.confirmedAt<=now&&row.confirmedAt>=row.createdAt);
  const inWindow=(date:Date,window:Window)=>date>=new Date(window.start)&&date<new Date(window.end);
  const duration=(row:PreparationRow)=>(row.confirmedAt!.getTime()-row.createdAt.getTime())/HOUR;
  const completedInPeriod=confirmed.filter(row=>windows.some(window=>inWindow(row.confirmedAt!,window)));
  return {
    total:releases.length,
    branchPreparation:{
      requested:preparations.filter(row=>windows.some(window=>inWindow(row.createdAt,window))).length,
      unknown:preparations.filter(row=>currentIds.has(row.releaseId)&&(row.state==='unknown'||row.reconcileOnly&&['queued','running'].includes(row.state))).length,
      confirmation:{samples:completedInPeriod.length,medianHours:median(completedInPeriod.map(duration))},
      weeks:windows.map(window=>{const rows=confirmed.filter(row=>inWindow(row.confirmedAt!,window));return {...window,requested:preparations.filter(row=>inWindow(row.createdAt,window)).length,confirmation:{samples:rows.length,medianHours:median(rows.map(duration))}};}),
      definition:'Uma preparação por operação persistida; reenvios de transporte e consultas de recuperação não aumentam a contagem. Tempo em horas corridas da solicitação aceita à primeira confirmação local da referência e proteção, incluindo fila, espera e recuperação. Durações pertencem à semana da confirmação; medianas não são somáveis.',
      coverage:'Cobertura desde a adoção da preparação controlada. Branches anteriores e criadas fora deste fluxo não são reconstruídas. Sem confirmação/amostras não é duração zero. Sem metas definidas.',
    },
    stages:stageDefinitions.map(compositionStatus=>({...compositionStatus,count:releases.filter(release=>release.compositionStatus===compositionStatus.compositionStatus).length})),
    composition:{
      samples:ages.length,medianHours:median(ages),oldestHours:ages.length?ages.reduce((oldest,age)=>Math.max(oldest,age),0):null,
      buckets:bands.map(band=>({key:band.key,label:band.label,count:ages.filter(hours=>hours/24>=band.min&&hours/24<band.max).length})),
      definition:'Idade atual dos OPENs: horas corridas desde a criação até esta consulta. É trabalho ainda em composição, não duração de composições concluídas.',
    },
    weeks:windows.map(window=>({...window,
      created:scoped.filter(release=>release.createdAt>=new Date(window.start)&&release.createdAt<new Date(window.end)).length,
      compositionCompleted:{value:null,samples:0,unavailableReason:completedUnavailable},
      rejectionCycles:{value:null,unavailableReason:reworkUnavailable},
    })),
    rework:{available:false,total:null,
      categories:[{key:'qaRejection',label:'Ciclos após rejeição em QA'},{key:'hmlRejection',label:'Ciclos após rejeição em homologação'}].map(category=>({...category,total:null,weeks:windows.map(window=>({start:window.start,value:null})),unavailableReason:reworkUnavailable})),
      unavailableReason:reworkUnavailable,
    },
    notes:[
      'Estoque atual: releases de Sistemas não arquivados. Cada release é contada uma vez, independentemente de quantas Histórias possui; OPENs vazios entram no total sem filtro de Projeto.',
      'Projeto considera as Histórias atualmente associadas à release; uma release com Histórias de vários Projetos conta uma vez em cada recorte. Composição vazia não pertence ao recorte de um Projeto.',
      'Usuário considera autoria, ações humanas correlacionadas à release e participação humana nas Histórias atualmente associadas. Uma ação genérica no Sistema não inclui todas as suas releases. Usuário e Projeto se cruzam na release: a participação pode ocorrer em qualquer História de uma release compartilhada entre Projetos.',
      'Criações por semana usam a data de criação persistida, nos intervalos [início, fim) do dashboard, inclusive de Sistemas hoje arquivados. O recorte usa associação e participação atuais, sem reconstruir composições passadas.',
      'Idade em composição inclui espera e fins de semana; 7, 15 e 30 dias são períodos de 24 horas. Sem OPENs, mediana e maior idade ficam indisponíveis, não zero.',
      'QA, homologação, produção e rejeição ainda não possuem transições executáveis nesta versão. Os totais mostram registros existentes, sem simular execuções ou aprovações.',
      'Duração de composições concluídas e ciclos de retrabalho por rejeição ficam indisponíveis até a integração dos eventos reais. Editar, retirar ou transferir Histórias em OPEN não comprova uma rejeição.',
    ],
  };
}

/** Called inside the dashboard's repeatable-read transaction. */
export async function releaseDashboard(tx:Transaction,now:Date,windows:readonly Window[],filters:Filters={},snapshot?:readonly HierarchyItem[]){
  const items=snapshot??await tx.item.findMany({select:{id:true,kind:true,parentId:true,archived:true}});
  const releases=await tx.release.findMany({
    where:{createdAt:{lte:now},...(filters.systemId?{systemId:filters.systemId}:{})},
    select:{id:true,systemId:true,compositionStatus:true,createdById:true,createdAt:true,stories:{select:{storyId:true}}},
  });
  let participation:ParticipationEvent[]=[];
  if(filters.userId&&releases.length){
    const systemIds=[...new Set(releases.map(release=>release.systemId))];
    participation=await tx.historyEvent.findMany({
      where:{actorType:'human',actorId:filters.userId,timestamp:{lte:now},OR:[
        {itemId:{in:items.filter(item=>item.kind==='story').map(item=>item.id)}},
        {itemId:{in:systemIds},action:{startsWith:'RELEASE_'}},
      ]},
      select:{itemId:true,action:true,payload:true},
    });
  }
  const preparations=await tx.releaseBranchPreparation.findMany({where:{releaseId:{in:releases.map(row=>row.id)},createdAt:{lte:now}},select:{id:true,releaseId:true,state:true,reconcileOnly:true,createdAt:true,confirmedAt:true}});
  return computeReleaseDashboard({items,releases,participation,preparations},now,windows,filters);
}
