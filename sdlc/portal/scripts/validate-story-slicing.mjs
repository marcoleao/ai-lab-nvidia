// Opt-in synthetic qualification. Model output is parsed as data, never executed.
import fs from 'node:fs/promises';
import {completePlan,planInstructions} from '/app/apps/api/src/plans.ts';
import {formalPlanInstructions} from '/app/apps/api/src/requirements.ts';
import {storySlicingInstructions} from '/app/apps/api/src/story-slicing.ts';
const config=JSON.parse(await fs.readFile('/request/config.json','utf8'));
const facts=[
 'Corrigir um catálogo existente, preservando funcionalidades e dados.',
 'Aceitar imagem por URL HTTP/HTTPS válida, incluindo SVG.',
 'Exibir preço zero como R$ 0,00.',
 'Renomear uma categoria existente preservando sua identidade e os vínculos das joias.',
 'Preservar a listagem que já atualiza após operações/recarregamento e explica resultados vazios, sem alterar filtros.',
 'Preservar os detalhes, edição com SKU estável, cancelamento, arquivamento e reativação já existentes.',
 'Manter persistência local versionada, aviso local, validações, pesquisa, teclado e celular.',
 'Três histórias pequenas e sequenciais, sem bibliotecas novas ou backend.'
];
let calls=0;
const llm={model:config.model,models:async()=>[config.model],complete:async(messages,options)=>{
 calls++;const response=await fetch(config.upstream+'/api/chat',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:options.signal,body:JSON.stringify({model:config.model,messages,stream:false,think:false,format:options.schema,keep_alive:60,options:{num_ctx:32768,num_predict:options.maxTokens,temperature:0.2}})});
 if(!response.ok)throw Error('Local model HTTP '+response.status);const value=await response.json();
 if(value.done!==true||value.done_reason==='length'||typeof value.message?.content!=='string')throw Error('Incomplete model result');
 const result={model:config.model,content:value.message.content};await fs.writeFile('/reports/attempt-'+calls+'-private.json',JSON.stringify(result));return result;
}};
const start=Date.now();let result;
try{
 const generated=await completePlan(llm,[{role:'system',content:planInstructions+'\n'+formalPlanInstructions+'\n'+storySlicingInstructions},{role:'user',content:'Resumo sintético confirmado, sem dados de aplicação real: '+JSON.stringify({confirmedFacts:facts,openQuestions:[],readyToPlan:true})+'\nGere três histórias corretivas independentes: validar imagem HTTP/HTTPS/SVG, apresentar preço zero e renomear uma categoria preservando vínculos. Cada história altera somente sua operação/resultado. As demais funcionalidades já existem e devem ser preservadas, sem reimplementação. Não crie outro sistema.'}],[],true,facts);
 const stories=generated.plan.epics.flatMap(e=>e.stories),coverage=new Set(stories.flatMap(s=>s.deliverySlice?.sourceFacts??[]));
 const positive=stories.length===3&&coverage.size===facts.length;
 await fs.writeFile('/reports/validated-plan-private.json',JSON.stringify(generated.plan));
 // A requested count must not force many independent operations into CRUD.
 const broad=['Construir do zero cadastro, consulta de detalhes, edição, arquivamento e reativação de joias.','Construir criação, renomeação e exclusão protegida de categorias.','Cada operação deve ser entregue e verificada em uma história própria; não omitir nenhuma.','O usuário exige exatamente uma história e não aceita recortar um primeiro incremento.'];
 let rejected=false,rejectionCode=null;
 try{await completePlan(llm,[{role:'system',content:planInstructions+'\n'+formalPlanInstructions+'\n'+storySlicingInstructions},{role:'user',content:'Fatos sintéticos confirmados: '+JSON.stringify(broad)+'\nProponha exatamente uma história para todo esse escopo. Se for incompatível com a política de uma operação/resultado por história, retorne error com a necessidade de recorte, sem plano parcial.'}],[],true,broad);}catch(error){rejectionCode=error.code;rejected=error.code==='INTERVIEW_INCOMPLETE';}
 result={model:config.model,passed:positive&&rejected,scenario:'three-independent-corrections-and-overbroad-refusal',stories:stories.length,factReferencesCovered:coverage.size,overbroadCountRejected:rejected,rejectionCode,inferenceCalls:calls,elapsedMs:Date.now()-start,temperature:0.2,contextTokens:32768,scope:'Structural references and explicit refusal only; not semantic approval or business acceptance'};
}catch(error){result={model:config.model,passed:false,inferenceCalls:calls,elapsedMs:Date.now()-start,code:error.code??'QUALIFICATION_FAILED',message:error.message,diagnostics:error.details??null};}
await fs.writeFile('/reports/result.json',JSON.stringify(result));process.stdout.write(JSON.stringify(result)+'\n');if(!result.passed)process.exitCode=1;
