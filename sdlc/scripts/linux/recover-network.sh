#!/usr/bin/env bash
# One-time repair for the pre-chat package. Never deletes volumes or lab networks.
set -Eeuo pipefail
umask 077
root=/opt/agentic-sdlc
[[ $EUID == 0 && ! -L $root && -f $root/.owner && $(cat "$root/.owner") == $(cat /etc/agentic-sdlc-owner) ]] || exit 1
compose() { docker compose --project-name agentic-sdlc --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" "$@"; }
[[ ! -e $root/state/network-allocation.json ]] || { echo 'Network already allocated; inspect before repeating recovery'; exit 1; }
source_dir=$(cd "$(dirname "$0")/../.." && pwd)
python3 "$source_dir/services/control/network_allocation.py" "$root" agentic-sdlc >"$root/state/network-recovery.env"
compose stop -t 20 portal consumer forgejo
# pg_dump uses the DB container's local socket, avoiding the damaged bridge.
identifier="network-recovery-$(date -u +%Y%m%dT%H%M%SZ)"
plain="$root/backups/.$identifier.dump"
compose exec -T db pg_dump -U sdlc_owner -d sdlc -Fc --no-owner --no-privileges >"$plain"
chown 10001:10001 "$plain"
app_image=$(sed -n 's/^SDLC_APP_IMAGE=//p' "$root/runtime.env")
docker run --rm --network none --read-only --tmpfs /tmp:mode=1777 \
  -v "$root/backups:/backups" -v "$root/.secrets/backup_key:/run/secrets/backup_key:ro" \
  "$app_image" python maintenance.py encrypt "/backups/.$identifier.dump" "/backups/$identifier.dump.fernet"
rm -- "$plain"
cp "$root/compose.yaml" "$root/state/compose-before-network-recovery.yaml"
python3 - "$root" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]); value=json.loads((root/'state/network-allocation.json').read_text())
source=(root/'compose.yaml').read_text()
old='  front: {}\n  core:\n    internal: true'
new=f'  front:\n    ipam:\n      config: [{{subnet: "{value["front"]}"}}]\n  core:\n    internal: true\n    ipam:\n      config: [{{subnet: "{value["core"]}"}}]'
if source.count(old)!=1: raise SystemExit('Unexpected old network template; refusing patch')
(root/'compose.yaml').write_text(source.replace(old,new))
PY
compose config --quiet
# Recreate only this project's networks and containers; retain the database volume.
compose down
compose up -d --no-build --pull never
echo "[OK] SDLC networks recovered; encrypted logical database safeguard: $identifier.dump.fernet"
