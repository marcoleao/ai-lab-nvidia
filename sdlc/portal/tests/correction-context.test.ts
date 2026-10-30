import {afterAll,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
import {approvedSnapshot} from './approved-scope';
import type {GitProvider} from '../apps/api/src/gitlab.ts';
const target=process.env.TEST_DATABASE_URL;if(!target||new URL(target).pathname!=='/portal_test')throw Error('Disposable portal_test required');
const db=database(target),base='a'.repeat(40),published='b'.repeat(40),corrected='c'.repeat(40);
afterAll(()=>db.$disconnect());
async function fixture(stage='context',mode='valid'){
  const system=await db.item.create({data:{kind:'system',key:randomUUID(),name:'Isolated correction System',status:'active'}});
  const project=await db.item.create({data:{kind:'project',parentId:system.id,parentKind:'system',key:randomUUID(),name:'Isolated project',status:'active',projectLifecycle:'active'}});
  const epic=await db.item.create({data:{kind:'epic',parentId:project.id,parentKind:'project',key:randomUUID(),name:'Isolated epic',status:'active'}});
  const story=await db.item.create({data:{kind:'story',parentId:epic.id,parentKind:'epic',key:randomUUID(),name:'Isolated correction Story',status:'approved',data:{acceptanceCriteria:['Retornar o resultado definido no contrato.']}}});
  const repository=await db.repository.create({data:{systemId:system.id,key:'app',name:system.name,runtime:'generic',state:'ready',gitlabProjectId:Math.floor(Math.random()*1e8)+100}});
  const patch={summary:'Corrigir o contrato preservando o trabalho existente.',files:[{path:'app.js',content:'export const result = 43;'}]};
  const snapshot=await db.$transaction(tx=>approvedSnapshot(tx,story.id,{codeContext:{sha:base,targetBranch:'main',files:[{path:'README.md',content:'Only main bootstrap.'}]},qualityCorrection:{checkId:'isolated-check',expectedSha:published},qualityFindings:[{path:'app.js',line:1,severity:'LOW',message:'Corrigir resultado.'}]}));
  const run=await db.storyExecution.create({data:{storyId:story.id,repositoryId:repository.id,storyVersion:story.version,state:stage==='publishing'?'failed':'queued',stage,snapshot,patch:stage==='publishing'?patch:undefined,specification:{requirements:'Contrato verificável.',architecture:'Preservar a aplicação e sua interface.',testCases:[{criterionIndex:0,description:'Validar o retorno do contrato.'}],risks:[]},commitSha:published,actorId:'ana',actorName:'Ana',branch:'sdlc/fixture'}});
  const context=vi.fn(async(_id:number,revision?:{sha:string;targetBranch:string})=>({sha:revision?(mode==='wrong-revision'?base:revision.sha):(mode==='changed-base'?corrected:base),targetBranch:'main',files:revision?[{path:'app.js',content:'export const result = 42;'}]:[{path:'README.md',content:'Only main bootstrap.'}]}));
  const publishCorrection=vi.fn(async()=>({sha:corrected,url:'http://gitlab.invalid/-/merge_requests/7'})),publishCode=vi.fn(async()=>{throw Error('Corrections must not invoke initial publication');});
  const git={codeContext:context,publishCorrection,publishCode} as unknown as GitProvider;
  let modelResponses=0;
  const llm={model:'isolated-correction',models:async()=>['isolated-correction'],complete:vi.fn(async(messages:any[],options?:{schema?:unknown})=>{
    modelResponses++;
    const prompt=JSON.parse(messages[1].content);expect(prompt.baseRevision).toBe(base);expect(prompt.currentCodeRevision).toBe(published);
    expect(prompt.story.codeContext.files).toEqual([{path:'app.js',content:'export const result = 42;'}]);expect(prompt.story.qualityFindings).toHaveLength(1);
    expect(messages[0].content).toContain('decidir create/update');if(mode==='ambiguous-edits'&&modelResponses===1)return {model:'isolated-correction',content:JSON.stringify({summary:patch.summary,edits:[{path:'app.js',before:'missing literal',after:'new value'}]})};if(mode==='ambiguous-edits')expect(JSON.stringify(options?.schema)).not.toContain('"edits"');return{model:'isolated-correction',content:JSON.stringify(mode==='line-edits'?{summary:patch.summary,expectedSha:published,lineEdits:[{path:'app.js',startLine:1,endLine:1,content:'export const result = 43;'}]}:mode==='edits'?{summary:patch.summary,edits:[{path:'app.js',before:'result = 42',after:'result = 43'}]}:mode==='same-current'?{summary:patch.summary,files:[{path:'app.js',content:'export const result = 42;'}]}:patch)};
  })};
  const runtime=createApp({db,demoMode:true,git,llm});return{runtime,story,run,context,llm,publishCorrection,publishCode,patch};
}
test('after reapproval the agent reads the exact published Story revision while retaining the immutable comparison base',async()=>{
  const f=await fixture();try{
    await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();
    expect(f.context.mock.calls.map(c=>c[1])).toEqual([undefined,{sha:published,targetBranch:'main'}]);expect(f.llm.complete).toHaveBeenCalledTimes(1);
    expect(f.publishCorrection).toHaveBeenCalledTimes(1);expect(f.publishCode).not.toHaveBeenCalled();
    const run=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});expect(run).toMatchObject({state:'succeeded',commitSha:corrected});
    expect((run.snapshot as any).codeContext.sha).toBe(base);
    const merge=await db.mergeOperation.findUniqueOrThrow({where:{executionId:f.run.id}});expect(merge).toMatchObject({sha:corrected,state:'tracking'});
  }finally{await f.runtime.app.close();}
});
for(const mode of ['wrong-revision','changed-base'])test('mismatched correction or base revision blocks generation and publication: '+mode,async()=>{
  const f=await fixture('context',mode);try{
    await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();
    expect(f.llm.complete).not.toHaveBeenCalled();expect(f.publishCorrection).not.toHaveBeenCalled();expect(f.publishCode).not.toHaveBeenCalled();
    expect(await db.storyExecution.findUnique({where:{id:f.run.id}})).toMatchObject({state:'failed',commitSha:published});
  }finally{await f.runtime.app.close();}
});
test('retry of a failed publishing stage keeps the frozen patch and correction SHA without regenerating code',async()=>{
  const f=await fixture('publishing');try{
    const response=await f.runtime.app.inject({method:'POST',url:`/api/executions/${f.run.id}/retry`,headers:{'X-Persona':'ana','Idempotency-Key':randomUUID()},payload:{}});expect(response.statusCode,response.body).toBe(200);
    await f.runtime.processExecutionJobs();expect(f.context).not.toHaveBeenCalled();expect(f.llm.complete).not.toHaveBeenCalled();expect(f.publishCorrection).toHaveBeenCalledTimes(1);
    expect(await db.storyExecution.findUnique({where:{id:f.run.id}})).toMatchObject({state:'succeeded',patch:f.patch,commitSha:corrected});
  }finally{await f.runtime.app.close();}
});

