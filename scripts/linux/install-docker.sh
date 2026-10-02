#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || exit 1
packages=(docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin)
installed=true
for package in "${packages[@]}"; do
  [[ $(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true) == 'install ok installed' ]] || installed=false
done
if [[ $installed == true ]]; then
  echo '[OK] Docker packages already installed'
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  [[ $ID == ubuntu && $VERSION_CODENAME == noble ]] || { echo '[ERROR] Ubuntu 24.04 required'; exit 1; }
  printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$VERSION_CODENAME" >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker lab
systemctl enable --now docker
docker info >/dev/null
docker compose version
