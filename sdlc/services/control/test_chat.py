import json
from uuid import uuid4

import pytest
from sqlalchemy import select, update

from chat import slot, turns
from test_control import setup


@pytest.fixture
def chat_setup(setup):
    _, app, *_ = setup
    with app.state.engine.begin() as connection:
        connection.execute(update(slot).values(turn_id=None, lease_until=0))
    yield setup
    with app.state.engine.begin() as connection:
        connection.execute(update(slot).values(turn_id=None, lease_until=0))


def command(context, path, body=None, key=None):
    client, _, headers, _ = context
    return client.post(path, headers={**headers, 'Idempotency-Key': key or str(uuid4())}, **({'json': body} if body is not None else {}))


def queued(context, text='Quero organizar a locação de filmes físicos'):
    _, _, _, project = context
    conversation = command(context, f'/v1/projects/{project}/conversations', {'title': 'Descoberta'}).json()
    response = command(context, f'/v1/conversations/{conversation["id"]}/turns', {'text': text, 'expected_version': 1})
    assert response.status_code == 200, response.text
    return conversation, response.json()


def completion(claim):
    return {'lease_token': claim['lease_token'], 'prompt_hash': claim['prompt_hash'], 'model': claim['request']['model'], 'model_digest': 'a'*64, 'duration_ms': 100, 'result': {'domain': 'Videolocadora', 'reply': 'Vamos entender sua operação.', 'summary': 'Locação de mídias físicas; regras ainda não confirmadas.', 'questions': ['Quem registra a retirada?', 'Como funciona a devolução?'], 'assumptions': []}}


def test_conversation_persistence_provenance_and_audit_privacy(chat_setup):
    client, _, headers, project = chat_setup
    conversation, row = queued(chat_setup, text='Texto privado da entrevista 937-X')
    claim = command(chat_setup, f'/v1/chat-turns/{row["id"]}/claim').json()
    assert 'Texto privado' in json.dumps(claim['request'], ensure_ascii=False)
    body = completion(claim)
    done = command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', body, key='complete')
    assert done.status_code == 200
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', body, key='complete').json() == done.json()
    assert done.json()['provenance'] == 'local_client_report'
    history = client.get(f'/v1/conversations/{conversation["id"]}', headers=headers).json()
    assert history['summary'] == body['result']['summary']
    assert history['turns'][0]['result'] == body['result']
    assert 'lease_token' not in history['turns'][0] and 'prompt' not in history['turns'][0]
    events = client.get(f'/v1/projects/{project}/events', headers=headers).json()
    assert 'Texto privado da entrevista' not in json.dumps(events)
    assert command(chat_setup, f'/v1/conversations/{conversation["id"]}/turns', {'text': 'Resposta', 'expected_version': 1}).status_code == 409


def test_exclusive_claim_no_replay_and_expired_lease_rejected(chat_setup):
    client, app, headers, _ = chat_setup
    conversation, row = queued(chat_setup)
    path = f'/v1/chat-turns/{row["id"]}/claim'
    first = command(chat_setup, path, key='claim')
    assert first.status_code == 200
    assert command(chat_setup, path, key='claim').status_code == 409
    _, other = queued(chat_setup, text='Venda de automóveis')
    assert command(chat_setup, f'/v1/chat-turns/{other["id"]}/claim').status_code == 409
    with app.state.engine.begin() as connection:
        connection.execute(update(slot).values(lease_until=0))
        connection.execute(update(turns).where(turns.c.id == row['id']).values(lease_until=0))
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', completion(first.json())).status_code == 409
    second = command(chat_setup, path)
    assert second.status_code == 200 and second.json()['attempt'] == 2
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', completion(first.json())).status_code == 409


def test_cancel_and_failure_do_not_accept_late_result(chat_setup):
    _, app, _, _ = chat_setup
    _, row = queued(chat_setup)
    claim = command(chat_setup, f'/v1/chat-turns/{row["id"]}/claim').json()
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/fail', {'lease_token': claim['lease_token'], 'code': 'timeout'}).status_code == 200
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', completion(claim)).status_code == 409
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/cancel').status_code == 200
    with app.state.engine.connect() as connection:
        assert connection.execute(select(slot)).mappings().one()['lease_until'] > 0
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/claim').status_code == 409


