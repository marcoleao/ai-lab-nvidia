'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHttp,Lab,validationError}=require('../client');

test('validation errors identify fields without echoing private input or model text',()=>{
  const error=validationError([{loc:['body','result','PlanningAnswer','proposal',1,'parent_ref'],msg:'private-user-text',input:'secret',ctx:{private:'secret'}}],'/v1/chat-turns/test/complete');
  assert.equal(error.code,'invalid_response');
  assert.match(error.message,/proposal.1.parent_ref/);
  assert(!error.message.includes('private')&&!error.message.includes('secret'));
});

test('HTTP transport separates framing and preserves Unicode',()=>{
  const body=JSON.stringify({message:'Locação — veículos'});
  assert.deepEqual(parseHttp(`HTTP/1.0 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`),{message:'Locação — veículos'});
  assert.throws(()=>parseHttp('HTTP/1.0 500 Bad\r\n\r\n{}'));
  assert.throws(()=>parseHttp('HTTP/1.0 200 OK\r\nContent-Length: 100\r\n\r\n{}'));
  assert.throws(()=>parseHttp('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{}'));
});

test('unprepared model and tool replies are rejected before completion',async()=>{
  const lab=new Lab(__dirname);
  let calls=0;
  lab.call=async operation=>{calls++;if(operation==='tags')return {models:[]};throw Error('Must not infer');};
  const request={model:'qwen3:14b',messages:[],format:{},stream:false,think:false,keep_alive:'2m',options:{num_ctx:8192,num_predict:1000}};
  await assert.rejects(lab.infer(request),{code:'model_unavailable'});
  assert.equal(calls,1);
  lab.call=async operation=>operation==='tags'?{models:[{name:'qwen3:14b',digest:'a'.repeat(64)}]}:{model:'qwen3:14b',done:true,message:{role:'assistant',content:'{}',tool_calls:[{function:{name:'shell'}}]}};
  await assert.rejects(lab.infer(request),{code:'invalid_response'});
});

test('remote tools/URLs in the inference envelope are refused',async()=>{
  const lab=new Lab(__dirname);
  await assert.rejects(lab.infer({model:'qwen3:14b',tools:[{name:'shell'}]}),{code:'invalid_response'});
});

test('model digest changes during inference invalidate output',async()=>{
  const lab=new Lab(__dirname);let reads=0;
  lab.call=async operation=>operation==='tags'?{models:[{name:'qwen3:14b',digest:(++reads===1?'a':'b').repeat(64)}]}:{model:'qwen3:14b',done:true,message:{role:'assistant',content:'{}'}};
  await assert.rejects(lab.infer({model:'qwen3:14b',messages:[],format:{},stream:false,think:false,keep_alive:'2m',options:{num_ctx:8192,num_predict:1000}}),{code:'invalid_response'});
});
