import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('inference_cache_policy',Path(__file__).resolve().parents[1]/'scripts/linux/inference_cache_policy.py');policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
class CachePolicy(unittest.TestCase):
 def scenario(self,run):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);old='services:\n  ollama:\n    environment:\n      OLLAMA_NO_CLOUD: "1"\n';(root/'compose.yaml').write_text(old);state={'image':'sha256:original','cacheRam':None,'mounts':[{'Name':'models'}],'networks':{'lab':{'NetworkID':'n','IPAddress':'10.239.0.10'}},'ports':{},'project':'ai-local-lab','service':'ollama'}
   def restart():state['cacheRam']='0' if policy.LINE in (root/'compose.yaml').read_text() else None
   run(root,old,old+policy.LINE,state,restart)
 def test_apply_preserves_resources_and_replay_is_no_change(self):
  def run(root,old,new,state,restart):
   result=policy.apply_policy(root,new,lambda:dict(state),restart);self.assertTrue(result['modelsAndNetworkPreserved']);self.assertEqual(state['cacheRam'],'0');self.assertFalse(policy.apply_policy(root,new,lambda:dict(state),restart)['changed'])
  self.scenario(run)
 def test_foreign_changes_and_service_are_refused_without_mutation(self):
  def run(root,old,new,state,restart):
   for desired in [new.replace('OLLAMA_NO_CLOUD','OTHER_SETTING'),new.replace('"0"','"8192"')]:self.assertFalse(policy.apply_policy(root,desired,lambda:dict(state),lambda:self.fail('must not restart'))['applied']);self.assertEqual((root/'compose.yaml').read_text(),old)
   state['project']='foreign';self.assertFalse(policy.apply_policy(root,new,lambda:dict(state),restart)['applied'])
  self.scenario(run)
 def test_failed_restart_restores_then_retry_applies_the_same_policy(self):
  def run(root,old,new,state,restart):
   calls=[]
   def fail_once():
    calls.append(1)
    if len(calls)==1:raise RuntimeError('restart failure')
    restart()
   self.assertTrue(policy.apply_policy(root,new,lambda:dict(state),fail_once)['rollbackConfirmed']);self.assertEqual((root/'compose.yaml').read_text(),old);self.assertIsNone(state['cacheRam']);self.assertTrue(policy.apply_policy(root,new,lambda:dict(state),restart)['applied'])
  self.scenario(run)
 def test_linked_compose_is_rejected_without_reading_or_changing_its_target(self):
  def run(root,old,new,state,restart):
   other=root/'foreign.yaml';other.write_text('foreign content');target=root/'compose.yaml';target.unlink();target.symlink_to(other)
   result=policy.apply_policy(root,new,lambda:self.fail('must not inspect service'),lambda:self.fail('must not restart'))
   self.assertFalse(result['applied']);self.assertEqual(result['reason'],'unexpected-runtime-link');self.assertEqual(other.read_text(),'foreign content')
  self.scenario(run)
 def test_recorder_failure_prevents_mutation_and_unconfirmed_rollback_raises(self):
  def run(root,old,new,state,restart):
   with patch.object(policy,'administrative_operation',side_effect=RuntimeError('ledger unavailable')),self.assertRaises(RuntimeError):policy.apply_policy(root,new,lambda:dict(state),restart)
   self.assertEqual((root/'compose.yaml').read_text(),old)
   with self.assertRaisesRegex(RuntimeError,'rollback not confirmed'):policy.apply_policy(root,new,lambda:dict(state),lambda:(_ for _ in ()).throw(RuntimeError('restart unavailable')))
  self.scenario(run)
if __name__=='__main__':unittest.main()
