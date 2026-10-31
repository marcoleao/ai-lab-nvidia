'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {isReleaseDevelopmentReadiness,type ReleaseDevelopmentReadiness as Reading} from '../../../packages/shared/src/release-development-readiness';
import {ErrorState,LoadingState,Pagination,displayDate} from './experience-ui';

const prefix='qaReadiness.';
const filters={issues:'Com impedimentos',all:'Todas',ready:'Atendidas',blocked:'Bloqueadas',unconfirmed:'Sem confirmação'};
const labels={ready:'Requisitos de desenvolvimento atendidos',blocked:'Há impedimentos na composição',unconfirmed:'Conferência incompleta',empty:'Sem Histórias para conferir'};
const referenceLabels:Record<string,string>={specificationId:'Especificação',executionId:'Execução',sourceSha:'Código da História',integrationReferenceId:'Referência da integração',integrationSha:'Commit integrado'};
export default function ReleaseDevelopmentReadiness({releaseId,releaseVersion,compositionStatus,flowEnvironment,compositionId,revision,stale=false,onRefreshRelease,onContextChange}:{releaseId:string;releaseVersion:number;compositionStatus:string;flowEnvironment:string|null;compositionId:string|null;revision:number;stale?:boolean;onRefreshRelease:()=>void;onContextChange:(changed:boolean)=>void}){
 const router=useRouter(),pathname=usePathname(),params=useSearchParams();
 const rawPage=params.get(prefix+'page')||'1',search=params.get(prefix+'search')||'',filter=params.get(prefix+'filter')||'issues',sort=params.get(prefix+'sort')||'key',direction=params.get(prefix+'direction')||'asc';
 const expectedCompositionId=params.get(prefix+'composition'),expectedEvaluationDigest=params.get(prefix+'evaluation');
 const query=new URLSearchParams({page:rawPage,search,filter,sort,direction,...(expectedCompositionId?{expectedCompositionId}:{}),...(expectedEvaluationDigest?{expectedEvaluationDigest}:{})});
 const url=`/releases/${encodeURIComponent(releaseId)}/development-readiness?${query}`;
 const [snapshot,setSnapshot]=useState<{releaseId:string;url:string;data:Reading}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [draft,setDraft]=useState({search,filter,sort,direction}),[open,setOpen]=useState(Array.from(params.keys()).some(v=>v.startsWith(prefix)));
 const region=useRef<HTMLElement>(null);
 useEffect(()=>setDraft({search,filter,sort,direction}),[search,filter,sort,direction]);
 useEffect(()=>{if(Array.from(params.keys()).some(v=>v.startsWith(prefix)))setOpen(true);},[params]);
 useEffect(()=>{
  if(stale)return;
  const controller=new AbortController();setLoading(true);setError('');
  fetch('/api'+url,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const body=await response.json();if(!response.ok)throw Error(body.error?.message||'Não foi possível conferir o desenvolvimento da composição.');
   if(!isReleaseDevelopmentReadiness(body,releaseId))throw Error('A resposta da conferência está incompleta ou não corresponde à release. A situação atual não foi confirmada.');
   return body;
  }).then(data=>{if(!controller.signal.aborted)setSnapshot({releaseId,url,data});}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[url,releaseId,revision,retry,stale]);
 const data=snapshot?.releaseId===releaseId?snapshot.data:null;
 const contextChanged=!!data&&(data.composition?.id!==compositionId||data.release.version!==releaseVersion||data.release.compositionStatus!==compositionStatus||data.release.flowEnvironment!==flowEnvironment);
 useEffect(()=>onContextChange(contextChanged),[contextChanged,onContextChange]);
 const outdated=stale||loading||!!error||snapshot?.url!==url||contextChanged;
 function navigate(values:Record<string,string|undefined>,anchor=true){
  const next=new URLSearchParams(params.toString());
  if(anchor&&data?.composition){next.set(prefix+'composition',data.composition.id);next.set(prefix+'evaluation',data.evaluation.digest);}
  for(const [key,value]of Object.entries(values)){if(value===undefined||value==='')next.delete(prefix+key);else next.set(prefix+key,value);}
  router.push(`${pathname}?${next}`,{scroll:false});
 }
 function refresh(){navigate({page:'1',composition:undefined,evaluation:undefined},false);setRetry(v=>v+1);}
 useEffect(()=>{
  if(!data||outdated||String(data.pagination.page)===rawPage)return;
  const next=new URLSearchParams(params.toString());next.set(prefix+'page',String(data.pagination.page));
  router.replace(`${pathname}?${next}`,{scroll:false});
 },[data,outdated,rawPage,params,pathname,router]);
 const pager=(label:string)=><Pagination page={data?.pagination.page??1} total={data?.pagination.total??0} pageSize={20} disabled={loading||stale||contextChanged||!!error} label={label} onPageChange={page=>navigate({page:String(page)})}/>;
 return <section ref={region} className="panel release-development-readiness" aria-label="Conferência para QA" aria-busy={loading&&!stale}>
  <h2>Conferência para QA</h2>
  <p>Desenvolvimento da composição salva; esta consulta não inicia promoção.</p>
  <button type="button" disabled={loading&&!stale||stale} onClick={refresh}>Atualizar conferência</button>
  {loading&&!stale&&<LoadingState>{data?'Atualizando conferência…':'Conferindo desenvolvimento da composição…'}</LoadingState>}
  {error&&<ErrorState onRetry={refresh}>{error}</ErrorState>}
  {stale&&<p role="status">A situação da release ainda não foi confirmada. Atualize os dados da release antes de conferir o desenvolvimento.</p>}
  {contextChanged&&<p role="status">A release ou a composição consultada difere da página. <button type="button" disabled={stale} onClick={onRefreshRelease}>Atualizar dados da release</button></p>}
  {data&&<>
   <p role="status"><strong>{outdated?'Situação atual não confirmada':labels[data.state]}</strong></p>
   <p>{data.composition?`Composição salva · revisão ${data.composition.number}`:'Revisão da composição não confirmada'} · {outdated?'Última consulta preservada':'Consulta'} em {displayDate(data.evaluation.asOf)}.</p>
   <p>{data.summary.total} Histórias no conjunto · <strong>{data.summary.developmentApproved} com Desenvolvimento Finalizado válido para esta composição</strong> · {data.summary.ready} atendidas · {data.summary.blocked} bloqueadas · {data.summary.unconfirmed} sem confirmação.</p>
   {data.state==='ready'&&!outdated&&<p>Atender a esta conferência não libera QA; a composição do código e a preparação do pacote ainda precisam ser verificadas.</p>}
   {!data.evaluation.complete&&<p className="hint">O conjunto não foi integralmente avaliado. Nenhuma elegibilidade foi confirmada.</p>}
   {data.state==='empty'&&!outdated&&<p>Uma composição OPEN pode permanecer vazia. Esta consulta não decide seu fechamento.</p>}
   {!!data.reasons.length&&<ul>{data.reasons.map((v,index)=><li key={v.code+index}>{v.message} <Link href={v.action.href}>{v.action.label}</Link></li>)}</ul>}
  </>}
  <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Consultar Histórias e impedimentos{data?` (${data.summary.blocked+data.summary.unconfirmed})`:''}</summary>
   <form className="release-readiness-filters" onSubmit={event=>{event.preventDefault();navigate({...draft,page:'1'});}}>
    <label>Buscar História na conferência<input value={draft.search} maxLength={200} onChange={event=>setDraft(v=>({...v,search:event.target.value}))}/></label>
    <label>Histórias consultadas<select value={draft.filter} onChange={event=>setDraft(v=>({...v,filter:event.target.value}))}>{Object.entries(filters).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Ordenar conferência por<select value={draft.sort} onChange={event=>setDraft(v=>({...v,sort:event.target.value}))}><option value="key">Chave</option><option value="name">Nome</option></select></label>
    <label>Direção da conferência<select value={draft.direction} onChange={event=>setDraft(v=>({...v,direction:event.target.value}))}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
    <div className="actions"><button type="submit" disabled={loading||stale}>Aplicar filtros da conferência</button><button type="button" disabled={loading||stale} onClick={()=>navigate({search:undefined,filter:undefined,sort:undefined,direction:undefined,page:'1'})}>Limpar filtros da conferência</button></div>
   </form>
   {data&&<>
    <p>Último recorte confirmado: {filters[data.query.filter]}{data.query.search?` · busca: ${data.query.search}`:''} · ordem: {data.query.sort==='key'?'chave':'nome'} {data.query.direction==='asc'?'crescente':'decrescente'} · {data.pagination.total} resultados. Os totais acima sempre consideram toda a composição.</p>
    {pager('Paginação de Histórias na conferência')}
    <ol className="release-composition-list">{data.stories.map(story=><li key={story.id}>
     <h3><Link href={`/stories/${encodeURIComponent(story.id)}?tab=planning&process=environment&environment=DEV`}>{story.key} · {story.name}</Link></h3>
     <p><strong>{outdated?'Último resultado conhecido: ':''}{story.state==='ready'?'Requisitos de desenvolvimento atendidos':story.state==='blocked'?'Bloqueada':'Sem confirmação'}</strong> · {story.development.label}{story.development.state==='valid'&&!story.development.matchesComposition?' · aprovação da revisão atual ainda não corresponde à composição salva':''}</p>
     {!!story.reasons.length&&<ul>{story.reasons.map((reason,index)=><li key={reason.code+index}>{reason.message} <Link href={reason.action.href}>{reason.action.label} · {story.key}</Link></li>)}</ul>}
     <details><summary>Referências de {story.key}</summary><p>Aprovação: {story.development.approval?`nº ${story.development.approval.number}, por ${story.development.approval.actorName}`:'não registrada'}</p><dl>{Object.entries(story.references).map(([key,value])=><div key={key}><dt>{referenceLabels[key]}</dt><dd><code>{value??'não confirmado'}</code></dd></div>)}</dl></details>
    </li>)}</ol>
    {!data.stories.length&&!loading&&!error&&<p>{data.evaluation.complete?'Nenhuma História neste recorte. Os filtros não alteram a composição nem os totais.':'Nenhuma página de Histórias foi qualificada por esta conferência incompleta.'}</p>}
    {pager('Paginação final de Histórias na conferência')}
   </>}
  </details>
  <details><summary>Alcance desta conferência</summary><p>{data?.coverage??'A leitura confere as fontes registradas da composição vigente; não constrói ou promove uma versão.'}</p></details>
 </section>;
}
