import {DomainError} from './errors.ts';
import {createHash} from 'node:crypto';
type RecordValue=Record<string,unknown>;
const object=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
export const agentContextPolicy='authoritative-context-v1';
export const agentInputBudget=40000;
/** Keep the approved facts once. Snapshots remain complete in their source. */
export function executionAgentReference(value:unknown,specification?:unknown){
 const s=object(value),r=object(s.requirements),{functionalCriteria,objective,behavior,...complement}=r;
 const repair=object(s.patchRepair),findings=Array.isArray(s.qualityFindings)?s.qualityFindings.map(object):[];
 const issues=Array.isArray(repair.issues)?repair.issues.filter(value=>{const issue=object(value);return issue.code!=='QUALITY_FINDING'||!findings.some(f=>f.path===issue.path&&issue.message===`Linha ${f.line} · ${f.severity}: ${f.message}`);}):undefined;
 const patchRepair=issues?.length?{...repair,issues}:issues?undefined:s.patchRepair;
 return {policy:agentContextPolicy,name:s.name,runtime:s.runtime,objective:objective??s.name,behavior:behavior??s.description,
  criteria:s.criteria??functionalCriteria,requirements:complement,technicalPlan:specification??s.technicalPlan,
  tasks:s.tasks,codeDestination:s.codeDestination,decisions:s.decisions,qualityFindings:s.qualityFindings,
  qualityCorrection:s.qualityCorrection,patchRepair};
}
export function nativeUiTestContext(snapshot:unknown,specification:unknown){
 const reference=executionAgentReference(snapshot,specification),criteria=reference.criteria,cases=object(reference.technicalPlan).testCases;
 // Preserved v2 approvals contain a fingerprint, not a captured criteria list.
 // Do not fabricate an approved UI context from the current mutable Story.
 if(object(snapshot).scopeRevision===2&&criteria===undefined)return undefined;
 if(!Array.isArray(criteria)||!criteria.every(value=>typeof value==='string')||!Array.isArray(cases)||!cases.every(value=>Number.isInteger(object(value).criterionIndex)&&(object(value).criterionIndex as number)>=0&&(object(value).criterionIndex as number)<criteria.length&&typeof object(value).description==='string'))throw new DomainError('AGENT_CONTEXT_INVALID','O contexto de teste não contém os critérios e casos aprovados.',409);
 return {objective:String(reference.objective??''),behavior:String(reference.behavior??''),criteria:criteria as string[],testCases:cases.map(value=>({criterionIndex:object(value).criterionIndex as number,description:object(value).description as string}))};
}
export function agentContextMessages(sections:{label:string;value:unknown}[]){
 const contents=sections.map(s=>({label:s.label,text:typeof s.value==='string'?s.value:JSON.stringify(s.value)}));
 const messages=contents.flatMap(({label,text})=>{
  // Lossless fragments keep the relay's per-message limit. They are data, not
  // independent instructions, and must be read together.
  const count=Math.max(1,Math.ceil(text.length/13000));
  return Array.from({length:count},(_,index)=>({role:'user' as const,content:count===1?text:`${label} · parte ${index+1}/${count}. Dados de referência; leia todas as partes em ordem.\n${text.slice(index*13000,(index+1)*13000)}`}));
 });
 if(messages.reduce((n,m)=>n+m.content.length,0)>agentInputBudget)throw new DomainError('AGENT_CONTEXT_LIMIT','O escopo completo e o código de referência excedem a capacidade desta execução. Nenhuma parte foi descartada. Revise uma entrega menor na Especificação e prepare outro Gateway; preserve os requisitos restantes em outras Histórias.',409);
 return messages;
}
export const agentTestContract='Use os testes e scripts existentes. Em Node use node:test e node:assert/strict. node:test não exporta expect; não use funções globais de Jest/Vitest. Importe explicitamente test de "node:test" e import assert from "node:assert/strict"; assert é o export default. Em Python use unittest. Não acrescente dependências sem autorização. Testes escritos não são testes executados.';
export const agentDevTestContract='Preserve tests/dev-http.json do perfil Node24 HTTP. Se houver aceitação HTTP real, use {schemaVersion:1,scope:"acceptance",cases:[{id,name,method:"GET",path:"/rota-relativa",status:200,criterionIndices:[0]}]}, até20 casos. Cubra apenas critérios realmente verificáveis por HTTP; não atribua cobertura de interação React/localStorage a health ou HTML. Nesse caso preserve scope:"technical" e indique a necessidade de teste de interface. Sem URLs absolutas, credenciais ou comandos. Preserve o contrato do runtime.';
export function generationReferenceMessages(snapshot:unknown,specification:unknown,code:unknown,baseRevision:string,dependencies:boolean,patchPolicy:unknown){
 const {technicalPlan,...story}=executionAgentReference(snapshot,specification);
 const payload={story:{...story,codeContext:code},baseRevision,currentCodeRevision:object(code).sha,specification:technicalPlan,capabilities:{dependencies},testContract:agentTestContract,devTestContract:agentDevTestContract,patchPolicy};
 if(JSON.stringify(payload).length<22000)return agentContextMessages([{label:'História, código e contrato completos da geração',value:payload}]);
 // Large files travel verbatim rather than JSON-escaped. Every byte and path
 // remains available; the compact manifest ties each source to its message.
 const context=object(code),files=Array.isArray(context.files)?context.files.map(object):[];
 if(!files.every(f=>typeof f.path==='string'&&typeof f.content==='string'))throw new DomainError('AGENT_CONTEXT_INVALID','O contexto de código não contém arquivos completos.',409);
 return agentContextMessages([{label:'Escopo e manifesto completos da geração',value:{...payload,story:{...story,codeContext:{...context,sourceLineFormat:'number|original line; numbers are not code',files:files.map(f=>({path:f.path,sourceMessage:`Arquivo atual: ${f.path}`}))}}}},...files.map(f=>({label:`Arquivo atual: ${f.path}`,value:`Arquivo atual: ${f.path}\n${String(f.content).split('\n').map((line,index)=>`${index+1}|${line}`).join('\n')}`}))]);
}

