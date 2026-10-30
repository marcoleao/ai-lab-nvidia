import importlib.util,io,json,tarfile,tempfile,unittest,os,stat
from pathlib import Path
spec=importlib.util.spec_from_file_location('sdlc_build_executor',Path(__file__).resolve().parents[1]/'executor/service.py');service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
SHA='a'*40;BASE='sha256:'+'b'*64;IMAGE='sha256:'+'c'*64
def fixture():
 unit={'id':'web','path':'.','runtime':{'kind':'node','version':'24'},'build':{'entrypoint':'scripts/build.mjs'},'test':{'entrypoint':'scripts/test.mjs'},'artifact':{'dockerfile':'Dockerfile','context':'.'},'health':{'kind':'http','path':'/health','port':8080,'status':200},'migrations':{'mode':'none'}}
 files={'.sdlc/execution.json':json.dumps({'schemaVersion':1,'units':[unit]}).encode(),'Dockerfile':service.PROFILE_DOCKERFILE.encode(),'scripts/build.mjs':b"process.exit(0)",'scripts/test.mjs':b'process.exit(0)','server.mjs':b"console.log('isolated runtime')"}
 intent={'id':'isolated-build-123','projectId':1,'sourceSha':SHA,'contractDigest':service.digest(files['.sdlc/execution.json']),'unitId':'web','baseImageId':BASE,'policyVersion':service.POLICY}
 return files,intent
def archive(files,extra=None):
 output=io.BytesIO()
 with tarfile.open(fileobj=output,mode='w:gz') as tar:
  for path,data in files.items():
   info=tarfile.TarInfo('project-'+SHA+'/'+path);info.size=len(data);tar.addfile(info,io.BytesIO(data))
  if extra:tar.addfile(extra)
 return output.getvalue()
class FakeDocker:
 def __init__(self,intent,files):self.intent=intent;self.files=files;self.calls=[];self.failure=None
 def __call__(self,*args,**options):
  self.calls.append((args,options))
  if args[0]=='image':return json.dumps([{'Id':args[2],'Size':1024,'Config':{'Labels':{'org.sdlc.toolchain':service.POLICY,'org.sdlc.request':service.digest(service.canonical(self.intent))}}}]).encode()
  if args[0]=='inspect':return json.dumps([{'Config':{'Labels':{'org.sdlc.build':self.intent['id']}}}]).encode()
  if (args[0]=='exec' and args[-1]=='scripts/build.mjs' or args[0]=='run' and args[-1]=='scripts/test.mjs') and self.failure:raise service.BuildFailure(self.failure)
  if args[0]=='exec' and 'tar' in args:return service.source_tar({**self.files,'dist/app.js':b'compiled isolated output'})
  if args[0]=='commit':return IMAGE.encode()
  if args[0]=='save':Path(args[2]).write_bytes(b'owned image archive')
  return b''
