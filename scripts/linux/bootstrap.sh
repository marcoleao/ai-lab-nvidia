#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "[ERROR] Linux bootstrap failed at line $LINENO; rerun bootstrap." >&2' ERR
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || { echo '[ERROR] Owned distro/root required'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
if ! command -v rsync >/dev/null || ! command -v curl >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg rsync systemd systemd-sysv sudo
fi
id lab >/dev/null 2>&1 || useradd -m -u 1000 -s /bin/bash lab
install -d -o lab -g lab /opt/ai-local-lab /opt/ai-local-lab/workspace
cat >/tmp/ai-lab-wsl.conf <<'EOF'
[boot]
systemd=true
[user]
default=lab
[interop]
appendWindowsPath=false
EOF
if ! cmp -s /tmp/ai-lab-wsl.conf /etc/wsl.conf; then
  install -m 644 /tmp/ai-lab-wsl.conf /etc/wsl.conf
  rm /tmp/ai-lab-wsl.conf
  echo '[WARN] systemd configuration changed; dedicated distro restart required.'
  exit 42
fi
rm -f /tmp/ai-lab-wsl.conf
[[ $(ps -p 1 -o comm=) == systemd ]] || { echo '[ERROR] systemd unavailable. Update WSL on Windows.'; exit 1; }
/usr/lib/wsl/lib/nvidia-smi
bash /opt/ai-local-lab/scripts/linux/install-docker.sh
bash /opt/ai-local-lab/scripts/linux/install-nvidia-container-toolkit.sh
chown -R lab:lab /opt/ai-local-lab
echo '[OK] Linux, systemd, Docker and GPU runtime configured'
