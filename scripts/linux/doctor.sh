#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
errors=0; checks=0
check() {
  local label=$1; shift
  checks=$((checks+1))
  if "$@"; then echo "[OK] $label"; else echo "[ERROR] $label" >&2; errors=$((errors+1)); fi
}
check 'Linux kernel' uname -r
check 'systemd' test "$(ps -p 1 -o comm=)" = systemd
check 'WSL NVIDIA driver passthrough' /usr/lib/wsl/lib/nvidia-smi
if [[ $GPU_VALIDATION == true ]]; then
  check 'GPU model / VRAM telemetry' /usr/lib/wsl/lib/nvidia-smi --query-gpu=name,memory.total --format=csv
fi
check 'Outbound HTTPS' curl -fsSI --max-time 20 https://download.docker.com/linux/ubuntu/gpg -o /dev/null
check 'Linux disk' df -h /
check 'Docker Engine' docker info
check 'Compose' docker compose version
check 'NVIDIA runtime registered' bash -c 'docker info --format "{{json .Runtimes}}" | grep -q nvidia'
check 'GPU inside CUDA container' docker run --rm --gpus all --label ai-local-lab.test=true "$CUDA_IMAGE" nvidia-smi
check 'Compose schema' dc config --quiet
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
for service in $(active_services); do
  check "Service $service" wait_healthy "$service" "$deadline"
done
if has_profile core; then
  installed=$(dc exec -T ollama ollama list | awk 'NR>1 {print $1}') || errors=$((errors+1))
  missing_models=0
  while IFS= read -r model || [[ -n $model ]]; do
    [[ ${model##*/} == *:* ]] || model="$model:latest"
    if ! grep -Fxq "$model" <<<"$installed"; then missing_models=$((missing_models+1)); fi
    check "Model $model" grep -Fxq "$model" <<<"$installed"
  done <.models
  if ((missing_models > 0)); then echo "[INFO] $missing_models models missing after incomplete bootstrap. Run bootstrap up or ai models; preserve volumes."; fi
fi
if has_profile dev; then
  check 'Dev image' docker image inspect ai-local-lab/dev:local --format '{{.Id}}'
  check 'PyTorch CUDA and real GPU computation' dc exec -T ai-dev python /opt/lab/tests/check_gpu.py
else
  echo '[WARN] dev profile inactive; enable ai up dev for PyTorch/Jupyter validation'
fi
echo "[INFO] Doctor summary: $checks checks; $errors errors"
[[ $errors == 0 ]]
