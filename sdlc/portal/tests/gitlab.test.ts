import {afterEach,expect,test,vi} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
import {runtimeFiles} from '@sdlc/templates';
afterEach(()=>vi.unstubAllGlobals());
test('complete correction context accepts bounded React sources and refuses overflow without a partial result',async()=>{
 const sha='a'.repeat(40),content='//'+ 'x'.repeat(10998);
 for(const count of [2,3]){
  const files=Array.from({length:count},(_,i)=>({path:`src/file${i}.jsx`,type:'blob',mode:'100644'}));
  vi.stubGlobal('fetch',vi.fn(async url=>{const path=String(url);return new Response(JSON.stringify(path.includes('/repository/tree?')?(path.includes('&page=2')?[]:files):path.includes('/repository/files/')?{encoding:'base64',size:content.length,content:Buffer.from(content).toString('base64')}:{default_branch:'main',archived:false}));}));
  const reading=new GitLabProvider('http://gitlab','private').codeContext(9,{sha,targetBranch:'main'});
  if(count===2){const result=await reading;expect(result.files).toEqual(files.map(f=>({path:f.path,content})));expect(result.sha).toBe(sha);}else await expect(reading).rejects.toMatchObject({code:'REPOSITORY_TOO_LARGE'});
 }
});
test('source character limit accepts valid UTF-8 and refuses binary text without lossy decoding',async()=>{
 const sha='a'.repeat(40);
 for(const bytes of [Buffer.from('//'+ 'ç'.repeat(12000)),Buffer.from([0xff,0x00])]){
  vi.stubGlobal('fetch',vi.fn(async url=>{const path=String(url);return new Response(JSON.stringify(path.includes('/repository/tree?')?(path.includes('&page=2')?[]:[{path:'src/App.jsx',type:'blob',mode:'100644'}]):path.includes('/repository/files/')?{encoding:'base64',size:bytes.length,content:bytes.toString('base64')}:{default_branch:'main',archived:false}));}));
  const reading=new GitLabProvider('http://gitlab','private').codeContext(9,{sha,targetBranch:'main'});if(bytes[0]===0xff)await expect(reading).rejects.toMatchObject({code:'FILE_TOO_LARGE'});else expect((await reading).files[0].content).toBe(bytes.toString('utf8'));
 }
});
test('foreign group collision is never overwritten',async()=>{
  const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:1,full_path:'sdlc',description:'Owned by another team'})));
  vi.stubGlobal('fetch',fetchMock);
  await expect(new GitLabProvider('http://gitlab','private').ensureGroup('sdlc')).rejects.toThrow('não pertence');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('missing group creation is idempotently namespaced with explicit ownership',async()=>{
  const fetchMock=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response(JSON.stringify({id:5,full_path:'sdlc',description:'[sdlc-managed]'})));
  vi.stubGlobal('fetch',fetchMock);
  const group=await new GitLabProvider('http://gitlab','private').ensureGroup('sdlc');
  expect(group.id).toBe(5);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({path:'sdlc',visibility:'private',description:expect.stringContaining('[sdlc-managed]')});
});
test('neutral skeletons contain only health/version and build facts, no business app',()=>{
  for(const runtime of ['node','python'] as const){
    const files=runtimeFiles(runtime,'Chosen by user');
    expect(files['Dockerfile']).toContain('ARG GIT_SHA');
    expect(files['Dockerfile']).toContain('USER ');
    expect(Object.values(files).join('\n')).not.toContain('Entrega local pelo SDLC');
    expect(files['.sdlc/contract.md']).toContain('Sem lógica de negócio');
    expect(files['smoke.yaml']).toContain('/version');
  }
});
test('existing business code never has its protection removed during reconciliation',async()=>{
  const responses=[
    {id:9,path_with_namespace:'sdlc/live/node',web_url:'http://gitlab/local',topics:['sdlc-managed']},
    {content:'contract'}, {},
    {push_access_levels:[{id:1,access_level:40}],allow_force_push:false},
    [{id:'first'},{id:'business-change'}], []
  ];
  const fetchMock=vi.fn().mockImplementation(async()=>new Response(JSON.stringify(responses.shift())));
  vi.stubGlobal('fetch',fetchMock);
  await expect(new GitLabProvider('http://gitlab','private').ensureProject({id:5,full_path:'sdlc/live'},'node','node','Owned business')).rejects.toThrow('revisão administrativa');
  expect(fetchMock.mock.calls.every(call=>call[1].method!=='DELETE')).toBe(true);
});
