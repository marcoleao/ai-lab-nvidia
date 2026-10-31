'use client';
import {useEffect,useRef,useState,type ReactNode,type FormEvent} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {FileText,History,Info,MessageSquare} from 'lucide-react';
import {ErrorState,LoadingState,Pagination,Spinner,displayDate} from './experience-ui';
import PlanReview,{readPendingProposalRequests,type Proposal,type Repository} from './assistant-plan';
import {assistantAttemptRequest,assistantView,emptyAssistantSession,restoreAssistantSession,type AssistantAttempt,type AssistantSession,type AssistantView} from './assistant-session';
import './assistant.css';
import AssistantChat,{type ChatTurn} from './assistant-chat';
import AssistantApplicationPreparation,{validAssistantSystemAction} from './assistant-application-preparation';
import type {AssistantSystemAction} from '../../../packages/shared/src/assistant-system-actions';
import AssistantDevActionDialog,{validAssistantDevAction} from './assistant-dev-action';
import type {AssistantDevAction} from '../../../packages/shared/src/assistant-dev-actions';

type Props={contextKey:string;contextLabel:string;contextId:string|null;persona:string;role?:string;canPlan:boolean;embedded?:boolean;targetProjectId?:string;targetProjectName?:string;onConversation?:(value:Conversation)=>void;onProposal?:(value:Proposal|null)=>void;proposalSummary?:ReactNode;assistantMode?:'planning'|'delivery';readOnly?:boolean;devActionsActive?:boolean};
type Turn=ChatTurn;
type PageInfo={page:number;pageSize:number;total:number;totalPages:number;hasMore:boolean};
type BlockedBy={id:string;kind:string;key:string;name:string;status?:string;projectLifecycle?:string|null;lifecycle?:string;archived?:boolean};
export type Conversation={devAction?:AssistantDevAction|null;systemAction?:AssistantSystemAction|null;context:{id:string;kind:string;name:string;version:number;systemId?:string;status?:string;projectLifecycle?:string|null;archived?:boolean;lifecycle?:string};session:{id:string;version:number}|null;turns:Turn[];targetProjects?:{id:string;name:string}[];proposals?:Proposal[];currentProposal?:Proposal|null;latestTurn?:Turn|null;availableRepositories?:Repository[];configured:boolean;model:string|null;requirementsMode?:boolean;assistantMode?:'planning'|'delivery';readOnly?:boolean;readOnlyReason?:string|null;blockedBy?:BlockedBy|null;hierarchy?:{writable:boolean;reason?:string};capabilities?:{canMessage:boolean;canGeneratePlan:boolean;canComplete:boolean;canApplyPlan:boolean;canEditPlan:boolean;canCancelTurn:boolean};activeTurn?:Turn|null;hasSuccessfulInterview?:boolean;turnsPage?:PageInfo;proposalsPage?:PageInfo;brief?:{summary:string;confirmedFacts:string[];openQuestions:string[]}|null};
class ApiError extends Error{constructor(message:string,public status:number){super(message);}}
async function call<T>(path:string,persona='',body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(persona?{'X-Persona':persona}:{}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(typeof result.error==='string'?result.error:result.error?.message||result.message||`Não foi possível concluir a operação (${response.status}).`,response.status);
 return result as T;
}
const states:Record<Turn['status'],string>={queued:'QUEUED · aguardando geração',running:'RUNNING · gerando resposta',paused:'PAUSED · aguardando retomada explícita',succeeded:'SUCCEEDED · resposta concluída',failed:'FAILED · falha na geração',cancelled:'CANCELLED · geração cancelada'};
const processing=(turn:Turn)=>['queued','running'].includes(turn.status);
const activeState=(turn:Turn)=>processing(turn)||turn.status==='paused';
function failedGenerationAfterProposal(turn:Turn|null|undefined,proposal:Proposal|null|undefined){
 if(turn?.kind!=='plan'||turn.status!=='failed'||proposal?.turnId===turn.id)return null;
 if(!proposal)return turn;
 // A late failure from an older request must not displace a newer proposal.
 // Sequence numbers belong to a session; proposals may originate in another one.
 const requestedAt=Date.parse(turn.createdAt),proposedAt=Date.parse(proposal.createdAt);
 return Number.isFinite(requestedAt)&&Number.isFinite(proposedAt)&&requestedAt>proposedAt?turn:null;
}
const pageNumber=(value:string|null)=>{const number=Number(value||1);return Number.isSafeInteger(number)&&number>0?number:1;};
const lifecycleHref=(item:{id:string;kind:string})=>`/${({system:'systems',project:'projects',epic:'epics',story:'stories',task:'tasks'} as Record<string,string>)[item.kind]||'projects'}/${encodeURIComponent(item.id)}?tab=planning`;
export default function Assistant(props:Props){return <ConversationPanel key={props.contextKey} {...props}/>;}

function ConversationPanel({contextLabel,contextId,persona,role='',canPlan:permission,targetProjectId,targetProjectName,onConversation,onProposal,proposalSummary,assistantMode='planning',readOnly=false,devActionsActive=true}:Props){
 const router=useRouter(),pathname=usePathname(),search=useSearchParams();
 const page=pageNumber(search.get('assistant.page')),proposalsPage=pageNumber(search.get('assistant.proposalsPage'));
 const storage=`sdlc-assistant-workspace:${contextId||'none'}`;
 const [saved,setSaved]=useState(()=>emptyAssistantSession(contextId||'')),savedRef=useRef(saved),restored=useRef(false);
 const [data,setData]=useState<Conversation|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[storageError,setStorageError]=useState(''),[refresh,setRefresh]=useState(0),[pendingPlans,setPendingPlans]=useState<ReturnType<typeof readPendingProposalRequests>>([]),[recoveryPlans,setRecoveryPlans]=useState<Proposal[]>([]);
 const planPending=pendingPlans.length>0;
 const [creationMode,setCreationMode]=useState<'review'|'create'>('review'),[confirmed,setConfirmed]=useState(false);
 const historicalId=search.get('assistant.proposal')||null;
 const historyKind=search.get('assistant.source')==='proposals'||(!search.has('assistant.source')&&proposalsPage>1)?'proposals':'messages';
 const input=useRef<HTMLTextAreaElement>(null),tabs=useRef<(HTMLButtonElement|null)[]>([]),commandInFlight=useRef(false);
 const summaryDialog=useRef<HTMLDialogElement>(null),focusTarget=useRef<{view:AssistantView;composer:boolean;origin:Element|null}|null>(null),focusFrame=useRef<number|null>(null);
 const callbacks=useRef({onConversation,onProposal});callbacks.current={onConversation,onProposal};
 function refreshPendingPlans(){const requests=contextId?readPendingProposalRequests(contextId):[];setPendingPlans(requests);setRecoveryPlans(previous=>{const kept=previous.filter(proposal=>requests.some(entry=>entry.proposalId===proposal.id)||(proposal.id!==currentRef.current?.id&&proposal.id!==historicalId));const extra=requests.flatMap(entry=>entry.proposal&&!kept.some(proposal=>proposal.id===entry.proposalId)?[entry.proposal]:[]);return extra.length||kept.length!==previous.length?[...kept,...extra]:previous;});}
 useEffect(()=>{refreshPendingPlans();},[contextId,persona]);
 const currentRef=useRef<Proposal|null>(null),latestRef=useRef<Turn|null>(null),notified=useRef('');
 const update=(change:(value:AssistantSession)=>AssistantSession)=>{const next=change(savedRef.current);savedRef.current=next;setSaved(next);if(restored.current)try{sessionStorage.setItem(storage,JSON.stringify(next));setStorageError('');}catch{setStorageError('O navegador não conseguiu preservar esta sessão. Mantenha a página aberta e libere o armazenamento antes de enviar.');return false;}return true;};
 useEffect(()=>{let value=emptyAssistantSession(contextId||'');try{value=restoreAssistantSession(sessionStorage.getItem(storage),contextId||'',persona,assistantMode);}catch{}savedRef.current=value;setSaved(value);restored.current=true;return()=>{restored.current=false;};
 // Persona changes must not hide an unresolved request from its original actor.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[storage]);
 const delivery=assistantMode==='delivery'||data?.assistantMode==='delivery',pending=saved.pending;
 const requestedView=assistantView(search.get('assistant.view'))??(page>1||proposalsPage>1?'history':saved.view);
 const view:AssistantView=delivery?'conversation':requestedView==='history'&&historyKind==='messages'?'conversation':requestedView;
 const writable=permission&&!readOnly&&!data?.readOnly;
 const active=data?.activeTurn===undefined?data?.turns.find(activeState)??null:data.activeTurn;
 const latest=data?.latestTurn===undefined?latestRef.current:data.latestTurn;
 const currentProposal=data?.currentProposal===undefined?currentRef.current:data.currentProposal;
 const displayedProposal=historicalId?(data?.proposals||[]).find(proposal=>proposal.id===historicalId)??null:currentProposal;
 const failedGeneration=active?null:failedGenerationAfterProposal(latest,currentProposal);
 const questions=data?.brief?.openQuestions||[],hasInterview=data?.hasSuccessfulInterview??Boolean(data?.turns.some(turn=>turn.kind!=='plan'&&turn.status==='succeeded'));
 const draft=pending?.kind==='message'?pending.message:saved.drafts[persona]||'';
 const canMessage=writable&&Boolean(persona)&&Boolean(data?.configured)&&!active&&!planPending&&(data?.capabilities?.canMessage??true);
 const canGenerate=writable&&!loading&&!connectionError&&Boolean(persona)&&Boolean(data?.configured)&&hasInterview&&!active&&!planPending&&data?.context.kind==='project'&&(data?.capabilities?.canGeneratePlan??true)&&!questions.length;
 const hasPlanningDestination=data?.context.kind==='project'||Boolean(targetProjectId);
 const canComplete=hasPlanningDestination&&writable&&Boolean(persona)&&Boolean(data?.configured)&&hasInterview&&!active&&!planPending&&!questions.length&&(data?.capabilities?.canComplete??true);
 const canCancel=writable&&Boolean(persona)&&Boolean(active)&&!planPending&&(data?.capabilities?.canCancelTurn??true);
 const blockedBy=data?.blockedBy||data?.context||null;
 const readOnlyReason=data?.readOnlyReason||data?.hierarchy?.reason||'Este contexto está em somente leitura. Consulte o agrupador responsável para continuar.';
 function navigate(values:Record<string,string|number>){const params=new URLSearchParams(search.toString());for(const [key,value] of Object.entries(values))value===''?params.delete(`assistant.${key}`):params.set(`assistant.${key}`,String(value));router.push(`${pathname}?${params}`,{scroll:false});}
 function settleFocus(request:NonNullable<typeof focusTarget.current>){
  if(focusFrame.current!==null)cancelAnimationFrame(focusFrame.current);
  focusFrame.current=requestAnimationFrame(()=>{
   focusFrame.current=null;if(focusTarget.current!==request)return;focusTarget.current=null;
   // Navigation may finish after the user has already focused another control.
   // A delayed focus request must not redirect the next keyboard activation.
   if(document.activeElement!==request.origin&&document.activeElement!==document.body)return;
   const destination=request.composer||request.view==='conversation'?input.current:tabs.current[(['conversation','proposal','history'] as const).indexOf(request.view)];
   destination?.focus({preventScroll:true});
  });
 }
 function requestFocus(next:AssistantView,composer=false){
  if(focusFrame.current!==null){cancelAnimationFrame(focusFrame.current);focusFrame.current=null;}
  const request={view:next,composer,origin:document.activeElement};focusTarget.current=request;
  if(next===view)settleFocus(request);
 }
 function show(next:AssistantView,focusComposer=false){requestFocus(next,focusComposer);update(value=>({...value,view:next}));navigate({view:next,proposal:'',...(next==='history'?{source:'proposals'}:{})});}
 function showCurrentProposal(){show('proposal');}
 function reviewGenerationFailure(){requestFocus('conversation',true);update(value=>({...value,view:'conversation'}));navigate({view:'conversation',page:1,before:'',proposal:''});}
 function consultProposal(id:string){requestFocus('proposal');update(value=>({...value,view:'proposal'}));navigate({view:'proposal',proposal:id});}
 useEffect(()=>{const request=focusTarget.current;if(!request||request.view!==view)return;settleFocus(request);return()=>{if(focusFrame.current!==null){cancelAnimationFrame(focusFrame.current);focusFrame.current=null;}};},[view]);
 useEffect(()=>()=>{if(focusFrame.current!==null)cancelAnimationFrame(focusFrame.current);focusTarget.current=null;},[]);
 useEffect(()=>{
  if(!contextId)return;let live=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();setLoading(true);
  const load=async()=>{try{
   const result=await call<Conversation>(`/assistant?${new URLSearchParams({contextId,page:String(page),proposalsPage:String(proposalsPage),includeArchived:'true'})}`,persona,undefined,undefined,controller.signal);
   if(!live)return;if(!result.context||!Array.isArray(result.turns))throw Error('A consulta da conversa está incompleta. Atualize novamente.');
   if(result.context.kind==='system'&&result.systemAction!==undefined&&result.systemAction!==null&&!validAssistantSystemAction(result.systemAction,result.context.id))throw Error('A situação da preparação está incompleta ou pertence a outro Sistema. Atualize a consulta antes de decidir.');
   if(result.devAction!==undefined&&result.devAction!==null&&!validAssistantDevAction(result.devAction,result.context))throw Error('A situação DEV está incompleta ou pertence a outro contexto. Atualize a conversa antes de decidir.');
   if(result.currentProposal!==undefined)currentRef.current=result.currentProposal;else if(proposalsPage===1)currentRef.current=result.proposals?.[0]??null;
   if(result.latestTurn!==undefined)latestRef.current=result.latestTurn;else if(page===1)latestRef.current=result.turns.at(-1)??null;
   setData(result);setLoading(false);setConnectionError('');callbacks.current.onConversation?.(result);timer=setTimeout(load,result.activeTurn&&processing(result.activeTurn)?2000:8000);
  }catch(failure){if(!live||controller.signal.aborted)return;setLoading(false);setConnectionError(failure instanceof Error?failure.message:'A consulta não chegou.');timer=setTimeout(load,8000);}};
  void load();return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[contextId,persona,page,proposalsPage,refresh]);
 useEffect(()=>{callbacks.current.onProposal?.(displayedProposal??null);},[displayedProposal]);
 useEffect(()=>{setConfirmed(false);},[persona,targetProjectId,data?.session?.version]);
 useEffect(()=>{if(latest?.status==='succeeded'&&latest.output?.startsWith('Criados no Projeto ')&&notified.current!==latest.id){notified.current=latest.id;window.dispatchEvent(new Event('sdlc-plan-applied'));}},[latest?.id,latest?.status,latest?.output]);
 async function execute(attempt:AssistantAttempt){
  if(!contextId||commandInFlight.current||attempt.persona!==persona)return;
  if(!update(value=>({...value,pending:attempt})))return;commandInFlight.current=true;setBusy(true);setError('');
  try{const request=assistantAttemptRequest(contextId,attempt);const receipt=await call<{turn?:Turn;cancelled?:boolean}>(request.path,attempt.persona,request.body,attempt.key);
   if(attempt.kind==='cancel'?receipt.cancelled!==true:!receipt.turn?.id||!receipt.turn.status)throw Error('A resposta não confirmou a operação solicitada.');
   update(value=>({...value,pending:null,drafts:attempt.kind==='message'?{...value.drafts,[attempt.persona]:''}:value.drafts}));if(!restored.current)return;setConfirmed(false);setRefresh(value=>value+1);
   if(attempt.kind==='message'){update(value=>({...value,view:'conversation'}));navigate({view:'conversation',page:1,before:'',proposal:''});}
   if(attempt.kind==='plan'||attempt.kind==='complete')showCurrentProposal();
  }catch(failure){const uncertain=!(failure instanceof ApiError)||failure.status>=500;if(!uncertain)update(value=>({...value,pending:null}));setError(`${failure instanceof Error?failure.message:'Falha de conexão.'}${uncertain?' A confirmação não chegou. Verifique a mesma solicitação, sem duplicá-la.':''}`);setRefresh(value=>value+1);
  }finally{commandInFlight.current=false;setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();if(!data||!canMessage||pending||busy||!draft.trim())return;void execute({kind:'message',message:draft.trim(),expectedVersion:data.session?.version||0,key:crypto.randomUUID(),persona,mode:delivery?'delivery':'planning'});}
 function generatePlan(){if(!data||!canGenerate||pending||busy)return;void execute({kind:'plan',expectedVersion:data.session?.version||0,key:crypto.randomUUID(),persona});}
 function completeInterview(){const projectId=data?.context.kind==='project'?data.context.id:targetProjectId;if(!data||!projectId||!canComplete||pending||busy||!confirmed)return;void execute({kind:'complete',projectId,expectedVersion:data.session?.version||0,key:crypto.randomUUID(),persona});}
 const verificationLabel=pending?.kind==='message'?'Confirmar envio':pending?.kind==='plan'?'Confirmar geração do plano':pending?.kind==='complete'?'Verificar criação':'Verificar cancelamento';
 function proposalEditor(proposal:Proposal,historical=false){return <PlanReview key={`${proposal.id}:${historical?'history':'current'}`} proposal={proposal} contextId={contextId??undefined} projectId={proposal.projectId??(data?.context.kind==='project'?data.context.id:targetProjectId)} projectName={proposal.project?.name??(data?.context.kind==='project'?data.context.name:targetProjectName||contextLabel)} projectVersion={data?.context.version??0} sessionVersion={data?.session?.version||0} repositories={data?.availableRepositories||[]} persona={persona} canEdit={hasPlanningDestination&&writable&&Boolean(persona)&&!pending&&!planPending&&!historical&&(data?.capabilities?.canEditPlan??true)} canApply={hasPlanningDestination&&writable&&Boolean(persona)&&!pending&&!planPending&&(data?.capabilities?.canApplyPlan??true)} historical={historical} onPendingChange={refreshPendingPlans} onRefresh={()=>{refreshPendingPlans();setRefresh(value=>value+1);}}/>;}

 const beforeText=search.get('assistant.before'),beforeValue=Number(beforeText);
 const invalidCursor=beforeText!==null&&(!/^[1-9]\d*$/.test(beforeText)||!Number.isSafeInteger(beforeValue)||beforeValue>2147483647);
 const initialBefore=!invalidCursor&&beforeText!==null?beforeValue:page>1&&(data?.turnsPage?.page??page)>1&&data?.turns.at(-1)?.sequence?Math.min(data.turns.at(-1)!.sequence!+1,2147483647):null;
 const currentState=<div className="assistant-current-state">
   {invalidCursor&&<ErrorState><p>O cursor da conversa é inválido. Volte às interações mais recentes para continuar.</p><button type="button" onClick={()=>navigate({before:'',page:1})}>Voltar às mais recentes</button></ErrorState>}
   {(readOnly||data?.readOnly)&&<p className="assistant-readonly"><strong>Somente leitura.</strong> {readOnlyReason} {blockedBy&&<Link href={lifecycleHref(blockedBy)}>Consultar {blockedBy.kind==='system'?'Sistema':blockedBy.kind==='project'?'Projeto':'agrupador'} responsável →</Link>}</p>}
   {active&&<div className={`assistant-operation-state ${active.status}`} role="status"><p>{processing(active)&&<Spinner/>}<strong>{states[active.status]}</strong>{active.status==='paused'?' A reativação do agrupador não retoma a rodada automaticamente. Abra Execução para retomar os trabalhos pausados.':' A atividade atual continua identificada ao consultar o histórico.'}</p>{active.status==='paused'&&blockedBy&&<Link href={lifecycleHref(blockedBy)}>Abrir Execução para retomar →</Link>}{canCancel&&<button type="button" disabled={busy||Boolean(pending)} onClick={()=>void execute({kind:'cancel',turnId:active.id,key:crypto.randomUUID(),persona})}>Cancelar geração</button>}</div>}
   {pending&&<div className="assistant-pending-request" role="status"><p><strong>Solicitação aguardando confirmação.</strong> Persona de origem: {pending.persona}. O corpo e a identidade do pedido foram preservados.</p><button type="button" disabled={busy||pending.persona!==persona} onClick={()=>void execute(pending)}>{busy&&<Spinner/>}{verificationLabel}</button>{pending.persona!==persona&&<p>Selecione a mesma persona para verificar esta solicitação.</p>}</div>}
   {planPending&&<div className="assistant-pending-request" role="status"><p>Há {pendingPlans.length} operação(ões) de proposta aguardando confirmação. Verifique a mesma solicitação antes de iniciar outra.</p><button type="button" onClick={showCurrentProposal}>Abrir propostas pendentes</button></div>}
   {connectionError&&<ErrorState onRetry={()=>setRefresh(value=>value+1)}><strong>A atualização da conversa não chegou.</strong><p>{connectionError} O último resultado confirmado e os rascunhos foram preservados.</p></ErrorState>}
   {error&&<ErrorState>{error}</ErrorState>}{storageError&&<ErrorState>{storageError}</ErrorState>}{busy&&<LoadingState>Confirmando solicitação…</LoadingState>}{data&&!data.configured&&<ErrorState>A IA local não está configurada. O conteúdo registrado continua disponível para consulta.</ErrorState>}
  </div>;
 const messageHelp=!permission||!persona?'Selecione Admin, Product Owner ou Arquiteto para conversar.':data?.readOnly||readOnly?readOnlyReason:pending?'Verifique a solicitação pendente antes de iniciar outra.':planPending?'Há uma operação de proposta aguardando confirmação.':active?.status==='paused'?'A rodada está pausada. A retomada é explícita na Execução.':active?'Aguarde a resposta ou cancele a geração atual.':delivery?'Conversa consultiva desta História. Mensagens não aprovam gates nem executam ações.':data?.context.kind==='system'?'Conversa compartilhada neste Sistema. Preparação usa a ação própria; criar itens exige um Projeto.':'Conversa compartilhada neste Projeto. Criar itens exige revisão e confirmação.';
 return <section className={`assistant-root assistant-embedded assistant-workflow assistant-chat-mode${delivery?' assistant-delivery':''}`} aria-label={delivery?'Conversa contextual da História':'Entrevista e planejamento'}>
  <header className="assistant-chat-toolbar"><div>{delivery?<h2>Conversar sobre esta História</h2>:<h1>Assistente</h1>}<p>{delivery?contextLabel:'Entrevista e planejamento'}</p></div><nav aria-label="Assuntos do Assistente">
   {!delivery&&data?.context.kind==='system'&&contextId&&<AssistantApplicationPreparation action={data.systemAction??null} contextId={contextId} persona={persona} role={role} readOnly={readOnly||Boolean(data.readOnly)} fresh={!loading&&!connectionError} onRefresh={()=>setRefresh(value=>value+1)}/>}
   {data&&['system','story'].includes(data.context.kind)&&<AssistantDevActionDialog action={data.devAction??null} context={data.context} persona={persona} role={role} active={devActionsActive} readOnly={readOnly||Boolean(data.readOnly)||!permission} fresh={!loading&&!connectionError} recoveryTargetId={`assistant-dev-recovery-${data.context.id}`} onRefresh={()=>setRefresh(value=>value+1)}/>}
   {!delivery&&<button type="button" ref={element=>{tabs.current[0]=element;}} hidden={view==='conversation'} aria-current={view==='conversation'?'page':undefined} onClick={()=>show('conversation')}><MessageSquare size={15}/>Conversa</button>}
   <button type="button" aria-label={questions.length?`Resumo · ${questions.length} pergunta(s)`:'Resumo'} onClick={()=>{summaryDialog.current?.showModal();summaryDialog.current?.querySelector<HTMLElement>('h2')?.focus();}}><Info size={15}/><span className="assistant-chat-toolbar-label">Resumo</span>{questions.length>0&&<span className="assistant-proposal-count">{questions.length}</span>}</button>
   {!delivery&&<><button type="button" ref={element=>{tabs.current[1]=element;}} aria-current={view==='proposal'?'page':undefined} onClick={showCurrentProposal}><FileText size={15}/>Proposta{currentProposal&&<span className="assistant-proposal-count">1</span>}</button><button type="button" aria-label="Histórico de propostas" ref={element=>{tabs.current[2]=element;}} aria-current={view==='history'?'page':undefined} onClick={()=>show('history')}><History size={15}/><span className="assistant-chat-toolbar-label">Histórico de propostas</span></button></>}
  </nav></header>
  {!delivery&&data?.context.kind==='system'&&contextId&&<div id={`application-preparation-recovery-${contextId}`} className="assistant-system-action-recovery"/>}
  {data&&['system','story'].includes(data.context.kind)&&<div id={`assistant-dev-recovery-${data.context.id}`} className="assistant-dev-recovery"/>}
  {view!=='conversation'&&currentState}
  <div id="assistant-panel-conversation" hidden={view!=='conversation'}>
   {contextId&&<AssistantChat contextId={contextId} persona={persona} ready={Boolean(data)&&!invalidCursor} visible={view==='conversation'} initialBefore={initialBefore} revision={data?.session?.version||0} total={data?.turnsPage?.total} latest={latest??null} draft={draft} inputRef={input} onDraft={text=>update(value=>({...value,drafts:{...value.drafts,[persona]:text}}))} onSubmit={submit} onCursor={before=>navigate({before:before??'',page:''})} canSend={canMessage&&!pending} disabled={!permission||!persona} readOnly={pending?.kind==='message'||!writable} busy={busy} help={messageHelp} status={view==='conversation'?currentState:null} proposal={currentProposal??null} onProposal={showCurrentProposal} onRecover={turn=>{update(value=>({...value,drafts:{...value.drafts,[persona]:turn.input}}));show('conversation',true);}} canRecover={!busy&&!pending&&permission&&Boolean(persona)} delivery={delivery} questions={questions} planningAction={delivery?undefined:!currentProposal?<><p>{questions.length?`${questions.length} ponto(s) registrado(s) para esclarecer antes de gerar a proposta.`:'Quando esclarecer a necessidade, gere uma proposta para revisão.'}</p><button type="button" disabled={!canGenerate||busy||Boolean(pending)} onClick={generatePlan}>Gerar proposta para revisão</button></>:undefined}/>}</div>
  {!delivery&&<div id="assistant-panel-proposal" role="region" aria-label="Proposta do contexto" hidden={view!=='proposal'}><button type="button" className="assistant-back-chat" onClick={()=>show('conversation')}>← Voltar à conversa</button>
   {failedGeneration&&<section aria-label="Falha da nova geração de proposta"><ErrorState><strong>Não foi possível gerar a nova proposta.</strong><p>{failedGeneration.error||'A tentativa de geração falhou. Consulte a conversa antes de tentar novamente.'}</p>{currentProposal&&<p>A proposta {currentProposal.status==='applied'?'já aplicada':'anterior'} foi preservada. A falha pertence à nova solicitação de geração.</p>}{historicalId&&<p>Este aviso descreve a situação atual do contexto; a proposta histórica em consulta permanece identificada abaixo.</p>}<p className="assistant-help">Solicitação {failedGeneration.id} · {displayDate(failedGeneration.createdAt)}</p><div className="assistant-edit-actions"><button type="button" onClick={reviewGenerationFailure}>Revisar falha na conversa</button><button type="button" disabled={!canGenerate||busy||Boolean(pending)} onClick={generatePlan}>{currentProposal?'Gerar nova proposta para revisão':'Gerar proposta para revisão'}</button></div></ErrorState></section>}
   {historicalId&&<div className="assistant-historical-notice"><p><strong>Proposta anterior em consulta.</strong> A situação atual e as operações continuam identificadas acima.</p><button type="button" onClick={showCurrentProposal}>Voltar à proposta atual</button></div>}
   {displayedProposal?<><p className="assistant-proposal-source">Proposta · revisão {displayedProposal.version} · {displayedProposal.status==='applied'?'Aplicada':'DRAFT'} · {displayDate(displayedProposal.createdAt)}</p>{proposalSummary}</>:<p className="assistant-intro">{historicalId?'Esta proposta não está na página histórica carregada. Volte à proposta atual ou localize a ocorrência no Histórico.':'Nenhuma proposta disponível neste contexto. Continue a conversa e solicite uma proposta para revisar.'}</p>}
   {currentProposal&&<div hidden={Boolean(historicalId)}>{proposalEditor(currentProposal)}</div>}
   {historicalId&&displayedProposal&&proposalEditor(displayedProposal,true)}
   {(recoveryPlans.some(entry=>entry.id!==currentProposal?.id&&entry.id!==historicalId)||pendingPlans.some(entry=>!entry.proposal&&entry.proposalId!==currentProposal?.id&&entry.proposalId!==historicalId))&&<section aria-label="Operações anteriores aguardando confirmação"><h3>Recuperação de operações anteriores</h3><p className="assistant-help">Estas referências locais preservam a solicitação original. Não representam a revisão vigente; a criação somente é confirmada pelo recibo da API.</p>{recoveryPlans.filter(entry=>entry.id!==currentProposal?.id&&entry.id!==historicalId).map(entry=><div key={entry.id}>{proposalEditor(entry,true)}{!pendingPlans.some(pending=>pending.proposalId===entry.id)&&<button type="button" onClick={()=>setRecoveryPlans(value=>value.filter(proposal=>proposal.id!==entry.id))}>Fechar resultado recuperado</button>}</div>)}{pendingPlans.filter(entry=>!entry.proposal&&entry.proposalId!==currentProposal?.id&&entry.proposalId!==historicalId).map(entry=><p key={entry.proposalId} className="assistant-block-reason">Proposta {entry.proposalId}, revisão {entry.expectedVersion}: a solicitação anterior não possui uma cópia local de recuperação. Localize esta proposta no Histórico para verificar a mesma operação.</p>)}</section>}
   <section className="assistant-plan-generation" aria-label="Concluir entrevista"><h3>{currentProposal?'Continuar o planejamento':'Próximo passo do planejamento'}</h3><p>Destino: <strong>{data?.context.kind==='project'?data.context.name:targetProjectName||'Selecione o Projeto no contexto acima'}</strong></p>{questions.length>0&&<p className="assistant-block-reason">Há perguntas registradas para esclarecer. Responda à assistente antes de concluir ou gerar outra proposta.</p>}{!failedGeneration&&<button type="button" disabled={!canGenerate||busy||Boolean(pending)} onClick={generatePlan}>{active?.kind==='plan'?'Gerando proposta…':currentProposal?'Gerar nova proposta para revisão':'Gerar proposta para revisão'}</button>}<button type="button" className="text-button" onClick={()=>{show('conversation',true);}}>Continuar a conversa →</button>
    <details open={creationMode==='create'} onToggle={event=>setCreationMode(event.currentTarget.open?'create':'review')}><summary>Outra forma de concluir: criar a partir da entrevista</summary><p>A assistente organizará a conversa e criará os itens no Projeto escolhido após sua confirmação. Épicos começam ACTIVE, Histórias SPECIFICATION e Tarefas TO DO. Cada História recebe as seis Tarefas padrão.</p><label className="assistant-confirm-creation"><input type="checkbox" checked={confirmed} disabled={!canComplete||busy||Boolean(pending)} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo os requisitos discutidos e autorizo a criação dos itens neste Projeto.</label><button type="button" className="primary" disabled={!canComplete||!confirmed||busy||Boolean(pending)||!(data?.context.kind==='project'||targetProjectId)} onClick={completeInterview}>Concluir entrevista e criar itens</button></details>
   </section>
  </div>}
  {!delivery&&<div id="assistant-panel-history" role="region" aria-label="Histórico de propostas" hidden={view!=='history'}><button type="button" className="assistant-back-chat" onClick={()=>show('conversation')}>← Voltar à conversa</button><div className="assistant-history-heading"><h3>Histórico de propostas deste contexto</h3><p>Consultar uma proposta anterior não troca a situação atual nem libera operações.</p></div>
   {data?.context.kind==='system'&&<p className="assistant-help">A coleção histórica de propostas do Sistema ainda não está disponível nesta consulta. Os itens confirmados da conclusão mais recente podem ser consultados na aba Proposta.</p>}{data?.proposalsPage&&<Pagination page={data.proposalsPage.page} pageSize={20} total={data.proposalsPage.total} onPageChange={proposalsPage=>navigate({proposalsPage})} disabled={loading} label="Paginação das propostas"/>}<ol className="assistant-proposal-history">{data?.proposals?.map(proposal=><li key={proposal.id}><div><strong>{proposal.content.summary}</strong><p>Revisão {proposal.version} · {proposal.status==='applied'?'Aplicada':'DRAFT'} · {displayDate(proposal.createdAt)}{proposal.stale?' · contexto alterado':''}</p></div><button type="button" onClick={()=>consultProposal(proposal.id)}>Consultar proposta</button></li>)}</ol>{data&&!data.proposals?.length&&<p>Nenhuma proposta nesta página.</p>}{data?.proposalsPage&&<Pagination page={data.proposalsPage.page} pageSize={20} total={data.proposalsPage.total} onPageChange={proposalsPage=>navigate({proposalsPage})} disabled={loading} label="Paginação inferior das propostas"/>}
  </div>}
  <dialog ref={summaryDialog} className="assistant-summary-dialog" aria-labelledby="assistant-summary-title"><h2 id="assistant-summary-title" tabIndex={-1}>Resumo da necessidade</h2>{data?.brief?<><p>{data.brief.summary}</p><h3>{questions.length?`Perguntas registradas pela assistente · ${questions.length}`:'Perguntas registradas'}</h3>{questions.length?<ul>{questions.map((question,index)=><li key={index}>{question}</li>)}</ul>:<p>Nenhuma pergunta pendente registrada neste resumo. A revisão dos requisitos continua necessária.</p>}{data.brief.confirmedFacts.length>0&&<details><summary>Fatos registrados</summary><ul>{data.brief.confirmedFacts.map((fact,index)=><li key={index}>{fact}</li>)}</ul></details>}</>:<p>Nenhum resumo registrado neste contexto. Continue descrevendo sua necessidade.</p>}<details><summary>Sobre esta conversa</summary><p>{delivery?'Esclareça requisitos, critérios e evidências desta História. As decisões e operações ficam no processo da História.':'A conversa pertence ao contexto selecionado e é compartilhada entre as personas. Revise os requisitos e confirme explicitamente a criação dos itens.'}</p>{data?.model&&<p>Modelo: {data.model}</p>}</details><button type="button" onClick={()=>summaryDialog.current?.close()}>Fechar resumo</button></dialog>
 </section>;
}
