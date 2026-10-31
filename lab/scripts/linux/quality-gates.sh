#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
for file in scripts/linux/*.sh tests/*.sh; do bash -n "$file"; done
bash tests/test_resilience.sh
bash tests/test_pull_models.sh
python3 tests/test_offline_manifest.py
python3 tests/test_agent_tools.py
python3 tests/test_offline_network.py
python3 tests/test_network_migration.py
python3 tests/inference_cache_policy_tests.py
if command -v shellcheck >/dev/null; then
  shellcheck -x -e SC1091,SC2034 scripts/linux/*.sh tests/*.sh
else
  echo '[WARN] shellcheck unavailable'
fi
mkdir -p .cache
printf 'WEBUI_SECRET_KEY=%064d\nJUPYTER_TOKEN=%064d\nQDRANT_API_KEY=%064d\n' 1 2 3 >.cache/validation.env
docker compose --env-file config/versions.env --env-file .cache/validation.env --profile core --profile rag --profile dev --profile agents config --quiet
# Validation tooling runs in Linux containers only.
uv_image=$(sed -n 's/^UV_IMAGE=//p' config/versions.env)
docker run --rm -v "$PWD:/repo" -w /repo "${uv_image}-python3.11-bookworm-slim" /bin/sh -ec \
  'cd python; uv run --frozen python ../tests/validate_repo.py'
docker compose --env-file config/versions.env --env-file .cache/validation.env --profile dev build ai-dev
docker compose --env-file config/versions.env --env-file .cache/validation.env --profile agents build qwen-code
docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:uid=1000,gid=1000,mode=0700 \
  -v "$PWD/qwen-code/workspace.test.mjs:/opt/qwen-code/workspace.test.mjs:ro" \
  -v "$PWD/qwen-code/ui-probes.test.mjs:/opt/qwen-code/ui-probes.test.mjs:ro" \
  -v "$PWD/qwen-code/patch.test.mjs:/opt/qwen-code/patch.test.mjs:ro" \
  --entrypoint node ai-local-lab/qwen-code:0.26.4 --test /opt/qwen-code/workspace.test.mjs /opt/qwen-code/ui-probes.test.mjs /opt/qwen-code/patch.test.mjs
echo '[OK] Static gates, lock installation, Compose config and Docker build'
