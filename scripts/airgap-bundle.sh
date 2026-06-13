#!/usr/bin/env bash
# Build ONE portable, air-gapped bundle: image tarball + the compose files (with
# the egress-lockdown overlay) + .env + a one-command run.sh / stop.sh, packaged
# as dist/<bundle>.tar.gz. Transfer that single file to an offline host, extract,
# and run ./run.sh — no repo checkout, no manual `docker load` / `compose up`.
#
#   scripts/airgap-bundle.sh                  # bridge mode (self-contained jar), no LLM
#   scripts/airgap-bundle.sh server           # external render image (bundled too)
#   scripts/airgap-bundle.sh bridge --llm     # + in-container matrix-safe (CPU) image
#   scripts/airgap-bundle.sh --build server   # (re)build/pull images before bundling
#
# Env: MATRIX_SAFE_IMAGE (LLM image tag to bundle when --llm), RENDER_IMAGE,
#      WEB_PORT, OUT_DIR (default ./dist).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_docker-common.sh"
cd "$ROOT"

MODE="bridge"; LLM=""; DO_BUILD=""
for a in "$@"; do
  case "$a" in
    server|bridge) MODE="$a" ;;
    --llm)   LLM="1" ;;
    --build) DO_BUILD="1" ;;
    *) die "unexpected arg '$a' (use: [server|bridge] [--llm] [--build])" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker is required."
[ -n "$LLM" ] && [ -z "${MATRIX_SAFE_IMAGE:-}" ] \
  && die "--llm needs MATRIX_SAFE_IMAGE=<tag> (the matrix-safe image to bundle)."

RENDER_IMAGE="${RENDER_IMAGE:-plantuml/plantuml-server:jetty}"
OUT_DIR="${OUT_DIR:-$ROOT/dist}"
STAMP="$(date +%Y%m%d)"
BUNDLE="plantuml-editor-airgap-${MODE}${LLM:+-llm}-${STAMP}"

# Compose files for this mode (base → mode override → llm → airgap overlay last).
COMPOSE=(-f docker-compose.yml)
[ "$MODE" = "bridge" ] && COMPOSE+=(-f docker-compose.bridge.yml)
[ -n "$LLM" ]          && COMPOSE+=(-f docker-compose.container-llm.yml)
COMPOSE+=(-f docker-compose.airgap.yml)

PROFILES=()
[ "$MODE" = "server" ] && PROFILES+=(--profile render-server)
[ -n "$LLM" ]          && PROFILES+=(--profile llm)

# Note: bash 3.2 (macOS) treats "${arr[@]}" of an empty array as an unbound
# variable under `set -u`, so PROFILES is expanded with the ${arr[@]+…} guard.

# 1. Optionally build/pull the images on this (connected) host.
if [ -n "$DO_BUILD" ]; then
  log "Building images ($MODE${LLM:+ + llm}) ..."
  docker compose "${COMPOSE[@]}" ${PROFILES[@]+"${PROFILES[@]}"} build
  if [ "$MODE" = "server" ]; then
    log "Pulling render image ($RENDER_IMAGE) ..."
    docker compose "${COMPOSE[@]}" ${PROFILES[@]+"${PROFILES[@]}"} pull render \
      || warn "Could not pull the render image (offline?). Ensure it exists locally."
  fi
fi

# 2. Stage the bundle.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
DEST="$STAGE/$BUNDLE"
mkdir -p "$DEST"

# 2a. Export the images into the bundle (reuses the existing exporter; it fails
#     loudly if any image is missing locally).
log "Saving images -> $BUNDLE/images.tar ..."
OUT="$DEST/images.tar" MODE="$MODE" RENDER_IMAGE="$RENDER_IMAGE" \
  ${MATRIX_SAFE_IMAGE:+MATRIX_SAFE_IMAGE="$MATRIX_SAFE_IMAGE"} \
  docker/save-images.sh

