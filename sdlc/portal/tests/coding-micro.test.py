"""Scoped local editor contracts. No model, application or business database."""
import json,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
import coding_micro as micro
import coding_service as service
class MicroContracts(unittest.TestCase):
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
   with patch.object(micro,'ask_local',side_effect=responses),patch.object(micro,'apply_proposal',side_effect=compile):result=micro.micro_implementation(e,intent,directory,{},intent['files'],'','implementation')
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
  self.assertEqual(value['rejectedExpression'],'render(<Provider><App/></Provider>');self.assertEqual(value['compilerSyntax'],fault['fragmentSyntaxIssue']);self.assertEqual(value['mode'],'syntax_only_repair');self.assertEqual(value['approvedCriteria'],requirements['criteria']);self.assertNotIn('readOnlyCallers',value);self.assertNotIn('behavior',value)
  original=micro.expression_editor_input('Envolver App',requirements,slot,[],None,None);self.assertEqual(original['approvedRequirements'],requirements);self.assertEqual(original['fragment'],slot)
 def test_failed_pattern_examples_reduce_the_repair_to_original_criteria_and_frozen_examples(self):
  requirements={'criteria':['Aceitar HTTP e HTTPS com IP e porta.'],'behavior':'Large cross-cutting history context'}
  slot={'pattern':'rejected-hostname-template','flags':'i','before':'source before','after':'source after'}
  examples=[{'value':'http://127.0.0.1:8049/jewel.svg','expected':True}]
  checks=[{'exampleIndex':0,'expected':True,'observed':False,'passed':False}]
  value=micro.pattern_editor_input('Validar URL',requirements,slot,examples,None,{'patternChecks':checks,'rejectedProposal':{'pattern':'failed'}})
  self.assertEqual(value['approvedCriteria'],requirements['criteria']);self.assertEqual(value['validationContract'],{'mustMatch':[examples[0]['value']],'mustReject':[]});self.assertEqual(value['fixedFlags'],'i');self.assertEqual(value['failedExamples'],[{'input':examples[0]['value'],'expectedMatch':True,'observedMatch':False}])
  self.assertNotIn('currentPattern',value);self.assertNotIn('rejectedProposal',value);self.assertNotIn('before',value);self.assertNotIn('Large cross-cutting',json.dumps(value))
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
  self.assertEqual(micro.approved_requirements(intent),{key:intent['testContext'][key] for key in ['objective','behavior','criteria']})
  self.assertEqual(micro.approved_requirements({'prompt':'Somar, preservando multiply.'}),{'approvedInstructions':'Somar, preservando multiply.'})
  view=micro.slot_index([{'slot':'s0','kind':'ImportInsertion','code':''},{'slot':'s1','kind':'CallExpression','code':'amount.toFixed(2)'}],'Preço',['toFixed']);self.assertEqual([s['slot'] for s in view['slots']],['s1'])
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
   with patch.object(micro,'ask_local',side_effect=[plan,{'path':'src/a.js'},selection,proposal,proposal]),patch.object(micro,'apply_proposal',side_effect=apply) as compiler:
    try:result=micro.micro_implementation(e,intent,directory,job,intent['files'],'Falha observada','targeted_repair' if repair else 'implementation')
    except ValueError as error:result={'refused':str(error)}
   return result,calls,len(calls)
 def test_duplicate_file_plan_has_one_structural_repair_with_full_approved_scope(self):
  intent={'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':'src/a.js','content':'export const sum=(a,b)=>a-b;'}],'prompt':'Corrigir soma e preservar multiply.','allowDependencies':False}
  row={'path':'src/a.js','goal':'Corrigir soma','queries':['sum']};duplicate={'changes':[row,{**row,'goal':'Preservar multiply'}]};merged={'changes':[row]}
  with tempfile.TemporaryDirectory() as temporary:
   e=SimpleNamespace(dump=lambda path,value:path.write_text(json.dumps(value)),remaining_seconds=lambda _:120)
   with patch.object(micro,'ask_local',side_effect=[duplicate,merged,RuntimeError('stop at locator')]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaisesRegex(RuntimeError,'stop at locator'):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
    repair=ask.call_args_list[1];self.assertEqual(repair.args[3]['approvedInstructions'],intent['prompt']);self.assertEqual(repair.args[3]['rejectedPlan'],duplicate);self.assertEqual(repair.args[4]['properties']['changes']['maxItems'],1);compiler.assert_not_called()
   with patch.object(micro,'ask_local',side_effect=[duplicate,duplicate]) as ask,patch.object(micro,'apply_proposal') as compiler:
    with self.assertRaises(ValueError):micro.micro_implementation(e,intent,Path(temporary),{},intent['files'],'','implementation')
    self.assertEqual(ask.call_count,2);compiler.assert_not_called()
 def test_one_scoped_proposal_has_no_model_selected_hash_or_path(self):
  result,calls,count=self.run_editor();self.assertEqual(result['state'],'succeeded');self.assertEqual(count,1);self.assertEqual(calls[0]['path'],'src/a.js');self.assertEqual(calls[0]['expectedDigest'],micro.digest('export const sum=(a,b)=>a-b;\n'));self.assertEqual([f['path'] for f in result['patch']['files']],['src/a.js'])
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
if __name__=='__main__':unittest.main()
