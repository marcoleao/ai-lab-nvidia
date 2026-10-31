"""Opt-in real Chromium check; synthetic sources, no portal/business data."""
import json,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
from coding_browser import check_candidate,LiveBrowser

class BrowserCandidate(unittest.TestCase):
 def check(self,source,steps=None):
  with tempfile.TemporaryDirectory(prefix='sdlc-browser-fixture-') as directory:
   path=Path(directory);path.chmod(0o755)
   return check_candidate({'browserImageId':'sdlc-coding-browser:prepared'},'f'*64,1,[{'path':'src/main.jsx','content':source}],path,steps=steps)
 def test_missing_provider_is_a_real_runtime_failure_and_repair_renders(self):
  shared="import React,{createContext,useContext} from 'react';import {createRoot} from 'react-dom/client';const C=createContext();function App(){const {title}=useContext(C);return <h1>{title}</h1>}"
  broken=self.check(shared+"createRoot(document.getElementById('root')).render(<App/>);")
  self.assertTrue(broken['applicable']);self.assertFalse(broken['passed']);self.assertTrue(broken['errors'])
  repaired=self.check(shared+"createRoot(document.getElementById('root')).render(<C.Provider value={{title:'Catálogo sintético'}}><App/></C.Provider>);")
  self.assertTrue(repaired['passed'],json.dumps(repaired));self.assertTrue(repaired['rendered'])
 def test_blank_entry_and_unsupported_dependency_do_not_pass(self):
  self.assertFalse(self.check('export const nothing=1;')['passed'])
  blocked=self.check("import x from 'unprepared-package';document.body.innerText=x;")
  self.assertFalse(blocked['passed']);self.assertIn('não preparada',blocked['errors'][0])
 def test_non_react_context_is_explicitly_not_tested(self):
  with tempfile.TemporaryDirectory() as directory:
   value=check_candidate({},'f'*64,1,[{'path':'server.js','content':'server();'}],Path(directory))
   self.assertFalse(value['applicable']);self.assertFalse(value['passed'])
 def test_ui_interaction_discovers_price_bug_hidden_by_an_empty_initial_list(self):
  shared="import React,{useState} from 'react';import {createRoot} from 'react-dom/client';function App(){const [amount,setAmount]=useState(null);return <main><button onClick={()=>setAmount(0)}>Criar</button>{amount!==null&&<p>{FORMAT}</p>}</main>}createRoot(document.getElementById('root')).render(<App/>);"
  steps=[{'op':'click','target':{'by':'role','role':'button','name':'Criar'}},{'op':'expect_text','value':'R$ 0,00'}]
  broken=shared.replace('FORMAT',"new Intl.NumberFormat('pt-BR').replace('.', ',').format(amount)")
  self.assertTrue(self.check(broken)['passed'])
  observed=self.check(broken,steps);self.assertFalse(observed['passed']);self.assertTrue(observed['errors'])
  repaired=shared.replace('FORMAT',"new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount)")
  observed=self.check(repaired,steps);self.assertTrue(observed['passed'],json.dumps(observed));self.assertEqual(observed['uiProbe']['assertions'],1)
 def test_photo_fixture_is_local_and_reload_uses_only_the_browser(self):
  source="import React,{useState} from 'react';import {createRoot} from 'react-dom/client';function App(){const [photo,setPhoto]=useState('');return <main><label>Foto<input value={photo} onChange={e=>setPhoto(e.target.value)}/></label>{photo&&<img alt='Foto de teste' src={photo}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);"
  steps=[{'op':'fill','target':{'by':'label','name':'Foto'},'value':'$ORIGIN/__sdlc_test__/image.svg?v=1'},{'op':'expect_image','target':{'by':'role','role':'img','name':'Foto de teste'}}]
  observed=self.check(source,steps);self.assertTrue(observed['passed'],json.dumps(observed));self.assertEqual(observed['uiProbe']['executed'],2)
  remote=self.check(source,[{**steps[0],'value':'http://203.0.113.1/image.svg'},steps[1]])
  self.assertFalse(remote['passed'])
 def test_visible_unlabeled_field_is_filled_by_role_and_explicit_index_without_storage_injection(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [value,setValue]=useState('');return <main><input onChange={e=>setValue(e.target.value)}/><p>{value}</p></main>}createRoot(document.getElementById('root')).render(<App/>);"
  observed=self.check(source,[{'op':'fill','target':{'by':'role','role':'textbox','name':'','index':0},'value':'Digitado pela UI'},{'op':'expect_text','value':'Digitado pela UI'}]);self.assertTrue(observed['passed'],json.dumps(observed));self.assertEqual(observed['uiProbe']['executed'],2)
 def test_wrapped_select_label_keeps_its_accessible_name_after_options_are_created(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [draft,setDraft]=useState(''),[options,setOptions]=useState([]),[selected,setSelected]=useState('');return <main><input value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setOptions([...options,draft])}>Adicionar</button><label>Categoria:<select value={selected} onChange={e=>setSelected(e.target.value)}><option value=''>Selecione</option>{options.map(o=><option key={o}>{o}</option>)}</select></label><p>Escolhida: {selected}</p></main>}createRoot(document.getElementById('root')).render(<App/>);"
  steps=[{'op':'fill','target':{'by':'role','role':'textbox','name':'','index':0},'value':'Criada na UI'},{'op':'click','target':{'by':'role','role':'button','name':'Adicionar'}},{'op':'select','target':{'by':'role','role':'combobox','name':'Categoria:'},'value':'Criada na UI'},{'op':'expect_text','value':'Escolhida: Criada na UI'}]
  observed=self.check(source,steps);self.assertTrue(observed['passed'],json.dumps(observed));self.assertEqual(observed['uiProbe']['executed'],4)
 def test_unnamed_control_indices_exclude_named_fields_in_live_actions_and_independent_replay(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const[sku,setSku]=useState(''),[d,setD]=useState(''),[e,setE]=useState(''),[cat,setCat]=useState(''),[col,setCol]=useState('');return <main><h2>Cadastro</h2><label>SKU:<input value={sku} onChange={e=>setSku(e.target.value)}/></label><h2>Categorias</h2><input value={d} onChange={e=>setD(e.target.value)}/><button onClick={()=>{setCat(d);setD('')}}>Adicionar categoria</button><h2>Coleções</h2><input value={e} onChange={e=>setE(e.target.value)}/><button onClick={()=>{setCol(e);setE('')}}>Adicionar coleção</button><p>SKU preservado: {sku}</p><p>Categoria salva: {cat}</p><p>Coleção salva: {col}</p></main>}createRoot(document.getElementById('root')).render(<App/>);"
  with tempfile.TemporaryDirectory(prefix='sdlc-browser-unnamed-fixture-') as directory:
   root=Path(directory);root.chmod(0o755);files=[{'path':'src/main.jsx','content':source}];session=LiveBrowser({'browserImageId':'sdlc-coding-browser:prepared'},'b'*64,files,root);state=session.initial;steps=[]
   def act(op,role='',name='',section='',value=''):
    nonlocal state
    ident=next(c['id'] for c in state['controls'] if c['role']==role and c['name']==name and (not section or c['section']==section)) if role else ''
    state=session.call('/action',{'op':op,'control':ident,'value':value,'dialog':'none'});self.assertTrue(state['actionPassed'],json.dumps(state));steps.append(state['lastStep'])
   try:
    act('fill','textbox','SKU:',value='ORIGINAL');act('fill','textbox',section='Categorias',value='Anéis');act('click','button','Adicionar categoria');act('fill','textbox',section='Coleções',value='Aurora');act('click','button','Adicionar coleção')
    for text in ['SKU preservado: ORIGINAL','Categoria salva: Anéis','Coleção salva: Aurora']:act('expect_text',value=text)
    replay=check_candidate({'browserImageId':'sdlc-coding-browser:prepared'},'a'*64,1,files,root,steps=steps);self.assertTrue(replay['passed'],json.dumps(replay));self.assertEqual(replay['uiProbe']['executed'],8)
   finally:session.close()
 def test_field_name_ignores_only_case_spacing_and_a_trailing_colon_without_matching_other_fields(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [value,setValue]=useState('');return <main><label>SKU:<input onChange={e=>setValue(e.target.value)}/></label><label>SKU alternativo:<input/></label><p>Valor: {value}</p></main>}createRoot(document.getElementById('root')).render(<App/>);"
  observed=self.check(source,[{'op':'fill','target':{'by':'label','name':'sku'},'value':'Pelo campo correto'},{'op':'expect_text','value':'Valor: Pelo campo correto'}]);self.assertTrue(observed['passed'],json.dumps(observed))
 def test_native_required_field_feedback_is_observed_without_bypassing_form_validation(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const[sku,setSku]=useState(''),[saved,setSaved]=useState('');return <form onSubmit={e=>{e.preventDefault();setSaved(sku)}}><h2>Cadastro</h2><label>SKU:<input required value={sku} onChange={e=>setSku(e.target.value)}/></label><button>Salvar</button><p>Gravado: {saved}</p></form>}createRoot(document.getElementById('root')).render(<App/>);"
  with tempfile.TemporaryDirectory(prefix='sdlc-browser-native-fixture-') as directory:
   root=Path(directory);root.chmod(0o755);files=[{'path':'src/main.jsx','content':source}];session=LiveBrowser({'browserImageId':'sdlc-coding-browser:prepared'},'9'*64,files,root)
   try:
    controls=session.initial['controls'];field=next(c for c in controls if c['role']=='textbox');button=next(c for c in controls if c['role']=='button')
    self.assertTrue(field['required']);self.assertTrue(field['editable']);self.assertFalse(field['validity']['valid']);self.assertTrue(field['validity']['message'])
    clicked=session.call('/action',{'op':'click','control':button['id'],'value':'','dialog':'none'});self.assertTrue(clicked['actionPassed']);self.assertNotIn('Gravado: LAB-001',clicked['observedUI'])
    filled=session.call('/action',{'op':'fill','control':field['id'],'value':'LAB-001','dialog':'none'});self.assertTrue(filled['actionPassed']);self.assertTrue(next(c for c in filled['controls'] if c['id']==field['id'])['validity']['valid'])
    saved=session.call('/action',{'op':'click','control':button['id'],'value':'','dialog':'none'});self.assertIn('Gravado: LAB-001',saved['observedUI'])
    replay=self.check(source,[filled['lastStep'],saved['lastStep'],{'op':'expect_text','value':'Gravado: LAB-001'}]);self.assertTrue(replay['passed'])
   finally:session.close()
 def test_equivalent_field_names_still_require_disambiguation(self):
  source="import React from 'react';import{createRoot}from'react-dom/client';createRoot(document.getElementById('root')).render(<main><label>SKU<input/></label><label>SKU:<input/></label></main>);"
  observed=self.check(source,[{'op':'fill','target':{'by':'label','name':'SKU'},'value':'Não escolher arbitrariamente'},{'op':'expect_text','value':'SKU'}]);self.assertFalse(observed['passed']);self.assertEqual(observed['uiProbe']['executed'],0)
 def test_live_browser_observes_each_action_and_replays_prerequisite_with_the_correct_duplicate(self):
  source="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const[d,setD]=useState(''),[opts,setOpts]=useState([]),[c,setC]=useState(''),[p,setP]=useState('1'),[saved,setSaved]=useState(null);return <main><h2>Categorias</h2><input value={d} onChange={e=>setD(e.target.value)}/><button onClick={()=>{setOpts([...opts,d]);setD('')}}>Adicionar</button><h2>Cadastro</h2><label>Categoria:<select value={c} onChange={e=>setC(e.target.value)}><option>Selecione</option>{opts.map(o=><option key={o}>{o}</option>)}</select></label><label>Preço<input type='number' value={p} onChange={e=>setP(e.target.value)}/></label><button onClick={()=>c&&setSaved(Number(p))}>Cadastrar</button>{saved!==null&&<p>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(saved)}</p>}<h2>Filtros</h2><label>Categoria:<select><option>Todas</option></select></label></main>}createRoot(document.getElementById('root')).render(<App/>);"
  with tempfile.TemporaryDirectory(prefix='sdlc-browser-live-fixture-') as directory:
   Path(directory).chmod(0o755);root=Path(directory)/('e'*64);root.mkdir(mode=0o755);files=[{'path':'src/main.jsx','content':source}];session=LiveBrowser({'browserImageId':'sdlc-coding-browser:prepared'},'e'*64,files,root);state=session.initial;steps=[]
   def control(role,name,section=None):return next(c['id'] for c in state['controls'] if c['role']==role and c['name']==name and (section is None or c['section']==section))
   def act(op,ident='',value=''):
    nonlocal state
    state=session.call('/action',{'op':op,'control':ident,'value':value,'dialog':'none'});self.assertTrue(state['actionPassed'],json.dumps(state));steps.append(state['lastStep'])
   try:
    self.assertTrue(state['rendered']);act('fill',control('textbox',''),'Anéis');act('click',control('button','Adicionar'))
    choice=next(c for c in state['controls'] if c['role']=='combobox' and c['section']=='Cadastro');self.assertIn('Anéis',choice['options']);act('select',choice['id'],'Anéis');act('fill',control('spinbutton','Preço'),'0');act('click',control('button','Cadastrar'));act('expect_text',value='R$ 0,00')
    replay=check_candidate({'browserImageId':'sdlc-coding-browser:prepared'},'d'*64,1,files,root,steps=steps);self.assertTrue(replay['passed'],json.dumps(replay));self.assertEqual(replay['uiProbe']['executed'],6)
   finally:session.close()
 def test_live_failure_retains_the_canonical_failed_step_and_rejects_unobserved_controls(self):
  source="import React from 'react';import{createRoot}from'react-dom/client';createRoot(document.getElementById('root')).render(<main><button>Salvar</button><p>R$ 0.00</p></main>);"
  with tempfile.TemporaryDirectory(prefix='sdlc-browser-live-failure-') as directory:
   root=Path(directory);root.chmod(0o755);session=LiveBrowser({'browserImageId':'sdlc-coding-browser:prepared'},'c'*64,[{'path':'src/main.jsx','content':source}],root)
   try:
    denied=session.call('/action',{'op':'click','control':'invented','value':'','dialog':'none'});self.assertFalse(denied['actionPassed']);self.assertNotIn('lastStep',denied)
    failed=session.call('/action',{'op':'expect_text','control':'','value':'R$ 0,00','dialog':'none'});self.assertFalse(failed['actionPassed']);self.assertEqual(failed['lastStep'],{'op':'expect_text','value':'R$ 0,00'});self.assertTrue(failed['rendered'])
   finally:session.close()
if __name__=='__main__':unittest.main()
