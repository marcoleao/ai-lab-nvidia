"""Opt-in real Qwen/model qualification on isolated synthetic code, never pilot data."""
from pathlib import Path
import argparse,hashlib,http.client,importlib.util,json,os,shutil,socket,subprocess,sys,tempfile,threading,time,uuid
ROOT=Path(__file__).resolve().parents[1]
def executor_digest():return hashlib.sha256(b''.join((ROOT/'executor'/name).read_bytes() for name in ['coding_service.py','coding_browser.py','coding-browser.mjs','coding_workflow.py','coding_ui_agent.py','browser-controls.mjs','coding_micro.py'])).hexdigest()
def toolchain_digest():return hashlib.sha256(b''.join((ROOT.parents[1]/'lab/qwen-code'/name).read_bytes() for name in ['Dockerfile','package.json','package-lock.json','workspace.mjs','runner.mjs','ui-probes.mjs','patch.mjs'])).hexdigest()
sys.path.insert(0,str(ROOT.parent/'scripts'))
sys.path.insert(0,str(ROOT/'executor'))
from audit_admin import administrative_operation
from coding_browser import LiveBrowser
spec=importlib.util.spec_from_file_location('coding',ROOT/'executor/coding_service.py');coding=importlib.util.module_from_spec(spec);spec.loader.exec_module(coding)
class Client(http.client.HTTPConnection):
 def __init__(self,target):super().__init__('localhost',timeout=8);self.target=target
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(self.timeout);self.sock.connect(self.target)
def call(target,path,body=None):
 connection=Client(target);connection.request('POST' if body else 'GET',path,body=json.dumps(body) if body else None,headers={'Content-Type':'application/json'});response=connection.getresponse();value=json.load(response);connection.close()
 if response.status!=200:raise RuntimeError('Executor status '+str(response.status)+': '+json.dumps(value))
 return value
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--model',required=True);parser.add_argument('--ui-model');parser.add_argument('--image',default='sdlc-qwen-code:prepared');parser.add_argument('--thinking',action='store_true');parser.add_argument('--micro-thinking',action='store_true');parser.add_argument('--implementation',choices=['sdk','micro-json-v1'],default='micro-json-v1');parser.add_argument('--workflow',choices=['legacy','focused-local-v1'],default='focused-local-v1');parser.add_argument('--fixture',action='append',choices=['literal-edit','react-provider','ui-price','ui-prerequisites','line-edit-context','ui-url-regex','ui-dialog-copy','ui-native-required']);args=parser.parse_args()
 if args.thinking and args.implementation=='micro-json-v1':parser.error('Micro JSON specialists have a fixed per-role reasoning policy')
 if args.workflow=='legacy' and args.implementation!='sdk':parser.error('Legacy workflow requires --implementation sdk')
 relay=json.loads(Path('/opt/agentic-sdlc/portal/llm-relay/config.json').read_text());image=json.loads(subprocess.check_output(['docker','image','inspect',args.image],text=True))[0]['Id']
 identifier='coding-live-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+uuid.uuid4().hex[:6];directory=ROOT/'test-results/regression'/identifier;directory.mkdir(parents=True)
 control=ROOT/'test-results/regression/control';control.mkdir(parents=True,exist_ok=True)
 report={'model':args.model,'thinking':args.thinking,'workflow':args.workflow,'implementationMode':args.implementation,'imageId':image,'executorDigest':executor_digest(),'toolchainDigest':toolchain_digest(),'completeSuite':not args.fixture,'applicationDataUsed':False,'productionConfigurationChanged':False,'scope':'Synthetic iterative coding qualification, not business UI acceptance','fixtures':[]}
 for name in ['workspace.mjs','runner.mjs','ui-probes.mjs','patch.mjs']:
  actual=subprocess.check_output(['docker','run','--rm','--pull','never','--network','none','--entrypoint','cat',image,'/opt/qwen-code/'+name],text=True)
  if actual!=(ROOT.parents[1]/'lab/qwen-code'/name).read_text():raise RuntimeError('Prepared toolchain source differs; prepare before qualifying')
 fixtures=[
  ('literal-edit',[{'path':'calc.js','content':'export const sum=(a,b)=>a-b;\nexport const multiply=(a,b)=>a*b;\n'}],'Corrija somente sum para somar os argumentos; preserve multiply. Leia, edite e valide antes de terminar.'),
  ('react-provider',[{'path':'src/store.jsx','content':"import React,{createContext,useContext} from 'react';const Context=createContext(null);export function StoreProvider({children}){return <Context.Provider value={{title:'Catálogo'}}>{children}</Context.Provider>;}export function useStore(){const value=useContext(Context);if(!value)throw Error('Provider obrigatório');return value;}\n"},{'path':'src/App.jsx','content':"import {useStore} from './store.jsx';export default function App(){const {title}=useStore();return <h1>{title}</h1>;}\n"},{'path':'src/main.jsx','content':"import React from 'react';import{createRoot}from'react-dom/client';import App from './App.jsx';createRoot(document.getElementById('root')).render(<App/>);\n"}],'A tela quebra com Provider obrigatório. Corrija o ponto de entrada para que App esteja dentro de StoreProvider. Preserve componentes e comportamento. Confira os contratos entre os três arquivos e valide.')]
 fixtures.append(('ui-price',[{'path':'src/main.jsx','content':"import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [price,setPrice]=useState(null);return <main><button onClick={()=>setPrice(0)}>Criar</button>{price!==null&&<p>R$ {price.toFixed(2)}</p>}</main>}createRoot(document.getElementById('root')).render(<App/>);"}],'Corrija somente a apresentação do preço zero para R$ 0,00, preservando o botão e a interação. Use validate_candidate com steps [{op:"click",name:"Criar"},{op:"expect_text",value:"R$ 0,00"}] para conferir o resultado em navegador. Não declare execução antes do retorno. Não altere dependências.'))
 fixtures.append(('ui-prerequisites',[{'path':'src/main.jsx','content':"import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [draft,setDraft]=useState(''),[categories,setCategories]=useState([]),[category,setCategory]=useState(''),[price,setPrice]=useState('0'),[saved,setSaved]=useState(null);return <main><h1>Formulário sintético</h1><h2>Categorias</h2><input value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>{setCategories([...categories,draft]);setDraft('')}}>Adicionar Categoria</button><label>Categoria:<select value={category} onChange={e=>setCategory(e.target.value)}><option value=''>Selecione</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Preço (BRL):<input type='number' value={price} onChange={e=>setPrice(e.target.value)}/></label><button onClick={()=>{if(category)setSaved(Number(price))}}>Cadastrar</button>{saved!==null&&<p>R$ {saved.toFixed(2)}</p>}<aside><h2>Filtros</h2><label>Categoria:<select><option>Todas</option></select></label></aside></main>}createRoot(document.getElementById('root')).render(<App/>);"}],'Corrija somente a formatação do preço zero para R$ 0,00. Preserve os controles e a exigência de categoria. Planeje e execute a sonda de UI para criar a categoria antes de selecioná-la e cadastrar o preço zero. Use os rótulos realmente observados e uma asserção do preço exibido. O campo sem nome pode ser preenchido com fill/name vazio/index 0; não injete armazenamento nem dados por código. Não altere dependências.'))
 large=''.join(f'export const preserved_marker_{index} = {index};\n' for index in range(340))+'export const formatAmount = amount => Number(amount).toFixed(2);\n'
 fixtures.append(('line-edit-context',[{'path':'src/prices.js','content':large},{'path':'src/main.jsx','content':"import React,{useState} from 'react';\nimport{createRoot}from'react-dom/client';\nimport{formatAmount}from'./prices.js';\nfunction App(){const [value,setValue]=useState(null);return <main><button onClick={()=>setValue(0)}>Criar</button>{value!==null&&<p>R$ {formatAmount(value)}</p>}</main>}\ncreateRoot(document.getElementById('root')).render(<App/>);\n"}],'Confira o ponto de entrada e o formatador. Corrija somente a linha da função formatAmount em src/prices.js: após Criar, zero deve aparecer como R$ 0,00, com duas casas decimais. Preserve todas as outras linhas, as constantes e src/main.jsx. Use as linhas e revisão fornecidas pela leitura; não reescreva o arquivo inteiro. Outro perfil testará o formulário.'))
 url_prefix="import React,{useState} from 'react';import{createRoot}from'react-dom/client';\nconst allowedUrl = "
 url_regex=r'/^https:\/\/images\.example\.test\/[a-z]+\.jpg$/i'
 url_suffix=";\nfunction App(){const [url,setUrl]=useState(''),[accepted,setAccepted]=useState(false),[bad,setBad]=useState(false);return <main><label>URL:<input value={url} onChange={e=>setUrl(e.target.value)}/></label><button onClick={()=>{const ok=allowedUrl.test(url);setAccepted(ok);setBad(!ok)}}>Validar URL</button>{accepted&&<p>URL aceita</p>}{bad&&<p>URL inválida</p>}</main>}createRoot(document.getElementById('root')).render(<App/>);"
 fixtures.append(('ui-url-regex',[{'path':'src/main.jsx','content':url_prefix+url_regex+url_suffix}],'Corrija somente o literal de expressão regular allowedUrl para aceitar URLs HTTP e HTTPS de qualquer host, inclusive caminho .svg, preservando flags, formulário, handlers e rejeição de javascript:. Não altere qualquer outro trecho ou dependência.'))
 dialog_prefix="import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const [notice,setNotice]=useState('');const alert=text=>setNotice(text);return <main><button onClick={()=>"
 dialog_call="alert('Somente HTTPS; arquivos PNG.')"
 dialog_suffix="}>Ver regras</button><p>{notice}</p></main>}createRoot(document.getElementById('root')).render(<App/>);"
 fixtures.append(('ui-dialog-copy',[{'path':'src/main.jsx','content':dialog_prefix+dialog_call+dialog_suffix}],'Altere somente o texto literal da chamada alert no botão Ver regras para HTTP e HTTPS, incluindo SVG. Preserve chamada, funções, handlers e estrutura. Neste formulário sintético a função alert exibe o aviso na própria tela. Não altere qualquer outro trecho.'))
 fixtures.append(('ui-native-required',[{'path':'src/main.jsx','content':"import React,{useState} from 'react';import{createRoot}from'react-dom/client';function App(){const[sku,setSku]=useState(''),[name,setName]=useState(''),[price,setPrice]=useState('0'),[saved,setSaved]=useState(null);return <main><form onSubmit={e=>{e.preventDefault();setSaved({sku,name,price:Number(price)})}}><h2>Cadastro</h2><label>SKU:<input required value={sku} onChange={e=>setSku(e.target.value)}/></label><label>Nome:<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Preço:<input type='number' required value={price} onChange={e=>setPrice(e.target.value)}/></label><button>Cadastrar</button></form>{saved&&<><p>R$ {saved.price.toFixed(2)}</p><p>Registrado: {saved.sku} {saved.name}</p></>}</main>}createRoot(document.getElementById('root')).render(<App/>);"}],'Corrija somente a apresentação do preço zero cadastrado para R$ 0,00. Preserve o formulário, a validação nativa de SKU e Nome obrigatórios, os handlers e a precisão. Não preencha os dados pelo código da aplicação e não remova required; outro perfil criará dados sintéticos pela interface.'))
 # Same form/rules/defect as the original compressed fixture, now with readable
 # source lines for the focused line editor. ui-price retains a compact source.
 for label,files,_ in fixtures:
  if label=='ui-prerequisites':files[0]['content']=files[0]['content'].replace(";import",";\nimport").replace('function App(){','\nfunction App(){\n').replace('return <main>','\nreturn <main>\n').replace('<h2>Categorias</h2>','<h2>Categorias</h2>\n').replace('<input value={draft}','\n<input value={draft}').replace('<button onClick','\n<button onClick').replace('<label>','\n<label>').replace('{saved!==null','\n{saved!==null').replace('<aside>','\n<aside>').replace('</main>}','\n</main>}\n')
 if args.fixture:fixtures=[f for f in fixtures if f[0] in args.fixture]
 with tempfile.TemporaryDirectory(prefix='sdlc-coding-live-') as temporary,administrative_operation('PORTAL_REGRESSION_PROVIDER_VALIDATION',source='provider-validation',root=control,details={'scope':'qwen-code-synthetic-iterative-qualification','model':args.model,'imageId':image,'count':len(fixtures)}) as operation:
  base=Path(temporary);base.chmod(0o711);(base/'state').mkdir(mode=0o700)
  browser=json.loads(subprocess.check_output(['docker','image','inspect','sdlc-coding-browser:prepared'],text=True))[0]['Id']
  config={'stateRoot':str(base/'state'),'socketPath':str(base/'executor.sock'),'inferenceSocket':str(base/'inference.sock'),'imageId':image,'browserImageId':browser,'model':args.model,'thinking':args.thinking,'microThinking':args.micro_thinking,'upstream':relay['upstream'],'workflow':args.workflow,'implementationMode':args.implementation}
  report['reasoningPolicy']={'code':config['microThinking'],'ui':False} if args.implementation=='micro-json-v1' else {'sdk':args.thinking}
  if args.ui_model:config['uiModel']=args.ui_model
  report['uiModel']=args.ui_model or args.model
  threading.Thread(target=coding.serve,args=(config,),daemon=True).start()
  for _ in range(50):
   if (base/'executor.sock').exists() and (base/'inference.sock').exists():break
   time.sleep(.05)
  for label,files,prompt in fixtures:
   if args.workflow=='focused-local-v1' and label=='ui-price':prompt='Altere somente a formatação do preço exibido após clicar Criar: zero precisa aparecer como R$ 0,00 em vez de R$ 0.00. Leia o arquivo, edite a apresentação preservando a interação e valide a sintaxe. Outro perfil fará o teste de interface. Não altere dependências.'
   if args.workflow=='focused-local-v1' and label=='ui-prerequisites':prompt='Altere somente a expressão que apresenta o preço do item já cadastrado: zero precisa aparecer exatamente como R$ 0,00, com duas casas decimais. Os cadastros e seleções já funcionam. Preserve integralmente os handlers, a criação de categorias, a seleção obrigatória e os filtros. Não crie categoria automaticamente e não facilite o cadastro removendo a exigência. Outro perfil criará os dados e testará a interface; sua entrega é somente a pequena alteração da apresentação e sintaxe válida. Não altere dependências.'
   started=time.monotonic();id=hashlib.sha256((identifier+label).encode()).hexdigest();intent={'id':id,'expectedSha':'a'*40,'files':files,'prompt':prompt,'allowDependencies':False}
   if label=='react-provider':intent['testContext']={'objective':'Conferir abertura com o Provider','behavior':'Abrir a tela e conferir o título Catálogo, sem o erro Provider obrigatório.','criteria':['O título Catálogo é exibido.'],'testCases':[{'criterionIndex':0,'description':'Conferir o texto Catálogo na tela após corrigir o Provider.'}]}
   if label=='ui-url-regex':intent['testContext']={'objective':'Validar protocolos de URL pela interface','behavior':'Preencher URL com http://example.test/item.svg e clicar Validar URL. Conferir o texto URL aceita. Este formulário apenas valida texto; não carrega imagem.','criteria':['HTTP e HTTPS com caminho .svg mostram URL aceita após Validar URL.','javascript: é recusado com URL inválida.'],'testCases':[{'criterionIndex':0,'description':'Preencher URL com http://example.test/item.svg, clicar Validar URL e conferir URL aceita.'},{'criterionIndex':1,'description':'Preencher javascript:alert(1), validar e conferir URL inválida.'}]}
   if label=='ui-dialog-copy':intent['testContext']={'objective':'Atualizar o texto de um aviso','behavior':'Clicar Ver regras e conferir o texto HTTP e HTTPS, incluindo SVG. O aviso aparece na própria tela.','criteria':['Após Ver regras, o aviso contém HTTP e HTTPS, incluindo SVG.'],'testCases':[{'criterionIndex':0,'description':'Clicar Ver regras e conferir HTTP e HTTPS, incluindo SVG.'}]}
   if label in ['ui-price','ui-prerequisites','line-edit-context','ui-native-required']:intent['testContext']={'objective':'Conferir preço zero após cadastro','behavior':'Criar uma categoria, selecioná-la no cadastro, cadastrar preço zero e conferir o texto do resultado.' if label=='ui-prerequisites' else 'Preencher SKU e Nome obrigatórios pela interface, cadastrar preço zero e conferir o texto do resultado.' if label=='ui-native-required' else 'Clicar Criar e conferir o texto do resultado.','criteria':['O resultado exibe R$ 0,00.'],'testCases':[{'criterionIndex':0,'description':'Conferir a apresentação de zero após realizar o cadastro pela interface.'}]}
   value=call(config['socketPath'],'/jobs/'+id,intent)
   deadline=time.monotonic()+(645 if args.workflow=='focused-local-v1' else 345)
   while value['state'] in ['queued','running'] and time.monotonic()<deadline:time.sleep(.5);value=call(config['socketPath'],'/jobs/'+id)
   (directory/(label+'-private.json')).write_text(json.dumps(value,indent=2));row={'fixture':label,'fixtureDigest':hashlib.sha256(json.dumps({'files':files,'prompt':prompt,'testContext':intent.get('testContext')},sort_keys=True).encode()).hexdigest(),'state':value['state'],'elapsedMs':round((time.monotonic()-started)*1000),'inferenceCalls':value.get('inferenceCalls'),'toolCalls':len(value.get('tools',[])),'validationPassed':value.get('validation',{}).get('valid') is True,'passed':False}
   # Keep only diagnostic/recipe files; never SDK credentials or configuration.
   private=directory/(label+'-evidence');private.mkdir(mode=0o700)
   job=base/'state'/id
   for name in ['interruption-private.json','ui-scenario.json','ui-prerequisites.json','ui-prerequisite-bindings.json','ui-recorded-steps.json','browser-baseline.json','browser-implementation.json','browser-final.json',*[p.name for pattern in ['ui-action-*.json','inference-*.json','local-inference-*.json','candidate-*-private.json','micro-*-plan*.json','micro-*-location.json','micro-*-role.json','micro-*-selection.json','micro-*-proposal-*.json','micro-*-validation-*.json'] for p in job.glob(pattern)]]:
    source=job/name
    if source.is_file() and not source.is_symlink():shutil.copyfile(source,private/name);(private/name).chmod(0o600)
   patched={f['path']:f['content'] for f in value.get('patch',{}).get('files',[])}
   if label=='literal-edit':
    result=''.join(patched.get('calc.js','').split());row['passed']=value['state']=='succeeded' and '=>a+b;' in result and 'multiply=(a,b)=>a*b;' in result
   elif label=='react-provider':
    source=patched.get('src/main.jsx','');row['passed']=value['state']=='succeeded' and '<StoreProvider>' in source and '</StoreProvider>' in source and 'import' in source and './store.jsx' in source
   if label in ['ui-price','ui-prerequisites','line-edit-context','ui-native-required']:row['passed']=value['state']=='succeeded' and any(p.get('passed') and p.get('uiProbe',{}).get('assertions',0)>0 and p.get('uiProbe',{}).get('executed',0)>=2 for p in value.get('browserChecks',[]));row['uiProbe']=value.get('browserChecks',[])[-1].get('uiProbe') if value.get('browserChecks') else None
   if label in ['ui-price','ui-prerequisites','line-edit-context','ui-native-required'] and row['passed']:
    final=value['browserChecks'][-1];row['exactPriceConfirmed']=any(' '.join(line.strip().split())=='- paragraph: R$ 0,00' for line in final.get('observedUI','').splitlines());row['passed']=row['passed'] and row['exactPriceConfirmed']
   if label=='line-edit-context':
    row['unrelatedSourcePreserved']=set(patched)=={'src/prices.js'} and patched.get('src/prices.js','').splitlines()[:340]==large.splitlines()[:340] and len(patched.get('src/prices.js','').splitlines())==341
    row['passed']=row['passed'] and row['unrelatedSourcePreserved']
   if label=='ui-url-regex':
    changed=patched.get('src/main.jsx','');row['validatorOnlyChanged']=set(patched)=={'src/main.jsx'} and changed.startswith(url_prefix) and changed.endswith(url_suffix) and changed!=url_prefix+url_regex+url_suffix
    row['passed']=value['state']=='succeeded' and row['validatorOnlyChanged']
    if row['passed']:
     guard=base/'url-protocol-check';guard.mkdir(mode=0o711);merged={f['path']:f['content'] for f in files};merged.update(patched);session=LiveBrowser(config,id+'url',[{'path':p,'content':c} for p,c in merged.items()],guard);checks=[]
     try:
      controls=session.initial['controls'];field=next(c for c in controls if c['role']=='textbox' and c['name']=='URL:');button=next(c for c in controls if c['role']=='button' and c['name']=='Validar URL')
      for url,expected in [('http://example.test/item.svg','URL aceita'),('https://another.test/item.svg?size=2','URL aceita'),('javascript:alert(1)','URL inválida')]:
       filled=session.call('/action',{'op':'fill','control':field['id'],'value':url,'dialog':'none'});clicked=session.call('/action',{'op':'click','control':button['id'],'value':'','dialog':'none'});observed=session.call('/action',{'op':'expect_text','control':'','value':expected,'dialog':'none'});checks.append({'value':url,'expected':expected,'passed':all(r.get('actionPassed') and r.get('rendered') for r in [filled,clicked,observed]),'observation':observed})
      row['protocolChecksPassed']=all(c['passed'] for c in checks);row['passed']=row['passed'] and row['protocolChecksPassed'];(private/'url-protocol-checks.json').write_text(json.dumps(checks));(private/'url-protocol-checks.json').chmod(0o600)
     finally:session.close()
   if label=='ui-dialog-copy':
    changed=patched.get('src/main.jsx','');middle=changed[len(dialog_prefix):-len(dialog_suffix)] if changed.startswith(dialog_prefix) and changed.endswith(dialog_suffix) else ''
    row['dialogOnlyChanged']=set(patched)=={'src/main.jsx'} and middle.startswith('alert(') and middle.endswith(')') and middle!=dialog_call
    row['textDataUsed']=any(any('text' in edit for edit in json.loads(path.read_text()).get('proposal',{}).get('edits',[])) for path in private.glob('micro-*-proposal-*.json'))
    final=value.get('browserChecks',[])[-1] if value.get('browserChecks') else {};row['passed']=value['state']=='succeeded' and row['dialogOnlyChanged'] and row['textDataUsed'] and final.get('passed') is True and final.get('uiProbe',{}).get('assertions',0)>0
   if label in ['ui-prerequisites','ui-native-required'] and row['passed']:
    # Independent UI check: formatting cannot bypass the mandatory selection.
    guard=base/(label+'-empty-check');guard.mkdir(mode=0o711)
    merged={file['path']:file['content'] for file in files};merged.update(patched)
    session=LiveBrowser(config,id+'guard',[{'path':path,'content':content} for path,content in merged.items()],guard)
    try:
     button=next((c for c in session.initial.get('controls',[]) if c['role']=='button' and c['name']=='Cadastrar'),None)
     observed=session.call('/action',{'op':'click','control':button['id'],'value':'','dialog':'none'}) if button else {}
     key='emptyCategoryBlocked' if label=='ui-prerequisites' else 'emptyRequiredBlocked'
     row[key]=bool(observed.get('actionPassed') and observed.get('rendered') and not observed.get('errors') and 'R$ 0,00' not in ' '.join(observed.get('observedUI','').split()))
     (private/'empty-category-check.json').write_text(json.dumps(observed));(private/'empty-category-check.json').chmod(0o600);row['passed']=row['passed'] and row[key]
    finally:session.close()
   if value.get('error'):row['error']=value['error'][:1500]
   row['diagnostics']=value.get('diagnostics',[])
   report['fixtures'].append(row);(directory/'qualification.json').write_text(json.dumps(report,indent=2));print(json.dumps(row),flush=True)
  report['sourceStable']=report['executorDigest']==executor_digest() and report['toolchainDigest']==toolchain_digest();(directory/'qualification.json').write_text(json.dumps(report,indent=2))
  operation.result('SUCCEEDED' if report['sourceStable'] and all(r['passed'] for r in report['fixtures']) else 'FAILED',count=sum(r['passed'] for r in report['fixtures']))
 print(json.dumps({'report':str(directory/'qualification.json'),'passed':all(r['passed'] for r in report['fixtures'])}))
 if not report['sourceStable'] or not all(r['passed'] for r in report['fixtures']):raise SystemExit(1)
if __name__=='__main__':main()
