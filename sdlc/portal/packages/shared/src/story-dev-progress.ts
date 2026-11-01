export type StoryDevStep='build'|'deployment'|'test'|'acceptance'|'approval';
export type StoryDevProgress={
 version:1;storyId:string;storyVersion:number;executionId:string|null;
 state:'build_required'|'deployment_required'|'test_required'|'technical_only'|'acceptance_failed'|'approval_required'|'approved'|'working'|'unknown'|'unavailable'|'changed';
 title:string;message:string;asOf:string;observedAt:string|null;liveUrl:string|null;
 nextAction:{label:string;step:StoryDevStep}|null;
 checks:{id:string;label:string;passed:boolean;detail:string}[];
 acceptance:{basis?:'human_story'|'criteria'|'automated';scope:'technical'|'acceptance'|null;covered:number;total:number;httpOnly:boolean};
};
