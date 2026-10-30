"""Controlled DEV target executor. Its socket accepts references, never shell commands."""
import http.client,urllib.parse,ipaddress
from datetime import datetime,timezone
import argparse,fcntl,hashlib,json,os,re,socket,socketserver,struct,subprocess,threading,time,tempfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer

PROFILE='node24-http-v1'
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def digest(value):return hashlib.sha256(value).hexdigest()
class RuntimeFailure(Exception):pass
def identifier(value):return isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_-]{8,80}',value)
def configuration(intent):return {key:intent[key] for key in ['environmentId','profile','repositoryId','systemId','unitId']}
def validate_intent(value):
 fields={'id','kind','systemId','environmentId','repositoryId','profile','unitId','configDigest','sourceSha','contractDigest'}
 if not isinstance(value,dict) or set(value)!=(fields if value.get('kind')=='prepare' else fields|{'storyId','buildId','projectId','imageId','archiveDigest','artifactSize','expectedDeploymentId'}|({'deploymentId','suiteDigest','policyVersion'} if value.get('kind')=='test' else set())) or value['kind'] not in ['prepare','deploy','test'] or value['profile']!=PROFILE or not all(identifier(value[k]) for k in ['id','systemId','environmentId','repositoryId']) or not re.fullmatch(r'[a-z][a-z0-9-]{0,39}',str(value['unitId'])) or not re.fullmatch(r'(?:[a-f0-9]{40}|[a-f0-9]{64})',str(value['sourceSha'])) or not re.fullmatch(r'[a-f0-9]{64}',str(value['contractDigest'])) or value['configDigest']!=digest(canonical(configuration(value))):raise RuntimeFailure('PROFILE_UNSUPPORTED')
 if value['kind'] in ['deploy','test'] and (not identifier(value['storyId']) or not identifier(value['buildId']) or type(value['projectId']) is not int or value['projectId']<1 or not re.fullmatch('sha256:[a-f0-9]{64}',str(value['imageId'])) or not re.fullmatch('[a-f0-9]{64}',str(value['archiveDigest'])) or type(value['artifactSize']) is not int or not 0<value['artifactSize']<=536870912 or value['expectedDeploymentId'] is not None and not identifier(value['expectedDeploymentId'])):raise RuntimeFailure('PROFILE_UNSUPPORTED')
 if value['kind']=='test' and (not identifier(value['deploymentId']) or not re.fullmatch('[a-f0-9]{64}',str(value['suiteDigest'])) or value['policyVersion']!='dev-http-v1'):raise RuntimeFailure('PROFILE_UNSUPPORTED')
 return value

