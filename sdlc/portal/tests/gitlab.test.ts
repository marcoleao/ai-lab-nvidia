import {afterEach,expect,test,vi} from 'vitest';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
import {runtimeFiles} from '@sdlc/templates';
afterEach(()=>vi.unstubAllGlobals());
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
