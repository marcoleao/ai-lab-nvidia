import type {DevelopmentApprovalValidity} from './development-approval.js';

export type ReleaseDevelopmentState='ready'|'blocked'|'unconfirmed';
export type ReleaseDevelopmentReason={code:string;state:Exclude<ReleaseDevelopmentState,'ready'>;message:string;action:{label:string;href:string}};
export type ReleaseDevelopmentStory={
 id:string;key:string;name:string;state:ReleaseDevelopmentState;
 development:{state:DevelopmentApprovalValidity['state'];label:string;matchesComposition:boolean;approval:{id:string;number:number;createdAt:string;actorName:string}|null};
 references:{specificationId:string|null;executionId:string|null;sourceSha:string|null;integrationReferenceId:string|null;integrationSha:string|null};
 reasons:ReleaseDevelopmentReason[];
};

/** Defensive version boundary for the browser; partial HTTP 200 is not a
 * confirmed reading. No server schemas or private execution data enter the UI. */
export function isReleaseDevelopmentReadiness(value:unknown,releaseId:string):value is ReleaseDevelopmentReadiness{
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
 const integer=(v:unknown,min=0)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
 const choice=(v:unknown,values:string[])=>typeof v==='string'&&values.includes(v);
 const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 const reason=(v:unknown)=>object(v)&&text(v.code)&&choice(v.state,['blocked','unconfirmed'])&&text(v.message)&&object(v.action)&&text(v.action.label)&&text(v.action.href)&&/^\/(?:stories|releases)\//.test(v.action.href);
 if(!object(value))return false;
 const v=value;
 if(v.policy!=='release-development-readiness-v1'||v.qaPreparationAvailable!==false||!choice(v.state,['ready','blocked','unconfirmed','empty'])||!text(v.coverage))return false;
 if(!object(v.release)||v.release.id!==releaseId||!text(v.release.key)||!text(v.release.systemId)||!integer(v.release.version,1)||!choice(v.release.compositionStatus,['OPEN','CLOSED','CANCELED'])||v.release.flowEnvironment!==null&&!text(v.release.flowEnvironment))return false;
 if(v.composition!==null&&(!object(v.composition)||!text(v.composition.id)||!integer(v.composition.number,1)||!integer(v.composition.storyCount)||v.composition.digest!==null&&!digest(v.composition.digest)))return false;
 if(!object(v.evaluation)||!digest(v.evaluation.digest)||!date(v.evaluation.asOf)||typeof v.evaluation.complete!=='boolean')return false;
 if(!object(v.summary)||!['total','developmentApproved','ready','blocked','unconfirmed'].every(key=>integer((v.summary as Record<string,unknown>)[key])))return false;
 if(!object(v.pagination)||!integer(v.pagination.page,1)||v.pagination.pageSize!==20||!integer(v.pagination.total)||!integer(v.pagination.totalPages,1))return false;
 if(!object(v.query)||!integer(v.query.page,1)||typeof v.query.search!=='string'||!choice(v.query.filter,['issues','all','ready','blocked','unconfirmed'])||!choice(v.query.sort,['key','name'])||!choice(v.query.direction,['asc','desc']))return false;
 if(!Array.isArray(v.reasons)||!v.reasons.every(reason)||!Array.isArray(v.stories)||v.stories.length>20)return false;
 return v.stories.every(row=>{
  if(!object(row)||!text(row.id)||!text(row.key)||!text(row.name)||!choice(row.state,['ready','blocked','unconfirmed'])||!object(row.development)||!choice(row.development.state,['not_recorded','valid','outdated','unconfirmed'])||!text(row.development.label)||typeof row.development.matchesComposition!=='boolean')return false;
  const approval=row.development.approval;
  if(approval!==null&&(!object(approval)||!text(approval.id)||!integer(approval.number,1)||!date(approval.createdAt)||!text(approval.actorName)))return false;
  return object(row.references)&&['specificationId','executionId','sourceSha','integrationReferenceId','integrationSha'].every(key=>row.references&&((row.references as Record<string,unknown>)[key]===null||text((row.references as Record<string,unknown>)[key])))&&Array.isArray(row.reasons)&&row.reasons.every(reason);
 });
}
export type ReleaseDevelopmentReadiness={
 policy:'release-development-readiness-v1';
 release:{id:string;key:string;version:number;systemId:string;compositionStatus:string;flowEnvironment:string|null};
 composition:{id:string;number:number;digest:string|null;storyCount:number}|null;
 evaluation:{digest:string;asOf:string;complete:boolean};
 state:ReleaseDevelopmentState|'empty';
 summary:{total:number;developmentApproved:number;ready:number;blocked:number;unconfirmed:number};
 reasons:ReleaseDevelopmentReason[];coverage:string;qaPreparationAvailable:false;
 stories:ReleaseDevelopmentStory[];
 pagination:{page:number;pageSize:number;total:number;totalPages:number};
 query:{page:number;search:string;filter:'issues'|'all'|ReleaseDevelopmentState;sort:'key'|'name';direction:'asc'|'desc'};
};
