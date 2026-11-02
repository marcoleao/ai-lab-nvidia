"""Scoped local editor contracts. No model, application or business database."""
import json,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
import coding_micro as micro
import coding_service as service
class MicroContracts(unittest.TestCase):
 def test_display_literal_is_copied_from_original_approval_not_intermediate_goal_or_source_code(self):
  context={'behavior':'Exibir "Consulta agendada.".','criteria':['Não alterar a confirmação aprovada.'],'approved':{'requirements':{'businessRules':['Mensagem exata: "Consulta agendada.".']},'codeDestination':{'description':'"Segredo fora dos textos de interface"'}}}
  choices=micro.display_text_choices(context);self.assertEqual(list(choices.values()),['Consulta agendada.'])
  slot={'kind':'JSXElement','code':'<p>Criado</p>'};self.assertEqual(micro.source_role(slot),'display_text');self.assertEqual(micro.display_text_expression({'textId':'text1'},choices,slot),'<p>{"Consulta agendada."}</p>')
  for code in ['<button>Criado</button>','<label>Criado</label>','<p>{message}</p>','<p onClick={run}>Criado</p>','<script>Criado</script>']:
   self.assertIsNone(micro.display_text_source({**slot,'code':code}))
  for proposal in [{'textId':'unknown'},{'textId':'text1','content':'fake'},{'text':'Consulta agendada'}]:
   with self.assertRaises(ValueError):micro.display_text_expression(proposal,choices,slot)
  escaped=micro.display_text_expression({'textId':'text1'},{'text1':'<b>Texto</b> "exato"'},slot);self.assertEqual(escaped,'<p>{"<b>Texto</b> \\"exato\\""}</p>'.replace('\\\\','\\'))
 def test_current_goal_is_explicit_without_losing_reference_or_inference_guards(self):
  data={'goal':'Corrigir apenas o segundo resultado','approvedRequirements':{'qualityFindings':['Outro resultado também exige correção.']},'sourceIndex':{'slots':['observed']}}
  schema={'type':'object'}
  with patch.object(micro,'_ask_local',return_value={'slots':[]}) as inference:
   value=micro.ask_local(None,{},'Selecione trechos.',data,schema,180,reasoning=True)
  self.assertEqual(value,{'slots':[]});self.assertEqual(inference.call_args.args[3],{'currentTask':{'goal':data['goal']},'reference':data});self.assertEqual(inference.call_args.args[4],schema);self.assertEqual(inference.call_args.args[5],180);self.assertTrue(inference.call_args.kwargs['reasoning'])
  native={'approvedGeneration':{'story':{'qualityFindings':[{'message':'Corrigir somente Confirmation.'}]},'specification':{'requirements':'Preservar formulário já funcional.'}}}
  self.assertEqual(micro.implementation_focus(native),{'qualityFindings':[{'message':'Corrigir somente Confirmation.'}]});self.assertEqual(micro.implementation_focus({'criteria':['Regra não desaparece.']}),{})
  self.assertEqual(native['approvedGeneration']['specification']['requirements'],'Preservar formulário já funcional.');self.assertEqual(micro.implementation_focus(native,'Falha observada atual'),{'observedFailure':'Falha observada atual'})
  self.assertEqual(micro.implementation_focus({'approvedGeneration':{'story':{'qualityFindings':[]},'specification':{'requirements':'Criar a interface aprovada.'}}}),{'technicalRequirements':'Criar a interface aprovada.'})
  self.assertEqual(list(inference.call_args.args[3]),['reference','currentTask'])
 def test_native_planning_focus_preserves_global_constraints_and_inference_policy(self):
  focus={'qualityFindings':[{'message':'Validar a conversão completa.'}],'technicalRequirements':'Preservar os controles.'}
  data={'implementationFocus':focus,'approvedRequirements':{'criteria':['Aceitar decimais completos.','Recusar prefixos parciais.']},'maxChanges':2}
  schema={'type':'object','properties':{'changes':{'type':'array','maxItems':2}}}
  with patch.object(micro,'_ask_local',return_value={'changes':[]}) as inference:micro.ask_local(None,{},'Planeje.',data,schema,600)
  self.assertEqual(inference.call_args.args[3],{'currentTask':{'implementationFocus':focus},'reference':data});self.assertEqual(inference.call_args.args[4],schema);self.assertEqual(inference.call_args.args[5],600);self.assertEqual(inference.call_args.kwargs,{})
  empty={'implementationFocus':{},'approvedRequirements':data['approvedRequirements']}
  with patch.object(micro,'_ask_local',return_value={}) as inference:micro.ask_local(None,{},'Planeje.',empty,schema,600)
  self.assertEqual(inference.call_args.args[3],empty)
 def test_component_index_exposes_existing_guards_within_original_total_text_budget(self):
  content='function App(){'+('const padding=0;'*200)+'if(empty)return;save();reset();}'
  slot={'slot':'s1','kind':'FunctionDeclaration','binding':'App','line':1,'code':content}
  view=micro.slot_index([slot],'Preservar bloqueio vazio e limpeza',['save'])
  self.assertEqual(view['slots'][0]['code'],content);self.assertTrue(view['slots'][0]['codeComplete']);self.assertTrue(view['complete'])
  many=[{**slot,'slot':'s'+str(index),'code':'x'*6000} for index in range(60)]
  view=micro.slot_index(many,'Ajustar',[]);self.assertEqual(len(view['slots']),48);self.assertFalse(view['complete']);self.assertEqual(view['totalObservedSlots'],60);self.assertLessEqual(sum(len(item['code']) for item in view['slots']),48*180);self.assertTrue(all(not item['codeComplete'] for item in view['slots']))
 def test_decimal_policy_cannot_supply_source_code_identifiers_or_unsupported_syntax(self):
  slot={'kind':'CallExpression','code':"parseFloat(mass.replace(',', '.'))"}
  policy={'maxFractionDigits':2,'allowSign':False,'allowLeadingDecimal':False,'trim':True,'positiveOnly':True}
  self.assertEqual(micro.numeric_input_source(slot),'mass');self.assertEqual(micro.source_role(slot),'numeric_input')
  self.assertEqual(micro.numeric_input_source({**slot,'code':'Number.parseFloat(payload.replace(",", "."))'}),'payload')
  for code in ['parseFloat(number)','parseFloat(read().replace(",", "."))','parseFloat(mass.replace("x", "."))','parseFloat(mass.replace(/,/g, "."))','parseFloat(mass.replace(",", "."));evil()']:
   with self.subTest(code=code):self.assertIsNone(micro.numeric_input_source({**slot,'code':code}))
  for update in [{'maxFractionDigits':True},{'maxFractionDigits':13},{'decimalSeparators':['e']},{'decimalSeparators':['.','.']},{'trim':1},{'source':'other'},{'content':'evil()'}]:
   with self.subTest(update=update),self.assertRaises(ValueError):micro.numeric_input_expression({**policy,**update},slot)
  with self.assertRaises(ValueError):micro.numeric_input_expression(policy,{'kind':'CallExpression','code':'parseFloat(read())'})
  self.assertIn('mass.trim()',micro.numeric_input_expression(policy,slot));self.assertIn('Number.isFinite',micro.numeric_input_expression(policy,slot))
 def test_numeric_profile_compiles_policy_without_accepting_model_code_or_rewriting_controls(self):
  content="export const amount=parseFloat(mass.replace(',', '.'));";path='src/amount.js'
  slot={'slot':'s1','kind':'CallExpression','binding':'amount','line':1,'code':"parseFloat(mass.replace(',', '.'))",'contains':[]}
  policy={'maxFractionDigits':2,'allowSign':False,'allowLeadingDecimal':False,'trim':True,'positiveOnly':True}
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':content}],'prompt':'Aceitar somente decimais completos positivos com até duas casas.','allowDependencies':False}
  responses=[{'changes':[{'path':path,'goal':'Validar o número inteiro completo','queries':['amount']}]},{'path':path},{'slots':['s1']},policy]
  compiled=[]
  def compile(*args):
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':[slot]}
   compiled.extend(args[5]);return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[{'path':path,'content':'export const amount='+args[5][0]['content']+';'}]},'tools':[]}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   with patch.object(micro,'ask_local',side_effect=responses) as ask,patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
  self.assertEqual(result['state'],'succeeded');self.assertEqual(compiled,[{'slot':'s1','content':micro.numeric_input_expression(policy,slot)}]);self.assertNotIn('content',ask.call_args.args[4]['properties']);self.assertNotIn('source',ask.call_args.args[4]['properties'])
  self.assertFalse(ask.call_args_list[2].kwargs['reasoning']);self.assertEqual(ask.call_args_list[2].args[4]['properties']['slots']['items']['enum'],['s1']);self.assertNotIn('minItems',ask.call_args_list[2].args[4]['properties']['slots'])
 def test_small_capability_plan_covers_two_distinct_sources_but_repair_remains_one(self):
  changes=[{'path':'src/App.jsx','goal':'Implementar os controles nativos e seu estado','queries':['App']},{'path':'src/app.css','goal':'Aplicar o layout aprovado','queries':['main']}]
  self.assertEqual(micro.validate_plan({'changes':changes},{c['path'] for c in changes},2),changes)
  with self.assertRaises(ValueError):micro.validate_plan({'changes':changes},{c['path'] for c in changes})
  with self.assertRaises(ValueError):micro.validate_plan({'changes':[changes[0],changes[0]]},{'src/App.jsx'},2)
  self.assertEqual(micro.source_role({'kind':'Stylesheet'}),'stylesheet');self.assertEqual(micro.source_role({'kind':'FunctionDeclaration'}),'component')
  self.assertEqual(micro.source_role({'kind':'InlineStyle'}),'layout')

 def test_inspection_refusal_is_a_known_failure_and_does_not_request_an_edit(self):
  files=[{'path':'src/app.css','content':'main{color:black}'}]
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':files,'prompt':'Ajustar layout','allowDependencies':False}
  responses=[{'changes':[{'path':'src/app.css','goal':'Ajustar layout','queries':['main']}]},{'path':'src/app.css'}]
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=responses) as ask,patch.object(micro,'apply_proposal',return_value={'state':'failed','diagnosticCode':'SOURCE_INSPECTION_FAILED'}):result=micro.micro_implementation(e,intent,Path(temporary),{},files,'','implementation')
  self.assertEqual(result['state'],'failed');self.assertEqual(result['diagnosticCode'],'SOURCE_INSPECTION_FAILED');self.assertNotIn('patch',result);self.assertEqual(ask.call_count,2)

 def test_web_url_role_reaches_compiler_with_policy_only_and_records_the_proposal(self):
  content=r'export const photoURL=/^https:\/\//i;';path='src/form.js'
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':content}],'prompt':'Corrigir foto HTTP e HTTPS.','allowDependencies':False}
  intent['testContext']={'contextVersion':2,'objective':'Validar entrada','behavior':'Aceitar os protocolos aprovados','criteria':['Entrada válida'],'testCases':[],'approved':{'name':'Entrada','runtime':None,'requirements':{'businessRules':['Preservar os dados existentes.'],'nonFunctional':['Teclado.']},'technicalPlan':{'architecture':'Manter validação local.'},'decisions':[{'summary':'Sem integração externa.'}],'tasks':[],'codeDestination':None,'scopeRevision':3}}
  policy={'schemes':['http','https'],'allowPort':True,'allowQuery':True,'extensions':['svg']}
  slot={'slot':'s1','kind':'RegExpLiteral','binding':'photoURL','line':1,'code':'/^https:\\/\\//i','pattern':r'^https:\/\/','flags':'i','before':'export const photoURL=','after':';'}
  changed={'path':path,'content':'export const photoURL=/^https?:/i;'}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   responses=[{'changes':[{'path':path,'goal':'Validar foto HTTP e HTTPS','queries':['photoURL']}]},{'path':path},{'slots':['s1']},policy]
   def compile(*args):
    if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':[slot]}
    self.assertEqual(args[5],[{'slot':'s1','urlPolicy':policy,'flags':'i'}])
    return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[changed]},'tools':[]}
   with patch.object(micro,'ask_local',side_effect=responses) as ask,patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,directory,{},intent['files'],'','implementation')
   for call in ask.call_args_list:
    self.assertEqual(call.args[3]['approvedRequirements'],intent['testContext'])
   self.assertEqual(ask.call_args_list[1].args[3]['proposedPath'],path)
   self.assertEqual(result['patch']['files'],[changed]);self.assertEqual(result['state'],'succeeded')
   self.assertEqual(json.loads((directory/'micro-implementation-1-proposal-1.json').read_text())['attempted'][0]['proposal'],policy)
 def test_url_policy_is_only_bounded_data_and_cannot_pick_host_code_or_revision(self):
  policy={'schemes':['http','https'],'allowPort':True,'allowQuery':True,'extensions':['svg','jpg','png']}
  self.assertEqual(micro.validate_url_policy(policy),policy)
  for change in [{'schemes':['javascript']},{'extensions':['svg);evil()']},{'allowPort':1},{'host':'fixed.test'},{'schemes':['http','http']},{'expectedDigest':'a'*64}]:
   with self.subTest(change=change),self.assertRaises(ValueError):micro.validate_url_policy({**policy,**change})
  web={'kind':'RegExpLiteral','pattern':r'^(https?:\/\/)?([a-z]+)','flags':'i'}
  self.assertEqual(micro.source_role(web),'web_url');self.assertEqual(micro.source_role({**web,'flags':'g'}),'pattern');self.assertEqual(micro.source_role({**web,'pattern':'^a+$'}),'pattern')
  with patch.object(micro,'ask_local') as ask:self.assertEqual(micro.choose_role(None,{},'Validar foto HTTP',[web],{}),'web_url')
  ask.assert_not_called()
 def test_expression_syntax_repair_uses_only_the_rejected_fragment_and_parser_issue(self):
  slot={'slot':'s1','kind':'CallExpression','code':'render(<App/>)'}
  requirements={'criteria':['App dentro do Provider'],'behavior':'Large source-independent context'}
  fault={'fragmentSyntaxIssue':{'message':'Unexpected token, expected comma','line':1,'column':10},'rejectedProposal':{'edits':[{'slot':'s1','content':'render(<Provider><App/></Provider>'},{'slot':'s2','content':'unrelated'}]}}
  value=micro.expression_editor_input('Envolver App',requirements,slot,[{'content':'large caller'}],None,fault)
  self.assertEqual(value['rejectedExpression'],'render(<Provider><App/></Provider>');self.assertEqual(value['compilerSyntax'],fault['fragmentSyntaxIssue']);self.assertEqual(value['mode'],'syntax_only_repair');self.assertEqual(value['approvedRequirements'],requirements);self.assertNotIn('readOnlyCallers',value)
  original=micro.expression_editor_input('Envolver App',requirements,slot,[],None,None);self.assertEqual(original['approvedRequirements'],requirements);self.assertEqual(original['fragment'],slot)
 def test_failed_pattern_examples_preserve_original_scope_and_frozen_examples(self):
  requirements={'criteria':['Aceitar HTTP e HTTPS com IP e porta.'],'behavior':'Large cross-cutting history context'}
  slot={'pattern':'rejected-hostname-template','flags':'i','before':'source before','after':'source after'}
  examples=[{'value':'http://127.0.0.1:8049/jewel.svg','expected':True}]
  checks=[{'exampleIndex':0,'expected':True,'observed':False,'passed':False}]
  value=micro.pattern_editor_input('Validar URL',requirements,slot,examples,None,{'patternChecks':checks,'rejectedProposal':{'pattern':'failed'}})
  self.assertEqual(value['approvedRequirements'],requirements);self.assertEqual(value['validationContract'],{'mustMatch':[examples[0]['value']],'mustReject':[]});self.assertEqual(value['fixedFlags'],'i');self.assertEqual(value['failedExamples'],[{'input':examples[0]['value'],'expectedMatch':True,'observedMatch':False}])
  self.assertNotIn('currentPattern',value);self.assertNotIn('rejectedProposal',value);self.assertNotIn('before',value)
  original=micro.pattern_editor_input('Validar URL',requirements,slot,examples,None,{'error':'Invalid syntax'})
  self.assertEqual(original['currentPattern'],slot['pattern']);self.assertEqual(original['approvedRequirements'],requirements)
  with self.assertRaisesRegex(ValueError,'identidade'):micro.pattern_editor_input('Validar URL',requirements,slot,examples,None,{'patternChecks':[{**checks[0],'exampleIndex':8}]})
 def test_pattern_examples_only_classify_literal_approved_inputs_without_changing_values(self):
  scope={'behavior':'Aceitar http://127.0.0.1:8049/jewel.svg e recusar javascript:alert(1).'}
  samples=micro.literal_pattern_samples(scope)
  self.assertEqual(list(samples.values()),['http://127.0.0.1:8049/jewel.svg','javascript:alert(1)'])
  value={'examples':[{'id':'example1','matches':True},{'id':'example2','matches':False}]}
  self.assertEqual(micro.validate_pattern_examples(value,samples),[{'value':'http://127.0.0.1:8049/jewel.svg','expected':True},{'value':'javascript:alert(1)','expected':False}])
  for bad in [{'examples':[{'id':'invented','matches':True}]},{'examples':[{'id':'example1','matches':1}]},{'examples':[{'id':{},'matches':True}]},{'examples':[{'id':'example1','matches':True,'value':'changed'}]},{'examples':[{'id':'example1','matches':True}]*2}]:
   with self.subTest(value=bad),self.assertRaises(ValueError):micro.validate_pattern_examples(bad,samples)
  with self.assertRaisesRegex(ValueError,'oito'):micro.literal_pattern_samples({'behavior':' '.join('http://sample.test/'+str(i) for i in range(9))})
  with self.assertRaisesRegex(ValueError,'300'):micro.literal_pattern_samples({'behavior':'http://sample.test/'+('x'*301)})
  with patch.object(micro,'ask_local',return_value=value) as ask:
   self.assertEqual(len(micro.pattern_examples(None,{},'Validar URLs',scope)),2)
  self.assertEqual(ask.call_args.args[3]['literalSamples'],samples)
  with patch.object(micro,'ask_local') as ask:self.assertEqual(micro.pattern_examples(None,{},'Somar',{'criteria':['Somar dois valores']}),[])
  ask.assert_not_called()
 def test_named_test_scripts_are_not_offered_as_application_edit_paths(self):
  files=[{'path':'scripts/test.mjs','content':'export const test=1;'},{'path':'tests/a.jsx','content':'export const test=1;'},{'path':'src/App.test.jsx','content':'export const test=1;'},{'path':'src/App.jsx','content':'export const App=()=>null;'}]
  intent={'files':files,'prompt':'Corrigir aplicação','expectedSha':'a'*40}
  with patch.object(micro,'ask_local',side_effect=RuntimeError('stop before model')) as ask:
   with self.assertRaisesRegex(RuntimeError,'stop before model'):micro.micro_implementation(SimpleNamespace(dump=Mock()),intent,Path('/unused'),{},files,'','implementation')
  self.assertEqual(ask.call_args.args[3]['allowedWritePaths'],['src/App.jsx'])
 def test_single_source_repair_keeps_one_writable_path_without_weakening_preservation_guard(self):
  files=[{'path':'src/Booking.jsx','content':'function Booking(){return null}'},{'path':'src/Settings.jsx','content':'function Settings(){return null}'}]
  intent={'files':files,'prompt':'Corrigir somente o resultado observado, preservando configurações.','expectedSha':'a'*40}
  with patch.object(micro,'ask_local',side_effect=RuntimeError('stop before inference')) as ask:
   with self.assertRaisesRegex(RuntimeError,'stop before inference'):
    micro.micro_implementation(SimpleNamespace(dump=Mock()),intent,Path('/unused'),{'repairPaths':['src/Booking.jsx']},files,'falha observada','targeted_repair')
  self.assertEqual(ask.call_args.args[4]['properties']['readOnlyPaths']['maxItems'],0)
  self.assertEqual(ask.call_args.args[3]['allowedWritePaths'],['src/Booking.jsx'])
  edit={'path':'src/Booking.jsx','goal':'Corrigir resultado','queries':['Booking']}
  with self.assertRaisesRegex(ValueError,'somente leitura'):
   micro.validate_plan({'changes':[edit],'readOnlyPaths':['src/Booking.jsx']},{'src/Booking.jsx'})
 def test_literal_path_observations_find_compact_sources_and_disclose_partial_lines(self):
  files=[{'path':'src/Context.jsx','content':'export const store={items:[]};'},{'path':'src/Form.jsx','content':'x'*300+';const validateUrl=value=>/^https?:/.test(value);'},{'path':'src/View.jsx','content':'\n'.join('const photoURL'+str(i)+'=value;' for i in range(5))}]
  matches=micro.source_matches(files,['URL','HTTP','validação'])
  self.assertEqual([entry['path'] for entry in matches],['src/Form.jsx','src/View.jsx'])
  self.assertIn('validateUrl',matches[0]['matches'][0]['content']);self.assertFalse(matches[0]['matches'][0]['contentComplete'])
  self.assertEqual(matches[1]['totalMatchingLines'],5);self.assertTrue(matches[1]['matchesLimited']);self.assertEqual(len(matches[1]['matches']),3)
  self.assertEqual(micro.source_matches(files,['invented query']),[])
 def test_locator_schema_and_runtime_reject_a_path_without_the_observed_query(self):
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':'src/Context.jsx','content':'export const store={};'},{'path':'src/Form.jsx','content':'export const validateURL=x=>false;'}],'prompt':'Corrigir URL','allowDependencies':False}
  plan={'changes':[{'path':'src/Context.jsx','goal':'Corrigir URL','queries':['URL']} ]}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=[plan,{'path':'src/Context.jsx'}]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaisesRegex(ValueError,'ocorrências observadas'):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
   self.assertEqual(ask.call_args.args[4]['properties']['path']['enum'],['src/Form.jsx']);compiler.assert_not_called()
 def test_editors_keep_original_approved_requirements_even_when_the_locator_goal_is_poor(self):
  intent={'prompt':'Instruções completas','testContext':{'objective':'Preço BRL','behavior':'Criar item','criteria':['Exibir R$ 0,00.','Preservar categoria obrigatória.'],'testCases':[]}}
  self.assertEqual(micro.approved_requirements(intent),intent['testContext'])
  self.assertEqual(micro.approved_requirements({'prompt':'Somar, preservando multiply.'}),{'approvedInstructions':'Somar, preservando multiply.','contextCoverage':'legacy_prompt_only'})
  view=micro.slot_index([{'slot':'s0','kind':'ImportInsertion','code':''},{'slot':'s1','kind':'CallExpression','code':'amount.toFixed(2)'}],'Preço',['toFixed']);self.assertEqual([s['slot'] for s in view['slots']],['s1'])
 def test_literal_pattern_inputs_work_across_domains_preserve_punctuation_and_refuse_oversize(self):
  requirements={'criteria':['Aceitar "PT-42" e rejeitar “PT 42”. Exemplo literal com ponto: `AB.`.'],'approved':{'requirements':{'businessRules':['Reservas usam "2030-12-31".']},'"not an input"':True}}
  self.assertEqual(list(micro.literal_pattern_samples(requirements).values()),['PT-42','PT 42','AB.','2030-12-31'])
  for count in [301,600]:
   with self.subTest(count=count),self.assertRaisesRegex(ValueError,'300'):micro.literal_pattern_samples({'criteria':['Aceitar "'+'a'*count+'".']})
 def test_native_implementation_keeps_review_findings_once_only_when_ui_projection_is_identical(self):
  story={'name':'Reservas','runtime':{'name':'React'},'objective':'Confirmar reserva','behavior':'Conferir retorno','criteria':['Reserva confirmada.'],'requirements':{'businessRules':['Preservar consulta anterior.']},'decisions':[],'tasks':[],'codeDestination':None,'qualityFindings':[{'path':'src/Booking.jsx','line':9,'message':'Impedir confirmação sem modalidade.'}],'qualityCorrection':{'expectedSha':'a'*40}}
  spec={'requirements':'Preservar formulário','architecture':'React atual','risks':['Não substituir campos'],'testCases':[{'criterionIndex':0,'description':'Confirmar pela interface.'}]}
  payload={'story':story,'specification':spec,'specialistContract':{'workflow':'focused-local-v1'},'capabilities':{'dependencies':False}}
  context={'contextVersion':2,'objective':story['objective'],'behavior':story['behavior'],'criteria':story['criteria'],'testCases':spec['testCases'],'approved':{**{key:story[key] for key in ['name','runtime','requirements','decisions','tasks','codeDestination']},'technicalPlan':{key:value for key,value in spec.items() if key!='testCases'},'scopeRevision':3}}
  intent={'prompt':'user: '+json.dumps(payload,ensure_ascii=False),'testContext':context};original=json.dumps(intent)
  value=micro.approved_requirements(intent)
  self.assertEqual(value['approvedGeneration'],payload);self.assertEqual(value['testContextIdentity'],{'contextVersion':2,'scopeRevision':3});self.assertNotIn('approvedTestContext',value)
  self.assertEqual(value['approvedGeneration']['story']['qualityFindings'],story['qualityFindings']);self.assertEqual(json.dumps(intent),original)
  suffix='\n\nuser: Preservar a mensagem "Reserva confirmada." e o formulário.\nNão remover validações.'
  initial={**intent,'prompt':intent['prompt']+suffix};shared=micro.approved_requirements(initial)
  self.assertEqual(shared['approvedGeneration'],payload);self.assertEqual(shared['additionalInstructions'],suffix);self.assertEqual(shared['contextCoverage'],'generation_and_identical_ui_projection_with_additional_instructions');self.assertNotIn('approvedTestContext',shared)
  self.assertEqual(micro.implementation_focus(shared),{'qualityFindings':story['qualityFindings']});self.assertEqual(shared['approvedGeneration']['specification']['requirements'],spec['requirements']);self.assertEqual(initial['prompt'],intent['prompt']+suffix)
  divergent=micro.approved_requirements({**initial,'testContext':{**context,'criteria':['Outra regra.']}});self.assertEqual(divergent['approvedInstructions'],initial['prompt']);self.assertEqual(divergent['approvedTestContext']['criteria'],['Outra regra.'])
  prefix=json.dumps({**payload,'transportEvidence':''},ensure_ascii=False,separators=(',',':')).split('"transportEvidence":"')[0]+'"transportEvidence":"';units=len(prefix.encode('utf-16-le'))//2
  padded={**payload,'transportEvidence':'x'*(12999-units)+'💎'+'x'*2000};serialized=json.dumps(padded,ensure_ascii=False,separators=(',',':')).encode('utf-16-le');chunks=[serialized[index:index+26000].decode('utf-16-le',errors='surrogatepass') for index in range(0,len(serialized),26000)]
  label='Escopo aprovado e manifesto do workspace de codificação'
  messages=[f'user: {label} · parte {index+1}/{len(chunks)}. Dados de referência; leia todas as partes em ordem.\n'+chunk for index,chunk in enumerate(chunks)];fragmented_prompt='\n\n'.join(messages)
  complete=micro.approved_requirements({'prompt':fragmented_prompt+suffix,'testContext':context});self.assertEqual(complete['approvedGeneration'],padded);self.assertEqual(complete['additionalInstructions'],suffix);self.assertTrue(complete['generationTransport']['complete']);self.assertEqual(complete['generationTransport']['fragmentCount'],len(chunks))
  for malformed in [messages[0], '\n\n'.join(reversed(messages)),fragmented_prompt.replace('parte 2/','parte 3/',1),fragmented_prompt.replace(label,label+' errado',1),'\n\n'.join([messages[0]+'x',*messages[1:]])]:
   with self.subTest(malformed=malformed[:50]):
    retained=micro.approved_requirements({'prompt':malformed,'testContext':context});self.assertEqual(retained['approvedInstructions'],malformed);self.assertEqual(retained['approvedTestContext'],context)
  for changed in [{**context,'extraRule':'Preservar detalhes extras'},{**context,'criteria':['Critério divergente']},{**context,'approved':{**context['approved'],'decisions':[{'summary':'Nova regra explícita'}]}}]:
   with self.subTest(changed=changed):
    preserved=micro.approved_requirements({**intent,'testContext':changed});self.assertEqual(preserved['approvedInstructions'],intent['prompt']);self.assertEqual(preserved['approvedTestContext'],changed)
  fragmented={**intent,'prompt':'user: envelope parte 1/2\n'+json.dumps(payload)}
  self.assertEqual(micro.approved_requirements(fragmented)['approvedInstructions'],fragmented['prompt'])
  self.assertEqual(micro.approved_requirements(fragmented)['approvedTestContext'],context)
 def test_large_source_is_a_partial_index_and_only_the_selected_lines_can_change(self):
  content='\n'.join(f'export const marker_{i}={i};' for i in range(340))+'\nexport const formatAmount=n=>n.toFixed(2);\n';file={'path':'src/prices.js','content':content}
  index=micro.overview([file])[0];self.assertIsNone(index['smallSource']);self.assertFalse(index['complete']);self.assertTrue(index['symbolsLimited']);self.assertIn({'name':'toFixed','line':341},index['methodCalls'])
  source,seen=micro.focused_source(file,['formatAmount']);self.assertFalse(source['complete']);self.assertIn('341|export const formatAmount',source['content']);self.assertLess(len(source['content'].splitlines()),10)
  for value in [{'edits':[{'startLine':1,'endLine':1,'content':'wrong'}]},{'edits':[{'startLine':341,'endLine':341,'content':'right','path':'other.js'}]}]:
   with self.assertRaises(ValueError):micro.validate_edits(value,seen)
 def test_plans_cannot_escape_file_capabilities_or_hide_an_empty_scope(self):
  valid={'changes':[{'path':'a.js','goal':'Corrigir soma','queries':['sum']}]};self.assertEqual(micro.validate_plan(valid,{'a.js'}),valid['changes'])
  for value in [{'changes':[]},{'changes':[valid['changes'][0]]*2},{'changes':[{**valid['changes'][0],'goal':'x'*201}]},{'changes':[{**valid['changes'][0],'path':'b.js'}]},{'changes':[{**valid['changes'][0],'queries':[' ']}]},{**valid,'authorization':'invented'}]:
   with self.subTest(value=value),self.assertRaises(ValueError):micro.validate_plan(value,{'a.js'})
 def test_model_may_not_override_revision_path_or_overlap_read_ranges(self):
  for edits in [[{'startLine':1,'endLine':2,'content':'x'},{'startLine':2,'endLine':3,'content':'y'}],[{'startLine':True,'endLine':1,'content':'x'}],[{'startLine':1,'endLine':1,'content':'x','expectedDigest':'invented'}],[{'startLine':1,'endLine':100000000,'content':'x'}]]:
   with self.subTest(edits=edits),self.assertRaises(ValueError):micro.validate_edits({'edits':edits},{1,2,3})
 def run_editor(self,compiler_fails=0,repair=False,wrong_plan=False):
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':'src/a.js','content':'export const sum=(a,b)=>a-b;\n'},{'path':'src/b.js','content':'export const keep=1;'}],'prompt':'Corrigir apenas a soma.','allowDependencies':False}
  plan={'changes':[{'path':'src/b.js' if wrong_plan else 'src/a.js','goal':'Corrigir somente a soma para somar','queries':['sum']}]};selection={'slots':['s1']};proposal={'content':'a+b'};calls=[]
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(CONFIG={'model':'local:9b'},dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   job={'rootStarted':time.monotonic(),'started':time.monotonic(),'calls':0,'totalCalls':0,'repairPaths':['src/a.js']}
   def apply(e,job,current_intent,files,path,edits,expected,directory,phase,index):
    if edits is None:return {'state':'inspected','expectedDigest':expected,'complete':True,'slots':[{'slot':'s1','kind':'BinaryExpression','binding':'sum','line':1,'code':'a-b','before':'export const sum=(a,b)=>','after':';'}]}
    calls.append({'path':path,'expectedDigest':expected,'files':files})
    if len(calls)<=compiler_fails:return {'state':'failed','expectedSha':intent['expectedSha'],'error':'Syntax issue','validation':{'valid':False,'issues':[{'message':'Syntax issue'}]},'tools':[]}
    return {'state':'succeeded','expectedSha':intent['expectedSha'],'patch':{'files':[{'path':path,'content':'export const sum=(a,b)=>a+b;\n'}]},'validation':{'valid':True},'tools':[{'tool':'edit_file','result':'SUCCEEDED'}]}
   with patch.object(micro,'ask_local',side_effect=[plan,{'path':'src/a.js'},selection,proposal,proposal]) as ask,patch.object(micro,'apply_proposal',side_effect=apply) as compiler:
    try:result=micro.micro_implementation(e,intent,directory,job,intent['files'],'Falha observada','targeted_repair' if repair else 'implementation')
    except ValueError as error:result={'refused':str(error)}
    if len(ask.call_args_list)>=3:
     located=ask.call_args_list[2].args[3]
     self.assertEqual(located['literalQueries'],['sum']);self.assertEqual([row['path'] for row in located['literalMatches']],['src/a.js'])
     self.assertNotIn('src/b.js',[row['path'] for row in located['literalMatches']]);self.assertEqual(located['approvedRequirements'],micro.approved_requirements(intent))
   return result,calls,len(calls)
 def test_two_goals_on_same_file_keep_both_edits_and_rebase_second_on_updated_source(self):
  path='src/a.js';original='export const sum=(a,b)=>a-b;\nexport const multiply=(a,b)=>a+b;';intermediate=original.replace('=>a-b','=>a+b');final=intermediate.replace('multiply=(a,b)=>a+b','multiply=(a,b)=>a*b')
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':original}],'prompt':'Corrigir soma e multiplicação.','allowDependencies':False}
  plan={'changes':[{'path':path,'goal':'Corrigir soma','queries':['sum']},{'path':path,'goal':'Corrigir multiplicação','queries':['multiply']}]};observed=[]
  def compile(*args):
   content=next(f['content'] for f in args[3] if f['path']==path);self.assertEqual(args[6],micro.digest(content));self.assertEqual(args[2]['expectedSha'],intent['expectedSha'])
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':[{'slot':'s1','kind':'BinaryExpression','binding':'sum' if not observed else 'multiply','line':1,'code':'a-b' if not observed else 'a+b','contains':[]}]}
   observed.append(content);self.assertEqual(args[5][0]['content'],'a+b' if len(observed)==1 else 'a*b')
   return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[{'path':path,'content':intermediate if len(observed)==1 else final}]},'tools':[]}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   answers=[plan,{'path':path},{'slots':['s1']},{'content':'a+b'},{'path':path},{'slots':['s1']},{'content':'a*b'}]
   with patch.object(micro,'ask_local',side_effect=answers),patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
  self.assertEqual(observed,[original,intermediate]);self.assertEqual(result['patch']['files'],[{'path':path,'content':final}])
 def test_preservation_role_keeps_rebased_source_and_never_calls_an_editor(self):
  path='src/a.js';original='export const sum=(a,b)=>a-b;';updated=original.replace('a-b','a+b')
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':original}],'prompt':'Corrigir soma preservando controles existentes.','allowDependencies':False}
  plan={'changes':[{'path':path,'goal':'Corrigir soma','queries':['sum']},{'path':path,'goal':'Preservar controles existentes','queries':['sum']}]};edits=[]
  def compile(*args):
   content=next(file['content'] for file in args[3] if file['path']==path);self.assertEqual(args[6],micro.digest(content))
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':[{'slot':'s1','kind':'BinaryExpression','code':'a-b','contains':[]}]}
   edits.append(args[5]);return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[{'path':path,'content':updated}]},'tools':[]}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   with patch.object(micro,'ask_local',side_effect=[plan,{'path':path},{'slots':['s1']},{'content':'a+b'},{'path':path}]) as inference,patch.object(micro,'choose_role',side_effect=['expression','no_change']),patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,directory,{},intent['files'],'','implementation')
   self.assertEqual(json.loads((directory/'micro-implementation-plan.json').read_text())['plan'],plan);self.assertEqual(json.loads((directory/'micro-implementation-2-role.json').read_text()),{'role':'no_change'})
  self.assertEqual(len(edits),1);self.assertEqual(inference.call_count,5);self.assertEqual(result['patch']['files'],[{'path':path,'content':updated}])
 def test_typed_preservation_never_reaches_locator_router_or_editor(self):
  path='src/a.js';preserved='src/b.js';original='export const value=1;';updated='export const value=2;'
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':original},{'path':preserved,'content':'export const retained=true;'}],'prompt':'Alterar valor preservando controles.','allowDependencies':False}
  plan={'changes':[{'path':path,'goal':'Alterar valor','queries':['value'],'intent':'change'},{'path':preserved,'goal':'Preservar controles','queries':['retained'],'intent':'preserve'}],'readOnlyPaths':[preserved]}
  self.assertEqual(micro.validate_plan(plan,{path,preserved},2),plan['changes'])
  for value in ['skip','',None,True]:
   with self.subTest(value=value),self.assertRaises(ValueError):micro.validate_plan({'changes':[{**plan['changes'][0],'intent':value}]},{path},1)
  with self.assertRaises(ValueError):micro.validate_plan({'changes':[plan['changes'][1]]},{preserved},1)
  def compile(*args):
   self.assertEqual(args[4],path)
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(original),'complete':True,'slots':[{'slot':'s1','kind':'NumericLiteral','code':'1','contains':[]}]}
   return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[{'path':path,'content':updated}]},'tools':[]}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary);e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   with patch.object(micro,'ask_local',side_effect=[plan,{'path':path},{'slots':['s1']},{'content':'2'}]) as inference,patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,directory,{},intent['files'],'','implementation')
   self.assertEqual(json.loads((directory/'micro-implementation-2-preservation.json').read_text())['edited'],False);self.assertEqual(json.loads((directory/'micro-implementation-plan.json').read_text())['plan'],plan)
   self.assertEqual(inference.call_args_list[1].args[3]['allowedLocationPaths'],[path]);self.assertEqual(inference.call_count,4)
  self.assertEqual(result['patch']['files'],[{'path':path,'content':updated}])
 def test_preservation_repair_cannot_merge_drop_or_replace_original_goals(self):
  path='src/a.js';intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':'export const value=1;'}],'prompt':'Dois ajustes independentes.','allowDependencies':False}
  goals=[{'path':path,'goal':'Corrigir soma','queries':['value']},{'path':path,'goal':'Corrigir produto','queries':['value']}];plan={'changes':goals,'readOnlyPaths':[path]}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=[plan,{'readOnlyPaths':[]},RuntimeError('stop at locator')]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaisesRegex(RuntimeError,'stop at locator'):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
   self.assertEqual(set(ask.call_args_list[1].args[4]['properties']),{'readOnlyPaths'});self.assertEqual(ask.call_args_list[1].args[3]['rejectedPlan']['changes'],goals);compiler.assert_not_called()
   with patch.object(micro,'ask_local',side_effect=[plan,{'readOnlyPaths':[],'changes':goals[:1]}]),patch.object(micro,'apply_proposal') as compiler,self.assertRaisesRegex(ValueError,'só pode alterar'):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
   compiler.assert_not_called()
 def test_replacement_pattern_does_not_consume_predicate_examples_or_change_source_scope(self):
  path='src/normalize.js';content=r"export const normalize=value=>value.replace(/\s+/g,'');";slot={'slot':'s1','kind':'RegExpLiteral','pattern':r'\s+','flags':'g','binding':'normalize','line':1,'code':r'/\s+/g','before':'value.replace(','after':",'');",'contains':[]}
  self.assertFalse(micro.predicate_examples_applicable(slot));self.assertFalse(micro.predicate_examples_applicable({**slot,'before':'value.replaceAll(\n'}));self.assertTrue(micro.predicate_examples_applicable({**slot,'before':'const rule='}))
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':content}],'prompt':'Remover somente espaços das pontas. '+' '.join('"texto'+str(n)+'"' for n in range(12)),'allowDependencies':False}
  pattern=r'^\s+|\s+$';final=content.replace(r'/\s+/g','/'+pattern+'/g')
  def compile(*args):
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':[slot]}
   self.assertEqual(args[5],[{'slot':'s1','pattern':pattern,'flags':'g'}]);return {'state':'succeeded','validation':{'valid':True},'patch':{'files':[{'path':path,'content':final}]},'tools':[]}
  answers=[{'changes':[{'path':path,'goal':'Remover só espaços das pontas','queries':['normalize']}]},{'path':path},{'slots':['s1']},{'pattern':pattern}]
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda p,v:p.write_text(json.dumps(v)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   with patch.object(micro,'ask_local',side_effect=answers),patch.object(micro,'pattern_examples',side_effect=AssertionError('Predicate contract applied to substitution')),patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
  self.assertEqual(result['patch']['files'],[{'path':path,'content':final}])
 def test_one_scoped_proposal_has_no_model_selected_hash_or_path(self):
  result,calls,count=self.run_editor();self.assertEqual(result['state'],'succeeded');self.assertEqual(count,1);self.assertEqual(calls[0]['path'],'src/a.js');self.assertEqual(calls[0]['expectedDigest'],micro.digest('export const sum=(a,b)=>a-b;\n'));self.assertEqual([f['path'] for f in result['patch']['files']],['src/a.js'])
 def test_invalid_slot_selection_has_one_bounded_repair_without_accepting_unknown_or_duplicate_ids(self):
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':'src/Calc.js','content':'export const sum=(a,b)=>a-b;'}],'prompt':'Corrigir somente sum e preservar demais fontes.','allowDependencies':False}
  plan={'changes':[{'path':'src/Calc.js','goal':'Corrigir soma','queries':['sum']}],'readOnlyPaths':[]}
  inspected={'state':'inspected','expectedDigest':micro.digest(intent['files'][0]['content']),'complete':True,'slots':[{'slot':'s1','kind':'BinaryExpression','binding':'sum','line':1,'code':'a-b','before':'','after':''}]}
  for rejected in [{'slots':['s1','s1']},{'slots':['unobserved']},{'slots':['s1'],'extra':True}]:
   with self.subTest(rejected=rejected),tempfile.TemporaryDirectory() as temporary:
    e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
    with patch.object(micro,'ask_local',side_effect=[plan,{'path':'src/Calc.js'},rejected,{'slots':['s1']},RuntimeError('stop before replacement')]) as ask,patch.object(micro,'apply_proposal',return_value=inspected) as compiler:
     with self.assertRaisesRegex(RuntimeError,'stop before replacement'):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
     repair=ask.call_args_list[3];self.assertEqual(repair.args[3]['rejectedSelection'],rejected);self.assertEqual(repair.args[3]['approvedRequirements'],micro.approved_requirements(intent));self.assertTrue(repair.args[4]['properties']['slots']['uniqueItems']);compiler.assert_called_once();self.assertIsNone(compiler.call_args.args[5])
    with patch.object(micro,'ask_local',side_effect=[plan,{'path':'src/Calc.js'},rejected,rejected]) as ask,patch.object(micro,'apply_proposal',return_value=inspected) as compiler:
     with self.assertRaises(ValueError):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
     self.assertEqual(ask.call_count,4);compiler.assert_called_once();self.assertIsNone(compiler.call_args.args[5])
 def test_rejected_syntax_retries_the_same_frozen_source_once_and_never_returns_a_failed_patch(self):
  result,calls,count=self.run_editor(compiler_fails=1);self.assertEqual(result['state'],'succeeded');self.assertEqual(count,2);self.assertEqual(calls[0]['expectedDigest'],calls[1]['expectedDigest']);self.assertEqual(calls[0]['files'],calls[1]['files'])
  result,_,count=self.run_editor(compiler_fails=2);self.assertEqual(result['state'],'failed');self.assertNotIn('patch',result);self.assertEqual(count,2)
 def test_repair_cannot_plan_a_sibling_file_even_when_it_exists_in_the_context(self):
  result,_,count=self.run_editor(repair=True,wrong_plan=True);self.assertIn('refused',result);self.assertEqual(count,0)
 def test_file_locator_can_correct_a_hint_without_expanding_repair_capabilities(self):
  result,calls,_=self.run_editor(wrong_plan=True);self.assertEqual(result['state'],'succeeded');self.assertEqual(calls[0]['path'],'src/a.js')
 def test_regular_expression_role_cannot_choose_flags_paths_or_javascript_fields(self):
  self.assertEqual(micro.validate_pattern({'pattern':'^x+$'}),'^x+$')
  for value in [{'pattern':'x','flags':'g'},{'pattern':'x','path':'outside.js'},{'content':'function f(){}'},{'pattern':''}]:
   with self.assertRaises(ValueError):micro.validate_pattern(value)
 def test_dialog_message_role_cannot_choose_call_or_code_fields(self):
  self.assertEqual(micro.validate_dialog_text({'text':'Aviso de validação'}),'Aviso de validação')
  for value in [{'text':'x','callee':'eval'},{'content':'alert("x")'},{'text':False},{'text':'x'*2001}]:
   with self.assertRaises(ValueError):micro.validate_dialog_text(value)
 def test_numeric_locale_role_has_no_code_prefix_or_precision_capability(self):
  self.assertEqual(micro.validate_locale({'locale':'pt-BR'}),'pt-BR')
  for value in [{'locale':"pt-BR');alert(1)//"},{'locale':'pt-BR','precision':0},{'locale':False},{'content':'n.toFixed(2)'},{'locale':''}]:
   with self.assertRaises(ValueError):micro.validate_locale(value)
  self.assertEqual(micro.source_role({'kind':'CallExpression','numeric':{'precision':2}}),'numeric_locale')
 def test_role_router_confines_selection_to_one_supported_edit_capability(self):
  slots=[{'kind':'RegExpLiteral'},{'kind':'CallExpression','dialog':{'text':'aviso'}},{'kind':'CallExpression'}]
  requirements={'criteria':['Texto completo deve preservar o objetivo']}
  with patch.object(micro,'ask_local',return_value={'role':'dialog_text'}) as ask:
   self.assertEqual(micro.choose_role(None,None,'Alterar aviso',slots,requirements),'dialog_text')
   self.assertEqual(ask.call_args.args[3]['approvedRequirements'],requirements)
   observed=ask.call_args.args[3]['observedRoleSources'];self.assertEqual(set(observed),{'pattern','dialog_text','expression','no_change'});self.assertEqual(observed['dialog_text'][0]['kind'],'CallExpression');self.assertEqual(observed['no_change'],[])
  with patch.object(micro,'ask_local',return_value={'role':'shell'}),self.assertRaises(ValueError):micro.choose_role(None,None,'Alterar aviso',slots)
  with patch.object(micro,'ask_local') as ask:self.assertEqual(micro.choose_role(None,None,'Somar',[{'kind':'BinaryExpression'}]),'expression')
  ask.assert_not_called()
 def test_slot_proposals_cannot_choose_offsets_paths_or_unseen_ids(self):
  self.assertEqual(micro.validate_replacement({'content':'a+b'}),'a+b')
  for value in [{'content':'a+b','slot':'invented'},{'content':False},{'content':'x'*6001}]:
   with self.assertRaises(ValueError):micro.validate_replacement(value)
  self.assertEqual(micro.validate_slot_edits({'edits':[{'slot':'s1','content':'a+b'}]},{'s1'}),[{'slot':'s1','content':'a+b'}])
  for value in [{'edits':[{'slot':'s2','content':'a+b'}]},{'edits':[{'slot':'s1','content':'a+b','start':0}]},{'edits':[{'slot':'s1','content':'a+b'},{'slot':'s1','content':'a*b'}]}]:
   with self.assertRaises(ValueError):micro.validate_slot_edits(value,{'s1'})
  with self.assertRaises(ValueError):micro.validate_slot_selection({'slots':['invented']},{'s1'})
 def test_layout_policy_is_bounded_data_and_cannot_replace_non_geometry_state(self):
  self.assertEqual(micro.validate_layout_geometry({'geometry':[{'property':'position','value':'relative'},{'property':'margin','value':0}]}),{'position':'relative','margin':0})
  for value in [{'geometry':{}},{'geometry':{'backgroundColor':'red'}},{'geometry':{'fontFamily':'Georgia'}},{'geometry':{'margin':True}},{'geometry':{'height':'evil()'}},{'geometry':{'margin':0},'content':'{}'}]:
   with self.subTest(value=value),self.assertRaises(ValueError):micro.validate_layout_geometry(value)
  for rows in [[{'property':'margin','value':True}],[{'property':'fontFamily','value':'Georgia'}],[{'property':'margin','value':0}]*2,[{'property':'margin','value':0,'code':'x'}],[{'property':'position','value':'fixed'}]*5]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):micro.validate_layout_geometry({'geometry':rows})
 def test_stylesheet_locator_does_not_retarget_a_component_with_the_same_literal(self):
  files=[{'path':'src/App.jsx','content':'export default function App(){return <main style={{margin:0}}/>}'},{'path':'src/app.css','content':'body{color:black}'}];intent={'id':'a'*64,'expectedSha':'b'*40,'files':files,'prompt':'Preservar o componente e ajustar o stylesheet.','allowDependencies':False}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=[{'changes':[{'path':'src/app.css','goal':'Ajustar margem no stylesheet','queries':['margin']}]},{'path':'src/App.jsx'}]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaisesRegex(ValueError,'Localização fora'):micro.micro_implementation(e,intent,Path(temporary),{},files,'','implementation')
   self.assertEqual(ask.call_args.args[3]['allowedLocationPaths'],['src/app.css']);compiler.assert_not_called()
 def test_measured_origin_gap_limits_repair_without_inventing_requirements_or_changing_unobserved_elements(self):
  job={'failedAssertion':{'op':'expect_background'},'visualObservation':{'viewport':{'height':720},'elements':[{'element':'main','display':'block','margin':'0px','y':21,'height':720}]}}
  options,limit,diagnosis=micro.geometry_options(job,{'element':'main'});self.assertEqual(set(options),{'display','position'});self.assertEqual(limit,1);self.assertIn('measured offset',diagnosis)
  self.assertEqual(micro.validate_layout_geometry({'geometry':[{'property':'display','value':'flow-root'}]},options,limit),{'display':'flow-root'})
  for rows in [[{'property':'minHeight','value':'100vh'}],[{'property':'display','value':'block'}],[{'property':'position','value':'relative'}]]:
   with self.assertRaises(ValueError):micro.validate_layout_geometry({'geometry':rows},options,limit)
  for different,slot in [({**job,'failedAssertion':{'op':'expect_font'}},{'element':'main'}),(job,{'element':'section'}),({**job,'visualObservation':{'viewport':{'height':720},'elements':[{'element':'main','display':'block','margin':'0px','y':21,'height':100}]}},{'element':'main'})]:self.assertEqual(micro.geometry_options(different,slot),(micro.LAYOUT_VALUES,4,None))
 def test_readonly_plan_conflict_is_refused_and_locator_cannot_edit_preserved_files(self):
  row={'path':'src/a.js','goal':'Corrigir soma','queries':['sum']};paths={'src/a.js','src/b.js'}
  with self.assertRaisesRegex(ValueError,'somente leitura'):micro.validate_plan({'changes':[row],'readOnlyPaths':['src/a.js']},paths)
  files=[{'path':'src/a.js','content':'export const sum=(a,b)=>a-b;'},{'path':'src/b.js','content':'export const sum=(a,b)=>a*b;'}];intent={'id':'a'*64,'expectedSha':'b'*40,'files':files,'prompt':'Corrigir soma somente em a; preservar b.','allowDependencies':False}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=[{'changes':[row],'readOnlyPaths':['src/b.js']},{'path':'src/b.js'}]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaisesRegex(ValueError,'Localização fora'):micro.micro_implementation(e,intent,Path(temporary),{},files,'','implementation')
   self.assertEqual(ask.call_args.args[3]['allowedLocationPaths'],['src/a.js']);compiler.assert_not_called()
 def test_compiler_repair_revisits_only_fragments_that_were_actually_proposed(self):
  content="import {useState} from 'react';export const run=()=>useState(0);";path='src/state.js';intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':path,'content':content}],'prompt':'Ajustar import preservando a chamada existente.','allowDependencies':False}
  slots=[{'slot':'s1','kind':'ImportDeclaration','code':"import {useState} from 'react';",'contains':[]},{'slot':'s2','kind':'CallExpression','code':'useState(0)','contains':[]}]
  updated="import {useState,useReducer} from 'react';export const run=()=>useState(0);";compiled=[]
  def compile(*args):
   if args[5] is None:return {'state':'inspected','expectedDigest':micro.digest(content),'complete':True,'slots':slots}
   compiled.append(args[5]);return {'state':'failed','error':'Preserve import useState.'} if len(compiled)==1 else {'state':'succeeded','patch':{'files':[{'path':path,'content':updated}]},'validation':{'valid':True}}
  answers=[{'changes':[{'path':path,'goal':'Ajustar import','queries':['useState']}]},{'path':path},{'slots':['s1','s2']},{'content':"import {useReducer} from 'react';"},{'content':'useState(0)'},{'content':"import {useState,useReducer} from 'react';"}]
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120,candidate_files=service.candidate_files)
   with patch.object(micro,'ask_local',side_effect=answers) as ask,patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
  self.assertEqual(result['state'],'succeeded');self.assertEqual(ask.call_count,6);self.assertEqual([[edit['slot'] for edit in batch] for batch in compiled],[['s1'],['s1']]);self.assertEqual(result['patch']['files'][0]['content'],updated)
  # Source selection uses bounded reasoning; code proposals retain their
  # original short output policy and still require compilation and replay.
  self.assertTrue(ask.call_args_list[2].kwargs.get('reasoning'))
  for index in [0,1,3,4,5]:self.assertNotIn('reasoning',ask.call_args_list[index].kwargs)
if __name__=='__main__':unittest.main()
