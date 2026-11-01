'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {DevelopmentTestReading} from '../../../packages/shared/src/development-test';
import type {ManualAcceptanceReading} from '../../../packages/shared/src/development-manual-acceptance';
import {isManualAcceptance} from '../../../packages/shared/src/development-manual-acceptance';
import {storyExecutionHref} from './story-execution-navigation';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import DevelopmentAiTestResult from './development-ai-test-result';

export default function TaskDevAcceptance({storyId,taskId,revision,historical}:{storyId:string;taskId:string;revision:number;historical:boolean}){
 const [technical,setTechnical]=useState<DevelopmentTestReading|null>(null),[manual,setManual]=useState<(ManualAcceptanceReading&{criterionCount:number})|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');
  async function read(path:string){const response=await fetch('/api/items/'+encodeURIComponent(storyId)+'/'+path,{cache:'no-store',signal:abort.signal});const v=await response.json();if(!response.ok||v.storyId!==storyId||!Number.isFinite(Date.parse(v.asOf))||typeof v.current!=='boolean')throw Error('A consulta das evidências DEV não foi confirmada.');if(path==='development-manual-acceptance'&&(v.record!==null&&!isManualAcceptance(v.record,storyId)||!Number.isSafeInteger(v.criterionCount)||v.criterionCount<0))throw Error('A evidência manual recebida está incompleta.');return v;}
  Promise.allSettled([read('development-test'),read('development-manual-acceptance')]).then(values=>{if(abort.signal.aborted)return;const [test,acceptance]=values;if(test.status==='fulfilled'&&('evidence'in test.value))setTechnical(test.value);if(acceptance.status==='fulfilled'&&('record'in acceptance.value)&&Number.isSafeInteger(acceptance.value.criterionCount))setManual(acceptance.value);if(values.some(v=>v.status==='rejected'))setError('Parte das evidências DEV não foi confirmada. As últimas leituras permanecem identificadas por data.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
 },[storyId,taskId,revision,refresh]);
 const approved=!!manual?.development&&manual.development.validity.state==='valid'&&!loading&&!error;
 const test=technical?.evidence?.taskId===taskId?technical.evidence:null,record=manual?.record?.taskId===taskId?manual.record:null;
 return <section className="panel" aria-label="Testes e aceitação em DEV"><h2>Testes e aceitação em DEV</h2><p>Os testes HTTP, os testes por IA e a verificação humana têm evidências próprias. A Tarefa conclui quando a História for aprovada em DEV.</p>
  {loading&&<LoadingState>Consultando evidências DEV…</LoadingState>}{error&&<ErrorState onRetry={()=>setRefresh(v=>v+1)}>{error}</ErrorState>}
  {technical&&<p>Última verificação HTTP: <strong>{test?test.result==='passed'?'aprovada':'reprovada':'sem resultado registrado'}</strong>. {test&&test.suiteScope==='technical'?'Escopo técnico; não comprova aceitação dos critérios.':''} {technical.current?'Vinculada ao DEV nesta observação.':'Não confirma a versão ativa nesta consulta.'} Leitura de {displayDate(technical.asOf)}.</p>}
  {manual&&<p>Aprovação humana da História: <strong>{loading||error||!manual.development||manual.development.validity.state==='unconfirmed'?'não confirmada':approved?'aprovada':manual.development.validity.state==='outdated'?'aprovação anterior sem vigência':record?.scope==='story'&&record.result==='failed'?'ajustes solicitados':'pendente'}</strong>. {record?.scope==='criteria'?'Evidência anterior da política por critérios preservada.':record&&!manual.current?'Decisão preservada; não confirma a revisão atual.':''} Leitura de {displayDate(manual.asOf)}.</p>}
  {historical&&<p className="hint">Esta consulta pertence à tentativa histórica da Tarefa. Os links abaixo abrem a revisão atual da História, sem mudar a tentativa consultada.</p>}
  <DevelopmentAiTestResult storyId={storyId} revision={revision} historical={historical}/>
  <p><Link href={storyExecutionHref(storyId,'environment',undefined,'acceptance')}>{approved?'Consultar aprovação da História':'Aprovar História em DEV'}</Link></p><p><Link href={storyExecutionHref(storyId,'environment',undefined,'test')}>Consultar testes HTTP em DEV</Link></p>
 </section>;
}
