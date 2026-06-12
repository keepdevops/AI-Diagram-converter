#!/usr/bin/env sh
# Bridge container entrypoint.
#
# In the `bridge` render module (RENDER_JAR=1) the committed plantuml.jar runs as
# an in-container PlantUML server (-picoweb) alongside the Python API, so the
# editor needs no separate render service and no external image. It speaks the
# same /svg/{encoded} + X-PlantUML-Diagram-Error contract as plantuml-server, so
# the existing ServerValidator and client encoder work unchanged.
set -eu

if [ "${RENDER_JAR:-0}" = "1" ]; then
  PW_PORT="${PICOWEB_PORT:-8080}"
  echo "[entrypoint] starting PlantUML picoweb on :${PW_PORT} (jar render engine)"
  java -jar /app/plantuml.jar "-picoweb:${PW_PORT}:0.0.0.0" &

  # Readiness probe: surface a slow/failed engine loudly rather than letting the
  # first preview silently fail. The bridge still starts either way (the
  # validator raises a loud 'unreachable' error if picoweb never comes up).
  i=0
  while [ "$i" -lt 20 ]; do
    if python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:${PW_PORT}/svg/SoWkIImgAStDuNBCoKnELT2rKt3AJrAmKiZ8v798pKi1oW00',timeout=2).status==200 else 1)" 2>/dev/null; then
      echo "[entrypoint] picoweb is ready."
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  [ "$i" -ge 20 ] && echo "[entrypoint] WARNING: picoweb not ready after 20s; previews/validation will error until it is." >&2
fi

exec python -m diagram_agent.server
