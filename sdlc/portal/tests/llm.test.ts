import {afterEach,expect,test,vi} from 'vitest';
import {LocalLLMProvider} from '../apps/api/src/llm.ts';
import {planOutputSchema} from '../apps/api/src/plan-schema.ts';
import {createServer} from 'node:http';
afterEach(()=>vi.unstubAllGlobals());
const provider=()=>new LocalLLMProvider('http://172.21.0.1:11435','qwen3:14b','private-fixture',420000,(url,init)=>fetch(url,init));
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

test('code output budget is bounded and incomplete larger responses remain rejected',async()=>{
 const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:'qwen3:14b',choices:[{finish_reason:'length',message:{content:'{"summary":"incomplete"}'}}]})));vi.stubGlobal('fetch',mock);
 await expect(provider().complete([{role:'user',content:'Complete current code'}],{json:true,maxTokens:8192})).rejects.toMatchObject({code:'LLM_OUTPUT_LIMIT'});
 expect(JSON.parse(mock.mock.calls[0][1].body).max_tokens).toBe(8192);
 await expect(provider().complete([{role:'user',content:'Code'}],{maxTokens:8193})).rejects.toThrow();expect(mock).toHaveBeenCalledTimes(1);
});

test('native relay transport keeps one deadline, bounded bodies and never follows redirects',async()=>{
 let mode='delayed',requests=0;const received:string[]=[];
 const server=createServer((req,res)=>{
  requests++;received.push(String(req.headers['transfer-encoding']??'')+'|'+String(req.headers['content-length']??''));
  req.resume();
  if(mode==='redirect'){res.writeHead(302,{Location:'/must-not-follow'});res.end('{}');return;}
  if(mode==='large'){res.end('x'.repeat(2*1024*1024+1));return;}
  setTimeout(()=>{if(!res.destroyed)res.end(JSON.stringify({model:'local',choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]}));},80);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('Fixture address missing');
 const native=(timeout=1000)=>new LocalLLMProvider('http://127.0.0.1:'+address.port,'local','private-fixture',timeout);
 try{
  vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Native inference must not depend on fetch header timeout');}));
  expect((await native().complete([{role:'user',content:'test'}],{json:true})).content).toBe('{"ok":true}');
  expect(received[0]).toMatch(/^\|\d+$/);
  await expect(native(15).complete([{role:'user',content:'test'}])).rejects.toMatchObject({code:'LLM_TIMEOUT'});
  const caller=new AbortController();caller.abort();
  await expect(native().complete([{role:'user',content:'test'}],{signal:caller.signal})).rejects.toMatchObject({code:'LLM_CANCELLED'});
  mode='redirect';const before=requests;
  await expect(native().complete([{role:'user',content:'test'}])).rejects.toMatchObject({code:'LLM_REQUEST_FAILED'});expect(requests).toBe(before+1);
  mode='large';await expect(native().complete([{role:'user',content:'test'}])).rejects.toMatchObject({code:'LLM_INVALID_RESPONSE'});
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
