"""Narrow local build service. Only a job-owned read-only source mount; no TCP, database, secrets or shell."""
from pathlib import Path,PurePosixPath
from http.server import BaseHTTPRequestHandler,HTTPServer
import argparse,hashlib,io,json,os,re,socket,socketserver,struct,subprocess,tarfile,threading,time,urllib.request

POLICY='node24-react-v1'
PROFILE_DOCKERFILE='''FROM sdlc-node24-react:prepared
WORKDIR /app
COPY . .
RUN ["node","scripts/build.mjs"]
USER node
EXPOSE 8080
CMD ["node","server.mjs"]'''
MAX_SOURCE=16*1024*1024
class BuildFailure(Exception):
 def __init__(self,code):self.code=code
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def digest(value):return hashlib.sha256(value).hexdigest()
def atomic(path,value):
 path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 temporary=path.with_suffix('.new')
 with temporary.open('wb') as stream:stream.write(canonical(value));stream.flush();os.fsync(stream.fileno())
 os.chmod(temporary,0o600);os.replace(temporary,path)
 descriptor=os.open(path.parent,os.O_DIRECTORY)
 try:os.fsync(descriptor)
 finally:os.close(descriptor)
def validate_intent(value):
 fields={'id','projectId','sourceSha','contractDigest','unitId','baseImageId','policyVersion'}
 if not isinstance(value,dict) or set(value) not in [fields,fields|{'purpose'}] or value.get('purpose','application_preparation')!='application_preparation' or not re.fullmatch('[a-zA-Z0-9_-]{8,80}',str(value['id'])) or type(value['projectId'])!=int or value['projectId']<1 or not re.fullmatch('(?:[a-f0-9]{40}|[a-f0-9]{64})',str(value['sourceSha'])) or not re.fullmatch('[a-f0-9]{64}',str(value['contractDigest'])) or not re.fullmatch('[a-z][a-z0-9-]{0,39}',str(value['unitId'])) or not re.fullmatch('sha256:[a-f0-9]{64}',str(value['baseImageId'])) or value['policyVersion']!=POLICY:raise BuildFailure('PROFILE_UNSUPPORTED')
 return value
def safe_archive(data,sha):
 """Validate every member before creating an in-memory regular-file-only snapshot."""
 if len(data)>MAX_SOURCE:raise BuildFailure('SOURCE_UNSAFE')
 files={};seen=set();total=0;prefix=None
 try:
  with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
   for index,member in enumerate(archive):
    parts=PurePosixPath(member.name).parts
    if index>=2000 or not parts or member.name.startswith('/') or '\\' in member.name or any(v in ['','.','..'] for v in member.name.rstrip('/').split('/')):raise BuildFailure('SOURCE_UNSAFE')
    if prefix is None:prefix=parts[0]
    if parts[0]!=prefix or not prefix.endswith(sha) or not(member.isdir() or member.isfile()) or member.size>2*1024*1024:raise BuildFailure('SOURCE_UNSAFE')
    if len(parts)==1:
     if not member.isdir():raise BuildFailure('SOURCE_UNSAFE')
     continue
    path='/'.join(parts[1:]);lower=path.lower()
    if lower in seen or any(v.lower() in ['.git','.ssh','.aws','node_modules'] or v.lower()=='.env' or v.lower().startswith('.env.') for v in parts[1:]):raise BuildFailure('SOURCE_UNSAFE')
    seen.add(lower)
    if member.isdir():continue
    total+=member.size
    if total>MAX_SOURCE:raise BuildFailure('SOURCE_UNSAFE')
    stream=archive.extractfile(member)
    if stream is None:raise BuildFailure('SOURCE_UNSAFE')
    files[path]=stream.read(member.size+1)
    if len(files[path])!=member.size:raise BuildFailure('SOURCE_UNSAFE')
 except (tarfile.TarError,EOFError,ValueError):raise BuildFailure('SOURCE_UNSAFE')
 return files
def validate_profile(files,intent,packages):
 try:
  content=files['.sdlc/execution.json'];contract=json.loads(content)
  if digest(content)!=intent['contractDigest']:raise BuildFailure('CONTRACT_CHANGED')
  if contract.get('schemaVersion')!=1 or len(contract['units'])!=1:raise BuildFailure('PROFILE_UNSUPPORTED')
  unit=contract['units'][0]
  expected={'id':intent['unitId'],'path':'.','runtime':{'kind':'node','version':'24'},'build':{'entrypoint':'scripts/build.mjs'},'test':{'entrypoint':'scripts/test.mjs'},'artifact':{'dockerfile':'Dockerfile','context':'.'},'health':{'kind':'http','path':'/health','port':8080,'status':200},'migrations':{'mode':'none'}}
  recipe='\n'.join(line.strip() for line in files['Dockerfile'].decode().splitlines() if line.strip())
  if unit!=expected or recipe!=PROFILE_DOCKERFILE or not all(path in files for path in ['scripts/build.mjs','scripts/test.mjs','server.mjs']):raise BuildFailure('PROFILE_UNSUPPORTED')
  if 'package.json' in files:
   manifest=json.loads(files['package.json'])
   for field in ['dependencies','devDependencies']:
    dependencies=manifest.get(field,{})
    if not isinstance(dependencies,dict) or any(name not in packages or version!=packages[name] for name,version in dependencies.items()):raise BuildFailure('PROFILE_UNSUPPORTED')
 except (KeyError,TypeError,ValueError,UnicodeError):raise BuildFailure('PROFILE_UNSUPPORTED')
 return files
