#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
for file in scripts/linux/*.sh tests/*.sh; do bash -n "$file"; done
bash tests/test_pull_models.sh
if command -v shellcheck >/dev/null; then
  shellcheck -x -e SC1091,SC2034 scripts/linux/*.sh tests/*.sh
else
  echo '[WARN] shellcheck unavailable'
fi
mkdir -p .cache
printf 'WEBUI_SECRET_KEY=%064d\nJUPYTER_TOKEN=%064d\nQDRANT_API_KEY=%064d\n' 1 2 3 >.cache/validation.env
docker compose --env-file config/versions.env --env-file .cache/validation.env --profile core --profile rag --profile dev config --quiet
# Validation tooling runs in Linux containers only.
uv_image=$(sed -n 's/^UV_IMAGE=//p' config/versions.env)
docker run --rm -v "$PWD:/repo" -w /repo "${uv_image}-python3.11-bookworm-slim" /bin/sh -ec \
  'cd python; uv run --frozen python ../tests/validate_repo.py'
docker compose --env-file config/versions.env --env-file .cache/validation.env --profile dev build ai-dev
echo '[OK] Static gates, lock installation, Compose config and Docker build'
