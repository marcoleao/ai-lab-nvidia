export type MergeIntegrationObservation={projectId:number;iid:number;sourceBranch:string;targetBranch:string;sourceSha:string;mergeCommitSha:string|null;squashCommitSha:string|null;mergedAt:string|null};
export type MergeClosureObservation={projectId:number;iid:number;sourceBranch:string;targetBranch:string;sourceSha:string;state:'closed';mergeCommitSha:null;squashCommitSha:null;mergedAt:null;mergeScheduled:false};
export type MergeOpenClosureObservation=Omit<MergeClosureObservation,'state'>&{state:'opened';updatedAt:string};
export type MergeRemoteClosureReading={id:string;state:string;version:number;createdAt:string;updatedAt:string;message:string;reason:string;actorName:string;writeStartedAt:string|null;leaseUntil:string|null};
export type MergeHistoryResolutionReading={id:string;observedAt:string;decidedAt:string;actorName:string;reason:string;observedState:'closed'};
export type MergeIntegrationReading={
 state:'recorded'|'partial'|'not_captured'|'unconfirmed'|'resolved';remoteClosure?:MergeRemoteClosureReading;resolution?:MergeHistoryResolutionReading;historicalReconciliation?:boolean;id?:string;operationId:string;executionId?:string;projectId?:number;iid?:number;
 sourceBranch?:string;targetBranch?:string;sourceSha?:string;integrationSha?:string|null;mergeCommitSha?:string|null;squashCommitSha?:string|null;
 mergedAt?:string|null;observedAt?:string;policyVersion?:string;
};
/** A receipt describes its request; it cannot erase a subsequently known integration. */
export function mergeIntegrationReading(source:MergeIntegrationReading,receipt?:MergeIntegrationReading|null):MergeIntegrationReading{
 if(!receipt||receipt.operationId!==source.operationId)return source;
 const positive=(v:MergeIntegrationReading)=>v.state==='recorded'||v.state==='partial';
 const preferred=positive(source)&&!positive(receipt)?source:source.state==='resolved'&&['not_captured','unconfirmed'].includes(receipt.state)?source:receipt;
 const a=source.remoteClosure,b=receipt.remoteClosure,remoteClosure=!a?b:!b?a:a.id===b.id?(a.version>=b.version?a:b):a.createdAt>b.createdAt||a.createdAt===b.createdAt&&a.id>b.id?a:b;
 return {...preferred,...(source.resolution||receipt.resolution?{resolution:source.resolution??receipt.resolution}:{}),...(remoteClosure?{remoteClosure}:{})};
}
