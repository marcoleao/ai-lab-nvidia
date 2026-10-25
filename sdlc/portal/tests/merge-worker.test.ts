import {randomUUID} from 'node:crypto';
import {afterAll,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {MergeInspection} from '../apps/api/src/merge-provider.ts';
import {qualityPolicy} from '../apps/api/src/merge-readiness.ts';
import {approvedSnapshot} from './approved-scope.ts';
const url=process.env.TEST_MERGE_DATABASE_URL;
if(url&&!url.endsWith('/portal_test'))throw Error('An isolated portal_test database is required');
describe.skipIf(!url)('durable merge operations',()=>{
 const db=database(url!);const sha='c'.repeat(40);
 const opened:MergeInspection={state:'opened',sha,targetSha:'b'.repeat(40),url:'http://gitlab/mr/1',mergedBy:null,mergedAt:null,blocks:[]};
 const merged:MergeInspection={...opened,state:'merged',mergedBy:'sdlc-agent-for-merge',mergedAt:new Date().toISOString()};
 const provider={inspect:vi.fn(async()=>opened),merge:vi.fn(async()=>merged)};
 const llm={model:'isolated-merge-test',models:async()=>['isolated-merge-test'],complete:vi.fn(async()=>({model:'isolated-merge-test',content:'Consulte a aba Pipelines para identificar o estado. A conta de merge não configura CI.'}))};
 const runtime=createApp({db,demoMode:true,merge:provider,llm});
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 async function scope(){
  provider.inspect.mockReset().mockResolvedValue(opened);provider.merge.mockReset().mockResolvedValue(merged);
  llm.complete.mockClear();
  const create=async(kind:'system'|'project'|'epic'|'story',parentId?:string,parentKind?:'system'|'project'|'epic')=>db.item.create({data:{kind,key:'M-'+randomUUID(),name:'Merge isolated test',status:kind==='system'?'active':kind==='project'?'approved':kind==='epic'?'approved':'coding',...(kind==='project'?{projectLifecycle:'active'}:{}),data:kind==='story'?{acceptanceCriteria:['Preserve the approved isolated Story result.']}:{},parentId,parentKind}});
  const system=await create('system'),project=await create('project',system.id,'system'),epic=await create('epic',project.id,'project'),story=await create('story',epic.id,'epic');
  const repo=await db.repository.create({data:{systemId:system.id,key:'REPO-'+randomUUID(),name:'Disposable repo',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*1000000000)+10000}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repo.id}});
  const snapshot=await db.$transaction(tx=>approvedSnapshot(tx,story.id,{codeContext:{sha:'b'.repeat(40),targetBranch:'main',files:[]}}));
  const run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repo.id,storyVersion:story.version,state:'succeeded',stage:'completed',snapshot,actorId:'admin',actorName:'Admin',commitSha:sha,branch:'sdlc/merge-test',mergeRequestUrl:'http://gitlab/mr/1'}});
  const job=await db.mergeOperation.create({data:{executionId:run.id,storyId:story.id,projectId:7,iid:1,sourceBranch:run.branch!,targetBranch:'main',sha,checkedAt:new Date()}});
  for(const kind of ['code_review','security_scan'])await db.qualityCheck.create({data:{executionId:run.id,storyId:story.id,kind,sha,baseSha:'b'.repeat(40),policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'d'.repeat(64)}}});
  const post=(payload={expectedSha:sha,expectedVersion:story.version},persona='admin',key=randomUUID())=>runtime.app.inject({method:'POST',url:`/api/executions/${run.id}/merge`,headers:{'x-persona':persona,'idempotency-key':key},payload});
  return {story,run,job,post};
 }
 test('authorized request is idempotent, completes exactly once and never advances Story status',async()=>{const s=await scope(),key=randomUUID();const first=await s.post(undefined,'admin',key);expect(first.statusCode,first.body).toBe(200);expect((await s.post(undefined,'admin',key)).json()).toEqual(first.json());await runtime.processMergeJobs();expect(provider.merge).toHaveBeenCalledTimes(1);expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('succeeded');expect((await db.item.findUniqueOrThrow({where:{id:s.story.id}})).status).toBe('coding');expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_REQUESTED'}})).toBe(1);expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_COMPLETED'}})).toBe(1);});
 test('a successful GitLab pipeline cannot bypass missing quality phases, stale SHA or revoked approval',async()=>{
  const s=await scope();await db.qualityCheck.deleteMany({where:{executionId:s.run.id}});const response=await s.post();expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe('QUALITY_PHASES_REQUIRED');expect(provider.merge).not.toHaveBeenCalled();
  for(const kind of ['code_review','security_scan'])await db.qualityCheck.create({data:{executionId:s.run.id,storyId:s.story.id,kind,sha:'e'.repeat(40),baseSha:'b'.repeat(40),policyVersion:qualityPolicy,state:'passed',actorId:'admin',actorName:'Admin',evidence:{digest:'d'.repeat(64)}}});
  expect((await s.post()).statusCode).toBe(409);
  await db.qualityCheck.updateMany({where:{executionId:s.run.id},data:{sha}});expect((await s.post()).statusCode).toBe(200);
  await db.qualityCheck.updateMany({where:{executionId:s.run.id,kind:'security_scan'},data:{state:'stale'}});await runtime.processMergeJobs();expect(provider.merge).not.toHaveBeenCalled();expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('blocked');
 });
 test('roles, SHA/version divergence and concurrent requests cannot bypass checks',async()=>{const s=await scope();expect((await s.post(undefined,'carla')).statusCode).toBe(403);expect((await s.post({expectedSha:'d'.repeat(40),expectedVersion:1})).statusCode).toBe(409);expect((await s.post({expectedSha:sha,expectedVersion:2})).statusCode).toBe(409);expect((await s.post()).statusCode).toBe(200);expect((await s.post()).statusCode).toBe(409);await runtime.processMergeJobs();});
 test('Draft/CI blocking records categories and a later explicit request rechecks real conditions',async()=>{const s=await scope();provider.inspect.mockResolvedValue({...opened,blocks:[{category:'draft',message:'MR em Draft'}]});await s.post();await runtime.processMergeJobs();expect(provider.merge).not.toHaveBeenCalled();expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('blocked');provider.inspect.mockResolvedValue(opened);await s.post();await runtime.processMergeJobs();expect(provider.merge).toHaveBeenCalledTimes(1);});
 test('lost acknowledgement reconciles the original merge and does not repeat the write',async()=>{const s=await scope();provider.merge.mockRejectedValueOnce(Error('Response lost'));await s.post();await runtime.processMergeJobs();expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('failed');provider.inspect.mockResolvedValue(merged);await s.post();await runtime.processMergeJobs();expect(provider.merge).toHaveBeenCalledTimes(1);expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_REQUESTED'}})).toBe(1);expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_COMPLETED'}})).toBe(1);});
 test('manual merge keeps its real origin without inventing a human request',async()=>{const s=await scope();provider.inspect.mockResolvedValue({...merged,mergedBy:'human-reviewer'});await db.mergeOperation.update({where:{id:s.job.id},data:{checkedAt:new Date(0)}});await runtime.processMergeJobs();const job=await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}});expect(job).toMatchObject({state:'succeeded',origin:'human',mergedBy:'human-reviewer'});expect(provider.merge).not.toHaveBeenCalled();expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_REQUESTED'}})).toBe(0);});
 test('expired lease and simultaneous workers reconcile one remote completion without another write',async()=>{const s=await scope();provider.inspect.mockResolvedValue(merged);await db.mergeOperation.update({where:{id:s.job.id},data:{state:'running',actorId:'admin',actorName:'Admin',origin:'assistant',requestedAt:new Date(),leaseId:'interrupted',leaseUntil:new Date(0)}});const second=createApp({db,demoMode:true,merge:provider});try{await Promise.all([runtime.processMergeJobs(),second.processMergeJobs()]);expect(provider.merge).not.toHaveBeenCalled();expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('succeeded');expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_COMPLETED'}})).toBe(1);}finally{await second.app.close();}});
 test('blocked merge supports multiple durable conversation rounds without merging or restarting coding',async()=>{
  const s=await scope();provider.inspect.mockResolvedValue({...opened,blocks:[{category:'pipeline',message:'Sem pipeline para este commit'}]});await s.post();await runtime.processMergeJobs();
  const endpoint=`/api/executions/${s.run.id}/merge/discussion`,key=randomUUID();
  const send=(message:string,expectedVersion:number,persona='admin',id= randomUUID())=>runtime.app.inject({method:'POST',url:endpoint,headers:{'x-persona':persona,'idempotency-key':id},payload:{message,expectedVersion}});
  expect((await send('Não há pipeline',0,'carla')).statusCode).toBe(403);
  const first=await send('Não há pipeline',0,'admin',key);expect(first.statusCode,first.body).toBe(200);
  expect((await send('Não há pipeline',0,'admin',key)).json()).toEqual(first.json());
  expect((await send('Outra mensagem',0)).statusCode).toBe(409);
  await runtime.processMergeDiscussionJobs();
  let discussion=(await runtime.app.inject({url:endpoint})).json();expect(discussion.turns).toHaveLength(1);expect(discussion.turns[0]).toMatchObject({state:'succeeded',input:'Não há pipeline'});
  expect((await send('Você consegue configurar por mim?',discussion.version)).statusCode).toBe(200);await runtime.processMergeDiscussionJobs();
  discussion=(await runtime.app.inject({url:endpoint})).json();expect(discussion.turns).toHaveLength(2);
  expect(llm.complete.mock.calls[1][0]).toEqual(expect.arrayContaining([expect.objectContaining({role:'user',content:'Não há pipeline'})]));
  expect(provider.merge).not.toHaveBeenCalled();expect((await db.storyExecution.findUniqueOrThrow({where:{id:s.run.id}})).state).toBe('succeeded');expect((await db.item.findUniqueOrThrow({where:{id:s.story.id}})).status).toBe('coding');expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('blocked');
  expect(await db.historyEvent.count({where:{itemId:s.story.id,action:'MERGE_DISCUSSION_SENT'}})).toBe(2);
 });
 test('conversation failure preserves the input and allows a fresh round without another merge request',async()=>{
  const s=await scope(),endpoint=`/api/executions/${s.run.id}/merge/discussion`;
  const send=(version:number)=>runtime.app.inject({method:'POST',url:endpoint,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{message:'Como resolver?',expectedVersion:version}});
  await send(0);llm.complete.mockRejectedValueOnce(Error('Timeout'));await runtime.processMergeDiscussionJobs();
  const failed=(await runtime.app.inject({url:endpoint})).json();expect(failed.turns[0]).toMatchObject({state:'failed',input:'Como resolver?',output:null});
  await send(failed.version);await runtime.processMergeDiscussionJobs();expect((await runtime.app.inject({url:endpoint})).json().turns[1].state).toBe('succeeded');expect(provider.merge).not.toHaveBeenCalled();
 });
 test('conversation workers share inference leases and recover an expired conversation without a merge',async()=>{
  const s=await scope();await db.mergeDiscussionTurn.create({data:{operationId:s.job.id,sequence:1,input:'Mensagem interrompida',actorId:'admin',actorName:'Admin',state:'running',leaseId:'expired',leaseUntil:new Date(0)}});
  await runtime.processMergeDiscussionJobs();expect((await db.mergeDiscussionTurn.findFirstOrThrow({where:{operationId:s.job.id}})).state).toBe('failed');
  const endpoint=`/api/executions/${s.run.id}/merge/discussion`,current=(await runtime.app.inject({url:endpoint})).json();await runtime.app.inject({method:'POST',url:endpoint,headers:{'x-persona':'admin','idempotency-key':randomUUID()},payload:{message:'Continue',expectedVersion:current.version}});
  await db.storyExecution.update({where:{id:s.run.id},data:{state:'running',leaseId:'other-inference',leaseUntil:new Date(Date.now()+300000)}});await runtime.processMergeDiscussionJobs();expect(llm.complete).not.toHaveBeenCalled();await db.storyExecution.update({where:{id:s.run.id},data:{state:'succeeded',leaseId:null,leaseUntil:null}});
  const second=createApp({db,demoMode:true,merge:provider,llm});try{await Promise.all([runtime.processMergeDiscussionJobs(),second.processMergeDiscussionJobs()]);expect(llm.complete).toHaveBeenCalledTimes(1);expect(provider.merge).not.toHaveBeenCalled();}finally{await second.app.close();}
 });
 test('changed planned scope blocks an otherwise approved commit without bumping the Story version',async()=>{
  const s=await scope();await db.item.create({data:{kind:'task',key:'M-'+randomUUID(),name:'Changed approved scope',description:'Unapproved additional work.',status:'todo',parentId:s.story.id,parentKind:'story'}});
  const response=await s.post();expect(response.statusCode,response.body).toBe(409);expect(response.json().error.code).toBe('MERGE_STALE');expect(provider.merge).not.toHaveBeenCalled();
 });
 test('scope drift during remote inspection prevents the final GitLab merge write',async()=>{
  const s=await scope();provider.inspect.mockImplementationOnce(async()=>{await db.item.update({where:{id:s.story.id},data:{description:'Functional scope changed while GitLab responded.'}});return opened;});
  expect((await s.post()).statusCode).toBe(200);await runtime.processMergeJobs();expect(provider.merge).not.toHaveBeenCalled();expect((await db.mergeOperation.findUniqueOrThrow({where:{id:s.job.id}})).state).toBe('blocked');
 });
});
