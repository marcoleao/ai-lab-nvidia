#!/usr/bin/env bash
# Internal preparation helper; the caller owns the administrative audit operation.
ensure_pinned_image() {
  local image=${1:-}
  if [[ $# -ne 1 || ! $image =~ ^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$ ]]; then
    echo 'An exact image reference pinned by SHA256 is required.' >&2
    return 2
  fi
  if docker image inspect "$image" >/dev/null 2>&1; then
    printf '[OK] Exact pinned image available locally: %s\n' "$image"
    return 0
  fi
  if ! docker pull "$image"; then
    printf 'Could not prepare pinned image: %s. Retry prepare after restoring registry access.\n' "$image" >&2
    return 1
  fi
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Downloaded image was not confirmed by its exact reference: %s\n' "$image" >&2
    return 1
  fi
}
