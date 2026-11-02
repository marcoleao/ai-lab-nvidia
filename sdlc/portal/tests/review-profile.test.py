"""Code Review profile selection without inference, Docker or configuration writes."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('review_connection',Path(__file__).parents[1]/'scripts/connect-llm.py')
connection=importlib.util.module_from_spec(spec);spec.loader.exec_module(connection)

class ReviewProfileTests(unittest.TestCase):
 def test_missing_profile_preserves_the_general_model_and_default_budget(self):
  self.assertEqual(connection.review_profile('general',None,None,{},{}),('general',2048))
 def test_reconnection_preserves_an_independent_configured_reviewer(self):
  override={'services':{'api':{'environment':{'CODE_REVIEW_MAX_TOKENS':'8192'}}}}
  self.assertEqual(connection.review_profile('new-general',None,None,{'reviewModel':'configured-review'},override),('configured-review',8192))
 def test_explicit_profile_changes_only_the_selected_review_values(self):
  self.assertEqual(connection.review_profile('general','new-review',4096,{'reviewModel':'old-review'},{}),('new-review',4096))
 def test_invalid_output_budget_is_refused_before_configuration(self):
  for budget in [0,511,8193,True,1.5]:
   with self.subTest(budget=budget),self.assertRaisesRegex(RuntimeError,'output budget'):connection.review_profile('general',None,budget,{}, {})

if __name__=='__main__':unittest.main()
