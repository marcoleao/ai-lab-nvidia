type Event={action:string;timestamp:Date;payload:unknown};
type Window={start:string;end:string;label:string;partial:boolean};
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n?n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2:null;};
const payload=(event:Event)=>event.payload&&typeof event.payload==='object'?event.payload as Record<string,unknown>:{};
const categories=[['draft','Draft'],['pipeline','Pipeline ausente, pendente ou reprovado'],['conflict','Conflitos'],['changed','Commit ou branches alterados'],['closed','MR encerrado'],['discussion','Discussões pendentes'],['checks','Aprovações e verificações do GitLab'],['access','Acesso, configuração ou escopo indisponível']] as const;
export function mergeMetrics(events:readonly Event[],windows:readonly Window[]){
 const calculate=(own:readonly Event[])=>{
  const completed=own.filter(e=>e.action==='MERGE_COMPLETED');
  const durations=completed.flatMap(e=>{const p=payload(e);return p.origin==='assistant'&&typeof p.durationMs==='number'?[p.durationMs/1000]:[];});
  return {requested:own.filter(e=>e.action==='MERGE_REQUESTED').length,manualRequested:null,completedAssistant:completed.filter(e=>payload(e).origin==='assistant').length,completedHuman:completed.filter(e=>payload(e).origin==='human').length,blocked:own.filter(e=>e.action==='MERGE_BLOCKED').length,failed:own.filter(e=>e.action==='MERGE_FAILED').length,medianSeconds:median(durations),samples:durations.length};
 };
 return {total:calculate(events),weeks:windows.map(w=>({...w,...calculate(events.filter(e=>e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end)))})),categories:categories.map(([key,label])=>{const count=(own:readonly Event[])=>own.filter(e=>e.action==='MERGE_BLOCKED'&&Array.isArray(payload(e).categories)&&(payload(e).categories as unknown[]).includes(key)).length;return {key,label,total:count(events),weeks:windows.map(w=>({start:w.start,value:count(events.filter(e=>e.timestamp>=new Date(w.start)&&e.timestamp<new Date(w.end)))}))};}),notes:[
  'Solicitações ao assistente são decisões humanas registradas no SDLC; reenvios idempotentes e reconciliações não contam como nova solicitação. A participação segue os filtros globais do dashboard.',
  'Merges feitos diretamente no GitLab são observados pelo serviço para MRs publicados pelo SDLC; autoria real é preservada. Solicitações iniciadas fora do SDLC não possuem coleta integrada e aparecem como Sem medição.',
  'Conclusões e bloqueios entram na semana do registro observado pelo SDLC. A duração usa o instante real de merge do GitLab, incluindo fila e espera desde o pedido ao assistente. Só conclusões do assistente com amostras fornecem mediana; medianas semanais não são somadas.',
  'Uma solicitação pode ter vários motivos de bloqueio; a soma das categorias não representa quantidade única de pedidos. Merge não equivale a revisão, testes, segurança, deploy ou conclusão da História. A coleta começa nesta versão e não reconstrói solicitações históricas.'
 ]};
}
