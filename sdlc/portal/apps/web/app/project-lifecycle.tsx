'use client';
import GroupLifecycle from './group-lifecycle';
export default function ProjectLifecycle(props:{value:string;version:number;enabled:boolean;onChange:(body:{lifecycle:string;expectedVersion:number;comment?:string})=>Promise<unknown>}){return <GroupLifecycle kind="Projeto" {...props}/>;}
