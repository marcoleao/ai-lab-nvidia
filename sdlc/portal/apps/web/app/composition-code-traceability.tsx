import Link from 'next/link';
import type {CompositionCodeTraceability} from '../../../packages/shared/src/composition-code-traceability';
import {displayDate} from './experience-ui';

const labels:Record<CompositionCodeTraceability['state'],string>={not_planned:'execução não capturada',not_published:'publicação não capturada',unavailable:'fonte indisponível',divergent:'referências divergentes',not_integrated:'integração não confirmada',not_captured:'referência integrada não capturada',partial:'referência integrada parcial',recorded:'referência integrada disponível'};
export default function CompositionCodeTraceabilityView({value,storyId,asOf,stale}:{value?:CompositionCodeTraceability;storyId:string;asOf?:string;stale?:boolean}){
 const integration=value?.integration;
 return <details className="composition-code-traceability">
  <summary>Rastreabilidade do código · {value?labels[value.state]:'consulta indisponível'}</summary>
  {stale&&<p role="status" className="hint">Última leitura preservada; rastreabilidade ainda não confirmada na consulta atual.</p>}
  {asOf&&<p className="hint">Fontes locais consultadas em {displayDate(asOf)}.</p>}
  {!value?<p>A rastreabilidade não está disponível nesta resposta. Atualize a consulta para verificar; nenhuma integração foi inferida.</p>:<>
   <p><strong>{value.message}</strong></p>
   {value.planning.state!=='current'&&<div className="composition-code-planning-note"><p>{value.planning.message}</p>{value.planning.changes.length>0&&<ul>{value.planning.changes.map(change=><li key={change}>{change}</li>)}</ul>}<p className="hint">Este registro preserva a execução original. Planejar outra revisão exige uma composição editável e revisão explícita das referências.</p></div>}
   {value.publication&&<dl><dt>Execução no planejamento</dt><dd><code>{value.publication.executionId}</code></dd><dt>Branch da publicação</dt><dd>{value.publication.sourceBranch?<code>{value.publication.sourceBranch}</code>:'Não capturada'}</dd><dt>Commit da fonte</dt><dd><code>{value.publication.sourceSha}</code></dd></dl>}
   {integration&&<section aria-label="Integração conhecida na consulta"><h4>Integração conhecida na consulta</h4>
    <p className="hint">{integration.capturedAfterComposition?'Evidência capturada depois do registro desta composição, para a mesma execução.':'Evidência consultada para a execução registrada nesta composição.'} A consulta não acrescenta esta evidência ao registro original.</p>
    <dl><dt>Merge Request</dt><dd>!{integration.iid} · projeto GitLab {integration.projectId}</dd><dt>Origem → destino</dt><dd><code>{integration.sourceBranch}</code> → <code>{integration.targetBranch}</code></dd><dt>Commit integrado</dt><dd>{integration.integrationSha?<code>{integration.integrationSha}</code>:'Não capturado; o commit da fonte não o substitui.'}</dd><dt>Commit de merge</dt><dd>{integration.mergeCommitSha?<code>{integration.mergeCommitSha}</code>:'Não informado'}</dd><dt>Commit de squash</dt><dd>{integration.squashCommitSha?<code>{integration.squashCommitSha}</code>:'Não informado'}</dd><dt>Integração no GitLab</dt><dd>{integration.mergedAt?displayDate(integration.mergedAt):'Data não informada'}</dd><dt>Evidência observada</dt><dd>{displayDate(integration.observedAt)}</dd><dt>Fonte da evidência</dt><dd><code>{integration.referenceId}</code></dd></dl>
   </section>}
   <p><Link href={`/stories/${storyId}?tab=planning&process=delivery`}>Consultar entregas da História →</Link></p>
  </>}
  <p className="hint">Esta leitura não comprova código composto na branch da release, pacote construído, Desenvolvimento Finalizado ou implantação.</p>
 </details>;
}
