'use client';
import {useEffect,useRef,useState} from 'react';
import MergeDiscussion from './merge-discussion';
import QualityControl from './quality-control';
import {AlertCircle} from 'lucide-react';
import {Spinner,LoadingState,ErrorState,displayDate} from './experience-ui';
type Operation={id:string;state:string;sha:string;projectId:number;iid:number;sourceBranch:string;targetBranch:string;message:string|null;blocks:{category:string;message:string}[];origin:string|null;mergedBy:string|null;finishedAt:string|null};
type Attempt={key:string;persona:string;expectedSha:string;expectedVersion:number};
export default function MergeControl({executionId,sha,version,persona,url,onMerged,onState,onRefresh,onQuality}:{executionId:string;sha:string;version:number;persona:string;url:string;onMerged?:()=>void;onState?:(state:string)=>void;onRefresh?:()=>void;onQuality?:(state:string)=>void}){
 const [data,setData]=useState<{operation:Operation|null;configured:boolean;repositoryName?:string|null;guidance?:string;quality?:{ready:boolean;phases:{kind:string;label:string;passed:boolean}[]}}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[refresh,setRefresh]=useState(0),[attempt,setAttempt]=useState<Attempt|null>(null);
 const [discussionOpen,setDiscussionOpen]=useState(false),[discussionVisited,setDiscussionVisited]=useState(false);
 const storage=`sdlc-merge:${executionId}`;
 const [requestError,setRequestError]=useState('');
 const completed=useRef(onMerged);completed.current=onMerged;
 useEffect(()=>{try{const saved=sessionStorage.getItem(storage);if(saved)setAttempt(JSON.parse(saved));}catch{}},[storage]);
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;async function load(){try{const response=await fetch(`/api/executions/${executionId}/merge`,{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Não foi possível consultar o merge.');if(alive){setData(result);setError('');if(result.operation?.state==='succeeded'){setAttempt(null);try{sessionStorage.removeItem(storage);}catch{}completed.current?.();}}}catch(e){if(alive)setError(e instanceof Error?e.message:'A consulta do merge não chegou.');}finally{if(alive)timer=setTimeout(load,5000);}}void load();return()=>{alive=false;clearTimeout(timer);};},[executionId,refresh]);
 const operation=data?.operation,pending=operation&&['queued','running'].includes(operation.state),allowed=['admin','ana','bruno'].includes(persona);
 const blocked=operation?.state==='blocked'||operation?.state==='failed';
 const blockKey=blocked?operation.state+JSON.stringify(operation.blocks):'';
 const stateCallback=useRef(onState);stateCallback.current=onState;
 useEffect(()=>{if(operation)stateCallback.current?.(operation.state);},[operation?.state]);
 useEffect(()=>{if(blockKey){setDiscussionOpen(true);setDiscussionVisited(true);}},[blockKey]);
 function remember(value:Attempt|null){setAttempt(value);try{if(value)sessionStorage.setItem(storage,JSON.stringify(value));else sessionStorage.removeItem(storage);}catch{}}
 async function send(){
  if(busy||!allowed||!data?.quality?.ready||attempt&&attempt.persona!==persona)return;
  const current=attempt??{key:crypto.randomUUID(),persona,expectedSha:sha,expectedVersion:version};remember(current);setBusy(true);setRequestError('');
  try{const response=await fetch(`/api/executions/${executionId}/merge`,{method:'POST',headers:{'Content-Type':'application/json','X-Persona':current.persona,'Idempotency-Key':current.key},body:JSON.stringify({expectedSha:current.expectedSha,expectedVersion:current.expectedVersion})});const result=await response.json();if(!response.ok){if(response.status<500)remember(null);throw Error(result.error?.message||'A confirmação não chegou.');}remember(null);setData(previous=>previous?{...previous,operation:result.operation}:previous);setConfirm(false);setRefresh(n=>n+1);}
  catch(e){setRequestError(e instanceof Error?e.message:'O resultado não chegou. Verifique usando a mesma solicitação.');}finally{setBusy(false);}
 }
 return <div className="merge-control" data-discussion-open={discussionOpen} aria-label="Integração do Merge Request">
  {!data&&!error&&<LoadingState>Consultando as condições do merge…</LoadingState>}{busy&&<LoadingState>Confirmando a solicitação de merge…</LoadingState>}
  {operation?.state!=='succeeded'&&<QualityControl executionId={executionId} sha={sha} version={version} persona={persona} onState={onQuality} onRefresh={()=>{setRefresh(n=>n+1);onRefresh?.();}}/>}
  <div className="actions"><a href={url} target="_blank" rel="noreferrer">Revisar no GitLab ↗</a>{operation?.state!=='succeeded'&&<button type="button" disabled={!allowed||busy||(!attempt&&!!pending)||!data?.configured||!operation||!data?.quality?.ready} onClick={()=>attempt?void send():setConfirm(!confirm)}>{attempt?'Verificar resultado da solicitação':pending?'Merge em processamento…':blocked?'Reavaliar e solicitar merge':'Solicitar merge ao assistente'}</button>}<button type="button" aria-expanded={discussionOpen} onClick={()=>{setDiscussionOpen(!discussionOpen);setDiscussionVisited(true);}}>{discussionOpen?'Recolher conversa':'Conversar com a assistente sobre o merge'}</button></div>
  {operation?.state!=='succeeded'&&data&&!data.quality?.ready&&<p role="status" className="hint"><strong>Merge indisponível.</strong> Aguardando {(data.quality?.phases.filter(p=>!p.passed).map(p=>p.label)||['CODE REVIEW','SECURITY SCAN']).join(' e ')} aprovados para este mesmo commit. Publicar o MR, aprovar um pipeline ou conversar com a assistente não substitui essas fases.</p>}
  {!allowed&&<p className="hint">Selecione Administrador, Product Owner ou Arquiteto para solicitar o merge.</p>}
  {data&&!data.configured&&<p className="hint">A conta exclusiva sdlc-agent-for-merge ainda não está configurada. A revisão pelo GitLab continua disponível.</p>}
  {operation&&<p role="status" className={operation.state==='failed'?'experience-error-inline':undefined}>{pending&&!error&&<Spinner />}{operation.state==='failed'&&<AlertCircle size={16} aria-hidden="true" />}<strong>{operation.state==='succeeded'?'MERGED · Código integrado':operation.state.toUpperCase()}</strong>{operation.message&&!operation.blocks?.length&&` · ${operation.message}`}{operation.state==='succeeded'&&<span> · Origem: {operation.origin==='assistant'?'assistente':'GitLab'} · {operation.mergedBy||'Autor não informado'}{operation.finishedAt?' · '+displayDate(operation.finishedAt)+' · America/Sao_Paulo':''}</span>}</p>}
  {operation?.blocks?.length? <details><summary>Detalhes técnicos do bloqueio</summary><ul>{operation.blocks.map((block,i)=><li key={i}>{block.message}</li>)}</ul></details>:null}
  {discussionVisited&&<div hidden={!discussionOpen}><MergeDiscussion executionId={executionId} persona={persona} blocked={!!blocked} guidance={data?.guidance||operation?.message||'Vamos analisar as condições do Merge Request. Enviar mensagem não executa merge.'}/></div>}
  {confirm&&operation&&data?.quality?.ready&&<div className="merge-confirmation"><strong>Confirmar solicitação de integração</strong><p>Repositório: {data?.repositoryName||`Projeto GitLab #${operation.projectId}`} · MR !{operation.iid} · {operation.sourceBranch} → {operation.targetBranch}</p><p>Commit: <code>{operation.sha}</code></p><p>O assistente verificará as condições reais e integrará esta proposta ao destino somente se o GitLab permitir. A confirmação não remove bloqueios. A História não será concluída e nenhum deploy será iniciado.</p><div className="actions"><button type="button" className="primary" disabled={busy||!!pending||!allowed} onClick={()=>void send()}>Confirmar solicitação ao assistente</button><button type="button" onClick={()=>setConfirm(false)}>Cancelar</button></div></div>}
  {attempt&&attempt.persona!==persona&&<p className="hint">Selecione a persona original ({attempt.persona}) para recuperar a solicitação.</p>}
  {error&&<ErrorState onRetry={()=>setRefresh(n=>n+1)}>{error} Falha de consulta não confirma falha do merge.</ErrorState>}
  {requestError&&operation?.state!=='succeeded'&&<ErrorState>{requestError}{attempt&&' Confirmação pendente. Verifique o resultado com a mesma solicitação.'}</ErrorState>}
 </div>;
}
