import {readFileSync,writeFileSync} from 'node:fs';
import {afterEach,expect,test,vi} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
import {LocalLLMProvider} from '../apps/api/src/llm.ts';
import {database} from '../packages/db/client.ts';
import {createApp} from '../apps/api/src/app.ts';
afterEach(()=>vi.unstubAllGlobals());

test.skipIf(!process.env.TEST_GITLAB_ISOLATED)('real GitLab creates only neutral runtimes, protects main and reuses resources',async()=>{
  if(!/^sdlc-package-[a-f0-9-]{36}$/.test(process.env.TEST_GITLAB_ISOLATED??''))throw new Error('Disposable GitLab marker required');
  const base=process.env.TEST_GITLAB_URL!;
  const token=readFileSync('/tmp/portal-gitlab-token','utf8').trim();
  const calls:unknown[]=[];const realFetch=globalThis.fetch;
  vi.stubGlobal('fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const response=await realFetch(input,init);
    const body=await response.clone().json().catch(()=>({}));
    calls.push({url:String(input),method:init?.method??'GET',status:response.status,id:body?.id,path:body?.path,path_with_namespace:body?.path_with_namespace,push_access_levels:body?.push_access_levels,message:body?.message,error:body?.error});
    writeFileSync('/output/gitlab-http.json',JSON.stringify(calls,null,2));
    return response;
  });
  const provider=new GitLabProvider(base,token);
  expect(await provider.health()).toBe(true);
  const group=await provider.ensureGroup('sdlc/live');
  expect((await provider.ensureGroup('sdlc/live')).id).toBe(group.id);
  async function read(path:string){const response=await fetch(`${base}/api/v4/${path}`,{headers:{'PRIVATE-TOKEN':token}});expect(response.ok).toBe(true);return response.json();}
  for(const runtime of ['node','python'] as const){
    const project=await provider.ensureProject(group,runtime,runtime,'Live runtime test').catch(error=>{writeFileSync('/output/gitlab-debug.json',JSON.stringify({message:error.message,details:error.details}));throw error;});
    const reused=await provider.ensureProject(group,runtime,runtime,'Live runtime test');
    expect(reused.id).toBe(project.id);
    const branches=await read(`projects/${project.id}/protected_branches/main`);
    expect(branches.push_access_levels.every((p:{access_level:number})=>p.access_level===0)).toBe(true);
    expect(branches.allow_force_push).toBe(false);
    const commits=await read(`projects/${project.id}/repository/commits`);expect(commits).toHaveLength(1);
    const pipeline=await read(`projects/${project.id}/pipelines`);expect(pipeline).toHaveLength(0);
    const files=await read(`projects/${project.id}/repository/tree?recursive=true`);
    expect(files.some((f:{path:string})=>f.path==='.sdlc/contract.md')).toBe(true);
    const context=await provider.codeContext(project.id);
    const runId=runtime==='node'?'cmvhexecutionnode00001':'cmvhexecutionpython001';
    const patch={summary:'Exercício técnico descartável de publicação',files:[{path:runtime==='node'?'src/probe.ts':'src/probe.py',content:runtime==='node'?'export const probe = true;\n':'def probe():\n    return True\n'}]};
    const published=await provider.publishCode(project.id,runId,context,patch,'Verificação técnica isolada');
    expect(published.url).toContain('/merge_requests/');expect(published.sha).not.toBe(context.sha);
    expect(await provider.publishCode(project.id,runId,context,patch,'Verificação técnica isolada')).toEqual(published);
    const main=await read(`projects/${project.id}/repository/branches/main`);expect(main.commit.id).toBe(context.sha);
    const mrs=await read(`projects/${project.id}/merge_requests`);expect(mrs).toHaveLength(1);expect(mrs[0].draft).toBe(true);
    expect(await read(`projects/${project.id}/pipelines`)).toHaveLength(0);
  }
},120000);

test.skipIf(!process.env.TEST_GITLAB_ISOLATED)('real local model prepares G1 and publishes code through persisted execution in disposable GitLab',async()=>{
  if(!process.env.TEST_DATABASE_URL?.endsWith('/portal_test')||!/^sdlc-package-[a-f0-9-]{36}$/.test(process.env.TEST_GITLAB_ISOLATED??''))throw Error('Disposable environment required');
  const git=new GitLabProvider(process.env.TEST_GITLAB_URL!,readFileSync('/tmp/portal-gitlab-token','utf8').trim());
  const group=await git.ensureGroup('sdlc/live'),remote=await git.ensureProject(group,'python','python','Live runtime test');
  const db=database(process.env.TEST_DATABASE_URL),runtime=createApp({db,demoMode:true,git,llm:new LocalLLMProvider('http://172.21.0.1:11435','qwen3:14b',readFileSync('/tmp/portal-llm-token','utf8').trim())});
  const post=async(path:string,payload:unknown)=>{const r=await runtime.app.inject({method:'POST',url:'/api'+path,headers:{'x-persona':'admin','idempotency-key':crypto.randomUUID()},payload});expect(r.statusCode,r.body).toBe(200);return r.json();};
  try{
    const system=(await post('/items',{kind:'system',key:'REALCODE',name:'Ensaio isolado de codificação'})).item;
    const project=(await post('/items',{kind:'project',parentId:system.id,key:'INIT',name:'Iniciativa técnica descartável'})).item;await post(`/items/${project.id}/approve`,{expectedVersion:project.version});
    const epic=(await post('/items',{kind:'epic',parentId:project.id,name:'Verificação técnica'})).item;await post(`/items/${epic.id}/approve`,{expectedVersion:epic.version});
    const repository=await db.repository.create({data:{systemId:system.id,key:'PROBE',name:'Repositório técnico descartável',runtime:'python',state:'ready',gitlabProjectId:remote.id}});
    await db.itemRepository.create({data:{itemId:project.id,repositoryId:repository.id}});
    const story=(await post('/items',{kind:'story',parentId:epic.id,name:'Adicionar uma função de soma pura',description:'No arquivo arithmetic.py, adicionar sum_numbers(a,b), que retorna a soma dos argumentos. Incluir teste unittest para 2+3=5. Usar somente biblioteca padrão Python e preservar servidor existente.',repositoryIds:[repository.id]})).item;
    await db.item.update({where:{id:story.id},data:{data:{acceptanceCriteria:['sum_numbers(2,3) retorna 5.']}}});
    await post(`/items/${story.id}/execution`,{expectedVersion:story.version});await runtime.processExecutionJobs();
    const read=async()=>(await runtime.app.inject(`/api/items/${story.id}/execution`)).json().run;
    let run=await read();expect(run.state,JSON.stringify(run)).toBe('waiting_approval');
    await post(`/executions/${run.id}/approve`,{expectedVersion:story.version});
    for(let stage=0;stage<3;stage++)await runtime.processExecutionJobs();
    run=await read();expect(run.state,JSON.stringify(run)).toBe('succeeded');expect(run.mergeRequestUrl).toContain('/merge_requests/');
    writeFileSync('/output/real-code-execution.json',JSON.stringify({state:run.state,stage:run.stage,commitSha:run.commitSha,mergeRequestUrl:run.mergeRequestUrl,specification:run.specification},null,2));
  }finally{await runtime.app.close();await db.$disconnect();}
},600000);
