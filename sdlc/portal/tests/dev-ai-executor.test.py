"""AI DEV contracts use isolated files and intercepted browser/model transports."""
import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runtime_ai_fixture',ROOT/'runtime/service.py');runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
import dev_ai as ai

def intent():
 deployment={'id':'isolated-deployment','kind':'deploy','systemId':'isolated-system','environmentId':'isolated-environment','repositoryId':'isolated-repository','profile':runtime.PROFILE,'unitId':'web','sourceSha':'a'*40,'contractDigest':'b'*64,'storyId':'isolated-story','buildId':'isolated-build','projectId':1,'imageId':'sha256:'+'c'*64,'archiveDigest':'d'*64,'artifactSize':100,'expectedDeploymentId':None};deployment['configDigest']=runtime.digest(runtime.canonical(runtime.configuration(deployment)))
 context={'contextVersion':2,'objective':'Reservar','behavior':'Confirmar reserva','criteria':['Exibir confirmação.'],'testCases':[{'criterionIndex':0,'description':'Conferir confirmação.'}],'approved':{'name':'Reservas','runtime':{'name':'Node'},'requirements':{'businessRules':['Somente autorizado.'],'nonFunctional':['Uso por teclado.']},'technicalPlan':{'architecture':'Manter implementação.'},'decisions':[],'tasks':[],'codeDestination':None,'scopeRevision':3}}
 return {'id':'isolated-ai-test','policyVersion':ai.POLICY,'deployment':deployment,'referenceDigest':'e'*64,'context':context}

