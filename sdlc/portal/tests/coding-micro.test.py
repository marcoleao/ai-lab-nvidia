"""Scoped local editor contracts. No model, application or business database."""
import json,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
import coding_micro as micro
import coding_service as service
class MicroContracts(unittest.TestCase):
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
  for value in [{'changes':[]},{'changes':[{**valid['changes'][0],'path':'b.js'}]},{'changes':[{**valid['changes'][0],'queries':[' ']}]},{**valid,'authorization':'invented'}]:
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
