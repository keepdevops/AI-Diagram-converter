# scripts/

Start, stop, and check the PlantUML editor stack **for local host-process dev**.

```
matrix-safe (:8765, local LLM)  ←  diagram-agent bridge (:8770)  ←  web (:5180)
```

> **Deploying (air-gapped) or running in containers?** Use the Docker wrappers
> below (or Compose directly — see [`../DEPLOY.md`](../DEPLOY.md)). The `start/stop`
> scripts here are the lightweight run-on-the-host path for development.

## Docker wrappers

Thin wrappers over Docker Compose so you don't memorize the `--profile` / `-f` flags.
`MODE` is `server` (external render container) or `bridge` (jar inside the bridge,
no external image). `--llm` adds the matrix-safe backend for Fix/Generate.

| Script | What it does |
|---|---|
| `scripts/docker-build.sh [server\|bridge\|both]` | Build the images (server mode also pulls the render image). |
| `scripts/docker-up.sh [server\|bridge] [--llm]` | Launch the stack and wait until it serves on `WEB_PORT`. |
| `scripts/docker-down.sh [server\|bridge] [-v]` | Stop/remove the stack (`-v` also drops volumes). |
| `scripts/test-renderers.sh [server\|bridge\|both]` | Renderer conformance matrix (build + assert contract). |

```bash
scripts/docker-up.sh bridge          # build + run, open http://localhost:8088/
scripts/docker-up.sh server --llm    # external render + LLM
scripts/docker-down.sh bridge        # shut down
```

| Script | What it does |
|---|---|
| `scripts/start.sh` | Checks matrix-safe, starts the bridge + web frontend (reusing any already up), opens the browser. |
| `scripts/stop.sh` | Stops the bridge + web (leaves matrix-safe alone). |
| `scripts/status.sh` | Prints UP/DOWN for matrix-safe, bridge, and web. |

## Usage

```bash
scripts/start.sh        # bring it up + open http://localhost:5180/
scripts/status.sh       # check what's running
scripts/stop.sh         # shut the bridge + web down
```

Start **matrix-safe** itself first (separate project on `:8765`) — the editor
loads without it, but **Fix ✦ / Generate ✦** need it. Live preview works
regardless (renders via the PlantUML server).

## Config (env overrides)

| Var | Default | Notes |
|---|---|---|
| `MATRIX_SAFE_URL` | `http://127.0.0.1:8765` | LLM backend the bridge calls |
| `AGENT_PORT` | `8770` | diagram-agent bridge port |
| `WEB_PORT` | `5180` | frontend port (5173 is often matrix-safe's own UI) |
| `DIAGRAM_AGENT` | `local-coder-14b.json` | matrix-safe agent used for Fix/Generate |
| `PLANTUML_SERVER` | `https://www.plantuml.com/plantuml` | render/validate server |
| `OPEN_BROWSER` | `1` | set `0` to skip auto-opening the browser |

Example: `WEB_PORT=5200 DIAGRAM_AGENT=refactor.json scripts/start.sh`

Logs: `scripts/logs/{agent,web}.log` · PIDs: `scripts/.pids/`
