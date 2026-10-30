import {createHash} from 'node:crypto';
import {developmentBuildDockerfile} from '../../shared/src/development-build.ts';
import type {ApplicationPreparationFile} from '../../shared/src/application-preparation.ts';
export const applicationTemplateVersion='node24-react-starter-v2';
const contract={schemaVersion:1,units:[{id:'web',path:'.',runtime:{kind:'node',version:'24'},build:{entrypoint:'scripts/build.mjs'},test:{entrypoint:'scripts/test.mjs'},artifact:{dockerfile:'Dockerfile',context:'.'},health:{kind:'http',path:'/health',port:8080,status:200},migrations:{mode:'none'}}]};
const sources:Record<string,string>={
 'tests/dev-http.json':JSON.stringify({schemaVersion:1,scope:'technical',cases:[{id:'health',name:'Disponibilidade HTTP',method:'GET',path:'/health',status:200,contains:'"status":"ok"'},{id:'home',name:'Página inicial compilada',method:'GET',path:'/',status:200,contains:'id="root"'},{id:'asset',name:'Código compilado disponível',method:'GET',path:'/dist/app.js',status:200},{id:'missing',name:'Rota ausente',method:'GET',path:'/not-a-route',status:404}]},null,2)+'\n',
 '.sdlc/execution.json':JSON.stringify(contract,null,2)+'\n',
 'Dockerfile':developmentBuildDockerfile+'\n',
 'package.json':JSON.stringify({name:'sdlc-node24-react-application',private:true,type:'module',engines:{node:'24.x'},scripts:{build:'node scripts/build.mjs',test:'node scripts/test.mjs',start:'node server.mjs'},dependencies:{react:'19.3.1','react-dom':'19.3.1'},devDependencies:{esbuild:'0.28.2'}},null,2)+'\n',
 'scripts/build.mjs':`import {build} from 'esbuild';
await build({entryPoints:['src/main.jsx'],bundle:true,format:'esm',platform:'browser',jsx:'automatic',minify:true,outfile:'dist/app.js',define:{'process.env.NODE_ENV':'"production"'}});
`,
 'scripts/test.mjs':`import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplicationServer} from '../server.mjs';
await test('HTTP health and compiled application are available',async()=>{
 const server=createApplicationServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const health=await fetch(base+'/health');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/id="root"/);
  const asset=await fetch(base+'/dist/app.js');assert.equal(asset.status,200);assert.ok((await asset.text()).length>0);
  assert.equal((await fetch(base+'/not-a-route')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
`,
 'server.mjs':`import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const home='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Aplicação</title><link rel="stylesheet" href="/dist/app.css"></head><body><div id="root"></div><script type="module" src="/dist/app.js"></script></body></html>';
const assets=new Map([['/dist/app.js',['dist/app.js','text/javascript; charset=utf-8']],['/dist/app.css',['dist/app.css','text/css; charset=utf-8']]]);
export function createApplicationServer(){return createServer(async(request,response)=>{
 let path;try{path=new URL(request.url,'http://application.local').pathname;}catch{response.writeHead(400);response.end();return;}
 response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
 if(path==='/health'){response.setHeader('Content-Type','application/json');response.writeHead(200);response.end(request.method==='HEAD'?undefined:JSON.stringify({status:'ok'}));return;}
 if(path==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.writeHead(200);response.end(request.method==='HEAD'?undefined:home);return;}
 const asset=assets.get(path);if(!asset){response.writeHead(404);response.end();return;}
 try{const bytes=await readFile(new URL(asset[0],import.meta.url));response.setHeader('Content-Type',asset[1]);response.writeHead(200);response.end(request.method==='HEAD'?undefined:bytes);}catch{response.writeHead(503);response.end();}
 });}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const server=createApplicationServer();server.listen(8080,'0.0.0.0');
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
`,
 'src/App.jsx':`import React from 'react';
export default function App(){return <main><p className="eyebrow">Aplicação</p><h1>Desenvolvimento em andamento</h1><p>A base técnica está preparada. As funcionalidades serão entregues pelas Histórias do projeto.</p></main>;}
`,
 'src/main.jsx':`import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './app.css';
createRoot(document.getElementById('root')).render(<App/>);
`,
 'src/app.css':'*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#202b3a;font:16px/1.6 system-ui,sans-serif}main{max-width:48rem;margin:10vh auto;padding:2rem}h1{font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.2}.eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.12em;color:#53627b}\n'
};
export const applicationPreparationFiles=():ApplicationPreparationFile[]=>Object.entries(sources).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,content])=>({path,content,digest:createHash('sha256').update(content).digest('hex')}));
export const applicationPreparationDigest=()=>createHash('sha256').update(JSON.stringify(applicationPreparationFiles().map(({path,digest})=>({path,digest})))).digest('hex');
