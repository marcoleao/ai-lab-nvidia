import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from control import create_app
from migrate import migrate
from runtime import seed_demo
from security import provision_identity


def test_empty_start_survives_reinitialization_without_erasing_future_human_work(tmp_path, monkeypatch):
    database = f'sqlite:///{tmp_path / "clean.db"}'
    migrate(database)
    engine = create_engine(database)
    human = provision_identity(engine, kind='human', admin=True, operator_id='test')
    state = tmp_path / 'state'
    state.mkdir()
    (state / 'access.json').write_text(json.dumps({'human': human}))
    (state / 'clean-start.json').write_text(json.dumps({'version': 1, 'mode': 'empty'}))
    monkeypatch.setenv('SDLC_STATE', str(state))
    seed_demo(database)
    seed_demo(database)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT COUNT(*) FROM projects')).scalar() == 0
    with TestClient(create_app(database)) as client:
        response = client.post('/v1/projects', headers={'Authorization': 'Bearer '+human['token'], 'Idempotency-Key': 'human-idea'}, json={'name': 'Primeira ideia do teste humano'})
        assert response.status_code == 200
    seed_demo(database)
    with engine.connect() as connection:
        assert connection.execute(text('SELECT COUNT(*) FROM projects')).scalar() == 1
    assert not (state / 'demo.json').exists()
    engine.dispose()
