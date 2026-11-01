'use client';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import type {AiTestContext,AiTestOperation} from '../../../packages/shared/src/development-ai-test';
import useOperation from './release-operation';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import {storyExecutionHref} from './story-execution-navigation';
import './development-ai-test.css';

export type AiAdjustmentSuggestion={id:string;storyId:string;storyVersion:number;referenceDigest:string;deploymentId:string;sourceSha:string;text:string};
type Props={storyId:string;storyVersion:number;persona:string;active:boolean;readOnly:boolean;stale:boolean;onRefresh:()=>void;onPendingChange:(value:boolean)=>void;onSuggestion:(value:AiAdjustmentSuggestion|null)=>void};
const states:Record<AiTestOperation['state'],string>={queued:'Na fila',running:'Testes em execução',succeeded:'Cenários executados sem falhas encontradas',failed:'Falhas encontradas na aplicação',inconclusive:'Bateria inconclusiva',unknown:'Resultado não confirmado',stale:'Versão testada desatualizada'};
const caseStates={passed:'Executado sem falha encontrada',failed:'Falha funcional confirmada',not_tested:'Não verificado'};
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function isAiTestOperation(v:unknown,id:string):v is AiTestOperation{
 if(!v||typeof v!=='object')return false;const o=v as AiTestOperation;
 return o.storyId===id&&text(o.id)&&text(o.referenceDigest)&&text(o.sourceSha)&&text(o.deploymentId)&&Number.isSafeInteger(o.version)&&o.version>0&&Object.hasOwn(states,o.state)&&text(o.stage)&&text(o.message)&&date(o.createdAt)&&date(o.updatedAt)&&(o.finishedAt===null||date(o.finishedAt))&&typeof o.actorName==='string'&&o.completeAcceptance===false&&(o.adjustments===null||text(o.adjustments)&&o.adjustments.length<=2000)&&Array.isArray(o.cases)&&o.cases.every(c=>!!c&&typeof c==='object')&&new Set(o.cases.map(c=>c.index)).size===o.cases.length&&o.cases.every(c=>Number.isSafeInteger(c.index)&&c.index>=0&&text(c.title)&&Object.hasOwn(caseStates,c.status)&&text(c.code)&&Number.isSafeInteger(c.steps)&&c.steps>=0&&Array.isArray(c.evidence)&&c.evidence.every(file=>['initial.png','final.png','report.json'].includes(file)))&&(!o.adjustments||o.state==='failed'&&o.cases.some(c=>c.status==='failed'))&&(o.state!=='succeeded'||!!o.finishedAt&&o.cases.length>0&&o.cases.every(c=>c.status==='passed'))&&(o.state!=='failed'||!!o.finishedAt&&o.cases.some(c=>c.status==='failed'));
}
export function isAiTestContext(v:unknown,id:string):v is AiTestContext{
 if(!v||typeof v!=='object')return false;const c=v as AiTestContext;
 return c.storyId===id&&Number.isSafeInteger(c.storyVersion)&&c.storyVersion>0&&text(c.referenceDigest)&&(c.url===null||text(c.url))&&(c.deploymentId===null||text(c.deploymentId))&&(c.sourceSha===null||text(c.sourceSha))&&typeof c.configured==='boolean'&&typeof c.allowed==='boolean'&&Array.isArray(c.blockers)&&c.blockers.every(text)&&text(c.token)&&date(c.asOf)&&(c.operation===null||isAiTestOperation(c.operation,id))&&(!c.allowed||c.configured&&!!safeUrl(c.url)&&text(c.deploymentId)&&text(c.sourceSha));
}
function safeUrl(v:string|null){try{const u=new URL(v||'');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function newer(previous:AiTestOperation|null,incoming:AiTestOperation|null){if(!incoming)return previous;if(!previous)return incoming;if(incoming.id===previous.id)return incoming.version>=previous.version?incoming:previous;return Date.parse(incoming.createdAt)>=Date.parse(previous.createdAt)?incoming:previous;}

export default function DevelopmentAiTest({storyId,storyVersion,persona,active,readOnly,stale,onRefresh,onPendingChange,onSuggestion}:Props){
 const router=useRouter(),search=useSearchParams(),selectedId=search.get('aiTest');
 const base=`/items/${encodeURIComponent(storyId)}/development-ai-test`,storage=`sdlc-ai-tests:${storyId}`;
 const [reading,setReading]=useState<AiTestContext|null>(null),[known,setKnown]=useState<AiTestOperation|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[restored,setRestored]=useState(false);
 const [historical,setHistorical]=useState<{operation:AiTestOperation;current:boolean}|null>(null),[historicalError,setHistoricalError]=useState(''),[historicalLoading,setHistoricalLoading]=useState(false);
 const refs=useRef({onRefresh,onPendingChange,onSuggestion});refs.current={onRefresh,onPendingChange,onSuggestion};
 const latestOperation=newer(known,reading?.operation??null),operation=selectedId?(historical?.operation.id===selectedId?historical.operation:null):latestOperation,working=!!latestOperation&&['queued','running'].includes(latestOperation.state);
 const op=useOperation(`development-ai-test:${storyId}`,persona,value=>{if(isAiTestOperation(value.operation,storyId))setKnown(previous=>newer(previous,value.operation));setRefresh(n=>n+1);refs.current.onRefresh();if(selectedId)router.replace(storyExecutionHref(storyId,'ai-tests'),{scroll:false});},{retryLabel:'Verificar recebimento dos testes por IA',onRejected:()=>{setRefresh(n=>n+1);refs.current.onRefresh();}});
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storage)||'{}');if(isAiTestOperation(saved.operation,storyId))setKnown(saved.operation);}catch{}setRestored(true);},[storage,storyId]);
 useEffect(()=>{if(restored&&latestOperation)try{sessionStorage.setItem(storage,JSON.stringify({operation:latestOperation}));}catch{}},[restored,storage,latestOperation]);
 useEffect(()=>{refs.current.onPendingChange(!!op.pending);return()=>refs.current.onPendingChange(false);},[!!op.pending]);
 useEffect(()=>{
  if(!restored||!active&&!working)return;let alive=true,timer:ReturnType<typeof setTimeout>|undefined,abort:AbortController|undefined;
  async function poll(){abort=new AbortController();setLoading(true);
   try{const response=await fetch('/api'+base,{cache:'no-store',signal:abort.signal,headers:{'X-Persona':persona}}),value=await response.json();if(!response.ok)throw Error(value.error?.message||'Não foi possível consultar os testes por IA.');if(!isAiTestContext(value,storyId))throw Error('A leitura dos testes por IA está incompleta ou pertence a outro contexto.');if(!alive)return;setReading(value);setKnown(previous=>newer(previous,value.operation));setError('');if(!value.allowed)refs.current.onSuggestion(null);}
   catch(failure){if(alive&&!abort.signal.aborted){setError(failure instanceof Error?failure.message:'Consulta dos testes por IA não confirmada.');refs.current.onSuggestion(null);}}
   finally{if(alive){setLoading(false);timer=setTimeout(poll,4000);}}
  }
  void poll();return()=>{alive=false;abort?.abort();if(timer)clearTimeout(timer);};
 },[active,working,restored,base,storyId,persona,refresh]);
 useEffect(()=>{
  if(!active||!selectedId)return;const abort=new AbortController();setHistoricalLoading(true);setHistoricalError('');refs.current.onSuggestion(null);
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(selectedId)){setHistoricalError('A referência desta bateria não é válida.');setHistoricalLoading(false);return;}
  fetch('/api'+base+'/'+encodeURIComponent(selectedId),{cache:'no-store',signal:abort.signal,headers:{'X-Persona':persona}}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error?.message||'Não foi possível consultar esta bateria.');if(!isAiTestOperation(value.operation,storyId)||value.operation.id!==selectedId||typeof value.current!=='boolean')throw Error('A bateria consultada não corresponde à referência solicitada.');return value;}).then(value=>{if(!abort.signal.aborted)setHistorical(value);}).catch(failure=>{if(!abort.signal.aborted)setHistoricalError(failure instanceof Error?failure.message:'Consulta desta bateria não confirmada.');}).finally(()=>{if(!abort.signal.aborted)setHistoricalLoading(false);});
  return()=>abort.abort();
 },[active,selectedId,base,storyId,persona,refresh,selectedId===reading?.operation?.id?reading?.operation?.version:null]);
 const current=!!reading&&!error&&!stale&&reading.storyVersion===storyVersion&&(!latestOperation||latestOperation.referenceDigest!==reading.referenceDigest||reading.operation?.id===latestOperation.id),operationCurrent=current&&(!selectedId||historical?.current===true&&!historicalError&&!historicalLoading)&&operation?.referenceDigest===reading.referenceDigest&&operation?.deploymentId===reading.deploymentId&&operation?.sourceSha===reading.sourceSha;
 const available=current&&reading.allowed&&!readOnly&&!working&&!op.pending&&!op.busy;
 const suggestion=operationCurrent&&reading?.allowed&&!readOnly&&operation?.state==='failed'&&operation.adjustments?{id:operation.id,storyId,storyVersion:reading.storyVersion,referenceDigest:operation.referenceDigest,deploymentId:operation.deploymentId,sourceSha:operation.sourceSha,text:operation.adjustments}:null;
 const suggestionKey=suggestion?JSON.stringify(suggestion):'';
 useEffect(()=>{refs.current.onSuggestion(suggestion);return()=>refs.current.onSuggestion(null);},[suggestionKey]);
 const passed=operation?.cases.filter(c=>c.status==='passed').length??0,failed=operation?.cases.filter(c=>c.status==='failed').length??0,notTested=operation?.cases.filter(c=>c.status==='not_tested').length??0;
 const url=current?safeUrl(reading?.url??null):null;
 return <section hidden={!active} className="panel development-ai-test" aria-label="Testes por Agentes de IA" data-testid="development-ai-test">
  <h2 tabIndex={-1}>Testes por Agentes de IA</h2>
  <p>Os agentes exercitam a versão publicada em DEV em uma nova sessão de navegador, usando a especificação e os critérios da História. Os resultados ajudam sua decisão; a aprovação continua humana.</p>
  {op.feedback}{loading&&!reading&&<LoadingState>Consultando versão DEV e testes por IA…</LoadingState>}
  {error&&<ErrorState onRetry={()=>setRefresh(n=>n+1)}>{error}{reading&&<p>A última leitura, de {displayDate(reading.asOf)}, foi preservada. Aguarde uma consulta confirmada antes de iniciar ou usar sugestões.</p>}</ErrorState>}
  {stale&&<p className="alert">A situação atual da História não foi confirmada. As evidências anteriores permanecem em consulta.</p>}
  {selectedId&&<p><strong>Bateria consultada: <code>{selectedId}</code>.</strong> <Link href={storyExecutionHref(storyId,'ai-tests')}>Voltar à bateria atual</Link></p>}
  {selectedId&&historicalLoading&&!operation&&<LoadingState>Consultando a bateria selecionada…</LoadingState>}{historicalError&&<ErrorState onRetry={()=>setRefresh(n=>n+1)}>{historicalError} O resultado anterior permanece em consulta, sem autorizar uma decisão nesta versão.</ErrorState>}
  {reading&&<><p className="hint">Consulta em {displayDate(reading.asOf)}.</p>{url&&<p><a href={url} target="_blank" rel="noreferrer">Abrir aplicação em DEV ↗</a></p>}
   <details><summary>Versão conferida para os testes</summary><p>Implantação <code>{reading.deploymentId||'não confirmada'}</code> · fonte <code>{reading.sourceSha||'não confirmada'}</code>.</p></details>
   {reading.blockers.length>0&&<div className="alert"><strong>Novos testes indisponíveis</strong><ul>{reading.blockers.map((message,i)=><li key={i}>{message}</li>)}</ul></div>}
  </>}
  {operation?<article aria-label="Resultado da bateria de testes por IA">
   <h3 aria-live="polite">{states[operation.state]}</h3><p>{operation.message}</p>{['queued','running'].includes(operation.state)&&operationCurrent&&<LoadingState>Etapa registrada: {operation.stage}. Aguarde a conclusão desta solicitação.</LoadingState>}
   <p className="hint">Solicitado por {operation.actorName} · atualizado em {displayDate(operation.updatedAt)}. Etapa: {operation.stage}.</p>
   {!operationCurrent&&<p className="alert">Esta evidência permanece preservada. Sua relação com a versão atual de DEV não está confirmada; não use suas sugestões para confirmar a versão atual.</p>}
   <p>{passed} cenário(s) executado(s) sem falha · {failed} com falha funcional · {notTested} não verificado(s).</p><p>O resultado não certifica o aceite integral da História. Casos não verificados e limitações permanecem sob avaliação humana.</p>
   <details><summary>Referência deste resultado</summary><p>Implantação <code>{operation.deploymentId}</code> · fonte <code>{operation.sourceSha}</code>.</p><Link href={storyExecutionHref(storyId,'ai-tests',new URLSearchParams({aiTest:operation.id}))}>Link desta evidência</Link></details>
   {operation.cases.length?<ol className="ai-test-cases" aria-label="Cenários da bateria">{operation.cases.map(c=><li key={c.index} data-state={c.status}><strong>{c.title}</strong>{c.status==='failed'?<ErrorState>{caseStates[c.status]} · {c.steps} ação(ões) registrada(s).</ErrorState>:<p>{caseStates[c.status]} · {c.steps} ação(ões) registrada(s).</p>}<details><summary>Evidências deste cenário</summary><p>Resultado registrado: <code>{c.code}</code>.</p>{c.evidence.length?<ul>{c.evidence.map(file=><li key={file}><a target="_blank" rel="noreferrer" href={`/api${base}/${encodeURIComponent(operation.id)}/evidence/${c.index}/${file}`}>{file==='report.json'?'Roteiro e resultado':file==='initial.png'?'Imagem inicial':'Imagem final'} do cenário {c.index+1} ↗</a></li>)}</ul>:<p>Sem imagem disponível neste resultado.</p>}</details></li>)}</ol>:<p>Nenhum cenário com resultado registrado até esta leitura.</p>}
   {suggestion&&<div aria-label="Sugestão de ajustes dos agentes"><p>Os agentes prepararam um resumo dos problemas encontrados. Revise o texto abaixo e confirme somente se deseja solicitar esses ajustes.</p><div id={`ai-test-adjustments-${storyId}`}/></div>}
   {!working&&!suggestion&&<p><Link className="sw-navigation-action" href={storyExecutionHref(storyId,'environment',undefined,'acceptance')}>Voltar à aprovação da História</Link></p>}
  </article>:reading&&!selectedId&&<p>Nenhuma bateria de testes por IA registrada nesta consulta.</p>}
  {selectedId&&working&&<p>A bateria atual está em andamento. Consulte seu acompanhamento antes de iniciar outra.</p>}
  <div className="actions"><button className={!latestOperation?'primary':undefined} disabled={!available} onClick={()=>{if(available)void op.send(base,{expectedStoryVersion:reading!.storyVersion,expectedOperationId:reading!.operation?.id??null,contextToken:reading!.token,confirmed:true});}}>{selectedId?'Iniciar bateria na versão DEV atual':latestOperation?'Executar nova bateria de testes por IA':'Iniciar testes por Agentes de IA'}</button><button className="text-button" disabled={loading||op.busy} onClick={()=>setRefresh(n=>n+1)}>Atualizar acompanhamento dos testes por IA</button></div>
  {!persona&&<p className="hint">Selecione uma persona autorizada para iniciar testes.</p>}
 </section>;
}
