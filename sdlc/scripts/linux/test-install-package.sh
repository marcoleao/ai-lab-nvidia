#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || exit 1
source_dir=$(cd "$(dirname "$0")/../.." && pwd)
identifier=$(cat /proc/sys/kernel/random/uuid)
root="/tmp/sdlc-package-$identifier"
project="sdlc-package-$identifier"
[[ $root =~ ^/tmp/sdlc-package-[a-f0-9-]+$ ]] || exit 1
install -d -m 700 "$root"
openssl rand -hex 16 >"$root/.owner"
printf %s "$project" >"$root/.project"
cleanup() {
  local result=$?
  if [[ -f $root/gitlab-demo/compose.yaml && -f $root/gitlab-demo/images.env ]]; then
    GITLAB_PORT=3278 DEMO_PORT=3279 docker compose --project-name "${project}-demo" --project-directory "$root/gitlab-demo" --env-file "$root/gitlab-demo/images.env" -f "$root/gitlab-demo/compose.yaml" down -v >/dev/null 2>&1 || true
    python3 "$source_dir/scripts/linux/network-guard.py" "${project}-demo" remove || true
  fi
  if [[ -f $root/compose.yaml ]]; then
    if [[ $result -ne 0 ]]; then docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" logs --tail 50 portal consumer entry forgejo >&2 || true; fi
    docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" down -v >/dev/null 2>&1 || true
  fi
  python3 "$source_dir/scripts/linux/network-guard.py" "$project" remove || true
  [[ $root =~ ^/tmp/sdlc-package-[a-f0-9-]+$ && ! -L $root ]] || exit 1
  rm -rf -- "$root"
}
trap cleanup EXIT
runtime="$source_dir/scripts/linux/runtime.sh"
bash "$runtime" "$root" prepare "$source_dir" 3198
runtime="$root/source/scripts/linux/runtime.sh"
bash "$runtime" "$root" up
docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" run --rm --no-deps acceptance python -c "import httpx; from pathlib import Path; c=httpx.Client(base_url='http://forgejo:3000/api/v1',headers={'Authorization':'token '+Path('/run/secrets/forgejo_token').read_text().strip()}); r=c.get('/user'); print('Integration account HTTP',r.status_code,'admin=',r.json().get('is_admin'),'active=',r.json().get('active')); r=c.post('/user/repos',json={'name':'synthetic-probe','private':True,'auto_init':False}); print('Repository creation HTTP',r.status_code, r.json().get('message','created'))"
[[ $(docker network inspect "${project}_core" --format '{{.Internal}}') == true ]] || exit 1
bash "$runtime" "$root" test
docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" run --rm --no-deps initialize python maintenance.py privileges
bash "$runtime" "$root" revoke-access reader
docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" run --rm --no-deps acceptance python acceptance.py reader-check revoked
bash "$runtime" "$root" rotate-access reader
docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" run --rm --no-deps acceptance python acceptance.py reader-check active
bash "$runtime" "$root" restart
bash "$runtime" "$root" test
bash "$runtime" "$root" backup
file=$(find "$root/backups" -maxdepth 1 -name 'sdlc-*.fernet' -type f | sort | tail -1)
backup_id=$(basename "$file" .fernet)
bash "$runtime" "$root" restore-check "$backup_id"
tampered="${backup_id%-*}-deadbeef"
cp "$file" "$root/backups/$tampered.fernet"
python3 - "$root/backups/$tampered.fernet" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1]); value=path.read_bytes(); path.write_bytes((b'A' if value[:1]!=b'A' else b'B')+value[1:])
PY
chown 10001:10001 "$root/backups/$tampered.fernet"
if bash "$runtime" "$root" restore-check "$tampered" >"$root/tamper-test.log" 2>&1; then
  echo 'Tampered backup was accepted'; exit 1
fi
python3 - "$root/tamper-test.log" <<'PY'
from pathlib import Path
import sys
assert 'InvalidToken' in Path(sys.argv[1]).read_text(), 'Expected authenticated decryption failure'
PY
[[ -z $(find "$root/backups" -maxdepth 1 -name '.restore-*' -print -quit) ]] || exit 1
echo '[OK] Tampered backup rejected; temporary restore area removed.'
echo '[OK] Independent Compose package, restricted roles, consumer, restart and encrypted restore check.'
bash "$runtime" "$root" down
[[ -z $(docker ps -q --filter "label=com.docker.compose.project=$project") ]] || exit 1
[[ -z $(docker ps -q --filter "label=com.docker.compose.project=${project}-demo") ]] || exit 1
echo '[OK] Unified shutdown stopped the control nucleus, GitLab and Runner.'
