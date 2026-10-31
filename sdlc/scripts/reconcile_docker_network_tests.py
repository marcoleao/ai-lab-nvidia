import importlib.util,json,subprocess,unittest
from pathlib import Path
from contextlib import nullcontext
from unittest.mock import Mock
spec=importlib.util.spec_from_file_location('guard',Path(__file__).with_name('reconcile-docker-networks.py'));guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)

class NetworkGuard(unittest.TestCase):
 def test_bridge_rule_rejects_invalid_driver_id_and_interface(self):
  valid={'Driver':'bridge','Id':'a'*64,'Options':{}}
  for change in [{'Driver':'host'},{'Id':'arbitrary'},{'Options':{'com.docker.network.bridge.name':'bridge;external'}}]:
   with self.subTest(change=change),self.assertRaises(RuntimeError):guard.bridge_rule({**valid,**change})
 def test_only_explicit_owned_bridge_networks_are_selected(self):
  def execute(args,**_):
   name=args[-1]
   if name!='sdlc-portal-foundation_data':return Mock(returncode=1)
   return Mock(returncode=0,stdout=json.dumps([{'Name':name,'Driver':'bridge','Labels':{'com.docker.compose.project':'sdlc-portal-foundation'},'Id':'a'*64,'Options':{}}]))
  self.assertEqual(guard.network_rules(execute),[['-i','br-aaaaaaaaaaaa','-o','br-aaaaaaaaaaaa','-j','ACCEPT']])
  def unowned(args,**_):return Mock(returncode=0,stdout=json.dumps([{'Name':args[-1],'Driver':'bridge','Labels':{},'Id':'a'*64}]))
  with self.assertRaisesRegex(RuntimeError,'unowned'):guard.network_rules(unowned)
 def test_replay_is_read_only_and_does_not_broaden_forwarding(self):
  rule=['-i','br-aaaaaaaaaaaa','-o','br-aaaaaaaaaaaa','-j','ACCEPT'];present=set();writes=[];operation=Mock();audit=Mock(return_value=nullcontext(operation))
  def execute(args,check=True):
   if '-C' in args:return Mock(returncode=0 if tuple(rule) in present else 1)
   writes.append(args);present.add(tuple(rule));return Mock(returncode=0)
  self.assertEqual(guard.reconcile([rule],execute,audit)['addedRules'],1);self.assertFalse(guard.reconcile([rule],execute,audit)['changed']);self.assertEqual(len(writes),1);audit.assert_called_once();self.assertEqual(writes[0][-6:],rule)
 def test_partial_failure_rolls_back_only_added_rules_then_retry_can_finish(self):
  first=['-i','br-aaaaaaaaaaaa','-o','br-aaaaaaaaaaaa','-j','ACCEPT'];second=['-i','br-bbbbbbbbbbbb','-o','br-bbbbbbbbbbbb','-j','ACCEPT'];existing=['-i','br-cccccccccccc','-o','br-cccccccccccc','-j','ACCEPT'];present={tuple(existing)};fail=True
  def execute(args,check=True):
   nonlocal fail
   rule=tuple(args[-6:])
   if '-C' in args:return Mock(returncode=0 if rule in present else 1)
   if '-D' in args:present.discard(rule);return Mock(returncode=0)
   if rule==tuple(second) and fail:raise subprocess.CalledProcessError(1,args)
   present.add(rule);return Mock(returncode=0)
  audit=lambda *a,**kw:nullcontext(Mock())
  with self.assertRaises(subprocess.CalledProcessError):guard.reconcile([existing,first,second],execute,audit)
  self.assertEqual(present,{tuple(existing)});fail=False;self.assertEqual(guard.reconcile([existing,first,second],execute,audit)['addedRules'],2)

if __name__=='__main__':unittest.main()
