"""Installer guards without Docker, WSL provisioning, network or inference."""
import importlib.util,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('installation_check',Path(__file__).parents[1]/'scripts/installation-check.py')
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)

class InstallationChecks(unittest.TestCase):
 def test_a_public_inference_address_is_refused_before_network_access(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(check,'ROOT',Path(directory)/'sdlc/portal'),patch.object(check,'get') as request:
   source=Path(directory)/'lab/config/lab.yaml';source.parent.mkdir(parents=True);source.write_text('ollama_address: 8.8.8.8\n')
   with self.assertRaisesRegex(check.Missing,'endereco privado'):check.upstream()
   request.assert_not_called()
 def test_both_local_models_are_required_without_issuing_inference_or_download(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(check,'RUNTIME',Path(directory)),patch.object(check,'upstream',return_value='http://10.239.0.10:11434'),patch.object(check,'get',return_value={'models':[{'name':'general'}]}) as request,patch.object(check,'run') as execute:
   with self.assertRaisesRegex(check.Missing,'coding'):check.models('general','coding')
   request.assert_called_once_with('http://10.239.0.10:11434/api/tags');execute.assert_not_called()
 def test_reinstallation_never_silently_switches_an_existing_model(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(check,'RUNTIME',Path(directory)),patch.object(check,'upstream',return_value='http://10.239.0.10:11434'),patch.object(check,'get',return_value={'models':[{'name':'general'},{'name':'coding'}]}):
   file=Path(directory)/'coding-executor/config.json';file.parent.mkdir();file.write_text(json.dumps({'model':'previous'}))
   with self.assertRaisesRegex(check.Missing,'Selecao instalada difere'):check.models('general','coding')
   self.assertEqual(json.loads(file.read_text()),{'model':'previous'})
 def test_optional_registry_does_not_approve_a_missing_runtime_or_block_the_dev_profile(self):
  values=[{'id':name,'status':'ready'} for name in check.REQUIRED_INTEGRATIONS]+[{'id':'registry','status':'not_configured'}]
  self.assertEqual(set(check.integrations({'checks':values})),check.REQUIRED_INTEGRATIONS)
  for name in check.REQUIRED_INTEGRATIONS:
   with self.subTest(name=name),self.assertRaisesRegex(check.Missing,name):check.integrations({'checks':[value for value in values if value['id']!=name]})
 def test_active_native_work_refuses_configuration_without_modifying_receipts(self):
  with tempfile.TemporaryDirectory() as directory,patch.object(check,'RUNTIME',Path(directory)),patch.object(check,'sql') as sql:
   file=Path(directory)/'runtime-executor/state/jobs/job/receipt.json';file.parent.mkdir(parents=True);file.write_text('{"state":"running"}')
   with self.assertRaisesRegex(check.Missing,'trabalho nativo'):check.idle()
   self.assertEqual(file.read_text(),'{"state":"running"}');sql.assert_not_called()
 def test_a_cancelled_turn_with_a_live_lease_still_blocks_reconfiguration(self):
  def sql(query):
   if query.startswith('SELECT table_name'):return 'ChatTurn|status\nChatTurn|leaseUntil'
   self.assertIn('"status"::text',query);self.assertIn('"leaseUntil">CURRENT_TIMESTAMP',query);return '1'
  with tempfile.TemporaryDirectory() as directory,patch.object(check,'RUNTIME',Path(directory)),patch.object(check,'sql',side_effect=sql):
   with self.assertRaisesRegex(check.Missing,'ChatTurn'):check.idle()
 def test_read_only_doctor_does_not_require_empty_queues(self):
  with patch.object(check,'preflight') as preflight,patch.object(check,'run',return_value='inactive'):
   with self.assertRaisesRegex(check.Missing,'sdlc-llm-relay'):check.doctor('general','coding')
   preflight.assert_called_once_with('general','coding',check_idle=False)
 def test_a_linked_configuration_is_refused_instead_of_followed(self):
  with tempfile.TemporaryDirectory() as directory:
   original=Path(directory)/'configuration.json';original.write_text('{}');linked=Path(directory)/'linked.json';linked.symlink_to(original)
   with self.assertRaisesRegex(check.Missing,'vinculado'):check.read(linked)
 def test_missing_image_diagnostic_identifies_the_component_and_next_command(self):
  with patch.object(check.os,'geteuid',return_value=0),patch.object(check.Path,'is_file',return_value=True),patch.object(check,'sources'),patch.object(check,'run',side_effect=check.Missing('not present')),patch.object(check,'models') as models:
   with self.assertRaisesRegex(check.Missing,'sdlc-portal:prepared.*install.ps1 prepare'):check.preflight('general','coding')
   models.assert_not_called()
 def test_failed_image_preparation_never_records_success_and_retry_retains_both_results(self):
  spec=importlib.util.spec_from_file_location('prepared_installation',Path(__file__).parents[1]/'scripts/prepared.py');prepared=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepared)
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)/'source'),patch.dict(os.environ,{'SDLC_RUNTIME_ROOT':directory}),patch.object(prepared,'fingerprint',return_value='a'*64),patch.object(prepared,'image_source',return_value='a'*64),patch.object(prepared,'image_id',return_value='sha256:'+'b'*64),patch.object(prepared.subprocess,'run') as execute:
   execute.side_effect=RuntimeError('isolated preparation failure')
   with self.assertRaisesRegex(RuntimeError,'isolated preparation failure'):prepared.prepare()
   records=[json.loads(line) for line in (Path(directory)/'audit/admin.jsonl').read_text().splitlines()]
   self.assertEqual(records[-1]['outcome'],'UNKNOWN');self.assertEqual(records[-1]['phase'],'OBSERVED')
   self.assertFalse(any(call.args[0][-1]=='record' for call in execute.call_args_list))
   execute.reset_mock();execute.side_effect=None;prepared.prepare()
   self.assertEqual(execute.call_args_list[-1].args[0][-1],'record')
   records=[json.loads(line) for line in (Path(directory)/'audit/admin.jsonl').read_text().splitlines()]
   self.assertEqual(records[-1]['outcome'],'SUCCEEDED');self.assertEqual(len(records),4)
   self.assertNotEqual(records[0]['operationId'],records[2]['operationId'])
   first=Path(directory)/'portal/preparation-operations'/records[0]['operationId'];second=Path(directory)/'portal/preparation-operations'/records[2]['operationId']
   self.assertTrue((first/'before.json').is_file());self.assertFalse((first/'after.json').exists())
   self.assertTrue((second/'before.json').is_file());self.assertTrue((second/'after.json').is_file())
 def test_changed_source_refuses_the_prepared_manifest_after_build(self):
  spec=importlib.util.spec_from_file_location('prepared_stale',Path(__file__).parents[1]/'scripts/prepared.py');prepared=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepared)
  with tempfile.TemporaryDirectory() as directory,patch.object(prepared,'ROOT',Path(directory)/'source'),patch.dict(os.environ,{'SDLC_RUNTIME_ROOT':directory}),patch.object(prepared,'fingerprint',side_effect=['a'*64,'b'*64]),patch.object(prepared.subprocess,'run') as execute:
   with self.assertRaisesRegex(RuntimeError,'Source changed'):prepared.prepare()
   self.assertFalse(any(call.args[0][-1]=='record' for call in execute.call_args_list))

if __name__=='__main__':unittest.main()
