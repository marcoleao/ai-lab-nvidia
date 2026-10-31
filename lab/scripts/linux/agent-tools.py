"""Pinned coding tool preparation. Ordinary verification never builds or downloads."""
from pathlib import Path
import argparse,hashlib,json,os,subprocess,sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'lib'))
if not (ROOT/'lib/audit_admin.py').is_file():sys.path.insert(0,str(ROOT.parent/'sdlc/scripts'))
from audit_admin import administrative_operation

IMAGE='ai-local-lab/qwen-code:0.26.4'
VERSION='0.26.4'

def run(*args,capture=False):
 return subprocess.run(list(map(str,args)),check=True,text=True,stdout=subprocess.PIPE if capture else None,stderr=subprocess.PIPE if capture else None)

def image():return json.loads(run('docker','image','inspect',IMAGE,capture=True).stdout)[0]

def verify():
 value=image()
 if value['Config'].get('Labels',{}).get('org.sdlc.qwen-code-version')!=VERSION:raise RuntimeError('Prepare the pinned Qwen Code image')
 version=run('docker','run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:uid=1000,gid=1000,mode=0700',IMAGE,'--version',capture=True).stdout.strip()
 if version!=VERSION:raise RuntimeError('Installed Qwen Code version differs from the lock')
 print(json.dumps({'qwenCode':version,'imageId':value['Id'],'offlineVerified':True}));return value

def prepare():
 manifest=json.loads((ROOT/'qwen-code/package.json').read_text());lock=json.loads((ROOT/'qwen-code/package-lock.json').read_text())
 if manifest['dependencies']['@qwen-code/qwen-code']!=VERSION or lock['packages']['node_modules/@qwen-code/qwen-code']['version']!=VERSION:raise RuntimeError('Review the declared CLI version and lock together')
 source=hashlib.sha256(b''.join((ROOT/'qwen-code'/name).read_bytes() for name in ['Dockerfile','package.json','package-lock.json','workspace.mjs','runner.mjs','ui-probes.mjs','patch.mjs'])).hexdigest()
 with administrative_operation('LAB_AGENT_TOOLCHAIN_PREPARED',source='lab/agent-tools',root=ROOT,details={'scope':'pinned-headless-qwen-code-no-business-code','manifestDigest':source}) as operation:
  run('docker','compose','--project-name','ai-local-lab','--env-file',ROOT/'.env','--env-file',ROOT/'.runtime.env','-f',ROOT/'compose.yaml','--profile','agents','build','qwen-code')
  value=verify();operation.result(imageId=value['Id'])

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','verify']);args=parser.parse_args();prepare() if args.command=='prepare' else verify()
