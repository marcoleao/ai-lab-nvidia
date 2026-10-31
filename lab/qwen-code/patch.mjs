// Applies model-proposed data in a frozen workspace. Never runs project code.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {Workspace} from './workspace.mjs';
import {parse,parseExpression} from '@babel/parser';
const file=z.object({path:z.string(),content:z.string()}).strict();
const identity={path:z.string(),content:z.string().max(6000),expectedDigest:z.string().regex(/^[a-f0-9]{64}$/)};
const edit=z.union([z.object({...identity,startLine:z.number().int().min(1),endLine:z.number().int().min(0)}).strict(),z.object({...identity,slot:z.string().regex(/^s\d+$/)}).strict(),z.object({path:z.string(),slot:z.string().regex(/^s\d+$/),pattern:z.string().min(1).max(1500),flags:z.string().max(8),expectedDigest:identity.expectedDigest}).strict(),z.object({path:z.string(),slot:z.string().regex(/^s\d+$/),text:z.string().max(2000),expectedDigest:identity.expectedDigest}).strict(),z.object({path:z.string(),slot:z.string().regex(/^s\d+$/),locale:z.string().min(2).max(64),expectedDigest:identity.expectedDigest}).strict()]);
const request=z.object({expectedSha:z.string().regex(/^[a-f0-9]{40}$/),files:z.array(file).max(32),allowDependencies:z.boolean(),writePaths:z.array(z.string()).max(2).nullable(),edits:z.array(edit).min(1).max(3)}).strict();
const inspection=z.object({expectedSha:z.string().regex(/^[a-f0-9]{40}$/),files:z.array(file).max(32),inspectPath:z.string()}).strict();
function dialogNode(node){return node.type==='ArrowFunctionExpression'&&node.body.type==='CallExpression'?node.body:node;}
function dialogCall(node){
 const call=dialogNode(node);if(call.type!=='CallExpression'||call.arguments[0]?.type!=='StringLiteral')return null;
 const callee=call.callee,name=callee.type==='Identifier'?callee.name:callee.type==='MemberExpression'&&!callee.computed&&['window','globalThis'].includes(callee.object?.name)?callee.property?.name:null;
 return ['alert','confirm','prompt'].includes(name)?{name,text:call.arguments[0].value}:null;
}
// Locale-only formatting preserves receiver, precision and surrounding prefixes.
// No currency/style/grouping/code capability is granted to this data role.
function numericCall(node){
 const call=dialogNode(node),callee=call.callee;
 return call.type==='CallExpression'&&callee?.type==='MemberExpression'&&!callee.computed&&callee.property.name==='toFixed'&&call.arguments.length===1&&call.arguments[0].type==='NumericLiteral'&&Number.isInteger(call.arguments[0].value)&&call.arguments[0].value>=0&&call.arguments[0].value<=20?{call,precision:call.arguments[0].value}:null;
}
export function missingComponents(content,name){
 const ast=parse(content,{sourceType:'unambiguous',plugins:[...(/\.[cm]?tsx?$/.test(name)?['typescript']:[]),...(/\.[jt]sx$/.test(name)?['jsx']:[])]}),declared=new Set(),used=new Set();
 function bind(node){if(!node)return;if(node.type==='Identifier')declared.add(node.name);else if(node.type==='ObjectPattern')node.properties.forEach(p=>bind(p.value??p.argument));else if(node.type==='ArrayPattern')node.elements.forEach(bind);else if(node.type==='RestElement')bind(node.argument);else if(node.type==='AssignmentPattern')bind(node.left);}
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'||['FunctionDeclaration','FunctionExpression','ClassDeclaration'].includes(node.type))bind(node.id);if(['ImportSpecifier','ImportDefaultSpecifier','ImportNamespaceSpecifier'].includes(node.type))bind(node.local);if(node.params)node.params.forEach(bind);if(node.type==='JSXOpeningElement'&&node.name.type==='JSXIdentifier'&&/^[A-Z]/.test(node.name.name))used.add(node.name.name);for(const [key,value]of Object.entries(node))if(!['loc','extra','comments'].includes(key)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'&&value.type)walk(value);}}
 walk(ast);return [...used].filter(name=>!declared.has(name)).sort();
}
/** Source positions are UTF-16 offsets from the parser and are never model input. */
export function sourceSlots(content,name){
 const ast=parse(content,{sourceType:'unambiguous',plugins:[...( /\.[cm]?tsx?$/.test(name)?['typescript']:[]),...(/\.[jt]sx$/.test(name)?['jsx']:[])],errorRecovery:false});
 const result=[],ranges=new Set();
 const kinds=new Set(['BinaryExpression','LogicalExpression','ConditionalExpression','CallExpression','OptionalCallExpression','RegExpLiteral','ImportDeclaration','JSXElement','JSXSelfClosingElement','ArrowFunctionExpression']);
 function walk(node,binding='',parent=null){
  if(!node||typeof node!=='object')return;
  if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier')binding=node.id.name;
  if((node.type==='FunctionDeclaration'||node.type==='FunctionExpression')&&node.id?.name)binding=node.id.name;
  const length=node.end-node.start,key=node.start+':'+node.end;
  const boundary=parent&&(parent.type==='JSXExpressionContainer'||parent.type==='ReturnStatement'||parent.type==='ExpressionStatement'||(parent.type==='ArrowFunctionExpression'&&parent.body===node)||(parent.type==='VariableDeclarator'&&parent.init===node));
  const structural=['ImportDeclaration','RegExpLiteral','JSXElement','JSXSelfClosingElement','ArrowFunctionExpression'].includes(node.type);
  if(kinds.has(node.type)&&(structural||boundary)&&length>0&&length<=1500&&!ranges.has(key)){
   ranges.add(key);result.push({slot:'s'+(result.length+1),kind:node.type,binding,line:node.loc.start.line,code:content.slice(node.start,node.end),...(node.type==='RegExpLiteral'?{pattern:node.pattern,flags:node.flags}:{}),...(dialogCall(node)?{dialog:dialogCall(node)}:{}),...(numericCall(node)?{numeric:{precision:numericCall(node).precision}}:{}),before:content.slice(Math.max(0,node.start-90),node.start),after:content.slice(node.end,node.end+90),start:node.start,end:node.end});
  }
  for(const [key,value]of Object.entries(node))if(!['loc','extra','comments','tokens','leadingComments','trailingComments','innerComments'].includes(key)){if(Array.isArray(value))value.forEach(n=>walk(n,binding,node));else if(value&&typeof value==='object'&&value.type)walk(value,binding,node);}
 }
 walk(ast);
 for(const slot of result)slot.contains=result.filter(other=>other!==slot&&other.start>=slot.start&&other.end<=slot.end).map(other=>other.slot);
 const imports=ast.program.body.filter(n=>n.type==='ImportDeclaration'),at=imports.at(-1)?.end??0;
 result.unshift({slot:'s0',kind:'ImportInsertion',binding:'imports',line:1,code:'',before:content.slice(Math.max(0,at-90),at),after:content.slice(at,at+90),start:at,end:at,contains:[]});return result;
}
export async function inspectCandidate(raw,root){
 const input=inspection.parse(raw),workspace=new Workspace(root,input.files);await workspace.seed();const source=await workspace.read(input.inspectPath),slots=sourceSlots(source.content,input.inspectPath);
 return {state:'inspected',expectedSha:input.expectedSha,path:input.inspectPath,expectedDigest:source.sha256,slots:slots.slice(0,160).map(({start,end,...slot})=>slot),complete:slots.length<=160,totalSlots:slots.length};
}
export async function applyCandidate(raw,root){
 let input,workspace;
 try{
  input=request.parse(raw);workspace=new Workspace(root,input.files,{dependencies:input.allowDependencies,writePaths:input.writePaths});await workspace.seed();
  if(new Set(input.edits.map(e=>e.path)).size!==1)throw Error('Uma microproposta altera somente um arquivo.');
  const source=await workspace.read(input.edits[0].path);
  if(input.edits.some(e=>'slot' in e)){
   if(input.edits.some(e=>!('slot' in e)))throw Error('Não misture linhas e trechos sintáticos.');
   const slots=sourceSlots(source.content,source.path),edits=input.edits.map(e=>{
    const slot=slots.find(s=>s.slot===e.slot);if(!slot||slot.slot.slice(1)>159)throw Error('Trecho não observado.');if(e.expectedDigest!==source.sha256)throw Error('A fonte da proposta mudou.');
    let content=e.content;
    if('pattern'in e){if(slot.kind!=='RegExpLiteral'||e.flags!==slot.flags)throw Error('O perfil de padrões altera somente o literal RegExp observado, preservando flags.');content=new RegExp(e.pattern,e.flags).toString();}
    if('text'in e){
     const node=parseExpression(slot.code,{plugins:['jsx']});if(!dialogCall(node))throw Error('O perfil de mensagens exige uma chamada de diálogo com texto literal observado.');const argument=dialogNode(node).arguments[0];content=slot.code.slice(0,argument.start)+JSON.stringify(e.text)+slot.code.slice(argument.end);
    }
    if('locale'in e){
     const node=parseExpression(slot.code),numeric=numericCall(node);
     if(!numeric)throw Error('O perfil de localidade exige toFixed com precisão literal observada.');
     const locales=Intl.getCanonicalLocales(e.locale);
     if(locales.length!==1||Intl.NumberFormat.supportedLocalesOf(locales).length!==1)throw Error('Localidade de número indisponível.');
     const {call,precision}=numeric,receiver=slot.code.slice(call.callee.object.start,call.callee.object.end);
     const replacement='('+receiver+').toLocaleString('+JSON.stringify(locales[0])+',{minimumFractionDigits:'+precision+',maximumFractionDigits:'+precision+',useGrouping:false})';
     content=slot.code.slice(0,call.start)+replacement+slot.code.slice(call.end);
    }
    if(['ImportInsertion','ImportDeclaration'].includes(slot.kind)){
     if(!parse(content,{sourceType:'module'}).program.body.every(n=>n.type==='ImportDeclaration'))throw Error('O trecho de imports aceita apenas declarações import.');
    }else{
     const options={plugins:[...( /\.[cm]?tsx?$/.test(source.path)?['typescript']:[]),...(/\.[jt]sx$/.test(source.path)?['jsx']:[])]};
     let expression;try{expression=parseExpression(content,options);}catch{
      // Models commonly terminate an expression with a semicolon. Accept one
      // expression statement, never an entire program or a declaration.
      try{const program=parse(content,{...options,sourceType:'module'}).program;if(program.body.length!==1||program.directives.length||program.body[0].type!=='ExpressionStatement')throw Error();expression=program.body[0].expression;content=content.slice(expression.start,expression.end);}catch{throw Error('O trecho '+slot.kind+' exige somente uma expressão completa, sem arquivo, declaração ou delimitadores externos.');}
     }
     if(slot.kind==='RegExpLiteral'&&expression.type!=='RegExpLiteral')throw Error('RegExpLiteral exige somente o padrão; use o perfil de expressões regulares.');
    }
    return {...e,content,start:slot.start,end:slot.end};
   }).sort((a,b)=>a.start-b.start);
   for(let i=1;i<edits.length;i++)if(edits[i].start<edits[i-1].end)throw Error('Trechos sobrepostos.');
   let changed=source.content;for(const e of edits.reverse())changed=changed.slice(0,e.start)+e.content+changed.slice(e.end);
   await workspace.invoke('write_file',{path:source.path,content:changed,expectedDigest:source.sha256});
  }else{
  const ordered=[...input.edits].sort((a,b)=>a.startLine-b.startLine);
  for(let index=0;index<ordered.length;index++){
   const e=ordered[index],source=await workspace.read(e.path),lines=source.content.split('\n').length;
   if(source.sha256!==e.expectedDigest)throw Error('A fonte da proposta mudou. Nenhuma proposta pode escolher outra revisão.');
   if(e.startLine>lines+1||e.endLine<e.startLine-1||e.endLine>lines||e.endLine-e.startLine+1>80)throw Error('Intervalo da microproposta inválido.');
   if(index&&(e.startLine<=ordered[index-1].endLine||e.startLine===ordered[index-1].startLine))throw Error('Intervalos sobrepostos.');
  }
  for(const e of ordered.reverse()){
   const current=await workspace.read(e.path);await workspace.invoke('edit_file',{...e,expectedDigest:current.sha256});
  }
  }
  const validation=await workspace.invoke('validate_candidate',{});
  if(!validation.valid)return {state:'failed',expectedSha:input.expectedSha,validation,tools:workspace.events,error:'A proposta não passou em sintaxe/imports.'};
  const final=await workspace.read(input.edits[0].path);
  return {state:'succeeded',expectedSha:input.expectedSha,patch:await workspace.patch(),validation,missingComponents:missingComponents(final.content,final.path),tools:workspace.events};
 }catch(error){return {state:'failed',expectedSha:input?.expectedSha??raw?.expectedSha,error:String(error.message).slice(0,1500),tools:workspace?.events??[]};}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const input=JSON.parse(await fs.readFile('/request/patch.json','utf8'));
 process.stdout.write(JSON.stringify(input.inspectPath?await inspectCandidate(input,'/workspace'):await applyCandidate(input,'/workspace'))+'\n');
}
