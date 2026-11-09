#!/bin/sh
set -eu
export LC_ALL=C COPYFILE_DISABLE=1
repository=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
temporary_parent=$(CDPATH= cd -P "${TMPDIR:-/tmp}" && pwd)
fixture=$(mktemp -d "$temporary_parent/ai-platform-core.XXXXXX")
cleanup() { case "$fixture" in "$temporary_parent"/ai-platform-core.*) rm -rf -- "$fixture" ;; *) exit 1 ;; esac; }
trap cleanup EXIT HUP INT TERM
loader="$repository/operations/bootstrap/core-release.sh"
root="$fixture/root with spaces"
owner=0123456789abcdef0123456789abcdef
installation=ai-platform-local
profile=precision-windows
hash() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1; }
rejected() { if "$@" > "$fixture/rejected.out" 2>&1; then printf 'Unexpected success: %s\n' "$1" >&2; exit 1; fi; }
# Explicit dispatcher avoids shell-specific array features.
call() { operation=$1; shift; sh "$loader" "$operation" "$root" "$owner" "$installation" "$profile" "$@"; }

if [ -n "${PLATFORM_TEST_NATIVE_BINARY:-}" ]; then
    binary=$PLATFORM_TEST_NATIVE_BINARY
    case "$(uname -s):$(uname -m)" in
        Darwin:arm64) profile=macos-m3-max ;;
        Linux:aarch64|Linux:arm64) profile=dell-gb10 ;;
    esac
    mode=native
else
    mode=mocked-backend
    mkdir "$fixture/tools"
    cat > "$fixture/tools/uname" <<'EOF'
#!/bin/sh
case "$1" in -s) printf 'Linux\n' ;; -m) printf 'x86_64\n' ;; *) exit 1 ;; esac
EOF
    cat > "$fixture/tools/od" <<'EOF'
#!/bin/sh
printf '7f454c4602010100000000000000000002003e00\n'
EOF
    cat > "$fixture/platform.fixture" <<'EOF'
#!/bin/sh
set -eu
root=''; installation=''
while [ "$#" -gt 0 ]; do
 case "$1" in --root) root=$2; shift ;; --installation-id) installation=$2; shift ;; esac
 shift
done
[ "$installation" = ai-platform-local ]
! test -f "$root/reject-validation"
grep -q 'ai-platform-local' "$root/environments/platform.json"
EOF
    chmod +x "$fixture/tools/uname" "$fixture/tools/od" "$fixture/platform.fixture"
    PATH="$fixture/tools:$PATH"; export PATH
    binary="$fixture/platform.fixture"
