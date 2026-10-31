"""Opt-in HTTP/HTTPS image fixture for browser-only tests; no application data."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import argparse, hashlib, json, os, signal, ssl, sys, threading

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / 'sdlc/portal/.prepared/ui-photo-fixture'
sys.path.insert(0, str(ROOT / 'sdlc/scripts'))
from audit_admin import administrative_operation

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--owner', required=True)
    parser.add_argument('--http-port', type=int, default=8049)
    parser.add_argument('--https-port', type=int, default=8449)
    args = parser.parse_args()
    if not args.owner.isalnum() or len(args.owner) > 80 or any(port < 1024 or port > 65535 for port in [args.http_port, args.https_port]):
        raise ValueError('Expected an owned local test fixture and unprivileged ports')
    if PRIVATE.is_symlink() or not PRIVATE.is_dir():
        raise RuntimeError('Prepare the private test certificate first')
    ready = PRIVATE / 'ready.json'
    if ready.exists() or any((PRIVATE / name).is_symlink() for name in ['cert.pem', 'key.pem', 'ready.json']):
        raise RuntimeError('Keep an existing fixture or linked file')
    photo = (Path(__file__).parent / 'fixtures/ui-jewel.svg').read_bytes()
    servers = []; started = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_GET(self):
            if urlsplit(self.path).path != '/jewel.svg':
                self.send_error(404); return
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Content-Length', str(len(photo)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(photo)

    control = ROOT / 'sdlc/portal/test-results/regression/control'
    details = {'scope': 'ui-photo-fixture:' + args.owner,
               'manifestDigest': hashlib.sha256(photo).hexdigest()}
    try:
        with administrative_operation('PORTAL_REGRESSION_ENVIRONMENT', source='browser-fixture', root=control, details={**details, 'command': 'up'}) as operation:
            for port in [args.http_port, args.https_port]:
                servers.append(ThreadingHTTPServer(('127.0.0.1', port), Handler))
            tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            tls.load_cert_chain(PRIVATE / 'cert.pem', PRIVATE / 'key.pem')
            servers[1].socket = tls.wrap_socket(servers[1].socket, server_side=True)
            for server in servers:
                threading.Thread(target=server.serve_forever, daemon=True).start()
                started.append(server)
            operation.result(count=2)
        ready.write_text(json.dumps({'owner': args.owner, 'pid': os.getpid(), 'http': f'http://127.0.0.1:{args.http_port}/jewel.svg', 'https': f'https://127.0.0.1:{args.https_port}/jewel.svg'}))
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
        threading.Event().wait()
    finally:
        with administrative_operation('PORTAL_REGRESSION_ENVIRONMENT', source='browser-fixture', root=control, details={**details, 'command': 'down'}) as operation:
            for server in servers:
                if server in started:
                    server.shutdown()
                server.server_close()
            if ready.exists() and json.loads(ready.read_text()).get('owner') == args.owner:
                ready.unlink()
            operation.result(count=len(servers))

if __name__ == '__main__':
    main()
