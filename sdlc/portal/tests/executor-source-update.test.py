import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('executor_source_update',Path(__file__).resolve().parents[1]/'scripts/executor_source_update.py')
update=importlib.util.module_from_spec(spec);spec.loader.exec_module(update)

class Operation:
 def __init__(self,fail=False,fail_exit=False):self.fail=fail;self.fail_exit=fail_exit;self.results=[]
 def __enter__(self):return self
 def __exit__(self,*args):
  if self.fail_exit:raise RuntimeError('completion append unavailable')
  return False
 def result(self,**value):
  if self.fail:raise RuntimeError('recorder unavailable')
  self.results.append(value)

class SourceUpdateTests(unittest.TestCase):
 def setup_installation(self,root,kind):
  source=root/'source';install=root/'installed';target=install/(kind+'-executor');target.mkdir(parents=True)
  owner=root/'owner';owner.write_text('owned')
  plan=update.PLANS[kind]
  for relative in plan['digest']:
   path=source/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('new '+relative)
  for name in plan['files'].values():(target/name).write_text('old '+name)
  (target/'installation.json').write_text(json.dumps({'sourceDigest':'old-digest','installationId':'stable-owner','customMetadata':'keep'}))
  config={'model':'chosen-model','uiModel':'chosen-ui-model','maxCalls':37,'installationId':'stable-owner','browserImageId':'sha256:coding','aiBrowserImageId':'sha256:runtime'}
  (target/'config.json').write_text(json.dumps(config,indent=3))
  return source,install,target,owner

 def run_case(self,kind,*,failure=None,active=False,browser=False):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);source,install,target,owner=self.setup_installation(root,kind)
   before={p.name:p.read_bytes() for p in target.iterdir()};commands=[];operation=Operation(fail=failure=='audit',fail_exit=failure=='audit_exit');image='sha256:'+'a'*64
   if active:
    job=target/('state/active' if kind=='coding' else 'state/ai-jobs/active');job.mkdir(parents=True);(job/'receipt.json').write_text('{"state":"running"}')
   def run(*args):
    commands.append(args)
    if args[:2]==('systemctl','is-active'):return 'active'
    if args[:3]==('docker','image','inspect'):return json.dumps([{'Id':image,'Config':{'Labels':{'org.sdlc.coding-browser':'react-entry-v1'}}}])
    if args[:2]==('docker','run'):return (source/'executor'/args[-1].split('/')[-1]).read_text().strip()
    return ''
   with patch.object(update,'ROOT',source),patch.object(update,'INSTALL_ROOT',install),patch.object(update,'OWNER_FILE',owner),patch.object(update.os,'geteuid',return_value=0),patch.object(update,'run',side_effect=run),patch.object(update,'healthy',return_value=failure!='health'),patch.object(update.time,'sleep'),patch.object(update,'administrative_operation',return_value=operation) as audit:
    if failure or active:
     with self.assertRaises(RuntimeError):update.refresh(kind,**({'browser_image':image} if browser else {}))
     self.assertTrue(all((target/name).read_bytes()==value for name,value in before.items()))
     if active:audit.assert_not_called();self.assertFalse(any(args[:2]==('systemctl','stop') for args in commands))
     else:
      rollback=list((install/'backups').glob('*/rollback.json'));self.assertEqual(len(rollback),1);self.assertTrue(json.loads(rollback[0].read_text())['filesRestored'])
    else:
     value=update.refresh(kind,**({'browser_image':image} if browser else {}));self.assertTrue(value['ready'])
     if browser:
      expected=json.loads(before['config.json']);expected['browserImageId' if kind=='coding' else 'aiBrowserImageId']=image
      self.assertEqual(json.loads((target/'config.json').read_text()),expected);self.assertTrue(value['configurationOnlyBrowserChanged']);self.assertFalse(value['configurationPreserved'])
     else:self.assertEqual((target/'config.json').read_bytes(),before['config.json'])
     self.assertEqual(json.loads((target/'installation.json').read_text())['customMetadata'],'keep')
     for relative,name in update.PLANS[kind]['files'].items():self.assertEqual((target/name).read_bytes(),(source/relative).read_bytes())
     value2=update.refresh(kind);self.assertNotEqual(value['backupId'],value2['backupId']);self.assertEqual(value['sourceDigest'],value2['sourceDigest'])
     if not browser:self.assertEqual((target/'config.json').read_bytes(),before['config.json'])
     self.assertEqual(audit.call_args.args[0],update.PLANS[kind]['action'])
   return commands
 def test_refresh_preserves_configuration_identity_and_allows_explicit_retry(self):
  for kind in update.PLANS:
   with self.subTest(kind=kind):self.run_case(kind)
 def test_failed_health_restores_sources_metadata_and_configuration(self):
  for kind in update.PLANS:
   with self.subTest(kind=kind):self.run_case(kind,failure='health')
 def test_failed_recorder_confirmation_compensates_the_installation(self):
  self.run_case('coding',failure='audit')
 def test_completion_append_failure_at_context_exit_restores_the_previous_installation(self):
  for kind in update.PLANS:
   for browser in [False,True]:
    with self.subTest(kind=kind,browser=browser):self.run_case(kind,failure='audit_exit',browser=browser)
 def test_active_jobs_are_refused_before_audit_stop_or_write(self):
  for kind in update.PLANS:
   with self.subTest(kind=kind):self.run_case(kind,active=True)
 def test_explicit_browser_update_changes_only_image_reference_and_compensates_on_failure(self):
  for kind in update.PLANS:
   for failure in [None,'health','audit']:
    with self.subTest(kind=kind,failure=failure):self.run_case(kind,failure=failure,browser=True)
 def test_browser_reference_requires_immutable_qualified_identity_before_audit(self):
  with tempfile.TemporaryDirectory() as directory:
   source,install,target,owner=self.setup_installation(Path(directory),'coding');before={p.name:p.read_bytes() for p in target.iterdir()}
   def run(*args):return 'active' if args[:2]==('systemctl','is-active') else json.dumps([{'Id':'sha256:'+'b'*64,'Config':{'Labels':{}}}])
   with patch.object(update,'ROOT',source),patch.object(update,'INSTALL_ROOT',install),patch.object(update,'OWNER_FILE',owner),patch.object(update.os,'geteuid',return_value=0),patch.object(update,'run',side_effect=run),patch.object(update,'administrative_operation') as audit:
    for image in ['mutable:tag','sha256:'+'a'*64]:
     with self.assertRaises((ValueError,RuntimeError)):update.refresh('coding',browser_image=image)
    audit.assert_not_called()
   self.assertTrue(all((target/name).read_bytes()==value for name,value in before.items()))
 def test_unavailable_audit_prevents_every_write_and_service_stop(self):
  with tempfile.TemporaryDirectory() as directory:
   source,install,target,owner=self.setup_installation(Path(directory),'coding')
   before={p.name:p.read_bytes() for p in target.iterdir()}
   def run(*args):return 'active' if args[:2]==('systemctl','is-active') else (source/'executor'/args[-1].split('/')[-1]).read_text().strip()
   with patch.object(update,'ROOT',source),patch.object(update,'INSTALL_ROOT',install),patch.object(update,'OWNER_FILE',owner),patch.object(update.os,'geteuid',return_value=0),patch.object(update,'run',side_effect=run) as runner,patch.object(update,'administrative_operation',side_effect=RuntimeError('audit unavailable')):
    with self.assertRaisesRegex(RuntimeError,'audit unavailable'):update.refresh('coding')
    self.assertFalse(any(call.args[:2]==('systemctl','stop') for call in runner.call_args_list))
   self.assertTrue(all((target/name).read_bytes()==value for name,value in before.items()));self.assertFalse((install/'backups').exists())

if __name__=='__main__':unittest.main()
