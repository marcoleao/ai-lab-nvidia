'use client';

import Link from 'next/link';
import {useEffect,useState,type ReactNode} from 'react';
import type {StoryDevProgress} from '../../../packages/shared/src/story-dev-progress';
import {LoadingState,displayDate} from './experience-ui';
import './story-execution-hub.css';

export type StoryExecutionCurrent={phase?:string;label?:string;kind?:string;who?:string;state:string;title:string;message?:string;updatedAt?:string};
export type StoryExecutionSignals={lastEventAt?:string|null;lastHeartbeatAt?:string|null;heartbeatStaleAfterMs?:number;provider?:string;stage?:string;waitingSince?:string;queuedAt?:string;startedAt?:string;queueReason?:string;legacy?:boolean};
export type StoryExecutionEvent={id:string;type?:string;title?:string;message?:string;createdAt?:string;timestamp?:string;activityId?:string;attemptId?:string};
export type StoryExecutionHubProps={
 storyId:string;active?:boolean;current?:StoryExecutionCurrent;signals?:StoryExecutionSignals;events?:StoryExecutionEvent[];
 preparation?:{preparation:{id:string;state:string;message?:string|null;sha:string}|null};
 run?:{id:string;state:string;stage:string;createdAt?:string}|null;devProgress?:StoryDevProgress;lastChecked?:string;
 stale?:boolean;loading?:boolean;readOnly?:boolean;actions:ReactNode;detailsHref:string;onRefresh:()=>void;
};