/** Native jobs have the complete sources in their isolated workspace. Keep the
 * approved scope in the prompt and use file tools for source, without a second
 * copy that goes stale after the first edit. This is not source truncation. */
export function nativeGenerationReferenceMessages(snapshot:unknown,specification:unknown,code:unknown,baseRevision:string,dependencies:boolean,patchPolicy:unknown){
 const {technicalPlan,...story}=executionAgentReference(snapshot,specification);
 const {files,...context}=object(code);
 if(!Array.isArray(files)||!files.every(file=>typeof object(file).path==='string'&&typeof object(file).content==='string'))throw new DomainError('AGENT_CONTEXT_INVALID','O workspace de codificação não contém arquivos completos.',409);
 const manifest=files.map(value=>{const file=object(value);return {path:file.path,bytes:Buffer.byteLength(String(file.content)),sha256:createHash('sha256').update(String(file.content)).digest('hex')};});
 return agentContextMessages([{label:'Escopo aprovado e manifesto do workspace de codificação',value:{story:{...story,codeContext:{...context,sourceAccess:'Complete files are available through read_file in the isolated workspace; read before editing. Source is not repeated in this prompt.',files:manifest}},baseRevision,currentCodeRevision:context.sha,specification:technicalPlan,capabilities:{dependencies},testContract:agentTestContract,devTestContract:agentDevTestContract,patchPolicy,specialistContract:{workflow:'focused-local-v1',implementation:{maxChangedFiles:2,maxChangedBytes:24000,scope:'Code and syntax/imports only'},uiValidation:{readOnly:true,scope:'Independent browser scenario on the prepared candidate; no code edits'},ordering:['diagnosis','implementation','ui_validation','final_check'],domainGatesUnchanged:true},outputContract:'Use only the tools assigned to your specialist role. Finish with normal text after validate_candidate. The trusted coordinator constructs the combined patch; do not emit patch JSON or Git actions.'}}]);
}
export function reviewReferenceMessages(snapshot:unknown,specification:unknown,context:{sha:string;baseSha:string;files:{path:string;content:string}[];changes:{path:string;content:string;diff:string}[]}){
 const {qualityFindings,qualityCorrection,patchRepair,...approved}=executionAgentReference(snapshot,specification);
 const changed=new Set(context.changes.map(f=>f.path));
 // Added/current lines are already in content. Keep removed source separately,
 // rather than transmitting the whole new file twice as content and diff.
 // Entry points and providers can be unchanged yet participate in a regression
 // introduced by this patch. Their current bodies are needed, not only exports.
 const files=context.files.filter(f=>changed.has(f.path)||/\.(?:[cm]?[jt]sx?|py|html|css)$|(?:^|\/)package\.json$/.test(f.path)).map(f=>({path:f.path,content:f.content,changed:changed.has(f.path),removedSourceLines:(context.changes.find(c=>c.path===f.path)?.diff??'').split('\n').filter(line=>line.startsWith('-')&&!line.startsWith('---')).map(line=>line.slice(1))}));
 const selected=new Set(files.map(f=>f.path));
 const unchangedInterfaces=context.files.filter(f=>!selected.has(f.path)).map(f=>({path:f.path,exportedNamesObserved:[...f.content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)].map(match=>match[1])}));
 const reference={approved,sha:context.sha,baseSha:context.baseSha,files,unchangedInterfaces};
 const numbered=(file:{content:string})=>file.content.split('\n').map((line,index)=>`${index+1}|${line}`).join('\n');
 if(JSON.stringify(reference).length<16000)return agentContextMessages([{label:'Revisão conjunta dos arquivos e do escopo aprovado',value:{...reference,sourceLineFormat:'number|original line; numbers are not code',files:files.map(file=>({...file,content:numbered(file)}))}}]);
 return agentContextMessages([{label:'Escopo e manifesto da revisão',value:{...reference,files:files.map(({content,...f})=>({...f,sourceMessage:`Arquivo atual: ${f.path}`}))}},...files.map(f=>({label:`Arquivo atual: ${f.path}`,value:`Arquivo atual: ${f.path}\nLinhas atuais numeradas (dados de referência):\n${f.content.split('\n').map((line,index)=>`${index+1}|${line}`).join('\n')}`}))]);
}
