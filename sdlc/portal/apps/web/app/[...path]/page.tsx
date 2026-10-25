import Portal from '../portal';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const list=path.length===1&&['systems','releases','assistant','integrations'].includes(path[0]);
  const detail=path.length===2&&['systems','projects','epics','stories','tasks','releases'].includes(path[0]);
  if(!list&&!detail)notFound();
  return <Portal/>;
}
