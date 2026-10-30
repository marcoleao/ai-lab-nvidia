export const codeDestinationPolicy='explicit-dev-v1' as const;
export type CodeDestination={policy:typeof codeDestinationPolicy;repositoryId:string;repositoryVersion:number;projectId:number;targetBranch:string;baseSha:string};
export type CodeDestinationReview={executionId:string;storyVersion:number;repositoryName:string;destination:CodeDestination;contextToken:string;observedAt:string;required:boolean};
export type CodeDestinationApproval={destination:CodeDestination;contextToken:string};
