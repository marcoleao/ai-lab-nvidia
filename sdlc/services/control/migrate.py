"""Apply immutable SQL migrations; production never uses metadata.create_all."""
from pathlib import Path
import hashlib

from sqlalchemy import create_engine, text


def migrate(database_url):
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            if engine.dialect.name == 'postgresql':
                connection.execute(text('SELECT pg_advisory_xact_lock(704631008)'))
            connection.execute(text('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR PRIMARY KEY, sha256 VARCHAR NOT NULL)'))
            applied = dict(connection.execute(text('SELECT version, sha256 FROM schema_migrations')).all())
            files = sorted((Path(__file__).parent / 'migrations').glob('*.sql'))
            if set(applied) - {file.stem for file in files}:
                raise RuntimeError('Database contains unknown migration versions')
            for file in files:
                source = file.read_bytes()
                checksum = hashlib.sha256(source).hexdigest()
                if file.stem in applied:
                    if applied[file.stem] != checksum:
                        raise RuntimeError('Applied migration checksum changed')
                    continue
                for statement in source.decode().split(';'):
                    if statement.strip():
                        connection.execute(text(statement))
                connection.execute(text('INSERT INTO schema_migrations (version, sha256) VALUES (:version, :sha256)'), {'version': file.stem, 'sha256': checksum})
    finally:
        engine.dispose()
