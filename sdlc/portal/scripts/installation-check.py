"""Read-only installation checks. No inference, downloads, business data or resets."""
from pathlib import Path
import argparse,hashlib,ipaddress,json,os,re,subprocess,sys,urllib.request

ROOT=Path(__file__).resolve().parents[1]
RUNTIME=Path('/opt/agentic-sdlc/portal')
REQUIRED_IMAGES={
 'sdlc-portal:prepared':None,
 'sdlc-security-scanner:prepared':None,
 'sdlc-node24-react:prepared':('org.sdlc.toolchain','node24-react-v1'),
 'sdlc-qwen-code:prepared':('org.sdlc.qwen-code-version','0.26.4'),
 'sdlc-coding-browser:prepared':('org.sdlc.coding-browser','react-entry-v1'),
}
REQUIRED_INTEGRATIONS={'gitlab','llm','coding','executor','runtime','security'}
SERVICES=['sdlc-llm-relay','sdlc-build-executor','sdlc-runtime-executor','sdlc-coding-executor']
CODING_SOURCES=['coding_service.py','coding_browser.py','coding-browser.mjs','coding_workflow.py','coding_ui_agent.py','browser-controls.mjs','coding_micro.py']

class Missing(RuntimeError):pass

def run(*arguments):
 result=subprocess.run(list(map(str,arguments)),text=True,capture_output=True)
 if result.returncode:raise Missing('Comando de verificacao falhou: '+str(arguments[0])+'. Consulte o doctor ou os logs do componente.')
 return result.stdout.strip()

def regular(path):
 if not path.is_file() or path.is_symlink() or path.resolve()!=path.absolute():raise Missing('Arquivo de instalacao ausente ou vinculado: '+str(path))
 return path

def read(path):return json.loads(regular(path).read_text())

def upstream():
 source=(ROOT.parents[1]/'lab/config/lab.yaml').read_text()
 match=re.search(r'^ollama_address:\s*([0-9.]+)\s*$',source,re.MULTILINE)
 if not match:raise Missing('Endereco do Ollama ausente em lab/config/lab.yaml.')
 try:address=ipaddress.ip_address(match[1])
 except ValueError:raise Missing('Endereco privado do Ollama invalido.') from None
 if not address.is_private:raise Missing('Ollama precisa usar o endereco privado declarado do LAB.')
 return 'http://'+match[1]+':11434'

def get(url):
 try:
  with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url,timeout=30) as response:return json.load(response)
 except Exception:raise Missing('Servico nao confirmou a consulta: '+url.split('?',1)[0]) from None

def models(general,coding):
 installed={value['name'] for value in get(upstream()+'/api/tags').get('models',[])}
 missing=sorted({general,coding}-installed)
 if missing:raise Missing('Modelos locais ausentes: '+', '.join(missing)+'. Nenhum modelo foi baixado ou alterado.')
 # An installation command must not silently replace a working model selection.
 for path,wanted in [(RUNTIME/'llm-relay/config.json',general),(RUNTIME/'coding-executor/config.json',coding)]:
  if path.exists() and read(path).get('model')!=wanted:raise Missing('Selecao instalada difere do modelo solicitado em '+str(path)+'. Preserve a configuracao e confira os parametros.')

def sources():
 for name in ['prepared.py','runtime-role.py','connect-gitlab.py','connect-llm.py','build-executor.py','runtime-executor.py','coding-executor.py','llm-relay.py']:
  regular(ROOT/'scripts'/name)
 for path in ['compose.yaml','pnpm-lock.yaml','infra/Dockerfile','infra/Dockerfile.development-toolchain','infra/Dockerfile.coding-browser','runtime/service.py','executor/service.py',*['executor/'+name for name in CODING_SOURCES]]:regular(ROOT/path)
 for name in ['Dockerfile','package.json','package-lock.json','workspace.mjs','runner.mjs','ui-probes.mjs','patch.mjs']:regular(ROOT.parents[1]/'lab/qwen-code'/name)

def preflight(general,coding,check_idle=True):
 if os.geteuid()!=0 or not Path('/etc/agentic-sdlc-owner').is_file():raise Missing('Execute como administrador na distro SDLC preparada pelo bootstrap.')
 sources()
 for name,label in REQUIRED_IMAGES.items():
  try:value=json.loads(run('docker','image','inspect',name))[0]
  except Missing:raise Missing('Imagem preparada ausente: '+name+'. Execute .\\sdlc\\install.ps1 prepare.') from None
  if label and (value['Config'].get('Labels') or {}).get(label[0])!=label[1]:raise Missing('Imagem preparada nao corresponde ao perfil: '+name)
 run(sys.executable,ROOT/'scripts/prepared.py','verify')
 models(general,coding)
 if check_idle:idle(native_only=True)

