"""Synthetic installed-service acceptance, including external source drift."""
import json
from pathlib import Path
from uuid import uuid4

import httpx


def check(client, human, reader, agent):
    def post(path, body):
        result = client.post(path, headers={**human, 'Idempotency-Key': str(uuid4())}, json=body)
        assert result.status_code == 200, f'Backlog command failed: HTTP {result.status_code}'
        return result.json()

    project = post('/v1/projects', {'name': 'Aceitação sintética do backlog'})['id']
    path = f'/v1/projects/{project}/work-items'
    specifications = [
        {'kind': 'outcome', 'title': 'Planejar pelo portal', 'description': 'Manter uma cadeia de escopo rastreável', 'measure': 'Três níveis com aprovação e histórico'},
        {'kind': 'epic', 'title': 'Decompor trabalho', 'description': 'Vincular capacidades ao resultado'},
        {'kind': 'story', 'title': 'Revisar critérios', 'description': 'Humano decide sobre critérios observáveis', 'criteria': ['Somente humano aprova', 'Mudança invalida o aceite anterior']},
    ]
    previous = None
    rows = []
    for specification in specifications:
        body = {**specification, 'parent_id': previous}
        headers = {**human, 'Idempotency-Key': str(uuid4())}
        first = client.post(path, headers=headers, json=body)
        assert first.status_code == 200, f'Canonical backlog publish failed: HTTP {first.status_code}'
        assert client.post(path, headers=headers, json=body).json() == first.json()
        rows.append(first.json()); previous = rows[-1]['id']
    assert client.post(path, headers={**reader, 'Idempotency-Key': str(uuid4())}, json=specifications[0]).status_code == 403
    scope = client.get(path, headers=human).json()['scope']
    body = {'project_id': project, 'object_id': scope['id'], 'object_version': scope['version'], 'object_hash': scope['hash'], 'target': scope['target'], 'policy_hash': scope['policy_hash'], 'decision': 'approved', 'reason': 'Verificação automatizada, sem substituir aceite humano'}
    assert client.post('/v1/approvals', headers={**agent, 'Idempotency-Key': str(uuid4())}, json=body).status_code == 403
    approved = post('/v1/approvals', body)
    validity = f'/v1/approvals/{approved["id"]}/validity'
    assert client.get(validity, headers=human).json()['valid'] is True
    story = rows[-1]
    update_body = {**specifications[-1], 'parent_id': rows[-2]['id'], 'criteria': ['Critério alterado exige nova decisão'], 'expected_version': 1}
    changed = client.put(path + '/' + story['id'], headers={**human, 'Idempotency-Key': str(uuid4())}, json=update_body)
    assert changed.status_code == 200
    assert client.get(validity, headers=human).json()['valid'] is False
    history = client.get(path + '/' + story['id'] + '/versions', headers=human).json()
    assert [row['version'] for row in history] == [1, 2]
    # Alter only this synthetic project's current story through the real source API.
    token = Path('/run/secrets/forgejo_token').read_text().strip()
    with httpx.Client(base_url='http://forgejo:3000/api/v1', headers={'Authorization': f'token {token}'}, timeout=10, trust_env=False) as source:
        identity = source.get('/user')
        assert identity.status_code == 200 and identity.json()['is_admin'] is False
        repo = f'/repos/sdlc-backlog/p-{project.replace("-", "")}'
        assert source.get(repo).json()['private'] is True
        issues = source.get(repo + '/issues', params={'state': 'all', 'limit': 50}).json()
        assert len(issues) == 4, 'Idempotent retries must not duplicate canonical issues'
        number = changed.json()['source_issue']
        assert source.patch(repo + f'/issues/{number}', json={'title': 'Alteração externa sintética'}).status_code == 201
    post(f'/v1/projects/{project}/backlog/reconcile', {})
    reconciled = client.get(path, headers=human).json()
    assert any(row['source_state'] == 'diverged' for row in reconciled['items'])
    scope = reconciled['scope']
    blocked = client.post('/v1/approvals', headers={**human, 'Idempotency-Key': str(uuid4())}, json={**body, 'object_version': scope['version'], 'object_hash': scope['hash']})
    assert blocked.status_code == 409
    print('[OK] Forgejo: private source, non-admin identity, hierarchy, idempotency, scope approval, versions and external drift rejection.')
    return project
