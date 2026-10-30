import {afterEach,expect,test,vi} from 'vitest';
import {GitLabMergeProvider} from '../apps/api/src/merge-provider.ts';
afterEach(()=>vi.unstubAllGlobals());
const sha='a'.repeat(40),base='b'.repeat(40),ref={projectId:7,iid:1,sourceBranch:'story',targetBranch:'main',sha,expectedTargetSha:base};
function fixture(change:Record<string,unknown>={}){
 let ready=false;const writes:{path:string;body:unknown}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname;
  if(init.method==='PUT'){writes.push({path,body:JSON.parse(String(init.body))});ready=true;}
  const value=path.endsWith('/user')?{username:'sdlc-agent-for-merge',is_admin:false,state:'active'}:path.endsWith('/projects/7')?{archived:false,path_with_namespace:'sdlc/product',topics:['sdlc-managed']}:path.includes('/repository/branches/')?{commit:{id:base}}:{project_id:7,source_project_id:7,target_project_id:7,source_branch:'story',target_branch:'main',sha,state:'opened',title:ready?'Feature':'Draft: Feature',draft:!ready,head_pipeline:{status:'success',sha},blocking_discussions_resolved:true,detailed_merge_status:ready?'mergeable':'draft_status',...change};
  return new Response(JSON.stringify(value));
 }));return writes;
}
test('dedicated release changes only Draft title, preserves branches and never calls merge; repeat reads only',async()=>{
 const writes=fixture(),p=new GitLabMergeProvider('http://gitlab','isolated');expect((await p.releaseDraft(ref)).draft).toBe(false);await p.releaseDraft(ref);expect(writes).toEqual([{path:'/api/v4/projects/7/merge_requests/1',body:{title:'Feature'}}]);
});
test.each([{sha:'c'.repeat(40)},{has_conflicts:true},{head_pipeline:null},{state:'closed'}])('changed or ineligible MR refuses Draft release before any write: %j',async change=>{
 const writes=fixture(change);await expect(new GitLabMergeProvider('http://gitlab','isolated').releaseDraft(ref)).rejects.toThrow();expect(writes).toEqual([]);
});
