"""Provision the restricted LAB runtime role without printing a password.

Uses the already provisioned local database owner and a separate secret file.
Run after migrations, before recreating the API. No business records are created.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from audit_admin import administrative_operation

ROOT = Path(__file__).resolve().parents[1]
SECRET = Path('/opt/agentic-sdlc/portal/secrets/database_runtime_password')


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run in the SDLC distro as root')
    if SECRET.is_symlink() or SECRET.parent.is_symlink():
        raise RuntimeError('Credential paths cannot be symlinks')
    check = subprocess.check_output(['docker', 'exec', 'sdlc-portal-foundation-db-1',
        'psql', '-X', '-U', 'sdlc', '-d', 'portal', '-At', '-c',
        "SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) "
        "AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=r.oid) "
        "AND NOT EXISTS (SELECT FROM pg_class WHERE relowner=r.oid) "
        "AND NOT EXISTS (SELECT FROM pg_namespace WHERE nspowner=r.oid) "
        "FROM pg_roles r WHERE rolname='sdlc_portal_app'"], text=True).strip()
    if check != 't':
        raise RuntimeError('Runtime database role is absent or has unexpected privileges')
    SECRET.parent.mkdir(parents=True, exist_ok=True)
    SECRET.parent.chmod(0o700)
    if not SECRET.exists():
        descriptor = os.open(SECRET, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o444)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(secrets.token_urlsafe(48))
    password = SECRET.read_text().strip()
    if not password or not all(c.isalnum() or c in '-_' for c in password):
        raise RuntimeError('Invalid runtime credential')
    subprocess.run(['docker', 'exec', '-i', 'sdlc-portal-foundation-db-1',
                    'psql', '-X', '-U', 'sdlc', '-d', 'portal', '-v', 'ON_ERROR_STOP=1'],
                   input="ALTER ROLE sdlc_portal_app PASSWORD '" + password + "';\n",
                   text=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    override = {'services': {'api': {'environment': {
        'DATABASE_URL': 'postgresql://sdlc_portal_app@db:5432/portal',
        'DATABASE_PASSWORD_FILE': '/run/secrets/portal_database_runtime_password'},
        'secrets': ['portal_database_runtime_password']}},
        'secrets': {'portal_database_runtime_password': {'file': str(SECRET)}}}
    destination = ROOT / '.prepared/compose.audit.json'
    fd, temporary = tempfile.mkstemp(dir=destination.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(override, stream, indent=2)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Restricted runtime role configured; credential retained outside the repository.')


if __name__ == '__main__':
    with administrative_operation('DATABASE_RUNTIME_ROLE_CONFIGURED', source='portal-runtime-role',
                                  details={'scope':'portal-foundation-database-runtime'}):
        main()
