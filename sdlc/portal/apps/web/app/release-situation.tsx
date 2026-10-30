import {releaseReading,type ReleaseReading} from '../../../packages/shared/src/release-reading';

export default function ReleaseSituation({situation,compositionStatus,flowEnvironment,compact=false,stale=false,loading=false}:{situation?:ReleaseReading;compositionStatus?:string|null;flowEnvironment?:string|null;compact?:boolean;stale?:boolean;loading?:boolean}){
 const reading=situation??releaseReading(compositionStatus,flowEnvironment);
 const rows=[['Estado da release',reading.composition.label],['Candidata e artefatos',reading.candidate.label],['Ambiente do fluxo',reading.environment.label],['Implantação',reading.deployment.label],['Validação',reading.validation.label]];
 return <div className={`release-situation${compact?' release-situation-compact':''}`} aria-busy={loading} data-testid="release-situation">
  {!compact&&<h2>Situação da entrega</h2>}
  {stale&&<p role="status" className="hint">Última consulta confirmada. A situação atual não foi confirmada; atualize a consulta.</p>}
  <dl aria-label="Dimensões da entrega">{rows.map(([title,value])=><div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
  {!compact&&<p className="hint">Planejamento, ambiente, implantação e validação são informações independentes. A consulta não inicia trabalho nem aprova a entrega.</p>}
 </div>;
}
