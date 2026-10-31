"""Owned network migration must preserve state and restore membership on failure."""
from pathlib import Path
import contextlib,copy,importlib.util,json,sys,tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'sdlc/scripts'))
import audit_admin
spec=importlib.util.spec_from_file_location('migration',ROOT/'scripts/linux/network-migration.py');migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
SETTINGS=('10.239.0.0/24','10.239.0.128/25','10.239.0.1','10.239.0.10')

class MigrationTests(unittest.TestCase):
 def scenario(self,fail=False,foreign=False):
  net={'Id':'a'*64,'Driver':'bridge','Labels':{'com.docker.compose.project':'ai-local-lab','com.docker.compose.network':'lab'},'IPAM':{'Config':[{'Subnet':'172.18.0.0/16','Gateway':'172.18.0.1'}]},'Containers':{'c':{}},'Options':{}}
  row={'Id':'c','Config':{'Labels':{'com.docker.compose.project':'ai-local-lab','com.docker.compose.service':'ollama'}},'NetworkSettings':{'Networks':{migration.NAME:{'IPAddress':'172.18.0.2','Aliases':['ollama']}}},'State':{'Running':True}}
  if foreign:net['Containers']['foreign']={}
  calls=[];injected=False
  def inspect(kind,name):return copy.deepcopy(net if kind=='network' else row)
  def run(*args):
   nonlocal injected
   calls.append(args)
   if args[:3]==('docker','ps','-aq'):return 'c'
   if args[:4]==('ip','-j','-4','route'):return '[]'
   if args[:3]==('docker','stop','--timeout'):row['State']['Running']=False
   if args[:3]==('docker','network','disconnect'):row['NetworkSettings']['Networks'].pop(migration.NAME,None)
   if args[:3]==('docker','network','connect'):
    if fail and not injected:injected=True;raise RuntimeError('injected connection failure')
    row['NetworkSettings']['Networks'][migration.NAME]={'IPAddress':args[args.index('--ip')+1] if '--ip' in args else '10.239.0.128','Aliases':['ollama']}
   if args[:2]==('docker','start'):row['State']['Running']=True
   return ''
  return net,row,calls,inspect,run
 def exercise(self,fail=False,foreign=False):
  net,row,calls,inspect,run=self.scenario(fail,foreign)
  result=type('Result',(),{'returncode':0,'stdout':json.dumps([net])})()
  with tempfile.TemporaryDirectory() as temporary,patch.object(migration,'ROOT',Path(temporary)),patch.object(migration.os,'geteuid',return_value=0),patch.object(Path,'is_file',return_value=True),patch.object(migration,'inspect',side_effect=inspect),patch.object(migration,'run',side_effect=run),patch.object(migration.subprocess,'run',return_value=result),patch.object(audit_admin,'administrative_operation') as audit:
   (Path(temporary)/'audit').mkdir(mode=0o700)
   if foreign:
    with self.assertRaisesRegex(RuntimeError,'foreign'):migration.migrate(SETTINGS)
    self.assertFalse(any(c[:2]==('docker','stop') for c in calls));audit.assert_not_called()
   elif fail:
    with self.assertRaisesRegex(RuntimeError,'injected'):migration.migrate(SETTINGS)
    self.assertEqual(row['NetworkSettings']['Networks'][migration.NAME]['IPAddress'],'172.18.0.2');self.assertTrue(row['State']['Running'])
    audit.return_value.__enter__.return_value.result.assert_called_once_with('FAILED',reasonCode='ROLLED_BACK')
   else:
    value=migration.migrate(SETTINGS);self.assertFalse(value['volumesDeleted']);self.assertTrue(row['State']['Running']);self.assertEqual(row['NetworkSettings']['Networks'][migration.NAME]['IPAddress'],'10.239.0.10')
   self.assertFalse(any(c[:3] in [('docker','container','rm'),('docker','volume','rm')] for c in calls))
   if not foreign:
    isolated=[index for index,c in enumerate(calls) if c[0]=='python3' and c[-1]=='isolate'];started=[index for index,c in enumerate(calls) if c[:2]==('docker','start')];self.assertTrue(isolated);self.assertTrue(started);self.assertLess(isolated[-1],started[-1])
 def test_preserves_containers_and_volumes(self):self.exercise()
 def test_failed_connection_restores_old_address_and_running_state(self):self.exercise(fail=True)
 def test_foreign_endpoint_prevents_any_stop(self):self.exercise(foreign=True)
if __name__=='__main__':unittest.main()
