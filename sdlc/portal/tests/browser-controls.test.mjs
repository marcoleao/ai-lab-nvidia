import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlRegistry} from '../executor/browser-controls.mjs';
const action=(op,control='',value='',dialog='none')=>({op,control,value,dialog});
test('current IDs distinguish unnamed prerequisites, registration and equivalent filter names',()=>{
 const r=new ControlRegistry(),snapshot='- heading "Categorias" [level=2]\n- textbox: Anéis\n- button "Adicionar"\n- heading "Cadastro" [level=2]\n- combobox "Categoria:":\n  - option "Selecione"\n  - option "Anéis" [selected]\n- heading "Filtros" [level=2]\n- combobox "categoria":\n  - option "Todas"';
 const {controls}=r.update(snapshot),draft=controls[0],registration=controls[2],filter=controls[3];
 assert.equal(draft.value,'Anéis');assert.equal(registration.index,0);assert.equal(filter.index,1);assert.equal(registration.section,'Cadastro');assert.equal(filter.section,'Filtros');assert.equal(registration.selected,'Anéis');
 assert.deepEqual(r.step(action('select',registration.id,'Anéis')).target,{by:'role',role:'combobox',name:'Categoria:',index:0});
 assert.throws(()=>r.step(action('select',filter.id,'Anéis')),/Opção/);
 assert.equal(r.update(snapshot).controls[2].id,registration.id);
 r.update('- button "Outro"');assert.throws(()=>r.step(action('click',draft.id)),/desatualizado/);
});
test('IDs never grant code, URLs, forged roles, hidden options or mismatched actions',()=>{
 const r=new ControlRegistry(),controls=r.update('- textbox "Preço": 0\n- button "Salvar"\n- img "Foto"').controls;
 for(const a of [action('evaluate',controls[0].id,'process.env'),action('goto','','http://remote'),action('click','c999'),action('fill',controls[1].id,'x'),{...action('click',controls[1].id),selector:'body'},action('fill',controls[0].id,'x','accept'),action('reload',controls[0].id),action('expect_text','','')])assert.throws(()=>r.step(a));
 assert.deepEqual(r.step(action('fill',controls[0].id,'0')),{op:'fill',target:{by:'role',role:'textbox',name:'Preço',index:0},value:'0'});
 assert.deepEqual(r.step(action('expect_image',controls[2].id)),{op:'expect_image',target:{by:'role',role:'img',name:'Foto',index:0}});
});
test('catalog limits and duplicate indices are explicit; row context is preserved',()=>{
 const r=new ControlRegistry(),catalog=r.update('- heading "Produtos" [level=1]\n- list:\n  - listitem:\n    - strong: Anel\n    - button "Editar"\n  - listitem:\n    - strong: Colar\n    - button "Editar"');
 assert.match(catalog.controls[0].section,/Anel/);assert.match(catalog.controls[1].section,/Colar/);assert.equal(catalog.controls[1].index,1);
 const many=r.update(Array.from({length:8},()=>'- button "Salvar"').join('\n'));assert.equal(many.limited,true);assert.equal(many.controls.length,6);
 const bound=r.update(Array.from({length:70},(_,i)=>`- button "Botão ${i}"`).join('\n'));assert.equal(bound.limited,true);assert.equal(bound.controls.length,64);
});
