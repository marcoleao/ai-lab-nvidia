'use client';
import {useEffect,useRef,useState} from 'react';
import {ErrorState,Spinner} from './experience-ui';
type Attempt={path:string;method:string;body:unknown;persona:string;key:string};
export default function useOperation(scope:string,persona:string,onSuccess:(data:any)=>void,options:{retryLabel?:string;onRejected?:(error:{code?:string;message?:string})=>void}={}){
 const [pending,setPending]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=useRef(onSuccess);current.current=onSuccess;
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const storage=`sdlc-release-operation:${scope}`;
 useEffect(()=>{try{const value=sessionStorage.getItem(storage);setPending(value?JSON.parse(value):null);}catch{setPending(null);}setError('');},[storage]);
 function remember(value:Attempt|null){setPending(value);try{if(value)sessionStorage.setItem(storage,JSON.stringify(value));else sessionStorage.removeItem(storage);}catch{/* The in-memory attempt remains available when browser storage is disabled. */}}
 async function execute(attempt:Attempt){
  if(busy||attempt.persona!==persona)return;const completed=current.current;setBusy(true);setError('');remember(attempt);
  try{const response=await fetch(`/api${attempt.path}`,{method:attempt.method,headers:{'Content-Type':'application/json','X-Persona':attempt.persona,'Idempotency-Key':attempt.key},body:JSON.stringify(attempt.body)});
   const data=await response.json();if(!response.ok){if(response.status<500){remember(null);if(mounted.current)options.onRejected?.(data.error||{});}throw Error(data.error?.message||'Não foi possível concluir a solicitação.');}
   remember(null);if(mounted.current)completed(data);
  }catch(e){setError(e instanceof Error?e.message:'O resultado da operação ainda não foi confirmado.');}finally{setBusy(false);}
 }
 return {pending,busy,error,clearError:()=>setError(''),send:(path:string,body:unknown,method='POST')=>{if(!persona||pending||busy)return;return execute({path,body,method,persona,key:crypto.randomUUID()});},feedback:<>{error&&<ErrorState>{error}</ErrorState>}{pending&&<div className="alert real-release-uncertain" role="status"><strong>Solicitação aguardando confirmação</strong><p>Verifique o resultado usando a mesma solicitação. Persona original: {pending.persona}.</p><button disabled={busy||pending.persona!==persona} onClick={()=>void execute(pending)}>{busy&&<Spinner/>}{busy?'Verificando…':options.retryLabel||'Verificar resultado da solicitação'}</button>{pending.persona!==persona&&<p>Selecione a persona original para continuar.</p>}</div>}</>};
}
