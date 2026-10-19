#!/usr/bin/env bash
# Pure helpers: safe to source in regression tests without WSL or Docker.
retry_command() {
  local label=$1 attempts=$2 delay=$3 attempt code
  shift 3
  for ((attempt=1; attempt<=attempts; attempt++)); do
    if "$@"; then return 0; else code=$?; fi
    echo "[WARN] $label failed: exit=$code attempt=$attempt/$attempts" >&2
    # Missing executables and operator cancellation must not be retried.
    if [[ $code == 65 || $code == 126 || $code == 127 || $code == 130 || $code == 143 ]]; then return "$code"; fi
    if (( attempt < attempts )); then
      echo "[INFO] Retry $label in ${delay}s; completed downloads retained" >&2
      sleep "$delay"
      delay=$((delay * 2))
    fi
  done
  echo "[ERROR] $label exhausted retries; last exit=$code. Retry bootstrap up; no reset/nuke needed." >&2
  return "$code"
}
classify_model_pull() {
  local code=$1 output=$2
  if ((code != 0)) && grep -Eiq 'requires a newer version of Ollama|pull model manifest: 412' "$output"; then
    echo '[ERROR] Model requires a newer Ollama. Update OLLAMA_IMAGE in config/versions.env and run bootstrap up. No retry can fix HTTP 412.' >&2
    return 65
  fi
  return "$code"
}
pull_model_once() {
  local model=$1 output code
  output=$(mktemp) || return 1
  # Preserve the Docker exit code instead of tee's; retain full error text.
  if dc exec -T ollama ollama pull "$model" </dev/null 2>&1 | tee "$output"; then
    code=0
  else
    code=${PIPESTATUS[0]}
  fi
  if classify_model_pull "$code" "$output"; then code=0; else code=$?; fi
  rm -f "$output"
  return "$code"
}
wait_healthy() {
  local service=$1 deadline=$2 state remaining
  while true; do
    if ! state=$(service_state "$service"); then
      echo "[ERROR] Cannot inspect $service" >&2; return 1
    fi
    case "$state" in
      'running healthy') echo "[OK] $service: $state"; return 0 ;;
      'running starting'|'restarting '*|'created '*) ;;
      *) echo "[ERROR] $service: $state; inspect ai logs $service" >&2; return 1 ;;
    esac
    remaining=$((deadline - SECONDS))
    if ((remaining <= 0)); then echo "[ERROR] $service: $state after health timeout" >&2; return 1; fi
    echo "[INFO] Waiting for $service: $state (${remaining}s remaining)"
    sleep "${HEALTH_POLL_SECONDS:-5}"
  done
}
