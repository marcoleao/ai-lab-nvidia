'use client';
import {useState} from 'react';
type Counts={requested:number;passed:number;blocked:number;failed:number;retries:number;corrections:number;medianSeconds:number|null;samples:number;severities:Record<string,number>};
export type QualityMetricsData={phases:{kind:string;label:string;total:Counts;weeks:(Counts&{start:string;label:string;partial:boolean})[]}[];notes:string[]};
export default function QualityMetrics({data}:{data?:QualityMetricsData}){
 const [kind,setKind]=useState('code_review');
 if(!data)return <p>Sem medição de verificações nesta consulta.</p>;
 const phase=data.phases.find(p=>p.kind===kind)!;
 const rows:[string,keyof Omit<Counts,'samples'|'severities'>][]=[['Solicitações','requested'],['Aprovadas','passed'],['Reprovadas por achados','blocked'],['Falhas ou análise inválida','failed'],['Novas verificações após a primeira','retries'],['Ciclos de correção solicitados','corrections'],['Duração mediana (segundos)','medianSeconds']];
 const format=(n:number|null)=>n===null?'Sem medição':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n);
 return <div className="panel" aria-label="Métricas das verificações"><h3>Qualidade antes do merge</h3><div className="actions">{data.phases.map(p=><button key={p.kind} type="button" aria-pressed={p.kind===kind} onClick={()=>setKind(p.kind)}>{p.label}</button>)}</div><div className="table-wrap" tabIndex={0} role="region" aria-label={`Métricas de ${phase.label}`}><table className="weekly-table"><caption className="sr-only">Verificações e achados nas últimas quatro semanas</caption><thead><tr><th>Indicador</th>{phase.weeks.map(w=><th key={w.start}>{w.label}{w.partial&&<small>PARCIAL</small>}</th>)}<th>Total do período</th></tr></thead><tbody>{rows.map(([label,key])=><tr key={key}><th scope="row">{label}</th>{phase.weeks.map(w=><td key={w.start}>{format(w[key])}</td>)}<td>{format(phase.total[key])}</td></tr>)}{['CRITICAL','HIGH','MEDIUM','LOW','INFO'].map(severity=><tr key={severity}><th scope="row">Achados · {severity}</th>{phase.weeks.map(w=><td key={w.start}>{w.severities[severity]||0}</td>)}<td>{phase.total.severities[severity]||0}</td></tr>)}</tbody></table></div><details><summary>Como interpretar qualidade e achados</summary><ul>{data.notes.map(n=><li key={n}>{n}</li>)}</ul></details></div>;
}
