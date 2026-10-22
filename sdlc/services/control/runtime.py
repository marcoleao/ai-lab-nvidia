"""Entrypoints for the locally installed acceptance nucleus."""
from pathlib import Path
import json
import os
import time
import hashlib
import secrets
from uuid import uuid4

from sqlalchemy import URL, create_engine, select, text, update


def database_url(role='api', database=None):
    names = {'api': 'control_api', 'consumer': 'control_consumer', 'owner': 'sdlc_owner'}
    password = Path(f'/run/secrets/{role}_password').read_text().strip()
    return URL.create('postgresql+psycopg', username=names[role], password=password, host=os.environ.get('SDLC_DB_HOST', 'db'), database=database or 'sdlc', query={'connect_timeout': '5'})


def application():
    from control import create_app
    from backlog import Forgejo
    token = Path('/run/secrets/forgejo_token').read_text().strip()
    if len(token) != 40 or any(c not in '0123456789abcdef' for c in token):
        raise RuntimeError('Invalid backlog integration credential')
    return create_app(database_url(), portal_origin=os.environ['SDLC_PORTAL_ORIGIN'], allow_insecure_local=os.environ.get('SDLC_ACCEPTANCE_HTTP') == 'true', forgejo=Forgejo(token))


def initialize():
    from migrate import migrate
    import psycopg
    from psycopg import sql
    owner_url = database_url('owner')
    migrate(owner_url)
    with psycopg.connect(owner_url.render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')) as connection:
        for role, tables in {
            'api': {'select': 'identities, credentials, schema_migrations', 'select, insert, update': 'browser_sessions, projects, runs, approval_objects, approvals, outbox, work_items, chat_conversations, chat_turns', 'select, update': 'chat_inference_slot', 'select, insert': 'events, commands, security_events, work_item_versions, backlog_baselines', 'select, insert, update, delete': 'memberships'},
            'consumer': {'select': 'events', 'select, update': 'outbox', 'select, insert': 'event_inbox'},
        }.items():
            name = 'control_' + role
            password = Path(f'/run/secrets/{role}_password').read_text().strip()
            if not connection.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (name,)).fetchone():
                connection.execute(sql.SQL('CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Identifier(name), sql.Literal(password)))
            else:
                connection.execute(sql.SQL('ALTER ROLE {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}').format(sql.Identifier(name), sql.Literal(password)))
            connection.execute(sql.SQL('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}').format(sql.Identifier(name)))
            connection.execute(sql.SQL('GRANT USAGE ON SCHEMA public TO {}').format(sql.Identifier(name)))
            for permissions, names in tables.items():
                connection.execute(sql.SQL('GRANT ' + permissions + ' ON ' + names + ' TO {}').format(sql.Identifier(name)))
            if role == 'api':
                # PostgreSQL row locks require UPDATE on at least one column.
                # No permission is granted to change kind/admin/active/token_hash.
                connection.execute('GRANT UPDATE (id) ON identities, credentials TO control_api')
        connection.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    initialize_access(owner_url)


def initialize_access(owner_url):
    """Provision configuration only; preserve existing keys and all human work."""
    from security import provision_identity
    state = Path(os.environ.get('SDLC_STATE', '/state'))
    state.mkdir(parents=True, exist_ok=True)
    key_file = state / 'access.json'
    engine = create_engine(owner_url, hide_parameters=True)
    try:
        if key_file.exists():
            # A revoked key must remain revoked. Restart must not rotate it or
            # provision a replacement identity behind the operator's back.
            keys = json.loads(key_file.read_text())
            if not isinstance(keys, dict) or not {'human', 'reader', 'agent'} <= keys.keys():
                raise RuntimeError('Incomplete access state; restore credentials before initialization')
            from security import credentials, identities
            with engine.connect() as connection:
                for entry in keys.values():
                    identity = connection.execute(select(identities.c.id).where(
                        identities.c.id == entry['id'])).first()
                    credential = connection.execute(select(credentials.c.id).where(
                        credentials.c.id == entry['credential_id'],
                        credentials.c.identity_id == entry['id'],
                        credentials.c.token_hash == hashlib.sha256(entry['token'].encode()).hexdigest())).first()
                    if identity is None or credential is None:
                        raise RuntimeError('Access state differs from database; restore consistent credentials')
            return
        from security import identities
        with engine.connect() as connection:
            if connection.execute(select(identities.c.id).limit(1)).first():
                raise RuntimeError('Existing identities without access state; restore credentials before initialization')
        keys = {
            'human': provision_identity(engine, kind='human', admin=True, operator_id='configuration-bootstrap'),
            'reader': provision_identity(engine, kind='human', operator_id='configuration-bootstrap'),
            'agent': provision_identity(engine, kind='agent', operator_id='configuration-bootstrap'),
        }
        # Restrict permissions before writing credential material.
        descriptor = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as output:
            json.dump(keys, output)
    finally:
        engine.dispose()

def consume():
    from dispatcher import process_one
    import signal
    from threading import Event
    stopped = Event()
    signal.signal(signal.SIGTERM, lambda *_: stopped.set())
    signal.signal(signal.SIGINT, lambda *_: stopped.set())
    engine = create_engine(database_url('consumer'), hide_parameters=True, pool_pre_ping=True)
    try:
        while not stopped.is_set():
            try:
                result = process_one(engine)
                Path('/tmp/consumer-heartbeat').write_text(str(time.time()))
                if result in {'idle', 'failed', 'retry'}:
                    stopped.wait(1)
            except Exception as error:
                print('Consumer temporarily unavailable: ' + type(error).__name__, flush=True)
                stopped.wait(3)
    finally:
        engine.dispose()


def change_access(command, identity):
    from security import credentials, security_event
    from sqlalchemy import insert
    if identity not in {'human', 'reader'}:
        raise ValueError('Choose human or reader')
    state = Path(os.environ.get('SDLC_STATE', '/state')) / 'access.json'
    keys = json.loads(state.read_text())
    entry = keys[identity]
    engine = create_engine(database_url('owner'), hide_parameters=True)
    try:
        with engine.begin() as connection:
            connection.execute(update(credentials).where(credentials.c.identity_id == entry['id']).values(revoked=1))
            security_event(connection, 'local-operator', 'credential.revoked', entry['id'])
            if command == 'rotate-access':
                entry['token'], entry['credential_id'] = secrets.token_urlsafe(48), str(uuid4())
                connection.execute(insert(credentials).values(id=entry['credential_id'], identity_id=entry['id'], token_hash=hashlib.sha256(entry['token'].encode()).hexdigest(), revoked=0))
                security_event(connection, 'local-operator', 'credential.rotated', entry['id'])
        if command == 'rotate-access':
            temporary = state.with_suffix('.new')
            temporary.write_text(json.dumps(keys)); temporary.chmod(0o600)
            temporary.replace(state)
    finally:
        engine.dispose()
    print('[OK] Access changed; no credential was printed. Use access to copy the current key when needed.')


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['initialize']:
        initialize()
        print('Schema, restricted roles and access configuration ready; no demonstration data created. Credentials remain in the private state directory.')
    elif sys.argv[1:] == ['consume']:
        consume()
    elif len(sys.argv) == 3 and sys.argv[1] in {'revoke-access', 'rotate-access'}:
        change_access(sys.argv[1], sys.argv[2])
    else:
        raise SystemExit('Usage: runtime.py initialize|consume')
