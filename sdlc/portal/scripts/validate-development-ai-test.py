"""Opt-in model/browser qualification against owned published DEV fixtures only."""
from pathlib import Path
import hashlib,importlib.util,json,os,subprocess,sys,time,urllib.request,uuid
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'scripts'))
from audit_admin import administrative_operation
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
build=load(ROOT/'executor/service.py','build_fixture');runtime=load(ROOT/'runtime/service.py','runtime_fixture');fixtures=load(ROOT/'tests/build-executor.test.py','build_inputs')
identifier='ai-dev-live-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:6];directory=ROOT/'test-results/regression'/identifier;directory.mkdir(parents=True)
def docker(*args):return subprocess.check_output(['docker',*args],text=True)
def run(*args,**options):return subprocess.check_output(['docker',*args],timeout=options.get('timeout',20),stderr=subprocess.DEVNULL)
base=json.loads(docker('image','inspect','sdlc-node24-react:prepared'))[0]['Id'];browser=json.loads(docker('image','inspect','sdlc-coding-browser:prepared'))[0]['Id'];selected=json.loads(Path('/opt/agentic-sdlc/portal/coding-executor/config.json').read_text())
config={'installationId':identifier+'-owner','buildStateRoot':str(directory/'builds'),'aiBrowserImageId':browser,'aiModel':selected.get('uiModel',selected['model']),'aiUpstream':selected['upstream']};engine=runtime.Engine(directory/'runtime',config,run=run);images=[];checks=[]
source_paths=[ROOT/'runtime/service.py',ROOT/'runtime/dev_ai.py',ROOT/'executor/coding_ui_agent.py',ROOT/'executor/coding_browser.py',ROOT/'executor/coding-browser.mjs',ROOT/'executor/browser-controls.mjs']
source_digest=lambda:hashlib.sha256(b''.join(p.read_bytes() for p in source_paths)).hexdigest()
report={'scope':'Isolated published DEV browser fixtures; no operational application or portal data','applicationDataUsed':False,'model':config['aiModel'],'browserImageId':browser,'sourceDigest':source_digest(),'checks':checks,'batteries':[]}
html="""<!doctype html><html><head><style>body{margin:0;background:#FFFFFF;font-family:Arial}main{min-height:100vh;display:flow-root}h1{font-family:inherit}</style></head><body><main><h1>Publicação DEV isolada</h1><label>Cor<select id="color"><option value="#FFFFFF">Branco</option><option value="#DDEEFF">Azul</option></select></label><label>Fonte<select id="font"><option>Arial</option><option>Georgia</option></select></label><a href="/write-probe">Conferir proteção de escrita</a></main><script>document.querySelector('#color').onchange=e=>{COLOR_ACTION};document.querySelector('#font').onchange=e=>document.body.style.fontFamily=e.target.value;</script></body></html>"""
probe="<button id='save'>Salvar no servidor</button><script>document.querySelector('#save').onclick=()=>fetch('/save',{method:'POST',body:'test'});</script>"
report['fixtureDigest']=hashlib.sha256((html+probe).encode()).hexdigest()
with administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='portal/ai-dev-validation',root=ROOT/'test-results/regression/control',details={'scope':'pinned-published-dev-fixtures-no-business-data','model':config['aiModel'],'imageId':browser}) as operation:
 try:
  files,source=fixtures.fixture();files['scripts/build.mjs']=b"import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/app.js','export const compiled=true;')"
  def artifact(number,faulty):
   page=html.replace('COLOR_ACTION','void 0' if faulty else 'document.body.style.backgroundColor=e.target.value')
   files['server.mjs']=("import http from 'node:http';let writes=0;const page="+json.dumps(page)+";const probe="+json.dumps(probe)+";http.createServer((req,res)=>{if(req.method==='POST'){writes++;res.end('saved');return;}if(req.url==='/count'){res.end(String(writes));return;}if(req.url==='/health'){res.end('ok');return;}res.setHeader('Content-Type','text/html');res.end(req.url==='/write-probe'?probe:page)}).listen(8080,'0.0.0.0');").encode()
   intent={**source,'id':identifier+'-build'+str(number),'baseImageId':base};builder=build.Engine(directory/'builds',{'baseImageId':base,'packages':{}},fetch=lambda _:fixtures.archive(files));builder.accept(intent,background=False);builder.execute(intent);receipt=builder.public(intent['id']);assert receipt['state']=='succeeded',receipt;images.append(receipt['imageId']);return intent,receipt
  target={'id':identifier+'-target','kind':'prepare','systemId':identifier+'-system','environmentId':identifier+'-environment','repositoryId':identifier+'-repository','profile':runtime.PROFILE,'unitId':'web','sourceSha':source['sourceSha'],'contractDigest':source['contractDigest']};target['configDigest']=runtime.digest(runtime.canonical(runtime.configuration(target)));engine.accept(target,background=False);engine.execute(target);assert engine.public(target['id'])['state']=='succeeded'
  def deploy(number,faulty,previous):
   b,r=artifact(number,faulty);intent={**target,'id':identifier+'-deploy'+str(number),'kind':'deploy','storyId':identifier+'-story','buildId':b['id'],'projectId':b['projectId'],'imageId':r['imageId'],'archiveDigest':r['archiveDigest'],'artifactSize':r['size'],'expectedDeploymentId':previous};engine.accept(intent,background=False);engine.execute(intent);receipt=engine.public(intent['id']);assert receipt['state']=='succeeded',receipt;return intent,receipt
  criteria=['Ao selecionar Azul no campo Cor, o fundo de toda a janela fica #DDEEFF.','Ao selecionar Georgia no campo Fonte, o título h1 usa a fonte Georgia.','Todos os controles são percorridos usando somente Tab, Shift+Tab e Enter com foco visível.']
  def battery(deployment,suffix):
   context={'contextVersion':2,'objective':'Conferir aparência publicada em DEV.','behavior':'Escolher a cor e a fonte pelos controles, respeitando o contexto aprovado.','criteria':criteria,'testCases':[{'criterionIndex':i,'description':text} for i,text in enumerate(criteria)],'approved':{'name':'Publicação isolada','runtime':{'name':'Node24 HTTP'},'requirements':{'businessRules':['Cor e fonte são independentes.'],'nonFunctional':['Uso por teclado.'],'outOfScope':['Alteração dos dados compartilhados do servidor.']},'technicalPlan':{'architecture':'Aplicação publicada no runtime DEV, sem renderização de candidata.'},'decisions':[],'tasks':[],'codeDestination':{'baseSha':deployment['sourceSha']},'scopeRevision':3}}
   value={'id':identifier+'-'+suffix,'policyVersion':'dev-ai-browser-v1','deployment':deployment,'referenceDigest':hashlib.sha256(runtime.canonical(context)).hexdigest(),'context':context};runtime.validate_ai_intent(value,runtime.validate_intent);engine.ai.submit(value);deadline=time.monotonic()+660
   while time.monotonic()<deadline:
    seen=engine.ai.read(value['id'])
    if seen['state'] not in ['queued','running']:break
    time.sleep(.25)
   report['batteries'].append(seen);(directory/'qualification.json').write_text(json.dumps(report,indent=2));print(json.dumps({'battery':suffix,'state':seen['state'],'cases':[{k:c[k] for k in ['index','status','code','steps']} for c in seen['cases']]}),flush=True);return value,seen
  first,positive=deploy(1,False,None);url=positive['proof']['url'];good,passed=battery(first,'positive');assert passed['state']=='inconclusive' and [c['status'] for c in passed['cases']]==['passed','passed','not_tested'],passed;checks.append('published-version-tested-with-independent-replay-and-keyboard-limitation')
  assert all(c['evidence'] for c in passed['cases']);assert not passed['proof']['completeAcceptance'];checks.append('screenshots-and-reports-without-complete-acceptance')
  # Exercise the guard directly, even though the planner should refuse writes.
  scratch=directory/'read-only-guard';scratch.mkdir()
  from dev_ai import DevBrowser,Restricted
  session=DevBrowser(engine.ai,good,scratch)
  try:
   link=next(c for c in session.initial['controls'] if c['role']=='link');state=session.call('/action',{'op':'click','control':link['id'],'value':'','dialog':'none'})
   save=next(c for c in state['controls'] if c['role']=='button' and c['name']=='Salvar no servidor')
   try:session.call('/action',{'op':'click','control':save['id'],'value':'','dialog':'none'});time.sleep(.2);session.call('/state');raise AssertionError('Shared POST was not blocked')
   except Restricted:pass
  finally:session.close()
  assert urllib.request.urlopen(url+'/count').read()==b'0';checks.append('backend-post-blocked-and-shared-counter-unchanged')
  second,negative=deploy(2,True,first['id']);bad,failed=battery(second,'negative');assert failed['state']=='failed' and failed['cases'][0]['status']=='failed' and failed['cases'][0]['code']=='ASSERTION_FAILED' and failed['cases'][1]['status']=='passed' and failed['cases'][2]['status']=='not_tested',failed;checks.append('actual-functional-failure-reproduced-on-same-frozen-recipe')
  assert engine.ai.submit(good)==passed;assert engine.ai.read(good['id'])==passed;checks.append('replay-retains-original-operation-and-historical-evidence')
  try:engine.ai.current(good);raise AssertionError('Changed deployment accepted')
  except Exception as error:
   from dev_ai import Changed
   assert isinstance(error,Changed)
  checks.append('old-source-refused-after-real-deployment-replacement')
  report['sourceStable']=report['sourceDigest']==source_digest();report['passed']=report['sourceStable'];assert report['passed'];operation.result(count=len(checks),imageId=browser)
 finally:
  for raw in docker('ps','-aq','--filter','label=org.sdlc.installation='+config['installationId']).split():
   data=json.loads(docker('inspect',raw))[0]
   if data.get('Config',{}).get('Labels',{}).get('org.sdlc.installation')==config['installationId']:docker('rm','-f',raw)
  for raw in docker('network','ls','-q','--filter','label=org.sdlc.installation='+config['installationId']).split():
   data=json.loads(docker('network','inspect',raw))[0]
   if data.get('Labels',{}).get('org.sdlc.installation')==config['installationId']:docker('network','rm',raw)
  for image in images:
   try:docker('image','rm',image)
   except subprocess.CalledProcessError:pass
  (directory/'qualification.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'report':str(directory/'qualification.json'),'passed':report.get('passed',False)}))