# 2b. Compose files + env (compose auto-loads ./.env from the bundle dir).
cp docker-compose.yml "$DEST/"
[ "$MODE" = "bridge" ] && cp docker-compose.bridge.yml "$DEST/"
[ -n "$LLM" ]          && cp docker-compose.container-llm.yml "$DEST/"
cp docker-compose.airgap.yml "$DEST/"
if [ -f .env ]; then cp .env "$DEST/.env"; else cp .env.example "$DEST/.env"; fi

# 2c. Bake the exact compose/profile flags into run.sh / stop.sh so the offline
#     host needs no flags. `up` reuses the loaded images (no build context needed).
CF="${COMPOSE[*]}"
PF="${PROFILES[*]:-}"
WEB_PORT_DEFAULT="${WEB_PORT:-8088}"

cat > "$DEST/run.sh" <<RUN
#!/usr/bin/env sh
# One-command offline launch: load the images, then start the air-gapped stack.
set -eu
cd "\$(dirname "\$0")"
PORT="\${WEB_PORT:-$WEB_PORT_DEFAULT}"

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found" >&2; exit 1; }

echo "[run] Loading images from images.tar (first run only; can take a minute) ..."
docker load -i images.tar

echo "[run] Starting air-gapped editor (mode: $MODE${LLM:+ + llm}) ..."
docker compose $CF $PF up -d

echo "[run] Waiting for the editor on :\${PORT} ..."
i=0; while [ "\$i" -lt 60 ]; do
  if curl -fsS -o /dev/null "http://localhost:\${PORT}/" 2>/dev/null; then break; fi
  i=\$((i+1)); sleep 1
done
echo "[run] Editor:  http://localhost:\${PORT}/"
echo "[run] Health:  http://localhost:\${PORT}/api/health"
echo "[run] Stop with: ./stop.sh"
RUN

cat > "$DEST/stop.sh" <<STOP
#!/usr/bin/env sh
set -eu
cd "\$(dirname "\$0")"
# Include --profile llm so an LLM container started by run.sh is also removed.
docker compose $CF --profile llm down "\$@"
STOP
chmod +x "$DEST/run.sh" "$DEST/stop.sh"

# 2d. A short README inside the bundle.
cat > "$DEST/README.md" <<DOC
# PlantUML + Mermaid editor — air-gapped bundle ($MODE${LLM:+ + llm})

Self-contained offline deployment. Every container runs on an \`internal: true\`
Docker network: the editor is reachable on the published port, but **no container
can reach the internet**.

## Run

\`\`\`sh
./run.sh        # docker load + docker compose up -d ; then open the URL it prints
./stop.sh       # tear down (add -v to drop volumes)
\`\`\`

Default URL: http://localhost:$WEB_PORT_DEFAULT/  (override: \`WEB_PORT=9000 ./run.sh\`).

## Contents

- \`images.tar\` — all container images ($MODE mode$([ -n "$LLM" ] && echo " + LLM")), loaded by run.sh.
- \`docker-compose*.yml\` — base + mode overlay + \`airgap\` egress lockdown.
- \`.env\` — tunables (WEB_PORT, render engine, …).

## Notes

- **No LLM?** The editor loads and previews fine; **Fix/Generate** return a loud
  \`502\` (never a silent failure).$([ -n "$LLM" ] && printf '\n- **LLM weights are NOT in the image.** Put the gguf weights dir on the host and\n  set `MODEL_DIR` (mounted read-only at `/models`) before `./run.sh`.')
- Requires Docker Engine + Compose v2 on the offline host. Nothing else.
DOC

# 3. Pack it.
mkdir -p "$OUT_DIR"
TARBALL="$OUT_DIR/$BUNDLE.tar.gz"
log "Packing -> $TARBALL ..."
tar -C "$STAGE" -czf "$TARBALL" "$BUNDLE"

SIZE="$(du -h "$TARBALL" | cut -f1)"
log "Bundle ready: $TARBALL ($SIZE)"
log "Transfer it to the offline host, then:  tar xzf $(basename "$TARBALL") && $BUNDLE/run.sh"
