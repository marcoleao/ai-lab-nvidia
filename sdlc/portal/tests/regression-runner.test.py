"""Safety contracts for the Docker controller; no Docker daemon or business data."""
import importlib.util,json,unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('controller',Path(__file__).parents[1]/'scripts/regression.py')
controller=importlib.util.module_from_spec(spec);spec.loader.exec_module(controller)

class Safety(unittest.TestCase):
 def test_network_reconciliation_refuses_unowned_resources_before_loading_the_firewall_helper(self):
  with patch.object(controller,'owned',side_effect=RuntimeError('unowned')),patch.object(controller.importlib.util,'spec_from_file_location') as helper:
   with self.assertRaisesRegex(RuntimeError,'unowned'):controller.reconcile_network('fast')
   helper.assert_not_called()
 def test_unowned_resource_is_refused(self):
  value=type('Result',(),{'stdout':json.dumps([{'Config':{'Labels':{},'Env':[]}}])})()
  with patch.object(controller,'docker',return_value=value):
   with self.assertRaisesRegex(RuntimeError,'unowned'):controller.owned('sdlc-regression-fast-db')

 def test_real_database_is_refused_despite_owned_label(self):
  value=type('Result',(),{'stdout':json.dumps([{'Config':{'Labels':{controller.LABEL:controller.OWNER},'Env':['POSTGRES_DB=portal']}}])})()
  with patch.object(controller,'docker',return_value=value):
   with self.assertRaisesRegex(RuntimeError,'non-test'):controller.owned('sdlc-regression-fast-db')

 def test_unexpected_network_attachment_prevents_any_removal(self):
  def inspect(name,kind='container'):
   return {'Containers':{'external':{'Name':'human-portal'}}} if kind=='network' else {}
  with patch.object(controller,'exists',return_value=True),patch.object(controller,'owned',side_effect=inspect),patch.object(controller,'docker') as docker:
   with self.assertRaisesRegex(RuntimeError,'unexpected'):controller.cleanup('fast')
   docker.assert_not_called()

if __name__=='__main__':unittest.main()
