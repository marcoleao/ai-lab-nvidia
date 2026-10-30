"""Exercise the actual relay handler with an isolated local upstream."""
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
import urllib.error


class RelayTests(unittest.TestCase):
    def test_relay_allows_only_authenticated_bounded_inference(self):
        calls = []

        class Upstream(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append((self.path, self.headers.get('Authorization')))
                content = json.dumps({'data': [{'id': 'local-model'}]}).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(content)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                calls.append((self.path, self.headers.get('Authorization'), body))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"model":"local-model","done":true,"done_reason":"stop","message":{"content":"resposta completa"}}')

            def log_message(self, *_):
                pass

        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        config = {'sourceSubnet': '127.0.0.0/8', 'tokenFile': 'fixture-only', 'model': 'local-model', 'upstream': f'http://127.0.0.1:{upstream.server_port}'}
        spec = importlib.util.spec_from_file_location('isolated_relay', Path(__file__).resolve().parents[1] / 'scripts/llm-relay.py')
        module = importlib.util.module_from_spec(spec)
        with patch.object(Path, 'read_text', side_effect=[json.dumps(config), 'private-fixture']):
            spec.loader.exec_module(module)
        server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()

        def request(path, body=None, token='private-fixture'):
            req = urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+path, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=3) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)

        try:
            self.assertEqual(request('/v1/models', token='wrong')[0], 401)
            self.assertEqual(request('/api/pull', {})[0], 404)
            body = {'model': 'local-model', 'messages': [{'role': 'user', 'content': 'Isolated test'}], 'max_tokens': 32, 'stream': False, 'reasoning_effort': 'none'}
            self.assertEqual(request('/v1/chat/completions', {**body, 'model': 'unapproved'})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'tools': []})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'reasoning_effort': 'high'})[0], 422)
            self.assertEqual(calls, [])
            self.assertEqual(request('/v1/models')[0], 200)
            self.assertEqual(request('/v1/chat/completions', body)[0], 200)
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[1][0], '/api/chat')
            self.assertEqual(calls[1][2]['think'], False)
            self.assertEqual(calls[1][2]['options'], {'num_ctx': 32768, 'num_predict': 32, 'temperature': 0.2})
            schema_format = {'type': 'json_schema', 'json_schema': {'name': 'sdlc_plan', 'strict': True, 'schema': {'type': 'object', 'properties': {'summary': {'type': 'string'}}, 'additionalProperties': False}}}
            self.assertEqual(request('/v1/chat/completions', {**body, 'max_tokens': 8192, 'response_format': schema_format})[0], 200)
            self.assertEqual(calls[-1][2]['format'], schema_format['json_schema']['schema'])
            self.assertEqual(calls[-1][2]['options']['num_predict'], 8192)
            self.assertEqual(request('/v1/chat/completions', {**body, 'options': {'num_ctx': 99999}})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'messages': [{'role': 'user', 'content': 'x'*16000}]*3})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'messages': [{'role': 'user', 'content': 'x'*14000}]*3})[0], 200)
            self.assertEqual(request('/v1/chat/completions', {**body, 'messages': [{'role': 'user', 'content': 'x'*n} for n in [16000,16000,14000]]})[0], 200)
            self.assertEqual(request('/v1/chat/completions', {**body, 'messages': [{'role': 'user', 'content': 'x'*n} for n in [16000,16000,14001]]})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'max_tokens': 8193})[0], 422)
            self.assertEqual(request('/v1/chat/completions', {**body, 'response_format': {'type': 'json_schema', 'json_schema': {'name': 'other'}}})[0], 422)
            self.assertTrue(all(call[1] is None for call in calls))
        finally:
            server.shutdown()
            server.server_close()
            upstream.shutdown()
            upstream.server_close()


if __name__ == '__main__':
    unittest.main()
