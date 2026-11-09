#!/bin/sh
# Portable entry point. On Windows run this inside WSL2, not Git Bash.
set -eu

platform_root=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
platform_system=$(uname -s)
platform_machine=$(uname -m)

case "$platform_system:$platform_machine" in
    Linux:x86_64|Linux:amd64) platform_target=linux-amd64 ;;
    Linux:aarch64|Linux:arm64) platform_target=linux-arm64 ;;
    Darwin:arm64|Darwin:aarch64) platform_target=darwin-arm64 ;;
    *)
        printf '%s\n' 'PLATFORM_ENVIRONMENT_UNSUPPORTED: use WSL2 on Windows, native ARM64 macOS, or supported Linux.' >&2
        exit 2
        ;;
esac

# Extracted bundles put the binary beside this entry point. Source checkouts
# use an explicitly prepared, ignored cache. No compilation or download here.
platform_binary="$platform_root/platform"
if [ ! -f "$platform_binary" ]; then
    platform_binary="$platform_root/.cache/platform/$platform_target/platform"
fi
if [ ! -f "$platform_binary" ] || [ ! -x "$platform_binary" ]; then
    printf '%s\n' 'PLATFORM_BINARY_NOT_PREPARED: obtain the matching bundle or follow operations/README.md.' >&2
    exit 1
fi

case "${1:-}" in
    status|doctor|start|stop|restart|logs)
        if [ "$platform_system" = Linux ] && [ "$(id -u)" -ne 0 ]; then
            exec sudo -- /bin/sh "$platform_root/platform.sh" "$@"
        fi
        ;;
esac
exec "$platform_binary" "$@"
