#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
if has_profile core; then
  IFS= read -r SMOKE_MODEL <.models
  [[ ${SMOKE_MODEL##*/} == *:* ]] || SMOKE_MODEL="$SMOKE_MODEL:latest"
  export SMOKE_MODEL
fi
trap 'echo "[ERROR] Smoke test failed at line $LINENO" >&2' ERR
# Temporary dev image container also validates minimal/core profiles, without enabling dev services.
dc build ai-dev
probe() {
  docker run --rm --gpus all --network ai-local-lab_lab --label ai-local-lab.test=true \
    -e QDRANT_API_KEY -e SMOKE_MODEL ai-local-lab/dev:local python "$@"
}
probe /opt/lab/tests/check_gpu.py
if has_profile core; then
  probe /opt/lab/tests/test_ollama.py
  probe -c 'import urllib.request; assert urllib.request.urlopen("http://open-webui:8080/health", timeout=30).status == 200; print("[OK] Open WebUI")'
fi
if has_profile rag; then probe /opt/lab/tests/test_qdrant.py; fi
if has_profile dev; then dc exec -T jupyter python /opt/lab/jupyter-health.py; echo '[OK] Jupyter authenticated health'; fi
echo '[OK] Smoke tests passed'