class AiTests(unittest.TestCase):
 def engine(self,directory):
  deployment=intent()['deployment'];active={**deployment,'containerId':'f'*64,'host':'10.20.0.2','port':8080}
  native=runtime.Engine(Path(directory),{'installationId':'isolated-owner','aiBrowserImageId':'prepared-fixture','aiModel':'local:fixture','aiUpstream':'http://127.0.0.1:11434'},run=Mock(return_value=b''))
  native.active=Mock(return_value=active);native.inspect=Mock(return_value={'state':'prepared','proof':{'resourceName':'isolated-network'}});native.container=Mock(return_value={'State':{'Running':True},'Image':deployment['imageId']})
  native.ai.health=Mock(return_value={'ready':True,'policyVersion':ai.POLICY});return native.ai
 def test_identity_and_full_context_are_bounded_data_without_urls_or_commands(self):
  value=intent();self.assertEqual(ai.validate(value,runtime.validate_intent),value)
  for change in [{'url':'http://outside'},{'policyVersion':'other'},{'id':'../../other'},{'context':{**value['context'],'criteria':[]}},{'context':{**value['context'],'contextVersion':1}},{'context':{**value['context'],'approved':{**value['context']['approved'],'tools':['write_file']}}},{'context':{**value['context'],'testCases':[{'criterionIndex':True,'description':'wrong'}]}}]:
   with self.subTest(change=change),self.assertRaises(ValueError):ai.validate({**value,**change},runtime.validate_intent)
 def test_submit_replays_immutable_identity_and_never_redispatches_an_existing_job(self):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent()
   with patch.object(ai.threading.Thread,'start') as start:
    first=engine.submit(value);self.assertEqual(engine.submit(value),first);start.assert_called_once()
    with self.assertRaisesRegex(ValueError,'conflict'):engine.submit({**value,'referenceDigest':'9'*64})
 def test_source_checks_refuse_other_deployment_or_image_before_browser(self):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent();self.assertEqual(engine.current(value)[0]['id'],value['deployment']['id'])
   engine.runtime.active.return_value={**engine.runtime.active.return_value,'id':'other-deployment'}
   with self.assertRaises(ai.Changed):engine.current(value)
 def execute(self,result,replay=(True,None),failure=None):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent();engine.directory(value['id']).mkdir();engine.runtime.write(engine.directory(value['id'])/'intent.json',value);engine.save(value,'queued','queued',[])
   browser=Mock();browser.initial={'observedUI':'Reserva'};engine.replay=Mock(return_value=replay)
   def verify(e,job,files,out,observation,progress):
    self.assertEqual(files,[]);self.assertEqual(job['focusCase']['criterionIndex'],0);self.assertEqual(job['intent']['testContext'],value['context']);self.assertEqual(observation,browser.initial)
    if failure:raise failure
    return result
   with patch.object(ai,'DevBrowser',return_value=browser),patch.object(ai.ui,'run_ui_verifier',side_effect=verify):engine.execute(value)
   saved=engine.read(value['id']);self.assertTrue((engine.directory(value['id'])/'case-0/report.json').exists());return saved,engine.replay.call_count
 def test_pass_requires_independent_replay_and_is_never_complete_acceptance(self):
  saved,replays=self.execute({'passed':True,'steps':[{'op':'expect_text','value':'Reserva'}]});self.assertEqual(saved['state'],'succeeded');self.assertEqual(saved['cases'][0]['status'],'passed');self.assertFalse(saved['proof']['completeAcceptance']);self.assertEqual(replays,1)
  saved,_=self.execute({'passed':True,'steps':[{'op':'expect_text','value':'Reserva'}]},(False,'expect_text'));self.assertEqual(saved['state'],'inconclusive');self.assertEqual(saved['cases'][0]['code'],'UNSTABLE')
 def test_only_reproduced_functional_assertion_generates_failed_case(self):
  result={'passed':False,'repairable':True,'steps':[{'op':'expect_text','value':'Reserva'}]};saved,_=self.execute(result,(False,'expect_text'));self.assertEqual(saved['state'],'failed');self.assertEqual(saved['cases'][0]['code'],'ASSERTION_FAILED')
  saved,_=self.execute(result,(False,None));self.assertEqual(saved['state'],'inconclusive')
 def test_unsupported_or_restricted_network_is_not_an_application_defect(self):
  saved,count=self.execute({'passed':False,'diagnosticCode':'UI_CAPABILITY_UNSUPPORTED'});self.assertEqual(saved['state'],'inconclusive');self.assertEqual(saved['cases'][0]['code'],'CAPABILITY_UNSUPPORTED');self.assertEqual(count,0)
  saved,_=self.execute({},failure=ai.Restricted('shared write'));self.assertEqual(saved['state'],'inconclusive');self.assertEqual(saved['cases'][0]['code'],'NETWORK_POLICY')
 def test_recorded_cases_and_terminal_receipts_are_not_rewritten(self):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent();engine.directory(value['id']).mkdir();case={'index':0,'title':'Exibir confirmação.','status':'passed','code':'PASSED','steps':1,'evidence':[]};engine.save(value,'running','case_1_recorded',[case])
   with self.assertRaises(ValueError):engine.save(value,'running','changed',[])
   first=engine.save(value,'succeeded','completed',[case],engine.proof(value));self.assertEqual(engine.save(value,'failed','overwrite',[{**case,'status':'failed'}]),first)
   with patch.object(ai,'DevBrowser') as browser:engine.execute(value)
   browser.assert_not_called();self.assertEqual(engine.read(value['id']),first)
 def test_restart_records_unperformed_cases_without_any_browser_or_inference(self):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent();engine.directory(value['id']).mkdir();engine.runtime.write(engine.directory(value['id'])/'intent.json',value);engine.save(value,'running','test_planning',[])
   with patch.object(ai.ui,'ask_local') as infer,patch.object(ai,'DevBrowser') as browser:engine.recover()
   self.assertEqual(engine.read(value['id'])['state'],'inconclusive');self.assertEqual(engine.read(value['id'])['cases'][0]['status'],'not_tested');infer.assert_not_called();browser.assert_not_called();self.assertTrue((engine.directory(value['id'])/'interrupted-receipt.json').exists())
 def test_evidence_is_registered_bounded_and_cannot_escape_case_directory(self):
  with tempfile.TemporaryDirectory() as directory:
   engine=self.engine(directory);value=intent();folder=engine.directory(value['id']);folder.mkdir();(folder/'case-0').mkdir();engine.runtime.write(folder/'case-0/report.json',{'result':'not_tested'});engine.seal_case(folder/'case-0');case={'index':0,'title':'Exibir confirmação.','status':'not_tested','code':'CAPABILITY_UNSUPPORTED','steps':0,'evidence':['report.json']};engine.save(value,'inconclusive','completed',[case],engine.proof(value));self.assertEqual(engine.evidence(value['id'],0,'report.json')['contentType'],'application/json')
   for index,name in [('..','report.json'),(0,'../intent.json'),(0,'initial.png')]:
    with self.subTest(index=index,name=name),self.assertRaises(ValueError):engine.evidence(value['id'],index,name)
   engine.runtime.write(folder/'case-0/report.json',{'result':'changed'})
   with self.assertRaisesRegex(ValueError,'integrity'):engine.evidence(value['id'],0,'report.json')
if __name__=='__main__':unittest.main()
