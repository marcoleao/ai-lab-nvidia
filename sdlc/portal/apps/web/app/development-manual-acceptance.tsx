'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ManualAcceptance,ManualAcceptanceContext as Context} from '../../../packages/shared/src/development-manual-acceptance';
import {isManualAcceptance} from '../../../packages/shared/src/development-manual-acceptance';
import useOperation from './release-operation';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import {storyExecutionHref} from './story-execution-navigation';
import './development-manual-acceptance.css';

type Props={storyId:string;storyVersion:number;persona:string;active:boolean;readOnly:boolean;stale:boolean;recoveryTargetId:string;onPendingChange?:(pending:boolean)=>void;onRefresh:()=>void;onReturn:()=>void};
const sourceKey=(v:Context)=>JSON.stringify([v.deploymentId,v.buildId,v.sourceSha,v.specificationNumber]);
function validContext(v:Context,id:string){return !!v&&v.storyId===id&&Number.isSafeInteger(v.storyVersion)&&v.storyVersion>0&&Array.isArray(v.criteria)&&v.criteria.every(c=>typeof c==='string'&&c.trim())&&typeof v.allowed==='boolean'&&Array.isArray(v.blockers)&&v.blockers.every(c=>typeof c==='string')&&typeof v.token==='string'&&/^[a-f0-9]{64}$/.test(v.token)&&Number.isFinite(Date.parse(v.asOf))&&typeof v.current==='boolean'&&('record'in v)&&(v.record===null||isManualAcceptance(v.record,id))&&(!v.current||!!v.record)&&!!v.development&&v.development.storyId===id&&['not_recorded','valid','outdated','unconfirmed'].includes(v.development.validity?.state)&&(v.development.validity.state!=='valid'||!!v.development.approval&&v.development.approval.storyId===id&&typeof v.development.approval.id==='string'&&typeof v.development.approval.actorName==='string'&&Number.isFinite(Date.parse(v.development.approval.createdAt)))&&Array.isArray(v.checks)&&v.checks.every(c=>typeof c.id==='string'&&typeof c.label==='string'&&typeof c.passed==='boolean'&&typeof c.detail==='string')&&(!v.allowed||!!v.taskId&&!!v.deploymentId&&!!v.buildId&&!!v.sourceSha&&v.checks.length>0&&v.checks.every(c=>c.passed));}
const recordLabel=(v:ManualAcceptance)=>v.scope==='story'?v.result==='passed'?'História aprovada em DEV':'Ajustes solicitados na História':'Registro anterior da política por critérios';
export default function DevelopmentManualAcceptance({storyId,storyVersion,persona,active,readOnly,stale,recoveryTargetId,onPendingChange,onRefresh,onReturn}:Props){
 const base=`/items/${storyId}/development-manual-acceptance`,storage=`sdlc-story-approval:${storyId}`;
 const [context,setContext]=useState<Context|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [notes,setNotes]=useState(''),[draftSource,setDraftSource]=useState(''),[restored,setRestored]=useState(false),[receipt,setReceipt]=useState<ManualAcceptance|null>(null),[target,setTarget]=useState<HTMLElement|null>(null),[editing,setEditing]=useState(false),[previousNotes,setPreviousNotes]=useState(''),[rejecting,setRejecting]=useState(false);
 const [adjustments,setAdjustments]=useState(''),[previousAdjustments,setPreviousAdjustments]=useState(''),[adjustmentError,setAdjustmentError]=useState('');
 const draft=useRef({notes,draftSource});draft.current={notes,draftSource};
 const callbacks=useRef({onPendingChange,onRefresh,onReturn});callbacks.current={onPendingChange,onRefresh,onReturn};
 const receiptTarget=useRef<HTMLParagraphElement>(null),focusReceipt=useRef(false);
 const adjustmentField=useRef<HTMLTextAreaElement>(null),adjustmentTrigger=useRef<HTMLButtonElement>(null);
 const op=useOperation(`manual-dev-acceptance:${storyId}`,persona,value=>{
  const record=value.record as ManualAcceptance|undefined;if(isManualAcceptance(record,storyId))setReceipt(record);
  setEditing(false);setRejecting(false);focusReceipt.current=true;setRefresh(v=>v+1);callbacks.current.onRefresh();
 },{retryLabel:'Verificar recebimento da decisão sobre a História',onRejected:()=>{setRejecting(false);setRefresh(v=>v+1);callbacks.current.onRefresh();}});
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storage)||'{}');if(typeof saved.notes==='string')setNotes(saved.notes);if(typeof saved.adjustments==='string')setAdjustments(saved.adjustments);if(typeof saved.previousNotes==='string')setPreviousNotes(saved.previousNotes);if(typeof saved.previousAdjustments==='string')setPreviousAdjustments(saved.previousAdjustments);if(typeof saved.draftSource==='string')setDraftSource(saved.draftSource);}catch{}setRestored(true);},[storage]);
 useEffect(()=>{if(restored)try{sessionStorage.setItem(storage,JSON.stringify({notes,adjustments,draftSource,previousNotes,previousAdjustments}));}catch{}},[restored,storage,notes,adjustments,draftSource,previousNotes,previousAdjustments]);
 useEffect(()=>{setTarget(document.getElementById(recoveryTargetId));},[recoveryTargetId,active]);
 useEffect(()=>{const notify=callbacks.current.onPendingChange;notify?.(!!op.pending);return()=>notify?.(false);},[!!op.pending]);
 useEffect(()=>{
  if(!active||!restored)return;const controller=new AbortController();setLoading(true);setError('');setRejecting(false);
  fetch('/api'+base+'/context',{cache:'no-store',signal:controller.signal,headers:{'X-Persona':persona}}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error?.message||'Não foi possível consultar a aprovação da História.');if(!validContext(value,storyId))throw Error('A leitura da versão ou da aprovação está incompleta. Atualize antes de decidir.');return value as Context;}).then(value=>{
   if(controller.signal.aborted)return;setContext(value);setEditing(value.development!.validity.state!=='valid');if(!draft.current.draftSource)setDraftSource(sourceKey(value));
  }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível conferir a versão em DEV.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[active,restored,base,storyId,storyVersion,persona,refresh]);
 useEffect(()=>{if(active&&receipt&&focusReceipt.current&&receiptTarget.current){focusReceipt.current=false;receiptTarget.current.focus({preventScroll:true});receiptTarget.current.scrollIntoView({block:'nearest'});}},[active,receipt]);
 useEffect(()=>{if(active&&rejecting)requestAnimationFrame(()=>{adjustmentField.current?.focus({preventScroll:true});adjustmentField.current?.scrollIntoView({block:'nearest'});});},[active,rejecting]);
 const changed=!!context&&draftSource!==sourceKey(context),current=!!context&&!loading&&!error&&!stale&&context.storyVersion===storyVersion;
 const available=current&&context!.allowed&&!readOnly&&!changed&&!op.busy&&!op.pending;
 const approved=current&&context.development!.validity.state==='valid';
 function send(decision:'approved'|'rejected'){
  if(!editing||!available||decision==='approved'&&(approved||rejecting))return;
  const description=(decision==='rejected'?adjustments:notes).trim();
  if(decision==='rejected'&&(!description||description.length>2000)){setAdjustmentError(!description?'Descreva os ajustes necessários para continuar.':'Use até 2000 caracteres para descrever os ajustes.');adjustmentField.current?.focus();return;}
  if(description.length<=2000)void op.send(base,{expectedStoryVersion:context!.storyVersion,expectedRecordId:context!.record?.id??null,contextToken:context!.token,decision,notes:description,confirmed:true});
 }
 function returnToDecision(){setRejecting(false);setAdjustmentError('');requestAnimationFrame(()=>adjustmentTrigger.current?.focus());}
 return <>{!active&&op.pending&&target&&createPortal(<section className="alert" aria-label="Recuperação da aprovação da História"><strong>O recebimento da decisão sobre a História precisa ser conferido.</strong>{op.feedback}<button onClick={()=>callbacks.current.onReturn()}>Voltar à aprovação da História</button></section>,target)}
  <section className="manual-dev-acceptance" hidden={!active} aria-label="Aprovar História em DEV" data-testid="development-acceptance">
   <h3 className="sw-dev-step-title" tabIndex={-1}>Aprovar História em DEV</h3>
   <p>Você está aprovando esta versão da História em DEV. A decisão registra sua aprovação humana e Desenvolvimento Finalizado, concluindo a Tarefa Teste em DEV. A História permanece aberta até a entrega em produção.</p>
   {active&&op.feedback}{loading&&<LoadingState>Conferindo versão publicada e aprovação…</LoadingState>}{error&&<ErrorState onRetry={()=>setRefresh(v=>v+1)}>{error}{context&&<p>Última leitura preservada, de {displayDate(context.asOf)}. Aguarde uma consulta confirmada para decidir.</p>}</ErrorState>}
   {receipt&&<p ref={receiptTarget} tabIndex={-1} className="alert success" role="status">Decisão recebida: {recordLabel(receipt)} · {receipt.actorName} · {displayDate(receipt.createdAt)}. A vigência atual é consultada abaixo.</p>}
   {context&&<>
    {approved&&<article aria-label="História aprovada em DEV"><h4>História aprovada em DEV</h4><p>{context.development!.approval?.actorName} · {displayDate(context.development!.approval!.createdAt)}. Desenvolvimento Finalizado válido para esta versão.</p><p><Link className="primary sw-navigation-action" href={storyExecutionHref(storyId,'release')}>Consultar release planejada</Link></p></article>}
    {context.development!.validity.state==='outdated'&&<p className="alert">A aprovação anterior perdeu a vigência. Confira esta versão antes de tomar uma nova decisão.</p>}
    {context.development!.validity.state==='unconfirmed'&&<p className="alert">A vigência da aprovação não foi confirmada. Atualize a consulta antes de continuar.</p>}
    <p>Especificação: revisão {context.specificationNumber??'não confirmada'}. Consulta em {displayDate(context.asOf)}.</p>{current&&context.url&&<p><a href={context.url} target="_blank" rel="noreferrer">Abrir aplicação em DEV ↗</a></p>}
    <details><summary>Versão em aprovação</summary><p>Implantação <code>{context.deploymentId??'não confirmada'}</code> · construção <code>{context.buildId??'não confirmada'}</code> · fonte <code>{context.sourceSha??'não confirmada'}</code>.</p></details>
    <details><summary>Consultar critérios da História</summary><p>Referência para sua avaliação. A decisão é sobre a História inteira.</p>{context.criteria.length?<ol>{context.criteria.map((criterion,index)=><li key={index}>{criterion}</li>)}</ol>:<p>Sem critérios registrados nesta consulta.</p>}</details>
    <details><summary>Consultar controles técnicos</summary><ul>{context.checks!.map(check=><li key={check.id}><strong>{check.label}: {check.passed?'conferido':'pendente'}</strong><p>{check.detail}</p></li>)}</ul></details>
    {context.blockers.length>0&&<div className="alert"><strong>Aprovação impedida</strong><ul>{context.blockers.map((blocker,i)=><li key={i}>{blocker}</li>)}</ul></div>}
    {context.current&&context.record?.scope==='story'&&context.record.result==='failed'&&<div className="alert"><p>Os ajustes foram registrados. Nenhuma correção foi iniciada automaticamente.</p><Link href={storyExecutionHref(storyId)}>Avaliar correção na Execução</Link></div>}{context.record&&<details><summary>Consultar última decisão humana</summary><p>{recordLabel(context.record)} · {context.record.actorName} · {displayDate(context.record.createdAt)}. {context.current?'Registro desta revisão.':'Registro preservado; não confirma a revisão atual.'}</p>{context.record.notes&&<p>{context.record.notes}</p>}{context.record.scope!=='story'&&<ol>{context.record.criteria.map((criterion,i)=><li key={i}>{criterion} <strong>{context.record!.results[i]?.passed===true?'Aprovado':context.record!.results[i]?.passed===false?'Reprovado':'Não verificado'}</strong></li>)}</ol>}</details>}
    {approved&&!editing&&<button disabled={!available} onClick={()=>{setEditing(true);setNotes('');setDraftSource(sourceKey(context));}}>Registrar nova decisão</button>}
    {(previousNotes||previousAdjustments)&&<details><summary>Rascunho da versão anterior</summary>{previousNotes&&<p>Observação da aprovação: {previousNotes}</p>}{previousAdjustments&&<p>Ajustes solicitados: {previousAdjustments}</p>}</details>}
    {editing&&changed&&<div className="alert" role="alert"><p>A versão mudou. Seu rascunho anterior foi preservado. Confira a nova versão antes de aprovar.</p><button disabled={op.busy||!!op.pending} onClick={()=>{setPreviousNotes(notes);setPreviousAdjustments(adjustments);setNotes('');setAdjustments('');setAdjustmentError('');setDraftSource(sourceKey(context));setRejecting(false);}}>Conferir esta versão</button></div>}
    {editing&&!changed&&<>{!rejecting&&<><label htmlFor={`manual-notes-${storyId}`}>Observação da aprovação — opcional<textarea id={`manual-notes-${storyId}`} rows={3} maxLength={2000} value={notes} disabled={!available} onChange={e=>setNotes(e.target.value)}/></label>
     <div className="actions"><button className="primary" disabled={!available||!!approved||notes.trim().length>2000} onClick={()=>send('approved')}>Confirmar aprovação da História em DEV</button><button ref={adjustmentTrigger} disabled={!available} onClick={()=>{setAdjustmentError('');setRejecting(true);}}>Solicitar ajustes</button></div></>}
     {rejecting&&<section aria-label="Solicitar ajustes"><h4>Solicitar ajustes</h4><label htmlFor={`manual-adjustments-${storyId}`}>Descreva os ajustes necessários<textarea ref={adjustmentField} id={`manual-adjustments-${storyId}`} rows={4} maxLength={2000} required value={adjustments} disabled={!available} aria-invalid={adjustmentError?true:undefined} aria-describedby={`manual-adjustments-help-${storyId}${adjustmentError?` manual-adjustments-error-${storyId}`:''}`} onChange={e=>{setAdjustments(e.target.value);setAdjustmentError('');}}/></label><p id={`manual-adjustments-help-${storyId}`} className="hint">Descrição obrigatória. Informe o que deve mudar e o resultado esperado. Confirmar registra sua decisão; nenhuma correção é iniciada automaticamente.</p>{adjustmentError&&<div id={`manual-adjustments-error-${storyId}`}><ErrorState>{adjustmentError}</ErrorState></div>}<p>{approved?'A aprovação atual perderá a vigência e a Tarefa Teste em DEV ficará pendente.':'A História não será aprovada e a Tarefa Teste em DEV ficará pendente.'}</p><div className="actions"><button className="primary" disabled={!available} onClick={()=>send('rejected')}>Confirmar solicitação de ajustes</button><button disabled={op.busy||!!op.pending} onClick={returnToDecision}>Voltar à decisão</button></div></section>}
    </>}
   </>}
   <p><button className="text-button" disabled={loading||op.busy} onClick={()=>setRefresh(v=>v+1)}>Atualizar consulta da aprovação da História</button></p>
  </section>
 </>;
}
