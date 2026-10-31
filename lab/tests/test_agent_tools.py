"""Pinned bootstrap contract; no Docker, model, app or GPU required."""
import contextlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('agent_tools',ROOT/'scripts/linux/agent-tools.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class AgentTools(unittest.TestCase):
 def test_verify_is_offline_and_does_not_build(self):
  value={'Id':'sha256:fixed','Config':{'Labels':{'org.sdlc.qwen-code-version':module.VERSION}}}
  with patch.object(module,'image',return_value=value),patch.object(module,'run',return_value=type('Result',(),{'stdout':module.VERSION+'\n'})()) as run:
   module.verify();args=run.call_args.args
   self.assertIn('none',args);self.assertIn('--read-only',args);self.assertIn('never',args);self.assertNotIn('build',args);self.assertNotIn('pull',args)
 def test_wrong_image_label_fails_before_running_cli(self):
  with patch.object(module,'image',return_value={'Config':{}}),patch.object(module,'run') as run:
   with self.assertRaisesRegex(RuntimeError,'pinned'):module.verify()
   run.assert_not_called()
 def test_declared_lock_and_image_match_cli_and_sdk(self):
  manifest=json.loads((ROOT/'qwen-code/package.json').read_text());lock=json.loads((ROOT/'qwen-code/package-lock.json').read_text())
  for name,version in manifest['dependencies'].items():
   self.assertEqual(lock['packages']['node_modules/'+name]['version'],version);self.assertTrue(lock['packages']['node_modules/'+name]['integrity'].startswith('sha512-'))
  self.assertEqual(manifest['dependencies']['@qwen-code/qwen-code'],module.VERSION)
 def test_changed_lock_prevents_mutation_and_audit(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'qwen-code').mkdir();(root/'qwen-code/package.json').write_text(json.dumps({'dependencies':{'@qwen-code/qwen-code':'wrong'}}));(root/'qwen-code/package-lock.json').write_text('{}')
   with patch.object(module,'ROOT',root),patch.object(module,'run') as run,patch.object(module,'administrative_operation') as audit:
    with self.assertRaisesRegex(RuntimeError,'lock'):module.prepare()
    run.assert_not_called();audit.assert_not_called()
if __name__=='__main__':unittest.main()
