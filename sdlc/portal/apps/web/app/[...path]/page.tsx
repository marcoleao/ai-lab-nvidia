import Portal from '../portal';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const list=path.length===1&&path[0]==='systems';
  const detail=path.length===2&&['systems','projects','epics','stories','tasks'].includes(path[0]);
  if(!list&&!detail)notFound();
  return <Portal/>;
}