test('literal agent correction is resolved against its authorized SHA and frozen as full files before publication',async()=>{
 const f=await fixture('context','edits');try{
  await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).patch).toEqual(f.patch);expect(f.publishCorrection).not.toHaveBeenCalled();
  await f.runtime.processExecutionJobs();expect(f.llm.complete).toHaveBeenCalledTimes(1);expect((f.publishCorrection.mock.calls as unknown[][])[0][5]).toEqual(f.patch);expect(f.publishCode).not.toHaveBeenCalled();
  expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'succeeded',commitSha:corrected});
 }finally{await f.runtime.app.close();}
});

test('unmatched literal edit automatically recovers with full files before publication without a human decision',async()=>{
 const f=await fixture('context','ambiguous-edits');try{
  await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();let run=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});expect(run.state).toBe('queued');expect(run.commitSha).toBe(published);expect(f.publishCorrection).not.toHaveBeenCalled();
  await f.runtime.processExecutionJobs();run=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});expect(run).toMatchObject({state:'queued',stage:'publishing',patch:f.patch});
  await f.runtime.processExecutionJobs();expect(f.llm.complete).toHaveBeenCalledTimes(2);expect(f.publishCorrection).toHaveBeenCalledTimes(1);expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'succeeded',commitSha:corrected});
 }finally{await f.runtime.app.close();}
});

