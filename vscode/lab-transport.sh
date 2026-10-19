#!/usr/bin/env bash
set -Eeuo pipefail
operation=${1:?Operation required}
expected_owner=${2:?Ownership marker required}
[[ $operation == tags || $operation == chat ]] || exit 2
[[ $expected_owner =~ ^[a-f0-9]{32}$ && $(cat /etc/ai-local-lab-owner) == "$expected_owner" ]] || exit 3
mapfile -t containers < <(docker ps --filter label=com.docker.compose.project=ai-local-lab --filter label=com.docker.compose.service=ollama --format '{{.ID}}')
[[ ${#containers[@]} == 1 && ${containers[0]} =~ ^[a-f0-9]{12,64}$ ]] || exit 4
# Docker bridge ranges can overlap between WSL daemons. Use loopback inside
# the owned container instead. HTTP/1.0 avoids chunked transfer framing.
# No curl installation or port publication is needed in the lab.
probe='set -Eeuo pipefail
export LC_ALL=C
operation=$1
payload=$(cat)
[[ ${#payload} -le 20000 ]] || exit 6
exec 3<>/dev/tcp/127.0.0.1/11434
if [[ $operation == tags ]]; then
  printf "GET /api/tags HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n" >&3
else
  printf "POST /api/chat HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n%s" "${#payload}" "$payload" >&3
fi
cat <&3'
exec timeout 185 docker exec -i "${containers[0]}" bash -c "$probe" sdlc-probe "$operation"
