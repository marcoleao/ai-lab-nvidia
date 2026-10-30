'use client';

import type {StoryLifecycleReading} from '../../../packages/shared/src/story-lifecycle-reading';
import type {DevelopmentApproval} from '../../../packages/shared/src/development-approval';
import './story-lifecycle-status.css';

export default function StoryLifecycleStatus({reading,compact=false,stale=false,historical=false}:{reading?:StoryLifecycleReading;compact?:boolean;stale?:boolean;historical?:boolean}){
 if(!reading)return <div className={`story-lifecycle-status${compact?' compact':''}`} data-testid="story-lifecycle-status"><small>Situação da História ainda não confirmada.</small></div>;
 const revision=reading.revision;
 const development=reading.development as StoryLifecycleReading['development']&{approval?:DevelopmentApproval|null;reasons?:string[]};
 return <div className={`story-lifecycle-status${compact?' compact':''}`} data-testid="story-lifecycle-status" aria-label="Situação da História">
  {!compact&&<strong className="story-lifecycle-title">Situação da História{historical?' · independente da tentativa consultada':''}</strong>}
  <div className="story-lifecycle-markers"><span className="story-development-marker" data-state={stale?'unconfirmed':development.state}><b>Desenvolvimento:</b> {development.label}</span><span><b>Conclusão:</b> {reading.completion.label}</span></div>
  {stale&&<small role="status">Última leitura preservada; situação atual não confirmada.</small>}
  {!compact&&<details><summary>Consultar revisão e evidências</summary><dl>
   <dt>Especificação aplicada</dt><dd>{revision.specification?<>Revisão {revision.specification.number} · <code>{revision.specification.id}</code></>:'Ainda não registrada.'}</dd>
   <dt>Código da última execução</dt><dd>{revision.execution?.sha?<code>{revision.execution.sha}</code>:revision.execution?'Referência de código ainda não registrada nesta execução.':'Execução ainda não registrada.'}{revision.execution&&<small>Execução <code>{revision.execution.id}</code>. Esta referência não comprova implantação.</small>}</dd>
   <dt>Contexto da execução</dt><dd>{revision.executionContext==='current'?'Contexto conferido pela jornada atual.':revision.executionContext==='outdated'?'Contexto da execução difere da História atual.':'Vigência ainda não conferida nesta consulta.'}</dd>
   <dt>Versão do cadastro</dt><dd>{revision.recordVersion} · controla alterações do cadastro; não representa aprovação do conteúdo.</dd>
  </dl>{development.reasons&&development.reasons.length>0&&<ul>{development.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}{development.approval&&<p>Aprovação {development.approval.number} · {development.approval.actorName} · <time dateTime={development.approval.createdAt}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(development.approval.createdAt))}</time>. A vigência acima corresponde à revisão atual, independentemente da tentativa histórica consultada.</p>}<p>{development.approvalAvailable?'A aprovação de Desenvolvimento Finalizado tem decisão própria na Execução → DEV.':'A aprovação de Desenvolvimento Finalizado ainda não está disponível nesta leitura.'} A conclusão exige entrada confirmada em produção da release contendo a revisão da História.</p></details>}
 </div>;
}