test('diagnosis remains required after discussion concurrency version changes and retry cannot bypass it',async()=>{
 const f=await fixture('generation');try{
  const saved=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});await db.storyExecution.update({where:{id:f.run.id},data:{state:'waiting_input',discussionVersion:20,error:'Diagnóstico necessário',snapshot:{...saved.snapshot as object,decisions:[{summary:'Escolha confirmada',discussionVersion:7}],qualityCycle:3,qualityCycleDecisionVersion:7,patchRepair:{attempt:0,issues:[{path:'app.js',code:'QUALITY_FINDING',message:'Achado atual'}]}}}});
  const reading=await f.runtime.app.inject(`/api/items/${f.story.id}/execution`);expect(reading.json().run.technicalRetryAvailable).toBe(false);
  const journey=await f.runtime.app.inject(`/api/items/${f.story.id}/journey`);expect(journey.json().nextAction.id).toBe('respond_blocker');
  const retry=await f.runtime.app.inject({method:'POST',url:`/api/executions/${f.run.id}/retry`,headers:{'x-persona':'ana','idempotency-key':randomUUID()},payload:{}});expect(retry.statusCode,retry.body).toBe(409);expect(retry.json().error.code).toBe('QUALITY_DIAGNOSIS_REQUIRED');expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).state).toBe('waiting_input');expect(f.llm.complete).not.toHaveBeenCalled();expect(f.publishCorrection).not.toHaveBeenCalled();
 }finally{await f.runtime.app.close();}
});

test('rejected full-file correction recovers through current line ranges pinned to the authorized revision',async()=>{
 const f=await fixture('context','line-edits');try{
  const old=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});await db.storyExecution.update({where:{id:f.run.id},data:{snapshot:{...old.snapshot as object,patchRepair:{attempt:1,fullFilesOnly:true,issues:[{path:'app.js',code:'SYNTAX_ERROR',message:'Proposta rejeitada; a fonte atual não foi alterada.'}]}}}});
  await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).patch).toEqual(f.patch);
  const options=(f.llm.complete.mock.calls as unknown[][])[0][1] as {schema:unknown};expect(JSON.stringify(options.schema)).toContain('lineEdits');expect(JSON.stringify(options.schema)).not.toContain('"files"');
  await f.runtime.processExecutionJobs();expect(f.publishCorrection).toHaveBeenCalledTimes(1);expect((f.publishCorrection.mock.calls as unknown[][])[0][5]).toEqual(f.patch);expect(f.publishCode).not.toHaveBeenCalled();expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'succeeded',commitSha:corrected});
 }finally{await f.runtime.app.close();}
});

test('explicit technical retry of correction uses a bounded line response and preserves replay and publication',async()=>{
 const f=await fixture('generation','line-edits');try{
  await db.storyExecution.update({where:{id:f.run.id},data:{state:'failed',error:'O modelo local excedeu o tempo de resposta.'}});
  const key=randomUUID(),request={method:'POST' as const,url:`/api/executions/${f.run.id}/retry`,headers:{'X-Persona':'ana','Idempotency-Key':key},payload:{}};
  const first=await f.runtime.app.inject(request),replay=await f.runtime.app.inject(request);expect(first.statusCode,first.body).toBe(200);expect(replay.statusCode,replay.body).toBe(200);
  const queued=await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}});expect((queued.snapshot as any).patchRepair).toMatchObject({attempt:0,lineEditsOnly:true,fullFilesOnly:false});
  expect(await db.workAttempt.count({where:{sourceType:'execution',sourceId:f.run.id}})).toBe(1);
  await f.runtime.processExecutionJobs();expect(f.llm.complete).toHaveBeenCalledTimes(1);
  const options=(f.llm.complete.mock.calls as unknown[][])[0][1] as {maxTokens:number;schema:unknown};expect(options.maxTokens).toBe(4096);expect(JSON.stringify(options.schema)).toContain('lineEdits');expect(JSON.stringify(options.schema)).not.toContain('"files"');
  expect((await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).patch).toEqual(f.patch);expect(f.publishCorrection).not.toHaveBeenCalled();
  await f.runtime.processExecutionJobs();expect(f.publishCorrection).toHaveBeenCalledTimes(1);expect(f.publishCode).not.toHaveBeenCalled();expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'succeeded',commitSha:corrected});
 }finally{await f.runtime.app.close();}
});

test('a correction identical to the published revision is not confused with a change against its older comparison base',async()=>{
 const f=await fixture('context','same-current');try{
  await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();await f.runtime.processExecutionJobs();
  expect(await db.storyExecution.findUniqueOrThrow({where:{id:f.run.id}})).toMatchObject({state:'waiting_input',commitSha:published,error:'O agente retornou arquivos idênticos aos existentes, sem implementar alterações.'});
  expect(f.publishCorrection).not.toHaveBeenCalled();expect(f.publishCode).not.toHaveBeenCalled();
 }finally{await f.runtime.app.close();}
});
