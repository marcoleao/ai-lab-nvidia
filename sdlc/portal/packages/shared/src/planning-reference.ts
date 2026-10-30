export type PlanningReference={storyId:string;storyKey:string;storyName:string;recordVersion:number;specification:{id:string;number:number}|null;execution:{id:string;sha:string|null;storyRecordVersion:number}|null;contentDigest:string|null;contentPolicy?:string;referenceToken?:string};
export type PlanningReferenceState='unassigned'|'unconfirmed'|'outdated'|'current';
export function planningReferenceReading(current:PlanningReference,recorded:PlanningReference|null,assigned:boolean){
 const changes:string[]=[];
 if(recorded?.contentPolicy==='story-planning-v2'){
  if(recorded.contentDigest!==current.contentDigest)changes.push('Conteúdo da História alterado.');
  if(recorded.specification?.id!==current.specification?.id)changes.push('Referência de especificação alterada.');
  const oldSha=recorded.execution?.sha,newSha=current.execution?.sha;
  if(newSha&&newSha!==oldSha)changes.push('Referência de código publicada alterada.');
  else if(!current.execution&&recorded.execution)changes.push('Referência da execução não está disponível no contexto atual.');
 }
 const known=!!recorded?.referenceToken&&recorded.contentPolicy==='story-planning-v2';
 const incomplete=!!current.execution&&!current.execution.sha;
 const state:PlanningReferenceState=!assigned?'unassigned':!known?'unconfirmed':changes.length?'outdated':incomplete?'unconfirmed':recorded!.referenceToken===current.referenceToken?'current':'unconfirmed';
 const message=state==='unassigned'?'Sem release associada.':state==='unconfirmed'?known&&incomplete?'A execução atual ainda não tem código publicado. Salvar o planejamento não confirma essa publicação.':'Referências ainda não conferidas. Revise e salve para registrar.':state==='outdated'?'Conteúdo, especificação ou código mudou. Revise e salve o planejamento.':'Referências de planejamento conferidas. Isso não comprova aprovação ou implantação.';
 return {state,message,changes,approval:'unconfirmed' as const};
}
export type PlanningReferenceReading=ReturnType<typeof planningReferenceReading>;
