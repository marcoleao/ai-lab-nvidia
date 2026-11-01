"""Independent, read-only browser qualification of a pinned managed DEV deployment.

No repository writes, candidate rendering, business approval or shared data setup.
The model sees observations; only bounded actions on observed controls are accepted.
"""
from pathlib import Path
import base64,fcntl,hashlib,http.client,json,os,re,shutil,socket,subprocess,sys,tempfile,threading,time,urllib.request
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'executor'))
import coding_ui_agent as ui
from coding_browser import validate_ui_steps
POLICY='dev-ai-browser-v1'
CAPABILITIES={**ui.UI_CAPABILITIES,'policy':POLICY,'scope':'pinned-published-dev','assertions':['text','page_background','heading_font'],'imageFixture':'unavailable','notPerformed':['backend_writes','external_origins','authentication_setup','keyboard','viewport_resize','file_upload','image_fixture','complete_criterion_coverage']}
TERMINAL={'succeeded','failed','inconclusive','stale'}
class Changed(Exception):pass
class Restricted(Exception):pass

def validate(value,validate_deployment):
 if not isinstance(value,dict) or set(value)!={'id','policyVersion','deployment','referenceDigest','context'} or value.get('policyVersion')!=POLICY or not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',str(value['id'])) or not re.fullmatch('[a-f0-9]{64}',str(value['referenceDigest'])):raise ValueError('AI test identity')
 deployment=validate_deployment(value['deployment'])
 if deployment['kind']!='deploy':raise ValueError('AI test requires a deployment')
 context=value['context']
 if not isinstance(context,dict) or set(context)!={'contextVersion','objective','behavior','criteria','testCases','approved'} or context['contextVersion']!=2 or not all(isinstance(context[key],str) for key in ['objective','behavior']) or not isinstance(context['criteria'],list) or not 1<=len(context['criteria'])<=12 or any(not isinstance(c,str) or not c.strip() or len(c)>500 for c in context['criteria']) or not isinstance(context['testCases'],list) or not isinstance(context['approved'],dict) or len(json.dumps(context))>20000:raise ValueError('AI test approved scope')
 if any(not isinstance(c,dict) or set(c)!={'criterionIndex','description'} or type(c['criterionIndex']) is not int or not 0<=c['criterionIndex']<len(context['criteria']) or not isinstance(c['description'],str) or len(c['description'])>500 for c in context['testCases']):raise ValueError('AI test cases')
 approved=context['approved']
 if set(approved)!={'name','runtime','requirements','technicalPlan','decisions','tasks','codeDestination','scopeRevision'} or not isinstance(approved['requirements'],dict) or not isinstance(approved['technicalPlan'],dict) or type(approved['scopeRevision']) is not int or approved['scopeRevision']!=3:raise ValueError('AI test authoritative context')
 return value

class Connection(http.client.HTTPConnection):
 def __init__(self,path):super().__init__('localhost',timeout=20);self.path=path
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(20);self.sock.connect(str(self.path))

class DevBrowser:
 def __init__(self,engine,intent,directory):
  self.engine=engine;self.intent=intent;self.directory=directory;self.closed=False
  active,network=engine.current(intent)
  self.ipc=Path(tempfile.mkdtemp(prefix='sdlc-dev-ui-'));os.chown(self.ipc,1000,1000)
  self.name='sdlc-ai-browser-'+hashlib.sha256((intent['id']+str(directory)).encode()).hexdigest()[:24]
  request=directory/'dev-browser-request.json';engine.runtime.write(request,{'mode':'published-dev','origin':f'http://{active["host"]}:8080','steps':[],'liveSocket':'/ipc/browser.sock'});request.chmod(0o444)
  self.target=self.ipc/'browser.sock'
  try:
   engine.runtime.run('run','-d','--name',self.name,'--pull','never','--network',network['resourceName'],'--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','768m','--cpus','2','--shm-size','128m','--tmpfs','/tmp:uid=1000,gid=1000,mode=0700','--mount',f'type=bind,src={request},dst=/request/candidate.json,readonly','--mount',f'type=bind,src={self.ipc},dst=/ipc','--label','org.sdlc.ai-test='+intent['id'],'--label','org.sdlc.installation='+engine.runtime.config['installationId'],'-e','HOME=/tmp','--entrypoint','node',engine.runtime.config['aiBrowserImageId'],'/opt/sdlc/coding-browser.mjs',timeout=20)
   deadline=time.monotonic()+25
   while not self.target.exists():
    if time.monotonic()>deadline:raise TimeoutError('DEV browser unavailable')
    time.sleep(.05)
   self.initial=self.call('/state')
  except Exception:self.close();raise
 def call(self,path,body=None):
  self.engine.current(self.intent);connection=Connection(self.target)
  try:
   connection.request('POST' if body else 'GET',path,body=json.dumps(body) if body else None,headers={'Content-Type':'application/json'});response=connection.getresponse();data=response.read(32001)
   if response.status!=200 or len(data)>32000:raise ValueError('DEV browser response')
   result=json.loads(data)
   if result.get('networkBlocked'):
    self.engine.runtime.write(self.directory/'restricted-observation-private.json',{'observedUI':result.get('observedUI',''),'visualObservation':result.get('visualObservation'),'networkBlocked':True})
    raise Restricted('Action requires a blocked origin or shared write')
   if result.get('errors'):raise RuntimeError('Page errors recorded in private browser evidence')
   if body and self.directory.name.startswith('case-'):
    record=self.engine.read(self.intent['id']);index=int(self.directory.name.removeprefix('case-'))+1
    self.engine.save(self.intent,'running',f'case_{index}_action_{body["op"]}',record['cases'])
   return result
  finally:connection.close()
 def close(self):
  if self.closed:return
  self.closed=True
  for source,dest in [('initial.png','initial.png'),('latest.png','final.png')]:
   path=self.ipc/source
   if path.is_file() and not path.is_symlink() and path.stat().st_size<=2000000:shutil.copyfile(path,self.directory/dest);(self.directory/dest).chmod(0o600)
  try:
   data=json.loads(self.engine.runtime.run('inspect',self.name))[0]
   if data.get('Config',{}).get('Labels',{}).get('org.sdlc.ai-test')==self.intent['id'] and data['Config']['Labels'].get('org.sdlc.installation')==self.engine.runtime.config['installationId']:self.engine.runtime.run('rm','-f',self.name)
  except Exception:pass
  shutil.rmtree(self.ipc)

