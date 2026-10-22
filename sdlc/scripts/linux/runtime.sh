#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=${1:?Runtime root required}
command=${2:?Command required}
shift 2
[[ $EUID == 0 && ! -L $root && $(realpath "$root") == "$root" && -f $root/.owner ]] || { echo 'Owned runtime root required'; exit 1; }
[[ $root == /opt/agentic-sdlc || $root =~ ^/tmp/sdlc-package-[a-f0-9-]+$ ]] || exit 1
[[ $(cat "$root/.owner") =~ ^[a-f0-9]{32}$ ]] || exit 1
for directory in source .secrets state backups offline forgejo; do
  [[ ! -L $root/$directory ]] || { echo 'Runtime directories cannot be symlinks'; exit 1; }
done
project=agentic-sdlc
if [[ -f $root/.project ]]; then project=$(cat "$root/.project"); fi
[[ $project =~ ^[a-z][a-z0-9-]{2,63}$ ]] || exit 1
compose() { docker compose --project-name "$project" --project-directory "$root" --env-file "$root/runtime.env" -f "$root/compose.yaml" "$@"; }
gitlab() {
  local portal_port gitlab_project
  portal_port=$(sed -n 's/^SDLC_PORT=//p' "$root/runtime.env")
  gitlab_project="${project}-demo"
  if [[ $project == agentic-sdlc ]]; then gitlab_project=sdlc-demo; fi
  SDLC_RUNTIME_ROOT="$root" SDLC_GITLAB_PROJECT="$gitlab_project" \
    GITLAB_PORT="$((portal_port+80))" DEMO_PORT="$((portal_port+81))" \
    python3 -u "$root/source/gitlab/manage.py" "$@"
}
forgejo_ready() {
  local container
  container=$(compose ps -q forgejo)
  [[ -n $container && $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]]
}
health() {
  local port
  port=$(sed -n 's/^SDLC_PORT=//p' "$root/runtime.env")
  for attempt in $(seq 1 60); do
    if compose exec -T portal python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health/ready',timeout=3)" >/dev/null 2>&1 &&
       compose exec -T consumer python -c "import time,pathlib; assert time.time()-float(pathlib.Path('/tmp/consumer-heartbeat').read_text()) < 20" >/dev/null 2>&1 &&
       forgejo_ready >/dev/null 2>&1 &&
       curl -fsS --max-time 3 "http://127.0.0.1:$port/health/ready" >/dev/null 2>&1; then
      echo '[OK] Portal, database, consumer and Forgejo ready'; return
    fi
    sleep 2
  done
  echo 'Services did not become ready. Run status and logs.' >&2; return 1
}
verify() {
  [[ -f $root/offline/manifest.json && -f $root/runtime.env ]] || { echo 'Run prepare first'; exit 1; }
  python3 - "$root" <<'PY'
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]); manifest=json.loads((root/'offline/manifest.json').read_text())
sys.path.insert(0,str(root/'source/services/control'))
from package_fingerprint import fingerprint
if fingerprint(root/'source')!=manifest['package_sha256']: raise SystemExit('Prepared source changed; run prepare')
if hashlib.sha256((root/'runtime.env').read_bytes()).hexdigest()!=manifest['runtime_env_sha256']: raise SystemExit('Runtime configuration changed; run prepare')
if hashlib.sha256((root/'forgejo/app.ini').read_bytes()).hexdigest()!=manifest['forgejo_config_sha256']: raise SystemExit('Forgejo configuration changed; run prepare')
if hashlib.sha256((root/'compose.yaml').read_bytes()).hexdigest()!=manifest['compose_sha256']: raise SystemExit('Installed Compose changed; run prepare')
image=subprocess.check_output(['docker','image','inspect',manifest['app_image'],'--format','{{.Id}}'],text=True).strip()
if image!=manifest['app_image_id']: raise SystemExit('Prepared image reference changed')
PY
}
start_forgejo() {
  compose up -d --no-build --pull never forgejo
  local ready=false
  local container_id state
  container_id=$(compose ps -q forgejo)
  for attempt in $(seq 1 60); do
    state=$(docker inspect --format '{{.State.Health.Status}} {{.RestartCount}}' "$container_id")
    if [[ $state == healthy\ * ]]; then ready=true; break; fi
    if [[ ${state##* } -gt 2 || $state == unhealthy\ * ]]; then break; fi
    sleep 2
  done
  [[ $ready == true ]] || { echo 'Forgejo did not become ready'; return 1; }
  if [[ ! -s $root/.secrets/forgejo_token ]]; then
    if ! compose exec -T forgejo forgejo admin user list --config /etc/gitea/app.ini | grep -q 'sdlc-backlog'; then
      compose exec -T forgejo forgejo admin user create --config /etc/gitea/app.ini --username sdlc-backlog --email backlog@sdlc.invalid --password "$(cat "$root/.secrets/forgejo_password")" --must-change-password=false >"$root/state/forgejo-bootstrap.log" 2>&1 || {
        echo 'Forgejo integration identity creation failed:'
        python3 - "$root/state/forgejo-bootstrap.log" <<'PY'
import pathlib,re,sys
value=pathlib.Path(sys.argv[1]).read_text()
print(re.sub(r'[a-f0-9]{32,}', '[REDACTED]', value)[-2000:])
PY
        return 1
      }
    fi
    local token_output
    token_output=$(compose exec -T forgejo forgejo admin user generate-access-token --config /etc/gitea/app.ini --username sdlc-backlog --token-name "sdlc-$(openssl rand -hex 6)" --scopes 'write:repository,write:issue,write:user' --raw)
    [[ $token_output =~ ^[a-f0-9]{40}$ ]] || { echo 'Unexpected Forgejo token output; refusing to start API'; return 1; }
    printf %s "$token_output" >"$root/.secrets/forgejo_token"
    chmod 400 "$root/.secrets/forgejo_token"; chown 10001:10001 "$root/.secrets/forgejo_token"
  fi
}
network_guard() { python3 "$root/source/scripts/linux/network-guard.py" "$project" "$@"; }
start() { verify; network_guard; start_forgejo; install -m 600 -o 10001 -g 10001 "$root/offline/manifest.json" "$root/state/installed-manifest.json"; compose up -d --no-build --pull never; network_guard; health; }
tool() { compose run --rm --no-deps maintenance python maintenance.py "$@"; }
validate_id() { [[ ${1:-} =~ ^sdlc-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]] || { echo 'Invalid backup ID'; exit 1; }; }
cleanup_path() {
  local path=$1
  [[ $path == "$root/backups/".* && ! -L $path && $(realpath -m "$path") == "$path" ]] || exit 1
  rm -rf -- "$path"
}
backup() {
  local id
  stage=''
  id="sdlc-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
  stage="$root/backups/.backup-$id"
  install -d -m 700 -o 10001 -g 10001 "$stage"
  # Restore services on either success or failure; never delete an existing backup.
  trap 'compose up -d --no-build --pull never forgejo portal consumer >/dev/null || true; cleanup_path "$stage"; cleanup_path "$root/backups/.plain-$id.tar"' EXIT
  compose stop -t 20 portal consumer forgejo
  compose exec -T db pg_dump -U sdlc_owner -d sdlc -Fc --no-owner --no-privileges >"$stage/db.dump"
  compose run --rm --no-deps initialize python maintenance.py inventory >"$stage/inventory.json"
  cp -a "$root/state" "$stage/state"
  install -d -m 700 "$stage/.secrets"
  for secret in owner_password api_password consumer_password forgejo_password forgejo_token forgejo_internal forgejo_secret forgejo_oauth; do cp "$root/.secrets/$secret" "$stage/.secrets/$secret"; done
  cp -a "$root/forgejo" "$stage/forgejo"
  python3 "$root/source/services/control/forgejo_backup.py" inventory "$stage/forgejo" >"$stage/forgejo-inventory.json"
  [[ -z $(find "$stage" -type l -print -quit) ]] || { echo 'Backup cannot contain symlinks'; exit 1; }
  tar -C "$stage" -cf "$root/backups/.plain-$id.tar" db.dump inventory.json state .secrets forgejo forgejo-inventory.json
  chown -R 10001:10001 "$stage" "$root/backups/.plain-$id.tar"
  tool encrypt "/backups/.plain-$id.tar" "/backups/$id.fernet"
  sha256sum "$root/backups/$id.fernet" >"$root/backups/$id.sha256"
  cleanup_path "$root/backups/.plain-$id.tar"
  cleanup_path "$stage"
  compose up -d --no-build --pull never forgejo portal consumer >/dev/null
  trap - EXIT
  echo "[OK] Encrypted backup: $id"
}
restore_check() {
  local id=$1
  stage=''; database=''
  validate_id "$id"
  [[ -f $root/backups/$id.fernet ]] || exit 1
  stage="$root/backups/.restore-$id-$(openssl rand -hex 4)"
  database=''
  trap 'if [[ -n $database ]]; then compose exec -T db dropdb -U sdlc_owner "$database" >/dev/null || true; fi; cleanup_path "$stage"' EXIT
  tool extract "/backups/$id.fernet" "/backups/$(basename "$stage")"
  database="sdlc_restore_$(openssl rand -hex 8)"
  [[ $database =~ ^sdlc_restore_[a-f0-9]{16}$ ]] || exit 1
  compose exec -T db createdb -U sdlc_owner "$database"
  compose exec -T db pg_restore -U sdlc_owner -d "$database" --no-owner --no-privileges --single-transaction <"$stage/db.dump"
  compose run --rm --no-deps -e "SDLC_VERIFY_DB=$database" initialize python maintenance.py inventory >"$stage/restored-inventory.json"
  chown -R 10001:10001 "$stage"
  tool compare "/backups/$(basename "$stage")/inventory.json" "/backups/$(basename "$stage")/restored-inventory.json"
  if [[ -d $stage/forgejo ]]; then
    python3 "$root/source/services/control/forgejo_backup.py" verify "$stage/forgejo" "$stage/forgejo-inventory.json"
  fi
  printf '{"backup_id":"%s","restore_check":"passed","checked_at":"%s"}\n' "$id" "$(date -u +%FT%TZ)" >"$root/backups/$id.restore-check.json"
  compose exec -T db dropdb -U sdlc_owner "$database"
  trap - EXIT
  cleanup_path "$stage"
}
case "$command" in
  prepare)
    source_dir=${1:?Source required}; port=${2:?Port required}
    [[ $port =~ ^[0-9]{4,5}$ && $port -ge 1024 && $port -le 65454 && -f $source_dir/compose.yaml ]] || exit 1
    install -d -m 700 "$root/source" "$root/.secrets" "$root/offline"
    install -d -m 700 -o 10001 -g 10001 "$root/state" "$root/backups"
    rsync -a --delete --exclude=.cache --exclude=.state --exclude=.secrets --exclude=.git --exclude=backups --exclude=__pycache__ --exclude=.pytest_cache "$source_dir/" "$root/source/"
    for secret in owner_password api_password consumer_password backup_key forgejo_password forgejo_internal forgejo_secret forgejo_oauth; do
      if [[ ! -f $root/.secrets/$secret ]]; then openssl rand -hex 32 >"$root/.secrets/$secret"; fi
      [[ $(cat "$root/.secrets/$secret") =~ ^[a-f0-9]{64}$ ]] || exit 1
      chmod 400 "$root/.secrets/$secret"; chown 10001:10001 "$root/.secrets/$secret"
    done
    if [[ ! -f $root/.secrets/forgejo_token ]]; then install -m 400 -o 10001 -g 10001 /dev/null "$root/.secrets/forgejo_token"; fi
    [[ ! -L $root/forgejo/data && ! -L $root/forgejo/app.ini ]] || exit 1
    install -d -m 700 -o 1000 -g 1000 "$root/forgejo/data"
    python3 - "$root" "$((port+1))" <<'PY'
import base64,configparser,io,pathlib,sys
root=pathlib.Path(sys.argv[1]); config=configparser.ConfigParser(interpolation=None)
config.optionxform=str
config.read_string('[DEFAULT]\n'+(root/'source/config/forgejo.ini').read_text())
config['security']['INTERNAL_TOKEN']=(root/'.secrets/forgejo_internal').read_text().strip()
config['security']['SECRET_KEY']=(root/'.secrets/forgejo_secret').read_text().strip()
config['oauth2']['JWT_SECRET']=base64.urlsafe_b64encode(bytes.fromhex((root/'.secrets/forgejo_oauth').read_text().strip())).decode().rstrip('=')
config['server']['ROOT_URL']=f'http://127.0.0.1:{sys.argv[2]}/'
stream=io.StringIO(); config.write(stream)
(root/'forgejo/app.ini').write_text(stream.getvalue().removeprefix('[DEFAULT]\n'))
PY
    chmod 400 "$root/forgejo/app.ini"; chown 1000:1000 "$root/forgejo/app.ini"
    python_image=$(sed -n 's/^SDLC_PYTHON_IMAGE=//p' "$root/source/locks/images.env" | tr -d '\r')
    postgres_image=$(sed -n 's/^SDLC_POSTGRES_IMAGE=//p' "$root/source/locks/images.env" | tr -d '\r')
    nginx_image=$(sed -n 's/^SDLC_NGINX_IMAGE=//p' "$root/source/locks/images.env" | tr -d '\r')
    forgejo_image=$(sed -n 's/^SDLC_FORGEJO_IMAGE=//p' "$root/source/locks/images.env" | tr -d '\r')
    [[ $python_image =~ ^python@sha256:[a-f0-9]{64}$ && $postgres_image =~ ^postgres@sha256:[a-f0-9]{64}$ && $nginx_image =~ ^nginx@sha256:[a-f0-9]{64}$ ]] || exit 1
    [[ $forgejo_image =~ ^codeberg.org/forgejo/forgejo@sha256:[a-f0-9]{64}$ ]] || exit 1
    fingerprint=$(python3 "$root/source/services/control/package_fingerprint.py" "$root/source")
    app_image="agentic-sdlc/control:$fingerprint"
    docker pull "$python_image"
    docker pull "$postgres_image"
    docker pull "$nginx_image"
    docker pull "$forgejo_image"
    docker build --build-arg "PYTHON_IMAGE=$python_image" -t "$app_image" -f "$root/source/docker/control.Dockerfile" "$root/source"
    cp "$root/source/compose.yaml" "$root/compose.yaml"
    printf 'SDLC_APP_IMAGE=%s\nSDLC_POSTGRES_IMAGE=%s\nSDLC_NGINX_IMAGE=%s\nSDLC_FORGEJO_IMAGE=%s\nSDLC_PORT=%s\nSDLC_FORGEJO_PORT=%s\n' "$app_image" "$postgres_image" "$nginx_image" "$forgejo_image" "$port" "$((port+1))" >"$root/runtime.env"
    python3 "$root/source/services/control/network_allocation.py" "$root" "$project" >>"$root/runtime.env"
    docker save -o "$root/offline/images.tar" "$app_image" "$postgres_image" "$nginx_image" "$forgejo_image"
    python3 - "$root" "$fingerprint" "$app_image" <<'PY'
import datetime,hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1])
manifest={'scope':'acceptance-nucleus','prepared_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'package_sha256':sys.argv[2],'app_image':sys.argv[3],'app_image_id':subprocess.check_output(['docker','image','inspect',sys.argv[3],'--format','{{.Id}}'],text=True).strip(),'runtime_env_sha256':hashlib.sha256((root/'runtime.env').read_bytes()).hexdigest()}
manifest['forgejo_config_sha256']=hashlib.sha256((root/'forgejo/app.ini').read_bytes()).hexdigest()
manifest['compose_sha256']=hashlib.sha256((root/'compose.yaml').read_bytes()).hexdigest()
with (root/'offline/images.tar').open('rb') as source: manifest['images_archive_sha256']=hashlib.file_digest(source,'sha256').hexdigest()
(root/'offline/manifest.json').write_text(json.dumps(manifest,indent=2))
PY
    echo '[OK] Prepared application image, pinned dependencies, secrets and offline archive. Run up to install the nucleus.'
    gitlab prepare
    ;;
  up) start; gitlab up ;;
  down) verify; gitlab down; compose down; network_guard remove ;;
  restart) verify; compose restart portal consumer db entry forgejo; health; gitlab restart ;;
  status) verify; compose ps -a; gitlab status ;;
  doctor) verify; health; compose ps -a; gitlab doctor ;;
  logs) verify; compose logs --tail 80 portal consumer initialize entry forgejo; gitlab logs ;;
  test)
    [[ $root =~ ^/tmp/sdlc-package-[a-f0-9-]{36}$ && $project == "${root##*/}" && -f $root/state/disposable-test.json ]] || {
      echo 'Synthetic acceptance requires a disposable installation. Use doctor for the human environment.' >&2; exit 1;
    }
    export SDLC_ACCEPTANCE_ROOT="$root" SDLC_ACCEPTANCE_PROJECT="$project"
    verify; health; compose run --rm --no-deps acceptance; gitlab doctor; gitlab test
    ;;
  revoke-access|rotate-access)
    verify; identity=${1:?Identity required}; [[ $identity == human || $identity == reader ]] || exit 1
    compose run --rm --no-deps initialize python runtime.py "$command" "$identity"
    ;;
  backup) verify; health; backup ;;
  restore-check) verify; restore_check "${1:?Backup ID required}" ;;
  *) echo 'Unsupported runtime command'; exit 1 ;;
esac
