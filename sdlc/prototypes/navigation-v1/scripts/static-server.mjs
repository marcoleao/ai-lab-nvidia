import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../public',import.meta.url)));
const port=Number(process.env.PORT||8080),host=process.env.HOST||'0.0.0.0';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('Somente arquivos estáticos.');return;}
  try{
    const url=new URL(req.url,'http://prototype.local');
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const requested=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+requested+(requested.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Acesso negado');return;}
    if(!(await stat(file)).isFile())throw Error('not a file');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Arquivo não encontrado.');}
});
server.listen(port,host,()=>console.log(`Protótipo estático em http://${host}:${port}; sem APIs ou integrações.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
