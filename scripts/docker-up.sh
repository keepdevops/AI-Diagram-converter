#!/usr/bin/env bash
# Launch the editor containers for a render mode and wait until it serves.
#
#   scripts/docker-up.sh               # server mode (default)
#   scripts/docker-up.sh bridge        # bridge mode (no external render image)
#   scripts/docker-up.sh server --llm  # also start the matrix-safe LLM (Fix/Generate)
#
# Env: WEB_PORT (default 8088). Reads .env for engine/LLM settings.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker-common.sh"
cd "$ROOT"

MODE="server"
LLM=""
for a in "$@"; do
  case "$a" in
    server|bridge) MODE="$a" ;;
    --llm) LLM="--profile llm" ;;
    *) die "unexpected arg '$a' (use: [server|bridge] [--llm])" ;;
  esac
done

ARGS="$(compose_args "$MODE") $LLM"
log "Starting ($MODE${LLM:+ + llm}) ..."
# shellcheck disable=SC2086
docker compose $ARGS up -d --build

URL="http://localhost:${WEB_PORT}/"
log "Waiting for the editor at $URL ..."
if wait_http "$URL" 60; then
  log "Editor is up:  $URL"
  log "Health:        ${URL%/}/api/health"
  [ -n "$LLM" ] || log "(Fix/Generate need the LLM — re-run with --llm once matrix-safe is set up.)"
else
  warn "Editor did not respond in time. Check: docker compose $ARGS logs"
  exit 1
fi
log "Stop with: scripts/docker-down.sh $MODE"
