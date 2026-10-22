import {afterEach,expect,test,vi} from 'vitest';
import {LocalLLMProvider} from '../apps/api/src/llm.ts';
import {planOutputSchema} from '../apps/api/src/plan-schema.ts';
afterEach(()=>vi.unstubAllGlobals());
const provider=()=>new LocalLLMProvider('http://172.21.0.1:11435','qwen3:14b','private-fixture');
test('local provider refuses cloud endpoints and URL credentials',()=>{
  expect(()=>new LocalLLMProvider('https://example.com','model','token')).toThrow('internal');
  expect(()=>new LocalLLMProvider('http://secret@127.0.0.1','model','token')).toThrow('internal');
});
test('catalog and completions use relay credential and fixed model without tools or streaming',async()=>{
  const mock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:'qwen3:14b'}]}))).mockResolvedValueOnce(new Response(JSON.stringify({model:'qwen3:14b',choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})));
  vi.stubGlobal('fetch',mock);const llm=provider();expect(await llm.models()).toEqual(['qwen3:14b']);
  expect((await llm.complete([{role:'user',content:'Technical test'}],{json:true,maxTokens:64})).content).toBe('{"ok":true}');
  const init=mock.mock.calls[1][1];const body=JSON.parse(init.body);
  expect(body).toMatchObject({model:'qwen3:14b',stream:false,reasoning_effort:'none',max_tokens:64,response_format:{type:'json_object'}});
  expect(body.tools).toBeUndefined();expect(init.redirect).toBe('error');expect(init.headers.Authorization).toBe('Bearer private-fixture');
});
test('invalid catalog, empty output, truncation, model mismatch and malformed JSON never produce a fallback',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{}')));
  await expect(provider().models()).rejects.toThrow('Catálogo');
  for(const [content,finish_reason,model,json] of [['','stop','qwen3:14b',false],['partial','length','qwen3:14b',false],['answer','stop','other',false],['not json','stop','qwen3:14b',true]] as const){
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({model,choices:[{finish_reason,message:{content}}]}))));
    await expect(provider().complete([{role:'user',content:'Test'}],{json})).rejects.toThrow();
  }
});
test('thinking remains disabled when subsequent messages include conversation history',async()=>{
  const mock=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({model:'qwen3:14b',choices:[{finish_reason:'stop',message:{content:'Qual o próximo requisito?'}}]})));
  vi.stubGlobal('fetch',mock);
  const messages:{role:'system'|'user'|'assistant';content:string}[]=[{role:'system',content:'Faça uma pergunta por vez.'}];
  for(const input of ['Quero um cadastro.','Atendentes vão utilizá-lo.','Precisam atualizar registros.']){
    messages.push({role:'user',content:input});
    const result=await provider().complete(messages);
    messages.push({role:'assistant',content:result.content});
  }
  expect(mock.mock.calls.map(call=>JSON.parse(call[1].body).messages.length)).toEqual([2,4,6]);
  for(const call of mock.mock.calls)expect(JSON.parse(call[1].body).reasoning_effort).toBe('none');
});
test('plans send their schema to constrain decoding and allow a larger complete response',async()=>{
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:'qwen3:14b',choices:[{finish_reason:'stop',message:{content:'{"error":"entrevista insuficiente"}'}}]})));
  vi.stubGlobal('fetch',mock);
  await provider().complete([{role:'user',content:'Gere o plano'}],{json:true,schema:planOutputSchema,maxTokens:4096});
  const body=JSON.parse(mock.mock.calls[0][1].body);
  expect(body.max_tokens).toBe(4096);expect(body.response_format).toEqual({type:'json_schema',json_schema:{name:'sdlc_plan',strict:true,schema:planOutputSchema}});
  expect(JSON.stringify(planOutputSchema)).toContain('additionalProperties');
});
test('unavailability, timeout and caller cancellation are distinct and do not expose credentials',async()=>{
  for(const name of ['TypeError','TimeoutError']){
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Object.assign(new Error('private-fixture'),{name})));
    await expect(provider().models()).rejects.toMatchObject({code:name==='TimeoutError'?'LLM_TIMEOUT':'LLM_UNAVAILABLE'});
  }
  const controller=new AbortController();controller.abort();
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('cancel','AbortError')));
  await expect(provider().complete([{role:'user',content:'Test'}],{signal:controller.signal})).rejects.toMatchObject({code:'LLM_CANCELLED'});
});
