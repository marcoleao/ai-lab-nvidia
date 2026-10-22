export function runtimeFiles(runtime:'node'|'python',name:string):Record<string,string> {
  const common = {
    'README.md':`# ${name.replace(/[\r\n]/g,' ')}\n\nProjeto criado pelo usuário no Portal SDLC. Nenhuma regra de negócio foi gerada.\n`,
    '.gitignore':'node_modules/\n__pycache__/\n.env\n',
    '.sdlc/contract.md':'# Contrato de runtime\nSem lógica de negócio. Escutar PORT. /health retorna 200; /version lê versão/commit imutáveis do build e APP_ENV/APP_COLOR do deploy. Mudanças devem incluir testes.\n',
    'smoke.yaml':'checks:\n  - path: /health\n    status: 200\n  - path: /version\n    status: 200\n'
  };
  const metadata = 'ARG APP_VERSION\nARG GIT_SHA\nRUN test -n "$APP_VERSION" && test -n "$GIT_SHA" && printf \'{"version":"%s","commit":"%s"}\' "$APP_VERSION" "$GIT_SHA" > build-info.json\n';
  if(runtime==='node') return {...common,
    'server.mjs':`import http from 'node:http';\nimport {readFileSync} from 'node:fs';\nconst build=JSON.parse(readFileSync(new URL('./build-info.json',import.meta.url),'utf8'));\nhttp.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health') res.end(JSON.stringify({status:'ok'}));else if(req.url==='/version') res.end(JSON.stringify({...build,env:process.env.APP_ENV,color:process.env.APP_COLOR}));else {res.statusCode=404;res.end(JSON.stringify({error:'Not found'}));}}).listen(Number(process.env.PORT||8080),'0.0.0.0');\n`,
    'Dockerfile':'FROM node@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5\nWORKDIR /app\nCOPY server.mjs ./\n'+metadata+'USER node\nEXPOSE 8080\nCMD ["node","server.mjs"]\n',
    'review.yaml':'build: [node, --check, server.mjs]\nlint: [node, --check, server.mjs]\ntest: [node, --test]\n'
  };
  return {...common,
    'server.py':`import json, os\nfrom pathlib import Path\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\nBUILD=json.loads(Path(__file__).with_name('build-info.json').read_text())\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        status=200\n        if self.path=='/health': payload={'status':'ok'}\n        elif self.path=='/version': payload={**BUILD,'env':os.environ.get('APP_ENV'),'color':os.environ.get('APP_COLOR')}\n        else: status,payload=404,{'error':'Not found'}\n        self.send_response(status)\n        self.send_header('Content-Type','application/json')\n        self.end_headers()\n        self.wfile.write(json.dumps(payload).encode())\nHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8080'))),Handler).serve_forever()\n`,
    'Dockerfile':'FROM python@sha256:34386ef0cb081344d7ec1c103ba398e6e9ab3a1509accc92a4e24a07258\nWORKDIR /app\nCOPY server.py ./\n'+metadata+'USER 65534:65534\nEXPOSE 8080\nCMD ["python","server.py"]\n',
    'review.yaml':'build: [python, -m, py_compile, server.py]\nlint: [python, -m, py_compile, server.py]\ntest: [python, -m, unittest, discover]\n'
  };
}
