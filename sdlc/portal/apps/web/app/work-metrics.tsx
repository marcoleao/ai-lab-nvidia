'use client';
import {useState} from 'react';

type Duration={value:number|null;samples:number;unit:'seconds';unavailableReason?:string};
type Counts={queue:Duration;processing:Duration;humanWait:Duration;impedimentResolution:Duration;resumedAfterFailure:number;tasksLinked:number;tasksReopened:number;reopenOccurrences:number;resolvedImpediments:number};
type Week=Counts&{start:string;end:string;label:string;partial:boolean};
export type WorkMetricsData={total:Counts;weeks:Week[];linkage:{linked:number;tasks:number;rate:number|null;unit:'percent';unavailableReason?:string};impedimentCategories:{key:string;label:string;total:Duration;weeks:(Duration&{start:string})[]}[];observedAttempts:number;notes:string[]};
const number=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value);
function DurationValue({data}:{data:Duration}){return data.value===null?<span className="metric-unavailable" title={data.unavailableReason}>Sem medição</span>:<><strong>{number(data.value)} s</strong><span className="rework-description">{data.samples} {data.samples===1?'amostra':'amostras'}</span></>;}

export default function WorkMetrics({data}:{data?:WorkMetricsData}){
 const [view,setView]=useState<'times'|'impediments'|'tasks'>('times');
 if(!data)return <section id="dashboard-activities" className="panel"><h2>Atividades e Tarefas</h2><p className="metric-unavailable" role="status">Sem medição de atividades nesta consulta. Use Atualizar para consultar novamente.</p></section>;
 const durationRows:[string,keyof Pick<Counts,'queue'|'processing'|'humanWait'|'impedimentResolution'>][]=[['Espera em fila','queue'],['Processamento da tentativa','processing'],['Espera humana resolvida','humanWait'],['Resolução de impedimentos','impedimentResolution']];
 const taskRows:[string,keyof Pick<Counts,'resumedAfterFailure'|'tasksLinked'|'tasksReopened'|'reopenOccurrences'>][]=[['Retomadas após falhas','resumedAfterFailure'],['Tarefas vinculadas pela primeira vez','tasksLinked'],['Tarefas distintas reabertas','tasksReopened'],['Ocorrências de reabertura','reopenOccurrences']];
 const title=view==='times'?'Tempos das atividades':view==='impediments'?'Resolução de impedimentos por categoria':'Tarefas e retomadas';
 return <section id="dashboard-activities" className="panel" aria-labelledby="activities-title">
  <div className="dashboard-heading"><div><h2 id="activities-title">Atividades e Tarefas</h2><p>Fila, processamento, decisões e retomadas nas últimas quatro semanas, a partir dos registros reais das atividades.</p></div></div>
  {!data.observedAttempts&&<p className="alert" role="status">Ainda não há tentativas instrumentadas neste recorte. A coleta começa nesta versão; o histórico anterior não foi reconstruído.</p>}
  <nav className="actions" aria-label="Visões das métricas de atividades">{([{key:'times',label:'Tempos'},{key:'impediments',label:'Impedimentos'},{key:'tasks',label:'Tarefas e retomadas'}] as const).map(option=><button key={option.key} type="button" aria-pressed={view===option.key} onClick={()=>setView(option.key)}>{option.label}</button>)}</nav>
  <h3>{title}</h3>
  {view==='tasks'&&<p className="dashboard-explanation"><strong>Vinculação atual: {data.linkage.rate===null?'Sem medição':`${number(data.linkage.rate)}%`}</strong> · {number(data.linkage.linked)} de {number(data.linkage.tasks)} Tarefas ativas vinculadas a atividades.{data.linkage.unavailableReason?` ${data.linkage.unavailableReason}`:' A comparação semanal abaixo mostra quando a primeira vinculação foi registrada.'}</p>}
  {view==='impediments'&&!data.impedimentCategories.length?<p className="metric-unavailable" role="status">Nenhum impedimento com duração de resolução registrada neste período. Impedimentos ainda abertos não entram na mediana.</p>:<>
   <p className="dashboard-scroll-hint">Deslize a tabela para comparar todas as semanas. A semana atual é parcial.</p>
   <div className="table-wrap" tabIndex={0} role="region" aria-label={title}><table className="weekly-table"><caption className="sr-only">{title}, comparação de quatro semanas</caption><thead><tr><th scope="col">{view==='impediments'?'Categoria':'Indicador'}</th>{data.weeks.map(week=><th scope="col" key={week.start}>{week.label}{week.partial&&<small>PARCIAL</small>}</th>)}<th scope="col">Período completo</th></tr></thead><tbody>
    {view==='times'&&durationRows.map(([label,key])=><tr key={key}><th scope="row">{label}<span className="rework-description">Mediana em segundos</span></th>{data.weeks.map(week=><td key={week.start}><DurationValue data={week[key]}/></td>)}<td><DurationValue data={data.total[key]}/></td></tr>)}
    {view==='impediments'&&data.impedimentCategories.map(category=><tr key={category.key}><th scope="row">{category.label}<span className="rework-description">Mediana em segundos</span></th>{data.weeks.map(week=>{const value=category.weeks.find(item=>item.start===week.start);return <td key={week.start}>{value?<DurationValue data={value}/>:<span className="metric-unavailable">Sem medição</span>}</td>;} )}<td><DurationValue data={category.total}/></td></tr>)}
    {view==='tasks'&&taskRows.map(([label,key])=><tr key={key}><th scope="row">{label}</th>{data.weeks.map(week=><td key={week.start}>{number(week[key])}</td>)}<td><strong>{number(data.total[key])}</strong></td></tr>)}
   </tbody></table></div>
  </>}
  <details><summary>Fontes, amostras e regras de cálculo</summary><ul>{data.notes.map(note=><li key={note}>{note}</li>)}</ul></details>
 </section>;
}
