'use client';

import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {ErrorState,LoadingState,Pagination,displayDate} from './experience-ui';

type Result={id:string;version:number;summary:string;evidence:string[];actorName:string;createdAt:string};
type Data={results:Result[];pagination:{page:number;pageSize:number;total:number};asOf:string;readOnly:boolean;coverage:{legacyResultAvailable:boolean}};

export default function TaskResults({taskId,persona,revision}:{taskId:string;persona:string;revision:number}){
 const router=useRouter(),pathname=usePathname(),search=useSearchParams();
 const parsedPage=Number(search.get('taskResults.page')||1),page=Number.isSafeInteger(parsedPage)&&parsedPage>0?parsedPage:1,asOf=search.get('taskResults.asOf')||'';
 const context=`${taskId}:${persona}`;
 const [snapshot,setSnapshot]=useState<{context:string;data:Data}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const location=useRef({pathname,search:search.toString(),page,asOf});location.current={pathname,search:search.toString(),page,asOf};
 const data=snapshot?.context===context?snapshot.data:null;

 useEffect(()=>{
  if(!persona){setSnapshot(null);setLoading(false);setError('');return;}
  const controller=new AbortController();setLoading(true);setError('');
  const query=new URLSearchParams({page:String(page)});if(asOf)query.set('asOf',asOf);
  void fetch(`/api/items/${taskId}/results?${query}`,{cache:'no-store',headers:{'X-Persona':persona},signal:controller.signal}).then(async response=>{
   const result=await response.json();
   if(!response.ok)throw Error(result.error?.message||'Não foi possível consultar os resultados.');
   if(!Array.isArray(result.results)||!result.pagination||!result.coverage||!Number.isFinite(Date.parse(result.asOf)))throw Error('A resposta dos resultados está incompleta. Atualize a consulta.');
   if(controller.signal.aborted)return;
   setSnapshot({context,data:result});
   // Confirm the server snapshot without losing other collections' URL state.
   const current=location.current;
   if(current.pathname===pathname&&current.page===page&&current.asOf===asOf){
    const params=new URLSearchParams(current.search);params.set('taskResults.page',String(result.pagination.page));params.set('taskResults.asOf',result.asOf);
    if(params.toString()!==current.search)router.replace(`${pathname}?${params}`,{scroll:false});
   }
  }).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'A consulta não chegou.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[taskId,persona,page,asOf,revision,retry,context,pathname,router]);

 function changePage(next:number,refresh=false){
  const params=new URLSearchParams(location.current.search);params.set('taskResults.page',String(next));
  if(refresh)params.delete('taskResults.asOf');else if(data)params.set('taskResults.asOf',data.asOf);
  if(params.toString()!==location.current.search)router.push(`${pathname}?${params}`,{scroll:false});else if(refresh)setRetry(value=>value+1);
 }

 return <section aria-label="Resultados manuais da Tarefa" aria-busy={loading}>
  <h3>Resultados registrados pelo usuário</h3>
  <button type="button" disabled={loading||!persona} onClick={()=>changePage(1,true)}>Atualizar resultados</button>
  {loading&&<LoadingState>{data?'Atualizando resultados…':'Consultando resultados…'}</LoadingState>}
  {error&&<ErrorState onRetry={()=>setRetry(value=>value+1)}>{error}</ErrorState>}
  {data&&<>
   <p className="hint">{error?'Último resultado confirmado. ':''}Resultados consultados até {displayDate(data.asOf)}, da versão mais recente para a mais antiga.</p>
   {data.readOnly&&<p className="hint">O contexto atual está em somente leitura. O histórico continua disponível.</p>}
   {data.results.length?<ol>{data.results.map(result=><li key={result.id}><p><strong>Versão {result.version}</strong> · {result.actorName} · {displayDate(result.createdAt)}</p><p className="description">{result.summary}</p>{result.evidence.length>0&&<ul>{result.evidence.map((reference,index)=><li key={index}>{reference}</li>)}</ul>}</li>)}</ol>:<p className="hint">Nenhum resultado manual versionado registrado nesta fonte até a data da consulta. Resultados do pipeline ficam nas tentativas da atividade.</p>}
   {data.coverage.legacyResultAvailable&&<p className="hint">Existe resultado legado na Tarefa sem revisão histórica capturada. Ele não foi convertido em uma versão fictícia.</p>}
   <Pagination page={data.pagination.page} pageSize={data.pagination.pageSize} total={data.pagination.total} onPageChange={changePage} label="Resultados da Tarefa" disabled={loading}/>
  </>}
 </section>;
}
