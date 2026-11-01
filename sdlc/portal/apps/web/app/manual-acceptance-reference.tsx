'use client';
import {useEffect,useState} from 'react';
import type {ManualAcceptance} from '../../../packages/shared/src/development-manual-acceptance';
import {isManualAcceptance} from '../../../packages/shared/src/development-manual-acceptance';
import {ErrorState,LoadingState,displayDate} from './experience-ui';

export default function ManualAcceptanceReference({storyId,recordId}:{storyId:string;recordId:string}){
 const [record,setRecord]=useState<ManualAcceptance|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[requested,setRequested]=useState(0);
 useEffect(()=>{if(!requested)return;const abort=new AbortController();setLoading(true);setError('');
  fetch(`/api/items/${encodeURIComponent(storyId)}/development-manual-acceptance/${encodeURIComponent(recordId)}`,{cache:'no-store',signal:abort.signal}).then(async response=>{const value=await response.json();if(!response.ok||!isManualAcceptance(value.record,storyId)||value.record.id!==recordId)throw Error('A verificação manual desta aprovação não foi confirmada.');return value.record as ManualAcceptance;}).then(value=>{if(!abort.signal.aborted)setRecord(value);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Falha ao consultar o registro humano.');}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
 },[storyId,recordId,requested]);
 return <section aria-label="Verificação manual desta aprovação"><button type="button" className="text-button" disabled={loading} onClick={()=>setRequested(v=>v+1)}>Consultar verificação manual desta aprovação</button>{loading&&<LoadingState>Consultando o registro humano desta aprovação…</LoadingState>}{error&&<ErrorState>{error}</ErrorState>}{record&&record.id===recordId&&<><p>Registro {record.number} · {record.actorName} · {displayDate(record.createdAt)}. Evidência da aprovação consultada; não altera o aceite da revisão atual.</p>{record.scope==='story'?<p>{record.result==='passed'?'História aprovada em DEV.':'Ajustes solicitados na História.'} Decisão global sob responsabilidade humana.</p>:<><p>Registro anterior da política por critérios.</p><ol>{record.criteria.map((criterion,index)=><li key={index}>{criterion} <strong>{record.results[index].passed===true?'Aprovado':record.results[index].passed===false?'Reprovado':'Não verificado'}</strong></li>)}</ol></>}<p>{record.notes}</p><p>Implantação <code>{record.deploymentId}</code> · registro <code>{record.id}</code>.</p></>}</section>;
}
