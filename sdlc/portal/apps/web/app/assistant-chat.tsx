'use client';
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode,type RefObject} from 'react';
import {AlertTriangle,ArrowDown,ArrowUp,FileText} from 'lucide-react';
import {ErrorState,LoadingState,Spinner,displayDate} from './experience-ui';
import type {Proposal} from './assistant-plan';
import './assistant-chat.css';

export type ChatTurn={id:string;sequence?:number;kind?:'chat'|'plan';input:string;output:string|null;status:'queued'|'running'|'paused'|'succeeded'|'failed'|'cancelled';model:string|null;error:string|null;actorName:string;createdAt:string;updatedAt?:string};
type MessagePage={pageSize:20;total:number;hasOlder:boolean;hasNewer:boolean;firstSequence:number|null;lastSequence:number|null;latestSequence:number|null};
type Feed={contextId:string;turns:(ChatTurn&{sequence:number})[];page:MessagePage};
type Props={contextId:string;persona:string;ready:boolean;visible:boolean;initialBefore:number|null;revision:number;total?:number;latest:ChatTurn|null;draft:string;inputRef:RefObject<HTMLTextAreaElement|null>;onDraft:(value:string)=>void;onSubmit:(event:FormEvent)=>void;onCursor:(before:number|null)=>void;canSend:boolean;disabled:boolean;readOnly:boolean;busy:boolean;help:string;status:ReactNode;proposal:Proposal|null;onProposal:()=>void;onRecover:(turn:ChatTurn)=>void;canRecover:boolean;planningAction?:ReactNode;questions?:string[];delivery:boolean};
const signature=(turn:ChatTurn)=>[turn.id,turn.status,turn.output,turn.error].join('\u0000');
const labels:Record<ChatTurn['status'],string>={queued:'Na fila',running:'Gerando resposta',paused:'Rodada pausada',succeeded:'Resposta concluída',failed:'Falha na geração',cancelled:'Geração cancelada'};
function newest<T extends ChatTurn>(previous:T,incoming:T):T{const a=Date.parse(previous.updatedAt||''),b=Date.parse(incoming.updatedAt||'');return Number.isFinite(a)&&Number.isFinite(b)&&a>b?previous:incoming;}
function order(turns:(ChatTurn&{sequence:number})[]){const byId=new Map<string,ChatTurn&{sequence:number}>();for(const turn of turns){const previous=byId.get(turn.id);byId.set(turn.id,previous?newest(previous,turn):turn);}return [...byId.values()].sort((a,b)=>a.sequence-b.sequence);}
const validSequence=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>0;
async function readMessages(contextId:string,persona:string,signal:AbortSignal,bound?:{before:number}|{after:number}):Promise<Feed>{
 const query=new URLSearchParams({contextId,includeArchived:'true',...(bound?Object.fromEntries(Object.entries(bound).map(([key,value])=>[key,String(value)])):{} )});
 const response=await fetch(`/api/assistant/messages?${query}`,{headers:persona?{'X-Persona':persona}:{},cache:'no-store',signal});
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(typeof result?.error==='string'?result.error:result?.error?.message||'Não foi possível consultar as mensagens.');
 if(!result||!Array.isArray(result.turns)||!result.page||!Number.isSafeInteger(result.page.total)||result.page.total<0||typeof result.page.hasOlder!=='boolean'||typeof result.page.hasNewer!=='boolean'||!result.turns.every((turn:ChatTurn)=>turn.id&&validSequence(turn.sequence)&&typeof turn.input==='string'))throw Error('A consulta das mensagens está incompleta. Tente novamente.');
 return result;
}

