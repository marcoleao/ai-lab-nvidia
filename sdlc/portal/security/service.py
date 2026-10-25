"""Offline, read-only static analysis. Never imports or executes submitted code."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import subprocess
import tempfile
import ast

RULES=Path('/scanner/rules.yaml')
RULE_DIGEST=hashlib.sha256(RULES.read_bytes()).hexdigest()

def scan(body):
    files=body.get('files')
    if not isinstance(files,list) or not 1<=len(files)<=100:raise ValueError('Conjunto de arquivos inválido.')
    with tempfile.TemporaryDirectory(prefix='sdlc-static-') as temporary:
        root=Path(temporary);seen=set();total=0
        for file in files:
            name=file['path'];content=file['content'];path=PurePosixPath(name)
            if not isinstance(content,str) or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or str(path)!=name or name.lower() in seen:raise ValueError('Caminho inválido ou duplicado.')
            seen.add(name.lower());total+=len(content.encode())
            if total>256000:raise ValueError('Limite de código excedido.')
            target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(content,encoding='utf-8')
            if target.suffix=='.py':
                try:ast.parse(content,filename=name)
                except SyntaxError:raise ValueError('Arquivo Python com erro de sintaxe; análise incompleta.')
        # Repository ignore files and nosemgrep annotations cannot suppress gates.
        command=['semgrep','scan','--config',str(RULES),'--json','--metrics=off','--disable-version-check','--no-git-ignore','--disable-nosem','--strict','--jobs','1','--timeout','10']+[str(root/f['path']) for f in files]
        result=subprocess.run(command,capture_output=True,text=True,timeout=90,env={**os.environ,'SEMGREP_SEND_METRICS':'off','SEMGREP_ENABLE_VERSION_CHECK':'0'})
        if len(result.stdout)>2000000:raise ValueError('Relatório excedeu o limite.')
        report=json.loads(result.stdout)
        if result.returncode!=0 or report.get('errors'):raise ValueError('O scanner encontrou erro ou análise incompleta. Nenhuma aprovação foi registrada.')
        scanned={str(Path(p).relative_to(root)) for p in report.get('paths',{}).get('scanned',[])}
        required={f['path'] for f in files if Path(f['path']).suffix in {'.js','.mjs','.cjs','.jsx','.ts','.tsx','.py'}}
        if not required or not required.issubset(scanned):raise ValueError('A cobertura SAST não inclui todos os arquivos de código suportados.')
        findings=[]
        for finding in report.get('results',[]):
            path=str(Path(finding['path']).relative_to(root));extra=finding['extra']
            findings.append({'path':path,'line':finding['start']['line'],'severity':{'ERROR':'HIGH','WARNING':'MEDIUM','INFO':'LOW'}.get(extra['severity'],'HIGH'),'message':extra['message'],'rule':finding['check_id']})
        return {'engine':'semgrep','version':report['version'],'rulesDigest':RULE_DIGEST,'findings':findings,'scannedFiles':sorted(scanned),'scope':'SAST e segredos; não inclui SCA, licenças, imagens ou DAST'}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,status,body):
        value=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(value)));self.end_headers();self.wfile.write(value)
    def do_GET(self):
        self.reply(200 if self.path=='/health' else 404,{'status':'ready','rulesDigest':RULE_DIGEST})
    def do_POST(self):
        if self.path!='/scan':return self.reply(404,{'error':'Rota indisponível.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 1<=length<=512000:raise ValueError('Limite de entrada excedido.')
            self.reply(200,scan(json.loads(self.rfile.read(length))))
        except (ValueError,KeyError,TypeError,subprocess.TimeoutExpired):self.reply(422,{'error':'Análise de segurança falhou ou ficou incompleta. Nenhuma aprovação foi registrada.'})
        except Exception:self.reply(500,{'error':'Scanner indisponível. Nenhuma aprovação foi registrada.'})

if __name__=='__main__':HTTPServer(('0.0.0.0',8080),Handler).serve_forever()
