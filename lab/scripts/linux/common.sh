#!/usr/bin/env bash
set -Eeuo pipefail
LAB_ROOT=/opt/ai-local-lab
cd "$LAB_ROOT"
[[ -f /etc/ai-local-lab-owner && -f .runtime.env && -f .env ]] || { echo '[ERROR] Runtime configuration missing; run bootstrap'; exit 1; }
# Files contain only validated declarative values; no eval or shell sourcing secrets.
load_env() {
  local key value
  while IFS='=' read -r key value || [[ -n $key ]]; do
    [[ $key =~ ^[A-Z_]+$ ]] || continue
    [[ $value =~ ^[a-zA-Z0-9.,/:@_-]+$ ]] || { echo '[ERROR] Invalid environment value'; exit 1; }
    export "$key=$value"
  done <"$1"
}
load_env .runtime.env
load_env .env
source "$LAB_ROOT/scripts/linux/resilience.sh"
# Defaults also support runtime.env produced by earlier bootstrap versions.
MODEL_PULL_ATTEMPTS=${MODEL_PULL_ATTEMPTS:-3}
MODEL_PULL_RETRY_DELAY_SECONDS=${MODEL_PULL_RETRY_DELAY_SECONDS:-5}
IFS=',' read -r -a selected_profiles <<<"$LAB_PROFILES"
compose_files=(-f compose.yaml)
[[ -f .override.yaml ]] && compose_files+=(-f .override.yaml)
dc() {
  local profile flags=()
  for profile in "${selected_profiles[@]}"; do flags+=(--profile "$profile"); done
  docker compose --project-name ai-local-lab --env-file .env --env-file .runtime.env "${compose_files[@]}" "${flags[@]}" "$@"
}
has_profile() { [[ ,$LAB_PROFILES, == *",$1,"* ]]; }
active_services() {
  if has_profile core; then printf '%s\n' ollama open-webui; fi
  if has_profile rag; then printf '%s\n' qdrant; fi
  if has_profile dev; then printf '%s\n' ai-dev jupyter; fi
}
service_state() {
  local cid
  cid=$(dc ps -aq "$1") || return 1
  [[ -n $cid ]] || { echo 'missing'; return 0; }
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid"
}
all_dc() { docker compose --project-name ai-local-lab --env-file .env --env-file .runtime.env "${compose_files[@]}" --profile core --profile rag --profile dev "$@"; }
