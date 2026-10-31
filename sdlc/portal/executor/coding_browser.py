"""Render a candidate in a networkless container without inference credentials."""
from pathlib import Path
import http.client,json,os,re,shutil,socket,subprocess,tempfile,time

def validate_ui_steps(steps):
 if not isinstance(steps,list) or len(steps)>20 or len(json.dumps(steps))>8000:raise ValueError('UI probe budget')
 for step in steps:
  if not isinstance(step,dict) or set(step)-{'op','target','value','dialog'} or step.get('op') not in ['fill','click','select','check','expect_text','expect_visible','expect_image','reload']:raise ValueError('UI probe operation')
  if 'dialog' in step and (step['op']!='click' or step['dialog'] not in ['accept','dismiss']):raise ValueError('UI probe dialog')
  if step['op'] in ['fill','select','expect_text'] and (not isinstance(step.get('value'),str) or len(step['value'])>500):raise ValueError('UI probe value')
  if step['op']=='expect_text' and not step['value'].strip():raise ValueError('UI probe empty assertion')
  if 'value' in step and step['op'] not in ['fill','select','expect_text']:raise ValueError('UI probe unused value')
  target=step.get('target')
  if step['op']=='reload':
   if set(step)!={'op'}:raise ValueError('UI probe reload')
  elif step['op']!='expect_text' or target is not None:
   if not isinstance(target,dict) or set(target)-{'by','name','role','index'} or target.get('by') not in ['role','label','text'] or not isinstance(target.get('name'),str) or len(target['name'])>160:raise ValueError('UI probe target')
   if not target['name'] and not (step['op']=='fill' and target.get('by')=='role' and target.get('role')=='textbox' and type(target.get('index')) is int and 0<=target['index']<=5):raise ValueError('UI probe unnamed target')
   if target['by']=='role' and target.get('role') not in ['button','textbox','spinbutton','combobox','checkbox','heading','link','img','status','region','form','listitem']:raise ValueError('UI probe role')
   if 'role' in target and target['by']!='role':raise ValueError('UI probe unused role')
   if 'index' in target and (type(target['index']) is not int or not 0<=target['index']<=5):raise ValueError('UI probe index')
 if steps and not any(step['op'].startswith('expect_') for step in steps):raise ValueError('UI probe requires assertion')
 return steps

class LiveBrowser:
 def __init__(self,config,identity,files,directory):
  self.identity=identity;self.name='sdlc-coding-live-'+identity[:20];self.archive=directory/'browser-live'
  # AF_UNIX has a ~108-byte path limit, independent of the source/evidence path.
  self.ipc=Path(tempfile.mkdtemp(prefix='sdlc-ui-'));os.chown(self.ipc,1000,1000);self.closed=False
  request=directory/'browser-live-request.json';request.write_text(json.dumps({'files':files,'steps':[],'liveSocket':'/ipc/browser.sock'}));request.chmod(0o444)
  self.target=str(self.ipc/'browser.sock')
  command=['docker','run','-d','--name',self.name,'--pull','never','--network','none','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','768m','--cpus','2','--shm-size','128m','--tmpfs','/tmp:uid=1000,gid=1000,mode=0700','--mount',f'type=bind,src={request},dst=/request/candidate.json,readonly','--mount',f'type=bind,src={self.ipc},dst=/ipc','--label','org.sdlc.coding-browser-job='+identity,'-e','HOME=/tmp','--entrypoint','node',config['browserImageId'],'/opt/sdlc/coding-browser.mjs']
  try:
   subprocess.run(command,check=True,capture_output=True,timeout=15)
   deadline=time.monotonic()+30
   while time.monotonic()<deadline:
    if Path(self.target).exists():self.initial=self.call('/state');return
    time.sleep(.1)
   raise RuntimeError('Live UI session did not become ready')
  except Exception:self.close();raise
 def call(self,path,action=None):
  if path not in ['/state','/action','/close']:raise ValueError('Live UI route denied')
  connection=http.client.HTTPConnection('localhost',timeout=8);connection.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);connection.sock.settimeout(8);connection.sock.connect(self.target)
  try:
   connection.request('POST' if action is not None or path=='/close' else 'GET',path,body=json.dumps(action or {}) if action is not None or path=='/close' else None,headers={'Content-Type':'application/json'});response=connection.getresponse();raw=response.read(64001)
   if len(raw)>64000:raise RuntimeError('Live UI observation exceeds the budget')
   value=json.loads(raw)
   if response.status!=200:raise RuntimeError('Live UI operation not confirmed: '+str(value.get('error',''))[:300])
   return value
  finally:connection.close()
 def close(self):
  if self.closed:return
  self.closed=True
  try:
   if Path(self.target).exists():self.call('/close',{})
  except (OSError,RuntimeError,ValueError):pass
  inspected=subprocess.run(['docker','inspect',self.name],text=True,capture_output=True)
  if inspected.returncode==0 and json.loads(inspected.stdout)[0].get('Config',{}).get('Labels',{}).get('org.sdlc.coding-browser-job')==self.identity:
   subprocess.run(['docker','stop','--time','2',self.name],capture_output=True,timeout=8)
   subprocess.run(['docker','rm',self.name],capture_output=True,timeout=8)
  if self.ipc.is_dir() and not self.ipc.is_symlink():
   self.archive.mkdir(mode=0o700,exist_ok=True)
   for path in self.ipc.iterdir():
    if re.fullmatch(r'step-(?:[1-9]|1[0-9]|2[0-8])\.png',path.name) and path.is_file() and not path.is_symlink() and path.stat().st_size<=4000000:
     shutil.copyfile(path,self.archive/path.name);(self.archive/path.name).chmod(0o600);path.unlink()
    elif path.name=='browser.sock' and path.is_socket():path.unlink()
   if not any(self.ipc.iterdir()):self.ipc.rmdir()

