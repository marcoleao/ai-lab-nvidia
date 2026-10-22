import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from control import create_app
from migrate import migrate
from runtime import initialize_access
from security import provision_identity


def test_empty_start_survives_reinitialization_without_erasing_future_human_work(tmp_path, monkeypatch):
    database = f'sqlite:///{tmp_path / "clean.db"}'
    migrate(database)
    engine = create_engine(database)
    human = provision_identity(engine, kind='human', admin=True, operator_id='test')
    state = tmp_path / 'state'
    state.mkdir()
    keys = {'human': human,
            'reader': provision_identity(engine, kind='human', operator_id='test'),
            'agent': provision_identity(engine, kind='agent', operator_id='test')}
    (state / 'access.json').write_text(json.dumps(keys))
    monkeypatch.setenv('SDLC_STATE', str(state))
    initialize_access(database)
    initialize_access(database)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT COUNT(*) FROM projects')).scalar() == 0
    with TestClient(create_app(database)) as client:
        response = client.post('/v1/projects', headers={'Authorization': 'Bearer '+human['token'], 'Idempotency-Key': 'human-idea'}, json={'name': 'Primeira ideia do teste humano'})
        assert response.status_code == 200
    initialize_access(database)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT COUNT(*) FROM projects')).scalar() == 1
    assert not (state / 'demo.json').exists()
    assert not (state / 'clean-start.json').exists()
    engine.dispose()


def test_fresh_installation_creates_only_access_configuration(tmp_path, monkeypatch):
    database = f'sqlite:///{tmp_path / "fresh.db"}'
    migrate(database)
    monkeypatch.setenv('SDLC_STATE', str(tmp_path / 'state'))
    initialize_access(database)
    access = tmp_path / 'state/access.json'
    original = access.read_bytes()
    initialize_access(database)
    assert access.read_bytes() == original
    engine = create_engine(database)
    try:
        with engine.connect() as connection:
            for table in ('projects', 'runs', 'approval_objects', 'approvals', 'events',
                          'outbox', 'commands', 'work_items', 'chat_conversations', 'chat_turns'):
                assert connection.execute(text(f'SELECT COUNT(*) FROM {table}')).scalar() == 0
            assert connection.execute(text('SELECT COUNT(*) FROM identities')).scalar() == 3
        # Legacy state never causes a new demo or deletes existing records.
        marker = tmp_path / 'state/demo.json'
        marker.write_text(json.dumps({'project_id': 'legacy-record'}))
        initialize_access(database)
        assert json.loads(marker.read_text()) == {'project_id': 'legacy-record'}
        from security import revoke_credential
        human = json.loads(original)['human']
        revoke_credential(engine, human['credential_id'], operator_id='test')
        initialize_access(database)
        with engine.connect() as connection:
            assert connection.execute(text('SELECT revoked FROM credentials WHERE id = :id'),
                                      {'id': human['credential_id']}).scalar() == 1
        assert access.read_bytes() == original
    finally:
        engine.dispose()


def test_missing_access_never_provisions_replacements(tmp_path, monkeypatch):
    import pytest
    database = f'sqlite:///{tmp_path / "missing.db"}'
    migrate(database)
    monkeypatch.setenv('SDLC_STATE', str(tmp_path / 'state'))
    initialize_access(database)
    access = tmp_path / 'state/access.json'
    keys = json.loads(access.read_bytes())
    access.unlink()
    with pytest.raises(RuntimeError, match='Existing identities'):
        initialize_access(database)
    keys['human']['token'] = 'wrong-token'
    access.write_text(json.dumps(keys))
    with pytest.raises(RuntimeError, match='differs from database'):
        initialize_access(database)
    engine = create_engine(database)
    try:
        with engine.connect() as connection:
            assert connection.execute(text('SELECT COUNT(*) FROM identities')).scalar() == 3
    finally:
        engine.dispose()