class Engine:
 def __init__(self,root,config,run=None):
  self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True,mode=0o700);self.config=config;self.run=run or self.command;self.gateways={};self.gateway_lock=threading.Lock()
 def command(self,*args,**options):
  try:return subprocess.run(['docker',*args],check=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=options.get('timeout',15)).stdout
  except (subprocess.SubprocessError,OSError):raise RuntimeFailure('RUNTIME_UNAVAILABLE')
 def directory(self,job_id):
  if not identifier(job_id):raise RuntimeFailure('PROFILE_UNSUPPORTED')
  return self.root/'jobs'/job_id
 def write(self,path,value):
  path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
  with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.runtime-',delete=False) as target:
   temporary=Path(target.name);target.write(canonical(value));target.flush();os.fsync(target.fileno())
  try:os.chmod(temporary,0o600);os.replace(temporary,path)
  finally:temporary.unlink(missing_ok=True)
 def state(self,job_id):
  path=self.directory(job_id)/'receipt.json';return json.loads(path.read_bytes()) if path.exists() else {'id':job_id,'state':'absent'}
 def save(self,job_id,state,**proof):
  previous=self.state(job_id)
  if previous['state']=='succeeded' or previous['state']=='failed' and previous.get('proof'):return previous
  self.write(self.directory(job_id)/'receipt.json',{'id':job_id,'state':state,**proof});return self.state(job_id)
 def name(self,intent):return 'sdlc-dev-'+digest(intent['environmentId'].encode())[:24]
 def labels(self,intent):return {'org.sdlc.runtime':PROFILE,'org.sdlc.installation':self.config['installationId'],'org.sdlc.system':intent['systemId'],'org.sdlc.environment':intent['environmentId'],'org.sdlc.repository':intent['repositoryId'],'org.sdlc.configuration':intent['configDigest'],'org.sdlc.unit':intent['unitId']}
 def inspect(self,intent):
  name=self.name(intent)
  # Listing first distinguishes a confirmed absence from an unavailable daemon.
  ids=self.run('network','ls','--no-trunc','--filter','name=^'+name+'$','--format','{{.ID}}').decode().split()
  if not ids:return {'state':'absent'}
  if len(ids)!=1:raise RuntimeFailure('TARGET_CONFLICT')
  data=json.loads(self.run('network','inspect',ids[0]))[0]
  if data.get('Name')!=name or data.get('Driver')!='bridge' or data.get('Internal') is not True or data.get('EnableIPv6') or any(data.get('Labels',{}).get(k)!=v for k,v in self.labels(intent).items()) or not re.fullmatch('[a-f0-9]{64}',str(data.get('Id'))):return {'state':'conflict'}
  return {'state':'prepared','proof':{'resourceId':data['Id'],'resourceName':name,'configDigest':intent['configDigest'],'unitId':intent['unitId'],'profile':PROFILE}}

 def target_directory(self,intent):
  directory=self.root/'targets'/self.name(intent);directory.mkdir(parents=True,exist_ok=True,mode=0o700);return directory
 def active(self,intent):
  path=self.target_directory(intent)/'active.json';return json.loads(path.read_bytes()) if path.exists() else None
 def gateway(self,intent):
  with self.gateway_lock:
   key=self.name(intent)
   if key in self.gateways:return self.gateways[key].server_port
   path=self.target_directory(intent)/'gateway.json';known=json.loads(path.read_bytes()) if path.exists() else None
   if known and (known['configuration']!=configuration(intent) or type(known['port']) is not int or not 1024<known['port']<65536):raise RuntimeFailure('TARGET_CONFLICT')
   try:server=ThreadingGateway(('127.0.0.1',known['port'] if known else 0),GatewayHandler)
   except OSError:raise RuntimeFailure('GATEWAY_UNAVAILABLE')
   server.engine=self;server.target_intent=intent
   if not known:self.write(path,{'configuration':configuration(intent),'intent':intent,'port':server.server_port})
   self.gateways[key]=server;threading.Thread(target=server.serve_forever,daemon=True).start();return server.server_port
 def check_http(self,port,host='127.0.0.1'):
  if type(port) is not int or not 1024<port<65536:raise RuntimeFailure('HEALTH_FAILED')
  try:
   client=http.client.HTTPConnection(host,port,timeout=2);client.request('GET','/health');response=client.getresponse();body=response.read(4097);valid=response.status==200 and len(body)<=4096;client.close();return valid
  except (OSError,http.client.HTTPException):return False
 def container(self,container_id,intent):
  if not re.fullmatch('[a-f0-9]{64}',str(container_id)):raise RuntimeFailure('TARGET_CONFLICT')
  ids=self.run('ps','-a','--no-trunc','--filter','id='+container_id,'--format','{{.ID}}').decode().split()
  if not ids:return None
  if ids!=[container_id]:raise RuntimeFailure('TARGET_CONFLICT')
  value=json.loads(self.run('inspect',container_id))[0]
  if any(value.get('Config',{}).get('Labels',{}).get(k)!=v for k,v in self.labels(intent).items()):raise RuntimeFailure('TARGET_CONFLICT')
  return value
 def artifact(self,intent,allow_load=False):
  root=Path(self.config['buildStateRoot']);directory=root/intent['buildId']
  if directory.is_symlink() or directory.resolve().parent!=root.resolve():raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
  try:
   build=json.loads((directory/'intent.json').read_bytes());receipt=json.loads((directory/'receipt.json').read_bytes());archive=directory/'artifact.tar'
   if archive.is_symlink() or not archive.is_file() or archive.stat().st_size!=intent['artifactSize'] or archive.stat().st_size>536870912:raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
   if receipt.get('state')!='succeeded' or receipt.get('imageId')!=intent['imageId'] or receipt.get('archiveDigest')!=intent['archiveDigest'] or receipt.get('size')!=intent['artifactSize'] or any(build.get(k)!=intent[k] for k in ['projectId','sourceSha','contractDigest','unitId']):raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
   with archive.open('rb') as stream:
    if __import__('hashlib').file_digest(stream,'sha256').hexdigest()!=intent['archiveDigest']:raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
   images=self.run('image','ls','--no-trunc','-q').decode().split()
   if intent['imageId'] not in images:
    if not allow_load:return {'available':True}
    self.run('load','--input',str(archive),timeout=60)
   image=json.loads(self.run('image','inspect',intent['imageId']))[0];labels=image.get('Config',{}).get('Labels',{})
   if image.get('Id')!=intent['imageId'] or labels.get('org.sdlc.build')!=intent['buildId'] or labels.get('org.sdlc.source')!=intent['sourceSha'] or labels.get('org.sdlc.request')!=digest(canonical(build)):raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
  except (OSError,ValueError,KeyError):raise RuntimeFailure('ARTIFACT_UNAVAILABLE')
  return {'available':True}
 def deployment_observation(self,intent):
  observed=datetime.now(timezone.utc).isoformat();active=self.active(intent)
  if not active:return {'state':'unconfirmed','observedAt':observed}
  try:
   target=self.inspect(intent);container=self.container(active['containerId'],intent)
   if target['state']!='prepared' or not container or not container.get('State',{}).get('Running') or container.get('Image')!=active['imageId'] or not self.check_http(active['port'],active['host']) or not self.check_http(active['gatewayPort']):return {'state':'unavailable','operationId':active['id'],'observedAt':observed}
  except RuntimeFailure:return {'state':'unavailable','operationId':active['id'],'observedAt':observed}
  return {'state':'healthy' if active['id']==intent['id'] and active['imageId']==intent['imageId'] else 'changed','operationId':active['id'],'url':'http://localhost:'+str(active['gatewayPort']),'observedAt':observed}
 def execute_deployment(self,intent):
  directory=self.directory(intent['id'])
  with (directory/'execute.lock').open('a+') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   if self.state(intent['id'])['state']!='queued':return
   self.save(intent['id'],'running');locks=self.root/'locks';locks.mkdir(exist_ok=True);candidate=None;previous=None;switched=False
   try:
    with (locks/(self.name(intent)+'.lock')).open('a+') as target_lock:
     fcntl.flock(target_lock,fcntl.LOCK_EX);seen=self.inspect(intent)
     if seen['state']!='prepared':raise RuntimeFailure('TARGET_CONFLICT')
     previous=self.active(intent)
     if (previous or {}).get('id')!=intent['expectedDeploymentId']:raise RuntimeFailure('DEPLOYMENT_CHANGED')
     self.artifact(intent,allow_load=True);gateway_port=self.gateway(intent);name='sdlc-app-'+intent['id'];args=['run','-d','--pull','never','--name',name,'--network',seen['proof']['resourceName'],'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:size=64m,mode=1777','--log-driver','none','--restart','unless-stopped']
     for key,value in {**self.labels(intent),'org.sdlc.deployment':intent['id'],'org.sdlc.image':intent['imageId']}.items():args.extend(['--label',key+'='+value])
     candidate=self.run(*args,'--entrypoint','node',intent['imageId'],'server.mjs',timeout=30).decode().strip();data=self.container(candidate,intent)
     if not data or data.get('Image')!=intent['imageId']:raise RuntimeFailure('TARGET_CONFLICT')
     addresses=data.get('NetworkSettings',{}).get('Networks',{});address=addresses.get(seen['proof']['resourceName'],{}).get('IPAddress');ip=ipaddress.ip_address(address)
     if len(addresses)!=1 or ip.version!=4 or not ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified or data.get('HostConfig',{}).get('PortBindings'):raise RuntimeFailure('TARGET_CONFLICT')
     port=8080;healthy=False
     for _ in range(50):
      if self.check_http(port,address):healthy=True;break
      time.sleep(.2)
     if not healthy:raise RuntimeFailure('HEALTH_FAILED')
     active={**intent,'containerId':candidate,'host':address,'port':port,'gatewayPort':gateway_port};self.write(self.target_directory(intent)/'active.json',active);switched=True
     if not self.check_http(gateway_port):raise RuntimeFailure('HEALTH_FAILED')
     proof={key:intent[key] for key in ['buildId','sourceSha','imageId','archiveDigest','configDigest']};proof.update(containerId=candidate,resourceId=seen['proof']['resourceId'],url='http://localhost:'+str(gateway_port),healthAt=datetime.now(timezone.utc).isoformat())
     self.save(intent['id'],'succeeded',proof=proof)
     if previous and previous['containerId']!=candidate:
      try:
       if self.container(previous['containerId'],intent):self.run('stop','--time','5',previous['containerId'])
      except RuntimeFailure:pass
   except RuntimeFailure as error:
    if switched:
     path=self.target_directory(intent)/'active.json'
     if previous:self.write(path,previous)
     else:path.unlink(missing_ok=True)
    if candidate:
     try:
      if self.container(candidate,intent):self.run('rm','-f',candidate)
     except RuntimeFailure:pass
    self.save(intent['id'],'unknown' if str(error) in ['RUNTIME_UNAVAILABLE','GATEWAY_UNAVAILABLE'] else 'failed',code=str(error))
   except Exception:self.save(intent['id'],'unknown',code='RUNTIME_UNAVAILABLE')


 def suite(self,intent):
  path=Path(self.config['buildStateRoot'])/intent['buildId']/'source/tests/dev-http.json'
  try:
   if path.is_symlink() or not path.is_file() or path.stat().st_size>65536:raise RuntimeFailure('SUITE_UNAVAILABLE')
   raw=path.read_bytes();suite=json.loads(raw)
   if set(suite)!={'schemaVersion','scope','cases'} or type(suite['schemaVersion']) is not int or suite['schemaVersion']!=1 or suite['scope'] not in ['technical','acceptance'] or not isinstance(suite['cases'],list) or not 1<=len(suite['cases'])<=20:raise RuntimeFailure('SUITE_UNAVAILABLE')
   ids=set()
   for case in suite['cases']:
    if not isinstance(case,dict) or not {'id','name','method','path','status'}<=set(case) or set(case)-{'id','name','method','path','status','contains','body','criterionIndices'}:raise RuntimeFailure('SUITE_UNAVAILABLE')
    name=case['name'];path_value=case['path'];indices=case.get('criterionIndices',[])
    if not isinstance(case['id'],str) or not re.fullmatch('[a-zA-Z0-9_-]{1,60}',case['id']) or case['id'] in ids or not isinstance(name,str) or not 1<=len(name)<=160 or any(ord(c)<32 for c in name) or case['method'] not in ['GET','HEAD','POST','PUT','PATCH','DELETE'] or type(case['status']) is not int or not 100<=case['status']<=599:raise RuntimeFailure('SUITE_UNAVAILABLE')
    if not isinstance(path_value,str) or not 1<=len(path_value)<=512 or not path_value.startswith('/') or path_value.startswith('//') or any(ord(c)<32 or c=='\\' for c in path_value):raise RuntimeFailure('SUITE_UNAVAILABLE')
    parsed=urllib.parse.urlsplit(path_value)
    if parsed.scheme or parsed.netloc or parsed.fragment or any(part in ['.','..'] for part in urllib.parse.unquote(parsed.path).split('/')):raise RuntimeFailure('SUITE_UNAVAILABLE')
    if not isinstance(indices,list) or len(indices)>20 or any(type(i) is not int or not 0<=i<100 for i in indices) or len(set(indices))!=len(indices) or suite['scope']=='acceptance' and not indices:raise RuntimeFailure('SUITE_UNAVAILABLE')
    if 'contains' in case and (not isinstance(case['contains'],str) or not 1<=len(case['contains'])<=256):raise RuntimeFailure('SUITE_UNAVAILABLE')
    if 'body' in case and (case['method'] in ['GET','HEAD'] or not isinstance(case['body'],dict) or len(canonical(case['body']))>8192):raise RuntimeFailure('SUITE_UNAVAILABLE')
    case['criterionIndices']=indices;ids.add(case['id'])
   return suite,digest(raw)
  except (OSError,ValueError,KeyError,TypeError,RecursionError):raise RuntimeFailure('SUITE_UNAVAILABLE')
 def test_plan(self,intent):
  self.artifact(intent);deployment={**intent,'id':intent.get('deploymentId',intent['id'])}
  if self.deployment_observation(deployment)['state']!='healthy':raise RuntimeFailure('DEPLOYMENT_CHANGED')
  suite,suite_digest=self.suite(intent)
  return {'policyVersion':'dev-http-v1','suiteDigest':suite_digest,'scope':suite['scope'],'cases':[{key:case[key] for key in ['id','name','method','path','status','criterionIndices']} for case in suite['cases']],'mutatesData':any(case['method'] not in ['GET','HEAD'] for case in suite['cases'])}
 def execute_test(self,intent):
  directory=self.directory(intent['id'])
  with (directory/'execute.lock').open('a+') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   if self.state(intent['id'])['state']!='queued':return
   self.save(intent['id'],'running');locks=self.root/'locks';locks.mkdir(exist_ok=True)
   try:
    with (locks/(self.name(intent)+'.lock')).open('a+') as target_lock:
     fcntl.flock(target_lock,fcntl.LOCK_EX);plan=self.test_plan(intent)
     if plan['suiteDigest']!=intent['suiteDigest']:raise RuntimeFailure('SUITE_CHANGED')
     suite,suite_digest=self.suite(intent)
     if suite_digest!=intent['suiteDigest']:raise RuntimeFailure('SUITE_CHANGED')
     active=self.active(intent);started=datetime.now(timezone.utc).isoformat();deadline=time.monotonic()+45;results=[]
     for case in suite['cases']:
      tick=time.monotonic();status=None;code='HTTP_UNAVAILABLE';client=None
      try:
       if tick>=deadline:raise RuntimeFailure('TEST_TIMEOUT')
       client=http.client.HTTPConnection(active['host'],active['port'],timeout=min(2,max(.1,deadline-tick)));body=canonical(case['body']) if 'body' in case else None
       client.request(case['method'],case['path'],body=body,headers={'Host':'localhost:'+str(active['gatewayPort']),'Content-Type':'application/json','X-SDLC-Test-Execution':intent['id']});response=client.getresponse();status=response.status;content=response.read(2097153)
       code='RESPONSE_TOO_LARGE' if len(content)>2097152 else 'STATUS_MISMATCH' if status!=case['status'] else 'BODY_MISMATCH' if 'contains' in case and case['contains'].encode() not in content else 'PASSED'
      except (OSError,http.client.HTTPException,RuntimeFailure):pass
      finally:
       if client:client.close()
      results.append({'id':case['id'],'name':case['name'],'criterionIndices':case['criterionIndices'],'passed':code=='PASSED','expectedStatus':case['status'],'actualStatus':status,'code':code,'durationMs':round((time.monotonic()-tick)*1000)})
     proof={key:intent[key] for key in ['deploymentId','buildId','sourceSha','imageId','archiveDigest','suiteDigest','policyVersion']};proof.update(scope=suite['scope'],startedAt=started,finishedAt=datetime.now(timezone.utc).isoformat(),cases=results)
     self.save(intent['id'],'succeeded' if all(case['passed'] for case in results) else 'failed',proof=proof)
   except RuntimeFailure as error:self.save(intent['id'],'unknown' if str(error)=='RUNTIME_UNAVAILABLE' else 'failed',code=str(error))
   except Exception:self.save(intent['id'],'unknown',code='RUNTIME_UNAVAILABLE')

 def health(self):
  self.run('info','--format','{{.ServerVersion}}');return {'ready':True,'profile':PROFILE}
 def accept(self,intent,background=True):
  intent=validate_intent(intent);directory=self.directory(intent['id']);directory.mkdir(parents=True,exist_ok=True,mode=0o700)
  with (directory/'intent.lock').open('a+') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX);path=directory/'intent.json'
   if path.exists():
    if json.loads(path.read_bytes())!=intent:raise RuntimeFailure('INTENT_CONFLICT')
    return self.public(intent['id'])
   self.write(path,intent);result=self.save(intent['id'],'queued')
  if background:threading.Thread(target=self.execute,args=(intent,),daemon=True).start()
  return result
 def execute(self,intent):
  if intent['kind']=='test':self.execute_test(intent);return
  if intent['kind']=='deploy':self.execute_deployment(intent);return
  directory=self.directory(intent['id'])
  with (directory/'execute.lock').open('a+') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   if self.state(intent['id'])['state']!='queued':return
   self.save(intent['id'],'running');locks=self.root/'locks';locks.mkdir(exist_ok=True)
   try:
    with (locks/(self.name(intent)+'.lock')).open('a+') as target_lock:
     fcntl.flock(target_lock,fcntl.LOCK_EX);seen=self.inspect(intent)
     if seen['state']=='conflict':raise RuntimeFailure('TARGET_CONFLICT')
     if seen['state']=='absent':
      args=['network','create','--driver','bridge','--internal']
      for key,value in self.labels(intent).items():args.extend(['--label',key+'='+value])
      self.run(*args,self.name(intent));seen=self.inspect(intent)
     if seen['state']!='prepared':raise RuntimeFailure('TARGET_UNCONFIRMED')
     self.save(intent['id'],'succeeded',proof=seen['proof'])
   except RuntimeFailure as error:self.save(intent['id'],'unknown' if str(error) in ['RUNTIME_UNAVAILABLE','TARGET_UNCONFIRMED'] else 'failed',code=str(error))
   except Exception:self.save(intent['id'],'unknown',code='RUNTIME_UNAVAILABLE')
 def public(self,job_id):
  value=self.state(job_id)
  if value['state']=='unknown':
   intent=validate_intent(json.loads((self.directory(job_id)/'intent.json').read_bytes()))
   if intent['kind']=='test':return value
   if intent['kind']=='deploy':
    observation=self.deployment_observation(intent)
    if observation['state']=='healthy':
     active=self.active(intent);network=self.inspect(intent)['proof'];proof={key:intent[key] for key in ['buildId','sourceSha','imageId','archiveDigest','configDigest']};proof.update(containerId=active['containerId'],resourceId=network['resourceId'],url=observation['url'],healthAt=observation['observedAt']);return self.save(job_id,'succeeded',proof=proof)
    return value
   seen=self.inspect(intent)
   if seen['state']=='prepared':return self.save(job_id,'succeeded',proof=seen['proof'])
  return value
 def recover(self):
  for route in self.root.glob('targets/*/gateway.json'):
   try:self.gateway(json.loads(route.read_bytes())['intent'])
   except (RuntimeFailure,OSError,ValueError):pass
  for path in self.root.glob('jobs/*/intent.json'):
   intent=validate_intent(json.loads(path.read_bytes()))
   if self.state(intent['id'])['state'] in ['absent','queued','running']:self.save(intent['id'],'unknown',code='EXECUTOR_INTERRUPTED')


