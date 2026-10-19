/* Planning UI uses text nodes only. Credentials remain in HttpOnly sessions. */
let backlogRows=[], editingItem=null;
const kindLabels={outcome:'Outcome',epic:'Épico',story:'História'};

async function durableCommand(path,method,body){
  const signature=JSON.stringify([path,method,body]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
  const storageKey='sdlc-command-'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  let key=sessionStorage.getItem(storageKey);
  if(!key){key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);}
  const result=await api(path,{method,body:JSON.stringify(body),headers:{'Idempotency-Key':key}});
  sessionStorage.removeItem(storageKey);
  return result;
}
function backlogParents(){
  const kind=$('item-kind').value,previous=$('item-parent').value;
  $('item-parent').replaceChildren();
  if(kind==='outcome'){const option=node('option','Sem pai — resultado do projeto');option.value='';$('item-parent').append(option);}
  else for(const row of backlogRows.filter(row=>row.kind===(kind==='epic'?'outcome':'epic'))){const option=node('option',`${row.item_key} · ${row.payload.title}`);option.value=row.id;$('item-parent').append(option);}
  if(Array.from($('item-parent').options).some(option=>option.value===previous))$('item-parent').value=previous;
  $('item-parent').required=kind!=='outcome';$('item-measure').required=kind==='outcome';$('item-criteria').required=kind==='story';
}
function resetItemEditor(){
  editingItem=null;$('item-form').reset();$('item-kind').disabled=false;$('item-parent').disabled=false;
  $('item-editor-title').textContent='Propor item de planejamento';$('save-item').textContent='Publicar proposta';$('cancel-item-edit').hidden=true;backlogParents();
}
function editBacklogItem(row){
  resetItemEditor();editingItem=row;
  $('item-kind').value=row.kind;backlogParents();$('item-parent').value=row.parent_id||'';
  $('item-kind').disabled=true;$('item-parent').disabled=true;
  $('item-title').value=row.payload.title;$('item-description').value=row.payload.description;
  $('item-measure').value=row.payload.measure;$('item-criteria').value=row.payload.criteria.join('\n');
  $('item-editor-title').textContent=`Nova versão de ${row.item_key} · atual v${row.version}`;
  $('save-item').textContent='Publicar nova versão';$('cancel-item-edit').hidden=false;$('item-title').focus();
}
function renderBacklog(data){
  backlogRows=[...data.items].sort((a,b)=>['outcome','epic','story'].indexOf(a.kind)-['outcome','epic','story'].indexOf(b.kind)||a.item_key.localeCompare(b.item_key));const canWrite=['manager','contributor'].includes(role);
  $('backlog-list').replaceChildren();$('item-form').hidden=!canWrite||!data.configured;
  $('reconcile-backlog').hidden=role!=='manager'||!data.configured;
  $('backlog-status').textContent=!data.configured?'Integração de backlog ainda não configurada.':data.scope?`Escopo v${data.scope.version}. A decisão verifica a fonte novamente; uma aprovação de escopo não inicia agentes.`:'Comece por um outcome com meta mensurável.';
  for(const row of backlogRows){
    const el=card($('backlog-list'),`${row.item_key} · ${row.payload.title}`,`${kindLabels[row.kind]} · v${row.version}`);
    const parent=backlogRows.find(item=>item.id===row.parent_id);
    if(parent)el.append(node('p',`Vinculado a ${parent.item_key}`));
    el.append(node('p',row.payload.description));
    if(row.payload.measure)el.append(node('p',`Meta: ${row.payload.measure}`));
    if(row.payload.criteria.length){const list=node('ul');for(const criterion of row.payload.criteria)list.append(node('li',criterion));el.append(list);}
    el.append(node('small',`Issue ${row.source_issue} · ${row.source_state==='verified'?'Snapshot conferido na publicação ou reconciliação':'Fonte divergente — nova revisão necessária'}`));
    if(canWrite)action(el,'Propor nova versão',async()=>editBacklogItem(row));
    action(el,'Consultar versões',async()=>{const history=await api(`/v1/projects/${project}/work-items/${row.id}/versions`);let details=el.querySelector('.version-history');if(!details){details=node('div',undefined,'version-history');el.append(details);}details.replaceChildren();for(const version of history){const block=node('details');block.append(node('summary',`Versão ${version.version} · issue ${version.source_issue}`),node('p',version.payload.title),node('p',version.payload.description),node('p',version.payload.measure));for(const criterion of version.payload.criteria)block.append(node('p',criterion));details.append(block);}});
  }
  empty($('backlog-list'));resetItemEditor();
}
$('item-kind').addEventListener('change',backlogParents);
$('cancel-item-edit').addEventListener('click',resetItemEditor);
$('item-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('save-item');button.disabled=true;const selected=project;
  try{
    const body={kind:$('item-kind').value,parent_id:$('item-parent').value||null,title:$('item-title').value.trim(),description:$('item-description').value.trim(),measure:$('item-measure').value.trim(),criteria:$('item-criteria').value.split('\n').map(value=>value.trim()).filter(Boolean)};
    let path=`/v1/projects/${selected}/work-items`,method='POST';
    if(editingItem){body.expected_version=editingItem.version;path+=`/${editingItem.id}`;method='PUT';}
    await durableCommand(path,method,body);if(selected===project){await loadProject();notice('Proposta publicada no backlog. Revise a nova versão do escopo antes de aprovar.');}
  }catch(error){notice(error.message);}finally{button.disabled=false;}
});
$('reconcile-backlog').addEventListener('click',async()=>{const button=$('reconcile-backlog');button.disabled=true;try{await durableCommand(`/v1/projects/${project}/backlog/reconcile`,'POST',{});await loadProject();notice('Fonte conferida. Divergências bloqueiam a aprovação até uma nova proposta.');}catch(error){notice(error.message);}finally{button.disabled=false;}});
$('project-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const created=await durableCommand('/v1/projects','POST',{name:$('project-name').value.trim()});project=created.id;$('project-form').reset();await load();notice('Projeto de planejamento criado. Comece pelo outcome.');}catch(error){notice(error.message);}finally{button.disabled=false;}});
