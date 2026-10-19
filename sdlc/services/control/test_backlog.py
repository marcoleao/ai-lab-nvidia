"""Backlog contracts against the real HTTP adapter with injected Forgejo faults."""
import json
import os
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backlog import Forgejo, items
from control import create_app, events, digest
from migrate import migrate
from security import provision_identity


class Source:
    def __init__(self):
        self.repositories = {}
        self.issues = {}
        self.fail_after_create = False
        self.unavailable = False

    def request(self, request):
        if self.unavailable:
            raise httpx.ConnectError('injected outage')
        assert request.headers['authorization'] == 'token synthetic-test-token'
        path = request.url.path.removeprefix('/api/v1')
        body = json.loads(request.content) if request.content else {}
        if request.method == 'POST' and path == '/user/repos':
            key = '/repos/sdlc-backlog/' + body['name']
            self.repositories[key] = {'private': body['private']}
            self.issues[key] = []
            return httpx.Response(201, json=self.repositories[key])
        if path in self.repositories:
            return httpx.Response(200, json=self.repositories[path])
        if path.startswith('/repos/') and '/issues' not in path:
            return httpx.Response(404, json={})
        repository, _, suffix = path.partition('/issues')
        if repository not in self.issues:
            return httpx.Response(404, json={})
        if request.method == 'POST':
            issue = {'number': len(self.issues[repository]) + 1, 'title': body['title'], 'body': body['body'], 'state': 'open'}
            self.issues[repository].append(issue)
            if self.fail_after_create:
                self.fail_after_create = False
                raise httpx.ReadTimeout('response lost after source commit')
            return httpx.Response(201, json=issue)
        if suffix:
            number = int(suffix.strip('/'))
            return httpx.Response(200, json=self.issues[repository][number - 1])
        page = int(request.url.params.get('page', '1'))
        limit = int(request.url.params.get('limit', '50'))
        return httpx.Response(200, json=self.issues[repository][(page-1)*limit:page*limit])


@pytest.fixture
def backlog(tmp_path):
    url = os.environ.get('CONTROL_TEST_DATABASE_URL', f'sqlite:///{tmp_path / "backlog.db"}')
    migrate(url)
    remote = Source()
    forgejo = Forgejo('synthetic-test-token', transport=httpx.MockTransport(remote.request))
    app = create_app(url, forgejo=forgejo)
    human = provision_identity(app.state.engine, kind='human', admin=True, operator_id='backlog-test')
    reader = provision_identity(app.state.engine, kind='human', operator_id='backlog-test')
    agent = provision_identity(app.state.engine, kind='agent', operator_id='backlog-test')
    headers = {'Authorization': f'Bearer {human["token"]}', 'Idempotency-Key': str(uuid4())}
    with TestClient(app) as client:
        project = client.post('/v1/projects', headers=headers, json={'name': 'Backlog contract'}).json()['id']
        for identity, role in ((reader, 'reader'), (agent, 'contributor')):
            assert client.put(f'/v1/projects/{project}/members/{identity["id"]}', headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'role': role}).status_code == 200
        yield client, app, project, headers, remote, reader, agent
    forgejo.client.close()
    app.state.engine.dispose()


def propose(context, kind, parent=None, **changes):
    client, _, project, headers, *_ = context
    body = {'kind': kind, 'parent_id': parent, 'title': f'{kind} title', 'description': 'Expected observable behavior', 'measure': '5 of 5 acceptance scenarios' if kind == 'outcome' else '', 'criteria': ['Authorized user completes the behavior'] if kind == 'story' else []}
    body.update(changes)
    return client.post(f'/v1/projects/{project}/work-items', headers={**headers, 'Idempotency-Key': str(uuid4())}, json=body)


def tree(context):
    outcome = propose(context, 'outcome').json()
    epic = propose(context, 'epic', outcome['id']).json()
    story = propose(context, 'story', epic['id']).json()
    return outcome, epic, story


def decide(context, decision='approved'):
    client, _, project, headers, *_ = context
    scope = client.get(f'/v1/projects/{project}/work-items', headers=headers).json()['scope']
    return client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'project_id': project, 'object_id': scope['id'], 'object_version': scope['version'], 'object_hash': scope['hash'], 'target': scope['target'], 'policy_hash': scope['policy_hash'], 'decision': decision, 'reason': 'Reviewed exact scope'})


def test_hierarchy_validation_and_cross_project_parent(backlog):
    client, _, project, headers, *_ = backlog
    assert propose(backlog, 'outcome', measure=' ').status_code == 422
    assert propose(backlog, 'epic', str(uuid4())).status_code == 422
    outcome = propose(backlog, 'outcome').json()
    assert propose(backlog, 'story', outcome['id']).status_code == 422
    other = client.post('/v1/projects', headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'name': 'Other scope'}).json()['id']
    assert client.post(f'/v1/projects/{other}/work-items', headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'kind': 'epic', 'parent_id': outcome['id'], 'title': 'Wrong project', 'description': 'Must be rejected'}).status_code == 422
    assert decide(backlog).status_code == 409
    assert decide(backlog, 'rejected').status_code == 200


