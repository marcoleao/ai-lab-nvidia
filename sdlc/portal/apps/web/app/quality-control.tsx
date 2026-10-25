'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertCircle} from 'lucide-react';
import {Spinner,LoadingState,ErrorState,displayDate} from './experience-ui';
type Check={id:string;kind:string;state:string;sha:string;baseSha:string;summary:string|null;error:string|null;findings:{path:string;line:number;severity:string;message:string}[];evidence:{scope?:string;engine?:string;version?:string;digest?:string}|null;createdAt:string;finishedAt:string|null};
type Data={configured:boolean;sha:string;checks:Check[];readiness:{ready:boolean;phases:{kind:string;passed:boolean}[]}};
type Attempt={key:string;persona:string;path:string;body:Record<string,unknown>};
export default function QualityControl({executionId,sha,version,persona,onRefresh,onState}:{executionId:string;sha:string;version:number;persona:string;onRefresh:()=>void;onState?:(state:string)=>void}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[attempt,setAttempt]=useState<Attempt|null>(null),[correct,setCorrect]=useState<string|null>(null);
 const [loadError,setLoadError]=useState('');
 const observed=useRef(''),callback=useRef(onRefresh);callback.current=onRefresh;const phaseCallback=useRef(onState);phaseCallback.current=onState;
 const allowed=['admin','ana','bruno'].includes(persona),storage=`sdlc-quality:${executionId}`;
 useEffect(()=>{try{const saved=sessionStorage.getItem(storage);if(saved)setAttempt(JSON.parse(saved));}catch{}},[storage]);
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;async function load(){try{const response=await fetch(`/api/executions/${executionId}/quality`,{cache:'no-store'}),result=await response.json();if(!response.ok)throw Error(result.error?.message||'Não foi possível consultar as verificações.');if(alive){setData(result);setLoadError('');const nextKind=result.readiness.phases[0]?.passed?'security_scan':'code_review';const latest=result.checks.find((c:Check)=>c.kind===nextKind);phaseCallback.current?.(result.readiness.ready?'ready':nextKind+':'+(latest&&latest.sha===sha?latest.state:'not_started'));const identity=JSON.stringify(result.checks.map((c:Check)=>[c.id,c.state,c.sha]));if(observed.current&&observed.current!==identity)callback.current();observed.current=identity;}}catch(e){if(alive)setLoadError(e instanceof Error?e.message:'A consulta não chegou.');}finally{if(alive)timer=setTimeout(load,2000);}}void load();return()=>{alive=false;clearTimeout(timer);};},[executionId,refresh]);
 function remember(value:Attempt|null){setAttempt(value);try{if(value)sessionStorage.setItem(storage,JSON.stringify(value));else sessionStorage.removeItem(storage);}catch{}}
 async function send(kind:string,checkId?:string){
  if(busy||!allowed||attempt&&attempt.persona!==persona)return;
  const current=attempt??{key:crypto.randomUUID(),persona,path:`/api/executions/${executionId}/quality${checkId?'/correct':''}`,body:{...(checkId?{checkId}:{kind}),expectedVersion:version,expectedSha:sha}};remember(current);setBusy(true);setError('');
  try{const response=await fetch(current.path,{method:'POST',headers:{'Content-Type':'application/json','X-Persona':current.persona,'Idempotency-Key':current.key},body:JSON.stringify(current.body)}),result=await response.json();if(!response.ok){if(response.status<500)remember(null);throw Error(result.error?.message||'A confirmação não chegou.');}remember(null);setCorrect(null);setRefresh(n=>n+1);callback.current();}catch(e){setError(e instanceof Error?e.message:'Não foi possível confirmar a solicitação.');}finally{setBusy(false);}
 }
 const latest=(kind:string)=>data?.checks.find(c=>c.kind===kind),active=data?.checks.some(c=>['queued','running'].includes(c.state)),reviewPassed=data?.readiness.phases[0]?.passed;
 return <section className="quality-control" aria-label="Verificações antes do merge">
  <h3>Verificações desta revisão</h3><p className="hint">CODING → CODE REVIEW → SECURITY SCAN → MERGE · Commit <code>{sha.slice(0,12)}</code></p>
  {!data&&!loadError&&<LoadingState>Consultando as verificações desta revisão…</LoadingState>}{loadError&&<ErrorState onRetry={()=>setRefresh(n=>n+1)}>{loadError}<p>Os últimos resultados confirmados permanecem visíveis.</p></ErrorState>}{busy&&<LoadingState>Confirmando a solicitação de verificação…</LoadingState>}
  <div className="quality-phases">{(['code_review','security_scan'] as const).map(kind=>{
   const check=latest(kind),stale=check&&check.sha!==sha,passed=data?.readiness.phases.find(p=>p.kind===kind)?.passed,state=stale?'STALE':check?.state.toUpperCase()||'NOT STARTED',canRun=kind==='code_review'||reviewPassed;
   return <article key={kind}><strong>{kind==='code_review'?'CODE REVIEW':'SECURITY SCAN'}</strong><p role="status" className={passed?'quality-passed':!stale&&check?.state==='failed'?'experience-error-inline':''}>{!stale&&!loadError&&['queued','running'].includes(check?.state||'')&&<Spinner />}{!stale&&check?.state==='failed'&&<AlertCircle size={16} aria-hidden="true" />}{state}{stale&&' · resultado de outra revisão'}</p>
    {check?.summary&&<p>{check.summary}</p>}{check?.error&&<ErrorState>{check.error}</ErrorState>}
    {check&&<details><summary>Consultar resultado e achados ({check.findings.length})</summary><p>Revisão <code>{check.sha.slice(0,12)}</code> · Base <code>{check.baseSha.slice(0,12)}</code></p>{check.finishedAt&&<p>Finalizado em {displayDate(check.finishedAt)} · America/Sao_Paulo</p>}<ul>{check.findings.map((f,i)=><li key={i}><strong>{f.severity}</strong> · <code>{f.path}:{f.line}</code><p>{f.message}</p></li>)}</ul>{check.evidence?.scope&&<p>Escopo executado: {check.evidence.scope}</p>}{check.evidence?.engine&&<p>Ferramenta: {check.evidence.engine} {check.evidence.version||''}</p>}</details>}
    {!stale&&!loadError&&check?.state==='running'&&<LoadingState>{kind==='code_review'?'O modelo local está revisando o diff.':'O scanner local está analisando o código, sem executá-lo.'} Aguarde; o resultado ficará registrado.</LoadingState>}
    {!stale&&!loadError&&check?.state==='queued'&&<LoadingState>Na fila de verificações.</LoadingState>}
    {!passed&&canRun&&!active&&!attempt&&<div className="actions">{check?.state==='blocked'&&!stale?<><button type="button" className="primary" disabled={!allowed||busy} onClick={()=>setCorrect(check.id)}>Solicitar correção à IA</button><button type="button" disabled={!allowed||busy} onClick={()=>void send(kind)}>Executar novamente</button></>:<button type="button" className="primary" disabled={!allowed||busy||!data?.configured} onClick={()=>void send(kind)}>{check?'Executar novamente':'Executar '+(kind==='code_review'?'Code Review':'Security Scan')}</button>}</div>}
    {kind==='security_scan'&&!reviewPassed&&<p className="hint">Aguarda CODE REVIEW aprovado para este commit.</p>}
   </article>;
  })}</div>
  <p className="hint">Política: qualquer achado impede o avanço. SECURITY SCAN inicial: SAST e segredos com regras locais; SCA, licenças, imagens e DAST ainda não incluídos.</p>
  {!allowed&&<p className="hint">Selecione Administrador, Product Owner ou Arquiteto para executar as verificações.</p>}
  {data&&!data.configured&&<p className="hint">Verificações aguardam configuração do GitLab, modelo local e scanner.</p>}
  {correct&&<div className="merge-confirmation"><strong>Confirmar correção dos achados</strong><p>O agente de codificação tentará corrigir os achados preservando o escopo e as autorizações aprovadas. Publicará uma nova revisão no mesmo MR. CODE REVIEW e SECURITY SCAN terão de ser executados novamente. Esta ação não faz merge.</p><div className="actions"><button type="button" className="primary" disabled={!allowed||busy||!!active} onClick={()=>void send('',correct)}>Confirmar correção à IA</button><button type="button" onClick={()=>setCorrect(null)}>Cancelar correção</button></div></div>}
  {error&&<ErrorState>{error}</ErrorState>}
  {attempt&&<p className="hint">Confirmação pendente. {attempt.persona!==persona&&'Volte à persona original.'}<button type="button" disabled={!allowed||busy||attempt.persona!==persona} onClick={()=>void send('')}>Verificar a mesma solicitação</button></p>}
 </section>;
}
