// Data-only adapter. No locator, script, network or application is run here.
const operations=['fill','click','select','check','expect_text','expect_visible','expect_image','reload'];
export function normalizeUiSteps(steps){
 if(!Array.isArray(steps)||!steps.length||steps.length>20||JSON.stringify(steps).length>8000)throw Error('Use steps com 1 a 20 passos e até 8 KB.');
 const normalized=steps.map((step,index)=>{
  const fail=message=>{throw Error(`Passo ${index+1}: ${message}`);};
  if(!step||typeof step!=='object'||Array.isArray(step))fail('informe um objeto com op, name e value quando aplicável.');
  const unknown=Object.keys(step).filter(key=>!['op','name','value','index','dialog'].includes(key));
  if(unknown.length)fail(`campo(s) não permitido(s): ${unknown.join(', ')}. Use somente op, name, value, index e dialog; não use target, by, role ou text.`);
  if(!operations.includes(step.op))fail('op deve ser '+operations.join(', '));
  const named=!['expect_text','reload'].includes(step.op);
  const unnamed=step.op==='fill'&&step.name===''&&Number.isInteger(step.index)&&step.index>=0&&step.index<=5;
  if(named&&!unnamed&&(typeof step.name!=='string'||!step.name.trim()||step.name.length>160))fail('informe name com o rótulo acessível real; somente fill de textbox sem nome admite name vazio com index explícito.');
  if(!named&&step.name!==undefined)fail('esta operação não usa name.');
  const valued=['fill','select','expect_text'].includes(step.op);
  if(valued&&(typeof step.value!=='string'||step.value.length>500))fail('informe value como texto, inclusive para números: "0".');
  if(!valued&&step.value!==undefined)fail('esta operação não usa value.');
  if(step.op==='expect_text'&&!step.value.trim())fail('a asserção exige texto não vazio em value.');
  if(step.index!==undefined&&(!named||!Number.isInteger(step.index)||step.index<0||step.index>5))fail('index só pode identificar um controle de 0 a 5.');
  if(step.dialog!==undefined&&(step.op!=='click'||!['accept','dismiss'].includes(step.dialog)))fail('dialog só vale para click: accept ou dismiss.');
  if(step.op==='reload'&&Object.keys(step).length!==1)fail('reload usa somente op.');
  if(step.op==='reload'||step.op==='expect_text')return step;
  const by=unnamed||step.op==='select'?'role':['fill','check'].includes(step.op)?'label':step.op==='expect_visible'?'text':'role';
  const target={by,name:step.name,...(by==='role'?{role:unnamed?'textbox':step.op==='select'?'combobox':step.op==='click'?'button':'img'}:{}),...(step.index!==undefined?{index:step.index}:{})};
  return {op:step.op,target,...(valued?{value:step.value}:{}),...(step.dialog?{dialog:step.dialog}:{})};
 });
 if(!normalized.some(step=>step.op.startsWith('expect_')))throw Error('Inclua uma asserção: por exemplo {op:"expect_text",value:"R$ 0,00"}.');
 return normalized;
}
