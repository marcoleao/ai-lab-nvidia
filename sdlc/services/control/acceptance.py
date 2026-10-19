"""Exercise the installed nucleus with synthetic data, without running agents."""
import json
import os
from pathlib import Path
import time
from datetime import datetime, timezone
from uuid import uuid4

import httpx


def main():
    keys = json.loads(Path('/state/access.json').read_text())
    demo_path = Path('/state/demo.json')
    project = json.loads(demo_path.read_text())['project_id'] if demo_path.exists() else None
    headers = {'Authorization': 'Bearer ' + keys['human']['token']}
    agent = {'Authorization': 'Bearer ' + keys['agent']['token']}
    reader = {'Authorization': 'Bearer ' + keys['reader']['token']}
    with httpx.Client(base_url='http://portal:8080', timeout=15) as client:
        assert client.get('/health/ready').status_code == 200
        if project is None:
            created = client.post('/v1/projects', headers={**headers, 'Idempotency-Key': str(uuid4())},
                                  json={'name': 'Aceitação técnica sintética'})
            created.raise_for_status()
            project = created.json()['id']
            for actor, role in [('reader','reader'), ('agent','contributor')]:
                assigned = client.put(f'/v1/projects/{project}/members/{keys[actor]["id"]}',
                    headers={**headers, 'Idempotency-Key': str(uuid4())}, json={'role': role})
                assigned.raise_for_status()
            Path('/state/acceptance-project.json').write_text(json.dumps({'project_id': project}))
        assert client.get(f'/v1/projects/{project}/events').status_code == 401
        blocked = client.post('/v1/runs', headers={**reader, 'Idempotency-Key': str(uuid4())}, json={'project_id': project})
        assert blocked.status_code == 403, f'Reader write check returned {blocked.status_code}: {blocked.text}'
        assert client.put(f'/v1/projects/{project}/members/{keys["agent"]["id"]}', headers={**agent, 'Idempotency-Key': str(uuid4())}, json={'role': 'manager'}).status_code == 403
        request = {**headers, 'Idempotency-Key': str(uuid4())}
        first = client.post('/v1/runs', headers=request, json={'project_id': project})
        assert first.status_code == 200
        assert client.post('/v1/runs', headers=request, json={'project_id': project}).json() == first.json()
        obj_body = {'project_id': project, 'payload': {'cenario': 'Verificação automática da versão'}, 'target': 'Aceitação local', 'policy_hash': 'b' * 64}
        obj = client.post('/v1/approval-objects', headers={**headers, 'Idempotency-Key': str(uuid4())}, json=obj_body).json()
        decision = {'project_id': project, 'object_id': obj['id'], 'object_version': obj['version'], 'object_hash': obj['hash'], 'target': obj['target'], 'policy_hash': obj['policy_hash'], 'decision': 'approved', 'reason': 'Aceitação automatizada com dados sintéticos'}
        assert client.post('/v1/approvals', headers={**agent, 'Idempotency-Key': str(uuid4())}, json=decision).status_code == 403
        approval = client.post('/v1/approvals', headers={**headers, 'Idempotency-Key': str(uuid4())}, json=decision).json()
        validity = f'/v1/approvals/{approval["id"]}/validity'
        assert client.get(validity, headers=headers).json()['valid']
        changed = client.put(f'/v1/approval-objects/{obj["id"]}', headers={**headers, 'Idempotency-Key': str(uuid4())}, json={**obj_body, 'payload': {'cenario': 'Versão modificada'}, 'expected_version': 1})
        assert changed.status_code == 200
        assert not client.get(validity, headers=headers).json()['valid']
        # Confirm the continuously running consumer handles a newly created event.
        for _ in range(20):
            pending = client.get(f'/v1/projects/{project}/processing', headers=headers).json()
            if not any(row['state'] == 'pending' for row in pending):
                break
            time.sleep(.5)
        assert not any(row['state'] == 'pending' for row in pending)
        from acceptance_backlog import check
        backlog_project = check(client, headers, reader, agent)
        from acceptance_chat import check as check_chat
        chat_conversation = check_chat(client, headers, reader, agent, project)
    # Exercise the actual ingress proxy and cookie session, not just the API.
    origin = os.environ['SDLC_PORTAL_ORIGIN']
    with httpx.Client(base_url='http://entry:8080', headers={'Host': origin.split('://', 1)[1]}, timeout=15) as browser:
        assert browser.get('/').status_code == 200
        assert browser.post('/v1/session', json={'token': keys['human']['token']}, headers={'Origin': origin}).status_code == 200
        assert browser.get('/v1/session').status_code == 200
        assert browser.delete('/v1/session', headers={'Origin': origin, 'X-CSRF-Token': browser.cookies['sdlc_csrf']}).status_code == 200
        assert browser.get('/v1/session').status_code == 401
    print('[OK] Installed API: authentication, project roles, human approval, stale version, idempotency and consumer.')
    report = {'scope': 'acceptance-nucleus', 'automated_status': 'passed', 'human_status': 'pending', 'completed_at': datetime.now(timezone.utc).isoformat(), 'project_id': project, 'checks': ['health', 'authentication', 'reader_restriction', 'agent_restriction', 'idempotency', 'version_bound_approval', 'consumer', 'ingress_session_logout']}
    report['backlog_project_id'] = backlog_project
    report['chat_contract_conversation_id'] = chat_conversation
    report['checks'].append('chat_protocol_synthetic')
    report['checks'].extend(['forgejo_private_source', 'backlog_hierarchy', 'backlog_version_history', 'scope_invalidation', 'external_drift_rejection'])
    manifest = Path('/state/installed-manifest.json')
    if manifest.exists():
        report['package_sha256'] = json.loads(manifest.read_text())['package_sha256']
    output = Path('/state/last-automated-acceptance.json')
    output.write_text(json.dumps(report, indent=2)); output.chmod(0o600)
    print('Human acceptance and offline/restart/restore checks remain separate checklist items.')


if __name__ == '__main__':
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == 'reader-check' and sys.argv[2] in {'revoked', 'active'}:
        keys = json.loads(Path('/state/access.json').read_text())
        project_path = Path('/state/demo.json')
        if not project_path.exists(): project_path = Path('/state/acceptance-project.json')
        project = json.loads(project_path.read_text())['project_id']
        response = httpx.get(f'http://portal:8080/v1/projects/{project}/events', headers={'Authorization': 'Bearer ' + keys['reader']['token']}, timeout=10)
        assert response.status_code == (401 if sys.argv[2] == 'revoked' else 200)
        print('[OK] Reader credential status: ' + sys.argv[2])
    else:
        main()
