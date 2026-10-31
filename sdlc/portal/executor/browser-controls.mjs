// IDs refer only to controls observed in the current accessibility snapshot.
const normalized=value=>value.trim().replace(/:\s*$/u,'').replace(/\s+/gu,' ').toLocaleLowerCase();
const label=token=>{try{return JSON.parse(token);}catch{return null;}};
const roles=new Set(['textbox','spinbutton','combobox','button','checkbox','link','img']);
export class ControlRegistry{
 constructor(){this.known=new Map();this.active=new Map();this.sequence=0;}
 update(snapshot){
  this.active.clear();const controls=[],counts=new Map(),headings=new Map(),rows=[];let current=null,limited=false;
  for(const line of snapshot.split('\n')){
   const indent=line.length-line.trimStart().length,trim=line.trim();
   while(rows.length&&indent<=rows.at(-1).indent)rows.pop();
   const item=trim.match(/^- listitem(?::\s*(.*))?$/u);if(item){rows.push({indent,name:(item[1]??'').slice(0,100)});current=null;continue;}
   if(rows.length&&!rows.at(-1).name){const text=trim.match(/^- (?:strong|text):\s*(.*)$/u);if(text)rows.at(-1).name=text[1].slice(0,100);}
   const match=trim.match(/^- (heading|textbox|spinbutton|combobox|button|checkbox|link|img|option)(?:\s+("(?:\\.|[^"\\])*"))?/u);if(!match)continue;
   const role=match[1],name=match[2]?label(match[2]):'';if(name===null||name.length>160)continue;
   if(role==='heading'){const level=Number(trim.match(/\[level=(\d)\]/u)?.[1]??2);for(const key of headings.keys())if(key>=level)headings.delete(key);headings.set(level,name);current=null;continue;}
   if(role==='option'){if(current?.role==='combobox'&&indent>current.indent){if(current.options.length<32)current.options.push(name);else limited=true;if(trim.includes('[selected]'))current.selected=name;}continue;}
   if(!roles.has(role)||(!name&&role!=='textbox'))continue;
   const countKey=JSON.stringify([role,normalized(name)]),index=counts.get(countKey)??0;counts.set(countKey,index+1);if(index>5){limited=true;continue;}
   const section=[...headings.values(),...(rows.at(-1)?.name?[rows.at(-1).name]:[])].join(' › ').slice(0,250);
   const key=JSON.stringify([role,normalized(name),index,section]);let id=this.known.get(key);
   if(!id){if(this.sequence>=512)throw Error('Limite de identidades de controles; reduza o cenário.');id='c'+(++this.sequence);this.known.set(key,id);}
   const rest=trim.slice(match[0].length).trim(),rawValue=rest.startsWith(':')?rest.slice(1).trim():'';
   const value=rawValue.startsWith('"')?(label(rawValue)??rawValue):rawValue;
   const entry={id,role,name,section,index,...(['textbox','spinbutton'].includes(role)?{value:value.slice(0,500)}:{}),...(role==='checkbox'?{checked:rest.includes('[checked]')}:{}),...(role==='combobox'?{options:[],selected:''}:{}),indent};current=entry;
   if(controls.length>=64){limited=true;continue;}controls.push(entry);this.active.set(id,entry);
  }
  return {controls:controls.map(({indent,...entry})=>entry),limited};
 }
 step(action){
  if(!action||Object.keys(action).some(key=>!['op','control','value','dialog'].includes(key))||typeof action.op!=='string'||typeof action.control!=='string'||typeof action.value!=='string'||action.value.length>500||!['none','accept','dismiss'].includes(action.dialog))throw Error('Ação de UI fora do contrato.');
  if(action.op==='reload'){if(action.control||action.value||action.dialog!=='none')throw Error('Reload não recebe controle ou valor.');return {op:'reload'};}
  if(action.op==='expect_text'){if(action.control||!action.value.trim()||action.dialog!=='none')throw Error('Asserção de texto exige apenas value.');return {op:'expect_text',value:action.value};}
  const entry=this.active.get(action.control);if(!entry)throw Error('Controle não observado ou desatualizado. Escolha um ID da observação atual.');
  const allowed={fill:['textbox','spinbutton'],select:['combobox'],click:['button','link'],check:['checkbox'],expect_image:['img']};
  if(!allowed[action.op]?.includes(entry.role))throw Error('A operação não corresponde ao controle observado.');
  if(!['fill','select'].includes(action.op)&&action.value)throw Error('Esta ação não recebe value.');
  if(action.op==='select'&&!entry.options.includes(action.value))throw Error('Opção ainda não existe. Cadastre o pré-requisito pela UI ou escolha uma opção observada.');
  if(action.dialog!=='none'&&action.op!=='click')throw Error('Diálogo permitido somente em clique.');
  return {op:action.op,target:{by:'role',role:entry.role,name:entry.name,index:entry.index},...(['fill','select'].includes(action.op)?{value:action.value}:{}),...(action.dialog!=='none'?{dialog:action.dialog}:{})};
 }
}
