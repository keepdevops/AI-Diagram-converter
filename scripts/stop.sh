#!/usr/bin/env bash
# Stop the diagram-agent bridge and web frontend started by scripts/start.sh.
# (Does NOT touch matrix-safe — that's a separate project.)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT/scripts/.pids"

stop() {
  local svc="$1" f="$PID_DIR/$1.pid"
  if [[ -f "$f" ]]; then
    local pid; pid="$(cat "$f")"
    if kill "$pid" 2>/dev/null; then
      echo "[stop] stopped $svc (pid $pid)"
    else
      echo "[stop] $svc not running (stale pid $pid)"
    fi
    rm -f "$f"
  else
    echo "[stop] no pid file for $svc"
  fi
}

stop web
stop agent
