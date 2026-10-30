'use client';
import {useEffect,useState} from 'react';
import type {CodeDestination,CodeDestinationReview,CodeDestinationApproval} from '../../../packages/shared/src/code-destination';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
export function ConfirmedCodeDestination({value}:{value:CodeDestination}){return <details className="sw-code-destination"><summary>Destino confirmado nesta execução</summary><p>DEV · desenvolvimento da História · integração por Merge Request em <code>{value.targetBranch}</code>.</p><p>Commit de partida: <code>{value.baseSha}</code></p><p className="hint">Referência registrada no Gateway de Especificação; não comprova merge, implantação ou conclusão.</p></details>;}
export default function CodeDestinationReviewPanel({executionId,version,disabled=false,invalidated=false,onChange}:{executionId:string;version:number;disabled?:boolean;invalidated?:boolean;onChange:(value:CodeDestinationApproval|null)=>void}){
 const [data,setData]=useState<CodeDestinationReview|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loaded,setLoaded]=useState('');
 const signature=`${executionId}:${version}:${refresh}`;
 useEffect(()=>{if(invalidated)onChange(null);},[invalidated,onChange]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');onChange(null);
  fetch(`/api/executions/${executionId}/code-destination`,{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error?.message||'Não foi possível consultar o destino.');if(value.executionId!==executionId||!value.contextToken||!value.destination?.baseSha||value.storyVersion!==version)throw Error('O contexto da História mudou. Atualize a etapa antes de confirmar o destino.');return value as CodeDestinationReview;}).then(value=>{if(!controller.signal.aborted){setData(value);setLoaded(signature);onChange({destination:value.destination,contextToken:value.contextToken});}}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[signature,onChange]);
 const stale=loading||!!error||invalidated||loaded!==signature;
 return <section className="sw-code-destination" aria-label="Destino desta implementação"><h3>Destino desta implementação</h3><p>DEV · desenvolvimento da História. A implementação parte do commit confirmado e propõe a integração por Merge Request.</p>
  {loading&&<LoadingState>Conferindo o destino no GitLab…</LoadingState>}{error&&<ErrorState>{error}</ErrorState>}
  {data&&<><p>{data.repositoryName} · branch de integração <code>{data.destination.targetBranch}</code> · commit <code>{data.destination.baseSha.slice(0,12)}</code>.</p>{stale&&<p role="status" className="sw-alert">Última leitura preservada; o destino atual precisa ser revisado.</p>}<details><summary>Conferir commit e política</summary><p>Commit completo: <code>{data.destination.baseSha}</code></p><p>Consulta em {displayDate(data.observedAt)}.</p><p>Usar a branch padrão como integração do desenvolvimento. Ela não representa produção ou pacote de release. A associação a release é opcional neste ciclo.</p></details></>}
  {invalidated&&<p role="status">As condições mudaram. Atualize o destino e revise a autorização novamente.</p>}
  <button type="button" disabled={disabled||loading} onClick={()=>setRefresh(value=>value+1)}>Atualizar destino para revisão</button>
 </section>;
}
