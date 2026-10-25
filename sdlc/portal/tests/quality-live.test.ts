import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
import {GitLabMergeProvider} from '../apps/api/src/merge-provider.ts';

test.skipIf(!process.env.TEST_GITLAB_ISOLATED)('real MR context, external quality statuses and idempotent correction preserve the pinned revision',async()=>{
 if(!/^sdlc-package-[a-f0-9-]{36}$/.test(process.env.TEST_GITLAB_ISOLATED??''))throw Error('Disposable GitLab required');
 const base=process.env.TEST_GITLAB_URL!,admin=readFileSync('/tmp/portal-gitlab-token','utf8').trim(),token=readFileSync('/tmp/portal-merge-token','utf8').trim();
 const call=async(method:string,path:string,body?:unknown)=>{const response=await fetch(`${base}/api/v4/${path}`,{method,headers:{'PRIVATE-TOKEN':admin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});expect(response.ok,`${method} ${path}: HTTP ${response.status}`).toBe(true);return response.json();};
 const git=new GitLabProvider(base,admin),adapter=new GitLabMergeProvider(base,token);
 const group=await git.ensureGroup('sdlc/quality-live'),project=await git.ensureProject(group,'quality-'+crypto.randomUUID().replaceAll('-','').slice(0,10),'python','Disposable quality test');
 const context=await git.codeContext(project.id),run='cmquality'+crypto.randomUUID().replaceAll('-','').slice(0,18);
 const patch={summary:'Função de teste para revisão real.',files:[{path:'catalog.py',content:'def title(name):\n    return name.strip()\n'}]};
 const published=await git.publishCode(project.id,run,context,patch,'Verificação isolada');
 const iid=Number(published.url.match(/merge_requests\/(\d+)$/)![1]),ref={projectId:project.id,iid,sha:published.sha,sourceBranch:`sdlc/story-${run}`,targetBranch:'main'};
 const checked=await git.qualityContext(project.id,iid,ref.sha,context.sha);expect(checked.changes.map(f=>f.path)).toContain('catalog.py');expect(checked.files.map(f=>f.path)).toContain('server.py');
 const statusesPath=`projects/${project.id}/repository/commits/${ref.sha}/statuses?all=true`;
 await git.qualityStatus(ref,'security_scan','pending');
 const beforeRepeat=await call('GET',statusesPath);
 await git.qualityStatus(ref,'security_scan','pending');
 expect((await call('GET',statusesPath)).map((s:any)=>s.id)).toEqual(beforeRepeat.map((s:any)=>s.id));
 await git.qualityStatus(ref,'code_review','pending');await git.qualityStatus(ref,'code_review','pending');
 await git.qualityStatus(ref,'code_review','running');await git.qualityStatus(ref,'code_review','running');
 await git.qualityStatus(ref,'code_review','success');await git.qualityStatus(ref,'code_review','success');
 expect((await adapter.inspect(ref)).blocks.some(b=>b.category==='pipeline')).toBe(true);
 await git.qualityStatus(ref,'security_scan','running');await git.qualityStatus(ref,'security_scan','success');
 const states=await call('GET',`projects/${project.id}/repository/commits/${ref.sha}/statuses`);expect(states.filter((s:any)=>s.name.startsWith('sdlc-')).every((s:any)=>s.status==='success')).toBe(true);
 await call('PUT',`projects/${project.id}/merge_requests/${iid}`,{title:'Verificação isolada pronta'});
 let inspection=await adapter.inspect(ref);for(let i=0;i<30&&inspection.blocks.length;i++){await new Promise(r=>setTimeout(r,1000));inspection=await adapter.inspect(ref);}expect(inspection.blocks).toEqual([]);
 const updatedContext={...context,files:[...context.files,...patch.files]},correction={summary:'Correção pedida pelo usuário na ferramenta.',files:[{path:'catalog.py',content:'def title(name):\n    return str(name).strip()\n'}]};
 const corrected=await git.publishCorrection(project.id,run,'check-live',published.sha,updatedContext,correction,'Correção',{dependencies:false});expect(corrected.sha).not.toBe(published.sha);expect(corrected.url).toBe(published.url);
 expect(await git.publishCorrection(project.id,run,'check-live',published.sha,updatedContext,correction,'Correção',{dependencies:false})).toEqual(corrected);
 await expect(git.qualityContext(project.id,iid,published.sha,context.sha)).rejects.toThrow('mudou');
 expect((await adapter.inspect({...ref,sha:corrected.sha})).blocks.some(b=>b.category==='pipeline')).toBe(true);
 // No merge is performed by this test; its sole writes belong to this disposable MR.
},180000);
