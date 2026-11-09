#!/bin/sh
# Build-time wrapper. Installed operation does not require Python.
set -eu
repository=$(CDPATH= cd -P "$(dirname "$0")/../.." && pwd)
exec "${PLATFORM_PYTHON:-python3}" "$repository/operations/scripts/package-cli.py" "$@"
