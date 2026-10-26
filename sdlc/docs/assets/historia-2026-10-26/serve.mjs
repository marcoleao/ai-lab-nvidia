import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Servidor exclusivo da prévia: sem API, escrita ou acesso ao Portal.
const root = new URL('../../', import.meta.url);
const files = new Map([
  ['/', ['prototipo-historia-2026-10-26.html', 'text/html; charset=utf-8']],
  ['/prototipo-historia-2026-10-26.html', ['prototipo-historia-2026-10-26.html', 'text/html; charset=utf-8']],
  ['/assets/historia-2026-10-26/prototipo.css', ['assets/historia-2026-10-26/prototipo.css', 'text/css; charset=utf-8']],
  ['/assets/historia-2026-10-26/prototipo.js', ['assets/historia-2026-10-26/prototipo.js', 'text/javascript; charset=utf-8']],
]);

http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const entry = files.get(path);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404); response.end('Recurso fora desta prévia.'); return;
  }
  try {
    const content = await readFile(fileURLToPath(new URL(entry[0], root)));
    response.writeHead(200, {
      'Content-Type': entry[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404); response.end('Arquivo da prévia ainda não disponível.');
  }
}).listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Prévia isolada da História disponível.'));
