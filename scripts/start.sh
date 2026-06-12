#!/usr/bin/env bash
# Start the PlantUML editor stack and connect it to matrix-safe:
#   matrix-safe (:8765, LLM)  <--  diagram-agent bridge (:8770)  <--  web (:5180)
# Reuses anything already running. Override any setting via env vars.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- config (override via env) -------------------------------------------
MATRIX_SAFE_URL="${MATRIX_SAFE_URL:-http://127.0.0.1:8765}"
AGENT_PORT="${AGENT_PORT:-8770}"
WEB_PORT="${WEB_PORT:-5180}"          # 5173 is often taken by the matrix-safe frontend
DIAGRAM_AGENT="${DIAGRAM_AGENT:-local-coder-14b.json}"
PLANTUML_SERVER="${PLANTUML_SERVER:-https://www.plantuml.com/plantuml}"
PY="${PYTHON:-python3}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"

PID_DIR="$ROOT/scripts/.pids"
LOG_DIR="$ROOT/scripts/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

log()  { printf '\033[36m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[start]\033[0m %s\n' "$*"; }

up() { curl -fsS --max-time "${2:-3}" "$1" >/dev/null 2>&1; }

# --- 1. matrix-safe (LLM backend) ----------------------------------------
log "Checking matrix-safe at $MATRIX_SAFE_URL ..."
if up "$MATRIX_SAFE_URL/api/health"; then
  log "matrix-safe is up."
else
  warn "matrix-safe NOT reachable at $MATRIX_SAFE_URL."
  warn "Start it in the matrix-safe project first — Fix/Generate need it."
  warn "(The editor still loads; live preview via the PlantUML server works.)"
fi

# --- 2. diagram-agent bridge (:AGENT_PORT) -------------------------------
if up "http://127.0.0.1:$AGENT_PORT/api/health" 2; then
  log "Bridge already running on :$AGENT_PORT — reusing."
else
  log "Starting diagram-agent bridge on :$AGENT_PORT (agent=$DIAGRAM_AGENT) ..."
  PORT="$AGENT_PORT" MATRIX_SAFE_URL="$MATRIX_SAFE_URL" DIAGRAM_AGENT="$DIAGRAM_AGENT" \
    PLANTUML_SERVER="$PLANTUML_SERVER" \
    nohup "$PY" -m diagram_agent.server >"$LOG_DIR/agent.log" 2>&1 &
  echo $! > "$PID_DIR/agent.pid"
  sleep 2
  up "http://127.0.0.1:$AGENT_PORT/api/health" 5 \
    && log "Bridge healthy." \
    || warn "Bridge did not come up — see scripts/logs/agent.log"
fi

# --- 3. web frontend (:WEB_PORT, proxies /api -> bridge) -----------------
# Note: Vite binds to `localhost` (IPv6 ::1), not 127.0.0.1 — check accordingly.
if up "http://localhost:$WEB_PORT/" 2; then
  log "Web server already running on :$WEB_PORT — reusing."
else
  log "Starting web frontend on :$WEB_PORT (proxy /api -> :$AGENT_PORT) ..."
  ( cd "$ROOT/web-react" \
    && AGENT_URL="http://127.0.0.1:$AGENT_PORT" \
       nohup npm run dev -- --port "$WEB_PORT" --strictPort >"$LOG_DIR/web.log" 2>&1 & \
       echo $! > "$PID_DIR/web.pid" )
  sleep 3
fi

URL="http://localhost:$WEB_PORT/"
echo
log "Editor:  $URL"
log "Bridge:  http://127.0.0.1:$AGENT_PORT/api/health"
log "Logs:    scripts/logs/{agent,web}.log   ·   Stop: scripts/stop.sh"

if [[ "$OPEN_BROWSER" == "1" ]] && command -v open >/dev/null 2>&1; then
  open "$URL"
fi
