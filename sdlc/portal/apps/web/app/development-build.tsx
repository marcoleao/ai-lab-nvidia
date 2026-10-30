'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {DevelopmentBuildContext,DevelopmentBuildOperation,DevelopmentBuildReading} from '../../../packages/shared/src/development-build';
import useOperation from './release-operation';
import {ErrorState,LoadingState,Spinner,displayDate} from './experience-ui';
import './development-build.css';

type Props={storyId:string;storyVersion:number;persona:string;role:string;active:boolean;readOnly:boolean;stale:boolean;recoveryTargetId:string;onReturn:()=>void;onRefresh:()=>void};
type Mode='build'|'resume'|'cancel'|null;
const labels:Record<DevelopmentBuildOperation['state'],string>={queued:'Construção solicitada · na fila',running:'Construção em execução',paused:'Construção pausada',blocked:'Construção impedida',failed:'Falha na construção',unknown:'Resultado da construção não confirmado',succeeded:'Artefato de trabalho confirmado',cancelled:'Construção cancelada'};
const unsettled=['queued','running','paused','unknown'];
function newer(old:DevelopmentBuildOperation|null,next:DevelopmentBuildOperation|null){return !old?next:!next?old:next.number>old.number||next.id===old.id&&next.version>=old.version?next:old;}
function combine(old:DevelopmentBuildReading|null,next:DevelopmentBuildReading):DevelopmentBuildReading{return !old?next:{...next,operation:newer(old.operation,next.operation),artifact:newer(old.artifact,next.artifact)};}
async function read<T>(path:string,signal?:AbortSignal):Promise<T>{const response=await fetch('/api'+path,{cache:'no-store',signal}),body=await response.json();if(!response.ok)throw Error(body.error?.message||'Não foi possível consultar a construção DEV.');return body;}

