export const environmentRuntimeProfile='node24-http-v1';
export type TargetProof={resourceId:string;resourceName:string;configDigest:string;unitId:string;profile:string};
export type EnvironmentTarget={id:string;environmentId:string;resourceId:string;resourceName:string;configDigest:string;unitId:string;profile:string;confirmedAt:string};
export type EnvironmentOperation={id:string;systemId:string;environmentId:string;number:number;version:number;state:string;message:string;actorName:string;reason:string;sourceSha:string;contractDigest:string;unitId:string;profile:string;dispatchStartedAt:string|null;createdAt:string;updatedAt:string;finishedAt:string|null};
export type TargetObservation={state:'absent'|'prepared'|'conflict'|'unavailable';proof?:TargetProof};
export type EnvironmentTargetReading={systemId:string;configured:boolean;operation:EnvironmentOperation|null;target:EnvironmentTarget|null;asOf:string};
export type EnvironmentTargetContext={systemId:string;systemVersion:number;repositoryId:string|null;repositoryVersion:number|null;environmentId:string|null;sourceSha:string|null;contractDigest:string|null;unitId:string|null;profile:string;allowed:boolean;blockers:string[];token:string;asOf:string;observation:TargetObservation};
