#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/cr-management-system}"
STATE_DIR="${DEPLOY_STATE_DIR:-${APP_DIR}/.deploy}"
ENV_FILE="${CR_ENV_FILE:-${APP_DIR}/.env}"
SDK_PATH="${SAPNWRFC_SDK_PATH:-/usr/local/sap/nwrfcsdk}"
COMPOSE=(docker compose --project-directory "$APP_DIR" --env-file "$STATE_DIR/compose.env" -f "$APP_DIR/docker-compose.yml")

log() { printf '[cr-deploy] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Environment file not found: $ENV_FILE"
[[ -d "$SDK_PATH/lib" ]] || die "SAP NW RFC SDK not found: $SDK_PATH"
mkdir -p "$STATE_DIR"

active="$(cat "$STATE_DIR/active-slot" 2>/dev/null || true)"
case "$active" in
  blue) next=green; next_port=3003 ;;
  green) next=blue; next_port=3002 ;;
  *) next=blue; next_port=3002 ;;
esac

sha="${GITHUB_SHA:-$(git -C "$APP_DIR" rev-parse HEAD)}"
tag="${sha:0:12}"
image="cr-management:${tag}"

cat > "$STATE_DIR/compose.env" <<EOF
CR_ENV_FILE=$ENV_FILE
SAPNWRFC_SDK_PATH=$SDK_PATH
SAPNWRFC_INI_FILE=${SAPNWRFC_INI_FILE:-$SDK_PATH/demo/sapnwrfc.ini}
DEPLOY_STATE_DIR=$STATE_DIR
BLUE_PORT=3002
GREEN_PORT=3003
BLUE_IMAGE_TAG=$(cat "$STATE_DIR/blue-image" 2>/dev/null || printf latest)
GREEN_IMAGE_TAG=$(cat "$STATE_DIR/green-image" 2>/dev/null || printf latest)
EOF

log "Building image $image"
docker build --pull \
  --build-context "sapnwrfcsdk=$SDK_PATH" \
  --label "org.opencontainers.image.revision=$sha" \
  --tag "$image" "$APP_DIR"

printf '%s\n' "$tag" > "$STATE_DIR/${next}-image"
if grep -q "^${next^^}_IMAGE_TAG=" "$STATE_DIR/compose.env"; then
  sed -i "s/^${next^^}_IMAGE_TAG=.*/${next^^}_IMAGE_TAG=$tag/" "$STATE_DIR/compose.env"
fi

log "Starting candidate slot $next on 127.0.0.1:$next_port"
"${COMPOSE[@]}" --profile "$next" up -d --no-build --force-recreate "$next"

healthy=false
for _ in $(seq 1 36); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "cr-management-$next" 2>/dev/null || true)"
  if [[ "$status" == healthy ]] && curl -fsS "http://127.0.0.1:$next_port/api/health/database" >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done
if [[ "$healthy" != true ]]; then
  docker logs --tail 120 "cr-management-$next" >&2 || true
  "${COMPOSE[@]}" --profile "$next" stop "$next" || true
  die "Candidate slot $next failed its health gate"
fi

cat > "$STATE_DIR/nginx.conf.tmp" <<EOF
server {
  listen 80;
  server_name _;
  location / {
    proxy_pass http://cr-management-${next}:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
# Keep the bind-mounted inode stable so the running proxy sees the new slot.
cat "$STATE_DIR/nginx.conf.tmp" > "$STATE_DIR/nginx.conf"
rm -f "$STATE_DIR/nginx.conf.tmp"

# First Docker rollout: systemd may still own port 3001. Stop it only after
# the candidate passed all health checks, then immediately bring up the proxy.
if systemctl is-active --quiet cr-management.service 2>/dev/null; then
  log "Candidate healthy; switching port 3001 from systemd to Docker proxy"
  sudo -n systemctl stop cr-management.service
  sudo -n systemctl disable cr-management.service >/dev/null
fi

if docker inspect cr-management-proxy >/dev/null 2>&1; then
  log "Reloading proxy to slot $next without dropping active connections"
  docker exec cr-management-proxy nginx -t
  docker exec cr-management-proxy nginx -s reload
else
  "${COMPOSE[@]}" up -d proxy
fi
for _ in $(seq 1 12); do
  curl -fsS http://127.0.0.1:3001/api/health/database >/dev/null && break
  sleep 2
done
curl -fsS http://127.0.0.1:3001/api/health/database >/dev/null || die "Production proxy health gate failed"

printf '%s\n' "$next" > "$STATE_DIR/active-slot"
if [[ -n "$active" && "$active" != "$next" ]]; then
  log "Stopping and removing old slot $active"
  "${COMPOSE[@]}" --profile "$active" stop "$active" || true
  "${COMPOSE[@]}" --profile "$active" rm -f "$active" || true
fi

docker image prune -f --filter 'label=org.opencontainers.image.revision' >/dev/null || true
log "Deployment complete: slot=$next image=$image"
