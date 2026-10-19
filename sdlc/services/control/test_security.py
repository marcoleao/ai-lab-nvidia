from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from control import create_app
from security import credentials, provision_identity, revoke_credential
from test_control import setup


def test_revocation_persists_after_restart(setup):
    client, app, headers, project = setup
    human = app.state.test_credentials['human']
    revoke_credential(app.state.engine, human['credential_id'], operator_id=human['id'])
    assert client.get(f'/v1/projects/{project}/events', headers=headers).status_code == 401
    restarted = create_app(app.state.engine.url)
    with TestClient(restarted) as reopened:
        assert reopened.get(f'/v1/projects/{project}/events', headers=headers).status_code == 401
    with app.state.engine.connect() as connection:
        stored = connection.execute(select(credentials).where(credentials.c.id == human['credential_id'])).mappings().one()
        assert stored['token_hash'] != human['token']
    restarted.state.engine.dispose()


def test_roles_membership_revocation_and_no_agent_escalation(setup):
    client, app, headers, project = setup
    agent = app.state.test_credentials['agent']
    agent_headers = {'Authorization': f'Bearer {agent["token"]}', 'Idempotency-Key': 'agent-command'}
    assert client.post('/v1/runs', headers=agent_headers, json={'project_id': project}).status_code == 200
    path = f'/v1/projects/{project}/members/{agent["id"]}'
    assert client.put(path, headers={**headers, 'Idempotency-Key': 'unsafe'}, json={'role': 'manager'}).status_code == 403
    assert client.put(path, headers=agent_headers, json={'role': 'manager'}).status_code == 403
    assert client.put(path, headers={**headers, 'Idempotency-Key': 'read-only'}, json={'role': 'reader'}).status_code == 200
    assert client.get(f'/v1/projects/{project}/events', headers=agent_headers).status_code == 200
    assert client.post('/v1/runs', headers=agent_headers, json={'project_id': project}).status_code == 403
    assert client.delete(path, headers={**headers, 'Idempotency-Key': 'remove'}).status_code == 200
    assert client.get(f'/v1/projects/{project}/events', headers=agent_headers).status_code == 403


def test_approver_can_decide_but_not_edit_or_create_project(setup):
    client, app, headers, project = setup
    approver = provision_identity(app.state.engine, kind='human', operator_id='test')
    path = f'/v1/projects/{project}/members/{approver["id"]}'
    assert client.put(path, headers={**headers, 'Idempotency-Key': 'grant-approver'}, json={'role': 'approver'}).status_code == 200
    approver_headers = {'Authorization': f'Bearer {approver["token"]}', 'Idempotency-Key': 'read-only'}
    assert client.post('/v1/projects', headers=approver_headers, json={'name': 'Forbidden'}).status_code == 403
    assert client.post('/v1/runs', headers=approver_headers, json={'project_id': project}).status_code == 403
    body = {'project_id': project, 'payload': {'plan': 'review'}, 'target': 'local', 'policy_hash': 'b' * 64}
    obj = client.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': 'object'}, json=body).json()
    approval = {'project_id': project, 'object_id': obj['id'], 'object_version': 1, 'object_hash': obj['hash'], 'target': 'local', 'policy_hash': 'b' * 64, 'decision': 'approved', 'reason': 'Reviewed'}
    assert client.post('/v1/approvals', headers=approver_headers, json=approval).status_code == 200


def test_project_creation_replay_and_isolation(setup):
    client, app, headers, project = setup
    key = {**headers, 'Idempotency-Key': str(uuid4())}
    first = client.post('/v1/projects', headers=key, json={'name': 'Other'})
    assert first.status_code == 200
    assert client.post('/v1/projects', headers=key, json={'name': 'Other'}).json() == first.json()
    assert client.post('/v1/projects', headers=key, json={'name': 'Changed'}).status_code == 409
    agent_headers = {'Authorization': f'Bearer {app.state.test_credentials["agent"]["token"]}'}
    assert client.get(f'/v1/projects/{first.json()["id"]}/events', headers=agent_headers).status_code == 403