class ThreadingGateway(socketserver.ThreadingMixIn,HTTPServer):daemon_threads=True;allow_reuse_address=True
class GatewayHandler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def forward(self):
  try:
   if not self.path.startswith('/') or len(self.path)>4096 or self.headers.get('Transfer-Encoding'):raise RuntimeFailure('HEALTH_FAILED')
   size=int(self.headers.get('Content-Length','0'))
   if not 0<=size<=65536:raise RuntimeFailure('HEALTH_FAILED')
   active=self.server.engine.active(self.server.target_intent)
   if not active:raise RuntimeFailure('HEALTH_FAILED')
   body=self.rfile.read(size) if size else None;headers={key:value for key,value in self.headers.items() if key.lower() not in ['connection','transfer-encoding','proxy-authorization','proxy-connection','host','forwarded','x-forwarded-host','x-forwarded-proto','x-forwarded-port']};headers['Host']='localhost:'+str(self.server.server_port);headers['X-Forwarded-Host']=headers['Host'];headers['X-Forwarded-Proto']='http'
   client=http.client.HTTPConnection(active['host'],active['port'],timeout=4);client.request(self.command,self.path,body=body,headers=headers);response=client.getresponse();content=response.read(2097153)
   if len(content)>2097152:raise RuntimeFailure('HEALTH_FAILED')
   self.send_response(response.status)
   for key,value in response.getheaders():
    if key.lower() in ['content-type','cache-control','etag','last-modified','location','set-cookie']:self.send_header(key,value)
   self.send_header('Content-Length',str(len(content)));self.end_headers()
   if self.command!='HEAD':self.wfile.write(content)
   client.close()
  except Exception:
   try:self.send_response(503);self.send_header('Content-Length','0');self.end_headers()
   except OSError:pass
 do_GET=forward;do_HEAD=forward;do_POST=forward;do_PUT=forward;do_PATCH=forward;do_DELETE=forward;do_OPTIONS=forward