type Kind='build'|'deployment'|'test';
type Operation={id:string;number:number|null;state:string;message:string|null;actorName:string|null;createdAt:string|null;updatedAt:string|null;suiteScope?:'technical'|'acceptance';result?:'passed'|'failed'|null};
type Reading={storyId:string;configured:boolean;operation:Operation|null;preparation?:Operation|null;asOf:string|null};
type Source={data:Reading|null;error:boolean;checkedAt:string|null};
type Snapshot={storyId:string;checking:boolean;sources:Record<Kind,Source>};
const kinds:readonly Kind[]=['build','deployment','test'];
const names:Record<Kind,string>={build:'Construção DEV',deployment:'Publicação DEV',test:'Testes DEV'};
const states:Record<string,string>={queued:'Na fila',running:'Em execução',paused:'Pausado',blocked:'Impedido',failed:'Falhou',unknown:'Resultado não confirmado',succeeded:'Resultado registrado',cancelled:'Pedido cancelado',waiting_human:'Aguardando decisão humana',waiting_input:'Aguardando orientação humana',waiting_approval:'Aguardando aprovação',stale:'Contexto alterado',tracking:'Em acompanhamento'};
const EVENT_LIMIT=6;
const freshSnapshot=(storyId:string):Snapshot=>({storyId,checking:false,sources:{build:{data:null,error:false,checkedAt:null},deployment:{data:null,error:false,checkedAt:null},test:{data:null,error:false,checkedAt:null}}});
const validDate=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const date=(value?:string|null)=>validDate(value)?displayDate(value):'Não informado';
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const status=(value?:string)=>value?states[value]||'Situação não reconhecida':'Situação não informada';
function operationStatus(kind:Kind,operation:Operation){
 if(operation.state!=='succeeded')return status(operation.state);
 if(kind==='build')return 'Artefato confirmado';
 if(kind==='deployment')return 'Publicação confirmada';
 return operation.result==='passed'?operation.suiteScope==='acceptance'?'Suíte de aceitação aprovada':'Verificações técnicas aprovadas':'Resultado da suíte registrado';
}
function operationMessage(kind:Kind,operation:Operation){
 if(operation.state!=='succeeded')return operation.message||'O executor não informou uma mensagem neste pedido.';
 if(kind==='build')return 'Artefato confirmado neste pedido. Publicação, testes e aprovação têm acompanhamento próprio.';
 if(kind==='deployment')return 'Publicação confirmada neste pedido. A disponibilidade atual tem observação própria.';
 return 'A evidência pertence à suíte e à revisão deste pedido. A aceitação e a aprovação de desenvolvimento têm condições próprias.';
}
function parseOperation(value:unknown):Operation|null{
 if(!value||typeof value!=='object')return null;
 const source=value as Record<string,unknown>;
 if(!text(source.id)||!text(source.state))return null;
 return {id:source.id,state:source.state,number:typeof source.number==='number'&&Number.isSafeInteger(source.number)&&source.number>0?source.number:null,message:typeof source.message==='string'?source.message:null,actorName:typeof source.actorName==='string'?source.actorName:null,createdAt:validDate(source.createdAt)?source.createdAt:null,updatedAt:validDate(source.updatedAt)?source.updatedAt:null,...(source.suiteScope==='technical'||source.suiteScope==='acceptance'?{suiteScope:source.suiteScope}:{}),...(source.result==='passed'||source.result==='failed'?{result:source.result}:{})};
}
function parseReading(value:unknown,storyId:string):Reading|null{
 if(!value||typeof value!=='object')return null;
 const reading=value as Record<string,unknown>;
 if(reading.storyId!==storyId||typeof reading.configured!=='boolean'||!('operation'in reading))return null;
 const operation=reading.operation===null?null:parseOperation(reading.operation);
 if(reading.operation!==null&&!operation)return null;
 const preparation=reading.preparation===null?null:parseOperation(reading.preparation)||undefined;
 return {storyId,configured:reading.configured,operation,...('preparation'in reading?{preparation}:{}),asOf:validDate(reading.asOf)?reading.asOf:null};
}
function safeUrl(value?:string|null){
 if(!value)return null;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
async function read(storyId:string,kind:Kind,signal:AbortSignal):Promise<Reading>{
 const response=await fetch(`/api/items/${encodeURIComponent(storyId)}/development-${kind}`,{cache:'no-store',signal});
 if(!response.ok)throw Error('Consulta DEV não confirmada.');
 const body:unknown=await response.json();
 const reading=parseReading(body,storyId);
 if(!reading)throw Error('A leitura DEV não corresponde à História.');
 return reading;
}

export default function StoryExecutionHub({storyId,active=true,current,signals,events=[],run,preparation,devProgress,lastChecked,stale=false,loading=false,readOnly=false,actions,detailsHref,onRefresh}:StoryExecutionHubProps){
 const [snapshot,setSnapshot]=useState<Snapshot>(()=>freshSnapshot(storyId));
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  if(!active)return;
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  async function poll(){
   controller=new AbortController();
   setSnapshot(previous=>({...(previous.storyId===storyId?previous:freshSnapshot(storyId)),checking:true}));
   const results=await Promise.allSettled(kinds.map(kind=>read(storyId,kind,controller!.signal)));
   if(!alive)return;
   const checkedAt=new Date().toISOString();
   setSnapshot(previous=>{
    const next=previous.storyId===storyId?previous:freshSnapshot(storyId);
    const sources={...next.sources};
    results.forEach((result,index)=>{const kind=kinds[index];sources[kind]=result.status==='fulfilled'?{data:result.value,error:false,checkedAt}:{...sources[kind],error:true};});
    return {storyId,checking:false,sources};
   });
   timer=setTimeout(poll,4000);
  }
  void poll();
  return()=>{alive=false;controller?.abort();if(timer)clearTimeout(timer);};
 },[storyId,active,refresh]);

 if(!active)return null;
 const reading=snapshot.storyId===storyId?snapshot:freshSnapshot(storyId);
 const progress=devProgress?.storyId===storyId?devProgress:undefined;
 const failed=kinds.filter(kind=>reading.sources[kind].error);
 const liveUrl=!stale&&!loading?safeUrl(progress?.liveUrl):null;
 const heartbeatLate=validDate(signals?.lastHeartbeatAt)&&Date.now()-Date.parse(signals.lastHeartbeatAt)>(signals?.heartbeatStaleAfterMs??45000)&&['queued','running'].includes(current?.state||'');
 const recentEvents=events.map((event,index)=>({event,index,time:Date.parse(event.timestamp||event.createdAt||'')})).sort((a,b)=>(Number.isFinite(b.time)?b.time:0)-(Number.isFinite(a.time)?a.time:0)||a.index-b.index).slice(0,EVENT_LIMIT);
 const title=stale?'Situação atual não confirmada':progress?.title||current?.title||'Consultando a execução…';
 return <div className="story-execution-hub" data-testid="story-execution-hub">
  <section className="panel story-execution-observation" aria-label="Acompanhamento da execução">
   <h2>Acompanhamento da execução</h2>
   <p className="story-execution-state" role="status">{title}</p>
   {loading&&<LoadingState>Consultando a situação da História…</LoadingState>}
   {stale?<p className="story-execution-warning">A consulta atual não foi confirmada. A última leitura recebida foi preservada{validDate(lastChecked)?`, de ${date(lastChecked)}`:''}.</p>:<p>{progress?.message||current?.message||'Acompanhe os estados e sinais registrados nesta História.'}</p>}
   {liveUrl&&<div className="story-execution-dev-link"><a href={liveUrl} target="_blank" rel="noreferrer">Abrir aplicação em DEV ↗</a><p>{liveUrl}</p>{progress?.observedAt&&<p className="hint">Disponibilidade observada em {date(progress.observedAt)}.</p>}</div>}
   <p className="hint">Atualização automática enquanto esta página estiver aberta. O acompanhamento mostra sinais registrados, sem estimar progresso interno dos agentes.</p>
   <dl className="story-execution-facts">
    <div><dt>Atividade registrada</dt><dd>{current?.label||current?.title||'Ainda não informada'}{current&&<> · {status(current.state)}</>}</dd>{current?.updatedAt&&<dd className="hint">Atualizada em {date(current.updatedAt)}.</dd>}</div>
    <div><dt>Agente ou ferramenta informada</dt><dd>{signals?.provider||'Não informado nesta leitura.'}</dd>{(signals?.stage||run?.stage)&&<dd>Etapa informada: {signals?.stage||run?.stage}.</dd>}{current?.who&&<dd className="hint">Responsável pela decisão: {current.who}.</dd>}</div>
    <div><dt>Última consulta da História</dt><dd>{date(lastChecked)}</dd></div>
    <div><dt>Último sinal do executor</dt><dd>{date(signals?.lastHeartbeatAt)}</dd>{heartbeatLate&&<dd className="story-execution-warning">Sem confirmação recente do executor. Isso não confirma falha ou conclusão.</dd>}{signals?.queueReason&&<dd>{signals.queueReason}</dd>}</div>
   </dl>
   {preparation?.preparation&&<article className="story-execution-operation story-execution-merge-preparation" aria-label="Liberação para integração">
    <h3>Liberação para integração</h3>
    <p><strong>{stale?'Último resultado conhecido: ':''}{preparation.preparation.state==='succeeded'?'Liberação confirmada':status(preparation.preparation.state)}</strong></p>
    <p>{preparation.preparation.state==='succeeded'?'A liberação do Draft foi confirmada nesse pedido. A integração do código tem acompanhamento próprio.':preparation.preparation.message||'Acompanhe o pedido de liberação registrado.'}</p>
    <details><summary>Referências da liberação</summary><p>Pedido <code>{preparation.preparation.id}</code> · referência <code>{preparation.preparation.sha}</code>.</p>{preparation.preparation.message&&<p>{preparation.preparation.message}</p>}</details>
   </article>}
   <h3>Automações de DEV</h3>
   {failed.length>0&&<p className="story-execution-warning" role="status">A atualização de {failed.map(kind=>names[kind].toLowerCase()).join(', ')} não foi confirmada. As últimas leituras recebidas permanecem identificadas abaixo.</p>}
   <div className="story-execution-operations">{kinds.map(kind=>{
    const source=reading.sources[kind],operation=source.data?.operation;
    return <article key={kind} className="story-execution-operation" data-testid={`story-execution-operation-${kind}`}>
     <h4>{names[kind]}</h4>
     {!source.data?<p>{source.error?'Situação não confirmada.':'Consultando acompanhamento…'}</p>:<>
      <p><strong>{source.error?'Último resultado conhecido: ':''}{operation?operationStatus(kind,operation):source.data.configured?'Nenhum pedido registrado nesta leitura.':'Executor não configurado nesta leitura.'}</strong></p>
      {operation&&<details><summary>Detalhes do pedido</summary><p>{operationMessage(kind,operation)}</p><p className="hint">{operation.number?`Pedido ${operation.number}`:'Pedido sem número informado'}{operation.actorName?` · solicitado por ${operation.actorName}`:''}.</p><p className="hint">Criado em {date(operation.createdAt)} · atualizado em {date(operation.updatedAt)}.</p>{operation.state==='succeeded'&&operation.message&&<p>{operation.message}</p>}</details>}
      {source.data.preparation&&<div className="story-execution-target-preparation" aria-label="Preparação do destino DEV">
       <h5>Preparação do destino DEV</h5>
       <p><strong>{source.error?'Último resultado conhecido: ':''}{source.data.preparation.state==='succeeded'?'Recursos preparados':status(source.data.preparation.state)}</strong></p>
       <p>{source.data.preparation.state==='succeeded'?'Os recursos foram preparados nesse pedido. A publicação da aplicação tem acompanhamento próprio.':source.data.preparation.message||'O pedido de preparação não informou uma mensagem.'}</p>
       <p className="hint">{source.data.preparation.number?`Pedido ${source.data.preparation.number}`:'Pedido sem número informado'} · atualizado em {date(source.data.preparation.updatedAt)}.</p>
      </div>}
      <small className="hint">{source.data.asOf?`Leitura de ${date(source.data.asOf)}.`:`Instante da leitura remota não informado; recebida em ${date(source.checkedAt)}.`}</small>
     </>}
    </article>;
   })}</div>
   <details className="story-execution-events"><summary>Eventos recentes da atividade</summary>
    <p className="hint">Recorte de até {EVENT_LIMIT} eventos recebidos nesta leitura. Não representa o histórico completo da História.</p>
    {recentEvents.length?<ol>{recentEvents.map(({event})=><li key={event.id}><strong>{event.title||event.type||'Evento registrado'}</strong>{event.message&&event.message!==event.title&&<p>{event.message}</p>}<time>{date(event.timestamp||event.createdAt)}</time></li>)}</ol>:<p>Nenhum evento recebido nesta consulta.</p>}
    <Link href={detailsHref}>Consultar sinais e evidências →</Link>
   </details>
   <div className="story-execution-refresh"><button type="button" className="text-button" disabled={reading.checking} onClick={()=>{setRefresh(value=>value+1);onRefresh();}}>Atualizar acompanhamento</button></div>
  </section>
  <section className="panel story-execution-actions" aria-label="O que você pode fazer agora">
   <h2>O que você pode fazer agora</h2>
   <p className="hint">Escolha uma opção para abrir sua página de consulta ou revisão. A confirmação, quando disponível, acontece nessa página.</p>
   {readOnly&&<p className="story-execution-readonly">Contexto em modo de consulta. As operações continuam sujeitas às permissões e condições apresentadas na página da ação.</p>}
   {actions||<p>Nenhuma ação disponível nesta leitura. Consulte a situação e os impedimentos acima.</p>}
  </section>
 </div>;
}
