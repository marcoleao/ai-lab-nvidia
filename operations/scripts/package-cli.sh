#!/bin/sh
# Package an already built native binary. This command never compiles/downloads.
set -eu
export COPYFILE_DISABLE=1
target=${1:-}
binary=${2:-}
output=${3:-}
case "$target" in linux-amd64|linux-arm64|darwin-arm64) ;; *) exit 2 ;; esac
[ -f "$binary" ] && [ ! -L "$binary" ] || exit 2
binary=$(CDPATH= cd -P "$(dirname "$binary")" && pwd)/$(basename "$binary")
repository=$(CDPATH= cd -P "$(dirname "$0")/../.." && pwd)
mkdir -p "$output"
output=$(CDPATH= cd -P "$output" && pwd)
stage=$(mktemp -d "$output/.platform-package.XXXXXX")
cleanup() { case "$stage" in "$output"/.platform-package.*) rm -rf -- "$stage" ;; *) exit 1 ;; esac; }
trap cleanup EXIT HUP INT TERM
(
    cd "$stage"
    mkdir operations environments
    mkdir environments/profiles
)
cp "$binary" "$stage/platform"
cp "$repository/platform.sh" "$stage/platform.sh"
cp "$repository/install.sh" "$stage/install.sh"
cp "$repository/operations/catalog.json" "$repository/operations/command-catalog.json" "$repository/operations/go.mod" "$stage/operations/"
cp "$repository/operations/package-README.md" "$stage/operations/README.md"
cp "$repository/environments/platform.json" "$stage/environments/platform.json"
cp "$repository"/environments/profiles/*.json "$stage/environments/profiles/"
chmod 755 "$stage/platform" "$stage/platform.sh" "$stage/install.sh"
name="platform-$target"
tar --format=ustar -czf "$output/$name.tar.gz.partial" -C "$stage" .
mv -f "$output/$name.tar.gz.partial" "$output/$name.tar.gz"
(
    cd "$output"
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$name.tar.gz"; else shasum -a 256 "$name.tar.gz"; fi > "$name.sha256"
)
printf '%s\n' "$output/$name.tar.gz"
