import importlib.util,json,tempfile,unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
spec=importlib.util.spec_from_file_location('runtime_service',Path(__file__).resolve().parents[1]/'runtime/service.py');service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
def intent():
 v={'id':'isolated-job-123','kind':'prepare','systemId':'isolated-system-123','environmentId':'isolated-environment-123','repositoryId':'isolated-repository-123','profile':service.PROFILE,'unitId':'web','sourceSha':'a'*40,'contractDigest':'b'*64};v['configDigest']=service.digest(service.canonical(service.configuration(v)));return v
class Docker:
 def __init__(self):self.calls=[];self.network=None;self.fail=False
 def __call__(self,*args,**options):
  self.calls.append(args)
  if self.fail:raise service.RuntimeFailure('RUNTIME_UNAVAILABLE')
  if args[0]=='info':return b'controlled'
  if args[:2]==('network','ls'):return (b'c'*64+b'\n') if self.network else b''
  if args[:2]==('network','inspect'):return json.dumps([self.network]).encode()
  if args[:2]==('network','create'):
   labels=dict(args[index+1].split('=',1) for index,value in enumerate(args) if value=='--label');self.network={'Id':'c'*64,'Name':args[-1],'Driver':'bridge','Internal':'--internal' in args,'EnableIPv6':False,'Labels':labels};return b'c'*64
  raise AssertionError(args)
class RuntimeTests(unittest.TestCase):
 def test_provisions_internal_owned_network_once_and_never_starts_application(self):
  v=intent();docker=Docker()
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'installationId':'isolated-installation'},run=docker);engine.accept(v,background=False);engine.execute(v);self.assertEqual(engine.public(v['id'])['state'],'succeeded');before=len(docker.calls);engine.accept(v,background=False);engine.execute(v);self.assertEqual(len(docker.calls),before);self.assertEqual(sum(args[:2]==('network','create') for args in docker.calls),1);self.assertTrue(all(args[0] in ['info','network'] for args in docker.calls));self.assertTrue(docker.network['Internal'])
 def test_foreign_resource_is_not_adopted_or_overwritten(self):
  v=intent();docker=Docker();docker.network={'Id':'c'*64,'Name':'foreign','Labels':{},'Internal':False}
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'installationId':'isolated-installation'},run=docker);engine.accept(v,background=False);engine.execute(v);self.assertEqual(engine.public(v['id'])['state'],'failed');self.assertFalse(any(args[:2]==('network','create') for args in docker.calls))
 def test_parameters_cannot_inject_commands_or_change_identity(self):
  v=intent();docker=Docker()
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'installationId':'isolated-installation'},run=docker);engine.accept(v,background=False)
   for change in [{'systemId':'other-system-123'},{'unitId':'web;curl outside'},{'kind':'deploy'},{'profile':'arbitrary'}]:
    with self.assertRaises(service.RuntimeFailure):engine.accept({**v,**change},background=False)
   self.assertEqual(docker.calls,[])
 def test_restart_preserves_uncertainty_and_does_not_create(self):
  v=intent();docker=Docker()
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'installationId':'isolated-installation'},run=docker);engine.accept(v,background=False);engine.recover();engine.execute(v);self.assertEqual(engine.public(v['id'])['state'],'unknown');self.assertFalse(any(args[:2]==('network','create') for args in docker.calls))
 def test_lost_receipt_reconciles_owned_effect_by_read_only_inspection(self):
  v=intent();docker=Docker()
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'installationId':'isolated-installation'},run=docker);engine.accept(v,background=False);engine.execute(v);engine.write(engine.directory(v['id'])/'receipt.json',{'id':v['id'],'state':'unknown'});before=sum(args[:2]==('network','create') for args in docker.calls)
   with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:engine.public(v['id']),range(16)))
   self.assertTrue(all(result['state']=='succeeded' for result in results));self.assertEqual(sum(args[:2]==('network','create') for args in docker.calls),before)
if __name__=='__main__':unittest.main(verbosity=2)
