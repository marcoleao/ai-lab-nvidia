'use client';
import {useEffect,useRef,useState} from 'react';
import {Server} from 'lucide-react';
import type {AssistantDevAction} from '../../../packages/shared/src/assistant-dev-actions';
import EnvironmentTargetPreparation from './environment-target-preparation';
import DevelopmentDeployment from './development-deployment';
import {displayDate} from './experience-ui';
import './assistant-application-preparation.css';
import './assistant-dev-action.css';

type Context={id:string;kind:string;name:string;version:number;systemId?:string};
type Props={action:AssistantDevAction|null;context:Context;persona:string;role:string;readOnly:boolean;fresh:boolean;active?:boolean;recoveryTargetId:string;onRefresh:()=>void};

export function validAssistantDevAction(value:unknown,context:Context):value is AssistantDevAction{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>,text=(x:unknown)=>typeof x==='string'&&x.trim().length>0,nullableText=(x:unknown)=>x===null||text(x),version=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>0;
 const common=v.contextId===context.id&&text(v.systemId)&&version(v.systemVersion)&&typeof v.configured==='boolean'&&typeof v.readOnly==='boolean'&&Array.isArray(v.blockers)&&v.blockers.every(text)&&nullableText(v.operationId)&&nullableText(v.operationState)&&(v.operationId===null)===(v.operationState===null)&&typeof v.asOf==='string'&&Number.isFinite(Date.parse(v.asOf));
 if(!common)return false;
 if(v.kind==='environment_target')return context.kind==='system'&&v.systemId===context.id&&v.systemVersion===context.version&&v.storyId===null&&v.storyVersion===null;
 return v.kind==='development_deployment'&&context.kind==='story'&&v.storyId===context.id&&version(v.storyVersion)&&v.storyVersion===context.version&&text(context.systemId)&&v.systemId===context.systemId;
}

/** Navigation metadata only. Existing domain components retain every preview,
 * confirmation, pending request, body/persona/key and observed receipt. */
export default function AssistantDevActionDialog({action,context,persona,role,readOnly,fresh,active=true,recoveryTargetId,onRefresh}:Props){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const scoped=validAssistantDevAction(action,context)?action:null,target=scoped?.kind==='environment_target',following=!!scoped?.operationId;
 const label=target?following?'Acompanhar destino DEV':'Preparar destino DEV':following?'Acompanhar publicação DEV':'Publicar em DEV';
 const title=target?'Destino DEV do Sistema':'Publicação da História em DEV';
 const blocked=readOnly||!!scoped?.readOnly||!fresh||!scoped?.configured;
 const reviewKey=JSON.stringify([fresh,readOnly,scoped?.readOnly,scoped?.configured,scoped?.systemVersion,scoped?.storyVersion,scoped?.operationId,scoped?.operationState]);
 function show(){if(scoped&&active)setOpen(true);}
 function close(){dialog.current?.close();setOpen(false);requestAnimationFrame(()=>trigger.current?.isConnected&&trigger.current.focus());}
 useEffect(()=>{if(!active){setOpen(false);return;}if(open&&!dialog.current?.open){dialog.current?.showModal();requestAnimationFrame(()=>heading.current?.focus());}if(!open&&dialog.current?.open)dialog.current.close();},[open,active]);
 return <>
  <span role="group" className="assistant-system-action-entry assistant-dev-entry" aria-label="Ações DEV do contexto"><button ref={trigger} type="button" className="assistant-system-action-trigger" aria-haspopup="dialog" aria-expanded={open&&active} aria-controls={`assistant-dev-dialog-${context.id}`} disabled={!scoped||!active} onClick={show}><Server size={15} aria-hidden="true"/>{scoped?label:'Ação DEV indisponível'}</button>{!scoped&&<span role="status">Situação DEV não confirmada.</span>}</span>
  {scoped&&active&&<dialog ref={dialog} id={`assistant-dev-dialog-${context.id}`} className="assistant-application-dialog assistant-dev-dialog" aria-labelledby={`assistant-dev-title-${context.id}`} onCancel={event=>{event.preventDefault();close();}} onClose={()=>setOpen(false)}>
   <header><div><h2 ref={heading} id={`assistant-dev-title-${context.id}`} tabIndex={-1}>{title}</h2><p>{target?'Sistema':'História'}: <strong>{context.name}</strong></p></div><button type="button" onClick={close}>Voltar à conversa</button></header>
   <div className="assistant-application-dialog-body">
    <p className="assistant-application-handoff">{target?'Confira e confirme o destino DEV neste painel. A preparação usa o mesmo fluxo de Sistema → Ambientes e não publica a aplicação.':'Confira e confirme a publicação neste painel. O pedido usa o mesmo fluxo de História → Execução → DEV e pode acompanhar a preparação necessária do destino.'} Enviar uma mensagem não autoriza nem executa esses efeitos.</p>
    <button type="button" className="text-button" onClick={onRefresh}>Atualizar situação DEV da conversa</button>
    {!fresh&&<p className="alert" role="status">A situação DEV da conversa não foi confirmada. A referência de {displayDate(scoped.asOf)} e o motivo foram preservados; atualize a consulta e confira a decisão novamente.</p>}
    {!!scoped.blockers.length&&<details className="assistant-application-availability"><summary>Condições observadas no contexto</summary><ul>{scoped.blockers.map((message,index)=><li key={index}>{message}</li>)}</ul><p>Esta observação orienta a navegação. A conferência abaixo revalida fonte, destino e impedimentos antes da confirmação.</p></details>}
    {target?<EnvironmentTargetPreparation key={'assistant-target-'+scoped.systemId} systemId={scoped.systemId} systemVersion={scoped.systemVersion} persona={persona} role={role} active={open} readOnly={blocked} reviewKey={reviewKey} recoveryTargetId={recoveryTargetId} repositoryHref={`/systems/${encodeURIComponent(scoped.systemId)}?tab=components`} onReturn={show} onRefresh={onRefresh}/>:<DevelopmentDeployment key={'assistant-deployment-'+scoped.storyId} storyId={scoped.storyId!} storyVersion={scoped.storyVersion!} persona={persona} role={role} active={open} readOnly={blocked} stale={!fresh} reviewKey={reviewKey} recoveryTargetId={recoveryTargetId} onReturn={show} onRefresh={onRefresh}/>}
   </div>
  </dialog>}
 </>;
}
