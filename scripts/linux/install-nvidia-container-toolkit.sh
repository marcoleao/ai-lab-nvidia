#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 && -f /etc/ai-local-lab-owner ]] || exit 1
# WSL uses the Windows driver; NEVER apt-install an NVIDIA Linux driver.
if ! command -v nvidia-ctk >/dev/null || [[ $(dpkg-query -W -f='${Status}' nvidia-container-toolkit 2>/dev/null || true) != 'install ok installed' ]]; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      >/etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update
  apt-get install -y --no-install-recommends nvidia-container-toolkit
fi
before=$(sha256sum /etc/docker/daemon.json 2>/dev/null || true)
nvidia-ctk runtime configure --runtime=docker
after=$(sha256sum /etc/docker/daemon.json)
if [[ $before != "$after" ]]; then systemctl restart docker; fi
docker info >/dev/null
echo '[OK] NVIDIA Container Toolkit'
