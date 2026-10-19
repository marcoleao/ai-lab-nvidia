import json
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from control import create_app, digest, events, outbox
from migrate import migrate
from security import provision_identity


@pytest.fixture
def setup(tmp_path):
    database_url = os.environ.get('CONTROL_TEST_DATABASE_URL', f'sqlite:///{tmp_path / "test.db"}')
    migrate(database_url)
    app = create_app(database_url)
    human = provision_identity(app.state.engine, kind='human', admin=True, operator_id='test-bootstrap')
    agent = provision_identity(app.state.engine, kind='agent', operator_id=human['id'])
    app.state.test_credentials = {'human': human, 'agent': agent}
    with TestClient(app) as client:
        headers = {'Authorization': f'Bearer {human["token"]}', 'Idempotency-Key': str(uuid4())}
        project = client.post('/v1/projects', json={'name': 'Pilot'}, headers=headers).json()['id']
        assert client.put(f'/v1/projects/{project}/members/{agent["id"]}', headers={**headers, 'Idempotency-Key': 'grant-agent'}, json={'role': 'contributor'}).status_code == 200
        yield client, app, headers, project
    app.state.engine.dispose()


def test_auth_and_project_isolation(setup):
    client, _, headers, project = setup
    assert client.get(f'/v1/projects/{project}/events').status_code == 401
    assert client.get('/v1/projects/other/events', headers=headers).status_code == 403
    assert client.post('/v1/runs', headers=headers, json={'project_id': project, 'actor_kind': 'human'}).status_code == 422


def test_idempotency_and_restart(setup):
    client, app, headers, project = setup
    first = client.post('/v1/runs', headers=headers, json={'project_id': project})
    repeated = client.post('/v1/runs', headers=headers, json={'project_id': project})
    assert first.status_code == 200
    assert first.json() == repeated.json()
    run = first.json()
    reopened = create_app(app.state.engine.url)
    with TestClient(reopened) as restarted:
        assert restarted.get(f'/v1/runs/{run["id"]}', headers=headers).json() == run
    reopened.state.engine.dispose()


def test_transition_conflicts_and_atomic_audit(setup):
    client, app, headers, project = setup
    run = client.post('/v1/runs', headers=headers, json={'project_id': project}).json()
    path = f'/v1/runs/{run["id"]}/transitions'
    transition_headers = {**headers, 'Idempotency-Key': 'transition-1'}
    response = client.post(path, headers=transition_headers, json={'expected_version': 1, 'state': 'ready'})
    assert response.status_code == 200
    assert client.post(path, headers=transition_headers, json={'expected_version': 1, 'state': 'ready'}).json() == response.json()
    assert client.post(path, headers=transition_headers, json={'expected_version': 2, 'state': 'running'}).status_code == 409
    assert client.post(path, headers={**headers, 'Idempotency-Key': 'stale'}, json={'expected_version': 1, 'state': 'running'}).status_code == 409
    assert client.post(path, headers={**headers, 'Idempotency-Key': 'invalid'}, json={'expected_version': 2, 'state': 'completed'}).status_code == 409
    history = client.get(f'/v1/projects/{project}/events', headers=headers).json()
    assert len(history) == 4
    previous = '0' * 64
    for event in history:
        assert event['previous_hash'] == previous
        assert event['hash'] == digest({'project_id': project, 'sequence': event['sequence'], 'previous_hash': previous, 'payload': json.loads(event['payload'])})
        previous = event['hash']
    with app.state.engine.connect() as connection:
        event_count = connection.scalar(select(func.count()).select_from(events).where(events.c.project_id == project))
        outbox_count = connection.scalar(select(func.count()).select_from(outbox.join(events, outbox.c.event_id == events.c.id)).where(events.c.project_id == project))
        assert event_count == outbox_count == 4


def test_only_human_records_approval_and_can_revoke(setup):
    client, app, headers, project = setup
    obj = client.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': 'object'}, json={'project_id': project, 'payload': {'release': '1'}, 'target': 'local', 'policy_hash': 'b' * 64}).json()
    body = {'project_id': project, 'object_id': obj['id'], 'object_version': 1, 'object_hash': obj['hash'], 'target': 'local', 'policy_hash': 'b' * 64, 'decision': 'approved', 'reason': 'Reviewed'}
    agent_headers = {'Authorization': f'Bearer {app.state.test_credentials["agent"]["token"]}', 'Idempotency-Key': 'agent-approval'}
    assert client.post('/v1/approvals', headers=agent_headers, json=body).status_code == 403
    approval_headers = {**headers, 'Idempotency-Key': 'approve'}
    approved = client.post('/v1/approvals', headers=approval_headers, json=body)
    assert approved.status_code == 200
    assert client.post('/v1/approvals', headers=approval_headers, json={**body, 'object_hash': 'c' * 64}).status_code == 409
    path = f'/v1/approvals/{approved.json()["id"]}/revoke'
    assert client.post(path, headers=agent_headers).status_code == 403
    assert client.post(path, headers={**headers, 'Idempotency-Key': 'revoke'}).json()['revoked'] is True
    assert client.get(f'/v1/approvals/{approved.json()["id"]}/validity', headers=headers).json()['valid'] is False


def test_object_change_invalidates_approval(setup):
    client, _, headers, project = setup
    obj_body = {'project_id': project, 'payload': {'release': '1'}, 'target': 'local', 'policy_hash': 'b' * 64}
    obj = client.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': 'object'}, json=obj_body).json()
    body = {'project_id': project, 'object_id': obj['id'], 'object_version': 1, 'object_hash': obj['hash'], 'target': 'local', 'policy_hash': 'b' * 64, 'decision': 'approved', 'reason': 'Reviewed'}
    approval = client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': 'approve'}, json=body).json()
    path = f'/v1/approvals/{approval["id"]}/validity'
    assert client.get(path, headers=headers).json()['valid'] is True
    changed = client.put(f'/v1/approval-objects/{obj["id"]}', headers={**headers, 'Idempotency-Key': 'update'}, json={**obj_body, 'payload': {'release': '2'}, 'expected_version': 1})
    assert changed.status_code == 200
    assert client.get(path, headers=headers).json()['valid'] is False
    assert client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': 'stale-approval'}, json=body).status_code == 409
    assert client.put(f'/v1/approval-objects/{obj["id"]}', headers={**headers, 'Idempotency-Key': 'stale-object'}, json={**obj_body, 'expected_version': 1}).status_code == 409


def test_concurrent_idempotent_commands(setup):
    if not os.environ.get('CONTROL_TEST_DATABASE_URL', '').startswith('postgresql'):
        pytest.skip('PostgreSQL locking test')
    from concurrent.futures import ThreadPoolExecutor
    client, _, headers, project = setup
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.post('/v1/runs', headers=headers, json={'project_id': project}), range(4)))
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()['id'] for response in responses}) == 1
    assert len(client.get(f'/v1/projects/{project}/events', headers=headers).json()) == 3


def test_migration_reexecution(tmp_path):
    database_url = os.environ.get('CONTROL_TEST_DATABASE_URL', f'sqlite:///{tmp_path / "migration.db"}')
    migrate(database_url)
    migrate(database_url)
