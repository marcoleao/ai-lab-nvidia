import {notFound} from 'next/navigation';

export default async function StoryExecutionPage({params}:{params:Promise<{id:string;view?:string[]}>}){
 const {view=[]}=await params;
 const valid=view.length===0||view.length===1&&['conversation','processing','administration','destination','delivery','release','specification'].includes(view[0])||view.length===2&&(view[0]==='actions'&&/^[a-z][a-z0-9_]{0,79}$/.test(view[1])||view[0]==='dev'&&['build','deployment','test','acceptance','approval'].includes(view[1])||view[0]==='environments'&&['DEV','QA','HML','PRD'].includes(view[1]));
 if(!valid)notFound();
 return null;
}
