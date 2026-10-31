// Application sources are data. No source, package script or dependency is executed here.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {transform,build} from 'esbuild';
import {spawn} from 'node:child_process';

async function checkJavaScript(code,commonjs=false){
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--check','--input-type='+ (commonjs?'commonjs':'module')],{stdio:['pipe','ignore','pipe'],timeout:5000});let error='';child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(0,4000);});child.on('error',reject);child.on('close',status=>status===0?resolve():reject(Error(error||'Parser Node não confirmou a sintaxe.')));child.stdin.on('error',()=>{});child.stdin.end(code);});
}

export const digest=text=>createHash('sha256').update(text).digest('hex');
const allowed=/\.(?:[cm]?[jt]sx?|json|css|html|md|svg)$/i;
const protectedPath=/(^|\/)(?:\.[^/]+|node_modules|vendor|dist|build|infra|infrastructure|Dockerfile[^/]*|Makefile|[^/]*lock[^/]*)(?:\/|$)/i;
export class Workspace {
 constructor(root,files,{dependencies=false,writePaths=null}={}){this.root=path.resolve(root);this.initial=new Map(files.map(f=>[f.path,f.content]));this.dependencies=dependencies;this.writePaths=writePaths===null?null:new Set(writePaths);this.calls=0;this.validations=0;this.events=[];}
 check(name,write=false){
  if(typeof name!=='string'||name.length>200||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||!allowed.test(name)||protectedPath.test(name)||/^(?:https?:|[a-z]:)/i.test(name))throw Error('Caminho fora do contrato de código.');
  if(write&&!this.dependencies&&/(^|\/)(?:package\.json|tsconfig[^/]*\.json)$/i.test(name))throw Error('Manifesto requer autorização de dependências.');
  if(write&&this.writePaths&&!this.writePaths.has(name))throw Error('Arquivo fora do recorte de correção. Preserve os demais arquivos e corrija somente a candidata indicada.');
  return path.join(this.root,name);
 }
 async file(name,write=false){let full=this.check(name,write);let cursor=this.root;for(const part of name.split('/')){cursor=path.join(cursor,part);try{if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Links simbólicos não são permitidos.');}catch(e){if(e.code!=='ENOENT')throw e;}}return full;}
 async seed(){await fs.mkdir(this.root,{recursive:true});let total=0;for(const [name,content]of this.initial){if(typeof content!=='string'||Buffer.byteLength(content)>20000)throw Error('Arquivo de contexto excede o limite.');total+=Buffer.byteLength(content);if(total>80000||this.initial.size>32)throw Error('Contexto excede o limite.');const full=await this.file(name);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,content,{flag:'wx'});}}
 async list(){const names=[];const walk=async(dir,prefix='')=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Link detectado.');if(entry.isDirectory())await walk(path.join(dir,entry.name),name+'/');else{this.check(name);names.push(name);if(names.length>48)throw Error('Limite de arquivos.');}}};await walk(this.root);return names.sort();}
 async read(name){const content=await fs.readFile(await this.file(name),'utf8');if(Buffer.byteLength(content)>48000)throw Error('Arquivo excede o limite.');return {path:name,sha256:digest(content),content};}
 async write(name,content,expectedDigest){if(typeof content!=='string'||Buffer.byteLength(content)>20000)throw Error('Conteúdo excede o limite por arquivo.');const full=await this.file(name,true);let before=null;try{before=await fs.readFile(full,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}if((before===null?null:digest(before))!==expectedDigest)throw Error('A fonte mudou. Leia novamente antes de editar.');if(before===content)throw Error('O conteúdo proposto é idêntico ao atual. A alteração já está aplicada ou não teve efeito. Não repita esta edição; confira a fonte e valide a candidata.');await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,content);return {path:name,sha256:digest(content)};}
 async edit(name,before,after,expectedDigest){const old=await this.read(name);if(old.sha256!==expectedDigest)throw Error('A fonte mudou. Leia novamente antes de editar.');if(!before||old.content.split(before).length!==2)throw Error('O trecho precisa corresponder a uma única ocorrência literal.');return this.write(name,old.content.replace(before,()=>after),expectedDigest);}
 async editLines(name,startLine,endLine,content,expectedDigest){
  const old=await this.read(name);if(old.sha256!==expectedDigest)throw Error('A revisão mudou. Leia novamente antes de editar.');
  const lines=old.content.split('\n');
  if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<1||startLine>lines.length+1||endLine<startLine-1||endLine>lines.length||typeof content!=='string')throw Error('Intervalo inválido. Copie números inclusivos da leitura; para inserir, endLine=startLine-1.');
  lines.splice(startLine-1,endLine-startLine+1,...(content?content.split('\n'):[]));return this.write(name,lines.join('\n'),expectedDigest);
 }
 async patch(){const files=[];let bytes=0;for(const name of await this.list()){const {content}=await this.read(name);if(this.initial.get(name)!==content){this.check(name,true);files.push({path:name,content});bytes+=Buffer.byteLength(content);}}if(files.length>6||bytes>48000)throw Error('Divida a implementação: o patch excede seis arquivos ou 48 KB.');return {files};}
 async validate(final=false){if(!final&&++this.validations>4)throw Error('Limite de validações atingido.');const patch=await this.patch();const issues=[];for(const name of await this.list()){const {content}=await this.read(name);try{if(/\.json$/i.test(name))JSON.parse(content);if(/\.[cm]?[jt]sx?$/i.test(name)){const commonjs=/\.cjs$/i.test(name);const compiled=await transform(content,{loader:/\.tsx$/i.test(name)?'tsx':/\.ts$/i.test(name)?'ts':/\.jsx$/i.test(name)?'jsx':'js',format:commonjs?'cjs':'esm',sourcefile:name,logLevel:'silent'});await checkJavaScript(compiled.code,commonjs);}}catch(e){issues.push({path:name,message:(e.errors?.[0]?.text??e.message).slice(0,500)});}}
  // Bundle validates imports and JSX across the complete supplied candidate; no module is run.
  const names=await this.list();const entry=['src/main.jsx','src/main.tsx','src/index.jsx','src/index.tsx','index.js'].find(n=>names.includes(n));
  if(entry&&!issues.length)try{await build({absWorkingDir:this.root,entryPoints:[entry],outdir:'/tmp/sdlc-candidate-check',bundle:true,write:false,platform:'browser',jsx:'automatic',packages:'external',logLevel:'silent'});}catch(e){for(const error of e.errors??[])issues.push({path:error.location?.file??entry,message:error.text.slice(0,500)});}
  return {valid:issues.length===0,changedFiles:patch.files.map(f=>f.path),issues,scope:'Sintaxe e imports locais; não comprova comportamento nem testes de interface.'};
 }
 async invoke(name,args){if(++this.calls>40)throw Error('Limite total de ferramentas atingido.');if(typeof args.path==='string'&&args.path.startsWith(this.root+'/'))args={...args,path:args.path.slice(this.root.length+1)};const methods={list_files:()=>this.list(),read_file:()=>this.read(args.path),write_file:()=>this.write(args.path,args.content,args.expectedDigest),edit_file:()=>args.startLine!==undefined?this.editLines(args.path,args.startLine,args.endLine,args.content,args.expectedDigest):this.edit(args.path,args.before,args.after,args.expectedDigest),validate_candidate:()=>this.validate()};if(!methods[name])throw Error('Ferramenta não permitida.');try{const result=await methods[name]();this.events.push({tool:name,result:'SUCCEEDED',...(args.path?{path:args.path}:{})});return result;}catch(e){this.events.push({tool:name,result:'REJECTED',...(args.path?{path:args.path}:{})});throw e;}}
}

/** Small model-facing revisions are bound to the real path and SHA internally. */
export class RevisionEdits{
 constructor(workspace){this.workspace=workspace;this.revisions=new Map();this.identities=new Map();this.sequence=0;this.writes=Promise.resolve();}
 exclusive(action){const pending=this.writes.then(action,action);this.writes=pending.catch(()=>{});return pending;}
 relative(name){return name.startsWith(this.workspace.root+'/')?name.slice(this.workspace.root.length+1):name;}
 identify(file){const key=JSON.stringify([file.path,file.sha256]);let revision=this.identities.get(key);if(!revision){revision='r'+(++this.sequence);this.identities.set(key,revision);this.revisions.set(revision,{path:file.path,sha256:file.sha256,readLines:new Set()});}return {path:file.path,revision};}
 async read(path,{startLine,endLine,query}={}){
  const file=await this.workspace.invoke('read_file',{path}),identity=this.identify(file),lines=file.content.split('\n');let selected=[],limited=false;
  if(query!==undefined){
   if(typeof query!=='string'||!query.trim()||query.length>100||startLine!==undefined||endLine!==undefined)throw Error('Use query literal ou intervalo de linhas, sem misturar.');
   const matches=lines.flatMap((line,index)=>line.toLocaleLowerCase().includes(query.toLocaleLowerCase())?[index]:[]);limited=matches.length>3;
   for(const index of matches.slice(0,3))for(let at=Math.max(0,index-5);at<=Math.min(lines.length-1,index+5);at++)selected.push(at);
  }else if(startLine!==undefined||endLine!==undefined){
   if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<1||endLine<startLine||endLine>lines.length||endLine-startLine>=80)throw Error('Leia um intervalo inclusivo de até 80 linhas existentes.');
   selected=Array.from({length:endLine-startLine+1},(_,index)=>startLine-1+index);
  }else if(lines.length<=80&&file.content.length<=8000)selected=lines.map((_,index)=>index);
  else{
   const symbols=lines.flatMap((line,index)=>{const match=line.match(/\b(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/);return match?[{name:match[1],line:index+1}]:[];});
   return {...identity,lineCount:lines.length,complete:false,content:'',symbols:[...symbols.slice(0,12),...symbols.slice(12).slice(-12)],symbolsLimited:symbols.length>24,guidance:'Arquivo grande. Leia somente o trecho relevante com query literal (por exemplo nome da função) ou startLine/endLine. Nenhuma linha foi fornecida para edição nesta visão geral.'};
  }
  selected=[...new Set(selected)].sort((a,b)=>a-b);const expected=this.revisions.get(identity.revision);for(const index of selected)expected.readLines.add(index+1);
  return {...identity,lineCount:lines.length,complete:selected.length===lines.length,matchesLimited:limited,lineFormat:'number|original line; numbers are not code',content:selected.map(index=>`${index+1}|${lines[index]}`).join('\n'),guidance:selected.length?'Edite somente intervalos lidos nesta revisão. Após alterar, leia o trecho atualizado antes de outra edição.':'Sem ocorrência. Use outra query ou um intervalo; nenhum trecho pode ser editado com esta resposta.'};
 }
 edit(path,startLine,endLine,content,revision){return this.exclusive(async()=>{
  path=this.relative(path);const expected=this.revisions.get(revision);
  if(!expected||expected.path!==path)throw Error('Revisão desconhecida ou de outro arquivo. Use a revisão curta devolvida por read_file para este caminho.');
  if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<1||endLine<startLine-1)throw Error('Intervalo inválido. Use números inclusivos da leitura atual.');
  if(endLine-startLine+1>80)throw Error('Intervalo não lido nesta revisão. Leia até 80 linhas por vez.');
  const required=endLine<startLine?[]:Array.from({length:endLine-startLine+1},(_,index)=>startLine+index);
  if(endLine<startLine?!expected.readLines.has(startLine)&&!expected.readLines.has(startLine-1):required.some(line=>!expected.readLines.has(line)))throw Error('Intervalo não lido nesta revisão. Leia o trecho atual por query ou startLine/endLine antes de editar.');
  const written=await this.workspace.invoke('edit_file',{path,startLine,endLine,content,expectedDigest:expected.sha256});return this.identify(written);
 });}
 write(path,content,revision){return this.exclusive(async()=>{
  if(revision!==null)throw Error('write_file cria somente arquivo novo, com revision=null. Para arquivo existente use edit_file com linhas e revisão curta.');
  return this.identify(await this.workspace.invoke('write_file',{path,content,expectedDigest:null}));
 });}
}
