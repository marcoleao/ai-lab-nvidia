'use client';

import Link from 'next/link';
import type {StoryDevProgress} from '../../../packages/shared/src/story-dev-progress';
import {ErrorState,LoadingState,displayDate} from './experience-ui';
import './story-dev-summary.css';

export default function StoryDevSummary({reading,loading=false,stale=false,onRefresh,stepHref,onStep}:{reading?:StoryDevProgress;loading?:boolean;stale?:boolean;onRefresh:()=>void;stepHref:(step:NonNullable<StoryDevProgress['nextAction']>['step'])=>string;onStep:(step:NonNullable<StoryDevProgress['nextAction']>['step'])=>void}){
 if(!reading&&!loading&&!stale)return null;
 const current=!!reading&&!stale&&!loading;
 let liveUrl:string|null=null;
 if(current&&reading.liveUrl){try{const url=new URL(reading.liveUrl);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)liveUrl=url.href;}catch{}}
 return <section className="panel story-dev-summary" aria-label="Situação da entrega em DEV" data-testid="story-dev-summary" data-state={current?reading.state:'unknown'}>
  <p className="eyebrow">ENTREGA ATUAL DA HISTÓRIA · DEV</p>
  <h2>{stale?'Situação DEV não confirmada':reading?.title||'Consultando entrega em DEV…'}</h2>
  {loading&&<LoadingState>Consultando entrega em DEV…</LoadingState>}
  {stale?<ErrorState><p>A atualização da entrega não chegou.{reading&&<> Última leitura preservada, de {displayDate(reading.asOf)}.</>}</p></ErrorState>:reading&&<p>{reading.message}</p>}
  <div className="actions">
   {liveUrl&&<a className="story-dev-open" href={liveUrl} target="_blank" rel="noreferrer">Abrir aplicação em DEV ↗</a>}
   {current&&reading.nextAction&&<Link href={stepHref(reading.nextAction.step)} scroll={false} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)onStep(reading.nextAction!.step);}}>{reading.nextAction.label}</Link>}
   {stale&&<button type="button" onClick={onRefresh}>Atualizar situação</button>}
  </div>
  {liveUrl&&<p className="story-dev-url">{liveUrl}</p>}
  {current&&reading.observedAt&&<p className="hint story-dev-observation">Disponibilidade observada em {displayDate(reading.observedAt)}.</p>}
 </section>;
}
