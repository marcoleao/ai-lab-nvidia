// Navigation metadata only; every command still uses the domain preview and confirmation.
export type AssistantDevAction={kind:'environment_target'|'development_deployment';contextId:string;systemId:string;systemVersion:number;storyId:string|null;storyVersion:number|null;configured:boolean;readOnly:boolean;blockers:string[];operationId:string|null;operationState:string|null;asOf:string};
