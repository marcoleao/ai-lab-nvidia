#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
action=${1:-up}; shift || true
if [[ $action == up || $action == update || $action == rebuild || $action == models || $action == doctor || $action == test || $action == reset ]]; then
  mkdir -p .runtime-logs
  chmod 700 .runtime-logs
  log_file="$LAB_ROOT/.runtime-logs/$(date +%Y%m%d-%H%M%S)-$action-$$.log"
  touch "$log_file"; chmod 600 "$log_file"
  exec > >(tee -a "$log_file") 2>&1
  echo "[INFO] Linux execution log: $log_file"
fi
report_failure() {
  local code=$1 line=$2
  echo "[ERROR] FAILED STEP: ${action:-initialization} at line $line; exit=$code. CURRENT STATE: retained. HOW TO RETRY: bootstrap up / doctor." >&2
  exit "$code"
}
trap 'report_failure "$?" "$LINENO"' ERR
configure_override() {
  # Compose !override requires Compose >=2.24.4; enforce via config validation.
  {
    echo 'services:'
    if [[ $EXPOSE_OLLAMA == true || ( $EPHEMERAL == true && $EPHEMERAL_MODELS == true ) ]]; then
      echo '  ollama:'
      if [[ $EXPOSE_OLLAMA == true ]]; then printf '    ports: ["%s:%s:11434"]\n' "$BIND_ADDRESS" "$OLLAMA_PORT"; fi
      if [[ $EPHEMERAL == true && $EPHEMERAL_MODELS == true ]]; then
        printf '    volumes: !override []\n    tmpfs: [/root/.ollama]\n'
      fi
    fi
    if [[ $EXPOSE_GRPC == true ]]; then
      printf '  qdrant:\n    ports: !override ["%s:%s:6333", "%s:%s:6334"]\n' "$BIND_ADDRESS" "$QDRANT_PORT" "$BIND_ADDRESS" "$GRPC_PORT"
    fi
    if [[ $EPHEMERAL == true ]]; then
      cat <<'EOF'
  open-webui:
    volumes: !override []
    tmpfs: [/app/backend/data]
  qdrant:
    volumes: !override []
    tmpfs: [/qdrant/storage]
  jupyter:
    volumes: !override
      - ./workspace:/workspace
      - huggingface_cache:/cache/huggingface
    tmpfs: [/notebooks:uid=1000,gid=1000,mode=0700]
EOF
    fi
  } >.override.yaml
  # Empty services mapping is valid, but null is not accepted by all Compose versions.
  if [[ $(wc -l <.override.yaml) == 1 ]]; then echo 'services: {}' >.override.yaml; fi
  compose_files=(-f compose.yaml -f .override.yaml)
  dc config --quiet
  if docker volume inspect ai-local-lab_ollama_models >/dev/null 2>&1; then
    [[ $(docker volume inspect ai-local-lab_ollama_models --format '{{index .Labels "ai-local-lab.owner"}}') == "$(cat /etc/ai-local-lab-owner)" ]] || { echo '[ERROR] Existing model volume is unowned'; exit 1; }
  else
    docker volume create --label ai-local-lab.owner="$(cat /etc/ai-local-lab-owner)" ai-local-lab_ollama_models >/dev/null
  fi
}
start_stack() {
  python3 scripts/linux/offline-manifest.py verify
  dc up -d --no-build --pull never --remove-orphans --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS"
  bash scripts/linux/doctor.sh
  bash tests/smoke-test.sh
}
case "$action" in
  prepare)
    configure_override
    for image in "$OLLAMA_IMAGE" "$OPEN_WEBUI_IMAGE" "$QDRANT_IMAGE" "$CUDA_IMAGE" "$PYTORCH_IMAGE" "$UV_IMAGE" "$NODE_IMAGE"; do
      docker pull "$image"
    done
    UV_OFFLINE=0 PIP_NO_INDEX=0 dc build ai-dev
    python3 scripts/linux/agent-tools.py prepare
    dc up -d --no-build --pull never --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS" ollama
    bash scripts/linux/pull-models.sh
    docker run --rm --pull never -v ai-local-lab_open_webui_data:/app/backend/data \
      -e TIKTOKEN_CACHE_DIR=/app/backend/data/cache/tiktoken "$OPEN_WEBUI_IMAGE" python -c \
      "from huggingface_hub import snapshot_download; snapshot_download('sentence-transformers/all-MiniLM-L6-v2', cache_dir='/app/backend/data/cache/embedding/models'); import tiktoken; tiktoken.get_encoding('cl100k_base')"
    python3 scripts/linux/offline-manifest.py prepare
    ;;
  up) configure_override; start_stack ;;
  down) all_dc down --remove-orphans ;;
  restart) python3 scripts/linux/offline-manifest.py verify; dc up -d --no-build --pull never --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS"; dc restart; dc up -d --no-build --pull never --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS"; bash scripts/linux/doctor.sh ;;
  status)
    echo '[OK] Dedicated WSL distro running'; uname -r
    docker info --format 'Docker {{.ServerVersion}}; runtime {{json .Runtimes}}'
    all_dc ps -a
    /usr/lib/wsl/lib/nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv
    if has_profile core; then dc exec -T ollama ollama list; fi
    df -h /; docker system df -v
    printf 'Configured bind: %s; WebUI http://localhost:%s; Qdrant http://localhost:%s; Jupyter http://localhost:%s\n' "$BIND_ADDRESS" "$WEBUI_PORT" "$QDRANT_PORT" "$JUPYTER_PORT"
    ;;
  doctor) bash scripts/linux/doctor.sh ;;
  test) bash tests/smoke-test.sh ;;
  logs) dc logs --tail 100 "$@" ;;
  models) has_profile core || { echo '[ERROR] Activate core first'; exit 1; }; dc exec -T ollama ollama list ;;
  dev|jupyter)
    if ! has_profile dev; then
      LAB_PROFILES="$LAB_PROFILES,dev"; export LAB_PROFILES
      sed -i "s/^LAB_PROFILES=.*/LAB_PROFILES=$LAB_PROFILES/" .runtime.env
      IFS=',' read -r -a selected_profiles <<<"$LAB_PROFILES"
    fi
    python3 scripts/linux/offline-manifest.py verify
    dc up -d --no-build --pull never --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS" ai-dev jupyter
    if [[ $action == dev ]]; then dc exec ai-dev bash; else echo "[OK] Jupyter http://localhost:$JUPYTER_PORT; token is in repository .env"; fi
    ;;
  reset|destroy)
    all_dc down -v --remove-orphans
    if [[ $PRESERVE_MODELS == false ]]; then
      owner=$(docker volume inspect ai-local-lab_ollama_models --format '{{index .Labels "ai-local-lab.owner"}}')
      [[ $owner == "$(cat /etc/ai-local-lab-owner)" ]] || { echo '[ERROR] Model volume ownership mismatch'; exit 1; }
      docker volume rm ai-local-lab_ollama_models
    fi
    rm -f .offline-manifest.json
    echo '[INFO] Caches removed. Recreate with bootstrap prepare, then bootstrap up.'
    ;;
  rebuild|update)
    configure_override
    echo '[ERROR] Rebuild/update require explicit online preparation: bootstrap prepare. Ordinary operation never rebuilds or downloads.' >&2
    exit 1
    ;;
  *) echo '[ERROR] Unknown Linux command'; exit 1 ;;
esac