class AiEngine:
 def __init__(self,runtime):self.runtime=runtime;self.root=runtime.root/'ai-jobs';self.root.mkdir(exist_ok=True,mode=0o700);self.lock=threading.Lock()
 def directory(self,identity):
  if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',str(identity)):raise ValueError('AI test identity')
  return self.root/identity
 def read(self,identity):
  path=self.directory(identity)/'receipt.json'
  return json.loads(path.read_bytes()) if path.is_file() else {'id':identity,'state':'unknown','stage':'not_received','cases':[]}
 def save(self,intent,state,stage,cases,proof=None):
  old=self.read(intent['id'])
  if old['state'] in TERMINAL:return old
  current={c['index']:c for c in cases}
  if any(current.get(c['index'])!=c for c in old['cases']):raise ValueError('Retain previously recorded case outcomes')
  value={'id':intent['id'],'state':state,'stage':stage,'cases':cases,**({'proof':proof} if proof else {})};self.runtime.write(self.directory(intent['id'])/'receipt.json',value);return value
 def health(self):
  ready=bool(self.runtime.config.get('aiBrowserImageId') and self.runtime.config.get('aiModel') and self.runtime.config.get('aiUpstream'))
  if ready:
   try:
    image=json.loads(self.runtime.run('image','inspect',self.runtime.config['aiBrowserImageId']))[0]
    if image.get('Config',{}).get('Labels',{}).get('org.sdlc.dev-ai-browser')!='published-dev-v1':raise ValueError('Browser not prepared')
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(self.runtime.config['aiUpstream']+'/api/tags',timeout=2) as response:models=json.load(response)
    ready=self.runtime.config['aiModel'] in {m['name'] for m in models['models']}
   except Exception:ready=False
  return {'ready':ready,'policyVersion':POLICY}
 def current(self,intent):
  deployment=intent['deployment'];active=self.runtime.active(deployment)
  if not active or any(active.get(key)!=deployment.get(key) for key in ['id','systemId','environmentId','repositoryId','buildId','sourceSha','imageId','archiveDigest','configDigest']):raise Changed('DEV deployment changed')
  seen=self.runtime.inspect(deployment)
  if seen['state']!='prepared':raise Changed('DEV target changed')
  container=self.runtime.container(active['containerId'],deployment)
  if not container or not container.get('State',{}).get('Running') or container.get('Image')!=deployment['imageId']:raise Changed('DEV image changed')
  return active,seen['proof']
 def submit(self,intent):
  if not self.health()['ready']:raise ValueError('AI browser not configured')
  with self.lock:
   directory=self.directory(intent['id']);directory.mkdir(exist_ok=True,mode=0o700);path=directory/'intent.json'
   if path.exists():
    if json.loads(path.read_bytes())!=intent:raise ValueError('AI test intent conflict')
    return self.read(intent['id'])
   self.current(intent);self.runtime.write(path,intent);value=self.save(intent,'queued','queued',[])
   threading.Thread(target=self.execute,args=(intent,),daemon=True).start();return value
 def proof(self,intent):return {'policyVersion':intent['policyVersion'],'referenceDigest':intent['referenceDigest'],'deploymentId':intent['deployment']['id'],'sourceSha':intent['deployment']['sourceSha'],'imageId':intent['deployment']['imageId'],'model':self.runtime.config.get('aiModel','not-configured'),'completeAcceptance':False}
 def replay(self,intent,directory,steps):
  session=DevBrowser(self,intent,directory)
  try:
   state=session.initial
   for step in validate_ui_steps(steps):
    control=''
    if 'target'in step:
     target=step['target'];normalize=lambda value:' '.join(value.strip().rstrip(':').split()).casefold()
     matches=[c for c in state.get('controls',[]) if c['role']==target.get('role') and normalize(c['name'])==normalize(target['name']) and c.get('index',0)==target.get('index',0)]
     if len(matches)!=1:return False,None
     control=matches[0]['id']
    state=session.call('/action',{'op':step['op'],'control':control,'value':step.get('value',''),'dialog':step.get('dialog','none')})
    if not state.get('actionPassed'):return False,step['op'] if step['op'].startswith('expect_') else None
   return True,None
  finally:session.close()
 def execute(self,intent):
  directory=self.directory(intent['id']);cases=[];started=time.monotonic();job={'rootStarted':started,'started':started,'totalCalls':0,'calls':0,'role':'ui_validation','totalSeconds':600,'phaseSeconds':240,'maxTotalCalls':120,'intent':{'id':intent['id'],'expectedSha':intent['deployment']['sourceSha'],'testContext':intent['context']}}
  e=SimpleNamespace(CONFIG={'model':self.runtime.config['aiModel'],'upstream':self.runtime.config['aiUpstream']},dump=self.runtime.write,remaining_seconds=lambda j:min(600-(time.monotonic()-started),240-(time.monotonic()-j['started'])),validate_ui_steps=validate_ui_steps)
  ui.UI_CAPABILITIES=CAPABILITIES
  try:
   with (self.root/'execution.lock').open('a+') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    if self.read(intent['id'])['state']!='queued':return
    started=time.monotonic();job.update(rootStarted=started,started=started)
    for index,title in enumerate(intent['context']['criteria']):
     self.current(intent);case_dir=directory/f'case-{index}';case_dir.mkdir(exist_ok=True,mode=0o700);job.update(started=time.monotonic(),calls=0,directory=case_dir,focusCase={'criterionIndex':index,'criterion':title,'testCases':[c for c in intent['context']['testCases'] if c['criterionIndex']==index]})
     row={'index':index,'title':title,'status':'not_tested','code':'EXECUTOR_ERROR','steps':0,'evidence':[]}
     value=None;replayed=None
     self.save(intent,'running',f'case_{index+1}_planning',cases)
     if job['totalCalls']>=120 or time.monotonic()-started>=570:row['code']='BUDGET_EXHAUSTED'
     else:
      try:
       # This is a distinct process from the coding executor. The specialist
       # reuses its observed-control contract, with a published-DEV transport.
       def browser(_config,_id,files,output):
        if files:raise ValueError('DEV tests never render candidate files')
        return DevBrowser(self,intent,output)
       session=DevBrowser(self,intent,case_dir)
       previous=ui.LiveBrowser;ui.LiveBrowser=lambda *_:session
       try:value=ui.run_ui_verifier(e,job,[],case_dir,session.initial,lambda stage:self.save(intent,'running',f'case_{index+1}_{stage}',cases))
       finally:ui.LiveBrowser=previous;session.close()
       steps=value.get('steps',[]);row['steps']=len(steps)
       if value.get('diagnosticCode')=='UI_CAPABILITY_UNSUPPORTED':row['code']='CAPABILITY_UNSUPPORTED'
       elif value.get('passed') or value.get('repairable'):
        replay_dir=case_dir/'replay';replay_dir.mkdir(mode=0o700);passed,failed_assertion=self.replay(intent,replay_dir,steps)
        replayed={'passed':passed,'failedAssertion':failed_assertion}
        final=replay_dir/'final.png'
        if final.exists():shutil.copyfile(final,case_dir/'final.png')
        if value.get('passed') and passed:row.update(status='passed',code='PASSED')
        elif not value.get('passed') and not passed and steps and failed_assertion==steps[-1]['op']:row.update(status='failed',code='ASSERTION_FAILED')
        else:row['code']='UNSTABLE'
       else:row['code']='EXPECTATION_UNCONFIRMED'
      except Changed:raise
      except Restricted:row['code']='NETWORK_POLICY'
      except Exception as error:
       self.runtime.write(case_dir/'interruption-private.json',{'type':type(error).__name__,'message':str(error)[:1500]});row['code']='BUDGET_EXHAUSTED' if time.monotonic()-started>=570 or job['totalCalls']>=120 else 'EXECUTOR_ERROR'
     if value is None:
      record=case_dir/'ui-recorded-steps.json';recorded=json.loads(record.read_bytes()) if record.exists() else {};restricted=case_dir/'restricted-observation-private.json';observation=json.loads(restricted.read_bytes()) if restricted.exists() else {}
      value={'scenario':recorded.get('scenario'),'steps':recorded.get('steps',[]),'proof':observation};row['steps']=len(value['steps'])
     report={'policyVersion':POLICY,'reference':self.proof(intent),'case':{'index':index,'title':title},'result':{'status':row['status'],'code':row['code']},'capabilities':CAPABILITIES,'scenario':(value or {}).get('scenario'),'steps':(value or {}).get('steps',[]),'observedUI':(value or {}).get('proof',{}).get('observedUI',''),'visualObservation':(value or {}).get('proof',{}).get('visualObservation'),'replay':replayed}
     # Keep result/recipe separate from prompts, inference credentials and raw errors.
     self.runtime.write(case_dir/'report.json',report)
     row['evidence']=self.seal_case(case_dir);cases.append(row);self.save(intent,'running',f'case_{index+1}_recorded',cases)
    self.current(intent);state='failed' if any(c['status']=='failed' for c in cases) else 'inconclusive' if any(c['status']=='not_tested' for c in cases) else 'succeeded';self.save(intent,state,'completed',cases,self.proof(intent))
  except Changed:self.save(intent,'stale','deployment_changed',cases,self.proof(intent))
  except Exception:self.save(intent,'unknown','unconfirmed',cases)
 def seal_case(self,directory):
  manifest={name:hashlib.sha256((directory/name).read_bytes()).hexdigest() for name in ['initial.png','final.png','report.json'] if (directory/name).is_file() and not (directory/name).is_symlink()}
  path=directory/'evidence-manifest.json'
  if path.exists():raise ValueError('Keep original evidence manifest')
  self.runtime.write(path,manifest);return list(manifest)
 def evidence(self,identity,index,name):
  if name not in ['initial.png','final.png','report.json'] or not re.fullmatch(r'\d{1,2}',str(index)):raise ValueError('Evidence not found')
  record=self.read(identity)
  if not any(row['index']==int(index) and name in row['evidence'] for row in record['cases']):raise ValueError('Evidence not recorded')
  path=self.directory(identity)/f'case-{int(index)}'/name
  if path.is_symlink() or path.stat().st_size>2000000:raise ValueError('Evidence unavailable')
  data=path.read_bytes()
  manifest=json.loads((path.parent/'evidence-manifest.json').read_bytes())
  if hashlib.sha256(data).hexdigest()!=manifest.get(name):raise ValueError('Evidence integrity differs')
  if name.endswith('.png') and not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid evidence')
  if name=='report.json':json.loads(data)
  return {'contentType':'application/json' if name=='report.json' else 'image/png','sha256':hashlib.sha256(data).hexdigest(),'data':base64.b64encode(data).decode()}
 def recover(self):
  for path in self.root.glob('*/intent.json'):
   intent=json.loads(path.read_bytes());old=self.read(intent['id'])
   if old['state'] not in TERMINAL:
    # Reconcile private persisted outcomes, never replay model/browser actions.
    try:
     ids=self.runtime.run('ps','-aq','--filter','label=org.sdlc.ai-test='+intent['id']).decode().split()
     for identity in ids:
      data=json.loads(self.runtime.run('inspect',identity))[0];labels=data.get('Config',{}).get('Labels',{})
      if labels.get('org.sdlc.ai-test')!=intent['id'] or labels.get('org.sdlc.installation')!=self.runtime.config['installationId']:raise ValueError('Foreign test container')
      self.runtime.run('rm','-f',identity)
     if not (path.parent/'interrupted-receipt.json').exists():self.runtime.write(path.parent/'interrupted-receipt.json',old)
     try:self.current(intent)
     except Changed:self.save(intent,'stale','deployment_changed',old['cases'],self.proof(intent));continue
     cases=list(old['cases']);known={c['index'] for c in cases}
     cases.extend({'index':i,'title':title,'status':'not_tested','code':'EXECUTOR_ERROR','steps':0,'evidence':[]} for i,title in enumerate(intent['context']['criteria']) if i not in known)
     state='failed' if any(c['status']=='failed' for c in cases) else 'inconclusive' if any(c['status']=='not_tested' for c in cases) else 'succeeded'
     self.save(intent,state,'reconciled_after_restart',sorted(cases,key=lambda c:c['index']),self.proof(intent))
    except Exception:self.save(intent,'unknown','executor_interrupted',old['cases'])