export default function DevelopmentBuild({storyId,storyVersion,persona,role,active,readOnly,stale,recoveryTargetId,onReturn,onRefresh}:Props){
 const base=`/items/${storyId}/development-build`,storage=`sdlc-development-build:${storyId}`;
 const [data,setData]=useState<DevelopmentBuildReading|null>(null),[known,setKnown]=useState<DevelopmentBuildOperation|null>(null),[reason,setReason]=useState(''),[restored,setRestored]=useState('');
 const [loading,setLoading]=useState(true),[queryError,setQueryError]=useState(''),[refresh,setRefresh]=useState(0),[context,setContext]=useState<{value:DevelopmentBuildContext;signature:string}|null>(null),[contextBusy,setContextBusy]=useState(false),[contextError,setContextError]=useState('');
 const [mode,setMode]=useState<Mode>(null),[decisionSignature,setDecisionSignature]=useState(''),[accepted,setAccepted]=useState(false),[notice,setNotice]=useState(''),[target,setTarget]=useState<HTMLElement|null>(null);
 const confirmation=useRef<HTMLElement>(null),result=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null),contextAbort=useRef<AbortController|null>(null),focus=useRef<'confirmation'|'result'|'trigger'|null>(null),callbacks=useRef({onReturn,onRefresh});callbacks.current={onReturn,onRefresh};
 const reload=()=>setRefresh(value=>value+1);
 const operation=newer(data?.operation??null,known),artifact=newer(data?.artifact??null,known?.state==='succeeded'&&known.artifact?known:null);
 const receiptAhead=!!known&&(!data?.operation||known.number>data.operation.number||known.id===data.operation.id&&known.version>data.operation.version);
 const unknownMetadata=loading||!!queryError||!data||receiptAhead||stale;
 const authorized=!!persona&&['admin','product_owner','architect'].includes(role)&&!readOnly;
 const signature=JSON.stringify([storyId,storyVersion,operation?.id??null,operation?.version??null,persona]),latestSignature=useRef(signature);latestSignature.current=signature;
 const currentContext=!!context&&context.signature===signature&&!unknownMetadata&&!contextError&&!contextBusy;
 const working=!!operation&&unsettled.includes(operation.state);
 const op=useOperation(`development-build:${storyId}`,persona,receipt=>{
  if(receipt.operation)setKnown(old=>newer(old,receipt.operation));
  setMode(null);setAccepted(false);setContext(null);focus.current='result';
  setNotice(receipt.receiptType==='development_build_requested'?'Pedido recebido. A construção será acompanhada abaixo.':'Resultado da construção registrado.');reload();callbacks.current.onRefresh();
 },{retryLabel:'Verificar recebimento da construção',onRejected:()=>{setMode(null);setAccepted(false);setContext(null);focus.current='result';reload();callbacks.current.onRefresh();}});

 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storage)||'{}');setReason(saved.reason||'');if(saved.data?.storyId===storyId)setData(saved.data);if(saved.operation)setKnown(saved.operation);}catch{}setRestored(storage);return()=>contextAbort.current?.abort();},[storage,storyId]);
 useEffect(()=>{if(restored===storage)try{sessionStorage.setItem(storage,JSON.stringify({reason,data,operation:known}));}catch{}},[restored,storage,reason,data,known]);
 useEffect(()=>{setTarget(document.getElementById(recoveryTargetId));},[recoveryTargetId,active]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setQueryError('');read<DevelopmentBuildReading>(base,controller.signal).then(value=>{if(value.storyId!==storyId||!('operation' in value)||!('artifact' in value))throw Error('O acompanhamento desta História não foi confirmado.');if(!controller.signal.aborted)setData(old=>combine(old,value));}).catch(error=>{if(!controller.signal.aborted)setQueryError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[base,storyId,refresh]);
 useEffect(()=>{if(active&&operation&&['queued','running'].includes(operation.state)&&!loading&&!queryError){const timer=setTimeout(reload,4000);return()=>clearTimeout(timer);}},[active,operation?.id,operation?.version,operation?.state,loading,queryError,refresh]);
 useEffect(()=>{setAccepted(false);if(context&&context.signature!==signature)setContextError('A revisão, o pedido ou a persona mudou. Confira a versão novamente; seu motivo foi preservado.');},[signature]);
 useEffect(()=>{if(!active){setMode(null);setAccepted(false);}if(focus.current&&active){const element=focus.current==='confirmation'?confirmation.current:focus.current==='result'?result.current:trigger.current;if(element&&!element.hidden){element.focus({preventScroll:true});element.scrollIntoView({block:'nearest'});focus.current=null;}}},[active,mode,notice,queryError,context,contextError,op.error,op.pending]);

 async function inspect(){
  contextAbort.current?.abort();const controller=new AbortController();contextAbort.current=controller;const before=signature;setContextBusy(true);setContextError('');setAccepted(false);setContext(null);setMode(null);
  try{const value=await read<DevelopmentBuildContext>(base+'/context',controller.signal);if(value.storyId!==storyId||typeof value.token!=='string'||!Array.isArray(value.blockers))throw Error('O contexto da construção não corresponde à História.');if(!controller.signal.aborted){setContext({value,signature:before});setMode('build');focus.current='confirmation';if(latestSignature.current!==before)setContextError('O contexto mudou durante a consulta. Confira a versão novamente; seu motivo foi preservado.');}}
  catch(error){if(!controller.signal.aborted)setContextError(error instanceof Error?error.message:'Não foi possível conferir a versão para construir.');}
  finally{if(!controller.signal.aborted)setContextBusy(false);}
 }
 function review(next:Mode){setMode(next);setDecisionSignature(signature);setAccepted(false);focus.current='confirmation';}
 function back(){setMode(null);setAccepted(false);focus.current='trigger';}
 const available=authorized&&!unknownMetadata&&!op.pending&&!op.busy;
 const decisionAllowed=available&&accepted&&(mode==='build'?currentContext&&context!.value.allowed&&!working&&reason.trim().length>=10&&reason.trim().length<=2000:decisionSignature===signature&&(mode==='resume'?operation?.state==='paused'&&!operation.dispatchStartedAt:mode==='cancel'?(operation?.state==='queued'||operation?.state==='paused')&&!operation.dispatchStartedAt:false));
 function confirm(){
  if(!decisionAllowed)return;
  if(mode==='build')void op.send(base,{expectedStoryVersion:storyVersion,expectedOperationId:operation?.id??null,contextToken:context!.value.token,reason:reason.trim(),confirmed:true});
  else if(operation)void op.send(`${base}/${operation.id}/${mode}`,{expectedVersion:operation.version,confirmed:true});
 }
 const confirmationTitle=mode==='resume'?'Confirmar retomada da construção':mode==='cancel'?'Confirmar cancelamento da construção':'Confirmar construção DEV';
 const recover=!!op.pending||!!operation&&operation.state==='unknown';
 const feedback=<>{op.feedback}</>;
 const recovery=!active&&recover&&target?createPortal(<section className="alert development-build-recovery" aria-label="Recuperação da construção DEV" data-testid="development-build-recovery"><strong>A construção DEV desta História precisa de confirmação.</strong>{feedback}<button type="button" onClick={()=>callbacks.current.onReturn()}>Voltar à construção DEV</button></section>,target):null;
 return <>{recovery}<section className="development-build" hidden={!active} aria-label="Construção da versão DEV" data-testid="development-build">
  <h3>Construir versão de trabalho</h3><p>Gere um artefato da revisão integrada desta História. A publicação em DEV tem confirmação própria no quadro seguinte; não exige release.</p>
  <p className="hint">A fonte é o commit conferido no destino DEV, contendo a integração desta História e podendo incluir outras alterações já integradas nesse destino.</p>
  {loading&&<LoadingState>Consultando a construção DEV</LoadingState>}
  {queryError&&<ErrorState onRetry={reload}>{queryError}{(operation||artifact)&&<p>O último resultado conhecido foi preservado. Novas decisões aguardam uma consulta confirmada.</p>}</ErrorState>}
  {!loading&&!queryError&&data&&!data.configured&&<p className="hint">O executor de construção ainda não está configurado. Confira a versão para consultar os impedimentos.</p>}
  {active&&feedback}
  {notice&&<p role="status" className="alert success">{notice}</p>}
  <section ref={result} tabIndex={-1} aria-label="Resultado da construção DEV" data-testid="development-build-result">
   {operation?<><h4>{labels[operation.state]}</h4>{['blocked','failed','unknown'].includes(operation.state)?<ErrorState>{operation.message}</ErrorState>:<p>{['queued','running'].includes(operation.state)&&!queryError&&<Spinner/>}{operation.message}</p>}<p className="hint">Pedido {operation.number} · {operation.actorName} · atualizado em {displayDate(operation.updatedAt)}</p><details><summary>Referências do pedido de construção</summary><dl><div><dt>Commit solicitado</dt><dd><code>{operation.sourceSha}</code></dd></div><div><dt>Contrato</dt><dd><code>{operation.contractDigest}</code></dd></div><div><dt>Unidade</dt><dd>{operation.unitId}</dd></div><div><dt>Motivo registrado</dt><dd>{operation.reason}</dd></div></dl></details></>:!loading&&!queryError&&<p>Nenhuma construção solicitada nesta História.</p>}
   {artifact?.artifact&&<div className="development-build-artifact"><h4>Último artefato confirmado</h4><p>Construção confirmada em {displayDate(artifact.finishedAt)}. Este resultado não confirma publicação em DEV, testes ou Desenvolvimento Finalizado.</p><dl><div><dt>Commit do artefato</dt><dd><code>{artifact.sourceSha}</code></dd></div><div><dt>Imagem</dt><dd><code>{artifact.artifact.imageId}</code></dd></div></dl><details><summary>Integridade do artefato</summary><dl><div><dt>Digest do arquivo</dt><dd><code>{artifact.artifact.archiveDigest}</code></dd></div><div><dt>Tamanho</dt><dd>{artifact.artifact.size} bytes</dd></div><div><dt>Contrato da construção</dt><dd><code>{artifact.contractDigest}</code></dd></div></dl></details></div>}
  </section>
  {!persona?<p className="hint">Selecione uma persona no topo para solicitar a construção.</p>:!authorized&&<p className="hint">Esta consulta não autoriza solicitar ou alterar construções. Use a História atual com uma persona responsável pelo desenvolvimento.</p>}
  {contextError&&<ErrorState>{contextError}</ErrorState>}
  <div className="actions"><button ref={trigger} type="button" disabled={contextBusy||op.busy||!!op.pending} onClick={()=>void inspect()}>{contextBusy?'Conferindo versão…':'Conferir versão para construir'}</button><button type="button" disabled={loading||op.busy} onClick={reload}>Atualizar acompanhamento da construção</button></div>
  {operation?.state==='unknown'&&<p><button type="button" disabled={!authorized||op.busy||!!op.pending||unknownMetadata} onClick={()=>{focus.current='result';void op.send(`${base}/${operation.id}/reconcile`,{expectedVersion:operation.version});}}>Verificar resultado da construção</button></p>}
  {!op.pending&&operation?.state==='paused'&&!operation.dispatchStartedAt&&<p><button type="button" disabled={!available} onClick={()=>review('resume')}>Revisar retomada da construção</button></p>}
  {!op.pending&&operation&&['queued','paused'].includes(operation.state)&&!operation.dispatchStartedAt&&<p><button type="button" disabled={!available} onClick={()=>review('cancel')}>Revisar cancelamento da construção</button></p>}
  {mode&&<section ref={confirmation} tabIndex={-1} className="sw-confirmation development-build-confirmation" aria-label={confirmationTitle} data-testid="development-build-confirmation">
   <h4>{confirmationTitle}</h4>
   {mode==='build'&&context?<><p>Construir uma versão de trabalho da História <strong>{context.value.storyKey}</strong>, unidade <strong>{context.value.unitId||'não confirmada'}</strong>. A solicitação fixa o commit e o contrato abaixo.</p><dl><div><dt>Commit integrado</dt><dd><code>{context.value.sourceSha||'Não confirmado'}</code></dd></div><div><dt>Contrato da construção</dt><dd><code>{context.value.contractDigest||'Não confirmado'}</code></dd></div></dl><details><summary>Executor e origem da versão</summary><dl><div><dt>Repositório</dt><dd>{context.value.repositoryName||'Não confirmado'}</dd></div><div><dt>Branch de origem</dt><dd>{context.value.targetBranch||'Não confirmada'}</dd></div><div><dt>Runtime suportado</dt><dd>{context.value.runtime}</dd></div><div><dt>Política do executor</dt><dd>{context.value.policyVersion}</dd></div><div><dt>Executor</dt><dd>{context.value.executorReady?'Pronto nesta consulta':'Não confirmado'}</dd></div></dl><p className="hint">Consulta em {displayDate(context.value.asOf)}.</p></details>{(!context.value.allowed||context.value.blockers.length>0)&&<div className="alert"><strong>Construção impedida</strong><ul>{context.value.blockers.map((message,index)=><li key={index}>{message}</li>)}</ul></div>}<label htmlFor={`build-reason-${storyId}`}>Motivo da construção DEV<textarea id={`build-reason-${storyId}`} value={reason} maxLength={2000} rows={3} onChange={event=>{setReason(event.target.value);setAccepted(false);}}/></label></>:<p>{mode==='resume'?'Retomar a mesma intenção pausada, com a fonte original e sem criar outra construção.':'Cancelar somente a construção que ainda não foi enviada ao executor. Nenhum artefato será removido.'}</p>}
   {mode!=='build'&&decisionSignature!==signature&&<p role="status" className="hint">A operação mudou durante a confirmação. Volte ao acompanhamento e revise a decisão novamente.</p>}
   <label className="development-build-accept"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} disabled={!available||(mode==='build'?(!currentContext||!context?.value.allowed||working):decisionSignature!==signature)}/> {mode==='build'?'Conferi a revisão e autorizo construir este artefato de trabalho.':mode==='resume'?'Confirmo retomar a mesma construção pausada.':'Confirmo cancelar esta construção antes do envio ao executor.'}</label>
   <div className="actions"><button type="button" className="primary" disabled={!decisionAllowed} onClick={confirm}>{confirmationTitle}</button><button type="button" disabled={op.busy} onClick={back}>Voltar ao acompanhamento da construção</button></div>
  </section>}
 </section></>;
}
