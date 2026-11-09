#!/bin/sh
set -eu

launcher_repository=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
launcher_temp_parent=$(CDPATH= cd -P "${TMPDIR:-/tmp}" && pwd)
launcher_temp=$(mktemp -d "$launcher_temp_parent/ai-platform-launcher.XXXXXX")
cleanup_launcher_fixture() {
    # Only the absolute mktemp directory under the verified temporary parent.
    case "$launcher_temp" in
        "$launcher_temp_parent"/ai-platform-launcher.*) rm -rf -- "$launcher_temp" ;;
        *) printf '%s\n' 'Unsafe launcher fixture cleanup rejected.' >&2; return 1 ;;
    esac
}
trap cleanup_launcher_fixture EXIT HUP INT TERM

launcher_fixture="$launcher_temp/repository with spaces"
mkdir -p "$launcher_fixture" "$launcher_temp/tools"
cp "$launcher_repository/platform.sh" "$launcher_fixture/platform.sh"
cp "$launcher_repository/install.sh" "$launcher_fixture/install.sh"
cat > "$launcher_temp/tools/uname" <<'EOF'
#!/bin/sh
case "$1" in
    -s) printf '%s\n' "$PLATFORM_TEST_OS" ;;
    -m) printf '%s\n' "$PLATFORM_TEST_ARCH" ;;
    *) exit 2 ;;
esac
EOF
chmod +x "$launcher_temp/tools/uname"
PATH="$launcher_temp/tools:$PATH"
export PATH

for launcher_target in linux-amd64 linux-arm64 darwin-arm64; do
    mkdir -p "$launcher_fixture/.cache/platform/$launcher_target"
    cat > "$launcher_fixture/.cache/platform/$launcher_target/platform" <<'EOF'
#!/bin/sh
printf '%s\n' "$0" "$@"
exit "${PLATFORM_TEST_EXIT:-0}"
EOF
    chmod +x "$launcher_fixture/.cache/platform/$launcher_target/platform"
    case "$launcher_target" in
        linux-amd64) PLATFORM_TEST_OS=Linux; PLATFORM_TEST_ARCH=x86_64 ;;
        linux-arm64) PLATFORM_TEST_OS=Linux; PLATFORM_TEST_ARCH=aarch64 ;;
        darwin-arm64) PLATFORM_TEST_OS=Darwin; PLATFORM_TEST_ARCH=arm64 ;;
    esac
    export PLATFORM_TEST_OS PLATFORM_TEST_ARCH
    launcher_actual=$(sh "$launcher_fixture/platform.sh" plan --config 'path with spaces.json')
    launcher_expected=$(printf '%s\n' "$launcher_fixture/.cache/platform/$launcher_target/platform" plan --config 'path with spaces.json')
    [ "$launcher_actual" = "$launcher_expected" ] || { printf '%s\n' 'Target selection or argument preservation failed.' >&2; exit 1; }
    case "$launcher_target" in
        linux-amd64) launcher_profile=precision-windows ;;
        linux-arm64) launcher_profile=dell-gb10 ;;
        darwin-arm64) launcher_profile=macos-m3-max ;;
    esac
    launcher_actual=$(sh "$launcher_fixture/install.sh" plan --phase host --config 'path with spaces.json')
    launcher_expected=$(printf '%s\n' "$launcher_fixture/.cache/platform/$launcher_target/platform" setup --action plan --root "$launcher_fixture" --profile "$launcher_profile" --phase host --config 'path with spaces.json')
    [ "$launcher_actual" = "$launcher_expected" ] || { printf '%s\n' 'Installer target/arguments failed.' >&2; exit 1; }
done

