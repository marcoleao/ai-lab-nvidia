"""Authenticated local relay. No model management, tools, downloads or streaming."""
import hmac
import ipaddress
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import urllib.request
import urllib.error

CONFIG = json.loads(Path('/opt/agentic-sdlc/portal/llm-relay/config.json').read_text())
TOKEN = Path(CONFIG['tokenFile']).read_text().strip()
SLOT = threading.BoundedSemaphore(1)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never record credentials or prompts.

    def respond(self, status, body):
        content = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_request(self):
        self.connection.settimeout(250)
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            return self.respond(401, {'error': 'Relay credential required'})
        if ipaddress.ip_address(self.client_address[0]) not in ipaddress.ip_network(CONFIG['sourceSubnet']):
            return self.respond(403, {'error': 'Source network denied'})
        if (self.command, self.path) not in [('GET', '/v1/models'), ('POST', '/v1/chat/completions')]:
            return self.respond(404, {'error': 'Endpoint denied'})
        payload = None
        acquired = False
        try:
            if self.command == 'POST':
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536 or self.headers.get('Transfer-Encoding'):
                    return self.respond(413, {'error': 'Invalid body size'})
                body = json.loads(self.rfile.read(length))
                allowed = {'model', 'messages', 'stream', 'temperature', 'max_tokens', 'response_format', 'reasoning_effort'}
                if not isinstance(body, dict) or set(body) - allowed or body.get('model') != CONFIG['model'] or body.get('stream') is not False:
                    return self.respond(422, {'error': 'Model or operation denied'})
                if type(body.get('max_tokens')) is not int or not 1 <= body['max_tokens'] <= 4096:
                    return self.respond(422, {'error': 'Invalid output token limit'})
                if body.get('reasoning_effort') != 'none':
                    return self.respond(422, {'error': 'Thinking must be disabled'})
                messages = body.get('messages')
                if not isinstance(messages, list) or not 1 <= len(messages) <= 20:
                    return self.respond(422, {'error': 'Invalid messages'})
                for message in messages:
                    if not isinstance(message, dict) or set(message) != {'role', 'content'} or message['role'] not in ['user', 'assistant', 'system'] or not isinstance(message['content'], str) or not 0 < len(message['content']) <= 16000:
                        return self.respond(422, {'error': 'Invalid message'})
                response_format = body.get('response_format')
                if response_format not in [None, {'type': 'json_object'}]:
                    if not isinstance(response_format, dict) or set(response_format) != {'type', 'json_schema'} or response_format['type'] != 'json_schema':
                        return self.respond(422, {'error': 'Invalid response format'})
                    schema = response_format['json_schema']
                    if not isinstance(schema, dict) or set(schema) != {'name', 'strict', 'schema'} or schema['name'] != 'sdlc_plan' or schema['strict'] is not True or not isinstance(schema['schema'], dict) or schema['schema'].get('type') != 'object' or len(json.dumps(schema)) > 16000:
                        return self.respond(422, {'error': 'Invalid plan schema'})
                if not isinstance(body.get('temperature', 0.2), (int, float)) or not 0 <= body.get('temperature', 0.2) <= 1:
                    return self.respond(422, {'error': 'Invalid temperature'})
                acquired = SLOT.acquire(blocking=False)
                if not acquired:
                    return self.respond(429, {'error': 'Local inference busy'})
                payload = json.dumps(body).encode()
            request = urllib.request.Request(CONFIG['upstream'] + self.path, data=payload, headers={'Content-Type': 'application/json'}, method=self.command)
            # Disable redirects: the relay must never forward to another host.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *_args, **_kwargs):
                    return None
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=240 if payload else 4) as response:
                content = response.read(2 * 1024 * 1024 + 1)
                if len(content) > 2 * 1024 * 1024:
                    return self.respond(502, {'error': 'Response exceeds limit'})
                return self.respond(200, json.loads(content))
        except (json.JSONDecodeError, ValueError, TypeError):
            return self.respond(422, {'error': 'Invalid request or response'})
        except urllib.error.HTTPError as error:
            return self.respond(502, {'error': 'Local inference rejected request', 'upstreamStatus': error.code})
        except (OSError, TimeoutError):
            try:
                return self.respond(503, {'error': 'Local inference unavailable'})
            except OSError:
                pass
        finally:
            if acquired:
                SLOT.release()

    do_GET = handle_request
    do_POST = handle_request


if __name__ == '__main__':
    server = ThreadingHTTPServer((CONFIG['bind'], 11435), Handler)
    server.daemon_threads = True
    server.serve_forever()
