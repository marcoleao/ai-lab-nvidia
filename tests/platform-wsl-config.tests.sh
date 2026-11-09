#!/bin/sh
set -eu
repository=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
temporary_parent=$(CDPATH= cd -P "${TMPDIR:-/tmp}" && pwd)
fixture=$(mktemp -d "$temporary_parent/ai-platform-wsl-config.XXXXXX")
cleanup() {
    case "$fixture" in "$temporary_parent"/ai-platform-wsl-config.*) rm -rf -- "$fixture" ;; *) exit 1 ;; esac
}
trap cleanup EXIT HUP INT TERM
filter="$repository/operations/bootstrap/wsl-config.awk"
awk -v operator=aiplatform -f "$filter" /dev/null > "$fixture/actual"
printf '[boot]\nsystemd=true\n[user]\ndefault=aiplatform\n' > "$fixture/expected"
cmp "$fixture/actual" "$fixture/expected"
cat > "$fixture/input" <<'EOF'
# Keep these distro settings
[network]
hostname=owned-host
generateResolvConf=false
[boot]
systemd=false
command=echo existing-command
[user]
default=ubuntu
[automount]
enabled=true
EOF
awk -v operator=aiplatform -f "$filter" "$fixture/input" > "$fixture/actual"
sed -e 's/systemd=false/systemd=true/' -e 's/default=ubuntu/default=aiplatform/' "$fixture/input" > "$fixture/expected"
cmp "$fixture/actual" "$fixture/expected"
awk -v operator=aiplatform -f "$filter" "$fixture/actual" > "$fixture/retry"
cmp "$fixture/actual" "$fixture/retry"
# Repeated installer-owned keys converge, preserving all other content.
printf '[boot]\nsystemd=false\nsystemd=false\n[user]\ndefault=ubuntu\ndefault=other\n' > "$fixture/input"
awk -v operator=aiplatform -f "$filter" "$fixture/input" > "$fixture/actual"
printf '[boot]\nsystemd=true\n[user]\ndefault=aiplatform\n' > "$fixture/expected"
cmp "$fixture/actual" "$fixture/expected"
printf '%s\n' 'WSL configuration: absent file, preservation, idempotence and repeated keys: OK.'
