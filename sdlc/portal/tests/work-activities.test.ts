import {randomUUID,createHash} from 'node:crypto';
import {afterAll,afterEach,describe,expect,test,vi} from 'vitest';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import type {GitProvider} from '../apps/api/src/gitlab.ts';
import type {AssistantHelpers} from '../apps/api/src/assistant.ts';
import type {Transaction} from '../packages/db/client.ts';
import {bindActivityTasks,finishAttempt,workLinksVersion} from '../apps/api/src/work-activities.ts';
import {approvedSnapshot} from './approved-scope.ts';
import {pipelineTasks} from '../apps/api/src/pipeline-tasks.ts';

test('work selection version is independent from ordering and changes only with selected scope',()=>{
 const a={taskId:'a',scope:'Consulta',completion:'publish_code'},b={taskId:'b',scope:'Evidência manual',completion:'manual_evidence'};
 expect(workLinksVersion([a,b])).toBe(workLinksVersion([b,a]));expect(workLinksVersion([a,b])).not.toBe(workLinksVersion([a]));expect(workLinksVersion([a])).not.toBe(workLinksVersion([{...a,scope:'Novo escopo'}]));expect(workLinksVersion([a])).not.toBe(workLinksVersion([{...a,completion:'manual_evidence'}]));
});

const url=process.env.TEST_WORK_DATABASE_URL;
// The shared isolated runner resets portal_test before each database suite.
if(url&&!['/work_portal_test','/portal_test'].includes(new URL(url).pathname))throw Error('Work tests require an isolated work_portal_test or portal_test database');
describe.skipIf(!url)('real tasks and observable work',()=>{
 const db=database(url!),sha='c'.repeat(40),base='b'.repeat(40);
 const specification={requirements:'Implementar busca com validação de entrada.',architecture:'Manter o contrato da função de consulta.',testCases:[{criterionIndex:0,description:'Uma entrada válida retorna o resultado esperado.'}],risks:[]};
 const git={health:async()=>true,codeContext:vi.fn(async()=>({sha:base,targetBranch:'main',files:[{path:'app.js',content:'export const answer=0;'}]})),publishCode:vi.fn(async()=>({sha,url:'http://gitlab/test/-/merge_requests/1'})),qualityStatus:vi.fn(async()=>{}),qualityContext:vi.fn(async()=>({sha,baseSha:base,files:[{path:'app.js',content:'export const answer=42;'}],changes:[{path:'app.js',content:'export const answer=42;',diff:'+export const answer=42;'}]}))} as unknown as GitProvider;
 const llm={model:'work-test',models:async()=>['work-test'],complete:vi.fn()};
 const runtime=createApp({db,demoMode:true,git,llm,scannerUrl:'http://isolated-scanner:8080'});
 const ownedStories:string[]=[];
 afterAll(async()=>{await runtime.app.close();await db.$disconnect();});
 afterEach(async()=>{await db.storyExecution.updateMany({where:{storyId:{in:ownedStories},state:{in:['queued','running']}},data:{state:'cancelled',leaseId:null,leaseUntil:null}});await db.qualityCheck.updateMany({where:{storyId:{in:ownedStories},state:{in:['queued','running']}},data:{state:'failed',leaseId:null,leaseUntil:null}});llm.complete.mockReset();});
 async function fixture(){
  const create=async(kind:'system'|'project'|'epic'|'story'|'task',parentId?:string,parentKind?:'system'|'project'|'epic'|'story')=>db.item.create({data:{kind,key:'W-'+randomUUID(),name:`Escopo ${kind}`,description:'Descrição de escopo planejado.',status:kind==='story'?'specification':kind==='task'?'todo':'active',...(kind==='project'?{projectLifecycle:'active'}:{}),...(kind==='story'?{data:{acceptanceCriteria:['Retorna um resultado para uma entrada válida.']}}:{}),parentId,parentKind}});
  const system=await create('system'),project=await create('project',system.id,'system'),epic=await create('epic',project.id,'project'),story=await create('story',epic.id,'epic'),task=await create('task',story.id,'story');
  const standard=await Promise.all(pipelineTasks.map(definition=>db.item.create({data:{kind:'task',key:'W-'+randomUUID(),parentId:story.id,parentKind:'story',name:definition.name,description:definition.description,status:'todo',data:{workProcess:true,pipelineStage:definition.stage,creationOrigin:'pipeline'}}})));
  const codingTask=standard.find(task=>(task.data as Record<string,unknown>).pipelineStage==='coding')!;
  ownedStories.push(story.id);
  const repository=await db.repository.create({data:{systemId:system.id,key:'w-'+randomUUID(),name:'Componente descartável',runtime:'node',state:'ready',gitlabProjectId:Math.floor(Math.random()*100000000)+200000000}});await db.itemRepository.create({data:{itemId:story.id,repositoryId:repository.id}});
  const post=async(path:string,payload:unknown,key=randomUUID())=>runtime.app.inject({method:'POST',url:path,headers:{'x-persona':'admin','idempotency-key':key},payload});
  const version=async()=>(await db.item.findUniqueOrThrow({where:{id:story.id}})).version;
  const prepare=async()=>{llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify(specification)});const result=await post(`/api/items/${story.id}/execution`,{expectedVersion:await version()});expect(result.statusCode,result.body).toBe(200);await runtime.processExecutionJobs();return result.json().runId as string;};
  const snapshot=(extra:Record<string,unknown>={})=>db.$transaction(tx=>approvedSnapshot(tx,story.id,extra,3));
  return {system,project,epic,story,task,codingTask,repository,post,prepare,snapshot,version};
 }
 test('G1 preparation keeps its source on the Story and leaves planned pipeline Tasks untouched',async()=>{
  const f=await fixture(),runId=await f.prepare();
  const activity=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'specification'}}),attempt=await db.workAttempt.findUniqueOrThrow({where:{id:activity.currentAttemptId!}});
  expect(attempt).toMatchObject({state:'waiting_approval',stage:'validating'});expect(attempt.startedAt).not.toBeNull();expect(attempt.heartbeatAt).not.toBeNull();
  expect(activity.taskId).toBeNull();expect(await db.item.count({where:{parentId:f.story.id}})).toBe(7);expect((await db.item.findUniqueOrThrow({where:{id:f.task.id}})).status).toBe('todo');
  await db.item.update({where:{id:f.task.id},data:{status:'doing',version:{increment:1}}});
  const approval=await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()});expect(approval.statusCode,approval.body).toBe(200);
  expect((await db.item.findUniqueOrThrow({where:{id:f.codingTask.id}})).status).toBe('todo');
  expect(await db.workEvent.count({where:{attemptId:attempt.id,kind:'wait_resolved'}})).toBe(1);
 });
 test('a real task scope or component change invalidates G1',async()=>{
  const f=await fixture(),runId=await f.prepare();await db.item.update({where:{id:f.codingTask.id},data:{description:'Escopo realmente alterado.',version:{increment:1}}});
  expect((await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()})).statusCode).toBe(409);
  const second=await fixture(),secondRun=await second.prepare();await db.repository.update({where:{id:second.repository.id},data:{version:{increment:1}}});
  expect((await second.post(`/api/executions/${secondRun}/approve`,{expectedVersion:await second.version()})).statusCode).toBe(409);
 });
 test('legacy approvals keep valid scope across operational task versions',async()=>{
  const f=await fixture(),runId=await f.prepare(),run=await db.storyExecution.findUniqueOrThrow({where:{id:runId}}),snapshot=run.snapshot as Record<string,unknown>;
  const tasks=[{id:f.task.id,name:f.task.name,description:f.task.description,version:1}];
  const observed=await db.item.findUniqueOrThrow({where:{id:f.story.id}}),fingerprint=createHash('sha256').update(JSON.stringify({name:observed.name,description:observed.description,data:observed.data,ancestors:[f.system,f.project,f.epic].map(i=>[i.id,i.version,i.status,i.projectLifecycle]),tasks,repository:[f.repository.id,f.repository.version]})).digest('hex');
  await db.storyExecution.update({where:{id:runId},data:{snapshot:{...snapshot,scopeRevision:1,tasks,fingerprint}}});await db.item.update({where:{id:f.task.id},data:{status:'doing',version:{increment:1}}});
  const approval=await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()});expect(approval.statusCode,approval.body).toBe(200);
 });
 test('publication completes only explicitly bound publication scope; unlinked planned tasks stay open',async()=>{
  const f=await fixture();
  const unlinked=await db.item.create({data:{kind:'task',parentId:f.story.id,parentKind:'story',key:'W-'+randomUUID(),name:'Validar manualmente o resultado',description:'Evidência de teste manual separada.',status:'todo'}});
  const manual=await db.item.create({data:{kind:'task',parentId:f.story.id,parentKind:'story',key:'W-'+randomUUID(),name:'Revisar evidências de funcionamento',description:'Publicar código não comprova este resultado.',status:'todo'}});
  const binding=await f.post(`/api/items/${f.story.id}/work-links`,{expectedVersion:await f.version(),expectedLinksVersion:workLinksVersion([]),links:[{taskId:f.task.id,scope:'Entrega do código da consulta; publicação do patch é a evidência escolhida.',completion:'publish_code'},{taskId:manual.id,scope:'Acompanhar a implementação; requer validação humana adicional.',completion:'manual_evidence'}]});
  expect(binding.statusCode,binding.body).toBe(200);
  const runId=await f.prepare();
  expect((await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()})).statusCode).toBe(200);
  await runtime.processExecutionJobs();llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Implementação de consulta.',files:[{path:'app.js',content:'export const answer=42;'}]})});await runtime.processExecutionJobs();await runtime.processExecutionJobs();
  const completed=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});expect(completed.state,completed.error??'').toBe('succeeded');expect((await db.item.findUniqueOrThrow({where:{id:f.task.id}})).status).toBe('done');
  expect((await db.item.findUniqueOrThrow({where:{id:unlinked.id}})).status).toBe('todo');expect((await db.item.findUniqueOrThrow({where:{id:manual.id}})).status).toBe('doing');expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('coding');
  const coding=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'coding'}}),events=await db.workEvent.findMany({where:{attemptId:coding.currentAttemptId!}});expect(events.filter(e=>e.kind==='stage_started')).toHaveLength(3);expect(events.filter(e=>e.kind==='stage_finished')).toHaveLength(2);expect(events.find(e=>e.kind==='succeeded')?.payload).toMatchObject({processingMs:expect.any(Number),queueMs:expect.any(Number)});
 });
 test('review retries reuse process task, preserve attempts and cannot mark success with stale lease',async()=>{
  const f=await fixture(),run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:await f.snapshot({codeContext:{sha:base}}),actorId:'admin',actorName:'Admin',commitSha:sha}});
  await db.mergeOperation.create({data:{executionId:run.id,storyId:f.story.id,projectId:f.repository.gitlabProjectId!,iid:1,sourceBranch:'sdlc/test',targetBranch:'main',sha}});
  llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Achado concreto.',findings:[{path:'app.js',line:1,severity:'LOW',message:'Validar a entrada.'}]})});
  const first=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});expect(first.statusCode,first.body).toBe(200);await runtime.processQualityJobs();
  const activity=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'code_review'}});expect((await db.item.findUniqueOrThrow({where:{id:activity.taskId}})).status).toBe('doing');
  llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Nenhum achado.',findings:[]})});const retry=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});expect(retry.statusCode,retry.body).toBe(200);await runtime.processQualityJobs();
  expect(await db.workActivity.count({where:{storyId:f.story.id,kind:'code_review'}})).toBe(1);expect(await db.workAttempt.count({where:{activityId:activity.id}})).toBe(2);expect((await db.item.findUniqueOrThrow({where:{id:activity.taskId}})).status).toBe('done');
  const before=await db.workAttempt.findUniqueOrThrow({where:{sourceKey:`quality:${first.json().checkId}`}});await db.$transaction(tx=>finishAttempt(tx,{} as AssistantHelpers,before.sourceKey,{state:'succeeded',completeTask:true,leaseId:'stale-lease'}));expect((await db.workAttempt.findUniqueOrThrow({where:{id:before.id}})).state).toBe('blocked');
 });
 test.each(['revision','lease'])('a running provider call is observable, but an obsolete %s cannot complete its task',async(change)=>{
  const f=await fixture(),run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:await f.snapshot({codeContext:{sha:base}}),actorId:'admin',actorName:'Admin',commitSha:sha}});
  await db.mergeOperation.create({data:{executionId:run.id,storyId:f.story.id,projectId:f.repository.gitlabProjectId!,iid:1,sourceBranch:'sdlc/test',targetBranch:'main',sha}});
  let resolveModel!:(value:{model:string;content:string})=>void;const response=new Promise<{model:string;content:string}>(resolve=>{resolveModel=resolve;});llm.complete.mockReturnValueOnce(response);
  const requested=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});expect(requested.statusCode,requested.body).toBe(200);
  const job=runtime.processQualityJobs();
  for(let poll=0;poll<100&&!llm.complete.mock.calls.length;poll++)await new Promise(resolve=>setTimeout(resolve,5));
  const live=await db.workAttempt.findUniqueOrThrow({where:{sourceKey:`quality:${requested.json().checkId}`},include:{activity:true,events:true}});
  expect(live).toMatchObject({state:'running',stage:'model_wait',provider:'local-llm'});expect(live.startedAt).not.toBeNull();expect(live.heartbeatAt).not.toBeNull();expect(live.events.some(event=>event.message.includes('aguardando resposta'))).toBe(true);
  if(change==='revision')await db.storyExecution.update({where:{id:run.id},data:{commitSha:'d'.repeat(40)}});
  else await db.qualityCheck.update({where:{id:requested.json().checkId},data:{leaseUntil:new Date(0)}});
  resolveModel({model:llm.model,content:JSON.stringify({summary:'Análise do commit anterior.',findings:[]})});await job;
  const expected=change==='revision'?'stale':'failed';expect((await db.qualityCheck.findUniqueOrThrow({where:{id:requested.json().checkId}})).state).toBe(expected);expect((await db.item.findUniqueOrThrow({where:{id:live.activity.taskId}})).status).toBe('doing');expect((await db.workAttempt.findUniqueOrThrow({where:{id:live.id}})).state).toBe(expected);
 });
 test('a requested correction resolves the finding wait and reopens only linked coding work',async()=>{
  const f=await fixture(),run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:await f.snapshot({codeContext:{sha:base,targetBranch:'main',files:[{path:'app.js',content:'export const answer=0;'}]}}),patch:{files:[{path:'app.js',content:'export const answer=42;'}]},actorId:'admin',actorName:'Admin',commitSha:sha}});
  await db.mergeOperation.create({data:{executionId:run.id,storyId:f.story.id,projectId:f.repository.gitlabProjectId!,iid:1,sourceBranch:'sdlc/test',targetBranch:'main',sha}});
  llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Correção necessária.',findings:[{path:'app.js',line:1,severity:'HIGH',message:'Validar o comportamento de entrada.'}]})});
  const review=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});await runtime.processQualityJobs();
  // Configure the correction capability; the endpoint only enqueues, never writes a repository.
  git.publishCorrection=vi.fn(async()=>({sha:'e'.repeat(40),url:'http://gitlab/test/-/merge_requests/1'}));
  const correction=await f.post(`/api/executions/${run.id}/quality/correct`,{checkId:review.json().checkId,expectedVersion:await f.version(),expectedSha:sha});expect(correction.statusCode,correction.body).toBe(200);
  expect(await db.workActivity.count({where:{storyId:f.story.id,kind:'coding'}})).toBe(1);
  const waiting=await db.workAttempt.findUniqueOrThrow({where:{sourceKey:`quality:${review.json().checkId}`},include:{events:true}});expect(waiting.waitingSince).toBeNull();expect(waiting.events.some(e=>e.kind==='wait_resolved'&&(e.payload as Record<string,unknown>).waitKind==='blocked')).toBe(true);
  expect((await db.item.findUniqueOrThrow({where:{id:f.task.id}})).status).toBe('todo');expect(git.publishCorrection).not.toHaveBeenCalled();
 });
 test('replanning a published delivery preserves its MR and requests a new specification and G1',async()=>{
  const f=await fixture(),runId=await f.prepare();expect((await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()})).statusCode).toBe(200);
  await runtime.processExecutionJobs();llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({summary:'Publicação inicial.',files:[{path:'app.js',content:'export const answer=42;'}]})});await runtime.processExecutionJobs();await runtime.processExecutionJobs();
  const original=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});expect(original.state).toBe('succeeded');
  const changed=await db.item.update({where:{id:f.story.id},data:{description:'Escopo revisado explicitamente.',version:{increment:1}}});
  const key=randomUUID(),body={expectedVersion:changed.version,confirmed:true},result=await f.post(`/api/executions/${runId}/replan`,body,key);expect(result.statusCode,result.body).toBe(200);
  expect((await f.post(`/api/executions/${runId}/replan`,body,key)).json()).toEqual(result.json());
  const next=await db.storyExecution.findUniqueOrThrow({where:{id:result.json().runId}}),old=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});
  expect(next).toMatchObject({state:'waiting_approval',stage:'gate',storyVersion:changed.version+1,commitSha:null,specification});expect(next.snapshot).toMatchObject({scopeRevision:3,replannedFrom:runId});expect(old).toEqual(original);
  expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).status).toBe('specification');expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(2);
  expect((await f.post(`/api/executions/${runId}/replan`,{expectedVersion:next.storyVersion,confirmed:true})).statusCode).toBe(409);
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:next.id}})).state).toBe('waiting_approval');
 });
 test('replanning cannot supersede an active verification or integration',async()=>{
  const f=await fixture(),run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:await f.snapshot(),actorId:'admin',actorName:'Admin',commitSha:sha,mergeRequestUrl:'http://gitlab/test/-/merge_requests/1'}});
  const check=await db.qualityCheck.create({data:{storyId:f.story.id,executionId:run.id,kind:'code_review',sha,baseSha:base,policyVersion:'test',actorId:'admin',actorName:'Admin'}});
  expect((await f.post(`/api/executions/${run.id}/replan`,{expectedVersion:await f.version(),confirmed:true})).statusCode).toBe(409);
  await db.qualityCheck.update({where:{id:check.id},data:{state:'failed'}});await db.mergeOperation.create({data:{executionId:run.id,storyId:f.story.id,projectId:f.repository.gitlabProjectId!,iid:1,sourceBranch:'sdlc/test',targetBranch:'main',sha,state:'queued'}});
  expect((await f.post(`/api/executions/${run.id}/replan`,{expectedVersion:await f.version(),confirmed:true})).statusCode).toBe(409);expect(await db.storyExecution.count({where:{storyId:f.story.id}})).toBe(1);
 });
 test('confirming a capability decision closes the coding wait before specification runs again',async()=>{
  const f=await fixture(),runId=await f.prepare();await f.post(`/api/executions/${runId}/approve`,{expectedVersion:await f.version()});await runtime.processExecutionJobs();
  llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({blocker:{reason:'Uma dependência precisa de autorização.',question:'Autoriza a dependência?',options:['Autorizar'],requestedCapabilities:['dependencies']}})});await runtime.processExecutionJobs();
  let run=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});expect(run.state).toBe('waiting_input');
  const message=await f.post(`/api/executions/${runId}/messages`,{expectedVersion:run.discussionVersion,message:'Autorizo adicionar a dependência necessária ao escopo.'});expect(message.statusCode,message.body).toBe(200);
  llm.complete.mockResolvedValueOnce({model:llm.model,content:JSON.stringify({reply:'Decisão pronta para sua confirmação.',ready:true,summary:'Autorizar a dependência necessária ao escopo informado.',requestedCapabilities:['dependencies']})});await runtime.processExecutionJobs();
  run=await db.storyExecution.findUniqueOrThrow({where:{id:runId}});const coding=await db.workActivity.findFirstOrThrow({where:{storyId:f.story.id,kind:'coding'}}),before=await db.workAttempt.findUniqueOrThrow({where:{id:coding.currentAttemptId!}});expect(before.state).toBe('waiting_input');
  const resolved=await f.post(`/api/executions/${runId}/resolve`,{expectedVersion:run.discussionVersion,confirmed:true,allowDependencies:true});expect(resolved.statusCode,resolved.body).toBe(200);
  const old=await db.workAttempt.findUniqueOrThrow({where:{id:before.id},include:{events:true}});expect(old.state).toBe('superseded');expect(old.waitingSince).toBeNull();expect(old.events.some(e=>e.kind==='wait_resolved')).toBe(true);expect((await db.item.findUniqueOrThrow({where:{id:coding.taskId}})).status).toBe('doing');
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:runId}}))).toMatchObject({stage:'specification',state:'queued',allowDependencies:true,specification:null});
 });
 test('full link replacement rejects a stale selection and idempotency still replays its original request',async()=>{
  const f=await fixture(),path=`/api/items/${f.story.id}/work-links`,key=randomUUID();
  const initial={expectedVersion:await f.version(),expectedLinksVersion:workLinksVersion([]),links:[{taskId:f.task.id,scope:'Escopo escolhido na primeira aba.',completion:'manual_evidence'}]};
  const first=await f.post(path,initial,key);expect(first.statusCode,first.body).toBe(200);
  const stale=await f.post(path,{expectedVersion:await f.version(),expectedLinksVersion:initial.expectedLinksVersion,links:[]});expect(stale.statusCode,stale.body).toBe(409);expect(stale.json().error.code).toBe('WORK_LINKS_CHANGED');
  const replay=await f.post(path,initial,key);expect(replay.statusCode,replay.body).toBe(200);expect(replay.json()).toEqual(first.json());
  const links=await db.workTaskLink.findMany({where:{activityId:first.json().activityId}});expect(links).toHaveLength(1);expect(links[0].scope).toBe(initial.links[0].scope);
 });
 test('row locking prevents two simultaneous replacements from accepting the same selection version',async()=>{
  const f=await fixture(),created=await f.post(`/api/items/${f.story.id}/work-links`,{expectedVersion:await f.version(),expectedLinksVersion:workLinksVersion([]),links:[]});expect(created.statusCode,created.body).toBe(200);
  const helper={live:async(tx:Transaction,id:string)=>tx.item.findUniqueOrThrow({where:{id}}),event:async()=>{}} as unknown as AssistantHelpers;
  const results=await Promise.allSettled(['Primeira seleção concorrente.','Segunda seleção concorrente.'].map(scope=>db.$transaction(tx=>bindActivityTasks(tx,helper,{activityId:created.json().activityId,expectedLinksVersion:workLinksVersion([]),taskIds:[{taskId:f.task.id,scope,completion:'manual_evidence'}],person:{id:'admin',name:'Admin'}}))));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);const rejected=results.find(result=>result.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason).toMatchObject({code:'WORK_LINKS_CHANGED'});expect(await db.workTaskLink.count({where:{activityId:created.json().activityId}})).toBe(1);
 });
 test('quality commands and workers reject planned task scope changes even when the Story version is unchanged',async()=>{
  const f=await fixture(),run=await db.storyExecution.create({data:{storyId:f.story.id,repositoryId:f.repository.id,storyVersion:1,state:'succeeded',stage:'completed',snapshot:await f.snapshot({codeContext:{sha:base}}),actorId:'admin',actorName:'Admin',commitSha:sha}});
  await db.mergeOperation.create({data:{executionId:run.id,storyId:f.story.id,projectId:f.repository.gitlabProjectId!,iid:1,sourceBranch:'sdlc/test',targetBranch:'main',sha}});
  await db.item.update({where:{id:f.codingTask.id},data:{description:'Escopo alterado sem incrementar a História.',version:{increment:1}}});
  const denied=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});expect(denied.statusCode,denied.body).toBe(409);expect(denied.json().error.code).toBe('QUALITY_STALE');expect((await db.item.findUniqueOrThrow({where:{id:f.story.id}})).version).toBe(1);
  await db.item.update({where:{id:f.codingTask.id},data:{description:f.codingTask.description,version:{increment:1}}});
  const queued=await f.post(`/api/executions/${run.id}/quality`,{kind:'code_review',expectedVersion:await f.version(),expectedSha:sha});expect(queued.statusCode,queued.body).toBe(200);
  await db.item.update({where:{id:f.codingTask.id},data:{description:'Novo comportamento que altera o escopo aprovado.',version:{increment:1}}});await runtime.processQualityJobs();
  expect((await db.qualityCheck.findUniqueOrThrow({where:{id:queued.json().checkId}})).state).toBe('stale');expect(llm.complete).not.toHaveBeenCalled();
 });
});
