#!/bin/sh
set -eu
case "$(uname -s)" in
    Linux|Darwin) ;;
    *) printf '%s\n' 'PLATFORM_NATIVE_VALIDATION_REQUIRED: use Linux/WSL2 or macOS; Windows bootstrap tests remain in PowerShell.' >&2; exit 42 ;;
esac
repository=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
exec python3 "$repository/operations/scripts/validation.py" --snapshot "$@"
