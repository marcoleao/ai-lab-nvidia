#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || exit 1
source_dir=${1:?Windows source path required}
[[ -f $source_dir/compose.yaml && -f $source_dir/.state/runtime.env ]] || exit 1
target=/opt/ai-local-lab
# App edits in /workspace survive normal sync; Windows source wins on same-path conflict.
# Runtime files are excluded from the workspace, including source Git credentials/history.
rsync -a --delete --exclude=.git --exclude=.env --exclude=.logs --exclude=.state --exclude=.cache --exclude=.runtime-logs --exclude=.offline-manifest.json \
  --exclude=.runtime.env --exclude=.models --exclude=.profile-selection.json \
  --exclude=.venv --exclude=node_modules --exclude=__pycache__ --exclude=workspace --exclude=audit --exclude=lib "$source_dir/" "$target/"
rsync -a --exclude=.git --exclude=.env --exclude=.logs --exclude=.state --exclude=.cache \
  --exclude=.venv --exclude=node_modules --exclude=__pycache__ --exclude=workspace --exclude=audit --exclude=lib "$source_dir/" "$target/workspace/"
mkdir -p "$target/lib"
install -m 600 "$source_dir/../sdlc/scripts/audit_admin.py" "$target/lib/audit_admin.py"
install -m 600 "$source_dir/../sdlc/scripts/wsl_clock.py" "$target/lib/wsl_clock.py"
install -m 600 "$source_dir/.env" "$target/.env"
chown -R lab:lab "$target"
# Validates the complete declaration and selects only this profile's models.
# The recorder preserves the prior selection and restores it on a write failure.
python3 "$target/scripts/linux/profile_assets.py" select --incoming "$source_dir/.state/runtime.env"
chown lab:lab "$target/.models" "$target/.runtime.env" "$target/.profile-selection.json"
chown -R lab:lab "$target/audit"
echo '[OK] Repository synced to Linux ext4; secrets restricted to owner'