# Linux installation delegates elevation to sudo; macOS remains the user. These
# are fixture commands: neither sudo nor a real installer runs in this test.
cat > "$launcher_temp/tools/id" <<'EOF'
#!/bin/sh
printf '%s\n' 1000
EOF
cat > "$launcher_temp/tools/sudo" <<'EOF'
#!/bin/sh
printf '%s\n' sudo "$@"
EOF
chmod +x "$launcher_temp/tools/id" "$launcher_temp/tools/sudo"
PLATFORM_TEST_OS=Linux; PLATFORM_TEST_ARCH=aarch64
export PLATFORM_TEST_OS PLATFORM_TEST_ARCH
launcher_actual=$(sh "$launcher_fixture/install.sh" install --phase runtime --config 'path with spaces.json')
launcher_expected=$(printf '%s\n' sudo -- /bin/sh "$launcher_fixture/install.sh" install --phase runtime --config 'path with spaces.json')
[ "$launcher_actual" = "$launcher_expected" ] || exit 1
for launcher_command in status doctor start stop restart logs; do
    launcher_actual=$(sh "$launcher_fixture/platform.sh" "$launcher_command" --component edge)
    launcher_expected=$(printf '%s\n' sudo -- /bin/sh "$launcher_fixture/platform.sh" "$launcher_command" --component edge)
    [ "$launcher_actual" = "$launcher_expected" ] || exit 1
done
PLATFORM_TEST_OS=Darwin; PLATFORM_TEST_ARCH=arm64
export PLATFORM_TEST_OS PLATFORM_TEST_ARCH
launcher_actual=$(sh "$launcher_fixture/install.sh" install --phase host)
launcher_expected=$(printf '%s\n' "$launcher_fixture/.cache/platform/darwin-arm64/platform" setup --action install --root "$launcher_fixture" --profile macos-m3-max --phase host)
[ "$launcher_actual" = "$launcher_expected" ] || exit 1
launcher_actual=$(sh "$launcher_fixture/platform.sh" doctor --format json)
launcher_expected=$(printf '%s\n' "$launcher_fixture/.cache/platform/darwin-arm64/platform" doctor --format json)
[ "$launcher_actual" = "$launcher_expected" ] || exit 1
if sh "$launcher_fixture/install.sh" clean > "$launcher_temp/output" 2>&1; then exit 1; else [ "$?" -eq 2 ]; fi

PLATFORM_TEST_OS=MSYS_NT-10.0
PLATFORM_TEST_ARCH=x86_64
export PLATFORM_TEST_OS PLATFORM_TEST_ARCH
if sh "$launcher_fixture/platform.sh" validate > "$launcher_temp/output" 2>&1; then
    printf '%s\n' 'Git Bash must not be treated as WSL.' >&2
    exit 1
else
    [ "$?" -eq 2 ] || exit 1
fi
if sh "$launcher_fixture/install.sh" plan > "$launcher_temp/output" 2>&1; then exit 1; else [ "$?" -eq 2 ]; fi

PLATFORM_TEST_OS=Linux
PLATFORM_TEST_ARCH=x86_64
PLATFORM_TEST_EXIT=7
export PLATFORM_TEST_OS PLATFORM_TEST_ARCH PLATFORM_TEST_EXIT
if sh "$launcher_fixture/platform.sh" validate > "$launcher_temp/output" 2>&1; then
    printf '%s\n' 'Backend error status was lost.' >&2
    exit 1
else
    [ "$?" -eq 7 ] || exit 1
fi
unset PLATFORM_TEST_EXIT

mv "$launcher_fixture/.cache/platform/linux-amd64/platform" "$launcher_fixture/platform"
launcher_actual=$(sh "$launcher_fixture/platform.sh" inventory)
launcher_expected=$(printf '%s\n' "$launcher_fixture/platform" inventory)
[ "$launcher_actual" = "$launcher_expected" ] || exit 1
rm -f "$launcher_fixture/platform"
if sh "$launcher_fixture/platform.sh" validate > "$launcher_temp/output" 2>&1; then
    printf '%s\n' 'Missing backend was silently accepted.' >&2
    exit 1
else
    [ "$?" -eq 1 ] || exit 1
fi

printf '%s\n' 'Launcher/installer: 3 targets, spaces/arguments, explicit elevation, WSL distinction, exit status, bundle and missing binary: OK.'
