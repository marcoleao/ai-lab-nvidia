#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || exit 1
source_dir=${1:?Windows source path required}
[[ -f $source_dir/compose.yaml && -f $source_dir/.state/runtime.env ]] || exit 1
target=/opt/ai-local-lab
# App edits in /workspace survive normal sync; Windows source wins on same-path conflict.
# Runtime files are excluded from the workspace, including source Git credentials/history.
rsync -a --delete --exclude=.git --exclude=.env --exclude=.logs --exclude=.state --exclude=.cache --exclude=.runtime-logs --exclude=.offline-manifest.json \
  --exclude=.venv --exclude=node_modules --exclude=__pycache__ --exclude=workspace --exclude=audit --exclude=lib "$source_dir/" "$target/"
rsync -a --exclude=.git --exclude=.env --exclude=.logs --exclude=.state --exclude=.cache \
  --exclude=.venv --exclude=node_modules --exclude=__pycache__ --exclude=workspace --exclude=audit --exclude=lib "$source_dir/" "$target/workspace/"
mkdir -p "$target/lib"
install -m 600 "$source_dir/../sdlc/scripts/audit_admin.py" "$target/lib/audit_admin.py"
install -m 600 "$source_dir/../sdlc/scripts/wsl_clock.py" "$target/lib/wsl_clock.py"
install -m 600 "$source_dir/.env" "$target/.env"
install -m 600 "$source_dir/.state/runtime.env" "$target/.runtime.env"
chown -R lab:lab "$target"
# YAML supported schema is validated before data becomes shell arguments.
awk '
  /^[[:space:]]*(#.*)?$/ { next }
  /^ollama:$/ { if (state != 0) exit 1; state=1; next }
  /^  models:$/ { if (state != 1) exit 1; state=2; next }
  /^    - [a-zA-Z0-9][a-zA-Z0-9._\/:@-]*$/ {
    if (state != 2) exit 1; sub(/^    - /, ""); print; count++; next
  }
  { exit 1 }
  END { if (state != 2 || count == 0) exit 1 }
' "$target/config/models.yaml" >"$target/.models"
chmod 600 "$target/.models"
chown lab:lab "$target/.models"
echo '[OK] Repository synced to Linux ext4; secrets restricted to owner'
