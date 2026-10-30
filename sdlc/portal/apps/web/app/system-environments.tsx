'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {environmentCodes,type EnvironmentCode} from '../../../packages/shared/src/environments';
import {ErrorState,LoadingState,Spinner,displayDate} from './experience-ui';

type Environment={id:string;code:string;liveStatus:string;currentVersion:string|null;currentPackageDigest:string|null;url:string|null};
type Context={system:{id:string;key:string;name:string;version:number;status:string;archived:boolean};repository:{id:string;key:string;name:string;version:number;state:string}|null;environments:Environment[];missingCodes:EnvironmentCode[];capabilities:{canRegister:boolean};asOf:string};
type Body={expectedVersion:number;expectedRepositoryId:string;expectedRepositoryVersion:number;codes:EnvironmentCode[]};
type Attempt={systemId:string;persona:string;key:string;body:Body};
type Result=Context&{createdCodes:EnvironmentCode[];outcome:'SUCCEEDED'|'NO_CHANGE'};
const label=(value:string)=>value.replaceAll('_',' ').toUpperCase();
function registeredUrl(value:string|null){if(!value)return null;try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?value:null;}catch{return null;}}

export default function SystemEnvironments({systemId,persona,role,active,onChanged}:{systemId:string;persona:string;role?:string;active:boolean;onChanged:()=>void}){
 const [snapshot,setSnapshot]=useState<Context|null>(null),[loading,setLoading]=useState(false),[queryError,setQueryError]=useState(''),[revision,setRevision]=useState(0);
 const [review,setReview]=useState<{signature:string;codes:EnvironmentCode[]}|null>(null),[pending,setPending]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[commandError,setCommandError]=useState(''),[notice,setNotice]=useState('');
 const confirmButton=useRef<HTMLButtonElement>(null),registerButton=useRef<HTMLButtonElement>(null);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const storage=`sdlc-environment-registration:${systemId}`;
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(storage)||'null');setPending(saved?.systemId===systemId?saved:null);}catch{setPending(null);}},[storage,systemId]);
 useEffect(()=>{
  if(!active)return;const controller=new AbortController();setLoading(true);setQueryError('');
  fetch(`/api/systems/${systemId}/environments`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Não foi possível consultar os ambientes.');return data as Context;}).then(data=>{if(!controller.signal.aborted)setSnapshot(data);}).catch(error=>{if(!controller.signal.aborted)setQueryError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[systemId,active,revision]);
 const data=snapshot?.system.id===systemId?snapshot:null,allowed=!!persona&&['admin','product_owner','architect'].includes(role||'');
 const signature=JSON.stringify([persona,data?.system.version,data?.repository?.id,data?.repository?.version,data?.missingCodes,data?.capabilities.canRegister]);
 const reviewed=review?.signature===signature,canRegister=!!data?.capabilities.canRegister&&allowed&&!loading&&!queryError&&!commandError&&!pending&&!busy;
 useEffect(()=>{if(reviewed&&active)confirmButton.current?.focus();},[review,reviewed,active]);
 function remember(value:Attempt|null){setPending(value);try{if(value)sessionStorage.setItem(storage,JSON.stringify(value));else sessionStorage.removeItem(storage);}catch{/* The current attempt remains available in memory. */}}
 function refresh(){if(busy)return;setCommandError('');setRevision(value=>value+1);}
 async function execute(attempt:Attempt){
  if(busy||attempt.persona!==persona||attempt.systemId!==systemId)return;
  setBusy(true);setCommandError('');setNotice('');remember(attempt);
  try{
   const response=await fetch(`/api/systems/${attempt.systemId}/environment-references`,{method:'POST',headers:{'Content-Type':'application/json','X-Persona':attempt.persona,'Idempotency-Key':attempt.key},body:JSON.stringify(attempt.body)});
   const result=await response.json() as Result&{error?:{message?:string}};
   if(!response.ok){if(response.status<500)remember(null);throw Error(result.error?.message||'Não foi possível confirmar o cadastro.');}
   remember(null);if(mounted.current){setSnapshot(result);setReview(null);setNotice(result.outcome==='NO_CHANGE'?'As referências solicitadas já estavam cadastradas.':`Referências ${result.createdCodes.join(', ')} cadastradas.`);onChanged();}
  }catch(error){if(mounted.current)setCommandError(error instanceof TypeError?'Não foi possível confirmar a resposta do cadastro. Verifique o resultado da solicitação.':error instanceof Error?error.message:'O cadastro ainda não foi confirmado.');}
  finally{if(mounted.current)setBusy(false);}
 }
 function confirm(){if(!canRegister||!reviewed||!review||!data?.repository)return;void execute({systemId,persona,key:crypto.randomUUID(),body:{expectedVersion:data.system.version,expectedRepositoryId:data.repository.id,expectedRepositoryVersion:data.repository.version,codes:review.codes}});}
 return <section className="panel" aria-label="Ambientes do Sistema" aria-busy={loading||busy}>
  <div className="section-heading"><h2>Ambientes do Sistema</h2><button type="button" disabled={loading||busy} onClick={refresh}>Atualizar consulta</button></div>
  <p>DEV, QA, HML e PRD são destinos do Sistema. Cadastrar suas referências não provisiona infraestrutura nem executa implantação.</p>
  {loading&&<LoadingState>Consultando referências de ambiente…</LoadingState>}
  {queryError&&<><ErrorState onRetry={refresh}>{queryError}</ErrorState>{data&&<p className="hint">Exibindo a última consulta confirmada. Atualize a consulta antes de cadastrar referências.</p>}</>}
  {commandError&&<ErrorState>{commandError}</ErrorState>}
  {busy&&<LoadingState>Conferindo o resultado do cadastro…</LoadingState>}
  {notice&&<p role="status" className="alert success">{notice} Nenhuma infraestrutura ou implantação foi executada.</p>}
  {pending&&<div className="alert" role="status"><strong>Cadastro ainda não confirmado</strong><p>Verifique o resultado da mesma solicitação antes de iniciar outro cadastro. Persona original: {pending.persona}.</p><button type="button" disabled={busy||pending.persona!==persona} onClick={()=>void execute(pending)}>{busy&&<Spinner/>}Verificar resultado do cadastro</button>{pending.persona!==persona&&<p>Selecione a persona original para verificar o resultado.</p>}</div>}
  {data&&<>
   <p className="hint">Consulta em {displayDate(data.asOf)} · {data.system.name}{data.repository?` · ${data.repository.name}`:''}.</p>
   <div className="environment-grid">{[...environmentCodes,...data.environments.filter(row=>!environmentCodes.includes(row.code as EnvironmentCode)).map(row=>row.code)].map(code=>{
    const row=data.environments.find(value=>value.code===code),url=registeredUrl(row?.url??null);
    const legacy=!!row&&(row.liveStatus!=='not_deployed'||!!row.currentVersion||!!row.currentPackageDigest||!!row.url);
    return <article className="environment" aria-label={`Ambiente ${code}`} key={code}><h3>{code}</h3><span className="badge">{row?'Referência cadastrada':'Referência não cadastrada'}</span>
     {row?<>{legacy?<><p>Dados de implantação registrados; disponibilidade atual não verificada.</p><details><summary>Consultar registro existente</summary><p>Estado registrado: {label(row.liveStatus)}</p>{row.currentVersion&&<p>Versão registrada: {row.currentVersion}</p>}{row.currentPackageDigest&&<p className="repository-path">Digest registrado: {row.currentPackageDigest}</p>}</details></>:<p>Sem evidência de implantação disponível.</p>}{url&&<p><a href={url} target="_blank" rel="noreferrer">Abrir URL registrada ↗</a></p>}</>:<p className="hint">Cadastro pendente neste repositório.</p>}
    </article>;
   })}</div>
   {!data.repository?<p className="hint">Cadastre primeiro o repositório do Sistema. <Link href={`/systems/${systemId}?tab=components`}>Consultar repositório do Sistema →</Link></p>:data.missingCodes.length?<>
    {data.system.archived||data.system.status!=='active'?<p className="hint">O Sistema está {data.system.archived?'arquivado':'inativo'}. As referências permanecem disponíveis para consulta; o cadastro exige um Sistema ativo.</p>:!allowed?<p className="hint">Selecione Administrador, Product Owner ou Arquiteto para cadastrar referências ausentes.</p>:null}
    {review&&!reviewed&&<p role="status" className="hint">O contexto ou a persona mudou. Revise novamente as referências antes de confirmar.</p>}
    {reviewed&&review?<section className="panel" aria-label="Confirmar cadastro de referências"><h3>Confirmar cadastro de referências</h3><p>Serão cadastradas somente as referências <strong>{review.codes.join(', ')}</strong> no repositório <strong>{data.repository.name} · {data.repository.key}</strong> deste Sistema.</p><p>Dados existentes serão mantidos. Esta ação não provisiona infraestrutura nem executa implantação.</p><div className="actions"><button ref={confirmButton} type="button" className="primary" disabled={!canRegister} onClick={confirm}>Confirmar cadastro</button><button type="button" disabled={busy||!!pending} onClick={()=>{setReview(null);requestAnimationFrame(()=>registerButton.current?.focus());}}>Voltar</button></div></section>:allowed&&data.capabilities.canRegister&&!pending&&<button ref={registerButton} type="button" disabled={!canRegister} onClick={()=>{setReview({signature,codes:[...data.missingCodes]});setNotice('');}}>Cadastrar referências ausentes</button>}
   </>:<p role="status" className="hint">Todas as referências padrão estão cadastradas. Isso não confirma implantação ou validação.</p>}
  </>}
 </section>;
}
