'use client';

import {useEffect, useState, type MouseEvent} from 'react';
import {Clock3, Layers3} from 'lucide-react';
import './release-metrics.css';

export type ReleaseMetricWeek={start:string;end:string;label:string;partial:boolean};
type Measurement={value:number|null;unavailableReason?:string};
export type ReleaseMetricsData={
 total:number;
 stages:{stage:'DRAFT'|'QA'|'HML'|'PRODUCTION'|'REJECTED';label:string;count:number}[];
 composition:{samples:number;medianHours:number|null;oldestHours:number|null;buckets:{key:string;label:string;count:number}[];definition:string};
 weeks:(ReleaseMetricWeek&{created:number;compositionCompleted:Measurement&{samples:number};rejectionCycles:Measurement})[];
 rework:{available:boolean;total:number|null;categories:{key:string;label:string;total:number|null;weeks:{start:string;value:number|null}[];unavailableReason?:string}[];unavailableReason?:string};
 notes:string[];
};

const number=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value);
const date=(value:string)=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'});
const stageNames={DRAFT:'Em composição',QA:'QA',HML:'Homologação',PRODUCTION:'Produção',REJECTED:'Rejeitadas'};
type ReleaseView='stages'|'composition'|'weekly';
const releaseViews:{key:ReleaseView;label:string}[]=[{key:'stages',label:'Etapas atuais'},{key:'composition',label:'Tempo em composição'},{key:'weekly',label:'Comparação semanal'}];
const viewFromSearch=(search:string):ReleaseView=>{const value=new URLSearchParams(search).get('releaseView');return value==='composition'||value==='weekly'?value:'stages';};
function viewHref(search:string,view:ReleaseView){
 const params=new URLSearchParams(search);
 if(view==='stages')params.delete('releaseView');else params.set('releaseView',view);
 const query=params.toString();
 return `${query?`?${query}`:''}#dashboard-releases`;
}

function MeasurementValue({value,unit,reason}:{value:number|null|undefined;unit?:string;reason?:string}){
 return value===null||value===undefined?<span className="release-metric-unavailable" title={reason}>Sem medição</span>:<>{number(value)}{unit?` ${unit}`:''}</>;
}

