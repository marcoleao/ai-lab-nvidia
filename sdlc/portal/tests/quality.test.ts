import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';
import {dashboardWeeks} from '../apps/api/src/metrics.ts';
import {qualityMetrics} from '../apps/api/src/quality-metrics.ts';
import {qualityRulesDigest} from '../apps/api/src/merge-readiness.ts';
import {approvedSnapshot} from './approved-scope.ts';
const url=process.env.TEST_QUALITY_DATABASE_URL;
if(url&&!url.endsWith('/portal_test'))throw Error('Use an isolated portal_test database');
afterEach(()=>vi.unstubAllGlobals());
test('quality metrics preserve weekly outcomes, severities, retries and correction cycles',()=>{
 const timestamp=new Date('2026-10-23T03:00:00Z'),event=(action:string,payload:unknown)=>({action,timestamp,payload});
 const result=qualityMetrics([event('QUALITY_CHECK_REQUESTED',{kind:'security_scan',retry:true}),event('QUALITY_CHECK_COMPLETED',{kind:'security_scan',result:'blocked',durationMs:2000,severities:{LOW:1,HIGH:2}}),event('QUALITY_CORRECTION_REQUESTED',{kind:'security_scan'})],dashboardWeeks(timestamp));
 expect(result.phases[1].total).toMatchObject({requested:1,blocked:1,passed:0,retries:1,corrections:1,medianSeconds:2,severities:{LOW:1,HIGH:2}});expect(result.phases[0].total.medianSeconds).toBeNull();expect(result.phases[1].weeks).toHaveLength(4);
});
describe.skipIf(!url)('quality phases and correction',()=>{
 const db=database(url!),sha='f'.repeat(40),base='b'.repeat(40);
 const git={qualityContext:vi.fn(),qualityStatus:vi.fn(async()=>{}),publishCorrection:vi.fn(),health:async()=>true} as unknown as GitProvider;
 const llm={model:'quality-test',models:async()=>['quality-test'],complete:vi.fn()};
 const merge={inspect:vi.fn(async()=>({state:'opened',sha,targetSha:base,url:'http://gitlab/mr/2',mergedBy:null,mergedAt:null,blocks:[]})),merge:vi.fn(async()=>({state:'merged',sha,targetSha:base,url:'http://gitlab/mr/2',mergedBy:'sdlc-agent-for-merge',mergedAt:new Date().toISOString(),blocks:[]}))};
 const runtime=createApp({db,demoMode:true,git,llm,merge,scannerUrl:'http://isolated-scanner:8080'}),owned:string[]=[];
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 afterEach(async()=>{await db.qualityCheck.updateMany({where:{executionId:{in:owned},state:{in:['queued','running']}},data:{state:'failed',leaseId:null,leaseUntil:null}});await db.mergeOperation.updateMany({where:{executionId:{in:owned}},data:{checkedAt:new Date('2099-01-01')}});});
 async function fixture(){
  vi.mocked(git.qualityContext!).mockReset().mockResolvedValue({sha,baseSha:base,files:[{path:'app.js',content:'export const answer = 42;'}],changes:[{path:'app.js',diff:'+export const answer = 42;',content:'export const answer = 42;'}]});
  llm.complete.mockReset().mockResolvedValue({model:llm.model,content:JSON.stringify({summary:'Revisão concluída.',findings:[]})});merge.merge.mockClear();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({engine:'semgrep',version:'1.181.0',rulesDigest:qualityRulesDigest,findings:[],scannedFiles:['app.js'],scope:'SAST e segredos'}))));
  const create=async(kind:'system'|'project'|'epic'|'story',parentId?:string,parentKind?:'system'|'project'|'epic')=>db.item.create({data:{kind,key:'Q-'+randomUUID(),name:'Qualidade descartável',status:kind==='system'?'active':kind==='story'?'coding':'approved',...(kind==='project'?{projectLifecycle:'active'}:{}),data:kind==='story'?{acceptanceCriteria:['Return the result required by this isolated Story.']}:{},parentId,parentKind}});
  const system=await create('system'),project=await create('project',system.id,'system'),epic=await create('epic',project.id,'project'),story=await create('story',epic.id,'epic');
  const repo=await db.repository.create({data:{systemId:system.id,key:'Q-'+randomUUID(),name:'Repo de teste',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*100000000)+10000}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repo.id}});
  const snapshot=await db.$transaction(tx=>approvedSnapshot(tx,story.id,{codeContext:{sha:base,targetBranch:'main',files:[{path:'app.js',content:'export const answer=0;'}]}}));
  const run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repo.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot,patch:{files:[{path:'app.js',content:'export const answer = 42;'}]},actorId:'admin',actorName:'Admin',commitSha:sha,branch:'sdlc/story-test',mergeRequestUrl:'http://gitlab/mr/2'}});owned.push(run.id);
  await db.mergeOperation.create({data:{executionId:run.id,storyId:story.id,projectId:repo.gitlabProjectId!,iid:2,sourceBranch:run.branch!,targetBranch:'main',sha,checkedAt:new Date('2099-01-01')}});
  const post=async(path:string,body:Record<string,unknown>,key=randomUUID(),persona='admin')=>runtime.app.inject({method:'POST',url:`/api/executions/${run.id}/${path}`,headers:{'x-persona':persona,'idempotency-key':key},payload:body});
  const request=async(kind:string,key?:string)=>post('quality',{kind,expectedSha:sha,expectedVersion:(await db.item.findUniqueOrThrow({where:{id:story.id}})).version},key);
  return {run,story,post,request};
 }
 test('requires review then scanner, executes both, and only then allows a guarded merge',async()=>{
  const f=await fixture();expect((await f.request('security_scan')).statusCode).toBe(409);expect((await f.post('merge',{expectedSha:sha,expectedVersion:1})).statusCode).toBe(409);
  const key=randomUUID(),first=await f.request('code_review',key);expect(first.statusCode,first.body).toBe(200);expect((await f.post('quality',{kind:'code_review',expectedSha:sha,expectedVersion:1},key)).json()).toEqual(first.json());
  await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:first.json().checkId}})).state).toBe('passed');
  expect((await f.request('security_scan')).statusCode).toBe(200);await runtime.processQualityJobs();
  const current=await db.item.findUniqueOrThrow({where:{id:f.story.id}});expect(current.status).toBe('security_scan');const response=await f.post('merge',{expectedSha:sha,expectedVersion:current.version});expect(response.statusCode,response.body).toBe(200);await runtime.processMergeJobs();expect(merge.merge).toHaveBeenCalledTimes(1);
 });
 test('review findings block progression and correction is explicitly queued to the coding agent',async()=>{
  const f=await fixture();llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Correção necessária.',findings:[{path:'app.js',line:1,severity:'LOW',message:'Tratar entrada inválida.'}]})});const first=await f.request('code_review');await runtime.processQualityJobs();expect((await f.request('security_scan')).statusCode).toBe(409);
  const response=await f.post('quality/correct',{checkId:first.json().checkId,expectedSha:sha,expectedVersion:2});expect(response.statusCode,response.body).toBe(200);expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'queued',stage:'generation',storyVersion:3});expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('coding');expect(merge.merge).not.toHaveBeenCalled();
 });
 test('invalid review locations and model failures cannot approve',async()=>{
  const f=await fixture();llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Resultado inválido.',findings:[{path:'missing.js',line:500,severity:'HIGH',message:'Erro'}]})});const first=await f.request('code_review');await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:first.json().checkId}})).state).toBe('failed');expect((await f.request('security_scan')).statusCode).toBe(409);
 });
 test('any scanner finding including LOW blocks merge; scanner errors are never empty success',async()=>{
  const f=await fixture();await f.request('code_review');await runtime.processQualityJobs();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({engine:'semgrep',version:'1.181.0',rulesDigest:qualityRulesDigest,findings:[{path:'app.js',line:1,severity:'LOW',message:'Achado de segurança',rule:'test'}],scannedFiles:['app.js'],scope:'SAST'})));
  const scan=await f.request('security_scan');await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:scan.json().checkId}})).state).toBe('blocked');expect((await f.post('merge',{expectedSha:sha,expectedVersion:3})).statusCode).toBe(409);
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}',{status:503}));const retry=await f.request('security_scan');await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:retry.json().checkId}})).state).toBe('failed');
 });
 test('a new SHA or another review invalidates earlier approval and unauthorized users cannot run checks',async()=>{
  const f=await fixture();expect((await f.post('quality',{kind:'code_review',expectedSha:sha,expectedVersion:1},undefined,'carla')).statusCode).toBe(403);await f.request('code_review');await runtime.processQualityJobs();await f.request('security_scan');await runtime.processQualityJobs();await f.request('code_review');await runtime.processQualityJobs();
  expect((await db.qualityCheck.findFirstOrThrow({where:{executionId:f.run.id,kind:'security_scan'}})).state).toBe('stale');
  await db.storyExecution.update({where:{id:f.run.id},data:{commitSha:'e'.repeat(40)}});expect((await f.post('merge',{expectedSha:'e'.repeat(40),expectedVersion:4})).statusCode).toBe(409);
 });
 test('expired verification and a scanner with different rules never leave an approval',async()=>{
  const f=await fixture(),review=await f.request('code_review');await db.qualityCheck.update({where:{id:review.json().checkId},data:{state:'running',leaseId:'expired',leaseUntil:new Date(0)}});await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:review.json().checkId}})).state).toBe('failed');
  await f.request('code_review');await runtime.processQualityJobs();vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({engine:'semgrep',version:'1.181.0',rulesDigest:'0'.repeat(64),findings:[],scannedFiles:['app.js'],scope:'SAST'})));const scan=await f.request('security_scan');await runtime.processQualityJobs();expect((await db.qualityCheck.findUniqueOrThrow({where:{id:scan.json().checkId}})).state).toBe('failed');
 });
 test('a changed planned scope blocks quality even when Story version and commit are unchanged',async()=>{
  const f=await fixture();await db.item.create({data:{kind:'task',key:'Q-'+randomUUID(),name:'New unapproved scope',description:'Work added after the saved approval.',status:'todo',parentId:f.story.id,parentKind:'story'}});
  const response=await f.request('code_review');expect(response.statusCode,response.body).toBe(409);expect(response.json().error.code).toBe('QUALITY_STALE');expect(await db.qualityCheck.count({where:{executionId:f.run.id}})).toBe(0);
 });
 test('scope drift during review keeps the returned report historical and never completes its process task',async()=>{
  const f=await fixture();llm.complete.mockImplementationOnce(async()=>{await db.item.update({where:{id:f.story.id},data:{description:'Changed functional scope during the model call.'}});return {model:llm.model,content:JSON.stringify({summary:'Report for the earlier scope.',findings:[]})};});
  const response=await f.request('code_review');expect(response.statusCode,response.body).toBe(200);await runtime.processQualityJobs();const check=await db.qualityCheck.findUniqueOrThrow({where:{id:response.json().checkId}});expect(check.state).toBe('stale');
  const activity=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'code_review'}});expect((await db.item.findUniqueOrThrow({where:{id:activity.taskId}})).status).not.toBe('done');expect(merge.merge).not.toHaveBeenCalled();
 });
});
