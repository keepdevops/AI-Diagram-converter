#!/usr/bin/env bash
# Stop and remove the editor containers for a render mode.
#
#   scripts/docker-down.sh             # server mode (default)
#   scripts/docker-down.sh bridge      # bridge mode
#   scripts/docker-down.sh bridge -v   # also remove named volumes
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker-common.sh"
cd "$ROOT"

MODE="server"
EXTRA=""
for a in "$@"; do
  case "$a" in
    server|bridge) MODE="$a" ;;
    -v|--volumes) EXTRA="-v" ;;
    *) die "unexpected arg '$a' (use: [server|bridge] [-v])" ;;
  esac
done

ARGS="$(compose_args "$MODE")"
log "Stopping ($MODE) ..."
# Include the llm profile so an LLM container started earlier is also removed.
# shellcheck disable=SC2086
docker compose $ARGS --profile llm down $EXTRA
log "Stopped."
