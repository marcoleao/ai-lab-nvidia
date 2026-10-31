"""Clock policy rollback/ownership tests; no real systemd or clock calls."""
from pathlib import Path
import sys,tempfile,unittest
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_admin import validate
from wsl_clock import apply_policy,RELATIVE,CONTENT

class ClockPolicy(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory();self.root=Path(self.temporary.name);self.units=self.root/'units';self.units.mkdir();self.running=True;self.calls=[];self.fail_stop=False
 def tearDown(self):self.temporary.cleanup()
 def invoke(self,args):
  self.calls.append(args)
  if args[0]=='is-active':return SimpleNamespace(returncode=0 if self.running else 3)
  if args[0]=='stop':
   if self.fail_stop:return SimpleNamespace(returncode=1)
   self.running=False
  if args[0]=='start':self.running=True
  return SimpleNamespace(returncode=0)
 def test_applies_a_drop_in_without_clock_setting_then_replays_without_mutation(self):
  self.assertTrue(apply_policy(self.root,self.units,self.invoke)['applied']);self.assertFalse(self.running);self.assertEqual((self.units/RELATIVE).read_text(),CONTENT)
  self.calls=[];self.assertFalse(apply_policy(self.root,self.units,self.invoke)['changed']);self.assertEqual([c[0] for c in self.calls],['is-active']);self.assertEqual(validate(self.root)['pendingOperations'],[])
 def test_foreign_file_or_symlink_is_refused_without_systemd_changes(self):
  target=self.units/RELATIVE;target.parent.mkdir();target.write_text('Foreign policy')
  self.assertFalse(apply_policy(self.root,self.units,self.invoke)['applied']);self.assertEqual(target.read_text(),'Foreign policy');self.assertEqual(self.calls,[])
  target.unlink();target.symlink_to(self.root/'foreign')
  self.assertFalse(apply_policy(self.root,self.units,self.invoke)['applied']);self.assertEqual(self.calls,[])
 def test_failed_stop_restores_original_state_and_same_request_can_retry(self):
  self.fail_stop=True;result=apply_policy(self.root,self.units,self.invoke);self.assertFalse(result['applied']);self.assertTrue(result['rollbackConfirmed']);self.assertTrue(self.running);self.assertFalse((self.units/RELATIVE).exists())
  self.fail_stop=False;self.assertTrue(apply_policy(self.root,self.units,self.invoke)['applied']);self.assertFalse(self.running);self.assertEqual(validate(self.root)['pendingOperations'],[])
 def test_recorder_failure_prevents_any_configuration_or_service_mutation(self):
  from unittest.mock import patch
  with patch('wsl_clock.administrative_operation',side_effect=RuntimeError('Recorder unavailable')),self.assertRaises(RuntimeError):apply_policy(self.root,self.units,self.invoke)
  self.assertEqual(self.calls,[]);self.assertFalse((self.units/RELATIVE).exists())
 def test_unconfirmed_compensation_stays_unknown_and_never_reports_success(self):
  def refused(args):
   if args[0]=='stop':self.running=False;return SimpleNamespace(returncode=1)
   if args[0]=='start':return SimpleNamespace(returncode=1)
   return self.invoke(args)
  with self.assertRaisesRegex(RuntimeError,'rollback was not confirmed'):apply_policy(self.root,self.units,refused)
  self.assertEqual(validate(self.root)['pendingOperations'],[])
if __name__=='__main__':unittest.main()
