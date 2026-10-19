import time

from fastapi.testclient import TestClient
from sqlalchemy import update

from control import create_app
from security import revoke_credential
from sessions import CSRF_COOKIE, SESSION_COOKIE, sessions
from test_control import setup

ORIGIN = 'https://localhost:3100'


def login(client, token):
    return client.post('/v1/session', json={'token': token}, headers={'Origin': ORIGIN})


def browser_headers(client):
    return {'Origin': ORIGIN, 'X-CSRF-Token': client.cookies.get(CSRF_COOKIE), 'Idempotency-Key': 'browser-command'}


def test_session_cookie_csrf_logout_and_replay(setup):
    _, app, _, project = setup
    with TestClient(app, base_url=ORIGIN) as client:
        response = login(client, app.state.test_credentials['human']['token'])
        assert response.status_code == 200
        cookie = next(value for value in response.headers.get_list('set-cookie') if value.startswith(SESSION_COOKIE + '='))
        assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=strict' in cookie
        old_session = client.cookies.get(SESSION_COOKIE)
        assert client.get('/v1/session').status_code == 200
        assert client.post('/v1/runs', json={'project_id': project}).status_code == 403
        headers = browser_headers(client)
        assert client.post('/v1/runs', json={'project_id': project}, headers={**headers, 'Origin': 'https://evil.example'}).status_code == 403
        assert client.post('/v1/runs', json={'project_id': project}, headers=headers).status_code == 200
        assert client.delete('/v1/session', headers=headers).status_code == 200
        assert client.get('/v1/session').status_code == 401
        client.cookies.set(SESSION_COOKIE, old_session)
        assert client.get('/v1/session').status_code == 401


def test_session_expiration_and_underlying_credential_revocation(setup):
    _, app, _, _ = setup
    human = app.state.test_credentials['human']
    with TestClient(app, base_url=ORIGIN) as client:
        assert login(client, human['token']).status_code == 200
        from sessions import hash_token
        with app.state.engine.begin() as connection:
            connection.execute(update(sessions).where(sessions.c.id == hash_token(client.cookies.get(SESSION_COOKIE))).values(expires_at=int(time.time()) - 1))
        assert client.get('/v1/session').status_code == 401
        assert login(client, human['token']).status_code == 200
        revoke_credential(app.state.engine, human['credential_id'], operator_id=human['id'])
        assert client.get('/v1/session').status_code == 401


def test_login_rejects_agent_foreign_origin_and_invalid_token(setup):
    _, app, _, _ = setup
    with TestClient(app, base_url=ORIGIN) as client:
        assert client.post('/v1/session', json={'token': app.state.test_credentials['human']['token']}).status_code == 403
        assert login(client, app.state.test_credentials['agent']['token']).status_code == 403
        assert login(client, 'invalid').status_code == 401
        for _ in range(8):
            login(client, 'invalid')
        assert login(client, 'invalid').status_code == 429


def test_session_restart_and_project_overview_are_scoped(setup):
    _, app, headers, project = setup
    with TestClient(app, base_url=ORIGIN) as client:
        assert login(client, app.state.test_credentials['human']['token']).status_code == 200
        assert any(p['id'] == project for p in client.get('/v1/projects').json())
        assert client.get(f'/v1/projects/{project}/overview').json()['role'] == 'manager'
        assert client.get('/v1/projects/other/overview').status_code == 403
        restarted = create_app(app.state.engine.url)
        with TestClient(restarted, base_url=ORIGIN, cookies=client.cookies) as reopened:
            assert reopened.get('/v1/session').status_code == 200
        restarted.state.engine.dispose()
        assert client.get('/v1/session', headers=headers).status_code == 400


def test_portal_is_local_and_assets_have_security_headers(setup):
    client, app, _, _ = setup
    response = client.get('/')
    assert response.status_code == 200
    assert 'lang="pt-BR"' in response.text
    assert "script-src 'self'" in response.headers['content-security-policy']
    assert response.headers['cache-control'] == 'no-store'
    assert client.get('/assets/portal.js').status_code == 200
    assert client.get('/assets/portal.css').status_code == 200
    assert client.get('/assets/control.py').status_code == 404
    import pytest
    with pytest.raises(ValueError, match='HTTPS'):
        create_app(app.state.engine.url, portal_origin='http://localhost:3100')


def test_rejection_supersedes_previous_approval(setup):
    client, _, headers, project = setup
    obj = client.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': 'object'}, json={'project_id': project, 'payload': {'plan': 'first'}, 'target': 'local', 'policy_hash': 'b' * 64}).json()
    body = {'project_id': project, 'object_id': obj['id'], 'object_version': 1, 'object_hash': obj['hash'], 'target': 'local', 'policy_hash': 'b' * 64, 'decision': 'approved', 'reason': 'Initial review'}
    first = client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': 'approve'}, json=body).json()
    second = client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': 'reject'}, json={**body, 'decision': 'rejected', 'reason': 'Additional correction required'}).json()
    assert first['id'] in second['superseded_approval_ids']
    assert client.get(f'/v1/approvals/{first["id"]}/validity', headers=headers).json()['valid'] is False
    assert client.get(f'/v1/approvals/{second["id"]}/validity', headers=headers).json()['valid'] is False
