"""Two WSL Docker engines must not require a daemon restart to prepare models."""
import contextlib,importlib.util,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'sdlc/scripts'))
import audit_admin
spec=importlib.util.spec_from_file_location('offline_network',ROOT/'scripts/linux/offline-network.py');network=importlib.util.module_from_spec(spec);spec.loader.exec_module(network)
class NetworkPreparation(unittest.TestCase):
 def fake(self,foreign=False,fail=False):
  calls=[]
  def run(*args,check=True):
   calls.append(args)
   if fail and args[:5]==('iptables','-w','5','-A','AILAB-PREPARE'):raise RuntimeError('injected rule failure')
   code=1 if '-D' in args else 0
   value=[{'Id':'abcdef012345','Labels':{'com.docker.compose.project':'foreign' if foreign else 'ai-local-lab'},'Options':{'com.docker.network.bridge.name':'br-owned'},'IPAM':{'Config':[{'Subnet':'10.239.0.0/24','IPRange':'10.239.0.128/25','Gateway':'10.239.0.1'}]}}]
   return type('Result',(),{'returncode':code,'stdout':json.dumps(value)})()
  return calls,run
 def test_online_rules_allow_only_owned_bridge_and_established_replies(self):
  calls,run=self.fake()
  with patch.object(network,'run',side_effect=run),patch.object(network.os,'geteuid',return_value=0),patch.object(Path,'is_file',return_value=True),patch.object(audit_admin,'administrative_operation') as audit:
   network.guard(prepare=True,ensure=True);rules=[c for c in calls if '-A' in c and 'AILAB-PREPARE' in c]
   self.assertEqual(len(rules),2);self.assertTrue(all('br-owned' in c for c in rules));self.assertIn('ESTABLISHED,RELATED',rules[0]);self.assertNotIn('systemctl',[part for c in calls for part in c]);audit.return_value.__enter__.return_value.result.assert_called_once()
 def test_foreign_network_cannot_be_opened(self):
  calls,run=self.fake(foreign=True)
  with patch.object(network,'run',side_effect=run),patch.object(network.os,'geteuid',return_value=0),patch.object(Path,'is_file',return_value=True),patch.object(audit_admin,'administrative_operation') as audit:
   with self.assertRaisesRegex(RuntimeError,'ownership'):network.guard(prepare=True,ensure=True)
   self.assertFalse(any(c[0]=='iptables' for c in calls));audit.assert_not_called()
 def test_failed_preparation_is_not_reported_as_success(self):
  calls,run=self.fake(fail=True)
  with patch.object(network,'run',side_effect=run),patch.object(network.os,'geteuid',return_value=0),patch.object(Path,'is_file',return_value=True),patch.object(audit_admin,'administrative_operation') as audit:
   with self.assertRaisesRegex(RuntimeError,'injected'):network.guard(prepare=True,ensure=True)
   audit.return_value.__enter__.return_value.result.assert_not_called()
 def test_restore_removes_online_chain_and_blocks_new_external_traffic(self):
  calls,run=self.fake()
  with patch.object(network,'run',side_effect=run),patch.object(network.os,'geteuid',return_value=0),patch.object(Path,'is_file',return_value=True):network.guard()
  self.assertIn(('iptables','-w','5','-X','AILAB-PREPARE'),calls);self.assertIn(('iptables','-w','5','-A','AILAB-OFFLINE','-i','br-owned','-j','DROP'),calls)
 def test_fixed_inference_address_stays_outside_the_dynamic_pool(self):
  values={'lab_network_subnet':'10.239.0.0/24','lab_network_dynamic_range':'10.239.0.128/25','ollama_address':'10.239.0.10'}
  self.assertEqual(network.network_settings(values),('10.239.0.0/24','10.239.0.128/25','10.239.0.1','10.239.0.10'))
  for changes in [{'ollama_address':'10.239.0.129'},{'ollama_address':'10.239.0.1'},{'lab_network_subnet':'8.8.8.0/24'},{'lab_network_dynamic_range':'10.240.0.0/24'}]:
   with self.subTest(changes=changes),self.assertRaises(ValueError):network.network_settings({**values,**changes})
if __name__=='__main__':unittest.main()
