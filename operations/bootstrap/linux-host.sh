#!/bin/sh
# Executed as root only in the dedicated distro, after host-side ownership checks.
set -eu
action=${1:-}
owner=${2:-}
operator=${3:-}
case "$owner" in ''|*[!a-f0-9]*) exit 2 ;; esac
[ "${#owner}" -eq 32 ] || exit 2
case "$operator" in ''|*[!a-z0-9_-]*|[!a-z]*) exit 2 ;; esac
[ "${#operator}" -le 31 ] || exit 2
[ "$(id -u)" -eq 0 ] || exit 2
marker=/etc/ai-platform-owner
[ ! -L "$marker" ] || exit 4
[ ! -e "$marker" ] || [ -f "$marker" ] || exit 4
if [ -f "$marker" ]; then
    [ "$(cat "$marker")" = "$owner" ] || exit 4
else
    case "$action" in
        probe) exit 3 ;;
        claim)
            # No replacement of a foreign marker; root-owned, private, atomic write.
            umask 077
            temporary=$(mktemp /etc/.ai-platform-owner.XXXXXX)
            printf '%s' "$owner" > "$temporary"
            mv -f "$temporary" "$marker"
            ;;
        *) exit 4 ;;
    esac
fi
case "$action" in
    probe|claim) exit 0 ;;
    configure|verify) ;;
    *) exit 2 ;;
esac

user_marker=/etc/ai-platform-user
[ ! -L "$user_marker" ] || exit 4
[ ! -L /etc/wsl.conf ] || exit 4
[ ! -e "$user_marker" ] || [ -f "$user_marker" ] || exit 4
[ ! -e /etc/wsl.conf ] || [ -f /etc/wsl.conf ] || exit 4
if [ -f "$user_marker" ]; then
    [ "$(cat "$user_marker")" = "$operator" ] || exit 4
fi
if [ "$action" = configure ]; then
    if ! id "$operator" >/dev/null 2>&1; then
        useradd --create-home --shell /bin/bash "$operator"
    fi
    # This account has no password/sudo policy or Docker privileges added here.
    [ "$(id -u "$operator")" -ne 0 ] || exit 5
    if [ -f "$user_marker" ]; then
        [ "$(cat "$user_marker")" = "$operator" ] || exit 4
    else
        umask 077
        printf '%s' "$operator" > "$user_marker"
    fi
fi
source=/etc/wsl.conf
[ -f "$source" ] || source=/dev/null
# Preserve unrelated settings, changing only boot.systemd and user.default.
expected=$(awk -v operator="$operator" -f "$(dirname "$0")/wsl-config.awk" "$source")
if [ "$(cat "$source")" != "$expected" ]; then
    [ "$action" = configure ] || exit 42
    umask 077
    candidate=$(mktemp /etc/.ai-platform-wsl.XXXXXX)
    trap 'rm -f "$candidate"' EXIT HUP INT TERM
    printf '%s\n' "$expected" > "$candidate"
    mv -f "$candidate" /etc/wsl.conf
    exit 42 # Windows installer restarts this distro only.
fi
[ -f "$user_marker" ] && [ "$(cat "$user_marker")" = "$operator" ] || exit 5
[ "$(id -u "$operator")" -ne 0 ] || exit 5
[ "$(cat /proc/1/comm)" = systemd ] || exit 42
digest=$(sha256sum /etc/wsl.conf | cut -d ' ' -f 1)
printf 'READY:%s\n' "$digest"
