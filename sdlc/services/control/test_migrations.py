import pytest
from sqlalchemy import create_engine, text

from migrate import migrate


def test_changed_migration_is_rejected(tmp_path):
    url = f'sqlite:///{tmp_path / "control.db"}'
    migrate(url)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("UPDATE schema_migrations SET sha256 = 'tampered' WHERE version = '0001_control'"))
    with pytest.raises(RuntimeError, match='checksum changed'):
        migrate(url)
    engine.dispose()


def test_upgrade_preserves_existing_data(tmp_path):
    # Exercise the actual first migration, seed data, then apply the remaining files.
    from pathlib import Path
    import hashlib
    url = f'sqlite:///{tmp_path / "upgrade.db"}'
    engine = create_engine(url)
    file = Path(__file__).parent / 'migrations/0001_control.sql'
    source = file.read_bytes()
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE schema_migrations (version VARCHAR PRIMARY KEY, sha256 VARCHAR NOT NULL)'))
        for statement in source.decode().split(';'):
            if statement.strip():
                connection.execute(text(statement))
        connection.execute(text('INSERT INTO schema_migrations VALUES (:version, :sha256)'), {'version': file.stem, 'sha256': hashlib.sha256(source).hexdigest()})
        connection.execute(text("INSERT INTO projects VALUES ('existing', 'Keep me')"))
    migrate(url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT name FROM projects WHERE id = 'existing'")) == 'Keep me'
        assert connection.scalar(text('SELECT count(*) FROM schema_migrations')) == len(list(file.parent.glob('*.sql')))
    engine.dispose()
