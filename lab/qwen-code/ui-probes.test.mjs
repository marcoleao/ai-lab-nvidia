import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUiSteps} from './ui-probes.mjs';

test('simple names become accessible locators and preserve zero as text',()=>{
 const result=normalizeUiSteps([{op:'fill',name:'Preço',value:'0'},{op:'select',name:'Categoria',value:'Anéis'},{op:'click',name:'Cadastrar'},{op:'expect_text',value:'R$ 0,00'}]);
 assert.deepEqual(result[0],{op:'fill',target:{by:'label',name:'Preço'},value:'0'});assert.deepEqual(result[2],{op:'click',target:{by:'role',name:'Cadastrar',role:'button'}});assert.equal(result[3].value,'R$ 0,00');
 assert.deepEqual(result[1],{op:'select',target:{by:'role',role:'combobox',name:'Categoria'},value:'Anéis'});
});
test('the repeated nested-target error identifies the exact forbidden property',()=>{
 assert.throws(()=>normalizeUiSteps([{op:'click',target:{by:'role',name:'button',text:'Cadastrar'}},{op:'expect_text',value:'Salvo'}]),/Passo 1: campo\(s\) não permitido\(s\): target/);
});
test('missing field feedback explains how to correct the same step',()=>{
 assert.throws(()=>normalizeUiSteps([{op:'fill',name:'SKU'},{op:'expect_text',value:'Salvo'}]),/Passo 1: informe value como texto/);
 assert.throws(()=>normalizeUiSteps([{op:'click'},{op:'expect_text',value:'Salvo'}]),/Passo 1: informe name/);
 assert.throws(()=>normalizeUiSteps([{op:'fill',name:'Preço',value:0},{op:'expect_text',value:'Salvo'}]),/inclusive para números/);
});
test('unlabeled visible textboxes require an explicit bounded index; other actions still need names',()=>{
 const result=normalizeUiSteps([{op:'fill',name:'',index:1,value:'Categoria sintética'},{op:'expect_text',value:'Salvo'}]);
 assert.deepEqual(result[0],{op:'fill',target:{by:'role',role:'textbox',name:'',index:1},value:'Categoria sintética'});
 for(const step of [{op:'fill',name:'',value:'x'},{op:'fill',name:'',index:6,value:'x'},{op:'click',name:'',index:0},{op:'select',name:'',index:0,value:'x'}])assert.throws(()=>normalizeUiSteps([step,{op:'expect_text',value:'x'}]));
});
test('script, external navigation, storage, empty assertions and extra keys stay rejected',()=>{
 for(const steps of [[{op:'evaluate',value:'process.env'}],[{op:'goto',name:'http://external'}],[{op:'storage',value:'inject'}],[{op:'expect_text',value:''}],[{op:'expect_text',value:'x',selector:'body'}],[{op:'click',name:'Salvar'}]])assert.throws(()=>normalizeUiSteps(steps));
});
test('named read/check/image actions, reload and bounded dialogs keep the closed protocol',()=>{
 const result=normalizeUiSteps([{op:'check',name:'Arquivadas'},{op:'expect_visible',name:'Catálogo'},{op:'expect_image',name:'Foto',index:1},{op:'click',name:'Arquivar',dialog:'accept'},{op:'reload'}]);
 assert.equal(result[0].target.by,'label');assert.equal(result[1].target.by,'text');assert.equal(result[2].target.role,'img');assert.equal(result[3].dialog,'accept');assert.deepEqual(result[4],{op:'reload'});
 assert.throws(()=>normalizeUiSteps([{op:'click',name:'Salvar',index:6},{op:'expect_text',value:'Salvo'}]),/index/);assert.throws(()=>normalizeUiSteps([{op:'expect_text',value:'x',dialog:'accept'}]),/dialog/);
});
