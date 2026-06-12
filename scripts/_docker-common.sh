# Shared helpers for the docker-*.sh wrappers. Source this; do not run directly.
# Centralizes the compose flags so callers don't memorize --profile / -f combos.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-8088}"

log()  { printf '\033[36m[docker]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[docker]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[docker]\033[0m %s\n' "$*" >&2; exit 1; }

# compose_args MODE -> echoes the compose -f/--profile flags for that render mode.
#   server  external plantuml-server / kroki container
#   bridge  committed plantuml.jar via -picoweb inside the bridge container
compose_args() {
  case "${1:-}" in
    server) printf -- '--profile render-server' ;;
    bridge) printf -- '-f docker-compose.yml -f docker-compose.bridge.yml' ;;
    *) die "unknown render mode '${1:-}' (use: server | bridge)" ;;
  esac
}

# wait_http URL [retries] — poll until the URL answers (fail loudly on timeout).
wait_http() {
  local url="$1" n="${2:-40}"
  local i=0
  while [ "$i" -lt "$n" ]; do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    i=$((i + 1)); sleep 1
  done
  return 1
}
