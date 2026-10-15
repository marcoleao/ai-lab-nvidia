#!/usr/bin/env bash
set -Eeuo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
builtin source "$repo/scripts/linux/resilience.sh"
MODEL_PULL_ATTEMPTS=2
MODEL_PULL_RETRY_DELAY_SECONDS=0
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
cd "$fixture"
printf '%s\n' qwen3:14b gpt-oss:20b qwen3-coder:30b gemma3:27b >.models
# Avoid the deployed runtime; emulate docker exec reading all available stdin.
source() { :; }
has_profile() { return 0; }
dc() {
  if [[ $5 == list ]]; then
    printf 'NAME ID SIZE MODIFIED\nqwen3:14b existing 9GB today\n'
  elif [[ $5 == pull ]]; then
    cat >/dev/null
    printf '%s\n' "$6" >>pulled
  else
    return 1
  fi
}
builtin source "$repo/scripts/linux/pull-models.sh"
printf '%s\n' gpt-oss:20b qwen3-coder:30b gemma3:27b >expected
diff -u expected pulled
echo '[OK] Model pulls preserve loop input and skip installed models'
