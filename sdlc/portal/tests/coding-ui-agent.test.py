"""Closed local planner/operator contracts. No real app, model or business state."""
import json,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
import coding_ui_agent as ui
from coding_browser import validate_ui_steps
class UiSpecialists(unittest.TestCase):
 def test_planner_receives_visible_labels_without_role_or_level_annotations(self):
  self.assertEqual(ui.planning_text('- heading "Catálogo" [level=1]\n- paragraph: R$ 0,00\n- button "Cadastrar"'), 'Catálogo\nR$ 0,00\nCadastrar')
  self.assertEqual(ui.planning_text('Texto sem árvore ARIA'),'Texto sem árvore ARIA')
 def test_scenario_has_one_bounded_goal_and_cannot_embed_tools_or_drop_assertions(self):
  valid={'goal':'Cadastrar preço zero','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[{'field':'Preço','value':'0'}]}
  self.assertEqual(ui.validate_scenario(valid),valid)
  for change in [{'assertions':[]},{'goal':'x'*701},{'steps':[]},{'assertions':[{'kind':'evaluate','value':'process.env'}]},{'assertions':[{'kind':'text','value':''}]}]:
   with self.subTest(change=change),self.assertRaises(ValueError):ui.validate_scenario({**valid,**change})
 def scenario(self,actions,result):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Escopo completo'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
   session=Mock();session.initial={'rendered':True,'errors':[],'observedUI':'Preço','controls':[{'id':'c1','role':'textbox','name':'Preço'}]};session.call.return_value={**session.initial,**result}
   scenario={'goal':'Preço zero','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[]}
   with patch.object(ui,'ask_local',side_effect=[scenario,*actions]) as ask,patch.object(ui,'LiveBrowser',return_value=session):
    try:value=ui.run_ui_verifier(e,job,[],root,{'observedUI':'Preço'},lambda _:None)
    except ValueError as error:value={'raised':str(error)}
   recipe=json.loads((root/'ui-recorded-steps.json').read_text());session.close.assert_called_once();return value,recipe,session,ask
 def test_one_confirmed_assertion_finishes_without_model_self_approval_and_records_replay(self):
  action={'action':'assert_result','value':'Não pode substituir a expectativa'}
  value,recipe,session,ask=self.scenario([action],{'actionPassed':True,'lastStep':{'op':'expect_text','value':'R$ 0,00'}})
  self.assertTrue(value['passed']);self.assertEqual(ask.call_count,2);session.call.assert_called_once_with('/action',{'op':'expect_text','control':'','value':'R$ 0,00','dialog':'none'});self.assertEqual(recipe['steps'],value['steps']);self.assertEqual(recipe['phases'][-1]['state'],'succeeded')
 def test_functional_failure_keeps_the_failed_assertion_and_blocks_without_another_model(self):
  action={'action':'assert_result','value':''};step={'op':'expect_text','value':'R$ 0,00'}
  value,recipe,session,ask=self.scenario([action],{'actionPassed':False,'lastStep':step,'actionError':'Expected visible text not found'})
  self.assertFalse(value['passed']);self.assertEqual(recipe['steps'],[step]);self.assertEqual(recipe['phases'][-1]['state'],'failed');self.assertEqual(ask.call_count,2)
 def test_unknown_control_or_operation_never_reaches_the_browser(self):
  for action in [{'action':'fill_invented','value':'x'},{'action':'evaluate','value':'process.env'}]:
   with self.subTest(action=action):
    value,recipe,session,_=self.scenario([action],{});self.assertIn('contract',value['raised']);session.call.assert_not_called();self.assertEqual(recipe['steps'],[])
 def test_inference_is_local_without_proxy_redirects_and_respects_global_limits(self):
  job={'calls':0,'totalCalls':48,'rootStarted':time.monotonic()};e=SimpleNamespace(CONFIG={'model':'local:9b','upstream':'http://10.239.0.10:11434'})
  with self.assertRaisesRegex(ValueError,'budget'),patch.object(ui.urllib.request,'build_opener') as opener:ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512)
  opener.assert_not_called();job['totalCalls']=0
  response=Mock();response.read.return_value=json.dumps({'model':'local:9b','done':True,'message':{'content':'{}'}}).encode();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
  opener=Mock();opener.open.return_value=response
  with patch.object(ui.urllib.request,'build_opener',return_value=opener) as build:self.assertEqual(ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512),{})
  self.assertEqual(opener.open.call_args.kwargs['timeout'],75)
  with patch.object(ui.urllib.request,'build_opener',return_value=opener):ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512)
  self.assertEqual(opener.open.call_args.kwargs['timeout'],45)
  e.remaining_seconds=lambda _:12
  with patch.object(ui.urllib.request,'build_opener',return_value=opener):ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512)
  self.assertEqual(opener.open.call_args.kwargs['timeout'],12)
  request=opener.open.call_args.args[0];body=json.loads(request.data);self.assertEqual(request.full_url,'http://10.239.0.10:11434/api/chat');self.assertFalse(body['think']);self.assertEqual(body['model'],'local:9b');self.assertEqual(build.call_args.args[0].proxies,{})
  e.CONFIG['microThinking']=True
  for role,expected in [('implementation',True),('ui_validation',False)]:
   job['role']=role
   with patch.object(ui.urllib.request,'build_opener',return_value=opener):ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512)
   body=json.loads(opener.open.call_args.args[0].data);self.assertEqual(body['think'],expected);self.assertEqual(body['options']['num_predict'],3072 if expected else 512)
  e.CONFIG['uiModel']='local-ui:14b';response.read.return_value=json.dumps({'model':'local-ui:14b','done':True,'message':{'content':'{}'}}).encode();job['role']='ui_validation'
  with patch.object(ui.urllib.request,'build_opener',return_value=opener):ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,512)
  self.assertEqual(json.loads(opener.open.call_args.args[0].data)['model'],'local-ui:14b')
 def test_selection_prerequisites_need_observed_options_and_selection_before_result_assertions(self):
  state={'controls':[{'id':'c1','role':'combobox','name':'Categoria','section':'Cadastro','options':['Selecione'],'selected':'Selecione'},{'id':'c2','role':'combobox','name':'Categoria','section':'Filtros','options':['Todas'],'selected':'Todas'}]}
  scenario={'goal':'Cadastro','assertions':[{'kind':'text','value':'Resultado final'}],'data':[{'field':'Categoria','value':'Teste'}]}
  e=SimpleNamespace(CONFIG={'model':'local:9b'});job={}
  with patch.object(ui,'ask_local',return_value={'selections':[{'control':'c1','value':'Teste'}]}):milestones=ui.selection_milestones(e,job,scenario,{'behavior':'Cadastrar na categoria Teste'},state)
  self.assertEqual(ui.pending_milestone(milestones,state)['kind'],'option');state['controls'][0]['options'].append('Teste');self.assertEqual(ui.pending_milestone(milestones,state)['kind'],'selected');state['controls'][0]['selected']='Teste';self.assertIsNone(ui.pending_milestone(milestones,state))
  self.assertEqual(ui.action_choices(state['controls'],scenario)['assert_result']['value'],'Resultado final')
  for binding in [{'control':'invented','value':'Teste'},{'control':'c1','value':''},{'control':'c1','value':True}]:
   with self.subTest(binding=binding),patch.object(ui,'ask_local',return_value={'selections':[binding]}),self.assertRaises(ValueError):ui.selection_milestones(e,job,scenario,{},state)
 def test_outcome_button_is_bound_to_observed_controls_and_not_self_approved(self):
  state={'controls':[{'id':'b1','role':'button','name':'Cadastrar'},{'id':'b2','role':'button','name':'Adicionar Categoria'}]};e=SimpleNamespace();job={}
  with patch.object(ui,'ask_local',return_value={'control':'b1'}):self.assertEqual(ui.outcome_action(e,job,{}, {},state),state['controls'][0])
  for value in [{'control':'invented'},{'control':'b1','completed':True},{'control':False}]:
   with patch.object(ui,'ask_local',return_value=value),self.assertRaises(ValueError):ui.outcome_action(e,job,{}, {},state)
 def test_prerequisites_cannot_select_an_equivalent_filter_outside_the_primary_form(self):
  state={'controls':[{'id':'c1','role':'combobox','name':'Categoria','section':'Cadastro','options':[]},{'id':'c2','role':'combobox','name':'Categoria','section':'Listagem','options':['Todas']}]};outcome={'id':'b1','role':'button','name':'Cadastrar','section':'Cadastro'}
  with patch.object(ui,'ask_local',return_value={'selections':[{'control':'c1','value':'Teste'}]}) as ask:
   ui.selection_milestones(None,None,{}, {},state,outcome)
   self.assertEqual([c['id'] for c in ask.call_args.args[3]['comboboxes']],['c1'])
  with patch.object(ui,'ask_local',return_value={'selections':[{'control':'c2','value':'Teste'}]}),self.assertRaises(ValueError):ui.selection_milestones(None,None,{}, {},state,outcome)
 def test_prerequisite_binding_enforces_fill_then_save_and_stops_when_the_option_is_observed(self):
  field={'id':'t1','role':'textbox','name':'','section':'Categorias','value':''};submit={'id':'b1','role':'button','name':'Adicionar categoria','section':'Categorias'};selection={'id':'c1','role':'combobox','name':'Categoria','section':'Cadastro','options':[],'selected':''};main={'id':'b2','role':'button','name':'Cadastrar','section':'Cadastro'}
  state={'controls':[field,submit,selection,main]};milestone={'kind':'option','control':'c1','value':'Teste'};bindings={}
  with patch.object(ui,'ask_local',return_value={'field':'t1','submit':'b1'}) as ask:
   self.assertEqual(ui.prerequisite_action(None,None,milestone,state,main,bindings),{'op':'fill','control':'t1','value':'Teste','dialog':'none'})
   field['value']='Teste';self.assertEqual(ui.prerequisite_action(None,None,milestone,state,main,bindings),{'op':'click','control':'b1','value':'','dialog':'none'});ask.assert_called_once()
  self.assertEqual(ui.pending_milestone([milestone],state),milestone);selection['options']=['Teste'];self.assertIsNone(ui.pending_milestone([milestone],state))
  state['controls'].remove(submit)
  with self.assertRaises(ValueError):ui.prerequisite_action(None,None,milestone,state,main,bindings)
 def test_prerequisite_binding_cannot_use_another_form_main_submit_or_forged_capability(self):
  state={'controls':[{'id':'t1','role':'textbox','name':'','section':'Categorias','value':''},{'id':'b1','role':'button','name':'Adicionar','section':'Categorias'},{'id':'t2','role':'textbox','name':'','section':'Coleções','value':''},{'id':'b2','role':'button','name':'Adicionar','section':'Coleções'},{'id':'b3','role':'button','name':'Cadastrar','section':'Cadastro'}]};main=state['controls'][-1];milestone={'control':'c1','value':'Teste'}
  for binding in [{'field':'t1','submit':'b2'},{'field':'t1','submit':'b3'},{'field':'invented','submit':'b1'},{'field':[],'submit':'b1'},{'field':'t1','submit':'b1','script':'injected'}]:
   with self.subTest(binding=binding),patch.object(ui,'ask_local',return_value=binding),self.assertRaises(ValueError):ui.prerequisite_action(None,None,milestone,state,main,{})
 def test_invalid_native_field_is_scoped_and_its_agent_can_only_propose_one_value(self):
  field={'id':'t1','role':'textbox','name':'SKU','section':'Cadastro','editable':True,'required':True,'validity':{'valid':False,'valueMissing':True,'message':'Please fill out this field.'}};other={**field,'id':'t2','section':'Filtro'};outcome={'section':'Cadastro'}
  self.assertIs(ui.invalid_form_field({'controls':[other,field]},outcome),field)
  with patch.object(ui,'ask_local',return_value={'value':'LAB-001'}):self.assertEqual(ui.form_field_action(None,None,field,{}),{'op':'fill','control':'t1','value':'LAB-001','dialog':'none'})
  for value in [{'value':'x','control':'t2'},{'value':''},{'value':False},{'script':'injected'}]:
   with patch.object(ui,'ask_local',return_value=value),self.assertRaises(ValueError):ui.form_field_action(None,None,field,{})
  field['editable']=False;self.assertIsNone(ui.invalid_form_field({'controls':[field]},outcome));field['editable']=True;field['validity']['valid']=True;self.assertIsNone(ui.invalid_form_field({'controls':[field]},outcome))
 def test_observed_saved_result_runs_the_frozen_assertion_only_after_confirmed_primary_action(self):
  scenario={'assertions':[{'kind':'text','value':'R$ 0,00'}]};state={'observedUI':'- paragraph: R$ 0,00'};outcome={'id':'b1'}
  self.assertIsNone(ui.confirmed_text_assertion(scenario,state,outcome,False));self.assertIsNone(ui.confirmed_text_assertion(scenario,state,None,True))
  self.assertEqual(ui.confirmed_text_assertion(scenario,state,outcome,True),{'op':'expect_text','control':'','value':'R$ 0,00','dialog':'none'})
  self.assertIsNone(ui.confirmed_text_assertion(scenario,{'observedUI':'- textbox "Preço": R$ 0,00'},outcome,True))
  self.assertIsNone(ui.confirmed_text_assertion(scenario,{'observedUI':'- paragraph: R$ 0.00'},outcome,True))
 def test_result_assertion_is_not_offered_before_the_primary_action(self):
  with tempfile.TemporaryDirectory() as temporary:
   root=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Criar'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()};session=Mock();session.initial={'rendered':True,'errors':[],'observedUI':'Criar','controls':[{'id':'b1','role':'button','name':'Criar'}]}
   scenario={'goal':'Cadastrar e conferir','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[]}
   with patch.object(ui,'ask_local',side_effect=[scenario,{'control':'b1'},{'action':'assert_result','value':''}]) as ask,patch.object(ui,'LiveBrowser',return_value=session),self.assertRaisesRegex(ValueError,'contract'):ui.run_ui_verifier(e,job,[],root,{},lambda _:None)
   session.call.assert_not_called();self.assertNotIn('assert_result',ask.call_args.args[3]['availableActions']);self.assertEqual(json.loads((root/'ui-recorded-steps.json').read_text())['steps'],[])
if __name__=='__main__':unittest.main()
