"""Render the shipped webview assets in Chromium with a message-only host stub."""
import json
import os
from pathlib import Path
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest


@pytest.mark.skipif(os.environ.get('CONTROL_BROWSER_TEST') != '1', reason='Explicit browser test only')
def test_chat_forms_and_untrusted_model_text():
    from playwright.sync_api import sync_playwright, expect
    root = Path('/extension')
    nonce = 'synthetic-test-nonce'

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            origin = f'http://127.0.0.1:{self.server.server_port}'
            if self.path == '/':
                source = re.search(r'return `([\s\S]*)`;', (root / 'view.js').read_text()).group(1)
                source = source.replace('${source}', origin).replace('${nonce}', nonce).replace('${css}', origin+'/media/chat.css').replace('${script}', origin+'/media/chat.js')
                mock = '<script nonce="'+nonce+'">window.sent=[];window.acquireVsCodeApi=()=>({postMessage:message=>window.sent.push(message)});</script>'
                content = source.replace('<script nonce=', mock+'<script nonce=', 1).encode()
                kind = 'text/html'
            elif self.path in {'/media/chat.css', '/media/chat.js'}:
                content = (root / self.path.lstrip('/')).read_bytes()
                kind = 'text/css' if self.path.endswith('css') else 'text/javascript'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', kind+'; charset=utf-8')
            self.end_headers()
            self.wfile.write(content)

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={'width': 360, 'height': 900})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}')
            page.get_by_role('button', name='Conectar ao meu ambiente').click()
            assert page.evaluate('window.sent.at(-1).type') == 'connect'
            state = {'configured': True, 'actorId': 'human', 'role': 'manager', 'projects': [{'id': 'project', 'name': 'Teste'}], 'project': 'project', 'conversations': [{'id': 'chat', 'title': 'Descoberta'}], 'conversation': 'chat', 'history': {'model': 'qwen3:14b', 'summary': 'Resumo proposto', 'turns': []}, 'canCreateProject': True}
            empty = {**state, 'projects': [], 'project': '', 'history': None}
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', empty)
            page.get_by_role('button', name='Começar minha ideia', exact=True).click()
            assert page.evaluate('window.sent.at(-1).type') == 'new-project'
            expect(page.locator('#send-form')).to_be_hidden()
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            page.get_by_label('Conte sua ideia', exact=True).fill('Quero organizar a videolocadora')
            page.get_by_role('button', name='Enviar', exact=True).click()
            assert page.evaluate('window.sent.at(-1)') == {'type': 'send', 'text': 'Quero organizar a videolocadora'}
            expect(page.locator('#message')).to_have_value('Quero organizar a videolocadora')
            page.evaluate('window.postMessage({type:"accepted"},"*")')
            expect(page.locator('#message')).to_have_value('')
            turn = {'id': 'turn', 'actor_id': 'human', 'user_text': '<img src=x onerror=alert(1)>', 'state': 'completed', 'attempts': 1, 'model': 'qwen3:14b', 'model_digest': 'a'*64, 'result': {'domain': 'Videolocadora', 'reply': '<script>alert(1)</script>', 'questions': ['Como funciona a devolução?'], 'assumptions': ['Hipótese a confirmar']}}
            state['history']['turns'] = [turn]
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_text('Como funciona a devolução?', exact=True)).to_be_visible()
            assert page.locator('#messages img, #messages script').count() == 0
            page.get_by_role('button', name='Preparar meu plano').click()
            assert page.evaluate('window.sent.at(-1).type') == 'propose'
            turn['result']['questions'] = []
            turn['result']['proposal'] = [{'ref': 'o1', 'kind': 'outcome', 'parent_ref': None, 'title': '<img src=x onerror=alert(1)>', 'description': 'Resultado proposto', 'measure': 'Meta a validar', 'criteria': []}]
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_role('button', name='Enviar para revisão')).to_be_visible()
            expect(page.get_by_role('button', name='Preparar meu plano')).to_be_hidden()
            expect(page.get_by_text('Resultado esperado', exact=True)).to_be_visible()
            expect(page.get_by_label('O que você gostaria de ajustar?', exact=True)).to_be_visible()
            page.get_by_role('button', name='Enviar para revisão').click()
            assert page.evaluate('window.sent.at(-1).type') == 'publish-proposal'
            assert page.locator('#messages img, #messages script').count() == 0
            turn['result']['proposal'].extend([
                {'ref': 'e1', 'kind': 'epic', 'parent_ref': 'o1', 'title': 'Controle de locações', 'description': 'Acompanhar retiradas e devoluções.', 'measure': '', 'criteria': []},
                {'ref': 's1', 'kind': 'story', 'parent_ref': 'e1', 'title': 'Registrar uma retirada', 'description': 'O atendente registra o DVD e a data prevista de devolução.', 'measure': '', 'criteria': ['O exemplar fica indisponível enquanto estiver alugado.']},
            ])
            state['publication'] = {'count': 1, 'total': 3}
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_role('button', name='Concluir envio')).to_be_visible()
            expect(page.locator('#send-form')).to_be_hidden()
            expect(page.get_by_text('1 de 3 itens já foram enviados.', exact=False)).to_be_visible()
            state['publication'] = {'count': 3, 'total': 3}
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_role('button', name='Revisar e decidir')).to_be_visible()
            expect(page.get_by_role('button', name='Enviar para revisão')).to_be_hidden()
            expect(page.locator('#send-form')).to_be_hidden()
            assert page.locator('#step-3').get_attribute('aria-current') == 'step'
            state['publication'] = {'count': 0, 'total': 3}
            state['role'] = 'reader'
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_role('button', name='Enviar para revisão')).to_be_hidden()
            expect(page.locator('#message')).to_be_disabled()
            state['role'] = 'manager'
            state['history']['turns'] = [{**turn, 'id': 'old', 'user_text': 'Informação da conversa anterior'}, turn]
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_text('Informação da conversa anterior', exact=True)).to_be_hidden()
            page.locator('#earlier > summary').click()
            expect(page.get_by_text('Informação da conversa anterior', exact=True)).to_be_visible()
            state['history']['turns'] = [turn]
            state['history']['turns'][0] = {**turn, 'state': 'running', 'result': None}
            state['busy'] = True
            page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
            expect(page.get_by_role('button', name='Enviar', exact=True)).to_be_disabled()
            page.get_by_role('button', name='Interromper espera').click()
            assert page.evaluate('window.sent.at(-1).type') == 'cancel'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors
            if os.environ.get('CHAT_UX_ARTIFACTS'):
                state['busy'] = False
                state['history']['turns'] = [{**turn, 'user_text': 'Quero organizar as locações da minha videolocadora.'}]
                state['history']['turns'][0]['result'] = {**turn['result'], 'reply': 'Preparei um plano inicial para organizar as retiradas e devoluções. Confira se ele atende ao que você precisa.', 'proposal': [dict(item) for item in turn['result']['proposal']]}
                state['history']['turns'][0]['result']['proposal'][0].update(title='Reduzir devoluções esquecidas', description='Ajudar os atendentes a acompanhar os DVDs que precisam voltar à loja.')
                state['projects'][0]['name'] = 'Minha videolocadora'
                page.set_viewport_size({'width': 420, 'height': 1000})
                page.evaluate('value=>window.postMessage({type:"state",value},"*")', state)
                page.screenshot(path=str(Path(os.environ['CHAT_UX_ARTIFACTS']) / 'plano-negocio.png'), full_page=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
