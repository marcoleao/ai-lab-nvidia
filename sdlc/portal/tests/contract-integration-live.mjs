/** Explicit opt-in. Own disposable GitLab project only; never loads a portal DB. */
import {readFileSync,writeFileSync} from 'node:fs';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {GitLabContractPublicationProvider} from '../apps/api/src/contract-publication-provider.ts';
import {GitLabContractIntegrationProvider,integrationToken} from '../apps/api/src/contract-integration-provider.ts';
if(process.env.REGRESSION_LIVE_GITLAB!=='1')throw Error('Explicit isolated GitLab opt-in required');
const base='http://127.0.0.1:3180',admin=readFileSync('/run/secrets/gitlab-admin','utf8').trim(),merge=readFileSync('/run/secrets/gitlab-merge','utf8').trim(),cleanupOnly=process.env.REGRESSION_LIVE_CLEANUP_ONLY==='1',name=cleanupOnly?process.env.REGRESSION_LIVE_PROJECT_NAME:'regression-contract-'+randomUUID(),output=process.env.REGRESSION_LIVE_OUTPUT||'/reports/provider-live.json';
if(!/^regression-contract-[a-f0-9-]{36}$/.test(name))throw Error('Owned test-project name required');
let project=null;const result={scope:'own-temporary-GitLab-project',name,passed:false,removed:false,checks:[]};
async function api(token,method,path,body){const response=await fetch(base+'/api/v4/'+path,{method,headers:{'PRIVATE-TOKEN':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(response.status===404)return null;if(!response.ok)throw Error('Isolated GitLab request refused: HTTP '+response.status);return response.status===204?null:response.json();}
const pause=()=>new Promise(r=>setTimeout(r,500));
try{if(!cleanupOnly){
 const who=await api(merge,'GET','user');assert.equal(who.username,'sdlc-agent-for-merge');assert.notEqual(who.is_admin,true);
 const spaces=await api(admin,'GET','namespaces?search=sdlc&per_page=100'),namespace=spaces.find(v=>v.full_path==='sdlc');assert.ok(namespace?.id);
 project=await api(admin,'POST','projects',{namespace_id:namespace.id,path:name,name,initialize_with_readme:true,default_branch:'main',visibility:'private',topics:['sdlc-managed','sdlc-regression'],only_allow_merge_if_pipeline_succeeds:false});
 assert.equal(project.path_with_namespace,'sdlc/'+name);result.projectId=project.id;
 const access=await api(merge,'GET','projects/'+project.id);if(!access||Math.max(access.permissions?.project_access?.access_level??0,access.permissions?.group_access?.access_level??0)<40)await api(admin,'POST',`projects/${project.id}/members`,{user_id:who.id,access_level:40});
 let branch;for(let i=0;i<20;i++){branch=await api(admin,'GET',`projects/${project.id}/repository/branches/main`);if(branch?.commit?.id)break;await pause();}assert.ok(branch?.commit?.id);
 if(!branch.protected)await api(admin,'POST',`projects/${project.id}/protected_branches`,{name:'main',push_access_level:0,merge_access_level:40});
 const proposalId=randomUUID(),content=JSON.stringify({schemaVersion:1,units:[{id:'api',path:'.',runtime:{kind:'node',version:'24'},build:{entrypoint:'build.mjs'},test:{entrypoint:'test.mjs'},artifact:{dockerfile:'Dockerfile',context:'.'},health:{kind:'http',path:'/health',port:8080,status:200},migrations:{mode:'none'}}]},null,2)+'\n';
 const ref={operationId:randomUUID(),projectId:project.id,proposalId,branch:'sdlc/contract-'+proposalId+'-1',targetBranch:'main',baseSha:branch.commit.id,baseContentDigest:null,content,contentDigest:createHash('sha256').update(content).digest('hex')};
 const publication=new GitLabContractPublicationProvider(base,merge),integration=new GitLabContractIntegrationProvider(base,merge),markers=[];
 const sent=await publication.send(ref,{commit:true,mergeRequest:true},async stage=>markers.push(stage));assert.ok(sent.commitSha);assert.ok(sent.iid);assert.equal(sent.mrState,'opened');result.checks.push('exclusive-contract-commit-and-draft-MR');
 const exact={...ref,knownCommitSha:sent.commitSha,knownIid:sent.iid};let observation=await integration.inspectIntegration(exact);assert.equal(observation.draft,true);assert.equal(observation.targetSha,ref.baseSha);
 observation=await integration.apply(exact,'release_draft',integrationToken(observation),async()=>markers.push('release_draft'));assert.equal(observation.draft,false);assert.equal(observation.mrState,'opened');result.checks.push('separate-Draft-release');
 for(let i=0;i<30&&observation.blocks.length;i++){await pause();observation=await integration.inspectIntegration(exact);}assert.deepEqual(observation.blocks,[]);
 observation=await integration.apply(exact,'merge',integrationToken(observation),async()=>markers.push('merge'));assert.equal(observation.mrState,'merged');assert.ok(observation.integrationSha);assert.equal(observation.source.matches,true);result.checks.push('fixed-SHA-merge-protected-main-exact-bytes-and-ancestry');
 const before=markers.length;observation=await integration.inspectIntegration(exact);assert.equal(markers.length,before);assert.equal(observation.source.matches,true);result.checks.push('read-only-reconciliation');
 result.markers=markers;result.integrationSha=observation.integrationSha;result.passed=true;
 }else{project={id:Number(process.env.REGRESSION_LIVE_PROJECT_ID)};assert.ok(Number.isSafeInteger(project.id)&&project.id>0);result.projectId=project.id;result.passed=true;result.checks=['cleanup-own-previous-test-project'];}
}catch(error){result.error=error?.code||'PROVIDER_VALIDATION_FAILED';result.message=error?.message||'Provider validation failed';}
finally{
 try{
  let owned=await api(admin,'GET','projects/'+(project?.id??encodeURIComponent('sdlc/'+name)));
  const isOwned=value=>value?.topics?.includes('sdlc-regression')&&(value.path_with_namespace==='sdlc/'+name||value.path_with_namespace===`sdlc/${name}-deletion_scheduled-${value.id}`&&!!(value.marked_for_deletion_on||value.marked_for_deletion_at));
  if(!owned)result.removed=true;
  else if(isOwned(owned)){
   result.projectId=owned.id;
   if(!owned.marked_for_deletion_on&&!owned.marked_for_deletion_at){await api(admin,'DELETE','projects/'+owned.id);owned=await api(admin,'GET','projects/'+owned.id);}
   if(!owned)result.removed=true;
   else if(isOwned(owned)){
    const id=owned.id;await api(admin,'DELETE',`projects/${id}?permanently_remove=true&full_path=${encodeURIComponent(owned.path_with_namespace)}`);
    for(let i=0;i<40;i++){if(!await api(admin,'GET','projects/'+id)){result.removed=true;break;}await pause();}
   }
  }else result.cleanupError='Ownership differs; resource preserved';
 }catch(error){result.cleanupError='Owned cleanup not confirmed: '+(error?.message||'unknown');}
 writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed||!result.removed)process.exitCode=1;
}
