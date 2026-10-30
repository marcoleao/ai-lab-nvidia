// A current server observation, never an authorization or a model tool call.
export type AssistantSystemAction={
 kind:'application_preparation';systemId:string;systemVersion:number;systemName:string;
 configured:boolean;repositoryId:string|null;repositoryVersion:number|null;repositoryReady:boolean;readOnly:boolean;blockers:string[];
 operationId:string|null;operationState:string|null;mrState:string|null;resolved:boolean;asOf:string;
};
