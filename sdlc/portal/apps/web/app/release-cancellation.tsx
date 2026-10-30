'use client';
import {useEffect,useRef,useState} from 'react';
import useOperation from './release-operation';

type Release={id:string;key:string;name:string;version:number;compositionStatus:string;flowEnvironment?:string|null;storyCount:number;canceledAt?:string|null;canceledByName?:string|null;cancellationReason?:string|null};
type Base={version:number;status:string;environment:string|null;persona:string};
export default function ReleaseCancellation({release,persona,role,hidden,available,blocked,onChanged,onRefresh,onBusyChange,onConfirmationChange}:{release:Release;persona:string;role?:string;hidden:boolean;available:boolean;blocked:boolean;onChanged:(data:any)=>void;onRefresh:()=>void;onBusyChange:(busy:boolean)=>void;onConfirmationChange:(open:boolean)=>void}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[base,setBase]=useState<Base|null>(null);
 const panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const op=useOperation(`cancel:${release.id}`,persona,data=>{setOpen(false);setBase(null);onChanged(data);setTimeout(()=>panel.current?.focus(),0);},{retryLabel:'Verificar resultado do cancelamento',onRejected:()=>{setBase(null);onRefresh();}});
 useEffect(()=>{onConfirmationChange(open);},[open,onConfirmationChange]);
 useEffect(()=>()=>onConfirmationChange(false),[onConfirmationChange]);
 useEffect(()=>{onBusyChange(op.busy||Boolean(op.pending));},[op.busy,op.pending,onBusyChange]);
 useEffect(()=>()=>onBusyChange(false),[onBusyChange]);
 useEffect(()=>{setOpen(false);setReason('');setBase(null);},[release.id]);
 useEffect(()=>{if(op.pending){const body=op.pending.body as {reason?:string};if(body.reason)setReason(body.reason);}},[op.pending]);
 useEffect(()=>{if(open&&!hidden){const timer=setTimeout(()=>{panel.current?.focus();panel.current?.scrollIntoView({block:'center'});},0);return()=>clearTimeout(timer);}},[open,hidden]);
 const authorized=Boolean(persona)&&['admin','release_manager'].includes(role||'');
 const eligible=['OPEN','CLOSED'].includes(release.compositionStatus),pending=op.busy||Boolean(op.pending);
 const same=Boolean(base&&base.version===release.version&&base.status===release.compositionStatus&&base.environment===(release.flowEnvironment??null)&&base.persona===persona);
 function review(){setBase({version:release.version,status:release.compositionStatus,environment:release.flowEnvironment??null,persona});op.clearError();setOpen(true);}
 if(!available&&!op.pending)return null;
 return <div ref={panel} role="region" aria-label="Cancelamento da release" tabIndex={-1} className={`release-cancellation${open||release.compositionStatus==='CANCELED'?' panel':''}`} hidden={hidden&&!op.pending}>
  {op.feedback}
  <div hidden={hidden}>
   {release.compositionStatus==='CANCELED'?<><h2>Release cancelada</h2><p>{release.canceledAt?`Cancelada em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(release.canceledAt))}${release.canceledByName?` por ${release.canceledByName}`:''}.`:'Instante e autoria do cancelamento não capturados neste registro.'}</p><h3>Motivo do cancelamento</h3><p className="description">{release.cancellationReason||'Motivo não capturado neste registro.'}</p><p className="hint">O cancelamento mantém a composição e as Histórias registradas. Não desfaz implantações nem a conclusão anterior de uma História.</p></>:eligible&&<>
    {!open?<div className="actions"><button ref={button} type="button" className="release-cancel-button" disabled={!authorized||blocked||pending} onClick={review}>Cancelar release</button>{!authorized&&<p className="hint">Selecione Administrador ou Release Manager para cancelar.</p>}</div>:<>
     <h2>Cancelar {release.key} · {release.name}?</h2>
     <p>Estado registrado: <strong>{release.compositionStatus}</strong> · Ambiente do fluxo registrado: <strong>{release.flowEnvironment||'não confirmado'}</strong>.</p>
     <p>A release ficará CANCELED, sem reabertura. Histórias, composição e histórico serão preservados. O cancelamento não interrompe operações externas nem executa implantação ou rollback.</p>
     {release.storyCount>0&&<p className="hint">As Histórias continuam vinculadas à composição preservada. O replanejamento por cópia será disponibilizado em outra etapa.</p>}
     {!same&&!pending&&<p role="status" className="alert">A confirmação precisa ser revisada com os dados e a persona atuais. Seu motivo foi preservado.</p>}
     <label>Motivo do cancelamento<textarea rows={3} minLength={10} maxLength={500} value={reason} disabled={pending} onChange={event=>setReason(event.target.value)}/></label>
     <p className="hint">Informe entre 10 e 500 caracteres. Escolhas ainda não salvas na composição não serão aplicadas por esta ação.</p>
     <div className="actions">{!same&&!pending?<button type="button" disabled={!authorized||blocked} onClick={review}>Revisar cancelamento</button>:<button type="button" className="release-cancel-button" disabled={!authorized||blocked||pending||!same||Array.from(reason.trim()).length<10} onClick={()=>void op.send(`/releases/${release.id}/cancel`,{expectedVersion:base!.version,confirmed:true,reason:reason.trim()})}>Confirmar cancelamento</button>}<button type="button" disabled={pending} onClick={()=>{setOpen(false);setBase(null);setTimeout(()=>button.current?.focus(),0);}}>Voltar</button></div>
    </>}
   </>}
  </div>
 </div>;
}
