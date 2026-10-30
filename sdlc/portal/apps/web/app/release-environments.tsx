'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {environmentCodes} from '../../../packages/shared/src/environments';
import type {ReleaseEnvironmentCounts} from '../../../packages/shared/src/release-reading';
import {ErrorState,LoadingState} from './experience-ui';
type Context={system:{id:string;name:string};environments:{code:string}[]};
const roles={DEV:'Desenvolvimento · destino previsto',QA:'Testes',HML:'Homologação',PRD:'Produção'};
export default function ReleaseEnvironments({systemId,showTotals=false,totals,totalsLoading=false,totalsError='',scope,onTotalsRetry}:{systemId?:string;showTotals?:boolean;totals?:ReleaseEnvironmentCounts;totalsLoading?:boolean;totalsError?:string;scope?:string;onTotalsRetry?:()=>void}){
 const [snapshot,setSnapshot]=useState<Context|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{setError('');if(!systemId){setLoading(false);return;}const controller=new AbortController();setLoading(true);
  fetch(`/api/systems/${systemId}/environments`,{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Não foi possível consultar os ambientes do Sistema.');return result as Context;}).then(result=>{if(!controller.signal.aborted)setSnapshot(result);}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[systemId,revision]);
 const data=snapshot?.system.id===systemId?snapshot:null;
 const confirmedTotals=showTotals&&!totalsLoading&&!totalsError?totals:undefined;
 return <section className="panel" aria-label="Ambientes em Releases" aria-busy={loading||totalsLoading}><div className="section-heading"><h2>{data?`Ambientes de ${data.system.name}`:'Ambientes do Sistema'}</h2>{systemId&&<Link href={`/systems/${systemId}?tab=environments`}>Consultar no Sistema →</Link>}</div>
  <p>DEV, QA, HML e PRD são destinos. A situação da composição e a implantação são informações separadas.</p>
  {showTotals&&<><p className="hint">Totalizadores do recorte aplicado: {scope}. Todas as páginas. Releases CANCELED permanecem no último ambiente do fluxo registrado; a contagem não comprova implantação.</p>{totalsLoading&&<LoadingState>Consultando totais de releases…</LoadingState>}{totalsError&&<ErrorState onRetry={onTotalsRetry}>{totalsError}</ErrorState>}</>}
  {!systemId&&<p className="hint">Escolha um Sistema nos filtros para consultar o cadastro dos ambientes.</p>}
  {loading&&<LoadingState>Consultando ambientes do Sistema…</LoadingState>}{error&&<ErrorState onRetry={()=>setRevision(value=>value+1)}>{error}</ErrorState>}
  <div className="environment-grid">{environmentCodes.map(code=><article className="environment" key={code} aria-label={`Destino ${code}`}><h3>{code}</h3>{showTotals&&<p className="release-environment-total"><strong data-testid={`release-environment-count-${code}`}>{confirmedTotals?.[code]??'—'}</strong><span>Releases no ambiente do fluxo</span></p>}<p>{roles[code]}</p>{systemId&&<p className="hint">{error?'Cadastro não confirmado nesta consulta':loading?'Consultando cadastro…':data?data.environments.some(row=>row.code===code)?'Referência cadastrada':'Referência não cadastrada':'Cadastro ainda não consultado'}</p>}<p className="hint">Sem implantação confirmada nesta consulta.</p></article>)}</div>
  {showTotals&&<p className="hint">Sem ambiente registrado: <strong data-testid="release-environment-count-unconfirmed">{confirmedTotals?.unconfirmed??'—'}</strong> · Total do recorte: <strong data-testid="release-environment-count-total">{confirmedTotals?.total??'—'}</strong></p>}
 </section>;
}
