#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run inside WSL as root'; exit 1; }
builder=${1:?Isolated portal build container required}
[[ $builder == sdlc-portal-build-* ]] || exit 1
sdlc=$(cd "$(dirname "$0")/../.." && pwd)
identifier=$(cat /proc/sys/kernel/random/uuid)
root="/tmp/sdlc-package-$identifier"
project="sdlc-package-$identifier"
[[ $root =~ ^/tmp/sdlc-package-[a-f0-9-]{36}$ ]] || exit 1
install -d -m 700 "$root/source/services/control" "$root/source/scripts/linux"
openssl rand -hex 16 >"$root/.owner"
printf %s "$project" >"$root/.project"
cp "$sdlc/services/control/network_allocation.py" "$root/source/services/control/"
cp "$sdlc/scripts/linux/network-guard.py" "$root/source/scripts/linux/"
export SDLC_RUNTIME_ROOT="$root" SDLC_GITLAB_PROJECT="${project}-demo" GITLAB_PORT=3380 DEMO_PORT=3381
cleanup() {
  local result=$?
  docker network disconnect "${project}-demo_core" "$builder" >/dev/null 2>&1 || true
  if [[ -f $root/gitlab-demo/images.env ]]; then
    docker compose --project-name "${project}-demo" --project-directory "$root/gitlab-demo" --env-file "$root/gitlab-demo/images.env" -f "$root/gitlab-demo/compose.yaml" down -v >/dev/null 2>&1 || true
    python3 "$sdlc/scripts/linux/network-guard.py" "${project}-demo" remove || true
  fi
  [[ $root =~ ^/tmp/sdlc-package-[a-f0-9-]{36}$ && ! -L $root && $(realpath "$root") == "$root" ]] || exit 1
  rm -rf -- "$root"
  return "$result"
}
trap cleanup EXIT
python3 "$sdlc/gitlab/manage.py" prepare --source "$sdlc/gitlab"
python3 "$sdlc/gitlab/manage.py" up
docker network connect "${project}-demo_core" "$builder"
docker cp "$root/gitlab-demo/.secrets/token" "$builder:/tmp/portal-gitlab-token"
docker exec "$builder" sh -c 'cp /source/apps/api/src/gitlab.ts /work/apps/api/src/gitlab.ts; cp /source/apps/api/src/errors.ts /work/apps/api/src/errors.ts; cp /source/tests/gitlab-live.test.ts /work/tests/gitlab-live.test.ts'
docker exec -e "TEST_GITLAB_ISOLATED=$project" -e TEST_GITLAB_URL=http://gitlab:3180 "$builder" pnpm exec vitest run tests/gitlab-live.test.ts --reporter=default --reporter=json --outputFile=/output/gitlab-live.json