fi
bundle="$fixture/bundle"
mkdir -p "$bundle/operations" "$bundle/environments/profiles"
cp "$binary" "$bundle/platform"
cp "$repository/platform.sh" "$bundle/platform.sh"
cp "$repository/install.sh" "$bundle/install.sh"
cp "$repository/operations/catalog.json" "$repository/operations/command-catalog.json" "$repository/operations/README.md" "$repository/operations/go.mod" "$bundle/operations/"
cp "$repository/environments/platform.json" "$bundle/environments/platform.json"
cp "$repository"/environments/profiles/*.json "$bundle/environments/profiles/"
configuration="$fixture/configuration with spaces.json"
cp "$repository/environments/platform.json" "$configuration"
case "$profile" in precision-windows) target=linux-amd64 ;; dell-gb10) target=linux-arm64 ;; macos-m3-max) target=darwin-arm64 ;; esac
sh "$repository/operations/scripts/package-cli.sh" "$target" "$binary" "$fixture/distribution with spaces" > "$fixture/package.out"
archive="$fixture/distribution with spaces/platform-$target.tar.gz"
archive_hash=$(hash "$archive")
[ "$(cut -d ' ' -f 1 "$fixture/distribution with spaces/platform-$target.sha256")" = "$archive_hash" ]
configuration_hash=$(hash "$configuration")
[ "$(call inspect)" = ABSENT ] && [ ! -e "$root" ]
rejected call verify
prepared=$(call prepare "$archive" "$archive_hash" "$configuration" "$configuration_hash")
case "$prepared" in CREATED:*) release=${prepared#CREATED:} ;; *) exit 1 ;; esac
[ "$(call candidate "$release")" = "$release" ]
[ "$(call inspect)" = ABSENT ]
[ "$(call activate "$release" ABSENT)" = "$release" ]
[ "$(call verify)" = "$release" ]
[ "$(call prepare "$archive" "$archive_hash" "$configuration" "$configuration_hash")" = "REUSED:$release" ]
# A config revision has its own release; activation and rollback move code/config together.
printf '\n' >> "$configuration"
configuration_hash=$(hash "$configuration")
prepared=$(call prepare "$archive" "$archive_hash" "$configuration" "$configuration_hash")
next=${prepared#CREATED:}
[ "$release" != "$next" ]
[ "$(call activate "$next" "$release")" = "$next" ]
[ "$(call restore "$release" "$next")" = "$release" ]
[ "$(call inspect)" = "$release" ]
rejected call activate "$next" ABSENT
[ "$(call inspect)" = "$release" ]
# A failed first activation can be restored to no active release.
[ "$(call restore ABSENT "$release")" = ABSENT ]
[ "$(call activate "$release" ABSENT)" = "$release" ]
# A pending pointer from a killed activation is reconciled within the owned root.
printf '%s' "$next" > "$root/current.next"
[ "$(call activate "$next" "$release")" = "$next" ]
[ "$(call restore "$release" "$next")" = "$release" ]
rejected call prepare "$archive" "$(printf '%064d' 0)" "$configuration" "$configuration_hash"
rejected call prepare "$archive" "$archive_hash" "$configuration" "$(printf '%064d' 0)"

# Closed archive layout: extras and duplicate names cannot reach extraction.
printf 'extra' > "$bundle/extra"
tar --format=ustar -czf "$fixture/extra.tar.gz" -C "$bundle" .
rejected call prepare "$fixture/extra.tar.gz" "$(hash "$fixture/extra.tar.gz")" "$configuration" "$configuration_hash"
rm "$bundle/extra"
tar --format=ustar -cf "$fixture/duplicate.tar" -C "$bundle" . platform
gzip -c "$fixture/duplicate.tar" > "$fixture/duplicate.tar.gz"
rejected call prepare "$fixture/duplicate.tar.gz" "$(hash "$fixture/duplicate.tar.gz")" "$configuration" "$configuration_hash"

# Both tar families provide name substitution through their own CLI option.
case "$(tar --version)" in
    *bsdtar*) tar --format=ustar -s ',^platform$,../escape,' -czf "$fixture/traversal.tar.gz" -C "$bundle" platform ;;
    *) tar --format=ustar --transform='s,^platform$,../escape,' -czf "$fixture/traversal.tar.gz" -C "$bundle" platform ;;
esac
rejected call prepare "$fixture/traversal.tar.gz" "$(hash "$fixture/traversal.tar.gz")" "$configuration" "$configuration_hash"
[ ! -e "$fixture/escape" ]

# Symlinks are available on native CI hosts; Git Bash may copy instead.
ln -s "$fixture/platform.fixture" "$bundle/link" 2>/dev/null || true
if [ -L "$bundle/link" ]; then
    tar --format=ustar -czf "$fixture/link.tar.gz" -C "$bundle" .
    rejected call prepare "$fixture/link.tar.gz" "$(hash "$fixture/link.tar.gz")" "$configuration" "$configuration_hash"
    rm "$bundle/link"
else rm -f "$bundle/link"; fi

# Invalid configuration never changes the active pointer.
printf '{"installation_id":"wrong-installation"}\n' > "$fixture/wrong.json"
rejected call prepare "$archive" "$archive_hash" "$fixture/wrong.json" "$(hash "$fixture/wrong.json")"
[ "$(call inspect)" = "$release" ]
# Corruption of an immutable active payload is visible, never promoted to healthy.
printf '\n' >> "$root/releases/$release/operations/catalog.json"
rejected call inspect
cp "$bundle/operations/catalog.json" "$root/releases/$release/operations/catalog.json"
[ "$(call verify)" = "$release" ]
printf 'Core release (%s): package checks, staging, binding, retry, atomic pointer, rollback and archive rejection: OK.\n' "$mode"
