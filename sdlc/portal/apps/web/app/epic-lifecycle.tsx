'use client';
import GroupLifecycle from './group-lifecycle';
export default function EpicLifecycle({value,version,enabled,projectClosed=false,onChange}:{value:string;version:number;enabled:boolean;projectClosed?:boolean;onChange:(body:{status:string;expectedVersion:number;comment?:string})=>Promise<unknown>}){return <GroupLifecycle kind="Épico" value={value} version={version} enabled={enabled&&!projectClosed} onChange={({lifecycle,...body})=>onChange({...body,status:lifecycle})}/>;}
