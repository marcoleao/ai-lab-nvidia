import {environmentCodes,type EnvironmentCode} from './environments.ts';

export type DeliveryRelease={id:string;key:string;name:string;compositionStatus:string};
// This contract separates ownership and prerequisites. It is not an execution
// result: System environment metadata cannot attest a Story's deployed revision.
export function storyDeliveryReading(input:{status:string;mergeConfirmed?:boolean;publicationAvailable?:boolean;release?:DeliveryRelease|null}){
 const terminal=['completed','cancelled'].includes(input.status);
 return {
  version:1 as const,
  development:{environment:'DEV' as const,unit:'story' as const,releaseRequired:false as const,publication:'unconfirmed' as const,approval:'unconfirmed' as const,next:!!input.mergeConfirmed&&!terminal,publicationAvailable:input.publicationAvailable===true},
  release:{association:input.release===undefined?'unconfirmed' as const:input.release?'assigned' as const:'unassigned' as const,reference:input.release??null,candidate:'unconfirmed' as const},
  promotion:{releaseRequiredFrom:'QA' as const,immutableCandidateRequired:true as const,allStoriesDevelopmentApprovalRequired:true as const,available:false as const},
  destinations:environmentCodes.map(code=>({code,label:code==='PRD'?'PROD':code,unit:code==='DEV'?'story' as const:'release' as const,publication:'unconfirmed' as const,validation:'unconfirmed' as const}))
 };
}
export type StoryDeliveryReading=ReturnType<typeof storyDeliveryReading>;
export function deliveryEnvironment(value:string|null):EnvironmentCode{
 const code=value==='PROD'?'PRD':value;
 return environmentCodes.includes(code as EnvironmentCode)?code as EnvironmentCode:'DEV';
}
