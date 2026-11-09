#!/bin/sh
# Stable entry inside the owned installation; never starts infrastructure/downloads.
set -eu
root=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
[ -f "$root/current" ] && [ ! -L "$root/current" ] || { printf '%s\n' 'PLATFORM_CORE_NOT_ACTIVATED' >&2; exit 1; }
digest=$(cat "$root/current")
case "$digest" in ''|*[!a-f0-9]*) exit 1 ;; esac
[ "${#digest}" -eq 64 ] || exit 1
installation=$(cat "$root/.installation-id")
profile=$(cat "$root/.profile")
exec "$root/releases/$digest/platform" "$@" --root "$root/releases/$digest" --installation-id "$installation" --profile "$profile"
