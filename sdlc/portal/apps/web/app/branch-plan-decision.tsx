'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import type {ReleaseBranchPlan} from '../../../packages/shared/src/release-branch-plan';
import type {BranchPlanDecision as Decision} from '../../../packages/shared/src/release-branch-policy';
import useOperation from './release-operation';
import {displayDate} from './experience-ui';

type Body={expectedVersion:number;expectedDecisionId:string|null;expectedContextToken:string;baseSha:string;scenario:'initial';policyVersion:string;reason:string;confirmed:true};
type Review={body:Body;persona:string;releaseKey:string;repositoryName:string;compositionNumber:number;branchName:string;rules:readonly string[]};
export default function BranchPlanDecision({releaseId,data,persona,role,stale,blocked,analysisPending,onRecorded,onBlockingChange}:{releaseId:string;data?:ReleaseBranchPlan;persona:string;role?:string;stale:boolean;blocked:boolean;analysisPending:boolean;onRecorded:()=>void;onBlockingChange:(value:boolean)=>void}){
 const pathname=usePathname(),params=useSearchParams(),panel=useRef<HTMLDivElement>(null),origin=useRef<HTMLButtonElement>(null);
 const [reason,setReason]=useState(''),[review,setReview]=useState<Review|null>(null),[rejected,setRejected]=useState(false),[confirmed,setConfirmed]=useState<Decision|null>(null);
 const op=useOperation(`branch-plan:${releaseId}`,persona,result=>{setConfirmed(result.decision);setReview(null);setReason('');setRejected(false);onRecorded();},{retryLabel:'Verificar resultado da decisão',onRejected:()=>setRejected(true)});
 const recording=data?.recording,current=recording?.current,pending=op.busy||!!op.pending,allowed=!!persona&&['admin','release_manager','product_owner','architect'].includes(role||'');
 useEffect(()=>{onBlockingChange(pending||!!review);return()=>onBlockingChange(false);},[pending,review,onBlockingChange]);
 useEffect(()=>{setRejected(false);},[recording]);
 useEffect(()=>{if(op.pending){const body=op.pending.body as Body;setReason(body.reason||'');}},[op.pending]);
 useEffect(()=>{if(review){panel.current?.focus();panel.current?.scrollIntoView({block:'center'});}},[review]);
 const same=!!review&&review.persona===persona&&review.body.expectedContextToken===recording?.contextToken&&review.body.expectedDecisionId===recording?.latestDecisionId&&!stale&&!rejected&&!analysisPending;
 function begin(){if(!data||!recording?.contextToken||!data.proposal.baseSha||!data.release.compositionNumber)return;op.clearError();setReview({body:{expectedVersion:data.release.version,expectedDecisionId:recording.latestDecisionId,expectedContextToken:recording.contextToken,baseSha:data.proposal.baseSha,scenario:'initial',policyVersion:recording.policy.version,reason:reason.trim(),confirmed:true},persona,releaseKey:data.release.key,repositoryName:data.repository.name,compositionNumber:data.release.compositionNumber,branchName:data.proposal.branchName,rules:recording.policy.rules});}
 const audit=new URLSearchParams(params.toString());audit.set('tab','activity');
 return <div ref={panel} className="branch-plan-decision" role="region" aria-label="Decisão local do plano" tabIndex={-1}>
  {op.feedback}
  {confirmed&&confirmed.id!==current?.id&&<p role="status">Resultado confirmado: decisão {confirmed.number} registrada em {displayDate(confirmed.createdAt)} por {confirmed.actorName}. A situação atual depende da consulta do plano.</p>}
  {current&&<section aria-label="Decisão registrada"><h3>Decisão {current.number} registrada para a composição {current.compositionNumber}</h3><p>{current.actorName} · {displayDate(current.createdAt)} · política {current.policyVersion}</p><p>Base inicial declarada: <code>{current.baseSha}</code></p><p>{stale?'Registro da última leitura; o contexto atual ainda não está confirmado.':recording?.currentState==='current'?'Registro correspondente ao contexto consultado.':recording?.currentState==='retained'?'Registro preservado; a release ou o Sistema não está disponível para novas decisões.':'O contexto mudou desde este registro. Revise um novo plano antes das próximas operações.'}</p><p className="hint">Decisão de planejamento; não cria ou adota branch, não comprova origem em produção, inventário de código, desenvolvimento ou implantação.</p><Link href={`${pathname}?${audit}`} scroll={false}>Abrir Auditoria da release</Link></section>}
  {recording&&<>
   {!review?<>
    <h3>Registrar decisão do plano</h3><p>Confirme a política e a base inicial escolhidas para esta release. O registro preserva autoria e contexto; a criação da branch será uma operação separada.</p>
    <details><summary>Revisar política {recording.policy.version}</summary><ol>{recording.policy.rules.map(rule=><li key={rule}>{rule}</li>)}</ol></details>
    {recording.blockers.length>0&&<ul>{recording.blockers.map(message=><li key={message}>{message}</li>)}</ul>}
    {analysisPending&&<p role="status">Há alterações de base ou cenário ainda não consultadas. Use Consultar cenário e busca antes de revisar a decisão.</p>}
    <label>Justificativa da base inicial<textarea value={reason} minLength={10} maxLength={500} rows={3} disabled={pending} onChange={event=>setReason(event.target.value)}/></label>
    <p className="hint">Informe uma justificativa entre 10 e 500 caracteres.</p>
    {!allowed&&<p className="hint">Selecione uma persona autorizada a planejar releases para registrar a decisão.</p>}
    {rejected&&<p role="status">Atualize a consulta do plano e revise novamente. Sua justificativa foi preservada.</p>}
    <button ref={origin} type="button" disabled={!allowed||blocked||stale||pending||rejected||analysisPending||!recording.contextToken||Array.from(reason.trim()).length<10} onClick={begin}>Revisar decisão do plano</button>
   </>:<section aria-label="Confirmação da decisão do plano"><h3>Confirmar decisão do plano</h3><p><strong>{review.releaseKey}</strong> · {review.repositoryName} · composição {review.compositionNumber}</p><p>Cenário inicial declarado, sem fonte de produção confirmada.</p><p>Base escolhida: <code>{review.body.baseSha}</code></p><p>Branch planejada: <code>{review.branchName}</code> · política {review.body.policyVersion}</p><ol>{review.rules.map(rule=><li key={rule}>{rule}</li>)}</ol><p>Justificativa: {review.body.reason}</p><p>Esta confirmação registra a decisão local. Código, branches, Merge Requests e ambientes continuam com suas operações e verificações próprias.</p>
    {!same&&<p role="status" className="sw-alert">O contexto ou a persona mudou. Volte à análise, atualize a consulta do plano e revise a decisão. Sua justificativa foi preservada.</p>}
    <div className="actions"><button type="button" className="primary" disabled={!allowed||blocked||pending||!same} onClick={()=>void op.send(`/releases/${releaseId}/branch-plan/decisions`,review.body)}>Confirmar decisão do plano</button><button type="button" disabled={pending} onClick={()=>{setReview(null);setTimeout(()=>origin.current?.focus(),0);}}>Voltar à análise</button></div>
   </section>}
  </>}
 </div>;
}
