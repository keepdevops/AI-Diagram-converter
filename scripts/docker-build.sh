#!/usr/bin/env bash
# Build the container images for a render mode.
#
#   scripts/docker-build.sh            # server mode (default)
#   scripts/docker-build.sh bridge     # bridge mode (jar inside the bridge)
#   scripts/docker-build.sh both       # both bridge images + frontend
#
# Server mode also tries to pull the external render image (needs network — do
# this on the connected build machine, then use docker/save-images.sh for offline).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker-common.sh"
cd "$ROOT"

MODE="${1:-server}"

build_one() {
  local mode="$1" args
  args="$(compose_args "$mode")"
  log "Building images ($mode) ..."
  # shellcheck disable=SC2086
  docker compose $args build
  if [ "$mode" = "server" ]; then
    log "Pulling render image (server mode) ..."
    # shellcheck disable=SC2086
    docker compose $args pull render 2>/dev/null \
      || warn "Could not pull the render image (offline?). Load it from a tarball instead."
  fi
}

case "$MODE" in
  server|bridge) build_one "$MODE" ;;
  both) build_one server; build_one bridge ;;
  *) die "unknown mode '$MODE' (use: server | bridge | both)" ;;
esac

log "Build complete. Launch with: scripts/docker-up.sh $MODE"
