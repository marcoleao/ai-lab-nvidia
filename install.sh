#!/bin/sh
# Common entry once a native shell/CLI is available. Windows without WSL starts
# with install.ps1, which subsequently invokes the same Linux setup coordinator.
set -eu
root=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
action=${1:-plan}
case "$action" in plan|install) ;; *) printf '%s\n' 'Use: sh install.sh plan|install [--phase host|runtime|network|access|origin|ingress|observability|hub|infrastructure|all] [--profile ...]' >&2; exit 2 ;; esac
if [ "$#" -gt 0 ]; then shift; fi
case "$(uname -s):$(uname -m)" in
    Linux:x86_64|Linux:amd64) profile=precision-windows ;;
    Linux:aarch64|Linux:arm64) profile=dell-gb10 ;;
    Darwin:arm64|Darwin:aarch64) profile=macos-m3-max ;;
    *) printf '%s\n' 'PLATFORM_ENVIRONMENT_UNSUPPORTED' >&2; exit 2 ;;
esac
if [ "$action" = install ] && [ "$(uname -s)" = Linux ] && [ "$(id -u)" -ne 0 ]; then
    exec sudo -- /bin/sh "$root/install.sh" "$action" "$@"
fi
exec /bin/sh "$root/platform.sh" setup --action "$action" --root "$root" --profile "$profile" "$@"
