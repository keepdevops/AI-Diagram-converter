#!/usr/bin/env bash
# Export the images for an offline install into a single tarball.
# On the air-gapped host:  docker load -i plantuml-editor-images.tar
#
# Build first (only the images you'll use):
#   server mode:  docker compose --profile render-server build
#                 docker compose --profile render-server pull   # pull render image
#   bridge mode:  docker compose -f docker-compose.yml -f docker-compose.bridge.yml build
#
# Select what to bundle with MODE (server|bridge|both) and the optional LLM image.
set -euo pipefail

OUT="${OUT:-plantuml-editor-images.tar}"
MODE="${MODE:-both}"
RENDER_IMAGE="${RENDER_IMAGE:-plantuml/plantuml-server:jetty}"  # server mode only
MATRIX_SAFE_IMAGE="${MATRIX_SAFE_IMAGE:-}"                       # set to include the LLM

IMAGES=(plantuml-editor-frontend:local)

case "$MODE" in
  server) IMAGES+=(plantuml-editor-bridge:local "$RENDER_IMAGE") ;;
  bridge) IMAGES+=(plantuml-editor-bridge-jar:local) ;;
  both)   IMAGES+=(plantuml-editor-bridge:local plantuml-editor-bridge-jar:local "$RENDER_IMAGE") ;;
  *) echo "ERROR: MODE must be server|bridge|both (got '$MODE')" >&2; exit 2 ;;
esac
[[ -n "$MATRIX_SAFE_IMAGE" ]] && IMAGES+=("$MATRIX_SAFE_IMAGE")

echo "Saving images (MODE=$MODE) -> $OUT"
for img in "${IMAGES[@]}"; do echo "  - $img"; done

# Fail loudly if an image is missing locally (don't silently skip).
for img in "${IMAGES[@]}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "ERROR: image not found locally: $img" >&2
    echo "Build/pull it first (docker compose build / docker compose pull)." >&2
    exit 1
  fi
done

docker save -o "$OUT" "${IMAGES[@]}"
echo "Done. Transfer $OUT to the air-gapped host and run: docker load -i $OUT"
echo
echo "Alternative for many hosts: push these tags to a local registry (registry:2)"
echo "seeded once, then 'docker compose pull' on each host instead of load."
