"""Opt-in real-browser test. All server state and credentials are temporary."""
import os
import socket
from threading import Thread
import time

import pytest


@pytest.mark.skipif(os.environ.get('CONTROL_BROWSER_TEST') != '1', reason='Explicit browser test only')
def test_human_portal_end_to_end(tmp_path):
    from fastapi.testclient import TestClient
    from playwright.sync_api import sync_playwright, expect
    import uvicorn
    from control import create_app
    from migrate import migrate
    from security import provision_identity

    url = f'sqlite:///{tmp_path / "browser.db"}'
    migrate(url)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    from backlog import Forgejo
    from test_backlog import Source
    import httpx
    remote = Source()
    app = create_app(url, portal_origin=origin, allow_insecure_local=True, forgejo=Forgejo('synthetic-test-token', transport=httpx.MockTransport(remote.request)))
    human = provision_identity(app.state.engine, kind='human', admin=True, operator_id='browser-test')
    headers = {'Authorization': f'Bearer {human["token"]}', 'Idempotency-Key': 'project'}
    with TestClient(app) as seed:
        project = seed.post('/v1/projects', headers=headers, json={'name': 'Central de Solicitações'}).json()['id']
        other_project = seed.post('/v1/projects', headers={**headers, 'Idempotency-Key': 'other-project'}, json={'name': 'Outra ideia'}).json()['id']
        seed.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': 'object'}, json={'project_id': project, 'payload': {'resumo': 'Plano do piloto', 'conteudo': '<img src=x onerror=alert(1)>'}, 'target': 'Homologação local', 'policy_hash': 'b' * 64})
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='error', access_log=False))
    thread = Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(.05)
        assert server.started
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            errors, external = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(origin + '/') else None)
            page.goto(origin+'/?project='+project+'#objects')
            page.get_by_label('Chave de acesso pessoal').fill(human['token'])
            page.get_by_role('button', name='Entrar no ambiente').click()
            expect(page.get_by_role('heading', name='Execuções e decisões')).to_be_visible()
            expect(page.locator('#project')).to_have_value(project)
            expect(page.get_by_text('Plano do piloto', exact=False)).to_be_visible()
            assert page.locator('#object-list img').count() == 0
            page.get_by_role('button', name='Registrar execução').click()
            expect(page.locator('#run-list .card')).to_have_count(1)
            page.get_by_role('button', name='Cancelar', exact=True).click()
            expect(page.locator('#run-list')).to_contain_text('Cancelada')
            page.get_by_label('Justificativa da decisão').fill('Plano revisado para homologação.')
            page.get_by_role('button', name='Aprovar', exact=True).click()
            expect(page.locator('#approval-list')).to_contain_text('Válida para a versão atual')
            page.get_by_role('button', name='Revogar decisão').click()
            expect(page.locator('#approval-list')).to_contain_text('Revogada')
            page.reload()
            expect(page.get_by_role('heading', name='Execuções e decisões')).to_be_visible()
            # Build and revise a complete scope through forms, without code/SQL.
            for kind, title in [('outcome', 'Resultado mensurável'), ('epic', 'Capacidade do piloto'), ('story', 'Comportamento verificável')]:
                page.get_by_label('Tipo', exact=True).select_option(kind)
                page.get_by_label('Título do item').fill(title)
                page.get_by_label('Descrição do comportamento ou resultado').fill('Texto seguro <img src=x onerror=alert(1)>')
                if kind == 'outcome':
                    page.get_by_label('Como medir o resultado', exact=False).fill('Cinco cenários concluídos')
                if kind == 'story':
                    page.get_by_label('Critérios de aceitação', exact=False).fill('Usuário autorizado conclui o fluxo\nHistórico apresenta autoria')
                page.get_by_role('button', name='Publicar proposta', exact=True).click()
                expect(page.locator('#backlog-list')).to_contain_text(title)
            assert page.locator('#backlog-list img').count() == 0
            scope_card = page.locator('#object-list .card').filter(has=page.get_by_role('heading', name='Escopo do planejamento'))
            scope_card.get_by_label('Justificativa da decisão').fill('Escopo completo conferido pelo humano')
            scope_card.get_by_role('button', name='Aprovar', exact=True).click()
            expect(page.locator('#approval-list')).to_contain_text('Válida para a versão atual')
            story_card = page.locator('#backlog-list .card').filter(has_text='Comportamento verificável')
            story_card.get_by_role('button', name='Propor nova versão').click()
            page.get_by_label('Critérios de aceitação', exact=False).fill('Novo critério revisado')
            page.get_by_role('button', name='Publicar nova versão', exact=True).click()
            expect(page.locator('#backlog-list')).to_contain_text('Novo critério revisado')
            expect(page.locator('#approval-list')).not_to_contain_text('Válida para a versão atual')
            page.get_by_role('button', name='Conferir fonte do backlog').click()
            expect(page.locator('#notice')).to_contain_text('Fonte conferida')
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            screenshot = os.environ.get('CONTROL_PORTAL_SCREENSHOT')
            if screenshot:
                page.screenshot(path=screenshot, full_page=True)
            page.get_by_role('button', name='Sair', exact=True).click()
            expect(page.get_by_label('Chave de acesso pessoal')).to_be_visible()
            assert not errors and not external
            browser.close()
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        app.state.engine.dispose()
