// Synthetic opt-in qualification; generated responses are data and never run.
import fs from 'node:fs/promises';
import {reviewReferenceMessages} from '/app/apps/api/src/agent-context.ts';
const config=JSON.parse(await fs.readFile('/request/config.json','utf8'));
const source=await fs.readFile('/app/apps/api/src/quality.ts','utf8');
const instructions=source.match(/content:'(Você é o agente de CODE REVIEW\..*?)'},\.\.\.reference/s)?.[1];
if(!instructions)throw Error('Current review instructions not found');
const finding={type:'object',additionalProperties:false,required:['path','line','severity','message'],properties:{path:{type:'string'},line:{type:'integer',minimum:1},severity:{type:'string',enum:['CRITICAL','HIGH','MEDIUM','LOW','INFO']},message:{type:'string'}}};
const schema={type:'object',additionalProperties:false,required:['summary','findings','recommendations'],properties:{summary:{type:'string'},findings:{type:'array',items:finding},recommendations:{type:'array',items:finding}}};
const goodPrice="new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}).format(price).replace('.', ',')";
const goodUrl="!url || url.startsWith('http://') || url.startsWith('https://')";
const fixtures=[
 {id:'current-valid',price:goodPrice,url:goodUrl,expected:[]},
 {id:'invalid-format-method',price:"new Intl.NumberFormat('pt-BR').replace('.', ',').format(price)",url:goodUrl,expected:[1]},
 {id:'rejects-http-svg',price:goodPrice,url:"!url || /^https:\\/\\/.+\\.(png|jpg)$/.test(url)",expected:[2]},
 {id:'historical-failure-fixed',price:goodPrice,url:goodUrl,history:true,expected:[]}
];
const report={model:config.model,synthetic:true,applicationDataUsed:false,thinking:config.thinking===true,temperature:0.2,contextTokens:32768,cases:[]};
for(const fixture of fixtures){
 const content=`export function priceLabel(price) { return 'R$ ' + ${fixture.price}; }\nexport function acceptsPhoto(url) { return ${fixture.url}; }\nexport function row(item) { return {price:priceLabel(item.price),photoAccepted:acceptsPhoto(item.photo)}; }`;
 const snapshot={name:'Synthetic display correction',criteria:['Exibir preço zero como R$ 0,00 e 199.9 como R$ 199,90.','Aceitar URL HTTP/HTTPS de foto, inclusive SVG e parâmetros de consulta.'],requirements:{objective:'Corrigir apresentação e fotos.',behavior:fixture.history?'Na versão anterior havia R$ 0.00 e SVG HTTP era recusado. Esses são os passos de reprodução históricos; avaliar a implementação atual.':'Apresentar preços BRL e aceitar fotos HTTP/HTTPS.'}};
 const reference=reviewReferenceMessages(snapshot,{}, {sha:'b'.repeat(40),baseSha:'a'.repeat(40),files:[{path:'display.js',content}],changes:[{path:'display.js',content,diff:''}]});
 const started=Date.now();let result;
 try{
  const response=await fetch(config.upstream+'/api/chat',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:config.model,messages:[{role:'system',content:instructions},...reference],stream:false,think:config.thinking===true,format:schema,keep_alive:60,options:{num_ctx:32768,num_predict:config.thinking?4096:2048,temperature:0.2}})});
  if(!response.ok)throw Error('Local inference HTTP '+response.status);const raw=await response.json();
  await fs.writeFile('/reports/'+fixture.id+'-private.json',JSON.stringify(raw));
  if(raw.done!==true||raw.done_reason==='length')throw Error('Incomplete output');const output=JSON.parse(raw.message.content);
  const lines=output.findings.map(f=>f.line),passed=fixture.expected.length?fixture.expected.every(line=>lines.includes(line))&&output.findings.every(f=>f.path==='display.js'&&fixture.expected.includes(f.line)):output.findings.length===0;
  result={id:fixture.id,passed,expectedDefectLines:fixture.expected,observedDefectLines:lines,elapsedMs:Date.now()-started};
 }catch(error){result={id:fixture.id,passed:false,error:error.message,elapsedMs:Date.now()-started};}
 report.cases.push(result);process.stdout.write(JSON.stringify(result)+'\n');
}
report.passed=report.cases.every(row=>row.passed);await fs.writeFile('/reports/result.json',JSON.stringify(report));
if(!report.passed)process.exitCode=1;
