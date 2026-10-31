"""Minimal LAB profile contracts, without Docker, GPU, network or model downloads."""
import importlib.util,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts/linux'))
import profile_assets as assets
spec=importlib.util.spec_from_file_location('sdlc_manifest',ROOT/'scripts/linux/offline-manifest.py');manifest=importlib.util.module_from_spec(spec);spec.loader.exec_module(manifest)

def fixture(root,profile='sdlc'):
 (root/'config').mkdir()
 for name in ['models.yaml','sdlc-profile.json','versions.env']:(root/'config'/name).write_bytes((ROOT/'config'/name).read_bytes())
 incoming=root/'incoming.env';incoming.write_text('LAB_PROFILES='+profile+'\nHEALTH_TIMEOUT_SECONDS=60\n')
 return incoming

class SdlcProfile(unittest.TestCase):
 def test_profile_shell_entrypoints_have_valid_syntax_without_execution(self):
  for name in ['scripts/linux/lab.sh','scripts/linux/common.sh','scripts/linux/sync.sh','scripts/linux/pull-models.sh','scripts/linux/doctor.sh','tests/smoke-test.sh']:
   with self.subTest(name=name):subprocess.run(['bash','-n',str(ROOT/name)],check=True,capture_output=True)
 def test_only_existing_general_and_coding_models_are_selected(self):
  self.assertEqual(assets.selected_models(ROOT,['sdlc']),['qwen3.5:9b','qwen3:14b'])
  self.assertEqual(len(assets.selected_models(ROOT,['core','agents'])),7)
  expected=next(line.split('=',1)[1] for line in (ROOT/'config/versions.env').read_text().splitlines() if line.startswith('OLLAMA_IMAGE='))
  self.assertEqual(assets.image_plan(ROOT,['sdlc']),[expected])
 def test_roles_match_the_complete_sdlc_installer_defaults(self):
  policy=json.loads((ROOT/'config/sdlc-profile.json').read_text())['models'];installer=(ROOT.parent/'sdlc/install.ps1').read_text()
  self.assertIn("$GeneralModel='"+policy['general']+"'",installer);self.assertIn("$CodingModel='"+policy['coding']+"'",installer)
 def test_mixed_or_unknown_profiles_are_refused(self):
  for selection in [['sdlc','core'],['sdlc','agents'],['unknown'],['sdlc','sdlc']]:
   with self.subTest(selection=selection),self.assertRaises(ValueError):assets.profiles(selection)
 def test_policy_cannot_introduce_a_new_model_or_duplicate_roles(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);fixture(root)
   for model in ['foreign:1','qwen3.5:9b']:
    (root/'config/sdlc-profile.json').write_text(json.dumps({'version':1,'models':{'general':'qwen3.5:9b','coding':model}}))
    with self.assertRaises(ValueError):assets.selected_models(root,['sdlc'])
 def test_selection_is_idempotent_and_preserves_the_full_inventory_and_other_weights(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);declaration=(root/'config/models.yaml').read_bytes()
   weights=root/'retained-model-weights';weights.write_bytes(b'existing model not selected')
   self.assertTrue(assets.selection(root,incoming)['changed']);self.assertFalse(assets.selection(root,incoming)['changed'])
   self.assertEqual((root/'.models').read_text().splitlines(),['qwen3.5:9b','qwen3:14b']);self.assertEqual((root/'config/models.yaml').read_bytes(),declaration);self.assertEqual(weights.read_bytes(),b'existing model not selected')
   rows=[json.loads(line) for line in (root/'audit/admin.jsonl').read_text().splitlines()];self.assertEqual(rows[-1]['outcome'],'NO_CHANGE')
 def test_failed_selection_restores_all_previous_files_and_retry_is_a_new_operation(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root,'core,agents');assets.selection(root,incoming)
   names=['.models','.runtime.env','.profile-selection.json'];before={name:(root/name).read_bytes() for name in names}
   incoming.write_text('LAB_PROFILES=sdlc\nHEALTH_TIMEOUT_SECONDS=60\n');write=assets.atomic_bytes;failed=False
   def fail_once(path,content):
    nonlocal failed
    if path.name=='.models' and not failed:failed=True;raise OSError('isolated failure')
    return write(path,content)
   with patch.object(assets,'atomic_bytes',side_effect=fail_once):self.assertEqual(assets.selection(root,incoming),{'selected':False,'rollbackConfirmed':True})
   self.assertEqual({name:(root/name).read_bytes() for name in names},before)
   self.assertTrue(assets.selection(root,incoming)['selected'])
   rows=[json.loads(line) for line in (root/'audit/admin.jsonl').read_text().splitlines()];self.assertEqual(rows[-3]['outcome'],'FAILED');self.assertEqual(rows[-1]['outcome'],'SUCCEEDED');self.assertNotEqual(rows[-3]['operationId'],rows[-1]['operationId'])
 def test_linked_selection_file_is_refused_before_mutation(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);external=root/'untouched';external.write_text('preserve');(root/'.models').symlink_to(external)
   with self.assertRaises(ValueError):assets.selection(root,incoming)
   self.assertEqual(external.read_text(),'preserve');self.assertFalse((root/'.runtime.env').exists())
 def test_unavailable_audit_prevents_selection_writes(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root)
   with patch.object(assets,'administrative_operation',side_effect=OSError('audit unavailable')):
    with self.assertRaises(OSError):assets.selection(root,incoming)
   self.assertFalse((root/'.models').exists());self.assertFalse((root/'.runtime.env').exists())
 def test_unconfirmed_rollback_is_not_reported_as_success(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root,'core,agents');assets.selection(root,incoming)
   incoming.write_text('LAB_PROFILES=sdlc\nHEALTH_TIMEOUT_SECONDS=60\n')
   with patch.object(assets,'atomic_bytes',side_effect=OSError('write unavailable')):
    with self.assertRaisesRegex(RuntimeError,'rollback not confirmed'):assets.selection(root,incoming)
   rows=[json.loads(line) for line in (root/'audit/admin.jsonl').read_text().splitlines()];self.assertEqual(rows[-1]['outcome'],'UNKNOWN')
 def test_minimal_preparation_does_not_build_pull_or_run_optional_assets(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);assets.selection(root,incoming)
   def run(args,**kwargs):
    if args[-1]=='prepare':(root/'.offline-manifest.json').write_text('{"profiles":["sdlc"]}')
   with patch.object(assets.subprocess,'run',side_effect=run) as execute:assets.prepare_sdlc(root)
   calls=[call.args[0] for call in execute.call_args_list]
   self.assertEqual(calls[0],['docker','pull',assets.image_plan(root,['sdlc'])[0]])
   self.assertEqual(len(calls),4)
   flattened=' '.join(' '.join(call) for call in calls)
   for forbidden in ['open-webui','qdrant','ai-dev','jupyter','qwen-code','embedding','tiktoken','build']:
    if forbidden=='build':continue # --no-build is required.
    self.assertNotIn(forbidden,flattened)
   self.assertNotIn('build',[word for call in calls for word in call]);self.assertIn('--profile',calls[1]);self.assertIn('sdlc',calls[1])
 def test_preparation_failure_keeps_unknown_evidence_and_does_not_finalize_a_manifest(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);assets.selection(root,incoming)
   with patch.object(assets.subprocess,'run',side_effect=OSError('isolated failure')):
    with self.assertRaises(OSError):assets.prepare_sdlc(root)
   self.assertFalse((root/'.offline-manifest.json').exists())
   rows=[json.loads(line) for line in (root/'audit/admin.jsonl').read_text().splitlines()];self.assertEqual(rows[-1]['outcome'],'UNKNOWN')
 def test_failed_preparation_preserves_an_existing_manifest(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);assets.selection(root,incoming);prior=b'{"profiles":["core"],"preserved":true}'
   (root/'.offline-manifest.json').write_bytes(prior)
   with patch.object(assets.subprocess,'run',side_effect=OSError('download interrupted')):
    with self.assertRaises(OSError):assets.prepare_sdlc(root)
   self.assertEqual((root/'.offline-manifest.json').read_bytes(),prior)
 def test_doctor_refuses_optional_services_left_running_in_the_same_lab(self):
  values=[{'Config':{'Labels':{'com.docker.compose.project':'ai-local-lab','com.docker.compose.service':'open-webui'}}}]
  with patch.object(assets.subprocess,'check_output',side_effect=['container-id',json.dumps(values)]):
   with self.assertRaisesRegex(RuntimeError,'bootstrap down'):assets.check_services()
 def test_minimal_manifest_inventories_only_ollama_and_the_selected_models(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);incoming=fixture(root);assets.selection(root,incoming)
   def output(*args):
    if args[:3]==('docker','image','inspect'):return '[{"Id":"sha256:ollama"}]'
    if args[:2]==('docker','ps'):return 'owned-ollama'
    if args[:3]==('docker','exec','owned-ollama'):return '{"layers":[{"digest":"sha256:model"}]}'
    raise AssertionError(args)
   with patch.object(manifest,'ROOT',root),patch.object(manifest,'SDLC_FILES',('.models','.runtime.env')),patch.object(manifest,'output',side_effect=output):value=manifest.inventory()
   self.assertEqual(value['profiles'],['sdlc']);self.assertEqual(set(value['images']),set(assets.image_plan(root,['sdlc'])));self.assertEqual(set(value['models']),set(assets.selected_models(root,['sdlc'])))
 def test_manifest_from_another_profile_is_refused_before_docker(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);fixture(root);(root/'.runtime.env').write_text('LAB_PROFILES=sdlc\n')
   (root/'.offline-manifest.json').write_text(json.dumps({'version':manifest.SCHEMA_VERSION,'profiles':['core'],'files':{}}))
   with patch.object(manifest,'ROOT',root),patch.object(sys,'argv',['manifest','verify']),patch.object(manifest,'output') as output:
    with self.assertRaisesRegex(RuntimeError,'outro perfil'):manifest.main()
    output.assert_not_called()
 def test_minimal_smoke_cannot_contact_an_external_endpoint(self):
  spec=importlib.util.spec_from_file_location('minimal_ollama_smoke',ROOT/'tests/test_ollama.py');smoke=importlib.util.module_from_spec(spec);spec.loader.exec_module(smoke)
  with patch.dict(os.environ,{'OLLAMA_SMOKE_URL':'https://public.example:11434'}),patch.object(smoke.urllib.request,'build_opener') as opener:
   with self.assertRaises(ValueError):smoke.request('/api/tags')
   opener.assert_not_called()
 def test_minimal_smoke_uses_the_declared_model_and_rejects_cpu_only_inference(self):
  spec=importlib.util.spec_from_file_location('sdlc_smoke_gpu',ROOT/'tests/test_ollama.py');smoke=importlib.util.module_from_spec(spec);spec.loader.exec_module(smoke)
  for vram in [0,1024]:
   responses=[{'models':[{'name':'unused:99b'},{'name':'qwen3.5:9b'}]},{'done':True,'response':'ok'},{'models':[{'name':'qwen3.5:9b','size_vram':vram}]}]
   with self.subTest(vram=vram),patch.dict(os.environ,{'SMOKE_MODEL':'qwen3.5:9b'}),patch.object(smoke,'request',side_effect=responses) as request:
    if vram:smoke.main()
    else:
     with self.assertRaisesRegex(AssertionError,'VRAM'):smoke.main()
    self.assertEqual(request.call_args_list[1].args[1]['model'],'qwen3.5:9b')
 def test_minimal_cache_check_never_requires_or_runs_webui(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);fixture(root);(root/'.runtime.env').write_text('LAB_PROFILES=sdlc\n');(root/'.models').write_text('qwen3.5:9b\nqwen3:14b\n')
   value={'version':manifest.SCHEMA_VERSION,'profiles':['sdlc'],'files':{'.models':__import__('hashlib').sha256((root/'.models').read_bytes()).hexdigest()},'images':{assets.image_plan(root,['sdlc'])[0]:'sha256:ollama'},'models':{name:'digest' for name in assets.selected_models(root,['sdlc'])}}
   (root/'.offline-manifest.json').write_text(json.dumps(value))
   with patch.object(manifest,'ROOT',root),patch.object(manifest,'SDLC_FILES',('.models',)),patch.object(sys,'argv',['manifest','caches']),patch.object(manifest,'output',return_value='[{"Id":"sha256:ollama"}]') as output:
    manifest.main();self.assertEqual(output.call_count,1);self.assertEqual(output.call_args.args[:3],('docker','image','inspect'))

if __name__=='__main__':unittest.main()
