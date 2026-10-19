#!/usr/bin/env bash
set -Eeuo pipefail
# Development-time lock resolver, executed in a disposable container host.
source_dir=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$source_dir/.cache/resolve"
docker pull python:3.12-slim-bookworm >&2
python_image=$(docker image inspect python:3.12-slim-bookworm --format '{{index .RepoDigests 0}}')
postgres_image=$(docker image inspect postgres:17.11 --format '{{index .RepoDigests 0}}')
docker pull nginx:stable-alpine >&2
nginx_image=$(docker image inspect nginx:stable-alpine --format '{{index .RepoDigests 0}}')
docker run --rm -v "$source_dir/services/control:/input:ro" -v "$source_dir/.cache/resolve:/output" \
  ai-local-lab/dev:local uv pip compile --python-version 3.12 --python-platform x86_64-unknown-linux-gnu \
  --generate-hashes --no-header /input/requirements-runtime.in -o /output/requirements-runtime.lock >/dev/null
printf 'SDLC_PYTHON_IMAGE=%s\nSDLC_POSTGRES_IMAGE=%s\nSDLC_NGINX_IMAGE=%s\n' "$python_image" "$postgres_image" "$nginx_image" >"$source_dir/.cache/resolve/images.env"
