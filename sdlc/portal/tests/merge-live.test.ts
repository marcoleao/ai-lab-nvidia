import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
import {GitLabMergeProvider} from '../apps/api/src/merge-provider.ts';

test.skipIf(!process.env.TEST_GITLAB_ISOLATED)('real dedicated identity inherits new projects, respects protection/Draft/CI and merges as sdlc-agent-for-merge',async()=>{
 if(!/^sdlc-package-[a-f0-9-]{36}$/.test(process.env.TEST_GITLAB_ISOLATED??''))throw Error('Disposable GitLab required');
 const base=process.env.TEST_GITLAB_URL!,admin=readFileSync('/tmp/portal-gitlab-token','utf8').trim(),token=readFileSync('/tmp/portal-merge-token','utf8').trim();
 const call=async(method:string,path:string,body?:unknown,credential=admin)=>fetch(`${base}/api/v4/${path}`,{method,headers:{'PRIVATE-TOKEN':credential,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const json=async(method:string,path:string,body?:unknown,credential=admin)=>{const response=await call(method,path,body,credential);expect(response.ok,`${method} ${path}: HTTP ${response.status}`).toBe(true);return response.json();};
 const identity=await json('GET','user',undefined,token);expect(identity.username).toBe('sdlc-agent-for-merge');expect(identity.is_admin).not.toBe(true);
 expect((await call('GET','application/settings',undefined,token)).status).toBe(403);
 const git=new GitLabProvider(base,admin),adapter=new GitLabMergeProvider(base,token);
 const group=await git.ensureGroup('sdlc/merge-live');
 const project=await git.ensureProject(group,'merge-'+crypto.randomUUID().replaceAll('-','').slice(0,10),'python','Disposable merge test');
 const access=await json('GET',`projects/${project.id}`,undefined,token);expect(access.permissions.group_access.access_level).toBe(40);
 const protectedBranch=await json('GET',`projects/${project.id}/protected_branches/main`);expect(protectedBranch.push_access_levels.every((p:{access_level:number})=>p.access_level===0)).toBe(true);
 const initialHead=await json('GET',`projects/${project.id}/repository/branches/main`);
 const commit=await json('POST',`projects/${project.id}/repository/commits`,{branch:'merge-verification',start_branch:'main',commit_message:'Disposable CI and merge verification',actions:[{action:'create',file_path:'.gitlab-ci.yml',content:'merge_probe:\n  tags: [offline-demo]\n  script:\n    - python3 -c "assert 2 + 3 == 5"\n'},{action:'create',file_path:'probe.py',content:'def add(a, b):\n    return a + b\n'}]});
 const mr=await json('POST',`projects/${project.id}/merge_requests`,{source_branch:'merge-verification',target_branch:'main',title:'Draft: disposable merge verification'});
 const reference={projectId:project.id,iid:mr.iid,sourceBranch:'merge-verification',targetBranch:'main',sha:commit.id};
 expect((await adapter.merge(reference)).blocks.some(b=>b.category==='draft')).toBe(true);
 // Only the test reviewer releases Draft. The merge adapter never does it.
 await json('PUT',`projects/${project.id}/merge_requests/${mr.iid}`,{title:'Disposable merge verification'});
 let inspected=await adapter.inspect(reference);
 for(let i=0;i<100&&inspected.blocks.length;i++){
  const pipelines=await json('GET',`projects/${project.id}/pipelines?sha=${commit.id}`);
  if(pipelines.some((p:{status:string})=>p.status==='failed'))throw Error('The real disposable CI job failed');
  await new Promise(resolve=>setTimeout(resolve,2000));inspected=await adapter.inspect(reference);
 }
 expect(inspected.blocks).toEqual([]);
 const result=await adapter.merge(reference);expect(result.state).toBe('merged');expect(result.mergedBy).toBe('sdlc-agent-for-merge');
 const replay=await adapter.merge(reference);expect(replay.state).toBe('merged');
 const main=await json('GET',`projects/${project.id}/repository/branches/main`);expect(main.commit.id).not.toBe(initialHead.commit.id);
 const preserved=await json('GET',`projects/${project.id}/protected_branches/main`);expect(preserved.push_access_levels.every((p:{access_level:number})=>p.access_level===0)).toBe(true);
},300000);
