#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && -f /etc/agentic-sdlc-owner ]] || { echo 'Owned SDLC distro and root required'; exit 1; }
. /etc/os-release
[[ $ID == ubuntu && $VERSION_CODENAME == noble ]] || { echo 'Ubuntu 24.04 required'; exit 1; }
if ! id sdlc >/dev/null 2>&1; then useradd -m -u 10001 -s /bin/bash sdlc; fi
[[ $(id -u sdlc) == 10001 ]] || exit 1
temporary=$(mktemp)
trap 'rm -f "$temporary"' EXIT
cat >"$temporary" <<'EOF'
[boot]
systemd=true
[user]
default=sdlc
[interop]
enabled=false
appendWindowsPath=false
EOF
if ! cmp -s "$temporary" /etc/wsl.conf; then
  install -m 644 "$temporary" /etc/wsl.conf
  exit 42
fi
[[ $(ps -p 1 -o comm=) == systemd ]] || { echo 'systemd is not active in the SDLC distro'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! command -v rsync >/dev/null || ! command -v python3 >/dev/null || ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends docker.io docker-compose-v2 ca-certificates curl rsync python3 openssl
fi
systemctl enable --now docker
docker info >/dev/null
install -d -m 700 /opt/agentic-sdlc
python3 "$(dirname "$0")/../wsl_clock.py" --root /opt/agentic-sdlc
echo '[OK] Dedicated SDLC host ready; no GPU tooling installed.'
