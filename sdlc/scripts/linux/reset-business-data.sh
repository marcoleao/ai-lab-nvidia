#!/usr/bin/env bash
# Destructive operator action. No backup is created: the operator requested erasure.
set -Eeuo pipefail
umask 077
[[ ${1:-} == --erase-all-sdlc-data && $EUID == 0 ]] || exit 1
root=/opt/agentic-sdlc
[[ ! -L $root && $(realpath "$root") == "$root" && -f $root/.owner && $(cat "$root/.owner") == $(cat /etc/agentic-sdlc-owner) ]] || exit 1
for directory in state backups forgejo forgejo/data .secrets; do
  [[ -d $root/$directory && ! -L $root/$directory ]] || exit 1
done
audit_module=$(realpath "$(dirname "${BASH_SOURCE[0]}")/../audit_admin.py")
audit_operation=$(python3 "$audit_module" begin --root "$root" --action ACCEPTANCE_DATA_RESET --source reset-business-data --metadata '{"scope":"legacy-database-and-forgejo","reasonCode":"OPERATOR_REQUESTED_ERASURE"}')
export SDLC_ADMIN_OPERATION_ID="$audit_operation"
audit_reset_exit() {
  local audit_status=$? audit_outcome=UNKNOWN
  trap - EXIT
  if [[ $audit_status == 0 ]]; then audit_outcome=SUCCEEDED; fi
  python3 "$audit_module" end --root "$root" --action ACCEPTANCE_DATA_RESET --source reset-business-data \
    --operation-id "$audit_operation" --outcome "$audit_outcome" --metadata "{\"exitCode\":$audit_status}" || {
    echo 'Reset audit finalization failed; inspect the pending operation.' >&2
    if [[ $audit_status == 0 ]]; then audit_status=1; fi
  }
  exit "$audit_status"
}
trap audit_reset_exit EXIT
compose() { docker compose --project-name agentic-sdlc --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" "$@"; }
# Stop every writer and user entry before resetting either store.
compose stop -t 20 entry portal consumer forgejo
compose run --rm --no-deps initialize python - <<'PY'
import hashlib,json
from pathlib import Path
import psycopg
from psycopg import sql
from runtime import database_url
state=Path('/state')
keys=json.loads((state/'access.json').read_text())
tables={'projects','runs','approvals','events','commands','outbox','approval_objects','memberships','security_events','event_inbox','browser_sessions','work_items','work_item_versions','backlog_baselines','chat_conversations','chat_turns','chat_inference_slot'}
with psycopg.connect(database_url('owner').render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')) as connection:
    actual={row[0] for row in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")}
    if actual != tables|{'identities','credentials','schema_migrations'}:
        raise RuntimeError('Unexpected database tables; refusing incomplete reset')
    retained=[]
    for name in ('human','reader','agent'):
        key=keys[name]
        row=connection.execute('SELECT identity_id,token_hash FROM credentials WHERE id=%s',(key['credential_id'],)).fetchone()
        if row != (key['id'],hashlib.sha256(key['token'].encode()).hexdigest()):
            raise RuntimeError('Access credentials differ from operator state')
        retained.append(key)
    connection.execute(sql.SQL('TRUNCATE {}').format(sql.SQL(',').join(map(sql.Identifier, sorted(tables)))))
    connection.execute('INSERT INTO chat_inference_slot (id,turn_id,lease_until) VALUES (1,NULL,0)')
    connection.execute('DELETE FROM credentials WHERE NOT (id = ANY(%s))',([key['credential_id'] for key in retained],))
    connection.execute('DELETE FROM identities WHERE NOT (id = ANY(%s))',([key['id'] for key in retained],))
print('[OK] All business records, audit history, sessions and test identities erased; installed access retained.')
PY
python3 - "$root" <<'PY'
from datetime import datetime,timezone
import json,pathlib,shutil,sys
root=pathlib.Path(sys.argv[1])
def clear(directory, keep=()):
    directory=directory.resolve(strict=True)
    if not directory.is_relative_to(root): raise RuntimeError('Path outside owned SDLC')
    for child in directory.iterdir():
        if child.name in keep: continue
        if child.is_symlink(): child.unlink(); continue
        if not child.resolve().is_relative_to(directory): raise RuntimeError('Path escape')
        if child.is_dir(): shutil.rmtree(child)
        else: child.unlink()
# Keep only access and installation/network metadata; remove dumps and reports.
clear(root/'state', {'access.json','installed-manifest.json','network-allocation.json'})
clear(root/'backups')
clear(root/'forgejo/data')
token=root/'.secrets/forgejo_token'
if token.is_symlink(): raise RuntimeError('Token cannot be a symlink')
token.write_text('')
marker=root/'state/clean-start.json'
marker.write_text(json.dumps({'version':1,'mode':'empty','reset_at':datetime.now(timezone.utc).isoformat()}))
marker.chmod(0o600)
import os
os.chown(marker,10001,10001)
print('[OK] Forgejo data, local backups and runtime reports erased; demonstration seeding disabled.')
PY
# Remove old container logs as well; retain the PostgreSQL volume and installation.
bash "$root/source/scripts/linux/runtime.sh" "$root" down
bash "$root/source/scripts/linux/runtime.sh" "$root" up
# Explicit initialization proves that the next up/backup will not recreate examples.
compose run --rm --no-deps initialize
compose run --rm --no-deps initialize python - <<'PY'
import psycopg
from psycopg import sql
from runtime import database_url
with psycopg.connect(database_url('owner').render_as_string(hide_password=False).replace('postgresql+psycopg:', 'postgresql:')) as connection:
    with connection.transaction():
        connection.execute('SET TRANSACTION READ ONLY')
        names = [row[0] for row in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")]
        for name in names:
            if name in {'identities', 'credentials', 'schema_migrations', 'chat_inference_slot'}:
                continue
            if connection.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(name))).fetchone()[0] != 0:
                raise RuntimeError('Reset verification found retained operational records')
print('[OK] Read-only post-restart verification confirms an empty operational database.')
PY
python3 "$audit_module" epoch --root "$root" --operation-id "$audit_operation" --source reset-business-data >/dev/null
python3 "$audit_module" validate --root "$root" >/dev/null
echo '[OK] Empty SDLC restarted. Do not run the synthetic acceptance command before the human test.'
