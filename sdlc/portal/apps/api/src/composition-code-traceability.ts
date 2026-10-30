import type {Transaction} from '../../../packages/db/client.ts';
import type {PlanningReference} from '../../../packages/shared/src/planning-reference.ts';
import {planningReferenceReading} from '../../../packages/shared/src/planning-reference.ts';
import type {CompositionCodeTraceability} from '../../../packages/shared/src/composition-code-traceability.ts';
import {planningReferences} from './planning-references.ts';

type Member=PlanningReference&{compositionCreatedAt:Date};
const sha=(value:string|null|undefined)=>!!value&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

// Batched by the requested page, never by the latest execution of each Story.
// Historical records stay untouched when evidence is captured subsequently.
export async function compositionCodeTraceability(tx:Transaction,systemId:string,members:readonly Member[]){
 const executionIds=[...new Set(members.flatMap(v=>v.execution?[v.execution.id]:[]))];
 const [runs,current]=await Promise.all([
  tx.storyExecution.findMany({where:{id:{in:executionIds}},select:{id:true,storyId:true,repositoryId:true,commitSha:true,branch:true}}),
  planningReferences(tx,members.map(v=>v.storyId))
 ]);
 const [repositories,operations]=await Promise.all([
  tx.repository.findMany({where:{id:{in:[...new Set(runs.map(v=>v.repositoryId))]}},select:{id:true,systemId:true}}),
  tx.mergeOperation.findMany({where:{executionId:{in:executionIds}},select:{id:true,executionId:true,storyId:true,projectId:true,iid:true,sourceBranch:true,targetBranch:true,sha:true,state:true}})
 ]);
 const references=await tx.mergeIntegrationReference.findMany({where:{operationId:{in:operations.map(v=>v.id)}}});
 const runById=new Map(runs.map(v=>[v.id,v])),repoById=new Map(repositories.map(v=>[v.id,v])),opByRun=new Map(operations.map(v=>[v.executionId,v])),refByOp=new Map(references.map(v=>[v.operationId,v]));
 return members.map(member=>{
  const now=current.get(member.storyId),planning=now?planningReferenceReading(now,member,true):{state:'unconfirmed' as const,message:'Referência atual da História indisponível. O registro da composição foi preservado.',changes:[],approval:'unconfirmed' as const};
  const base={policy:'composition-code-trace-v1' as const,planning};
  const result=(state:CompositionCodeTraceability['state'],message:string,extra:Partial<CompositionCodeTraceability>={}):CompositionCodeTraceability=>({...base,state,message,...extra});
  if(!member.execution)return result('not_planned','Execução de código não capturada nesta composição. Nenhuma execução posterior foi usada como substituta.');
  if(!sha(member.execution.sha))return result('not_published','Código publicado não capturado nesta composição. Uma publicação posterior exige revisão explícita do planejamento.');
  const run=runById.get(member.execution.id);
  if(!run)return result('unavailable','A execução registrada na composição não está disponível. Nenhuma execução posterior foi usada como substituta.');
  if(run.storyId!==member.storyId||repoById.get(run.repositoryId)?.systemId!==systemId)return result('divergent','A identidade da execução não corresponde à História e ao Sistema desta composição. Referências de outro escopo não são apresentadas.');
  if(run.commitSha!==member.execution.sha)return result('divergent','O código da execução diverge do commit registrado na composição. Revise as referências; a composição foi preservada.');
  const publication={executionId:run.id,sourceBranch:run.branch,sourceSha:member.execution.sha!},op=opByRun.get(run.id);
  if(!op)return result('not_integrated','Nenhuma integração está registrada para esta execução. Isso não comprova falha de merge.',{publication});
  if(op.storyId!==member.storyId||op.sha!==member.execution.sha||op.sourceBranch!==run.branch)return result('divergent','O pedido de integração diverge da execução e do código planejados. Revise as evidências da execução.',{publication});
  const reference=refByOp.get(op.id);
  if(!reference)return result(op.state==='succeeded'?'not_captured':'not_integrated',op.state==='succeeded'?'Merge confirmado no acompanhamento, mas a referência integrada não foi capturada. Consulte as evidências da execução para verificar e registrar a referência.':'Integração não confirmada para esta execução. Consulte suas evidências; ausência de referência não comprova falha de merge.',{publication});
  if(reference.executionId!==run.id||reference.storyId!==member.storyId||reference.repositoryId!==run.repositoryId||reference.projectId!==op.projectId||reference.iid!==op.iid||reference.sourceSha!==member.execution.sha||reference.sourceBranch!==op.sourceBranch||reference.targetBranch!==op.targetBranch)return result('divergent','A referência integrada diverge da identidade planejada. O código de outra execução não foi associado à composição.',{publication});
  return result(reference.integrationSha?'recorded':'partial',reference.integrationSha?'Referência da integração disponível para a execução registrada.':'Merge confirmado com referência parcial: o commit integrado não foi informado. O commit da fonte não o substitui.',{publication,integration:{referenceId:reference.id,operationId:op.id,projectId:reference.projectId,iid:reference.iid,sourceBranch:reference.sourceBranch,targetBranch:reference.targetBranch,sourceSha:reference.sourceSha,integrationSha:reference.integrationSha,mergeCommitSha:reference.mergeCommitSha,squashCommitSha:reference.squashCommitSha,mergedAt:reference.mergedAt?.toISOString()??null,observedAt:reference.observedAt.toISOString(),capturedAfterComposition:reference.observedAt>member.compositionCreatedAt}});
 });
}
