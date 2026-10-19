#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "[ERROR] Linux bootstrap failed at line $LINENO; rerun bootstrap." >&2' ERR
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || { echo '[ERROR] Owned distro/root required'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
if ! command -v rsync >/dev/null || ! command -v curl >/dev/null || ! command -v python3 >/dev/null || ! command -v gpg >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg rsync systemd systemd-sysv sudo python3
fi
if ! id lab >/dev/null 2>&1; then
  uid_owner=$(getent passwd 1000 | cut -d: -f1) || true
  if [[ $uid_owner == ubuntu ]]; then
    # Canonical WSL rootfs already supplies ubuntu at the workspace/container UID.
    groupadd -f lab
    usermod -l lab -g lab -d /home/lab -m -s /bin/bash ubuntu
  elif [[ -z $uid_owner ]]; then
    useradd -m -U -u 1000 -s /bin/bash lab
  else
    echo "[ERROR] UID 1000 belongs to unexpected user: $uid_owner; refusing to modify it." >&2
    exit 1
  fi
fi
[[ $(id -u lab) == 1000 ]] || { echo '[ERROR] lab must use UID 1000 for workspace access'; exit 1; }
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
install -d -m 755 /etc/systemd/system/docker.service.d
cat >/etc/systemd/system/docker.service.d/60-lab-offline.conf <<'EOF'
[Service]
ExecStartPost=/usr/bin/python3 /opt/ai-local-lab/scripts/linux/offline-network.py
EOF
systemctl daemon-reload
chown -R lab:lab /opt/ai-local-lab
echo '[OK] Linux, systemd, Docker and GPU runtime configured'