def test_remote_commit_local_rollback_recovers_without_duplicate(backlog):
    client, app, project, headers, remote, *_ = backlog
    remote.fail_after_create = True
    path = f'/v1/projects/{project}/work-items'
    body = {'kind': 'outcome', 'title': 'Recover after response loss', 'description': 'Exactly one canonical proposal', 'measure': 'One issue and one local command'}
    assert client.post(path, headers=headers, json=body).status_code == 503
    with app.state.engine.connect() as connection:
        assert connection.execute(select(items).where(items.c.project_id == project)).first() is None
    result = client.post(path, headers=headers, json=body)
    assert result.status_code == 200
    assert client.post(path, headers=headers, json=body).json() == result.json()
    assert sum(len(issues) for issues in remote.issues.values()) == 1
    assert client.post(path, headers=headers, json={**body, 'title': 'Changed command'}).status_code == 409


def test_scope_change_preserves_versions_and_invalidates_approval(backlog):
    client, _, project, headers, remote, *_ = backlog
    _, _, story = tree(backlog)
    approval = decide(backlog)
    assert approval.status_code == 200
    validity = f'/v1/approvals/{approval.json()["id"]}/validity'
    assert client.get(validity, headers=headers).json()['valid'] is True
    body = {key: value for key, value in story['payload'].items() if key in {'kind', 'parent_id', 'title', 'description', 'measure', 'criteria'}}
    update_body = {**body, 'expected_version': 1, 'criteria': ['Changed acceptance criterion']}
    path = f'/v1/projects/{project}/work-items/{story["id"]}'
    changed = client.put(path, headers={**headers, 'Idempotency-Key': str(uuid4())}, json=update_body)
    assert changed.status_code == 200
    assert client.get(validity, headers=headers).json()['valid'] is False
    history = client.get(path + '/versions', headers=headers).json()
    assert [row['version'] for row in history] == [1, 2]
    assert history[0]['payload']['criteria'] == body['criteria']
    assert sum(len(issues) for issues in remote.issues.values()) == 4
    assert client.put(path, headers={**headers, 'Idempotency-Key': str(uuid4())}, json=update_body).status_code == 409


def test_external_edit_and_outage_fail_closed_but_allow_rejection(backlog):
    client, _, project, headers, remote, *_ = backlog
    tree(backlog)
    approval = decide(backlog).json()
    validity = f'/v1/approvals/{approval["id"]}/validity'
    remote.unavailable = True
    assert client.get(validity, headers=headers).json()['valid'] is False
    assert decide(backlog).status_code == 503
    assert decide(backlog, 'rejected').status_code == 200
    remote.unavailable = False
    next(iter(remote.issues.values()))[-1]['body'] += '\nEdited outside portal'
    assert decide(backlog).status_code == 409
    result = client.post(f'/v1/projects/{project}/backlog/reconcile', headers={**headers, 'Idempotency-Key': str(uuid4())})
    assert result.status_code == 200 and len(result.json()['changed']) == 1
    assert decide(backlog).status_code == 409


def test_reader_and_agent_permissions_reserved_scope_and_audit(backlog):
    client, app, project, headers, _, reader, agent = backlog
    tree(backlog)
    reader_headers = {'Authorization': f'Bearer {reader["token"]}', 'Idempotency-Key': str(uuid4())}
    agent_headers = {'Authorization': f'Bearer {agent["token"]}', 'Idempotency-Key': str(uuid4())}
    path = f'/v1/projects/{project}/work-items'
    assert client.get(path, headers=reader_headers).status_code == 200
    assert client.post(path, headers=reader_headers, json={'kind': 'outcome', 'title': 'Denied', 'description': 'Denied', 'measure': 'Denied'}).status_code == 403
    scope = client.get(path, headers=headers).json()['scope']
    approval = {'project_id': project, 'object_id': scope['id'], 'object_version': scope['version'], 'object_hash': scope['hash'], 'target': scope['target'], 'policy_hash': scope['policy_hash'], 'decision': 'approved', 'reason': 'Agent cannot approve'}
    assert client.post('/v1/approvals', headers=agent_headers, json=approval).status_code == 403
    object_body = {'project_id': project, 'payload': {}, 'target': 'local', 'policy_hash': 'a'*64, 'expected_version': scope['version']}
    assert client.put(f'/v1/approval-objects/{scope["id"]}', headers=headers, json=object_body).status_code == 409
    assert client.post('/v1/approval-objects', headers=headers, json={key: value for key, value in {**object_body, 'target': 'backlog-scope'}.items() if key != 'expected_version'}).status_code == 409
    previous = '0'*64
    for row in client.get(f'/v1/projects/{project}/events', headers=headers).json():
        assert row['previous_hash'] == previous
        assert row['hash'] == digest({'project_id': project, 'sequence': row['sequence'], 'previous_hash': previous, 'payload': json.loads(row['payload'])})
        previous = row['hash']


def test_recovery_rejects_mutated_source_marker(backlog):
    client, _, project, headers, remote, *_ = backlog
    remote.fail_after_create = True
    path = f'/v1/projects/{project}/work-items'
    body = {'kind': 'outcome', 'title': 'Lost response', 'description': 'Recover source carefully', 'measure': 'No overwrite'}
    assert client.post(path, headers=headers, json=body).status_code == 503
    next(iter(remote.issues.values()))[0]['title'] = 'External edit'
    assert client.post(path, headers=headers, json=body).status_code == 409
    assert sum(len(issues) for issues in remote.issues.values()) == 1
