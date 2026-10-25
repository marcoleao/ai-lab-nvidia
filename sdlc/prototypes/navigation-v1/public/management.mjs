// Simulação de formulários. Não possui transporte, APIs ou persistência real.
export function management({entities,getMemory,save,render,esc,routeFor}){
  const seed=structuredClone(entities),labels={system:'Sistema',project:'Projeto',epic:'Épico',story:'História',task:'Tarefa'},next={system:'project',project:'epic',epic:'story',story:'task'};
  const find=id=>entities.find(i=>i.id===id);
  const route=()=>location.hash.slice(2).split('?')[0].split('/');
  const persist=()=>{getMemory().entityRecords=structuredClone(entities);save();};
  if(Array.isArray(getMemory().entityRecords))entities.splice(0,entities.length,...getMemory().entityRecords);
  const chain=item=>{const result=[];while(item){result.unshift(item);item=find(item.parentId);}return result;};
  const below=item=>entities.filter(i=>chain(i).some(p=>p.id===item.id));
  const target=()=>find(route()[2]);
  const manageLink=(mode,item)=>`#/manage/${mode}/${item?.id||'root'}`;
  const back=item=>item?routeFor(item):'#/systems';
  const title=mode=>({create:'Criar',edit:'Editar',archive:'Arquivar',approve:'Aprovar planejamento de',state:'Atualizar situação de',prerequisites:'Pré-requisitos de'}[mode]||'Consultar');
  function page(){const [,mode]=route(),item=target(),kind=mode==='create'?(item?next[item.kind]:'system'):item?.kind;
    if(!kind||item?.archived)return '<section class="card"><h1>Item indisponível nesta simulação</h1><a href="#/systems">Voltar a Sistemas</a></section>';
    const name=labels[kind],returnTo=back(item);
    let fields='';
    if(['create','edit'].includes(mode))fields=`<div class="form-field"><label for="item-name">Nome ou título</label><input id="item-name" name="name" maxlength="120" required value="${mode==='edit'?esc(item.name):''}"></div>${mode==='create'&&['system','project'].includes(kind)?'<div class="form-field"><label for="item-key">Chave</label><input id="item-key" name="key" pattern="[A-Z][A-Z0-9]{1,11}" required minlength="2" maxlength="12"><small>2 a 12 letras maiúsculas ou números; comece por letra.</small></div>':''}<div class="form-field"><label for="item-description">Descrição</label><textarea id="item-description" name="description" rows="4" maxlength="4000">${mode==='edit'?esc(item.description):''}</textarea></div>${['project','story','task'].includes(kind)?'<p class="notice">A seleção de repositórios deste formulário permanece pendente de representação. Ela será preservada na interface integrada. Este exemplo não associa componentes.</p>':''}`;
    if(mode==='archive')fields=`<div class="archive-preview"><h2>Confirme o alcance</h2><p>Serão retirados das listas ativas <strong>${below(item).filter(i=>!i.archived).length} item(ns)</strong>, incluindo este e seus descendentes.</p><ul>${below(item).filter(i=>!i.archived).map(i=>`<li>${labels[i.kind]}: ${esc(i.name)}</li>`).join('')}</ul><p><strong>Os repositórios e ambientes serão preservados.</strong> Nesta simulação, apenas os registros locais do navegador serão marcados como arquivados.</p></div><label class="check-label"><input type="checkbox" required>Entendi o alcance do arquivamento simulado.</label>`;
    if(mode==='approve')fields=`<div class="approval-summary"><h2>Aprovação de planejamento</h2><p>Esta decisão aprova o ${name.toLowerCase()}. Ela não inicia a execução de uma História nem substitui a aprovação G1.</p>${item.kind==='epic'&&find(item.parentId)?.status!=='approved'?'<p role="alert">Aprove o Projeto antes de aprovar este Épico.</p>':''}</div><label class="check-label"><input type="checkbox" required>Revisei e confirmo a aprovação de planejamento simulada.</label>`;
    if(mode==='state'){
      const current=item.kind==='project'?item.lifecycle||'planned':item.status;
      const choices=item.kind==='project'?(current==='planned'?['active','cancelled']:current==='active'?['completed','cancelled']:current==='completed'?['active']:['planned']):current==='todo'?['doing']:current==='doing'?['todo','done']:['doing'];
      fields=`<p>Situação atual: <strong>${current.toUpperCase()}</strong>. ${item.kind==='project'?'Aprovação e ciclo do Projeto são independentes.':'A Tarefa mantém seu próprio status; isso não conclui a História.'}</p><div class="form-field"><label for="next-status">Próxima situação</label><select id="next-status" name="status">${choices.map(v=>`<option value="${v}">${v.toUpperCase()}</option>`).join('')}</select></div>${['completed','cancelled','done'].includes(current)?'<div class="form-field"><label for="reopen-comment">Justificativa para reabrir</label><textarea id="reopen-comment" name="comment" minlength="10" maxlength="2000" required></textarea><small>Mínimo de 10 caracteres.</small></div>':''}<p>O exemplo preserva os pré-requisitos: iniciar requer Projeto aprovado; concluir requer ao menos um Épico e todos em DONE.</p>`;
    }
    if(mode==='prerequisites')fields='<h2>Antes de preparar a execução</h2><ul><li>Projeto e Épico aprovados.</li><li>Critérios de aceite definidos.</li><li>Repositório do Sistema associado e disponível.</li></ul><p>As associações e o início da execução ainda estão pendentes nesta simulação. Criar uma História manualmente não deve gerar código automaticamente.</p>';
    const blocked=mode==='approve'&&(item.status==='approved'||(item.kind==='epic'&&find(item.parentId)?.status!=='approved'));
    return `<header class="page-header"><div><p class="eyebrow">FORMULÁRIO · SIMULAÇÃO LOCAL</p><h1 tabindex="-1">${title(mode)} ${name.toLowerCase()}</h1><p>${mode==='create'?item?`Dentro de ${labels[item.kind]}: ${esc(item.name)}`:'Novo Sistema de exemplo':esc(item.name)}</p></div></header><section class="card form-card"><p class="form-context">Nenhuma API será chamada. O resultado ficará apenas nesta aba do navegador.</p><form id="management-form" class="prototype-form" data-mode="${mode}"><div id="management-error" role="alert"></div>${fields}<div class="form-actions"><a class="button secondary" href="${returnTo}">Cancelar e voltar</a>${mode==='prerequisites'?'':`<button class="button ${mode==='archive'?'danger':'primary'}" ${blocked?'disabled':''}>${mode==='create'?'Criar':mode==='edit'?'Salvar alterações':mode==='archive'?'Confirmar arquivamento':mode==='approve'?'Confirmar aprovação':'Confirmar situação'} · simulação</button>`}</div></form></section>`;
  }
  function enhance(item){const r=route();
    if(r[0]==='manage'){const t=target();document.querySelector('#breadcrumbs').innerHTML=`<a href="#/systems">Sistemas</a>${t?chain(t).map(i=>`<span>/</span><a href="${routeFor(i)}">${esc(i.name)}</a>`).join(''):''}<span>/</span><span aria-current="page">${title(r[1])}</span>`;return;}
    if(item&&!item.archived){document.querySelector('.page-header')?.insertAdjacentHTML('beforeend',`<details class="manage-menu"><summary class="button secondary">Gerenciar ${labels[item.kind].toLowerCase()}</summary><div class="manage-menu-list"><a href="${manageLink('edit',item)}">Editar dados</a>${['project','task'].includes(item.kind)?`<a href="${manageLink('state',item)}">${item.kind==='project'?'Ciclo do Projeto':'Status da Tarefa'}</a>`:''}<a class="danger" href="${manageLink('archive',item)}">Arquivar</a></div></details>`);
      if(['project','epic'].includes(item.kind)&&['awaiting_approval','todo'].includes(item.status))document.querySelector('.page-header').insertAdjacentHTML('afterend',`<section class="card approval-summary"><p class="eyebrow">SITUAÇÃO DO PLANEJAMENTO</p><h2>Aguardando aprovação de ${labels[item.kind].toLowerCase()}</h2><p>Esta aprovação não inicia código nem implantação.</p><a class="button primary" href="${manageLink('approve',item)}">Revisar aprovação</a></section>`);
    }
    const list=document.querySelector('.list-card .section-heading');if(list&&(!item||next[item.kind]))list.insertAdjacentHTML('beforeend',`<a class="button secondary" href="${manageLink('create',item)}">Criar ${labels[item?next[item.kind]:'system'].toLowerCase()}</a>`);
    const receipt=getMemory().receipt;if(receipt&&receipt.itemId===(item?.id||'root'))document.querySelector('.page-header')?.insertAdjacentHTML('afterend',`<p class="prototype-receipt" role="status">${esc(receipt.message)} · somente nesta simulação.</p>`);
  }
  document.addEventListener('submit',event=>{if(event.target.id!=='management-form')return;event.preventDefault();const mode=event.target.dataset.mode,item=target(),form=new FormData(event.target),kind=mode==='create'?(item?next[item.kind]:'system'):item?.kind;const fail=message=>{const area=document.querySelector('#management-error');area.textContent=message;area.tabIndex=-1;area.focus();};let destination=item;
    if(mode==='create'||mode==='edit'){
      const name=String(form.get('name')||'').trim();if(!name)return fail('Informe o nome ou título.');
      if(mode==='create'){
        const key=String(form.get('key')||`SIM-${Date.now().toString(36).toUpperCase()}`).trim();if(entities.some(i=>i.key===key))return fail('Esta chave já está em uso na simulação.');
        destination={id:`local-${crypto.randomUUID()}`,kind,parentId:item?.id||null,key,name,description:String(form.get('description')||''),status:{system:'active',project:'awaiting_approval',epic:'todo',story:'specification',task:'todo'}[kind],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1,participants:['admin','ana'],archived:false,...(kind==='project'?{lifecycle:'planned'}:{}),...(kind==='story'?{initialScenario:'notStarted'}:{})};entities.push(destination);
      }else{item.name=name;item.description=String(form.get('description')||'');}
    }else if(mode==='archive'){below(item).forEach(i=>i.archived=true);destination=find(item.parentId);}
    else if(mode==='approve'){
      if(!['project','epic'].includes(kind)||(kind==='epic'&&find(item.parentId)?.status!=='approved'))return fail('Aprove o Projeto antes de aprovar este Épico.');item.status='approved';
    }else if(mode==='state'){
      const status=String(form.get('status'));if(kind==='project'&&status==='active'&&item.status!=='approved')return fail('Aprove o planejamento do Projeto antes de iniciar.');
      const epics=entities.filter(i=>!i.archived&&i.parentId===item.id&&i.kind==='epic');if(kind==='project'&&status==='completed'&&(!epics.length||epics.some(i=>i.status!=='done')))return fail('A conclusão requer pelo menos um Épico e todos os Épicos em DONE.');
      if(kind==='project')item.lifecycle=status;else item.status=status;
    }
    getMemory().receipt={itemId:destination?.id||'root',message:`${title(mode)}: operação simulada confirmada`};persist();location.hash=back(destination);
  });
  return {page,enhance,reset(){entities.splice(0,entities.length,...structuredClone(seed));}};
}
