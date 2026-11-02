"""Closed local planner/operator contracts. No real app, model or business state."""
import io,json,sys,tempfile,time,unittest,urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
import coding_ui_agent as ui
from coding_browser import validate_ui_steps
class UiSpecialists(unittest.TestCase):
 def test_frozen_input_binding_keeps_exact_values_and_refuses_filters_duplicates_and_new_data(self):
  controls=[{'id':'reference','role':'textbox','name':'Identificador','section':'Reserva'},{'id':'quantity','role':'spinbutton','name':'Total de itens','section':'Reserva'},{'id':'mode','role':'combobox','name':'Modo','section':'Reserva','options':['Expresso']},{'id':'search','role':'textbox','name':'Referência','section':'Filtros'}]
  scenario={'goal':'Registrar reserva','assertions':[{'kind':'text','value':'Reserva confirmada.'}],'data':[{'field':'Referência','value':'  RES 42 '},{'field':'Quantidade','value':'2'},{'field':'Modalidade','value':'Expresso'}]};original=json.dumps(scenario);context={'criteria':['Preservar cadastros anteriores.']};outcome={'section':'Reserva'}
  with patch.object(ui,'ask_local',side_effect=[{'control':'reference'},{'control':'quantity'},{'control':'mode'}]) as ask:
   result=ui.scenario_input_bindings(None,{},scenario,context,{'controls':controls},outcome)
  self.assertEqual(result,[{'control':'reference','value':'  RES 42 ','field':'Referência'},{'control':'quantity','value':'2','field':'Quantidade'}]);self.assertEqual(json.dumps(scenario),original)
  for call,datum in zip(ask.call_args_list,scenario['data']):
   self.assertEqual(call.args[3]['plannedInput'],datum);self.assertEqual(call.args[3]['approvedContext'],context);self.assertNotIn('search',call.args[4]['properties']['control']['enum'])
  for bad in [{'control':'search'},{'control':'reference','value':'invented'},{'control':'unknown'}]:
   with patch.object(ui,'ask_local',return_value=bad),self.assertRaisesRegex(ValueError,'observados'):ui.scenario_input_bindings(None,{},scenario,context,{'controls':controls},outcome)
  with patch.object(ui,'ask_local',side_effect=[{'control':'reference'},{'control':'reference'}]),self.assertRaises(ValueError):ui.scenario_input_bindings(None,{},scenario,context,{'controls':controls},outcome)
 def test_planned_initial_fields_are_filled_once_before_real_submit_and_frozen_assertion(self):
  controls=[{'id':'name','role':'textbox','name':'Responsável','section':'Reserva','value':''},{'id':'amount','role':'spinbutton','name':'Quantidade','section':'Reserva','value':''},{'id':'save','role':'button','name':'Confirmar','section':'Reserva'}];initial={'rendered':True,'errors':[],'observedUI':'Formulário de reserva','controls':controls};saved={**initial,'observedUI':'Reserva confirmada.'}
  session=Mock();session.initial=initial
  def perform(route,action):
   step={'op':action['op'],**({'target':{'by':'role','role':'button' if action['op']=='click' else 'textbox' if action['control']=='name' else 'spinbutton','name':next(c['name'] for c in controls if c['id']==action['control'])}} if action['control'] else {}),**({'value':action['value']} if action['op'] in ['fill','expect_text'] else {})}
   return {**(saved if action['op'] in ['click','expect_text'] else initial),'actionPassed':True,'lastStep':step}
  session.call.side_effect=perform
  answers=[{'supported':True,'limitation':''},{'goal':'Registrar reserva','data':[{'field':'Responsável','value':'Pessoa teste'},{'field':'Quantidade','value':'2'}]},{'kind':'text'},{'value':'Reserva confirmada.'},{'control':'save'},{'action':'click_save','value':''}]
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Registrar reserva e conferir Reserva confirmada.'},'totalCalls':0}
   with patch.object(ui,'ask_local',side_effect=answers) as ask,patch.object(ui,'LiveBrowser',return_value=session):result=ui.run_ui_verifier(e,job,[],Path(temporary),initial,lambda _:None)
   self.assertTrue(result['passed']);self.assertEqual([call.args[1]['op'] for call in session.call.call_args_list],['fill','fill','click','expect_text']);self.assertEqual([call.args[1]['value'] for call in session.call.call_args_list[:2]],['Pessoa teste','2']);self.assertEqual(ask.call_count,len(answers))
 def test_exact_observed_names_are_reserved_without_semantic_guess_or_model_call(self):
  controls=[{'id':'description','role':'textbox','name':'Descrição','section':'Remessa'},{'id':'mass','role':'textbox','name':' MASSA  ','section':'Remessa'},{'id':'filter','role':'textbox','name':'Descrição','section':'Filtros'}]
  scenario={'goal':'Registrar remessa','assertions':[{'kind':'text','value':'Registrada.'}],'data':[{'field':'Comentário','value':'Não atribuir'},{'field':'massa','value':'12.50'},{'field':'Descrição','value':' Caixa teste '}]}
  with patch.object(ui,'ask_local') as ask:
   result=ui.scenario_input_bindings(None,{},scenario,{}, {'controls':controls},{'section':'Remessa'})
  ask.assert_not_called();self.assertEqual(result,[{'control':'mass','field':'massa','value':'12.50'},{'control':'description','field':'Descrição','value':' Caixa teste '}])
  ambiguous=[*controls,{'id':'description2','role':'textbox','name':'Descrição','section':'Remessa'}]
  with patch.object(ui,'ask_local',return_value={'control':'description2'}) as ask:
   result=ui.scenario_input_bindings(None,{}, {**scenario,'data':[scenario['data'][2]]},{},{'controls':ambiguous},{'section':'Remessa'})
  self.assertEqual(ask.call_count,1);self.assertEqual(result[0]['control'],'description2')
 def test_only_confirmed_token_repetition_has_the_safe_inference_diagnostic(self):
  for message,exception in [('prediction aborted, token repeat limit reached',ui.InferenceTokenRepeatError),('different private service cause',urllib.error.HTTPError)]:
   job={'calls':0,'totalCalls':0,'rootStarted':time.monotonic(),'role':'implementation'};e=SimpleNamespace(CONFIG={'model':'local:9b','upstream':'http://10.239.0.10:11434'})
   failure=urllib.error.HTTPError('http://10.239.0.10:11434/api/chat',500,'error',{},io.BytesIO(json.dumps({'error':message}).encode()));opener=Mock();opener.open.side_effect=failure
   with patch.object(ui.urllib.request,'build_opener',return_value=opener),self.assertRaises(exception):ui.ask_local(e,job,'bounded',{},ui.SCENARIO_SCHEMA,200)
   self.assertEqual(job['totalCalls'],1)
 def test_image_asset_binding_cannot_choose_another_form_or_supply_its_own_url(self):
  scenario={'goal':'Cadastrar foto HTTP','assertions':[{'kind':'image','value':''}]};outcome={'id':'b1','section':'Cadastro'}
  state={'controls':[{'id':'photo','role':'textbox','name':'Foto URL','section':'Cadastro'},{'id':'filter','role':'textbox','name':'Busca','section':'Filtro'}]}
  with patch.object(ui,'ask_local',return_value={'control':'photo'}):self.assertEqual(ui.image_asset_binding(None,{},scenario,state,outcome),{'control':'photo','value':'$ORIGIN/__sdlc_test__/image.svg'})
  for bad in [{'control':'filter'},{'control':'photo','value':'http://arbitrary.test/a.svg'}]:
   with patch.object(ui,'ask_local',return_value=bad),self.assertRaises(ValueError):ui.image_asset_binding(None,{},scenario,state,outcome)
  with patch.object(ui,'ask_local') as ask:self.assertIsNone(ui.image_asset_binding(None,{}, {'assertions':[{'kind':'text','value':'Preço'}]},state,outcome))
  ask.assert_not_called()
 def test_image_assertion_is_separate_from_plan_and_uses_frozen_asset_after_submission(self):
  initial={'rendered':True,'errors':[],'observedUI':'Cadastrar foto','controls':[{'id':'photo','role':'textbox','name':'Foto URL','section':'Cadastro'},{'id':'b1','role':'button','name':'Cadastrar','section':'Cadastro'}]}
  saved={**initial,'observedUI':'Foto cadastrada','controls':[*initial['controls'],{'id':'img1','role':'img','name':'Foto salva','section':'Lista'}]}
  session=Mock();session.initial=initial
  session.call.side_effect=[{**initial,'actionPassed':True,'lastStep':{'op':'fill','target':{'by':'role','role':'textbox','name':'Foto URL'},'value':'$ORIGIN/__sdlc_test__/image.svg'}},{**saved,'actionPassed':True,'lastStep':{'op':'click','target':{'by':'role','role':'button','name':'Cadastrar'}}},{**saved,'actionPassed':True,'lastStep':{'op':'expect_image','target':{'by':'role','role':'img','name':'Foto salva'},'value':'$ORIGIN/__sdlc_test__/image.svg'}}]
  responses=[{'supported':True,'limitation':''},{'goal':'Cadastrar e carregar foto','data':[]},{'kind':'image'},{'control':'b1'},{'control':'photo'},{'action':'click_b1','value':''}]
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
   job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Foto HTTP'},'rootStarted':time.monotonic(),'calls':0,'totalCalls':0}
   with patch.object(ui,'ask_local',side_effect=responses) as ask,patch.object(ui,'LiveBrowser',return_value=session):value=ui.run_ui_verifier(e,job,[],directory,initial,lambda _:None)
   self.assertTrue(value['passed']);self.assertEqual(ask.call_count,6);self.assertEqual(session.call.call_args.args[1],{'op':'expect_image','control':'img1','value':'$ORIGIN/__sdlc_test__/image.svg','dialog':'none'})
   self.assertNotIn('assertions',json.loads((directory/'ui-scenario-plan.json').read_text()));self.assertEqual(json.loads((directory/'ui-scenario.json').read_text())['assertions'],[{'kind':'image','value':''}])
 def test_planner_receives_visible_labels_without_role_or_level_annotations(self):
  self.assertEqual(ui.planning_text('- heading "Catálogo" [level=1]\n- paragraph: R$ 0,00\n- button "Cadastrar"'), 'Catálogo\nR$ 0,00\nCadastrar')
  self.assertEqual(ui.planning_text('Texto sem árvore ARIA'),'Texto sem árvore ARIA')
 def test_scenario_has_one_bounded_goal_and_cannot_embed_tools_or_drop_assertions(self):
  valid={'goal':'Cadastrar preço zero','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[{'field':'Preço','value':'0'}]}
  self.assertEqual(ui.validate_scenario(valid),valid)
  for change in [{'assertions':[]},{'goal':'x'*701},{'steps':[]},{'assertions':[{'kind':'evaluate','value':'process.env'}]},{'assertions':[{'kind':'text','value':''}]},{'assertions':[{'kind':'image','value':'Foto carregada com sucesso'}]}]:
   with self.subTest(change=change),self.assertRaises(ValueError):ui.validate_scenario({**valid,**change})
 def scenario(self,actions,result):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Exibir R$ 0,00 após cadastrar preço zero.'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
   session=Mock();session.initial={'rendered':True,'errors':[],'observedUI':'Preço','controls':[{'id':'c1','role':'textbox','name':'Preço'}]};session.call.return_value={**session.initial,**result}
   scenario={'goal':'Preço zero','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[]}
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{key:scenario[key] for key in ['goal','data']},{'kind':'text'},{'value':scenario['assertions'][0]['value']},*actions]) as ask,patch.object(ui,'LiveBrowser',return_value=session):
    try:value=ui.run_ui_verifier(e,job,[],root,{'observedUI':'Preço'},lambda _:None)
    except ValueError as error:value={'raised':str(error)}
   recipe=json.loads((root/'ui-recorded-steps.json').read_text());session.close.assert_called_once();return value,recipe,session,ask
 def test_one_confirmed_assertion_finishes_without_model_self_approval_and_records_replay(self):
  action={'action':'assert_result','value':'Não pode substituir a expectativa'}
  value,recipe,session,ask=self.scenario([action],{'actionPassed':True,'lastStep':{'op':'expect_text','value':'R$ 0,00'}})
  self.assertTrue(value['passed']);self.assertEqual(ask.call_count,5);session.call.assert_called_once_with('/action',{'op':'expect_text','control':'','value':'R$ 0,00','dialog':'none'});self.assertEqual(recipe['steps'],value['steps']);self.assertEqual(recipe['phases'][-1]['state'],'succeeded')
 def test_functional_failure_keeps_the_failed_assertion_and_blocks_without_another_model(self):
  action={'action':'assert_result','value':''};step={'op':'expect_text','value':'R$ 0,00'}
  value,recipe,session,ask=self.scenario([action],{'actionPassed':False,'lastStep':step,'actionError':'Expected visible text not found'})
  self.assertFalse(value['passed']);self.assertEqual(recipe['steps'],[step]);self.assertEqual(recipe['phases'][-1]['state'],'failed');self.assertEqual(ask.call_count,5)
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
 def test_explicit_pattern_reasoning_is_limited_to_supported_implementation_model(self):
  response=Mock();response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
  opener=Mock();opener.open.return_value=response
  for model,role,requested,expected in [('qwen3:14b','implementation',True,True),('qwen3:14b','implementation',False,False),('qwen3:14b','ui_validation',True,False),('local:9b','implementation',True,False)]:
   with self.subTest(model=model,role=role,requested=requested):
    e=SimpleNamespace(CONFIG={'model':model,'microThinking':False,'upstream':'http://10.239.0.10:11434'})
    job={'role':role,'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
    response.read.return_value=json.dumps({'model':model,'done':True,'message':{'content':'{}'}}).encode()
    with patch.object(ui.urllib.request,'build_opener',return_value=opener):ui.ask_local(e,job,'closed',{},ui.SCENARIO_SCHEMA,600,reasoning=requested)
    body=json.loads(opener.open.call_args.args[0].data)
    self.assertEqual(body['think'],expected);self.assertEqual(body['options']['num_predict'],3072 if expected else 600);self.assertEqual(opener.open.call_args.kwargs['timeout'],90 if expected else 75)
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
   root=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Criar preço zero e exibir R$ 0,00.'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()};session=Mock();session.initial={'rendered':True,'errors':[],'observedUI':'Criar','controls':[{'id':'b1','role':'button','name':'Criar'}]}
   scenario={'goal':'Cadastrar e conferir','assertions':[{'kind':'text','value':'R$ 0,00'}],'data':[]}
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{key:scenario[key] for key in ['goal','data']},{'kind':'text'},{'value':scenario['assertions'][0]['value']},{'control':'b1'},{'action':'assert_result','value':''}]) as ask,patch.object(ui,'LiveBrowser',return_value=session),self.assertRaisesRegex(ValueError,'contract'):ui.run_ui_verifier(e,job,[],root,{},lambda _:None)
   session.call.assert_not_called();self.assertNotIn('assert_result',ask.call_args.args[3]['availableActions']);self.assertEqual(json.loads((root/'ui-recorded-steps.json').read_text())['steps'],[])
 def test_unrelated_assertion_is_refused_before_any_browser_or_application_repair(self):
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)))
   job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Exibir Hello World e trocar fundo #DDEEFF.'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{'goal':'Trocar fundo','data':[]},{'kind':'text'},{'value':'R$ 0,00'}]),patch.object(ui,'LiveBrowser') as browser:
    with self.assertRaisesRegex(ValueError,'planejador de UI'):ui.run_ui_verifier(e,job,[],Path(temporary),{'observedUI':'Hello World'},lambda _:None)
    browser.assert_not_called()
  for kind,value in [('page_background','#000000'),('heading_font','Invented Font')]:
   with self.assertRaises(ValueError):ui.require_assertion_source({'kind':kind,'value':value},{'criteria':['Fundo #DDEEFF, fonte Georgia.']},value)
 def test_result_classifier_does_not_offer_an_unsourceable_background_for_other_domains(self):
  for objective,outcome in [('Agendar atendimento','Reserva confirmada'),('Lançar despesa','Despesa registrada'),('Cadastrar material','Material cadastrado')]:
   with self.subTest(objective=objective):
    context={'objective':objective,'criteria':[outcome],'approved':{'requirements':{'businessRules':['Preservar dados anteriores.']}}}
    with patch.object(ui,'ask_local',return_value={'kind':'text'}) as ask:
     self.assertEqual(ui.classify_assertion(None,{}, {'goal':outcome},context),{'kind':'text'})
    data,schema=ask.call_args.args[3:5]
    self.assertEqual(data['currentGoal'],outcome);self.assertEqual(data['approvedContext'],context)
    self.assertNotIn('page_background',schema['properties']['kind']['enum']);self.assertEqual(data['approvedBackgroundLiterals'],[])
    self.assertIn('image',schema['properties']['kind']['enum']);self.assertIn('heading_font',schema['properties']['kind']['enum'])
    with patch.object(ui,'ask_local',return_value={'kind':'page_background'}),self.assertRaisesRegex(ValueError,'fonte aprovada'):
     ui.classify_assertion(None,{}, {'goal':outcome,'data':[{'field':'cor','value':'#DDEEFF'}]},context)
 def test_background_classifier_preserves_explicit_approved_visual_values_and_fonts(self):
  context={'criteria':['Selecionar #DDEEFF para cobrir a janela.','Conferir a fonte Georgia no título.']}
  for kind,goal in [('page_background','Conferir a cor #DDEEFF nos cantos'),('heading_font','Conferir Georgia no h1')]:
   with self.subTest(kind=kind),patch.object(ui,'ask_local',return_value={'kind':kind}) as ask:
    self.assertEqual(ui.classify_assertion(None,{}, {'goal':goal},context),{'kind':kind})
    self.assertIn('page_background',ask.call_args.args[4]['properties']['kind']['enum'])
    self.assertEqual(ask.call_args.args[3]['approvedBackgroundLiterals'],['#DDEEFF'])
  with patch.object(ui,'ask_local',return_value={'kind':'page_background'}),self.assertRaisesRegex(ValueError,'fonte aprovada'):
   ui.classify_assertion(None,{}, {'goal':'Conferir fundo #DDEEFF'}, {'criteria':['Apenas confirmar reserva.']})
 def test_classifier_refuses_extra_fields_and_unsourceable_visual_kind_before_browser(self):
  for response in [{'kind':'page_background'},{'kind':'text','approved':True},{'kind':False},{'kind':['text']}]:
   with self.subTest(response=response),patch.object(ui,'ask_local',return_value=response),self.assertRaisesRegex(ValueError,'asserção'):
    ui.classify_assertion(None,{}, {'goal':'Confirmar cadastro'}, {'criteria':['Confirmação textual.']})
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)))
   job={'intent':{'prompt':'Criar uma reserva e mostrar "Reserva confirmada".'},'totalCalls':0}
   responses=[{'supported':True,'limitation':''},{'goal':'Criar uma reserva','data':[]},{'kind':'page_background'}]
   with patch.object(ui,'ask_local',side_effect=responses) as ask,patch.object(ui,'LiveBrowser') as browser,self.assertRaisesRegex(ValueError,'fonte aprovada'):
    ui.run_ui_verifier(e,job,[],Path(temporary),{'observedUI':'- button "Reservar"'},lambda _:None)
   browser.assert_not_called();self.assertEqual(ask.call_count,3)
 def test_selection_uses_unique_observed_spelling_without_creating_aliases_or_resolving_ambiguity(self):
  for requested,observed in [('expresso','Expresso'),('  mensal  consolidado ','Mensal consolidado')]:
   control={'id':'s1','role':'combobox','name':'','section':'Entrega','options':['Escolha',observed],'selected':'Escolha'}
   with self.subTest(requested=requested),patch.object(ui,'ask_local',return_value={'selections':[{'control':'s1','value':requested}]}):
    milestones=ui.selection_milestones(None,None,{}, {},{'controls':[control]})
   self.assertEqual(milestones[0]['value'],observed);self.assertEqual(milestones[0]['requestedValue'],requested)
   self.assertEqual(ui.pending_milestone(milestones,{'controls':[control]})['kind'],'selected')
   self.assertIsNone(ui.pending_milestone(milestones,{'controls':[{**control,'selected':observed}]}))
  self.assertEqual(ui.observed_selection_value({'options':['Expresso']},'Rápido'),'Rápido')
  self.assertEqual(ui.observed_selection_value({'options':['Avulsa','AVULSA']},'Avulsa'),'Avulsa')
  with self.assertRaisesRegex(ValueError,'ambígua'):ui.observed_selection_value({'options':['Avulsa','AVULSA']},'avulsa')
 def test_readonly_heading_assertion_uses_observed_literal_instead_of_the_criterion_sentence(self):
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
   job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'O título Catálogo é exibido.'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
   state={'rendered':True,'errors':[],'observedUI':'- heading "Catálogo" [level=1]','controls':[]};session=Mock();session.initial=state;session.call.return_value={**state,'actionPassed':True,'lastStep':{'op':'expect_text','value':'Catálogo'}}
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{'goal':'Conferir abertura','data':[]},{'kind':'text'},{'value':'Catálogo'},{'action':'assert_result','value':''}]) as ask,patch.object(ui,'LiveBrowser',return_value=session):result=ui.run_ui_verifier(e,job,[],directory,state,lambda _:None)
   self.assertTrue(result['passed']);self.assertEqual(ask.call_args_list[3].args[4]['properties']['value']['enum'],['Catálogo'])
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{'goal':'Conferir abertura','data':[]},{'kind':'text'},{'value':'O título Catálogo é exibido.'}]),patch.object(ui,'LiveBrowser') as browser:
    with self.assertRaisesRegex(ValueError,'literal observado'):ui.run_ui_verifier(e,job,[],directory,state,lambda _:None)
    browser.assert_not_called()
 def test_visual_assertion_is_frozen_and_replayed_after_observed_selections(self):
  for kind,expected,op in [('page_background','#DDEEFF','expect_background'),('heading_font','Georgia','expect_font')]:
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temporary:
    directory=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
    job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Fundo #DDEEFF, fonte Georgia.'},'calls':0,'totalCalls':0,'rootStarted':time.monotonic()}
    initial={'rendered':True,'errors':[],'observedUI':'Hello World','controls':[]};session=Mock();session.initial=initial;session.call.return_value={**initial,'actionPassed':True,'lastStep':{'op':op,'value':expected}}
    with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{'goal':'Conferir mudança visual','data':[]},{'kind':kind},{'value':expected}]),patch.object(ui,'LiveBrowser',return_value=session):result=ui.run_ui_verifier(e,job,[],directory,initial,lambda _:None)
    self.assertTrue(result['passed']);self.assertEqual(result['steps'],[{'op':op,'value':expected}]);session.call.assert_called_once_with('/action',{'op':op,'control':'','value':expected,'dialog':'none'})
    for invalid in [{'op':op,'value':'url(http://example.test)'},{'op':op,'value':expected,'target':{'by':'text','name':'other'}}]:
     with self.assertRaises(ValueError):validate_ui_steps([invalid])
 def test_unavailable_scenario_records_not_tested_without_browser_and_keeps_all_approved_obligations(self):
  context={'contextVersion':2,'objective':'Reservas','behavior':'Reservar horário autorizado','criteria':['Sem sobreposição'],'testCases':[{'criterionIndex':0,'description':'Reservar por teclado'}],'approved':{'requirements':{'nonFunctional':['Teclado obrigatório.'],'businessRules':['Somente usuário autorizado.']},'technicalPlan':{'architecture':'Não alterar integração.'},'decisions':[{'summary':'Sem cobrança.'}],'scopeRevision':3}}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);job={'intent':{'testContext':context},'totalCalls':0};e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)))
   with patch.object(ui,'ask_local',return_value={'supported':False,'limitation':'O cenário exige teclado e autorização no backend.'}) as ask,patch.object(ui,'LiveBrowser') as browser:
    result=ui.run_ui_verifier(e,job,[],directory,{'observedUI':'Reserva disponível'},lambda _:None)
   browser.assert_not_called();self.assertEqual(ask.call_count,1);self.assertEqual(ask.call_args.args[3]['approved'],context);self.assertFalse(result['passed']);self.assertFalse(result['repairable']);self.assertEqual(result['coverage']['status'],'not_tested');self.assertEqual(result['coverage']['verifiedCriterionIndices'],[]);self.assertFalse(result['coverage']['completeAcceptance']);self.assertFalse(result['coverage']['legacy']);self.assertIn('backend',json.loads((directory/'ui-assessment.json').read_text())['error']);self.assertNotIn('steps',result)
 def test_successful_scenario_passes_full_scope_to_each_specialist_without_certifying_acceptance(self):
  context={'contextVersion':2,'objective':'Consultar reserva','behavior':'Exibir Disponível','criteria':['Exibir Disponível'],'testCases':[],'approved':{'requirements':{'businessRules':['Não alterar reservas existentes.']},'technicalPlan':{'architecture':'Somente consulta.'},'decisions':[],'scopeRevision':3}}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'testContext':context},'calls':0,'totalCalls':0};e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps)
   state={'rendered':True,'errors':[],'observedUI':'Disponível','controls':[]};session=Mock();session.initial=state;session.call.return_value={**state,'actionPassed':True,'lastStep':{'op':'expect_text','value':'Disponível'}}
   with patch.object(ui,'ask_local',side_effect=[{'supported':True,'limitation':''},{'goal':'Conferir disponibilidade','data':[]},{'kind':'text'},{'value':'Disponível'},{'action':'assert_result','value':''}]) as ask,patch.object(ui,'LiveBrowser',return_value=session):result=ui.run_ui_verifier(e,job,[],directory,state,lambda _:None)
   self.assertTrue(result['passed']);self.assertEqual(result['coverage']['status'],'scenario_passed');self.assertFalse(result['coverage']['completeAcceptance']);self.assertEqual(result['coverage']['verifiedCriterionIndices'],[])
   for call in ask.call_args_list:self.assertIn(context,call.args[3].values())
 def test_edit_after_validation_feedback_requires_resubmission_and_saved_reset_does_not_repeat_prerequisites(self):
  controls=[{'id':'f','role':'textbox','name':'Valor','section':'Despesas','value':''},{'id':'s','role':'combobox','name':'Tipo','section':'Despesas','options':['Escolha','Mensal'],'selected':'Mensal'},{'id':'b','role':'button','name':'Registrar','section':'Despesas'}]
  initial={'rendered':True,'errors':[],'observedUI':'Formulário de despesas','controls':controls}
  rejected={**initial,'observedUI':'Preencha o valor'};prepared={**rejected,'observedUI':'Valor preenchido'}
  saved={**initial,'observedUI':'Despesa registrada.','controls':[{**c,'selected':'Escolha'} if c['id']=='s' else c for c in controls]}
  session=Mock();session.initial=initial
  session.call.side_effect=[{**rejected,'actionPassed':True,'lastStep':{'op':'click','target':{'by':'role','role':'button','name':'Registrar'}}},{**prepared,'actionPassed':True,'lastStep':{'op':'fill','target':{'by':'role','role':'textbox','name':'Valor'},'value':'10'}},{**saved,'actionPassed':True,'lastStep':{'op':'click','target':{'by':'role','role':'button','name':'Registrar'}}},{**saved,'actionPassed':True,'lastStep':{'op':'expect_text','value':'Despesa registrada.'}}]
  answers=[{'supported':True,'limitation':''},{'goal':'Registrar despesa','data':[{'field':'Valor da despesa','value':'10'}]},{'kind':'text'},{'value':'Despesa registrada.'},{'control':'b'},{'selections':[{'control':'s','value':'Mensal'}]},{'control':''},{'action':'click_b','value':''},{'action':'fill_f','value':'10'},{'action':'click_b','value':''}]
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),validate_ui_steps=validate_ui_steps);job={'intent':{'id':'a'*64,'expectedSha':'b'*40,'prompt':'Registrar e conferir Despesa registrada.'},'totalCalls':0}
   with patch.object(ui,'ask_local',side_effect=answers) as ask,patch.object(ui,'LiveBrowser',return_value=session):result=ui.run_ui_verifier(e,job,[],Path(temporary),initial,lambda _:None)
   self.assertTrue(result['passed']);self.assertEqual([call.args[1]['op'] for call in session.call.call_args_list],['click','fill','click','expect_text'])
   pending=ask.call_args_list[-1].args[3]
   self.assertNotIn('reload',pending['availableActions']);self.assertNotIn('assert_result',pending['availableActions']);self.assertIn('Registrar',pending['currentGoal'])
   self.assertEqual(ask.call_count,len(answers));session.close.assert_called_once()
 def test_context_over_budget_is_refused_before_inference_without_discarding_any_rule(self):
  job={'calls':0,'totalCalls':0,'rootStarted':time.monotonic()};scope={'approved':{'requirements':{'businessRules':['x'*27000]}}};original=json.dumps(scope)
  with patch.object(ui.urllib.request,'build_opener') as opener,self.assertRaisesRegex(ValueError,'context exceeds'):ui.ask_local(SimpleNamespace(CONFIG={}),job,'bounded',scope,{},80)
  opener.assert_not_called();self.assertEqual(job['totalCalls'],0);self.assertEqual(json.dumps(scope),original)
 def test_invalid_capability_assessment_cannot_start_planning_or_browser(self):
  for value in [{'supported':1,'limitation':''},{'supported':False,'limitation':''},{'supported':True,'limitation':'','tools':['write_file']},{'supported':False,'limitation':'x'*501}]:
   with self.subTest(value=value),tempfile.TemporaryDirectory() as temporary:
    e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,data:path.write_text(json.dumps(data)));job={'intent':{},'totalCalls':0}
    with patch.object(ui,'ask_local',return_value=value) as ask,patch.object(ui,'LiveBrowser') as browser,self.assertRaisesRegex(ValueError,'capacidade'):ui.run_ui_verifier(e,job,[],Path(temporary),{},lambda _:None)
    self.assertEqual(ask.call_count,1);browser.assert_not_called()
if __name__=='__main__':unittest.main()
