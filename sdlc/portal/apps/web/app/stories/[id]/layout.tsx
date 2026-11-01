'use client';
import type {ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import Portal from '../../portal';
import {parseStoryExecutionRoute} from '../../story-execution-navigation';

// Keep the workspace, drafts and pending command owners mounted between actions.
export default function StoryLayout({children}:{children:ReactNode}){
 const pathname=usePathname(),parts=pathname.replace(/\/+$/,'').split('/');
 let id='';try{id=decodeURIComponent(parts[2]||'');}catch{}
 const valid=parts.length===3||Boolean(id&&parseStoryExecutionRoute(pathname,id));
 return <>{children}{valid&&<Portal/>}</>;
}
