'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');

class ClientError extends Error {
  constructor(message, code='transport_error'){super(message);this.code=code;}
}
function validationError(detail,route){
  const fields=new Set(['proposal','questions','summary','domain','reply','parent_ref','ref','criteria','measure','title','description','assumptions','text','intent','expected_version']);
  const paths=Array.isArray(detail)?[...new Set(detail.filter(item=>!item.loc?.includes('Interview')).map(item=>(item.loc||[]).filter(part=>fields.has(part)||Number.isInteger(part)).join('.')).filter(Boolean))].slice(0,5):[];
  const suffix=paths.length?` Campos: ${paths.join(', ')}.`:'';
  const known=[['Hierarquia da proposta inválida','Os vínculos entre outcome, épicos e histórias são inválidos.'],['Referência repetida','O modelo repetiu um identificador de item.'],['Outcome exige medida e história exige critérios','Faltou uma medida do outcome ou critérios de uma história.'],['Proposta completa não pode conter perguntas ou pais sem filhos','A proposta contém perguntas ou itens sem desdobramento.']];
  const reasons=known.filter(([match])=>Array.isArray(detail)&&detail.some(item=>typeof item.msg==='string'&&item.msg.endsWith(match))).map(([,label])=>label);
  // Never echo Pydantic's input/ctx or arbitrary model text into diagnostics.
  return new ClientError(route.endsWith('/complete')?`A resposta do modelo não passou na validação.${suffix} ${reasons.join(' ')} A conversa foi preservada. Use Retomar rodada após o prazo de recuperação.`:`A solicitação contém campos inválidos.${suffix}`,'invalid_response');
}
function api(token, route, method='GET', body, key){
  if(!/^\/v1\/[A-Za-z0-9_/?=&.-]+$/.test(route))throw new ClientError('Rota local inválida.');
  return new Promise((resolve,reject)=>{
    const data=body===undefined?null:Buffer.from(JSON.stringify(body));
    const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json'};
    if(data)headers['Content-Length']=data.length;
    if(key)headers['Idempotency-Key']=key;
    const request=http.request({hostname:'127.0.0.1',port:3100,path:route,method,headers,timeout:15000},response=>{
      let size=0;const chunks=[];
      response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){request.destroy(new ClientError('Resposta do SDLC excedeu o limite.'));return;}chunks.push(chunk);});
      response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode<200||response.statusCode>=300){if(response.statusCode===422&&Array.isArray(value.detail)){reject(validationError(value.detail,route));return;}reject(new ClientError(typeof value.detail==='string'?value.detail:`O SDLC recusou a solicitação (HTTP ${response.statusCode}).`,response.statusCode===401?'authentication':'server_error'));return;}resolve(value);}catch{reject(new ClientError('Resposta inválida do SDLC.'));}});
    });
    request.on('timeout',()=>request.destroy(new ClientError('O SDLC não respondeu. Verifique se o ambiente está ativo.','timeout')));
    request.on('error',error=>reject(error instanceof ClientError?error:new ClientError('Não foi possível acessar o SDLC em 127.0.0.1:3100.')));
    if(data)request.write(data);request.end();
  });
}