def sql(query):return run('docker','exec','sdlc-portal-foundation-db-1','psql','-X','-U','sdlc','-d','portal','-At','-v','ON_ERROR_STOP=1','-c',query)

def idle(native_only=False):
 for directory in ['build-executor/state','coding-executor/state','runtime-executor/state/jobs']:
  for path in (RUNTIME/directory).glob('*/receipt.json'):
   if read(path).get('state') in ['queued','running']:raise Missing('Ha trabalho nativo em andamento. Aguarde antes de configurar os executores.')
 if native_only:return
 columns=sql("SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('state','status','leaseUntil') ORDER BY table_name,column_name;")
 tables={}
 for entry in columns.splitlines():
  table,column=entry.split('|')
  if not re.fullmatch('[A-Za-z][A-Za-z0-9_]*',table) or column not in ['state','status','leaseUntil']:raise Missing('Consulta de atividade nao reconhecida.')
  tables.setdefault(table,[]).append(column)
 for table,fields in tables.items():
  conditions=[f'"{column}"::text IN (\'queued\',\'running\')' for column in fields if column!='leaseUntil']
  if 'leaseUntil' in fields:conditions.append('"leaseUntil">CURRENT_TIMESTAMP')
  if int(sql(f'SELECT count(*) FROM "{table}" WHERE '+ ' OR '.join(conditions)+';')):raise Missing('Ha trabalho em andamento em '+table+'. Aguarde antes de configurar as integracoes.')

def integrations(value):
 checks={check.get('id'):check.get('status') for check in value.get('checks',[])}
 missing=sorted(name for name in REQUIRED_INTEGRATIONS if checks.get(name)!='ready')
 if missing:raise Missing('Integracoes necessarias a DEV sem confirmacao: '+', '.join(missing))
 return sorted(REQUIRED_INTEGRATIONS)

def doctor(general,coding):
 preflight(general,coding,check_idle=False)
 for name in SERVICES:
  try:active=run('systemctl','is-active',name+'.service')
  except Missing:active='inactive'
  if active!='active':raise Missing('Servico nao esta ativo: '+name+'. Confira journalctl -u '+name+'.service.')
 for name in ['integrations','llm','audit','build-executor','runtime-executor','coding-executor']:read(ROOT/'.prepared'/('compose.'+name+'.json'))
 build=read(RUNTIME/'build-executor/installation.json')
 runtime=read(RUNTIME/'runtime-executor/installation.json')
 coding_install=read(RUNTIME/'coding-executor/installation.json')
 expected=hashlib.sha256(b''.join((ROOT/'executor'/name).read_bytes() for name in CODING_SOURCES)).hexdigest()
 if build.get('sourceDigest')!=hashlib.sha256((ROOT/'executor/service.py').read_bytes()).hexdigest() or runtime.get('sourceDigest')!=hashlib.sha256((ROOT/'runtime/service.py').read_bytes()).hexdigest() or coding_install.get('sourceDigest')!=expected:raise Missing('Fonte instalada de executor difere do codigo; repita a preparacao e instalacao apos encerrar os trabalhos.')
 config=read(ROOT/'.prepared/compose.integrations.json')['services']['api']['environment']
 if not config.get('GITLAB_MERGE_TOKEN_FILE'):raise Missing('Credencial dedicada de merge nao configurada. Confira a inicializacao GitLab.')
 ready=integrations(get('http://127.0.0.1:3310/api/integrations/health'))
 return {'readyForManualDevTest':True,'integrations':ready,'inferenceExecuted':False,'scope':'Installation readiness only; business journey and clean installation acceptance remain manual.','optionalNotRequiredForDev':['external-oci-registry']}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['sources','preflight','idle','doctor']);parser.add_argument('--general-model',default='qwen3.5:9b');parser.add_argument('--coding-model',default='qwen3:14b');args=parser.parse_args()
 if args.command=='sources':sources();print('[OK] Fontes de instalacao presentes no repositorio.')
 elif args.command=='preflight':preflight(args.general_model,args.coding_model);print('[OK] Imagens, fontes e modelos existentes conferidos; sem inferencia ou download.')
 elif args.command=='idle':idle();print('[OK] Nenhum trabalho queued/running encontrado para reconfiguracao.')
 else:print(json.dumps(doctor(args.general_model,args.coding_model),ensure_ascii=False))

if __name__=='__main__':
 try:main()
 except Missing as error:raise SystemExit('[PENDENTE] '+str(error))
 except Exception:raise SystemExit('[PENDENTE] Verificacao nao concluida. Confira arquivos de preparacao e logs; nenhum segredo e exibido.')
