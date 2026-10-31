import importlib.util,json,tempfile,time,unittest,sys,threading,http.client,socket
from unittest.mock import patch,Mock
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'executor'))
spec=importlib.util.spec_from_file_location('coding_service',Path(__file__).resolve().parents[1]/'executor/coding_service.py');service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
class CodingContract(unittest.TestCase):
 def intent(self):return {'id':'a'*64,'expectedSha':'b'*40,'files':[{'path':'src/a.js','content':'export const a=1;'}],'prompt':'Escopo aprovado','allowDependencies':False}
 def request(self):return {'model':'local:9b','messages':[{'role':'user','content':[{'type':'text','text':'Approved scope'}]}],'tools':[{'type':'function','function':{'name':name,'parameters':{'type':'object'}}} for name in service.TOOLS],'stream':True}
 def setUp(self):service.CONFIG={'model':'local:9b'};self.job={'calls':0,'started':time.monotonic()}
 def test_identity_paths_duplicates_and_capability_are_strict(self):
  service.validate_intent(self.intent())
  for change in [{'expectedSha':'main'},{'allowDependencies':'true'},{'extra':'anything'},{'files':[{'path':'../app.js','content':'x'}]},{'files':[{'path':'x.js','content':'x'},{'path':'X.js','content':'x'}]}]:
   with self.subTest(change=change),self.assertRaises(ValueError):service.validate_intent({**self.intent(),**change})
 def test_only_text_fixed_model_and_exact_tool_registry_are_forwarded(self):
  native=service.validate_inference(self.request(),self.job);self.assertEqual(native['messages'][0]['content'],'Approved scope');self.assertFalse(native['stream']);self.assertFalse(native['think']);self.assertEqual(native['options']['num_ctx'],32768)
  for change in [{'model':'other'},{'tools':[]},{'messages':[{'role':'user','content':[{'type':'image_url','image_url':'http://remote/'}]}]},{'tools':[{'type':'function','function':{'name':'run_shell_command'}}]},{'proxy':'http://remote'}]:
   with self.subTest(change=change),self.assertRaises(ValueError):service.validate_inference({**self.request(),**change},self.job)
 def test_tool_results_must_match_previous_authorized_call(self):
  value=self.request();value['messages']=[{'role':'assistant','content':None,'tool_calls':[{'id':'a','type':'function','function':{'name':'mcp__sdlc__read_file','arguments':'{"path":"src/a.js"}'}}]},{'role':'tool','tool_call_id':'a','content':'source'}]
  native=service.validate_inference(value,self.job);self.assertEqual(native['messages'][-1]['tool_name'],'mcp__sdlc__read_file')
  value['messages'][-1]['tool_call_id']='forged'
  with self.assertRaisesRegex(ValueError,'Unmatched'):service.validate_inference(value,self.job)
 def test_unknown_tool_and_job_budgets_fail_closed(self):
  for job in [{'calls':16,'started':time.monotonic()},{'calls':0,'started':time.monotonic()-301},{'calls':0,'started':time.monotonic()-241,'phaseSeconds':240},{'calls':0,'started':time.monotonic(),'rootStarted':time.monotonic()-601,'totalSeconds':600},{'calls':0,'started':time.monotonic(),'totalCalls':32}]:
   with self.assertRaisesRegex(ValueError,'budget'):service.validate_inference(self.request(),job)
  value=self.request();value['messages']=[{'role':'assistant','content':'','tool_calls':[{'id':'a','type':'function','function':{'name':'run_shell_command','arguments':'{}'}}]}]
  with self.assertRaisesRegex(ValueError,'Forbidden'):service.validate_inference(value,self.job)
 def test_intent_digest_preserves_idempotency_and_detects_changed_source(self):
  first=self.intent();same=json.loads(json.dumps(first));self.assertEqual(service.source_digest(first),service.source_digest(same));same['files'][0]['content']='different';self.assertNotEqual(service.source_digest(first),service.source_digest(same))
 def test_receipt_atomic_replace_preserves_last_confirmed_result(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'receipt.json';service.dump(path,{'state':'queued'});service.dump(path,{'state':'succeeded','expectedSha':'b'*40});self.assertEqual(json.loads(path.read_text())['state'],'succeeded');self.assertFalse(path.with_suffix('.tmp').exists())
 def test_repair_combines_changes_against_original_without_resetting_budget(self):
  intent=self.intent();working,first=service.candidate_files(intent,intent['files'],{'files':[{'path':'src/a.js','content':'export const a=2;'}]})
  working,final=service.candidate_files(intent,working,{'files':[{'path':'src/main.jsx','content':'render();'}]})
  self.assertEqual([f['path'] for f in final['files']],['src/a.js','src/main.jsx']);self.assertEqual(final['files'][0]['content'],'export const a=2;')
  with self.assertRaisesRegex(ValueError,'budget'):service.candidate_files(intent,working,{'files':[{'path':f'src/{n}.js','content':'x'} for n in range(7)]})
  for name in ['package.json','dist/a.js','../a.js']:
   with self.assertRaises(ValueError):service.candidate_files(intent,working,{'files':[{'path':name,'content':'{}'}]})
 def test_unknown_model_tool_gets_denial_feedback_without_becoming_executable(self):
  job={'diagnostics':[]};calls=service.model_tool_calls({'tool_calls':[{'function':{'name':'run_shell_command','arguments':{'command':'forbidden'}}}]},job)
  self.assertEqual(calls[0]['function']['name'],'mcp__sdlc__policy_error');self.assertEqual(json.loads(calls[0]['function']['arguments']),{'requestedTool':'run_shell_command'});self.assertEqual(job['deniedTools'],1);self.assertNotIn('command',json.loads(calls[0]['function']['arguments']))
  for _ in range(2):service.model_tool_calls({'tool_calls':[{'function':{'name':'finish','arguments':{}}}]},job)
  with self.assertRaisesRegex(ValueError,'Repeated'):service.model_tool_calls({'tool_calls':[{'function':{'name':'finish','arguments':{}}}]},job)
 def test_failed_browser_round_repairs_same_intent_and_publishes_only_combined_valid_patch(self):
  intent=self.intent();intent['files'].append({'path':'src/main.jsx','content':'render();'})
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);service.CONFIG={'model':'local:9b','imageId':'sha256:'+'e'*64,'browserImageId':'sha256:'+'f'*64,'inferenceSocket':'/private/inference.sock'};commands=[]
   def run(command,**kwargs):
    commands.append(command);session=next(part.split('src=')[1].split(',')[0] for part in command if isinstance(part,str) and 'dst=/session' in part)
    index=len(commands);files=[{'path':'src/a.js','content':'export const a=2;'}] if index==1 else [{'path':'src/main.jsx','content':'renderProvider();'}]
    (Path(session)/'result.json').write_text(json.dumps({'state':'succeeded','expectedSha':intent['expectedSha'],'patch':{'files':files},'validation':{'valid':True},'uiSteps':[{'op':'expect_text','value':'Conteúdo aprovado'}] if index==1 else [],'tools':[{'tool':'edit_file'}]}));return Mock(returncode=0)
   with patch.object(service.subprocess,'run',side_effect=run),patch.object(service.os,'chown'),patch.object(service,'SLOT',Mock()),patch.object(service,'check_candidate',side_effect=[{'applicable':True,'passed':False,'errors':['Provider missing']},{'applicable':True,'passed':False,'errors':['Provider missing']},{'applicable':True,'passed':True,'errors':[]}]) as browser_check:service.execute(intent,root,{'id':intent['id'],'expectedSha':intent['expectedSha']})
   self.assertEqual(browser_check.call_args.kwargs['steps'],[{'op':'expect_text','value':'Conteúdo aprovado'}])
   value=json.loads((root/'receipt.json').read_text());self.assertEqual(value['state'],'succeeded');self.assertEqual(len(value['patch']['files']),2);self.assertEqual(len(value['browserChecks']),2)
   second=json.loads((root/'request-2.json').read_text());self.assertEqual(second['id'],intent['id']);self.assertEqual(second['expectedSha'],intent['expectedSha']);self.assertIn('Provider missing',second['prompt']);self.assertLess(second['prompt'].index('Provider missing'),second['prompt'].index(intent['prompt']));self.assertEqual(second['files'][0]['content'],'export const a=2;');self.assertTrue((root/'browser-proof-1.json').is_file())
   first=json.loads((root/'request-1.json').read_text());self.assertIn('src/main.jsx',first['prompt']);self.assertIn('Provider missing',first['prompt']);self.assertTrue((root/'browser-baseline.json').is_file())
   for command in commands:self.assertIn('none',command);self.assertIn('--read-only',command)
 def test_opening_alone_cannot_approve_an_interface_patch_and_repair_can_supply_only_the_plan(self):
  intent=self.intent();intent['files'].append({'path':'src/main.jsx','content':'render();'})
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);service.CONFIG={'model':'local:9b','imageId':'sha256:'+'e'*64,'browserImageId':'sha256:'+'f'*64,'inferenceSocket':'/private/inference.sock'};requests=[]
   def run(command,**kwargs):
    requests.append(command);index=len(requests);mount=next(value for value in command if value.startswith('type=bind,src=') and ',dst=/session' in value);session=Path(mount.split('src=',1)[1].split(',dst=',1)[0]);(session/'result.json').write_text(json.dumps({'state':'succeeded','expectedSha':intent['expectedSha'],'patch':{'files':[{'path':'src/main.jsx','content':'renderFixed();'}] if index==1 else []},'validation':{'valid':True},'uiSteps':[] if index==1 else [{'op':'expect_text','value':'Tela conferida'}],'tools':[{'tool':'validate_candidate'}]}));return Mock(returncode=0)
   proof={'applicable':True,'passed':True,'errors':[]}
   with patch.object(service.subprocess,'run',side_effect=run),patch.object(service.os,'chown'),patch.object(service,'SLOT',Mock()),patch.object(service,'check_candidate',side_effect=[dict(proof),dict(proof),dict(proof)]):service.execute(intent,root,{'id':intent['id'],'expectedSha':intent['expectedSha']})
   value=json.loads((root/'receipt.json').read_text());self.assertEqual(value['state'],'succeeded');self.assertFalse(value['browserChecks'][0]['passed']);self.assertTrue(value['browserChecks'][0]['interactionPlanRequired']);self.assertTrue(value['browserChecks'][1]['passed']);self.assertEqual(value['patch']['files'][0]['content'],'renderFixed();');self.assertEqual(len(requests),2)
 def test_ui_probe_contract_rejects_code_network_storage_and_missing_assertions(self):
  valid=[{'op':'fill','target':{'by':'label','name':'Preço'},'value':'0'},{'op':'click','target':{'by':'role','role':'button','name':'Salvar'}},{'op':'expect_text','value':'R$ 0,00'}]
  self.assertEqual(service.validate_ui_steps(valid),valid)
  self.assertEqual(service.validate_ui_steps([{'op':'fill','target':{'by':'role','role':'textbox','name':'','index':0},'value':'x'},{'op':'expect_text','value':'x'}])[0]['target']['index'],0)
  for target in [{'by':'label','name':''},{'by':'role','role':'textbox','name':''},{'by':'role','role':'textbox','name':'','index':True},{'by':'role','role':'button','name':'','index':0}]:
   with self.assertRaises(ValueError):service.validate_ui_steps([{'op':'fill','target':target,'value':'x'},{'op':'expect_text','value':'x'}])
  invalid=[[{'op':'evaluate','value':'process.env'}],[{'op':'goto','value':'http://remote'}],[{'op':'storage','value':'inject'}],valid+[{'op':'click','target':{'by':'css','name':'body'}}],[{'op':'fill','target':{'by':'label','name':'Preço'},'value':'0'}],valid*8,valid+[{'op':'reload','url':'http://remote'}],valid+[{'op':'check','target':{'by':'label','name':'Aceite','index':True}}]]
  for steps in invalid:
   with self.subTest(steps=steps),self.assertRaises(ValueError):service.validate_ui_steps(steps)
 def test_live_validation_rechecks_identity_scope_and_budget_without_publishing(self):
  with tempfile.TemporaryDirectory() as directory:
   intent=self.intent();job={'intent':intent,'directory':Path(directory),'started':time.monotonic(),'validations':0,'validationLock':threading.Lock()};value={'expectedSha':intent['expectedSha'],'files':[{'path':'src/a.js','content':'export const a=2;'}],'steps':[]}
   with patch.object(service,'check_candidate',return_value={'applicable':False,'passed':False,'errors':[]}) as browser_check:
    for _ in range(4):self.assertFalse(service.validate_live_candidate(value,job)['applicable'])
    self.assertEqual(browser_check.call_count,4)
    with self.assertRaisesRegex(ValueError,'budget'):service.validate_live_candidate(value,job)
   for change in [{'expectedSha':'c'*40},{'url':'http://remote'},{'files':[]},{'files':intent['files']+[{'path':'package.json','content':'{}'}]},{'files':[{'path':'../file.js','content':'x'}]}]:
    with self.subTest(change=change),self.assertRaises(ValueError),patch.object(service,'check_candidate') as browser_check:service.validate_live_candidate({**value,**change},job)
    browser_check.assert_not_called()
   self.assertFalse((Path(directory)/'receipt.json').exists())
 def test_live_validation_socket_requires_credential_and_denies_unrelated_endpoints(self):
  with tempfile.TemporaryDirectory() as directory:
   path=str(Path(directory)/'service.sock');server=service.UnixServer(path,service.InferenceHandler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   def request(target,credential):
    connection=http.client.HTTPConnection('localhost',timeout=3);connection.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);connection.sock.connect(path);connection.request('POST',target,body='{}',headers={'Authorization':'Bearer '+credential,'Content-Type':'application/json'});response=connection.getresponse();status=response.status;response.read();connection.close();return status
   try:
    with patch.object(service,'JOBS',{'owned':{'token':'test-only'}}),patch.object(service,'validate_live_candidate',return_value={'applicable':True,'passed':True,'errors':[]}) as validate:
     self.assertEqual(request('/v1/sdlc/validate-candidate','wrong'),401);validate.assert_not_called();self.assertEqual(request('/v1/sdlc/anything','test-only'),404);validate.assert_not_called();self.assertEqual(request('/v1/sdlc/validate-candidate','test-only'),200);validate.assert_called_once();service.JOBS['owned']['role']='implementation';self.assertEqual(request('/v1/sdlc/validate-candidate','test-only'),403);validate.assert_called_once()
   finally:server.shutdown();server.server_close();thread.join(timeout=3)
 def test_ui_specialist_cannot_request_writing_tools_or_test_a_different_candidate(self):
  job={**self.job,'allowedTools':service.tools_for_role('ui_validation'),'role':'ui_validation','intent':self.intent(),'readOnlyFiles':{'src/a.js':'export const a=2;'}}
  with self.assertRaisesRegex(ValueError,'registry'):service.validate_inference(self.request(),job)
  request=self.request();request['tools']=[tool for tool in request['tools'] if tool['function']['name'] in job['allowedTools']];self.assertEqual(len(service.validate_inference(request,job)['tools']),5)
  with self.assertRaisesRegex(ValueError,'cannot change'):service.validate_live_candidate({'expectedSha':'b'*40,'files':[{'path':'src/a.js','content':'other'}],'steps':[]},job)
 def focused_scenario(self,ui_fails=False,implementation_fails=False,replay_fails=False,allow_repair=False,repair_fails=False,repair_outside=False):
  intent=self.intent();intent['files'].append({'path':'src/main.jsx','content':'render();'})
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);service.CONFIG={'workflow':'focused-local-v1','model':'local:9b','imageId':'sha256:'+'e'*64,'browserImageId':'sha256:'+'f'*64,'inferenceSocket':'/private/inference.sock'};roles=[];registries=[];tokens=[]
   def run(command,**kwargs):
    if command[:2]==['docker','inspect']:return Mock(returncode=1,stdout='')
    self.assertEqual(command[:2],['docker','run']);request_mount=next(value for value in command if value.startswith('type=bind,src=') and ',dst=/request/request.json' in value);request=json.loads(Path(request_mount.split('src=',1)[1].split(',dst=',1)[0]).read_text());role=request['role'];roles.append(role);registries.append(service.JOBS[intent['id']]['allowedTools']);tokens.append(service.JOBS[intent['id']]['token']);session_mount=next(value for value in command if value.startswith('type=bind,src=') and ',dst=/session' in value);session=Path(session_mount.split('src=',1)[1].split(',dst=',1)[0]);is_repair=len(roles)>1
    if is_repair:self.assertEqual(request['files'][-1]['content'],'renderFixed();');self.assertIn('mesmo ensaio',request['prompt']);self.assertEqual(request['expectedSha'],'b'*40);self.assertEqual(request['writePaths'],['src/main.jsx'])
    value={'state':'failed' if implementation_fails or is_repair and repair_fails else 'succeeded','expectedSha':intent['expectedSha'],'patch':{'files':[{'path':'src/a.js' if is_repair and repair_outside else 'src/main.jsx','content':'renderRepaired();' if is_repair else 'renderFixed();'}]},'validation':{'valid':True},'uiSteps':[],'tools':[{'tool':'validate_candidate'}]};(session/'result.json').write_text(json.dumps(value));return Mock(returncode=0)
   proof={'applicable':True,'passed':True,'errors':[]}
   def verify(e,job,files,directory,observation,progress):
    self.assertEqual(job['role'],'ui_validation');self.assertEqual(job['readOnlyFiles'],{f['path']:f['content'] for f in files});self.assertEqual(job['allowedTools'],service.tools_for_role('ui_validation'));tokens.append(job['token']);self.assertEqual(files[-1]['content'],'renderFixed();')
    return {'passed':not ui_fails,'repairable':allow_repair,'steps':[{'op':'expect_text','value':'Tela conferida'}],'phases':[{'role':'test_planning','state':'succeeded'},{'role':'ui_operator','state':'failed' if ui_fails else 'succeeded'}],'proof':dict(proof),'error':'Falha funcional preservada'}
   import coding_workflow
   with patch.object(service.subprocess,'run',side_effect=run),patch.object(service.os,'chown'),patch.object(service,'SLOT',Mock()),patch.object(coding_workflow,'run_ui_verifier',side_effect=verify) as verifier,patch.object(service,'check_candidate',side_effect=[dict(proof),dict(proof),{**proof,'passed':not replay_fails}]) as replay:service.execute(intent,root,{'id':intent['id'],'expectedSha':intent['expectedSha']})
   self.assertEqual(verifier.call_count,0 if implementation_fails else 1)
   self.assertEqual(replay.call_count,1 if implementation_fails else 2 if ui_fails and (not allow_repair or repair_fails or repair_outside) else 3)
   if ui_fails and allow_repair and not repair_fails and not repair_outside:self.assertEqual(replay.call_args.kwargs['steps'],[{'op':'expect_text','value':'Tela conferida'}])
   value=json.loads((root/'receipt.json').read_text());self.assertNotIn(intent['id'],service.JOBS)
   return value,roles,registries,tokens
 def test_focused_workflow_keeps_implementation_and_read_only_ui_in_distinct_profiles(self):
  value,roles,registries,tokens=self.focused_scenario();self.assertEqual(value['state'],'succeeded');self.assertEqual(roles,['implementation']);self.assertEqual([len(v) for v in registries],[7]);self.assertNotEqual(tokens[0],tokens[1]);self.assertEqual(value['patch']['files'][0]['content'],'renderFixed();');self.assertEqual(value['expectedSha'],'b'*40);self.assertEqual([p['role'] for p in value['phases']],['diagnosis','implementation','test_planning','ui_operator']);self.assertTrue(value['browserChecks'][-1]['passed'])
 def test_focused_workflow_refuses_functional_failure_and_independent_replay_failure(self):
  for options in [{'ui_fails':True},{'replay_fails':True}]:
   with self.subTest(options=options):
    value,roles,_,_=self.focused_scenario(**options);self.assertEqual(value['state'],'failed');self.assertNotIn('patch',value);self.assertEqual(roles,['implementation']);self.assertFalse(value['browserChecks'][-1]['passed'])
 def test_failed_implementation_does_not_start_the_ui_specialist(self):
  value,roles,_,_=self.focused_scenario(implementation_fails=True);self.assertEqual(value['state'],'failed');self.assertEqual(roles,['implementation']);self.assertEqual(len(value['browserChecks']),0)
 def test_observed_functional_failure_can_get_one_small_repair_without_changing_the_recipe(self):
  value,roles,_,_=self.focused_scenario(ui_fails=True,allow_repair=True);self.assertEqual(value['state'],'succeeded');self.assertEqual(roles,['implementation','implementation']);self.assertEqual(value['patch']['files'][0]['content'],'renderRepaired();');self.assertFalse(value['browserChecks'][-2]['passed']);self.assertTrue(value['browserChecks'][-1]['passed']);self.assertEqual(value['phases'][-1]['role'],'targeted_repair')
  for options in [{'repair_fails':True},{'replay_fails':True},{'repair_outside':True}]:
   with self.subTest(options=options):
    value,roles,_,_=self.focused_scenario(ui_fails=True,allow_repair=True,**options);self.assertEqual(value['state'],'failed');self.assertNotIn('patch',value);self.assertEqual(len(roles),2)
 def test_ui_test_context_is_optional_complete_and_cannot_reference_another_criterion(self):
  context={'objective':'Preço','behavior':'Cadastrar zero','criteria':['Exibe R$ 0,00'],'testCases':[{'criterionIndex':0,'description':'Cadastrar e conferir a listagem'}]};service.validate_intent({**self.intent(),'testContext':context})
  for cases in [[{'criterionIndex':1,'description':'fora'}],[{'criterionIndex':True,'description':'booleano'}],[{'criterionIndex':0,'description':'x','source':'inventada'}],['inválido']]:
   with self.subTest(cases=cases),self.assertRaises(ValueError):service.validate_intent({**self.intent(),'testContext':{**context,'testCases':cases}})
if __name__=='__main__':unittest.main()