class BuildExecutorTests(unittest.TestCase):
 def test_private_service_umask_keeps_job_private_and_snapshot_readable_by_runtime(self):
  files,intent=fixture();fake=FakeDocker(intent,files)
  with tempfile.TemporaryDirectory() as root:
   prior=os.umask(0o077)
   try:
    engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fake);engine.accept(intent,background=False);engine.execute(intent)
    job=Path(root)/intent['id'];source=job/'source'
    self.assertEqual(stat.S_IMODE(job.stat().st_mode),0o700)
    self.assertEqual(stat.S_IMODE(source.stat().st_mode),0o755)
    for path in source.rglob('*'):self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o755 if path.is_dir() else 0o444)
    self.assertEqual(engine.public(intent['id'])['state'],'succeeded')
   finally:os.umask(prior)
 def test_every_source_is_checked_before_any_extraction(self):
  files,intent=fixture();self.assertEqual(service.safe_archive(archive(files),SHA),files)
  for unsafe in ['../../outside','node_modules/package.json','.env','.aws/credentials','a/../outside','/outside','a\\b']:
   with self.subTest(unsafe=unsafe):
    with self.assertRaises(service.BuildFailure):service.safe_archive(archive({unsafe:b'x'}),SHA)
  link=tarfile.TarInfo('project-'+SHA+'/src/link');link.type=tarfile.SYMTYPE;link.linkname='/etc/passwd'
  with self.assertRaises(service.BuildFailure):service.safe_archive(archive(files,link),SHA)
 def test_profile_refuses_remote_builders_changed_digest_and_dependency_install(self):
  files,intent=fixture();self.assertEqual(service.validate_profile(files,intent,{}),files)
  for change in [{'Dockerfile':b'FROM remote/image\nRUN curl outside'}, {'.sdlc/execution.json':b'{}'}, {'package.json':b'{"dependencies":{"arbitrary-package":"latest"}}'}]:
   with self.assertRaises(service.BuildFailure):service.validate_profile({**files,**change},intent,{})
 def test_job_identity_cannot_be_retargeted_or_executed_twice(self):
  files,intent=fixture();fake=FakeDocker(intent,files)
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fake)
   engine.accept(intent,background=False)
   with self.assertRaises(service.BuildFailure):engine.accept({**intent,'sourceSha':'d'*40},background=False)
   engine.execute(intent);before=len(fake.calls);self.assertEqual(engine.public(intent['id'])['state'],'succeeded')
   engine.accept(intent,background=False);engine.execute(intent);self.assertEqual(len(fake.calls),before)
 def test_real_build_arguments_bound_privileges_disk_network_and_output(self):
  files,intent=fixture();fake=FakeDocker(intent,files)
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fake);engine.accept(intent,background=False);engine.execute(intent)
   creates=[args for args,_ in fake.calls if args[0]=='create'];build=creates[0]
   for argument in ['--read-only','--cap-drop','--pids-limit','--cpus','--memory','--security-opt']:self.assertIn(argument,build)
   self.assertIn('none',build);self.assertIn('/app/work:size=128m,uid=1000,gid=1000,mode=0700',build)
   self.assertFalse(any('/var/run/docker.sock' in str(v) or 'token' in str(v) for v in build))
   run=[options for args,options in fake.calls if args[0]=='exec' and args[-1]=='scripts/build.mjs'][0];self.assertTrue(run['quiet']);self.assertEqual(run['timeout'],120)
   self.assertEqual(len([args for args,_ in fake.calls if args[0]=='start']),1,'The packaging container is never started')
   self.assertEqual(set(engine.public(intent['id'])),{'id','state','imageId','archiveDigest','size'})
 def test_nonzero_exit_has_no_artifact_and_leaks_no_application_output(self):
  files,intent=fixture();fake=FakeDocker(intent,files);fake.failure='BUILD_FAILED'
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fake);engine.accept(intent,background=False);engine.execute(intent)
   self.assertEqual(engine.public(intent['id']),{'id':intent['id'],'state':'failed','code':'BUILD_FAILED'})
   self.assertFalse(any(args[0]=='commit' for args,_ in fake.calls))
 def test_restart_marks_uncertain_intent_without_running_code(self):
  files,intent=fixture();fake=FakeDocker(intent,files)
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},run=fake);engine.accept(intent,background=False);engine.recover();engine.execute(intent)
   self.assertEqual(engine.public(intent['id'])['state'],'unknown');self.assertEqual(fake.calls,[])
 def test_preparation_runs_technical_http_test_and_preserves_same_purpose_on_retry(self):
  files,intent=fixture();intent['purpose']='application_preparation';fake=FakeDocker(intent,files)
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fake);engine.accept(intent,background=False);engine.execute(intent)
   self.assertTrue(engine.public(intent['id'])['technicalTestPassed']);tests=[(args,options) for args,options in fake.calls if args[0]=='run' and args[-1]=='scripts/test.mjs'];self.assertEqual(len(tests),1)
   args,options=tests[0]
   for value in ['--network','none','--read-only','--user','1000:1000','--memory','256m','--cpus','1','--pids-limit','64','--log-driver']:self.assertIn(value,args)
   self.assertTrue(options['quiet']);self.assertEqual(options['timeout'],30)
   with self.assertRaises(service.BuildFailure):engine.accept({k:v for k,v in intent.items() if k!='purpose'},background=False)
 def test_failed_technical_test_does_not_publish_artifact_proof(self):
  files,intent=fixture();intent['purpose']='application_preparation';fake=FakeDocker(intent,files)
  def fail_test(*args,**options):
   if args[0]=='run' and args[-1]=='scripts/test.mjs':raise service.BuildFailure('BUILD_FAILED')
   return fake(*args,**options)
  with tempfile.TemporaryDirectory() as root:
   engine=service.Engine(root,{'baseImageId':BASE,'packages':{}},fetch=lambda _:archive(files),run=fail_test);engine.accept(intent,background=False);engine.execute(intent)
   self.assertEqual(engine.public(intent['id']),{'id':intent['id'],'state':'failed','code':'BUILD_FAILED'})
if __name__=='__main__':unittest.main(verbosity=2)
