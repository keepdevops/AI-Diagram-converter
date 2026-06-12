# scripts/

Start, stop, and check the PlantUML editor stack **for local host-process dev**.

```
matrix-safe (:8765, local LLM)  ←  diagram-agent bridge (:8770)  ←  web (:5180)
```

> **Deploying (air-gapped) or running in containers?** Use Docker Compose instead —
> see [`../DEPLOY.md`](../DEPLOY.md). These scripts are the lightweight
> run-on-the-host path for development. Renderer matrix: `scripts/test-renderers.sh`.

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
