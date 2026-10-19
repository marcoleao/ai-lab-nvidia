from concurrent.futures import ThreadPoolExecutor
import os

import pytest
from sqlalchemy import create_engine, func, select

import dispatcher
from dispatcher import inbox, process_one, queue
from test_control import setup


def drain(engine):
    while process_one(engine) == 'delivered':
        pass


def test_replay_of_delivered_message_does_not_duplicate_projection(setup):
    _, app, _, project = setup
    drain(app.state.engine)
    with app.state.engine.begin() as connection:
        message = connection.execute(select(queue).join(inbox, inbox.c.event_id == queue.c.event_id).where(inbox.c.project_id == project)).mappings().first()
        connection.execute(queue.update().where(queue.c.id == message['id']).values(state='pending'))
    assert process_one(app.state.engine) == 'delivered'
    with app.state.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(inbox).where(inbox.c.project_id == project)) == 2


def test_failure_rolls_back_projection_and_retry_survives_restart(setup, monkeypatch):
    _, app, _, project = setup
    drain(app.state.engine)
    with app.state.engine.begin() as connection:
        selected = connection.execute(select(queue).join(inbox, inbox.c.event_id == queue.c.event_id).where(inbox.c.project_id == project)).mappings().first()
        connection.execute(inbox.delete().where(inbox.c.event_id == selected['event_id']))
        connection.execute(queue.update().where(queue.c.id == selected['id']).values(state='pending'))
    original = dispatcher.index_event
    def broken(connection, event):
        original(connection, event)
        raise RuntimeError('Simulated failure after effect, before commit')
    monkeypatch.setattr(dispatcher, 'index_event', broken)
    assert process_one(app.state.engine) == 'retry'
    with app.state.engine.connect() as connection:
        assert connection.execute(select(inbox).where(inbox.c.event_id == selected['event_id'])).first() is None
        assert connection.scalar(select(queue.c.attempts).where(queue.c.id == selected['id'])) == 1
    monkeypatch.setattr(dispatcher, 'index_event', original)
    restarted = create_engine(app.state.engine.url)
    assert process_one(restarted) == 'delivered'
    restarted.dispose()


def test_repeated_failure_stops_at_budget(setup, monkeypatch):
    _, app, _, project = setup
    drain(app.state.engine)
    with app.state.engine.begin() as connection:
        row = connection.execute(select(queue).join(inbox, inbox.c.event_id == queue.c.event_id).where(inbox.c.project_id == project)).mappings().first()
        connection.execute(queue.update().where(queue.c.id == row['id']).values(state='pending'))
    def broken(connection, event):
        raise RuntimeError('Do not persist sensitive error text')
    monkeypatch.setattr(dispatcher, 'index_event', broken)
    assert [process_one(app.state.engine) for _ in range(3)] == ['retry', 'retry', 'failed']
    assert process_one(app.state.engine) == 'idle'


def test_postgres_consumers_process_once(setup):
    if not os.environ.get('CONTROL_TEST_DATABASE_URL', '').startswith('postgresql'):
        pytest.skip('PostgreSQL queue locking test')
    client, app, headers, project = setup
    for number in range(12):
        assert client.post('/v1/runs', headers={**headers, 'Idempotency-Key': f'run-{number}'}, json={'project_id': project}).status_code == 200
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: drain(app.state.engine), range(4)))
    with app.state.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(inbox).where(inbox.c.project_id == project)) == 14


def test_failed_message_retry_requires_manager_and_is_audited(setup):
    client, app, headers, project = setup
    drain(app.state.engine)
    with app.state.engine.begin() as connection:
        row = connection.execute(select(queue).join(inbox, inbox.c.event_id == queue.c.event_id).where(inbox.c.project_id == project)).mappings().first()
        connection.execute(queue.update().where(queue.c.id == row['id']).values(state='failed', attempts=3))
    pending = client.get(f'/v1/projects/{project}/processing', headers=headers).json()
    assert pending[0]['state'] == 'failed'
    path = f'/v1/projects/{project}/processing/{row["id"]}/retry'
    agent_headers = {'Authorization': f'Bearer {app.state.test_credentials["agent"]["token"]}', 'Idempotency-Key': 'agent-retry'}
    assert client.post(path, headers=agent_headers).status_code == 403
    retry_headers = {**headers, 'Idempotency-Key': 'manager-retry'}
    result = client.post(path, headers=retry_headers)
    assert result.status_code == 200
    assert client.post(path, headers=retry_headers).json() == result.json()
    history = client.get(f'/v1/projects/{project}/events', headers=headers).json()
    assert __import__('json').loads(history[-1]['payload'])['kind'] == 'processing.retry_requested'
    drain(app.state.engine)
    assert client.get(f'/v1/projects/{project}/processing', headers=headers).json() == []
