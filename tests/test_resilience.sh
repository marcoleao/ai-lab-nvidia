#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
source scripts/linux/resilience.sh
count=0
transient() { count=$((count+1)); ((count >= 3)) || return 255; }
retry_command transient 3 0 transient
[[ $count == 3 ]]
count=0
permanent() { count=$((count+1)); return 255; }
if retry_command permanent 2 0 permanent; then exit 1; else [[ $? == 255 && $count == 2 ]]; fi
count=0
cancelled() { count=$((count+1)); return 130; }
if retry_command cancellation 3 0 cancelled; then exit 1; else [[ $? == 130 && $count == 1 ]]; fi
names=()
consume_stdin() { cat >/dev/null; names+=("$1"); }
while IFS= read -r model; do
  retry_command "pull $model" 2 0 consume_stdin "$model" </dev/null
done <<'EOF'
qwen3:14b
gpt-oss:20b
gemma3:27b
EOF
[[ ${#names[@]} == 3 && ${names[2]} == gemma3:27b ]]
fixture=$(mktemp)
trap 'rm -f "$fixture"' EXIT
printf 'Error: pull model manifest: 412: requires a newer version of Ollama\n' >"$fixture"
count=0
incompatible() { count=$((count+1)); classify_model_pull 1 "$fixture"; }
if retry_command incompatible 3 0 incompatible; then exit 1; else [[ $? == 65 && $count == 1 ]]; fi
dc() { echo 'Error: pull model manifest: 412: requires a newer version of Ollama'; return 1; }
if pull_model_once test:1; then exit 1; else [[ $? == 65 ]]; fi
dc() { echo 'connection interrupted'; return 255; }
if pull_model_once test:1; then exit 1; else [[ $? == 255 ]]; fi
dc() { echo 'success'; return 0; }
pull_model_once test:1
echo 0 >"$fixture"
service_state() {
  local n; n=$(cat "$fixture"); echo $((n+1)) >"$fixture"
  if ((n < 2)); then echo 'running starting'; else echo 'running healthy'; fi
}
HEALTH_POLL_SECONDS=0 wait_healthy test "$((SECONDS+10))"
service_state() { echo 'running starting'; }
if wait_healthy test "$SECONDS"; then exit 1; fi
service_state() { echo 'running unhealthy'; }
if wait_healthy test "$((SECONDS+10))"; then exit 1; fi
echo '[OK] Retry recovery/exhaustion/cancellation and health starting/timeout/unhealthy regressions'
