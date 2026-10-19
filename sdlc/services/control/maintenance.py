"""Private maintenance tasks; no endpoint exposes encryption or owner access."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import tarfile

from sqlalchemy import create_engine, inspect, text
from cryptography.fernet import Fernet


def inventory():
    import os
    from runtime import database_url
    engine = create_engine(database_url('owner', os.environ.get('SDLC_VERIFY_DB')), hide_parameters=True)
    tables = ('projects', 'runs', 'approvals', 'approval_objects', 'events', 'commands', 'outbox', 'event_inbox', 'identities', 'credentials', 'memberships', 'security_events', 'browser_sessions', 'schema_migrations', 'work_items', 'work_item_versions', 'backlog_baselines')
    try:
        with engine.connect() as connection:
            tables += ('chat_conversations', 'chat_turns', 'chat_inference_slot')
            present = set(inspect(connection).get_table_names())
            counts = {table: connection.scalar(text('SELECT count(*) FROM ' + table)) for table in tables if table in present}
            chains = {}
            for row in connection.execute(text('SELECT project_id, sequence, payload, previous_hash, hash FROM events ORDER BY project_id, sequence')).mappings():
                previous, sequence = chains.get(row['project_id'], ('0' * 64, 0))
                from control import digest
                if row['previous_hash'] != previous or row['sequence'] != sequence + 1 or row['hash'] != digest({'project_id': row['project_id'], 'sequence': row['sequence'], 'previous_hash': previous, 'payload': json.loads(row['payload'])}):
                    raise RuntimeError('Audit chain validation failed')
                chains[row['project_id']] = (row['hash'], row['sequence'])
            return {'counts': counts, 'audit_heads': chains}
    finally:
        engine.dispose()


def private_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to('/backups'):
        raise ValueError('Maintenance paths must stay in /backups')
    return path


def encrypt(source, target):
    source, target = private_path(source), private_path(target)
    if source.stat().st_size > 256 * 1024 * 1024:
        raise ValueError('Acceptance backup exceeds the 256 MiB encryption budget')
    key = base64.urlsafe_b64encode(hashlib.sha256(Path('/run/secrets/backup_key').read_bytes().strip()).digest())
    target.write_bytes(Fernet(key).encrypt(source.read_bytes()))
    target.chmod(0o600)


def extract(source, target):
    source, target = private_path(source), private_path(target)
    if source.stat().st_size > 360 * 1024 * 1024:
        raise ValueError('Encrypted backup exceeds acceptance budget')
    key = base64.urlsafe_b64encode(hashlib.sha256(Path('/run/secrets/backup_key').read_bytes().strip()).digest())
    data = Fernet(key).decrypt(source.read_bytes())
    if len(data) > 256 * 1024 * 1024:
        raise ValueError('Decrypted backup exceeds acceptance budget')
    import io
    target.mkdir(mode=0o700, parents=True, exist_ok=False)
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        size = 0
        members = archive.getmembers()
        for member in members:
            path = Path(member.name)
            if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe backup member')
            if path.parts and path.parts[0] not in {'state', '.secrets', 'db.dump', 'inventory.json', 'forgejo', 'forgejo-inventory.json'}:
                raise ValueError('Unexpected backup member')
            size += member.size
        if size > 256 * 1024 * 1024:
            raise ValueError('Backup extraction exceeds acceptance budget')
        archive.extractall(target, members=members, filter='data')


def verify_privileges():
    from runtime import database_url
    from sqlalchemy.exc import DBAPIError
    for role, statements in {
        'api': ['UPDATE identities SET admin = admin WHERE false', 'UPDATE credentials SET token_hash = token_hash WHERE false', 'UPDATE events SET hash = hash WHERE false', 'DELETE FROM events WHERE false', 'UPDATE work_item_versions SET payload = payload WHERE false', 'DELETE FROM work_item_versions WHERE false', 'UPDATE backlog_baselines SET object_id = object_id WHERE false', 'CREATE TABLE public.privilege_probe (id INTEGER)'],
        'consumer': ['UPDATE identities SET active = active WHERE false', 'UPDATE events SET hash = hash WHERE false', 'CREATE TABLE public.privilege_probe (id INTEGER)'],
    }.items():
        engine = create_engine(database_url(role), hide_parameters=True)
        try:
            with engine.connect() as connection:
                flags = connection.execute(text('SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user')).one()
                if any(flags):
                    raise RuntimeError('Unexpected administrative database role')
            for statement in statements:
                try:
                    with engine.begin() as connection:
                        connection.execute(text(statement))
                        raise RuntimeError('Forbidden database operation was allowed')
                except DBAPIError as error:
                    if getattr(error.orig, 'sqlstate', None) != '42501':
                        raise
        finally:
            engine.dispose()
    print('[OK] Restricted roles cannot elevate identities, modify audit history or create application tables.')


if __name__ == '__main__':
    command, *args = sys.argv[1:]
    if command == 'inventory' and not args:
        print(json.dumps(inventory(), sort_keys=True))
    elif command == 'privileges' and not args:
        verify_privileges()
    elif command == 'encrypt' and len(args) == 2:
        encrypt(*args)
    elif command == 'extract' and len(args) == 2:
        extract(*args)
    elif command == 'compare' and len(args) == 2:
        if json.loads(private_path(args[0]).read_text()) != json.loads(private_path(args[1]).read_text()):
            raise SystemExit('Restored inventory differs from the backup')
        print('[OK] Restored row counts and audit chains match the encrypted backup.')
    else:
        raise SystemExit('Unsupported maintenance command')
