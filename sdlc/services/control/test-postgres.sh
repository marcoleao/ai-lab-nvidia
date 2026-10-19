#!/usr/bin/env bash
set -Eeuo pipefail
# Host-side test launcher: only resources bearing this random prefix are removed.
source_dir=$(cd "$(dirname "$0")" && pwd)
test_id="sdlc-test-$(cat /proc/sys/kernel/random/uuid)"
db_name="$test_id-db"
test_secret=$(cat /proc/sys/kernel/random/uuid)
cleanup() {
  docker rm -f "$db_name" >/dev/null 2>&1 || true
  docker network rm "$test_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create "$test_id" >/dev/null
docker run -d --name "$db_name" --network "$test_id" --network-alias db \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=control_test -e POSTGRES_DB=control_test -e POSTGRES_PASSWORD="$test_secret" \
  "$(sed -n 's/^SDLC_POSTGRES_IMAGE=//p' "$source_dir/../../locks/images.env" | tr -d '\r')" >/dev/null
ready=false
for attempt in $(seq 1 30); do
  if docker exec "$db_name" pg_isready -U control_test -d control_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ $ready == true ]] || { echo 'Temporary PostgreSQL did not become ready'; exit 1; }
docker run --rm --network "$test_id" -v "$source_dir:/src:ro" \
  -e CONTROL_TEST_DATABASE_URL="postgresql+psycopg://control_test:$test_secret@db/control_test" \
  "${SDLC_TEST_IMAGE:-ai-local-lab/dev:local}" bash /src/test-container.sh
