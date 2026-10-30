import type {BranchPlanRecording} from './release-branch-policy.ts';
export type BranchPlanQuery={branchName:string;baseSha?:string;page:number;search:string;direction:'asc'|'desc';targetBranch?:string;asOf:string};
export type ObservedBranch={name:string;sha:string;protected:boolean};
export type ObservedIntegration={iid:number;sourceProjectId:number|null;title:string;sourceBranch:string;targetBranch:string;sha:string;mergeSha:string|null;squashSha:string|null;mergedAt:string|null;url:string};
export type BranchPlanObservation={defaultBranch:ObservedBranch|null;proposedBranch:ObservedBranch|null;baseCommit:{sha:string}|null;integrations:ObservedIntegration[];pagination:{page:number;pageSize:number;total:number|null;hasNext:boolean};observedAt:string;asOf:string;search:string;direction:'asc'|'desc'};
export type ReleaseBranchPlan={
 release:{id:string;key:string;version:number;compositionRevisionId:string|null;compositionNumber:number|null};
 repository:{id:string;name:string;path:string|null;version:number;gitlabProjectId:number};
 observed:BranchPlanObservation;
 proposal:{branchName:string;baseSha:string|null;scenario:'undecided'|'initial'|'production';approval:'pending'|'recorded';canCreate:false};
 recording:BranchPlanRecording;
 integrations:(ObservedIntegration&{stories:{id:string;key:string;name:string;inComposition:boolean;matchesPlannedCode:boolean}[]})[];
 decisions:{id:string;message:string}[];
 coverage:string;
};
