export type EpicCycleAction={target:string;label:string;reasonRequired:boolean;blockers:string[]};
export type EpicExecutionReading={
 item:{id:string;name:string;version:number;recordedStatus:string;lifecycle:string};
 stories:{total:number;open:number;archived:number};
 openDescendants:number;archivedOpenDescendants:number;running:number;
 actions:EpicCycleAction[];
 resume:{paused:number;eligible:number;blockers:string[]};
 asOf:string;contextToken:string;includesArchived:true;
};
