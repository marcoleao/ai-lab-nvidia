#!/usr/bin/env bash
set -Eeuo pipefail
source /opt/ai-local-lab/scripts/linux/common.sh
has_profile core || exit 0
installed=$(dc exec -T ollama ollama list | awk 'NR>1 {print $1}')
while IFS= read -r model || [[ -n $model ]]; do
  [[ $model =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || { echo '[ERROR] Invalid model declaration'; exit 1; }
  normalized=$model
  [[ ${model##*/} == *:* ]] || normalized="$model:latest"
  if [[ ${1:-} != --update ]] && grep -Fxq "$normalized" <<<"$installed"; then
    echo "[OK] Model already installed: $model"
  else
    echo "[INFO] Pull model: $model"
    # docker exec can consume stdin, which belongs to the model-list loop.
    dc exec -T ollama ollama pull "$model" </dev/null
  fi
done <.models
