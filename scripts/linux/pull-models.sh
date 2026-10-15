#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
has_profile core || exit 0
installed=$(retry_command 'ollama list' "$MODEL_PULL_ATTEMPTS" "$MODEL_PULL_RETRY_DELAY_SECONDS" \
  dc exec -T ollama ollama list </dev/null | awk 'NR>1 {print $1}')
while IFS= read -r model || [[ -n $model ]]; do
  [[ $model =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || { echo '[ERROR] Invalid model declaration'; exit 1; }
  normalized=$model
  [[ ${model##*/} == *:* ]] || normalized="$model:latest"
  if [[ ${1:-} != --update ]] && grep -Fxq "$normalized" <<<"$installed"; then
    echo "[OK] Model already installed: $model"
  else
    echo "[INFO] Pull model: $model"
    # docker exec can consume stdin, which belongs to the model-list loop.
    retry_command "ollama pull $model" "$MODEL_PULL_ATTEMPTS" "$MODEL_PULL_RETRY_DELAY_SECONDS" \
      pull_model_once "$model" </dev/null
  fi
done <.models