def test_permissions_invalid_output_and_prompt_model_binding(chat_setup):
    client, app, headers, project = chat_setup
    conversation, row = queued(chat_setup)
    agent = app.state.test_credentials['agent']
    denied = client.post(f'/v1/projects/{project}/conversations', headers={'Authorization': 'Bearer '+agent['token'], 'Idempotency-Key': 'agent-chat'}, json={'title': 'Denied'})
    assert denied.status_code == 403
    assert client.get('/v1/conversations/unknown', headers=headers).status_code == 404
    claim = command(chat_setup, f'/v1/chat-turns/{row["id"]}/claim').json()
    body = completion(claim)
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', {**body, 'model': 'different'}).status_code == 409
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', {**body, 'result': {**body['result'], 'execute_shell': 'whoami'}}).status_code == 422
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', {**body, 'result': {**body['result'], 'questions': ['x']*5}}).status_code == 422
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', body).status_code == 200


def test_credentials_rejected_and_context_overflow_never_truncated(chat_setup):
    _, app, _, project = chat_setup
    conversation, _ = queued(chat_setup)
    assert command(chat_setup, f'/v1/conversations/{conversation["id"]}/turns', {'expected_version': 2, 'text': 'Bearer '+'x'*40}).status_code == 422
    fresh = command(chat_setup, f'/v1/projects/{project}/conversations', {'title': 'Unicode context'}).json()
    with app.state.engine.begin() as connection:
        from chat import conversations
        connection.execute(update(conversations).where(conversations.c.id == fresh['id']).values(summary='contexto '*1500))
    result = command(chat_setup, f'/v1/conversations/{fresh["id"]}/turns', {'expected_version': 1, 'text': '🙂'*2000})
    assert result.status_code == 409
    with app.state.engine.connect() as connection:
        assert connection.execute(select(turns).where(turns.c.conversation_id == fresh['id'])).first() is None


def test_answer_history_retained_and_interview_can_end(chat_setup):
    from chat import Interview
    assert Interview(domain='Loja', reply='Podemos avançar.', summary='Venda local.', questions=[], assumptions=[])
    client, _, headers, _ = chat_setup
    conversation, row = queued(chat_setup, 'Dois atendentes. Aluguel de DVDs por dois dias.')
    claim = command(chat_setup, f'/v1/chat-turns/{row["id"]}/claim').json()
    body = completion(claim)
    # Even a lossy model summary must not erase the original human answers.
    body['result']['summary'] = 'Videolocadora.'
    assert command(chat_setup, f'/v1/chat-turns/{row["id"]}/complete', body).status_code == 200
    history = client.get(f'/v1/conversations/{conversation["id"]}', headers=headers).json()
    next_turn = command(chat_setup, f'/v1/conversations/{conversation["id"]}/turns', {'text': 'Quero avançar.', 'intent': 'proposal', 'expected_version': history['version']}).json()
    claim = command(chat_setup, f'/v1/chat-turns/{next_turn["id"]}/claim').json()
    context = json.loads(claim['request']['messages'][1]['content'])
    assert context['historico'][0]['resposta_humana'] == 'Dois atendentes. Aluguel de DVDs por dois dias.'
    assert context['modo'] == 'proposal'
    assert claim['request']['format']['title'] == 'PlanningTree'
    assert command(chat_setup, f'/v1/chat-turns/{next_turn["id"]}/complete', completion(claim)).status_code == 422
    plan = [
        {'ref': 'o1', 'kind': 'outcome', 'parent_ref': None, 'title': 'Controlar locações', 'description': 'Reduzir erros manuais.', 'measure': 'Meta proposta: registrar todas as locações.', 'criteria': []},
        {'ref': 'e1', 'kind': 'epic', 'parent_ref': 'o1', 'title': 'Locações', 'description': 'Registrar retirada e devolução.', 'measure': '', 'criteria': []},
        {'ref': 's1', 'kind': 'story', 'parent_ref': 'e1', 'title': 'Registrar retirada', 'description': 'Como atendente, registro um DVD alugado.', 'measure': '', 'criteria': ['Dado um DVD disponível, registrar vencimento em dois dias.']},
    ]
    body = completion(claim)
    tree = {**body['result'], 'questions': [], 'outcome': {key: plan[0][key] for key in ('title', 'description', 'measure')}, 'epics': [{**{key: plan[1][key] for key in ('title', 'description')}, 'stories': [{key: plan[2][key] for key in ('title', 'description', 'criteria')}]}]}
    body['result'] = tree
    from chat import PlanningTree
    plan = PlanningTree(**tree).as_plan().model_dump()['proposal']
    assert command(chat_setup, f'/v1/chat-turns/{next_turn["id"]}/complete', body).status_code == 200
    # A backwards wall-clock adjustment must not make an old reply the latest.
    with chat_setup[1].state.engine.begin() as connection:
        connection.execute(update(turns).where(turns.c.id == row['id']).values(created_at='2099-01-01'))
        connection.execute(update(turns).where(turns.c.id == next_turn['id']).values(created_at='2000-01-01'))
    history = client.get(f'/v1/conversations/{conversation["id"]}', headers=headers).json()
    assert history['turns'][-1]['result']['proposal'] == plan
    assert client.get(f'/v1/projects/{history["project_id"]}/work-items', headers=headers).json()['items'] == []
    revised = command(chat_setup, f'/v1/conversations/{conversation["id"]}/turns', {'text': 'Ajuste a história s1.', 'intent': 'proposal', 'expected_version': history['version']}).json()
    claim = command(chat_setup, f'/v1/chat-turns/{revised["id"]}/claim').json()
    context = json.loads(claim['request']['messages'][1]['content'])
    assert context['proposta_anterior_para_revisao'] == plan


