'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {AiTestContext,AiTestOperation} from '../../../packages/shared/src/development-ai-test';
import {isAiTestContext} from './development-ai-test';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import {storyExecutionHref} from './story-execution-navigation';
import './development-ai-test-result.css';

const labels:Record<AiTestOperation['state'],string>={queued:'Na fila',running:'Testes em execução',succeeded:'Cenários executados sem falhas encontradas',failed:'Falhas funcionais encontradas',inconclusive:'Bateria inconclusiva',unknown:'Resultado não confirmado',stale:'Versão testada desatualizada'};
type ResultProps={storyId:string;operation:AiTestOperation|null;asOf?:string|null;loading?:boolean;error?:boolean;loaded?:boolean;current?:boolean;historical?:boolean;className?:string;onRetry?:()=>void};

/** One observed battery, shared by Story, Task and the execution hub. No command. */
export function AiTestResult({storyId,operation,asOf,loading=false,error=false,loaded=false,current=false,historical=false,className='',onRetry}:ResultProps){
 const query=operation?new URLSearchParams({aiTest:operation.id}):undefined;
 const counts=operation?{passed:operation.cases.filter(c=>c.status==='passed').length,failed:operation.cases.filter(c=>c.status==='failed').length,untested:operation.cases.filter(c=>c.status==='not_tested').length}:null;
 return <section className={`development-ai-test-result ${className}`} aria-label="Resultados dos testes por IA" data-testid="development-ai-test-result">
  <h3>Testes por Agentes de IA</h3>
  <p className="hint">Última bateria registrada na História. A aprovação continua humana.</p>
  {loading&&!loaded&&<LoadingState>Consultando resultados dos testes por IA…</LoadingState>}
  {error&&<ErrorState onRetry={onRetry}>A consulta dos testes por IA não foi confirmada.{operation&&<> Último resultado conhecido preservado{asOf?`, da leitura de ${displayDate(asOf)}`:''}.</>}</ErrorState>}
  {operation?<>
   {operation.state==='failed'?<ErrorState>{error?'Último resultado conhecido: ':''}{labels[operation.state]}</ErrorState>:<p><strong>{error?'Último resultado conhecido: ':''}{labels[operation.state]}</strong></p>}
   <p>{counts!.passed} {counts!.passed===1?'cenário':'cenários'} sem falha encontrada · {counts!.failed} com falha funcional · {counts!.untested} {counts!.untested===1?'não verificado':'não verificados'}.</p>
   <p>{operation.message}</p>
   <p className="hint">Atualizada em {displayDate(operation.updatedAt)}.{asOf&&<> Consulta em {displayDate(asOf)}.</>}</p>
   {!current&&!error&&<p className="hint">Resultado preservado; sua relação com a revisão atual não está confirmada.</p>}
  </>:loaded&&!error&&<p>Nenhuma bateria de testes por IA registrada nesta História.</p>}
  {historical&&<p className="hint">Esta é a última bateria da História, independente da tentativa histórica da Tarefa em consulta.</p>}
  <Link className="development-ai-test-result-link" href={storyExecutionHref(storyId,'ai-tests',query)}>Consultar resultados dos testes por IA</Link>
  <p className="hint">Abre os cenários, imagens e roteiros{operation?' desta bateria':''}. Consultar não inicia testes nem registra uma decisão.</p>
 </section>;
}

export default function DevelopmentAiTestResult({storyId,revision,stale=false,historical=false,className=''}:{storyId:string;revision:number;stale?:boolean;historical?:boolean;className?:string}){
 const [snapshot,setSnapshot]=useState<{storyId:string;reading:AiTestContext|null;error:boolean}>({storyId,reading:null,error:false});
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  if(!storyId)return;let alive=true,abort:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  async function poll(){
   abort=new AbortController();
   try{
    const response=await fetch(`/api/items/${encodeURIComponent(storyId)}/development-ai-test`,{cache:'no-store',signal:abort.signal});const reading:unknown=await response.json();
    if(!response.ok||!isAiTestContext(reading,storyId))throw Error('AI result reading unavailable');
    if(alive)setSnapshot({storyId,reading,error:false});
   }catch{if(alive&&!abort.signal.aborted)setSnapshot(previous=>({storyId,reading:previous.storyId===storyId?previous.reading:null,error:true}));}
   finally{if(alive)timer=setTimeout(poll,4000);}
  }
  void poll();return()=>{alive=false;abort?.abort();if(timer)clearTimeout(timer);};
 },[storyId,revision,refresh]);
 const reading=snapshot.storyId===storyId?snapshot.reading:null,error=snapshot.storyId===storyId&&snapshot.error,operation=reading?.operation??null;
 const current=!!reading&&!stale&&!error&&!!operation&&operation.referenceDigest===reading.referenceDigest&&operation.deploymentId===reading.deploymentId&&operation.sourceSha===reading.sourceSha;
 return <AiTestResult storyId={storyId} operation={operation} asOf={reading?.asOf} current={current} error={error} loaded={!!reading} loading={!reading&&!error} historical={historical} className={className} onRetry={()=>setRefresh(n=>n+1)}/>;
}
