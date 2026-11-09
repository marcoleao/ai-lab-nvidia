#!/bin/sh
# Private filesystem primitive. The coordinator MUST hold the installation lock
# and persist the administrative request before calling a mutating operation.
set -eu
umask 077
export LC_ALL=C
unset TAR_OPTIONS
action=${1:-}
root=${2:-}
owner=${3:-}
installation=${4:-}
profile=${5:-}
fail() { printf '%s\n' "$1" >&2; exit 1; }
hex() { [ "${#1}" -eq 64 ] && case "$1" in *[!a-f0-9]*) return 1 ;; *) return 0 ;; esac; }
hash_file() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
    else shasum -a 256 "$1" | cut -d ' ' -f 1; fi
}
plain_path() {
    case "$1" in /*) ;; *) fail PLATFORM_CORE_PATH_INVALID ;; esac
    case "$1/" in *'/../'*|*'/./'*|*'//'*) fail PLATFORM_CORE_PATH_INVALID ;; esac
    cursor=$1
    while [ "$cursor" != / ]; do
        [ ! -L "$cursor" ] || fail PLATFORM_CORE_SYMLINK_REJECTED
        cursor=$(dirname "$cursor")
    done
}
case "$owner" in ''|*[!a-f0-9]*) fail PLATFORM_CORE_OWNER_INVALID ;; esac
[ "${#owner}" -eq 32 ] || fail PLATFORM_CORE_OWNER_INVALID
case "$installation" in ''|*[!a-z0-9-]*|[!a-z]*) fail PLATFORM_CORE_ID_INVALID ;; esac
plain_path "$root"
system=$(uname -s)
machine=$(uname -m)
case "$system:$machine:$profile" in
    Linux:x86_64:precision-windows|Linux:amd64:precision-windows) target=linux-amd64 ;;
    Linux:aarch64:dell-gb10|Linux:arm64:dell-gb10) target=linux-arm64 ;;
    Darwin:arm64:macos-m3-max|Darwin:aarch64:macos-m3-max) target=darwin-arm64 ;;
    *) fail PLATFORM_CORE_TARGET_UNSUPPORTED ;;
esac
check_owner() {
    [ -f "$root/.owner" ] && [ ! -L "$root/.owner" ] && [ "$(cat "$root/.owner")" = "$owner:$installation:$profile" ] || fail PLATFORM_CORE_OWNERSHIP_CONFLICT
}
current() {
    if [ ! -e "$root/current" ] && [ ! -L "$root/current" ]; then printf 'ABSENT\n'; return; fi
    [ -f "$root/current" ] && [ ! -L "$root/current" ] || fail PLATFORM_CORE_POINTER_INVALID
    identifier=$(cat "$root/current")
    hex "$identifier" || fail PLATFORM_CORE_POINTER_INVALID
    plain_path "$root/releases/$identifier"
    [ -d "$root/releases/$identifier" ] || fail PLATFORM_CORE_POINTER_INVALID
    printf '%s\n' "$identifier"
}
payloads='platform
platform.sh
install.sh
operations/catalog.json
operations/command-catalog.json
operations/README.md
operations/go.mod
environments/platform.json
environments/profiles/precision-windows.json
environments/profiles/macos-m3-max.json
environments/profiles/dell-gb10.json'
check_release() {
    release=$1
    plain_path "$release"
    [ -f "$release/content.sha256" ] && [ ! -L "$release/content.sha256" ] || fail PLATFORM_CORE_RECEIPT_INVALID
    actual=''
    for name in $payloads; do
        plain_path "$release/$name"
        [ -f "$release/$name" ] || fail PLATFORM_CORE_RELEASE_INCOMPLETE
        actual="$actual$(hash_file "$release/$name")  $name
"
    done
    [ "$(printf '%s' "$actual")" = "$(cat "$release/content.sha256")" ] || fail PLATFORM_CORE_RELEASE_CHANGED
}
move_pointer() {
    # Same-filesystem rename of a regular file, supported by GNU/BSD tools.
    mv -f "$root/current.next" "$root/current"
}
case "$action" in
    inspect|verify|candidate)
        if [ ! -e "$root" ]; then
            [ "$action" != verify ] || fail PLATFORM_CORE_NOT_ACTIVATED
            printf 'ABSENT\n'; exit 0
        fi
        check_owner
        if [ "$action" = candidate ]; then
            candidate=${6:-}
            hex "$candidate" || fail PLATFORM_CORE_DIGEST_INVALID
            plain_path "$root/releases/$candidate"
            if [ -e "$root/releases/$candidate" ]; then
                check_release "$root/releases/$candidate"
                printf '%s\n' "$candidate"
            else printf 'ABSENT\n'; fi
            exit 0
        fi
        active=$(current)
        if [ "$active" != ABSENT ]; then check_release "$root/releases/$active"; fi
        if [ "$action" = verify ]; then
            [ "$active" != ABSENT ] || fail PLATFORM_CORE_NOT_ACTIVATED
            "$root/platform.sh" validate --profile "$profile" --format json >/dev/null
        fi
        printf '%s\n' "$active"
        exit 0
        ;;
    prepare|activate|restore) ;;
    *) fail PLATFORM_CORE_ACTION_INVALID ;;
esac

if [ "$action" = prepare ]; then
    archive=${6:-}
    archive_hash=${7:-}
    configuration=${8:-}
    configuration_hash=${9:-}
    hex "$archive_hash" && hex "$configuration_hash" || fail PLATFORM_CORE_DIGEST_INVALID
    plain_path "$archive"
    plain_path "$configuration"
    [ -f "$archive" ] && [ -f "$configuration" ] || fail PLATFORM_CORE_INPUT_ABSENT
    [ "$(hash_file "$archive")" = "$archive_hash" ] || fail PLATFORM_CORE_PACKAGE_HASH_MISMATCH
    [ "$(hash_file "$configuration")" = "$configuration_hash" ] || fail PLATFORM_CORE_CONFIGURATION_CHANGED
    if [ ! -e "$root" ]; then
        parent=$(dirname "$root")
        mkdir -p "$parent"
        initial=$(mktemp -d "$parent/.core-init.XXXXXX")
        printf '%s' "$owner:$installation:$profile" > "$initial/.owner"
        printf '%s' "$installation" > "$initial/.installation-id"
        printf '%s' "$profile" > "$initial/.profile"
        cp "$(dirname "$0")/installed-platform.sh" "$initial/platform.sh"
        mkdir "$initial/releases"
        chmod 644 "$initial/.installation-id" "$initial/.profile"
        chmod 755 "$initial" "$initial/releases" "$initial/platform.sh"
        mv "$initial" "$root"
    fi
    check_owner
    plain_path "$root/releases"
    deployment=$(printf '%s' "$archive_hash:$configuration_hash:$installation:$profile" | { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi; } | cut -d ' ' -f 1)
    destination="$root/releases/$deployment"
    if [ -e "$destination" ] || [ -L "$destination" ]; then
        check_release "$destination"
        "$destination/platform" validate --root "$destination" --profile "$profile" --installation-id "$installation" --format json >/dev/null
        printf 'REUSED:%s\n' "$deployment"
        exit 0
    fi
    stage=$(mktemp -d "$root/releases/.stage.XXXXXX")
    cleanup() {
        # Only a mktemp directory immediately below this verified owned root.
        case "$stage" in "$root/releases/.stage."*)
            if [ -d "$stage" ] && [ ! -L "$stage" ]; then rm -rf -- "$stage"; fi ;;
            *) exit 1 ;;
        esac
    }
    trap cleanup EXIT HUP INT TERM
    cp "$archive" "$stage/.package.tar.gz"
    [ "$(hash_file "$stage/.package.tar.gz")" = "$archive_hash" ] || fail PLATFORM_CORE_PACKAGE_CHANGED
    # Every normalized path is closed, unique and regular. Validate BEFORE tar
    # extraction: no links, devices, path traversal, duplicate or extra files.
    tar -tzf "$stage/.package.tar.gz" > "$stage/names"
    tar -tvzf "$stage/.package.tar.gz" > "$stage/types"
    awk '!/^[d-]/ { exit 1 }' "$stage/types" || fail PLATFORM_CORE_ARCHIVE_TYPE_INVALID
    awk '
        { sub(/^\.\//, ""); if ($0 == "" || $0 == "operations/" || $0 == "environments/" || $0 == "environments/profiles/") next
          if (seen[$0]++) exit 1; print }
    ' "$stage/names" > "$stage/normalized.raw" || fail PLATFORM_CORE_ARCHIVE_DUPLICATE
    sort "$stage/normalized.raw" > "$stage/normalized"
    printf '%s\n' "$payloads" | sort > "$stage/expected"
    cmp -s "$stage/normalized" "$stage/expected" || fail PLATFORM_CORE_ARCHIVE_PATH_INVALID
    rm -f "$stage/names" "$stage/types" "$stage/normalized" "$stage/normalized.raw" "$stage/expected"
    tar --no-same-owner --no-same-permissions -xzf "$stage/.package.tar.gz" -C "$stage"
    rm -f "$stage/.package.tar.gz"
    # Recheck inputs after reading; a concurrent change cannot silently activate.
    [ "$(hash_file "$archive")" = "$archive_hash" ] || fail PLATFORM_CORE_PACKAGE_CHANGED
    cp "$configuration" "$stage/environments/platform.json"
    [ "$(hash_file "$stage/environments/platform.json")" = "$configuration_hash" ] || fail PLATFORM_CORE_CONFIGURATION_CHANGED
    for name in $payloads; do plain_path "$stage/$name"; [ -f "$stage/$name" ] || fail PLATFORM_CORE_RELEASE_INCOMPLETE; chmod 644 "$stage/$name"; done
    chmod 755 "$stage" "$stage/operations" "$stage/environments" "$stage/environments/profiles" "$stage/platform" "$stage/platform.sh" "$stage/install.sh"
    signature=$(od -An -tx1 -N20 "$stage/platform" | tr -d ' \n\r')
    case "$target:$signature" in
        linux-amd64:7f454c46020101??????????????????????3e00|linux-arm64:7f454c46020101??????????????????????b700|darwin-arm64:cffaedfe0c000001????????????????????????) ;;
        *) fail PLATFORM_CORE_BINARY_TARGET_INVALID ;;
    esac
    "$stage/platform" validate --root "$stage" --profile "$profile" --installation-id "$installation" --format json > "$stage/validation.private.json"
    rm -f "$stage/validation.private.json"
    for name in $payloads; do printf '%s  %s\n' "$(hash_file "$stage/$name")" "$name"; done > "$stage/content.sha256"
    chmod 644 "$stage/content.sha256"
    mv "$stage" "$destination"
    printf 'CREATED:%s\n' "$deployment"
    exit 0
fi
check_owner
expected=${6:-}
previous=${7:-}
if [ "$expected" != ABSENT ] || [ "$action" != restore ]; then hex "$expected" || fail PLATFORM_CORE_DIGEST_INVALID; fi
[ "$(current)" = "$previous" ] || fail PLATFORM_CORE_POINTER_CHANGED
if [ "$action:$expected" = restore:ABSENT ]; then
    rm -f "$root/current"
    [ "$(current)" = ABSENT ] || fail PLATFORM_CORE_ROLLBACK_UNCONFIRMED
    printf 'ABSENT\n'
    exit 0
fi
case "$action" in
    activate)
        check_release "$root/releases/$expected"
        "$root/releases/$expected/platform" validate --root "$root/releases/$expected" --profile "$profile" --installation-id "$installation" --format json >/dev/null
        ;;
    restore)
        # Arguments are desired previous release and expected currently active one.
        check_release "$root/releases/$expected"
        ;;
esac
plain_path "$root/current.next"
if [ -e "$root/current.next" ]; then
    [ -f "$root/current.next" ] || fail PLATFORM_CORE_POINTER_PENDING
    pending=$(cat "$root/current.next")
    hex "$pending" || fail PLATFORM_CORE_POINTER_PENDING
    check_release "$root/releases/$pending"
fi
pending_file=$(mktemp "$root/.current.XXXXXX")
printf '%s' "$expected" > "$pending_file"
chmod 644 "$pending_file"
mv -f "$pending_file" "$root/current.next"
move_pointer
[ "$(current)" = "$expected" ] || fail PLATFORM_CORE_ACTIVATION_UNCONFIRMED
printf '%s\n' "$expected"