def source_tar(files):
 output=io.BytesIO()
 with tarfile.open(fileobj=output,mode='w') as archive:
  for name,content in sorted(files.items()):
   info=tarfile.TarInfo(name);info.size=len(content);info.mode=0o644;info.uid=info.gid=1000;archive.addfile(info,io.BytesIO(content))
 return output.getvalue()
def docker(*args,input=None,timeout=15,quiet=False,limit=262144):
 try:
  if quiet or input is not None:
   result=subprocess.run(['docker',*map(str,args)],input=input,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=timeout,check=False)
   if result.returncode:raise BuildFailure('BUILD_FAILED' if quiet else 'ARTIFACT_UNCONFIRMED')
   return b''
  with subprocess.Popen(['docker',*map(str,args)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as process:
   timer=threading.Timer(timeout,process.kill);timer.start()
   try:
    output=process.stdout.read(limit+1)
    if len(output)>limit:process.kill();raise BuildFailure('ARTIFACT_UNCONFIRMED')
    if process.wait(timeout=1):raise BuildFailure('ARTIFACT_UNCONFIRMED')
    return output
   finally:timer.cancel()
 except subprocess.TimeoutExpired:raise BuildFailure('BUILD_TIMEOUT' if quiet else 'ARTIFACT_UNCONFIRMED')
 except OSError:raise BuildFailure('ARTIFACT_UNCONFIRMED')
class Engine:
 def __init__(self,root,config,fetch=None,run=None):
  self.root=Path(root);self.config=config;self.fetch=fetch or self.fetch_source;self.docker=run or docker;self.lock=threading.Lock();self.execution_lock=threading.Lock()
  self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
 def directory(self,identifier):
  if not re.fullmatch('[a-zA-Z0-9_-]{8,80}',identifier):raise BuildFailure('PROFILE_UNSUPPORTED')
  return self.root/identifier
 def state(self,identifier):
  path=self.directory(identifier)/'receipt.json'
  return json.loads(path.read_text()) if path.is_file() else {'id':identifier,'state':'absent'}
 def public(self,identifier):return {key:value for key,value in self.state(identifier).items() if key in ['id','state','imageId','archiveDigest','size','technicalTestPassed','code']}
 def health(self):
  ready=False
  try:
   value=json.loads(self.docker('image','inspect',self.config['baseImageId']))[0]
   ready=value['Id']==self.config['baseImageId'] and value['Config'].get('Labels',{}).get('org.sdlc.toolchain')==POLICY and not value['Config'].get('Volumes')
  except (BuildFailure,KeyError,ValueError,IndexError):pass
  return {'ready':ready,'policyVersion':POLICY,'baseImageId':self.config['baseImageId']}
 def save(self,identifier,state,**values):
  old=self.state(identifier);old.update(state=state,**values);atomic(self.directory(identifier)/'receipt.json',old)
 def accept(self,value,background=True):
  intent=validate_intent(value);directory=self.directory(intent['id']);request_hash=digest(canonical(intent))
  with self.lock:
   old=self.state(intent['id'])
   if old['state']!='absent':
    if old.get('requestDigest')!=request_hash:raise BuildFailure('PROFILE_UNSUPPORTED')
    return self.public(intent['id'])
   directory.mkdir(mode=0o700);atomic(directory/'intent.json',intent)
   self.save(intent['id'],'queued',requestDigest=request_hash)
  if background:threading.Thread(target=self.execute,args=(intent,),daemon=True).start()
  return self.public(intent['id'])
 def fetch_source(self,intent):
  token=Path(self.config['gitlabTokenFile']).read_text().strip();base=self.config['gitlabBase'].rstrip('/')
  def get(path,limit):
   class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
   request=urllib.request.Request(base+'/api/v4/'+path,headers={'PRIVATE-TOKEN':token})
   try:
    with urllib.request.build_opener(NoRedirect).open(request,timeout=20) as response:data=response.read(limit+1)
   except Exception:raise BuildFailure('SOURCE_UNAVAILABLE')
   if len(data)>limit:raise BuildFailure('SOURCE_UNSAFE')
   return data
  project=json.loads(get('projects/'+str(intent['projectId']),262144))
  if project.get('id')!=intent['projectId'] or project.get('archived') or not project.get('path_with_namespace','').startswith(self.config['gitlabRoot']+'/') or 'sdlc-managed' not in project.get('topics',[]):raise BuildFailure('SOURCE_UNAVAILABLE')
  return get(f"projects/{intent['projectId']}/repository/archive.tar.gz?sha={intent['sourceSha']}",MAX_SOURCE)
 def execute(self,intent):
  with self.execution_lock:
   identifier=intent['id'];directory=self.directory(identifier);name='sdlc-build-'+identifier;artifact_name='sdlc-artifact-'+identifier;technical_name='sdlc-technical-'+identifier;created=False;packaged=False;technical=False
   if self.state(identifier)['state']!='queued':return
   try:
    if intent['baseImageId']!=self.config['baseImageId'] or not self.health()['ready']:raise BuildFailure('PROFILE_UNSUPPORTED')
    files=validate_profile(safe_archive(self.fetch(intent),intent['sourceSha']),intent,self.config['packages'])
    self.save(identifier,'running',executionStartedAt=time.time())
    snapshot=directory/'source';snapshot.mkdir(mode=0o755);snapshot.chmod(0o755)
    for path,content in files.items():
     target=snapshot/path;target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
     # The service uses UMask=0077. Only the validated source snapshot is
     # mounted into the unprivileged container; make its directories traversable
     # explicitly, while the enclosing job/credentials remain private.
     parent=target.parent
     while parent!=directory:
      parent.chmod(0o755);parent=parent.parent
     target.write_bytes(content);target.chmod(0o444)
    # The only host mount is this validated, read-only, job-owned snapshot.
    # Code runs in a bounded tmpfs under a read-only root filesystem.
    self.docker('create','--pull','never','--name',name,'--network','none','--read-only','--memory','768m','--memory-swap','768m','--cpus','1','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1000:1000','--workdir','/app/work','--mount','type=bind,src='+str(snapshot)+',dst=/source,readonly','--tmpfs','/app/work:size=128m,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:size=64m,mode=1777','--log-driver','none','--label','org.sdlc.build='+identifier,'--entrypoint','node',intent['baseImageId'],'-e','setInterval(()=>{},1000)');created=True
    self.docker('start',name)
    self.docker('exec',name,'node','-e',"require('fs').cpSync('/source','/app/work',{recursive:true})")
    # Discard arbitrary stdout/stderr without buffering it in the service.
    self.docker('exec',name,'node','scripts/build.mjs',quiet=True,timeout=120)
    # Docker archive of a tmpfs mount is not portable across engines. Read from
    # the container filesystem directly with the fixed, trusted tar command.
    built=self.docker('exec',name,'tar','-C','/app/work','-cf','-','.',timeout=20,limit=128*1024*1024)
    if len(built)>128*1024*1024:raise BuildFailure('SOURCE_UNSAFE')
    output={};size=0;root_prefix=None
    with tarfile.open(fileobj=io.BytesIO(built),mode='r:') as archive:
     for index,member in enumerate(archive):
      if index==0 and member.isdir() and member.name.rstrip('/') in ['work','.']:
       root_prefix='work/' if member.name.rstrip('/')=='work' else None
       continue
      path=member.name.removeprefix('./')
      if root_prefix:
       if not path.startswith(root_prefix):raise BuildFailure('SOURCE_UNSAFE')
       path=path[len(root_prefix):]
      parts=PurePosixPath(path).parts
      if index>=4000 or path.startswith('/') or '\\' in path or any(v in ['.','..','node_modules','.git','.ssh','.aws'] or v=='.env' or v.startswith('.env.') for v in parts) or not parts or member.size>16*1024*1024:raise BuildFailure('SOURCE_UNSAFE')
      if member.isdir():continue
      if not member.isfile():raise BuildFailure('SOURCE_UNSAFE')
      size+=member.size
      if size>128*1024*1024 or path in output:raise BuildFailure('SOURCE_UNSAFE')
      output[path]=archive.extractfile(member).read(member.size+1)
    if not output.get('server.mjs') or not output.get('dist/app.js'):raise BuildFailure('BUILD_FAILED')
    # The packaging container is never started; only validated regular files enter its layer.
    self.docker('create','--pull','never','--name',artifact_name,'--network','none','--user','1000:1000','--workdir','/app','--label','org.sdlc.build='+identifier,'--label','org.sdlc.request='+digest(canonical(intent)),'--label','org.sdlc.source='+intent['sourceSha'],'--entrypoint','node',intent['baseImageId'],'server.mjs');packaged=True
    self.docker('cp','-a','-',artifact_name+':/app',input=source_tar(output))
    self.save(identifier,'running',commitStartedAt=time.time())
    tag='sdlc-work:'+identifier
    image_id=self.docker('commit','--change','ENTRYPOINT []','--change','CMD ["node","server.mjs"]',artifact_name,tag,timeout=30).decode().strip()
    if not re.fullmatch('sha256:[a-f0-9]{64}',image_id):raise BuildFailure('ARTIFACT_UNCONFIRMED')
    image=json.loads(self.docker('image','inspect',image_id))[0]
    if image['Id']!=image_id or image['Size']>536870912 or image['Config'].get('Labels',{}).get('org.sdlc.request')!=digest(canonical(intent)):raise BuildFailure('ARTIFACT_UNCONFIRMED')
    # Never capture unbounded archives in memory. The only file target is this owned job.
    partial=directory/'artifact.partial.tar'
    self.docker('save','--output',str(partial),image_id,timeout=45)
    size=partial.stat().st_size
    if size<=0 or size>536870912:raise BuildFailure('ARTIFACT_UNCONFIRMED')
    with partial.open('rb') as stream:artifact_hash=hashlib.file_digest(stream,'sha256').hexdigest()
    archive=directory/'artifact.tar';os.replace(partial,archive);os.chmod(archive,0o600)
    proof={}
    if intent.get('purpose')=='application_preparation':
     technical=True
     self.docker('run','--rm','--pull','never','--name',technical_name,'--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--memory-swap','256m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:size=64m,mode=1777','--log-driver','none','--label','org.sdlc.build='+identifier,'--entrypoint','node',image_id,'scripts/test.mjs',quiet=True,timeout=30)
     proof={'technicalTestPassed':True}
    self.save(identifier,'succeeded',imageId=image_id,archiveDigest=artifact_hash,size=size,**proof)
   except BuildFailure as failure:self.save(identifier,'unknown' if failure.code=='ARTIFACT_UNCONFIRMED' else 'failed',code=failure.code)
   except Exception:self.save(identifier,'unknown',code='EXECUTOR_INTERRUPTED')
   finally:
    for own_name,exists in [(name,created),(artifact_name,packaged),(technical_name,technical)]:
     if not exists:continue
     try:
      row=json.loads(self.docker('inspect',own_name))[0]
      if row['Config'].get('Labels',{}).get('org.sdlc.build')==identifier:self.docker('rm','-f',own_name)
     except Exception:pass
 def recover(self):
  # A restart does not execute code again. Completed receipts remain immutable.
  for path in self.root.glob('*/intent.json'):
   if not (path.parent/'receipt.json').exists():
    intent=validate_intent(json.loads(path.read_text()))
    self.save(intent['id'],'unknown',requestDigest=digest(canonical(intent)),code='EXECUTOR_INTERRUPTED')
  for path in self.root.glob('*/receipt.json'):
   value=json.loads(path.read_text())
   if value['state'] in ['queued','running']:self.save(value['id'],'unknown',code='EXECUTOR_INTERRUPTED')

class UnixHTTPServer(socketserver.ThreadingMixIn,HTTPServer):
 address_family=socket.AF_UNIX;daemon_threads=True
 def server_bind(self):socketserver.TCPServer.server_bind(self);self.server_name='local-build';self.server_port=0
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def reply(self,status,value):
  body=canonical(value);self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def dispatch(self):
  try:
   _,uid,_=struct.unpack('3i',self.connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid not in [0,1000]:self.reply(403,{});return
   if self.command=='GET' and self.path=='/health':self.reply(200,self.server.engine.health());return
   if self.command=='GET' and self.path=='/capabilities':self.reply(200,{'applicationPreparation':True});return
   match=re.fullmatch('/builds/([a-zA-Z0-9_-]{8,80})',self.path)
   if not match:self.reply(404,{});return
   if self.command=='GET':self.reply(200,self.server.engine.public(match[1]));return
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=4096:raise BuildFailure('PROFILE_UNSUPPORTED')
   intent=validate_intent(json.loads(self.rfile.read(size)))
   if intent['id']!=match[1]:raise BuildFailure('PROFILE_UNSUPPORTED')
   self.reply(200,self.server.engine.accept(intent))
  except (BuildFailure,ValueError):self.reply(409,{})
  except Exception:self.reply(503,{})
 do_GET=dispatch;do_POST=dispatch
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);args=parser.parse_args();config=json.loads(Path(args.config).read_text());engine=Engine(config['stateRoot'],config);engine.recover()
 address=Path(config['socketPath']);address.parent.mkdir(parents=True,exist_ok=True);address.unlink(missing_ok=True)
 server=UnixHTTPServer(str(address),Handler);server.engine=engine;os.chown(address,0,1000);os.chmod(address,0o660);server.serve_forever()
if __name__=='__main__':main()
