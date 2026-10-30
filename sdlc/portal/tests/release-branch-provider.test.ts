import {afterEach,expect,test,vi} from 'vitest';
import {GitLabReleaseBranchProvider} from '../apps/api/src/release-branch-provider.ts';
const sha='a'.repeat(40),ref={projectId:7,branchName:'sdlc/release-isolated',baseSha:sha,defaultBranch:'main'};
afterEach(()=>vi.unstubAllGlobals());
function fixture(options:{username?:string;admin?:boolean;omitAdmin?:boolean;access?:number;path?:string;branchSha?:string;unsafe?:boolean;secondPageUnsafe?:boolean;lost?:'protection'|'branch';existingProtected?:boolean}={}){
 let branchSha=options.branchSha??null,protectedName=options.existingProtected??false;
 const writes:{path:string;body:any}[]=[],reads:string[]=[];
 const rule=()=>({name:ref.branchName,allow_force_push:false,push_access_levels:[{access_level:0}],merge_access_levels:[{access_level:40}]});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  const u=new URL(url),path=u.pathname,body=init.body?JSON.parse(String(init.body)):null;let value:any;
  if(init.method==='POST'){
   writes.push({path,body});
   if(path.endsWith('/protected_branches')){protectedName=true;if(options.lost==='protection')throw Error('lost');value=rule();}
   else if(path.endsWith('/repository/branches')){branchSha=body.ref;if(options.lost==='branch')throw Error('lost');value={name:body.branch,commit:{id:branchSha}};}
   else throw Error('Unexpected endpoint');
  }else{
   reads.push(path+u.search);
   if(path.endsWith('/user'))value={username:options.username??'sdlc-agent-for-merge',is_admin:options.omitAdmin?undefined:options.admin??false,state:'active'};
   else if(path.endsWith('/projects/7'))value={id:7,archived:false,path_with_namespace:options.path??'sdlc/system/repo',topics:['sdlc-managed'],default_branch:'main',permissions:{group_access:{access_level:options.access??40}}};
   else if(path.includes('/commits/'))value={id:sha};
   else if(path.includes('/repository/branches/')){if(!branchSha)return new Response('{}',{status:404});value={name:ref.branchName,commit:{id:branchSha},protected:protectedName};}
   else if(path.endsWith('/protected_branches')){
    if(options.secondPageUnsafe&&u.searchParams.get('page')==='1')return new Response(JSON.stringify(Array.from({length:100},(_,i)=>({...rule(),name:'other-'+i}))),{headers:{'x-next-page':'2'}});
    value=options.unsafe||options.secondPageUnsafe?[{...rule(),name:'sdlc/*',allow_force_push:true,push_access_levels:[{access_level:30}]}]:protectedName?[rule()]:[];
   }else throw Error('Unexpected read '+url);
  }
  return new Response(JSON.stringify(value));
 }));return {writes,reads,provider:new GitLabReleaseBranchProvider('http://gitlab','synthetic')};
}
test('protects the name before creating at fixed SHA, never changes main; repeated preparation only reads',async()=>{
 const f=fixture(),marker=vi.fn(async()=>{}),result=await f.provider.prepare(ref,marker);
 expect(result).toMatchObject({branchSha:sha,protectionReady:true,blockers:[]});
 expect(f.writes).toEqual([{path:'/api/v4/projects/7/protected_branches',body:{name:ref.branchName,push_access_level:0,merge_access_level:40,allow_force_push:false}},{path:'/api/v4/projects/7/repository/branches',body:{branch:ref.branchName,ref:sha}}]);expect(marker).toHaveBeenCalledTimes(2);
 await f.provider.prepare(ref,marker);expect(f.writes).toHaveLength(2);
});
test.each([{username:'root'},{admin:true},{access:30},{access:50},{path:'outside/system'}])('identity/access/scope %j blocks before writing',async options=>{const f=fixture(options);await expect(f.provider.prepare(ref,async()=>{})).rejects.toThrow();expect(f.writes).toHaveLength(0);});
test.each([{branchSha:'b'.repeat(40),existingProtected:true},{branchSha:sha},{unsafe:true},{secondPageUnsafe:true}])('existing references or permissive matching rule %j are never overwritten',async options=>{const f=fixture(options);await expect(f.provider.prepare(ref,async()=>{})).rejects.toThrow();expect(f.writes).toHaveLength(0);if(options.secondPageUnsafe)expect(f.reads.some(v=>v.includes('page=2'))).toBe(true);});
test.each(['protection','branch'] as const)('lost %s response can be inspected without another remote write',async lost=>{const f=fixture({lost});await expect(f.provider.prepare(ref,async()=>{})).rejects.toThrow();const count=f.writes.length,result=await f.provider.inspect(ref);expect(f.writes).toHaveLength(count);expect(result.protectionReady).toBe(true);expect(result.branchSha).toBe(lost==='branch'?sha:null);});
test('expired/canceled authorization callback prevents a remote effect',async()=>{const f=fixture();await expect(f.provider.prepare(ref,async()=>{throw Error('stale lease');})).rejects.toThrow('stale lease');expect(f.writes).toHaveLength(0);});
test('normal GitLab UserPublic response omits is_admin; dedicated identity and Maintainer access are still required',async()=>{const f=fixture({omitAdmin:true});expect(await f.provider.inspect(ref)).toMatchObject({blockers:[]});expect(f.writes).toHaveLength(0);});
