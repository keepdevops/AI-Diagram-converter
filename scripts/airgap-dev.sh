#!/usr/bin/env bash
# Run the local dev stack (:5180) FULLY AIR-GAPPED — a local PlantUML renderer
# replaces the public plantuml.com server for BOTH the bridge's validation oracle
# AND the browser preview. No outbound network calls.
#
#   scripts/airgap-dev.sh           # start renderer + restart dev stack air-gapped
#   RENDER_PORT=9090 scripts/airgap-dev.sh
#
# Stop:  scripts/stop.sh && docker rm -f plantuml-airgap
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RENDER_PORT="${RENDER_PORT:-8079}"
RENDER_IMAGE="${RENDER_IMAGE:-plantuml/plantuml-server:jetty}"
RENDER_NAME="${RENDER_NAME:-plantuml-airgap}"
RENDER_URL="http://127.0.0.1:${RENDER_PORT}"
WEB="http://localhost:${WEB_PORT:-5180}"
ENC="SyfFKj2rKt3CoKnELR1Io4ZDoSa70000"   # encoded 'Bob -> Alice : hello'

log()  { printf '\033[36m[airgap]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[airgap]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[airgap]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required for the local PlantUML renderer."

# Stop whatever is listening on a port (used to force a clean restart so the
# air-gap env actually applies — start.sh otherwise reuses a running instance).
kill_port() {
  local port="$1" name="$2" pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    log "Stopping existing $name on :$port (pid $(echo "$pids" | tr '\n' ' ')) ..."
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

# 1. Local PlantUML renderer (reuse if already running, else start it).
if [ "$(docker inspect -f '{{.State.Running}}' "$RENDER_NAME" 2>/dev/null)" = "true" ]; then
  log "Local renderer already running: $RENDER_NAME ($RENDER_URL)"
else
  docker rm -f "$RENDER_NAME" >/dev/null 2>&1 || true
  log "Starting local PlantUML renderer ($RENDER_IMAGE) on $RENDER_URL ..."
  docker run -d --name "$RENDER_NAME" -p "127.0.0.1:${RENDER_PORT}:8080" "$RENDER_IMAGE" >/dev/null \
    || die "Could not start renderer. Pull the image on a connected machine (docker pull $RENDER_IMAGE) or load it from a tarball (docker/save-images.sh)."
fi

# 2. Wait until it actually renders.
log "Waiting for the renderer ..."
ok=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$RENDER_URL/svg/$ENC" 2>/dev/null; then ok=1; break; fi
  sleep 1
done
[ -n "$ok" ] || die "Renderer did not come up on $RENDER_URL. Check: docker logs $RENDER_NAME"
log "Renderer is up."

# 3. Restart the dev stack pointed at the LOCAL renderer (never plantuml.com).
#    A running bridge/web is reused by start.sh, so stop first to apply the new env.
log "Restarting dev stack air-gapped ..."
scripts/stop.sh >/dev/null 2>&1 || true
kill_port "${AGENT_PORT:-8770}" "bridge"   # force fresh start so the env applies
kill_port "${WEB_PORT:-5180}" "web"
export PLANTUML_SERVER="$RENDER_URL"   # bridge validation oracle (Fix/Generate)
export PLANTUML_PROXY="$RENDER_URL"    # vite: same-origin /plantuml -> local renderer
export OPEN_BROWSER="${OPEN_BROWSER:-1}"
scripts/start.sh

# 4. Verify the browser preview path resolves locally.
sleep 1
if curl -fsS -o /dev/null "$WEB/plantuml/svg/$ENC" 2>/dev/null; then
  log "Air-gapped preview verified: $WEB/plantuml -> local renderer ✓"
else
  warn "Could not verify $WEB/plantuml yet (the web server may still be starting)."
fi

echo
log "Air-gapped. Renderer: $RENDER_URL  (container '$RENDER_NAME')."
log "If preview still calls plantuml.com, open the editor's Settings ⚙ and set the"
log "PlantUML server URL to '/plantuml' (a saved value overrides the default)."
log "Stop: scripts/stop.sh && docker rm -f $RENDER_NAME"
