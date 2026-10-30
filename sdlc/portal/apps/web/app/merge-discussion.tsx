'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {LoadingState,ErrorState,displayDate} from './experience-ui';

type Turn={id:string;input:string;output:string|null;specialist?:string;state:string;error:string|null;createdAt:string};
type Data={version:number;turns:Turn[];configured:boolean};
type Attempt={key:string;persona:string;message:string;expectedVersion:number;specialist?:string};

export default function MergeDiscussion({executionId,persona,guidance,blocked,readOnly=false,action}:{executionId:string;persona:string;guidance:string;blocked:boolean;readOnly?:boolean;action?:ReactNode}){
 const [data,setData]=useState<Data|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState<Attempt|null>(null),[refresh,setRefresh]=useState(0);
 const storage=`sdlc-merge-discussion:${executionId}`,allowed=['admin','ana','bruno'].includes(persona);
 const [restoredStorage,setRestoredStorage]=useState<string|null>(null);
 const [loadError,setLoadError]=useState('');
 useEffect(()=>{try{setDraft(sessionStorage.getItem(storage+':draft')||'');const pending=sessionStorage.getItem(storage+':pending');setAttempt(pending?JSON.parse(pending):null);}catch{setDraft('');setAttempt(null);}setRestoredStorage(storage);},[storage]);
 useEffect(()=>{if(restoredStorage===storage)try{sessionStorage.setItem(storage+':draft',draft);}catch{}},[draft,storage,restoredStorage]);
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;async function load(){try{
  const response=await fetch(`/api/executions/${executionId}/merge/discussion`,{cache:'no-store'}),result=await response.json();if(!response.ok)throw Error(result.error?.message||'Não foi possível consultar a conversa.');if(alive){setData(result);setLoadError('');}
 }catch(e){if(alive)setLoadError(e instanceof Error?e.message:'A consulta da conversa não chegou.');}finally{if(alive)timer=setTimeout(load,2000);}}void load();return()=>{alive=false;clearTimeout(timer);};},[executionId,refresh]);
 const pending=data?.turns.find(t=>['queued','running'].includes(t.state));
 function remember(value:Attempt|null){setAttempt(value);try{if(value)sessionStorage.setItem(storage+':pending',JSON.stringify(value));else sessionStorage.removeItem(storage+':pending');}catch{}}
 async function send(specialist='merge',message=draft.trim()){
  if(!allowed||busy||!data||attempt&&attempt.persona!==persona||!attempt&&(!message||pending))return;
  const current=attempt??{key:crypto.randomUUID(),persona,message,expectedVersion:data.version,specialist};remember(current);setBusy(true);setError('');
  try{const response=await fetch(`/api/executions/${executionId}/merge/discussion`,{method:'POST',headers:{'Content-Type':'application/json','X-Persona':current.persona,'Idempotency-Key':current.key},body:JSON.stringify({message:current.message,expectedVersion:current.expectedVersion,...(current.specialist?{specialist:current.specialist}:{})})});const result=await response.json();if(!response.ok){if(response.status<500)remember(null);throw Error(result.error?.message||'A confirmação do envio não chegou.');}remember(null);setDraft('');setRefresh(n=>n+1);}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar o envio.');}finally{setBusy(false);}
 }
 return <section className="merge-discussion" aria-label="Conversa sobre o merge">
  <h3>{blocked?'Impedimento do merge':'Conversa sobre o merge'}</h3>
  {!readOnly&&action&&<section className="sw-alert" aria-label="Ação proposta pelo assistente"><strong>Ação proposta</strong><p>A ação abaixo utiliza a revisão atual e exige sua confirmação. Enviar uma mensagem não a executa.</p>{action}</section>}
  <p className="merge-guidance"><strong>Diagnóstico do SDLC</strong><span>{guidance}</span></p>
  <div className="merge-conversation" role="log" tabIndex={0} aria-label="Histórico da conversa de merge" aria-live="polite" aria-relevant="additions text">
   {data?.turns.map(t=><article key={t.id}><strong>Você</strong><p>{t.input}</p>{t.output&&<><strong>{t.specialist === 'architecture' ? 'Agente arquiteto' : t.specialist === 'infrastructure' ? 'Especialista de infraestrutura' : 'Assistente IA'}</strong><p>{t.output}</p></>}{t.error?<ErrorState>{t.error}</ErrorState>:t.state==='failed'?<ErrorState>A rodada falhou. A conversa e sua mensagem foram preservadas.</ErrorState>:null}<time dateTime={t.createdAt} className="hint">{displayDate(t.createdAt)} · America/Sao_Paulo</time></article>)}
  </div>
  {!data&&!loadError&&<LoadingState>Consultando histórico…</LoadingState>}
  {busy&&<LoadingState>Confirmando o envio da mensagem…</LoadingState>}
  {pending&&<LoadingState>{pending.state==='queued'?'Mensagem recebida · aguardando o modelo local.':'A assistente está consultando as condições do GitLab e analisando sua mensagem…'} Você pode continuar navegando; a resposta ficará registrada aqui.</LoadingState>}
  {error&&<ErrorState onRetry={()=>{setError('');setRefresh(n=>n+1);}}>{error}</ErrorState>}
  {loadError&&<ErrorState onRetry={()=>setRefresh(n=>n+1)}>{loadError} O último histórico confirmado foi preservado.</ErrorState>}
  {!readOnly&&<><div className="actions" aria-label="Diagnóstico especializado"><button type="button" disabled={!allowed||busy||!!attempt||!!pending||!data?.configured||!!loadError} onClick={()=>void send('architecture',draft.trim()||'Analise este impedimento como arquiteto, apresente o diagnóstico e um plano técnico dentro do escopo aprovado, sem executar mudanças.')}>Pedir diagnóstico de arquitetura</button><button type="button" disabled={!allowed||busy||!!attempt||!!pending||!data?.configured||!!loadError} onClick={()=>void send('infrastructure',draft.trim()||'Analise as condições de infraestrutura deste impedimento e apresente os fatos, responsáveis e um plano de intervenção, sem executar mudanças.')}>Pedir diagnóstico de infraestrutura</button></div><p className="hint">Especialistas produzem diagnóstico e proposta técnica nesta conversa. Alterações de código seguem o fluxo de correção; mudanças de infraestrutura e permissões exigem operações específicas ainda não disponíveis aqui.</p><form onSubmit={event=>{event.preventDefault();void send();}}>
   <label>Sua mensagem sobre este impedimento<textarea rows={3} maxLength={4000} value={draft} disabled={!allowed||busy||!!attempt||!data?.configured} onChange={event=>setDraft(event.target.value)} placeholder="Descreva o impedimento ou peça ajuda para continuar…"/></label>
   {!allowed&&<p className="hint">Selecione Administrador, Product Owner ou Arquiteto no seletor de persona para conversar.</p>}
   {data&&!data.configured&&<p className="hint">A conversa aguarda a configuração do modelo local e da integração de merge.</p>}
   {attempt&&<p className="hint">Confirmação pendente. Consulte o envio usando a mesma solicitação.{attempt.persona!==persona&&` Selecione a persona original (${attempt.persona}).`}</p>}
   <button type="submit" className="primary" disabled={!allowed||busy||!data?.configured||Boolean(attempt?attempt.persona!==persona:pending||!draft.trim())}>{busy?'Enviando…':attempt?'Verificar envio da mensagem':pending?'Aguardando resposta':'Enviar para a assistente'}</button>
  </form></>}
  <p className="hint">Esta conversa esclarece o impedimento. O merge continua dependendo das verificações do GitLab e da sua confirmação no botão de solicitação.</p>
 </section>;
}