export default function AssistantChat(props:Props){
 const {contextId,persona,ready,visible,initialBefore,revision,total,latest,draft,inputRef,onDraft,onSubmit,onCursor,canSend,disabled,readOnly,busy,help,status,proposal,onProposal,onRecover,canRecover,planningAction,questions=[],delivery}=props;
 const [feed,setFeed]=useState<Feed|null>(null),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[loadKind,setLoadKind]=useState<'initial'|'older'|'newer'>('initial'),[away,setAway]=useState(false),[hasNewAnswer,setHasNewAnswer]=useState(false),[announcement,setAnnouncement]=useState('');
 const feedRef=useRef(feed),root=useRef<HTMLDivElement>(null),composer=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),olderButton=useRef<HTMLButtonElement>(null),position=useRef(0),live=useRef(true),inFlight=useRef(false),controller=useRef<AbortController|null>(null),urlCursor=useRef(initialBefore),appliedRevision=useRef(revision),latestSignature=useRef(''),initialized=useRef(false),visibleRef=useRef(visible),personaRef=useRef(persona),mutation=useRef<{kind:'end'|'top'|'preserve'|'prepend';height:number;top:number;focus?:boolean}|null>(null);
 visibleRef.current=visible;personaRef.current=persona;
 const latestRef=useRef(latest);latestRef.current=latest;
 const nearEnd=()=>{const node=scroller.current;return !node||node.scrollHeight-node.clientHeight-node.scrollTop<90;};
 function recordScroll(){if(!visibleRef.current)return;position.current=scroller.current?.scrollTop||0;setAway(!nearEnd());if(nearEnd())setHasNewAnswer(false);}
 function jump(){const node=scroller.current;if(node){node.scrollTop=node.scrollHeight;position.current=node.scrollTop;}setAway(false);setHasNewAnswer(false);inputRef.current?.focus({preventScroll:true});}
 function resizeInput(){const node=inputRef.current;if(!node)return;node.style.height='auto';node.style.height=`${Math.min(node.scrollHeight,window.innerWidth<768?110:145)}px`;}
 async function load(kind:'initial'|'older'|'newer',cursor?:number|null){
  if(inFlight.current)return;inFlight.current=true;setLoading(true);setLoadKind(kind);setError('');const abort=new AbortController();controller.current=abort;
  try{
   const current=feedRef.current;const bound=kind==='initial'?cursor?{before:cursor}:undefined:kind==='older'?{before:current?.page.firstSequence||1}:{after:current?.page.lastSequence||0};
   const latestAtStart=latestRef.current?signature(latestRef.current):null;
   const result=await readMessages(contextId,personaRef.current,abort.signal,bound);
   if(!live.current||abort.signal.aborted)return;
   const node=scroller.current,height=node?.scrollHeight||0,top=visibleRef.current?node?.scrollTop||0:position.current,wasAtEnd=visibleRef.current&&nearEnd();
   const observed=latestRef.current,turns=(kind==='initial'?result.turns:order([...(feedRef.current?.turns||[]),...result.turns])).map(turn=>observed?.id===turn.id&&(observed.updatedAt&&turn.updatedAt||signature(observed)!==latestAtStart)?newest(turn,{...observed,sequence:turn.sequence}):turn);
   const latestSequence=Math.max(result.page.latestSequence||0,observed?.sequence||0)||null;
   const page={...result.page,latestSequence,firstSequence:turns.at(0)?.sequence??null,lastSequence:turns.at(-1)?.sequence??null,hasOlder:kind==='newer'?(feedRef.current?.page.hasOlder??result.page.hasOlder):result.page.hasOlder,hasNewer:turns.length?Number(turns.at(-1)?.sequence)<Number(latestSequence):result.page.hasNewer};
   mutation.current={kind:kind==='initial'?cursor?'top':'end':kind==='older'?'prepend':wasAtEnd?'end':'preserve',height,top,focus:kind==='older'};
   const next={...result,turns,page};feedRef.current=next;setFeed(next);initialized.current=true;setLoaded(true);
   if(kind==='older'){const before=bound&&'before' in bound?bound.before??null:null;urlCursor.current=before;onCursor(before);setAnnouncement(`${result.turns.length} interações anteriores carregadas. Posição de leitura preservada.`);}
   if(kind==='newer'&&result.turns.length){if(!wasAtEnd)setHasNewAnswer(true);setAnnouncement('Há novas interações disponíveis na conversa.');}
  }catch(failure){if(live.current&&!abort.signal.aborted)setError(failure instanceof Error?failure.message:'Não foi possível consultar as mensagens.');}
  finally{if(controller.current===abort){controller.current=null;inFlight.current=false;if(live.current)setLoading(false);}}
 }
 useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{
  if(!ready)return;
  if(initialized.current&&urlCursor.current===initialBefore)return;
  controller.current?.abort();controller.current=null;inFlight.current=false;urlCursor.current=initialBefore;initialized.current=false;setLoaded(false);appliedRevision.current=revision;
  void load('initial',initialBefore);
 // URL cursors restore the consulted slice. Locally prepended pages remain mounted.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,initialBefore]);
 useEffect(()=>{
  if(!initialized.current||!feedRef.current)return;
  if(latest&&latestSignature.current!==signature(latest)){
   latestSignature.current=signature(latest);const current=feedRef.current,index=current.turns.findIndex(turn=>turn.id===latest.id);
   if(index>=0){const node=scroller.current;mutation.current={kind:visibleRef.current&&nearEnd()?'end':'preserve',height:node?.scrollHeight||0,top:visibleRef.current?node?.scrollTop||0:position.current};const turns=current.turns.map((turn,i)=>i===index?newest(turn,{...latest,sequence:turn.sequence}):turn);feedRef.current={...current,turns};setFeed(feedRef.current);if(latest.status==='succeeded'){setAnnouncement('Resposta concluída.');if(!nearEnd())setHasNewAnswer(true);}}
  }
  let current=feedRef.current;
  if((latest?.sequence||0)>(current.page.latestSequence||0)||(total??0)>current.page.total){const latestSequence=Math.max(latest?.sequence||0,current.page.latestSequence||0)||null;current={...current,page:{...current.page,total:Math.max(total??0,current.page.total),latestSequence,hasNewer:Number(latestSequence)>(current.page.lastSequence||0)}};feedRef.current=current;setFeed(current);}
  if(appliedRevision.current!==revision||latest?.sequence&&latest.sequence>(current.page.lastSequence||0)){
   appliedRevision.current=revision;
   // A restored historical slice offers explicit continuation; live chat catches
   // up in real pages of 20 and keeps any remaining gap visible.
   if(urlCursor.current===null)void load('newer');
  }
 // Metadata is current state, never reconstructed from the loaded history page.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[revision,total,latest?.id,latest?.sequence,latest?.status,latest?.output,latest?.error,ready,loaded]);
 useLayoutEffect(()=>{
  if(!visible||!scroller.current)return;const node=scroller.current,change=mutation.current;
  if(change){node.scrollTop=change.kind==='end'?node.scrollHeight:change.kind==='top'?0:change.kind==='prepend'?change.top+node.scrollHeight-change.height:change.top;mutation.current=null;position.current=node.scrollTop;
   if(change.focus){const target=[...node.querySelectorAll<HTMLElement>('[data-chat-turn]')].find(element=>element.getBoundingClientRect().bottom>node.getBoundingClientRect().top+8);target?.focus({preventScroll:true});}}
  else node.scrollTop=position.current;
  setAway(!nearEnd());
 },[feed,visible]);
 useEffect(()=>{resizeInput();const resize=()=>resizeInput();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[draft,visible]);
 useEffect(()=>{const observer=new ResizeObserver(()=>{root.current?.style.setProperty('--assistant-composer-height',`${composer.current?.getBoundingClientRect().height||175}px`);});if(composer.current)observer.observe(composer.current);return()=>observer.disconnect();},[]);
 function submit(event:FormEvent){if(!canSend||busy||!draft.trim()){event.preventDefault();return;}urlCursor.current=null;onCursor(null);mutation.current={kind:'end',height:0,top:0};onSubmit(event);}
 const turns=feed?.turns||[],showArtifact=proposal&&!delivery;
 return <div ref={root} className={`assistant-chat${delivery?' assistant-chat-embedded':''}`}>
  <div ref={scroller} className="assistant-chat-scroll" tabIndex={0} aria-label="Mensagens da conversa, em ordem cronológica" onScroll={recordScroll}>
   <div className="assistant-chat-thread" role="log" aria-live="off" aria-label="Conversa do contexto">
    {loading&&!feed&&<LoadingState>Consultando conversa…</LoadingState>}
    {error&&<ErrorState onRetry={()=>void load(loadKind,initialBefore)}>{error} As mensagens já consultadas foram preservadas.</ErrorState>}
    {feed&&<div className="assistant-chat-coverage">{feed.page.hasOlder?<button ref={olderButton} type="button" disabled={loading} onClick={()=>void load('older')}>{loading&&loadKind==='older'?<Spinner/>:<ArrowUp size={13}/>}Carregar interações anteriores</button>:<span>Início da conversa</span>}<small>{turns.length} de {feed.page.total} interações carregadas · ordem cronológica</small></div>}
    {feed&&feed.page.total===0&&!loading&&!error&&<div className="assistant-chat-empty"><span className="assistant-chat-avatar" aria-hidden="true">A</span><h2>{delivery?'Converse sobre esta História':'O que você quer construir?'}</h2><p>{delivery?'Esclareça requisitos, critérios e evidências.':'Conte a necessidade. Vamos organizar a primeira História.'}</p>{!delivery&&<div className="assistant-chat-suggestions"><button type="button" disabled={disabled||readOnly} onClick={()=>{onDraft('Quero descrever uma funcionalidade e seus critérios de aceite.');inputRef.current?.focus();}}>Descrever uma funcionalidade<span>Comece pelo problema e pelo resultado esperado.</span></button><button type="button" disabled={disabled||readOnly} onClick={()=>{onDraft('Quero refinar os requisitos e as regras de uma História.');inputRef.current?.focus();}}>Refinar uma necessidade<span>Detalhe comportamento, regras e exceções.</span></button></div>}</div>}
    {feed&&feed.page.total>0&&!turns.length&&!loading&&!error&&<p className="assistant-help">Nenhuma interação nesta posição da conversa. Carregue as seguintes ou volte às interações mais recentes.</p>}
    {turns.map(turn=><article key={turn.id} data-chat-turn={turn.id} tabIndex={-1} className={`assistant-chat-exchange ${turn.status}`}>
     <div className="assistant-chat-human"><p>{turn.input}</p><small>{turn.actorName} · <time dateTime={turn.createdAt}>{displayDate(turn.createdAt)}</time></small></div>
     {(turn.output||turn.status!=='succeeded')&&<div className="assistant-chat-answer"><div className="assistant-chat-author"><span className="assistant-chat-avatar" aria-hidden="true">A</span>Assistente SDLC</div>{turn.output&&<div className="assistant-chat-content">{turn.kind==='plan'&&!turn.output.startsWith('Criados no Projeto ')?turn.status==='succeeded'?'Proposta estruturada gerada. Consulte a proposta para revisar o escopo e confirmar a criação.':'A geração não produziu uma proposta válida. Consulte o motivo abaixo.':turn.status==='succeeded'?turn.output:<><p>A resposta desta rodada não foi validada. Confira a situação atual da solicitação antes de concluir se houve criação ou alteração de itens.</p><details><summary>Consultar resposta não validada</summary><pre tabIndex={0}>{turn.output}</pre></details></>}</div>}{turn.status!=='succeeded'&&<p className={`assistant-chat-turn-state ${turn.status}`}>{['queued','running'].includes(turn.status)&&<Spinner/>}{turn.status==='failed'&&<AlertTriangle size={15} aria-hidden="true"/>}{labels[turn.status]}</p>}{turn.error&&<p className="assistant-error">{turn.error}</p>}{turn.kind!=='plan'&&['failed','cancelled'].includes(turn.status)&&<button type="button" className="assistant-chat-recover" disabled={!canRecover} onClick={()=>onRecover(turn)}>Recuperar mensagem no rascunho</button>}</div>}
    </article>)}
    {feed?.page.hasNewer&&<div className="assistant-chat-gap"><p>Há interações mais recentes ainda não carregadas.</p><button type="button" disabled={loading} onClick={()=>void load('newer')}>{loading&&loadKind==='newer'&&<Spinner/>}Carregar interações seguintes</button><button type="button" disabled={loading} onClick={()=>{urlCursor.current=null;onCursor(null);void load('initial',null);}}>Voltar às mais recentes</button></div>}
    {showArtifact&&<div className="assistant-chat-artifact"><button type="button" onClick={onProposal} aria-label={`Revisar proposta: ${proposal.content.summary||'Proposta de Histórias'}`}><FileText size={24}/><span><strong>{proposal.content.summary||'Proposta de Histórias'}</strong><small>Proposta atual · revisão {proposal.version} · {proposal.status==='applied'?'Aplicada':'Para revisão'}</small></span><span aria-hidden="true">→</span></button><p>{proposal.status==='applied'?'Consulte o recibo e os itens confirmados.':'Confira o escopo antes de criar os itens.'}</p></div>}
    {questions.length>0&&<section className="assistant-chat-questions" aria-label="Perguntas atuais da entrevista"><h3>O que falta esclarecer</h3><p>Estes pontos pertencem ao resumo atual, independentemente das mensagens consultadas. Responda na conversa para continuar o planejamento.</p><ul>{questions.map((question,index)=><li key={index}>{question}</li>)}</ul><button type="button" className="text-button" disabled={disabled||readOnly} onClick={()=>inputRef.current?.focus()}>Responder às perguntas</button></section>}
    {!delivery&&planningAction&&<div className="assistant-chat-planning">{planningAction}</div>}
   </div>
  </div>
  {away&&<button type="button" className="assistant-chat-jump" onClick={jump}>{hasNewAnswer?'Nova resposta':'Ir para as últimas mensagens'}<ArrowDown size={14}/></button>}
  <div ref={composer} className="assistant-chat-composer"><div className="assistant-chat-composer-inner">{status}<form className="assistant-chat-compose" onSubmit={submit}><label className="sr-only" htmlFor="assistant-message">Sua mensagem</label><textarea ref={inputRef} id="assistant-message" maxLength={4000} rows={2} value={draft} readOnly={readOnly} disabled={disabled} onChange={event=>onDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&window.matchMedia('(min-width:768px)').matches){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} placeholder={delivery?'Pergunte sobre esta História, critérios ou evidências…':'Converse sobre o que você quer construir…'} aria-describedby="assistant-message-help"/><div className="assistant-chat-compose-actions"><small>{draft.length}/4000<span className="assistant-chat-key-hint"> · Enter envia · Shift + Enter quebra linha</span></small><button type="submit" className="primary assistant-chat-send" aria-label="Enviar mensagem" title="Enviar mensagem" disabled={!canSend||busy||!draft.trim()}>{busy?<Spinner/>:<ArrowUp size={20}/>}</button></div></form><p id="assistant-message-help" className="assistant-chat-help">{help}</p></div></div>
  <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
 </div>;
}