export default function ReleaseMetrics({data,weeks}:{data?:ReleaseMetricsData;weeks:ReleaseMetricWeek[]}){
 const [navigation,setNavigation]=useState<{view:ReleaseView;search:string}>({view:'stages',search:''});
 useEffect(()=>{
  const synchronize=()=>setNavigation({view:viewFromSearch(window.location.search),search:window.location.search});
  synchronize();
  window.addEventListener('popstate',synchronize);
  window.addEventListener('hashchange',synchronize);
  return()=>{window.removeEventListener('popstate',synchronize);window.removeEventListener('hashchange',synchronize);};
 },[data]);
 function navigate(event:MouseEvent<HTMLAnchorElement>,view:ReleaseView){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  const href=viewHref(window.location.search,view);
  if(`${window.location.search}${window.location.hash}`!==href)window.history.pushState(window.history.state,'',href);
  setNavigation({view,search:window.location.search});
 }
 if(!data)return <section id="dashboard-releases" className="panel release-metrics" aria-labelledby="release-metrics-title"><div className="dashboard-heading"><div><h2 id="release-metrics-title">Releases · composição e entrega</h2><p>Quantidade por etapa, tempo em composição e ciclos de retrabalho.</p></div><Layers3 size={24} aria-hidden="true"/></div><p className="release-metric-unavailable" role="status">Sem medição de releases nesta consulta. Use Atualizar para consultar novamente.</p></section>;
 const observedWeeks:ReleaseMetricsData['weeks']=data.weeks.length?data.weeks:weeks.map(week=>({...week,created:0,compositionCompleted:{value:null,samples:0},rejectionCycles:{value:null}}));
 const maximum=Math.max(1,...data.weeks.map(week=>week.created));
 const currentDrafts=data.stages.find(stage=>stage.stage==='DRAFT')?.count??data.composition.samples;
 const createdTotal=data.weeks.reduce((sum,week)=>sum+week.created,0);
 const compositionReason=data.weeks.find(week=>week.compositionCompleted.unavailableReason)?.compositionCompleted.unavailableReason;
 return <section id="dashboard-releases" className="release-metrics" aria-labelledby="release-metrics-title" data-testid="release-metrics">
  <div className="dashboard-heading"><div><h2 id="release-metrics-title">Releases · composição e entrega</h2><p>Este recorte usa os mesmos filtros de participação, Sistema e Projeto aplicados acima.</p></div><Layers3 size={24} aria-hidden="true"/></div>
  <nav className="release-metrics-views" aria-label="Visões dos indicadores de releases">{releaseViews.map(view=><a key={view.key} href={viewHref(navigation.search,view.key)} aria-current={navigation.view===view.key?'page':undefined} onClick={event=>navigate(event,view.key)}>{view.label}</a>)}</nav>
  {navigation.view==='stages'&&<div className="panel release-metrics-current">
   <div className="release-metrics-total"><div><h3>Quantidade atual por etapa</h3><p>Estado registrado das releases no momento da consulta.</p></div><p><strong data-testid="release-metrics-total">{number(data.total)}</strong><span>Total de releases</span></p></div>
   <ol className="release-metrics-stages" aria-label="Releases por etapa">
    {data.stages.map(stage=><li key={stage.stage} className={`release-metrics-stage release-metrics-stage-${stage.stage.toLowerCase()}`} data-testid={`release-metric-stage-${stage.stage}`}><span className="release-metrics-stage-label">{stageNames[stage.stage]||stage.label}</span><strong>{number(stage.count)}</strong><span className="release-metrics-stage-code">{stage.stage}</span></li>)}
   </ol>
   <p className="release-metrics-definition">As etapas refletem o estado registrado das releases. Esta contagem não executa testes em QA, homologação ou implantações.</p>
  </div>}
  {navigation.view==='composition'&&<div className="panel release-metrics-composition" aria-labelledby="release-composition-age-title">
   <div className="dashboard-heading"><div><h3 id="release-composition-age-title">Idade das releases em composição</h3><p>Tempo decorrido desde a criação das releases que continuam em DRAFT. Esta medida acompanha o trabalho ainda aberto.</p></div><Clock3 size={22} aria-hidden="true"/></div>
   <dl className="release-metrics-age-values"><div><dt>Mediana da idade atual</dt><dd data-testid="release-composition-median">{data.composition.samples===0?<span className="release-metric-no-samples">Sem amostras</span>:<MeasurementValue value={data.composition.medianHours} unit="h"/>}</dd></div><div><dt>Maior idade atual</dt><dd data-testid="release-composition-oldest">{data.composition.samples===0?<span className="release-metric-no-samples">Sem amostras</span>:<MeasurementValue value={data.composition.oldestHours} unit="h"/>}</dd></div><div><dt>Releases observadas</dt><dd>{number(data.composition.samples)}</dd></div></dl>
   {currentDrafts===0&&<p className="release-metrics-empty">Nenhuma release em DRAFT neste recorte.</p>}
   <dl className="release-metrics-age-buckets" aria-label="Releases em composição por faixa de idade">{data.composition.buckets.map((bucket,index)=><div key={bucket.key}><dt><i className={`release-metrics-age-${index}`} aria-hidden="true"/>{bucket.label}</dt><dd>{number(bucket.count)}</dd></div>)}</dl>
   <p className="dashboard-explanation">{data.composition.definition} O tempo de composição concluída é apresentado separadamente na comparação semanal.</p>
  </div>}
  {navigation.view==='weekly'&&<div className="panel release-metrics-weekly" aria-labelledby="release-metrics-weeks-title">
   <div className="dashboard-heading"><div><h3 id="release-metrics-weeks-title">Releases nas últimas 4 semanas</h3><p>Criação de releases e resultados do processo, semana a semana. A semana atual é parcial.</p></div></div>
   <p className="release-metrics-chart-label">Releases criadas por semana</p><div className="release-metrics-created-chart" aria-hidden="true">{data.weeks.map(week=><div key={week.start}><span>{week.label}{week.partial?' · parcial':''}</span><div className="release-metrics-created-track"><span style={{width:`${week.created/maximum*100}%`}}/></div><strong>{number(week.created)}</strong></div>)}</div>
   <p className="release-metrics-scroll-hint">Deslize a tabela para comparar todas as semanas e o total.</p>
   <div className="table-wrap" tabIndex={0} role="region" aria-label="Indicadores de releases por semana"><table className="weekly-table release-metrics-table"><caption className="sr-only">Criação, composição concluída e ciclos de rejeição de releases nas últimas quatro semanas</caption><thead><tr><th scope="col">Indicador</th>{observedWeeks.map(week=><th scope="col" key={week.start}>{week.label}<span>{date(week.start)} a {date(new Date(new Date(week.end).getTime()-1).toISOString())}</span>{week.partial&&<small>PARCIAL</small>}</th>)}<th scope="col">Período</th></tr></thead><tbody>
    <tr><th scope="row">Releases criadas</th>{observedWeeks.map(week=><td key={week.start}><MeasurementValue value={data.weeks.find(item=>item.start===week.start)?.created}/></td>)}<td><strong><MeasurementValue value={data.weeks.length?createdTotal:null}/></strong></td></tr>
    <tr><th scope="row">Mediana da composição concluída<span className="release-metrics-row-description">Da criação ao encerramento da composição, em horas.</span></th>{observedWeeks.map(week=><td key={week.start}><MeasurementValue value={week.compositionCompleted.value} unit="h" reason={week.compositionCompleted.unavailableReason}/></td>)}<td><span className="release-metrics-not-additive">Não somável</span></td></tr>
    <tr><th scope="row">Ciclos por rejeição<span className="release-metrics-row-description">Nova composição exigida após uma rejeição.</span></th>{observedWeeks.map(week=><td key={week.start}><MeasurementValue value={week.rejectionCycles.value} reason={week.rejectionCycles.unavailableReason}/></td>)}<td><MeasurementValue value={data.rework.total} reason={data.rework.unavailableReason}/></td></tr>
    {data.rework.categories.map(category=><tr key={category.key}><th scope="row">{category.label}</th>{observedWeeks.map(week=><td key={week.start}><MeasurementValue value={category.weeks.find(item=>item.start===week.start)?.value} reason={category.unavailableReason}/></td>)}<td><MeasurementValue value={category.total} reason={category.unavailableReason}/></td></tr>)}
   </tbody></table></div>
   {compositionReason&&<p className="dashboard-explanation"><strong>Composição concluída:</strong> {compositionReason}</p>}
   {data.rework.unavailableReason&&<p className="dashboard-explanation"><strong>Ciclos por rejeição:</strong> {data.rework.unavailableReason}</p>}
   <p className="release-metrics-definition">Zero indica uma contagem observada sem ocorrências. “Sem medição” indica ausência de coleta ou de evidência suficiente. Ajustar uma composição em DRAFT não é contado como retrabalho por rejeição.</p>
  </div>}
  {data.notes.length>0&&<details className="release-metrics-notes"><summary>Como interpretar os indicadores de releases</summary><ul>{data.notes.map(note=><li key={note}>{note}</li>)}</ul></details>}
 </section>;
}
