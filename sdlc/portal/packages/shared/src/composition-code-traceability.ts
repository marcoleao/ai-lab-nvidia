import type {PlanningReferenceReading} from './planning-reference.ts';

/** A read of existing sources for the exact execution saved in a composition.
 * This is neither a new composition fact nor evidence of package/deployment. */
export type CompositionCodeTraceability={
 policy:'composition-code-trace-v1';
 state:'not_planned'|'not_published'|'unavailable'|'divergent'|'not_integrated'|'not_captured'|'partial'|'recorded';
 message:string;
 planning:PlanningReferenceReading;
 publication?:{executionId:string;sourceBranch:string|null;sourceSha:string};
 integration?:{referenceId:string;operationId:string;projectId:number;iid:number;sourceBranch:string;targetBranch:string;sourceSha:string;integrationSha:string|null;mergeCommitSha:string|null;squashCommitSha:string|null;mergedAt:string|null;observedAt:string;capturedAfterComposition:boolean};
};
