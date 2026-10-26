import {test,expect,vi,afterEach} from 'vitest';
import {validatePatch,specificationSchemaForCriteria} from '../apps/api/src/code-schema.ts';
import {GitLabProvider} from '../apps/api/src/gitlab.ts';
afterEach(()=>vi.unstubAllGlobals());

test('technical generation constrains criterion references rather than numbering test cases',()=>{
 const specification={requirements:'Implementar o dobro de um número.',architecture:'Função pura em módulo ES isolado.',risks:[],testCases:[{criterionIndex:0,description:'O dobro de três deve retornar seis.'},{criterionIndex:0,description:'O dobro de zero deve retornar zero.'}]};
 const schema=specificationSchemaForCriteria(1);
 expect(schema.parse(specification).testCases).toHaveLength(2);
 const invalid={...specification,testCases:[specification.testCases[0],{...specification.testCases[1],criterionIndex:1}]};
 expect(schema.safeParse(invalid).success).toBe(false);
 expect(specificationSchemaForCriteria(2).safeParse(invalid).success).toBe(true);
 expect(()=>specificationSchemaForCriteria(0)).toThrow();
});
test('code patch rejects infrastructure, traversal, duplicate paths and empty output',()=>{
  for(const path of ['../secret.py','.gitlab-ci.yml','src/../secret.py','package.json','src/.env.py','Dockerfile','src/a.ts/../../a.py'])expect(()=>validatePatch({summary:'Test',files:[{path,content:'code'}]})).toThrow();
  expect(()=>validatePatch({summary:'Test',files:[{path:'src/a.py',content:'x'},{path:'src/A.py',content:'y'}]})).toThrow();
  expect(validatePatch({summary:'Test',files:[{path:'src/catalog.py',content:'def lookup(): return []'}]}).files).toHaveLength(1);
});
test('dependency manifests require explicit capability while infrastructure stays protected',()=>{
  for(const path of ['package.json','requirements.txt','pyproject.toml']){
    const patch={summary:'Decisão do usuário',files:[{path,content:'manifest'}]};
    expect(()=>validatePatch(patch)).toThrow('decisão explícita');
    expect(validatePatch(patch,{dependencies:true}).files[0].path).toBe(path);
  }
  expect(()=>validatePatch({summary:'Test',files:[{path:'.gitlab-ci.yml',content:'x'}]},{dependencies:true})).toThrow();
});
test('application configuration and ordinary names are accepted while exact invalid paths are diagnosed',()=>{
  for(const path of ['config.js','src/settings/config.json','blocklist.js','views/account.html'])expect(validatePatch({summary:'Aplicação',files:[{path,content:'placeholder'}]}).files[0].path).toBe(path);
  try{validatePatch({summary:'Teste',files:[{path:'src/a.js',content:'a'},{path:'src/A.js',content:'b'},{path:'../outside.js',content:'c'}]});throw Error('Expected validation failure');}catch(error){expect(error).toMatchObject({issues:expect.arrayContaining([{path:'src/A.js',code:'DUPLICATE_PATH',message:expect.any(String)},{path:'../outside.js',code:'UNSAFE_PATH',message:expect.any(String)}])});}
});
test('GitLab publication reconciles an existing execution branch and MR without another commit',async()=>{
  const sha='a'.repeat(40),run='cmvhexecutiontest00001';
  const mock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({commit:{id:sha,message:`SDLC execution ${run} [skip ci]`}}))).mockResolvedValueOnce(new Response(JSON.stringify([{web_url:'http://gitlab/mr/1',sha,state:'opened'}])));
  vi.stubGlobal('fetch',mock);
  const result=await new GitLabProvider('http://gitlab','fixture').publishCode(1,run,{sha:'b'.repeat(40),targetBranch:'main',files:[]},{summary:'Summary',files:[{path:'src/a.py',content:'x=1'}]},'Story');
  expect(result).toEqual({sha,url:'http://gitlab/mr/1'});expect(mock.mock.calls.every(c=>c[1].method==='GET')).toBe(true);
});
test('GitLab publishes into a dedicated branch from pinned base and creates a draft MR',async()=>{
  const base='b'.repeat(40),sha='a'.repeat(40);
  const mock=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response(JSON.stringify({commit:{id:base}}))).mockResolvedValueOnce(new Response(JSON.stringify({id:sha}))).mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response(JSON.stringify({web_url:'http://gitlab/mr/1'})));
  vi.stubGlobal('fetch',mock);
  await new GitLabProvider('http://gitlab','fixture').publishCode(1,'cmvhexecutiontest00001',{sha:base,targetBranch:'main',files:[]},{summary:'Summary',files:[{path:'src/a.py',content:'x=1'}]},'Story');
  const commit=JSON.parse(mock.mock.calls[2][1].body),mr=JSON.parse(mock.mock.calls[4][1].body);
  expect(commit).toMatchObject({start_sha:base,commit_message:expect.stringContaining('[skip ci]')});expect(commit.branch).not.toBe('main');expect(commit.force).toBeUndefined();expect(mr.title).toMatch(/^Draft:/);
});
