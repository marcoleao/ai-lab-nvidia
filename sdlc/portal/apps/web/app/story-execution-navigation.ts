import type {StoryDevStep} from '../../../packages/shared/src/story-dev-progress';

export type StoryExecutionView='hub'|'action'|'conversation'|'processing'|'administration'|'destination'|'delivery'|'release'|'specification'|'environment';
export type StoryExecutionRoute={view:StoryExecutionView;actionId?:string;step?:StoryDevStep;environment?:'DEV'|'QA'|'HML'|'PRD'};

const steps:readonly string[]=['build','deployment','test','acceptance','approval'];
const views:readonly string[]=['conversation','processing','administration','destination','delivery','release','specification'];
const environments:readonly string[]=['DEV','QA','HML','PRD'];
const executionParameters=['process','interact','devStep','environment','tab'];

function segment(value:string){
 try{const decoded=decodeURIComponent(value);return decoded&&!/[\\/\u0000-\u001f\u007f]/.test(decoded)&&!['.','..'].includes(decoded)?decoded:null;}catch{return null;}
}

/** Builds a navigation URL; it never represents a command or a permission. */
export function storyExecutionHref(id:string,view:StoryExecutionView='hub',query?:URLSearchParams|string,actionId?:string){
 const params=new URLSearchParams(typeof query==='string'?query:query?.toString());
 const explicitStep=actionId&&steps.includes(actionId)?actionId:null;
 const requestedStep=explicitStep||params.get('devStep');
 const requestedEnvironment=actionId&&environments.includes(actionId)?actionId:params.get('environment')||'DEV';
 for(const name of executionParameters)params.delete(name);
 if(view==='hub')params.delete('returnEnvironment');
 const base=`/stories/${encodeURIComponent(id)}/execution`;
 let path=base;
 if(view==='action'&&actionId&&segment(encodeURIComponent(actionId)))path+=`/actions/${encodeURIComponent(actionId)}`;
 else if(view==='environment'){
  if(steps.includes(requestedStep||'')&&(explicitStep||requestedEnvironment==='DEV'))path+=`/dev/${requestedStep}`;
  else path+=`/environments/${environments.includes(requestedEnvironment)?requestedEnvironment:'DEV'}`;
 }else if(views.includes(view))path+=`/${view}`;
 return path+(params.size?`?${params.toString()}`:'');
}

/** Parses only the execution subtree of this Story, including direct links. */
export function parseStoryExecutionRoute(pathname:string,id:string):StoryExecutionRoute|null{
 const raw=pathname.split(/[?#]/,1)[0].replace(/\/+$/,'').split('/').slice(1);
 const parts=raw.map(segment);
 if(parts.some(value=>value===null)||parts[0]!=='stories'||parts[1]!==id||parts[2]!=='execution')return null;
 if(parts.length===3)return {view:'hub'};
 if(parts.length===4&&views.includes(parts[3]!))return {view:parts[3] as StoryExecutionView};
 if(parts.length===5&&parts[3]==='actions'&&/^[a-z][a-z0-9_]{0,79}$/.test(parts[4]!))return {view:'action',actionId:parts[4]!};
 if(parts.length===5&&parts[3]==='dev'&&steps.includes(parts[4]!))return {view:'environment',step:parts[4] as StoryDevStep,environment:'DEV'};
 if(parts.length===5&&parts[3]==='environments'&&environments.includes(parts[4]!))return {view:'environment',environment:parts[4] as StoryExecutionRoute['environment']};
 return null;
}

/** Accept a return only inside a known Story subtree, never an external URL. */
export function storyReturnHref(value:string|null|undefined,storyId?:string):string|null{
 if(!value?.startsWith('/stories/'))return null;
 try{
  const url=new URL(value,'http://sdlc.local');
  if(url.origin!=='http://sdlc.local')return null;
  const match=/^\/stories\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname);
  if(!match||storyId&&match[1]!==storyId)return null;
  if(url.pathname!==`/stories/${match[1]}`&&!parseStoryExecutionRoute(url.pathname,match[1]))return null;
  return `${url.pathname}${url.search}${url.hash}`;
 }catch{return null;}
}