class UnixHTTPServer(socketserver.ThreadingMixIn,HTTPServer):
 address_family=socket.AF_UNIX;daemon_threads=True
 def server_bind(self):socketserver.TCPServer.server_bind(self);self.server_name='local-runtime';self.server_port=0
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def reply(self,status,value):
  body=canonical(value);self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def dispatch(self):
  try:
   _,uid,_=struct.unpack('3i',self.connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid not in [0,1000]:self.reply(403,{});return
   if self.command=='GET' and self.path=='/health':self.reply(200,self.server.engine.health());return
   if self.command=='GET' and self.path=='/test-capabilities':self.reply(200,{'tests':True});return
   if self.command=='GET' and self.path=='/capabilities':self.reply(200,{'deployment':True});return
   match=re.fullmatch('/operations/([A-Za-z0-9_-]{8,80})',self.path)
   if match and self.command=='GET':self.reply(200,self.server.engine.public(match[1]));return
   if self.command!='POST':self.reply(404,{});return
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=4096:raise RuntimeFailure('PROFILE_UNSUPPORTED')
   intent=validate_intent(json.loads(self.rfile.read(size)))
   if self.path=='/test-context' and intent['kind']=='deploy':self.reply(200,self.server.engine.test_plan(intent));return
   if self.path=='/check-artifact' and intent['kind']=='deploy':self.reply(200,self.server.engine.artifact(intent));return
   if self.path=='/inspect-deployment' and intent['kind']=='deploy':self.reply(200,self.server.engine.deployment_observation(intent));return
   if self.path=='/inspect':self.reply(200,self.server.engine.inspect(intent));return
   if not match or intent['id']!=match[1]:raise RuntimeFailure('PROFILE_UNSUPPORTED')
   self.reply(200,self.server.engine.accept(intent))
  except (ValueError,RuntimeFailure):self.reply(409,{})
  except Exception:self.reply(503,{})
 do_GET=dispatch;do_POST=dispatch
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);args=parser.parse_args();config=json.loads(Path(args.config).read_bytes());engine=Engine(config['stateRoot'],config);engine.recover();address=Path(config['socketPath']);address.parent.mkdir(parents=True,exist_ok=True);address.unlink(missing_ok=True);server=UnixHTTPServer(str(address),Handler);server.engine=engine;os.chown(address,0,1000);os.chmod(address,0o660);server.serve_forever()
if __name__=='__main__':main()
