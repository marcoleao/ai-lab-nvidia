'use client';
import {useEffect,useState} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {fullSha,executionContractPath,type ExecutionContractReading} from '../../../packages/shared/src/execution-contract';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import './execution-contract.css';
import ContractProposals from './contract-proposals';
const labels={valid:'Estrutura e entradas conferidas',invalid:'Contrato incompleto ou inválido',missing:'Contrato não encontrado',unsupported:'Versão não suportada'};
export default function ExecutionContractView({systemId,active,repositoryId,repositoryVersion,persona='',role='',blocked=false,refreshToken=0}:{systemId:string;active:boolean;repositoryId?:string;repositoryVersion?:number;persona?:string;role?:string;blocked?:boolean;refreshToken?:number}){
 const params=useSearchParams(),router=useRouter(),pathname=usePathname(),sha=params.get('contract.sha')||'';
 const [open,setOpen]=useState(Boolean(sha)),[draft,setDraft]=useState(sha),[revision,setRevision]=useState(0),[data,setData]=useState<ExecutionContractReading|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setDraft(sha);if(sha)setOpen(true);},[sha]);
 useEffect(()=>{
  if(!open||!active)return;const controller=new AbortController();setError('');
  if(sha&&!fullSha.safeParse(sha).success){setError('Informe o SHA completo, com 40 ou 64 caracteres hexadecimais.');setLoading(false);return;}
  setLoading(true);fetch(`/api/systems/${systemId}/execution-contract${sha?'?sha='+encodeURIComponent(sha):''}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error?.message||'Não foi possível consultar o contrato.');if(body.system?.id!==systemId||body.executionAvailable!==false||sha&&body.observation&&body.observation.sha!==sha)throw Error('A resposta não corresponde ao contexto consultado. Atualize a consulta.');return body as ExecutionContractReading;}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(failure=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'Consulta indisponível.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[systemId,active,open,sha,revision,refreshToken]);
 const result=data?.system.id===systemId?data:null,observation=result?.observation,contextChanged=!!result&&(result.repository?.id!==repositoryId||result.repository?.version!==repositoryVersion),stale=loading||!!error||contextChanged||!!observation&&(sha?observation.sha!==sha:observation.mode!=='branch');
 const validDraft=!draft||fullSha.safeParse(draft).success;
 function consult(){setOpen(true);setRevision(v=>v+1);}
 function selectRevision(){if(!validDraft)return;const next=new URLSearchParams(params.toString());if(draft)next.set('contract.sha',draft);else next.delete('contract.sha');setOpen(true);if(draft===sha)setRevision(v=>v+1);else router.push(`${pathname}?${next}`,{scroll:false});}
 return <section className="execution-contract" aria-label="Contrato de execução do Sistema" aria-busy={loading}>
  <h3>Contrato de execução</h3><p>Confira as entradas de build, testes, saúde e migrações declaradas no repositório.</p>
  <button type="button" disabled={loading} onClick={consult}>{open?'Consultar contrato novamente':'Consultar contrato'}</button>
  {open&&<>
   <details className="execution-contract-revision"><summary>Consultar outra revisão</summary><form onSubmit={event=>{event.preventDefault();selectRevision();}}><label>Commit do contrato<input value={draft} onChange={event=>setDraft(event.target.value.trim())} placeholder="Vazio: consultar a branch padrão" maxLength={64} spellCheck={false}/></label><button type="submit" disabled={loading||!validDraft}>Consultar revisão</button></form>{!validDraft&&<p className="hint">Use o SHA completo com 40 ou 64 caracteres hexadecimais.</p>}<p className="hint">A escolha consulta um commit deste repositório. Não muda a branch, a implementação ou o planejamento.</p></details>
   {loading&&<LoadingState>Consultando o contrato neste commit…</LoadingState>}{error&&<ErrorState onRetry={consult}>{error}</ErrorState>}
   {result&&stale&&<p role="status" className="hint">Última leitura preservada, de {displayDate(result.asOf)}. O contexto solicitado ainda não está confirmado.{contextChanged&&' O cadastro do repositório mudou; atualize a consulta.'}</p>}
   {result&&<div className="execution-contract-result">
    <p className="hint">{result.system.name} · {result.repository?.name||'Repositório ainda não cadastrado'} · consulta em {displayDate(result.asOf)}.</p>
    {!observation?<p role="status">{result.unavailableReason}</p>:<>
     <h4>{labels[observation.state]}</h4><p>{observation.message}</p>
     <dl className="execution-contract-source"><dt>Arquivo consultado</dt><dd><code>{executionContractPath}</code></dd><dt>Commit consultado</dt><dd><code>{observation.sha}</code></dd><dt>Referência da consulta</dt><dd>{observation.mode==='branch'?`Branch padrão ${observation.branch}, no commit observado`:'Commit escolhido explicitamente; não representa a versão atual da branch'}</dd><dt>Instante da observação</dt><dd>{displayDate(observation.observedAt)}</dd></dl>
     {observation.headChanged&&<p role="status" className="alert">A branch mudou durante a leitura. O resultado permanece vinculado ao commit acima. {observation.mode==='branch'?'Consulte novamente para conferir a revisão atual.':'Para consultar a versão atual da branch, abra Consultar outra revisão e deixe o commit vazio.'}</p>}
     {observation.issues.length>0&&<div className="execution-contract-issues"><h4>Pontos a revisar</h4><ul>{observation.issues.map((issue,index)=><li key={index}><code>{issue.path}</code> · {issue.message}</li>)}</ul></div>}
     {observation.state!=='valid'&&<p>Use a proposta local abaixo para definir ou revisar o contrato com o arquiteto. Após a revisão, envie a definição para um Merge Request. Use o acompanhamento do envio para conferir a liberação do Draft e a integração na branch padrão.</p>}
     {observation.units.length>0&&<><h4>Unidades declaradas · {observation.units.length}</h4><p className="hint">Runtime e entradas são declarações do contrato. As ferramentas e os resultados de build, testes, saúde e reversão não foram avaliados.</p><ol className="execution-contract-units">{observation.units.map(unit=><li key={unit.id}><details><summary>{unit.id} · {unit.runtime.kind} {unit.runtime.version} · <code>{unit.path}</code></summary><dl><dt>Entrada de build</dt><dd><code>{unit.build.entrypoint}</code></dd><dt>Entrada de testes</dt><dd><code>{unit.test.entrypoint}</code></dd><dt>Artefato declarado</dt><dd>Dockerfile: <code>{unit.artifact.dockerfile}</code> · contexto: <code>{unit.artifact.context}</code></dd><dt>Saúde declarada</dt><dd>{unit.health.kind==='http'?`HTTP ${unit.health.path} · porta ${unit.health.port} · resposta ${unit.health.status}`:`Processo · saída ${unit.health.exitCode}`}</dd><dt>Migrações declaradas</dt><dd>{unit.migrations.mode==='none'?'Sem migração, conforme declarado; não comprova ausência de dados ou reversibilidade.':<>Aplicação: <code>{unit.migrations.apply}</code> · reversão: <code>{unit.migrations.rollback}</code></>}</dd></dl><p className="hint">Caminhos relativos à pasta da unidade. A existência de uma entrada não comprova seu comportamento.</p></details></li>)}</ol></>}
     {observation.files.length>0&&<details><summary>Consultar entradas conferidas · {observation.files.length}</summary><ul>{observation.files.map(file=><li key={file.path}><code>{file.path}</code> · {file.state==='present'?'arquivo regular encontrado':file.state==='missing'?'não encontrado neste commit':'tipo de arquivo não suportado'}</li>)}</ul></details>}
     {observation.digest&&<details><summary>Consultar identidade do conteúdo</summary><p>SHA-256 do conteúdo consultado: <code>{observation.digest}</code></p><p>Blob Git: <code>{observation.blobId}</code> · formato: {observation.schemaVersion??'não reconhecido'}.</p></details>}
    </>}
    <p className="execution-contract-limit"><strong>Esta consulta confere somente a estrutura.</strong> A prontidão do perfil de construção é conferida em Integrações e na História → DEV. Contrato integrado não confirma build, testes ou implantação.</p>
   </div>}
  </>}
 <ContractProposals systemId={systemId} active={active} persona={persona} role={role} blocked={blocked} observation={observation} sourceStale={!!stale}/>
 </section>;
}
