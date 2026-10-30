'use client';
import Link from 'next/link';
import type {EnvironmentCode} from '../../../packages/shared/src/environments';
import type {StoryDeliveryReading} from '../../../packages/shared/src/story-delivery';
import type {StoryLifecycleReading} from '../../../packages/shared/src/story-lifecycle-reading';
import type {ReactNode} from 'react';

export default function StoryEnvironment({id,code,delivery,storyKey,readOnly,stale,onChooseRelease,onBack,storyHref,backLabel='Voltar à atividade atual',active=true,build,deployment,testPanel,approvalPanel,lifecycle}:{id:string;code:EnvironmentCode;delivery:StoryDeliveryReading;storyKey:string;readOnly:boolean;stale:boolean;onChooseRelease:()=>void;onBack:()=>void;storyHref?:string;backLabel?:string;active?:boolean;build?:ReactNode;deployment?:ReactNode;testPanel?:ReactNode;approvalPanel?:ReactNode;lifecycle?:StoryLifecycleReading}){
 const dev=code==='DEV',label=code==='PRD'?'PROD':code,release=delivery.release.reference;
 return <section id={`story-environment-${id}`} className="panel sw-environment-detail" hidden={!active} tabIndex={-1} aria-label={`Entrega em ${label}`} data-testid="story-environment-detail">
  <p className="eyebrow">DESTINO CONSULTADO · {label}</p><h2>{label} · {dev?'desenvolvimento da História':'entrega da release'}</h2>
  <p className="hint">Consultar este destino não altera a etapa atual nem inicia publicação.</p>
  {stale&&<p className="sw-alert">A situação atual não foi confirmada. As informações abaixo são da última consulta recebida.</p>}
  {dev&&<div className="sw-environment-guidance" role="note" aria-label="Ordem das ações DEV"><strong>{delivery.development.next?'Depois da integração, siga esta ordem':'Antes de construir ou publicar'}</strong><p>{delivery.development.next?'Construa o artefato da revisão integrada, publique a versão confirmada, execute seus testes e depois revise Desenvolvimento Finalizado. Cada quadro conserva suas próprias evidências e confirmação.':'Conclua a atividade atual e confirme o Merge Request desta revisão. Os quadros abaixo permitem consultar os pré-requisitos; não é preciso iniciar solicitações repetidas para avançar.'}</p></div>}
  {build}
  {deployment}
  {testPanel}
  {approvalPanel}
  {dev?<>
   <details><summary>Como funciona o ciclo DEV</summary>
   <p>A História <strong>{storyKey}</strong> pode ser publicada e testada em DEV sem associação a uma release.</p>
   <p>O desenvolvimento admite novas revisões, merges, publicações e testes até a aprovação <strong>Desenvolvimento Finalizado</strong>.</p>
   <dl><div><dt>Publicação da História em DEV</dt><dd>Consulte o quadro Publicar versão em DEV para acompanhar a revisão publicada e sua disponibilidade.</dd></div><div><dt>Desenvolvimento Finalizado</dt><dd>{lifecycle?.development.label||'Sem aprovação de desenvolvimento confirmada nesta consulta.'}</dd></div><div><dt>Associação a release</dt><dd>Opcional durante o desenvolvimento em DEV.</dd></div></dl>
   {delivery.development.next&&<p className="sw-environment-next">Merge confirmado. A História pode seguir com publicação e testes em DEV.</p>}
   <p className="hint">Use o quadro Publicar versão em DEV para conferir o artefato e o destino antes de confirmar. O cadastro do ambiente e o merge não equivalem à publicação.</p>
   </details>
  </>:<>
   <p>{code==='QA'?'A entrada em QA exige uma release com candidata imutável.':'Esta entrega utiliza a mesma candidata imutável validada nos ambientes anteriores.'}</p>
   <dl><div><dt>Release da História</dt><dd>{delivery.release.association==='unconfirmed'?'Associação ainda não confirmada.':release?<Link href={`/releases/${release.id}`}>{release.key} · {release.name}</Link>:'História ainda sem release associada.'}</dd></div><div><dt>Candidata imutável</dt><dd>Sem candidata ou artefatos confirmados nesta consulta.</dd></div><div><dt>Implantação e validação em {label}</dt><dd>Sem implantação ou validação confirmada nesta consulta.</dd></div></dl>
   {code==='QA'?<><h3>O que libera a passagem para QA</h3><ul><li>História associada à release.</li><li>Todas as Histórias da composição com Desenvolvimento Finalizado válido.</li><li>Composição congelada e pacote imutável construído, versionado e verificado.</li></ul><p>As publicações individuais em DEV continuam livres durante o desenvolvimento. A candidata é montada na passagem da release para QA.</p></>:<p>{code==='HML'?'A promoção depende da validação em QA.':'A promoção depende dos aceites anteriores e da autorização para produção.'} Os mesmos artefatos seguem adiante, sem reconstrução. A confirmação em PROD conclui as Histórias contidas nessa candidata.</p>}
   <p className="hint">A promoção e a implantação de candidatas ainda não estão disponíveis no portal.</p>

  </>}
  {storyHref&&<p className="hint">Esta consulta acompanha a História atual e preserva a tentativa consultada da Tarefa. <Link href={storyHref}>Consultar entrega na História →</Link></p>}
  <div className="actions">{!dev&&!storyHref&&delivery.release.association!=='unconfirmed'&&(!release||release.compositionStatus==='OPEN')&&<button type="button" disabled={readOnly||stale} onClick={onChooseRelease}>{release?'Alterar release':'Escolher release'}</button>}<button type="button" onClick={onBack}>{backLabel}</button></div>
 </section>;
}
