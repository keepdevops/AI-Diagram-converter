#!/usr/bin/env bash
# Show whether each piece of the stack is up.
set -euo pipefail

MATRIX_SAFE_URL="${MATRIX_SAFE_URL:-http://127.0.0.1:8765}"
AGENT_PORT="${AGENT_PORT:-8770}"
WEB_PORT="${WEB_PORT:-5180}"

check() {
  if curl -fsS --max-time 3 "$1" >/dev/null 2>&1; then
    printf '  \033[32mUP  \033[0m %-12s %s\n' "$2" "$1"
  else
    printf '  \033[31mDOWN\033[0m %-12s %s\n' "$2" "$1"
  fi
}

echo "PlantUML editor stack:"
check "$MATRIX_SAFE_URL/api/health"             "matrix-safe"
check "http://127.0.0.1:$AGENT_PORT/api/health" "bridge"
check "http://localhost:$WEB_PORT/"             "web"   # Vite binds localhost/::1
