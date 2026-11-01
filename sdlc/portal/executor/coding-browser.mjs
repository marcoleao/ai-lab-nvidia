const accessibleName=name=>name===''?/^$/u:new RegExp('^\\s*'+name.trim().replace(/:\s*$/u,'').split(/\s+/u).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+')+'\\s*:?\\s*$','iu');
// Trusted UI smoke. Application JavaScript runs only in an isolated browser;
// project scripts/backend are never imported or executed by this Node process.
import fs from 'node:fs/promises';
import {ControlRegistry} from './browser-controls.mjs';
import path from 'node:path';
import http from 'node:http';
import {isIPv4} from 'node:net';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json');
const {build}=createRequire(await fs.realpath('/app/node_modules/tsx/package.json'))('esbuild');const {chromium,expect}=require('@playwright/test');
let browser,server,uiServer;
const proof={applicable:true,passed:false,rendered:false,errors:[],uiProbe:{planned:0,executed:0,assertions:0},scope:'Entrada React e interações declaradas em navegador isolado; não comprova backend nem aceite funcional completo.'};
try{
 const input=JSON.parse(await fs.readFile('/request/candidate.json','utf8'));
 const published=input.mode==='published-dev';if(input.mode!==undefined&&!published)throw Error('Modo de navegador fora do contrato.');
 const files=published?[]:input.files;
 const steps=input.steps??[];
 if(!Array.isArray(steps)||steps.length>20||JSON.stringify(steps).length>8000||steps.some(step=>!step||Object.keys(step).some(key=>!['op','target','value','dialog'].includes(key))||!['fill','click','select','check','expect_text','expect_visible','expect_image','expect_background','expect_font','reload'].includes(step.op)))throw Error('Plano de interface fora do contrato.');
 if(steps.length&&!steps.some(step=>step.op.startsWith('expect_')))throw Error('A sonda exige asserção explícita.');
 proof.uiProbe.planned=steps.length;
 if(!Array.isArray(files)||files.length>32)throw Error('Limite de arquivos.');
 const root=await fs.mkdtemp('/tmp/sdlc-browser-');let bytes=0;
 for(const file of files){const name=file.path;if(typeof name!=='string'||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||typeof file.content!=='string')throw Error('Caminho inválido.');bytes+=Buffer.byteLength(file.content);if(bytes>80000||Buffer.byteLength(file.content)>20000)throw Error('Orçamento da candidata.');const full=path.resolve(root,name);if(!full.startsWith(root+'/'))throw Error('Caminho fora do workspace.');await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,file.content,{flag:'wx'});}
 const names=files.map(f=>f.path);const entry=published?'published-dev':['src/main.jsx','src/main.tsx','src/index.jsx','src/index.tsx'].find(name=>names.includes(name));
 if(!entry){proof.applicable=false;proof.scope='Sem entrada React neste contexto; smoke de interface não aplicado.';}
 else{
  let origin;
  if(published){const url=new URL(input.origin);const octets=url.hostname.split('.').map(Number);if(url.protocol!=='http:'||!isIPv4(url.hostname)||!(octets[0]===10||octets[0]===172&&octets[1]>=16&&octets[1]<=31||octets[0]===192&&octets[1]===168)||url.port!=='8080'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||input.liveSocket!=='/ipc/browser.sock'||steps.length)throw Error('Destino DEV fora do contrato.');origin=url.origin;proof.scope='Publicação DEV fixada pelo runtime; sessão limpa, mesma origem, somente GET/HEAD; sem escrita compartilhada ou aceite integral.';}
  else{
  const allowed=['react','react-dom','scheduler'];
  const output=await build({absWorkingDir:root,entryPoints:[entry],bundle:true,write:false,outdir:'/tmp/sdlc-browser-output',entryNames:'app',platform:'browser',jsx:'automatic',nodePaths:['/app/apps/web/node_modules','/app/node_modules'],logLevel:'silent',plugins:[{name:'prepared-dependencies',setup(builder){builder.onResolve({filter:/^[^./]/},args=>{if(args.path.startsWith('/'))return;const pkg=args.path.startsWith('@')?args.path.split('/').slice(0,2).join('/'):args.path.split('/')[0];if(!allowed.includes(pkg))return {errors:[{text:'Dependência não preparada para a entrada web: '+pkg}]};});}}]});
  const assets=new Map(output.outputFiles.map(file=>['/'+path.basename(file.path),file.contents]));
  let html=files.find(f=>['index.html','public/index.html'].includes(f.path))?.content??'<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  // The profile emits a single app.js; preserve the supplied mount markup.
  html=html.replace(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi,'');
  html=html.replace(/<\/head>/i,(assets.has('/app.css')?'<link rel="stylesheet" href="/app.css">':'')+'</head>');
  html=html.replace(/<\/body>/i,'<script src="/app.js"></script></body>');
  server=http.createServer((request,response)=>{const name=new URL(request.url,'http://localhost').pathname;if(name==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);}else if(name==='/__sdlc_test__/image.svg'){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="blue"/></svg>');}else if(assets.has(name)){response.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');response.end(assets.get(name));}else{response.statusCode=404;response.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true});const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  let networkBlocked=false;
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin||published&&!['GET','HEAD'].includes(request.method())){networkBlocked=true;return route.abort();}return route.continue();});
  if(published){if(typeof context.routeWebSocket!=='function')throw Error('Bloqueio de WebSocket indisponível.');await context.routeWebSocket('**',ws=>{networkBlocked=true;ws.close();});}
  const page=await context.newPage();page.setDefaultTimeout(1000);let dialogAction='dismiss';
  page.on('pageerror',error=>{if(proof.errors.length<5)proof.errors.push(error.message.slice(0,1200));});page.on('dialog',dialog=>dialogAction==='accept'?dialog.accept():dialog.dismiss());
  await page.goto(origin,{waitUntil:'networkidle',timeout:12000});
  if(published)try{await page.screenshot({path:'/ipc/initial.png'});}catch{}
  const visualObservation=()=>page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},elements:['html','body','#root','main'].map(selector=>{const node=document.querySelector(selector);if(!node)return null;const style=getComputedStyle(node),box=node.getBoundingClientRect();return {element:selector,margin:style.margin,padding:style.padding,display:style.display,background:style.backgroundColor,font:style.fontFamily,x:box.x,y:box.y,width:box.width,height:box.height};}).filter(Boolean)}));
  const target=spec=>{if(!spec||Object.keys(spec).some(key=>!['by','name','role','index'].includes(key))||typeof spec.name!=='string'||(spec.name.length===0&&!(spec.by==='role'&&spec.role==='textbox'&&Number.isInteger(spec.index)&&spec.index>=0&&spec.index<=5))||spec.name.length>160)throw Error('Alvo de interface inválido.');let locator;if(spec.by==='role'){if(!['button','textbox','spinbutton','combobox','checkbox','heading','link','img','status','region','form','listitem'].includes(spec.role))throw Error('Papel de interface inválido.');locator=page.getByRole(spec.role,{name:accessibleName(spec.name)});}else if(spec.by==='label')locator=page.getByLabel(accessibleName(spec.name));else if(spec.by==='text')locator=page.getByText(accessibleName(spec.name));else throw Error('Seletor de interface inválido.');if(spec.index!==undefined){if(!Number.isInteger(spec.index)||spec.index<0||spec.index>5)throw Error('Índice de interface inválido.');locator=locator.nth(spec.index);}return locator;};
  const perform=async step=>{
   if(['fill','select','expect_text'].includes(step.op)&&(typeof step.value!=='string'||step.value.length>500))throw Error('Valor de interface inválido.');
   if(step.op==='expect_image'&&'value'in step&&(typeof step.value!=='string'||step.value.length>500))throw Error('URL esperada de imagem inválida.');
   const value=step.value?.replaceAll('$ORIGIN',origin);dialogAction=step.dialog??'dismiss';
   if(!['accept','dismiss'].includes(dialogAction)||step.dialog&&step.op!=='click')throw Error('Diálogo fora do contrato.');
   if(step.op==='reload'){if(Object.keys(step).length!==1)throw Error('Reload fora do contrato.');await page.reload({waitUntil:'networkidle'});}
   else if(step.op==='fill')await target(step.target).fill(value);
   else if(step.op==='click')await target(step.target).click();
   else if(step.op==='select')await target(step.target).selectOption({label:value});
   else if(step.op==='check')await target(step.target).check();
   else if(step.op==='expect_text')await expect(step.target?target(step.target):page.locator('body')).toContainText(value,{timeout:1000});
   else if(step.op==='expect_visible')await expect(target(step.target)).toBeVisible({timeout:1000});
   else if(step.op==='expect_image'){if(value)await expect(target(step.target)).toHaveAttribute('src',value,{timeout:1000});await expect.poll(()=>target(step.target).evaluate(image=>image.tagName==='IMG'&&image.complete&&image.naturalWidth>0),{timeout:1000}).toBe(true);}
   else if(step.op==='expect_background'){
    if(Object.keys(step).some(key=>!['op','value'].includes(key))||!/^#[0-9a-f]{6}$/iu.test(value))throw Error('Asserção de fundo exige somente cor hexadecimal.');
    const rgb='rgb('+value.slice(1).match(/../gu).map(pair=>parseInt(pair,16)).join(', ')+')';
    await expect.poll(()=>page.evaluate(()=>{
     const sample=(x,y)=>{let node=document.elementFromPoint(x,y);while(node){const color=getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;node=node.parentElement;}return getComputedStyle(document.body).backgroundColor;};
     return [[0,0],[innerWidth-1,0],[0,innerHeight-1],[innerWidth-1,innerHeight-1],[innerWidth/2,innerHeight-1]].map(([x,y])=>sample(x,y));
    }),{timeout:1000}).toEqual(Array(5).fill(rgb));
   }
   else if(step.op==='expect_font'){
    if(Object.keys(step).some(key=>!['op','value'].includes(key))||!/^[a-z][a-z0-9 -]{0,79}$/iu.test(value))throw Error('Asserção de fonte exige somente família.');
    await expect.poll(()=>page.getByRole('heading',{level:1}).first().evaluate(node=>getComputedStyle(node).fontFamily.split(',')[0].trim().replaceAll('"','').replaceAll("'",'')),{timeout:1000}).toBe(value);
   }
   else throw Error('Operação de interface não permitida.');
   proof.uiProbe.executed++;if(step.op.startsWith('expect_'))proof.uiProbe.assertions++;
  };
  if(input.liveSocket){
   if(input.liveSocket!=='/ipc/browser.sock')throw Error('Socket de sessão fora do contrato.');
   const registry=new ControlRegistry();let requests=0,busy=false,stopLive;
   const lifetime=new Promise(resolve=>{stopLive=resolve;});
   const observe=async()=>{
    const full=await page.locator('body').ariaSnapshot(),catalog=registry.update(full);
    // Observe native form feedback through the same accessible target. This is
    // read-only; neither validity nor application state is changed/injected.
    for(const control of catalog.controls)if(['textbox','spinbutton'].includes(control.role)){
     const feedback=await target({by:'role',role:control.role,name:control.name,index:control.index}).evaluate(element=>({required:!!element.required,inputType:element.type??'text',editable:!element.disabled&&!element.readOnly,validity:element.validity?{valid:element.validity.valid,valueMissing:element.validity.valueMissing,message:element.validationMessage.slice(0,300)}:null}));
     Object.assign(control,feedback);
    }
    proof.visualObservation=await visualObservation();proof.observedUI=full.slice(0,6000);proof.rendered=await page.locator('body').evaluate(body=>!!body.innerText.trim()||!!body.querySelector('canvas,svg,img'));proof.passed=proof.rendered&&proof.errors.length===0;if(published)try{await page.screenshot({path:'/ipc/latest.png'});}catch{}return {...proof,controls:catalog.controls,controlsLimited:catalog.limited,observationTruncated:full.length>6000,...(published?{networkBlocked}: {})};
   };
   uiServer=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Connection':'close'});res.end(JSON.stringify(value));};
    try{
     if(req.method==='GET'&&req.url==='/state')return reply(200,await observe());
     if(req.method==='POST'&&req.url==='/close'){reply(200,{closed:true});stopLive();return;}
     if(req.method!=='POST'||req.url!=='/action')return reply(404,{error:'Rota não permitida.'});
     if(busy)return reply(409,{error:'Aguarde a ação corrente.'});
     if(++requests>28)return reply(422,{error:'Limite de ações da sessão.'});
     busy=true;let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw Error('Ação excede o limite.');}
     const action=JSON.parse(body);let step;
     try{
      step=registry.step(action);proof.uiProbe.planned++;await perform(step);const state=await observe();
      const screenshot=published?'latest.png':'step-'+requests+'.png';let captured=true;try{await page.screenshot({path:'/ipc/'+screenshot});}catch{captured=false;}
      reply(200,{...state,actionPassed:true,lastStep:step,screenshot:captured?screenshot:null});
     }catch(error){reply(200,{...await observe(),actionPassed:false,...(step?{lastStep:step}:{}),actionError:String(error.message).slice(0,1500)});}
    }catch(error){reply(422,{error:String(error.message).slice(0,500)});}finally{busy=false;}
   });
   await new Promise(resolve=>uiServer.listen(input.liveSocket,resolve));await fs.chmod(input.liveSocket,0o600);
   await lifetime;
  }else{
   try{for(const step of steps)await perform(step);}catch(error){proof.errors.push(('Interação '+(proof.uiProbe.executed+1)+': '+error.message).slice(0,1200));}
  }
  proof.visualObservation=await visualObservation();proof.observedUI=(await page.locator('body').ariaSnapshot()).slice(0,6000);
  proof.rendered=await page.locator('body').evaluate(body=>!!body.innerText.trim()||!!body.querySelector('canvas,svg,img'));
  if(!proof.rendered)proof.errors.push('A entrada web abriu sem conteúdo visível.');
  proof.passed=proof.rendered&&proof.errors.length===0;await context.close();
 }
}catch(error){proof.errors.push(String(error.errors?.[0]?.text??error.message).slice(0,1500));}
finally{if(uiServer)await new Promise(resolve=>uiServer.close(resolve));if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
process.stdout.write(JSON.stringify(proof)+'\n');
