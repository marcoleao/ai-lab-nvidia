import type {DevelopmentApprovalReading} from './development-approval.js';
export type StoryRevisionReference={
 specification:{id:string;number:number}|null;
 execution:{id:string;sha:string|null;storyRecordVersion:number;state:string;stage:string}|null;
};

// Reading existing facts does not grant development approval or attest a deploy.
// Record version is an optimistic lock, not an approved content revision.
export function storyLifecycleReading(input:{id:string;status:string;version:number;revision:StoryRevisionReference;developmentApproval?:DevelopmentApprovalReading;executionContext?:'current'|'outdated'|'not_checked'}){
 const recorded=input.status==='completed',cancelled=input.status==='cancelled';
 return {
  version:1 as const,storyId:input.id,
  development:input.developmentApproval?{...input.developmentApproval.validity,approvalAvailable:input.developmentApproval.approvalAvailable,approval:input.developmentApproval.approval}:{state:'not_recorded' as const,label:'Sem aprovação registrada',approvalAvailable:false,approval:null,reasons:[] as string[]},
  completion:{state:recorded?'recorded_without_production_evidence' as const:cancelled?'cancelled' as const:'awaiting_production' as const,label:recorded?'Conclusão registrada; produção não confirmada':cancelled?'História cancelada':'Aberta; depende da entrada em produção',production:'unconfirmed' as const,completionAvailable:false as const},
  revision:{recordVersion:input.version,specification:input.revision.specification,execution:input.revision.execution,executionContext:input.executionContext??'not_checked'},
 };
}
export type StoryLifecycleReading=ReturnType<typeof storyLifecycleReading>;