function native(args, input, signal, timeout=190000){
  return new Promise((resolve,reject)=>{
    const process=spawn('wsl.exe',args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    const chunks=[];let size=0,diagnosticSize=0,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
    const abort=()=>{process.kill();finish(signal.reason instanceof ClientError?signal.reason:new ClientError('Espera interrompida. A rodada ficará registrada.','client_closed'));};
    const timer=setTimeout(()=>{process.kill();finish(new ClientError('O modelo excedeu o prazo de resposta.','timeout'));},timeout);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    process.stdout.on('data',chunk=>{size+=chunk.length;if(size>262144){process.kill();finish(new ClientError('Resposta do modelo excedeu o limite.','invalid_response'));}else chunks.push(chunk);});
    // Drain stderr separately: WSL startup warnings must never corrupt JSON.
    process.stderr.on('data',chunk=>{diagnosticSize+=chunk.length;if(diagnosticSize>65536){process.kill();finish(new ClientError('Falha repetida no transporte WSL.'));}});
    process.on('error',()=>finish(new ClientError('WSL indisponível nesta instalação do VS Code.')));
    process.on('close',code=>{if(code!==0)finish(new ClientError('Laboratório/Ollama indisponível. Inicie o laboratório e tente novamente.','model_unavailable'));else finish(null,Buffer.concat(chunks).toString('utf8').replace(/\0/g,''));});
    process.stdin.on('error',()=>{});process.stdin.end(input||'');
  });
}

class Lab {
  constructor(extensionPath){this.extensionPath=extensionPath;}
  async call(operation,payload,signal){
    if(!['tags','chat'].includes(operation))throw new ClientError('Operação de inferência inválida.');
    const location=process.env.LOCALAPPDATA;
    if(!location)throw new ClientError('O chat local requer o VS Code no Windows.');
    let owner;
    try{owner=JSON.parse(await fs.readFile(path.join(location,'ai-local-lab','.ai-local-lab-owner.json'),'utf8'));}catch{throw new ClientError('Marcador do laboratório não encontrado. Verifique a instalação.');}
    if(owner.name!=='ai-local-lab'||!/^[a-f0-9]{32}$/.test(owner.id))throw new ClientError('Marcador do laboratório inválido.');
    const translated=(await native(['-d','ai-local-lab','-u','lab','--exec','wslpath','-a','-u',path.join(this.extensionPath,'lab-transport.sh')],null,signal,20000)).trim();
    if(!translated.startsWith('/')||translated.includes('\n'))throw new ClientError('Não foi possível localizar o transporte local.');
    const raw=await native(['-d','ai-local-lab','-u','lab','--exec','bash',translated,operation,owner.id],payload?JSON.stringify(payload):'',signal,operation==='tags'?25000:190000);
    return parseHttp(raw);
  }
  async models(signal){const value=await this.call('tags',null,signal);if(!Array.isArray(value.models))throw new ClientError('Inventário do Ollama inválido.','invalid_response');return value.models;}
  async infer(request,signal){
    const allowed=['model','messages','format','stream','think','keep_alive','options'];
    if(!request||Object.keys(request).some(key=>!allowed.includes(key))||request.stream!==false||request.think!==false||![8192,16384].includes(request.options?.num_ctx)||![1000,2200].includes(request.options?.num_predict)||!Array.isArray(request.messages)||JSON.stringify(request).length>20000)throw new ClientError('Contrato de inferência inválido.','invalid_response');
    const before=await this.models(signal);
    const selected=before.find(item=>item.name===request.model||item.model===request.model);
    if(!selected||!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/.test(selected.digest))throw new ClientError(`Modelo ${request.model} não está preparado no laboratório. Nenhum download foi iniciado.`,'model_unavailable');
    const response=await this.call('chat',request,signal);
    if(response.model!==request.model||!response.done||response.done_reason==='length'||response.message?.role!=='assistant'||response.message?.tool_calls?.length)throw new ClientError('O modelo não concluiu uma resposta válida.','invalid_response');
    const after=await this.models(signal);
    if(!after.some(item=>(item.name===request.model||item.model===request.model)&&item.digest===selected.digest))throw new ClientError('O modelo mudou durante a inferência.','invalid_response');
    let result;try{result=JSON.parse(response.message.content);}catch{throw new ClientError('O modelo não respeitou o formato da entrevista.','invalid_response');}
    return {result,model:request.model,model_digest:selected.digest};
  }
}
function parseHttp(raw){
  const boundary=raw.indexOf('\r\n\r\n');
  if(boundary<0||boundary>8192)throw new ClientError('Resposta HTTP local inválida.','invalid_response');
  const header=raw.slice(0,boundary),body=raw.slice(boundary+4);
  if(!/^HTTP\/1\.[01] 200\b/.test(header))throw new ClientError('O Ollama recusou a inferência. Confira o modelo preparado.','model_unavailable');
  if(/transfer-encoding:/i.test(header))throw new ClientError('Formato HTTP local inesperado.','invalid_response');
  const length=header.match(/\r\ncontent-length:\s*(\d+)/i);
  if(length&&Number(length[1])!==Buffer.byteLength(body))throw new ClientError('Resposta local incompleta.','invalid_response');
  try{return JSON.parse(body);}catch{throw new ClientError('O Ollama retornou JSON inválido.','invalid_response');}
}
module.exports={api,Lab,ClientError,native,parseHttp,validationError};
