type Event={action:string;timestamp:Date;payload:unknown};
type Window={start:string;end:string;label:string;partial:boolean};
const median=(values:number[])=>{values.sort((a,b)=>a-b);const n=values.length;return n?n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2:null;};
export function qualityMetrics(events:readonly Event[],windows:readonly Window[]){
 const payload=(e:Event)=>e.payload as Record<string,unknown>;
 return {phases:['code_review','security_scan'].map(kind=>{
  const own=events.filter(e=>e.action.startsWith('QUALITY_')&&payload(e)?.kind===kind);
  const calculate=(list:readonly Event[])=>{
   const completed=list.filter(e=>e.action==='QUALITY_CHECK_COMPLETED'),finished=list.filter(e=>['QUALITY_CHECK_COMPLETED','QUALITY_CHECK_FAILED'].includes(e.action));
   const durations=finished.flatMap(e=>typeof payload(e).durationMs==='number'?[Number(payload(e).durationMs)/1000]:[]);
   return {requested:list.filter(e=>e.action==='QUALITY_CHECK_REQUESTED').length,passed:completed.filter(e=>payload(e).result==='passed').length,blocked:completed.filter(e=>payload(e).result==='blocked').length,failed:list.filter(e=>e.action==='QUALITY_CHECK_FAILED').length,retries:list.filter(e=>e.action==='QUALITY_CHECK_REQUESTED'&&payload(e).retry===true).length,corrections:list.filter(e=>e.action==='QUALITY_CORRECTION_REQUESTED').length,medianSeconds:median(durations),samples:durations.length,severities:Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW','INFO'].map(s=>[s,completed.reduce((sum,e)=>sum+Number((payload(e).severities as Record<string,number>|undefined)?.[s]||0),0)]))};
  };
  return {kind,label:kind==='code_review'?'CODE REVIEW':'SECURITY SCAN',total:calculate(own),weeks:windows.map(w=>({...w,...calculate(own.filter(e=>e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end)))}))};
 }),notes:['As quatro semanas e filtros globais são compartilhados com o dashboard. A coleta começa nesta versão; não há aprovações históricas inventadas.','Achados são ocorrências por verificação; o mesmo achado pode reaparecer em vários ciclos. Retentativa de transporte idempotente não é nova solicitação.','Duração mede processamento observado, sem espera na fila; mediana sem amostras aparece como Sem medição. Correção é o pedido explícito ao agente de codificação, não prova de resolução.','Code Review analisa o diff via modelo local. Security Scan inicial executa regras locais SAST e segredos; não mede SCA, licenças, imagens ou DAST. Qualquer achado ou análise incompleta impede o avanço.']};
}