def test_planning_rejects_orphan_items_and_missing_criteria():
    from chat import PlanningAnswer
    from pydantic import ValidationError
    base = {'domain': 'Loja', 'reply': 'Proposta.', 'summary': 'Loja.', 'questions': [], 'assumptions': []}
    item = {'ref': 's1', 'kind': 'story', 'parent_ref': 'missing', 'title': 'Venda', 'description': 'Registrar venda.', 'measure': '', 'criteria': []}
    with pytest.raises(ValidationError):
        PlanningAnswer(**base, proposal=[item, {**item, 'ref': 's2'}, {**item, 'ref': 's3'}])


def test_question_budget_ends_interview_and_empty_root_is_normalized():
    from chat import ProposedItem, request_for
    assert request_for({'historico': [{}, {}]})['format']['properties']['questions']['maxItems'] == 0
    item = ProposedItem(ref='o', kind='outcome', parent_ref='', title='Resultado', description='Proposto', measure='Meta proposta', criteria=[])
    assert item.parent_ref is None


def test_tree_generates_links_and_rejects_model_supplied_parent_ids():
    from chat import PlanningTree
    from pydantic import ValidationError
    base = {'domain': 'Loja', 'reply': 'Proposta.', 'summary': 'Loja.', 'questions': [], 'assumptions': [], 'outcome': {'title': 'Resultado', 'description': 'Proposto', 'measure': 'Meta proposta'}, 'epics': [{'title': 'Vendas', 'description': 'Controle', 'stories': [{'title': 'Registrar venda', 'description': 'Como vendedor registro uma venda', 'criteria': ['A venda registrada aparece na consulta.']}]}]}
    result = PlanningTree(**base).as_plan()
    parents = {item.ref: item.kind for item in result.proposal}
    assert result.proposal[0].parent_ref is None
    assert parents[result.proposal[1].parent_ref] == 'outcome'
    assert parents[result.proposal[2].parent_ref] == 'epic'
    with pytest.raises(ValidationError):
        PlanningTree(**{**base, 'outcome': {**base['outcome'], 'parent_ref': 'proposal'}})
    with pytest.raises(ValidationError):
        PlanningTree(**{**base, 'epics': [{**base['epics'][0], 'stories': []}]})
