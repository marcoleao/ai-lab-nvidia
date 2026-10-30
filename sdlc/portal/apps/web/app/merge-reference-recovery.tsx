'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import MergeIntegrationReference from './merge-integration-reference';
import {mergeIntegrationReading,type MergeIntegrationReading} from '../../../packages/shared/src/merge-integration-reference';
type Entry={value:MergeIntegrationReading;attempt:string|null;busy:boolean};
export default function useMergeReferenceRecovery(storyId:string|undefined,persona:string,version:number,canCapture:boolean,onRefresh:()=>void,onReturnFocus?:()=>void,observed:MergeIntegrationReading[]=[]){
 const [entries,setEntries]=useState<Record<string,Entry>>({}),[selected,setSelected]=useState<Entry|null>(null),[receipts,setReceipts]=useState<Record<string,MergeIntegrationReading>>({}),current=useRef<Record<string,Entry>>({});
 const storage=storyId?`sdlc-story-reference-pending:${storyId}`:null;
 const knownStorage=storyId?`sdlc-story-remote-close-known:${storyId}`:null;
 useEffect(()=>{try{setReceipts(knownStorage?JSON.parse(sessionStorage.getItem(knownStorage)||'{}'):{});}catch{setReceipts({});}},[knownStorage]);
 useEffect(()=>{let next:Record<string,Entry>={};try{if(storage){const saved=JSON.parse(sessionStorage.getItem(storage)||'{}');for(const [id,v] of Object.entries(saved) as [string,Entry][])if(v?.value?.operationId===id)next[id]={...v,busy:false};}}catch{}current.current=next;setEntries(next);setSelected(null);},[storage]);
 const notify=useCallback((value:MergeIntegrationReading,pending:boolean,busy:boolean)=>{
  const next={...current.current};
  if(pending){let attempt=next[value.operationId]?.attempt??null;try{attempt=sessionStorage.getItem(`sdlc-release-operation:merge-reference:${value.operationId}`)||attempt;}catch{}next[value.operationId]={value,attempt,busy};}
  else delete next[value.operationId];
  current.current=next;setEntries(next);try{if(storage){if(Object.keys(next).length)sessionStorage.setItem(storage,JSON.stringify(next));else sessionStorage.removeItem(storage);}}catch{}
 },[storage]);
 function reveal(entry:Entry){if(entry.busy)return;try{const key=`sdlc-release-operation:merge-reference:${entry.value.operationId}`;if(entry.attempt&&!sessionStorage.getItem(key))sessionStorage.setItem(key,entry.attempt);}catch{}setSelected(entry);}
 function closure(entry:Entry){try{return JSON.parse(entry.attempt||'{}').path?.endsWith('/historical-closure')===true;}catch{return false;}}
 const remember=useCallback((value:MergeIntegrationReading)=>setReceipts(previous=>{const next={...previous,[value.operationId]:previous[value.operationId]?mergeIntegrationReading(previous[value.operationId],value):value};if(knownStorage&&value.remoteClosure)try{sessionStorage.setItem(knownStorage,JSON.stringify(Object.fromEntries(Object.entries(next).filter(([,v])=>v.remoteClosure))));}catch{}return next;}),[knownStorage]);
 const read=(value:MergeIntegrationReading)=>{const known=observed.find(v=>v.operationId===value.operationId);return mergeIntegrationReading(known?mergeIntegrationReading(value,known):value,receipts[value.operationId]);};
 const currentJobs=new Map<string,MergeIntegrationReading>();for(const value of [...observed,...Object.values(receipts)])if(value.remoteClosure){const old=currentJobs.get(value.operationId);currentJobs.set(value.operationId,old?mergeIntegrationReading(old,value):value);}
 const durable=[...currentJobs.values()].filter(v=>['queued','running','unknown','paused'].includes(v.remoteClosure!.state));
 const pending=Object.keys(entries).length>0||durable.length>0;
 function remote(entry:Entry){try{const path=JSON.parse(entry.attempt||'{}').path;return path?path.includes('/remote-close'):Boolean(entry.value.remoteClosure);}catch{return Boolean(entry.value.remoteClosure);}}
 return {pending,notify,remember,read,activeOperationId:selected?.value.operationId,feedback:<>
  {pending&&<section className="sw-alert" aria-label="Registro de referência pendente" role="region"><p role="status">Há um registro histórico aguardando confirmação. Verifique a mesma solicitação antes de iniciar outra ação do fluxo.</p>{Object.values(entries).map(entry=><button key={entry.value.operationId} type="button" disabled={entry.busy||selected?.value.operationId===entry.value.operationId} onClick={()=>reveal(entry)}>{entry.busy?'Enviando registro histórico…':closure(entry)?'Verificar encerramento do acompanhamento':'Verificar registro de referência'}</button>)}</section>}
  {durable.filter(v=>!entries[v.operationId]).map(value=><section key={value.operationId} className="sw-alert" aria-label="Fechamento de MR pendente"><p>{value.remoteClosure!.message}</p><button type="button" disabled={selected?.value.operationId===value.operationId} onClick={()=>setSelected({value,attempt:null,busy:false})}>Verificar pedido de fechamento</button></section>)}
  {selected&&<section className="panel" aria-label={remote(selected)?"Verificação do fechamento remoto":closure(selected)?"Verificação do encerramento histórico":"Verificação do registro de referência"}><h2>{remote(selected)?"Acompanhar fechamento do MR":closure(selected)?"Verificar encerramento do acompanhamento":"Verificar registro da referência"}</h2><p>Esta consulta recupera a solicitação original da integração anterior.</p><MergeIntegrationReference value={read(selected.value)} historical persona={persona} version={version} canCapture={canCapture} onRefresh={onRefresh} onPendingChange={notify} onCaptured={remember}/><button type="button" disabled={Boolean(entries[selected.value.operationId])} onClick={()=>{setSelected(null);requestAnimationFrame(()=>onReturnFocus?.());}}>Voltar à consulta atual</button></section>}
 </>};
}