def check_candidate(config,identity,round_number,files,directory,timeout=35,steps=None):
 steps=validate_ui_steps([] if steps is None else steps)
 if not any(file['path'] in ['src/main.jsx','src/main.tsx','src/index.jsx','src/index.tsx'] for file in files):
  if steps:raise ValueError('UI probe requires a supported React entry')
  return {'applicable':False,'passed':False,'scope':'Sem entrada React; teste de interface não aplicado.'}
 if not config.get('browserImageId'):raise RuntimeError('Browser validator not prepared')
 request=directory/f'browser-candidate-{round_number}.json';request.write_text(json.dumps({'files':files,'steps':steps}));request.chmod(0o444)
 name='sdlc-coding-browser-'+identity[:20]+'-'+str(round_number)
 args=['docker','run','--rm','--name',name,'--pull','never','--network','none','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','256','--memory','768m','--cpus','2','--shm-size','128m','--tmpfs','/tmp:uid=1000,gid=1000,mode=0700','--mount',f'type=bind,src={request},dst=/request/candidate.json,readonly','--label','org.sdlc.coding-browser-job='+identity,'-e','HOME=/tmp','--entrypoint','node',config['browserImageId'],'/opt/sdlc/coding-browser.mjs']
 try:
  result=subprocess.run(args,text=True,capture_output=True,timeout=timeout)
  (directory/f'browser-{round_number}-private.log').write_text(result.stderr[-8000:])
  if result.returncode or len(result.stdout)>16000:raise RuntimeError('Browser proof not confirmed: '+result.stderr[-2000:])
  value=json.loads(result.stdout)
  if not isinstance(value,dict) or type(value.get('applicable')) is not bool or type(value.get('passed')) is not bool or not isinstance(value.get('errors'),list):raise RuntimeError('Invalid browser proof')
  if len(value['errors'])>6 or any(not isinstance(error,str) or len(error)>1500 for error in value['errors']):raise RuntimeError('Invalid browser diagnostics')
  return value
 finally:
  inspected=subprocess.run(['docker','inspect',name],text=True,capture_output=True)
  if inspected.returncode==0:
   container=json.loads(inspected.stdout)[0]
   if container.get('Config',{}).get('Labels',{}).get('org.sdlc.coding-browser-job')==identity:subprocess.run(['docker','stop','--time','2',name],capture_output=True,timeout=8)
