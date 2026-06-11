# PlantUML Editor — React + CodeMirror6

A React frontend for the PlantUML smart editor. CodeMirror6 gives syntax
highlighting, autocompletion, bracket matching, and history; a live preview
renders through a PlantUML server (no Java needed — see the repo's memory note);
and the **Fix ✦** / **Generate ✦** buttons drive the **cofiswarmdev / matrix-safe**
swarm through the local agent bridge.

## Architecture

```
React (CodeMirror6)  ──/api/*──▶  agent/server.py (:8765)  ──▶  swarm coordinator (:8000)
        │                                                          (cofiswarmdev / matrix-safe)
        └──encode + <img>──▶  PlantUML server (render / validate)
```

- `src/lib/encoder.js` — UTF-8 → raw DEFLATE → PlantUML base64 (mirrors
  `agent/plantuml_validate.py`, so client and server agree on encoding).
- `src/lib/agentClient.js` — SSE client for `/api/fix/stream`,
  `/api/generate/stream`, and `/api/health`.
- `src/lib/plantumlLang.js` — CodeMirror6 `StreamLanguage` mode + dark highlight
  style + keyword completion.
- `src/hooks/useAgent.js` — reduces the swarm SSE event stream into running
  state, a live log, and per-agent token counters.

## Run

1. **Start the swarm** (cofiswarmdev / matrix-safe coordinator) on `:8000`.
2. **Start the agent bridge** from the repo root:
   ```bash
   python -m agent.server        # PORT=8765, SWARM_URL=http://127.0.0.1:8000
   ```
   Env knobs: `SWARM_URL`, `SWARM_MODE` (flat|pipeline|cascade|router),
   `PLANTUML_SERVER`, `MAX_ITERS`. See `agent/config.py`.
3. **Start this frontend:**
   ```bash
   cd web-react
   npm install
   npm run dev        # http://localhost:5173
   ```
   Vite proxies `/api` → `http://127.0.0.1:8765` (override with `AGENT_URL`).

The toolbar shows a swarm health badge (`swarm: <mode>` when the bridge is up,
`agent offline` otherwise). The **Agent** field overrides the bridge base URL;
leave it blank to use the dev proxy. **Build** for static hosting with
`npm run build`, then set the Agent field to the bridge's full URL.
