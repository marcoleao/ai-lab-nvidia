import importlib.util,json,tempfile,threading,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
spec=importlib.util.spec_from_file_location('runtime',Path(__file__).resolve().parents[1]/'runtime/service.py');service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
class Handler(BaseHTTPRequestHandler):
 calls=0
 def log_message(self,*args):pass
 def do_GET(self):
  Handler.calls+=1;self.send_response(200);self.end_headers();self.wfile.write(b'owned response glpat-isolated-secret-must-not-be-retained')
 def do_POST(self):
  Handler.calls+=1;self.rfile.read(int(self.headers.get('Content-Length','0')));self.send_response(201);self.end_headers();self.wfile.write(b'created isolated fixture')
class Tests(unittest.TestCase):
 def setUp(self):
  Handler.calls=0;self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.server=HTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=self.server.serve_forever,daemon=True).start()
  self.intent={'id':'isolated-test-123','kind':'test','systemId':'isolated-system','environmentId':'isolated-environment','repositoryId':'isolated-repository','profile':service.PROFILE,'unitId':'web','sourceSha':'a'*40,'contractDigest':'b'*64,'storyId':'isolated-story','buildId':'isolated-build','projectId':1,'imageId':'sha256:'+'c'*64,'archiveDigest':'d'*64,'artifactSize':1,'expectedDeploymentId':None,'deploymentId':'isolated-deployment','suiteDigest':'e'*64,'policyVersion':'dev-http-v1'};self.intent['configDigest']=service.digest(service.canonical(service.configuration(self.intent)))
  self.engine=service.Engine(self.root/'state',{'installationId':'isolated-installation','buildStateRoot':str(self.root/'builds')});self.engine.artifact=lambda *args,**kwargs:{'available':True};self.engine.deployment_observation=lambda v:{'state':'healthy'};self.engine.active=lambda v:{'host':'127.0.0.1','port':self.server.server_port,'gatewayPort':self.server.server_port};self.path=self.root/'builds/isolated-build/source/tests/dev-http.json';self.path.parent.mkdir(parents=True)
  self.suite={'schemaVersion':1,'scope':'acceptance','cases':[{'id':'create','name':'Criar fixture própria','method':'POST','path':'/orders','status':201,'contains':'created','body':{'fixture':True},'criterionIndices':[0]},{'id':'read','name':'Consultar fixture própria','method':'GET','path':'/','status':200,'contains':'owned','criterionIndices':[0]}]};self.save()
 def tearDown(self):self.server.shutdown();self.server.server_close();self.temp.cleanup()
 def save(self):self.path.write_bytes(service.canonical(self.suite));self.intent['suiteDigest']=service.digest(self.path.read_bytes())
 def run_test(self):self.engine.accept(self.intent,background=False);self.engine.execute(self.intent);return self.engine.public(self.intent['id'])
 def test_actual_http_assertions_preserve_pinned_names_without_body_output(self):
  plan=self.engine.test_plan(self.intent);self.assertTrue(plan['mutatesData']);result=self.run_test();self.assertEqual(result['state'],'succeeded');self.assertEqual([v['actualStatus'] for v in result['proof']['cases']],[201,200]);self.assertEqual(result['proof']['cases'][0]['name'],'Criar fixture própria');self.assertNotIn('glpat',json.dumps(result));self.assertEqual(Handler.calls,2)
 def test_real_assertion_failure_is_failed_evidence_and_is_immutable(self):
  self.suite['cases'][0]['status']=418;self.save();result=self.run_test();self.assertEqual(result['state'],'failed');self.assertEqual(result['proof']['cases'][0]['code'],'STATUS_MISMATCH');self.engine.save(self.intent['id'],'unknown');self.assertEqual(self.engine.public(self.intent['id']),result)
 def test_replay_and_unknown_receipt_never_repeat_mutating_cases(self):
  result=self.run_test();self.assertEqual(self.engine.accept(self.intent,background=False),result);self.engine.execute(self.intent);self.assertEqual(Handler.calls,2);self.engine.write(self.engine.directory(self.intent['id'])/'receipt.json',{'id':self.intent['id'],'state':'unknown'});self.assertEqual(self.engine.public(self.intent['id'])['state'],'unknown');self.assertEqual(Handler.calls,2)
 def test_changed_suite_is_refused_before_any_http_effect(self):
  self.suite['cases'][0]['status']=418;self.path.write_bytes(service.canonical(self.suite));result=self.run_test();self.assertEqual(result['code'],'SUITE_CHANGED');self.assertEqual(Handler.calls,0)
 def test_unsafe_paths_methods_body_limits_and_scope_are_refused(self):
  original=json.loads(json.dumps(self.suite))
  for change in [{'path':'http://outside.invalid/'},{'path':'//outside.invalid/'},{'path':'/a/../secret'},{'path':'/a%2f..%2fsecret'},{'path':'/a\r\nHost: outside'},{'method':'CONNECT'},{'body':{'large':'x'*9000}},{'criterionIndices':[-1]}]:
   self.suite=json.loads(json.dumps(original));self.suite['cases'][0].update(change);self.path.write_bytes(service.canonical(self.suite))
   with self.subTest(change=list(change)):
    with self.assertRaises(service.RuntimeFailure):self.engine.test_plan(self.intent)
  self.assertEqual(Handler.calls,0)
 def test_other_deployment_is_not_tested(self):
  self.engine.deployment_observation=lambda v:{'state':'changed'};result=self.run_test();self.assertEqual(result['code'],'DEPLOYMENT_CHANGED');self.assertEqual(Handler.calls,0)
 def test_interrupted_execution_remains_unknown_after_restart(self):
  self.engine.accept(self.intent,background=False);self.engine.recover();self.engine.execute(self.intent);self.assertEqual(self.engine.public(self.intent['id'])['state'],'unknown');self.assertEqual(Handler.calls,0)
if __name__=='__main__':unittest.main(verbosity=2)
