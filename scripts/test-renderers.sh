#!/usr/bin/env bash
# Renderer conformance matrix: bring up each air-gapped render mode, assert the
# preview + validation contract, then tear down. Run locally or in CI so no
# renderer path silently rots.
#
#   scripts/test-renderers.sh            # both modes
#   scripts/test-renderers.sh server     # one mode (server|bridge)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WEB="http://localhost:8088"
# Properly-encoded fixtures (see diagram_agent/plantuml.encode_plantuml):
ENC_VALID="SoWkIImgAStDuNBCoKnELT2rKt3AJrAmKiZ8v798pKi1oW00"          # Alice -> Bob : hi
ENC_BROKEN="SoWkIImgAStDuIh9o2nM0AAy_1A5iiISp1I5Wfp4F92KWeE30vT3QbuAa0q0"  # gibberish
PY="${PYTHON:-python3}"

pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILED=1; }

wait_for() {  # url retries
  local url="$1" n="${2:-30}"
  for _ in $(seq 1 "$n"); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

smoke() {  # mode-label
  local label="$1"
  echo "[$label] checks:"
  wait_for "$WEB/" 30 && pass "frontend serves" || { fail "frontend down"; return; }
  wait_for "$WEB/api/health" 30 && pass "bridge /api/health" || fail "bridge health down"

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$WEB/plantuml/svg/$ENC_VALID")
  [ "$code" = "200" ] && pass "valid diagram -> 200" || fail "valid diagram -> $code"

  code=$(curl -s -o /dev/null -w '%{http_code}' "$WEB/plantuml/svg/$ENC_BROKEN")
  [ "$code" = "400" ] && pass "broken diagram -> 400" || fail "broken diagram -> $code"

  if RENDER_CONTRACT_SERVER="$WEB/plantuml" "$PY" -m unittest \
       diagram_agent.renderers.test_contract.ServerValidatorContractTest >/dev/null 2>&1; then
    pass "validator conformance test"
  else
    fail "validator conformance test"
  fi
}

run_mode() {  # mode  "compose args..."
  local mode="$1"; shift
  echo "=== render mode: $mode ==="
  # shellcheck disable=SC2086
  docker compose $* down >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  docker compose $* up -d --build >/dev/null
  smoke "$mode"
  # shellcheck disable=SC2086
  docker compose $* down >/dev/null 2>&1 || true
  echo
}

FAILED=0
TARGET="${1:-both}"

if [ "$TARGET" = "server" ] || [ "$TARGET" = "both" ]; then
  run_mode server "--profile render-server"
fi
if [ "$TARGET" = "bridge" ] || [ "$TARGET" = "both" ]; then
  run_mode bridge "-f docker-compose.yml -f docker-compose.bridge.yml"
fi

[ "$FAILED" = "0" ] && { echo "ALL RENDERER MODES PASSED"; exit 0; } \
                    || { echo "RENDERER MATRIX FAILED"; exit 1; }
