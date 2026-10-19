"""Installed chat protocol check with clearly labelled synthetic client output.

Does not claim to execute a model; real inference is a separate local check.
"""
from uuid import uuid4


def check(client, human, reader, agent, project):
    def post(path, body=None, headers=None):
        result = client.post(path, headers=headers or {**human, 'Idempotency-Key': str(uuid4())}, **({'json': body} if body is not None else {}))
        assert result.status_code == 200, f'Chat contract failed: HTTP {result.status_code}'
        return result.json()

    route = f'/v1/projects/{project}/conversations'
    assert client.post(route, headers={**reader, 'Idempotency-Key': str(uuid4())}, json={'title': 'Denied'}).status_code == 403
    assert client.post(route, headers={**agent, 'Idempotency-Key': str(uuid4())}, json={'title': 'Denied'}).status_code == 403
    conversation = post(route, {'title': 'Verificação sintética do protocolo de chat'})
    headers = {**human, 'Idempotency-Key': str(uuid4())}
    body = {'text': 'Dado sintético: verificar persistência sem consultar modelo', 'expected_version': 1}
    turn = post(f'/v1/conversations/{conversation["id"]}/turns', body, headers)
    assert post(f'/v1/conversations/{conversation["id"]}/turns', body, headers) == turn
    claim = post(f'/v1/chat-turns/{turn["id"]}/claim')
    assert client.post(f'/v1/chat-turns/{turn["id"]}/claim', headers={**human, 'Idempotency-Key': str(uuid4())}).status_code == 409
    result = {'domain': 'Teste do protocolo', 'reply': 'Saída sintética para teste da API. Nenhum modelo foi consultado nesta rodada.', 'summary': 'Teste sintético; não representa requisitos de produto.', 'questions': ['O histórico sintético foi preservado?'], 'assumptions': []}
    post(f'/v1/chat-turns/{turn["id"]}/complete', {'lease_token': claim['lease_token'], 'prompt_hash': claim['prompt_hash'], 'model': claim['request']['model'], 'model_digest': '0'*64, 'result': result, 'duration_ms': 0})
    history = client.get(f'/v1/conversations/{conversation["id"]}', headers=human).json()
    assert history['turns'][0]['result'] == result and history['version'] == 3
    assert 'prompt' not in history['turns'][0] and 'lease_token' not in history['turns'][0]
    print('[OK] Installed chat protocol: permissions, idempotency, exclusive lease and persistent synthetic response. Real model acceptance is separate.')
    return conversation['id']
