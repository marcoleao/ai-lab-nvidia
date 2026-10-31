#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
if has_inference; then
  IFS= read -r SMOKE_MODEL <.models
  [[ ${SMOKE_MODEL##*/} == *:* ]] || SMOKE_MODEL="$SMOKE_MODEL:latest"
  export SMOKE_MODEL
fi
trap 'echo "[ERROR] Smoke test failed at line $LINENO" >&2' ERR
if has_profile sdlc; then
  # Host Python is installed by the bootstrap. No dev image, Open WebUI,
  # embeddings, CUDA image or permanently running coding tool is required.
  OLLAMA_SMOKE_URL="http://${OLLAMA_ADDRESS}:11434" python3 tests/test_ollama.py
  echo '[OK] SDLC profile smoke: generation and real GPU residency verified.'
  exit 0
fi
# Temporary dev image container also validates minimal/core profiles, without enabling dev services.
docker image inspect ai-local-lab/dev:local >/dev/null
probe() {
  docker run --rm --pull never --gpus all --network ai-local-lab_lab --label ai-local-lab.test=true \
    -e QDRANT_API_KEY -e SMOKE_MODEL ai-local-lab/dev:local python "$@"
}
probe /opt/lab/tests/check_gpu.py
if has_profile core; then
  probe /opt/lab/tests/test_ollama.py
  probe -c 'import urllib.request; assert urllib.request.urlopen("http://open-webui:8080/health", timeout=30).status == 200; print("[OK] Open WebUI")'
fi
if has_profile rag; then probe /opt/lab/tests/test_qdrant.py; fi
if has_profile dev; then dc exec -T jupyter python /opt/lab/jupyter-health.py; echo '[OK] Jupyter authenticated health'; fi
if has_profile agents; then python3 scripts/linux/agent-tools.py verify; fi
echo '[OK] Smoke tests passed'
