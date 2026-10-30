'use client';
import {useEffect,useRef,useState} from 'react';
import type {BranchPreparationReading as Reading,BranchPreparationOperation as Operation} from '../../../packages/shared/src/release-branch-preparation';
import useOperation from './release-operation';
import {displayDate,ErrorState,LoadingState} from './experience-ui';

type Body={expectedVersion:number;decisionId:string;expectedContextToken:string;confirmed:true};
type Review={body:Body;persona:string;reading:Reading};
const states:Record<Operation['state'],string>={queued:'Preparação solicitada · na fila',running:'Preparação em andamento',succeeded:'Branch preparada no GitLab',blocked:'Preparação impedida',unknown:'Resultado da preparação não confirmado'};
export default function ReleaseBranchPreparation({releaseId,revision,decisionId,persona,role,blocked,planStale,analysisPending,enabled,onBlockingChange}:{releaseId:string;revision:number;decisionId?:string|null;persona:string;role?:string;blocked:boolean;planStale:boolean;analysisPending:boolean;enabled:boolean;onBlockingChange:(value:boolean)=>void}){
 const [data,setData]=useState<Reading|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[review,setReview]=useState<Review|null>(null),[rejected,setRejected]=useState(false),[receipt,setReceipt]=useState<Operation|null>(null);
 const panel=useRef<HTMLElement>(null),origin=useRef<HTMLButtonElement>(null),signature=`${releaseId}:${revision}:${decisionId??''}:${refresh}`,[loaded,setLoaded]=useState('');
 const op=useOperation(`release-branch:${releaseId}`,persona,result=>{setReceipt(result.operation);setReview(null);setRejected(false);setRefresh(value=>value+1);},{retryLabel:'Verificar recebimento da preparação',onRejected:()=>setRejected(true)});
 const busy=op.busy||!!op.pending,allowed=!!persona&&['admin','release_manager'].includes(role||''),remoteActive=!!data?.operation&&['queued','running'].includes(data.operation.state);
 useEffect(()=>{onBlockingChange(busy||!!review);return()=>onBlockingChange(false);},[busy,review,onBlockingChange]);
 useEffect(()=>{if(review){panel.current?.focus();panel.current?.scrollIntoView({block:'center'});}},[review]);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();setLoading(true);setError('');
  fetch(`/api/releases/${releaseId}/branch-preparation`,{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error?.message||'Não foi possível consultar a preparação.');if(value.releaseId!==releaseId||!Array.isArray(value.blockers))throw Error('Consulta da preparação indisponível nesta instalação.');return value as Reading;}).then(value=>{if(!controller.signal.aborted){setData(value);setLoaded(signature);setRejected(false);}}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[signature,enabled]);
 useEffect(()=>{if(!remoteActive||error)return;const timer=setTimeout(()=>setRefresh(value=>value+1),2000);return()=>clearTimeout(timer);},[remoteActive,data,error]);
 const stale=loaded!==signature||loading||!!error,same=!!review&&!stale&&!planStale&&!analysisPending&&!rejected&&review.persona===persona&&review.body.expectedContextToken===data?.contextToken&&review.body.decisionId===decisionId;
 function begin(){if(!data?.contextToken||!data.decision)return;op.clearError();setReview({persona,reading:data,body:{expectedVersion:data.releaseVersion,decisionId:data.decision.id,expectedContextToken:data.contextToken,confirmed:true}});}
 return <section ref={panel} tabIndex={-1} className="branch-plan-decision" aria-label="Preparação no GitLab">
  <h3>Preparação no GitLab</h3>
  {op.feedback}
  {receipt&&(receipt.id!==data?.operation?.id||receipt.state!==data?.operation?.state||stale)&&<p role="status">{receipt.message.startsWith('Consulta do resultado')?'Verificação do resultado solicitada':'Recebimento confirmado: preparação '+receipt.number}. A situação atual depende da consulta abaixo.</p>}
  {loading&&<LoadingState>Consultando a preparação registrada…</LoadingState>}
  {error&&<ErrorState onRetry={()=>setRefresh(value=>value+1)}>{error}</ErrorState>}
  {data&&stale&&<p role="status" className="sw-alert">Última leitura preservada, de {displayDate(data.asOf)}. A situação atual da preparação ainda não foi confirmada.</p>}
  {data?.operation&&<div role="status"><h4>{stale?'Na última leitura: ':''}{states[data.operation.state]}</h4><p>{data.operation.message}</p><p>Preparação {data.operation.number} · solicitada por {data.operation.actorName} em {displayDate(data.operation.createdAt)}.</p><p>Branch: <code>{data.operation.branchName}</code></p><p>Base autorizada: <code>{data.operation.baseSha}</code></p>{data.operation.checkedAt&&<p>Observado em {displayDate(data.operation.checkedAt)}: <code>{data.operation.observedSha||'branch não localizada'}</code> · {data.operation.protectionReady?'proteção confirmada nessa leitura':'proteção não confirmada nessa leitura'}.</p>}
   {['unknown','blocked'].includes(data.operation.state)&&<><p>Verificar consulta o GitLab para esta operação; não repete a criação ou muda seus parâmetros.</p><button type="button" disabled={!allowed||busy||stale||blocked} onClick={()=>void op.send(`/releases/${releaseId}/branch-preparations/${data.operation!.id}/reconcile`,{confirmed:true})}>Verificar resultado da preparação</button></>}
  </div>}
  {!review?<>
   <p>Prepare a referência Git a partir da decisão registrada. A confirmação conferirá a base, o acesso da conta dedicada e as regras aplicáveis antes de solicitar a execução.</p>
   {data&&data.blockers.length>0&&<ul>{data.blockers.map(message=><li key={message}>{message}</li>)}</ul>}
   {!allowed&&<p className="hint">Selecione Admin ou Release Manager para preparar a branch no GitLab.</p>}
   {analysisPending&&<p role="status">Consulte as alterações de base ou cenário antes de revisar a preparação.</p>}
   {planStale&&data?.contextToken&&<p role="status">Consulte no plano a base e o cenário da decisão registrada antes de revisar a preparação.</p>}
   {rejected&&<p role="status">Atualize a consulta da preparação e revise as condições antes de reenviar.</p>}
   <div className="actions"><button ref={origin} type="button" disabled={!allowed||blocked||busy||stale||planStale||analysisPending||rejected||!data?.contextToken||data.decision?.id!==decisionId} onClick={begin}>Preparar branch da release</button><button type="button" disabled={busy||loading||!!review} onClick={()=>setRefresh(value=>value+1)}>Atualizar consulta da preparação</button></div>
  </>:<section aria-label="Confirmação da preparação no GitLab"><h4>Confirmar preparação no GitLab</h4><p><strong>{review.reading.releaseKey}</strong> · composição {review.reading.decision?.compositionNumber} · decisão {review.reading.decision?.number}</p><p>Repositório: {review.reading.repositoryName}</p><p>Branch: <code>{review.reading.decision?.branchName}</code></p><p>Base fixa autorizada: <code>{review.reading.decision?.baseSha}</code></p><p>Proteção: sem push direto ou force push; merge permitido a Maintainers. A conta dedicada será conferida.</p><p>Esta operação cria a proteção e a referência autorizadas, quando ausentes. Não integra Histórias, monta pacote ou implanta em ambientes.</p>{!same&&<p role="status" className="sw-alert">O contexto ou a persona mudou. Volte, atualize a consulta e revise a preparação.</p>}
   <div className="actions"><button type="button" className="primary" disabled={!allowed||blocked||busy||!same} onClick={()=>void op.send(`/releases/${releaseId}/branch-preparation`,review.body)}>Confirmar preparação no GitLab</button><button type="button" disabled={busy} onClick={()=>{setReview(null);setTimeout(()=>origin.current?.focus(),0);}}>Voltar sem preparar</button></div>
  </section>}
 </section>;
}
