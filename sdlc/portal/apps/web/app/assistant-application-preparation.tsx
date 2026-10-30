'use client';
import {useEffect,useRef,useState} from 'react';
import {Settings2} from 'lucide-react';
import type {AssistantSystemAction} from '../../../packages/shared/src/assistant-system-actions';
import ApplicationPreparation from './application-preparation';
import {displayDate} from './experience-ui';
import './assistant-application-preparation.css';

type Props={action:AssistantSystemAction|null;contextId:string;persona:string;role:string;readOnly:boolean;fresh:boolean;onRefresh:()=>void};

export function validAssistantSystemAction(value:unknown,contextId:string):value is AssistantSystemAction{
 if(!value||typeof value!=='object')return false;
 const item=value as Record<string,unknown>,text=(v:unknown)=>typeof v==='string'&&v.trim().length>0,nullableText=(v:unknown)=>v===null||text(v),version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
 return item.kind==='application_preparation'&&item.systemId===contextId&&version(item.systemVersion)&&text(item.systemName)&&typeof item.configured==='boolean'&&nullableText(item.repositoryId)&&(item.repositoryVersion===null||version(item.repositoryVersion))&&typeof item.repositoryReady==='boolean'&&typeof item.readOnly==='boolean'&&Array.isArray(item.blockers)&&item.blockers.every(text)&&nullableText(item.operationId)&&nullableText(item.operationState)&&nullableText(item.mrState)&&typeof item.resolved==='boolean'&&typeof item.asOf==='string'&&Number.isFinite(Date.parse(item.asOf));
}

/** The conversation offers an entry. The existing component owns every review,
 * confirmation and durable request, including recovery from the repository page. */
export default function AssistantApplicationPreparation({action,contextId,persona,role,readOnly,fresh,onRefresh}:Props){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const scoped=validAssistantSystemAction(action,contextId)?action:null;
 const following=!!scoped?.operationId&&!scoped.resolved;
 const label=following?'Acompanhar preparação':'Preparar aplicação';
 function show(){if(!scoped)return;setOpen(true);}
 function close(){dialog.current?.close();setOpen(false);requestAnimationFrame(()=>trigger.current?.isConnected&&trigger.current.focus());}
 useEffect(()=>{if(open&&!dialog.current?.open){dialog.current?.showModal();requestAnimationFrame(()=>heading.current?.focus());}if(!open&&dialog.current?.open)dialog.current.close();},[open]);
 return <>
  <span role="group" className="assistant-system-action-entry" aria-label="Ações do Sistema"><button ref={trigger} type="button" className="assistant-system-action-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={`assistant-preparation-dialog-${contextId}`} disabled={!scoped} onClick={show}><Settings2 size={15} aria-hidden="true"/>{label}</button>{!scoped&&<span role="status">Situação da preparação não confirmada.</span>}</span>
  {scoped&&<dialog ref={dialog} id={`assistant-preparation-dialog-${contextId}`} className="assistant-application-dialog" aria-labelledby={`assistant-preparation-title-${contextId}`} onCancel={event=>{event.preventDefault();close();}} onClose={()=>setOpen(false)}>
   <header><div><h2 ref={heading} id={`assistant-preparation-title-${contextId}`} tabIndex={-1}>Preparação da aplicação</h2><p>Sistema: <strong>{scoped.systemName}</strong></p></div><button type="button" onClick={close}>Voltar à conversa</button></header>
   <div className="assistant-application-dialog-body">
    <p className="assistant-application-handoff">Revise e confirme a preparação neste painel. O pedido usa o mesmo fluxo do repositório do Sistema; enviar uma mensagem não publica arquivos nem autoriza o merge.</p>
    <button type="button" className="text-button" onClick={onRefresh}>Atualizar situação do Sistema</button>
    {!fresh&&<p className="alert" role="status">A situação atual da conversa não foi confirmada. As referências observadas em {displayDate(scoped.asOf)} foram preservadas; atualize a consulta antes de uma nova decisão.</p>}
    {!!scoped.blockers.length&&<details className="assistant-application-availability"><summary>Condições observadas no Sistema</summary><ul>{scoped.blockers.map((message,index)=><li key={index}>{message}</li>)}</ul><p>Esta leitura não confirma a prontidão remota. A conferência da preparação consulta a fonte atual antes de decidir.</p></details>}
    <ApplicationPreparation systemId={scoped.systemId} systemVersion={scoped.systemVersion} repositoryId={scoped.repositoryId??undefined} repositoryVersion={scoped.repositoryVersion??undefined} active={open} persona={persona} role={role} blocked={readOnly||scoped.readOnly||!fresh} onRefresh={onRefresh} onShow={show}/>
   </div>
  </dialog>}
 </>;
}
